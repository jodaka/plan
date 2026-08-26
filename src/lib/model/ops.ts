import { dist, sub, unit, type Pt } from '../geometry';
import {
  DEFAULT_THICKNESS,
  DEFAULT_WINDOW_LENGTH,
  MAX_THICKNESS,
  MIN_THICKNESS,
  MIN_WINDOW_LENGTH,
  type Joint,
  type JointId,
  type PlanDoc,
  type RoomObject,
  type Wall,
  type WallId,
  type WallWindow,
  type WindowId,
} from '../types';

export const MIN_WALL_LENGTH = 1; // cm

export function emptyDoc(): PlanDoc {
  return { version: 1, joints: {}, walls: {}, roomObjects: {}, windows: {} };
}

function newId(): string {
  return crypto.randomUUID();
}

function copyDoc(
  joints: PlanDoc['joints'],
  walls: PlanDoc['walls'],
  roomObjects: PlanDoc['roomObjects'],
  windows: PlanDoc['windows'],
): PlanDoc {
  return { version: 1, joints, walls, roomObjects, windows };
}

export function findJointNear(doc: PlanDoc, p: Pt, tolCm: number): Joint | null {
  let best: Joint | null = null;
  let bestD = tolCm;
  for (const j of Object.values(doc.joints)) {
    const d = dist(j, p);
    if (d <= bestD) {
      bestD = d;
      best = j;
    }
  }
  return best;
}

export function wallsAtJoint(doc: PlanDoc, jointId: JointId): Wall[] {
  return Object.values(doc.walls).filter((w) => w.startJointId === jointId || w.endJointId === jointId);
}

export interface AddWallResult {
  doc: PlanDoc;
  wallId: WallId | null;
}

/**
 * Adds a wall between two points. Endpoints attach to existing joints within
 * `attachTolCm`, otherwise new joints are created. Coordinates are expected
 * pre-snapped by the caller.
 */
export function addWall(
  doc: PlanDoc,
  a: Pt,
  b: Pt,
  opts?: { thickness?: number; attachTolCm?: number },
): AddWallResult {
  if (dist(a, b) < MIN_WALL_LENGTH) return { doc, wallId: null };

  const thickness = clampThickness(opts?.thickness ?? DEFAULT_THICKNESS);
  const tol = opts?.attachTolCm ?? 0;

  const joints = { ...doc.joints };
  const resolve = (p: Pt): Joint => {
    const existing = tol > 0 ? findJointNear(doc, p, tol) : null;
    if (existing) return existing;
    const j: Joint = { id: newId(), x: p.x, y: p.y };
    joints[j.id] = j;
    return j;
  };
  const start = resolve(a);
  const end = resolve(b);
  if (start.id === end.id) return { doc, wallId: null };

  const wall: Wall = {
    id: newId(),
    startJointId: start.id,
    endJointId: end.id,
    thickness,
  };
  const walls = { ...doc.walls, [wall.id]: wall };
  return { doc: copyDoc(joints, walls, doc.roomObjects, doc.windows), wallId: wall.id };
}

export function moveJoint(doc: PlanDoc, jointId: JointId, p: Pt): PlanDoc {
  const j = doc.joints[jointId];
  if (!j || (j.x === p.x && j.y === p.y)) return doc;
  const joints = { ...doc.joints, [jointId]: { ...j, x: p.x, y: p.y } };
  // attached walls changed length — keep their windows inside (windows keep
  // their offset while it fits, else clamp flush to the nearest wall end)
  let windows = doc.windows;
  for (const w of Object.values(doc.walls)) {
    if (w.startJointId !== jointId && w.endJointId !== jointId) continue;
    windows = clampWallWindows(windows, w, joints);
  }
  return copyDoc(joints, doc.walls, doc.roomObjects, windows);
}

export function clampThickness(t: number): number {
  if (!Number.isFinite(t)) return DEFAULT_THICKNESS;
  return Math.min(MAX_THICKNESS, Math.max(MIN_THICKNESS, t));
}

/** Extension of `wallId`'s end at joint `jid`: half of the thickest neighbor wall. */
export function jointExtCm(doc: PlanDoc, wallId: WallId, jid: JointId): number {
  let m = 0;
  for (const o of Object.values(doc.walls)) {
    if (o.id !== wallId && (o.startJointId === jid || o.endJointId === jid)) {
      m = Math.max(m, o.thickness);
    }
  }
  return m / 2;
}

/**
 * Unit vector at joint `jid` pointing away from the other walls attached
 * there, along their axes (excluding `wallId`). Moving a joint along this
 * vector keeps every attached wall's direction — and thus the angles between
 * walls — unchanged. With multiple neighbors it is their bisector; with none,
 * null.
 */
function outwardAxisAt(doc: PlanDoc, wallId: WallId, jid: JointId): Pt | null {
  const j = doc.joints[jid];
  if (!j) return null;
  let x = 0;
  let y = 0;
  let count = 0;
  for (const o of Object.values(doc.walls)) {
    if (o.id === wallId) continue;
    if (o.startJointId !== jid && o.endJointId !== jid) continue;
    const oid = o.startJointId === jid ? o.endJointId : o.startJointId;
    const oj = doc.joints[oid];
    if (!oj) continue;
    const v = unit(sub(j, oj));
    x += v.x;
    y += v.y;
    count++;
  }
  if (count === 0) return null;
  const l = Math.hypot(x, y);
  if (l < 1e-9) return null;
  return { x: x / l, y: y / l };
}

/**
 * Sets wall thickness. Growing a wall eats into the adjacent room, which
 * would shorten the connected walls' inner spans — so each joint shifts by
 * Δt/2 along the axis of the other wall(s) attached to it. That preserves
 * their directions (the angles between walls) and their inner lengths
 * exactly; the thickened wall itself absorbs the remaining deformation.
 * Isolated joints don't move.
 */
export function setThickness(doc: PlanDoc, wallId: WallId, thickness: number): PlanDoc {
  const w = doc.walls[wallId];
  if (!w) return doc;
  const t = clampThickness(thickness);
  if (w.thickness === t) return doc;

  let next = doc;
  const delta = (t - w.thickness) / 2;
  if (delta !== 0) {
    for (const jid of [w.startJointId, w.endJointId]) {
      const axis = outwardAxisAt(doc, wallId, jid);
      const j = next.joints[jid];
      if (axis && j) {
        next = moveJoint(next, jid, { x: j.x + axis.x * delta, y: j.y + axis.y * delta });
      }
    }
  }

  const walls = { ...next.walls, [wallId]: { ...next.walls[wallId], thickness: t } };
  return copyDoc(next.joints, walls, next.roomObjects, next.windows);
}

/** Sets wall length by moving its end joint along the current direction. */
export function setLength(doc: PlanDoc, wallId: WallId, lengthCm: number): PlanDoc {
  const w = doc.walls[wallId];
  if (!w) return doc;
  const a = doc.joints[w.startJointId];
  const b = doc.joints[w.endJointId];
  if (!a || !b) return doc;
  const l = Math.max(MIN_WALL_LENGTH, lengthCm);
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const cur = Math.hypot(vx, vy);
  if (cur === 0) return doc;
  const k = l / cur;
  return moveJoint(doc, w.endJointId, { x: a.x + vx * k, y: a.y + vy * k });
}

/**
 * Sets the wall's INNER (clear) length — the value the inspector exposes.
 * The centerline target is inner + joint extensions (neighbor t/2 per end),
 * so the typed value matches what the wall measures between its neighbors.
 */
export function setInnerLength(doc: PlanDoc, wallId: WallId, innerCm: number): PlanDoc {
  const w = doc.walls[wallId];
  if (!w) return doc;
  const extS = jointExtCm(doc, wallId, w.startJointId);
  const extE = jointExtCm(doc, wallId, w.endJointId);
  return setLength(doc, wallId, innerCm + extS + extE);
}

/** Deletes a wall, all windows mounted in it, and prunes joints left
 * orphaned by the deletion.
 * Room-bound entities are deliberately KEPT: destroying their room orphans
 * them (the delete flow warns before that happens), it never silently
 * deletes user data. */
export function deleteWall(doc: PlanDoc, wallId: WallId): PlanDoc {
  const w = doc.walls[wallId];
  if (!w) return doc;
  const walls = { ...doc.walls };
  delete walls[wallId];
  const used = new Set<JointId>();
  for (const other of Object.values(walls)) {
    used.add(other.startJointId);
    used.add(other.endJointId);
  }
  const joints = { ...doc.joints };
  for (const id of [w.startJointId, w.endJointId]) {
    if (!used.has(id)) delete joints[id];
  }
  let windows = doc.windows;
  for (const win of Object.values(doc.windows)) {
    if (win.wallId !== wallId) continue;
    if (windows === doc.windows) windows = { ...doc.windows };
    delete windows[win.id];
  }
  return copyDoc(joints, walls, doc.roomObjects, windows);
}

/** Adds an entity bound to the room with the given key. Returns null when the position is not finite. */
export function addRoomObject(
  doc: PlanDoc,
  roomId: string,
  kind: string,
  pos: Pt,
): { doc: PlanDoc; object: RoomObject | null } {
  if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || roomId === '' || kind === '') {
    return { doc, object: null };
  }
  const object: RoomObject = { id: newId(), roomId, kind, x: pos.x, y: pos.y };
  const roomObjects = { ...doc.roomObjects, [object.id]: object };
  return { doc: copyDoc(doc.joints, doc.walls, roomObjects, doc.windows), object };
}

/** Removes a room-bound entity; no-op when the id is unknown. */
export function removeRoomObject(doc: PlanDoc, objectId: string): PlanDoc {
  if (!doc.roomObjects[objectId]) return doc;
  const roomObjects = { ...doc.roomObjects };
  delete roomObjects[objectId];
  return copyDoc(doc.joints, doc.walls, roomObjects, doc.windows);
}

// --- windows ----------------------------------------------------------------

/** Centerline length of a wall, cm; 0 for unknown walls/joints. */
function wallCenterLength(doc: PlanDoc, wallId: WallId): number {
  const w = doc.walls[wallId];
  const a = w && doc.joints[w.startJointId];
  const b = w && doc.joints[w.endJointId];
  return a && b ? dist(a, b) : 0;
}

/**
 * Clamps every window of one wall into the span implied by `joints`: offsets
 * stay put while they fit, otherwise pull flush to the nearest wall end.
 * Returns the original record when nothing moves (structural sharing).
 */
function clampWallWindows(windows: PlanDoc['windows'], wall: Wall, joints: PlanDoc['joints']): PlanDoc['windows'] {
  const a = joints[wall.startJointId];
  const b = joints[wall.endJointId];
  if (!a || !b) return windows;
  const len = dist(a, b);
  let out = windows;
  for (const win of Object.values(windows)) {
    if (win.wallId !== wall.id) continue;
    const maxOff = Math.max(0, len - win.length);
    const offset = Math.max(0, Math.min(maxOff, win.offset));
    if (offset === win.offset) continue;
    if (out === windows) out = { ...windows };
    out[win.id] = { ...win, offset };
  }
  return out;
}

/** All windows mounted in a wall, ordered along it (start → end). */
export function windowsOnWall(doc: PlanDoc, wallId: WallId): WallWindow[] {
  return Object.values(doc.windows)
    .filter((w) => w.wallId === wallId)
    .sort((a, b) => a.offset - b.offset);
}

/** Total window length mounted in a wall, cm — its hard minimum centerline length. */
export function wallWindowSpanCm(doc: PlanDoc, wallId: WallId): number {
  let sum = 0;
  for (const w of Object.values(doc.windows)) {
    if (w.wallId === wallId) sum += w.length;
  }
  return sum;
}

export interface WindowGapBounds {
  /** left gap: from this boundary (wall start or nearest left neighbor's edge) to the window */
  leftFrom: number;
  winFrom: number;
  winTo: number;
  /** right gap: from the window to this boundary (nearest right neighbor's edge or wall end) */
  rightTo: number;
}

/**
 * Gap boundaries around one window, cm from the wall start: the nearest
 * other-window edge on each side, falling back to the wall's INNER (clear)
 * span ends when the window has no neighbors there — `innerSpanCm` carries
 * them (centerline positions of the inner corners); default is the full
 * centerline (free ends need no correction). `all` may carry draft values
 * (canvas previews); overlapping windows are ignored (they never tighten
 * bounds), and boundaries never cross the window (no negative gaps when a
 * window sits in the corner region).
 */
export function windowGapBounds(
  all: WallWindow[],
  wallLenCm: number,
  windowId: WindowId,
  innerSpanCm?: { from: number; to: number },
): WindowGapBounds | null {
  const win = all.find((w) => w.id === windowId);
  if (!win || !(wallLenCm > 0)) return null;
  let leftFrom = innerSpanCm ? Math.min(innerSpanCm.from, wallLenCm) : 0;
  let rightTo = innerSpanCm ? Math.max(innerSpanCm.to, 0) : wallLenCm;
  for (const o of all) {
    if (o.wallId !== win.wallId || o.id === win.id) continue;
    const end = o.offset + o.length;
    if (end <= win.offset + 1e-6 && end > leftFrom) leftFrom = end;
    if (o.offset >= win.offset + win.length - 1e-6 && o.offset < rightTo) rightTo = o.offset;
  }
  leftFrom = Math.min(leftFrom, win.offset);
  rightTo = Math.max(rightTo, win.offset + win.length);
  return { leftFrom, winFrom: win.offset, winTo: win.offset + win.length, rightTo };
}

/**
 * Walls whose centerline length is below their total window length — i.e.
 * mutations that shrank a wall past its window floor and must NOT be
 * committed (the UI surfaces an error instead).
 */
export function violatedWindowFloors(doc: PlanDoc): WallId[] {
  const bad: WallId[] = [];
  for (const w of Object.values(doc.walls)) {
    const span = wallWindowSpanCm(doc, w.id);
    if (span === 0) continue;
    const a = doc.joints[w.startJointId];
    const b = doc.joints[w.endJointId];
    if (a && b && dist(a, b) < span - 1e-6) bad.push(w.id);
  }
  return bad;
}

export interface AddWindowResult {
  doc: PlanDoc;
  window: WallWindow | null;
}

/**
 * Adds a default-length window to the wall's largest free gap between
 * existing windows (the whole wall when none), centered in that gap and
 * shrunk to it when needed. Returns null when no gap fits MIN_WINDOW_LENGTH.
 */
export function addWindow(doc: PlanDoc, wallId: WallId, opts?: { length?: number }): AddWindowResult {
  if (!doc.walls[wallId]) return { doc, window: null };
  const len = wallCenterLength(doc, wallId);
  if (len <= 0) return { doc, window: null };

  let prevEnd = 0;
  let bestStart = 0;
  let bestSize = -1;
  for (const w of windowsOnWall(doc, wallId)) {
    const size = w.offset - prevEnd;
    if (size > bestSize) {
      bestSize = size;
      bestStart = prevEnd;
    }
    prevEnd = w.offset + w.length;
  }
  const tail = len - prevEnd;
  if (tail > bestSize) {
    bestSize = tail;
    bestStart = prevEnd;
  }
  if (bestSize < MIN_WINDOW_LENGTH) return { doc, window: null };

  const length = Math.max(MIN_WINDOW_LENGTH, Math.min(opts?.length ?? DEFAULT_WINDOW_LENGTH, bestSize));
  const win: WallWindow = {
    id: newId(),
    wallId,
    offset: bestStart + (bestSize - length) / 2,
    length,
  };
  const windows = { ...doc.windows, [win.id]: win };
  return { doc: copyDoc(doc.joints, doc.walls, doc.roomObjects, windows), window: win };
}

/** Removes a window; no-op when the id is unknown. */
export function deleteWindow(doc: PlanDoc, windowId: WindowId): PlanDoc {
  if (!doc.windows[windowId]) return doc;
  const windows = { ...doc.windows };
  delete windows[windowId];
  return copyDoc(doc.joints, doc.walls, doc.roomObjects, windows);
}

/**
 * Sets a window's length around its center (both edges move apart/together),
 * clamped to [MIN_WINDOW_LENGTH, wall length]; the offset re-clamps so the
 * window stays inside its wall.
 */
export function setWindowLength(doc: PlanDoc, windowId: WindowId, lengthCm: number): PlanDoc {
  const win = doc.windows[windowId];
  if (!win || !Number.isFinite(lengthCm)) return doc;
  const wallLen = wallCenterLength(doc, win.wallId);
  if (wallLen <= 0) return doc;
  const length = Math.max(MIN_WINDOW_LENGTH, Math.min(wallLen, lengthCm));
  const maxOff = Math.max(0, wallLen - length);
  const offset = Math.max(0, Math.min(maxOff, win.offset + (win.length - length) / 2));
  if (length === win.length && offset === win.offset) return doc;
  const windows = { ...doc.windows, [windowId]: { ...win, offset, length } };
  return copyDoc(doc.joints, doc.walls, doc.roomObjects, windows);
}

/** Slides a window along its wall, keeping it inside; no-op when unknown. */
export function setWindowOffset(doc: PlanDoc, windowId: WindowId, offsetCm: number): PlanDoc {
  const win = doc.windows[windowId];
  if (!win || !Number.isFinite(offsetCm)) return doc;
  const wallLen = wallCenterLength(doc, win.wallId);
  if (wallLen <= 0) return doc;
  const offset = Math.max(0, Math.min(Math.max(0, wallLen - win.length), offsetCm));
  if (offset === win.offset) return doc;
  const windows = { ...doc.windows, [windowId]: { ...win, offset } };
  return copyDoc(doc.joints, doc.walls, doc.roomObjects, windows);
}

/** Sets both window edges at once (drag commit); values clamp back into the wall. */
export function resizeWindow(doc: PlanDoc, windowId: WindowId, offset: number, length: number): PlanDoc {
  const win = doc.windows[windowId];
  if (!win || !Number.isFinite(offset) || !Number.isFinite(length)) return doc;
  const wallLen = wallCenterLength(doc, win.wallId);
  if (wallLen <= 0) return doc;
  const len = Math.max(MIN_WINDOW_LENGTH, Math.min(wallLen, length));
  const off = Math.max(0, Math.min(Math.max(0, wallLen - len), offset));
  if (len === win.length && off === win.offset) return doc;
  const windows = { ...doc.windows, [windowId]: { ...win, offset: off, length: len } };
  return copyDoc(doc.joints, doc.walls, doc.roomObjects, windows);
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function docBBox(doc: PlanDoc): BBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const j of Object.values(doc.joints)) {
    if (j.x < minX) minX = j.x;
    if (j.y < minY) minY = j.y;
    if (j.x > maxX) maxX = j.x;
    if (j.y > maxY) maxY = j.y;
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}
