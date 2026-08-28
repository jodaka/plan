import type { ItemDef } from '../types';

const def: ItemDef = {
  kind: 'bed',
  label: 'Bed',
  category: 'bedroom',
  defaults: { w: 90, d: 200, minW: 70, minD: 150 },
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
