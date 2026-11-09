/** #1152: Meridian's government panel shows the next Party Congress (shared UTC timestamp plus a spoken remainder),
 *  the 7-seat Standing Committee, and the 2/3 term-limit note. NEXT_PUBLIC_HARIMU_MERIDIAN_PARTY_CONGRESS
 *  must be exactly "true". No partyState, or any nation but Meridian: nothing renders. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { displayTimestamp } from '../lib/display-preferences.ts';
import { simulateGovernment, withMeridianPartyState } from '../lib/government.ts';
import { nationCrest } from '../lib/nation-crests.ts';
import { nationMark } from '../lib/nation-themes.ts';
import { componentModule } from './helpers/component-module.mjs';

const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const key = 'NEXT_PUBLIC_HARIMU_MERIDIAN_PARTY_CONGRESS';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const withFlag = (value, run) => {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
  try { return run(); } finally { if (prev === undefined) delete process.env[key]; else process.env[key] = prev; }
};
const { GovernmentPanel } = await import(await componentModule(fileURLToPath(new URL('../app/government-panel.tsx', import.meta.url))));
const congress = await import(await componentModule(fileURLToPath(new URL('../app/meridian-party-congress.tsx', import.meta.url))));
const { meridianPartyCongressEnabled, congressRelative, congressWhenName, MeridianPartyCongress } = congress;
const noop = () => {};
const civic = (nationId, flag, snapshot = null) => withFlag(flag, () => renderToStaticMarkup(React.createElement(GovernmentPanel, {
  snapshot, nationId, localDemo: true, pending: false, error: null, verification: null, onPetition: noop,
})));
const view = (partyState, ...rest) => {
  const flag = rest.length ? rest[0] : 'true';
  const nowMs = rest.length > 1 && rest[1] != null ? rest[1] : 0;
  const nationId = rest.length > 2 && rest[2] != null ? rest[2] : 'meridian';
  return withFlag(flag, () => renderToStaticMarkup(React.createElement(MeridianPartyCongress, { nationId, partyState, nowMs })));
};
const kindle = () => simulateGovernment({ nationId: 'kindle', availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} });
const party = (nowMs, extra = {}) => ({ ...withMeridianPartyState({ ...kindle(), nationId: 'meridian' }, nowMs, true).partyState, ...extra });
const blockOf = html => { const start = html.indexOf('class="meridian-congress"'); return start < 0 ? '' : html.slice(start, html.indexOf('</section>', start)); };
const lum = hex => { const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722; };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK, preview on and production off', async () => {
  assert.equal(meridianPartyCongressEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(meridianPartyCongressEnabled(value), false);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key));
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 34);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), /NEXT_PUBLIC_HARIMU_MERIDIAN_PARTY_CONGRESS/);
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), /NEXT_PUBLIC_HARIMU_MERIDIAN_PARTY_CONGRESS/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 34/);
  assert.match(await read('app/meridian-party-congress.tsx'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_MERIDIAN_PARTY_CONGRESS/);
  assert.match(await read('app/meridian-party-congress.tsx'), /useDisplayTimestamp\(\)/);
  assert.match(await read('app/meridian-party-congress.tsx'), /<time className="meridian-congress-date" dateTime=\{dated\.dateTime\}>/);
  assert.match(await read('app/government-panel.tsx'), /MeridianPartyCongress nationId=\{snapshot\.nationId\} partyState=\{snapshot\.partyState\}/);
  assert.doesNotMatch(await read('app/meridian-party-congress.tsx'), /HARIMU_MERIDIAN_PARTY_SCHEDULE_ENABLED|role="status"|<button/);
});

test('styles use the Meridian crest, scaled type, wrap, and no motion', async () => {
  const css = await read('app/globals.css');
  const block = css.slice(css.indexOf('/* #1152'));
  assert.match(block, /flex-wrap:wrap/); assert.match(block, /min-width:0/); assert.match(block, /overflow-wrap:anywhere/); assert.match(block, /max-width:100%/);
  assert.match(block, /font-size:calc\(17px \* var\(--text-scale, 1\)\)/);
  assert.match(block, /font-size:calc\(15px \* var\(--text-scale, 1\)\)/);
  assert.match(block, /font-size:calc\(18px \* var\(--text-scale, 1\)\)/);
  assert.match(block, /\.meridian-congress-date,\.meridian-congress-relative\{min-width:0;color:var\(--md-field\)/);
  assert.doesNotMatch(block, /font-size:\s*\d+(\.\d+)?px/);
  assert.doesNotMatch(block, /@keyframes|\b(?:animation|transition)\s*:/);
  assert.doesNotMatch(block, /outline:\s*none/);
  const crest = nationCrest('meridian'), mark = nationMark('meridian');
  assert.equal(crest.field, '#8c3d22'); assert.equal(crest.mark, '#f6ead3'); assert.equal(crest.accent, '#d8d4cc');
  assert.equal(mark.pattern, 'crosshatch'); assert.equal(mark.symbol, '▲');
  assert.ok(contrast('#8c3d22', '#f6ead3') >= 4.5, 'ink on the party paper');
  assert.ok(contrast('#f6ead3', '#8c3d22') >= 4.5, 'mark on the red-copper field');
});

test('spoken remainder uses words, and a past or broken clock says nothing', () => {
  const at = 1_700_000_000_000;
  assert.equal(congressRelative(at, at - 2 * 86_400_000), 'in 2 days');
  assert.equal(congressRelative(at, at - 86_400_000), 'in 1 day');
  assert.equal(congressRelative(at, at - (2 * 86_400_000 + 3 * 3_600_000)), 'in 2 days 3 hours');
  assert.equal(congressRelative(at, at - (86_400_000 + 3_600_000)), 'in 1 day 1 hour');
  assert.equal(congressRelative(at, at - 2 * 3_600_000), 'in 2 hours');
  assert.equal(congressRelative(at, at - (3_600_000 + 5 * 60_000)), 'in 1 hour 5 minutes');
  assert.equal(congressRelative(at, at - 60_000), 'in 1 minute');
  assert.equal(congressRelative(at, at - 30_000), 'in under 1 minute');
  for (const now of [at, at + 1, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(congressRelative(at, now), null);
  assert.equal(congressRelative(-1, 0), null);
  assert.equal(congressRelative(1.5, 0), null);
});

test('flag off, a missing partyState, and other nations render nothing', () => {
  const state = party(1_700_000_000_000);
  assert.equal(view(state, 'false'), '');
  assert.equal(view(state, undefined), '');
  assert.equal(view(null), '');
  assert.equal(view(undefined), '');
  assert.equal(view({}), '');
  assert.equal(view(state, 'true', 0, 'kindle'), '');
  const off = civic('meridian', 'false', { ...kindle(), nationId: 'meridian', partyState: state });
  assert.doesNotMatch(off, /meridian-congress|Next Party Congress|Standing Committee|Term limits can be suspended/);
  assert.match(off, /Preview priority for/);
  const absent = civic('meridian', 'true', { ...kindle(), nationId: 'meridian' });
  assert.doesNotMatch(absent, /meridian-congress|Next Party Congress|7-seat Standing Committee/);
  const other = civic('kindle', 'true', { ...kindle(), partyState: state });
  assert.doesNotMatch(other, /meridian-congress|Next Party Congress/);
  assert.match(other, /Food security reserve/);
  assert.doesNotMatch(civic('meridian', 'true', null), /meridian-congress|Next Party Congress/);
});

test('flag on shows the congress date, the 7-seat committee, and the 2/3 note, and leaves petition focus intact', () => {
  const now = 1_700_000_000_000;
  const state = party(now);
  const at = state.nextCongressAt;
  assert.equal(typeof at, 'number');
  assert.ok(at > now);
  const html = view(state, 'true', now);
  const label = displayTimestamp(at);
  const relative = congressRelative(at, now);
  assert.ok(relative);
  const sealed = blockOf(html);
  assert.match(sealed, /aria-label="Party Congress"/);
  assert.match(sealed, /data-nation-pattern="crosshatch"/);
  assert.match(sealed, /aria-hidden="true"/);
  assert.match(sealed, new RegExp(`aria-label="${escapeRegExp(congressWhenName(label, relative))}"`));
  assert.match(sealed, new RegExp(`<time class="meridian-congress-date" dateTime="${new Date(at).toISOString()}">${escapeRegExp(label)}</time>`));
  assert.match(sealed, new RegExp(`class="meridian-congress-relative">${escapeRegExp(relative)}</`));
  assert.match(sealed, /7-seat Standing Committee/);
  assert.match(sealed, /Term limits can be suspended by a 2\/3 Congress vote\./);
  assert.doesNotMatch(sealed, /<button|tabindex|role="status"/);
  const clock = Date.now();
  const live = party(clock);
  const page = civic('meridian', 'true', { ...kindle(), nationId: 'meridian', partyState: live });
  const panel = blockOf(page);
  const liveLabel = displayTimestamp(live.nextCongressAt);
  assert.match(panel, new RegExp(`<time class="meridian-congress-date" dateTime="${new Date(live.nextCongressAt).toISOString()}">${escapeRegExp(liveLabel)}</time>`));
  assert.match(panel, /class="meridian-congress-relative">in (?:\d+ days?(?: \d+ hours?)?|\d+ hours?(?: \d+ minutes?)?|\d+ minutes?|under 1 minute)</);
  assert.match(panel, /7-seat Standing Committee/);
  assert.match(panel, /Term limits can be suspended by a 2\/3 Congress vote\./);
  assert.equal((page.match(/<button\b/g) ?? []).length, 3);
  assert.doesNotMatch(page, /tabindex="-1"/);
  assert.match(page, /Preview priority for food/);
  assert.doesNotMatch(panel, /<button/);
});

test('a missing or unusable date stays off the row, and the note uses the read rather than a fixed 2/3', () => {
  const now = 1_700_000_000_000;
  const base = party(now);
  const past = view({ ...base, nextCongressAt: now - 86_400_000 }, 'true', now);
  const pastBlock = blockOf(past);
  assert.match(pastBlock, /<time class="meridian-congress-date"/);
  assert.doesNotMatch(pastBlock, /meridian-congress-relative|in \d|under 1 minute/);
  assert.match(pastBlock, new RegExp(`aria-label="${escapeRegExp(congressWhenName(displayTimestamp(now - 86_400_000), null))}"`));
  for (const nextCongressAt of [null, undefined, Number.NaN, -1, 1.5]) {
    const html = view({ ...base, nextCongressAt }, 'true', now);
    assert.doesNotMatch(blockOf(html), /<time\b|dateTime=|Time unavailable|meridian-congress-relative/);
    assert.match(html, /7-seat Standing Committee/);
    assert.match(html, /Term limits can be suspended by a 2\/3 Congress vote\./);
  }
  const wider = view({ ...base, standingCommitteeSeats: 8, suspendSupermajority: '3/4' }, 'true', now);
  assert.match(wider, /8-seat Standing Committee/);
  assert.match(wider, /Term limits can be suspended by a 3\/4 Congress vote\./);
  assert.doesNotMatch(wider, /7-seat|2\/3/);
  const held = view({ standingCommitteeSeats: 7, nextCongressAt: base.nextCongressAt, termLimitsSuspendable: false, suspendSupermajority: '2/3' }, 'true', now);
  assert.match(held, /7-seat Standing Committee/);
  assert.match(held, /<time\b/);
  assert.doesNotMatch(held, /Term limits can be suspended/);
  assert.equal(view({ termLimitsSuspendable: true, suspendSupermajority: '  ' }, 'true', now), '');
});
