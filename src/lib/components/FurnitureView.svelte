<script lang="ts">
import { getItemRender } from '$lib/items/renderRegistry';

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
const cls = $derived(orphan ? 'orphan' : flagged ? 'flagged' : '');
const Render = $derived(getItemRender(kind));
</script>

<!-- data-item-id on the group so every child resolves via closest() -->
<g class="item {cls}" data-item-id={id} transform="translate({x} {y}) rotate({rotation})">
  <Render {w} {d} {scale} />
  {#if selected}
    <rect class="outline" x={-hw} y={-hd} width={w} height={d} stroke-width={2 / scale} />
  {/if}
  <!-- invisible grab area: the item body plus a small margin -->
  <rect class="hit" x={-hw - 4 / scale} y={-hd - 4 / scale} width={w + 8 / scale} height={d + 8 / scale} />
</g>

<style>
:global(.item .body) {
  fill: #e2e8f0;
  stroke: #475569;
}
:global(.item .detail) {
  fill: #f1f5f9;
  fill-opacity: 0.6;
  stroke: #94a3b8;
}
:global(.item .hinge) {
  fill: #64748b;
}
.item .outline {
  fill: none;
  stroke: #2563eb;
  pointer-events: none;
}
:global(.item.flagged .body) {
  fill: #fecaca;
  stroke: #dc2626;
}
:global(.item.flagged .detail) {
  fill: #fee2e2;
  fill-opacity: 0.7;
  stroke: #dc2626;
}
:global(.item.orphan .body) {
  fill: #f8fafc;
  stroke: #94a3b8;
  stroke-dasharray: 4 3;
}
.hit {
  fill: transparent;
  pointer-events: fill;
  cursor: grab;
}
:global(svg.canvas .item-handle) {
  cursor: nwse-resize;
}
:global(svg.canvas .item-rotate-handle) {
  cursor: grab;
}
</style>
