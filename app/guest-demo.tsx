'use client';

import { useState } from 'react';
import { NationVignette } from './nation-vignette';
import type { GuestDemoState, GuestDemoAction } from '@/lib/guest-demo';
import './guest-demo.css';

export type GuestDemoView = 'household' | 'workplace' | 'market';

/** Parent owns disposable state so collapsing the scene panel preserves examples. */
export function GuestDemo({ view, onView, onExit, state, onAction, nationId = 'kindle' }: {
  nationId?: string;
  view: GuestDemoView;
  onView: (view: GuestDemoView) => void;
  onExit: () => void;
  state: GuestDemoState;
  onAction: (action: GuestDemoAction) => void;
}) {
  const [notice, setNotice] = useState('Try Work, then Market, then Household.');
  function act(action: GuestDemoAction) {
    onAction(action);
    setNotice(action === 'work' ? 'Example work finished instantly. Try buying food in Market.'
      : action === 'buy-food' ? 'Example food added. Prepare a meal in Household.'
        : action === 'meal' ? 'Example meal prepared. Your sample capacity recovered.'
          : 'Examples reset. Try Work, then Market, then Household.');
  }
  return <section className="guest-demo" aria-label="Guest day in the life">
    <header><div><small>Guest example · no account needed</small><h2>A day in the life</h2></div>
      <button type="button" onClick={onExit}>Return to exploration</button></header>
    <p>Try a small work, food and household loop. These sample actions stay in this open demo and disappear when you leave or reload. They do not create citizenship or affect the shared world.</p>
    <nav aria-label="Guest examples">
      {([['workplace', 'Work'], ['market', 'Market'], ['household', 'Household']] as const).map(([id, label]) =>
        <button type="button" key={id} aria-pressed={view === id} onClick={() => onView(id)}>{label}</button>)}
    </nav>
    {view === 'workplace' && <NationVignette nationId={nationId} />}
    <p>Universal disposable work/food example · sample coins are not any nation’s actual currency.</p>
    <div className="guest-demo-stats" aria-label="Sample resources">
      <span>{state.capacity}/24 sample capacity</span><span>{state.coins} sample coins</span><span>{state.food} sample food</span>
    </div>
    {view === 'workplace' && <article><h3>Try a work shift</h3>
      <p>Spend 4 sample capacity to earn 8 sample coins. This demonstration finishes instantly; citizen shifts continue in real time.</p>
      <button type="button" disabled={state.worked} aria-describedby={state.worked ? "guest-work-reason" : undefined} onClick={() => act('work')}>{state.worked ? 'Example shift complete' : 'Try example work'}</button>{state.worked && <small id="guest-work-reason">This example shift is already complete. Reset examples to try it again.</small>}
    </article>}
    {view === 'market' && <article><h3>Try buying food</h3>
      <p>Exchange 4 sample coins for 2 sample food. These are demonstration prices and goods.</p>
      <button type="button" disabled={state.coins < 4} aria-describedby={state.coins < 4 ? "guest-buy-reason" : undefined} onClick={() => act('buy-food')}>Try buying 2 food · 4 sample coins</button>
      {state.coins < 4 && <p id="guest-buy-reason">Try Work to earn sample coins first.</p>}
    </article>}
    {view === 'household' && <article><h3>Try a household meal</h3>
      <p>Use 2 sample food to recover up to 4 sample capacity. Citizen meals have their own recovery timer.</p>
      <button type="button" disabled={state.food < 2 || state.capacity >= 24} aria-describedby={state.food < 2 || state.capacity >= 24 ? "guest-meal-reason" : undefined} onClick={() => act('meal')}>Try preparing a meal · 2 sample food</button>
      {(state.food < 2 || state.capacity >= 24) && <p id="guest-meal-reason">{state.capacity >= 24 ? 'Sample capacity is full. Save food or reset examples.' : 'Try Work and Market to bring food home.'}</p>}
    </article>}
    <p role="status">{notice}</p>
    <footer><button type="button" onClick={() => act('reset')}>Reset examples</button>
      <small>Ready for a lasting citizen? Return to exploration to choose a nation and review the oath.</small></footer>
  </section>;
}
