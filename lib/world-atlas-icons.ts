/** #392 UI 50: World atlas fact-row icons. NEXT_PUBLIC_HARIMU_WORLD_ATLAS_ICONS is HARIMU_UI_PACK entry 47
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  Keys are the stat labels worldAtlasStats already produces. Any other label has no icon. */
export const WORLD_ATLAS_ICONS_FLAG = 'NEXT_PUBLIC_HARIMU_WORLD_ATLAS_ICONS';

export function worldAtlasIconsFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_ICONS; }
  catch { return undefined; }
}
export function worldAtlasIconsEnabled(value: string | undefined = worldAtlasIconsFlag()): boolean {
  return value === 'true';
}

/** Phosphor icon names. Nations, age, disputes, festival and population are the world rows; the rest are the selected nation's facts. */
export const WORLD_ATLAS_STAT_ICONS = {
  Nations: 'Globe',
  'World age': 'Clock',
  'Open disputes': 'Scales',
  'Next festival': 'Confetti',
  Population: 'Users',
  Capital: 'Bank',
  Government: 'Crown',
  Economy: 'Grains',
  Currency: 'Coins',
  Stability: 'Scales',
} as const;
export type WorldAtlasIconKey = (typeof WORLD_ATLAS_STAT_ICONS)[keyof typeof WORLD_ATLAS_STAT_ICONS];

export function worldAtlasStatIcon(label: string): WorldAtlasIconKey | null {
  if (!Object.prototype.hasOwnProperty.call(WORLD_ATLAS_STAT_ICONS, label)) return null;
  return WORLD_ATLAS_STAT_ICONS[label as keyof typeof WORLD_ATLAS_STAT_ICONS];
}
