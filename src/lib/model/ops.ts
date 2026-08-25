import { dist, sub, unit, type Pt } from '../geometry';
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

export function clampThickness(t: number): number {
	if (!Number.isFinite(t)) return DEFAULT_THICKNESS;
	return Math.min(MAX_THICKNESS, Math.max(MIN_THICKNESS, t));
}

/** Extension of `wallId`'s end at joint `jid`: half of the thickest neighbor wall. */
export function jointExtCm(doc: PlanDoc, wallId: WallId, jid: JointId): number {
	let m = 0;
	for (const o of Object.values(doc.walls)) {
		if (o.id !== wallId && (o.startJointId === jid || o.endJointId === jid)) {
			m = Math.max(m, o.thickness);
		}
	}
	return m / 2;
}

/**
 * Unit vector at joint `jid` pointing away from the other walls attached
 * there, along their axes (excluding `wallId`). Moving a joint along this
 * vector keeps every attached wall's direction — and thus the angles between
 * walls — unchanged. With multiple neighbors it is their bisector; with none,
 * null.
 */
function outwardAxisAt(doc: PlanDoc, wallId: WallId, jid: JointId): Pt | null {
	const j = doc.joints[jid];
	if (!j) return null;
	let x = 0;
	let y = 0;
	let count = 0;
	for (const o of Object.values(doc.walls)) {
		if (o.id === wallId) continue;
		if (o.startJointId !== jid && o.endJointId !== jid) continue;
		const oid = o.startJointId === jid ? o.endJointId : o.startJointId;
		const oj = doc.joints[oid];
		if (!oj) continue;
		const v = unit(sub(j, oj));
		x += v.x;
		y += v.y;
		count++;
	}
	if (count === 0) return null;
	const l = Math.hypot(x, y);
	if (l < 1e-9) return null;
	return { x: x / l, y: y / l };
}

/**
 * Sets wall thickness. Growing a wall eats into the adjacent room, which
 * would shorten the connected walls' inner spans — so each joint shifts by
 * Δt/2 along the axis of the other wall(s) attached to it. That preserves
 * their directions (the angles between walls) and their inner lengths
 * exactly; the thickened wall itself absorbs the remaining deformation.
 * Isolated joints don't move.
 */
export function setThickness(doc: PlanDoc, wallId: WallId, thickness: number): PlanDoc {
	const w = doc.walls[wallId];
	if (!w) return doc;
	const t = clampThickness(thickness);
	if (w.thickness === t) return doc;

	let next = doc;
	const delta = (t - w.thickness) / 2;
	if (delta !== 0) {
		for (const jid of [w.startJointId, w.endJointId]) {
			const axis = outwardAxisAt(doc, wallId, jid);
			const j = next.joints[jid];
			if (axis && j) {
				next = moveJoint(next, jid, { x: j.x + axis.x * delta, y: j.y + axis.y * delta });
			}
		}
	}

	const walls = { ...next.walls, [wallId]: { ...next.walls[wallId], thickness: t } };
	return copyDoc(next, next.joints, walls);
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

/**
 * Sets the wall's INNER (clear) length — the value the inspector exposes.
 * The centerline target is inner + joint extensions (neighbor t/2 per end),
 * so the typed value matches what the wall measures between its neighbors.
 */
export function setInnerLength(doc: PlanDoc, wallId: WallId, innerCm: number): PlanDoc {
	const w = doc.walls[wallId];
	if (!w) return doc;
	const extS = jointExtCm(doc, wallId, w.startJointId);
	const extE = jointExtCm(doc, wallId, w.endJointId);
	return setLength(doc, wallId, innerCm + extS + extE);
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
