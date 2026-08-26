# Floorplanner

Lightweight floor-plan editor (alternative to floorplancreator.net): draw walls on a
canvas, edit them precisely, navigate with pan/zoom. Client-only app — no backend.

## Project Configuration

- **Language**: TypeScript
- **Framework**: SvelteKit 2 + Svelte 5 (runes only, no legacy syntax)
- **Package Manager**: bun
- **Rendering**: SVG (no canvas/webgl, no UI or geometry libraries)
- **State**: runes + structurally-shared immutable snapshots (see `ai/decisions.md` §1)

## Commands

```sh
bun run dev        # dev server (http://localhost:5173)
bun run build      # production build
bun run preview    # preview production build
bun run check      # svelte-kit sync, then svelte-check ∥ format (must be 0 errors / 0 warnings)
bun run lint       # Biome check (lint + format verification, no writes)
bun run lint:fix   # Biome check --write (autofix lint/format/import sorting)
bun test           # unit tests (bun:test, tests/ directory)
```

## Code style & enforcement

- All formatting/linting rules live in `biome.json` — write code that passes `bun run lint`
  with 0 diagnostics; prefer `bun run lint:fix` over hand-fixing style issues. Never argue
  with the formatter.
- Commits are guarded by a lefthook `pre-commit` hook (installed via the `prepare` script):
  staged files must pass `biome check --staged` (auto-fixable issues are fixed and re-staged)
  and the whole project must pass `svelte-check`. Code with lint/format/type errors cannot
  be committed — fix it rather than bypassing the hook (`--no-verify` only as a last resort).

## Current feature set

- Canvas: wheel zoom (5%–2000%, cursor-anchored), space+drag pan, zoom-to-fit
- 1×1 cm invisible grid; snapping ON by default (toggleable); H/V axis snap within 1°
- Wall drawing: chained clicks, live preview with length label, attach to existing joints
- Wall editing: click to select; drag joint handles to reshape (auto-join: shared
  corners move all attached walls). Walls are NOT translatable as wholes — joint edits
  are the only geometry change; while dragging, every connected wall highlights with
  outer/inner dims + angle arcs at all affected joints
- Inspector: inner length (editable via `setInnerLength`), thickness (editable —
  `setThickness` shifts each joint along attached walls' axes by Δt/2 to preserve their
  angles and inner spans), outer span, orientation, delete
- Selected-wall overlay: outer/inner dimension lines + angle arcs at connected joints
- On-canvas dimensions for the selected wall: outer + inner dimension lines
- Rooms: any closed wall figure is a room (derived, never persisted) — painted
  `rgb(250, 235, 215)` under the walls with the clear-floor area (inner m², inset by
  wall halves) at its centroid; deleting or moving walls updates/dissolves rooms
  automatically
- Windows: "Add window" in the inspector places a default window on the selected wall
  (centered in the largest gap); windows are selectable, resizable by dragging their two
  round handles on canvas or via the inspector length field, and slidable by dragging
  their body; thickness always equals the host wall's; deleting a wall deletes its
  windows; wall resizes keep opening offsets while they fit (else clamp flush) and are
  REJECTED with an error toast when a wall would get shorter than its total opening span
- Doors: like windows ("Add door" on a selected wall — default 80 cm, min 30 cm) but
  rendered with the classic plan symbol: jamb frame + leaf standing perpendicular to the
  wall + dashed quarter-circle swing arc; a selected door's inspector button cycles its
  swing mode through top-left → top-right → bottom-right → bottom-left → no swing
  (modes are quadrants relative to the wall axis start→end); doors share the wall axis
  with windows (gaps/floors count both), delete with their wall, and persist as
  `doc.doors`
- Room-bound entities: `doc.roomObjects` (furniture/…, keyed by the room's stable
  wall-set key) — deleting a wall that belongs to a room asks for confirmation first
  (it would destroy the room and orphan its objects; objects are kept, never culled)
- Undo/redo (Ctrl/Cmd+Z, Ctrl+Shift+Z / Ctrl+Y, toolbar buttons) with labeled entries
- Persistence: debounced localStorage (`floorplanner.doc.v1`), sanitized on load
- Import/export (toolbar): JSON file `floorplan_<timestamp>.json` with metadata
  (`app`, `appVersion`, `exportedAt`, `doc`); import validates version metadata
  (no version → error), is undoable, and offers to export the current plan first
  when walls exist
- All displayed lengths/angles are mm-precision (`fmtCm`); raw floats never rendered
- Page is client-only (`export const ssr = false` in `src/routes/+page.ts`)

## Architecture

```
src/lib/
  types.ts                 # Joint, Wall, RoomObject, PlanDoc; thickness constants
  geometry.ts              # pure math: snap, angles, extendPts, fmtCm (unit = 1 cm)
  model/
    ops.ts                 # ALL document mutations as pure (doc, …) => doc functions
    rooms.ts               # findRooms: bounded faces of the wall graph (derived rooms)
    storage.ts             # localStorage load/save (browser-guarded)
    validate.ts            # sanitizeDoc: repairs/culls malformed plan data (pure)
    io.ts                  # export serialize/download + import parse/validate (pure)
  version.ts               # APP_VERSION written into export files
  stores/
    plan.svelte.ts         # doc + history: commit(label, doc)/undo/redo, $state.raw
    viewport.svelte.ts     # scale/pan, toWorld/toScreen, zoomAt/fit, clamps
    ui.svelte.ts           # tool, snap/grid toggles, selectedWallId
  components/
    Canvas.svelte          # svg, pointer/wheel/keyboard gestures, drafts, top layers
    WallView.svelte        # wall body + invisible fat hit-line (corner extension math)
    WindowView.svelte      # window frame + glass on its wall + invisible hit area
    DoorView.svelte        # door jamb frame + swing leaf/arc + invisible hit area
    RoomView.svelte        # room polygon + m² label at centroid (pointer-events: none)
    WallDims.svelte        # outer/inner dimension lines for highlighted walls
    AngleArcs.svelte       # angle arcs at joints of highlighted walls
    Toolbar.svelte         # tools, snap/grid, zoom, undo/redo, import/export
    InspectorPanel.svelte  # selected-wall numeric editing
src/routes/+page.svelte    # layout, global shortcuts, autosave effect
tests/model.test.ts        # bun:test unit tests for geometry + ops
```

## Invariants (do not break)

1. Document mutations ONLY via pure functions in `model/ops.ts`; never mutate a `PlanDoc`.
   New state enters history exclusively through `plan.commit(label, doc)`.
2. Commits happen at gesture end, never per pointermove; transient drag previews live in
   Canvas `drafts` (`$state.raw`), merged into rendering only.
3. 1 world unit = 1 cm; snap to integers when snap is on; never persist −0; render
   lengths/angles only through `fmtCm` (mm precision).
4. `src/lib/**` internal imports are RELATIVE (bun test has no path aliases);
   components/routes use `$lib/...`. Modules imported by tests must not depend on
   `$app/*` (see `ai/decisions.md` §12).
5. SVG layer order in Canvas is load-bearing (see `ai/decisions.md` §4): grid → rooms →
   walls → windows → doors → joint dots → selection overlay → wall handles → window
   handles → door handles → dimensions. Hit-testing relies on `data-wall-id` /
   `data-joint-id` / `data-window-id` / `data-door-id` attributes and paint order.
6. Walls render as mitered polygons (`wallCorners`): connected ends are cut along the
   miter line shared with the thickest neighbor at that joint; free ends stay flush.
   `outer = centerline + extStart + extEnd`, `inner = centerline − extStart − extEnd`.
   Thickness changes compensate (`setThickness` shifts each joint along the attached
   walls' axes, preserving their angles and inner spans); length edits target the inner
   span (`setInnerLength`).
7. Stores are getter-based objects in `.svelte.ts`; never export reassigned rune state.
   Doc/history use `$state.raw` to preserve structural sharing.
8. Imported files must pass `parseImport` (appVersion metadata + `sanitizeDoc`) and enter
   history via `plan.commit('Import plan', doc)` — never assigned directly.

## Definition of done for changes

- `bun run check` → 0 errors, 0 warnings
- `bun test` → all pass
- `svelte-autofixer` (Svelte MCP) run on every touched `.svelte` / `.svelte.ts` file;
  remaining suggestions must be reviewed (known intentional `$effect` patterns are
  documented in `ai/decisions.md` §10)
- Interaction changes verified in the browser (dev server + devtools)

## Svelte MCP server

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5
and SvelteKit documentation. Here's how to use the available tools effectively:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list
with titles, use_cases, and paths. When asked about Svelte or SvelteKit topics, ALWAYS use
this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple
sections. After calling the list-sections tool, you MUST analyze the returned
documentation sections (especially the use_cases field) and then use the
get-documentation tool to fetch ALL documentation sections that are relevant for the
user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions. You MUST use this tool whenever
writing Svelte code before sending it to the user. Keep calling it until no issues or
suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code. After completing the code, ask
the user if they want a playground link. Only call this tool after user confirmation and
NEVER if code was written to files in their project.
