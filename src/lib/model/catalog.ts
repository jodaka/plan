/**
 * Compatibility shim — catalog now lives in `src/lib/items/` (one file per
 * item, see `items/types.ts` + `items/defs/*` + `items/views/*`). This module
 * re-exports the real implementation so `model/catalog` imports and
 * `bun:test` paths keep working.
 */

export type { CatalogCategory, CatalogItem } from '../items/types';
export {
  CATALOG,
  FALLBACK_ITEM,
  catalogItem,
  catalogLabel,
  getItemDef,
  getFallbackDef,
  ITEM_DEFS,
} from '../items/registry';
