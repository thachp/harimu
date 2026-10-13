/** SI labels remain truthful until an actual model-generated record exists. */
export function AiBadge() {
  return <small className="ai-badge" title="Simulated intelligence · deterministic rules; no live AI model connected">SI</small>;
}
export function AiTextTag({provenance='deterministic'}:{provenance?:'deterministic'|'model'}) {
  return <small className="ai-text-tag">{provenance==='model'?'AI-generated':'Simulated statement · deterministic rules'}</small>;
}
