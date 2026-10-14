# News voice and style guide

Issue #110. One page per nation covering tone, sample lines and banned moves for every news surface: national news items, Morning brief headlines, weekly addresses and (when enabled) AI-generated articles. Source material is the culture bible (thachp/harimu-docs#3, `content/world/culture-bible.mdx`) and the moderation content policy (GDD §21, `content/systems/moderation-safety.mdx`). Live editions today: Kindle Press, Korund State Media and the Aurelle Court Gazette (`lib/national-news.ts`). Content for the other seven nations lives in `lib/news-editions.ts` (issue #108) and is not yet wired into the feed; outlet names marked **proposal** until those nations open.

## Provenance labels

Every news item carries exactly one provenance label. The label tells the reader who wrote the words and where the numbers came from.

| Label | `source` / `kind` in `NewsItem` | Who writes the words | Where numbers come from | Shown as |
|---|---|---|---|---|
| **System record** | `system` / `record` | Fixed code strings | The ledger, copied verbatim | "System record" |
| **Template** | `deterministic` / `template` or `decree` | Authored templates in nation voice (`korundTemplateHeadline`, `lib/news-templates.ts`) | The ledger row only; templates cannot add, round or invent figures | "Template" plus an in-text label such as "(State Media template · …)" |
| **AI-generated** | `model` / `article` | A model, behind fact check and moderation (`lib/ai-news.ts`, feature-flagged off) | Server-rendered ledger values only; prose claims must be supported by them | "AI-generated" badge on the byline (§11.10) |

Rules for all labels:
- Spin lives only in the words. Numbers always come from the ledger and are never edited.
- An item never claims a higher provenance than it has. A template must never look like a system record, and AI text must never be unlabeled.
- No item reveals private data: names, account identities, wallets, household balances, private chat or hidden leadership reasoning.

## Global rules (all nations)

Taken from the moderation content policy. These override every nation's voice.

- Satire targets power and invented governments, never peoples, ethnicities, faiths or real groups. Faiths are always shown with respect.
- Nothing real: no real-world politicians, parties, flags, slogans, events, religions or current affairs, and no praise of real regimes or atrocities.
- No hateful, dehumanizing or extremist content, no threats or harassment of players, no sexual content and no instructions for real-world harm.
- AI leaders and Notables are always identified as AI. News never implies a human holds office.
- No promises of rewards, resources or outcomes. News reports events; it doesn't grant anything.
- Korund underground faith stays low-key and abstract (§14.6): no raid scenes, and believers are never named.
- "Notable" means an AI character only. Kindle's civic rank is **Emberwarden**.

---

## Kindle Republic: *Kindle Press* (live)

- **Tone:** competitive, fast and plain. Headlines can pun, but every story shows its numbers. Roast-style humor aimed at the powerful.
- **Sample lines:** "Price boards hum: 15 trades cleared." · "Shifts settled, wages posted." · "New sparks in the Republic."
- **Banned:** implying the state favors any faith (strict separation); hiding a figure behind vague words; mocking voters rather than candidates.

## The Confluence: *The Current Daily* (proposal)

- **Tone:** calm, collective "we", water metaphors, target-focused.
- **Sample lines:** "Guidance Plan on course in the terraces." · "Many streams report a full harvest."
- **Banned:** open ridicule of the Four Pillars in citizen-voiced copy (criticism stays indirect); inventing ballot results the leadership "had to" follow.

## Meridian: *Steamgate Measure* (proposal; separate SEZ business wire)

- **Tone:** crisp and aspirational, with statistics and growth language. Two registers: onshore bulletin and SEZ wire.
- **Sample lines:** "Output rises by measure." · "Tsenga SEZ exchange boards close higher."
- **Banned:** reporting Standing Committee deliberations; describing foreign news that the Great Filter blocks; implying ballots move the leadership.

## Korund: *Korund State Media* (live)

- **Tone:** formal, heroic, collective. "The brigades report." Always optimistic.
- **Sample lines:** "Brigades deliver for the common store!" · "Brigades stand ready for the next plan period!"
- **Banned:** naming individuals in shortfall stories; any depiction of raids or believers (§14.6); figures that are not copied from the ledger.

## Aurelle: *Aurelle Court Gazette* (live)

- **Tone:** ornate, deferential, ranked. "Hear ye", "By order of the Crown", "by leave of the Crown".
- **Sample lines:** "By order of the Crown: subjects received." · "The royal store does brisk trade."
- **Banned:** publishing council deliberations; gossip presented as decree; implying a gazette entry grants a charter, fief, title or Favor.

## Ilmar Sanctum: *The Clear Record* (proposal)

- **Tone:** measured, fact-first, light-and-glass metaphors. A clouded statement is the worst insult.
- **Sample lines:** "The Vigil is kept in Mirrorhall." · "Endowment shares posted for the season."
- **Banned:** satire of the Lumen Canon (institutions only, gently); publishing on Stilldays; any deception, even in politics.

## Hoarvale: *The Rimehall Ledger* (proposal) plus a satirical weekly

- **Tone:** understated and wry. The government may be mocked freely.
- **Sample lines:** "Moot passes the budget, eventually." · "Coalition holds, steam rising."
- **Banned:** insulting the Sovereign (Crown Etiquette); bragging about Honors.

## Varkand: *Watchfast Signal* (proposal)

- **Tone:** terse and procedural. Every edition is headed by the Alert Level: relaxed at Green, clipped at Red.
- **Sample lines:** "ALERT GREEN · Passes rarely checked." · "ALERT AMBER · Curfew on public squares."
- **Banned:** glorifying military rule or combat; foreign news at Red; mocking the Directorate in citizen-voiced copy.

## Veldwood: *The Canopy* (canon public broadcaster)

- **Tone:** warm, deliberative, inclusive. Balanced airtime on Vote Days.
- **Sample lines:** "Every voice in the ring: initiative goes to referendum." · "Dividend Day notice posted."
- **Banned:** telling citizens how to vote; uneven airtime on Vote Days; boasting about wealth.

## Fulmara: *Arcport Exchange Bulletin* (proposal) plus a dockworkers' sheet

- **Tone:** quick, cosmopolitan, deal-making. Every outlet discloses which trading house owns it.
- **Sample lines:** "Share register moves at the Exchange Bell." · "Fair winds: convoy returns safe."
- **Banned:** investment advice; hiding ownership; implying shares can be bought with real money.
