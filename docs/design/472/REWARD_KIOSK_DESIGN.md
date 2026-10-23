# Design: reward-claim kiosk, reward history and the standalone testnet entry (#472)

**Status:** design for ARC review. No code. Nothing here is built by this PR.
**Sources:** Decisions 70, 109, 110, 111 and 112 (docs.harimu.com, Appendix B). Issue #472. Shipped pieces this builds on:
- the #466 kiosk in `app/wallet-panel.tsx` (behind `HARIMU_TESSERA_REWARDS_ENABLED`, off in prod)
- the #525 kiosk copy in `lib/reward-kiosk-copy.ts`, all `proposal: true`
- the #631 test faucet
- the #465 reward rules in `lib/tessera-rewards*.ts`, including the pilot lifetime cap `rewardCitizenLifetimeCapMinor`

**Copy:** strings quoted from `lib/reward-kiosk-copy.ts` or `lib/kiosk-text.ts` are existing, still-proposed Content copy. Every other string in this doc and in the wireframes is **[P] proposed** and needs Content/ARC sign-off before any build.

Wireframes (wireframe-level SVG):

| # | File | Shows |
|---|------|-------|
| 1 | [01-kiosk-desktop.svg](01-kiosk-desktop.svg) | Kiosk in the wallet dialog at 1280×800, claimable state, with numbered annotations |
| 2 | [02-kiosk-states-390.svg](02-kiosk-states-390.svg) | Every kiosk state on a 390px phone |
| 3 | [03-standalone-entry.svg](03-standalone-entry.svg) | Standalone web entry at 1280 and 390 |
| 4 | [04-flows.svg](04-flows.svg) | Entry flow and claim flow |

## 1. What the decisions require

| Decision | UX consequence |
|---|---|
| 110: earned Tessera = capped rewards for verified work; starter grants and faucets are labeled separately | Every credit carries a provenance label. Only verified work reads "Earned". The cap is visible. |
| 111: kiosk = reward-claim and history place; Spark→Tessera exchange stays **disabled** | The kiosk has claim and history only. There is no buy button, no rate and no conversion wording. The default-off exchange code (`HARIMU_SQUARE_PURCHASE_ENABLED`) is not used or shown. |
| 112: standalone **web** testnet pilot with World ID, distinct from World App | A web landing page, a testnet badge, World ID as a step after sign-in, and no claim to be a World App mini app. |
| 70: explore without World ID; unique-human proof for citizenship, voting and claiming | "Explore" is a first-class path with no ID. Claiming asks for World ID only when you try to claim. |
| 109: relocation support is paid from the reward budget and labeled `relocation-support` | History needs a fourth provenance label later. It is reserved here and not designed (see open questions). |

## 2. Where it lives

- **Kiosk and history:** a section of the existing **Wallet** dialog, opened from SPK in the top bar. It is not a new screen. On a phone (S8 on) the wallet is a sheet and the kiosk scrolls inside it.
- **Flag off** (`HARIMU_TESSERA_REWARDS_ENABLED` off, or the server answers 404): no kiosk section, no history table, no testnet disclaimer about rewards. This matches what ships today.
- **Standalone entry:** the public landing page of the pilot web app, before the game shell. It only exists in the pilot deployment, under its own build flag (name TBD with ARC).

## 3. Flows (wireframe 4)

**A. Entry**
1. The landing page shows two equal paths:
   - **Explore the world** → guest World view, no ID needed.
   - **Become a citizen** → Sign in (Clerk) → Verify with World ID (external flow) → choose a nation.
2. If verification fails or is cancelled, you come back signed in but not verified. You can keep exploring, and the citizen card says verification is still needed.
3. The testnet badge stays in the game's top bar for the whole session (S2 top bar, next to the clock).

**B. Claim**
1. Open the Wallet → Reward kiosk.
2. Not verified → state *World ID not verified*. History stays readable. You only need World ID to claim.
3. Verified:
   - claimable rows → **Claim reward** → *Pending* → *Claimed*. The row moves into history.
   - on failure → *Error* with **Try again**.
4. No claimable rows → *Empty*, *Capped* or *Not open*, depending on the server.
5. A claim never touches Spark, and the exchange never appears.

## 4. States (wireframes 1 and 2)

| State | Trigger (server) | What shows | Copy |
|---|---|---|---|
| Empty | no claimable rows, no history | intro + empty line; history table hidden | existing: "No rewards yet. Rewards appear here after verified work earns them." |
| Claimable | ≥1 unclaimed earned entry | totals line; one row per entry: provenance, day (UTC), the verified work, amount, **Claim reward** | existing: "Ready to claim", "Claim reward", accessible name "Claim {reward} for {work}"; the totals line is in the shipped markup |
| Pending | claim request in flight | that row's button disabled with "Claiming…" [P]; other claim buttons disabled; `aria-busy` on the row | [P] "Claiming…" |
| Claimed | claim succeeded | `role=status` line; the entry moves to history | existing: "Claimed: {reward}. It now shows in your history." |
| Already claimed | duplicate or stale claim | `role=status` | existing: "This reward was already claimed." |
| Capped | lifetime pilot cap reached, nothing claimable | cap line, no buttons; history readable | [P] "You have reached the pilot reward cap. New work still counts for your record." (if ARC rules that capped work is not recorded, drop the second sentence) |
| Error | network or server failure | `role=alert`; **Try again** retries the same entry | [P] "The claim did not go through. Your reward is safe; try again." |
| Not open | flag on, but the kiosk is closed by the server | one line, no buttons | existing: "The reward kiosk is not open yet. Check back later." |
| World ID not verified | signed in, no unique-human proof | explanation + **Verify with World ID**; history stays readable | [P] "Verify you are a unique human with World ID to claim rewards." / [P] "Verify with World ID" |

**Provenance labels (history):** existing "Earned", "Starter grant", "Faucet (not earned)", plus their help lines. Not-earned credits keep their own table, "Other credits (not earned)", as shipped. Reserved for later: [P] "Relocation support" (Decision 109).

**Always shown with the flag on:**
- the testnet disclaimer [P]: "Testnet pilot: no real money. Rewards are earn-only and cannot be cashed out."
- the existing Spark note: "Spark stays in the world. The kiosk only pays out rewards you have earned."

**The cap:** the totals line adds "Pilot cap {cap} TSR" [P]. `{cap}` comes from the server (`rewardCitizenLifetimeCapMinor`) and is never written into copy (the #525 rule).

## 5. Standalone entry (wireframe 3)

- **Top:** wordmark plus a persistent **TESTNET PILOT** badge [P]. The badge is text, not color alone.
- **Two cards, same size and same weight:**
  - **Explore without an ID**: [P] "Look around the world, cities and news. No sign-in needed." → **Explore the world** [P]
  - **Become a citizen**: [P] "Sign in, then verify you are a unique human with World ID to join a nation, vote and claim earned rewards." → **Sign in** (existing), then **Verify with World ID** [P]
- **"What the pilot is" box** [P]:
  - test network only: no real money, no purchases, no cash-out
  - Tessera is earn-only: capped rewards for verified work
  - this web pilot is separate from World App and is not a World App mini app
- **Footer links:** Privacy, Terms, and "How verification works" [P]. World ID details stay private (Decision 62).
- **Not on this page:** no wallet-connect, no chain or provider names, no token price, no "invest" or "earn money" wording, no countdowns.

## 6. Accessibility

- **Claim buttons:** one per row. The accessible name includes amount and work (existing "Claim {reward} for {work}"), so screen-reader users can tell rows apart. Each button is at least 44×44px on touch. The focus ring is the shared 2px gold ring.
- **Pending, claimed and error:**
  - The pending row gets `aria-busy`, and the pressed button is disabled with visible text.
  - The result is announced once (`role=status`; errors use `role=alert`).
  - After the row moves, focus goes to the next claim button, or to the history caption if none are left.
- **History:** a real `<table>` with a caption and `scope=col` headers, as shipped. Provenance is a text column, never color only. Earned vs not earned also differ by table.
- **Disclaimers:** plain text before the kiosk in reading order, not a tooltip. The testnet badge is text.
- **Entry page:**
  - one `h1`; each card is a `section` with its own heading; the two paths come in DOM order (explore first)
  - the World ID flow opens in the same tab, with a clear return
  - if it fails or is cancelled, a `role=status` line explains and offers retry
- **Contrast:** text at least 4.5:1, borders and focus rings at least 3:1, the warning box included.
- **Text scaling:** 100/125/150% with no clipping, no mid-word splits and no sideways scroll.

## 7. Responsive behavior

| Width | Kiosk | Entry |
|---|---|---|
| ≥ 1101px | wallet dialog ~620px wide; rows are one line: label, day + work, amount, button | two cards side by side; pilot box full width |
| 761–1100 | same dialog, narrower; the work text wraps under the day | cards side by side when ≥ 2×300px, otherwise stacked |
| ≤ 760 (390, 320) | wallet as a sheet (S8); each claim row stacks: provenance + day + work, then amount, then a full-width button; the history table becomes a definition list per entry below 360px [P] so nothing scrolls sideways | cards stacked, explore first; buttons full width |
| 150% text | the totals line wraps after each figure; buttons grow in height, never truncate | — |

## 8. Layout-check plan (for the build issue, not this PR)

A future `scripts/reward-kiosk-check.mjs` should cover:
- all nine kiosk states plus the entry page
- 1280×800, 390×844, 320×700 and 320×640 at 100/125/150% text, under Inter and DejaVu
- flag off and on: no kiosk and no disclaimer with the flag off

Assertions:
- nothing clipped, no mid-word splits, no sideways scroll
- claim buttons at least 44px and uncovered; accessible names include amount and work
- one live announcement per claim result
- the history table (or list below 360px) keeps provenance text; earned and not-earned stay separate
- no element mentions buy, convert, exchange or cash-out, apart from the pilot box's "no cash-out" line
- the testnet badge is visible in the top bar after entry

Screenshots go to `docs/screenshots/472/`.

## 9. Copy needed from Content ([P] = new, needs sign-off)

1. Testnet disclaimer (kiosk) and **TESTNET PILOT** badge.
2. Pending label "Claiming…"
3. Capped line, and whether "new work still counts" is true.
4. Error line and "Try again".
5. World ID not verified line and "Verify with World ID".
6. Totals-line suffix "Pilot cap {cap} TSR".
7. Entry page:
   - tagline (or an existing approved one)
   - both card bodies
   - "Explore the world"
   - the "What the pilot is" box (three lines)
   - "How verification works"
8. Narrow-width history labels (Day / Provenance / Amount as a definition list), likely the existing headers.
9. "Relocation support" provenance label (Decision 109), reserved for later.

## 10. Open questions for ARC

1. **Where is World ID checked for claiming?** At claim time (this design: history readable, claiming gated), or does an unverified account see no kiosk at all?
2. **Capped state:** does work after the cap still record an earned entry with 0 claimable, or nothing at all? This decides the capped copy.
3. **Cap visibility:** show the pilot cap figure ("Pilot cap 50.00 TSR"), or only say rewards are capped?
4. **Claim rows show the work** ({work}, e.g. "Harvest shift, Forgehaven"). The shipped #466 rows show only "Earned · day". Can the server expose the source shift's place name?
5. **Does the entry page belong in this repo** (a pilot-only route behind a flag), or in a separate pilot deployment?
6. **Relocation support:** design its history label and help line now, or when #470 builds it?
7. **Narrow history:** is turning the table into a list below 360px acceptable, or should it stay a table with wrapped cells?
