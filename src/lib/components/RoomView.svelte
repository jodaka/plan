<script lang="ts">
import { fmtM2, polygonCentroid, type Pt } from '$lib/geometry';

interface Props {
  /** ordered room corners (wall centerline corners), cm */
  pts: Pt[];
  areaCm2: number;
  scale: number;
  /** stable room key — the m² label carries it as a drag handle (data attr) */
  roomKey: string;
}

let { pts, areaCm2, scale, roomKey }: Props = $props();

const points = $derived(pts.map((p) => `${p.x},${p.y}`).join(' '));
const center = $derived(polygonCentroid(pts));
/** label hit rect: text is ~9 chars wide; generous padding for a comfy grab */
const hitW = $derived(76 / scale);
const hitH = $derived(22 / scale);
</script>

<g class="room">
  <polygon {points} />
  <!-- the m² label doubles as the room's drag-n-drop handle -->
  <rect
    class="label-hit"
    data-room-key={roomKey}
    x={center.x - hitW / 2}
    y={center.y - hitH / 2}
    width={hitW}
    height={hitH}
    rx={4 / scale} />
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
.room .label-hit {
  fill: transparent;
  pointer-events: all;
  cursor: grab;
}
:global(svg.canvas .room .label-hit:active) {
  cursor: grabbing;
}
</style>
