import type { Pt } from '../geometry';
import type { CatalogCategory, CatalogItem, ItemDef, ItemShape } from './types';
import { CATEGORIES } from './types';

// ── REGISTER NEW ITEMS HERE ──────────────────────────────────────────────────
// Adding an item = one file `items/library/<kind>.ts` (data + geometry + view
// shapes) + one line in the list below. That's it — the library panel, canvas
// rendering, persistence and export all derive from this list.
import bed from './library/bed';
import chair from './library/chair';
import closet from './library/closet';
import cornerTable from './library/corner-table';
import doubleBed from './library/double-bed';
import sofa from './library/sofa';
import table from './library/table';

const DEFS: ItemDef[] = [bed, doubleBed, chair, sofa, table, cornerTable, closet];

const DEF_MAP = new Map<string, ItemDef>(DEFS.map((d) => [d.kind, d]));

export const ITEM_DEFS: readonly ItemDef[] = DEFS;

export const CATALOG: CatalogCategory[] = CATEGORIES.map((cat) => ({
  id: cat.id,
  label: cat.label,
  items: DEFS.filter((d) => d.category === cat.id).map<CatalogItem>((d) => ({
    kind: d.kind,
    label: d.label,
    w: d.defaults.w,
    d: d.defaults.d,
    minW: d.defaults.minW,
    minD: d.defaults.minD,
  })),
}));

export const FALLBACK_ITEM: CatalogItem = {
  kind: 'unknown',
  label: 'Item',
  w: 60,
  d: 60,
  minW: 30,
  minD: 30,
};

const FALLBACK_DEF: ItemDef = {
  kind: 'unknown',
  label: 'Item',
  category: 'living-room',
  defaults: { w: 60, d: 60, minW: 30, minD: 30 },
  resizeMode: 'bbox',
};

export function getItemDef(kind: string): ItemDef | null {
  return DEF_MAP.get(kind) ?? null;
}

function resolveDef(kind: string): ItemDef {
  return DEF_MAP.get(kind) ?? FALLBACK_DEF;
}

/** Default collision shape: the item's full bbox rectangle, local frame. */
export function rectPolys(w: number, d: number): Pt[][] {
  const hw = w / 2;
  const hd = d / 2;
  return [
    [
      { x: -hw, y: -hd },
      { x: hw, y: -hd },
      { x: hw, y: hd },
      { x: -hw, y: hd },
    ],
  ];
}

/** Default look: a plain rect body (also the fallback for unknown kinds). */
function rectView(w: number, d: number): ItemShape[] {
  return [{ el: 'rect', x: -w / 2, y: -d / 2, width: w, height: d }];
}

/** Collision polys for a kind in its local frame — bbox rect for unknown kinds. */
export function collisionPolys(kind: string, w: number, d: number): Pt[][] {
  return (resolveDef(kind).collisionShapes ?? rectPolys)(w, d);
}

/** Declarative view shapes for a kind — plain rect for unknown kinds. */
export function itemShapes(kind: string, w: number, d: number, scale: number): ItemShape[] {
  return (resolveDef(kind).view ?? rectView)(w, d, scale);
}

/** Shared resize clamp (used by `resizeItem` AND the live drag preview):
 * catalog minimums; fixed-aspect items keep w===d, larger side wins. */
export function clampItemSize(kind: string, w: number, d: number): { w: number; d: number } {
  const def = resolveDef(kind);
  const minW = def.defaults.minW;
  const minD = def.defaults.minD;
  if (def.resizeMode === 'fixed-aspect') {
    const size = Math.max(w, d, minW, minD);
    return { w: size, d: size };
  }
  return { w: Math.max(minW, w), d: Math.max(minD, d) };
}

export function catalogItem(kind: string): CatalogItem {
  const def = resolveDef(kind);
  return {
    kind: def.kind,
    label: def.label,
    w: def.defaults.w,
    d: def.defaults.d,
    minW: def.defaults.minW,
    minD: def.defaults.minD,
  };
}

export function catalogLabel(kind: string): string {
  return catalogItem(kind).label;
}
