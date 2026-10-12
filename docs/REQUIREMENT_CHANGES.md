# Harimu requirements after GDD v0.6

## October 12, 2026: AI/SI government for the first release

Patrick confirmed that **all government roles** in the first release are
controlled by AI/SI, including heads, ministers and legislators. Player-held
office is deferred to a later expansion. This supersedes conflicting
player-office language in GDD v0.6. The original PDF is preserved.

Players retain meaningful nation-appropriate influence through voting,
petitions, protests, trade and public opinion. Preserve regime distinctions:
voting may select or influence AI leaders where national laws permit it; there
are no universal elections or cosmetic replacement polls. Government agents
must obey nation laws, bounded budgets, eligibility and information rules, and
explain major decisions in understandable language.

Before implementing politics, define how elections, succession, coups and
removal select or replace AI/SI officeholders under each national constitution.
Define meaningful citizen influence, Charter Limits, agent authority,
information boundaries, oversight and failure/replacement protocols. Do not
implement first-release player eligibility for government offices.

Affected references: GAME_DESIGN.md high concept, civic power, national
transitions and MVP political systems; CONTEXT.md Office, institutions,
succession and AI Caretakers terminology. This override controls implementation.
Existing code presents fixed government metadata and national agendas; it does
not yet implement officeholding, succession, or an AI/SI government runtime.
The Nation navigation is labeled Institutions, without promising player office.
Citizen work, market ownership and food flows proceed independently.

Government simulation is the next separate milestone after market validation.
Use deterministic, rule-bound foundations where sufficient and label them as
simulations; do not claim model-driven AI exists before it is integrated.
No new AI services, API credentials or paid infrastructure are authorized.
