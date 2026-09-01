import type { ItemDef } from '../types';

const def: ItemDef = {
  kind: 'corner-table',
  label: { en: 'Corner table', ru: 'Угловой стол' },
  category: 'living-room',
  defaults: { w: 60, d: 60, minW: 30, minD: 30 },
  // true shape is a rect with one rounded corner; collision keeps bbox for now.
  // Future: return pentagon + quarter-circle approximation via `collisionShapes`.
  view: (w, d) => {
    const hw = w / 2;
    const hd = d / 2;
    const cr = Math.min(hw, hd);
    const i = Math.min(6, w * 0.1, d * 0.1);
    const cir = Math.max(cr - i, 0.1);
    return [
      {
        el: 'path',
        d: `M ${-hw} ${-hd} L ${hw - cr} ${-hd} Q ${hw} ${-hd} ${hw} ${-hd + cr} L ${hw} ${hd} L ${-hw} ${hd} Z`,
      },
      {
        part: 'detail',
        el: 'path',
        d: `M ${-hw + i} ${-hd + i} L ${hw - cr} ${-hd + i} Q ${hw - i} ${-hd + i} ${hw - i} ${-hd + cir} L ${hw - i} ${hd - i} L ${-hw + i} ${hd - i} Z`,
      },
    ];
  },
};

export default def;
