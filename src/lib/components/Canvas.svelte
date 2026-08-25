<script lang="ts">
import AngleArcs from '$lib/components/AngleArcs.svelte';
import WallDims from '$lib/components/WallDims.svelte';
import WallView from '$lib/components/WallView.svelte';
import {
  addPt,
  angleBetweenDeg,
  axisAlign,
  dist,
  fmtCm,
  mul,
  type Pt,
  snapPt,
  sub,
  unit,
  vectorAngleDeg,
  type WallEndNeighbor,
  wallCorners,
} from '$lib/geometry';
import { addWall, docBBox, findJointNear, jointExtCm, MIN_WALL_LENGTH, moveJoint, wallsAtJoint } from '$lib/model/ops';
import { plan } from '$lib/stores/plan.svelte';
import { ui } from '$lib/stores/ui.svelte';
import { viewport } from '$lib/stores/viewport.svelte';
import { DEFAULT_THICKNESS, type Joint, type JointId, type WallId } from '$lib/types';

const ATTACH_PX = 12;
const ZOOM_WHEEL_SENSITIVITY = 0.0015;
const ZOOM_PINCH_SENSITIVITY = 0.01;

let svgEl: SVGSVGElement | undefined = $state();
let wrapW = $state(0);
let wrapH = $state(0);

// gesture state that rendering depends on
let spaceHeld = $state(false);
let panning = $state(false);
let panLast: Pt | null = null;

let drawActive = $state(false);
let anchor = $state<Pt | null>(null);
let cursorWorld = $state<Pt>({ x: 0, y: 0 });

type Drafts = Record<JointId, Pt>;
let drafts = $state.raw<Drafts>({});
let dragJointId = $state<JointId | null>(null);

// gesture state NOT used by rendering
let dragMoved = false;
let fitted = false;

function endDraw() {
  drawActive = false;
  anchor = null;
}

function finishDrag() {
  dragJointId = null;
  dragMoved = false;
  drafts = {};
}

// reset an active wall chain whenever the tool changes away from draw
$effect(() => {
  if (ui.tool !== 'draw') endDraw();
});

$effect(() => {
  viewport.setViewSize(wrapW, wrapH);
  if (!fitted && wrapW > 0 && wrapH > 0) {
    fitted = true;
    viewport.fit(docBBox(plan.doc));
  }
});

// wheel must be a non-passive listener for preventDefault to work
$effect(() => {
  const el = svgEl;
  if (!el) return;
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? ZOOM_PINCH_SENSITIVITY : ZOOM_WHEEL_SENSITIVITY));
    viewport.zoomAt(e.clientX - r.left, e.clientY - r.top, factor);
  };
  el.addEventListener('wheel', onWheel, { passive: false });
  return () => el.removeEventListener('wheel', onWheel);
});

const renderJoints = $derived.by<Record<string, Joint>>(() => {
  const r: Record<string, Joint> = { ...plan.doc.joints };
  for (const [id, p] of Object.entries(drafts)) {
    const j = r[id];
    if (j) r[id] = { ...j, x: p.x, y: p.y };
  }
  return r;
});

/** thickest OTHER wall at each wall end (direction into it + thickness) —
 * drives the mitered corner geometry and the inner-span math */
const wallEndNeighbors = $derived.by<Record<string, { start: WallEndNeighbor | null; end: WallEndNeighbor | null }>>(
  () => {
    const res: Record<string, { start: WallEndNeighbor | null; end: WallEndNeighbor | null }> = {};
    for (const w of Object.values(plan.doc.walls)) {
      const thickest = (jid: JointId): WallEndNeighbor | null => {
        const j = plan.doc.joints[jid];
        if (!j) return null;
        let best: WallEndNeighbor | null = null;
        for (const o of Object.values(plan.doc.walls)) {
          if (o.id === w.id) continue;
          if (o.startJointId !== jid && o.endJointId !== jid) continue;
          const oid = o.startJointId === jid ? o.endJointId : o.startJointId;
          const oj = plan.doc.joints[oid];
          if (!oj) continue;
          if (!best || o.thickness > best.t) {
            best = { dir: unit(sub(oj, j)), t: o.thickness };
          }
        }
        return best;
      };
      res[w.id] = { start: thickest(w.startJointId), end: thickest(w.endJointId) };
    }
    return res;
  },
);

/** per wall-end corner extension: half of the thickest OTHER wall at that joint */
const wallExts = $derived.by<Record<string, { start: number; end: number }>>(() => {
  const res: Record<string, { start: number; end: number }> = {};
  for (const [id, e] of Object.entries(wallEndNeighbors)) {
    res[id] = { start: (e.start?.t ?? 0) / 2, end: (e.end?.t ?? 0) / 2 };
  }
  return res;
});

/** walls rendered with full selection treatment: the selected wall — or,
 * while a joint is being dragged — every wall attached to that joint, so
 * all affected lengths/angles annotate automatically */
const highlightIds = $derived.by<WallId[]>(() => {
  if (dragJointId) return wallsAtJoint(plan.doc, dragJointId).map((w) => w.id);
  return ui.selectedWallId ? [ui.selectedWallId] : [];
});

// handles live in a top-level layer so wall hit-lines can never cover them
const handleJoints = $derived.by<Joint[]>(() => {
  const seen = new Set<JointId>();
  const out: Joint[] = [];
  for (const id of highlightIds) {
    const w = plan.doc.walls[id];
    if (!w) continue;
    for (const jid of [w.startJointId, w.endJointId]) {
      if (seen.has(jid)) continue;
      seen.add(jid);
      const j = renderJoints[jid];
      if (j) out.push(j);
    }
  }
  return out;
});

interface DimData {
  ra: Pt;
  rb: Pt;
  innerA: Pt;
  innerB: Pt;
  outerN: Pt;
  thickness: number;
  scale: number;
  outer: number;
  inner: number;
}

interface Highlight {
  id: WallId;
  corners: [Pt, Pt, Pt, Pt];
  ra: Pt;
  rb: Pt;
  t: number;
  dims: DimData;
}

// selection highlight + dimension lines live in the same top layer: wall
// paint order would otherwise cover the ends of the selected walls at corners
const highlights = $derived.by<Highlight[]>(() => {
  const out: Highlight[] = [];
  for (const id of highlightIds) {
    const w = plan.doc.walls[id];
    if (!w) continue;
    const a = renderJoints[w.startJointId];
    const b = renderJoints[w.endJointId];
    if (!a || !b) continue;
    const exts = wallExts[id] ?? { start: 0, end: 0 };
    const ends = wallEndNeighbors[id] ?? { start: null, end: null };
    const corners = wallCorners(a, b, w.thickness, ends.start, ends.end);
    // corners order: [A_plus, B_plus, B_minus, A_minus] (+ = +perp(u) side)

    // outer side = opposite of where the connected walls extend (they
    // extend into the room); free ends keep the default normal side
    const u = unit(sub(b, a));
    const n0 = { x: -u.y, y: u.x };
    const nb = wallsAtJoint(plan.doc, w.startJointId).find((o) => o.id !== w.id);
    let outerN = n0;
    if (nb) {
      const oid = nb.startJointId === w.startJointId ? nb.endJointId : nb.startJointId;
      const o = plan.doc.joints[oid];
      if (o && n0.x * (o.x - a.x) + n0.y * (o.y - a.y) > 0) outerN = mul(n0, -1);
    }
    // dimension anchors: the polygon corners on the outer side
    const nx = -u.y;
    const ny = u.x;
    const outerIsPlus = nx * outerN.x + ny * outerN.y >= 0; // dot(perp(u), outerN)
    const ra = outerIsPlus ? corners[0] : corners[3];
    const rb = outerIsPlus ? corners[1] : corners[2];

    // inner-face span endpoints: guidelines start at the wall edge
    const innerN = mul(outerN, -1);
    const innerA = addPt(addPt(a, mul(u, exts.start)), mul(innerN, w.thickness / 2));
    const innerB = addPt(addPt(b, mul(u, -exts.end)), mul(innerN, w.thickness / 2));
    out.push({
      id,
      corners,
      ra,
      rb,
      t: w.thickness,
      dims: {
        ra,
        rb,
        innerA,
        innerB,
        outerN,
        thickness: w.thickness,
        scale: viewport.scale,
        outer: dist(ra, rb),
        inner: Math.max(0, dist(innerA, innerB)),
      },
    });
  }
  return out;
});

/** angle arcs between each highlighted wall and the walls attached at its joints */
const selArcs = $derived.by<ArcInfo[]>(() => {
  const arcs: ArcInfo[] = [];
  if (highlightIds.length === 0) return arcs;
  const seen = new Set<string>();
  for (const id of highlightIds) {
    const w = plan.doc.walls[id];
    if (!w) continue;
    for (const jid of [w.startJointId, w.endJointId]) {
      const j = renderJoints[jid];
      const oW = renderJoints[jid === w.startJointId ? w.endJointId : w.startJointId];
      if (!j || !oW) continue;
      const dW = unit(sub(oW, j));
      for (const nb of wallsAtJoint(plan.doc, jid)) {
        if (nb.id === w.id) continue;
        // the same wall pair is visited from both sides — dedupe
        const key = `${jid}:${[w.id, nb.id].sort().join(':')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const nOid = nb.startJointId === jid ? nb.endJointId : nb.startJointId;
        const nO = renderJoints[nOid];
        if (!nO) continue;
        const dN = unit(sub(nO, j));
        const ang = angleBetweenDeg(vectorAngleDeg(dW), vectorAngleDeg(dN));
        if (ang > 179) continue; // collinear continuation — no corner to annotate

        // arc from wall EDGE to wall EDGE: radius clears both wall
        // halves; endpoints are the circle's intersections with each
        // wall's face line on the side facing the other wall.
        // 1.5×: user preference — arcs sit away from the corner
        const r = 1.5 * Math.max(30 / viewport.scale, Math.max(w.thickness, nb.thickness) / 2 + 8 / viewport.scale);
        const facePoint = (dSelf: Pt, dOther: Pt, tSelf: number) => {
          let n = { x: -dSelf.y, y: dSelf.x };
          if (n.x * dOther.x + n.y * dOther.y < 0) n = { x: -n.x, y: -n.y };
          const half = tSelf / 2;
          const s = Math.sqrt(Math.max(0, r * r - half * half));
          return addPt(addPt(j, mul(n, half)), mul(dSelf, s));
        };
        const p1 = facePoint(dW, dN, w.thickness);
        const p2 = facePoint(dN, dW, nb.thickness);
        const a1 = vectorAngleDeg(sub(p1, j));
        const a2 = vectorAngleDeg(sub(p2, j));
        const delta = (a2 - a1 + 360) % 360;
        const sweep = delta <= 180 ? 1 : 0;
        const midRad = ((a1 + (sweep === 1 ? delta : -(360 - delta)) / 2) * Math.PI) / 180;
        arcs.push({
          p1,
          p2,
          r,
          sweep,
          lp: {
            x: j.x + Math.cos(midRad) * (r + 14 / viewport.scale),
            y: j.y + Math.sin(midRad) * (r + 14 / viewport.scale),
          },
          text: `${fmtCm(ang)}°`,
        });
      }
    }
  }
  return arcs;
});

const visibleRect = $derived.by(() => {
  const tl = viewport.toWorld(0, 0);
  const br = viewport.toWorld(wrapW, wrapH);
  return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
});

const grid = $derived.by(() => {
  if (!ui.showGrid) return null;
  const steps = [1, 5, 10, 50, 100, 500];
  const step = steps.find((s) => s * viewport.scale >= 8) ?? 1000;
  const r = visibleRect;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let x = Math.floor(r.x / step) * step; x <= r.x + r.w; x += step) xs.push(x);
  for (let y = Math.floor(r.y / step) * step; y <= r.y + r.h; y += step) ys.push(y);
  return { xs, ys, r };
});

function resolveDrawPoint(raw: Pt): { p: Pt; attach: JointId | null } {
  const doc = plan.doc;
  if (!ui.snapEnabled) return { p: raw, attach: null };
  const near = findJointNear(doc, raw, ATTACH_PX / viewport.scale);
  if (near) return { p: { x: near.x, y: near.y }, attach: near.id };
  let p = snapPt(raw);
  if (anchor) {
    const align = axisAlign(anchor, p);
    if (align === 'h') p = { x: p.x, y: anchor.y };
    else if (align === 'v') p = { x: anchor.x, y: p.y };
  }
  return { p, attach: null };
}

const previewEnd = $derived.by(() => {
  if (!drawActive || !anchor) return null;
  return resolveDrawPoint(cursorWorld);
});

const previewLabel = $derived.by(() => {
  if (!drawActive || !anchor || !previewEnd) return null;
  const mid = viewport.toScreen((anchor.x + previewEnd.p.x) / 2, (anchor.y + previewEnd.p.y) / 2);
  return { x: mid.x, y: mid.y - 14, text: `${fmtCm(dist(anchor, previewEnd.p))} cm` };
});

interface ArcInfo {
  p1: Pt;
  p2: Pt;
  r: number;
  sweep: number;
  lp: Pt;
  text: string;
}

function resolveDragPoint(jointId: JointId, raw: Pt): Pt {
  const doc = plan.doc;
  if (!ui.snapEnabled) return raw;
  const near = findJointNear(doc, raw, ATTACH_PX / viewport.scale);
  if (near && near.id !== jointId) return { x: near.x, y: near.y };
  let p = snapPt(raw);
  for (const w of wallsAtJoint(doc, jointId)) {
    const otherId = w.startJointId === jointId ? w.endJointId : w.startJointId;
    const o = doc.joints[otherId];
    if (!o) continue;
    const align = axisAlign(o, p);
    if (align === 'h') p = { x: p.x, y: o.y };
    else if (align === 'v') p = { x: o.x, y: p.y };
  }
  return p;
}

function localPt(e: PointerEvent): Pt {
  if (!svgEl) return { x: 0, y: 0 };
  const r = svgEl.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function onPointerDown(e: PointerEvent) {
  if (!svgEl || (panning && spaceHeld)) return;
  try {
    svgEl.setPointerCapture(e.pointerId);
  } catch {
    // no active pointer with this id (e.g. synthetic events) — safe to ignore
  }
  const lp = localPt(e);
  const world = viewport.toWorld(lp.x, lp.y);

  if (spaceHeld || e.button === 1) {
    panning = true;
    panLast = lp;
    return;
  }
  if (e.button !== 0) return;

  const target = e.target as Element;
  const jointHit = target.closest('[data-joint-id]')?.getAttribute('data-joint-id') ?? null;
  const wallHit = target.closest('[data-wall-id]')?.getAttribute('data-wall-id') ?? null;

  if (ui.tool === 'draw') {
    const res = resolveDrawPoint(world);
    if (!drawActive || !anchor) {
      drawActive = true;
      anchor = res.p;
      return;
    }
    if (dist(res.p, anchor) >= MIN_WALL_LENGTH) {
      const added = addWall(plan.doc, anchor, res.p, { attachTolCm: 0.01 });
      if (added.wallId) plan.commit('Add wall', added.doc);
      anchor = res.p;
    } else {
      endDraw(); // clicked back onto the chain start — close the chain
    }
    return;
  }

  if (jointHit && plan.doc.joints[jointHit]) {
    dragJointId = jointHit;
    dragMoved = false;
    return;
  }
  if (wallHit && plan.doc.walls[wallHit]) {
    // walls are selected but not translatable: moving a whole wall would
    // silently change connected walls' lengths and angles (see decisions §7)
    ui.select(wallHit);
    return;
  }
  ui.select(null);
  endDraw();
}

function onPointerMove(e: PointerEvent) {
  const lp = localPt(e);
  cursorWorld = viewport.toWorld(lp.x, lp.y);

  if (panning && panLast) {
    viewport.panBy(lp.x - panLast.x, lp.y - panLast.y);
    panLast = lp;
    return;
  }
  if (dragJointId) {
    dragMoved = true;
    drafts = { ...drafts, [dragJointId]: resolveDragPoint(dragJointId, cursorWorld) };
  }
}

function onPointerUp(e: PointerEvent) {
  try {
    svgEl?.releasePointerCapture?.(e.pointerId);
  } catch {
    // pointer not captured — nothing to release
  }
  panning = false;
  panLast = null;

  if (dragJointId) {
    const p = drafts[dragJointId];
    if (dragMoved && p) plan.commit('Move joint', moveJoint(plan.doc, dragJointId, p));
  }
  finishDrag();
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault();
  endDraw();
}

function onKeyDown(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.code === 'Space') {
    e.preventDefault();
    spaceHeld = true;
  } else if (e.key === 'Escape') {
    endDraw();
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') spaceHeld = false;
}

const cursorClass = $derived.by(() => {
  if (panning) return 'cursor-grabbing';
  if (spaceHeld) return 'cursor-grab';
  if (ui.tool === 'draw') return 'cursor-crosshair';
  return '';
});
</script>

<svelte:window onkeydown={onKeyDown} onkeyup={onKeyUp} />

<div class="canvas-wrap" bind:clientWidth={wrapW} bind:clientHeight={wrapH}>
  <svg
    bind:this={svgEl}
    class="canvas {cursorClass}"
    role="application"
    aria-label="Floor plan canvas"
    width={wrapW}
    height={wrapH}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    oncontextmenu={onContextMenu}>
    <g transform="translate({viewport.tx} {viewport.ty}) scale({viewport.scale})">
      {#if grid}
        {#each grid.xs as x (x)}
          <line
            x1={x}
            y1={grid.r.y}
            x2={x}
            y2={grid.r.y + grid.r.h}
            stroke="#e2e8f0"
            stroke-width={1 / viewport.scale} />
        {/each}
        {#each grid.ys as y (y)}
          <line
            x1={grid.r.x}
            y1={y}
            x2={grid.r.x + grid.r.w}
            y2={y}
            stroke="#e2e8f0"
            stroke-width={1 / viewport.scale} />
        {/each}
      {/if}

      {#each Object.values(plan.doc.walls) as wall (wall.id)}
        <WallView
          {wall}
          joints={renderJoints}
          neighbors={wallEndNeighbors[wall.id] ?? { start: null, end: null }}
          scale={viewport.scale} />
      {/each}

      <!-- joint dots: make connection points visible for closing chains -->
      {#each Object.values(renderJoints) as j (j.id)}
        <circle class="joint-dot" cx={j.x} cy={j.y} r={3 / viewport.scale} />
      {/each}

      {#each highlights as h (h.id)}
        {@const pts = h.corners.map((p) => `${p.x},${p.y}`).join(' ')}
        <polygon
          class="sel-overlay"
          points={pts}
          fill="#3b82f6"
          stroke="#3b82f6"
          stroke-width={6 / viewport.scale}
          opacity="0.35" />
        <polygon class="sel-overlay" points={pts} fill="#2563eb" />
        <WallDims {...h.dims} />
      {/each}
      <AngleArcs arcs={selArcs} scale={viewport.scale} />

      <!-- endpoint handles for the selected wall, above everything -->
      {#each handleJoints as j (j.id)}
        <circle
          class="handle"
          data-joint-id={j.id}
          cx={j.x}
          cy={j.y}
          r={6 / viewport.scale}
          stroke-width={2 / viewport.scale} />
      {/each}

      {#if drawActive && anchor && previewEnd}
        <line
          x1={anchor.x}
          y1={anchor.y}
          x2={previewEnd.p.x}
          y2={previewEnd.p.y}
          stroke="#64748b"
          stroke-width={DEFAULT_THICKNESS}
          stroke-dasharray="{10 / viewport.scale} {8 / viewport.scale}"
          opacity="0.65" />
        {#if previewEnd.attach}
          <circle
            cx={previewEnd.p.x}
            cy={previewEnd.p.y}
            r={9 / viewport.scale}
            fill="none"
            stroke="#16a34a"
            stroke-width={2 / viewport.scale} />
        {/if}
      {/if}
    </g>
  </svg>

  <div class="overlay" aria-hidden="true">
    {#if previewLabel}
      <span class="length-label" style:left="{previewLabel.x}px" style:top="{previewLabel.y}px">
        {previewLabel.text}
      </span>
    {/if}
  </div>

  {#if drawActive}
    <div class="banner">Click to place next corner · click same point, right-click or Esc to finish</div>
  {:else if Object.keys(plan.doc.walls).length === 0}
    <div class="banner">Press “Draw wall”, then click to place the first corner</div>
  {/if}

  <div class="status">
    {Math.round(cursorWorld.x)}
    · {Math.round(cursorWorld.y)} cm &nbsp;|&nbsp;
    {Math.round(viewport.zoomPct)}%
  </div>
</div>

<style>
.canvas-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  background: #ffffff;
  user-select: none;
}
svg.canvas {
  display: block;
  touch-action: none;
}
svg.canvas.cursor-crosshair {
  cursor: crosshair;
}
svg.canvas.cursor-grab {
  cursor: grab;
}
svg.canvas.cursor-grabbing {
  cursor: grabbing;
}
:global(svg.canvas .joint-dot) {
  fill: #64748b;
  pointer-events: none;
}
:global(svg.canvas .handle) {
  fill: #ffffff;
  stroke: #2563eb;
  cursor: grab;
}
:global(svg.canvas .sel-overlay) {
  pointer-events: none;
}
.overlay {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.length-label {
  position: absolute;
  transform: translate(-50%, -50%);
  background: #1e293b;
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;
  padding: 2px 7px;
  white-space: nowrap;
}
.banner {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(30, 41, 59, 0.92);
  color: #ffffff;
  font-size: 13px;
  border-radius: 8px;
  padding: 6px 12px;
  white-space: nowrap;
}
.status {
  position: absolute;
  left: 12px;
  bottom: 10px;
  font-size: 12px;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.85);
  padding: 2px 6px;
  border-radius: 6px;
  font-variant-numeric: tabular-nums;
}
</style>
