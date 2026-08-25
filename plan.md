# Floorplanner — Implementation Plan

Lightweight alternative to floorplancreator.net: draw walls for a floor plan in the browser,
edit them precisely, navigate the canvas fluidly. Single-user, local-first, no backend.

## Stack

- SvelteKit 2 + Svelte 5 (runes) + TypeScript, bun
- Rendering: **SVG** (crisp vectors, native hit-testing/pointer events on walls & handles,
  easy export later)
- Internal unit: **1 cm**. World coordinates in cm floats; screen↔world transform lives in
  the viewport store.
- Persistence: localStorage (debounced save, load on mount)

## Data model

Joints are first-class entities so auto-join and angle calculations fall out naturally:

```ts
type Joint = { id: string; x: number; y: number };          // cm
type Wall  = { id: string; startJointId: string; endJointId: string; thickness: number };
type PlanDoc = {
  version: number;
  joints: Record<JointId, Joint>;
  walls: Record<WallId, Wall>;
};
```

- Dragging a joint moves every attached wall (auto-join).
- Default wall thickness: **10 cm**, clamp 1–100 cm.
- Snap-to-grid: round world coords to nearest 1 cm (toggleable, default ON).

## Architecture

```
src/lib/
  types.ts                 # Joint, Wall, PlanDoc
  geometry.ts              # snap, dist, angles, projection utils
  model/
    ops.ts                 # pure (doc, action) => doc mutations: addWall, moveJoint,
                           #   setThickness, setLength, deleteWall …
    history.svelte.ts      # commit(label) / undo / redo over doc states
    storage.svelte.ts      # debounced localStorage load/save
  stores/
    viewport.svelte.ts     # zoom, pan, toScreen/toWorld, clamped zoom
    ui.svelte.ts           # active tool, selection, snap toggle, transient drag state
  components/
    Canvas.svelte          # <svg>, wheel-zoom @cursor, space-drag pan
    WallView.svelte        # wall rect + draggable endpoint handles
    AngleBadge.svelte      # angle readout near dragged joint
    Toolbar.svelte         # draw/select tool, snap toggle, zoom %, undo/redo
    InspectorPanel.svelte  # length/thickness numeric inputs for selection
```

Rule: **all document mutations are pure functions in `model/ops.ts`** — the store layer is thin
and swappable; geometry/rendering never depend on which state library wraps it.

## Features

### 1. Canvas navigation
- Wheel = zoom anchored at cursor, clamped ≈ 5%–2000%
- Space + drag = pan (cursor changes, tool suppressed while space held)
- Zoom % indicator + zoom-to-fit button

### 2. Grid & snapping
- Invisible 1×1 cm grid always defines snapping
- Snap toggle in toolbar (grid visibility toggle can come later)
- While dragging: snap to 0°/90° within ~1° tolerance, highlight "H"/"V"

### 3. Drawing walls
- Chained clicks: click sets start, live preview follows cursor (length readout),
  click fixes segment and chains next from its end
- Esc / right-click ends chain; Delete removes selected wall
- New endpoint coinciding with existing joint (within snap distance) attaches to it
- **Joint dots**: every joint renders a small dot so chains can be closed visually

### Rendering rules
- Walls render as thick lines with butt caps
- A wall end extends by **half of the thickest neighbor wall** at that joint, so corners
  close without gaps; free ends stay flush so the drawn length equals the measured length
- Selected wall shows **outer and inner dimension lines on canvas**:
  `outer = centerline + extStart + extEnd`, `inner = centerline − extStart − extEnd`
  (ext = neighbor thickness / 2 per connected end) — the architectural clear span
- Joint dots make connection points visible; endpoint handles sit at true joint positions

### 4. Editing walls
- Select wall → drag body to move whole wall, drag endpoint handles to reshape
  (attached walls follow via shared joints)
- Inspector panel: length (moves far endpoint along direction), thickness
- **Angle readout while dragging a joint**: angle between each pair of connected walls
  (e.g. `87°`) + absolute angle of dragged wall vs horizontal; strict-H/V indicated

### 5. Undo / redo
- Commit points at gesture end (mouseup), not per-frame
- History entries carry human labels ("Move wall", "Add wall") for tooltips
- Shortcuts: Ctrl/Cmd+Z, Ctrl+Shift+Z / Ctrl+Y; toolbar buttons mirror
- Capped history depth (few hundred entries)

### 6. Persistence
- Debounced serialize → localStorage; load on mount; version field for migrations

## Build order

1. Types + `model/ops.ts` pure mutations (+ unit tests)
2. History + storage stores
3. Viewport math, wheel zoom, space-drag pan
4. Render walls; select; drag body/joints with grid snap + H/V snap
5. Draw tool (chained clicks, preview, attach to existing joints)
6. Inspector panel (thickness, length)
7. Angle readouts at dragged joint
8. Toolbar polish, shortcuts, empty-state hints

## Open questions

- [ ] State management approach — see discussion; candidates:
  runes + structurally-shared immutable snapshots vs command pattern vs Immer/MST patches
