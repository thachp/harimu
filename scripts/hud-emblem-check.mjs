/** #78 check: the nation emblem and the notifications button in the top bar. Bundles the real GameShell with
 *  NEXT_PUBLIC_HARIMU_TOPBAR_EMBLEM on and off, in headless Chromium with the shipped CSS, at 1280x800, 960x800, 390x844 and 320x700,
 *  100/125/150% text, for a visitor (Visiting) and a citizen, in Kindle and in an unthemed nation (initial fallback):
 *  - flag off: no emblem and the old "Nation preview" wording; flag on: exactly one emblem named "<Nation> emblem", fully on-screen,
 *    not overlapping the nation name, and "Visiting" for visitors
 *  - the page never scrolls sideways and no top-bar control leaves the screen or overlaps another
 *  - the REAL CitizenDock bell (not a stub) sits in the top bar, is keyboard-reachable and named "Notifications, N unread"; flag on: count badge only
 *    when unread, a polite live count, a 44px phone target; opening the inbox reads it (count drops to 0) and Escape returns focus to the bell
 *  Used by hud-layout-check.mjs (npm run test:layout). Screenshots: LAYOUT_SHOTS_DIR=docs/screenshots/78. */
import { bundleShell, shellProps } from './hud-tooltip-check.mjs';

const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client'; import { GameShell } from './app/game-shell.tsx'; import { CitizenDock } from './app/citizen-dock.tsx';
  window.mountShell = (props, dock) => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root'));
    window.__root.render(<><GameShell {...props} onNavigate={() => {}} accountControls={<><button type="button" className="game-glossary" aria-label="Open morning brief"><svg width="17" height="17" /><span>Brief</span></button><button type="button" className="account-menu-trigger" aria-label="Account menu"></button></>} /><CitizenDock {...dock} onNavigate={() => {}} /></>); };`;

const measure = () => {
  const vw = document.documentElement.clientWidth, issues = [], hud = document.querySelector('.game-hud');
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const items = [...hud.querySelectorAll('summary, button, .game-identity, .game-clock')].filter(e => e.getBoundingClientRect().width > 0 && !e.closest('.game-hud-tip'))
    .map(e => ({ el: e, name: e.getAttribute('aria-label') || e.textContent.trim().slice(0, 14) || e.className, r: e.getBoundingClientRect() }));
  for (const it of items) if (it.r.left < -0.5 || it.r.right > vw + 0.5) issues.push(`top-bar "${it.name}" leaves the screen`);
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j]; if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    if (a.r.left < b.r.right - 0.5 && b.r.left < a.r.right - 0.5 && a.r.top < b.r.bottom - 0.5 && b.r.top < a.r.bottom - 0.5) issues.push(`top-bar "${a.name}" overlaps "${b.name}"`);
  }
  const emblems = [...document.querySelectorAll('.nation-emblem')], sub = document.querySelector('.game-identity > div > span');
  const e = emblems[0];
  let emblem = null;
  if (e) {
    const r = e.getBoundingClientRect();
    const textRects = [];
    for (const node of sub.childNodes) { if (node === e) continue; const range = document.createRange(); range.selectNodeContents(node); textRects.push(...[...range.getClientRects()].filter(x => x.width > 0)); }
    if (textRects.some(x => x.left < r.right - 0.5 && r.left < x.right - 0.5 && x.top < r.bottom - 0.5 && r.top < x.bottom - 0.5)) issues.push('the emblem overlaps the nation name');
    if (r.left < -0.5 || r.right > vw + 0.5 || r.width < 8) issues.push('the emblem is off-screen or too small');
    emblem = { label: e.getAttribute('aria-label'), role: e.getAttribute('role'), text: e.textContent, size: Math.round(r.width) };
  }
  return { issues, count: emblems.length, emblem, status: sub.textContent };
};

export async function checkTopBarEmblem({ browser, css, preflight, failures, rows }) {
  const scripts = { on: await bundleShell(entry, { NEXT_PUBLIC_HARIMU_TOPBAR_EMBLEM: 'true' }), off: await bundleShell(entry, { NEXT_PUBLIC_HARIMU_TOPBAR_EMBLEM: 'false' }) };
  const shots = process.env.LAYOUT_SHOTS_DIR;
  const nations = { kindle: { id: 'kindle', name: 'Kindle Republic', capital: 'Forgehaven' }, varkand: { id: 'varkand', name: 'Varkand', capital: 'Skarn' } };
  const cases = [['visitor', 'kindle'], ['citizen', 'kindle'], ['visitor', 'varkand']];
  for (const [w, h] of [[1280, 800], [960, 800], [390, 844], [320, 700]]) for (const scale of [1, 1.25, 1.5]) for (const flag of ['on', 'off']) for (const [who, nid] of cases) {
    const nation = nations[nid];
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await context.newPage(); page.setDefaultTimeout(90000);
    const id = `${w}x${h} @${scale * 100}% emblem ${flag} ${who}/${nid}`;
    const fail = m => failures.push(`${id}: ${m}`);
    await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: scripts[flag] });
    const dock = who === 'citizen' ? { nationId: nid, session: 'ready', configured: true, cityVisible: false, shifts: [1, 2].map(n => ({ id: `s${n}`, orderName: `Order ${n}`, completesAt: '2020-01-01T00:00:00Z', claimedAt: null })), government: null } : { nationId: null, session: 'anonymous', configured: true, cityVisible: false, shifts: [], government: null };
    await page.evaluate(([p, d]) => window.mountShell(p, d), [{ ...shellProps, nation, nations: [nation], citizenNation: who === 'citizen' ? nation : null, localDemo: false }, dock]);
    await page.waitForSelector('.game-hud');
    await page.waitForSelector('.game-hud .game-notifications');
    const m = await page.evaluate(measure); m.issues.forEach(fail);
    if (flag === 'off') { if (m.count) fail('an emblem shows with the flag off'); if (who === 'visitor' && !m.status.includes('Nation preview')) fail(`flag off changed the wording: "${m.status}"`); }
    else {
      if (m.count !== 1) fail(`expected one emblem, found ${m.count}`);
      else {
        if (m.emblem.label !== `${nation.name} emblem` || m.emblem.role !== 'img') fail(`emblem name/role wrong: ${JSON.stringify(m.emblem)}`);
        if (nid === 'varkand' && m.emblem.text !== 'V') fail(`unthemed nation should show its initial, got "${m.emblem.text}"`);
      }
      if (who === 'visitor' && !m.status.includes('Visiting')) fail(`visitor line should say Visiting: "${m.status}"`);
      if (who === 'citizen' && !m.status.includes('Your citizen')) fail(`citizen line wrong: "${m.status}"`);
    }
    // Keyboard: the bell is reachable by Tab inside the top bar and has its name.
    let reached = false;
    for (let i = 0; i < 14 && !reached; i++) { await page.keyboard.press('Tab'); reached = await page.evaluate(() => document.activeElement?.classList.contains('game-notifications') && Boolean(document.activeElement.closest('.game-hud')) && /^Notifications, \d+ unread$/.test(document.activeElement.getAttribute('aria-label') || '')); }
    if (!reached) fail('the notifications button is not reachable by Tab in the top bar');
    const unread = who === 'citizen' ? 2 : 0;
    const bell = await page.evaluate(() => { const b = document.querySelector('.game-hud .game-notifications'), r = b.getBoundingClientRect(), live = document.querySelector('.game-notifications-live'); return { label: b.getAttribute('aria-label'), badge: b.querySelector('strong')?.textContent ?? null, hasUnread: b.classList.contains('has-unread'), live: live ? live.textContent : null, h: r.height, w: r.width }; });
    if (bell.label !== `Notifications, ${unread} unread`) fail(`bell label "${bell.label}", expected ${unread} unread`);
    if (flag === 'on') {
      if (bell.live !== (unread ? `${unread} unread notifications` : '')) fail(`live count region says "${bell.live}"`);
      if (unread && (bell.badge !== String(unread) || !bell.hasUnread)) fail(`badge should show ${unread} (got ${bell.badge}, hasUnread ${bell.hasUnread})`);
      if (!unread && bell.badge !== null) fail('badge shows with nothing unread');
      if (w < 600 && (bell.h < 43.5 || bell.w < 43.5)) fail(`bell touch target is ${Math.round(bell.w)}x${Math.round(bell.h)}px, needs 44px`);
    } else if (bell.live !== null) fail('the live count region shows with the flag off');
    if (shots && [1280, 390].includes(w) && (scale === 1 || scale === 1.5) && ['visitor/kindle', 'citizen/kindle', 'visitor/varkand'].includes(`${who}/${nid}`)) await page.screenshot({ path: `${shots}/${flag === 'on' ? 'after' : 'before'}-emblem-${who}-${nid}-${w}-${scale * 100}.png`, clip: { x: 0, y: 0, width: w, height: Math.min(h, 240) } });
    if (unread) { // the count is live: opening the inbox reads it, the bell drops to 0 and focus returns on close
      await page.click('.game-hud .game-notifications'); await page.waitForSelector('dialog[open]');
      const after = await page.evaluate(() => ({ label: document.querySelector('.game-hud .game-notifications').getAttribute('aria-label'), live: document.querySelector('.game-notifications-live')?.textContent ?? null }));
      if (after.label !== 'Notifications, 0 unread') fail(`after opening the inbox the bell says "${after.label}"`);
      if (flag === 'on' && after.live !== '') fail('the live region did not clear after reading');
      await page.keyboard.press('Escape'); await page.waitForSelector('dialog[open]', { state: 'detached' });
      if (!(await page.evaluate(() => document.activeElement?.classList.contains('game-notifications')))) fail('focus did not return to the bell after closing the inbox');
    }
    rows.push(`${id}: ${flag === 'on' ? `emblem "${m.emblem?.label}", ` : 'no emblem, '}bell reachable, nothing off-screen`);
    await context.close();
  }
}
