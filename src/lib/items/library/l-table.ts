import type { ItemDef } from '../types';

/** L = full-width top bar + full-depth left leg; the notch is bottom-right. */
const def: ItemDef = {
  kind: 'l-table',
  label: { en: 'L-shaped table', ru: 'Г-образный стол' },
  category: 'living-room',
  defaults: { w: 160, d: 120, minW: 80, minD: 60 },
  // true non-convex shape as the union of two convex rects (SAT-safe)
  collisionShapes: (w, d) => {
    const hw = w / 2;
    const hd = d / 2;
    const t = Math.min(w, d) * 0.4;
    return [
      [
        { x: -hw, y: -hd },
        { x: hw, y: -hd },
        { x: hw, y: -hd + t },
        { x: -hw, y: -hd + t },
      ],
      [
        { x: -hw, y: -hd },
        { x: -hw + t, y: -hd },
        { x: -hw + t, y: hd },
        { x: -hw, y: hd },
      ],
    ];
  },
  view: (w, d) => {
    const hw = w / 2;
    const hd = d / 2;
    const t = Math.min(w, d) * 0.4;
    const i = Math.min(10, w * 0.12, d * 0.12);
    return [
      {
        el: 'path',
        d: `M ${-hw} ${-hd} L ${hw} ${-hd} L ${hw} ${-hd + t} L ${-hw + t} ${-hd + t} L ${-hw + t} ${hd} L ${-hw} ${hd} Z`,
      },
      {
        part: 'detail',
        el: 'path',
        d: `M ${-hw + i} ${-hd + i} L ${hw - i} ${-hd + i} L ${hw - i} ${-hd + t - i} L ${-hw + t - i} ${-hd + t - i} L ${-hw + t - i} ${hd - i} L ${-hw + i} ${hd - i} Z`,
      },
    ];
  },
};

export default def;
