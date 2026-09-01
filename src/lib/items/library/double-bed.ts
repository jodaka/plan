import type { ItemDef } from '../types';

const def: ItemDef = {
  kind: 'double-bed',
  label: { en: 'Double bed', ru: 'Двуспальная кровать' },
  category: 'bedroom',
  defaults: { w: 160, d: 200, minW: 120, minD: 180 },
  view: (w, d) => {
    const hw = w / 2;
    const hd = d / 2;
    const pad = Math.min(10, w * 0.08);
    const gapX = Math.min(8, w * 0.05);
    const gap = Math.min(8, d * 0.04);
    const pillowH = Math.min(22, d * 0.13);
    const pw = (w - pad * 2 - gapX) / 2;
    const blanketY = -hd + gap + pillowH + Math.min(12, d * 0.06);
    return [
      { el: 'rect', x: -hw, y: -hd, width: w, height: d, rx: 6 },
      { part: 'detail', el: 'rect', x: -hw + pad, y: -hd + gap, width: pw, height: pillowH, rx: 4 },
      {
        part: 'detail',
        el: 'rect',
        x: hw - pad - pw,
        y: -hd + gap,
        width: pw,
        height: pillowH,
        rx: 4,
      },
      { part: 'detail', el: 'line', x1: -hw, y1: blanketY, x2: hw, y2: blanketY },
    ];
  },
};

export default def;
