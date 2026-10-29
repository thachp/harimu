/** #283: the Assembly panel renders the Content #299 ballot copy, a party-list picker, and the published count of human votes only (#449). */
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
const copy = await rt.importModule('lib/assembly-copy.ts'), rules = await rt.importModule('lib/assembly-rules.ts'), parties = (await rt.importModule('lib/kindle-parties.ts')).kindleParties;
const compile = async file => ts.transpileModule(await readFile(new URL(`../app/${file}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const load = async (file, shims) => { const exports = {}; new Function('exports', 'require', await compile(file))(exports, name => shims[name] ?? require(name)); return exports; };
const actions = await load('action-button.tsx', {}), tags = await load('ai-disclosure.tsx', {});
const civic = await load('kindle-civic-ballot.tsx', {});
const panel = (await load('assembly-ballot.tsx', {
  '../lib/assembly-copy': copy, './action-button': actions, './ai-disclosure': tags, './game-timer': { GameTimer: ({ label }) => React.createElement('span', null, label) },
  './session-retry': await load('session-retry.tsx', {}), './nation-document': { NationDocument: ({ label, children }) => React.createElement('section', { 'aria-label': label }, children) },
  './kindle-civic-ballot': civic,
})).AssemblyPanel;
const base = () => ({ enabled: true, nationId: 'kindle', id: 'kindle-assembly-account-poc-1', scope: 'preview-citizen', status: 'open', opensAt: 1, closesAt: 2000000000, seats: { perDistrict: 6, up: 3 },
  districts: [], parties: parties.map(p => ({ id: p.id, name: p.name, ideology: p.ideology, color: p.color, blurb: p.blurb, ai: true })), yourDistrict: { id: 'forgehaven', name: 'Forgehaven' }, voted: false, privacyReady: true, privacyReason: '', result: null, headlines: [] });
const html = props => renderToStaticMarkup(React.createElement(panel, { selected: '', onSelect() {}, onVote() {}, reason: null, ...props }));

test('open ballot: explainer copy, AI note, one radio per party list, your district', () => {
  const out = html({ snapshot: base() });
  for (const line of copy.ballotExplainer.lines) assert.ok(out.includes(line.text.replace(/'/g, '&#x27;')), line.text);
  assert.ok(out.includes(copy.ballotExplainer.aiNote.text)); assert.equal((out.match(/type="radio"/g) ?? []).length, 3);
  assert.ok(out.includes('Your district: Forgehaven')); assert.ok(out.includes('Voting closes')); assert.doesNotMatch(out, /Human votes/, 'no counts while voting is open');
});

test('voted: badge shown and no ballot form', () => {
  const out = html({ snapshot: { ...base(), voted: true } }); assert.ok(out.includes('I Voted')); assert.equal(out.includes('type="radio"'), false);
});

test('closed: per-district count of human votes only (no AI bloc column), and the wire headlines', () => {
  const result = rules.assemblyResult({ forgehaven: { 'steady-hand': 3, 'open-ledger': 1, 'dockside-builders': 2 } });
  const out = html({ snapshot: { ...base(), status: 'closed', result, headlines: rules.assemblyHeadlines(result) } });
  assert.ok(out.includes('<th>Human votes</th><th>Seats won</th>')); assert.equal(out.includes('AI bloc'), false); assert.ok(out.includes(copy.resultsCaption.humanVotesOnly.text)); assert.ok(out.includes('Kindle Press'));
  assert.ok(out.includes('<td>Steady Hand Party</td><td>3</td><td>2</td><td>3</td>'), 'S: 3 human, 2 won, 3 seats now');
  assert.ok(out.includes('No ballots were cast here'), 'uncontested districts say so'); assert.equal(out.includes('Cast ballot'), false);
});

test('privacy gate closed: the reason is shown beside a disabled Cast ballot', () => {
  const out = html({ snapshot: base(), selected: 'steady-hand', reason: 'Ballot privacy has not completed review, so counted voting remains unavailable.' });
  assert.ok(out.includes('Ballot privacy has not completed review')); assert.match(out, /<button[^>]*disabled/);
});
