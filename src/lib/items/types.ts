import type { Pt } from '../geometry';

// hardcoded categories — each item picks one
export const CATEGORIES = [
  { id: 'bedroom', label: 'Bedroom' },
  { id: 'living-room', label: 'Living room' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

/**
 * Localized catalog label: `en` REQUIRED (fallback + test data), other locales
 * optional. Looked up via `catalogLabel` — never index into it directly.
 * Kept inline in the item's library file so adding an item never touches the
 * paraglide catalogs (compile-time keyed, would need a per-item switch).
 */
export type Label = { en: string; ru?: string };

export interface CatalogItem {
  kind: string;
  label: Label;
  w: number;
  d: number;
  minW: number;
  minD: number;
  /** How `resizeItem` clamps: bbox = free w/d; fixed-aspect = w===d (round). */
  resizeMode?: ResizeMode;
}

export interface CatalogCategory {
  id: string;
  label: string;
  items: CatalogItem[];
}

export type ResizeMode = 'bbox' | 'fixed-aspect';

/**
 * Which named style class a view shape gets (see `FurnitureView.svelte`).
 * `body` = outline fill, `detail` = inner drawing, `hinge` = solid dot.
 */
export type ItemPart = 'body' | 'detail' | 'hinge';

/**
 * Declarative SVG primitive for an item's look, in the item's local frame
 * (center 0,0, axis-aligned — the parent `<g>` handles translate/rotate).
 * `part` defaults to `'body'`; stroke-width is applied by the renderer.
 */
export type ItemShape =
  | { part?: ItemPart; el: 'rect'; x: number; y: number; width: number; height: number; rx?: number }
  | { part?: ItemPart; el: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { part?: ItemPart; el: 'circle'; cx: number; cy: number; r: number }
  | { part?: ItemPart; el: 'path'; d: string };

/**
 * Per-item definition — pure data + geometry, one file per item in
 * `items/library/<kind>.ts`, registered in `items/registry.ts`. This type stays
 * free of `$app/*` and component imports so `ops/validate/tests` can use it.
 * Both hooks are OPTIONAL — omit them for a plain rectangular item:
 * - `collisionShapes` defaults to the full bbox rectangle (`rectPolys`)
 * - `view` defaults to a plain rect body (`rectView`)
 */
export interface ItemDef {
  kind: string;
  label: Label;
  category: CategoryId;
  defaults: { w: number; d: number; minW: number; minD: number };
  /**
   * Local-frame convex polygons (center at 0,0, axis-aligned) that describe
   * the true collision shape. Rect items keep the bbox; non-convex shapes
   * (L-shaped table) decompose into several rects, round ones use a dense
   * convex polygon approximation that still covers the drawn outline.
   * Each poly is convex so `polygonsIntersect` SAT holds.
   */
  collisionShapes?: (w: number, d: number) => Pt[][];
  /** Declarative look, drawn by the generic renderer in `FurnitureView`.
   * Hairline values (`rx`, `r`) are SCREEN px — the renderer converts them
   * with the canvas `--inv` CSS var, so shapes never depend on zoom. */
  view?: (w: number, d: number) => ItemShape[];
  /** How `resizeItem` clamps: bbox = free w/d; fixed-aspect = w===d (round). */
  resizeMode?: ResizeMode;
}
