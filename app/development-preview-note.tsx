/** "Development preview" note, shown only on preview and development builds (NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW=true).
 *
 *  PLACEMENT: this component has exactly one mount point, at the bottom of the Game settings dialog (app/game-settings.tsx).
 *  To move it (footer, Account menu, ...), delete that one `<DevelopmentPreviewNote />` line and render it where you want it;
 *  it carries its own styling (`.development-preview-note` in app/game-shell.css) and takes no layout from its parent.
 *  Keep it out of the top bar: tests/development-preview-note.test.mjs and `npm run test:layout` check that. */
export const developmentPreviewText = 'Development preview';
export const developmentPreviewDetail = 'Fresh development world. Production progress is separate.';

export function isDevelopmentPreview(): boolean {
  return process.env.NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW === 'true';
}

export function DevelopmentPreviewNote() {
  if (!isDevelopmentPreview()) return null;
  return <p className="development-preview-note" role="note"><strong>{developmentPreviewText}.</strong> {developmentPreviewDetail}</p>;
}
