import type { ItemDef } from '../types';

const def: ItemDef = {
  kind: 'table',
  label: { en: 'Table', ru: 'Стол' },
  category: 'living-room',
  defaults: { w: 120, d: 80, minW: 50, minD: 40 },
  // double-edge tabletop symbol: outline + inset contour
  view: (w, d) => {
    const hw = w / 2;
    const hd = d / 2;
    const i = Math.min(6, w * 0.1, d * 0.1);
    return [
      { el: 'rect', x: -hw, y: -hd, width: w, height: d, rx: 2 },
      {
        part: 'detail',
        el: 'rect',
        x: -hw + i,
        y: -hd + i,
        width: w - i * 2,
        height: d - i * 2,
        rx: 1,
      },
    ];
  },
};

export default def;
