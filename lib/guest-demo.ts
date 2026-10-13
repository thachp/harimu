/** Disposable examples only. No identity, receipts, real clock, or shared world writes. */
export type GuestDemoState = {
  capacity: number;
  coins: number;
  food: number;
  worked: boolean;
  meals: number;
};
export type GuestDemoAction = 'work' | 'buy-food' | 'meal' | 'reset';
export function createGuestDemo(): GuestDemoState {
  return { capacity: 22, coins: 0, food: 0, worked: false, meals: 0 };
}
export function guestDemoAction(state: GuestDemoState, action: GuestDemoAction): GuestDemoState {
  if (action === 'reset') return createGuestDemo();
  if (action === 'work' && !state.worked) return { ...state, capacity: state.capacity - 4, coins: state.coins + 8, worked: true };
  if (action === 'buy-food' && state.coins >= 4) return { ...state, coins: state.coins - 4, food: state.food + 2 };
  if (action === 'meal' && state.food >= 2 && state.capacity < 24) return { ...state, food: state.food - 2, capacity: Math.min(24, state.capacity + 4), meals: state.meals + 1 };
  return state;
}
