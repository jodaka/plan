import {
  addPt,
  angleBetweenDeg,
  dist,
  fmtCm,
  itemCorners,
  mul,
  polysBBox,
  polysInside,
  polysIntersect,
  polygonsIntersect,
  rotatePt,
  shrinkPolygon,
  sub,
  transformPolys,
  unit,
  vectorAngleDeg,
  type Pt,
  type WallEndNeighbor,
  wallCorners,
} from '../geometry';
import { catalogLabel, collisionPolys } from '../items/registry';
import { openingGapBounds, wallsAtJoint } from '../model/ops';
import { findRooms } from '../model/rooms';
import { plan } from '../stores/plan.svelte';
import { ui } from '../stores/ui.svelte';
import { viewport } from '../stores/viewport.svelte';
import {
  MIN_DOOR_LENGTH,
  MIN_WINDOW_LENGTH,
  type Joint,
  type JointId,
  type RoomObject,
  type WallDoor,
  type WallId,
  type WallWindow,
} from '../types';
import { drafts } from './drafts.svelte';
import { jointDrag } from './jointDrag.svelte';

/** collision checks shrink polygons by a hair so exact-flush contact passes */
export const COLLISION_EPS = 0.01;

export interface RenderItem {
  obj: RoomObject;
  label: string;
  shrunkPolys: Pt[][];
  aabb: { minX: number; minY: number; maxX: number; maxY: number };
  orphan: boolean;
  /** intersects a wall or pokes out of its room — rejected on drop */
  invalid: boolean;
  /** overlaps a sibling item — allowed, but tinted red */
  overlapping: boolean;
}

export interface ArcInfo {
  p1: Pt;
  p2: Pt;
  r: number;
  sweep: number;
  lp: Pt;
  text: string;
}

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

export interface Highlight {
  id: WallId;
  corners: [Pt, Pt, Pt, Pt];
  ra: Pt;
  rb: Pt;
  t: number;
  dims: DimData;
}

const renderJoints = $derived.by<Record<string, Joint>>(() => {
  const r: Record<string, Joint> = { ...plan.doc.joints };
  for (const [id, p] of Object.entries(drafts.joints)) {
    const j = r[id];
    if (j) {
      r[id] = { ...j, x: p.x, y: p.y };
    }
  }
  return r;
});

/** closed wall figures — derived live from renderJoints so rooms follow
 * joint drags in real time; deleting any wall dissolves its room.
 * THE single rooms derivation: the inspector and the delete-confirm consume
 * this too, so room logic can never drift between call sites. */
const rooms = $derived(findRooms(renderJoints, plan.doc.walls));

/** thickest OTHER wall at each wall end (direction into it + thickness) —
 * drives the mitered corner geometry and the inner-span math */
const wallEndNeighbors = $derived.by<Record<string, { start: WallEndNeighbor | null; end: WallEndNeighbor | null }>>(
  () => {
    const res: Record<string, { start: WallEndNeighbor | null; end: WallEndNeighbor | null }> = {};
    for (const w of Object.values(plan.doc.walls)) {
      const thickest = (jid: JointId): WallEndNeighbor | null => {
        const j = plan.doc.joints[jid];
        if (!j) {
          return null;
        }
        let best: WallEndNeighbor | null = null;
        for (const o of Object.values(plan.doc.walls)) {
          if (o.id === w.id) {
            continue;
          }
          if (o.startJointId !== jid && o.endJointId !== jid) {
            continue;
          }
          const oid = o.startJointId === jid ? o.endJointId : o.startJointId;
          const oj = plan.doc.joints[oid];
          if (!oj) {
            continue;
          }
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
    if (!w) {
      continue;
    }
    const a = renderJoints[w.startJointId];
    const b = renderJoints[w.endJointId];
    if (!a || !b) {
      continue;
    }
    const d = drafts.openings[win.id];
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
    if (!w) {
      continue;
    }
    const a = renderJoints[w.startJointId];
    const b = renderJoints[w.endJointId];
    if (!a || !b) {
      continue;
    }
    const d = drafts.openings[door.id];
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
    if (!a || !b) {
      continue;
    }
    const u = unit(sub(b, a));
    const n = { x: -u.y, y: u.x };
    const h = w.thickness / 2;
    out.push([addPt(a, mul(n, h)), addPt(b, mul(n, h)), addPt(b, mul(n, -h)), addPt(a, mul(n, -h))]);
  }
  return out;
});

/**
 * Pairwise overlap flags (SAT), the expensive part of renderItems. Two items
 * of DIFFERENT rooms can never touch — each is confined to its room's
 * clear-floor polygon and distinct rooms' polygons are disjoint — so pairs
 * are only checked within one room. Orphans have no room confinement, so
 * they are tested against everything (they are rare). An AABB broadphase
 * culls far-apart pairs with 4 comparisons before the polygon SAT runs.
 */
function computeOverlapFlags(items: RenderItem[]): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  const byRoom = new Map<string, RenderItem[]>();
  const orphans: RenderItem[] = [];
  for (const it of items) {
    if (it.orphan) {
      orphans.push(it);
    } else {
      const list = byRoom.get(it.obj.roomId);
      if (list) {
        list.push(it);
      } else {
        byRoom.set(it.obj.roomId, [it]);
      }
    }
  }
  const checkPair = (a: RenderItem, b: RenderItem) => {
    const ba = a.aabb;
    const bb = b.aabb;
    if (ba.maxX < bb.minX || bb.maxX < ba.minX || ba.maxY < bb.minY || bb.maxY < ba.minY) {
      return;
    }
    if (polysIntersect(a.shrunkPolys, b.shrunkPolys)) {
      flags[a.obj.id] = true;
      flags[b.obj.id] = true;
    }
  };
  for (const list of byRoom.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        checkPair(list[i], list[j]);
      }
    }
  }
  for (let i = 0; i < orphans.length; i++) {
    for (const list of byRoom.values()) {
      for (const it of list) {
        checkPair(orphans[i], it);
      }
    }
    for (let j = i + 1; j < orphans.length; j++) {
      checkPair(orphans[i], orphans[j]);
    }
  }
  return flags;
}

/**
 * Overlap tints are pure cosmetics, so while an item gesture is in flight
 * they refresh at most every OVERLAP_THROTTLE_MS instead of per drag frame —
 * positions and validity stay live. Reading a clock inside $derived is the
 * documented intentional impurity here (see ai/decisions.md §10): the cache
 * only ever makes the tint lag, never the geometry, and any gesture end
 * (commit or cancel) changes a tracked dependency, so the final state is
 * always computed fresh.
 */
const OVERLAP_THROTTLE_MS = 200;
let overlapCache: { at: number; flags: Record<string, boolean> } = { at: 0, flags: {} };

/** rooms indexed by stable key — a separate derived so item drags (which
 * recompute renderItems per frame) don't rebuild the lookup while the rooms
 * themselves are unchanged */
const roomByKey = $derived.by(() => new Map(rooms.map((r) => [r.key, r])));

/** items merged with drag drafts; overlap + wall/room validity recomputed
 * live so tints follow drags before anything is committed — true-shape aware */
const renderItems = $derived.by<RenderItem[]>(() => {
  const out: RenderItem[] = [];
  for (const obj of Object.values(plan.doc.roomObjects)) {
    const merged: RoomObject = { ...obj, ...(drafts.items[obj.id] ?? {}) };
    const local = collisionPolys(merged.kind, merged.w, merged.d);
    const world = transformPolys(local, merged.x, merged.y, merged.rotation);
    const shrunk = world.map((poly: Pt[]) => shrinkPolygon(poly, COLLISION_EPS));
    const aabb = polysBBox(world);
    const room = roomByKey.get(merged.roomId);
    const hitsWall = shrunk.some((sp: Pt[]) => wallPolys.some((wp: Pt[]) => polygonsIntersect(sp, wp)));
    const inside = !room || polysInside(shrunk, room.innerPts);
    out.push({
      obj: merged,
      label: catalogLabel(merged.kind),
      shrunkPolys: shrunk,
      aabb,
      orphan: !room,
      invalid: hitsWall || !inside,
      overlapping: false,
    });
  }
  // item drafts non-empty ⇔ an item gesture is in flight → throttle the tint
  const throttleMs = Object.keys(drafts.items).length > 0 ? OVERLAP_THROTTLE_MS : 0;
  const now = Date.now();
  if (now - overlapCache.at >= throttleMs) {
    overlapCache = { at: now, flags: computeOverlapFlags(out) };
  }
  const flags = overlapCache.flags;
  for (const it of out) {
    it.overlapping = flags[it.obj.id] ?? false;
  }
  return out;
});

/** resize + rotate handles for the selected item, in the top layer */
const itemHandles = $derived.by(() => {
  const sel = ui.selectedItemId;
  if (!sel) {
    return [];
  }
  const view = renderItems.find((i) => i.obj.id === sel);
  if (!view) {
    return [];
  }
  return itemCorners(view.obj.x, view.obj.y, view.obj.w, view.obj.d, view.obj.rotation).map((p, corner) => ({
    id: sel,
    corner,
    p,
  }));
});

const rotateHandle = $derived.by(() => {
  const sel = ui.selectedItemId;
  if (!sel) {
    return null;
  }
  const view = renderItems.find((i) => i.obj.id === sel);
  if (!view) {
    return null;
  }
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
  if (!sel || !plan.doc.windows[sel]) {
    return [];
  }
  const win = renderWindows.find((w) => w.id === sel);
  if (!win) {
    return [];
  }
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
  if (!sel) {
    return null;
  }
  const open = [...renderWindows, ...renderDoors].find((o) => o.id === sel);
  if (!open) {
    return null;
  }
  const wallLen = dist(open.a, open.b);
  // measure to the inner faces, not the joints: the clear span starts one
  // corner extension in (half of the thickest neighbor at that joint)
  const exts = wallExts[open.wallId] ?? { start: 0, end: 0 };
  const neighbors = [...renderWindows, ...renderDoors].filter((o) => o.wallId === open.wallId);
  const bounds = openingGapBounds(neighbors, wallLen, sel, {
    from: exts.start,
    to: Math.max(exts.start, wallLen - exts.end),
  });
  if (!bounds) {
    return null;
  }
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
      if (o && n0.x * (o.x - ja.x) + n0.y * (o.y - ja.y) > 0) {
        flip = true;
      }
    }
  }
  return { open, bounds, flip };
});

const selectedDoorHandles = $derived.by(() => {
  const sel = ui.selectedDoorId;
  if (!sel || !plan.doc.doors[sel]) {
    return [];
  }
  const door = renderDoors.find((d) => d.id === sel);
  if (!door) {
    return [];
  }
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
  if (jointDrag.activeId) {
    return wallsAtJoint(plan.doc, jointDrag.activeId).map((w) => w.id);
  }
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
    if (!w) {
      continue;
    }
    for (const jid of [w.startJointId, w.endJointId]) {
      if (seen.has(jid)) {
        continue;
      }
      seen.add(jid);
      const j = renderJoints[jid];
      if (j) {
        out.push(j);
      }
    }
  }
  return out;
});

// selection highlight + dimension lines live in the same top layer: wall
// paint order would otherwise cover the ends of the selected walls at corners
const highlights = $derived.by<Highlight[]>(() => {
  const out: Highlight[] = [];
  for (const id of highlightIds) {
    const w = plan.doc.walls[id];
    if (!w) {
      continue;
    }
    const a = renderJoints[w.startJointId];
    const b = renderJoints[w.endJointId];
    if (!a || !b) {
      continue;
    }
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
      if (o && n0.x * (o.x - a.x) + n0.y * (o.y - a.y) > 0) {
        outerN = mul(n0, -1);
      }
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
  if (highlightIds.length === 0) {
    return arcs;
  }
  const seen = new Set<string>();
  for (const id of highlightIds) {
    const w = plan.doc.walls[id];
    if (!w) {
      continue;
    }
    for (const jid of [w.startJointId, w.endJointId]) {
      const j = renderJoints[jid];
      const oW = renderJoints[jid === w.startJointId ? w.endJointId : w.startJointId];
      if (!j || !oW) {
        continue;
      }
      const dW = unit(sub(oW, j));
      for (const nb of wallsAtJoint(plan.doc, jid)) {
        if (nb.id === w.id) {
          continue;
        }
        // the same wall pair is visited from both sides — dedupe
        const key = `${jid}:${[w.id, nb.id].sort().join(':')}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const nOid = nb.startJointId === jid ? nb.endJointId : nb.startJointId;
        const nO = renderJoints[nOid];
        if (!nO) {
          continue;
        }
        const dN = unit(sub(nO, j));
        const ang = angleBetweenDeg(vectorAngleDeg(dW), vectorAngleDeg(dN));
        if (ang > 179) {
          continue; // collinear continuation — no corner to annotate
        }

        // arc from wall EDGE to wall EDGE: radius clears both wall
        // halves; endpoints are the circle's intersections with each
        // wall's face line on the side facing the other wall.
        // 1.5×: user preference — arcs sit away from the corner
        const r = 1.5 * Math.max(30 / viewport.scale, Math.max(w.thickness, nb.thickness) / 2 + 8 / viewport.scale);
        const facePoint = (dSelf: Pt, dOther: Pt, tSelf: number) => {
          let n = { x: -dSelf.y, y: dSelf.x };
          if (n.x * dOther.x + n.y * dOther.y < 0) {
            n = { x: -n.x, y: -n.y };
          }
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
  const br = viewport.toWorld(viewport.viewW, viewport.viewH);
  return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
});

const grid = $derived.by(() => {
  if (!ui.showGrid) {
    return null;
  }
  const steps = [1, 5, 10, 50, 100, 500];
  const step = steps.find((s) => s * viewport.scale >= 8) ?? 1000;
  const r = visibleRect;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let x = Math.floor(r.x / step) * step; x <= r.x + r.w; x += step) {
    xs.push(x);
  }
  for (let y = Math.floor(r.y / step) * step; y <= r.y + r.h; y += step) {
    ys.push(y);
  }
  return { xs, ys, r };
});

/**
 * The scene: every value the canvas renders (or a gesture reads) derived in
 * one place. Getters keep the $derived nodes lazy and let gesture controllers
 * read live values without prop-drilling.
 */
export const scene = {
  get renderJoints(): Record<string, Joint> {
    return renderJoints;
  },
  get rooms() {
    return rooms;
  },
  get wallEndNeighbors(): Record<string, { start: WallEndNeighbor | null; end: WallEndNeighbor | null }> {
    return wallEndNeighbors;
  },
  get wallExts(): Record<string, { start: number; end: number }> {
    return wallExts;
  },
  get renderWindows(): (WallWindow & { a: Pt; b: Pt; t: number })[] {
    return renderWindows;
  },
  get renderDoors(): (WallDoor & { a: Pt; b: Pt; t: number })[] {
    return renderDoors;
  },
  get wallPolys(): Pt[][] {
    return wallPolys;
  },
  get renderItems(): RenderItem[] {
    return renderItems;
  },
  get itemHandles() {
    return itemHandles;
  },
  get rotateHandle() {
    return rotateHandle;
  },
  get selectedWindowHandles() {
    return selectedWindowHandles;
  },
  get selectedDoorHandles() {
    return selectedDoorHandles;
  },
  get selectedOpeningHints() {
    return selectedOpeningHints;
  },
  get highlights(): Highlight[] {
    return highlights;
  },
  get handleJoints(): Joint[] {
    return handleJoints;
  },
  get selArcs(): ArcInfo[] {
    return selArcs;
  },
  get visibleRect() {
    return visibleRect;
  },
  get grid() {
    return grid;
  },
};
