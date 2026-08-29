import { dist, snap, unit, type Pt } from '../geometry';
import { resizeDoor, resizeWindow, setDoorOffset, setWindowOffset } from '../model/ops';
import { m } from '../paraglide/messages';
import { plan } from '../stores/plan.svelte';
import { ui } from '../stores/ui.svelte';
import { MIN_DOOR_LENGTH, MIN_WINDOW_LENGTH, type WallId } from '../types';
import { drafts, type OpenDraft } from './drafts.svelte';
import { scene } from './scene.svelte';

export type OpenTarget = 'window' | 'door';

type OpenDrag =
  | { kind: 'slide'; target: OpenTarget; id: string; grab: number }
  | { kind: 'resize'; target: OpenTarget; id: string; side: 'start' | 'end' };

let openDrag: OpenDrag | null = null;

const minOpeningLength = (target: OpenTarget) => (target === 'window' ? MIN_WINDOW_LENGTH : MIN_DOOR_LENGTH);

/** draft values for an opening, falling back to its committed doc state */
function openBase(target: OpenTarget, id: string): OpenDraft | null {
  const rec = target === 'window' ? plan.doc.windows[id] : plan.doc.doors[id];
  return drafts.openings[id] ?? (rec ? { offset: rec.offset, length: rec.length } : null);
}

/** projection of a world point onto the wall axis: cm from the start joint */
function projOnWall(wallId: WallId, world: Pt): { s: number; len: number } | null {
  const w = plan.doc.walls[wallId];
  if (!w) return null;
  const a = scene.renderJoints[w.startJointId];
  const b = scene.renderJoints[w.endJointId];
  if (!a || !b) return null;
  const u = unit({ x: b.x - a.x, y: b.y - a.y });
  return { s: (world.x - a.x) * u.x + (world.y - a.y) * u.y, len: dist(a, b) };
}

function wallOf(target: OpenTarget, id: string): WallId | null {
  const rec = target === 'window' ? plan.doc.windows[id] : plan.doc.doors[id];
  return rec?.wallId ?? null;
}

function select(target: OpenTarget, id: string, wallId: WallId): void {
  ui.select(wallId); // clears any opening selection…
  if (target === 'window') ui.selectWindow(id);
  // …then selects this one; wall stays as context
  else ui.selectDoor(id);
}

/** opening drag gesture (windows + doors share the wall axis): slide the body
 * or resize via an end handle; commits at gesture end */
export const openingDrag = {
  get active(): boolean {
    return openDrag !== null;
  },
  startSlide(target: OpenTarget, id: string, world: Pt): void {
    const wallId = wallOf(target, id);
    const base = openBase(target, id);
    const proj = wallId && projOnWall(wallId, world);
    if (!wallId || !base || !proj) return;
    select(target, id, wallId);
    // snap the grab point too, so offset = snap(s) − grab stays on-grid
    openDrag = {
      kind: 'slide',
      target,
      id,
      grab: (ui.snapEnabled ? snap(proj.s) : proj.s) - base.offset,
    };
  },
  startResize(target: OpenTarget, id: string, side: 'start' | 'end', world: Pt): void {
    const wallId = wallOf(target, id);
    if (!wallId || !openBase(target, id) || !projOnWall(wallId, world)) return;
    select(target, id, wallId);
    openDrag = { kind: 'resize', target, id, side };
  },
  apply(world: Pt): void {
    if (!openDrag) return;
    const drag = openDrag;
    const base = openBase(drag.target, drag.id);
    const wallId = wallOf(drag.target, drag.id);
    const proj = wallId && projOnWall(wallId, world);
    if (!base || !proj) {
      this.cancel();
      return;
    }
    const minLen = minOpeningLength(drag.target);
    const q = (v: number) => (ui.snapEnabled ? snap(v) : v);
    const s = q(proj.s);
    let { offset, length } = base;
    if (drag.kind === 'slide') {
      offset = Math.max(0, Math.min(Math.max(0, proj.len - length), s - drag.grab));
    } else if (drag.side === 'start') {
      const end = offset + length;
      offset = Math.max(0, Math.min(end - minLen, s));
      length = end - offset;
    } else {
      const end = Math.max(offset + minLen, Math.min(proj.len, s));
      length = end - offset;
    }
    // quantize BOTH edges, then re-clamp — a fractional base (legacy doc) or a
    // quantized shift must never push the opening past the wall end
    offset = q(offset);
    length = q(length);
    offset = Math.max(0, Math.min(Math.max(0, proj.len - length), offset));
    drafts.setOpen(drag.id, { offset, length });
  },
  commit(): void {
    const d = openDrag && drafts.openings[openDrag.id];
    if (d && openDrag && wallOf(openDrag.target, openDrag.id)) {
      if (openDrag.target === 'window') {
        if (openDrag.kind === 'slide') {
          plan.commit(m.history__moveWindow(), setWindowOffset(plan.doc, openDrag.id, d.offset));
        } else {
          plan.commit(m.history__resizeWindow(), resizeWindow(plan.doc, openDrag.id, d.offset, d.length));
        }
      } else if (openDrag.kind === 'slide') {
        plan.commit(m.history__moveDoor(), setDoorOffset(plan.doc, openDrag.id, d.offset));
      } else {
        plan.commit(m.history__resizeDoor(), resizeDoor(plan.doc, openDrag.id, d.offset, d.length));
      }
    }
    this.cancel();
  },
  cancel(): void {
    openDrag = null;
    drafts.clearOpenings();
  },
};
