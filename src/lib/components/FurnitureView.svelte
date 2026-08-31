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
  selected = false,
  overlapping = false,
  invalid = false,
  orphan = false,
}: Props = $props();

const hw = $derived(w / 2);
const hd = $derived(d / 2);
const flagged = $derived(overlapping || invalid);
const tone = $derived(orphan ? 'orphan' : flagged ? 'flagged' : '');
// generic renderer: shapes come from the item's one library file; screen-px
// hairlines come from the `--inv` CSS var, so zoom never re-renders this
const shapes = $derived(itemShapes(kind, w, d));
</script>

<!-- data-item-id on the group so every child resolves via closest() -->
<g class="item" class:flagged class:orphan data-item-id={id} transform="translate({x} {y}) rotate({rotation})">
  <ItemShapes {shapes} {tone} />
  {#if selected}
    <rect class="outline" x={-hw} y={-hd} width={w} height={d} style="stroke-width: calc(2px * var(--inv));" />
  {/if}
  <!-- invisible grab area: the item body plus a small screen-px margin -->
  <rect
    class="hit"
    x={-hw}
    y={-hd}
    width={w}
    height={d}
    style="x: calc({-hw}px - 4px * var(--inv)); y: calc({-hd}px - 4px * var(--inv)); width: calc({w}px + 8px *
      var(--inv)); height: calc({d}px + 8px * var(--inv));" />
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
