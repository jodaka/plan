<script lang="ts">
	import { extendPts } from '$lib/geometry';
	import type { Joint, JointId, Wall } from '$lib/types';

	interface Props {
		wall: Wall;
		joints: Record<string, Joint>;
		/** per-end corner extension (half of the thickest neighbor wall) */
		exts: { start: number; end: number };
		/** px per cm, used to counter-scale screen-constant elements */
		scale: number;
	}

	let { wall, joints, exts, scale }: Props = $props();

	const a = $derived(joints[wall.startJointId]);
	const b = $derived(joints[wall.endJointId]);

	const ends = $derived.by(() => {
		if (!a || !b) return null;
		return extendPts(a, b, exts.start, exts.end);
	});

	const hitWidth = $derived(Math.max(wall.thickness, 14 / scale));
</script>

{#if ends}
	<g>
		<line
			class="wall-body"
			x1={ends[0].x}
			y1={ends[0].y}
			x2={ends[1].x}
			y2={ends[1].y}
			stroke-width={wall.thickness}
		/>
		<!-- invisible fat line for comfortable hit-testing -->
		<line
			class="hit"
			data-wall-id={wall.id}
			x1={ends[0].x}
			y1={ends[0].y}
			x2={ends[1].x}
			y2={ends[1].y}
			stroke-width={hitWidth}
		/>
	</g>
{/if}

<style>
	.wall-body {
		stroke: #334155;
	}
	.hit {
		stroke: transparent;
		pointer-events: stroke;
		cursor: pointer;
	}
</style>
