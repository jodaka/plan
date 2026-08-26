<script lang="ts">
import { addPt, mul, sub, unit, type Pt } from '$lib/geometry';
import type { DoorMode } from '$lib/types';

interface Props {
  id: string;
  /** wall centerline start point */
  a: Pt;
  /** wall centerline end point */
  b: Pt;
  /** always the host wall's thickness — doors span it fully */
  thickness: number;
  /** cm from the wall start joint to the door's near edge */
  offset: number;
  /** cm along the wall axis */
  length: number;
  mode: DoorMode;
  scale: number;
  selected?: boolean;
}

let { id, a, b, thickness, offset, length, mode, scale, selected = false }: Props = $props();

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
/** invisible grab area extending past the wall faces for comfortable hits */
const hitPts = $derived(quad(p1, p2, h + 6 / scale));

// swing symbol: leaf hinged at one jamb standing perpendicular to the wall,
// quarter-circle arc from its tip back to the other jamb
const swing = $derived.by(() => {
  if (mode === 'none') return null;
  const hinge = mode.startsWith('l') ? p1 : p2;
  const other = mode.startsWith('l') ? p2 : p1;
  const dir = mode.endsWith('t') ? mul(n, -1) : n;
  const tip = addPt(hinge, mul(dir, length));
  // SVG sweep flag: positive z cross product = increasing screen angle
  const v1 = sub(tip, hinge);
  const v2 = sub(other, hinge);
  const sweep = v1.x * v2.y - v1.y * v2.x > 0 ? 1 : 0;
  return { hinge, tip, other, sweep };
});
</script>

<!-- data-door-id lives on the group so every child resolves to it via closest() -->
<g class="door" data-door-id={id}>
  <polygon class="frame" points={framePts} />
  {#if swing}
    <path
      class="arc"
      d="M {swing.tip.x} {swing.tip.y} A {length} {length} 0 0 {swing.sweep} {swing.other.x} {swing.other.y}"
      stroke-width={1 / scale}
      stroke-dasharray="{4 / scale} {3 / scale}" />
    <line
      class="leaf"
      x1={swing.hinge.x}
      y1={swing.hinge.y}
      x2={swing.tip.x}
      y2={swing.tip.y}
      stroke-width={2 / scale} />
    <circle class="hinge" cx={swing.hinge.x} cy={swing.hinge.y} r={1.6 / scale} />
  {/if}
  {#if selected}
    <polygon class="outline" points={framePts} stroke-width={3 / scale} />
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
  fill: #fffbeb;
  stroke: #a16207;
  stroke-width: 1;
}
.arc {
  fill: none;
  stroke: #d97706;
  pointer-events: none;
}
.leaf {
  stroke: #b45309;
  pointer-events: none;
}
.hinge {
  fill: #b45309;
  pointer-events: none;
}
.outline {
  fill: none;
  stroke: #d97706;
  pointer-events: none;
}
:global(svg.canvas .door-handle) {
  cursor: ew-resize;
}
</style>
