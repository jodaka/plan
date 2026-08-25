import { unit, type Pt } from '../geometry';
import type { JointId, PlanDoc } from '../types';

export interface Room {
  /** ordered vertices of the closed loop (wall centerline corners), cm */
  pts: Pt[];
  /** shoelace area of the loop, cm² */
  areaCm2: number;
}

interface HalfEdge {
  to: JointId;
  /** unit direction from this joint toward `to` */
  dir: Pt;
}

/** faces smaller than this are slivers between duplicate/collinear walls, not rooms */
const MIN_AREA_CM2 = 1;

/**
 * Finds every closed wall figure in the plan by tracing the bounded faces
 * of the wall graph (planar face traversal): each wall yields two directed
 * half-edges; walking "counterclockwise successor of the arrival direction"
 * around each joint partitions all half-edges into faces. Loops with positive
 * shoelace area are enclosed spaces (rooms); negative ones are the outside.
 * Purely derived from joints+walls — deleting or moving walls updates rooms
 * with no extra bookkeeping.
 */
export function findRooms(joints: PlanDoc['joints'], walls: PlanDoc['walls']): Room[] {
  // adjacency: joint -> half-edges sorted CCW by angle (deduped per target)
  const adj = new Map<JointId, HalfEdge[]>();
  const addEdge = (from: JointId, to: JointId) => {
    const jf = joints[from];
    const jt = joints[to];
    if (!jf || !jt) return;
    let list = adj.get(from);
    if (!list) {
      list = [];
      adj.set(from, list);
    }
    if (list.some((e) => e.to === to)) return;
    list.push({ to, dir: unit({ x: jt.x - jf.x, y: jt.y - jf.y }) });
  };
  for (const w of Object.values(walls)) {
    addEdge(w.startJointId, w.endJointId);
    addEdge(w.endJointId, w.startJointId);
  }
  for (const list of adj.values()) {
    list.sort((p, q) => Math.atan2(p.dir.y, p.dir.x) - Math.atan2(q.dir.y, q.dir.x));
  }

  const visited = new Set<string>();
  const rooms: Room[] = [];

  for (const [startFrom, edges] of adj) {
    for (const start of edges) {
      if (visited.has(edgeKey(startFrom, start.to))) continue;

      // trace one face: at each joint continue with the CCW PREDECESSOR of
      // the half-edge pointing back where we came from — this keeps the face
      // contiguous even at pinched joints (two rooms sharing one corner)
      const pts: Pt[] = [];
      let closed = false;
      let from: JointId = startFrom;
      let to: JointId = start.to;
      while (!visited.has(edgeKey(from, to))) {
        visited.add(edgeKey(from, to));
        const j = joints[to];
        if (!j) break;
        const prev = pts[pts.length - 1];
        if (!prev || prev.x !== j.x || prev.y !== j.y) pts.push({ x: j.x, y: j.y });

        const list = adj.get(to);
        if (!list) break;
        const back = list.findIndex((e) => e.to === from);
        if (back < 0) break;
        const next = list[(back - 1 + list.length) % list.length];
        if (next.to === start.to && to === startFrom) {
          closed = true;
          break;
        }
        from = to;
        to = next.to;
      }

      if (closed && pts.length >= 3) {
        const areaCm2 = shoelaceArea(pts);
        if (areaCm2 > MIN_AREA_CM2) rooms.push({ pts, areaCm2 });
      }
    }
  }
  return rooms;
}

function edgeKey(from: JointId, to: JointId): string {
  return `${from}>${to}`;
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
