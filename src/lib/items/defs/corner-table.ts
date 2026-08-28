import type { ItemDef } from '../types';

const def: ItemDef = {
  kind: 'corner-table',
  label: 'Corner table',
  category: 'living-room',
  defaults: { w: 60, d: 60, minW: 30, minD: 30 },
  // true shape is a rect with one rounded corner; collision keeps bbox for now.
  // Future: return pentagon + quarter-circle approximation.
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
