import type { CatalogCategory, CatalogItem, ItemDef } from './types';
import { CATEGORIES } from './types';

import bed from './defs/bed';
import closet from './defs/closet';
import chair from './defs/chair';
import cornerTable from './defs/corner-table';
import doubleBed from './defs/double-bed';
import sofa from './defs/sofa';
import table from './defs/table';

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
  collisionShapes: (w, d) => {
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
  },
  resizeMode: 'bbox',
};

export function getItemDef(kind: string): ItemDef | null {
  return DEF_MAP.get(kind) ?? null;
}

export function getFallbackDef(): ItemDef {
  return FALLBACK_DEF;
}

export function catalogItem(kind: string): CatalogItem {
  const def = DEF_MAP.get(kind);
  if (def)
    return {
      kind: def.kind,
      label: def.label,
      w: def.defaults.w,
      d: def.defaults.d,
      minW: def.defaults.minW,
      minD: def.defaults.minD,
    };
  return FALLBACK_ITEM;
}

export function catalogLabel(kind: string): string {
  return catalogItem(kind).label;
}
