/** #1064: Hoarvale Moot bills with a frost-blue Royal Assent seal, flag NEXT_PUBLIC_HARIMU_HOARVALE_ROYAL_ASSENT.
 *  320px wide at 100% and 150% text, and reduced motion. Flag off and a non-Hoarvale nation render no seal. */
import { bundleShell } from './hud-tooltip-check.mjs';
import { isMain, runStandalone } from './layout-standalone.mjs';

const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client';
  import { HoarvaleCivicBills } from './app/hoarvale-royal-assent.tsx';
  window.mountBills = nationId => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root'));
    window.__root.render(<HoarvaleCivicBills nationId={nationId} />); };`;

const probe = () => {
  const vw = document.documentElement.clientWidth, issues = [];
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const root = document.querySelector('.hoarvale-bills');
  if (!root) return { issues, bills: 0, labels: [] };
  const bills = [...root.querySelectorAll('.hoarvale-bill')];
  for (const bill of bills) {
    const seal = bill.querySelector('.hoarvale-assent-seal'), mark = bill.querySelector('.hoarvale-assent-mark'), label = bill.querySelector('.hoarvale-assent-label'), status = bill.querySelector('.hoarvale-assent');
    if (!seal || !mark || !label || !status || !seal.contains(label)) { issues.push('seal is missing its icon or text'); continue; }
    if (!mark.getAttribute('data-nation-pattern')) issues.push('seal has no pattern');
    if (mark.getAttribute('aria-hidden') !== 'true') issues.push('seal icon is exposed');
    if (!label.textContent.trim()) issues.push('seal has no text');
    if (status.getAttribute('aria-label') !== label.textContent.trim()) issues.push(`status name is "${status.getAttribute('aria-label')}"`);
    const box = mark.getBoundingClientRect();
    if (box.width < 43 || box.height < 43) issues.push(`seal is ${Math.round(box.width)}x${Math.round(box.height)}`);
    if (box.right > vw + 1 || label.getBoundingClientRect().right > vw + 1) issues.push('seal leaves the 320px width');
  }
  const motion = [root, ...root.querySelectorAll('*')].some(el => { const s = getComputedStyle(el); return s.animationName !== 'none' && parseFloat(s.animationDuration) > 0.05; });
  if (motion) issues.push('bills are animating');
  return { issues, bills: bills.length, labels: bills.map(bill => bill.querySelector('.hoarvale-assent-label')?.textContent.trim()) };
};

export async function checkHoarvaleRoyalAssent({ browser, css, preflight, failures, rows }) {
  const on = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_HOARVALE_ROYAL_ASSENT: 'true' });
  const off = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_HOARVALE_ROYAL_ASSENT: 'false' });
  const paint = async (script, nation, { scale = 1, motion = false } = {}) => {
    const context = await browser.newContext({ viewport: { width: 320, height: 700 }, reducedMotion: motion ? 'reduce' : 'no-preference' });
    const page = await context.newPage();
    await page.setContent(`<!doctype html><html${motion ? ' data-harimu-reduced-motion' : ''} style="--text-scale:${scale}"><head><style>${preflight}${css}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: script });
    await page.evaluate(id => window.mountBills(id), nation);
    const result = await page.evaluate(probe);
    await context.close();
    return result;
  };
  for (const scale of [1, 1.5]) {
    const result = await paint(on, 'hoarvale', { scale });
    const id = `320 @${scale * 100}%`;
    if (result.bills !== 2) failures.push(`${id}: expected 2 bills, found ${result.bills}`);
    if (!result.labels?.includes('Royal Assent') || !result.labels?.includes('Awaiting Royal Assent')) failures.push(`${id}: labels ${result.labels?.join(' | ')}`);
    for (const issue of result.issues) failures.push(`${id}: ${issue}`);
    rows.push(`${id}: ${result.bills} bills`);
  }
  const reduced = await paint(on, 'hoarvale', { scale: 1.5, motion: true });
  if (reduced.bills !== 2) failures.push('reduced motion: bills missing');
  for (const issue of reduced.issues) failures.push(`reduced motion: ${issue}`);
  rows.push('reduced motion @320 150%: no animation');
  const plain = await paint(off, 'hoarvale');
  if (plain.bills) failures.push('flag off still renders the seal');
  const other = await paint(on, 'kindle');
  if (other.bills) failures.push('Kindle renders a Hoarvale seal');
  rows.push('flag off and Kindle: no seal');
}

if (isMain(import.meta.url)) await runStandalone('Hoarvale Royal Assent seal', checkHoarvaleRoyalAssent);
