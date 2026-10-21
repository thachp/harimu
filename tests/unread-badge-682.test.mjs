/** #682 follow-up: the bell's unread badge caps at "99+" (rendered), the accessible label keeps the exact count. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadApp } from './helpers/component-module.mjs';

const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
const { UnreadBadge, unreadBadgeText } = await loadApp('unread-badge');
const render = unread => renderToStaticMarkup(React.createElement(UnreadBadge, { unread }));

test('renders 0, 5, 99 as-is and 100, 1000 as 99+', () => {
  for (const [n, text] of [[0, '0'], [5, '5'], [99, '99'], [100, '99+'], [1000, '99+']]) {
    assert.equal(render(n), `<strong>${text}</strong>`, String(n));
    assert.equal(unreadBadgeText(n), text);
  }
  assert.ok(render(1000).replace(/<[^>]+>/g, '').length <= 3, 'never more than three characters');
});

test('the bell uses the badge; its label and live text keep the exact count', () => {
  const dock = readFileSync('app/citizen-dock.tsx', 'utf8');
  assert.match(dock, /\{\(!topBar\|\|unread>0\)&&<UnreadBadge unread=\{unread\}\/>\}/);
  assert.ok(!dock.includes('<strong>{unread}</strong>'));
  assert.match(dock, /aria-label=\{`Notifications, \$\{unread\} unread`\}/);
});

test('QA1: the title and the live-region text use the exact, uncapped count (never the badge text)', () => {
  const dock = readFileSync('app/citizen-dock.tsx', 'utf8');
  assert.match(dock, /title=\{`Open civic inbox · \$\{unread\} unread this session`\}/, 'title: exact count');
  assert.match(dock, /className="game-notifications-live" role="status">\{unread>0\?`\$\{unread\} unread \$\{unread===1\?'notification':'notifications'\}`:''\}/, 'live region: exact count');
  assert.equal((dock.match(/unreadBadgeText|UnreadBadge/g) ?? []).length, 2, 'the cap is applied only in the visible badge (import + one use)');
  const live = n => (n > 0 ? `${n} unread ${n === 1 ? 'notification' : 'notifications'}` : ''), title = n => `Open civic inbox · ${n} unread this session`;
  assert.equal(live(1000), '1000 unread notifications'); assert.equal(title(1000), 'Open civic inbox · 1000 unread this session');
});

test('phone CSS: the badge is absolutely positioned inside the 44px bell (adds no width)', () => {
  const css = readFileSync('app/game-shell.css', 'utf8');
  const rule = css.indexOf('.game-notifications-topbar.has-unread>strong{position:absolute;top:2px;right:2px;');
  assert.ok(rule > css.indexOf('.game-notifications-topbar{flex-shrink:0;white-space:nowrap;box-sizing:border-box;width:44px'), 'inside the same phone block, after the fixed width');
  assert.ok(css.lastIndexOf('@media(max-width:760px){', rule) > css.lastIndexOf('}}', rule), 'scoped to 760px and below');
});
