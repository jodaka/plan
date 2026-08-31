<script lang="ts">
import { fmtM2, polygonCentroid, type Pt } from '$lib/geometry';

interface Props {
  /** ordered room corners (wall centerline corners), cm */
  pts: Pt[];
  areaCm2: number;
  /** stable room key — the m² label carries it as a drag handle (data attr) */
  roomKey: string;
}

let { pts, areaCm2, roomKey }: Props = $props();

const points = $derived(pts.map((p) => `${p.x},${p.y}`).join(' '));
const center = $derived(polygonCentroid(pts));
// label hit rect: text is ~9 chars wide; generous padding for a comfy grab.
// Sizes are screen px via the canvas `--inv` var — static strings, so zooming
// never re-renders this component. Plain attributes are the fallback for
// browsers without CSS geometry properties (the style wins where supported).
const hitStyle = $derived(
  `x: calc(${center.x}px - 38px * var(--inv)); y: calc(${center.y}px - 11px * var(--inv));
    width: calc(76px * var(--inv)); height: calc(22px * var(--inv)); rx: calc(4px * var(--inv));`,
);
</script>

<g class="room">
  <polygon {points} />
  <!-- the m² label doubles as the room's drag-n-drop handle -->
  <rect class="label-hit" data-room-key={roomKey} style={hitStyle} />
  <text
    x={center.x}
    y={center.y}
    style="font-size: calc(12px * var(--inv)); stroke-width: calc(3px * var(--inv));"
    text-anchor="middle"
    dominant-baseline="middle">
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
