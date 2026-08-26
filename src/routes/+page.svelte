<script lang="ts">
import Canvas from '$lib/components/Canvas.svelte';
import InspectorPanel from '$lib/components/InspectorPanel.svelte';
import Toolbar from '$lib/components/Toolbar.svelte';
import { deleteWall, deleteWindow } from '$lib/model/ops';
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
  const winId = ui.selectedWindowId;
  if (winId && plan.doc.windows[winId]) {
    plan.commit('Delete window', deleteWindow(plan.doc, winId));
    ui.selectWindow(null); // falls back to the still-selected wall
    return;
  }
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

{#if ui.error}
  <div class="toast" role="alert">{ui.error}</div>
{/if}

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
.toast {
  position: fixed;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  background: #b91c1c;
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  padding: 8px 14px;
  box-shadow: 0 4px 14px rgb(0 0 0 / 0.25);
  z-index: 50;
  max-width: 90vw;
}
</style>
