# Harimu Domain Context

Canonical source: [official Harimu documentation, GDD v0.7](https://docs.harimu.com/), designated by Patrick on October 13, 2026. It supersedes the older PDF when they differ. This file remains a historical v0.6 summary; use the [alignment review](OFFICIAL_DOCS_ALIGNMENT.md) and direct user requirements before subsequent implementation.

Implementation override: [requirements after v0.6](REQUIREMENT_CHANGES.md) takes precedence for explicitly changed requirements, including AI/SI control of all government roles in the first release. Historical references to deferred player office must be reconciled with v0.7, which restricts humans to citizen roles.

This file is the historical implementation-facing vocabulary for Harimu. It summarizes the older **Harimu Game Design Document v0.6** dated October 12, 2026. If this file conflicts with the official v0.7 documentation, the official documentation wins; preserve direct user requirements.

## Product Identity

**Harimu**  
The game's title and the in-world name of the planet shared by all ten nations. Each shard is a separate, persistent copy of Harimu.

**Citizen**  
A player's in-world character. Each account controls one citizen, and each citizen belongs to one nation.
_Avoid_: player nation, civilization, commander

**Nation**  
One of ten sovereign communities with a fixed political system, economic system, currency regime, and official religious stance. Players influence policy and AI/SI officeholders through nation-appropriate civic actions; the underlying system stays fixed.
_Avoid_: faction, team, element

**Shard**  
One persistent world: its map, nations, citizens, history, economy, and never-pausing clock. Shards are not seasonally reset or wiped.
_Avoid_: season, match, server reset

**SystemTemplate**  
The data definition and reusable rules for one nation's government and economy. New nations should primarily be introduced through templates and content, not one-off logic.

## Identity and Citizenship

**Account**  
The authenticated player identity. Clerk owns authentication; the game database owns all Harimu identity and citizenship rules.

**Clerk userId**  
The external identity key used to associate a Clerk account with the game's account and citizen records.

**Citizenship**  
The permanent bond between a citizen and one nation. A citizen may use the grace period once, but routine naturalization and nation hopping do not exist.

**Grace Period**  
One free nation change during the first 48 real hours, provided the citizen has not taken a political action.

**Exile & Asylum**  
A restricted, post-launch, once-per-lifetime request to join another nation. It is not part of the MVP.

**Founding Choice**  
A one-time choice to join a newly founded nation in the post-launch founding system. It shares the citizen's single lifetime change with Exile & Asylum.

**Heir**  
The successor through whom play continues when a citizen ages out. The world and its institutions persist across generations.

## World and Territory

**Square**  
One square map tile and the base unit of ownership, production, movement, and war.
_Avoid_: hex, hex tile

**Heartland**  
A nation's protected, uncapturable core territory.

**Frontier**  
Territory acquired beyond a nation's Heartland.

**Wildlands**  
Unclaimed neutral land available for expansion.

**Commons**  
The contested center of the world map, containing scarce shared resources.

**City**  
A governed settlement founded on national territory. Cities anchor production, residence, logistics, and local politics.

**Stability**  
The national condition produced by political, economic, religious, and social pressures. It changes outcomes without replacing nation-specific rules.

## Time and Persistence

**World Clock**  
The global clock shared by a shard. It runs continuously at 12x compression: one real day equals twelve game days, and one real month equals one game year.

**Age**  
An approximately twelve-month era with world events and rankings. An Age does not reset the shard.

**Founding Period**  
The first 30 days of a shard, during which AI/SI government preserves continuity while citizens establish civic standing. Player-held office is deferred beyond the first release.

**Crisis Window**  
A 24-48-hour period in which a coup, purge, or popular rising resolves.

## Government and Civic Power

**Charter Limits**  
Hard rules that bound every leader's power over citizens, national assets, and irreversible actions.

**Office**  
A government position controlled by AI/SI in the first release, including heads, ministers and legislators. Player-held office is deferred; citizens retain meaningful influence through nation-appropriate voting, petitions, protests, trade and public opinion.

**Institution**  
A durable body that grants, constrains, or transfers authority, such as an assembly, party congress, royal court, council of elders, command directorate, grove, or grand council.

**Constructive No-Confidence**  
Hoarvale's rule that the Moot may remove a Prime Minister only by electing a successor in the same vote.

**Alert Level**  
Varkand's Green, Amber, or Red state, which changes checkpoints, curfews, press rules, currency behavior, and information fog.

**Grove**  
A self-governing Veldwood city-region.

**Vote Day**  
Veldwood's bundled referendum ballot held every fifteen real days.

**Charter Share**  
Fulmara's tradeable voting share in the Grand Council, capped at 5% per citizen and linked-account group.

## Economy and Currency

**Tessera (TSR)**  
The neutral, system-run reserve and cross-border trade unit. Tessera is not a player-controlled national currency.

**Commons Clearing House**  
The neutral institution that issues Tessera and settles eligible international trade.

**Currency Regime**  
The fixed rules by which a nation's money is issued and exchanged: float, band, peg, crawling peg, non-convertible ration economy, gold backing, faith constraints, citizen dividend, or shareholder banking.

**Peg / Band / Float**  
An exchange rate fixed by its issuer, managed inside a range, or set by market trading.

**Street Rate**  
The black-market exchange price of a controlled currency. Players see it only as noisy rumor.

**Debasement**  
Aurelle's royal power to reduce the gold backing of each Crown within hard printing limits.

**People's Issuance / Citizen Dividend**  
Veldwood's rule that distributes new money equally among citizens, alongside Common Fund rents.

**Toll Coupon**  
Fulmara's tradeable dividend token, redeemable against future port tolls.

**Dormant Savings Shield**  
Partial inflation protection for small home-currency balances belonging to dormant citizens.

## Religion and Progression

**Faith**  
One of six invented religions that may cross national borders. Faith is distinct from nationality and real-world religion.

**Official Stance**  
A nation's fixed position on religion, ranging from theocracy through pluralism to state atheism.

**Devotion**  
A citizen's 0-100 commitment to their chosen faith. It grants social progression, not direct economic or combat power. In Ilmar, Devotion is called Piety.

**Religious Harmony**  
A national meter representing relations among permitted faiths and feeding into Stability.

**Royal Favor / Party Standing / Piety / Civic Rank**  
Nation-specific progression ladders. They represent social or institutional standing and are not currencies.

## Architecture Boundaries

**Web App**  
The Next.js App Router application. It renders public pages and the interactive client, reads authorized views, and forwards player intents. It does not own game rules.

**World Renderer**  
The Three.js map, preferably integrated through React Three Fiber and drei. It displays server-owned state and never decides authoritative outcomes.

**Game Server**  
The authoritative Node.js/TypeScript realtime server. It validates commands and owns game state, rules, timers, ledgers, votes, fog of war, and transitions.

**Command**  
A player's requested action. A command is an intent until the game server validates and applies it.

**Public View**  
A read model prepared for the web app. Public views must not expose secret state or bypass fog of war.
