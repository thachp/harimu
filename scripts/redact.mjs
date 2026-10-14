/** #163: redact secrets from tool output before logging. */
export function redactSecrets(text, env = process.env) {
  let out = String(text);
  for (const name of ['CLOUDFLARE_API_TOKEN', 'PREVIEW_DATABASE_ADMIN_URL', 'HARIMU_POSTGRES_URL', 'CLOUDFLARE_ACCOUNT_ID']) {
    const value = env[name]; if (value && value.length >= 6) out = out.split(value).join(`[${name}]`);
  }
  return out
    .replace(/(postgres(?:ql)?:\/\/)[^\s'"]+/gi, '$1[redacted]')
    .replace(/\b(Bearer|token|authorization|api[_-]?key|secret|password)(["':=\s]+)[^\s'",}]+/gi, '$1$2[redacted]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[redacted]');
}
