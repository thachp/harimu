'use client';
import { createRoot } from 'react-dom/client';
import { Bank, Hammer, House, Storefront, UsersThree } from '@phosphor-icons/react';
import type { LocationId } from '../lib/game-viewport';

/** #392 S7: the same icons the top tabs and the rail use for these places. */
const icons = { square: UsersThree, home: House, workplace: Hammer, market: Storefront, government: Bank } as const;

/** Dresses a City label button (built with the DOM API) as the concept's icon pill with a leader dot under it. The icon and dot are decorative
 *  (aria-hidden); the button keeps its existing text and "Select …" name, focus ring and click. Returns the cleanup for the icon's React root. */
export function dressCityPill(button: HTMLButtonElement, location: LocationId, doc: Document = document): () => void {
  button.classList.add('viewport-city-pill'); button.dataset.location = location;
  const icon = doc.createElement('span'); icon.className = 'viewport-city-pill-icon'; icon.setAttribute('aria-hidden', 'true');
  const dot = doc.createElement('span'); dot.className = 'viewport-city-pill-dot'; dot.setAttribute('aria-hidden', 'true');
  button.insertBefore(icon, button.firstChild); button.appendChild(dot);
  const Icon = icons[location], root = createRoot(icon); root.render(<Icon size={14} weight="bold" />);
  return () => { queueMicrotask(() => root.unmount()); };
}
