# Official Harimu documentation alignment

Patrick designated [docs.harimu.com](https://docs.harimu.com/) as the official
source of truth on October 13, 2026. The site was successfully read over public
HTTPS from the Mac (HTTP 200). Its current document is GDD v0.7, dated October
13, 2026; it explicitly supersedes v0.6. The local PDF and companions are
historical implementation context, not evidence of parity with v0.7.

Direct user requirements still control implementation: all first-release offices
are AI/SI controlled; preserve the reference game shell, globe, collapsible
context panel, Household, and removal of the separate Citizen Plan scene.
Documentation describes design intent, not permission to create accounts, buy
services, change credentials, delete data, or deploy unrelated changes.

## Prioritized implementation gaps

1. **Before counted civic play: verification and lifecycle controls.**
   [Anti-cheat](https://docs.harimu.com/systems/anti-cheat/) requires Tier 1 for
   counted petitions/votes/pledges. Petitions now fail closed unless fresh server-trusted Tier 1 evidence is available.
   Production phone verification remains unavailable pending approved setup; the UI
   explains the gate while work, trade, chat and private planning remain available.
   Only petitions with an owned eligibility receipt enter new reviews; legacy records
   remain preserved. This bounded change does not establish the full verification system. [Architecture](https://docs.harimu.com/tech/architecture/)
   also specifies age attestation, export/erasure webhooks and account/risk records;
   these are absent. Local account-isolation tests do not establish these controls.
   Phone verification or new security configuration needs Patrick's approval;
   document policy/legal verification items remain open, not assumed settled.

2. **Authoritative world and durable simulation.**
   [Architecture](https://docs.harimu.com/tech/architecture/) calls for a separate
   game server, event log, durable jobs and filtered realtime views. Current Vinext
   handlers now persist bounded D1 world ticks and immutable policy-execution receipts,
   with at most three overdue ticks handled per server visit. There is still no
   continuous shard scheduler or realtime event stream.
   [Clock](https://docs.harimu.com/systems/world-clock-pacing/) specifies 12× world
   time and game-day governance; the HUD now shows a server snapshot of 12× world
   time. Two-real-hour routine ticks evaluate current observed needs during catch-up,
   rather than reconstructing historical state. Citizen shifts and petition reviews
   retain their existing real-time/UTC rules.

3. **AI governance and AI citizens.**
   [Leadership](https://docs.harimu.com/politics/ai-leadership/) defines personas,
   legal-action validation, routine utility decisions and bounded major decisions.
   [Citizens](https://docs.harimu.com/citizens/citizens-daily-loops/) adds deterministic
   AI citizens and distinct human influence. Current government is explicitly a
   deterministic proposal/review prototype for three nations, plus bounded Kindle
   food allocations from a finite supplier reserve. Saved allocations debit the
   finite employer fund shared with wages and replenish merchant stock exactly once.
   Other nations and policy topics have no economic execution. There is no connected
   model, personas, AI population, elections or replacement.
   Do not describe it as deployed model AI or add providers/keys without approval.

4. **Nation-specific economy and MVP completion.**
   [MVP](https://docs.harimu.com/production/mvp-scope/) requires Kindle, Korund and
   Aurelle experiences, eight job types and their different economic regimes.
   [Economy](https://docs.harimu.com/economy/economy-currency/) describes production,
   allocation, currencies and clearing. Current work/trade is three Kindle shifts,
   a finite fixed-price merchant and whole-lot player listings. Korund now has a
   bounded server-assigned food-production job, a separate finite Labor Note wage
   fund, non-transferable game-week ration coupons, state food supply and household
   meals; see [Korund milestone scope](KORUND_MILESTONE.md). Full Korund plans/quotas,
   Aurelle charters/Favor, order-book matching and wider currency systems remain
   unimplemented.

5. **Onboarding and social scope.**
   [Onboarding](https://docs.harimu.com/systems/onboarding/) specifies AI disclosure,
   nation families, previews and tailored tutorials; current enrollment now includes current playable support and deterministic
   government disclosure, alongside the nation dossier and confirmation. A daily-loop
   guide uses actual balances and timers for paid work, collecting rewards, shopping
   and Household meals. Broader tutorials and social breadth remain incomplete. [Social](https://docs.harimu.com/systems/social-news-media/)
   specifies city/national/member/DM/global/OOC channels and nation-specific press
   rules. Current chat is a pseudonymous nation feed with local mutes and aggregate
   presence; news is visibly seeded prototype content.

## Conflicts to retain or resolve explicitly

- [Map design](https://docs.harimu.com/world/map-design/) describes a finite square
  plane/ring topology. The approved globe is a visual world representation, not an
  authoritative territory implementation. Keep it; clarify how future square
  mechanics project onto it before implementing territory or distance rules.
- [UI design](https://docs.harimu.com/production/ui-ux/) describes a left citizen
  rail and chat/news bottom dock. Patrick subsequently approved the current
  scene-specific bottom strips, collapsible right panel and no separate Citizen
  Plan. Preserve those approved refinements; do not revert them to the generic GDD
  layout without another explicit design decision.
- v0.7 [leadership](https://docs.harimu.com/politics/ai-leadership/) says humans never
  hold leadership office. Older local notes say player office is deferred beyond
  the first release. Treat that older roadmap wording as unresolved historical
  context, not authorization to implement human officeholding.

No gameplay, authentication, credentials, hosting or production data was changed
by this alignment review. The current build is a tested prototype, not the full
v0.7 MVP described by the official documentation.

Redis Cloud TLS is enabled, but authenticated connectivity is unverified and the
current Sites runtime contract allows HTTP external connections only. See
[Redis runtime compatibility](REDIS_RUNTIME.md); gameplay does not depend on Redis.
