import type { ItemDef } from '../types';

const def: ItemDef = {
  kind: 'bed',
  label: { en: 'Bed', ru: 'Кровать' },
  category: 'bedroom',
  defaults: { w: 90, d: 200, minW: 70, minD: 150 },
  view: (w, d) => {
    const hw = w / 2;
    const hd = d / 2;
    const pad = Math.min(10, w * 0.15);
    const gap = Math.min(8, d * 0.04);
    const pillowH = Math.min(22, d * 0.13);
    const blanketY = -hd + gap + pillowH + Math.min(12, d * 0.06);
    return [
      { el: 'rect', x: -hw, y: -hd, width: w, height: d, rx: 6 },
      {
        part: 'detail',
        el: 'rect',
        x: -hw + pad,
        y: -hd + gap,
        width: w - pad * 2,
        height: pillowH,
        rx: 4,
      },
      { part: 'detail', el: 'line', x1: -hw, y1: blanketY, x2: hw, y2: blanketY },
    ];
  },
};

export default def;
