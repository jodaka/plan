import type { ItemDef } from '../types';

const def: ItemDef = {
  kind: 'double-bed',
  label: { en: 'Double bed', ru: 'Двуспальная кровать' },
  category: 'bedroom',
  defaults: { w: 160, d: 200, minW: 120, minD: 180 },
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
        width: w / 2 - inset * 1.5,
        height: pillowH,
        rx: 3,
      },
      {
        part: 'detail',
        el: 'rect',
        x: inset / 2,
        y: -hd + inset / 2,
        width: w / 2 - inset * 1.5,
        height: pillowH,
        rx: 3,
      },
      { part: 'detail', el: 'line', x1: -hw, y1: blanketY, x2: hw, y2: blanketY },
    ];
  },
};

export default def;
