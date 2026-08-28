import type { ItemDef } from '../types';

const def: ItemDef = {
  kind: 'closet',
  label: 'Closet',
  category: 'living-room',
  defaults: { w: 120, d: 60, minW: 50, minD: 40 },
  view: (w, d, scale) => {
    const hw = w / 2;
    const hd = d / 2;
    const hinge = 1.5 / scale;
    return [
      { el: 'rect', x: -hw, y: -hd, width: w, height: d },
      ...(w >= d
        ? ([
            { part: 'detail', el: 'line', x1: 0, y1: -hd, x2: 0, y2: hd },
            { part: 'hinge', el: 'circle', cx: -3 / scale, cy: 0, r: hinge },
            { part: 'hinge', el: 'circle', cx: 3 / scale, cy: 0, r: hinge },
          ] as const)
        : ([
            { part: 'detail', el: 'line', x1: -hw, y1: 0, x2: hw, y2: 0 },
            { part: 'hinge', el: 'circle', cx: 0, cy: -3 / scale, r: hinge },
            { part: 'hinge', el: 'circle', cx: 0, cy: 3 / scale, r: hinge },
          ] as const)),
    ];
  },
};

export default def;
