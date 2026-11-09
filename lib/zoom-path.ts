/** #392: zoom path World → Nation → City (?view=world, ?view=country, ?view=square).
 *  NEXT_PUBLIC_HARIMU_ZOOM_PATH is a HARIMU_UI_PACK key ("true" in preview, "false" in production).
 *  Layout bundles that omit the define have no `process`. A missing flag is off. Only the exact string "true" enables it.
 *  Labels are the nation's and city's existing names. The hrefs are the same scene query the page already reads. */
import { sceneUrl } from './scene-navigation.ts';

export const ZOOM_PATH_FLAG = 'NEXT_PUBLIC_HARIMU_ZOOM_PATH';
export function zoomPathFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_ZOOM_PATH; }
  catch { return undefined; }
}
export function zoomPathEnabled(value: string | undefined = zoomPathFlag()): boolean {
  return value === 'true';
}

export const zoomPathViews = ['world', 'country', 'square'] as const;
export type ZoomPathView = typeof zoomPathViews[number];
export function isZoomPathView(view: string): view is ZoomPathView {
  return (zoomPathViews as readonly string[]).includes(view);
}

export type ZoomPathCrumb = { view: ZoomPathView; label: string; href: string; current: boolean };

/** A same-origin query the game page already accepts. Clicking still goes through the shell's navigate, which owns history. */
export function zoomPathHref(view: ZoomPathView, nationId?: string, cityId?: string, visitor = false): string {
  const url = new URL(sceneUrl('https://harimu.local/', view, nationId, view === 'square' ? cityId : undefined, false, visitor));
  return url.search;
}

/** Crumbs for the three zoom views. Household and the other places are omitted. Earlier steps are links; the last is current. */
export function zoomPathCrumbs(input: {
  view: string;
  nationLabel: string;
  cityLabel: string;
  nationId?: string;
  cityId?: string;
  visitor?: boolean;
}): ZoomPathCrumb[] | null {
  if (!isZoomPathView(input.view)) return null;
  const steps: ZoomPathView[] = input.view === 'world' ? ['world'] : input.view === 'country' ? ['world', 'country'] : ['world', 'country', 'square'];
  return steps.map(view => ({
    view,
    label: view === 'world' ? 'World' : view === 'country' ? input.nationLabel : input.cityLabel,
    href: zoomPathHref(view, input.nationId, input.cityId, input.visitor),
    current: view === input.view,
  }));
}
