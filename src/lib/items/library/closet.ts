import type { ItemDef } from '../types';

const def: ItemDef = {
  kind: 'closet',
  label: { en: 'Closet', ru: 'Шкаф' },
  category: 'living-room',
  defaults: { w: 120, d: 60, minW: 50, minD: 40 },
  /** top view: body + door-face line at the front, seam tick, handle dots */
  view: (w, d) => {
    const hw = w / 2;
    const hd = d / 2;
    const face = Math.min(5, w * 0.08, d * 0.08);
    const hx = Math.min(6, Math.min(w, d) * 0.12);
    const r = 2;
    if (w >= d) {
      const y = hd - face;
      return [
        { el: 'rect', x: -hw, y: -hd, width: w, height: d, rx: 2 },
        { part: 'detail', el: 'line', x1: -hw, y1: y, x2: hw, y2: y },
        { part: 'detail', el: 'line', x1: 0, y1: y, x2: 0, y2: y - face },
        { part: 'hinge', el: 'circle', cx: -hx, cy: y - face / 2, r },
        { part: 'hinge', el: 'circle', cx: hx, cy: y - face / 2, r },
      ];
    }
    const x = hw - face;
    return [
      { el: 'rect', x: -hw, y: -hd, width: w, height: d, rx: 2 },
      { part: 'detail', el: 'line', x1: x, y1: -hd, x2: x, y2: hd },
      { part: 'detail', el: 'line', x1: x, y1: 0, x2: x - face, y2: 0 },
      { part: 'hinge', el: 'circle', cx: x - face / 2, cy: -hx, r },
      { part: 'hinge', el: 'circle', cx: x - face / 2, cy: hx, r },
    ];
  },
};

export default def;
