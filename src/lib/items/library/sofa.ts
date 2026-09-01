import type { ItemDef, ItemShape } from '../types';

const def: ItemDef = {
  kind: 'sofa',
  label: { en: 'Sofa', ru: 'Диван' },
  category: 'living-room',
  defaults: { w: 200, d: 90, minW: 100, minD: 60 },
  view: (w, d) => {
    const hw = w / 2;
    const hd = d / 2;
    const arm = Math.min(18, w * 0.12, d * 0.32);
    const back = Math.min(16, d * 0.28);
    const seat = w - arm * 2;
    // seat cushion seams: third dividers when wide enough for three seats
    const seams: ItemShape[] = [];
    if (seat >= 140) {
      seams.push(
        {
          part: 'detail',
          el: 'line',
          x1: -hw + arm + seat / 3,
          y1: -hd + back,
          x2: -hw + arm + seat / 3,
          y2: hd,
        },
        {
          part: 'detail',
          el: 'line',
          x1: -hw + arm + (seat * 2) / 3,
          y1: -hd + back,
          x2: -hw + arm + (seat * 2) / 3,
          y2: hd,
        },
      );
    } else if (seat >= 70) {
      seams.push({ part: 'detail', el: 'line', x1: 0, y1: -hd + back, x2: 0, y2: hd });
    }
    return [
      { el: 'rect', x: -hw, y: -hd, width: w, height: d, rx: 6 },
      // back + arms as one open inner contour
      {
        part: 'detail',
        el: 'path',
        d: `M ${-hw + arm} ${hd} L ${-hw + arm} ${-hd + back} L ${hw - arm} ${-hd + back} L ${hw - arm} ${hd}`,
      },
      ...seams,
    ];
  },
};

export default def;
