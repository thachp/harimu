/** #1009: Kindle Assembly and presidential ballots render as a civic form only when NEXT_PUBLIC_HARIMU_KINDLE_CIVIC_BALLOT is exactly "true". */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { expandFlagPacks, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { nationThemes } from '../lib/nation-themes.ts';
import { componentModule } from './helpers/component-module.mjs';

const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
const key = 'NEXT_PUBLIC_HARIMU_KINDLE_CIVIC_BALLOT';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const withFlag = (value, run) => {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
  try { return run(); } finally { if (prev === undefined) delete process.env[key]; else process.env[key] = prev; }
};
const { AssemblyPanel } = await import(await componentModule(fileURLToPath(new URL('../app/assembly-ballot.tsx', import.meta.url))));
const parties = [{ id: 'steady-hand', name: 'Steady Hand Party', ideology: 'Work first.' }, { id: 'open-ledger', name: 'Open Ledger Party', ideology: 'Open markets.' }, { id: 'dockside-builders', name: 'Dockside Builders', ideology: 'Build in public.' }];
const assembly = () => ({ enabled: true, nationId: 'kindle', id: 'kindle-assembly-account-poc-1', scope: 'preview-citizen', status: 'open', opensAt: 1, closesAt: 2000000000, seats: { perDistrict: 6, up: 3 }, districts: [], parties, yourDistrict: { id: 'forgehaven', name: 'Forgehaven' }, voted: false, privacyReady: true, privacyReason: '', result: null, headlines: [] });
const assemblyHtml = (selected = '') => renderToStaticMarkup(React.createElement(AssemblyPanel, { snapshot: assembly(), selected, onSelect() {}, onVote() {}, reason: null }));

const compile = async file => ts.transpileModule(await readFile(new URL(`../app/${file}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const civic = {}; new Function('exports', 'require', await compile('kindle-civic-ballot.tsx'))(civic, require);
const rankedSource = await compile('ranked-ballot.tsx');
const candidates = [{ id: 'ines-varro', name: 'Ines Varro', platform: 'Full employment and cautious trade.' }, { id: 'tobin-achterberg', name: 'Tobin Achterberg', platform: 'Lower levies and open markets.' }, { id: 'mara-quell', name: 'Mara Quell', platform: 'Public housing and dock building.' }];
const ids = candidates.map(candidate => candidate.id);
const rankedSnapshot = () => ({ nationId: 'kindle', id: 'kindle-presidential-poc-1', candidates, status: 'open', opensAt: 1760000000, closesAt: 1760259200, voted: false, result: null, privacyReady: true, privacyReason: '', verification: { countedActionsEligible: true, reason: 'Verified fixture human.' } });
function rankedHarness(data) {
  let cursor = 0, refCursor = 0; const states = [data, ['', '', ''], '', false, false, false], refs = [], requests = [];
  const react = { useCallback: fn => fn, useEffect() {}, useRef(initial) { const i = refCursor++; return refs[i] ?? (refs[i] = { current: initial }); }, useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => states[i] = typeof value === 'function' ? value(states[i]) : value]; } };
  const exports = {}; new Function('exports', 'require', 'fetch', rankedSource)(exports, name => name === 'react' ? react : name === './nation-document' ? { NationDocument: ({ children, className }) => React.createElement('section', { className }, children) } : name === './ai-disclosure' ? { AiBadge: () => null } : name === './game-timer' ? { GameTimer: () => null } : name === './action-button' ? { ActionButton: ({ children, reason }) => React.createElement('button', { type: 'submit', disabled: Boolean(reason) }, children) } : name === './kindle-civic-ballot' ? civic : name === '../lib/instant-runoff' ? require('../lib/instant-runoff.ts') : name === '../lib/election-ids' ? require('../lib/election-ids.ts') : require(name), async () => ({ ok: true, status: 200, json: async () => ({ ...data, voted: true }) }));
  const render = () => { cursor = 0; refCursor = 0; return exports.RankedBallot({}); };
  const all = node => [node, ...[node?.props?.children].flat(Infinity).filter(Boolean).flatMap(child => typeof child === 'object' ? all(child) : [child])];
  return { render, all, requests, states };
}

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK, preview on and production off', async () => {
  assert.equal(civic.kindleCivicBallotEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(civic.kindleCivicBallotEnabled(value), false);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), /NEXT_PUBLIC_HARIMU_KINDLE_CIVIC_BALLOT/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), /NEXT_PUBLIC_HARIMU_KINDLE_CIVIC_BALLOT/);
  assert.match(await read('scripts/hud-layout-check.mjs'), /checkKindleCivicBallot/);
});

test('civic styles use Kindle nation tokens and do not animate', async () => {
  const css = await read('app/globals.css');
  const block = css.slice(css.indexOf('/* #1009'), css.indexOf('/* Korund quota'));
  assert.ok(block.includes('kindle-civic-choice') && block.includes('--nation-accent') && block.includes('--nation-paper') && block.includes('--nation-ink') && block.includes('--nation-edge'));
  assert.match(block, /min-height:\s*44px/); assert.match(block, /width:\s*44px/);
  assert.doesNotMatch(block, /\b(animation|transition)\s*:/);
  assert.equal(nationThemes.kindle.document, 'Civic form');
  assert.equal(nationThemes.kindle.paper, '#f1eddc'); assert.equal(nationThemes.kindle.ink, '#18343e');
});

test('flag off keeps the Assembly radios and the presidential selects', () => {
  const assemblyOff = withFlag('false', () => assemblyHtml());
  assert.match(assemblyOff, /<legend>Pick one party list<\/legend>/);
  assert.equal((assemblyOff.match(/type="radio"/g) ?? []).length, 3);
  assert.match(assemblyOff, />Cast ballot</); assert.doesNotMatch(assemblyOff, /kindle-civic-ballot|Review and cast/);
  assert.equal(withFlag(undefined, () => assemblyHtml()).includes('kindle-civic-ballot'), false);
  const rankedOff = withFlag('false', () => renderToStaticMarkup(rankedHarness(rankedSnapshot()).render()));
  assert.equal((rankedOff.match(/<select/g) ?? []).length, 3);
  assert.match(rankedOff, /1 · first preference/); assert.match(rankedOff, />Submit ranked ballot</);
  assert.doesNotMatch(rankedOff, /kindle-civic|type="radio"|Review and cast/);
});

test('flag on is a numbered civic form with the same copy, choices and submit control', async () => {
  const html = withFlag('true', () => assemblyHtml('steady-hand'));
  assert.match(html, /class="kindle-civic-ballot"/); assert.match(html, /<legend><span class="kindle-civic-num">1<\/span> Pick one party list<\/legend>/);
  assert.equal((html.match(/type="radio"/g) ?? []).length, 3); assert.match(html, /name="assembly-party"/);
  assert.match(html, /Steady Hand Party/); assert.match(html, /Open Ledger Party/); assert.match(html, /Dockside Builders/);
  assert.match(html, /Your district: Forgehaven/); assert.match(html, /Review and cast/); assert.match(html, /class="kindle-civic-summary">Steady Hand Party/);
  assert.match(html, />Cast ballot</); assert.doesNotMatch(html, /<select/);
  const open = withFlag('true', () => assemblyHtml(''));
  assert.match(open, /kindle-civic-summary">Pick one party list\./); assert.match(open, /disabled/);
  const ranked = rankedHarness(rankedSnapshot());
  const markup = withFlag('true', () => renderToStaticMarkup(ranked.render()));
  assert.equal((markup.match(/<fieldset/g) ?? []).length, 3);
  assert.match(markup, /<legend><span class="kindle-civic-num">1<\/span> · first preference<\/legend>/);
  assert.match(markup, /<legend><span class="kindle-civic-num">2<\/span> · second preference<\/legend>/);
  assert.match(markup, /<legend><span class="kindle-civic-num">3<\/span> · third preference<\/legend>/);
  assert.equal((markup.match(/type="radio"/g) ?? []).length, 9); assert.doesNotMatch(markup, /<select/);
  assert.match(markup, /Review and cast/); assert.match(markup, /1\. Choose candidate · 2\. Choose candidate · 3\. Choose candidate/);
  assert.match(markup, /Rank all three candidates, once each/); assert.match(markup, />Submit ranked ballot</);
  const choice = withFlag('true', () => ranked.all(ranked.render()).find(node => node?.type === civic.KindleCivicChoice && node.props.value === ids[0]));
  choice.props.onChange(); assert.deepEqual(ranked.states[1], [ids[0], '', '']);
  withFlag('true', () => ranked.all(ranked.render()).find(node => node?.type === 'form').props.onSubmit({ preventDefault() {} }));
  await new Promise(setImmediate); assert.equal(ranked.requests.length, 0, 'an incomplete ranking still does not submit');
});
