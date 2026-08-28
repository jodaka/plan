<script lang="ts">
import ItemShapes from '$lib/components/ItemShapes.svelte';
import { itemShapes } from '$lib/items/registry';

interface Props {
  id: string;
  kind: string;
  /** item center, world cm */
  x: number;
  y: number;
  /** size along local axes, cm */
  w: number;
  d: number;
  /** degrees, clockwise on screen */
  rotation: number;
  scale: number;
  selected?: boolean;
  /** overlaps a sibling item — warning tint */
  overlapping?: boolean;
  /** intersects a wall or leaves its room — rejected on drop */
  invalid?: boolean;
  /** its room is gone — rendered grayed until re-bound */
  orphan?: boolean;
}

let {
  id,
  kind,
  x,
  y,
  w,
  d,
  rotation,
  scale,
  selected = false,
  overlapping = false,
  invalid = false,
  orphan = false,
}: Props = $props();

const hw = $derived(w / 2);
const hd = $derived(d / 2);
const flagged = $derived(overlapping || invalid);
const tone = $derived(orphan ? 'orphan' : flagged ? 'flagged' : '');
// generic renderer: shapes come from the item's one library file
const shapes = $derived(itemShapes(kind, w, d, scale));
</script>

<!-- data-item-id on the group so every child resolves via closest() -->
<g class="item" class:flagged class:orphan data-item-id={id} transform="translate({x} {y}) rotate({rotation})">
  <ItemShapes {shapes} {scale} {tone} />
  {#if selected}
    <rect class="outline" x={-hw} y={-hd} width={w} height={d} stroke-width={2 / scale} />
  {/if}
  <!-- invisible grab area: the item body plus a small margin -->
  <rect class="hit" x={-hw - 4 / scale} y={-hd - 4 / scale} width={w + 8 / scale} height={d + 8 / scale} />
</g>

<style>
.outline {
  fill: none;
  stroke: #2563eb;
  pointer-events: none;
}
.hit {
  fill: transparent;
  pointer-events: fill;
  cursor: grab;
}
</style>
