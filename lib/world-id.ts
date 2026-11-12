/** #469: inert World ID unique-human adapter. The provider and chain stay behind WorldIdProvider.
 *  No vendor SDK and no contract. Live only when HARIMU_WORLD_ID_ENABLED is on and HARIMU_WORLD_ID_VERIFIER_SECRET is set.
 *  Otherwise verify returns off and does not fetch. The secret is a Worker secret, not a wrangler var.
 *  Nullifiers are not stored. A later slice may store them with no link to a public profile.
 *  uniqueHumanGate is not wired into Assembly, elections, petitions, or Aurelle. Clerk stays the session authority. */
import { flagOn } from './flag-pack.mjs';

export type WorldIdEnv = {
  HARIMU_WORLD_ID_ENABLED?: string;
  HARIMU_GRAY_PACK?: unknown;
  /** [ASSUMPTION] Verifier secret name. Dashboard-only. Never a wrangler var. */
  HARIMU_WORLD_ID_VERIFIER_SECRET?: string;
  /** Optional runtime endpoint override. Not a secret and not set in wrangler. */
  WORLD_ID_VERIFY_URL?: string;
};

export type WorldIdProof = { proof: string; nullifierHash: string; signal?: string };
export type WorldIdFetch = (input: string, init: RequestInit) => Promise<Response>;
export type WorldIdVerifyResult =
  | { live: false; ok: false; reason: 'off' }
  | { live: true; ok: true; reason: 'verified' }
  | { live: true; ok: false; reason: 'rejected' };

/** Injected verifier. The default posts JSON with a bearer secret and does not name a vendor host. */
export type WorldIdProvider = {
  verify(proof: WorldIdProof, secret: string, fetchImpl: WorldIdFetch, endpoint: string): Promise<WorldIdVerifyResult>;
};

/** [ASSUMPTION] Non-resolving stand-in. This slice does not choose a vendor endpoint. */
export const WORLD_ID_VERIFY_ENDPOINT = 'https://world-id-verifier.invalid/verify';

const MAX_BODY = 8192;

export function worldIdSecret(env: WorldIdEnv | null | undefined): string | undefined {
  const secret = env?.HARIMU_WORLD_ID_VERIFIER_SECRET;
  return typeof secret === 'string' && secret.length > 0 ? secret : undefined;
}

/** Flag on and the verifier secret present. A direct HARIMU_WORLD_ID_ENABLED string wins over the pack. */
export function worldIdLive(env: WorldIdEnv | null | undefined): boolean {
  return Boolean(env && flagOn(env, 'HARIMU_WORLD_ID_ENABLED') && worldIdSecret(env));
}

export function isWorldIdPath(pathname: string): boolean {
  return pathname === '/api/world-id' || pathname.startsWith('/api/world-id/');
}

export const httpWorldIdProvider: WorldIdProvider = {
  async verify(proof, secret, fetchImpl, endpoint) {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: JSON.stringify({ proof: proof.proof, nullifier_hash: proof.nullifierHash, signal: proof.signal ?? null }),
    });
    if (!response.ok) return { live: true, ok: false, reason: 'rejected' };
    try {
      const payload = await response.json() as { ok?: unknown; success?: unknown };
      if (payload.ok === true || payload.success === true) return { live: true, ok: true, reason: 'verified' };
    } catch { /* fail closed */ }
    return { live: true, ok: false, reason: 'rejected' };
  },
};

/** Closed, and fetch is not called, unless the flag and secret are set. */
export async function verifyWorldIdProof(env: WorldIdEnv | null | undefined, proof: WorldIdProof, fetchImpl: WorldIdFetch = fetch, provider: WorldIdProvider = httpWorldIdProvider, endpoint?: string): Promise<WorldIdVerifyResult> {
  const secret = worldIdSecret(env);
  if (!env || !flagOn(env, 'HARIMU_WORLD_ID_ENABLED') || !secret) return { live: false, ok: false, reason: 'off' };
  if (!proof.proof || !proof.nullifierHash) return { live: true, ok: false, reason: 'rejected' };
  try { return await provider.verify(proof, secret, fetchImpl, endpoint || env.WORLD_ID_VERIFY_URL || WORLD_ID_VERIFY_ENDPOINT); }
  catch { return { live: true, ok: false, reason: 'rejected' }; }
}

export type UniqueHumanAct = 'exploring' | 'citizenship' | 'election-vote' | 'npc-claim';
export type UniqueHumanDecision = {
  allowed: boolean;
  worldIdRequired: boolean;
  reason: 'exploring' | 'grandfathered-tier1-human-v1' | 'world-id-off' | 'verified' | 'world-id-required';
};

/** Policy only. alreadyEnrolledTier1CountedAct is an act already counted under tier1-human-v1, not a new enrollment.
 *  New enrollments and new counted acts require World ID only when the flag is on and the secret is present.
 *  Exploring is never gated. Call sites are unchanged in this slice. */
export function uniqueHumanGate(env: WorldIdEnv | null | undefined, input: { act: UniqueHumanAct; alreadyEnrolledTier1CountedAct: boolean; worldIdVerified: boolean }): UniqueHumanDecision {
  if (input.act === 'exploring') return { allowed: true, worldIdRequired: false, reason: 'exploring' };
  if (input.alreadyEnrolledTier1CountedAct) return { allowed: true, worldIdRequired: false, reason: 'grandfathered-tier1-human-v1' };
  if (!worldIdLive(env)) return { allowed: true, worldIdRequired: false, reason: 'world-id-off' };
  if (input.worldIdVerified) return { allowed: true, worldIdRequired: true, reason: 'verified' };
  return { allowed: false, worldIdRequired: true, reason: 'world-id-required' };
}

function json(body: { ok: boolean }, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

function readProof(raw: string): WorldIdProof | null {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== 'object') return null;
  const body = value as { proof?: unknown; nullifierHash?: unknown; nullifier_hash?: unknown; signal?: unknown };
  const nullifierHash = typeof body.nullifierHash === 'string' ? body.nullifierHash : body.nullifier_hash;
  if (typeof body.proof !== 'string' || body.proof.length === 0 || body.proof.length > 4096) return null;
  if (typeof nullifierHash !== 'string' || nullifierHash.length === 0 || nullifierHash.length > 256) return null;
  if (body.signal !== undefined && (typeof body.signal !== 'string' || body.signal.length > 256)) return null;
  return { proof: body.proof, nullifierHash, ...(typeof body.signal === 'string' ? { signal: body.signal } : {}) };
}

/** 404, and no fetch, when the flag is off or the secret is missing. No database. */
export async function handleWorldIdRequest(request: Request, env: WorldIdEnv, fetchImpl?: WorldIdFetch): Promise<Response> {
  const url = new URL(request.url);
  if (!isWorldIdPath(url.pathname) || !worldIdLive(env)) return new Response('Not found', { status: 404 });
  if (request.method !== 'POST' || url.pathname !== '/api/world-id/verify') return new Response('Not found', { status: 404 });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ ok: false }, 400);
  const proof = readProof(raw);
  if (!proof) return json({ ok: false }, 400);
  const result = await verifyWorldIdProof(env, proof, fetchImpl ?? fetch);
  if (!result.live) return new Response('Not found', { status: 404 });
  return json({ ok: result.ok }, result.ok ? 200 : 401);
}
