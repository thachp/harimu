/** #1318: per-request Better Auth over Hyperdrive (Kysely adapter, not Drizzle). Returns null, and does not open a database, unless the flag and BETTER_AUTH_SECRET are set and Hyperdrive has a connection string. Clerk stays the session authority. */
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { phoneNumber } from 'better-auth/plugins/phone-number';
import { PostgresDialect } from 'kysely';
import { Client, types } from 'pg';
import { flagOn } from './flag-pack.mjs';
import { checkVerification, startVerification, type TwilioVerifyEnv } from './twilio-verify.ts';

export type BetterAuthEnv = TwilioVerifyEnv & {
  HARIMU_BETTER_AUTH_ENABLED?: string;
  BETTER_AUTH_SECRET?: string;
  HARIMU_PHONE_HASH_SECRET?: string;
  HYPERDRIVE?: { connectionString?: string };
};

type Waitable = { waitUntil(promise: Promise<unknown>): void };
type QueryClient = { query(text: string, values?: unknown[]): Promise<unknown>; release(): void };
type QueryablePool = { connect(): Promise<QueryClient>; end(): Promise<void> };
type AuthPool = ConstructorParameters<typeof PostgresDialect>[0]['pool'];
export type OpenAuthDatabase = (connectionString: string) => { pool: QueryablePool; close(): Promise<void> };

const e164 = /^\+[1-9]\d{1,14}$/;

function epoch(fieldName: string, opts: { required?: boolean; returned?: false; stamp?: 'create' | 'update' } = {}) {
  const required = opts.required !== false;
  return {
    type: 'number' as const,
    bigint: true,
    required,
    ...(opts.returned === false ? { returned: false as const } : {}),
    fieldName,
    ...(opts.stamp ? { defaultValue: () => Date.now() } : {}),
    ...(opts.stamp === 'update' ? { onUpdate: () => Date.now() } : {}),
    transform: {
      input: (value: unknown) => value instanceof Date ? value.getTime() : value,
      output: (value: unknown) => value == null || value instanceof Date ? value : new Date(Number(value)),
    },
  };
}

/** Column map shared with `npx auth generate`. Date columns are BIGINT unix milliseconds so they match db/postgres. */
export function betterAuthOptions(env: BetterAuthEnv, request: Request, ctx: Waitable | undefined, pool: QueryablePool): BetterAuthOptions {
  const schedule = (work: Promise<unknown>, endpoint: { context?: object } | undefined) => {
    const background = endpoint?.context as { waitUntil?: (promise: Promise<unknown>) => void } | undefined;
    if (typeof background?.waitUntil === 'function') background.waitUntil(work);
    else if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(work);
    else void work;
  };
  return {
    baseURL: new URL(request.url).origin,
    secret: env.BETTER_AUTH_SECRET,
    database: { dialect: new PostgresDialect({ pool: pool as unknown as AuthPool }), type: 'postgres', schemaName: 'public' },
    user: {
      modelName: 'auth_user',
      fields: { emailVerified: 'email_verified', createdAt: 'created_at', updatedAt: 'updated_at' },
      additionalFields: { createdAt: epoch('created_at', { stamp: 'create' }), updatedAt: epoch('updated_at', { stamp: 'update' }) },
    },
    session: {
      modelName: 'auth_session',
      fields: { expiresAt: 'expires_at', createdAt: 'created_at', updatedAt: 'updated_at', ipAddress: 'ip_address', userAgent: 'user_agent', userId: 'user_id' },
      additionalFields: { expiresAt: epoch('expires_at'), createdAt: epoch('created_at', { stamp: 'create' }), updatedAt: epoch('updated_at', { stamp: 'update' }) },
    },
    account: {
      modelName: 'auth_account',
      fields: { accountId: 'account_id', providerId: 'provider_id', userId: 'user_id', accessToken: 'access_token', refreshToken: 'refresh_token', idToken: 'id_token', accessTokenExpiresAt: 'access_token_expires_at', refreshTokenExpiresAt: 'refresh_token_expires_at', createdAt: 'created_at', updatedAt: 'updated_at' },
      additionalFields: {
        accessTokenExpiresAt: epoch('access_token_expires_at', { required: false, returned: false }),
        refreshTokenExpiresAt: epoch('refresh_token_expires_at', { required: false, returned: false }),
        createdAt: epoch('created_at', { stamp: 'create' }),
        updatedAt: epoch('updated_at', { stamp: 'update' }),
      },
    },
    verification: {
      modelName: 'auth_verification',
      fields: { expiresAt: 'expires_at', createdAt: 'created_at', updatedAt: 'updated_at' },
      additionalFields: { expiresAt: epoch('expires_at'), createdAt: epoch('created_at', { stamp: 'create' }), updatedAt: epoch('updated_at', { stamp: 'update' }) },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
      ...(ctx && typeof ctx.waitUntil === 'function' ? { backgroundTasks: { handler: (task: Promise<unknown>) => { ctx.waitUntil(task); } } } : {}),
    },
    plugins: [phoneNumber({
      schema: { user: { fields: { phoneNumber: 'phone_number', phoneNumberVerified: 'phone_number_verified' } } },
      sendOTP: ({ phoneNumber: to }, endpoint) => {
        const pending = startVerification(env, to);
        if (!pending) throw new Error('Twilio Verify is not configured');
        const task = pending.then(async response => { if (!response.ok) console.warn('[twilio-verify] start failed', response.status); await response.arrayBuffer().catch(() => undefined); }, () => console.warn('[twilio-verify] start failed'));
        schedule(task, endpoint);
      },
      verifyOTP: async ({ phoneNumber: to, code }) => checkVerification(env, to, code),
      callbackOnVerification: async ({ phoneNumber: to, user }) => { await bindPhone(pool, env, to, user.id); },
    })],
  } as BetterAuthOptions;
}

async function hmacSha256(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Inserts the permanent registry row on the request connection. A primary-key or user_id conflict throws and the number stays bound. */
async function bindPhone(pool: QueryablePool, env: BetterAuthEnv, phone: string, userId: string) {
  if (!e164.test(phone) || !env.HARIMU_PHONE_HASH_SECRET || !userId) throw new Error('phone bind refused');
  const client = await pool.connect();
  try {
    await client.query('INSERT INTO auth_phone_registry (phone_hmac, user_id, bound_at) VALUES ($1, $2, $3)', [await hmacSha256(env.HARIMU_PHONE_HASH_SECRET, phone), userId, Date.now()]);
  } finally { client.release(); }
}

/** One pg client per request. Hyperdrive already pools; the client is closed when the handler finishes. */
export function openHyperdrive(connectionString: string): { pool: QueryablePool; close(): Promise<void> } {
  const client = new Client({ connectionString, connectionTimeoutMillis: 3000, types: { getTypeParser(oid, format) {
    if (format !== 'binary' && oid === 20) return (value: string) => { const number = Number(value); if (!Number.isSafeInteger(number)) throw new Error('Database integer exceeds safe application range.'); return number; };
    return types.getTypeParser(oid, format);
  } } });
  let connected = false;
  let chain: Promise<unknown> = Promise.resolve();
  const pool = {
    async connect() {
      if (!connected) { await client.connect(); connected = true; }
      return {
        query: (text: string, values?: unknown[]) => { const run = chain.then(() => client.query(text, values)); chain = run.then(() => undefined, () => undefined); return run; },
        release() {},
      };
    },
    async end() { if (connected) { connected = false; await client.end().catch(() => undefined); } },
  };
  return { pool, close: () => pool.end() };
}

export function isBetterAuthPath(pathname: string) {
  return pathname === '/api/auth' || pathname.startsWith('/api/auth/');
}

/** Null, and the opener is not called, unless the flag is on, BETTER_AUTH_SECRET is set, and Hyperdrive has a connection string. */
export function createAuth(env: BetterAuthEnv, request: Request, ctx?: Waitable, openDatabase: OpenAuthDatabase = openHyperdrive) {
  if (!flagOn(env, 'HARIMU_BETTER_AUTH_ENABLED') || !env.BETTER_AUTH_SECRET || !env.HYPERDRIVE?.connectionString) return null;
  const db = openDatabase(env.HYPERDRIVE.connectionString);
  try {
    const auth = betterAuth(betterAuthOptions(env, request, ctx, db.pool));
    return { handler: (next: Request) => auth.handler(next), close: () => db.close() };
  } catch (error) { void db.close(); throw error; }
}
