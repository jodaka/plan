import type { ItemDef } from '../types';

const def: ItemDef = {
  kind: 'sofa',
  label: 'Sofa',
  category: 'living-room',
  defaults: { w: 200, d: 90, minW: 100, minD: 60 },
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
