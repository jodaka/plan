import {
  addPt,
  polysBBox,
  rotatePt,
  snap,
  snapItemCenter,
  sub,
  transformPolys,
  vectorAngleDeg,
  type Pt,
  type SnapSegment,
} from '../geometry';
import { clampItemSize, collisionPolys } from '../items/registry';
import { moveItem, resizeItem, rotateItem } from '../model/ops';
import { m } from '../paraglide/messages';
import { plan } from '../stores/plan.svelte';
import { ui } from '../stores/ui.svelte';
import { viewport } from '../stores/viewport.svelte';
import type { RoomObject } from '../types';
import { drafts } from './drafts.svelte';
import { scene, type RenderItem } from './scene.svelte';

type ItemDrag =
  | { kind: 'move'; id: string; grabX: number; grabY: number }
  | { kind: 'resize'; id: string; sx: 1 | -1; sy: 1 | -1; fixed: Pt; rotation: number }
  | { kind: 'rotate'; id: string };

let itemDrag: ItemDrag | null = null;

const findItemView = (id: string) => scene.renderItems.find((i) => i.obj.id === id);

/** wall faces of the item's room (axis-aligned edges only) as snap targets */
function itemSnapWalls(view: RenderItem): SnapSegment[] {
  const room = scene.rooms.find((r) => r.key === view.obj.roomId);
  if (!room) {
    return [];
  }
  const segs: SnapSegment[] = [];
  const p = room.innerPts;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    if (Math.abs(a.x - b.x) < 1e-6) {
      segs.push({ axis: 'x', value: a.x, from: Math.min(a.y, b.y), to: Math.max(a.y, b.y) });
    } else if (Math.abs(a.y - b.y) < 1e-6) {
      segs.push({ axis: 'y', value: a.y, from: Math.min(a.x, b.x), to: Math.max(a.x, b.x) });
    }
  }
  return segs;
}

/** item drag gesture (move / corner-resize / rotate): drafts carry the live
 * preview, overlap tints recompute live, commit at gesture end — invalid
 * end states (wall/door overlap, leaving the room) are rejected with a toast */
export const itemDragGesture = {
  get active(): boolean {
    return itemDrag !== null;
  },
  startMove(id: string, world: Pt): void {
    const view = findItemView(id);
    if (!view) {
      return;
    }
    ui.selectItem(id);
    itemDrag = { kind: 'move', id, grabX: world.x - view.obj.x, grabY: world.y - view.obj.y };
  },
  startResize(id: string, corner: number): void {
    const view = findItemView(id);
    if (!view) {
      return;
    }
    ui.selectItem(id);
    const { obj } = view;
    const sx: 1 | -1 = corner === 0 || corner === 3 ? -1 : 1;
    const sy: 1 | -1 = corner === 0 || corner === 1 ? -1 : 1;
    // the opposite corner stays fixed for the whole gesture
    const fixed = addPt({ x: obj.x, y: obj.y }, rotatePt({ x: (-sx * obj.w) / 2, y: (-sy * obj.d) / 2 }, obj.rotation));
    itemDrag = { kind: 'resize', id, sx, sy, fixed, rotation: obj.rotation };
  },
  startRotate(id: string): void {
    const view = findItemView(id);
    if (!view) {
      return;
    }
    ui.selectItem(id);
    itemDrag = { kind: 'rotate', id };
  },
  apply(world: Pt): void {
    if (!itemDrag) {
      return;
    }
    const drag = itemDrag;
    const view = findItemView(drag.id);
    if (!view) {
      this.cancel();
      return;
    }
    const obj: RoomObject = view.obj;
    if (drag.kind === 'move') {
      let nx = world.x - drag.grabX;
      let ny = world.y - drag.grabY;
      if (ui.snapEnabled) {
        nx = snap(nx);
        ny = snap(ny);
      }
      // edge/center snapping uses the rotated item's AABB (true-shape aware)
      const localMove = collisionPolys(obj.kind, obj.w, obj.d);
      const worldMove = transformPolys(localMove, nx, ny, obj.rotation);
      const aabb = polysBBox(worldMove);
      const snapped = snapItemCenter(
        nx,
        ny,
        aabb.maxX - aabb.minX,
        aabb.maxY - aabb.minY,
        itemSnapWalls(view),
        scene.renderItems.filter((o) => o.obj.id !== drag.id).map((o) => o.aabb),
        8 / viewport.scale,
      );
      drafts.setItem(drag.id, { ...obj, x: snapped.x, y: snapped.y });
    } else if (drag.kind === 'resize') {
      const lv = rotatePt(sub(world, drag.fixed), -drag.rotation);
      const clamped = clampItemSize(obj.kind, drag.sx * lv.x, drag.sy * lv.y);
      const c = addPt(
        drag.fixed,
        rotatePt({ x: (drag.sx * clamped.w) / 2, y: (drag.sy * clamped.d) / 2 }, drag.rotation),
      );
      drafts.setItem(drag.id, { ...obj, x: c.x, y: c.y, w: clamped.w, d: clamped.d });
    } else {
      const ang = vectorAngleDeg(sub(world, obj)) + 90;
      const rotation = ui.snapEnabled ? Math.round(ang / 15) * 15 : ang;
      drafts.setItem(drag.id, { ...obj, rotation: ((rotation % 360) + 360) % 360 || 0 });
    }
  },
  commit(): void {
    const drag = itemDrag;
    itemDrag = null;
    const view = drag && findItemView(drag.id);
    if (!drag || !view) {
      drafts.clearItems();
      return;
    }
    const { obj, label, invalid } = view;
    drafts.clearItems();
    if (invalid) {
      // walls/openings/room bounds are hard constraints — reject like floors do
      ui.showError(m.canvas__errorItemInvalid({ label }));
      return;
    }
    if (drag.kind === 'move') {
      plan.commit(m.history__moveItem({ label }), moveItem(plan.doc, obj.id, obj.x, obj.y));
    } else if (drag.kind === 'resize') {
      plan.commit(m.history__resizeItem({ label }), resizeItem(plan.doc, obj.id, obj.w, obj.d));
    } else {
      plan.commit(m.history__rotateItem({ label }), rotateItem(plan.doc, obj.id, obj.rotation));
    }
  },
  cancel(): void {
    itemDrag = null;
    drafts.clearItems();
  },
};
