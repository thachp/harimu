# Korund assignment and ration milestone

Official sources: [Korund nation rules](https://docs.harimu.com/world/nations/korund/),
[daily loops §11.5](https://docs.harimu.com/citizens/citizens-daily-loops/),
[economy §§12.8 and 12.11](https://docs.harimu.com/economy/economy-currency/),
[MVP scope](https://docs.harimu.com/production/mvp-scope/).

This is a bounded first Korund economy, not the full planning system. It preserves
Kindle's separate market and Spark ledgers. Existing balances are never converted,
reset or deleted when citizenship changes.

Prototype tuning:

- The Labor Bureau assigns one state food-production brigade job. It takes four WC
  and two real hours. Collection pays eight Labor Notes and contributes four food
  to the state ration pool, rather than to the worker's household.
- A finite wage fund starts with 100,000 LN minor units (1,000 LN). Production is
  recorded only with a funded settlement; retries cannot pay or produce twice.
- State food starts at 40 units and grows only through recorded brigade output.
  Each citizen may redeem a two-food entitlement once per game week while actual
  stock lasts. A game week is seven days at 12× time: 50,400 real seconds from the
  persisted world epoch. Unused coupons expire; redeemed household food persists.
- Coupons are account-bound and non-transferable. No legal private market, currency
  conversion, player listings or Spark purchases are offered to Korund citizens.
- A ration meal consumes two household food and restores up to four WC, capped at
  24, with a two-real-hour cooldown. Normal capacity recovery remains unchanged.
- Shared active-shift constraints span both nations. A permitted citizenship grace
  move does not strand an unfinished shift: its owner can collect the originally
  recorded currency reward, which stays in its original ledger.

Authoritative D1 receipts bind actions to their account and request identifiers;
finite stock, fund checks and capacity changes are atomic. The government observes
Korund's actual household ration balances. Officials remain deterministic AI/SI
roles, with no connected model and no continuous scheduler guarantee.

Not implemented: three job preferences, skill/Standing-weighted assignment,
30-day reassignment, grade-based ration allocation, quarterly quotas/five-year
plans, medals, gray markets, clothing/housing allocation, Labor Note spending and
foreign trade. The approved globe remains unchanged; information fog is not added
by this economy milestone.
