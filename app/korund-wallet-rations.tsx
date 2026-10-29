import type { KorundRationLine } from '@/lib/korund-wallet-rations';

/** #1055: per-nation wallet sub-line. Korund food coupons only; a null line renders nothing, so other nations stay on today's chip.
 *  Each word is its own nowrap item. A narrow top bar wraps between words. */
export function KorundWalletRations({ line }: { line: KorundRationLine | null }) {
  if (!line) return null;
  const parts = line.expired ? ['·', 'expired'] : ['·', ...line.text.split(' ')];
  return <>{parts.map(word => <span key={word} className="game-wallet-ration">{` ${word}`}</span>)}</>;
}
