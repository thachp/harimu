/** #883: second LLM provider beside Workers AI.
 * Primary is always the existing Workers AI binding, routed with `aiGatewayOptions` (gateway id from the budget config).
 * A secondary provider runs only when HARIMU_AI_SECONDARY_PROVIDER_ENABLED is exactly "true" AND
 * HARIMU_AI_SECONDARY_PROVIDER_SECRET is a non-empty Worker secret. Unset is off. The secret is never logged,
 * never copied onto the request, and never read by the shipped provider.
 * The shipped secondary is `unavailableSecondary`: it throws without opening a socket. A real paid client is a later
 * change, after Patrick sets the secret and says go, and after a price-table row exists for that provider.
 * A timeout does not fail over: the primary call may still be in flight at Workers AI, so a second provider would double-spend. */
export type AiFailoverEnv = {
  HARIMU_AI_SECONDARY_PROVIDER_ENABLED?: string;
  /** Worker secret. Presence is the gate. This slice never sends the value anywhere. */
  HARIMU_AI_SECONDARY_PROVIDER_SECRET?: string;
};
export type InferenceInput = {
  messages: readonly { role: string; content: string }[];
  max_tokens?: number;
  temperature?: number;
  stream?: false;
  response_format?: unknown;
};
/** Pluggable secondary. `complete` must not perform paid I/O unless a future, approved client replaces the stub. */
export type SecondaryLlm = { readonly id: string; complete: (input: InferenceInput) => Promise<unknown> };
export class SecondaryUnavailable extends Error {
  readonly code = 'secondary-unavailable';
  constructor() { super('Secondary LLM provider is unavailable.'); this.name = 'SecondaryUnavailable'; }
}
/** No network. Used whenever the caller does not inject a provider. */
export function unavailableSecondary(): SecondaryLlm {
  return { id: 'unavailable', complete() { throw new SecondaryUnavailable(); } };
}
/** Exactly "true". "TRUE", "1", "" and unset are off. */
export function secondaryFlagOn(env: AiFailoverEnv | null | undefined) { return env?.HARIMU_AI_SECONDARY_PROVIDER_ENABLED === 'true'; }
/** True only for a non-empty string. Whitespace is missing. The value is not returned. */
export function secondarySecretPresent(env: AiFailoverEnv | null | undefined) {
  const secret = env?.HARIMU_AI_SECONDARY_PROVIDER_SECRET;
  return typeof secret === 'string' && secret.trim().length > 0;
}
/** Both gates. Either one missing means the secondary provider is not called. */
export function secondaryMayRun(env: AiFailoverEnv | null | undefined) { return secondaryFlagOn(env) && secondarySecretPresent(env); }
/** Copy only the chat fields. Extra properties (including a secret stuffed onto the input) are dropped. */
function secondaryInput(input: InferenceInput): InferenceInput {
  const body: InferenceInput = { messages: input.messages, max_tokens: input.max_tokens ?? 256, temperature: input.temperature ?? 0, stream: false };
  if (input.response_format !== undefined) body.response_format = input.response_format;
  return body;
}
async function settle(work: Promise<unknown>, timeoutMs: number | undefined): Promise<{ ok: true; value: unknown } | { ok: false; timedOut: boolean; error: unknown }> {
  if (timeoutMs === undefined) { try { return { ok: true, value: await work }; } catch (error) { return { ok: false, timedOut: false, error }; } }
  let timer: ReturnType<typeof setTimeout> | undefined, timedOut = false;
  try {
    const value = await new Promise((resolve, reject) => {
      timer = setTimeout(() => { timedOut = true; reject(Error('Inference timed out.')); }, timeoutMs);
      void work.then(v => { if (!timedOut) resolve(v); }, error => { if (!timedOut) reject(error); });
    });
    return { ok: true, value };
  } catch (error) { return { ok: false, timedOut, error }; }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
/** Try Workers AI. On a definite primary rejection, try `secondary` (or the no-op) only when the flag and secret both pass.
 * A timeout, a flag that is not exactly "true", or a missing secret rethrows the primary error so callers keep today's authored fallback. */
export async function runAiWithFailover<TInput extends InferenceInput>(args: {
  runPrimary: (model: string, input: TInput, options?: { gateway: { id: string } }) => Promise<unknown>;
  model: string;
  input: TInput;
  gateway?: { gateway: { id: string } };
  env?: AiFailoverEnv | null;
  secondary?: SecondaryLlm;
  timeoutMs?: number;
}): Promise<unknown> {
  const first = await settle(Promise.resolve().then(() => args.runPrimary(args.model, args.input, args.gateway)), args.timeoutMs);
  if (first.ok) return first.value;
  if (first.timedOut || !secondaryMayRun(args.env)) throw first.error;
  const provider = args.secondary ?? unavailableSecondary();
  const second = await settle(Promise.resolve().then(() => provider.complete(secondaryInput(args.input))), args.timeoutMs);
  if (second.ok) { console.warn(`[ai-failover] primary failed; secondary ${provider.id} answered`); return second.value; }
  console.warn(`[ai-failover] secondary ${provider.id} failed closed`);
  throw first.error;
}
