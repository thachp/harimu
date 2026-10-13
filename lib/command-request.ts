/** Browser commands must originate from this app; limit actual streamed bytes too. */
export function isSameOriginCommand(request: Request): boolean {
  return request.headers.get('Origin') === new URL(request.url).origin;
}

export async function readCommandObject(request: Request, maxBytes = 16384): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('Content-Length') ?? 0) > maxBytes) throw new Error('Request too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Expected a JSON command object.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new Error('Request too large.'); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected a JSON command object.');
  return parsed as Record<string, unknown>;
}
