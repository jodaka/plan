<script lang="ts">
import { type WallEndNeighbor, wallCorners } from '$lib/geometry';
import type { Joint, Wall } from '$lib/types';

interface Props {
  wall: Wall;
  joints: Record<string, Joint>;
  /** thickest neighbor at each end (direction + thickness); null = free end */
  neighbors: { start: WallEndNeighbor | null; end: WallEndNeighbor | null };
}

let { wall, joints, neighbors }: Props = $props();

const a = $derived(joints[wall.startJointId]);
const b = $derived(joints[wall.endJointId]);

/** mitered quad — corners close exactly against the neighbor at any angle */
const corners = $derived.by(() => {
  if (!a || !b) return null;
  return wallCorners(a, b, wall.thickness, neighbors.start, neighbors.end);
});

const points = $derived(corners ? corners.map((p) => `${p.x},${p.y}`).join(' ') : '');
</script>

{#if points}
  <g>
    <polygon class="wall-body" {points} />
    <!-- invisible fat body for comfortable hit-testing -->
    <polygon class="hit" data-wall-id={wall.id} {points} />
  </g>
{/if}

<style>
.wall-body {
  fill: #334155;
}
.hit {
  fill: transparent;
  pointer-events: fill;
  cursor: pointer;
}
</style>
