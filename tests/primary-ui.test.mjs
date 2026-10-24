/** #307: the members-only primary card renders the Content #300 copy, party join/leave, a ranking per own hopeful, and the published count. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test, after } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';
const require = createRequire(import.meta.url);
const rt = await localRuntime(); after(() => rt.close());
const copy = await rt.importModule('lib/campaign-copy.ts'), rules = await rt.importModule('lib/primaries-rules.ts'), parties = (await rt.importModule('lib/kindle-parties.ts')).kindleParties;
const compile = async file => ts.transpileModule(await readFile(new URL(`../app/${file}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const load = async (file, shims) => { const exports = {}; new Function('exports', 'require', await compile(file))(exports, name => shims[name] ?? require(name)); return exports; };
const actions = await load('action-button.tsx', {}), tags = await load('ai-disclosure.tsx', {});
const panel = (await load('primary-card.tsx', {
  '../lib/campaign-copy': copy, './action-button': actions, './ai-disclosure': tags, './game-timer': { GameTimer: ({ label }) => React.createElement('span', null, label) },
  './session-retry': await load('session-retry.tsx', {}), './nation-document': { NationDocument: ({ label, children }) => React.createElement('section', { 'aria-label': label }, children) },
})).PrimaryPanel;
const base = () => ({ enabled: true, nationId: 'kindle', id: 'kindle-primary-account-poc-1', scope: 'preview-citizen', status: 'open', opensAt: 1, closesAt: 2000000000,
  parties: parties.map(p => ({ id: p.id, name: p.name, ideology: p.ideology, color: p.color, members: 2 })), hopefuls: rules.hopefuls.map(h => ({ id: h.id, partyId: h.partyId, name: h.name, platform: h.platform, ai: true })),
  yourParty: null, canChangeParty: true, voted: false, privacyReady: true, privacyReason: '', result: null, announcements: [] });
const html = props => renderToStaticMarkup(React.createElement(panel, { ranking: [], onRank() {}, onJoin() {}, onLeave() {}, onVote() {}, reason: null, ...props }));

test('a non-member sees the explainer and Join buttons, and no ballot', () => {
  const out = html({ snapshot: base() });
  assert.ok(out.includes(copy.primariesCopy.title)); assert.ok(out.includes('AI citizens do not vote in primaries.'));
  for (const p of parties) assert.ok(out.includes(`Join ${p.name}`)); assert.ok(out.includes('Join a party to vote in its primary.')); assert.equal(out.includes('Cast primary ballot'), false);
});

test('a member ranks only their own party\'s three hopefuls and can leave', () => {
  const out = html({ snapshot: { ...base(), yourParty: 'open-ledger' } });
  assert.equal((out.match(/<select/g) ?? []).length, 3); assert.ok(out.includes('Tobin Achterberg') && out.includes('Dessa Ironwood') && out.includes('Marek Voss'));
  assert.equal(out.includes('Ines Varro'), false, 'no other party\'s hopeful on the ballot'); assert.ok(out.includes('Leave Open Ledger Party')); assert.ok(out.includes('Switch to Steady Hand Party'));
});

test('membership is frozen while the primary is open, with the reason shown; a voted member sees the badge only', () => {
  const frozen = html({ snapshot: { ...base(), canChangeParty: false, yourParty: 'steady-hand' } }); assert.ok(frozen.includes('Party membership is frozen')); assert.match(frozen, /<button[^>]*disabled/);
  const voted = html({ snapshot: { ...base(), yourParty: 'steady-hand', voted: true } }); assert.ok(voted.includes('I Voted')); assert.equal(voted.includes('<select'), false);
});

test('closed: per-party turnout among members, the rounds, and the nominee announcements', () => {
  const [ines, corin, yelena] = rules.hopefulsOf('steady-hand').map(h => h.id);
  const result = rules.primaryResult({ 'steady-hand': { groups: [{ ranking: [ines, yelena, corin], count: 4 }, { ranking: [corin, yelena, ines], count: 3 }, { ranking: [yelena, corin, ines], count: 3 }], members: 12 } });
  const out = html({ snapshot: { ...base(), status: 'closed', result, announcements: rules.nomineeAnnouncements(result) } });
  assert.ok(out.includes('10 of 12 members voted. Nominee: Yelena Brask.')); assert.ok(out.includes('Round 1: Ines Varro 4, Corin Halloway 3, Yelena Brask 3 · Corin Halloway out'));
  assert.ok(out.includes('No ballots were cast, so Tobin Achterberg stays the nominee.')); assert.ok(out.includes('Yelena Brask is the') || out.includes('chosen Yelena Brask') || out.includes('Yelena Brask will carry') || out.includes('Yelena Brask as the'));
});
