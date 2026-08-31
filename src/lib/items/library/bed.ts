import type { ItemDef } from '../types';

const def: ItemDef = {
  kind: 'bed',
  label: { en: 'Bed', ru: 'Кровать' },
  category: 'bedroom',
  defaults: { w: 90, d: 200, minW: 70, minD: 150 },
  view: (w, d) => {
    const hw = w / 2;
    const hd = d / 2;
    const pillowH = Math.min(24, d * 0.18);
    const inset = Math.min(10, w * 0.12, d * 0.12);
    const blanketY = -hd + inset / 2 + pillowH + inset;
    return [
      { el: 'rect', x: -hw, y: -hd, width: w, height: d },
      {
        part: 'detail',
        el: 'rect',
        x: -hw + inset,
        y: -hd + inset / 2,
        width: w - inset * 2,
        height: pillowH,
        rx: 3,
      },
      { part: 'detail', el: 'line', x1: -hw, y1: blanketY, x2: hw, y2: blanketY },
    ];
  },
};

export default def;
