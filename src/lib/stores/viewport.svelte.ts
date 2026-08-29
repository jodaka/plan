import type { Pt } from '../geometry';

/** Pixels per cm at 100% zoom (~physical size on a standard display). */
export const BASE_PX_PER_CM = 15;
const MIN_SCALE = BASE_PX_PER_CM * 0.05;
const MAX_SCALE = BASE_PX_PER_CM * 20;

let scale = $state(BASE_PX_PER_CM);
let tx = $state(0);
let ty = $state(0);
let viewW = $state(0);
let viewH = $state(0);

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

export const viewport = {
  get scale(): number {
    return scale;
  },
  get tx(): number {
    return tx;
  },
  get ty(): number {
    return ty;
  },
  get zoomPct(): number {
    return (scale / BASE_PX_PER_CM) * 100;
  },
  get viewW(): number {
    return viewW;
  },
  get viewH(): number {
    return viewH;
  },

  setViewSize(w: number, h: number): void {
    viewW = w;
    viewH = h;
  },

  toWorld(px: number, py: number): Pt {
    return { x: (px - tx) / scale, y: (py - ty) / scale };
  },

  toScreen(wx: number, wy: number): Pt {
    return { x: wx * scale + tx, y: wy * scale + ty };
  },

  /** Zooms keeping the world point under screen (px, py) fixed. */
  zoomAt(px: number, py: number, factor: number): void {
    const next = clampScale(scale * factor);
    if (next === scale) {
      return;
    }
    const k = next / scale;
    tx = px - (px - tx) * k;
    ty = py - (py - ty) * k;
    scale = next;
  },

  zoomCenter(factor: number): void {
    this.zoomAt(viewW / 2, viewH / 2, factor);
  },

  panBy(dx: number, dy: number): void {
    tx += dx;
    ty += dy;
  },

  centerOn(p: Pt): void {
    tx = viewW / 2 - p.x * scale;
    ty = viewH / 2 - p.y * scale;
  },

  fit(bbox: BBox | null): void {
    if (!bbox || viewW === 0 || viewH === 0) {
      scale = BASE_PX_PER_CM;
      this.centerOn({ x: 0, y: 0 });
      return;
    }
    const padPx = 60;
    const w = Math.max(bbox.maxX - bbox.minX, 1);
    const h = Math.max(bbox.maxY - bbox.minY, 1);
    const s = Math.min((viewW - padPx * 2) / w, (viewH - padPx * 2) / h);
    scale = clampScale(s);
    this.centerOn({ x: (bbox.minX + bbox.maxX) / 2, y: (bbox.minY + bbox.maxY) / 2 });
  },
};
