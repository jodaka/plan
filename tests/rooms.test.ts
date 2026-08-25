import { describe, expect, test } from 'bun:test';
import { fmtM2, polygonCentroid } from '../src/lib/geometry';
import { addRoomObject, addWall, deleteWall, emptyDoc, moveJoint, removeRoomObject } from '../src/lib/model/ops';
import { findRooms, roomKey, roomObjectsIn, shoelaceArea } from '../src/lib/model/rooms';
import { sanitizeDoc } from '../src/lib/model/validate';

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

const ptSet = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x},${p.y}`).sort();

describe('findRooms', () => {
  test('closed box yields one room with centerline area', () => {
    const doc = boxDoc();
    const rooms = findRooms(doc.joints, doc.walls);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].areaCm2).toBeCloseTo(210 * 210);
    expect(rooms[0].innerAreaCm2).toBeCloseTo(200 * 200);
    expect(ptSet(rooms[0].pts)).toEqual(ptSet([
      { x: 0, y: 0 },
      { x: 210, y: 0 },
      { x: 210, y: 210 },
      { x: 0, y: 210 },
    ]));
  });

  test('inner area is the clear floor: 340×400 inner with t=10 walls reads 13.6 m²', () => {
    // centerline rectangle 350×410 → inner spans 340/400
    let doc = emptyDoc();
    const sides = [
      [
        { x: 0, y: 0 },
        { x: 350, y: 0 },
      ],
      [
        { x: 350, y: 0 },
        { x: 350, y: 410 },
      ],
      [
        { x: 350, y: 410 },
        { x: 0, y: 410 },
      ],
      [
        { x: 0, y: 410 },
        { x: 0, y: 0 },
      ],
    ];
    for (const [a, b] of sides) doc = addWall(doc, a, b, { attachTolCm: 0.01 }).doc;
    const room = findRooms(doc.joints, doc.walls)[0];
    expect(room.areaCm2).toBeCloseTo(350 * 410);
    expect(room.innerAreaCm2).toBeCloseTo(340 * 400);
    expect(fmtM2(room.innerAreaCm2)).toBe('13.6');
  });

  test('inner area handles per-wall thickness and L-shaped loops', () => {
    // L: one leg 300×100, other 100×300 (centerline), all t=10
    let doc = emptyDoc();
    const sides = [
      [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
      ],
      [
        { x: 300, y: 0 },
        { x: 300, y: 100 },
      ],
      [
        { x: 300, y: 100 },
        { x: 100, y: 100 },
      ],
      [
        { x: 100, y: 100 },
        { x: 100, y: 300 },
      ],
      [
        { x: 100, y: 300 },
        { x: 0, y: 300 },
      ],
      [
        { x: 0, y: 300 },
        { x: 0, y: 0 },
      ],
    ];
    for (const [a, b] of sides) doc = addWall(doc, a, b, { attachTolCm: 0.01 }).doc;
    const room = findRooms(doc.joints, doc.walls)[0];
    // clear floor: leg 290×90 + leg 90×290 − 90×90 shared corner square
    expect(room.innerAreaCm2).toBeCloseTo(44100);
  });

  test('collinear chained walls on one side keep the correct inner area', () => {
    // top side drawn as two collinear walls: parallel inner face lines bevel at the shared corner
    let doc = emptyDoc();
    const sides = [
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      [
        { x: 100, y: 0 },
        { x: 200, y: 0 },
      ],
      [
        { x: 200, y: 0 },
        { x: 200, y: 100 },
      ],
      [
        { x: 200, y: 100 },
        { x: 0, y: 100 },
      ],
      [
        { x: 0, y: 100 },
        { x: 0, y: 0 },
      ],
    ];
    for (const [a, b] of sides) doc = addWall(doc, a, b, { attachTolCm: 0.01 }).doc;
    const room = findRooms(doc.joints, doc.walls)[0];
    expect(room.pts).toHaveLength(5);
    expect(room.innerAreaCm2).toBeCloseTo(190 * 90);
  });

  test('open chains produce no rooms', () => {
    let doc = emptyDoc();
    doc = addWall(doc, { x: 0, y: 0 }, { x: 100, y: 0 }).doc;
    expect(findRooms(doc.joints, doc.walls)).toHaveLength(0);

    // L-shape: 3 walls of a square
    doc = addWall(doc, { x: 100, y: 0 }, { x: 100, y: 100 }, { attachTolCm: 0.01 }).doc;
    doc = addWall(doc, { x: 100, y: 100 }, { x: 0, y: 100 }, { attachTolCm: 0.01 }).doc;
    expect(findRooms(doc.joints, doc.walls)).toHaveLength(0);
  });

  test('two disjoint boxes yield two rooms', () => {
    let doc = boxDoc();
    for (const [a, b] of [
      [
        { x: 500, y: 500 },
        { x: 600, y: 500 },
      ],
      [
        { x: 600, y: 500 },
        { x: 600, y: 600 },
      ],
      [
        { x: 600, y: 600 },
        { x: 500, y: 600 },
      ],
      [
        { x: 500, y: 600 },
        { x: 500, y: 500 },
      ],
    ]) {
      doc = addWall(doc, a, b, { attachTolCm: 0.01 }).doc;
    }
    const rooms = findRooms(doc.joints, doc.walls);
    expect(rooms).toHaveLength(2);
    const areas = rooms.map((r) => r.areaCm2).sort((a, b) => a - b);
    expect(areas[0]).toBeCloseTo(100 * 100);
    expect(areas[1]).toBeCloseTo(210 * 210);
  });

  test('two boxes sharing one corner yield two rooms', () => {
    let doc = emptyDoc();
    const sides = [
      // box A: (0,0)-(100,100)
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      [
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      [
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      [
        { x: 0, y: 100 },
        { x: 0, y: 0 },
      ],
      // box B hanging off the shared corner (100,100)
      [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ],
      [
        { x: 200, y: 100 },
        { x: 200, y: 200 },
      ],
      [
        { x: 200, y: 200 },
        { x: 100, y: 200 },
      ],
      [
        { x: 100, y: 200 },
        { x: 100, y: 100 },
      ],
    ];
    for (const [a, b] of sides) doc = addWall(doc, a, b, { attachTolCm: 0.01 }).doc;
    const rooms = findRooms(doc.joints, doc.walls);
    expect(rooms).toHaveLength(2);
    expect(rooms.map((r) => Math.round(r.areaCm2)).sort((a, b) => a - b)).toEqual([10000, 10000]);
  });

  test('deleting any wall of the box dissolves the room', () => {
    const doc = boxDoc();
    const wallId = Object.keys(doc.walls)[1];
    const after = deleteWall(doc, wallId);
    expect(findRooms(after.joints, after.walls)).toHaveLength(0);
  });

  test('moving a joint changes the room area (derived state)', () => {
    const doc = boxDoc();
    const cornerId = Object.values(doc.joints).find((j) => j.x === 0 && j.y === 0)!.id;
    const moved = moveJoint(doc, cornerId, { x: -90, y: -10 });
    const rooms = findRooms(moved.joints, moved.walls);
    expect(rooms).toHaveLength(1);
    // general quad (−90,−10),(210,0),(210,210),(0,210) — shoelace area
    expect(rooms[0].areaCm2).toBeCloseTo(54600);
  });

  test('non-rectangular closed figure is detected (triangle)', () => {
    let doc = emptyDoc();
    for (const [a, b] of [
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      [
        { x: 100, y: 0 },
        { x: 50, y: 80 },
      ],
      [
        { x: 50, y: 80 },
        { x: 0, y: 0 },
      ],
    ]) {
      doc = addWall(doc, a, b, { attachTolCm: 0.01 }).doc;
    }
    const rooms = findRooms(doc.joints, doc.walls);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].areaCm2).toBeCloseTo((100 * 80) / 2);
  });
});

describe('room identity & bound objects', () => {
  test('room key derives from the wall set, stable under joint moves', () => {
    const doc = boxDoc();
    const room = findRooms(doc.joints, doc.walls)[0];
    expect(room.key).toBe(roomKey(Object.values(doc.walls).map((w) => w.id)));
    const cornerId = Object.values(doc.joints)[0].id;
    const moved = moveJoint(doc, cornerId, { x: -50, y: -50 });
    expect(findRooms(moved.joints, moved.walls)[0].key).toBe(room.key);
  });

  test('room objects: add, query, remove; deleteWall keeps them (orphans)', () => {
    const doc0 = boxDoc();
    const room = findRooms(doc0.joints, doc0.walls)[0];

    const { doc, object } = addRoomObject(doc0, room.key, 'furniture', { x: 10, y: 10 });
    expect(object).toBeTruthy();
    expect(object!.roomId).toBe(room.key);
    expect(Object.keys(roomObjectsIn(doc, room.key))).toHaveLength(1);
    expect(Object.keys(doc0.roomObjects)).toHaveLength(0); // input untouched

    const other = addRoomObject(doc, 'other-room', 'door', { x: 1, y: 2 }).doc;
    expect(Object.keys(roomObjectsIn(other, room.key))).toHaveLength(1);
    expect(Object.keys(other.roomObjects)).toHaveLength(2);

    const rejected = addRoomObject(doc, room.key, 'door', { x: Number.NaN, y: 2 });
    expect(rejected.object).toBeNull();
    expect(rejected.doc).toBe(doc);

    const afterDel = deleteWall(other, Object.keys(other.walls)[0]);
    expect(findRooms(afterDel.joints, afterDel.walls)).toHaveLength(0);
    expect(Object.keys(afterDel.roomObjects)).toHaveLength(2); // kept, orphaned

    const cleaned = removeRoomObject(afterDel, object!.id);
    expect(Object.keys(cleaned.roomObjects)).toHaveLength(1);
    expect(removeRoomObject(cleaned, 'nope')).toBe(cleaned);
  });

  test('sanitizeDoc normalizes missing roomObjects and culls malformed entries', () => {
    const doc = boxDoc();
    const old = { version: 1, joints: doc.joints, walls: doc.walls };
    expect(sanitizeDoc(old)?.roomObjects).toEqual({});

    const s = sanitizeDoc({
      version: 1,
      joints: {},
      walls: {},
      roomObjects: {
        a: { roomId: 'r', kind: 'door', x: 1, y: 2 },
        b: { roomId: '', kind: 'door', x: 1, y: 2 },
        c: { roomId: 'r', kind: '', x: 1, y: 2 },
        d: { roomId: 'r', kind: 'door', x: 'x', y: 2 },
        e: 'junk',
      },
    });
    expect(Object.keys(s?.roomObjects ?? {})).toEqual(['a']);
    expect(s?.roomObjects.a).toEqual({ id: 'a', roomId: 'r', kind: 'door', x: 1, y: 2 });
  });
});

describe('area/centroid helpers', () => {
  test('shoelaceArea sign and magnitude', () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(shoelaceArea(sq)).toBe(100);
    expect(shoelaceArea([...sq].reverse())).toBe(-100);
  });

  test('fmtM2 converts cm² to m² at mm-of-m precision', () => {
    expect(fmtM2(44100 * 4)).toBe('17.64');
    expect(fmtM2(1e4)).toBe('1');
    expect(fmtM2(12560)).toBe('1.26');
    expect(fmtM2(0)).toBe('0');
  });

  test('polygonCentroid centers a rectangle', () => {
    const c = polygonCentroid([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ]);
    expect(c.x).toBeCloseTo(50);
    expect(c.y).toBeCloseTo(25);
  });
});
