<script lang="ts">
import { dist, fmtCm, fmtM2, wallAngleDeg } from '$lib/geometry';
import { CATALOG, catalogItem, catalogLabel } from '$lib/model/catalog';
import {
  addDoor,
  addWindow,
  cycleDoorMode,
  deleteDoor,
  deleteWall,
  deleteWindow,
  doorsOnWall,
  MIN_WALL_LENGTH,
  removeRoomItem,
  renameRoom,
  resizeItem,
  rotateItem,
  setDoorLength,
  setInnerLength,
  setThickness,
  setWindowLength,
  violatedOpeningFloors,
  wallOpeningSpanCm,
  wallsAtJoint,
  windowsOnWall,
} from '$lib/model/ops';
import { findRooms, roomObjectsIn } from '$lib/model/rooms';
import { plan } from '$lib/stores/plan.svelte';
import { ui } from '$lib/stores/ui.svelte';
import { MIN_DOOR_LENGTH, MIN_WINDOW_LENGTH, type DoorMode } from '$lib/types';

const wall = $derived(ui.selectedWallId ? plan.doc.walls[ui.selectedWallId] : undefined);
const win = $derived(ui.selectedWindowId ? plan.doc.windows[ui.selectedWindowId] : undefined);
const door = $derived(ui.selectedDoorId ? plan.doc.doors[ui.selectedDoorId] : undefined);
const item = $derived(ui.selectedItemId ? plan.doc.roomObjects[ui.selectedItemId] : undefined);
const room = $derived.by(() => {
  const key = ui.selectedRoomKey;
  if (!key) return undefined;
  return findRooms(plan.doc.joints, plan.doc.walls).find((r) => r.key === key);
});
const length = $derived(wall ? dist(plan.doc.joints[wall.startJointId], plan.doc.joints[wall.endJointId]) : 0);
const angle = $derived(wall ? wallAngleDeg(plan.doc.joints[wall.startJointId], plan.doc.joints[wall.endJointId]) : 0);

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
  // windows and doors share the wall axis — both count against its span
  const span = wallOpeningSpanCm(plan.doc, wall.id);
  return {
    outer: length + es + ee,
    inner: Math.max(0, length - es - ee),
    // smallest inner span that still fits every opening on this wall
    minInner: Math.max(MIN_WALL_LENGTH, span === 0 ? MIN_WALL_LENGTH : span - es - ee),
    free: Math.max(0, length - span),
  };
});

const wallWins = $derived(wall ? windowsOnWall(plan.doc, wall.id) : []);
const wallDoors = $derived(wall ? doorsOnWall(plan.doc, wall.id) : []);

const DOOR_MODE_LABELS: Record<DoorMode, string> = {
  tl: 'top-left',
  tr: 'top-right',
  br: 'bottom-right',
  bl: 'bottom-left',
  none: 'no swing',
};

function applyLength(value: number) {
  if (!wall || !Number.isFinite(value)) return;
  const candidate = setInnerLength(plan.doc, wall.id, value);
  if (violatedOpeningFloors(candidate).length > 0) {
    ui.showError(
      `Wall can't be shorter than its openings — minimum inner length is ${fmtCm(
        dims?.minInner ?? MIN_WALL_LENGTH,
      )} cm.`,
    );
    return;
  }
  plan.commit('Change wall length', candidate);
}

function applyThickness(value: number) {
  if (!wall || !Number.isFinite(value)) return;
  const candidate = setThickness(plan.doc, wall.id, value);
  // thinning pushes neighbor joints in, shortening THEIR spans too — check all
  if (violatedOpeningFloors(candidate).length > 0) {
    ui.showError('Rejected: this thickness would shrink a wall below its openings.');
    return;
  }
  plan.commit('Change thickness', candidate);
}

function addWindowToWall() {
  if (!wall) return;
  const res = addWindow(plan.doc, wall.id);
  if (!res.window) {
    ui.showError(`No room for a window — at least ${fmtCm(MIN_WINDOW_LENGTH)} cm of free wall is needed.`);
    return;
  }
  plan.commit('Add window', res.doc);
  ui.select(res.window.wallId);
  ui.selectWindow(res.window.id);
}

function addDoorToWall() {
  if (!wall) return;
  const res = addDoor(plan.doc, wall.id);
  if (!res.door) {
    ui.showError(`No room for a door — at least ${fmtCm(MIN_DOOR_LENGTH)} cm of free wall is needed.`);
    return;
  }
  plan.commit('Add door', res.doc);
  ui.select(res.door.wallId);
  ui.selectDoor(res.door.id);
}

function applyWindowLength(value: number) {
  if (!win || !Number.isFinite(value)) return;
  plan.commit('Resize window', setWindowLength(plan.doc, win.id, value));
}

function applyDoorLength(value: number) {
  if (!door || !Number.isFinite(value)) return;
  plan.commit('Resize door', setDoorLength(plan.doc, door.id, value));
}

function toggleDoorMode() {
  if (!door) return;
  plan.commit('Change door swing', cycleDoorMode(plan.doc, door.id));
}

function removeDoor() {
  if (!door) return;
  plan.commit('Delete door', deleteDoor(plan.doc, door.id));
  ui.selectDoor(null); // falls back to the still-selected wall
}

function removeWindow() {
  if (!win) return;
  plan.commit('Delete window', deleteWindow(plan.doc, win.id));
  ui.selectWindow(null);
}

function applyItemSize(w: number, d: number) {
  if (!item || !Number.isFinite(w) || !Number.isFinite(d)) return;
  plan.commit(`Resize ${catalogLabel(item.kind)}`, resizeItem(plan.doc, item.id, w, d));
}

function applyItemRotation(deg: number) {
  if (!item || !Number.isFinite(deg)) return;
  plan.commit(`Rotate ${catalogLabel(item.kind)}`, rotateItem(plan.doc, item.id, deg));
}

function removeItem() {
  if (!item) return;
  plan.commit(`Delete ${catalogLabel(item.kind)}`, removeRoomItem(plan.doc, item.id));
  ui.selectItem(null);
}

function applyRoomName(name: string) {
  if (!room) return;
  plan.commit('Rename room', renameRoom(plan.doc, room.key, name));
}

function remove() {
  if (!wall) return;
  // destroying a room orphans its bound entities (furniture, …) — warn before
  // the fact; windows/doors die WITH their wall by design
  const rooms = findRooms(plan.doc.joints, plan.doc.walls).filter((r) => r.wallIds.includes(wall.id));
  const objects = rooms.reduce((n, r) => n + Object.keys(roomObjectsIn(plan.doc, r.key)).length, 0);
  if (
    (rooms.length > 0 || wallWins.length > 0 || wallDoors.length > 0) &&
    !confirm(confirmMessage(rooms.length, objects, wallWins.length, wallDoors.length))
  )
    return;
  plan.commit('Delete wall', deleteWall(plan.doc, wall.id));
  ui.select(null);
}

function confirmMessage(roomCount: number, objectCount: number, winCount: number, doorCount: number): string {
  const parts: string[] = [];
  if (roomCount > 0) {
    parts.push(
      `part of ${roomCount === 1 ? 'a room' : `${roomCount} rooms`} (destroying ${roomCount === 1 ? 'it' : 'them'}${
        objectCount > 0 ? ` and orphaning ${objectCount} object${objectCount === 1 ? '' : 's'}` : ''
      })`,
    );
  }
  const deleted: string[] = [];
  if (winCount > 0) deleted.push(`${winCount} window${winCount === 1 ? '' : 's'}`);
  if (doorCount > 0) deleted.push(`${doorCount} door${doorCount === 1 ? '' : 's'}`);
  if (deleted.length > 0) parts.push(`deleting ${deleted.join(' and ')}`);
  return `This wall is ${parts.join(', ')}. Delete anyway?`;
}
</script>

<aside class="panel">
  <details class="section" open>
    <summary>Inspector</summary>
    <div class="section-body">
      {#key win?.id ?? door?.id ?? item?.id ?? wall?.id ?? room?.key ?? 'none'}
        {#if win}
          <h3>Window</h3>
          <label>
            <span>Length, cm</span>
            <input
              type="number"
              min={MIN_WINDOW_LENGTH}
              step="1"
              value={Math.round(win.length * 10) / 10}
              onchange={(e) => applyWindowLength(e.currentTarget.valueAsNumber)}>
          </label>
          <p class="meta">Position: {fmtCm(win.offset)} cm from wall start</p>
          <p class="meta">Drag a round handle on the canvas to resize.</p>
          <button class="danger" onclick={removeWindow}>Delete window</button>
        {:else if door}
          <h3>Door</h3>
          <label>
            <span>Length, cm</span>
            <input
              type="number"
              min={MIN_DOOR_LENGTH}
              step="1"
              value={Math.round(door.length * 10) / 10}
              onchange={(e) => applyDoorLength(e.currentTarget.valueAsNumber)}>
          </label>
          <button onclick={toggleDoorMode} title="Cycle through all five swing modes">
            Swing: {DOOR_MODE_LABELS[door.mode]}
          </button>
          <p class="meta">Position: {fmtCm(door.offset)} cm from wall start</p>
          <p class="meta">Drag a round handle on the canvas to resize.</p>
          <button class="danger" onclick={removeDoor}>Delete door</button>
        {:else if item}
          <h3>{catalogLabel(item.kind)}</h3>
          <label>
            <span>Width, cm</span>
            <input
              type="number"
              min={catalogItem(item.kind).minW}
              step="1"
              value={Math.round(item.w * 10) / 10}
              onchange={(e) => applyItemSize(e.currentTarget.valueAsNumber, item.d)}>
          </label>
          <label>
            <span>Depth, cm</span>
            <input
              type="number"
              min={catalogItem(item.kind).minD}
              step="1"
              value={Math.round(item.d * 10) / 10}
              onchange={(e) => applyItemSize(item.w, e.currentTarget.valueAsNumber)}>
          </label>
          <label>
            <span>Rotation, °</span>
            <input
              type="number"
              min="0"
              max="360"
              step="15"
              value={Math.round(item.rotation)}
              onchange={(e) => applyItemRotation(e.currentTarget.valueAsNumber)}>
          </label>
          <p class="meta">Position: {fmtCm(item.x)} · {fmtCm(item.y)} cm</p>
          <p class="meta">Drag to move — snaps to walls and other items.</p>
          <button class="danger" onclick={removeItem}>Delete item</button>
        {:else if wall}
          <h3>Wall</h3>
          <label>
            <span>Length (inner), cm</span>
            <input
              type="number"
              min={dims ? Math.ceil(dims.minInner * 10) / 10 : 1}
              step="1"
              value={dims ? Math.round(dims.inner * 10) / 10 : 1}
              onchange={(e) => applyLength(e.currentTarget.valueAsNumber)}>
          </label>
          <label>
            <span>Thickness, cm</span>
            <input
              type="number"
              min="1"
              max="100"
              step="1"
              value={wall.thickness}
              onchange={(e) => applyThickness(e.currentTarget.valueAsNumber)}>
          </label>
          {#if dims}
            <p class="meta">Outer span: {fmtCm(dims.outer)} cm</p>
          {/if}
          <p class="meta">
            Orientation: {fmtCm(angle)}°{angle === 0
							? ' · horizontal'
							: angle === 90
								? ' · vertical'
								: ''}
          </p>

          <h3>Windows ({wallWins.length})</h3>
          {#each wallWins as w, i (w.id)}
            <button
              class="win-row"
              onclick={() => {
                if (!wall) return;
                ui.select(wall.id);
                ui.selectWindow(w.id);
              }}
              title="Select this window">
              Window {i + 1} · {fmtCm(w.length)} cm @ {fmtCm(w.offset)}
            </button>
          {/each}
          <button onclick={addWindowToWall} disabled={!dims || dims.free < MIN_WINDOW_LENGTH}>Add window</button>

          <h3>Doors ({wallDoors.length})</h3>
          {#each wallDoors as d, i (d.id)}
            <button
              class="door-row"
              onclick={() => {
                if (!wall) return;
                ui.select(wall.id);
                ui.selectDoor(d.id);
              }}
              title="Select this door">
              Door {i + 1} · {fmtCm(d.length)} cm @ {fmtCm(d.offset)}
            </button>
          {/each}
          <button onclick={addDoorToWall} disabled={!dims || dims.free < MIN_DOOR_LENGTH}>Add door</button>

          <button class="danger" onclick={remove}>Delete wall</button>
        {:else if room}
          <h3>Room{plan.doc.roomNames[room.key] ? ` · ${plan.doc.roomNames[room.key]}` : ''}</h3>
          <label>
            <span>Name (optional)</span>
            <input
              type="text"
              placeholder="e.g. Bedroom"
              value={plan.doc.roomNames[room.key] ?? ''}
              onchange={(e) => applyRoomName(e.currentTarget.value)}>
          </label>
          <p class="meta">Area (clear floor): {fmtM2(room.innerAreaCm2)} m²</p>
          <p class="meta">{room.wallIds.length} walls · {fmtM2(room.areaCm2)} m² along centerlines</p>
          <p class="meta">Drag the m² label on the canvas to move this room.</p>
        {:else}
          <p class="meta">Select a wall, opening, item or room — or drag something in from the library below.</p>
        {/if}
      {/key}
    </div>
  </details>

  <details class="section" open>
    <summary>Library</summary>
    <div class="section-body">
      {#each CATALOG as cat (cat.id)}
        <h3>{cat.label}</h3>
        {#each cat.items as it (it.kind)}
          <button
            class="lib-item"
            onpointerdown={(e) => {
              e.preventDefault();
              ui.startLibraryDrag(it.kind, it.label);
            }}
            title="Drag onto a room">
            <span>{it.label}</span>
            <span class="dims">{it.w}×{it.d}</span>
          </button>
        {/each}
      {/each}
      <p class="meta">Drag an item into a room on the canvas.</p>
    </div>
  </details>
</aside>

<style>
.panel {
  width: 240px;
  flex-shrink: 0;
  border-left: 1px solid #e2e8f0;
  background: #ffffff;
  padding: 10px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}
.section {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 10px;
}
summary {
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  color: #334155;
  user-select: none;
  margin-bottom: 4px;
}
.section-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 6px;
}
h3 {
  margin: 0;
  font-size: 14px;
}
.lib-item {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 6px;
}
.lib-item .dims {
  color: #94a3b8;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
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
button {
  border: 1px solid #e2e8f0;
  background: #ffffff;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  cursor: pointer;
  color: #334155;
  text-align: left;
}
button:hover:not(:disabled) {
  background: #f1f5f9;
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
.danger {
  border-color: #fecaca;
  background: #fef2f2;
  color: #b91c1c;
}
.danger:hover:not(:disabled) {
  background: #fee2e2;
}
</style>
