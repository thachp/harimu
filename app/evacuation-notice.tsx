/** #1324: the #421 evacuation lines. Desktop (1280px and up) only; below that the block stays unshown. */
export function EvacuationNotice({ lines }: { lines?: readonly string[] | null }) {
  if (!lines?.length) return null;
  return <section className="war-evac-notice" aria-label="Evacuation">
    <style>{'.war-evac-notice{display:none}@media(min-width:1280px){.war-evac-notice{display:block}}'}</style>
    {lines.map(line => <p key={line}>{line}</p>)}
  </section>;
}
