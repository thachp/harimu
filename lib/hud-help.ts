/** #366: which top-bar help tooltip is open. One id at most, so tooltips can never stack.
 *  - hover (mouse only): opens its own item while the pointer is over it, and closes when the pointer leaves.
 *  - focus (keyboard only, `:focus-visible`): opens on focus, closes on blur. Clicking an item never leaves it pinned by focus.
 *  - click (tap, or a click on an item): opens it; clicking the same item again, tapping elsewhere, blur or Escape closes it.
 *  - Escape closes whatever is open. */
export type HelpVia = 'hover' | 'focus' | 'click';
export type HelpState = { id: string | null; via: HelpVia | null };
export type HelpEvent =
  | { type: 'pointer'; id: string | null }   // the mouse is over help `id`, or over none
  | { type: 'focus'; id: string; visible: boolean }
  | { type: 'blur'; id: string }
  | { type: 'click'; id: string }
  | { type: 'outside' }                      // a press somewhere that is not the open help
  | { type: 'escape' };
export const helpClosed: HelpState = { id: null, via: null };

export function reduceHelp(state: HelpState, event: HelpEvent): HelpState {
  switch (event.type) {
    case 'pointer':
      if (event.id) return state.id === event.id && state.via === 'click' ? state : { id: event.id, via: 'hover' };
      return state.via === 'hover' || state.via === 'click' ? helpClosed : state; // a keyboard-opened tooltip outlives the mouse
    case 'focus':
      // Mouse and touch focus (not :focus-visible) must never open or pin a tooltip.
      return event.visible ? { id: event.id, via: 'focus' } : state;
    case 'blur':
      return state.id === event.id && state.via !== 'hover' ? helpClosed : state;
    case 'click':
      return state.id === event.id && state.via === 'click' ? helpClosed : { id: event.id, via: 'click' };
    case 'outside':
      return state.via === 'hover' ? state : helpClosed;
    case 'escape':
      return helpClosed;
  }
}
/** The id of the item an element belongs to, from its `data-help-id` ancestor. */
export const helpIdOf = (label: string) => `hud-help-${label.toLowerCase().replaceAll(' ', '-')}`;
