import type { Pt } from '../../geometry';
import type { ItemDef } from '../types';

/** Regular n-gon whose apothem equals the base radius, so the collision poly
 * fully covers the drawn circle (svgExport derives its viewport from these). */
function ngon(r: number, n = 16): Pt[] {
  const R = r / Math.cos(Math.PI / n);
  const pts: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n;
    pts.push({ x: R * Math.cos(a), y: R * Math.sin(a) });
  }
  return pts;
}

const def: ItemDef = {
  kind: 'floor-lamp',
  label: { en: 'Floor lamp', ru: 'Торшер' },
  category: 'living-room',
  defaults: { w: 30, d: 30, minW: 20, minD: 20 },
  // round item: w === d is enforced by resizeMode; rotation is invisible
  resizeMode: 'fixed-aspect',
  collisionShapes: (w) => [ngon(w / 2)],
  view: (w, d, scale) => {
    const r = Math.min(w, d) / 2;
    return [
      { el: 'circle', cx: 0, cy: 0, r },
      { part: 'detail', el: 'circle', cx: 0, cy: 0, r: r * 0.55 },
      { part: 'hinge', el: 'circle', cx: 0, cy: 0, r: 1.5 / scale },
    ];
  },
};

export default def;
