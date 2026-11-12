/** Twilio Verify (not Programmable Messaging). Secret names only, never values:
 *  TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_VERIFY_SERVICE_SID.
 *  Basic auth is the API key sid and secret. The account sid must be present or nothing is sent. */
export type TwilioEnv = {
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_API_KEY_SID?: string;
  TWILIO_API_KEY_SECRET?: string;
  TWILIO_VERIFY_SERVICE_SID?: string;
};
type TwilioResult = { ok: true; approved?: boolean } | { ok: false; error: 'missing_secret' | 'twilio_http' | 'twilio_body' };
const secretNames = ['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET', 'TWILIO_VERIFY_SERVICE_SID'] as const;

function secrets(env: TwilioEnv) {
  const out = {} as Record<(typeof secretNames)[number], string>;
  for (const name of secretNames) {
    const value = env[name];
    if (typeof value !== 'string' || value.length === 0) return null;
    out[name] = value;
  }
  return out;
}
function basic(user: string, secret: string) { return `Basic ${btoa(`${user}:${secret}`)}`; }

async function post(env: TwilioEnv, path: 'Verifications' | 'VerificationCheck', body: URLSearchParams, fetchImpl: typeof fetch): Promise<TwilioResult> {
  const keys = secrets(env);
  if (!keys) return { ok: false, error: 'missing_secret' };
  const response = await fetchImpl(`https://verify.twilio.com/v2/Services/${keys.TWILIO_VERIFY_SERVICE_SID}/${path}`, {
    method: 'POST', headers: { authorization: basic(keys.TWILIO_API_KEY_SID, keys.TWILIO_API_KEY_SECRET), 'content-type': 'application/x-www-form-urlencoded' }, body,
  });
  if (!response.ok) return { ok: false, error: 'twilio_http' };
  return { ok: true };
}

/** Start an SMS verification. Missing any secret: error, no fetch. */
export async function startVerification(env: TwilioEnv, to: string, fetchImpl: typeof fetch = fetch): Promise<TwilioResult> {
  return post(env, 'Verifications', new URLSearchParams({ To: to, Channel: 'sms' }), fetchImpl);
}
/** Check a code. `approved` is true only when Twilio returns status "approved". Missing any secret: error, no fetch. */
export async function checkVerification(env: TwilioEnv, to: string, code: string, fetchImpl: typeof fetch = fetch): Promise<TwilioResult> {
  const keys = secrets(env);
  if (!keys) return { ok: false, error: 'missing_secret' };
  const response = await fetchImpl(`https://verify.twilio.com/v2/Services/${keys.TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`, {
    method: 'POST', headers: { authorization: basic(keys.TWILIO_API_KEY_SID, keys.TWILIO_API_KEY_SECRET), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, Code: code }),
  });
  if (!response.ok) return { ok: false, error: 'twilio_http' };
  const payload = await response.json().catch(() => null) as { status?: string } | null;
  if (!payload || typeof payload.status !== 'string') return { ok: false, error: 'twilio_body' };
  return { ok: true, approved: payload.status === 'approved' };
}
