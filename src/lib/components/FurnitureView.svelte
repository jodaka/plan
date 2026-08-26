<script lang="ts">
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

// decorative interior per kind — all in the local frame centered at origin
const pillowH = $derived(Math.min(24, d * 0.18));
const inset = $derived(Math.min(10, w * 0.12, d * 0.12));
/** corner-table rounded front radius */
const cr = $derived(Math.min(hw, hd));
</script>

<!-- data-item-id on the group so every child resolves via closest() -->
<g class="item {cls}" data-item-id={id} transform="translate({x} {y}) rotate({rotation})">
  {#if kind === 'bed' || kind === 'double-bed'}
    <rect class="body" x={-hw} y={-hd} width={w} height={d} stroke-width={1 / scale} />
    {#if kind === 'double-bed'}
      <rect
        class="detail"
        x={-hw + inset}
        y={-hd + inset / 2}
        width={w / 2 - inset * 1.5}
        height={pillowH}
        rx={3 / scale}
        stroke-width={1 / scale} />
      <rect
        class="detail"
        x={inset / 2}
        y={-hd + inset / 2}
        width={w / 2 - inset * 1.5}
        height={pillowH}
        rx={3 / scale}
        stroke-width={1 / scale} />
    {:else}
      <rect
        class="detail"
        x={-hw + inset}
        y={-hd + inset / 2}
        width={w - inset * 2}
        height={pillowH}
        rx={3 / scale}
        stroke-width={1 / scale} />
    {/if}
    <line
      class="detail"
      x1={-hw}
      y1={-hd + inset / 2 + pillowH + inset}
      x2={hw}
      y2={-hd + inset / 2 + pillowH + inset}
      stroke-width={1 / scale} />
  {:else if kind === 'chair'}
    <rect class="body" x={-hw} y={-hd} width={w} height={d} stroke-width={1 / scale} />
    <rect class="detail" x={-hw} y={-hd} width={w} height={Math.min(8, d * 0.2)} stroke-width={1 / scale} />
  {:else if kind === 'sofa'}
    <rect class="body" x={-hw} y={-hd} width={w} height={d} stroke-width={1 / scale} />
    <rect class="detail" x={-hw} y={-hd} width={w} height={Math.min(16, d * 0.25)} stroke-width={1 / scale} />
    <rect class="detail" x={-hw} y={-hd} width={Math.min(14, w * 0.15)} height={d} stroke-width={1 / scale} />
    <rect
      class="detail"
      x={hw - Math.min(14, w * 0.15)}
      y={-hd}
      width={Math.min(14, w * 0.15)}
      height={d}
      stroke-width={1 / scale} />
  {:else if kind === 'corner-table'}
    <path
      class="body"
      d="M {-hw} {-hd} L {hw - cr} {-hd} Q {hw} {-hd} {hw} {-hd + cr} L {hw} {hd} L {-hw} {hd} Z"
      stroke-width={1 / scale} />
    <path
      class="detail"
      d="M {-hw + inset} {-hd + inset} L {hw - cr * 0.6} {-hd + inset} Q {hw - inset} {-hd + inset} {hw - inset} {-hd + cr * 0.6} L {hw - inset} {hd - inset} L {-hw + inset} {hd - inset} Z"
      fill="none"
      stroke-width={1 / scale} />
  {:else if kind === 'closet'}
    <rect class="body" x={-hw} y={-hd} width={w} height={d} stroke-width={1 / scale} />
    {#if w >= d}
      <line class="detail" x1={0} y1={-hd} x2={0} y2={hd} stroke-width={1 / scale} />
      <circle class="hinge" cx={-3 / scale} cy={0} r={1.5 / scale} />
      <circle class="hinge" cx={3 / scale} cy={0} r={1.5 / scale} />
    {:else}
      <line class="detail" x1={-hw} y1={0} x2={hw} y2={0} stroke-width={1 / scale} />
      <circle class="hinge" cx={0} cy={-3 / scale} r={1.5 / scale} />
      <circle class="hinge" cx={0} cy={3 / scale} r={1.5 / scale} />
    {/if}
  {:else}
    <!-- unknown kinds (legacy/foreign docs) degrade to a plain box -->
    <rect class="body" x={-hw} y={-hd} width={w} height={d} stroke-width={1 / scale} />
  {/if}
  {#if selected}
    <rect class="outline" x={-hw} y={-hd} width={w} height={d} stroke-width={2 / scale} />
  {/if}
  <!-- invisible grab area: the item body plus a small margin -->
  <rect class="hit" x={-hw - 4 / scale} y={-hd - 4 / scale} width={w + 8 / scale} height={d + 8 / scale} />
</g>

<style>
.item .body {
  fill: #e2e8f0;
  stroke: #475569;
}
.item .detail {
  fill: #f1f5f9;
  fill-opacity: 0.6;
  stroke: #94a3b8;
}
.item .hinge {
  fill: #64748b;
}
.item .outline {
  fill: none;
  stroke: #2563eb;
  pointer-events: none;
}
.item.flagged .body {
  fill: #fecaca;
  stroke: #dc2626;
}
.item.flagged .detail {
  fill: #fee2e2;
  fill-opacity: 0.7;
  stroke: #dc2626;
}
.item.orphan .body {
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
