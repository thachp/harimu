/** #280: faith card and picker (#67), congregation panel (#286) and holiday banner (#304), rendered from real API states.
 *  The fixtures used by the layout check are compared with the live routes so they cannot drift. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { localRuntime } from './helpers/local-runtime.mjs';
import { loadApp } from './helpers/component-module.mjs';
import { faithState, congregationState } from '../scripts/faith-ui-fixtures.mjs';
import { faithCopy, korundFaithCopy, unaffiliatedCopy } from '../lib/faith-copy.ts';
import { worshipCopy } from '../lib/worship-copy.ts';

const { FaithPanel, HolidayBanner } = await loadApp('faith-panel');
const noop = () => {};
const api = (faith, congregations = null, extra = {}) => ({ faith, congregations, busy: false, message: '', error: '', chooseFaith: noop, attendWorship: noop, joinFestival: noop, congregation: noop, ...extra });
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, ' ');
const daySec = 7200, year = 360;
async function runtime(t) { const r = await localRuntime(); t.after(() => r.close()); r.setFaith(true); return r; }
async function citizen(r, id, nation) {
  const at = new Date(r.now).toISOString();
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)").bind(id, nation, id, at, at).run();
}
const keys = o => Object.keys(o).sort();

test('flag off or no state: the faith card and banner render nothing', () => {
  assert.equal(renderToStaticMarkup(React.createElement(FaithPanel, { api: api(null) })), '');
  assert.equal(renderToStaticMarkup(React.createElement(HolidayBanner, { faith: null, busy: false, onJoin: noop })), '');
  assert.equal(renderToStaticMarkup(React.createElement(HolidayBanner, { faith: faithState(), busy: false, onJoin: noop })), '', 'no holiday and no festival: no banner');
});

test('layout fixtures have the same shape as the live /api/faith and /api/congregations responses', async t => {
  const r = await runtime(t);
  await citizen(r, 'ava', 'aurelle'); await citizen(r, 'kai', 'korund');
  // Aurelle on Oath Day: a public holiday with a joinable banner.
  const today = Math.floor(r.now / 1000 / daySec); const y = Math.floor(today / year); let day = y * year + 90; if (day <= today) day += year;
  r.setNow((day * daySec + 60) * 1000);
  const live = (await r.call('faith', 'ava')).data;
  const fx = faithState({ nation: 'aurelle', holiday: true });
  assert.deepEqual(keys(fx), keys(live));
  assert.deepEqual(keys(fx.festivals[0]), keys(live.festivals[0]));
  assert.deepEqual(keys(fx.holiday), keys(live.holiday));
  assert.deepEqual(keys(fx.faith), keys(live.faith)); assert.deepEqual(keys(fx.devotion), keys(live.devotion)); assert.deepEqual(keys(fx.worship), keys(live.worship));
  assert.deepEqual(keys(fx.devotion.tier), keys(live.devotion.tier)); assert.deepEqual(fx.options.public.map(o => o.id), live.options.public.map(o => o.id));
  assert.equal(live.leaveCost, fx.leaveCost); assert.equal(live.royalFavor, 0); assert.equal(live.leaveBlockedReason, faithState({ nation: 'aurelle', royalFavor: 0 }).leaveBlockedReason, 'fixture wording matches the server');
  assert.equal(live.holiday.name, fx.holiday.name); assert.equal(live.holiday.line, fx.holiday.line);
  const kor = (await r.call('faith', 'kai')).data, kfx = faithState({ nation: 'korund' });
  assert.deepEqual(keys(kfx), keys(kor)); assert.deepEqual(kfx.options.public.map(o => o.id), kor.options.public.map(o => o.id)); assert.equal(kor.worship, null);
  const cong = (await r.call('congregations', 'ava')).data, cfx = congregationState({ nation: 'aurelle', faith: 'kinward-rite' });
  assert.deepEqual(keys(cfx), keys(cong)); assert.deepEqual(keys(cfx.you), keys(cong.you)); assert.deepEqual(keys(cfx.congregations[0]), keys(cong.congregations[0]));
  assert.equal(cfx.congregations.length, cong.congregations.length);
  // The live panel renders too, joined or not.
  assert.equal((await r.call('faith', 'ava', { action: 'choose-faith', faithId: 'kinward-rite', requestId: randomUUID() })).status, 200);
  const html = renderToStaticMarkup(React.createElement(FaithPanel, { api: api((await r.call('faith', 'ava')).data, (await r.call('congregations', 'ava')).data) }));
  assert.match(text(html), /Join congregation/);
});

test('faith card shows the chosen faith from the content files, Devotion as a labelled meter, and social-standing-only wording', () => {
  const s = faithState({ faith: 'fair-wind-vow', devotion: 34 });
  const html = renderToStaticMarkup(React.createElement(FaithPanel, { api: api(s) })), t = text(html);
  assert.match(html, /<h2[^>]*>Faith and Devotion<\/h2>/);
  assert.ok(t.includes(faithCopy['fair-wind-vow'].description)); assert.ok(t.includes(faithCopy['fair-wind-vow'].tagline));
  assert.match(html, /role="meter"[^>]*aria-valuemin="0"[^>]*aria-valuemax="100"[^>]*aria-valuenow="34"/);
  assert.ok(t.includes(s.devotion.tier.label) && t.includes(s.devotion.tier.line));
  assert.match(t, /Devotion gives social standing only\. It never changes wages, production, prices or combat\./);
  assert.ok(t.includes(worshipCopy['fair-wind-vow'].label));
  for (const line of worshipCopy['fair-wind-vow'].body) assert.ok(t.includes(line.replace(/&#x27;/g, "'")));
});

test('picker: radios in a fieldset with a legend, first-choice-free note, every public option, a Confirm button that explains why it is disabled', () => {
  const s = faithState({ nation: 'kindle', faith: 'fair-wind-vow' });
  const html = renderToStaticMarkup(React.createElement(FaithPanel, { api: api(s) })), t = text(html);
  assert.match(html, /<fieldset[^>]*class="faith-picker"/); assert.match(html, /<legend>Choose your faith<\/legend>/);
  assert.equal((html.match(/type="radio"/g) ?? []).length, 4); // three faiths and Unaffiliated
  assert.ok(t.includes(unaffiliatedCopy.description));
  for (const id of ['kinward-rite', 'fair-wind-vow', 'open-hand']) assert.ok(t.includes(faithCopy[id].name));
  assert.match(t, /Your first choice is free\. After that you can change faith once every 60 real days\./);
  assert.match(html, /<button[^>]*disabled=""[^>]*aria-describedby="[^"]+"[^>]*>Confirm faith/);
  assert.match(t, /Pick a different faith to change\./);
  assert.doesNotMatch(html, /<fieldset[^>]*disabled/, 'open when there is no cooldown');
});

test('cooldown locks the picker with the server reason and the unlock date; never blocks worship', () => {
  const s = faithState({ locked: true });
  const html = renderToStaticMarkup(React.createElement(FaithPanel, { api: api(s) })), t = text(html);
  assert.match(html, /<fieldset[^>]*disabled=""/);
  assert.ok(t.includes(s.changeBlockedReason)); assert.match(t, /Faith is locked until \d{4}-\d{2}-\d{2}\./);
  assert.match(html, /<button[^>]*>Make Your Vow<\/button>/); assert.doesNotMatch(html, /<button[^>]*disabled=""[^>]*>Make Your Vow/);
});

test('Korund: only the Unaffiliated public line, no picker, no congregation block, no worship button', () => {
  const s = faithState({ nation: 'korund' });
  const html = renderToStaticMarkup(React.createElement(FaithPanel, { api: api(s, congregationState({ nation: 'korund' })) })), t = text(html);
  assert.ok(t.includes(korundFaithCopy.publicChoice)); assert.ok(!html.includes('type="radio"')); assert.ok(!html.includes('<fieldset'));
  assert.ok(!t.includes('Congregation')); assert.ok(!t.includes('Join congregation')); assert.ok(t.includes('Public worship is not permitted in Korund.'));
  assert.ok(!/Fair-Wind|Kinward|Open Hand/.test(t), 'no hidden faith is named on screen');
});

test('daily worship: done today shows the server reason, with a next-worship timer', () => {
  const html = renderToStaticMarkup(React.createElement(FaithPanel, { api: api(faithState({ worshippedToday: true })) }));
  assert.match(html, /<button[^>]*disabled=""[^>]*>Make Your Vow/); assert.match(text(html), /You have already attended worship this game day/);
});

test('congregation: join, then leave and stand for Officiant, with the Officiant seat described by Devotion (no election wording)', () => {
  const s = faithState();
  let t = text(renderToStaticMarkup(React.createElement(FaithPanel, { api: api(s, congregationState({ member: false })) })));
  assert.match(t, /Congregation/); assert.match(t, /Fair-Wind Vow · Forgehaven/); assert.match(t, /Officiant: Mira of the Long Wharf/); assert.match(t, /Join congregation/);
  assert.match(t, /A member with more Devotion can take the seat once the holder has served 7 game days\./);
  t = text(renderToStaticMarkup(React.createElement(FaithPanel, { api: api(s, congregationState({ member: true, officiant: true })) })));
  assert.match(t, /Leave congregation/); assert.match(t, /Stand for Officiant/); assert.match(t, /Lead today's service/);
  const opted = renderToStaticMarkup(React.createElement(FaithPanel, { api: api(s, congregationState({ member: true, opt: true })) }));
  assert.match(opted, /aria-pressed="true"[^>]*>Stand down as Officiant/);
  assert.doesNotMatch(text(opted), /tally|ballot|vote|election/i, 'no election tally is shown here; if one is added it must read "AI bloc"');
  const blocked = text(renderToStaticMarkup(React.createElement(FaithPanel, { api: api(s, congregationState({ member: true, blocked: 'You can join or leave a congregation once per game day. Come back tomorrow.' })) })));
  assert.match(blocked, /once per game day\. Come back tomorrow\./);
});

let t;
test('Aurelle Kinward Rite (#289/#311): picking away shows the Royal Favor cost and balance before Confirm; Confirm is disabled only when the server says it cannot be paid', () => {
  const render = (s, pick) => renderToStaticMarkup(React.createElement(FaithPanel, { api: api(s), initialPick: pick }));
  const confirmDisabled = html => /<button[^>]*disabled=""[^>]*>Confirm faith/.test(html);
  // Not picked away: no cost line, and Confirm explains that a different faith must be picked.
  let html = render(faithState({ nation: 'aurelle', royalFavor: 14 }), null);
  assert.equal(html.includes('faith-leave-cost'), false); assert.match(text(html), /Pick a different faith to change\./); assert.ok(confirmDisabled(html));
  // Picked away with enough Royal Favor: the cost and balance show before Confirm, and Confirm is enabled.
  html = render(faithState({ nation: 'aurelle', royalFavor: 14 }), 'unaffiliated');
  assert.match(text(html), /Leaving the Kinward Rite costs 10 Royal Favor\. You have 14\./);
  assert.ok(html.indexOf('faith-leave-cost') < html.indexOf('>Confirm faith<'), 'cost is shown before the Confirm button');
  assert.equal(confirmDisabled(html), false); assert.doesNotMatch(text(html), /Serve the Crown to earn more/);
  // Exactly enough is enough.
  assert.equal(confirmDisabled(render(faithState({ nation: 'aurelle', royalFavor: 10 }), 'open-hand')), false);
  // Short: cost, balance and the server reason are all visible, and Confirm is disabled and described by the reason.
  const short = faithState({ nation: 'aurelle', royalFavor: 4 }); assert.equal(short.leaveCost, 10); assert.equal(short.royalFavor, 4);
  html = render(short, 'open-hand'); t = text(html);
  assert.match(t, /costs 10 Royal Favor\. You have 4\./); assert.ok(t.includes(short.leaveBlockedReason)); assert.ok(confirmDisabled(html));
  assert.match(html, /<button[^>]*disabled=""[^>]*aria-describedby="[^"]+"[^>]*>Confirm faith/);
  // Cooldown and busy still disable Confirm even when the cost is paid; the cost line stays.
  html = render(faithState({ nation: 'aurelle', royalFavor: 14, locked: true }), 'unaffiliated'); assert.ok(confirmDisabled(html)); assert.ok(text(html).includes(faithState({ locked: true }).changeBlockedReason));
  html = renderToStaticMarkup(React.createElement(FaithPanel, { api: api(faithState({ nation: 'aurelle', royalFavor: 14 }), null, { busy: true }), initialPick: 'unaffiliated' })); assert.ok(confirmDisabled(html)); assert.match(text(html), /Saving…/);
  // Nations where leaving is free show no cost line.
  assert.equal(render(faithState({ nation: 'kindle' }), 'open-hand').includes('faith-leave-cost'), false);
  assert.equal(confirmDisabled(render(faithState({ nation: 'kindle' }), 'open-hand')), false);
});

test('holiday banner: public holiday with the stance line, and a Join button for followers; others see only the holiday', () => {
  const kin = faithState({ nation: 'aurelle', holiday: true });
  let html = renderToStaticMarkup(React.createElement(HolidayBanner, { faith: kin, busy: false, onJoin: noop })), t = text(html);
  assert.match(t, /Public holiday · Oath Day/); assert.ok(t.includes(kin.holiday.line)); assert.match(html, /role="status"/);
  assert.match(html, /<button[^>]*>Join the festival<\/button>/);
  const other = faithState({ nation: 'aurelle', faith: 'unaffiliated', holiday: true });
  html = renderToStaticMarkup(React.createElement(HolidayBanner, { faith: other, busy: false, onJoin: noop })); t = text(html);
  assert.match(t, /Public holiday · Oath Day/); assert.ok(!html.includes('Join the festival'), 'only followers get the festival banner');
  const joined = faithState({ nation: 'aurelle', holiday: true }); joined.festivals[0].joined = true; joined.festivals[0].joinBlockedReason = 'You already joined Oath Day.';
  assert.match(renderToStaticMarkup(React.createElement(HolidayBanner, { faith: joined, busy: false, onJoin: noop })), /disabled=""[^>]*>Joined/);
});

test('page wiring: faith UI is mounted once, off the guest demo, and the clock marks a holiday', async () => {
  const { readFile } = await import('node:fs/promises');
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8'), shell = await readFile(new URL('../app/game-shell.tsx', import.meta.url), 'utf8');
  assert.match(page, /useFaith\(Boolean\(citizenNation\) && !guestActive\)/); assert.equal((page.match(/<FaithPanel /g) ?? []).length, 1); assert.match(page, /holidayName=\{faithApi\.faith\?\.holiday\?\.name \?\? null\}/);
  assert.match(shell, /game-clock-holiday/);
});
