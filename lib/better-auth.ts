import { betterAuth } from 'better-auth';
import { phoneNumber } from 'better-auth/plugins';
import { Client, types } from 'pg';
import { flagOn } from './flag-pack.mjs';
import { checkVerification, startVerification, type TwilioEnv } from './twilio-verify.ts';

/** Worker secret names only, never values. BETTER_AUTH_SECRET differs per Worker.
 *  HARIMU_PHONE_HASH_SECRET is the same on preview and production while the database is shared
 *  (auth_phone_registry.phone_hmac stores HMAC-SHA256 of the E.164 number; this module does not hash).
 *  Twilio: TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_VERIFY_SERVICE_SID.
 *  BETTER_AUTH_URL is not a secret. */
export type BetterAuthEnv = TwilioEnv & {
  HARIMU_BETTER_AUTH_ENABLED?: string;
  HARIMU_GRAY_PACK?: string | Record<string, string>;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  HYPERDRIVE?: { connectionString?: string };
};
type AuthHandler = { handler: (request: Request) => Promise<Response> };

/** Options shared with `npx auth generate`. No database, and no module-scope pool. */
export function betterAuthOptions(env: BetterAuthEnv, request: Request) {
  const baseURL = env.BETTER_AUTH_URL || new URL(request.url).origin;
  const origin = new URL(baseURL).origin;
  return {
    baseURL, basePath: '/api/auth', secret: env.BETTER_AUTH_SECRET, trustedOrigins: [origin],
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    user: { modelName: 'auth_user', fields: { emailVerified: 'email_verified', createdAt: 'created_at', updatedAt: 'updated_at' } },
    session: { modelName: 'auth_session', fields: { expiresAt: 'expires_at', createdAt: 'created_at', updatedAt: 'updated_at', ipAddress: 'ip_address', userAgent: 'user_agent', userId: 'user_id' } },
    account: { modelName: 'auth_account', fields: { accountId: 'account_id', providerId: 'provider_id', userId: 'user_id', accessToken: 'access_token', refreshToken: 'refresh_token', idToken: 'id_token', accessTokenExpiresAt: 'access_token_expires_at', refreshTokenExpiresAt: 'refresh_token_expires_at', createdAt: 'created_at', updatedAt: 'updated_at' } },
    verification: { modelName: 'auth_verification', fields: { expiresAt: 'expires_at', createdAt: 'created_at', updatedAt: 'updated_at' } },
    plugins: [phoneNumber({
      sendOTP: async ({ phoneNumber: to }) => { const result = await startVerification(env, to); if (!result.ok) throw new Error('twilio_verify_failed'); },
      verifyOTP: async ({ phoneNumber: to, code }) => { const result = await checkVerification(env, to, code); return result.ok && result.approved === true; },
      schema: { user: { fields: { phoneNumber: 'phone_number', phoneNumberVerified: 'phone_number_verified' } } },
    })],
  };
}

/** One Hyperdrive client for this request. Dates are epoch milliseconds so the columns can stay BIGINT. */
function requestPool(connectionString: string) {
  let client: Client | null = null;
  const bind = (value: unknown): unknown => value instanceof Date ? value.getTime() : Array.isArray(value) ? value.map(bind) : value;
  return {
    async connect() {
      if (!client) {
        client = new Client({ connectionString, connectionTimeoutMillis: 3000, types: { getTypeParser(oid: number, format?: 'text' | 'binary') {
          if (format !== 'binary' && oid === 20) return (value: string) => new Date(Number(value));
          return types.getTypeParser(oid, format);
        } } });
        await client.connect();
      }
      const current = client;
      return { query: (sql: string, parameters: readonly unknown[] = []) => current.query(sql, parameters.map(bind)), release() {} };
    },
    async end() { const current = client; client = null; if (current) await current.end(); },
  };
}

/** Null unless the flag is on and BETTER_AUTH_SECRET is set. Otherwise no client is constructed and Twilio is not called. */
export function createAuth(env: BetterAuthEnv, request: Request): AuthHandler | null {
  if (!flagOn(env, 'HARIMU_BETTER_AUTH_ENABLED') || typeof env.BETTER_AUTH_SECRET !== 'string' || env.BETTER_AUTH_SECRET.length === 0) return null;
  const connectionString = env.HYPERDRIVE?.connectionString;
  if (!connectionString) return null;
  let options;
  try { options = betterAuthOptions(env, request); } catch { return null; }
  const pool = requestPool(connectionString);
  const auth = betterAuth({ ...options, database: pool });
  return { handler: async incoming => { try { return await auth.handler(incoming); } finally { await pool.end(); } } };
}
