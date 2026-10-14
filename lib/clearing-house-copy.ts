/** Clearing House kiosk and Tessera wallet copy for Kindle, Korund and Aurelle (issue #320, companion to PR #319 / #210
 * and the later two-way conversion in #72). Content only: #319 owns the kiosk, the official rate, the purchase range and
 * the wallet history, and no UI imports this. Canon: harimu-docs economy-currency §12.5 (the Commons Clearing House is a
 * system-run, neutral institution with no officials at all, human or AI, that issues the Tessera; Tessera is used to quote
 * currencies, settle trade, price treaties and land sales; any citizen may hold it through licensed exchanges, including
 * Clearing House kiosks), §12.8 (Tessera sub-accounts are bought and sold only through licensed exchanges; unlimited in
 * Kindle; none in Korund, whose Labor Note is non-convertible; Korund trades abroad only through the State Trade Bureau)
 * and the MVP Scope Currency row (Clearing House with Tessera settlement).
 *
 * Voice: the Clearing House speaks as a plain system notice, so no line implies an official, clerk or AI decided
 * anything. The one Korund line is a State Media notice (#238 voice, byline from lib/press-templates.ts); it says the Labor
 * Note cannot be converted and never mentions a street rate, black market or gray market. Faith-neutral.
 *
 * Rules: no numbers appear in the copy. Rates, amounts, costs and the purchase range come only through placeholders, and
 * no fee, cap or rate is invented (the docs give none; #319's range is its own assumption). Every placeholder is a
 * pre-formatted string that already carries its unit (for example {amount} = "5 TSR", {cost} = "20 SPK"), so the copy
 * adds no unit after them. The runtime values are capped by the shared name cap, which this module re-exports
 * (COUP_NAME_MAX from lib/palace-coup-copy.ts). All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as CLEARING_HOUSE_NAME_MAX } from './palace-coup-copy';

/** {rate}: the official rate. {amount}: Tessera amount. {cost}: Spark cost. {min},{max}: the purchase range, all pre-formatted. */
export const CLEARING_HOUSE_PLACEHOLDERS=['{rate}','{amount}','{cost}','{min}','{max}'] as const;
export const CLEARING_HOUSE_LABEL_MAX=40;
export const CLEARING_HOUSE_BODY_MAX=140;

export type Line={text:string;proposal:true};
export type RefusalKey='closed'|'insufficient-spark'|'out-of-range'|'korund'|'other-nation';
const L=(text:string):Line=>({text,proposal:true});

export const REFUSAL_KEYS:readonly RefusalKey[]=['closed','insufficient-spark','out-of-range','korund','other-nation'];
/** Only the Korund refusal carries a byline: Korund State Media (lib/press-templates.ts korundStateMedia.byline). */
export const CLEARING_HOUSE_BYLINE={name:'Korund State Media',proposal:false} as const;

export const kioskPanel={
 header:'Clearing House kiosk',
 explainer:L('Tessera is the neutral unit for world trade and land. Buy it here with Spark.'),
 neutral:L('The Clearing House runs on system rules, with no officials.'),
 rateLine:L('Official rate: {rate}'),
 buyButtons:['Buy {amount}','Confirm purchase'],
 comingSoon:L('Converting back, and Crown, are coming soon.'),
 proposal:true,
} as const;

/** Purchase receipt (2 variants) and the wallet-history row. */
export const purchaseCopy={
 receipt:[
  L('Bought {amount} at the Clearing House kiosk for {cost}.'),
  L('Your purchase is complete: {amount} for {cost}, at the official rate.'),
 ],
 history:[
  L('Clearing House kiosk · bought {amount} · paid {cost}'),
  L('Clearing House kiosk · {amount} for {cost}'),
 ],
 proposal:true,
} as const;

/** Refusals, each in plain words. Korund is a State Media notice; other nations say no kiosk serves them yet. */
export const refusals:Readonly<Record<RefusalKey,readonly Line[]>>={
 closed:[L('The Clearing House kiosk is closed right now.'),L('The kiosk is closed. Try again later.')],
 'insufficient-spark':[L('You do not have enough Spark for {amount}.'),L('Not enough Spark: {amount} costs {cost}.')],
 'out-of-range':[L('That amount is out of range. Choose between {min} and {max}.'),L('Choose an amount from {min} to {max}.')],
 korund:[
  L('Korund State Media: The Labor Note cannot be converted. Foreign trade goes through the State Trade Bureau.'),
  L('Korund State Media: Citizens hold no Tessera, and the Labor Note cannot be converted.'),
 ],
 'other-nation':[L('No Clearing House kiosk serves your nation yet.'),L('There is no kiosk in your nation yet.')],
};

export const refusalFor=(key:RefusalKey)=>refusals[key];
