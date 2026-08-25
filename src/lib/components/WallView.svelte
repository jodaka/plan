<script lang="ts">
	import type { Joint, Wall } from '$lib/types';

	interface Props {
		wall: Wall;
		joints: Record<string, Joint>;
		selected: boolean;
		/** px per cm, used to counter-scale screen-constant elements */
		scale: number;
	}

	let { wall, joints, selected, scale }: Props = $props();

	const a = $derived(joints[wall.startJointId]);
	const b = $derived(joints[wall.endJointId]);
	const hitWidth = $derived(Math.max(wall.thickness, 14 / scale));
</script>

{#if a && b}
	<g>
		{#if selected}
			<line
				x1={a.x}
				y1={a.y}
				x2={b.x}
				y2={b.y}
				stroke="#3b82f6"
				stroke-width={wall.thickness + 6 / scale}
				opacity="0.35"
			/>
		{/if}
		<line
			x1={a.x}
			y1={a.y}
			x2={b.x}
			y2={b.y}
			stroke={selected ? '#2563eb' : '#334155'}
			stroke-width={wall.thickness}
		/>
		<!-- invisible fat line for comfortable hit-testing -->
		<line
			class="hit"
			data-wall-id={wall.id}
			x1={a.x}
			y1={a.y}
			x2={b.x}
			y2={b.y}
			stroke-width={hitWidth}
		/>
		{#if selected}
			<circle
				class="handle"
				data-joint-id={wall.startJointId}
				cx={a.x}
				cy={a.y}
				r={6 / scale}
				stroke-width={2 / scale}
			/>
			<circle
				class="handle"
				data-joint-id={wall.endJointId}
				cx={b.x}
				cy={b.y}
				r={6 / scale}
				stroke-width={2 / scale}
			/>
		{/if}
	</g>
{/if}

<style>
	.hit {
		stroke: transparent;
		pointer-events: stroke;
		cursor: move;
	}
	.handle {
		fill: #ffffff;
		stroke: #2563eb;
		cursor: grab;
	}
</style>
