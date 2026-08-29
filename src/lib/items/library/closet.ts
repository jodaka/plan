import type { ItemDef } from '../types';

const def: ItemDef = {
  kind: 'closet',
  label: { en: 'Closet', ru: 'Шкаф' },
  category: 'living-room',
  defaults: { w: 120, d: 60, minW: 50, minD: 40 },
  /** top view: body + a pair of door leaves along one side, handles at the seam */
  view: (w, d, scale) => {
    const hw = w / 2;
    const hd = d / 2;
    const leaf = Math.min(3, w * 0.1, d * 0.1);
    const r = 1.5 / scale;
    if (w >= d) {
      const hx = Math.min(4, w * 0.15);
      return [
        { el: 'rect', x: -hw, y: -hd, width: w, height: d },
        { part: 'detail', el: 'rect', x: -hw, y: hd - leaf, width: w / 2, height: leaf },
        { part: 'detail', el: 'rect', x: 0, y: hd - leaf, width: w / 2, height: leaf },
        { part: 'hinge', el: 'circle', cx: -hx, cy: hd - leaf / 2, r },
        { part: 'hinge', el: 'circle', cx: hx, cy: hd - leaf / 2, r },
      ];
    }
    const hy = Math.min(4, d * 0.15);
    return [
      { el: 'rect', x: -hw, y: -hd, width: w, height: d },
      { part: 'detail', el: 'rect', x: hw - leaf, y: -hd, width: leaf, height: d / 2 },
      { part: 'detail', el: 'rect', x: hw - leaf, y: 0, width: leaf, height: d / 2 },
      { part: 'hinge', el: 'circle', cx: hw - leaf / 2, cy: -hy, r },
      { part: 'hinge', el: 'circle', cx: hw - leaf / 2, cy: hy, r },
    ];
  },
};

export default def;
