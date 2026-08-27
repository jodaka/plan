<script lang="ts">
import AngleArcs from '$lib/components/AngleArcs.svelte';
import DoorView from '$lib/components/DoorView.svelte';
import FurnitureView from '$lib/components/FurnitureView.svelte';
import GapHints from '$lib/components/GapHints.svelte';
import RoomView from '$lib/components/RoomView.svelte';
import WallDims from '$lib/components/WallDims.svelte';
import WallView from '$lib/components/WallView.svelte';
import WindowView from '$lib/components/WindowView.svelte';
import {
  addPt,
  angleBetweenDeg,
  axisAlign,
  dist,
  fmtCm,
  itemCorners,
  mul,
  polygonContainsPoint,
  polygonsIntersect,
  type Pt,
  ptsBBox,
  rotatePt,
  snap,
  snapItemCenter,
  snapPt,
  sub,
  unit,
  vectorAngleDeg,
  type SnapSegment,
  shrinkPolygon,
  type WallEndNeighbor,
  wallCorners,
} from '$lib/geometry';
import {
  addRoomItem,
  addWall,
  docBBox,
  findJointNear,
  MIN_WALL_LENGTH,
  moveItem,
  moveJoint,
  moveRoom,
  resizeDoor,
  resizeItem,
  resizeWindow,
  roomLoopJoints,
  rotateItem,
  setDoorOffset,
  setWindowOffset,
  violatedOpeningFloors,
  wallOpeningSpanCm,
  wallsAtJoint,
  openingGapBounds,
} from '$lib/model/ops';
import { catalogItem, catalogLabel } from '$lib/model/catalog';
import { findRooms, type Room } from '$lib/model/rooms';
import { plan } from '$lib/stores/plan.svelte';
import { ui } from '$lib/stores/ui.svelte';
import { viewport } from '$lib/stores/viewport.svelte';
import {
  DEFAULT_THICKNESS,
  MIN_DOOR_LENGTH,
  MIN_WINDOW_LENGTH,
  type Joint,
  type JointId,
  type RoomObject,
  type WallDoor,
  type WallId,
  type WallWindow,
} from '$lib/types';

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

// opening gestures (windows + doors share the wall axis): drafts drive
// rendering, openDrag is handler-only bookkeeping. Window and door ids are
// globally unique, so one draft record serves both kinds.
interface OpenDraft {
  offset: number;
  length: number;
}
let openDrafts = $state.raw<Record<string, OpenDraft>>({});
type OpenTarget = 'window' | 'door';
type OpenDrag =
  | { kind: 'slide'; target: OpenTarget; id: string; grab: number }
  | { kind: 'resize'; target: OpenTarget; id: string; side: 'start' | 'end' };
let openDrag: OpenDrag | null = null;

// gesture state NOT used by rendering
let dragMoved = false;
let fitted = false;

// room drag: the m² label is the handle; drafts drive the live preview (the
// whole room follows via renderJoints), roomDrag is handler-only bookkeeping
interface RoomDrag {
  key: string;
  wallIds: WallId[];
  /** joint positions at grab time — the delta is applied to these */
  origins: Record<JointId, Pt>;
  start: Pt;
}
let roomDrag: RoomDrag | null = null;

// item gestures: drafts drive rendering (position/size/rotation), itemDrag is
// handler-only bookkeeping. Overlap tints and validity recompute live.
interface ItemDraft {
  x: number;
  y: number;
  w: number;
  d: number;
  rotation: number;
}
let itemDrafts = $state.raw<Record<string, ItemDraft>>({});
type ItemDrag =
  | { kind: 'move'; id: string; grabX: number; grabY: number }
  | { kind: 'resize'; id: string; sx: 1 | -1; sy: 1 | -1; fixed: Pt; rotation: number }
  | { kind: 'rotate'; id: string };
let itemDrag: ItemDrag | null = null;

// library drag: a catalog kind is being carried from the panel over the
// canvas; the ghost follows the cursor until drop/escape
let itemGhost = $state<{ sx: number; sy: number; w: number; d: number; overRoom: boolean; valid: boolean } | null>(
  null,
);

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

/** closed wall figures — derived live from renderJoints so rooms follow
 * joint drags in real time; deleting any wall dissolves its room */
const rooms = $derived(findRooms(renderJoints, plan.doc.walls));

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

/** windows merged with drag drafts and resolved against rendered joints;
 * offsets are re-clamped here so previews stay honest mid-joint-drag */
const renderWindows = $derived.by<(WallWindow & { a: Pt; b: Pt; t: number })[]>(() => {
  const out: (WallWindow & { a: Pt; b: Pt; t: number })[] = [];
  for (const win of Object.values(plan.doc.windows)) {
    const w = plan.doc.walls[win.wallId];
    if (!w) continue;
    const a = renderJoints[w.startJointId];
    const b = renderJoints[w.endJointId];
    if (!a || !b) continue;
    const d = openDrafts[win.id];
    const length = Math.max(MIN_WINDOW_LENGTH, d?.length ?? win.length);
    const maxOff = Math.max(0, dist(a, b) - length);
    const offset = Math.max(0, Math.min(maxOff, d?.offset ?? win.offset));
    out.push({ ...win, offset, length, a, b, t: w.thickness });
  }
  return out;
});

/** doors, same draft merge + re-clamp treatment as windows */
const renderDoors = $derived.by<(WallDoor & { a: Pt; b: Pt; t: number })[]>(() => {
  const out: (WallDoor & { a: Pt; b: Pt; t: number })[] = [];
  for (const door of Object.values(plan.doc.doors)) {
    const w = plan.doc.walls[door.wallId];
    if (!w) continue;
    const a = renderJoints[w.startJointId];
    const b = renderJoints[w.endJointId];
    if (!a || !b) continue;
    const d = openDrafts[door.id];
    const length = Math.max(MIN_DOOR_LENGTH, d?.length ?? door.length);
    const maxOff = Math.max(0, dist(a, b) - length);
    const offset = Math.max(0, Math.min(maxOff, d?.offset ?? door.offset));
    out.push({ ...door, offset, length, a, b, t: w.thickness });
  }
  return out;
});

/** wall body rectangles (centerline ± t/2) for item-collision tests */
const wallPolys = $derived.by<Pt[][]>(() => {
  const out: Pt[][] = [];
  for (const w of Object.values(plan.doc.walls)) {
    const a = renderJoints[w.startJointId];
    const b = renderJoints[w.endJointId];
    if (!a || !b) continue;
    const u = unit(sub(b, a));
    const n = { x: -u.y, y: u.x };
    const h = w.thickness / 2;
    out.push([addPt(a, mul(n, h)), addPt(b, mul(n, h)), addPt(b, mul(n, -h)), addPt(a, mul(n, -h))]);
  }
  return out;
});

/** collision checks shrink polygons by a hair so exact-flush contact passes */
const COLLISION_EPS = 0.01;

interface RenderItem {
  obj: RoomObject;
  label: string;
  corners: Pt[];
  aabb: { minX: number; minY: number; maxX: number; maxY: number };
  orphan: boolean;
  /** intersects a wall or pokes out of its room — rejected on drop */
  invalid: boolean;
  /** overlaps a sibling item — allowed, but tinted red */
  overlapping: boolean;
}

/** items merged with drag drafts; overlap + wall/room validity recomputed
 * live so tints follow drags before anything is committed */
const renderItems = $derived.by<RenderItem[]>(() => {
  const roomByKey = new Map(rooms.map((r) => [r.key, r]));
  const out: RenderItem[] = [];
  for (const obj of Object.values(plan.doc.roomObjects)) {
    const merged: RoomObject = { ...obj, ...(itemDrafts[obj.id] ?? {}) };
    const raw = itemCorners(merged.x, merged.y, merged.w, merged.d, merged.rotation);
    const corners = shrinkPolygon(raw, COLLISION_EPS);
    const room = roomByKey.get(merged.roomId);
    const hitsWall = wallPolys.some((wp) => polygonsIntersect(corners, wp));
    const inside = !room || corners.every((c) => polygonContainsPoint(room.innerPts, c));
    out.push({
      obj: merged,
      label: catalogLabel(merged.kind),
      corners,
      aabb: ptsBBox(raw),
      orphan: !room,
      invalid: hitsWall || !inside,
      overlapping: false,
    });
  }
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      if (polygonsIntersect(out[i].corners, out[j].corners)) {
        out[i].overlapping = true;
        out[j].overlapping = true;
      }
    }
  }
  return out;
});

/** resize + rotate handles for the selected item, in the top layer */
const itemHandles = $derived.by(() => {
  const sel = ui.selectedItemId;
  if (!sel) return [];
  const view = renderItems.find((i) => i.obj.id === sel);
  if (!view) return [];
  return itemCorners(view.obj.x, view.obj.y, view.obj.w, view.obj.d, view.obj.rotation).map((p, corner) => ({
    id: sel,
    corner,
    p,
  }));
});

const rotateHandle = $derived.by(() => {
  const sel = ui.selectedItemId;
  if (!sel) return null;
  const view = renderItems.find((i) => i.obj.id === sel);
  if (!view) return null;
  const { obj } = view;
  const off = obj.d / 2 + 16 / viewport.scale;
  return {
    id: sel,
    from: addPt({ x: obj.x, y: obj.y }, rotatePt({ x: 0, y: -obj.d / 2 }, obj.rotation)),
    p: addPt({ x: obj.x, y: obj.y }, rotatePt({ x: 0, y: -off }, obj.rotation)),
  };
});

/** resize handles for the selected opening(s), in the top layer (see §4 layering) */
const selectedWindowHandles = $derived.by(() => {
  const sel = ui.selectedWindowId;
  if (!sel || !plan.doc.windows[sel]) return [];
  const win = renderWindows.find((w) => w.id === sel);
  if (!win) return [];
  const u = unit(sub(win.b, win.a));
  return [
    { winId: sel, side: 'start' as const, p: addPt(win.a, mul(u, win.offset)) },
    { winId: sel, side: 'end' as const, p: addPt(win.a, mul(u, win.offset + win.length)) },
  ];
});

/** gap hints for the selected opening (window or door): distance to the
 * nearest other-opening edge on each side — both kinds share the wall axis —
 * or to the wall's inner (clear) span ends when it has no neighbors there */
const selectedOpeningHints = $derived.by(() => {
  const sel = ui.selectedWindowId ?? ui.selectedDoorId;
  if (!sel) return null;
  const open = [...renderWindows, ...renderDoors].find((o) => o.id === sel);
  if (!open) return null;
  const wallLen = dist(open.a, open.b);
  // measure to the inner faces, not the joints: the clear span starts one
  // corner extension in (half of the thickest neighbor at that joint)
  const exts = wallExts[open.wallId] ?? { start: 0, end: 0 };
  const neighbors = [...renderWindows, ...renderDoors].filter((o) => o.wallId === open.wallId);
  const bounds = openingGapBounds(neighbors, wallLen, sel, {
    from: exts.start,
    to: Math.max(exts.start, wallLen - exts.end),
  });
  if (!bounds) return null;
  // draw on the wall's outer side — same rule as the wall dimension lines:
  // connected walls extend into the room, so the outer side is away from them
  const n0 = { x: -(open.b.y - open.a.y), y: open.b.x - open.a.x };
  const l0 = Math.hypot(n0.x, n0.y) || 1;
  n0.x /= l0;
  n0.y /= l0;
  const wall = plan.doc.walls[open.wallId];
  const ja = renderJoints[wall.startJointId];
  let flip = false;
  if (ja) {
    const nb = wallsAtJoint(plan.doc, wall.startJointId).find((o) => o.id !== wall.id);
    if (nb) {
      const oid = nb.startJointId === wall.startJointId ? nb.endJointId : nb.startJointId;
      const o = plan.doc.joints[oid];
      if (o && n0.x * (o.x - ja.x) + n0.y * (o.y - ja.y) > 0) flip = true;
    }
  }
  return { open, bounds, flip };
});

const selectedDoorHandles = $derived.by(() => {
  const sel = ui.selectedDoorId;
  if (!sel || !plan.doc.doors[sel]) return [];
  const door = renderDoors.find((d) => d.id === sel);
  if (!door) return [];
  const u = unit(sub(door.b, door.a));
  return [
    { doorId: sel, side: 'start' as const, p: addPt(door.a, mul(u, door.offset)) },
    { doorId: sel, side: 'end' as const, p: addPt(door.a, mul(u, door.offset + door.length)) },
  ];
});

/** walls rendered with full selection treatment: the selected wall — or,
 * while a joint is being dragged — every wall attached to that joint, so
 * all affected lengths/angles annotate automatically */
const highlightIds = $derived.by<WallId[]>(() => {
  if (dragJointId) return wallsAtJoint(plan.doc, dragJointId).map((w) => w.id);
  // a selected opening suppresses its wall's highlight — the blue overlay and
  // dimension lines would visually fight the opening's own editing UI
  return ui.selectedWallId && !ui.selectedWindowId && !ui.selectedDoorId ? [ui.selectedWallId] : [];
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

// --- opening gestures (windows + doors) --------------------------------------

const minOpeningLength = (target: OpenTarget) => (target === 'window' ? MIN_WINDOW_LENGTH : MIN_DOOR_LENGTH);

/** draft values for an opening, falling back to its committed doc state */
function openBase(target: OpenTarget, id: string): OpenDraft | null {
  const rec = target === 'window' ? plan.doc.windows[id] : plan.doc.doors[id];
  return openDrafts[id] ?? (rec ? { offset: rec.offset, length: rec.length } : null);
}

/** projection of a world point onto the wall axis: cm from the start joint */
function projOnWall(wallId: WallId, world: Pt): { s: number; len: number } | null {
  const w = plan.doc.walls[wallId];
  if (!w) return null;
  const a = renderJoints[w.startJointId];
  const b = renderJoints[w.endJointId];
  if (!a || !b) return null;
  const u = unit(sub(b, a));
  return { s: (world.x - a.x) * u.x + (world.y - a.y) * u.y, len: dist(a, b) };
}

function wallOf(target: OpenTarget, id: string): WallId | null {
  const rec = target === 'window' ? plan.doc.windows[id] : plan.doc.doors[id];
  return rec?.wallId ?? null;
}

function startOpenSlide(target: OpenTarget, id: string, world: Pt) {
  const wallId = wallOf(target, id);
  const base = openBase(target, id);
  const proj = wallId && projOnWall(wallId, world);
  if (!wallId || !base || !proj) return;
  ui.select(wallId); // clears any opening selection…
  if (target === 'window')
    ui.selectWindow(id); // …then selects this one; wall stays as context
  else ui.selectDoor(id);
  // snap the grab point too, so offset = snap(s) − grab stays on-grid
  openDrag = { kind: 'slide', target, id, grab: (ui.snapEnabled ? snap(proj.s) : proj.s) - base.offset };
}

function startOpenResize(target: OpenTarget, id: string, side: 'start' | 'end', world: Pt) {
  const wallId = wallOf(target, id);
  if (!wallId || !openBase(target, id) || !projOnWall(wallId, world)) return;
  ui.select(wallId);
  if (target === 'window') ui.selectWindow(id);
  else ui.selectDoor(id);
  openDrag = { kind: 'resize', target, id, side };
}

function applyOpenDrag(world: Pt) {
  if (!openDrag) return;
  const drag = openDrag;
  const base = openBase(drag.target, drag.id);
  const wallId = wallOf(drag.target, drag.id);
  const proj = wallId && projOnWall(wallId, world);
  if (!base || !proj) {
    cancelOpenDrag();
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
  openDrafts = { ...openDrafts, [drag.id]: { offset, length } };
}

function commitOpenDrag() {
  const d = openDrag && openDrafts[openDrag.id];
  if (d && openDrag && wallOf(openDrag.target, openDrag.id)) {
    if (openDrag.target === 'window') {
      if (openDrag.kind === 'slide') {
        plan.commit('Move window', setWindowOffset(plan.doc, openDrag.id, d.offset));
      } else {
        plan.commit('Resize window', resizeWindow(plan.doc, openDrag.id, d.offset, d.length));
      }
    } else if (openDrag.kind === 'slide') {
      plan.commit('Move door', setDoorOffset(plan.doc, openDrag.id, d.offset));
    } else {
      plan.commit('Resize door', resizeDoor(plan.doc, openDrag.id, d.offset, d.length));
    }
  }
  cancelOpenDrag();
}

function cancelOpenDrag() {
  openDrag = null;
  openDrafts = {};
}

// --- room drag ----------------------------------------------------------------

function startRoomDrag(room: Room, world: Pt) {
  const joints = roomLoopJoints(plan.doc, room.wallIds);
  if (!joints) {
    // a corner is shared with walls outside the room — moving would stretch
    // them silently (§7); reshaping at the joints is the way to change these
    ui.showError('This room is attached to the rest of the plan and can’t be moved as a whole.');
    return;
  }
  ui.selectRoom(room.key); // a click on the label selects; dragging moves
  const origins: Record<JointId, Pt> = {};
  for (const jid of joints) {
    const j = plan.doc.joints[jid];
    if (j) origins[jid] = { x: j.x, y: j.y };
  }
  roomDrag = { key: room.key, wallIds: [...room.wallIds], origins, start: world };
}

function applyRoomDrag(world: Pt) {
  if (!roomDrag) return;
  // snap the DELTA (not the positions): the room keeps its exact shape even
  // over legacy fractional joints (same rule as the old wall-body drag, §7)
  const dx = ui.snapEnabled ? snap(world.x - roomDrag.start.x) : world.x - roomDrag.start.x;
  const dy = ui.snapEnabled ? snap(world.y - roomDrag.start.y) : world.y - roomDrag.start.y;
  const next: Drafts = {};
  for (const [jid, p] of Object.entries(roomDrag.origins)) {
    next[jid] = { x: p.x + dx, y: p.y + dy };
  }
  drafts = next;
}

function commitRoomDrag() {
  const drag = roomDrag;
  roomDrag = null;
  const first = Object.entries(drafts)[0];
  if (!drag || !first) {
    drafts = {};
    return;
  }
  const origin = drag.origins[first[0]];
  const candidate = moveRoom(plan.doc, drag.wallIds, drag.key, {
    x: first[1].x - origin.x,
    y: first[1].y - origin.y,
  });
  drafts = {};
  // moveRoom is a rigid translation — no opening floors can be violated; it
  // returns the doc unchanged for non-movable rooms, and commit no-ops then
  plan.commit('Move room', candidate);
}

function cancelRoomDrag() {
  roomDrag = null;
  drafts = {};
}

// --- item gestures (library drop, move, resize, rotate) -----------------------

const findItemView = (id: string) => renderItems.find((i) => i.obj.id === id);

/** wall faces of the item's room (axis-aligned edges only) as snap targets */
function itemSnapWalls(view: RenderItem): SnapSegment[] {
  const room = rooms.find((r) => r.key === view.obj.roomId);
  if (!room) return [];
  const segs: SnapSegment[] = [];
  const p = room.innerPts;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    if (Math.abs(a.x - b.x) < 1e-6)
      segs.push({ axis: 'x', value: a.x, from: Math.min(a.y, b.y), to: Math.max(a.y, b.y) });
    else if (Math.abs(a.y - b.y) < 1e-6)
      segs.push({ axis: 'y', value: a.y, from: Math.min(a.x, b.x), to: Math.max(a.x, b.x) });
  }
  return segs;
}

function startItemMove(id: string, world: Pt) {
  const view = findItemView(id);
  if (!view) return;
  ui.selectItem(id);
  itemDrag = { kind: 'move', id, grabX: world.x - view.obj.x, grabY: world.y - view.obj.y };
}

function startItemResize(id: string, corner: number) {
  const view = findItemView(id);
  if (!view) return;
  ui.selectItem(id);
  const { obj } = view;
  const sx: 1 | -1 = corner === 0 || corner === 3 ? -1 : 1;
  const sy: 1 | -1 = corner === 0 || corner === 1 ? -1 : 1;
  // the opposite corner stays fixed for the whole gesture
  const fixed = addPt({ x: obj.x, y: obj.y }, rotatePt({ x: (-sx * obj.w) / 2, y: (-sy * obj.d) / 2 }, obj.rotation));
  itemDrag = { kind: 'resize', id, sx, sy, fixed, rotation: obj.rotation };
}

function startItemRotate(id: string) {
  const view = findItemView(id);
  if (!view) return;
  ui.selectItem(id);
  itemDrag = { kind: 'rotate', id };
}

function applyItemDrag(world: Pt) {
  if (!itemDrag) return;
  const drag = itemDrag;
  const view = findItemView(drag.id);
  if (!view) {
    cancelItemDrag();
    return;
  }
  const obj = view.obj;
  if (drag.kind === 'move') {
    let nx = world.x - drag.grabX;
    let ny = world.y - drag.grabY;
    if (ui.snapEnabled) {
      nx = snap(nx);
      ny = snap(ny);
    }
    // edge/center snapping uses the rotated item's AABB
    const aabb = ptsBBox(itemCorners(nx, ny, obj.w, obj.d, obj.rotation));
    const snapped = snapItemCenter(
      nx,
      ny,
      aabb.maxX - aabb.minX,
      aabb.maxY - aabb.minY,
      itemSnapWalls(view),
      renderItems.filter((o) => o.obj.id !== drag.id).map((o) => o.aabb),
      8 / viewport.scale,
    );
    itemDrafts = { ...itemDrafts, [drag.id]: { ...obj, x: snapped.x, y: snapped.y } };
  } else if (drag.kind === 'resize') {
    const lv = rotatePt(sub(world, drag.fixed), -drag.rotation);
    const cat = catalogItem(obj.kind);
    const nw = Math.max(cat.minW, drag.sx * lv.x);
    const nd = Math.max(cat.minD, drag.sy * lv.y);
    const c = addPt(drag.fixed, rotatePt({ x: (drag.sx * nw) / 2, y: (drag.sy * nd) / 2 }, drag.rotation));
    itemDrafts = { ...itemDrafts, [drag.id]: { ...obj, x: c.x, y: c.y, w: nw, d: nd } };
  } else {
    const ang = vectorAngleDeg(sub(world, obj)) + 90;
    const rotation = ui.snapEnabled ? Math.round(ang / 15) * 15 : ang;
    itemDrafts = { ...itemDrafts, [drag.id]: { ...obj, rotation: ((rotation % 360) + 360) % 360 || 0 } };
  }
}

function commitItemDrag() {
  const drag = itemDrag;
  itemDrag = null;
  const view = drag && findItemView(drag.id);
  if (!drag || !view) {
    itemDrafts = {};
    return;
  }
  const { obj, label, invalid } = view;
  itemDrafts = {};
  if (invalid) {
    // walls/openings/room bounds are hard constraints — reject like floors do
    ui.showError(`${label} can’t overlap walls or leave its room.`);
    return;
  }
  if (drag.kind === 'move') plan.commit(`Move ${label}`, moveItem(plan.doc, obj.id, obj.x, obj.y));
  else if (drag.kind === 'resize') plan.commit(`Resize ${label}`, resizeItem(plan.doc, obj.id, obj.w, obj.d));
  else plan.commit(`Rotate ${label}`, rotateItem(plan.doc, obj.id, obj.rotation));
}

function cancelItemDrag() {
  itemDrag = null;
  itemDrafts = {};
}

// --- library drag (panel → canvas) ---------------------------------------------

/** validity of a would-be drop at the current cursor position */
function libraryDropValid(kind: string, world: Pt): { room: Room | null; valid: boolean } {
  const room = rooms.find((r) => polygonContainsPoint(r.pts, world)) ?? null;
  if (!room) return { room: null, valid: false };
  const cat = catalogItem(kind);
  const corners = shrinkPolygon(itemCorners(world.x, world.y, cat.w, cat.d, 0), COLLISION_EPS);
  const valid =
    corners.every((c) => polygonContainsPoint(room.innerPts, c)) &&
    !wallPolys.some((wp) => polygonsIntersect(corners, wp));
  return { room, valid };
}

// window-level listeners while a library item is being carried: the gesture
// started on a panel element, so the canvas handlers never see it
$effect(() => {
  const drag = ui.libraryDrag;
  if (!drag) return;
  const onMove = (e: PointerEvent) => {
    if (!svgEl) return;
    const lp = localPt(e);
    const world = viewport.toWorld(lp.x, lp.y);
    const cat = catalogItem(drag.kind);
    const { valid } = libraryDropValid(drag.kind, world);
    itemGhost = {
      sx: lp.x,
      sy: lp.y,
      w: cat.w,
      d: cat.d,
      overRoom: valid || !!rooms.find((r) => polygonContainsPoint(r.pts, world)),
      valid,
    };
  };
  const onUp = (e: PointerEvent) => {
    const info = ui.libraryDrag;
    ui.cancelLibraryDrag();
    itemGhost = null;
    if (!info || !svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
    const worldRaw = viewport.toWorld(e.clientX - rect.left, e.clientY - rect.top);
    const world = ui.snapEnabled ? { x: snap(worldRaw.x), y: snap(worldRaw.y) } : worldRaw;
    const { room, valid } = libraryDropValid(info.kind, world);
    if (!room) {
      ui.showError('Drop items inside a room.');
      return;
    }
    if (!valid) {
      ui.showError(`${info.label} can’t overlap walls or leave its room.`);
      return;
    }
    const res = addRoomItem(plan.doc, room.key, info.kind, world);
    if (res.item) {
      plan.commit(`Add ${info.label}`, res.doc);
      ui.selectItem(res.item.id);
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      ui.cancelLibraryDrag();
      itemGhost = null;
    }
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);
  return () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey);
  };
});

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
  const winId = target.closest('[data-window-id]')?.getAttribute('data-window-id') ?? null;
  const winHandleSide =
    winId && target.closest('[data-window-handle]')?.getAttribute('data-window-handle') === 'end'
      ? ('end' as const)
      : ('start' as const);
  const doorId = target.closest('[data-door-id]')?.getAttribute('data-door-id') ?? null;
  const doorHandleSide =
    doorId && target.closest('[data-door-handle]')?.getAttribute('data-door-handle') === 'end'
      ? ('end' as const)
      : ('start' as const);
  const roomKeyHit = target.closest('[data-room-key]')?.getAttribute('data-room-key') ?? null;
  const itemId = target.closest('[data-item-id]')?.getAttribute('data-item-id') ?? null;
  const itemHandle = itemId ? (target.closest('[data-item-handle]')?.getAttribute('data-item-handle') ?? null) : null;

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
  if (itemId && plan.doc.roomObjects[itemId]) {
    // items render above walls/openings, so they get priority here
    if (itemHandle === 'rotate') startItemRotate(itemId);
    else if (itemHandle?.startsWith('resize:')) startItemResize(itemId, Number(itemHandle.split(':')[1]));
    else startItemMove(itemId, world);
    return;
  }
  if (doorId && plan.doc.doors[doorId]) {
    // doors beat windows and wall hit-lines: they render above both
    if (target.closest('[data-door-handle]')) startOpenResize('door', doorId, doorHandleSide, world);
    else startOpenSlide('door', doorId, world);
    return;
  }
  if (winId && plan.doc.windows[winId]) {
    // windows beat wall hit-lines: they render above the wall body
    const side = winHandleSide;
    if (target.closest('[data-window-handle]')) startOpenResize('window', winId, side, world);
    else startOpenSlide('window', winId, world);
    return;
  }
  if (roomKeyHit) {
    // the m² label doubles as the room's drag handle (rooms layer sits below
    // walls/openings, so those keep priority on shared pixels)
    const room = rooms.find((r) => r.key === roomKeyHit);
    if (room) startRoomDrag(room, world);
    return;
  }
  if (wallHit && plan.doc.walls[wallHit]) {
    // walls are selected but not translatable: moving a whole wall would
    // silently change connected walls' lengths and angles (see decisions §7)
    ui.select(wallHit);
    return;
  }
  // empty space: selecting a room when the click lands inside one, else deselect
  const room = rooms.find((r) => polygonContainsPoint(r.pts, world));
  ui.selectRoom(room ? room.key : null);
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
  if (openDrag) {
    applyOpenDrag(cursorWorld);
    return;
  }
  if (roomDrag) {
    applyRoomDrag(cursorWorld);
    return;
  }
  if (itemDrag) {
    applyItemDrag(cursorWorld);
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

  if (openDrag) {
    commitOpenDrag();
    return;
  }
  if (roomDrag) {
    commitRoomDrag();
    return;
  }
  if (itemDrag) {
    commitItemDrag();
    return;
  }
  if (dragJointId) {
    const p = drafts[dragJointId];
    if (dragMoved && p) {
      const candidate = moveJoint(plan.doc, dragJointId, p);
      const bad = violatedOpeningFloors(candidate);
      if (bad.length > 0) {
        // shrinking a wall below its openings is rejected — they keep their lengths
        ui.showError(
          `Move rejected: a wall would get shorter than its windows/doors (needs at least ${fmtCm(
            Math.max(...bad.map((id) => wallOpeningSpanCm(plan.doc, id))),
          )} cm).`,
        );
      } else {
        plan.commit('Move joint', candidate);
      }
    }
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
    cancelOpenDrag();
    cancelRoomDrag();
    cancelItemDrag();
    ui.cancelLibraryDrag();
    itemGhost = null;
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

      {#each rooms as room, i (i)}
        <!-- label = clear-floor (inner) area: the usable m² inside the walls;
             it doubles as the room's drag handle -->
        <RoomView pts={room.pts} areaCm2={room.innerAreaCm2} scale={viewport.scale} roomKey={room.key} />
      {/each}

      {#each Object.values(plan.doc.walls) as wall (wall.id)}
        <WallView {wall} joints={renderJoints} neighbors={wallEndNeighbors[wall.id] ?? { start: null, end: null }} />
      {/each}

      <!-- windows sit on their walls; painted after ALL walls so a neighbor
           polygon can never cover an opening -->
      {#each renderWindows as wv (wv.id)}
        <WindowView
          id={wv.id}
          a={wv.a}
          b={wv.b}
          thickness={wv.t}
          offset={wv.offset}
          length={wv.length}
          scale={viewport.scale}
          selected={wv.id === ui.selectedWindowId} />
      {/each}

      <!-- doors likewise; painted above windows so their hit areas win where
           openings would overlap -->
      {#each renderDoors as dv (dv.id)}
        <DoorView
          id={dv.id}
          a={dv.a}
          b={dv.b}
          thickness={dv.t}
          offset={dv.offset}
          length={dv.length}
          mode={dv.mode}
          scale={viewport.scale}
          selected={dv.id === ui.selectedDoorId} />
      {/each}

      <!-- room items live inside rooms; painted above walls/openings -->
      {#each renderItems as iv (iv.obj.id)}
        <FurnitureView
          id={iv.obj.id}
          kind={iv.obj.kind}
          x={iv.obj.x}
          y={iv.obj.y}
          w={iv.obj.w}
          d={iv.obj.d}
          rotation={iv.obj.rotation}
          scale={viewport.scale}
          selected={iv.obj.id === ui.selectedItemId}
          overlapping={iv.overlapping}
          invalid={iv.invalid}
          orphan={iv.orphan} />
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

      <!-- gap hints for the selected opening (window or door): distance to
           the nearest neighbor edge (or wall end) on each side -->
      {#if selectedOpeningHints}
        <GapHints
          a={selectedOpeningHints.open.a}
          b={selectedOpeningHints.open.b}
          thickness={selectedOpeningHints.open.t}
          scale={viewport.scale}
          {...selectedOpeningHints.bounds}
          flip={selectedOpeningHints.flip} />
      {/if}

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

      <!-- opening resize handles: topmost so wall handles can't steal their clicks -->
      {#each selectedWindowHandles as hp (hp.side)}
        <circle
          class="handle win-handle"
          data-window-id={hp.winId}
          data-window-handle={hp.side}
          cx={hp.p.x}
          cy={hp.p.y}
          r={6 / viewport.scale}
          stroke-width={2 / viewport.scale} />
      {/each}
      {#each selectedDoorHandles as hp (hp.side)}
        <circle
          class="handle door-handle"
          data-door-id={hp.doorId}
          data-door-handle={hp.side}
          cx={hp.p.x}
          cy={hp.p.y}
          r={6 / viewport.scale}
          stroke-width={2 / viewport.scale} />
      {/each}

      <!-- item handles: topmost — 4 resize corners + rotation lollipop -->
      {#each itemHandles as hp (hp.corner)}
        <circle
          class="handle item-handle"
          data-item-id={hp.id}
          data-item-handle={`resize:${hp.corner}`}
          cx={hp.p.x}
          cy={hp.p.y}
          r={5 / viewport.scale}
          stroke-width={2 / viewport.scale} />
      {/each}
      {#if rotateHandle}
        <line
          class="rot-stem"
          x1={rotateHandle.from.x}
          y1={rotateHandle.from.y}
          x2={rotateHandle.p.x}
          y2={rotateHandle.p.y}
          stroke-width={1 / viewport.scale} />
        <circle
          class="handle item-rotate-handle"
          data-item-id={rotateHandle.id}
          data-item-handle="rotate"
          cx={rotateHandle.p.x}
          cy={rotateHandle.p.y}
          r={5 / viewport.scale}
          stroke-width={2 / viewport.scale} />
      {/if}

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
    {#if itemGhost && ui.libraryDrag}
      <div
        class="item-ghost"
        class:invalid={!itemGhost.valid}
        class:overroom={itemGhost.overRoom && itemGhost.valid}
        style:left="{itemGhost.sx}px"
        style:top="{itemGhost.sy}px"
        style:width="{itemGhost.w * viewport.scale}px"
        style:height="{itemGhost.d * viewport.scale}px">
        {ui.libraryDrag.label}
      </div>
    {/if}
  </div>

  {#if drawActive}
    <div class="banner">Click to place next corner · click same point, right-click or Esc to finish</div>
  {:else if Object.keys(plan.doc.walls).length === 0}
    <div class="banner">Press “Draw wall”, then click to place the first corner</div>
  {/if}
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
.item-ghost {
  position: absolute;
  transform: translate(-50%, -50%);
  border: 2px dashed #64748b;
  background: rgba(226, 232, 240, 0.5);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #475569;
  pointer-events: none;
  white-space: nowrap;
}
.item-ghost.overroom {
  border-color: #16a34a;
  background: rgba(220, 252, 231, 0.5);
}
.item-ghost.invalid {
  border-color: #dc2626;
  background: rgba(254, 226, 226, 0.6);
  color: #b91c1c;
}
.rot-stem {
  stroke: #2563eb;
  pointer-events: none;
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
</style>
