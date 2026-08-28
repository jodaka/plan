<script lang="ts">
import { dist, fmtCm, fmtM2, wallAngleDeg } from '$lib/geometry';
import { CATALOG, catalogItem } from '$lib/items/registry';
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
import { m } from '$lib/paraglide/messages';
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

function itemLabel(kind: string): string {
  switch (kind) {
    case 'bed':
      return m.inspector__catalogBed();
    case 'double-bed':
      return m.inspector__catalogDoubleBed();
    case 'chair':
      return m.inspector__catalogChair();
    case 'sofa':
      return m.inspector__catalogSofa();
    case 'table':
      return m.inspector__catalogTable();
    case 'corner-table':
      return m.inspector__catalogCornerTable();
    case 'closet':
      return m.inspector__catalogCloset();
    default:
      return m.inspector__catalogFallback();
  }
}

function categoryLabel(id: string): string {
  if (id === 'bedroom') return m.inspector__catalogBedroom();
  if (id === 'living-room') return m.inspector__catalogLivingRoom();
  return itemLabel(id);
}

function applyLength(value: number) {
  if (!wall || !Number.isFinite(value)) return;
  const candidate = setInnerLength(plan.doc, wall.id, value);
  if (violatedOpeningFloors(candidate).length > 0) {
    ui.showError(m.inspector__wallLengthError({ min: fmtCm(dims?.minInner ?? MIN_WALL_LENGTH) }));
    return;
  }
  plan.commit(m.inspector__commitChangeWallLength(), candidate);
}

function applyThickness(value: number) {
  if (!wall || !Number.isFinite(value)) return;
  const candidate = setThickness(plan.doc, wall.id, value);
  // thinning pushes neighbor joints in, shortening THEIR spans too — check all
  if (violatedOpeningFloors(candidate).length > 0) {
    ui.showError(m.inspector__thicknessError());
    return;
  }
  plan.commit(m.inspector__commitChangeThickness(), candidate);
}

function addWindowToWall() {
  if (!wall) return;
  const res = addWindow(plan.doc, wall.id);
  if (!res.window) {
    ui.showError(m.inspector__windowSpaceError({ min: fmtCm(MIN_WINDOW_LENGTH) }));
    return;
  }
  plan.commit(m.inspector__commitAddWindow(), res.doc);
  ui.select(res.window.wallId);
  ui.selectWindow(res.window.id);
}

function addDoorToWall() {
  if (!wall) return;
  const res = addDoor(plan.doc, wall.id);
  if (!res.door) {
    ui.showError(m.inspector__doorSpaceError({ min: fmtCm(MIN_DOOR_LENGTH) }));
    return;
  }
  plan.commit(m.inspector__commitAddDoor(), res.doc);
  ui.select(res.door.wallId);
  ui.selectDoor(res.door.id);
}

function applyWindowLength(value: number) {
  if (!win || !Number.isFinite(value)) return;
  plan.commit(m.inspector__commitResizeWindow(), setWindowLength(plan.doc, win.id, value));
}

function applyDoorLength(value: number) {
  if (!door || !Number.isFinite(value)) return;
  plan.commit(m.inspector__commitResizeDoor(), setDoorLength(plan.doc, door.id, value));
}

function toggleDoorMode() {
  if (!door) return;
  plan.commit(m.inspector__commitChangeDoorSwing(), cycleDoorMode(plan.doc, door.id));
}

function removeDoor() {
  if (!door) return;
  plan.commit(m.inspector__commitDeleteDoor(), deleteDoor(plan.doc, door.id));
  ui.selectDoor(null); // falls back to the still-selected wall
}

function removeWindow() {
  if (!win) return;
  plan.commit(m.inspector__commitDeleteWindow(), deleteWindow(plan.doc, win.id));
  ui.selectWindow(null);
}

function applyItemSize(w: number, d: number) {
  if (!item || !Number.isFinite(w) || !Number.isFinite(d)) return;
  plan.commit(m.inspector__commitResizeItem({ label: itemLabel(item.kind) }), resizeItem(plan.doc, item.id, w, d));
}

function applyItemRotation(deg: number) {
  if (!item || !Number.isFinite(deg)) return;
  plan.commit(m.inspector__commitRotateItem({ label: itemLabel(item.kind) }), rotateItem(plan.doc, item.id, deg));
}

function removeItem() {
  if (!item) return;
  plan.commit(m.inspector__commitDeleteItem({ label: itemLabel(item.kind) }), removeRoomItem(plan.doc, item.id));
  ui.selectItem(null);
}

function applyRoomName(name: string) {
  if (!room) return;
  plan.commit(m.inspector__commitRenameRoom(), renameRoom(plan.doc, room.key, name));
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
  plan.commit(m.inspector__commitDeleteWall(), deleteWall(plan.doc, wall.id));
  ui.select(null);
}

function confirmMessage(roomCount: number, objectCount: number, winCount: number, doorCount: number): string {
  const parts: string[] = [];
  if (roomCount > 0) parts.push(m.inspector__wallDeleteRoom({ roomCount, objects: objectCount }));
  if (winCount > 0 || doorCount > 0)
    parts.push(m.inspector__wallDeleteOpenings({ windows: winCount, doors: doorCount }));
  return m.inspector__wallDeleteConfirm({ parts: parts.join(', ') });
}
</script>

<aside class="panel">
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
          <h3>{itemLabel(item.kind)}</h3>
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
                if (!wall) return;
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
                if (!wall) return;
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
        {#each cat.items as it (it.kind)}
          <button
            class="lib-item"
            onpointerdown={(e) => {
              e.preventDefault();
              ui.startLibraryDrag(it.kind, itemLabel(it.kind));
            }}
            title={m.inspector__libraryDragTitle()}>
            <span>{itemLabel(it.kind)}</span>
            <span class="dims">{it.w}×{it.d}</span>
          </button>
        {/each}
      {/each}
      <p class="meta">{m.inspector__libraryDragHint()}</p>
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
