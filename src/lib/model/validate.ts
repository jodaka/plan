import type { DoorMode, PlanDoc } from '../types';
import { DOOR_MODES, MIN_DOOR_LENGTH, MIN_WINDOW_LENGTH } from '../types';
import { catalogItem } from '../items/registry';
import { dist } from '../geometry';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function num(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

interface OpeningParts {
  wallId: string;
  offset: number;
  length: number;
}

/**
 * Shared window/door repair (both kinds live on the wall axis with the same
 * shape rules): entry shape check, surviving-wall lookup, then clamping the
 * length to [minLength, wallLen] and the offset into the remaining span.
 * Returns null for entries that must be culled.
 */
function sanitizeOpening(
  raw: unknown,
  walls: PlanDoc['walls'],
  joints: PlanDoc['joints'],
  minLength: number,
): OpeningParts | null {
  if (!isRecord(raw) || typeof raw.wallId !== 'string' || !num(raw.offset) || !num(raw.length)) {
    return null;
  }
  const wall = walls[raw.wallId];
  if (!wall) {
    return null;
  }
  const a = joints[wall.startJointId];
  const b = joints[wall.endJointId];
  if (!a || !b) {
    return null;
  }
  const wallLen = dist(a, b);
  const length = Math.max(minLength, Math.min(wallLen, raw.length));
  const offset = Math.max(0, Math.min(Math.max(0, wallLen - length), raw.offset));
  return { wallId: raw.wallId, offset, length };
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

  // windows/doors: must reference a surviving wall and sit inside its span —
  // identical shape rules for both kinds, so one shared helper validates them
  const windows: PlanDoc['windows'] = {};
  if (isRecord(data.windows)) {
    for (const [id, w] of Object.entries(data.windows)) {
      const parts = sanitizeOpening(w, walls, joints, MIN_WINDOW_LENGTH);
      if (parts) {
        windows[id] = { id, ...parts };
      }
    }
  }

  const doors: PlanDoc['doors'] = {};
  if (isRecord(data.doors)) {
    for (const [id, d] of Object.entries(data.doors)) {
      const parts = sanitizeOpening(d, walls, joints, MIN_DOOR_LENGTH);
      if (!parts) {
        continue;
      }
      const mode: DoorMode = isRecord(d) && DOOR_MODES.includes(d.mode as DoorMode) ? (d.mode as DoorMode) : 'none';
      doors[id] = { id, ...parts, mode };
    }
  }
  // optional room names: non-empty strings only, keyed by stable room keys
  const roomNames: PlanDoc['roomNames'] = {};
  if (isRecord(data.roomNames)) {
    for (const [key, name] of Object.entries(data.roomNames)) {
      if (key !== '' && typeof name === 'string' && name.trim() !== '') {
        roomNames[key] = name.trim();
      }
    }
  }
  return { version: 1, joints, walls, roomObjects, windows, doors, roomNames };
}
