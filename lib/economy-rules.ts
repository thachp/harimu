export const defaultRecoverySeconds = 86400;
export function recoveryInterval(value: unknown): number {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 60 && n <= 604800 ? n : defaultRecoverySeconds;
}
