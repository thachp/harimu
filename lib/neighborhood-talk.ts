/** #1445 slice 2. NEXT_PUBLIC_HARIMU_NEIGHBORHOOD_TALK is HARIMU_UI_PACK index 72. Only "true" enables it. */
export const NEIGHBORHOOD_TALK_FLAG = 'NEXT_PUBLIC_HARIMU_NEIGHBORHOOD_TALK';
export const WEBGL_UNAVAILABLE = 'This neighborhood needs 3D graphics, which your browser has turned off. Try another browser or turn on hardware acceleration.';
export function neighborhoodTalkFlag(): string | undefined { try { return process.env.NEXT_PUBLIC_HARIMU_NEIGHBORHOOD_TALK; } catch { return undefined; } }
export function neighborhoodTalkEnabled(value: string | undefined = neighborhoodTalkFlag()): boolean { return value === 'true'; }
/** The card's Citizen and AI citizen labels start with a capital. The stored status stays working or idle. */
export function residentStatusLabel(status: string): string { return status ? status[0].toUpperCase() + status.slice(1) : status; }
