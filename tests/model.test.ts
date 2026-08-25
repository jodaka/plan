import { describe, expect, test } from 'bun:test';
import { angleBetweenDeg, axisAlign, dist, snap, snapPt, wallAngleDeg } from '../src/lib/geometry';
import {
	addWall,
	deleteWall,
	docBBox,
	findJointNear,
	moveJoint,
	setLength,
	setThickness,
	translateWall
} from '../src/lib/model/ops';
import { emptyDoc } from '../src/lib/model/ops';

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

	test('translateWall stretches attached neighbor wall', () => {
		const a = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 100, y: 0 }).doc;
		const withB = addWall(a, { x: 100, y: 0 }, { x: 150, y: 0 }, { attachTolCm: 0.01 }).doc;

		const wallAId = Object.keys(withB.walls)[0];
		const moved = translateWall(withB, wallAId, 10, 20);

		// joint shared with B moved too → B stretched to (110,20)-(150,0)
		const bEnds = Object.values(moved.walls)[1];
		const pts = Object.values(moved.joints).filter(
			(j) => j.id === bEnds.startJointId || j.id === bEnds.endJointId
		);
		expect(pts.map((p) => `${p.x},${p.y}`).sort()).toEqual(['110,20', '150,0']);
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
