import { describe, expect, test } from 'bun:test';
import { fmtM2, polygonCentroid } from '../src/lib/geometry';
import { addWall, deleteWall, emptyDoc, moveJoint } from '../src/lib/model/ops';
import { findRooms, shoelaceArea } from '../src/lib/model/rooms';

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
    expect(ptSet(rooms[0].pts)).toEqual(ptSet([
      { x: 0, y: 0 },
      { x: 210, y: 0 },
      { x: 210, y: 210 },
      { x: 0, y: 210 },
    ]));
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
