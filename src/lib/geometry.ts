export interface Pt {
	x: number;
	y: number;
}

/** Grid size in cm */
export const GRID_SIZE = 1;

export function snap(value: number, grid: number = GRID_SIZE): number {
	const snapped = Math.round(value / grid) * grid;
	return snapped === 0 ? 0 : snapped; // avoid -0 leaking into coordinates
}

export function snapPt(p: Pt, grid: number = GRID_SIZE): Pt {
	return { x: snap(p.x, grid), y: snap(p.y, grid) };
}

export function dist(a: Pt, b: Pt): number {
	return Math.hypot(b.x - a.x, b.y - a.y);
}

export function sub(a: Pt, b: Pt): Pt {
	return { x: a.x - b.x, y: a.y - b.y };
}

export function addPt(a: Pt, b: Pt): Pt {
	return { x: a.x + b.x, y: a.y + b.y };
}

export function mul(a: Pt, k: number): Pt {
	return { x: a.x * k, y: a.y * k };
}

export function unit(v: Pt): Pt {
	const l = Math.hypot(v.x, v.y) || 1;
	return { x: v.x / l, y: v.y / l };
}

/**
 * Returns the segment endpoints extended outward by extA/extV along the
 * segment direction (used to fill wall corners: extend by thickness / 2).
 */
export function extendPts(a: Pt, b: Pt, extA: number, extB: number): [Pt, Pt] {
	const u = unit(sub(b, a));
	return [
		{ x: a.x - u.x * extA, y: a.y - u.y * extA },
		{ x: b.x + u.x * extB, y: b.y + u.y * extB }
	];
}

/** Absolute orientation of segment a->b, degrees in [0, 180). */
export function wallAngleDeg(a: Pt, b: Pt): number {
	const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
	return ((deg % 180) + 180) % 180;
}

/** Direction of vector v, degrees in [0, 360). */
export function vectorAngleDeg(v: Pt): number {
	return (((Math.atan2(v.y, v.x) * 180) / Math.PI) + 360) % 360;
}

/** Smallest angle between two directions, degrees in [0, 180]. */
export function angleBetweenDeg(a: number, b: number): number {
	const d = Math.abs(a - b) % 360;
	return d > 180 ? 360 - d : d;
}

export const HORIZ_VERT_TOL_DEG = 1;

/** 'h'/'v' if segment a->b is within tolerance of horizontal/vertical, else null. */
export function axisAlign(
	a: Pt,
	b: Pt,
	tolDeg: number = HORIZ_VERT_TOL_DEG
): 'h' | 'v' | null {
	const ang = wallAngleDeg(a, b);
	if (ang <= tolDeg || ang >= 180 - tolDeg) return 'h';
	if (Math.abs(ang - 90) <= tolDeg) return 'v';
	return null;
}

export function fmtCm(cm: number): string {
	const r = Math.round(cm * 10) / 10;
	return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
