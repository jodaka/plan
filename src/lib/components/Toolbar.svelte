<script lang="ts">
	import { docBBox } from '$lib/model/ops';
	import { plan } from '$lib/stores/plan.svelte';
	import { ui } from '$lib/stores/ui.svelte';
	import { viewport } from '$lib/stores/viewport.svelte';
</script>

<div class="toolbar">
	<div class="group" role="group" aria-label="Tools">
		<button
			class:active={ui.tool === 'select'}
			onclick={() => ui.setTool('select')}
			title="Select & move walls/joints (V)"
		>
			Select
		</button>
		<button
			class:active={ui.tool === 'draw'}
			onclick={() => ui.setTool('draw')}
			title="Draw walls (D)"
		>
			Draw wall
		</button>
	</div>

	<div class="group" role="group" aria-label="Snapping">
		<button class:active={ui.snapEnabled} onclick={() => ui.toggleSnap()} title="Snap to 1 cm grid">
			Snap
		</button>
		<button class:active={ui.showGrid} onclick={() => ui.toggleGrid()} title="Show grid">
			Grid
		</button>
	</div>

	<div class="group" role="group" aria-label="Zoom">
		<button onclick={() => viewport.zoomCenter(0.8)} title="Zoom out">−</button>
		<span class="pct">{Math.round(viewport.zoomPct)}%</span>
		<button onclick={() => viewport.zoomCenter(1.25)} title="Zoom in">+</button>
		<button onclick={() => viewport.fit(docBBox(plan.doc))} title="Fit plan in view">Fit</button>
	</div>

	<div class="group" role="group" aria-label="History">
		<button
			disabled={!plan.canUndo}
			onclick={() => plan.undo()}
			title={plan.undoLabel ? `Undo: ${plan.undoLabel}` : 'Nothing to undo'}
		>
			↶ Undo
		</button>
		<button
			disabled={!plan.canRedo}
			onclick={() => plan.redo()}
			title={plan.redoLabel ? `Redo: ${plan.redoLabel}` : 'Nothing to redo'}
		>
			↷ Redo
		</button>
	</div>

	<span class="hint">Space+drag = pan · wheel = zoom</span>
</div>

<style>
	.toolbar {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 8px 12px;
		background: #ffffff;
		flex-wrap: wrap;
	}
	.group {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	button {
		border: 1px solid #e2e8f0;
		background: #ffffff;
		border-radius: 6px;
		padding: 5px 10px;
		font-size: 13px;
		cursor: pointer;
		color: #334155;
	}
	button:hover:not(:disabled) {
		background: #f1f5f9;
	}
	button.active {
		background: #dbeafe;
		border-color: #93c5fd;
		color: #1d4ed8;
	}
	button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.pct {
		min-width: 44px;
		text-align: center;
		font-size: 13px;
		color: #64748b;
		font-variant-numeric: tabular-nums;
	}
	.hint {
		margin-left: auto;
		font-size: 12px;
		color: #94a3b8;
	}
</style>
