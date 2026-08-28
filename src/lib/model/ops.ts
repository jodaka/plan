import { dist, sub, unit, type Pt } from '../geometry';
import { catalogItem, getItemDef } from '../items/registry';
import {
  DEFAULT_DOOR_LENGTH,
  DEFAULT_THICKNESS,
  DEFAULT_WINDOW_LENGTH,
  DOOR_MODES,
  MAX_THICKNESS,
  MIN_DOOR_LENGTH,
  MIN_THICKNESS,
  MIN_WINDOW_LENGTH,
  type DoorId,
  type DoorMode,
  type Joint,
  type JointId,
  type PlanDoc,
  type RoomObject,
  type Wall,
  type WallDoor,
  type WallId,
  type WallWindow,
  type WindowId,
} from '../types';

export const MIN_WALL_LENGTH = 1; // cm

export function emptyDoc(): PlanDoc {
  return { version: 1, joints: {}, walls: {}, roomObjects: {}, windows: {}, doors: {}, roomNames: {} };
}

function newId(): string {
  return crypto.randomUUID();
}

/** Shallow clone of `base` with the given top-level fields replaced. */
function copyDoc(base: PlanDoc, over: Partial<PlanDoc>): PlanDoc {
  return { ...base, ...over };
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
  return { doc: copyDoc(doc, { joints, walls }), wallId: wall.id };
}

export function moveJoint(doc: PlanDoc, jointId: JointId, p: Pt): PlanDoc {
  const j = doc.joints[jointId];
  if (!j || (j.x === p.x && j.y === p.y)) return doc;
  const joints = { ...doc.joints, [jointId]: { ...j, x: p.x, y: p.y } };
  // attached walls changed length — keep their openings inside (offsets stay
  // put while they fit, else clamp flush to the nearest wall end)
  let windows = doc.windows;
  let doors = doc.doors;
  for (const w of Object.values(doc.walls)) {
    if (w.startJointId !== jointId && w.endJointId !== jointId) continue;
    ({ windows, doors } = clampWallOpenings(windows, doors, w, joints));
  }
  return copyDoc(doc, { joints, windows, doors });
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
  return copyDoc(next, { joints: next.joints, walls });
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

/** Deletes a wall along with all openings mounted in it (windows, doors),
 * and prunes joints left orphaned by the deletion.
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
  const windows = { ...doc.windows };
  for (const win of Object.values(doc.windows)) {
    if (win.wallId === wallId) delete windows[win.id];
  }
  const doors = { ...doc.doors };
  for (const d of Object.values(doc.doors)) {
    if (d.wallId === wallId) delete doors[d.id];
  }
  return copyDoc(doc, { joints, walls, windows, doors });
}

/** Adds a catalog item centered at `pos`, bound to the room with the given
 * key. Size/rotation defaults come from the catalog; returns null for
 * non-finite positions or empty room/kind. Placement validity (inside the
 * room, no wall overlap) is the UI's job — ops stay pure. */
export function addRoomItem(
  doc: PlanDoc,
  roomId: string,
  kind: string,
  pos: Pt,
): { doc: PlanDoc; item: RoomObject | null } {
  if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || roomId === '' || kind === '') {
    return { doc, item: null };
  }
  const cat = catalogItem(kind);
  const item: RoomObject = {
    id: newId(),
    roomId,
    kind,
    x: pos.x,
    y: pos.y,
    w: cat.w,
    d: cat.d,
    rotation: 0,
  };
  const roomObjects = { ...doc.roomObjects, [item.id]: item };
  return { doc: copyDoc(doc, { roomObjects }), item };
}

/** Removes a room item; no-op when the id is unknown. */
export function removeRoomItem(doc: PlanDoc, itemId: string): PlanDoc {
  if (!doc.roomObjects[itemId]) return doc;
  const roomObjects = { ...doc.roomObjects };
  delete roomObjects[itemId];
  return copyDoc(doc, { roomObjects });
}

/** Moves an item's center; no-op for unknown ids / non-finite coordinates. */
export function moveItem(doc: PlanDoc, itemId: string, x: number, y: number): PlanDoc {
  const it = doc.roomObjects[itemId];
  if (!it || !Number.isFinite(x) || !Number.isFinite(y)) return doc;
  if (it.x === x && it.y === y) return doc;
  const roomObjects = { ...doc.roomObjects, [itemId]: { ...it, x, y } };
  return copyDoc(doc, { roomObjects });
}

/** Sets an item's size, clamped to its catalog minimum; no-op otherwise.
 * Fixed-aspect items (future round tables) keep w===d — the larger side wins,
 * clamped to the larger minimum. */
export function resizeItem(doc: PlanDoc, itemId: string, w: number, d: number): PlanDoc {
  const it = doc.roomObjects[itemId];
  if (!it || !Number.isFinite(w) || !Number.isFinite(d)) return doc;
  const cat = catalogItem(it.kind);
  const def = getItemDef(it.kind);
  let nw = Math.max(cat.minW, w);
  let nd = Math.max(cat.minD, d);
  if (def?.resizeMode === 'fixed-aspect') {
    const size = Math.max(nw, nd, Math.max(cat.minW, cat.minD));
    nw = size;
    nd = size;
  }
  if (it.w === nw && it.d === nd) return doc;
  const roomObjects = { ...doc.roomObjects, [itemId]: { ...it, w: nw, d: nd } };
  return copyDoc(doc, { roomObjects });
}

/** Sets an item's rotation, normalized into [0, 360); no-op otherwise. */
export function rotateItem(doc: PlanDoc, itemId: string, deg: number): PlanDoc {
  const it = doc.roomObjects[itemId];
  if (!it || !Number.isFinite(deg)) return doc;
  const rotation = ((deg % 360) + 360) % 360 || 0; // also normalizes -0
  if (it.rotation === rotation) return doc;
  const roomObjects = { ...doc.roomObjects, [itemId]: { ...it, rotation } };
  return copyDoc(doc, { roomObjects });
}

// --- rooms (derived state — see model/rooms.ts) ------------------------------

/**
 * Joints of the closed loop formed by `wallIds`; null when any of them is
 * shared with a wall OUTSIDE the loop — translating such a room would
 * silently stretch the outside walls (the exact deformation §7 forbids for
 * single walls), so the room is not movable. Unknown walls also yield null.
 */
export function roomLoopJoints(doc: PlanDoc, wallIds: WallId[]): JointId[] | null {
  const loop = new Set<JointId>();
  for (const id of wallIds) {
    const w = doc.walls[id];
    if (!w) return null;
    loop.add(w.startJointId);
    loop.add(w.endJointId);
  }
  const members = new Set(wallIds);
  for (const jid of loop) {
    for (const w of wallsAtJoint(doc, jid)) {
      if (!members.has(w.id)) return null;
    }
  }
  return [...loop];
}

/**
 * Moves a room: translates every joint of its wall loop — and every
 * room-bound object attached to it (`roomKey`) — by `delta`. A closed loop
 * translated rigidly keeps all wall lengths and angles exact, so openings
 * and geometry cannot break. Returns the doc unchanged when the room is not
 * movable (`roomLoopJoints`), a wall is unknown, or delta is zero.
 */
export function moveRoom(doc: PlanDoc, wallIds: WallId[], roomKeyStr: string, delta: Pt): PlanDoc {
  const joints = roomLoopJoints(doc, wallIds);
  if (!joints || (delta.x === 0 && delta.y === 0)) return doc;
  const nextJoints = { ...doc.joints };
  for (const jid of joints) {
    const j = doc.joints[jid];
    nextJoints[jid] = { ...j, x: j.x + delta.x, y: j.y + delta.y };
  }
  let roomObjects = doc.roomObjects;
  const movedObjects = { ...doc.roomObjects };
  for (const o of Object.values(doc.roomObjects)) {
    if (o.roomId !== roomKeyStr) continue;
    movedObjects[o.id] = { ...o, x: o.x + delta.x, y: o.y + delta.y };
    roomObjects = movedObjects;
  }
  return copyDoc(doc, { joints: nextJoints, roomObjects });
}

/**
 * Sets an optional user-facing name for the room with the given stable key
 * (names live in `doc.roomNames`, so they survive undo/redo and even
 * re-forming the same wall loop). An empty/whitespace name clears the entry.
 */
export function renameRoom(doc: PlanDoc, roomKeyStr: string, name: string): PlanDoc {
  if (roomKeyStr === '') return doc;
  const trimmed = name.trim();
  const prev = doc.roomNames[roomKeyStr];
  const next = trimmed === '' ? undefined : trimmed;
  if (prev === next) return doc;
  const roomNames = { ...doc.roomNames };
  if (next === undefined) delete roomNames[roomKeyStr];
  else roomNames[roomKeyStr] = next;
  return copyDoc(doc, { roomNames });
}

// --- openings (windows + doors) ----------------------------------------------

/** Centerline length of a wall, cm; 0 for unknown walls/joints. */
function wallCenterLength(doc: PlanDoc, wallId: WallId): number {
  const w = doc.walls[wallId];
  const a = w && doc.joints[w.startJointId];
  const b = w && doc.joints[w.endJointId];
  return a && b ? dist(a, b) : 0;
}

interface OpeningPlacement {
  offset: number;
  length: number;
}

/**
 * Clamps every window/door of one wall into the span implied by `joints`:
 * offsets stay put while they fit, otherwise pull flush to the nearest wall
 * end. Returns the original records when nothing moves (structural sharing).
 */
function clampWallOpenings(
  windows: PlanDoc['windows'],
  doors: PlanDoc['doors'],
  wall: Wall,
  joints: PlanDoc['joints'],
): { windows: PlanDoc['windows']; doors: PlanDoc['doors'] } {
  const a = joints[wall.startJointId];
  const b = joints[wall.endJointId];
  if (!a || !b) return { windows, doors };
  const len = dist(a, b);
  let outW = windows;
  for (const win of Object.values(windows)) {
    if (win.wallId !== wall.id) continue;
    const maxOff = Math.max(0, len - win.length);
    const offset = Math.max(0, Math.min(maxOff, win.offset));
    if (offset === win.offset) continue;
    if (outW === windows) outW = { ...windows };
    outW[win.id] = { ...win, offset };
  }
  let outD = doors;
  for (const d of Object.values(doors)) {
    if (d.wallId !== wall.id) continue;
    const maxOff = Math.max(0, len - d.length);
    const offset = Math.max(0, Math.min(maxOff, d.offset));
    if (offset === d.offset) continue;
    if (outD === doors) outD = { ...doors };
    outD[d.id] = { ...d, offset };
  }
  return { windows: outW, doors: outD };
}

/**
 * The largest free span between `openings` on a wall of length `len`
 * (ties → earliest). Windows and doors share one wall axis, so both kinds
 * occupy the same gaps.
 */
function largestGap(openings: OpeningPlacement[], len: number): { start: number; size: number } | null {
  const sorted = [...openings].sort((x, y) => x.offset - y.offset);
  let prevEnd = 0;
  let bestStart = 0;
  let bestSize = -1;
  for (const o of sorted) {
    const size = o.offset - prevEnd;
    if (size > bestSize) {
      bestSize = size;
      bestStart = prevEnd;
    }
    prevEnd = Math.max(prevEnd, o.offset + o.length);
  }
  const tail = len - prevEnd;
  if (tail > bestSize) {
    bestSize = tail;
    bestStart = prevEnd;
  }
  return bestSize > 0 ? { start: bestStart, size: bestSize } : null;
}

/** All windows mounted in a wall, ordered along it (start → end). */
export function windowsOnWall(doc: PlanDoc, wallId: WallId): WallWindow[] {
  return Object.values(doc.windows)
    .filter((w) => w.wallId === wallId)
    .sort((a, b) => a.offset - b.offset);
}

/** All doors mounted in a wall, ordered along it (start → end). */
export function doorsOnWall(doc: PlanDoc, wallId: WallId): WallDoor[] {
  return Object.values(doc.doors)
    .filter((d) => d.wallId === wallId)
    .sort((a, b) => a.offset - b.offset);
}

/** Every opening on a wall as offset/length spans, unordered. */
function openingsOnWall(doc: PlanDoc, wallId: WallId): OpeningPlacement[] {
  return [
    ...Object.values(doc.windows).filter((w) => w.wallId === wallId),
    ...Object.values(doc.doors).filter((d) => d.wallId === wallId),
  ];
}

/** Total window length mounted in a wall, cm. */
export function wallWindowSpanCm(doc: PlanDoc, wallId: WallId): number {
  let sum = 0;
  for (const w of Object.values(doc.windows)) {
    if (w.wallId === wallId) sum += w.length;
  }
  return sum;
}

export interface OpeningGapBounds {
  /** left gap: from this boundary (wall start or nearest left neighbor's edge) to the opening */
  leftFrom: number;
  winFrom: number;
  winTo: number;
  /** right gap: from the opening to this boundary (nearest right neighbor's edge or wall end) */
  rightTo: number;
}

/**
 * Gap boundaries around one opening (window or door — both kinds share the
 * wall axis, so pass every opening on the wall as `all`), cm from the wall
 * start: the nearest other-opening edge on each side, falling back to the
 * wall's INNER (clear) span ends when the opening has no neighbors there —
 * `innerSpanCm` carries them (centerline positions of the inner corners);
 * default is the full centerline (free ends need no correction). `all` may
 * carry draft values (canvas previews); overlapping openings are ignored
 * (they never tighten bounds), and boundaries never cross the opening (no
 * negative gaps when it sits in the corner region).
 */
export function openingGapBounds(
  all: WallWindow[],
  wallLenCm: number,
  openingId: string,
  innerSpanCm?: { from: number; to: number },
): OpeningGapBounds | null {
  const win = all.find((w) => w.id === openingId);
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

/** Total door length mounted in a wall, cm. */
export function wallDoorSpanCm(doc: PlanDoc, wallId: WallId): number {
  let sum = 0;
  for (const d of Object.values(doc.doors)) {
    if (d.wallId === wallId) sum += d.length;
  }
  return sum;
}

/** Combined window + door span on a wall, cm — openings share one axis. */
export function wallOpeningSpanCm(doc: PlanDoc, wallId: WallId): number {
  return wallWindowSpanCm(doc, wallId) + wallDoorSpanCm(doc, wallId);
}

/**
 * Walls whose centerline length is below their total opening length — i.e.
 * mutations that shrank a wall past its window/door floor and must NOT be
 * committed (the UI surfaces an error instead).
 */
export function violatedOpeningFloors(doc: PlanDoc): WallId[] {
  const bad: WallId[] = [];
  for (const w of Object.values(doc.walls)) {
    const span = wallOpeningSpanCm(doc, w.id);
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

export interface AddDoorResult {
  doc: PlanDoc;
  door: WallDoor | null;
}

function placeOpening(
  doc: PlanDoc,
  wallId: WallId,
  defaultLen: number,
  minLen: number,
  requestedLen: number | undefined,
): { doc: PlanDoc; placement: OpeningPlacement | null } {
  if (!doc.walls[wallId]) return { doc, placement: null };
  const len = wallCenterLength(doc, wallId);
  if (len <= 0) return { doc, placement: null };
  const gap = largestGap(openingsOnWall(doc, wallId), len);
  if (!gap || gap.size < minLen) return { doc, placement: null };

  const length = Math.max(minLen, Math.min(requestedLen ?? defaultLen, gap.size));
  return { doc, placement: { offset: gap.start + (gap.size - length) / 2, length } };
}

/**
 * Adds a default-length window to the wall's largest free gap (the whole
 * wall when none), centered in that gap and shrunk to it when needed.
 * Returns null when no gap fits MIN_WINDOW_LENGTH.
 */
export function addWindow(doc: PlanDoc, wallId: WallId, opts?: { length?: number }): AddWindowResult {
  const { doc: next, placement } = placeOpening(doc, wallId, DEFAULT_WINDOW_LENGTH, MIN_WINDOW_LENGTH, opts?.length);
  if (!placement) return { doc, window: null };
  const win: WallWindow = { id: newId(), wallId, ...placement };
  return { doc: copyDoc(next, { windows: { ...next.windows, [win.id]: win } }), window: win };
}

/**
 * Adds a default-length door (same gap logic as windows — both kinds share
 * the wall axis). Returns null when no gap fits MIN_DOOR_LENGTH.
 */
export function addDoor(doc: PlanDoc, wallId: WallId, opts?: { length?: number }): AddDoorResult {
  const { doc: next, placement } = placeOpening(doc, wallId, DEFAULT_DOOR_LENGTH, MIN_DOOR_LENGTH, opts?.length);
  if (!placement) return { doc, door: null };
  const door: WallDoor = { id: newId(), wallId, mode: 'tl', ...placement };
  return { doc: copyDoc(next, { doors: { ...next.doors, [door.id]: door } }), door };
}

/** Removes a window; no-op when the id is unknown. */
export function deleteWindow(doc: PlanDoc, windowId: WindowId): PlanDoc {
  if (!doc.windows[windowId]) return doc;
  const windows = { ...doc.windows };
  delete windows[windowId];
  return copyDoc(doc, { windows });
}

/** Removes a door; no-op when the id is unknown. */
export function deleteDoor(doc: PlanDoc, doorId: DoorId): PlanDoc {
  if (!doc.doors[doorId]) return doc;
  const doors = { ...doc.doors };
  delete doors[doorId];
  return copyDoc(doc, { doors });
}

/**
 * Shared numeric clamp for "set placement" ops: length into
 * [minLen, wall length], offset re-centered/clamped so the opening stays
 * inside its wall. Returns the input identity when nothing changes.
 */
function clampedPlacement(
  cur: OpeningPlacement,
  wallLen: number,
  minLen: number,
  offset: number,
  length: number,
): OpeningPlacement | null {
  if (!Number.isFinite(offset) || !Number.isFinite(length)) return null;
  if (wallLen <= 0) return null;
  const len = Math.max(minLen, Math.min(wallLen, length));
  const maxOff = Math.max(0, wallLen - len);
  const off = Math.max(0, Math.min(maxOff, offset));
  if (len === cur.length && off === cur.offset) return null;
  return { offset: off, length: len };
}

/**
 * Sets a window's length around its center (both edges move apart/together),
 * clamped to [MIN_WINDOW_LENGTH, wall length]; the offset re-clamps so the
 * window stays inside its wall.
 */
export function setWindowLength(doc: PlanDoc, windowId: WindowId, lengthCm: number): PlanDoc {
  const win = doc.windows[windowId];
  if (!win) return doc;
  const next = clampedPlacement(
    win,
    wallCenterLength(doc, win.wallId),
    MIN_WINDOW_LENGTH,
    win.offset + (win.length - lengthCm) / 2,
    lengthCm,
  );
  if (!next) return doc;
  return copyDoc(doc, { windows: { ...doc.windows, [windowId]: { ...win, ...next } } });
}

/** Same as setWindowLength, for doors. */
export function setDoorLength(doc: PlanDoc, doorId: DoorId, lengthCm: number): PlanDoc {
  const door = doc.doors[doorId];
  if (!door) return doc;
  const next = clampedPlacement(
    door,
    wallCenterLength(doc, door.wallId),
    MIN_DOOR_LENGTH,
    door.offset + (door.length - lengthCm) / 2,
    lengthCm,
  );
  if (!next) return doc;
  return copyDoc(doc, { doors: { ...doc.doors, [doorId]: { ...door, ...next } } });
}

/** Slides a window along its wall, keeping it inside; no-op when unknown. */
export function setWindowOffset(doc: PlanDoc, windowId: WindowId, offsetCm: number): PlanDoc {
  const win = doc.windows[windowId];
  if (!win) return doc;
  const wallLen = wallCenterLength(doc, win.wallId);
  const next = clampedPlacement(win, wallLen, MIN_WINDOW_LENGTH, offsetCm, win.length);
  if (!next) return doc;
  return copyDoc(doc, { windows: { ...doc.windows, [windowId]: { ...win, offset: next.offset } } });
}

/** Slides a door along its wall, keeping it inside; no-op when unknown. */
export function setDoorOffset(doc: PlanDoc, doorId: DoorId, offsetCm: number): PlanDoc {
  const door = doc.doors[doorId];
  if (!door) return doc;
  const wallLen = wallCenterLength(doc, door.wallId);
  const next = clampedPlacement(door, wallLen, MIN_DOOR_LENGTH, offsetCm, door.length);
  if (!next) return doc;
  return copyDoc(doc, { doors: { ...doc.doors, [doorId]: { ...door, offset: next.offset } } });
}

/** Sets both window edges at once (drag commit); values clamp back into the wall. */
export function resizeWindow(doc: PlanDoc, windowId: WindowId, offset: number, length: number): PlanDoc {
  const win = doc.windows[windowId];
  if (!win) return doc;
  const next = clampedPlacement(win, wallCenterLength(doc, win.wallId), MIN_WINDOW_LENGTH, offset, length);
  if (!next) return doc;
  return copyDoc(doc, { windows: { ...doc.windows, [windowId]: { ...win, ...next } } });
}

/** Sets both door edges at once (drag commit); values clamp back into the wall. */
export function resizeDoor(doc: PlanDoc, doorId: DoorId, offset: number, length: number): PlanDoc {
  const door = doc.doors[doorId];
  if (!door) return doc;
  const next = clampedPlacement(door, wallCenterLength(doc, door.wallId), MIN_DOOR_LENGTH, offset, length);
  if (!next) return doc;
  return copyDoc(doc, { doors: { ...doc.doors, [doorId]: { ...door, ...next } } });
}

/**
 * Cycles a door's swing mode (tl → tr → br → bl → none → …); passing an
 * explicit mode sets it directly. Unknown ids/modes are no-ops.
 */
export function cycleDoorMode(doc: PlanDoc, doorId: DoorId): PlanDoc;
export function cycleDoorMode(doc: PlanDoc, doorId: DoorId, step: 1 | -1): PlanDoc;
export function cycleDoorMode(doc: PlanDoc, doorId: DoorId, mode: DoorMode): PlanDoc;
export function cycleDoorMode(doc: PlanDoc, doorId: DoorId, arg: DoorMode | 1 | -1 = 1): PlanDoc {
  const door = doc.doors[doorId];
  if (!door) return doc;
  let mode: DoorMode;
  if (arg === 1 || arg === -1) {
    const i = DOOR_MODES.indexOf(door.mode);
    const n = DOOR_MODES.length;
    mode = DOOR_MODES[(i + arg + n) % n];
  } else {
    if (!DOOR_MODES.includes(arg)) return doc;
    mode = arg;
  }
  if (mode === door.mode) return doc;
  return copyDoc(doc, { doors: { ...doc.doors, [doorId]: { ...door, mode } } });
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
