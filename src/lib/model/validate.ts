import type { PlanDoc } from '../types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function num(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Repairs/culls malformed plan data (wrong shape, non-finite coordinates,
 * dangling joint references, broken room objects) so corrupt input degrades
 * to a partial plan instead of crashing the app. Tolerates pre-roomObjects
 * docs (field normalized to {}). Rooms themselves are derived and are never
 * part of persisted data.
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
        roomObjects[id] = { id, roomId: o.roomId, kind: o.kind, x: o.x, y: o.y };
      }
    }
  }
  return { version: 1, joints, walls, roomObjects };
}
