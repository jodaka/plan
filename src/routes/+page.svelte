<script lang="ts">
	import Canvas from '$lib/components/Canvas.svelte';
	import InspectorPanel from '$lib/components/InspectorPanel.svelte';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import { deleteWall } from '$lib/model/ops';
	import { saveDoc } from '$lib/model/storage';
	import { plan } from '$lib/stores/plan.svelte';
	import { ui } from '$lib/stores/ui.svelte';

	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	// debounced autosave on every committed document change
	$effect(() => {
		const doc = plan.doc;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => saveDoc(doc), 250);
		return () => clearTimeout(saveTimer);
	});

	function deleteSelected() {
		const id = ui.selectedWallId;
		if (!id || !plan.doc.walls[id]) return;
		plan.commit('Delete wall', deleteWall(plan.doc, id));
		ui.select(null);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		const mod = e.metaKey || e.ctrlKey;
		const key = e.key.toLowerCase();
		if (mod && key === 'z') {
			e.preventDefault();
			if (e.shiftKey) plan.redo();
			else plan.undo();
		} else if (mod && key === 'y') {
			e.preventDefault();
			plan.redo();
		} else if (e.key === 'Backspace' || e.key === 'Delete') {
			deleteSelected();
		} else if (key === 'v') {
			ui.setTool('select');
		} else if (key === 'd') {
			ui.setTool('draw');
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="app">
	<header>
		<Toolbar />
	</header>
	<main>
		<Canvas />
		{#if ui.selectedWallId}
			<InspectorPanel />
		{/if}
	</main>
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		height: 100vh;
	}
	header {
		border-bottom: 1px solid #e2e8f0;
		background: #ffffff;
		z-index: 10;
	}
	main {
		flex: 1;
		display: flex;
		min-height: 0;
	}
</style>
