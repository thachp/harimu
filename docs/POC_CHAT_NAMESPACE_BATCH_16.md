# Preview chat namespace regression fix

Runtime commit: `0222e12a394b0514b268885954e1a96556ed080d`.
Preview Worker version: `6b94f88e-3a0a-4bce-9f1b-e760b6b62340`, verified serving 100% on 2026-10-13.
Preview: https://preview.harimu.com

## Problem and change

A chat draft opened in one nation could be inserted into another nation if citizenship changed before submission. The insertion previously selected the citizen's current nation without binding the conversation's expected nation.

Post and delete commands now require the expected conversation nation. The API refuses stale commands, and the SQL insertion/deletion checks citizenship at the write itself. Client command responses also verify the nation before replacing the feed or clearing a draft. Presence requests carry the expected nation too; no live presence opt-in was performed.

Old loaded clients without the new post/delete field must refresh before sending. Existing rate limits, request IDs, message history, and citizen data remain intact. This change does not add cross-nation recovery for an uncertain earlier submission.

## Verification

- Full check passed: 240 Node tests, 99 SQL tests, lint and TypeScript; production build passed.
- Actual local API/SQLite fixtures prove stale drafts cannot enter the new nation, citizenship changes between context read and insertion are rejected, and equivalent deletion races cannot remove an old-nation message.
- Client regression verifies a foreign-nation command response preserves the draft and uncertain submission state.
- `git diff --check` passed; runtime commit pushed to main before guarded preview deployment.
- Live read-only preview checks: chat GET returns 401 and `Cache-Control: private, no-store`; world GET returns 200. Deployment status confirms the exact version above at 100%.

## Remaining acceptance limits

The existing signed-in Chrome preview tab remains owned by the disconnected task. It was not taken over, and no new Chrome tab was opened because the documented API does not guarantee background creation without disrupting user activity. Signed-in chat/news/theme/settings acceptance remains pending. No issue was closed in this batch.

No live chat posts, political submissions, gameplay commands, shift claims, or presence changes were made. Counted politics remains gated; ballot unlinkability is unresolved. Production routing and data were untouched.
