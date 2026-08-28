import type { Pt } from '../geometry';

// hardcoded categories — each item picks one
export const CATEGORIES = [
  { id: 'bedroom', label: 'Bedroom' },
  { id: 'living-room', label: 'Living room' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export interface CatalogItem {
  kind: string;
  label: string;
  w: number;
  d: number;
  minW: number;
  minD: number;
}

export interface CatalogCategory {
  id: string;
  label: string;
  items: CatalogItem[];
}

export type ResizeMode = 'bbox' | 'fixed-aspect';

/**
 * Per-item definition — pure data + geometry. `Render` lives in a sibling
 * `.svelte` file; this type stays `no $app/*` so `ops/validate/tests` can
 * import it. Adding an item = one `defs/<kind>.ts` + one `views/<kind>.svelte`.
 */
export interface ItemDef {
  kind: string;
  label: string;
  category: CategoryId;
  defaults: { w: number; d: number; minW: number; minD: number };
  /**
   * Local-frame convex polygons (center at 0,0, axis-aligned) that describe
   * the true collision shape. For now all items return one rectangle; future
   * L/round items return N polys or a dense circle approximation.
   * Each poly is convex so `polygonsIntersect` SAT holds.
   */
  collisionShapes: (w: number, d: number) => Pt[][];
  /** AABB used for snap-to-wall / snap-to-sibling. Defaults to bbox of `collisionShapes`. */
  snapAABB?: (w: number, d: number) => { w: number; d: number };
  /** How `resizeItem` clamps: bbox = free w/d; fixed-aspect = w===d (round). */
  resizeMode?: ResizeMode;
}
