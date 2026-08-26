/**
 * Catalog of placeable items, grouped by category. Adding a new item is a
 * data change: append an entry here and (optionally) a drawing case in
 * FurnitureView.svelte — everything else (library UI, ops, persistence)
 * works off `kind`.
 * Pure data — imported by ops/validate/tests, so no `$app/*` here.
 */

export interface CatalogItem {
  /** stable id referenced by RoomObject.kind */
  kind: string;
  label: string;
  /** default size, cm */
  w: number;
  d: number;
  /** resize floor, cm */
  minW: number;
  minD: number;
}

export interface CatalogCategory {
  id: string;
  label: string;
  items: CatalogItem[];
}

const item = (kind: string, label: string, w: number, d: number, minW?: number, minD?: number): CatalogItem => ({
  kind,
  label,
  w,
  d,
  minW: minW ?? Math.round(w * 0.5),
  minD: minD ?? Math.round(d * 0.5),
});

export const CATALOG: CatalogCategory[] = [
  {
    id: 'bedroom',
    label: 'Bedroom',
    items: [item('bed', 'Bed', 90, 200, 70, 150), item('double-bed', 'Double bed', 160, 200, 120, 180)],
  },
  {
    id: 'living-room',
    label: 'Living room',
    items: [
      item('chair', 'Chair', 45, 50, 30, 30),
      item('sofa', 'Sofa', 200, 90, 100, 60),
      item('table', 'Table', 120, 80, 50, 40),
      item('corner-table', 'Corner table', 60, 60, 30, 30),
      item('closet', 'Closet', 120, 60, 50, 40),
    ],
  },
];

/** Fallback for kinds without a catalog entry (legacy/foreign docs). */
export const FALLBACK_ITEM: CatalogItem = item('unknown', 'Item', 60, 60, 30, 30);

export function catalogItem(kind: string): CatalogItem {
  for (const c of CATALOG) {
    const hit = c.items.find((i) => i.kind === kind);
    if (hit) return hit;
  }
  return FALLBACK_ITEM;
}

export function catalogLabel(kind: string): string {
  return catalogItem(kind).label;
}
