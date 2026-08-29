import { snap, type Pt } from '../geometry';
import { moveRoom, roomLoopJoints } from '../model/ops';
import { m } from '../paraglide/messages';
import { plan } from '../stores/plan.svelte';
import { ui } from '../stores/ui.svelte';
import type { JointId, WallId } from '../types';
import { drafts } from './drafts.svelte';
import type { Room } from '../model/rooms';

interface RoomDrag {
  key: string;
  wallIds: WallId[];
  /** joint positions at grab time — the delta is applied to these */
  origins: Record<JointId, Pt>;
  start: Pt;
}

let roomDrag: RoomDrag | null = null;

/** room drag gesture: the m² label is the handle; the whole loop translates
 * rigidly (joint drafts carry the live preview), commit at gesture end */
export const roomDragGesture = {
  get active(): boolean {
    return roomDrag !== null;
  },
  start(room: Room, world: Pt): void {
    const joints = roomLoopJoints(plan.doc, room.wallIds);
    if (!joints) {
      // a corner is shared with walls outside the room — moving would stretch
      // them silently (§7); reshaping at the joints is the way to change these
      ui.showError(m.canvas__errorRoomAttached());
      return;
    }
    ui.selectRoom(room.key); // a click on the label selects; dragging moves
    const origins: Record<JointId, Pt> = {};
    for (const jid of joints) {
      const j = plan.doc.joints[jid];
      if (j) {
        origins[jid] = { x: j.x, y: j.y };
      }
    }
    roomDrag = { key: room.key, wallIds: [...room.wallIds], origins, start: world };
  },
  apply(world: Pt): void {
    if (!roomDrag) {
      return;
    }
    // snap the DELTA (not the positions): the room keeps its exact shape even
    // over legacy fractional joints (same rule as the old wall-body drag, §7)
    const dx = ui.snapEnabled ? snap(world.x - roomDrag.start.x) : world.x - roomDrag.start.x;
    const dy = ui.snapEnabled ? snap(world.y - roomDrag.start.y) : world.y - roomDrag.start.y;
    for (const [jid, p] of Object.entries(roomDrag.origins)) {
      drafts.setJoint(jid, { x: p.x + dx, y: p.y + dy });
    }
  },
  commit(): void {
    const drag = roomDrag;
    roomDrag = null;
    const first = Object.entries(drafts.joints)[0];
    if (!drag || !first) {
      drafts.clearJoints();
      return;
    }
    const origin = drag.origins[first[0]];
    const candidate = moveRoom(plan.doc, drag.wallIds, drag.key, {
      x: first[1].x - origin.x,
      y: first[1].y - origin.y,
    });
    drafts.clearJoints();
    // moveRoom is a rigid translation — no opening floors can be violated; it
    // returns the doc unchanged for non-movable rooms, and commit no-ops then
    plan.commit(m.history__moveRoom(), candidate);
  },
  cancel(): void {
    roomDrag = null;
    drafts.clearJoints();
  },
};
