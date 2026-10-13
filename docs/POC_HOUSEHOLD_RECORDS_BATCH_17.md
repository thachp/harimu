# Household food records: issue 32 diagnostic slice

Runtime commit: `01156a246a92c6c013384397c9108c88d044ec8a`.
Preview Worker version: `807bac34-8939-4c67-9596-4f67ef93a7ec`, verified serving 100% on 2026-10-13.
Preview: https://preview.harimu.com

## Scope and evidence

Rechecked all ten currently open owner-authored issues; no new issues were present. Issue 32 still reports food missing and a meal timer before any meal. That underlying failure remains unreproduced. This slice makes the account's authoritative records inspectable instead of changing its resources.

The private citizen snapshot now includes the quantity in that account's original starter-food grant and the timestamp of its latest actual Kindle meal event. Household exposes these in a collapsed Food records disclosure, distinguishes the original grant from current inventory, and explains which meal began the cooldown. Local samples explicitly lack live account receipts. No event IDs or private account identifiers appear in the disclosure.

The change adds one account-bound read to the existing market snapshot. It does not add schema, grant food, reset timers, mutate meal receipts, or change economy rules. Existing normal account initialization still grants eligible Kindle starter food once.

## Validation

- Full check: 243 Node tests, 99 SQL tests, lint and TypeScript passed. Production build and `git diff --check` passed.
- Real API/SQLite fixtures verify a fresh Kindle account has its original two-food grant and no meal timestamp/cooldown. An actual fixture meal leaves zero food and supplies the precise timestamp behind the existing cooldown.
- Retrying the same fixture meal and reopening the fixture database preserve one meal and the original grant. A different account never inherits the first account's meal timestamp; missing grant records are projected as missing rather than inferred.
- Component tests verify saved-grant, saved-meal, missing-grant and local-sample messages. Existing disabled action and quantity tests remain green.
- Runtime commit pushed before guarded preview-only deployment. Exact Worker version above serves 100%. Read-only live checks return 401/private-no-store for the citizen API and 200 for the world API.

## Outstanding acceptance

Issue 32 remains open: the reported failure and its account history still require signed-in acceptance. Browser-session ownership was respected; no alternative browser access route was attempted. This batch used fixture/API verification, not new desktop/mobile live acceptance.

No issues were closed. No live gameplay, chat, presence or political actions were submitted. Counted civic gates and the ballot privacy gate remain disabled. Production routing/data, providers, credentials and permissions were untouched.
