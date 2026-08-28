import type { ItemDef } from '../types';

const def: ItemDef = {
  kind: 'chair',
  label: 'Chair',
  category: 'living-room',
  defaults: { w: 45, d: 50, minW: 30, minD: 30 },
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
