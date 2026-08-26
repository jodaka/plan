import { describe, expect, test } from 'bun:test';
import { angleBetweenDeg, axisAlign, dist, snap, snapPt, wallAngleDeg, wallCorners } from '../src/lib/geometry';
import {
  addWall,
  addDoor,
  addWindow,
  cycleDoorMode,
  deleteDoor,
  deleteWall,
  deleteWindow,
  docBBox,
  emptyDoc,
  findJointNear,
  MIN_WALL_LENGTH,
  moveJoint,
  resizeDoor,
  resizeWindow,
  setDoorLength,
  setDoorOffset,
  setInnerLength,
  setLength,
  setThickness,
  setWindowLength,
  setWindowOffset,
  violatedOpeningFloors,
  wallDoorSpanCm,
  wallOpeningSpanCm,
  wallWindowSpanCm,
  doorsOnWall,
  windowsOnWall,
  windowGapBounds,
} from '../src/lib/model/ops';
import { sanitizeDoc } from '../src/lib/model/validate';
import type { DoorMode } from '../src/lib/types';

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

describe('windows', () => {
  test('addWindow centers a default window in the free span', () => {
    const { doc } = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 300, y: 0 });
    const wallId = Object.keys(doc.walls)[0];
    const res = addWindow(doc, wallId);
    expect(res.window).not.toBeNull();
    const win = res.window!;
    expect(win.wallId).toBe(wallId);
    expect(win.offset).toBe(100); // centered on a 300 cm wall
    expect(Object.keys(res.doc.windows)).toHaveLength(1);
    // original doc untouched (immutability)
    expect(Object.keys(doc.windows)).toHaveLength(0);
  });

  test('addWindow places the next window into the largest gap', () => {
    let doc = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 500, y: 0 }).doc;
    const wallId = Object.keys(doc.walls)[0];
    doc = addWindow(doc, wallId).doc; // [200..300]
    doc = addWindow(doc, wallId).doc;
    const wins = windowsOnWall(doc, wallId);
    expect(wins).toHaveLength(2);
    // both gaps are 200 cm wide; ties fill the earliest one → new window [50..150]
    expect(wins[0].offset).toBe(50);
  });

  test('addWindow places into a strictly larger later gap', () => {
    let doc = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 600, y: 0 }).doc;
    const wallId = Object.keys(doc.walls)[0];
    doc = addWindow(doc, wallId).doc; // [250..350]
    doc = setWindowOffset(doc, windowsOnWall(doc, wallId)[0].id, 0); // [0..100]
    doc = addWindow(doc, wallId).doc;
    const wins = windowsOnWall(doc, wallId);
    // 100 cm window centered in the 500 cm gap [100..600]
    expect(wins[1].offset).toBe(300);
  });

  test('addWindow rejects walls without room', () => {
    const { doc } = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 8, y: 0 });
    const wallId = Object.keys(doc.walls)[0];
    const res = addWindow(doc, wallId);
    expect(res.window).toBeNull();
    expect(res.doc).toBe(doc);
  });

  test('setWindowLength grows around the center and clamps into the wall', () => {
    let doc = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 100, y: 0 }).doc;
    const wallId = Object.keys(doc.walls)[0];
    doc = addWindow(doc, wallId).doc;
    const win = windowsOnWall(doc, wallId)[0];

    const grown = setWindowLength(doc, win.id, 60);
    const g = grown.windows[win.id];
    expect(g.length).toBe(60);
    expect(g.offset).toBe(20); // center stays at 50

    // growing past the wall caps at wall length, flush to the end
    const huge = setWindowLength(doc, win.id, 500);
    const h = huge.windows[win.id];
    expect(h.length).toBe(100);
    expect(h.offset).toBe(0);

    // below the minimum clamps up
    const tiny = setWindowLength(doc, win.id, 1);
    expect(tiny.windows[win.id].length).toBe(10);
  });

  test('setWindowOffset slides within wall bounds', () => {
    let doc = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 200, y: 0 }).doc;
    const wallId = Object.keys(doc.walls)[0];
    doc = addWindow(doc, wallId).doc; // [50..150], len 100
    const win = windowsOnWall(doc, wallId)[0];

    expect(setWindowOffset(doc, win.id, 80).windows[win.id].offset).toBe(80);
    expect(setWindowOffset(doc, win.id, -5).windows[win.id].offset).toBe(0);
    expect(setWindowOffset(doc, win.id, 150).windows[win.id].offset).toBe(100); // 200 − 100
  });

  test('resizeWindow clamps both edges back into the wall', () => {
    let doc = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 100, y: 0 }).doc;
    const wallId = Object.keys(doc.walls)[0];
    doc = addWindow(doc, wallId).doc;
    const win = windowsOnWall(doc, wallId)[0];

    const r = resizeWindow(doc, win.id, -30, 40);
    expect(r.windows[win.id]).toEqual({ id: win.id, wallId, offset: 0, length: 40 });

    const r2 = resizeWindow(doc, win.id, 90, 500);
    expect(r2.windows[win.id]).toEqual({ id: win.id, wallId, offset: 0, length: 100 });
  });

  test('moveJoint keeps windows in place while they fit, then clamps flush', () => {
    let doc = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 300, y: 0 }).doc;
    const wallId = Object.keys(doc.walls)[0];
    const startJid = doc.walls[wallId].startJointId;
    doc = addWindow(doc, wallId, { length: 50 }).doc;
    const win = windowsOnWall(doc, wallId)[0];
    doc = setWindowOffset(doc, win.id, 250); // [250..300]

    // shrink to 270: window no longer fits → clamped flush to the end
    const shrunk = moveJoint(doc, startJid, { x: 30, y: 0 });
    const s = shrunk.windows[win.id];
    expect(s.length).toBe(50);
    expect(s.offset).toBe(220); // 270 − 50

    // grow back: offset is NOT restored (kept in place means clamped, not tracked)
    const regrown = moveJoint(shrunk, startJid, { x: 0, y: 0 });
    expect(regrown.windows[win.id].offset).toBe(220);

    // a window that still fits does not move
    doc = setWindowOffset(regrown, win.id, 100);
    const moved = moveJoint(doc, startJid, { x: -10, y: 0 }); // len 310
    expect(moved.windows[win.id].offset).toBe(100);
  });

  test('violatedOpeningFloors flags walls shrunk below their opening span', () => {
    let doc = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 100, y: 0 }).doc;
    const wallId = Object.keys(doc.walls)[0];
    doc = addWindow(doc, wallId).doc; // span 100 → wall already at its floor

    expect(violatedOpeningFloors(doc)).toEqual([]); // exactly at floor is legal
    const bad = moveJoint(doc, doc.walls[wallId].startJointId, { x: 5, y: 0 });
    expect(violatedOpeningFloors(bad)).toEqual([wallId]);

    const ok = setWindowLength(bad, windowsOnWall(bad, wallId)[0].id, 90);
    expect(violatedOpeningFloors(ok)).toEqual([]);
  });

  test('deleteWall removes its windows; deleteWindow removes one', () => {
    let doc = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 300, y: 0 }).doc;
    const wallA = Object.keys(doc.walls)[0];
    doc = addWall(doc, { x: 300, y: 0 }, { x: 300, y: 200 }, { attachTolCm: 0.01 }).doc;
    const wallB = Object.keys(doc.walls)[1];
    doc = addWindow(doc, wallA).doc;
    doc = addWindow(doc, wallB).doc;

    const afterWin = deleteWindow(doc, windowsOnWall(doc, wallA)[0].id);
    expect(windowsOnWall(afterWin, wallA)).toHaveLength(0);
    expect(windowsOnWall(afterWin, wallB)).toHaveLength(1);

    const afterWall = deleteWall(afterWin, wallB);
    expect(Object.keys(afterWall.walls)).toHaveLength(1);
    expect(Object.keys(afterWall.windows)).toHaveLength(0);
  });

  test('wallWindowSpanCm sums window lengths', () => {
    let doc = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 400, y: 0 }).doc;
    const wallId = Object.keys(doc.walls)[0];
    expect(wallWindowSpanCm(doc, wallId)).toBe(0);
    doc = addWindow(doc, wallId).doc; // 100
    doc = addWindow(doc, wallId).doc; // 100
    expect(wallWindowSpanCm(doc, wallId)).toBe(200);
  });

  test('sanitizeDoc repairs out-of-range windows and culls orphans', () => {
    const base = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 100, y: 0 }).doc;
    const raw = {
      version: 1,
      joints: base.joints,
      walls: base.walls,
      roomObjects: {},
      windows: {
        keep: { wallId: Object.keys(base.walls)[0], offset: 95, length: 50 },
        orphan: { wallId: 'missing', offset: 0, length: 10 },
        junk: { wallId: 42 },
      },
    };
    const doc = sanitizeDoc(raw)!;
    expect(Object.keys(doc.windows)).toHaveLength(1);
    const kept = doc.windows.keep;
    expect(kept.length).toBe(50); // capped to wall length
    expect(kept.offset).toBe(50); // clamped flush to the end
  });

  test('windowGapBounds: lone window measures to the wall ends', () => {
    let doc = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 400, y: 0 }).doc;
    const wallId = Object.keys(doc.walls)[0];
    doc = addWindow(doc, wallId).doc; // [150..250]
    const win = windowsOnWall(doc, wallId)[0];
    expect(windowGapBounds(Object.values(doc.windows), 400, win.id)).toEqual({
      leftFrom: 0,
      winFrom: 150,
      winTo: 250,
      rightTo: 400,
    });
  });

  test('windowGapBounds: nearest neighbor edges tighten the gaps', () => {
    let doc = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 500, y: 0 }).doc;
    const wallId = Object.keys(doc.walls)[0];
    doc = addWindow(doc, wallId).doc; // [200..300]
    const mid = windowsOnWall(doc, wallId)[0];
    doc = setWindowOffset(doc, mid.id, 0); // mid → [0..100]
    doc = addWindow(doc, wallId).doc; // right → centered in [100..500] → [250..350]
    const right = windowsOnWall(doc, wallId)[1];
    expect(windowGapBounds(Object.values(doc.windows), 500, right.id)).toEqual({
      leftFrom: 100, // mid's end edge, not the wall start
      winFrom: 250,
      winTo: 350,
      rightTo: 500, // no neighbor on the right → wall end
    });
  });

  test('windowGapBounds: unknown window or zero-length wall → null', () => {
    const doc = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 100, y: 0 }).doc;
    expect(windowGapBounds([], 100, 'nope')).toBeNull();
    expect(windowGapBounds([], 0, 'nope')).toBeNull();
  });

  test('windowGapBounds: wall-end fallbacks use the inner (clear) span', () => {
    let doc = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 400, y: 0 }).doc;
    const wallId = Object.keys(doc.walls)[0];
    doc = addWindow(doc, wallId).doc; // [150..250]
    const win = windowsOnWall(doc, wallId)[0];
    // room corner extensions of 5 cm per end → clear span [5..395]
    const bounds = windowGapBounds(Object.values(doc.windows), 400, win.id, { from: 5, to: 395 });
    expect(bounds).toEqual({ leftFrom: 5, winFrom: 150, winTo: 250, rightTo: 395 });
    // neighbor edges still win over the inner span when they are nearer
    doc = addWindow(doc, wallId).doc; // [25..125] — centered in the left gap
    const left = windowsOnWall(doc, wallId)[0];
    expect(windowGapBounds(Object.values(doc.windows), 400, win.id, { from: 5, to: 395 })).toEqual({
      leftFrom: 125,
      winFrom: 150,
      winTo: 250,
      rightTo: 395,
    });
    expect(left.offset).toBe(25);
  });

  test('windowGapBounds: window in the corner region never yields negative gaps', () => {
    let doc = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 400, y: 0 }).doc;
    const wallId = Object.keys(doc.walls)[0];
    doc = addWindow(doc, wallId).doc;
    const win = windowsOnWall(doc, wallId)[0];
    doc = setWindowOffset(doc, win.id, 2); // inside the 5 cm corner extension
    const bounds = windowGapBounds(Object.values(doc.windows), 400, win.id, { from: 5, to: 395 });
    expect(bounds).toEqual({ leftFrom: 2, winFrom: 2, winTo: 102, rightTo: 395 }); // left gap clamps to 0
  });
});

describe('doors', () => {
  test('addDoor centers a default 80 cm door in the free span', () => {
    const { doc } = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 300, y: 0 });
    const wallId = Object.keys(doc.walls)[0];
    const res = addDoor(doc, wallId);
    expect(res.door).not.toBeNull();
    expect(res.door!.wallId).toBe(wallId);
    expect(res.door!.offset).toBe(110);
    expect(res.door!.mode).toBe('tl'); // default swing
    // original doc untouched (immutability)
    expect(Object.keys(doc.doors)).toHaveLength(0);
  });

  test('doors and windows share one wall axis when filling gaps', () => {
    let doc = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 500, y: 0 }).doc;
    const wallId = Object.keys(doc.walls)[0];
    doc = addWindow(doc, wallId).doc; // [200..300]
    doc = addDoor(doc, wallId).doc; // largest gaps tie [0..200]/[300..500] → earliest
    expect(doorsOnWall(doc, wallId)[0].offset).toBe(60); // centered in [0..200]

    // a window added afterwards must avoid the door too
    doc = addWindow(doc, wallId, { length: 50 }).doc;
    const wins = windowsOnWall(doc, wallId);
    // gaps now: [0..60], [140..200], [300..500] — the tail wins, centered
    expect(wins[1].offset).toBe(375);
  });

  test('addDoor rejects walls without room', () => {
    const { doc } = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 20, y: 0 });
    const wallId = Object.keys(doc.walls)[0];
    const res = addDoor(doc, wallId);
    expect(res.door).toBeNull();
    expect(res.doc).toBe(doc);
  });

  test('setDoorLength grows around the center and clamps to [30..wall]', () => {
    let doc = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 100, y: 0 }).doc;
    const wallId = Object.keys(doc.walls)[0];
    doc = addDoor(doc, wallId).doc;
    const door = doorsOnWall(doc, wallId)[0];

    const grown = setDoorLength(doc, door.id, 40);
    const g = grown.doors[door.id];
    expect(g.length).toBe(40);
    expect(g.offset).toBe(30); // center stays at 50

    const huge = setDoorLength(doc, door.id, 500);
    expect(huge.doors[door.id].length).toBe(100);
    expect(huge.doors[door.id].offset).toBe(0);

    const tiny = setDoorLength(doc, door.id, 1);
    expect(tiny.doors[door.id].length).toBe(30);
  });

  test('setDoorOffset slides within wall bounds', () => {
    let doc = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 200, y: 0 }).doc;
    const wallId = Object.keys(doc.walls)[0];
    doc = addDoor(doc, wallId).doc; // [60..140], len 80
    const door = doorsOnWall(doc, wallId)[0];

    expect(setDoorOffset(doc, door.id, 10).doors[door.id].offset).toBe(10);
    expect(setDoorOffset(doc, door.id, -5).doors[door.id].offset).toBe(0);
    expect(setDoorOffset(doc, door.id, 150).doors[door.id].offset).toBe(120); // 200 − 80
  });

  test('resizeDoor clamps both edges back into the wall', () => {
    let doc = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 100, y: 0 }).doc;
    const wallId = Object.keys(doc.walls)[0];
    doc = addDoor(doc, wallId).doc;
    const door = doorsOnWall(doc, wallId)[0];

    const r = resizeDoor(doc, door.id, -30, 40);
    expect(r.doors[door.id]).toEqual({ id: door.id, wallId, offset: 0, length: 40, mode: door.mode });

    const r2 = resizeDoor(doc, door.id, 90, 500);
    expect(r2.doors[door.id]).toEqual({ id: door.id, wallId, offset: 0, length: 100, mode: door.mode });
  });

  test('moveJoint clamps doors flush like windows (combined floor)', () => {
    let doc = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 300, y: 0 }).doc;
    const wallId = Object.keys(doc.walls)[0];
    const startJid = doc.walls[wallId].startJointId;
    doc = addDoor(doc, wallId, { length: 50 }).doc;
    const door = doorsOnWall(doc, wallId)[0];
    doc = setDoorOffset(doc, door.id, 250); // [250..300]

    const shrunk = moveJoint(doc, startJid, { x: 30, y: 0 }); // centerline 30..300 = 270
    expect(shrunk.doors[door.id].offset).toBe(220); // clamped flush: 270 − 50

    // combined floor counts windows AND doors: 50 + 60 on a shrinking wall
    doc = addWindow(shrunk, wallId, { length: 60 }).doc;
    const bad = moveJoint(doc, startJid, { x: 200, y: 0 }); // centerline 100 < 110
    expect(violatedOpeningFloors(bad)).toEqual([wallId]);
    expect(wallOpeningSpanCm(bad, wallId)).toBe(110);
    expect(wallDoorSpanCm(bad, wallId)).toBe(50);
  });

  test('deleteWall removes its doors; deleteDoor removes one', () => {
    let doc = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 400, y: 0 }).doc;
    const wallA = Object.keys(doc.walls)[0];
    doc = addWall(doc, { x: 400, y: 0 }, { x: 400, y: 200 }, { attachTolCm: 0.01 }).doc;
    const wallB = Object.keys(doc.walls)[1];
    doc = addDoor(doc, wallA).doc;
    doc = addDoor(doc, wallB).doc;

    const afterDoor = deleteDoor(doc, doorsOnWall(doc, wallA)[0].id);
    expect(doorsOnWall(afterDoor, wallA)).toHaveLength(0);
    expect(doorsOnWall(afterDoor, wallB)).toHaveLength(1);

    const afterWall = deleteWall(afterDoor, wallB);
    expect(Object.keys(afterWall.doors)).toHaveLength(0);
  });

  test('cycleDoorMode cycles tl→tr→br→bl→none→tl and back', () => {
    let doc = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 200, y: 0 }).doc;
    const wallId = Object.keys(doc.walls)[0];
    doc = addDoor(doc, wallId).doc; // starts 'tl'
    const id = doorsOnWall(doc, wallId)[0].id;

    const seq: DoorMode[] = ['tr', 'br', 'bl', 'none', 'tl'];
    let cur = doc;
    for (const expected of seq) {
      cur = cycleDoorMode(cur, id);
      expect(cur.doors[id].mode).toBe(expected);
    }
    const backSeq: DoorMode[] = ['none', 'bl', 'br', 'tr', 'tl'];
    let back = cur;
    for (const expected of backSeq) {
      back = cycleDoorMode(back, id, -1);
      expect(back.doors[id].mode).toBe(expected);
    }

    // explicit set + invalid mode + unknown id are safe
    expect(cycleDoorMode(doc, id, 'br').doors[id].mode).toBe('br');
    expect(cycleDoorMode(doc, id, 'diagonal' as never)).toBe(doc);
    expect(cycleDoorMode(doc, 'no-such-door')).toBe(doc);
  });

  test('sanitizeDoc repairs doors: clamps span, falls back to none mode, culls orphans', () => {
    const base = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 100, y: 0 }).doc;
    const raw = {
      version: 1,
      joints: base.joints,
      walls: base.walls,
      roomObjects: {},
      windows: {},
      doors: {
        keep: { wallId: Object.keys(base.walls)[0], offset: 95, length: 50, mode: 'weird' },
        orphan: { wallId: 'missing', offset: 0, length: 40, mode: 'tl' },
      },
    };
    const doc = sanitizeDoc(raw)!;
    expect(Object.keys(doc.doors)).toHaveLength(1);
    const kept = doc.doors.keep;
    expect(kept.length).toBe(50);
    expect(kept.offset).toBe(50);
    expect(kept.mode).toBe('none');
  });

  test('sanitizeDoc tolerates docs without a doors field', () => {
    const base = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 100, y: 0 }).doc;
    const raw = { version: 1, joints: base.joints, walls: base.walls, roomObjects: {}, windows: {} };
    const doc = sanitizeDoc(raw)!;
    expect(doc.doors).toEqual({});
  });
});
