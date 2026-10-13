# Bounded citizenship onboarding

Official source: [GDD v0.7 onboarding](https://docs.harimu.com/systems/onboarding/),
read October 13, 2026; [citizenship permanence](https://docs.harimu.com/migration/immigration-asylum/).
This implements the two-step nation choice/oath and the single first-48-real-hour
change before political action. It is not the full questionnaire, population
balancing, character creation, or three-day quest system.

Exploration uses globe labels and the existing bottom strip. The compact nation
inspector opens an explicit oath; signing in never enrolls automatically. Pending
review survives refresh in account-scoped session storage, transfers from anonymous
exploration on first sign-in, and requires fresh acknowledgement after identity
changes. Keep exploring clears the review. Existing citizenship is server-owned.

Enrollment requires the citizenship the player reviewed. Atomic writes enforce
one citizen per Clerk account, reject stale competing choices, allow same-target
retries, and preserve drafts, decisions, shifts, balances and currency ledgers.
Future/invalid enrollment dates and corrupt change counters fail closed. A short
guide reads current work/food/meal state for the three playable economies.

Local verification: 68 Node tests, 77 SQL tests, lint, type checking and production
build. Browser checks cover anonymous exploration, oath refresh, interrupted Clerk
sign-in, Escape, focus trapping and 390px mobile fit. Returning accounts, identity
changes, invalid state and grace boundaries are verified with local handler/storage
fixtures; no external accounts or production citizens were changed. Actual
authenticated Clerk browser round trips remain unverified.

Phone Tier 1 is still unavailable; counted political actions retain their gate.
Redis authentication/Sites compatibility, population balancing, broader tutorials,
continuous world scheduling and model-driven government remain outside this scope.
