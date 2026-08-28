import type { ItemDef } from '../types';

const def: ItemDef = {
  kind: 'table',
  label: 'Table',
  category: 'living-room',
  defaults: { w: 120, d: 80, minW: 50, minD: 40 },
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
