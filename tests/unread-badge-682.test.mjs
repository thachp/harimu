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
