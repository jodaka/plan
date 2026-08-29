import { dist, fmtCm, snapPt, type Pt } from '../geometry';
import { findJointNear } from '../model/ops';
import { plan } from '../stores/plan.svelte';
import { ui } from '../stores/ui.svelte';
import { viewport } from '../stores/viewport.svelte';

const ATTACH_PX = 12;

/** One completed measurement: two world points, cm */
export interface Ruler {
  a: Pt;
  b: Pt;
}

function resolveMeasurePoint(raw: Pt): Pt {
  if (!ui.snapEnabled) {
    return raw;
  }
  const near = findJointNear(plan.doc, raw, ATTACH_PX / viewport.scale);
  if (near) {
    return { x: near.x, y: near.y };
  }
  return snapPt(raw);
}

// UI-only measurement state: completed rulers accumulate and are never part
// of the document, history or exports; `anchor` is the pending first point
let rulers = $state.raw<Ruler[]>([]);
let anchor = $state<Pt | null>(null);
let cursorWorld = $state<Pt>({ x: 0, y: 0 });

const preview = $derived.by(() => {
  if (!anchor) {
    return null;
  }
  const b = resolveMeasurePoint(cursorWorld);
  const mid = viewport.toScreen((anchor.x + b.x) / 2, (anchor.y + b.y) / 2);
  return { a: anchor, b, label: { x: mid.x, y: mid.y - 14, text: `${fmtCm(dist(anchor, b))} cm` } };
});

/** ruler tool: click places the start point, a second click completes the
 * measurement and the next click starts a new one; Esc or leaving the tool
 * clears everything */
export const ruler = {
  get rulers(): Ruler[] {
    return rulers;
  },
  get preview() {
    return preview;
  },
  /** true while the first point is placed but not yet the second */
  get active(): boolean {
    return anchor !== null;
  },
  /** a click in ruler-tool mode: sets the start point or completes a measurement */
  pointerDown(world: Pt): void {
    const p = resolveMeasurePoint(world);
    if (!anchor) {
      anchor = p;
      cursorWorld = p;
      return;
    }
    if (dist(anchor, p) > 0) {
      rulers = [...rulers, { a: anchor, b: p }];
    }
    anchor = null; // next click starts a new ruler
  },
  /** tracks the cursor so the live preview follows it */
  move(world: Pt): void {
    if (anchor) {
      cursorWorld = world;
    }
  },
  clear(): void {
    rulers = [];
    anchor = null;
  },
};
