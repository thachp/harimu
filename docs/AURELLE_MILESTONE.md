# Aurelle chartered service milestone

Official design: [Aurelle §7.5](https://docs.harimu.com/world/nations/aurelle/), [citizen daily loops §11](https://docs.harimu.com/citizens/citizens-daily-loops/), [economy §12](https://docs.harimu.com/economy/economy-currency/) and [verification §20](https://docs.harimu.com/systems/anti-cheat/). The official pages describe chartered markets, royal service, Crowns and Favor. They do not supply the wage, food price, starting stock, Favor reward or cap used here. All these numbers are explicit prototype tuning.

## Supported daily loop

- A seeded Highspire food-estate charter permits Aurelle citizens to work one service shift: four WC, two real hours, eight CRN wages and two Favor upon funded collection. Collection contributes four food to the estate, rather than directly to the household.
- The estate starts with 1,000 CRN (100,000 integer minor units) and forty food. Wages transfer from its actual finite treasury. Food purchases return Crowns to that treasury. There is no issuance or automatic refill.
- Citizens buy one or two food at 1.50 CRN each from actual estate stock. Crown balances and household food are separate from Kindle's Spark market and Korund's Labor Note/ration accounts. Aurelle has no player listings, selling, foreign exchange or conversion in this subset.
- A meal consumes two household food and restores up to four WC, capped at twenty-four, with a two-real-hour cooldown. Normal capacity recovery continues.
- Funded service records immutable earned Favor; the displayed social standing is capped at one hundred. Favor is not money and cannot buy food. Decay, spending, ranks and estates are deferred; this is not the complete official Favor system.

The existing shared active-shift constraint covers all three economies. A legitimate citizenship grace move leaves every old ledger intact and allows collection of the originally recorded currency reward. Direct generic Spark claims cannot settle an Aurelle shift. Fund shortages leave unpaid shifts active; service rewards are not reserved in advance.

## Integrity and interface

D1 transaction batches bind immutable receipts to account, action, quantity and original shift. Integer prices, finite wallet/stock/treasury checks, capacity debit/credit and settlement are authoritative. Replaying a receipt cannot mint rewards, spend twice or double-produce food; incompatible reuse is refused. Existing tables and balances are preserved by additive initialization/migration.

Work, Market and Household use one compact inspector component. Square has one next-step link. Actions wrap and have forty-four-pixel targets; prototype limitations are collapsed. World retains only its globe labels and bottom nation strip for nation selection. All government offices remain deterministic AI/SI roles; counted civic actions retain the unavailable Tier 1 phone-verification gate.

Visual QA uses the actual shell/panel components with an isolated local Aurelle fixture, including narrow desktop and 390×844 mobile work/food/meal flows. This fixture changes no citizen account and is removed before publication. Actual API/SQL regressions cover settlement, purchases, meals, replay, account/nation isolation, original-currency claims, restart and concurrent exhaustion. Production review does not spend an existing citizen's resources or change citizenship.

Validation passed: lint, TypeScript, all 21 JavaScript regression scripts (47 numbered Node cases plus script assertions), and 77 SQLite cases. The actual pending-action client function is tested for interrupted requests, preserving the UUID/quantity during retry and rejecting stale account responses. Government food-need previews read Aurelle food, not retained Spark inventory. Drizzle reports no schema drift; migration installation was checked against fresh and already-initialized tables. QA screenshots are internal `design-aurelle-*.jpg` files; the local fixture route is absent from the release.

## Remaining design

Royal charter applications, grants/revocation, guild ownership, monopoly goods and pricing, fiefs, rents/tribute, mint parity, bullion backing/redemption, debasement and issuance rules are unimplemented. Favor decay/spending, noble progression, audiences, gifts, tournaments and claimant pledges are also deferred. A seeded active charter is a prototype market permission, not royal decree issuance or a human governing office. No additional service, credentials or security changes are required.
