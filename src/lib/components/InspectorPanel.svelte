<script lang="ts">
	import { dist, wallAngleDeg } from '$lib/geometry';
	import { deleteWall, setLength, setThickness, wallsAtJoint } from '$lib/model/ops';
	import { plan } from '$lib/stores/plan.svelte';
	import { ui } from '$lib/stores/ui.svelte';

	const wall = $derived(ui.selectedWallId ? plan.doc.walls[ui.selectedWallId] : undefined);
	const length = $derived(
		wall ? dist(plan.doc.joints[wall.startJointId], plan.doc.joints[wall.endJointId]) : 0
	);
	const angle = $derived(
		wall ? wallAngleDeg(plan.doc.joints[wall.startJointId], plan.doc.joints[wall.endJointId]) : 0
	);

	const dims = $derived.by(() => {
		if (!wall) return null;
		const halfNeighbor = (jid: string) => {
			let m = 0;
			for (const o of wallsAtJoint(plan.doc, jid)) {
				if (o.id !== wall.id) m = Math.max(m, o.thickness);
			}
			return m / 2;
		};
		const es = halfNeighbor(wall.startJointId);
		const ee = halfNeighbor(wall.endJointId);
		return { outer: length + es + ee, inner: Math.max(0, length - es - ee) };
	});

	function applyLength(value: number) {
		if (!wall || !Number.isFinite(value)) return;
		plan.commit('Change wall length', setLength(plan.doc, wall.id, value));
	}

	function applyThickness(value: number) {
		if (!wall || !Number.isFinite(value)) return;
		plan.commit('Change thickness', setThickness(plan.doc, wall.id, value));
	}

	function remove() {
		if (!wall) return;
		plan.commit('Delete wall', deleteWall(plan.doc, wall.id));
		ui.select(null);
	}
</script>

{#if wall}
	{#key wall.id}
		<aside class="panel">
			<h3>Wall</h3>
			<label>
				<span>Length (centerline), cm</span>
				<input
					type="number"
					min="1"
					step="1"
					value={Math.round(length * 10) / 10}
					onchange={(e) => applyLength(e.currentTarget.valueAsNumber)}
				/>
			</label>
			<label>
				<span>Thickness, cm</span>
				<input
					type="number"
					min="1"
					max="100"
					step="1"
					value={wall.thickness}
					onchange={(e) => applyThickness(e.currentTarget.valueAsNumber)}
				/>
			</label>
			{#if dims}
				<p class="meta">Outer span: {dims.outer} cm</p>
				<p class="meta">Inner (clear): {dims.inner} cm</p>
			{/if}
			<p class="meta">
				Orientation: {angle}°{angle === 0
					? ' · horizontal'
					: angle === 90
						? ' · vertical'
						: ''}
			</p>
			<button class="danger" onclick={remove}>Delete wall</button>
		</aside>
	{/key}
{/if}

<style>
	.panel {
		width: 240px;
		flex-shrink: 0;
		border-left: 1px solid #e2e8f0;
		background: #ffffff;
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	h3 {
		margin: 0;
		font-size: 14px;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 12px;
		color: #475569;
	}
	input {
		border: 1px solid #cbd5e1;
		border-radius: 6px;
		padding: 6px 8px;
		font-size: 13px;
	}
	input:focus {
		outline: 2px solid #93c5fd;
		border-color: #2563eb;
	}
	.meta {
		margin: 0;
		font-size: 12px;
		color: #64748b;
	}
	.danger {
		border: 1px solid #fecaca;
		background: #fef2f2;
		color: #b91c1c;
		border-radius: 6px;
		padding: 6px 10px;
		font-size: 13px;
		cursor: pointer;
	}
	.danger:hover {
		background: #fee2e2;
	}
</style>
