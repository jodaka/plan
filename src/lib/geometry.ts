export interface Pt {
  x: number;
  y: number;
}

/** Grid size in cm */
export const GRID_SIZE = 1;

/**
 * Smallest on-screen spacing (px) at which the visual grid still draws a line;
 * the ladder's coarsest rung is used below it. 12 keeps the density stable
 * across the ratio-2 rungs (8 px produced a 4x line-count spike at ~6% zoom).
 */
export const GRID_MIN_PX = 12;

/** Grid cell sizes (cm) the visual grid may pick from, coarsest last. */
export const GRID_STEPS = [1, 5, 10, 50, 100, 500, 1000, 5000, 10000];

/**
 * Visual grid cell (cm) for a given viewport scale (px per cm): the first
 * ladder rung whose on-screen spacing reaches GRID_MIN_PX. Pure — the scene
 * derivation consumes it and tests pin the low-zoom behavior.
 */
export function gridStep(scale: number): number {
  return GRID_STEPS.find((s) => s * scale >= GRID_MIN_PX) ?? GRID_STEPS[GRID_STEPS.length - 1];
}

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
 * Returns the segment endpoints extended outward by extA/extB along the
 * segment direction (used to fill wall corners: extend by thickness / 2).
 */
export function extendPts(a: Pt, b: Pt, extA: number, extB: number): [Pt, Pt] {
  const u = unit(sub(b, a));
  return [
    { x: a.x - u.x * extA, y: a.y - u.y * extA },
    { x: b.x + u.x * extB, y: b.y + u.y * extB },
  ];
}

/** Intersection of lines p1+t·d1 and p2+s·d2; null when (near-)parallel. */
export function lineIntersect(p1: Pt, d1: Pt, p2: Pt, d2: Pt): Pt | null {
  const den = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(den) < 1e-9) {
    return null;
  }
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / den;
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
}

export interface WallEndNeighbor {
  /** unit vector from the shared joint into the neighbor wall */
  dir: Pt;
  /** neighbor wall thickness, cm */
  t: number;
}

/** Fallback threshold: miter distance beyond this many half-thicknesses bevels to a plain cut. */
const MITER_CAP = 3;

/**
 * Corner points (quad, in winding order) of a wall body. Ends with a
 * connected neighbor are MITERED against that neighbor's faces — both walls
 * of a joint compute the same miter line, so their polygons tile the corner
 * exactly with no gaps or spikes at any angle. Free ends get a perpendicular
 * cut. Very acute corners (miter longer than MITER_CAP × half-thickness)
 * fall back to a perpendicular cut.
 */
export function wallCorners(
  a: Pt,
  b: Pt,
  t: number,
  nA: WallEndNeighbor | null,
  nB: WallEndNeighbor | null,
): [Pt, Pt, Pt, Pt] {
  const u = unit(sub(b, a));
  const n = { x: -u.y, y: u.x };
  const h = t / 2;
  const dot = (p: Pt, q: Pt) => p.x * q.x + p.y * q.y;

  const endCorners = (p: Pt, wDir: Pt, nb: WallEndNeighbor | null): [Pt, Pt] => {
    if (!nb) {
      const plus = addPt(p, mul(n, h));
      const minus = addPt(p, mul(n, -h));
      return [plus, minus];
    }
    const v = nb.dir;
    const hn = nb.t / 2;
    const nw = { x: -wDir.y, y: wDir.x };
    const nv = { x: -v.y, y: v.x };
    const cap = MITER_CAP * Math.max(h, hn);
    const faceW = (side: number) => addPt(p, mul(nw, side * h));
    const faceN = (side: number) => addPt(p, mul(nv, side * hn));
    // the sector between wDir and v is bounded by W's face pointing toward v
    // and N's face pointing toward wDir; the reflex sector by the opposites
    const sw = dot(nw, v) >= 0 ? 1 : -1;
    const sv = dot(nv, wDir) >= 0 ? 1 : -1;
    const mSector = lineIntersect(faceW(sw), wDir, faceN(sv), v);
    const mReflex = lineIntersect(faceW(-sw), wDir, faceN(-sv), v);
    const c1 = mSector && dist(mSector, p) <= cap ? mSector : faceW(sw);
    const c2 = mReflex && dist(mReflex, p) <= cap ? mReflex : faceW(-sw);
    // order: corner on the global +n side first
    return dot(sub(c1, p), n) >= 0 ? [c1, c2] : [c2, c1];
  };

  const [aPlus, aMinus] = endCorners(a, u, nA);
  const [bPlus, bMinus] = endCorners(b, mul(u, -1), nB);
  return [aPlus, bPlus, bMinus, aMinus];
}

/** Absolute orientation of segment a->b, degrees in [0, 180). */
export function wallAngleDeg(a: Pt, b: Pt): number {
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return ((deg % 180) + 180) % 180;
}

/** Direction of vector v, degrees in [0, 360). */
export function vectorAngleDeg(v: Pt): number {
  return ((Math.atan2(v.y, v.x) * 180) / Math.PI + 360) % 360;
}

/** Smallest angle between two directions, degrees in [0, 180]. */
export function angleBetweenDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export const HORIZ_VERT_TOL_DEG = 1;

/** 'h'/'v' if segment a->b is within tolerance of horizontal/vertical, else null. */
export function axisAlign(a: Pt, b: Pt, tolDeg: number = HORIZ_VERT_TOL_DEG): 'h' | 'v' | null {
  const ang = wallAngleDeg(a, b);
  if (ang <= tolDeg || ang >= 180 - tolDeg) {
    return 'h';
  }
  if (Math.abs(ang - 90) <= tolDeg) {
    return 'v';
  }
  return null;
}

export function fmtCm(cm: number): string {
  const r = Math.round(cm * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** Formats an area given in cm² as m² (2-decimal precision, trailing zeros stripped). */
export function fmtM2(cm2: number): string {
  const m2 = Math.round((cm2 / 1e4) * 100) / 100;
  if (Number.isInteger(m2)) {
    return String(m2);
  }
  return m2.toFixed(2).replace(/0$/, '');
}

/**
 * Area-weighted centroid of a simple polygon (shoelace formula); falls back
 * to the vertex average for degenerate/zero-area input.
 */
export function polygonCentroid(pts: Pt[]): Pt {
  let sum = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const cross = p.x * q.y - q.x * p.y;
    sum += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(sum) < 1e-9 || pts.length === 0) {
    const n = pts.length || 1;
    return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n };
  }
  return { x: cx / (3 * sum), y: cy / (3 * sum) };
}

/** Rotates `p` around the origin by `deg` degrees (screen coords: positive = clockwise on screen). */
export function rotatePt(p: Pt, deg: number): Pt {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
}

/** Transforms local polys (center at origin) to world by rotate + translate. */
export function transformPolys(local: Pt[][], x: number, y: number, deg: number): Pt[][] {
  return local.map((poly) => poly.map((p) => addPt(rotatePt(p, deg), { x, y })));
}

/** Bounding box of many polys (flattened). */
export function polysBBox(polys: Pt[][]): { minX: number; minY: number; maxX: number; maxY: number } {
  return ptsBBox(polys.flat());
}

/** True if any poly of `a` intersects any poly of `b` (each poly convex). */
export function polysIntersect(a: Pt[][], b: Pt[][]): boolean {
  for (const pa of a) {
    for (const pb of b) {
      if (polygonsIntersect(pa, pb)) {
        return true;
      }
    }
  }
  return false;
}

/** True if every vertex of every poly in `polys` lies inside `container`. */
export function polysInside(polys: Pt[][], container: Pt[]): boolean {
  return polys.every((poly) => poly.every((p) => polygonContainsPoint(container, p)));
}

/** The 4 corners of a `w`×`d` rectangle centered at (x, y), rotated by `deg`. */
export function itemCorners(x: number, y: number, w: number, d: number, deg: number): [Pt, Pt, Pt, Pt] {
  const hw = w / 2;
  const hd = d / 2;
  return (
    [
      { x: -hw, y: -hd },
      { x: hw, y: -hd },
      { x: hw, y: hd },
      { x: -hw, y: hd },
    ] as const
  ).map((c) => addPt(rotatePt(c, deg), { x, y })) as [Pt, Pt, Pt, Pt];
}

/** Axis-aligned bounding box of the given points. */
export function ptsBBox(pts: Pt[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) {
      minX = p.x;
    }
    if (p.y < minY) {
      minY = p.y;
    }
    if (p.x > maxX) {
      maxX = p.x;
    }
    if (p.y > maxY) {
      maxY = p.y;
    }
  }
  return { minX, minY, maxX, maxY };
}

/** Even-odd ray-cast test. Points exactly on an edge count as inside (±1e-9 slack). */
export function polygonContainsPoint(poly: Pt[], p: Pt): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const onSegment =
      Math.abs((b.y - a.y) * (p.x - a.x) - (b.x - a.x) * (p.y - a.y)) < 1e-9 &&
      Math.min(a.x, b.x) - 1e-9 <= p.x &&
      p.x <= Math.max(a.x, b.x) + 1e-9 &&
      Math.min(a.y, b.y) - 1e-9 <= p.y &&
      p.y <= Math.max(a.y, b.y) + 1e-9;
    if (onSegment) {
      return true;
    }
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Separating-axis test for two CONVEX polygons. Touching edges count as
 * intersecting (gap ≤ 1e-9) — callers that want flush contact to pass shrink
 * one polygon by a hair.
 */ export function polygonsIntersect(a: Pt[], b: Pt[]): boolean {
  if (a.length < 3 || b.length < 3) {
    return false;
  }
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      // edge normal = projection axis
      const ax = -(p2.y - p1.y);
      const ay = p2.x - p1.x;
      const len = Math.hypot(ax, ay);
      if (len < 1e-12) {
        continue;
      }
      let aMin = Infinity;
      let aMax = -Infinity;
      let bMin = Infinity;
      let bMax = -Infinity;
      for (const p of a) {
        const v = p.x * ax + p.y * ay;
        if (v < aMin) {
          aMin = v;
        }
        if (v > aMax) {
          aMax = v;
        }
      }
      for (const p of b) {
        const v = p.x * ax + p.y * ay;
        if (v < bMin) {
          bMin = v;
        }
        if (v > bMax) {
          bMax = v;
        }
      }
      if (aMax - bMin < -1e-9 || bMax - aMin < -1e-9) {
        return false;
      }
    }
  }
  return true;
}

/** Shrinks a convex polygon toward its centroid by `margin` cm on every side. */
export function shrinkPolygon(poly: Pt[], margin: number): Pt[] {
  const c = polygonCentroid(poly);
  return poly.map((p) => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) {
      return { ...p };
    }
    const k = Math.max(0, (len - margin) / len);
    return { x: c.x + dx * k, y: c.y + dy * k };
  });
}

/** A fixed face/edge items can snap to: a line at `value` on `axis`, spanning from→to on the other axis. */
export interface SnapSegment {
  /** the axis the face is perpendicular to ('x' = vertical face at x = value) */
  axis: 'x' | 'y';
  /** face coordinate on that axis */
  value: number;
  /** extent of the face on the other axis */
  from: number;
  to: number;
}

/** An axis-aligned box another item can snap against (edges + center). */
export interface SnapBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface SnapResult {
  x: number;
  y: number;
}

/**
 * Snaps an item center (its rotated-item AABB is aabbW×aabbH around it) so
 * that one of its AABB edges — or its center — aligns with a wall face or a
 * sibling box's edge/center. Per axis, independently; a candidate only
 * counts when the item's extent along the target's span overlaps it (within
 * the threshold), so far-away faces don't attract. Walls win over siblings;
 * the closest candidate per axis wins. Grid snapping is the caller's job.
 */
export function snapItemCenter(
  x: number,
  y: number,
  aabbW: number,
  aabbH: number,
  walls: SnapSegment[],
  siblings: SnapBox[],
  threshold: number,
): SnapResult {
  const halfW = aabbW / 2;
  const halfH = aabbH / 2;
  let dx = 0;
  let dy = 0;
  let fx = Infinity;
  let fy = Infinity;
  const consider = (axis: 'x' | 'y', delta: number) => {
    const d = Math.abs(delta);
    if (d > threshold) {
      return;
    }
    if (axis === 'x') {
      if (d < fx) {
        fx = d;
        dx = delta;
      }
    } else if (d < fy) {
      fy = d;
      dy = delta;
    }
  };

  for (const s of walls) {
    const alongLo = s.axis === 'x' ? y - halfH : x - halfW;
    const alongHi = s.axis === 'x' ? y + halfH : x + halfW;
    if (alongHi < s.from - threshold || alongLo > s.to + threshold) {
      continue;
    }
    const neg = s.axis === 'x' ? x - halfW : y - halfH;
    const pos = s.axis === 'x' ? x + halfW : y + halfH;
    const center = s.axis === 'x' ? x : y;
    consider(s.axis, s.value - neg);
    consider(s.axis, s.value - pos);
    consider(s.axis, s.value - center);
  }

  for (const b of siblings) {
    if (y + halfH >= b.minY - threshold && y - halfH <= b.maxY + threshold) {
      consider('x', b.minX - (x - halfW));
      consider('x', b.maxX - (x + halfW));
      // flush adjacency: my left edge against their right, and vice versa
      consider('x', b.maxX - (x - halfW));
      consider('x', b.minX - (x + halfW));
      consider('x', (b.minX + b.maxX) / 2 - x);
    }
    if (x + halfW >= b.minX - threshold && x - halfW <= b.maxX + threshold) {
      consider('y', b.minY - (y - halfH));
      consider('y', b.maxY - (y + halfH));
      consider('y', b.maxY - (y - halfH));
      consider('y', b.minY - (y + halfH));
      consider('y', (b.minY + b.maxY) / 2 - y);
    }
  }

  return { x: x + dx, y: y + dy };
}
