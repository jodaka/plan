import type { Component } from 'svelte';

import Bed from './views/bed.svelte';
import Chair from './views/chair.svelte';
import Closet from './views/closet.svelte';
import CornerTable from './views/corner-table.svelte';
import DoubleBed from './views/double-bed.svelte';
import Sofa from './views/sofa.svelte';
import Table from './views/table.svelte';
import Unknown from './views/unknown.svelte';

type ItemProps = { w: number; d: number; scale: number };

const RENDER_MAP = new Map<string, Component<ItemProps>>([
  ['bed', Bed as unknown as Component<ItemProps>],
  ['double-bed', DoubleBed as unknown as Component<ItemProps>],
  ['chair', Chair as unknown as Component<ItemProps>],
  ['sofa', Sofa as unknown as Component<ItemProps>],
  ['table', Table as unknown as Component<ItemProps>],
  ['corner-table', CornerTable as unknown as Component<ItemProps>],
  ['closet', Closet as unknown as Component<ItemProps>],
]);

export function getItemRender(kind: string): Component<ItemProps> {
  return RENDER_MAP.get(kind) ?? (Unknown as unknown as Component<ItemProps>);
}
