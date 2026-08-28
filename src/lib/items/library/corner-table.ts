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
    const inset = Math.min(10, w * 0.12, d * 0.12);
    return [
      {
        el: 'path',
        d: `M ${-hw} ${-hd} L ${hw - cr} ${-hd} Q ${hw} ${-hd} ${hw} ${-hd + cr} L ${hw} ${hd} L ${-hw} ${hd} Z`,
      },
      {
        part: 'detail',
        el: 'path',
        d: `M ${-hw + inset} ${-hd + inset} L ${hw - cr * 0.6} ${-hd + inset} Q ${hw - inset} ${-hd + inset} ${hw - inset} ${-hd + cr * 0.6} L ${hw - inset} ${hd - inset} L ${-hw + inset} ${hd - inset} Z`,
      },
    ];
  },
};

export default def;
