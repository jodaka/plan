<script lang="ts">
import { fmtM2, polygonCentroid, type Pt } from '$lib/geometry';

interface Props {
  /** ordered room corners (wall centerlines), cm */
  pts: Pt[];
  areaCm2: number;
  scale: number;
}

let { pts, areaCm2, scale }: Props = $props();

const points = $derived(pts.map((p) => `${p.x},${p.y}`).join(' '));
const center = $derived(polygonCentroid(pts));
</script>

<g class="room">
  <polygon {points} />
  <text
    x={center.x}
    y={center.y}
    font-size={12 / scale}
    text-anchor="middle"
    dominant-baseline="middle"
    stroke-width={3 / scale}>
    {fmtM2(areaCm2)}
    m²
  </text>
</g>

<style>
.room {
  pointer-events: none;
}
.room polygon {
  fill: rgb(250, 235, 215);
  stroke: none;
}
.room text {
  fill: #92400e;
  font-weight: 600;
  stroke: #ffffff;
  paint-order: stroke;
  user-select: none;
}
</style>
