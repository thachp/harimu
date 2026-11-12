/** #1318: Twilio Verify (not Programmable Messaging, not the Twilio SDK). Fail closed: a missing secret never calls fetch. */

export type TwilioVerifyEnv = {
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_API_KEY_SID?: string;
  TWILIO_API_KEY_SECRET?: string;
  TWILIO_VERIFY_SERVICE_SID?: string;
};

export type TwilioFetch = (input: string, init: RequestInit) => Promise<Response>;

function configured(env: TwilioVerifyEnv) {
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_API_KEY_SID && env.TWILIO_API_KEY_SECRET && env.TWILIO_VERIFY_SERVICE_SID);
}

/** Verify accepts an API key SID and secret as HTTP Basic. The account SID is required and is not sent. */
function basicAuth(env: TwilioVerifyEnv) {
  const bytes = new TextEncoder().encode(`${env.TWILIO_API_KEY_SID}:${env.TWILIO_API_KEY_SECRET}`);
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return `Basic ${btoa(raw)}`;
}

function post(env: TwilioVerifyEnv, path: string, body: URLSearchParams, fetchImpl: TwilioFetch) {
  return fetchImpl(`https://verify.twilio.com/v2/Services/${encodeURIComponent(env.TWILIO_VERIFY_SERVICE_SID!)}/${path}`, {
    method: 'POST',
    headers: { authorization: basicAuth(env), 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
}

/** Starts an SMS verification. Returns null, and does not call fetch, when any secret is missing. */
export function startVerification(env: TwilioVerifyEnv, to: string, fetchImpl: TwilioFetch = fetch): Promise<Response> | null {
  if (!configured(env)) return null;
  return post(env, 'Verifications', new URLSearchParams({ To: to, Channel: 'sms' }), fetchImpl);
}

/** Checks a code. False, and no fetch, when any secret is missing or Twilio did not approve it. */
export async function checkVerification(env: TwilioVerifyEnv, to: string, code: string, fetchImpl: TwilioFetch = fetch): Promise<boolean> {
  if (!configured(env)) return false;
  const response = await post(env, 'VerificationCheck', new URLSearchParams({ To: to, Code: code }), fetchImpl);
  if (!response.ok) return false;
  const payload = await response.json() as { status?: unknown };
  return payload.status === 'approved';
}
