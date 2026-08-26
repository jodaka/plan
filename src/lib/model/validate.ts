import type { DoorMode, PlanDoc, WallDoor, WallWindow } from '../types';
import { DOOR_MODES, MIN_DOOR_LENGTH, MIN_WINDOW_LENGTH } from '../types';
import { catalogItem } from './catalog';
import { dist } from '../geometry';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function num(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Repairs/culls malformed plan data (wrong shape, non-finite coordinates,
 * dangling joint references, broken room objects, openings off their walls,
 * unknown door modes) so corrupt input degrades to a partial plan instead of
 * crashing the app. Tolerates pre-roomObjects / pre-windows / pre-doors docs
 * (fields normalized to {}).
 * Rooms themselves are derived and are never part of persisted data.
 */
export function sanitizeDoc(data: unknown): PlanDoc | null {
  if (!isRecord(data) || data.version !== 1 || !isRecord(data.joints) || !isRecord(data.walls)) {
    return null;
  }
  const joints: PlanDoc['joints'] = {};
  const walls: PlanDoc['walls'] = {};

  for (const [id, j] of Object.entries(data.joints)) {
    if (isRecord(j) && num(j.x) && num(j.y)) {
      joints[id] = { id, x: j.x, y: j.y };
    }
  }
  for (const [id, w] of Object.entries(data.walls)) {
    if (
      isRecord(w) &&
      typeof w.startJointId === 'string' &&
      typeof w.endJointId === 'string' &&
      joints[w.startJointId] &&
      joints[w.endJointId] &&
      num(w.thickness)
    ) {
      walls[id] = {
        id,
        startJointId: w.startJointId,
        endJointId: w.endJointId,
        thickness: w.thickness,
      };
    }
  }

  const roomObjects: PlanDoc['roomObjects'] = {};
  if (isRecord(data.roomObjects)) {
    for (const [id, o] of Object.entries(data.roomObjects)) {
      if (
        isRecord(o) &&
        typeof o.roomId === 'string' &&
        o.roomId !== '' &&
        typeof o.kind === 'string' &&
        o.kind !== '' &&
        num(o.x) &&
        num(o.y)
      ) {
        // size/rotation are newer fields — fall back to catalog defaults
        const cat = catalogItem(o.kind);
        const w = num(o.w) && o.w > 0 ? o.w : cat.w;
        const d = num(o.d) && o.d > 0 ? o.d : cat.d;
        const rotation = num(o.rotation) ? ((o.rotation % 360) + 360) % 360 || 0 : 0;
        roomObjects[id] = { id, roomId: o.roomId, kind: o.kind, x: o.x, y: o.y, w, d, rotation };
      }
    }
  }

  // windows/doors: must reference a surviving wall and sit inside its span
  const windows: PlanDoc['windows'] = {};
  if (isRecord(data.windows)) {
    for (const [id, w] of Object.entries(data.windows)) {
      if (!isRecord(w) || typeof w.wallId !== 'string' || !num(w.offset) || !num(w.length)) continue;
      const wall = walls[w.wallId];
      if (!wall) continue;
      const a = joints[wall.startJointId];
      const b = joints[wall.endJointId];
      if (!a || !b) continue;
      const wallLen = dist(a, b);
      const length = Math.max(MIN_WINDOW_LENGTH, Math.min(wallLen, w.length));
      const offset = Math.max(0, Math.min(Math.max(0, wallLen - length), w.offset));
      const win: WallWindow = { id, wallId: w.wallId, offset, length };
      windows[id] = win;
    }
  }

  const doors: PlanDoc['doors'] = {};
  if (isRecord(data.doors)) {
    for (const [id, d] of Object.entries(data.doors)) {
      if (!isRecord(d) || typeof d.wallId !== 'string' || !num(d.offset) || !num(d.length)) continue;
      const wall = walls[d.wallId];
      if (!wall) continue;
      const a = joints[wall.startJointId];
      const b = joints[wall.endJointId];
      if (!a || !b) continue;
      const wallLen = dist(a, b);
      const length = Math.max(MIN_DOOR_LENGTH, Math.min(wallLen, d.length));
      const offset = Math.max(0, Math.min(Math.max(0, wallLen - length), d.offset));
      const mode: DoorMode = DOOR_MODES.includes(d.mode as DoorMode) ? (d.mode as DoorMode) : 'none';
      const door: WallDoor = { id, wallId: d.wallId, offset, length, mode };
      doors[id] = door;
    }
  }
  // optional room names: non-empty strings only, keyed by stable room keys
  const roomNames: PlanDoc['roomNames'] = {};
  if (isRecord(data.roomNames)) {
    for (const [key, name] of Object.entries(data.roomNames)) {
      if (key !== '' && typeof name === 'string' && name.trim() !== '') roomNames[key] = name.trim();
    }
  }
  return { version: 1, joints, walls, roomObjects, windows, doors, roomNames };
}
