import { axisAlign, fmtCm, snapPt, type Pt } from '../geometry';
import { findJointNear, moveJoint, violatedOpeningFloors, wallOpeningSpanCm, wallsAtJoint } from '../model/ops';
import { m } from '../paraglide/messages';
import { plan } from '../stores/plan.svelte';
import { ui } from '../stores/ui.svelte';
import { viewport } from '../stores/viewport.svelte';
import type { JointId } from '../types';
import { drafts } from './drafts.svelte';

const ATTACH_PX = 12;

/** snapped drag position for a joint: grid + axis-align to the walls it belongs to */
function resolveDragPoint(jointId: JointId, raw: Pt): Pt {
  const doc = plan.doc;
  if (!ui.snapEnabled) {
    return raw;
  }
  const near = findJointNear(doc, raw, ATTACH_PX / viewport.scale);
  if (near && near.id !== jointId) {
    return { x: near.x, y: near.y };
  }
  let p = snapPt(raw);
  for (const w of wallsAtJoint(doc, jointId)) {
    const otherId = w.startJointId === jointId ? w.endJointId : w.startJointId;
    const o = doc.joints[otherId];
    if (!o) {
      continue;
    }
    const align = axisAlign(o, p);
    if (align === 'h') {
      p = { x: p.x, y: o.y };
    } else if (align === 'v') {
      p = { x: o.x, y: p.y };
    }
  }
  return p;
}

let dragJointId = $state<JointId | null>(null);
let dragMoved = false;

/** joint drag gesture: grab a joint handle, reshape attached walls, commit at
 * gesture end — rejected with a toast when a wall would shrink below its openings */
export const jointDrag = {
  get active(): boolean {
    return dragJointId !== null;
  },
  /** the joint being dragged (drives which walls highlight) */
  get activeId(): JointId | null {
    return dragJointId;
  },
  start(jointId: JointId): void {
    dragJointId = jointId;
    dragMoved = false;
  },
  apply(world: Pt): void {
    if (!dragJointId) {
      return;
    }
    dragMoved = true;
    drafts.setJoint(dragJointId, resolveDragPoint(dragJointId, world));
  },
  commit(): void {
    const id = dragJointId;
    const p = id !== null ? drafts.joints[id] : undefined;
    if (id !== null && dragMoved && p) {
      const candidate = moveJoint(plan.doc, id, p);
      const bad = violatedOpeningFloors(candidate);
      if (bad.length > 0) {
        // shrinking a wall below its openings is rejected — they keep their lengths
        ui.showError(
          m.canvas__errorJointMoveRejected({
            min: fmtCm(Math.max(...bad.map((wid) => wallOpeningSpanCm(plan.doc, wid)))),
          }),
        );
      } else {
        plan.commit(m.history__moveJoint(), candidate);
      }
    }
    this.cancel();
  },
  cancel(): void {
    dragJointId = null;
    dragMoved = false;
    drafts.clearJoints();
  },
};
