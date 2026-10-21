/** #682 follow-up (QA1 on #703): the top-bar bell's unread badge ("99" and the capped "99+") must sit inside the fixed 44px phone bell at every text size.
 *  Renders the bell markup of app/citizen-dock.tsx (top-bar variant, unread > 0) inside the UI v2 top bar with the shipped stylesheet in headless Chromium. */
const bell = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></svg>';
export async function checkBellBadge({ browser, css, preflight, failures, rows }) {
  for (const [w, h] of [[390, 844], [320, 700]]) for (const scale of [1, 1.25, 1.5]) for (const text of ['5', '99', '99+']) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}</style></head><body><div class="harimu-game"><header class="game-hud game-hud-v2"><div class="game-account"><button class="game-notifications game-notifications-topbar has-unread" type="button" aria-label="Notifications, 1000 unread">${bell}<strong>${text}</strong></button></div></header></div></body></html>`);
    const m = await page.evaluate(() => { const b = document.querySelector('.game-notifications-topbar').getBoundingClientRect(), s = document.querySelector('.game-notifications-topbar>strong'), r = s.getBoundingClientRect(), i = document.querySelector('.game-notifications-topbar>svg').getBoundingClientRect();
      return { bw: b.width, over: Math.max(0, b.left - r.left, r.right - b.right, b.top - r.top, r.bottom - b.bottom), clipped: s.scrollWidth > s.clientWidth + 0.5, icon: i.width > 0 && i.height > 0 }; });
    const id = `${w}x${h} @${scale * 100}% bell badge "${text}"`;
    if (Math.abs(m.bw - 44) > 0.5) failures.push(`${id}: the phone bell is ${m.bw}px wide, not 44px`);
    if (m.over > 0.5) failures.push(`${id}: the badge overflows the bell by ${m.over.toFixed(1)}px`);
    if (m.clipped) failures.push(`${id}: the badge text is clipped`);
    if (!m.icon) failures.push(`${id}: the bell icon is hidden`);
    rows.push(`${id}: bell ${m.bw}px, overflow ${m.over.toFixed(1)}px, icon ${m.icon ? 'shown' : 'hidden'}`);
    await page.close();
  }
}
