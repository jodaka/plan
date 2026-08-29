import {
  polygonContainsPoint,
  polysInside,
  shrinkPolygon,
  transformPolys,
  polygonsIntersect,
  type Pt,
} from '../geometry';
import { catalogItem, collisionPolys } from '../items/registry';
import { addRoomItem } from '../model/ops';
import { m } from '../paraglide/messages';
import { plan } from '../stores/plan.svelte';
import { ui } from '../stores/ui.svelte';
import type { Room } from '../model/rooms';
import { COLLISION_EPS, scene } from './scene.svelte';

export interface ItemGhost {
  sx: number;
  sy: number;
  w: number;
  d: number;
  overRoom: boolean;
  valid: boolean;
}

// library drag: a catalog kind is being carried from the panel over the
// canvas; the ghost follows the cursor until drop/escape
let itemGhost = $state<ItemGhost | null>(null);

/** validity of a would-be drop at `world` (true-shape aware): the item must
 * sit fully inside a room without touching walls */
function dropInfo(kind: string, world: Pt): { room: Room | null; valid: boolean } {
  const room = scene.rooms.find((r) => polygonContainsPoint(r.pts, world)) ?? null;
  if (!room) {
    return { room: null, valid: false };
  }
  const cat = catalogItem(kind);
  const local = collisionPolys(kind, cat.w, cat.d);
  const worldPolys = transformPolys(local, world.x, world.y, 0);
  const shrunk = worldPolys.map((p: Pt[]) => shrinkPolygon(p, COLLISION_EPS));
  const valid =
    polysInside(shrunk, room.innerPts) &&
    !shrunk.some((sp: Pt[]) => scene.wallPolys.some((wp: Pt[]) => polygonsIntersect(sp, wp)));
  return { room, valid };
}

/** library drop gesture: places a new room item from the palette into a room */
export const libraryDrop = {
  get ghost(): ItemGhost | null {
    return itemGhost;
  },
  setGhost(g: ItemGhost | null): void {
    itemGhost = g;
  },
  dropInfo,
  /** adds the item (assumes validity was checked with dropInfo) and selects it */
  place(kind: string, label: string, room: Room, world: Pt): void {
    const res = addRoomItem(plan.doc, room.key, kind, world);
    if (res.item) {
      plan.commit(m.history__addItem({ label }), res.doc);
      ui.selectItem(res.item.id);
    }
  },
  /** error for a drop attempt outside any room */
  showOutsideRoomError(): void {
    ui.showError(m.canvas__errorDropOutsideRoom());
  },
  /** error for a drop attempt that violates walls/room bounds */
  showInvalidError(label: string): void {
    ui.showError(m.canvas__errorItemInvalid({ label }));
  },
};
