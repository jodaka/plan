import type { ItemDef } from '../types';

const def: ItemDef = {
  kind: 'table',
  label: { en: 'Table', ru: 'Стол' },
  category: 'living-room',
  defaults: { w: 120, d: 80, minW: 50, minD: 40 },
};

export default def;
