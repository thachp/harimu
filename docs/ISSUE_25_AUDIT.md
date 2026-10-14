# Issue #25 audit: Kindle election PoC

Audited against `github/main` at 51adde7. Every acceptance criterion and PoC scope item is already on main (commits b3d0a09, 8b6a237, f07d245). No code changes were needed.

| Item | Status | Where |
|---|---|---|
| One Kindle presidential election, 3 AI candidates with AI badges and platforms | Done on main | `lib/elections.ts` `electionCandidates`; `app/ranked-ballot.tsx` uses `AiBadge` |
| Ranked ballot, 72-hour window | Done on main | `ballotWindowSeconds=72*3600`; schema CHECK `closes_at=opens_at+259200` |
| A citizen can rank once; a second ballot is rejected | Done on main | `voteReceiptSql` + atomic batch in `app/api/election/route.ts`; tests `election.test.mjs`, `account-election.test.mjs` |
| Results hidden until close | Done on main | `readElection` returns `result` only when closed; test "results stay hidden before exact close" |
| IRV count correct (unit test) | Done on main | `lib/instant-runoff.ts`; `tests/instant-runoff.test.mjs` (6 tests) |
| Human and AI-bloc tallies shown separately | Done on main | Result table columns "Humans" / "SI weight"; Simulated Public capped at 20%, deterministic, no model call |
| "I Voted" badge, cosmetic | Done on main | `.i-voted` status in `app/ranked-ballot.tsx` |

No AI inference is involved (fixed candidates and a stubbed Simulated Public bloc), so no AI budget reservation is needed.
Live voting depends on the flags described in `ACCOUNT_ELECTION_PREVIEW.md`.
