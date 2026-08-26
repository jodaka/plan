import { addPt, lineIntersect, mul, sub, unit, dist, type Pt } from '../geometry';
import type { JointId, PlanDoc, WallId } from '../types';

export interface Room {
  /** ordered vertices of the closed loop (wall centerline corners), cm */
  pts: Pt[];
  /** shoelace area of the centerline loop, cm² */
  areaCm2: number;
  /** clear-floor area inside the walls' inner faces, cm² (≥ 0) */
  innerAreaCm2: number;
  /** ids of the walls forming the loop */
  wallIds: WallId[];
  /**
   * Stable identity of the room: derived from its wall set (sorted ids),
   * so bindings to it survive joint moves, thickness edits and undo/redo —
   * and break exactly when the loop itself breaks.
   */
  key: string;
}

interface HalfEdge {
  from: JointId;
  to: JointId;
  /** unit direction from `from` toward `to` */
  dir: Pt;
  /** the wall this directed edge belongs to */
  wallId: WallId;
}

/** faces smaller than this are slivers between duplicate/collinear walls, not rooms */
const MIN_AREA_CM2 = 1;

/** inset intersections farther away than this many half-thicknesses bevel (mirrors geometry MITER_CAP) */
const INSET_CAP = 3;

/**
 * Finds every closed wall figure in the plan by tracing the bounded faces
 * of the wall graph (planar face traversal): each wall yields two directed
 * half-edges; walking the "counterclockwise predecessor of the arrival
 * direction" partitions all half-edges into faces. Loops with positive
 * shoelace area are enclosed spaces (rooms); negative ones are the outside.
 * Purely derived from joints+walls — deleting or moving walls updates rooms
 * with no extra bookkeeping.
 */
export function findRooms(joints: PlanDoc['joints'], walls: PlanDoc['walls']): Room[] {
  // adjacency: joint -> half-edges sorted CCW by angle (deduped per target)
  const adj = new Map<JointId, HalfEdge[]>();
  const addEdge = (wallId: WallId, from: JointId, to: JointId) => {
    const jf = joints[from];
    const jt = joints[to];
    if (!jf || !jt) return;
    let list = adj.get(from);
    if (!list) {
      list = [];
      adj.set(from, list);
    }
    if (list.some((e) => e.to === to)) return;
    list.push({ from, to, dir: unit({ x: jt.x - jf.x, y: jt.y - jf.y }), wallId });
  };
  for (const w of Object.values(walls)) {
    addEdge(w.id, w.startJointId, w.endJointId);
    addEdge(w.id, w.endJointId, w.startJointId);
  }
  for (const list of adj.values()) {
    list.sort((p, q) => Math.atan2(p.dir.y, p.dir.x) - Math.atan2(q.dir.y, q.dir.x));
  }

  const visited = new Set<string>();
  const rooms: Room[] = [];

  for (const [, edges] of adj) {
    for (const start of edges) {
      if (visited.has(edgeKey(start))) continue;

      // trace one face: at each joint continue with the CCW PREDECESSOR of
      // the half-edge pointing back where we came from — this keeps the face
      // contiguous even at pinched joints (two rooms sharing one corner)
      const loop: HalfEdge[] = [];
      let closed = false;
      let cur = start;
      while (!visited.has(edgeKey(cur))) {
        visited.add(edgeKey(cur));
        loop.push(cur);
        const list = adj.get(cur.to);
        if (!list) break;
        const back = list.findIndex((e) => e.to === cur.from);
        if (back < 0) break;
        const next = list[(back - 1 + list.length) % list.length];
        if (next.from === start.from && next.to === start.to) {
          closed = true;
          break;
        }
        cur = next;
      }

      if (closed && loop.length >= 3) {
        // vertex i ends loop[i]; the edge STARTING at vertex i is loop[i+1]
        const pts: Pt[] = loop.map((e) => {
          const j = joints[e.to];
          return { x: j?.x ?? 0, y: j?.y ?? 0 };
        });
        const edgeT = loop.map((_, i) => walls[loop[(i + 1) % loop.length].wallId]?.thickness ?? 0);
        const areaCm2 = shoelaceArea(pts);
        if (areaCm2 > MIN_AREA_CM2) {
          const wallIds = loop.map((e) => e.wallId);
          rooms.push({
            pts,
            areaCm2,
            innerAreaCm2: innerArea(pts, edgeT),
            wallIds,
            key: roomKey(wallIds),
          });
        }
      }
    }
  }
  return rooms;
}

/**
 * Clear-floor area: the centerline loop inset by half of each edge wall's
 * thickness (each wall's inner face is its axis shifted toward the room
 * interior; consecutive inner faces intersect at the inner corners). Handles
 * per-wall thicknesses and non-rectangular loops. Corners whose inset
 * intersection shoots far away (acute angles) and parallel/collinear face
 * lines (e.g. two collinear walls on one side) bevel to the averaged offset
 * points instead. Returns ≥ 0; walls overlapping the room away give 0.
 */
function innerArea(pts: Pt[], edgeThickness: number[]): number {
  const n = pts.length;
  const lines: { p: Pt; d: Pt }[] = [];
  const normals: Pt[] = [];
  const halves: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = unit(sub(pts[(i + 1) % n], pts[i]));
    const nrm = { x: -u.y, y: u.x }; // interior side of positive-shoelace loops
    const half = edgeThickness[i] / 2;
    normals.push(nrm);
    halves.push(half);
    lines.push({ p: addPt(pts[i], mul(nrm, half)), d: u });
  }

  const inner: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const l1 = lines[(i - 1 + n) % n];
    const l2 = lines[i];
    const v = pts[i];
    const x = lineIntersect(l1.p, l1.d, l2.p, l2.d);
    const hMax = Math.max(halves[(i - 1 + n) % n], halves[i]);
    if (x && dist(x, v) <= INSET_CAP * hMax) {
      inner.push(x);
    } else {
      // bevel: average of the two neighbouring face offsets at this corner
      const o1 = addPt(v, mul(normals[(i - 1 + n) % n], halves[(i - 1 + n) % n]));
      const o2 = addPt(v, mul(normals[i], halves[i]));
      inner.push(mul(addPt(o1, o2), 0.5));
    }
  }
  return Math.max(0, shoelaceArea(inner));
}

/**
 * Stable identity of a room loop: its wall-id set, order-normalized. The
 * same closed figure always maps to the same key; deleting or redrawing any
 * wall produces a different key (the delete-flow warning covers that case).
 */
export function roomKey(wallIds: WallId[]): string {
  return [...wallIds].sort().join(':');
}

/** all room-bound entities attached to the room with the given key */
export function roomObjectsIn(doc: PlanDoc, roomKeyStr: string): PlanDoc['roomObjects'] {
  const out: PlanDoc['roomObjects'] = {};
  for (const [id, o] of Object.entries(doc.roomObjects)) {
    if (o.roomId === roomKeyStr) out[id] = o;
  }
  return out;
}

function edgeKey(e: HalfEdge): string {
  return `${e.from}>${e.to}`;
}

/** signed area of a polygon, cm²; positive = counterclockwise in world coords */
export function shoelaceArea(pts: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return sum / 2;
}
