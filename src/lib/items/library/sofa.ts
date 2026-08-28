import type { ItemDef } from '../types';

const def: ItemDef = {
  kind: 'sofa',
  label: 'Sofa',
  category: 'living-room',
  defaults: { w: 200, d: 90, minW: 100, minD: 60 },
  view: (w, d) => {
    const hw = w / 2;
    const hd = d / 2;
    const arm = Math.min(14, w * 0.15);
    return [
      { el: 'rect', x: -hw, y: -hd, width: w, height: d },
      { part: 'detail', el: 'rect', x: -hw, y: -hd, width: w, height: Math.min(16, d * 0.25) },
      { part: 'detail', el: 'rect', x: -hw, y: -hd, width: arm, height: d },
      { part: 'detail', el: 'rect', x: hw - arm, y: -hd, width: arm, height: d },
    ];
  },
};

export default def;
