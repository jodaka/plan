<script lang="ts">
import { dist, fmtCm, fmtM2, wallAngleDeg } from '$lib/geometry';
import ItemShapes from '$lib/components/ItemShapes.svelte';
import { CATALOG, catalogItem, catalogLabel, itemShapes } from '$lib/items/registry';
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
import { scene } from '$lib/canvas/scene.svelte';
import { roomObjectsIn } from '$lib/model/rooms';
import { m } from '$lib/paraglide/messages';
import { plan } from '$lib/stores/plan.svelte';
import { ui } from '$lib/stores/ui.svelte';
import { MIN_DOOR_LENGTH, MIN_WINDOW_LENGTH, type DoorMode } from '$lib/types';

const wall = $derived(ui.selectedWallId ? plan.doc.walls[ui.selectedWallId] : undefined);
const win = $derived(ui.selectedWindowId ? plan.doc.windows[ui.selectedWindowId] : undefined);
const door = $derived(ui.selectedDoorId ? plan.doc.doors[ui.selectedDoorId] : undefined);
const item = $derived(ui.selectedItemId ? plan.doc.roomObjects[ui.selectedItemId] : undefined);
const itemRound = $derived(item !== undefined && catalogItem(item.kind).resizeMode === 'fixed-aspect');
const room = $derived.by(() => {
  const key = ui.selectedRoomKey;
  if (!key) {
    return undefined;
  }
  return scene.rooms.find((r) => r.key === key);
});
const length = $derived(wall ? dist(plan.doc.joints[wall.startJointId], plan.doc.joints[wall.endJointId]) : 0);
const angle = $derived(wall ? wallAngleDeg(plan.doc.joints[wall.startJointId], plan.doc.joints[wall.endJointId]) : 0);

const dims = $derived.by(() => {
  if (!wall) {
    return null;
  }
  const halfNeighbor = (jid: string) => {
    let half = 0;
    for (const o of wallsAtJoint(plan.doc, jid)) {
      if (o.id !== wall.id) {
        half = Math.max(half, o.thickness);
      }
    }
    return half / 2;
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

function doorModeLabel(mode: DoorMode): string {
  switch (mode) {
    case 'tl':
      return m.inspector__doorModeTl();
    case 'tr':
      return m.inspector__doorModeTr();
    case 'br':
      return m.inspector__doorModeBr();
    case 'bl':
      return m.inspector__doorModeBl();
    case 'none':
      return m.inspector__doorModeNone();
  }
}

function categoryLabel(id: string): string {
  if (id === 'bedroom') {
    return m.inspector__catalogBedroom();
  }
  if (id === 'living-room') {
    return m.inspector__catalogLivingRoom();
  }
  return id;
}

function applyLength(value: number) {
  if (!wall || !Number.isFinite(value)) {
    return;
  }
  const candidate = setInnerLength(plan.doc, wall.id, value);
  if (violatedOpeningFloors(candidate).length > 0) {
    ui.showError(m.inspector__wallLengthError({ min: fmtCm(dims?.minInner ?? MIN_WALL_LENGTH) }));
    return;
  }
  plan.commit(m.history__changeWallLength(), candidate);
}

function applyThickness(value: number) {
  if (!wall || !Number.isFinite(value)) {
    return;
  }
  const candidate = setThickness(plan.doc, wall.id, value);
  // thinning pushes neighbor joints in, shortening THEIR spans too — check all
  if (violatedOpeningFloors(candidate).length > 0) {
    ui.showError(m.inspector__thicknessError());
    return;
  }
  plan.commit(m.history__changeThickness(), candidate);
}

function addWindowToWall() {
  if (!wall) {
    return;
  }
  const res = addWindow(plan.doc, wall.id);
  if (!res.window) {
    ui.showError(m.inspector__windowSpaceError({ min: fmtCm(MIN_WINDOW_LENGTH) }));
    return;
  }
  plan.commit(m.history__addWindow(), res.doc);
  ui.select(res.window.wallId);
  ui.selectWindow(res.window.id);
}

function addDoorToWall() {
  if (!wall) {
    return;
  }
  const res = addDoor(plan.doc, wall.id);
  if (!res.door) {
    ui.showError(m.inspector__doorSpaceError({ min: fmtCm(MIN_DOOR_LENGTH) }));
    return;
  }
  plan.commit(m.history__addDoor(), res.doc);
  ui.select(res.door.wallId);
  ui.selectDoor(res.door.id);
}

function applyWindowLength(value: number) {
  if (!win || !Number.isFinite(value)) {
    return;
  }
  plan.commit(m.history__resizeWindow(), setWindowLength(plan.doc, win.id, value));
}

function applyDoorLength(value: number) {
  if (!door || !Number.isFinite(value)) {
    return;
  }
  plan.commit(m.history__resizeDoor(), setDoorLength(plan.doc, door.id, value));
}

function toggleDoorMode() {
  if (!door) {
    return;
  }
  plan.commit(m.history__changeDoorSwing(), cycleDoorMode(plan.doc, door.id));
}

function removeDoor() {
  if (!door) {
    return;
  }
  plan.commit(m.history__deleteDoor(), deleteDoor(plan.doc, door.id));
  ui.selectDoor(null); // falls back to the still-selected wall
}

function removeWindow() {
  if (!win) {
    return;
  }
  plan.commit(m.history__deleteWindow(), deleteWindow(plan.doc, win.id));
  ui.selectWindow(null);
}

function applyItemSize(w: number, d: number) {
  if (!item || !Number.isFinite(w) || !Number.isFinite(d)) {
    return;
  }
  plan.commit(m.history__resizeItem({ label: catalogLabel(item.kind) }), resizeItem(plan.doc, item.id, w, d));
}

function applyItemRotation(deg: number) {
  if (!item || !Number.isFinite(deg)) {
    return;
  }
  plan.commit(m.history__rotateItem({ label: catalogLabel(item.kind) }), rotateItem(plan.doc, item.id, deg));
}

function removeItem() {
  if (!item) {
    return;
  }
  plan.commit(m.history__deleteItem({ label: catalogLabel(item.kind) }), removeRoomItem(plan.doc, item.id));
  ui.selectItem(null);
}

function applyRoomName(name: string) {
  if (!room) {
    return;
  }
  plan.commit(m.history__renameRoom(), renameRoom(plan.doc, room.key, name));
}

function remove() {
  if (!wall) {
    return;
  }
  // destroying a room orphans its bound entities (furniture, …) — warn before
  // the fact; windows/doors die WITH their wall by design
  const rooms = scene.rooms.filter((r) => r.wallIds.includes(wall.id));
  const objects = rooms.reduce((n, r) => n + Object.keys(roomObjectsIn(plan.doc, r.key)).length, 0);
  if (
    (rooms.length > 0 || wallWins.length > 0 || wallDoors.length > 0) &&
    !confirm(confirmMessage(rooms.length, objects, wallWins.length, wallDoors.length))
  ) {
    return;
  }
  plan.commit(m.history__deleteWall(), deleteWall(plan.doc, wall.id));
  ui.select(null);
}

function confirmMessage(roomCount: number, objectCount: number, winCount: number, doorCount: number): string {
  const parts: string[] = [];
  if (roomCount > 0) {
    parts.push(m.inspector__wallDeleteRoom({ roomCount, objects: objectCount }));
  }
  if (winCount > 0 || doorCount > 0) {
    parts.push(m.inspector__wallDeleteOpenings({ windows: winCount, doors: doorCount }));
  }
  return m.inspector__wallDeleteConfirm({ parts: parts.join(', ') });
}

const PANEL_MIN_WIDTH = 200;
const PANEL_MAX_WIDTH = 560;
const PANEL_DEFAULT_WIDTH = 260;

let panelWidth = $state(PANEL_DEFAULT_WIDTH);
let panelResizing = $state(false);

function startPanelResize(e: PointerEvent) {
  e.preventDefault();
  (e.currentTarget as Element).setPointerCapture(e.pointerId);
  panelResizing = true;
}

function movePanelResize(e: PointerEvent) {
  if (!panelResizing) {
    return;
  }
  panelWidth = Math.round(Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, window.innerWidth - e.clientX)));
}

function endPanelResize(e: PointerEvent) {
  if (!panelResizing) {
    return;
  }
  panelResizing = false;
  (e.currentTarget as Element).releasePointerCapture(e.pointerId);
}

// lock page cursor/selection for the duration of the drag, clean up on unmount
$effect(() => {
  if (!panelResizing) {
    return;
  }
  document.body.classList.add('panel-resizing');
  return () => document.body.classList.remove('panel-resizing');
});

function handleResizeKey(e: KeyboardEvent) {
  const dir = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0;
  if (dir === 0) {
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  const step = e.shiftKey ? 64 : 16;
  panelWidth = Math.round(Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, panelWidth + dir * step)));
}
</script>

<aside class="panel" style:width="{panelWidth}px" class:resizing={panelResizing}>
  <div
    class="resize-handle"
    role="slider"
    tabindex="0"
    aria-orientation="vertical"
    aria-label={m.inspector__resizeTitle()}
    aria-valuemin={PANEL_MIN_WIDTH}
    aria-valuemax={PANEL_MAX_WIDTH}
    aria-valuenow={panelWidth}
    title={m.inspector__resizeTitle()}
    onpointerdown={startPanelResize}
    onpointermove={movePanelResize}
    onpointerup={endPanelResize}
    onpointercancel={endPanelResize}
    ondblclick={() => (panelWidth = PANEL_DEFAULT_WIDTH)}
    onkeydown={handleResizeKey}></div>
  <div class="panel-scroll">
    <details class="section" open>
      <summary>{m.inspector__summary()}</summary>
      <div class="section-body">
        {#key win?.id ?? door?.id ?? item?.id ?? wall?.id ?? room?.key ?? 'none'}
          {#if win}
            <h3>{m.inspector__windowHeader()}</h3>
            <label>
              <span>{m.inspector__lengthCm()}</span>
              <input
                type="number"
                min={MIN_WINDOW_LENGTH}
                step="1"
                value={Math.round(win.length * 10) / 10}
                onchange={(e) => applyWindowLength(e.currentTarget.valueAsNumber)}>
            </label>
            <p class="meta">{m.inspector__windowPosition({ pos: fmtCm(win.offset) })}</p>
            <p class="meta">{m.inspector__resizeDragHint()}</p>
            <button class="danger" onclick={removeWindow}>{m.inspector__deleteWindowButton()}</button>
          {:else if door}
            <h3>{m.inspector__doorHeader()}</h3>
            <label>
              <span>{m.inspector__lengthCm()}</span>
              <input
                type="number"
                min={MIN_DOOR_LENGTH}
                step="1"
                value={Math.round(door.length * 10) / 10}
                onchange={(e) => applyDoorLength(e.currentTarget.valueAsNumber)}>
            </label>
            <button onclick={toggleDoorMode} title={m.inspector__swingTitle()}>
              {m.inspector__swingLabel({ mode: doorModeLabel(door.mode) })}
            </button>
            <p class="meta">{m.inspector__doorPosition({ pos: fmtCm(door.offset) })}</p>
            <p class="meta">{m.inspector__resizeDragHint()}</p>
            <button class="danger" onclick={removeDoor}>{m.inspector__deleteDoorButton()}</button>
          {:else if item}
            <h3>{catalogLabel(item.kind)}</h3>
            {#if itemRound}
              <label>
                <span>{m.inspector__diameterCm()}</span>
                <input
                  type="number"
                  min={catalogItem(item.kind).minW}
                  step="1"
                  value={Math.round(item.w * 10) / 10}
                  onchange={(e) => applyItemSize(e.currentTarget.valueAsNumber, e.currentTarget.valueAsNumber)}>
              </label>
            {:else}
              <label>
                <span>{m.inspector__widthCm()}</span>
                <input
                  type="number"
                  min={catalogItem(item.kind).minW}
                  step="1"
                  value={Math.round(item.w * 10) / 10}
                  onchange={(e) => applyItemSize(e.currentTarget.valueAsNumber, item.d)}>
              </label>
              <label>
                <span>{m.inspector__depthCm()}</span>
                <input
                  type="number"
                  min={catalogItem(item.kind).minD}
                  step="1"
                  value={Math.round(item.d * 10) / 10}
                  onchange={(e) => applyItemSize(item.w, e.currentTarget.valueAsNumber)}>
              </label>
            {/if}
            <label>
              <span>{m.inspector__rotationDeg()}</span>
              <input
                type="number"
                min="0"
                max="360"
                step="15"
                value={Math.round(item.rotation)}
                onchange={(e) => applyItemRotation(e.currentTarget.valueAsNumber)}>
            </label>
            <p class="meta">{m.inspector__itemPosition({ x: fmtCm(item.x), y: fmtCm(item.y) })}</p>
            <p class="meta">{m.inspector__itemMoveHint()}</p>
            <button class="danger" onclick={removeItem}>{m.inspector__deleteItemButton()}</button>
          {:else if wall}
            <h3>{m.inspector__wallHeader()}</h3>
            <label>
              <span>{m.inspector__wallLengthLabel()}</span>
              <input
                type="number"
                min={dims ? Math.ceil(dims.minInner * 10) / 10 : 1}
                step="1"
                value={dims ? Math.round(dims.inner * 10) / 10 : 1}
                onchange={(e) => applyLength(e.currentTarget.valueAsNumber)}>
            </label>
            <label>
              <span>{m.inspector__thicknessCm()}</span>
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                value={wall.thickness}
                onchange={(e) => applyThickness(e.currentTarget.valueAsNumber)}>
            </label>
            {#if dims}
              <p class="meta">{m.inspector__outerSpan({ span: fmtCm(dims.outer) })}</p>
            {/if}
            <p class="meta">
              {m.inspector__orientation({ angle: fmtCm(angle) })}
              {angle === 0 ? m.inspector__orientationHorizontal() : angle === 90 ? m.inspector__orientationVertical() : ''}
            </p>

            <h3>{m.inspector__windowsHeader({ count: wallWins.length })}</h3>
            {#each wallWins as w, i (w.id)}
              <button
                class="win-row"
                onclick={() => {
                  if (!wall) {
                    return;
                  }
                  ui.select(wall.id);
                  ui.selectWindow(w.id);
                }}
                title={m.inspector__selectWindowTitle()}>
                {m.inspector__windowRow({ n: i + 1, len: fmtCm(w.length), offset: fmtCm(w.offset) })}
              </button>
            {/each}
            <button onclick={addWindowToWall} disabled={!dims || dims.free < MIN_WINDOW_LENGTH}>
              {m.inspector__addWindowButton()}
            </button>

            <h3>{m.inspector__doorsHeader({ count: wallDoors.length })}</h3>
            {#each wallDoors as d, i (d.id)}
              <button
                class="door-row"
                onclick={() => {
                  if (!wall) {
                    return;
                  }
                  ui.select(wall.id);
                  ui.selectDoor(d.id);
                }}
                title={m.inspector__selectDoorTitle()}>
                {m.inspector__doorRow({ n: i + 1, len: fmtCm(d.length), offset: fmtCm(d.offset) })}
              </button>
            {/each}
            <button onclick={addDoorToWall} disabled={!dims || dims.free < MIN_DOOR_LENGTH}>
              {m.inspector__addDoorButton()}
            </button>

            <button class="danger" onclick={remove}>{m.inspector__deleteWallButton()}</button>
          {:else if room}
            <h3>
              {plan.doc.roomNames[room.key] ? m.inspector__roomHeaderNamed({ name: plan.doc.roomNames[room.key] }) : m.inspector__roomHeader()}
            </h3>
            <label>
              <span>{m.inspector__roomNameLabel()}</span>
              <input
                type="text"
                placeholder={m.inspector__roomNamePlaceholder()}
                value={plan.doc.roomNames[room.key] ?? ''}
                onchange={(e) => applyRoomName(e.currentTarget.value)}>
            </label>
            <p class="meta">{m.inspector__roomArea({ area: fmtM2(room.innerAreaCm2) })}</p>
            <p class="meta">{m.inspector__roomWallsArea({ walls: room.wallIds.length, area: fmtM2(room.areaCm2) })}</p>
            <p class="meta">{m.inspector__roomDragHint()}</p>
          {:else}
            <p class="meta">{m.inspector__emptyHint()}</p>
          {/if}
        {/key}
      </div>
    </details>

    <details class="section" open>
      <summary>{m.inspector__librarySummary()}</summary>
      <div class="section-body">
        {#each CATALOG as cat (cat.id)}
          <h3>{categoryLabel(cat.id)}</h3>
          <div class="lib-grid">
            {#each cat.items as it (it.kind)}
              {@const max = Math.max(it.w, it.d)}
              {@const previewScale = 52 / max}
              <button
                class="lib-item"
                aria-label={catalogLabel(it.kind)}
                onpointerdown={(e) => {
                e.preventDefault();
                ui.startLibraryDrag(it.kind, catalogLabel(it.kind));
              }}
                title={m.inspector__libraryDragTitle()}>
                <svg
                  viewBox={`${-it.w / 2} ${-it.d / 2} ${it.w} ${it.d}`}
                  width={Math.round((it.w / max) * 52)}
                  height={Math.round((it.d / max) * 52)}>
                  <ItemShapes shapes={itemShapes(it.kind, it.w, it.d, previewScale)} scale={previewScale} />
                </svg>
              </button>
            {/each}
          </div>
        {/each}
        <p class="meta">{m.inspector__libraryDragHint()}</p>
      </div>
    </details>
  </div>
</aside>

<style>
.panel {
  position: relative;
  width: 260px;
  min-width: 200px;
  max-width: calc(100vw - 320px);
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  background: var(--surface);
  display: flex;
  flex-direction: column;
}
.panel-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 24px;
}
.panel-scroll::-webkit-scrollbar {
  width: 4px;
}
.panel-scroll::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 2px;
}
.resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -4px;
  width: 9px;
  cursor: col-resize;
  touch-action: none;
  z-index: 30;
  outline: none;
}
.resize-handle::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 4px;
  width: 2px;
  background: transparent;
}
.resize-handle:hover::after,
.resize-handle:focus-visible::after,
.panel.resizing .resize-handle::after {
  background: var(--accent);
}
:global(body.panel-resizing) {
  cursor: col-resize;
  user-select: none;
}
.section {
  border: none;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  padding: 0;
}
summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
  list-style: none;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  transition: background 0.1s;
}
summary::-webkit-details-marker {
  display: none;
}
summary:hover {
  background: var(--hover);
}
summary::after {
  content: "";
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-right: 1.5px solid var(--muted);
  border-bottom: 1.5px solid var(--muted);
  transform: rotate(-90deg);
  transition: transform 0.2s ease;
}
details[open] > summary::after {
  transform: rotate(45deg);
}
.section-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 2px 14px 14px;
}
h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--fg);
}
.lib-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}
.lib-item {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 5px;
  background: transparent;
  border-radius: var(--radius-md);
}
.lib-item:hover:not(:disabled) {
  background: var(--hover);
}
.lib-item:active {
  background: var(--accent-soft);
}
.lib-item svg {
  display: block;
  pointer-events: none;
}
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--muted);
}
input {
  width: 100%;
  padding: 6px 0;
  border: none;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--fg);
  outline: none;
  transition: border-color 0.15s;
}
input:focus {
  outline: none;
  border-bottom-color: var(--accent);
}
input::placeholder {
  color: oklch(70% 0.01 250);
}
.meta {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
  line-height: 1.5;
}
button {
  display: inline-flex;
  align-items: center;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--surface-alt);
  padding: 5px 10px;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--fg);
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease;
}
button:hover:not(:disabled) {
  background: var(--hover);
}
button:disabled {
  opacity: 0.4;
  cursor: default;
}
.danger {
  background: var(--danger-soft);
  color: var(--danger);
  align-self: flex-start;
}
.danger:hover:not(:disabled) {
  background: var(--danger-hover);
}
.win-row,
.door-row {
  background: transparent;
  font-family: ui-monospace, "SF Mono", monospace;
  font-variant-numeric: tabular-nums;
}
</style>
