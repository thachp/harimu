# Harimu - Game Design Companion

Implementation override: [requirements after v0.6](REQUIREMENT_CHANGES.md) takes precedence for explicitly changed requirements, including AI/SI control of all government roles in the first release. Player-held office is deferred.

Status: implementation-facing summary of the canonical **Harimu Game Design Document v0.6**, dated October 12, 2026.

The full GDD is the design authority. This companion keeps the decisions most likely to affect product, architecture, and day-to-day implementation close to the codebase. When the two conflict, follow the GDD and update this file.

Numbers described as assumptions are starting points for playtesting, not promises. Items marked for verification in the GDD still require legal, technical, or market confirmation.

## High Concept

Harimu is a persistent browser strategy game set on the world of Harimu. Ten original nations, each with a fixed political system, economic system, currency, and official religious stance, share a finite map and a clock that never pauses.

The player is not the nation. The player is one citizen living inside its institutions. All government roles are AI/SI-controlled in the first release. Players influence institutions through nation-appropriate voting, petitions, protests, trade and public opinion; player-held office is deferred. Systems do not change, but the people running them do.

The central promise is:

> You are not the nation - you are one of its citizens.

Harimu is a stylized social simulation, not a ranking or direct depiction of real countries, parties, leaders, ethnic groups, or religions. Its six faiths are fictional. The elemental theme was removed in v0.3 and must not return in terminology, mechanics, or art direction.

## Design Pillars

1. **Citizen, not omnipotent ruler** - meaningful play exists at every social level, not only in national leadership.
2. **Systems are permanent; leaders are temporary** - each nation offers a distinct political and economic life that players operate but cannot swap out.
3. **Player politics drives history** - elections, congresses, courts, succession, councils, coups, purges, referendums, and revolutions produce different paths to power.
4. **A persistent shared world** - territory, institutions, fortunes, relationships, and history survive across real years without seasonal wipes.
5. **Power has legible constraints** - authority, approval paths, limits, logs, and response windows are visible and enforceable.
6. **Every nation has genuine agency and tradeoffs** - no society exists merely as a joke, villain, or tutorial opponent.
7. **Short visits, consequential moments** - ordinary play fits a 15-45 minute daily check-in, while elections, battles, congresses, and coronations become scheduled shared events.

## Product Shape

| Item | Decision |
| --- | --- |
| Genre | Persistent online political strategy and social simulation; real-time, not turn-based |
| Platform | Desktop browsers first; basic mobile web in MVP; mobile parity by 1.0 |
| Identity | One account, one citizen, one nation |
| Clock | 12x compression; one real month equals one game year |
| Persistence | Shards never wipe or seasonally reset; characters age and heirs continue |
| Map | Finite square-tile world; 128 x 128 in MVP, 512 x 320 at 1.0 |
| Business model | Free-to-play cosmetics and optional supporter subscription; no pay-to-win |
| MVP nations | Kindle Republic, Korund, Aurelle |
| 1.0 nations | All ten nations, delivered in two waves after MVP |

## The Ten Nations

Each nation combines one immutable political system, one economic system, one currency regime, and one official religious stance.

| Nation | Political system | Economic character | Currency | Official religious stance |
| --- | --- | --- | --- | --- |
| Kindle Republic | Liberal democracy; elected President and Assembly | Market capitalism | Spark (SPK), free float | Secular pluralism |
| The Confluence | Single-party socialist state; collective leadership | Socialist-oriented market | Current (CUR), managed band | Registered faiths permitted; cadres cannot be clergy |
| Meridian | Party-state; Paramount Leader and Standing Committee | State capitalism and Special Economic Zones | Gauge (GAU), crawling peg with capital controls | State-supervised approved associations |
| Korund | Full communism; one-party leader for life | Central planning, quotas, and rations | Labor Note plus ration coupons; non-convertible | State atheism; underground worship remains playable but risky |
| Aurelle | Absolute hereditary monarchy | Royal monopolies, charters, fiefs, and tribute | Crown (CRN), gold-backed and open to royal debasement | Kinward Rite under crown supremacy |
| Ilmar Sanctum | Theocracy; Supreme Oracle and Council of Elders | Endowments, tithes, and canon-regulated commerce | Prism (PRM), floating under Canon rules | Lumen Canon state faith |
| Hoarvale | Constitutional monarchy and parliamentary government | Coordinated market led by Trading Houses | Rime (RIM), free float with inflation band | Ceremonial Kinward establishment with full freedom |
| Varkand | Military junta; Directorate of Five Commands | Military combines, licensed trade, requisition, and national service | Ward (WRD), hard peg; Field Scrip | Regulated tolerance through the Chaplaincy Corps |
| Veldwood | Federal direct democracy; collegial Federal Council | Social democracy, Welfare Floor, and Common Fund | Bough (BGH), free float with Citizen Dividend | Secular pluralism |
| Fulmara | Mercantile oligarchic republic; votes weighted by Charter Shares | Chartered-company capitalism and route monopolies | Charge (CHG), free float; Toll Coupons | Chartered pluralism; Fair-Wind Vow customary |

Nation aesthetics derive from government, culture, climate and geography, currency, and religion - never from an elemental taxonomy or a real ethnicity.

## Citizenship and the Citizen Life

- A player enrolls as one citizen of one nation.
- One free nation change is allowed during the first 48 real hours, only before any political action.
- After that grace period, citizenship is permanent in the launch game.
- Restricted Exile & Asylum and Founding Choice are post-launch, once-per-lifetime exceptions.
- Citizenship and sensitive political status are enforced by the authoritative game database, not by client state or Clerk metadata.
- Characters age across approximately four to six real years; heirs continue the citizen's long-term story.

A normal visit should let the player:

1. Read personal, city, national, and world news.
2. Review work, markets or rations, political events, messages, and risks.
3. Commit to a job shift, trade, study, public duty, faith activity, political act, or coordinated project.
4. Prepare for scheduled high-stakes moments.
5. Leave with queued actions that continue resolving fairly while offline.

The experience must differ materially by nation. Kindle citizens bargain and campaign; Korund citizens navigate plans, ration priority, party standing, and gray markets; Aurelle citizens pursue charters, noble status, and royal favor. Later nations add congresses, coalition government, national service, direct referendums, clerical duty, and shareholder politics.

## Political Systems and Transitions

All consequential state actions follow a common model:

1. An authorized citizen or institution proposes an action.
2. The nation's fixed system determines approvals and limits.
3. The decision and its effective time are logged.
4. The authoritative server applies it.
5. Citizens receive a fair response window where the rules require one.

The main transition paths across the ten nations include elections, party congresses, term limits, leader-for-life succession, royal inheritance, palace coups, clerical conclaves, constructive no-confidence votes, snap elections, junta rotations, command coups, referendums, proxy fights, hostile takeovers, purges, and popular risings.

Every system needs an inactivity protocol so a missing player cannot freeze public life. Emergency successors and regents receive bounded powers; Charter Limits prevent a single leader from instantly emptying a treasury, erasing citizens' work, ceding the nation, or launching irreversible actions without process.

## Economy, Currency, and Trade

Each nation's economy should produce a distinct daily experience while remaining a viable way to play.

- Kindle uses private firms, contracts, wages, taxes, and an order-book market.
- Korund uses plans, quotas, state jobs, ration coupons, and a risky gray market.
- Aurelle uses monopolies, charters, fiefs, tribute, and royal favor.
- Later systems add cooperatives, state champions and SEZs, endowments, Trading Houses, arsenal requisition, a Welfare Floor, and Charter Shares.

Every nation has its own currency regime. Exchange behavior is part of political play, not a cosmetic label. The neutral Tessera and Commons Clearing House support eligible cross-border settlement without making any national currency dominant.

Money creation has hard caps: 15% per game month and 30% per game year. Reckless issuance can cause painful inflation, but the simulation does not allow a mechanically complete hyperinflationary collapse. The Dormant Savings Shield gives limited protection to small dormant balances.

International trade requires legal access, willing actors, actual goods, a route, and settlement. Tariffs, sanctions, embargoes, blockades, exchange controls, and smuggling create costs and opportunities. Fog of war and controlled information must never be bypassed by a public read model or client payload.

## Religion

Six invented faiths cross national borders. A citizen may hold a faith independently from nationality, subject to their nation's permanent official stance.

- Devotion is a 0-100 social progression measure and grants no direct economic or combat advantage.
- Faith play includes congregations, clergy, festivals, holy sites, missionary access, conversion cooldowns, and diplomatic consequences.
- Ilmar is a theocracy; Aurelle has a state church; Kindle and Veldwood are pluralist; Korund bans faith while preserving low-key underground play.
- Religious Harmony contributes to national Stability.

The design must not map fictional religions onto living real-world groups or use suppression as spectacle.

## World, Territory, and War

The world uses square tiles.

- **Heartlands** are protected national cores.
- **Frontiers** are acquired national land.
- **Wildlands** are unclaimed neutral territory.
- **The Commons** is the contested center with scarce shared resources.

Nations expand through square purchase, city founding, negotiated cession, or war. Military play requires declarations, mobilization, response windows, supply, sieges, and offline protection. The server owns visibility and fog of war; the renderer receives only information the viewer is entitled to know.

The permanent world needs anti-snowballing pressure: distance, upkeep, supply, occupation cost, resistance, war exhaustion, coalitions, and protected newcomer space.

## World Clock and Pacing

The clock is global, authoritative, and never pauses. Downtime is credited back to timers.

| Layer | Real cadence | Examples |
| --- | --- | --- |
| Moment-to-moment | Seconds to minutes | Chat, trades, battle decisions |
| Shift | 2-8 hours | Jobs, construction stages, troop movement |
| Daily | 1 day | Wages, rations, Stability, news cycle |
| Weekly | 7 days | Plans, drives, institutional sessions, progression decay |
| Political | 15-150 days | Vote Days, rotations, elections, congresses, plebiscites |
| Lifetime | About 4-6 years | Aging, heirs, dynasties, eras of rule |

At 12x compression, seasons change every 7.5 real days. Hostile or irreversible events must retain response windows long enough to cross time zones.

## Social Systems, Safety, and Integrity

- Chat operates at national, city, global, organization, and direct-message scopes as appropriate.
- Free press, licensed media, state media, gazettes, and propaganda are game systems, but platform moderation remains independent of national rulers.
- Political authority never grants moderation power over real people.
- The interface distinguishes confirmed facts, official claims, rumors, and secret intelligence.
- Public logs and delayed execution protect consequential actions.
- Starter protection, offline protection, cooldowns, caps, and link-group enforcement limit abuse.
- One-account-one-nation is backed by Clerk identity signals, verification tiers, server-side rules, and staff review; no single signal is treated as infallible.
- Minimum age is 16. Account deletion, privacy, export, and retention flows must be implemented deliberately.
- Real-money purchases never buy land, currency, votes, offices, goods, military power, priority, or shorter political cooldowns.

## Technical Architecture

The browser is a thin rendering and interaction client. The game server is authoritative over every rule, timer, ledger entry, vote, transition, and secret.

| Layer | v0.6 decision |
| --- | --- |
| Language | TypeScript end to end; TSX for React |
| Web | Next.js App Router on Vercel |
| Authentication | Clerk via `@clerk/nextjs` and `@clerk/backend` |
| World rendering | Three.js; React Three Fiber plus drei recommended |
| Realtime | Separate Node.js/TypeScript WebSocket server; uWebSockets.js recommended |
| Data | PostgreSQL with Drizzle; Redis for ephemeral realtime coordination |
| Jobs | Durable scheduler such as pg-boss |
| Hosting | Container host such as Fly.io or Railway for the game server |
| Repository | Turborepo plus pnpm, with shared types, rules, protocol, and database packages |

Architectural rules:

- Server Components render cacheable public nation pages, profiles, results, and news from safe read models.
- The 3D map is a client component loaded without server-side rendering.
- Clerk establishes identity; the database establishes citizenship, role, permissions, and game state.
- Route protection is not authorization. Authorization is checked at the data or command boundary.
- Webhooks are signature-verified and idempotent.
- Session JWTs are verified by the game server before a realtime connection may issue commands.
- The client sends intents, never authoritative outcomes.
- Fog of war is filtered server-side before data reaches Next.js, Redis, or the browser.
- Nation-specific behavior belongs in reusable rule modules and SystemTemplates, not scattered UI conditionals.

## MVP Scope

The MVP is one persistent shard on a 128 x 128-square map with three nations:

- **Kindle Republic** - elections, capitalism, free-floating Spark, newspapers, and pluralism.
- **Korund** - leader-for-life succession and purge, central planning, rations, Labor Notes, state media, and state atheism.
- **Aurelle** - hereditary succession, palace coup and popular rising, charters, Favor, gold-backed Crown, and a state church.

MVP includes:

- citizenship, the grace period, aging foundations, and the Founding Period;
- jobs and shifts, three contrasting economic loops, wallets, Tessera settlement, and emission controls;
- square purchase, city founding, Heartlands, Frontiers, Wildlands, and a small Commons;
- declarations, mobilization, defense windows, armies, simple supply, sieges, and offline protection;
- non-aggression pacts, trade agreements, embargoes, peace treaties, and embassy chat;
- national, city, global, and direct chat plus nation-specific starter media tools;
- desktop web and a basic mobile daily loop.

Deferred to later waves include the other seven nations, advanced congress and referendum systems, full mobile parity, naval warfare, deep espionage, advanced logistics, multilateral sanctions, and player-founded nations.

## Delivery Order

1. **MVP:** Kindle, Korund, Aurelle.
2. **Wave 2:** The Confluence, Hoarvale, Varkand.
3. **Wave 3:** Meridian, Ilmar Sanctum, Veldwood, Fulmara.
4. **Post-launch option:** player-founded nations chosen from fixed charter templates.

The MVP should prove that ordinary citizen life is compelling, that three political transitions work, and that the authoritative architecture can operate a persistent shard. Visual spectacle must not outrun rules, legibility, safety, or server authority.

## Open Verification Work

The design is closed, but external checks remain:

- formal trademark and domain clearance for **Harimu**, plus contingency naming for Kindle;
- legal review of privacy, age gating, moderation, user-generated content, virtual currencies, and international availability;
- current Clerk, Next.js, React Three Fiber, browser, hosting, and pricing details at build time;
- load testing for shard size, realtime connections, job throughput, database contention, and visibility filtering;
- playtesting of all values marked as assumptions in the GDD.
