# Development preview: citizen communications dock

Runtime commit: `0dd10a3`. Preview Worker version: `1cd3ad8d-9d55-4b07-a3f6-e3462fa33420`, verified serving 100% of preview traffic on 2026-10-13.

The persistent footer exposes Chat, News, and Civic inbox in every game location. The top HUD opens the same inbox and shows unread items for the current session. Inbox entries derive from the citizen's unclaimed work deadlines and own petition records, deduplicate shifts, and reject foreign government snapshots. Opening Work only navigates: it never claims a reward. Read acknowledgement stays in memory and does not modify shared records. Ballot and petition-threshold alerts are explicitly unavailable until their authoritative features exist.

Chat uses the citizen nation independently of the nation being inspected. A mismatched refreshed chat namespace fails closed. Presence requires fresh opt-in while the current City view is visible; leaving City or closing chat clears the local opt-in. No live chat message or presence operation was submitted in acceptance testing.

Validation: 199 Node tests, 88 SQL tests, lint, TypeScript and build passed. Regression fixtures cover exact deadline boundaries, claimed/corrupt shifts, duplicate ledger views, foreign/anonymous inboxes, local read acknowledgement, reviewed petition updates, and the off-City presence guard. Background browser checks at desktop and 390 × 844 confirm the footer persists across all seven locations, the mobile page has no horizontal overflow, and native dialog Close/Escape restores launcher focus. Live preview checks confirm anonymous chat/inbox guards and desktop/mobile dismissal. The local development database was unavailable; its error state also blocked inbox/chat access.

Issue #24 remains open for authoritative ballot/threshold alerts and signed-in live chat/inbox acceptance. Issues #22 and #27 retain their previously documented acceptance gaps. Preview data and production routing were preserved; no gameplay submission, reward claim, presence opt-in, or account operation occurred.
