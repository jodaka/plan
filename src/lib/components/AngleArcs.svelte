<script lang="ts">
import type { Pt } from '$lib/geometry';

interface Arc {
  /** arc start point, on the selected wall's direction */
  p1: Pt;
  /** arc end point, on the neighbor wall's direction */
  p2: Pt;
  /** arc radius (world units) */
  r: number;
  /** SVG sweep flag for the short arc from p1 to p2 */
  sweep: number;
  /** label anchor (on the bisector) */
  lp: Pt;
  text: string;
}

interface Props {
  arcs: Arc[];
  scale: number;
}

let { arcs, scale }: Props = $props();
</script>

<g class="angle-arcs">
  {#each arcs as a, i (i)}
    <path
      class="arc"
      d={`M ${a.p1.x} ${a.p1.y} A ${a.r} ${a.r} 0 0 ${a.sweep} ${a.p2.x} ${a.p2.y}`}
      stroke-width={1.5 / scale} />
    <text
      class="arc-text"
      x={a.lp.x}
      y={a.lp.y}
      font-size={11 / scale}
      text-anchor="middle"
      dominant-baseline="middle"
      stroke-width={3 / scale}>
      {a.text}
    </text>
  {/each}
</g>

<style>
.angle-arcs {
  pointer-events: none;
}
.angle-arcs .arc {
  fill: none;
  stroke: #7c3aed;
}
.angle-arcs .arc-text {
  fill: #7c3aed;
  stroke: #ffffff;
  paint-order: stroke;
  font-weight: 600;
  user-select: none;
}
</style>
