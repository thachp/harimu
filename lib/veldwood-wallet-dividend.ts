/** #1063: Veldwood top-bar wallet counts down to Dividend Day (docs §23.2).
 *  NEXT_PUBLIC_HARIMU_VELDWOOD_WALLET_DIVIDEND is a HARIMU_UI_PACK key ("true" in preview, "false" in production).
 *  The Citizen Dividend is yearly (§7.9, §12.3). [ASSUMPTION] that year is the 30-real-day game year (§12.4),
 *  and Dividend Day is the next year boundary on the world clock. No new table: the instant is derived from the epoch.
 *  Clock helpers are #969. Layout bundles that omit the define have no `process`. A missing flag is off. */
import { countdownDualTimeEnabled, dualTimeCountdown } from './game-time.ts';
import { gameDayAt, minuteBucketMs, minuteCountdown } from './topbar-countdown.ts';

export const dividendYearSeconds = 30 * 86400;
const EXPLAINS = 'Dividend Day pays the Citizen Dividend equally to citizens.';
const unit = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function veldwoodWalletDividendFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_VELDWOOD_WALLET_DIVIDEND; }
  catch { return undefined; }
}
export function veldwoodWalletDividendEnabled(value: string | undefined = veldwoodWalletDividendFlag()): boolean {
  return value === 'true';
}

/** Next year boundary strictly after `nowSeconds`. Null when the clock is not a safe integer. */
export function nextDividendDayAt(epochSeconds: number, nowSeconds: number): number | null {
  if (!Number.isSafeInteger(epochSeconds) || epochSeconds < 0 || !Number.isSafeInteger(nowSeconds)) return null;
  const at = epochSeconds + (Math.floor(Math.max(0, nowSeconds - epochSeconds) / dividendYearSeconds) + 1) * dividendYearSeconds;
  return Number.isSafeInteger(at) ? at : null;
}

/** The server instant, or the following year once it has passed, so the chip rolls forward without a reload. */
export function dividendTarget(dividendDayAt: number, nowSeconds: number): number | null {
  if (!Number.isSafeInteger(dividendDayAt) || dividendDayAt <= 0 || !Number.isSafeInteger(nowSeconds)) return null;
  if (dividendDayAt > nowSeconds) return dividendDayAt;
  const at = dividendDayAt + (Math.floor((nowSeconds - dividendDayAt) / dividendYearSeconds) + 1) * dividendYearSeconds;
  return Number.isSafeInteger(at) && at > nowSeconds ? at : null;
}

/** Spoken remainder. The last minute stays "under 1 minute", so a minute-bucketed name does not count seconds. One of a unit stays singular. */
export function spokenRemaining(remainingMs: number): string | null {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null;
  const seconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(seconds / 86400), hours = Math.floor(seconds % 86400 / 3600), minutes = Math.floor(seconds % 3600 / 60);
  if (days > 0) return hours ? `${unit(days, 'day', 'days')} ${unit(hours, 'hour', 'hours')}` : unit(days, 'day', 'days');
  if (hours > 0) return minutes ? `${unit(hours, 'hour', 'hours')} ${unit(minutes, 'minute', 'minutes')}` : unit(hours, 'hour', 'hours');
  if (minutes > 0) return unit(minutes, 'minute', 'minutes');
  return 'under 1 minute';
}

export type VeldwoodDividendLine = { text: string; real: string; game: string; gameDay: string; bucket: string; calendar: string };

/** Null keeps today's chip: flag off, not Veldwood, no instant, or a clock this line cannot say. */
export function veldwoodWalletDividend(nationId: string | undefined, dividendDayAt: number | null | undefined, nowMs: number | null | undefined, epochSeconds?: number, enabled = veldwoodWalletDividendEnabled()): VeldwoodDividendLine | null {
  if (!enabled || nationId !== 'veldwood' || typeof dividendDayAt !== 'number' || typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return null;
  const at = dividendTarget(dividendDayAt, Math.floor(nowMs / 1000));
  if (at == null) return null;
  const bucketMs = minuteBucketMs(Math.max(0, at * 1000 - nowMs));
  const real = spokenRemaining(bucketMs), game = spokenRemaining(bucketMs * 12), gameCompact = minuteCountdown(bucketMs * 12);
  if (!real || !game || !gameCompact) return null;
  const gameDay = typeof epochSeconds === 'number' && Number.isFinite(epochSeconds) ? ` Game day ${gameDayAt(epochSeconds, at)}.` : '';
  const calendar = countdownDualTimeEnabled() && typeof epochSeconds === 'number' ? dualTimeCountdown(at * 1000, nowMs, epochSeconds * 1000)?.game ?? '' : '';
  const dated = calendar.startsWith('Year ') ? calendar : '';
  return { text: dated ? `Dividend Day in ${real} · ${gameCompact} game · ${dated}` : `Dividend Day in ${real} · ${gameCompact} game`, real, game, gameDay, calendar: dated, bucket: dated ? `${real}|${game}|${gameDay}|${dated}` : `${real}|${game}|${gameDay}` };
}

const walletTail = 'Amounts update after completed transactions; loading means the citizen snapshot has not arrived.';
export function veldwoodWalletHelp(currencyCode: string, line: VeldwoodDividendLine | null): string {
  if (!line) return `Your ${currencyCode} wallet holds national money. ${walletTail}`;
  return `Your ${currencyCode} wallet holds national money. ${EXPLAINS} ${line.real} real time; ${line.game} game time.${line.gameDay}${line.calendar ? ` ${line.calendar}.` : ''} ${walletTail}`;
}

/** Replaces the chip's accessible name only while the countdown is showing. "Wallet" stays in the name. The time is the minute bucket. */
export function veldwoodWalletName(walletMinor: number | undefined, currencyCode: string, line: VeldwoodDividendLine | null): string | undefined {
  if (!line) return undefined;
  const amount = walletMinor === undefined ? 'loading' : `${(walletMinor / 100).toFixed(2)} ${currencyCode === 'LN' ? 'Labor Notes' : currencyCode === 'CRN' ? 'Crowns' : currencyCode}`;
  return `Wallet, ${amount}. Dividend Day in ${line.real}. ${line.real} real time; ${line.game} game time.${line.gameDay}${line.calendar ? ` ${line.calendar}.` : ''} ${EXPLAINS}`;
}
