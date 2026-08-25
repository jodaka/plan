import { dist, type Pt } from '../geometry';
import {
	DEFAULT_THICKNESS,
	MAX_THICKNESS,
	MIN_THICKNESS,
	type Joint,
	type JointId,
	type PlanDoc,
	type Wall,
	type WallId
} from '../types';

export const MIN_WALL_LENGTH = 1; // cm

export function emptyDoc(): PlanDoc {
	return { version: 1, joints: {}, walls: {} };
}

function newId(): string {
	return crypto.randomUUID();
}

function copyDoc(doc: PlanDoc, joints: PlanDoc['joints'], walls: PlanDoc['walls']): PlanDoc {
	return { version: 1, joints, walls };
}

export function findJointNear(doc: PlanDoc, p: Pt, tolCm: number): Joint | null {
	let best: Joint | null = null;
	let bestD = tolCm;
	for (const j of Object.values(doc.joints)) {
		const d = dist(j, p);
		if (d <= bestD) {
			bestD = d;
			best = j;
		}
	}
	return best;
}

export function wallsAtJoint(doc: PlanDoc, jointId: JointId): Wall[] {
	return Object.values(doc.walls).filter(
		(w) => w.startJointId === jointId || w.endJointId === jointId
	);
}

export interface AddWallResult {
	doc: PlanDoc;
	wallId: WallId | null;
}

/**
 * Adds a wall between two points. Endpoints attach to existing joints within
 * `attachTolCm`, otherwise new joints are created. Coordinates are expected
 * pre-snapped by the caller.
 */
export function addWall(
	doc: PlanDoc,
	a: Pt,
	b: Pt,
	opts?: { thickness?: number; attachTolCm?: number }
): AddWallResult {
	if (dist(a, b) < MIN_WALL_LENGTH) return { doc, wallId: null };

	const thickness = clampThickness(opts?.thickness ?? DEFAULT_THICKNESS);
	const tol = opts?.attachTolCm ?? 0;

	const joints = { ...doc.joints };
	const resolve = (p: Pt): Joint => {
		const existing = tol > 0 ? findJointNear(doc, p, tol) : null;
		if (existing) return existing;
		const j: Joint = { id: newId(), x: p.x, y: p.y };
		joints[j.id] = j;
		return j;
	};
	const start = resolve(a);
	const end = resolve(b);
	if (start.id === end.id) return { doc, wallId: null };

	const wall: Wall = {
		id: newId(),
		startJointId: start.id,
		endJointId: end.id,
		thickness
	};
	const walls = { ...doc.walls, [wall.id]: wall };
	return { doc: copyDoc(doc, joints, walls), wallId: wall.id };
}

export function moveJoint(doc: PlanDoc, jointId: JointId, p: Pt): PlanDoc {
	const j = doc.joints[jointId];
	if (!j || (j.x === p.x && j.y === p.y)) return doc;
	const joints = { ...doc.joints, [jointId]: { ...j, x: p.x, y: p.y } };
	return copyDoc(doc, joints, doc.walls);
}

/**
 * Moves both joints of a wall by (dx, dy). Joints shared with other walls
 * move too, stretching the attached walls.
 */
export function translateWall(doc: PlanDoc, wallId: WallId, dx: number, dy: number): PlanDoc {
	const w = doc.walls[wallId];
	if (!w || (dx === 0 && dy === 0)) return doc;
	const joints = { ...doc.joints };
	for (const id of [w.startJointId, w.endJointId]) {
		const j = joints[id];
		if (!j) continue;
		joints[id] = { ...j, x: j.x + dx, y: j.y + dy };
	}
	return copyDoc(doc, joints, doc.walls);
}

export function clampThickness(t: number): number {
	if (!Number.isFinite(t)) return DEFAULT_THICKNESS;
	return Math.min(MAX_THICKNESS, Math.max(MIN_THICKNESS, t));
}

export function setThickness(doc: PlanDoc, wallId: WallId, thickness: number): PlanDoc {
	const w = doc.walls[wallId];
	if (!w) return doc;
	const t = clampThickness(thickness);
	if (w.thickness === t) return doc;
	const walls = { ...doc.walls, [wallId]: { ...w, thickness: t } };
	return copyDoc(doc, doc.joints, walls);
}

/** Sets wall length by moving its end joint along the current direction. */
export function setLength(doc: PlanDoc, wallId: WallId, lengthCm: number): PlanDoc {
	const w = doc.walls[wallId];
	if (!w) return doc;
	const a = doc.joints[w.startJointId];
	const b = doc.joints[w.endJointId];
	if (!a || !b) return doc;
	const l = Math.max(MIN_WALL_LENGTH, lengthCm);
	const vx = b.x - a.x;
	const vy = b.y - a.y;
	const cur = Math.hypot(vx, vy);
	if (cur === 0) return doc;
	const k = l / cur;
	return moveJoint(doc, w.endJointId, { x: a.x + vx * k, y: a.y + vy * k });
}

/** Deletes a wall and prunes joints left orphaned by the deletion. */
export function deleteWall(doc: PlanDoc, wallId: WallId): PlanDoc {
	const w = doc.walls[wallId];
	if (!w) return doc;
	const walls = { ...doc.walls };
	delete walls[wallId];
	const used = new Set<JointId>();
	for (const other of Object.values(walls)) {
		used.add(other.startJointId);
		used.add(other.endJointId);
	}
	const joints = { ...doc.joints };
	for (const id of [w.startJointId, w.endJointId]) {
		if (!used.has(id)) delete joints[id];
	}
	return copyDoc(doc, joints, walls);
}

export interface BBox {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

export function docBBox(doc: PlanDoc): BBox | null {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const j of Object.values(doc.joints)) {
		if (j.x < minX) minX = j.x;
		if (j.y < minY) minY = j.y;
		if (j.x > maxX) maxX = j.x;
		if (j.y > maxY) maxY = j.y;
	}
	return minX === Infinity ? null : { minX, minY, maxX, maxY };
}
