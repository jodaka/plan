import { describe, expect, test } from 'bun:test';
import { angleBetweenDeg, axisAlign, dist, snap, snapPt, wallAngleDeg, wallCorners } from '../src/lib/geometry';
import {
  addWall,
  deleteWall,
  docBBox,
  emptyDoc,
  findJointNear,
  moveJoint,
  setInnerLength,
  setLength,
  setThickness,
} from '../src/lib/model/ops';

/** 210×210 centerline box, all walls t=10 → every inner span is 200. */
function boxDoc() {
  let doc = emptyDoc();
  const sides = [
    [
      { x: 0, y: 0 },
      { x: 210, y: 0 },
    ],
    [
      { x: 210, y: 0 },
      { x: 210, y: 210 },
    ],
    [
      { x: 210, y: 210 },
      { x: 0, y: 210 },
    ],
    [
      { x: 0, y: 210 },
      { x: 0, y: 0 },
    ],
  ];
  for (const [a, b] of sides) doc = addWall(doc, a, b, { attachTolCm: 0.01 }).doc;
  return doc;
}

describe('geometry', () => {
  test('snap rounds to grid', () => {
    expect(snap(4.6)).toBe(5);
    expect(snap(-4.4)).toBe(-4);
    expect(snapPt({ x: 10.6, y: -0.4 })).toEqual({ x: 11, y: 0 });
  });

  test('wall angle ignores direction', () => {
    expect(wallAngleDeg({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
    expect(wallAngleDeg({ x: 0, y: 0 }, { x: -10, y: 0 })).toBe(0);
    expect(wallAngleDeg({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(90);
    expect(wallAngleDeg({ x: 0, y: 0 }, { x: 0, y: -10 })).toBeCloseTo(90);
  });

  test('angle between handles wraparound', () => {
    expect(angleBetweenDeg(350, 10)).toBe(20);
    expect(angleBetweenDeg(10, 350)).toBe(20);
    expect(angleBetweenDeg(90, 270)).toBe(180);
  });

  test('axisAlign detects horizontal/vertical within tolerance', () => {
    expect(axisAlign({ x: 0, y: 0 }, { x: 50, y: 0.5 })).toBe('h');
    expect(axisAlign({ x: 0, y: 0 }, { x: 0.5, y: 50 })).toBe('v');
    expect(axisAlign({ x: 0, y: 0 }, { x: 30, y: 30 })).toBeNull();
  });
});

describe('ops', () => {
  test('addWall creates two joints and one wall', () => {
    const r = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 100, y: 0 });
    expect(r.wallId).toBeTruthy();
    expect(Object.keys(r.doc.joints)).toHaveLength(2);
    expect(Object.keys(r.doc.walls)).toHaveLength(1);
  });

  test('addWall rejects zero-length walls', () => {
    const r = addWall(emptyDoc(), { x: 5, y: 5 }, { x: 5, y: 5 });
    expect(r.wallId).toBeNull();
  });

  test('addWall attaches to an existing joint within tolerance', () => {
    const a = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 100, y: 0 }).doc;
    const b = addWall(a, { x: 101, y: 0.5 }, { x: 100, y: 80 }, { attachTolCm: 2 });
    expect(b.wallId).toBeTruthy();
    expect(Object.keys(b.doc.joints)).toHaveLength(3);
  });

  test('moveJoint moves all attached walls via shared corner', () => {
    const a = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 100, y: 0 }).doc;
    const b = addWall(a, { x: 100, y: 0 }, { x: 100, y: 80 }, { attachTolCm: 0.01 }).doc;
    const cornerId = Object.values(b.joints).find((j) => j.x === 100 && j.y === 0)!.id;

    const c = moveJoint(b, cornerId, { x: 120, y: -5 });
    expect(c.joints[cornerId]).toEqual({ id: cornerId, x: 120, y: -5 });

    const [w1, w2] = Object.values(c.walls);
    const ends = new Set([w1.startJointId, w1.endJointId]);
    expect(ends.has(cornerId)).toBe(true);
    expect(new Set([w2.startJointId, w2.endJointId]).has(cornerId)).toBe(true);

    // original doc untouched (immutability)
    expect(b.joints[cornerId].x).toBe(100);
  });

  test('setThickness clamps into [1..100]', () => {
    const d = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 50, y: 0 }).doc;
    const id = Object.keys(d.walls)[0];
    expect(setThickness(d, id, 500).walls[id].thickness).toBe(100);
    expect(setThickness(d, id, -3).walls[id].thickness).toBe(1);
    expect(setThickness(d, id, 24).walls[id].thickness).toBe(24);
  });

  test('setLength moves end joint along direction, start stays put', () => {
    let d = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 40, y: 0 }).doc;
    let id = Object.keys(d.walls)[0];
    let s = d.joints[d.walls[id].startJointId];
    let e = d.joints[d.walls[id].endJointId];

    let r = setLength(d, id, 200);
    let re = r.joints[e.id];
    expect(re.x).toBe(200);
    expect(re.y).toBe(0);
    expect(r.joints[s.id]).toEqual(s);

    // diagonal keeps direction
    d = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 30, y: 40 }).doc;
    id = Object.keys(d.walls)[0];
    r = setLength(d, id, 100);
    e = d.joints[d.walls[id].endJointId];
    re = r.joints[e.id];
    expect(re.x).toBe(60);
    expect(re.y).toBe(80);
  });

  test('setThickness compensates: connected inner lengths preserved', () => {
    const doc = boxDoc();
    const topId = Object.keys(doc.walls)[0];
    const leftId = Object.keys(doc.walls)[3];

    const thickened = setThickness(doc, topId, 20);
    const top = thickened.walls[topId];
    const ta = thickened.joints[top.startJointId];
    const tb = thickened.joints[top.endJointId];
    // both joints shifted outward (−y) by Δt/2 = 5; own centerline unchanged
    expect([ta.x, ta.y]).toEqual([0, -5]);
    expect([tb.x, tb.y]).toEqual([210, -5]);
    expect(dist(ta, tb)).toBe(210);

    // left wall: centerline 215, exts 10 (top t=20) + 5 (bottom) → inner 200
    const left = thickened.walls[leftId];
    expect(dist(thickened.joints[left.startJointId], thickened.joints[left.endJointId])).toBe(215);

    // thickness back down → exact original geometry restored
    const restored = setThickness(thickened, topId, 10);
    expect(restored.joints).toEqual(doc.joints);
    expect(restored.walls[topId].thickness).toBe(10);
  });

  test('setThickness leaves isolated walls in place', () => {
    const { doc } = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 50, y: 0 });
    const id = Object.keys(doc.walls)[0];
    const changed = setThickness(doc, id, 30);
    expect(changed.joints).toEqual(doc.joints);
    expect(changed.walls[id].thickness).toBe(30);
  });

  test('setInnerLength targets the clear span between neighbors', () => {
    const doc = boxDoc();
    const leftId = Object.keys(doc.walls)[3];
    const grown = setInnerLength(doc, leftId, 300);
    const left = grown.walls[leftId];
    // exts 5 + 5 → centerline target 310
    expect(dist(grown.joints[left.startJointId], grown.joints[left.endJointId])).toBe(310);
    // inner span now measures 300
    expect(310 - 5 - 5).toBe(300);
  });

  test('setThickness preserves non-perpendicular neighbor angles and inner lengths', () => {
    let doc = emptyDoc();
    // W horizontal; N_A diagonal at 45°; N_B vertical
    doc = addWall(doc, { x: 0, y: 0 }, { x: 100, y: 0 }, { attachTolCm: 0.01 }).doc;
    doc = addWall(doc, { x: 0, y: 0 }, { x: 30, y: 30 }, { attachTolCm: 0.01 }).doc;
    doc = addWall(doc, { x: 100, y: 0 }, { x: 100, y: 40 }, { attachTolCm: 0.01 }).doc;
    const wId = Object.keys(doc.walls)[0];
    const naId = Object.keys(doc.walls)[1];

    const wallDir = (d: typeof doc, id: string) => {
      const w = d.walls[id];
      const a = d.joints[w.startJointId];
      const b = d.joints[w.endJointId];
      return { x: b.x - a.x, y: b.y - a.y };
    };
    const before = wallDir(doc, naId);

    const thickened = setThickness(doc, wId, 20);
    const after = wallDir(thickened, naId);
    // N_A direction unchanged (angle preserved): still parallel to (1,1)
    expect(after.x * before.y - after.y * before.x).toBeCloseTo(0, 6);
    expect(after.x * before.x + after.y * before.y).toBeGreaterThan(0);

    // N_A grew along its own axis by Δt/2 → inner length preserved
    const naBefore = doc.walls[naId];
    const naAfter = thickened.walls[naId];
    const lenBefore = dist(doc.joints[naBefore.startJointId], doc.joints[naBefore.endJointId]);
    const lenAfter = dist(thickened.joints[naAfter.startJointId], thickened.joints[naAfter.endJointId]);
    expect(lenAfter - lenBefore).toBeCloseTo(5, 6);
    // inner before: len − 5 (W t10/2); inner after: len+5 − 10 (W t20/2) — equal
    expect(lenBefore - 5).toBeCloseTo(lenAfter - 10, 6);

    // N_B (vertical) keeps its direction too (it grows by Δt/2 along its axis)
    const nbBefore = wallDir(doc, Object.keys(doc.walls)[2]);
    const nbAfter = wallDir(thickened, Object.keys(doc.walls)[2]);
    expect(nbAfter.x * nbBefore.y - nbAfter.y * nbBefore.x).toBeCloseTo(0, 6);
    expect(nbAfter.x * nbBefore.x + nbAfter.y * nbBefore.y).toBeGreaterThan(0);
  });

  test('wallCorners: free ends produce a rectangle', () => {
    const c = wallCorners({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, null, null);
    expect(c).toEqual([
      { x: 0, y: 5 },
      { x: 100, y: 5 },
      { x: 100, y: -5 },
      { x: 0, y: -5 },
    ]);
  });

  test('wallCorners: perpendicular neighbor miters the L corner', () => {
    const c = wallCorners({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, null, {
      dir: { x: 0, y: -1 },
      t: 10,
    });
    // outer corner (105,5), inner corner (95,-5)
    expect(c[1]).toEqual({ x: 105, y: 5 });
    expect(c[2]).toEqual({ x: 95, y: -5 });
  });

  test('wallCorners: both walls of a joint compute the same miter corners', () => {
    const v = { x: Math.SQRT1_2, y: -Math.SQRT1_2 }; // 45° up-right
    const w = wallCorners({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, null, { dir: v, t: 10 });
    const n = wallCorners(
      { x: 100, y: 0 },
      { x: 100 + 30 * v.x, y: 30 * v.y },
      10,
      { dir: { x: -1, y: 0 }, t: 10 }, // W's axis from the joint
      null,
    );
    // shared end: W's B-side corners and N's A-side corners must coincide
    const key = (p: { x: number; y: number }) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
    expect([key(w[1]), key(w[2])].sort()).toEqual([key(n[0]), key(n[3])].sort());
  });

  test('wallCorners: very acute angles fall back to a plain cut', () => {
    const v = { x: -Math.cos(0.05), y: Math.sin(0.05) }; // ~3° off wDir (−1,0)
    const c = wallCorners({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, null, { dir: v, t: 10 });
    expect(c[1]).toEqual({ x: 100, y: 5 });
    expect(c[2]).toEqual({ x: 100, y: -5 });
  });

  test('deleteWall removes wall and orphaned joints, keeps shared ones', () => {
    const a = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 100, y: 0 }).doc;
    const b = addWall(a, { x: 100, y: 0 }, { x: 100, y: 80 }, { attachTolCm: 0.01 }).doc;
    const wallBId = Object.keys(b.walls)[1];

    const after = deleteWall(b, wallBId);
    expect(Object.keys(after.walls)).toHaveLength(1);
    // orphaned free end of B is gone; A's joints survive
    expect(Object.keys(after.joints)).toHaveLength(2);
    for (const j of Object.values(after.joints)) {
      expect(j.y).toBe(0);
    }
  });

  test('findJointNear returns nearest within tolerance only', () => {
    const d = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 100, y: 0 }).doc;
    expect(findJointNear(d, { x: 1, y: 1 }, 2)?.x).toBe(0);
    expect(findJointNear(d, { x: 1, y: 1 }, 0.5)).toBeNull();
    expect(findJointNear(d, { x: 99, y: 0 }, 2)?.x).toBe(100);
  });

  test('docBBox covers all joints', () => {
    const d = addWall(emptyDoc(), { x: -10, y: -20 }, { x: 40, y: 70 }).doc;
    expect(docBBox(d)).toEqual({ minX: -10, minY: -20, maxX: 40, maxY: 70 });
    expect(docBBox(emptyDoc())).toBeNull();
  });

  test('dist sanity', () => {
    expect(dist({ x: 3, y: 4 }, { x: 0, y: 0 })).toBe(5);
  });
});
