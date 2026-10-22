/** #392 S2 check: the UI v2 top bar (NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR). Bundles the real GameShell, the real AccountMenu (Clerk stubbed) and the real CitizenDock in headless Chromium with the shipped CSS
 *  (plus account-menu.module.css, whose class names the harness keeps), at 1280x800, 960x800, 390x844 and 320x700, 100/125/150% text, for a citizen and a visitor, with three flag states:
 *  - off (both flags false): no .game-hud-v2, no emblem, and the top bar is the same height as with every S2 rule removed (the CSS from the "#392 S2" marker to the end of the file)
 *  - emblem only (#78 flag): still no .game-hud-v2: the restyle never rides on the emblem flag
 *  - v2 on: .game-hud-v2 present; the #78 emblem, "Visiting" label and live-count bell come on WITHOUT the emblem flag (one code path); every resource keeps its text and is a bordered chip;
 *    the Account button keeps its name and is a pill with an avatar glyph; nothing leaves the screen or overlaps; no sideways scroll; no Account/settings/bell target is smaller than in the emblem-only bar;
 *    the bar grows by no more than 8px over the emblem-only (#78) bar; a hover (desktop) still opens one on-screen tooltip.
 *  Used by hud-layout-check.mjs (npm run test:layout). Screenshots: LAYOUT_SHOTS_DIR=docs/screenshots/544 (before = flag off, after = v2 on). */
import { readFile } from 'node:fs/promises';
import { bundleShell, shellProps } from './hud-tooltip-check.mjs';

const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client'; import { GameShell } from './app/game-shell.tsx'; import { CitizenDock } from './app/citizen-dock.tsx'; import { AccountMenu } from './app/account-menu.tsx';
  window.mountShell = (props, dock) => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root'));
    window.__root.render(<><GameShell {...props} onNavigate={() => {}} accountControls={<><button type="button" className="game-glossary" aria-label="Open morning brief"><svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 2.5h9v11h-9z M4.5 5.5h5 M4.5 8h5 M4.5 10.5h3" fill="none" stroke="currentColor" /></svg><span>Brief</span></button><AccountMenu /></>} /><CitizenDock {...dock} onNavigate={() => {}} /></>); };`;

const measure = () => {
  const vw = document.documentElement.clientWidth, issues = [], hud = document.querySelector('.game-hud');
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const items = [...hud.querySelectorAll('summary, button, .game-identity, .game-clock')].filter(e => e.getBoundingClientRect().width > 0 && !e.closest('.game-hud-tip'))
    .map(e => ({ el: e, name: e.getAttribute('aria-label') || e.textContent.trim().slice(0, 14) || e.className, r: e.getBoundingClientRect() }));
  for (const it of items) if (it.r.left < -0.5 || it.r.right > vw + 0.5) issues.push(`top-bar "${it.name}" leaves the screen (${Math.round(it.r.left)}..${Math.round(it.r.right)} of ${vw})`);
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j]; if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    if (a.r.left < b.r.right - 0.5 && b.r.left < a.r.right - 0.5 && a.r.top < b.r.bottom - 0.5 && b.r.top < a.r.bottom - 0.5) issues.push(`top-bar "${a.name}" overlaps "${b.name}"`);
  }
  const chips = [...hud.querySelectorAll('.game-resources>div, .game-resources>.game-hud-help, .game-resources>.game-wallet-button')].map(c => { const s = getComputedStyle(c); return { text: c.textContent.trim(), border: parseFloat(s.borderTopWidth), radius: parseFloat(s.borderTopLeftRadius), h: c.getBoundingClientRect().height }; });
  const account = hud.querySelector('button[aria-controls="harimu-account-menu"]'), before = account && getComputedStyle(account, '::before'), after = account && getComputedStyle(account, '::after');
  const small = [account, hud.querySelector('.game-settings-button'), hud.querySelector('.game-notifications')].filter(Boolean).map(b => ({ name: b.getAttribute('aria-label') || b.textContent.trim(), h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width }));
  return { issues, height: hud.getBoundingClientRect().height, v2: hud.classList.contains('game-hud-v2'), emblems: document.querySelectorAll('.game-hud .nation-emblem').length, status: document.querySelector('.game-identity > div > span')?.textContent || '',
    chips, account: account && { name: account.textContent.trim(), radius: parseFloat(getComputedStyle(account).borderTopLeftRadius), avatar: before.content !== 'none' && parseFloat(before.width) > 0, caret: after.content !== 'none', w: account.getBoundingClientRect().width },
    small, topBell: !!hud.querySelector('.game-notifications-topbar') };
};

export async function checkUiV2Topbar({ browser, css, preflight, failures, rows }) {
  const marker = css.indexOf('/* #392 S2:'); if (marker < 0) { failures.push('ui v2 top bar: CSS marker "/* #392 S2:" not found'); return; }
  const moduleCss = await readFile(new URL('../app/account-menu.module.css', import.meta.url), 'utf8');
  const flags = { off: { NEXT_PUBLIC_HARIMU_TOPBAR_EMBLEM: 'false', NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR: 'false' }, emblem: { NEXT_PUBLIC_HARIMU_TOPBAR_EMBLEM: 'true', NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR: 'false' }, v2: { NEXT_PUBLIC_HARIMU_TOPBAR_EMBLEM: 'false', NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR: 'true' } };
  const scripts = Object.fromEntries(await Promise.all(Object.entries(flags).map(async ([k, env]) => [k, await bundleShell(entry, env)])));
  const shots = process.env.LAYOUT_SHOTS_DIR, nation = { id: 'kindle', name: 'Kindle Republic', capital: 'Forgehaven' };
  const html = (scale, styles) => `<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${moduleCss}${styles}</style></head><body><div id="root"></div></body></html>`;
  const dockFor = who => who === 'citizen' ? { nationId: 'kindle', session: 'ready', configured: true, cityVisible: false, shifts: [1, 2].map(n => ({ id: `s${n}`, orderName: `Order ${n}`, completesAt: '2020-01-01T00:00:00Z', claimedAt: null })), government: null } : { nationId: null, session: 'anonymous', configured: true, cityVisible: false, shifts: [], government: null };
  const mount = async (page, flag, who) => { await page.addScriptTag({ content: scripts[flag] });
    await page.evaluate(([p, d]) => window.mountShell(p, d), [{ ...shellProps, nation, nations: [nation], citizenNation: who === 'citizen' ? nation : null, localDemo: false }, dockFor(who)]);
    await page.waitForSelector('.game-hud .game-notifications'); await page.waitForSelector('.game-hud button[aria-controls="harimu-account-menu"]'); };
  for (const [w, h] of [[1280, 800], [960, 800], [390, 844], [320, 700]]) for (const scale of [1, 1.25, 1.5]) for (const who of ['citizen', 'visitor']) {
    const heights = {}, smalls = {};
    for (const flag of ['off', 'emblem', 'v2']) {
      const context = await browser.newContext({ viewport: { width: w, height: h } }); const page = await context.newPage(); page.setDefaultTimeout(90000);
      const id = `${w}x${h} @${scale * 100}% ui-v2 top bar ${flag} ${who}`, fail = m => failures.push(`${id}: ${m}`);
      await page.setContent(html(scale, css)); await mount(page, flag, who);
      const m = await page.evaluate(measure); m.issues.forEach(fail); heights[flag] = m.height; smalls[flag] = m.small;
      if (flag !== 'v2' && m.v2) fail('.game-hud-v2 is present without the UI v2 flag');
      if (flag === 'off') {
        if (m.emblems) fail('an emblem shows with both flags off');
        const base = await context.newPage(); base.setDefaultTimeout(90000); await base.setContent(html(scale, css.slice(0, marker))); await mount(base, 'off', who);
        const b = await base.evaluate(measure); if (Math.abs(b.height - m.height) > 0.5) fail(`flag off changed the top-bar height: ${Math.round(m.height)}px, baseline ${Math.round(b.height)}px`); await base.close();
        if (m.chips.some(c => c.radius >= 8)) fail('flag off: resource chips are rounded');
      }
      if (flag === 'emblem') { if (m.emblems !== 1) fail('the #78 emblem flag alone no longer shows the emblem'); if (m.account.avatar) fail('the #78 emblem flag alone restyled the Account button'); }
      if (flag === 'v2') {
        if (!m.v2) fail('.game-hud-v2 missing with the flag on');
        if (m.emblems !== 1) fail(`expected the #78 emblem through the UI v2 flag, found ${m.emblems}`);
        if (who === 'visitor' && !m.status.includes('Visiting')) fail(`the visitor line should say Visiting: "${m.status}"`);
        if (!m.topBell) fail('the live-count bell (#78) is not on with the UI v2 flag');
        if (m.chips.length < 1 && who === 'citizen') fail('no resource chips');
        for (const c of m.chips) if (c.border < 1 || c.radius < 8) fail(`resource "${c.text}" is not a bordered chip (border ${c.border}px, radius ${c.radius}px)`);
        if (!m.account || m.account.name !== 'Account') fail(`the Account button lost its name ("${m.account?.name}")`);
        else { if (!m.account.avatar) fail('the Account button has no avatar glyph'); if (m.account.radius < 16) fail('the Account button is not a pill'); }
        for (const s of m.small) { const e = smalls.emblem.find(x => x.name === s.name); if (e && s.h < e.h - 0.5) fail(`"${s.name}" shrank from ${Math.round(e.h)}px to ${Math.round(s.h)}px tall`); } // never below the #78-only target size
        if (m.height - heights.emblem > 8) fail(`the top bar grew ${Math.round(m.height - heights.emblem)}px over the #78 emblem-only bar`);
        if (w >= 1280) { // hovering a chip still opens exactly its own tooltip, on screen
          const s = await page.$('.game-resources summary'); if (s) { await s.hover(); const tips = await page.evaluate(() => [...document.querySelectorAll('.game-hud-help[open] .game-hud-tip')].map(t => { const r = t.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0; }));
            if (tips.length !== 1 || !tips[0]) fail(`hovering a chip should open one on-screen tooltip, found ${JSON.stringify(tips)}`); } }
      }
      if (shots && [1280, 390].includes(w) && (scale === 1 || scale === 1.5) && (flag === 'off' || flag === 'v2')) {
        await page.mouse.move(0, h - 1); await page.evaluate(() => document.activeElement?.blur?.());
        const box = await page.evaluate(() => { const r = document.querySelector('.game-hud').getBoundingClientRect(); return { x: 0, y: 0, width: innerWidth, height: Math.ceil(r.height) + 2 }; });
        await page.screenshot({ path: `${shots}/${flag === 'v2' ? 'after' : 'before'}-topbar-${who}-${w}-${scale * 100}.png`, clip: box });
      }
      rows.push(`${id}: ${m.emblems} emblem, ${m.chips.length} chips, height ${Math.round(m.height)}px`);
      await context.close();
    }
  }
}
