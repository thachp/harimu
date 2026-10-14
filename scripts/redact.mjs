/** #163: redact secrets from tool output before logging. */
export function redactSecrets(text, env = process.env) {
  let out = String(text);
  // Account and D1 database ids are identifiers, not secrets (#172): never redacted.
  for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_KEY', 'PREVIEW_DATABASE_ADMIN_URL', 'HARIMU_POSTGRES_URL']) {
    const value = env[name]; if (value && value.length >= 6) out = out.split(value).join(`[${name}]`);
  }
  return out
    .replace(/(postgres(?:ql)?:\/\/)[^\s'"]+/gi, '$1[redacted]')
    .replace(/\b(Bearer|token|authorization|api[_-]?key|secret|password)(["':=\s]+)[^\s'",}]+/gi, '$1$2[redacted]')
    // Token-shaped runs (40+ chars). 32-hex account ids and 36-char UUIDs (D1 ids) stay visible.
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[redacted]');
}
