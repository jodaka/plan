import { axisAlign, dist, fmtCm, snapPt, type Pt } from '../geometry';
import { addWall, findJointNear, MIN_WALL_LENGTH } from '../model/ops';
import { m } from '../paraglide/messages';
import { plan } from '../stores/plan.svelte';
import { ui } from '../stores/ui.svelte';
import { viewport } from '../stores/viewport.svelte';
import type { JointId } from '../types';

const ATTACH_PX = 12;

function resolveDrawPoint(raw: Pt): { p: Pt; attach: JointId | null } {
  const doc = plan.doc;
  if (!ui.snapEnabled) {
    return { p: raw, attach: null };
  }
  const near = findJointNear(doc, raw, ATTACH_PX / viewport.scale);
  if (near) {
    return { p: { x: near.x, y: near.y }, attach: near.id };
  }
  let p = snapPt(raw);
  if (anchor) {
    const align = axisAlign(anchor, p);
    if (align === 'h') {
      p = { x: p.x, y: anchor.y };
    } else if (align === 'v') {
      p = { x: anchor.x, y: p.y };
    }
  }
  return { p, attach: null };
}

// wall-chain drawing state: anchor is the current chain corner, cursorWorld
// feeds the live preview
let drawActive = $state(false);
let anchor = $state<Pt | null>(null);
let cursorWorld = $state<Pt>({ x: 0, y: 0 });

const previewEnd = $derived.by(() => {
  if (!drawActive || !anchor) {
    return null;
  }
  return resolveDrawPoint(cursorWorld);
});

const previewLabel = $derived.by(() => {
  if (!drawActive || !anchor || !previewEnd) {
    return null;
  }
  const mid = viewport.toScreen((anchor.x + previewEnd.p.x) / 2, (anchor.y + previewEnd.p.y) / 2);
  return { x: mid.x, y: mid.y - 14, text: `${fmtCm(dist(anchor, previewEnd.p))} cm` };
});

/** chained wall drawing: first click places the anchor, further clicks append
 * walls; clicking back onto the chain start (or right-click / Esc) ends it */
export const drawWall = {
  get active(): boolean {
    return drawActive;
  },
  get anchor(): Pt | null {
    return anchor;
  },
  get previewEnd() {
    return previewEnd;
  },
  get previewLabel() {
    return previewLabel;
  },
  /** tracks the cursor so the live preview follows it */
  move(world: Pt): void {
    if (drawActive) {
      cursorWorld = world;
    }
  },
  /** a click in draw-tool mode: starts the chain or appends a wall */
  pointerDown(world: Pt): void {
    const res = resolveDrawPoint(world);
    if (!drawActive || !anchor) {
      drawActive = true;
      anchor = res.p;
      return;
    }
    if (dist(res.p, anchor) >= MIN_WALL_LENGTH) {
      const added = addWall(plan.doc, anchor, res.p, { attachTolCm: 0.01 });
      if (added.wallId) {
        plan.commit(m.history__addWall(), added.doc);
      }
      anchor = res.p;
    } else {
      this.end(); // clicked back onto the chain start — close the chain
    }
  },
  end(): void {
    drawActive = false;
    anchor = null;
  },
};
