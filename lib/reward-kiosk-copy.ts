/** Reward-claim kiosk and earned-reward history copy for Kindle, Korund and Aurelle (issue #525, companion to the reward work in #466 and #472).
 * Content only; imported by the #466 kiosk panel (app/wallet-panel.tsx). Canon: harimu-docs decisions-log rows 110 and 111 and the economy kiosk-direction note
 * (the kiosk is repurposed to claim earned rewards and view their history; rewards come from verified work or contributions within a capped
 * reward budget; starter grants and test faucets are labeled separately from earned rewards; the currency exchange stays disabled).
 *
 * Voice: the kiosk is a system fixture, so its lines carry no byline and no AI badge and are never spoken by a leader or an outlet. Only the
 * title and intro take a light hint of each nation's voice, through word choice alone (Kindle plain and civic, Korund collective, Aurelle
 * formal); no Chairman, Crown, council or State Media is named. Everything else is one shared system voice.
 *
 * Rules: no figure, cap or amount is written into any line: the reward amount is {reward} and the verified work it was earned for is {work}, both
 * pre-formatted runtime values. No wording about buying, converting, exchanging, cashing out, paying real money or any chain topic; the
 * one currency note says only that Spark stays in the world. The shared name cap, re-exported here, bounds the runtime values (COUP_NAME_MAX
 * from the palace coup copy module). Limits: labels 40, lines 80, bodies 140, tested with every placeholder filled to 24 characters.
 * All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as KIOSK_NAME_MAX } from './palace-coup-copy';

export const KIOSK_PLACEHOLDERS=['{reward}','{work}'] as const;
export const KIOSK_LABEL_MAX=40;
export const KIOSK_LINE_MAX=80;
export const KIOSK_BODY_MAX=140;

export type Line={text:string;proposal:true};
export type KioskNation='kindle'|'korund'|'aurelle';
export const KIOSK_NATIONS:readonly KioskNation[]=['kindle','korund','aurelle'];
const L=(text:string):Line=>({text,proposal:true});

/** Title and intro in each nation's voice (word choice only; system lines, no byline, no badge). */
export const kioskNationVoice:Readonly<Record<KioskNation,{title:string;intro:Line;proposal:true}>>={
 kindle:{title:'Reward kiosk',intro:L('Claim what you earned and read your history. Rewards are capped and paid only for verified work.'),proposal:true},
 korund:{title:'Reward counter',intro:L('The counter keeps the record for all. Claim your earned reward and read the record. Rewards are capped and for verified work only.'),proposal:true},
 aurelle:{title:'Reward desk',intro:L('Rewards earned through verified service may be claimed here, and the ledger of past claims lies open to you. Rewards are capped.'),proposal:true},
};
export function kioskVoiceFor(nationId:KioskNation){return kioskNationVoice[nationId];}

/** A claimable reward and its button. */
export const kioskClaimable={
 label:'Ready to claim',
 row:L('You earned {reward} for {work}. It is ready to claim.'),
 claimButton:'Claim reward',
 claimAccessibleName:L('Claim {reward} for {work}'),
 proposal:true,
} as const;

/** How a history entry is labeled: only verified work is "Earned". */
export const kioskLabels={
 earned:'Earned',
 starterGrant:'Starter grant',
 faucet:'Faucet (not earned)',
 starterGrantHelp:L('A starter grant is given to get you started. It is not an earned reward.'),
 faucetHelp:L('A test faucet is issued for testing. It is not an earned reward.'),
 proposal:true,
} as const;

/** Claim confirmation and the results. */
export const kioskClaim={
 confirmPrompt:L('Claim {reward}? It is added to your balance and shown in your history.'),
 confirm:'Claim now',
 cancel:'Not now',
 claimed:L('Claimed: {reward}. It now shows in your history.'),
 alreadyClaimed:L('This reward was already claimed.'),
 proposal:true,
} as const;

/** History and state lines. */
export const kioskHistory={
 title:'Reward history',
 empty:L('No rewards yet. Rewards appear here after verified work earns them.'),
 notOpen:L('The reward kiosk is not open yet. Check back later.'),
 proposal:true,
} as const;

/** One shared note. Where Spark is the currency, it says only that Spark stays in the world. */
export const kioskNotes={
 sparkStays:L('Spark stays in the world. The kiosk only pays out rewards you have earned.'),
 proposal:true,
} as const;
