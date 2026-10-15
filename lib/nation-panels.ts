import type { SceneView } from './scene-navigation';
/** #410: Korund and Aurelle have their own plan panels (assigned shift, ration or chartered food counter, meals and coupons).
 * They must be mounted in the Work, Market and Household scenes, where Kindle's shift board and market are hidden for those nations.
 * Returns the nation whose plan panel the scene shows, or null for Kindle, unfinished nations and the other scenes. */
export const nationPlanScenes: readonly SceneView[] = ['workplace', 'market', 'household'];
export function nationPlanPanelNation(nationId: string | null | undefined, view: SceneView): 'korund' | 'aurelle' | null {
  return (nationId === 'korund' || nationId === 'aurelle') && nationPlanScenes.includes(view) ? nationId : null;
}
