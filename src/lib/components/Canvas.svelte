<script lang="ts">
import AngleArcs from '$lib/components/AngleArcs.svelte';
import DoorView from '$lib/components/DoorView.svelte';
import FurnitureView from '$lib/components/FurnitureView.svelte';
import GapHints from '$lib/components/GapHints.svelte';
import RoomView from '$lib/components/RoomView.svelte';
import WallDims from '$lib/components/WallDims.svelte';
import WallView from '$lib/components/WallView.svelte';
import WindowView from '$lib/components/WindowView.svelte';
import { drawWall } from '$lib/canvas/drawWall.svelte';
import { itemDragGesture } from '$lib/canvas/itemDrag.svelte';
import { jointDrag } from '$lib/canvas/jointDrag.svelte';
import { libraryDrop } from '$lib/canvas/libraryDrop.svelte';
import { openingDrag } from '$lib/canvas/openingDrag.svelte';
import { roomDragGesture } from '$lib/canvas/roomDrag.svelte';
import { ruler } from '$lib/canvas/ruler.svelte';
import { scene } from '$lib/canvas/scene.svelte';
import { catalogItem } from '$lib/items/registry';
import { dist, fmtCm, polygonContainsPoint } from '$lib/geometry';
import { docBBox } from '$lib/model/ops';
import { m } from '$lib/paraglide/messages';
import { plan } from '$lib/stores/plan.svelte';
import { ui } from '$lib/stores/ui.svelte';
import { viewport } from '$lib/stores/viewport.svelte';
import { DEFAULT_THICKNESS } from '$lib/types';

const ZOOM_WHEEL_SENSITIVITY = 0.0015;
const ZOOM_PINCH_SENSITIVITY = 0.01;

let svgEl: SVGSVGElement | undefined = $state();
let wrapW = $state(0);
let wrapH = $state(0);

// pan gesture: rendering only cares about the cursor class
let spaceHeld = $state(false);
let panning = $state(false);
let panLast: { x: number; y: number } | null = null;

let fitted = false;

// reset an active wall chain / clear rulers whenever the tool changes
$effect(() => {
  if (ui.tool !== 'draw') {
    drawWall.end();
  }
  if (ui.tool !== 'ruler') {
    ruler.clear();
  }
});

$effect(() => {
  viewport.setViewSize(wrapW, wrapH);
  if (!fitted && wrapW > 0 && wrapH > 0) {
    fitted = true;
    viewport.fit(docBBox(plan.doc));
  }
});

// Wheel zoom is queued and applied once per animation frame: trackpads and
// high-frequency mice fire several wheel events between frames, and each
// immediate application would trigger a full Svelte flush + SVG style/layout
// pass. Draining the queue inside one rAF keeps the math identical (each
// event still zooms around its own cursor position, in arrival order) while
// capping the DOM work at one update per frame (see ai/decisions.md §6).
let wheelQueue: { x: number; y: number; factor: number }[] = [];
let wheelFrame: number | null = null;

function applyQueuedZoom() {
  wheelFrame = null;
  if (wheelQueue.length === 0 || !svgEl) {
    wheelQueue = [];
    return;
  }
  const r = svgEl.getBoundingClientRect();
  for (const { x, y, factor } of wheelQueue) {
    viewport.zoomAt(x - r.left, y - r.top, factor);
  }
  wheelQueue = [];
}

// wheel deltas arrive in different units per browser/device: pixels (trackpads,
// Chromium mice), LINES (Firefox physical mouse wheels, deltaMode 1 — ~3 per
// tick) or pages (deltaMode 2, rare). Normalize to pixels first, otherwise FF
// mice zoom by ~0.5% per tick and the wheel feels broken/laggy.
function wheelDeltaPx(e: WheelEvent): number {
  const lineHeight = 16;
  if (e.deltaMode === 1) {
    return e.deltaY * lineHeight;
  }
  if (e.deltaMode === 2) {
    return e.deltaY * lineHeight * 20;
  }
  return e.deltaY;
}

// wheel must be a non-passive listener for preventDefault to work
$effect(() => {
  const el = svgEl;
  if (!el) {
    return;
  }
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = Math.exp(-wheelDeltaPx(e) * (e.ctrlKey ? ZOOM_PINCH_SENSITIVITY : ZOOM_WHEEL_SENSITIVITY));
    wheelQueue.push({ x: e.clientX, y: e.clientY, factor });
    if (wheelFrame === null) {
      wheelFrame = requestAnimationFrame(applyQueuedZoom);
    }
  };
  el.addEventListener('wheel', onWheel, { passive: false });
  return () => {
    el.removeEventListener('wheel', onWheel);
    if (wheelFrame !== null) {
      cancelAnimationFrame(wheelFrame);
      wheelFrame = null;
    }
    wheelQueue = [];
  };
});

function localPt(e: PointerEvent): { x: number; y: number } {
  if (!svgEl) {
    return { x: 0, y: 0 };
  }
  const r = svgEl.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

// library drag: a catalog kind is being carried from the panel over the
// canvas; the gesture started on a panel element, so window-level listeners
// carry it — the canvas handlers never see it
$effect(() => {
  const drag = ui.libraryDrag;
  if (!drag) {
    return;
  }
  const cat = catalogItem(drag.kind);
  const onMove = (e: PointerEvent) => {
    if (!svgEl) {
      return;
    }
    const lp = localPt(e);
    const world = viewport.toWorld(lp.x, lp.y);
    const { valid } = libraryDrop.dropInfo(drag.kind, world);
    libraryDrop.setGhost({
      sx: lp.x,
      sy: lp.y,
      w: cat.w,
      d: cat.d,
      overRoom: valid || !!scene.rooms.find((r) => polygonContainsPoint(r.pts, world)),
      valid,
    });
  };
  const onUp = (e: PointerEvent) => {
    const info = ui.libraryDrag;
    ui.cancelLibraryDrag();
    libraryDrop.setGhost(null);
    if (!info || !svgEl) {
      return;
    }
    const rect = svgEl.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      return;
    }
    const worldRaw = viewport.toWorld(e.clientX - rect.left, e.clientY - rect.top);
    const world = ui.snapEnabled ? { x: Math.round(worldRaw.x), y: Math.round(worldRaw.y) } : worldRaw;
    const { room, valid } = libraryDrop.dropInfo(info.kind, world);
    if (!room) {
      libraryDrop.showOutsideRoomError();
      return;
    }
    if (!valid) {
      libraryDrop.showInvalidError(info.label);
      return;
    }
    libraryDrop.place(info.kind, info.label, room, world);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      ui.cancelLibraryDrag();
      libraryDrop.setGhost(null);
    }
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);
  return () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey);
  };
});

function onPointerDown(e: PointerEvent) {
  if (!svgEl || (panning && spaceHeld)) {
    return;
  }
  try {
    svgEl.setPointerCapture(e.pointerId);
  } catch {
    // no active pointer with this id (e.g. synthetic events) — safe to ignore
  }
  const lp = localPt(e);
  const world = viewport.toWorld(lp.x, lp.y);

  if (spaceHeld || e.button === 1) {
    panning = true;
    panLast = lp;
    return;
  }
  if (e.button !== 0) {
    return;
  }

  const target = e.target as Element;
  const jointHit = target.closest('[data-joint-id]')?.getAttribute('data-joint-id') ?? null;
  const wallHit = target.closest('[data-wall-id]')?.getAttribute('data-wall-id') ?? null;
  const winId = target.closest('[data-window-id]')?.getAttribute('data-window-id') ?? null;
  const winHandleSide =
    winId && target.closest('[data-window-handle]')?.getAttribute('data-window-handle') === 'end'
      ? ('end' as const)
      : ('start' as const);
  const doorId = target.closest('[data-door-id]')?.getAttribute('data-door-id') ?? null;
  const doorHandleSide =
    doorId && target.closest('[data-door-handle]')?.getAttribute('data-door-handle') === 'end'
      ? ('end' as const)
      : ('start' as const);
  const roomKeyHit = target.closest('[data-room-key]')?.getAttribute('data-room-key') ?? null;
  const itemId = target.closest('[data-item-id]')?.getAttribute('data-item-id') ?? null;
  const itemHandle = itemId ? (target.closest('[data-item-handle]')?.getAttribute('data-item-handle') ?? null) : null;

  if (ui.tool === 'draw') {
    drawWall.pointerDown(world);
    return;
  }
  if (ui.tool === 'ruler') {
    ruler.pointerDown(world);
    return;
  }

  if (jointHit && plan.doc.joints[jointHit]) {
    jointDrag.start(jointHit);
    return;
  }
  if (itemId && plan.doc.roomObjects[itemId]) {
    // items render above walls/openings, so they get priority here
    if (itemHandle === 'rotate') {
      itemDragGesture.startRotate(itemId);
    } else if (itemHandle?.startsWith('resize:')) {
      itemDragGesture.startResize(itemId, Number(itemHandle.split(':')[1]));
    } else {
      itemDragGesture.startMove(itemId, world);
    }
    return;
  }
  if (doorId && plan.doc.doors[doorId]) {
    // doors beat windows and wall hit-lines: they render above both
    if (target.closest('[data-door-handle]')) {
      openingDrag.startResize('door', doorId, doorHandleSide, world);
    } else {
      openingDrag.startSlide('door', doorId, world);
    }
    return;
  }
  if (winId && plan.doc.windows[winId]) {
    // windows beat wall hit-lines: they render above the wall body
    if (target.closest('[data-window-handle]')) {
      openingDrag.startResize('window', winId, winHandleSide, world);
    } else {
      openingDrag.startSlide('window', winId, world);
    }
    return;
  }
  if (roomKeyHit) {
    // the m² label doubles as the room's drag handle (rooms layer sits below
    // walls/openings, so those keep priority on shared pixels)
    const room = scene.rooms.find((r) => r.key === roomKeyHit);
    if (room) {
      roomDragGesture.start(room, world);
    }
    return;
  }
  if (wallHit && plan.doc.walls[wallHit]) {
    // walls are selected but not translatable: moving a whole wall would
    // silently change connected walls' lengths and angles (see decisions §7)
    ui.select(wallHit);
    return;
  }
  // empty space: selecting a room when the click lands inside one, else deselect
  const room = scene.rooms.find((r) => polygonContainsPoint(r.pts, world));
  ui.selectRoom(room ? room.key : null);
  drawWall.end();
}

function onPointerMove(e: PointerEvent) {
  const lp = localPt(e);

  if (panning && panLast) {
    viewport.panBy(lp.x - panLast.x, lp.y - panLast.y);
    panLast = lp;
    return;
  }
  const world = viewport.toWorld(lp.x, lp.y);
  if (openingDrag.active) {
    openingDrag.apply(world);
    return;
  }
  if (roomDragGesture.active) {
    roomDragGesture.apply(world);
    return;
  }
  if (itemDragGesture.active) {
    itemDragGesture.apply(world);
    return;
  }
  if (jointDrag.active) {
    jointDrag.apply(world);
    return;
  }
  drawWall.move(world);
  ruler.move(world);
}

function onPointerUp(e: PointerEvent) {
  try {
    svgEl?.releasePointerCapture?.(e.pointerId);
  } catch {
    // pointer not captured — nothing to release
  }
  panning = false;
  panLast = null;

  if (openingDrag.active) {
    openingDrag.commit();
    return;
  }
  if (roomDragGesture.active) {
    roomDragGesture.commit();
    return;
  }
  if (itemDragGesture.active) {
    itemDragGesture.commit();
    return;
  }
  if (jointDrag.active) {
    jointDrag.commit();
  }
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault();
  drawWall.end();
}

function onKeyDown(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
    return;
  }
  if (e.code === 'Space') {
    e.preventDefault();
    spaceHeld = true;
  } else if (e.key === 'Escape') {
    drawWall.end();
    ruler.clear();
    openingDrag.cancel();
    roomDragGesture.cancel();
    itemDragGesture.cancel();
    jointDrag.cancel();
    ui.cancelLibraryDrag();
    libraryDrop.setGhost(null);
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') {
    spaceHeld = false;
  }
}

const cursorClass = $derived.by(() => {
  if (panning) {
    return 'cursor-grabbing';
  }
  if (spaceHeld) {
    return 'cursor-grab';
  }
  if (ui.tool === 'draw' || ui.tool === 'ruler') {
    return 'cursor-crosshair';
  }
  return '';
});
</script>
<svelte:window onkeydown={onKeyDown} onkeyup={onKeyUp} />

<div class="canvas-wrap" bind:clientWidth={wrapW} bind:clientHeight={wrapH}>
  <svg
    bind:this={svgEl}
    class="canvas {cursorClass}"
    role="application"
    aria-label="Floor plan canvas"
    width={wrapW}
    height={wrapH}
    style="--inv: {1 / viewport.scale}"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    oncontextmenu={onContextMenu}>
    <g transform="translate({viewport.tx} {viewport.ty}) scale({viewport.scale})">
      <!-- Grid as ONE pattern-filled rect: the tile is the cell's square
           outline, so adjacent tiles complete each other's edge strokes and
           lines land on exact world multiples of `step` at full width. No
           per-line DOM nodes — pan/zoom updates 2 elements, never churns
           hundreds of keyed <line>s (see ai/decisions.md §22). -->
      {#if scene.grid}
        <defs>
          <pattern id="fp-grid" width={scene.grid.step} height={scene.grid.step} patternUnits="userSpaceOnUse">
            <path
              d="M 0 0 H {scene.grid.step} V {scene.grid.step} H 0 Z"
              fill="none"
              stroke="#e2e8f0"
              style="stroke-width: calc(1px * var(--inv));" />
          </pattern>
        </defs>
        <rect
          x={scene.grid.r.x}
          y={scene.grid.r.y}
          width={scene.grid.r.w}
          height={scene.grid.r.h}
          fill="url(#fp-grid)"
          pointer-events="none" />
      {/if}

      {#each scene.rooms as room, i (i)}
        <!-- label = clear-floor (inner) area: the usable m² inside the walls;
             it doubles as the room's drag handle -->
        <RoomView pts={room.pts} areaCm2={room.innerAreaCm2} roomKey={room.key} />
      {/each}

      {#each Object.values(plan.doc.walls) as wall (wall.id)}
        <WallView
          {wall}
          joints={scene.renderJoints}
          neighbors={scene.wallEndNeighbors[wall.id] ?? { start: null, end: null }} />
      {/each}

      <!-- windows sit on their walls; painted after ALL walls so a neighbor
           polygon can never cover an opening -->
      {#each scene.renderWindows as wv (wv.id)}
        <WindowView
          id={wv.id}
          a={wv.a}
          b={wv.b}
          thickness={wv.t}
          offset={wv.offset}
          length={wv.length}
          scale={viewport.scale}
          selected={wv.id === ui.selectedWindowId} />
      {/each}

      <!-- doors likewise; painted above windows so their hit areas win where
           openings would overlap -->
      {#each scene.renderDoors as dv (dv.id)}
        <DoorView
          id={dv.id}
          a={dv.a}
          b={dv.b}
          thickness={dv.t}
          offset={dv.offset}
          length={dv.length}
          mode={dv.mode}
          scale={viewport.scale}
          selected={dv.id === ui.selectedDoorId} />
      {/each}

      <!-- room items live inside rooms; painted above walls/openings -->
      {#each scene.renderItems as iv (iv.obj.id)}
        <FurnitureView
          id={iv.obj.id}
          kind={iv.obj.kind}
          x={iv.obj.x}
          y={iv.obj.y}
          w={iv.obj.w}
          d={iv.obj.d}
          rotation={iv.obj.rotation}
          selected={iv.obj.id === ui.selectedItemId}
          overlapping={iv.overlapping}
          invalid={iv.invalid}
          orphan={iv.orphan} />
      {/each}

      <!-- joint dots: make connection points visible for closing chains -->
      {#each Object.values(scene.renderJoints) as j (j.id)}
        <circle class="joint-dot" cx={j.x} cy={j.y} style="r: calc(3px * var(--inv));" />
      {/each}

      {#each scene.highlights as h (h.id)}
        {@const pts = h.corners.map((p) => `${p.x},${p.y}`).join(' ')}
        <polygon
          class="sel-overlay"
          points={pts}
          fill="#3b82f6"
          stroke="#3b82f6"
          style="stroke-width: calc(6px * var(--inv));"
          opacity="0.35" />
        <polygon class="sel-overlay" points={pts} fill="#2563eb" />
        <WallDims {...h.dims} />
      {/each}
      <AngleArcs arcs={scene.selArcs} scale={viewport.scale} />

      <!-- gap hints for the selected opening (window or door): distance to
           the nearest neighbor edge (or wall end) on each side -->
      {#if scene.selectedOpeningHints}
        <GapHints
          a={scene.selectedOpeningHints.open.a}
          b={scene.selectedOpeningHints.open.b}
          thickness={scene.selectedOpeningHints.open.t}
          scale={viewport.scale}
          {...scene.selectedOpeningHints.bounds}
          flip={scene.selectedOpeningHints.flip} />
      {/if}

      <!-- endpoint handles for the selected wall, above everything -->
      {#each scene.handleJoints as j (j.id)}
        <circle
          class="handle"
          data-joint-id={j.id}
          cx={j.x}
          cy={j.y}
          style="r: calc(6px * var(--inv)); stroke-width: calc(2px * var(--inv));" />
      {/each}

      <!-- opening resize handles: topmost so wall handles can't steal their clicks -->
      {#each scene.selectedWindowHandles as hp (hp.side)}
        <circle
          class="handle win-handle"
          data-window-id={hp.winId}
          data-window-handle={hp.side}
          cx={hp.p.x}
          cy={hp.p.y}
          style="r: calc(6px * var(--inv)); stroke-width: calc(2px * var(--inv));" />
      {/each}
      {#each scene.selectedDoorHandles as hp (hp.side)}
        <circle
          class="handle door-handle"
          data-door-id={hp.doorId}
          data-door-handle={hp.side}
          cx={hp.p.x}
          cy={hp.p.y}
          style="r: calc(6px * var(--inv)); stroke-width: calc(2px * var(--inv));" />
      {/each}

      <!-- item handles: topmost — 4 resize corners + rotation lollipop -->
      {#each scene.itemHandles as hp (hp.corner)}
        <circle
          class="handle item-handle"
          data-item-id={hp.id}
          data-item-handle={`resize:${hp.corner}`}
          cx={hp.p.x}
          cy={hp.p.y}
          style="r: calc(5px * var(--inv)); stroke-width: calc(2px * var(--inv));" />
      {/each}
      {#if scene.rotateHandle}
        <line
          class="rot-stem"
          x1={scene.rotateHandle.from.x}
          y1={scene.rotateHandle.from.y}
          x2={scene.rotateHandle.p.x}
          y2={scene.rotateHandle.p.y}
          style="stroke-width: calc(1px * var(--inv));" />
        <circle
          class="handle item-rotate-handle"
          data-item-id={scene.rotateHandle.id}
          data-item-handle="rotate"
          cx={scene.rotateHandle.p.x}
          cy={scene.rotateHandle.p.y}
          style="r: calc(5px * var(--inv)); stroke-width: calc(2px * var(--inv));" />
      {/if}

      <!-- rulers: UI-only measurements, always above the plan -->
      {#each ruler.rulers as r, i (i)}
        <g class="ruler" pointer-events="none">
          <line
            x1={r.a.x}
            y1={r.a.y}
            x2={r.b.x}
            y2={r.b.y}
            stroke="#7c3aed"
            style="stroke-width: calc(2px * var(--inv));" />
          <circle cx={r.a.x} cy={r.a.y} style="r: calc(3px * var(--inv));" fill="#7c3aed" />
          <circle cx={r.b.x} cy={r.b.y} style="r: calc(3px * var(--inv));" fill="#7c3aed" />
        </g>
      {/each}

      {#if ruler.preview}
        <line
          x1={ruler.preview.a.x}
          y1={ruler.preview.a.y}
          x2={ruler.preview.b.x}
          y2={ruler.preview.b.y}
          stroke="#7c3aed"
          style="stroke-width: calc(2px * var(--inv)); stroke-dasharray: calc(10px * var(--inv)) calc(8px * var(--inv));"
          opacity="0.65" />
      {/if}

      {#if drawWall.active && drawWall.anchor && drawWall.previewEnd}
        <line
          x1={drawWall.anchor.x}
          y1={drawWall.anchor.y}
          x2={drawWall.previewEnd.p.x}
          y2={drawWall.previewEnd.p.y}
          stroke="#64748b"
          stroke-width={DEFAULT_THICKNESS}
          style="stroke-dasharray: calc(10px * var(--inv)) calc(8px * var(--inv));"
          opacity="0.65" />
        {#if drawWall.previewEnd.attach}
          <circle
            cx={drawWall.previewEnd.p.x}
            cy={drawWall.previewEnd.p.y}
            style="r: calc(9px * var(--inv)); stroke-width: calc(2px * var(--inv));"
            fill="none"
            stroke="#16a34a" />
        {/if}
      {/if}
    </g>
  </svg>

  <div class="overlay" aria-hidden="true">
    {#each ruler.rulers as r, i (i)}
      {@const mid = viewport.toScreen((r.a.x + r.b.x) / 2, (r.a.y + r.b.y) / 2)}
      <span class="ruler-label" style:left="{mid.x}px" style:top="{mid.y - 14}px"> {fmtCm(dist(r.a, r.b))} cm </span>
    {/each}
    {#if ruler.preview}
      <span class="ruler-label" style:left="{ruler.preview.label.x}px" style:top="{ruler.preview.label.y}px">
        {ruler.preview.label.text}
      </span>
    {/if}
    {#if drawWall.previewLabel}
      <span class="length-label" style:left="{drawWall.previewLabel.x}px" style:top="{drawWall.previewLabel.y}px">
        {drawWall.previewLabel.text}
      </span>
    {/if}
    {#if libraryDrop.ghost && ui.libraryDrag}
      <div
        class="item-ghost"
        class:invalid={!libraryDrop.ghost.valid}
        class:overroom={libraryDrop.ghost.overRoom && libraryDrop.ghost.valid}
        style:left="{libraryDrop.ghost.sx}px"
        style:top="{libraryDrop.ghost.sy}px"
        style:width="{libraryDrop.ghost.w * viewport.scale}px"
        style:height="{libraryDrop.ghost.d * viewport.scale}px">
        {ui.libraryDrag.label}
      </div>
    {/if}
  </div>

  {#if drawWall.active}
    <div class="banner">{m.canvas__bannerDrawNext()}</div>
  {:else if ui.tool === 'ruler'}
    <div class="banner">{m.canvas__bannerRuler()}</div>
  {:else if Object.keys(plan.doc.walls).length === 0}
    <div class="banner">{m.canvas__bannerEmptyPlan()}</div>
  {/if}
</div>

<style>
.canvas-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  background: #ffffff;
  user-select: none;
}
svg.canvas {
  display: block;
  touch-action: none;
}
svg.canvas.cursor-crosshair {
  cursor: crosshair;
}
svg.canvas.cursor-grab {
  cursor: grab;
}
svg.canvas.cursor-grabbing {
  cursor: grabbing;
}
:global(svg.canvas .joint-dot) {
  fill: #64748b;
  pointer-events: none;
}
:global(svg.canvas .handle) {
  fill: #ffffff;
  stroke: #2563eb;
  cursor: grab;
}
:global(svg.canvas .item-handle) {
  cursor: nwse-resize;
}
:global(svg.canvas .item-rotate-handle) {
  cursor: grab;
}
:global(svg.canvas .sel-overlay) {
  pointer-events: none;
}
.overlay {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.length-label {
  position: absolute;
  transform: translate(-50%, -50%);
  background: #1e293b;
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;
  padding: 2px 7px;
  white-space: nowrap;
}
.ruler-label {
  position: absolute;
  transform: translate(-50%, -50%);
  background: #7c3aed;
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;
  padding: 2px 7px;
  white-space: nowrap;
}
.item-ghost {
  position: absolute;
  transform: translate(-50%, -50%);
  border: 2px dashed #64748b;
  background: rgba(226, 232, 240, 0.5);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #475569;
  pointer-events: none;
  white-space: nowrap;
}
.item-ghost.overroom {
  border-color: #16a34a;
  background: rgba(220, 252, 231, 0.5);
}
.item-ghost.invalid {
  border-color: #dc2626;
  background: rgba(254, 226, 226, 0.6);
  color: #b91c1c;
}
.rot-stem {
  stroke: #2563eb;
  pointer-events: none;
}
.banner {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(30, 41, 59, 0.92);
  color: #ffffff;
  font-size: 13px;
  border-radius: 8px;
  padding: 6px 12px;
  white-space: nowrap;
}
</style>
