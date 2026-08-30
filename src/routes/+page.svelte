<script lang="ts">
import Canvas from '$lib/components/Canvas.svelte';
import InspectorPanel from '$lib/components/InspectorPanel.svelte';
import Toolbar from '$lib/components/Toolbar.svelte';
import { itemPlacementInvalid } from '$lib/canvas/scene.svelte';
import { deleteDoor, deleteWall, deleteWindow, moveItem, removeRoomItem } from '$lib/model/ops';
import { catalogLabel, setLabelLocale } from '$lib/items/registry';
import { saveDoc } from '$lib/model/storage';
import { getLocale } from '$lib/paraglide/runtime';
import { m } from '$lib/paraglide/messages';
import { plan } from '$lib/stores/plan.svelte';
import { ui } from '$lib/stores/ui.svelte';

// locale switches reload the document, so a per-mount read is always current
setLabelLocale(getLocale());

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
    plan.commit(m.history__deleteWindow(), deleteWindow(plan.doc, winId));
    ui.selectWindow(null); // falls back to the still-selected wall
    return;
  }
  const doorId = ui.selectedDoorId;
  if (doorId && plan.doc.doors[doorId]) {
    plan.commit(m.history__deleteDoor(), deleteDoor(plan.doc, doorId));
    ui.selectDoor(null); // falls back to the still-selected wall
    return;
  }
  const itemId = ui.selectedItemId;
  const item = itemId ? plan.doc.roomObjects[itemId] : undefined;
  if (item) {
    plan.commit(m.history__deleteItem({ label: catalogLabel(item.kind) }), removeRoomItem(plan.doc, item.id));
    ui.selectItem(null);
    return;
  }
  const id = ui.selectedWallId;
  if (!id || !plan.doc.walls[id]) {
    return;
  }
  plan.commit(m.history__deleteWall(), deleteWall(plan.doc, id));
  ui.select(null);
}

/** Nudges the selected item by 1 cm per keypress — each keypress is its own
 * gesture and commits its own history entry. Rejected with a toast when the
 * target placement would hit a wall or leave the room (same rule as drags). */
function nudgeSelected(dx: number, dy: number) {
  const itemId = ui.selectedItemId;
  const item = itemId ? plan.doc.roomObjects[itemId] : undefined;
  if (!item) {
    return;
  }
  const x = item.x + dx;
  const y = item.y + dy;
  if (itemPlacementInvalid({ ...item, x, y })) {
    ui.showError(m.canvas__errorItemInvalid({ label: catalogLabel(item.kind) }));
    return;
  }
  plan.commit(m.history__moveItem({ label: catalogLabel(item.kind) }), moveItem(plan.doc, item.id, x, y));
}

function onKeydown(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
    return;
  }
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();
  if (mod && key === 'z') {
    e.preventDefault();
    if (e.shiftKey) {
      plan.redo();
    } else {
      plan.undo();
    }
  } else if (mod && key === 'y') {
    e.preventDefault();
    plan.redo();
  } else if (e.key === 'Backspace' || e.key === 'Delete') {
    deleteSelected();
  } else if (ui.tool === 'select' && e.key.startsWith('Arrow')) {
    e.preventDefault();
    const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    nudgeSelected(dx, dy);
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
    <InspectorPanel />
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
