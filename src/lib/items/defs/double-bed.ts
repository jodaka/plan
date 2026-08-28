import type { ItemDef } from '../types';

const def: ItemDef = {
  kind: 'double-bed',
  label: 'Double bed',
  category: 'bedroom',
  defaults: { w: 160, d: 200, minW: 120, minD: 180 },
  collisionShapes: (w, d) => {
    const hw = w / 2;
    const hd = d / 2;
    return [
      [
        { x: -hw, y: -hd },
        { x: hw, y: -hd },
        { x: hw, y: hd },
        { x: -hw, y: hd },
      ],
    ];
  },
  resizeMode: 'bbox',
};

export default def;
