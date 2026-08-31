<script lang="ts">
import { addPt, mul, sub, unit, type Pt } from '$lib/geometry';

interface Props {
  id: string;
  /** wall centerline start point */
  a: Pt;
  /** wall centerline end point */
  b: Pt;
  /** always the host wall's thickness — windows span it fully */
  thickness: number;
  /** cm from the wall start joint to the window's near edge */
  offset: number;
  /** cm along the wall axis */
  length: number;
  scale: number;
  selected?: boolean;
}

let { id, a, b, thickness, offset, length, scale, selected = false }: Props = $props();

const u = $derived(unit(sub(b, a)));
const n = $derived({ x: -u.y, y: u.x });
const h = $derived(thickness / 2);

const p1 = $derived(addPt(a, mul(u, offset)));
const p2 = $derived(addPt(a, mul(u, offset + length)));

const quad = (from: Pt, to: Pt, half: number) =>
  [addPt(from, mul(n, half)), addPt(to, mul(n, half)), addPt(to, mul(n, -half)), addPt(from, mul(n, -half))]
    .map((p) => `${p.x},${p.y}`)
    .join(' ');

const framePts = $derived(quad(p1, p2, h));
const glassHalf = $derived(Math.max(0, h - Math.min(h * 0.35, 2)));
const glassPts = $derived(quad(p1, p2, glassHalf));
/** invisible grab area extending past the wall faces for comfortable hits */
const hitPts = $derived(quad(p1, p2, h + 6 / scale));
</script>

<!-- data-window-id lives on the group so every child resolves to it via closest().
     Strokes are screen px via the static `--inv` calc styles (set on the svg
     root) — zoom only rewrites the hit-quad points. -->
<g class="win" data-window-id={id}>
  <polygon class="frame" points={framePts} />
  <polygon class="glass" points={glassPts} />
  <line class="sash" x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} style="stroke-width: calc(1.2px * var(--inv));" />
  {#if selected}
    <polygon class="outline" points={framePts} style="stroke-width: calc(3px * var(--inv));" />
  {/if}
  <polygon class="hit" points={hitPts} />
</g>

<style>
.hit {
  fill: transparent;
  pointer-events: fill;
  cursor: grab;
}
.frame {
  fill: #f1f5f9;
  stroke: #334155;
  stroke-width: 1;
}
.glass {
  fill: #bfdbfe;
}
.sash {
  stroke: #60a5fa;
}
.outline {
  fill: none;
  stroke: #2563eb;
}
:global(svg.canvas .win-handle) {
  cursor: ew-resize;
}
</style>
