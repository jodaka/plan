import type { ItemDef } from '../types';

const def: ItemDef = {
  kind: 'chair',
  label: { en: 'Chair', ru: 'Стул' },
  category: 'living-room',
  defaults: { w: 45, d: 50, minW: 30, minD: 30 },
  view: (w, d) => {
    const hd = d / 2;
    const back = Math.min(9, d * 0.2);
    return [
      { el: 'rect', x: -w / 2, y: -hd, width: w, height: d, rx: 5 },
      { part: 'detail', el: 'line', x1: -w / 2, y1: -hd + back, x2: w / 2, y2: -hd + back },
    ];
  },
};

export default def;
