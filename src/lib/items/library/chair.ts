import type { ItemDef } from '../types';

const def: ItemDef = {
  kind: 'chair',
  label: { en: 'Chair', ru: 'Стул' },
  category: 'living-room',
  defaults: { w: 45, d: 50, minW: 30, minD: 30 },
  view: (w, d) => {
    const hd = d / 2;
    return [
      { el: 'rect', x: -w / 2, y: -hd, width: w, height: d },
      { part: 'detail', el: 'rect', x: -w / 2, y: -hd, width: w, height: Math.min(8, d * 0.2) },
    ];
  },
};

export default def;
