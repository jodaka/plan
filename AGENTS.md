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
bun run check      # svelte-kit sync + svelte-check (must be 0 errors / 0 warnings)
bun test           # unit tests (bun:test, tests/ directory)
```

## Current feature set

- Canvas: wheel zoom (5%–2000%, cursor-anchored), space+drag pan, zoom-to-fit
- 1×1 cm invisible grid; snapping ON by default (toggleable); H/V axis snap within 1°
- Wall drawing: chained clicks, live preview with length label, attach to existing joints
- Wall editing: select, drag body (snaps delta), drag joint handles (auto-join: shared
  corners move all attached walls), angle badges during joint drag (H/V/degrees + pair angle)
- Inspector: centerline length (editable), thickness (editable, clamp 1–100 cm), outer
  span, inner clear span, orientation, delete
- On-canvas dimensions for the selected wall: outer + inner dimension lines
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
  types.ts                 # Joint, Wall, PlanDoc; thickness constants
  geometry.ts              # pure math: snap, angles, extendPts, fmtCm (unit = 1 cm)
  model/
    ops.ts                 # ALL document mutations as pure (doc, …) => doc functions
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
    WallDims.svelte        # outer/inner dimension lines for selection
    Toolbar.svelte         # tools, snap/grid, zoom, undo/redo
    InspectorPanel.svelte  # selected-wall numeric editing
src/routes/+page.svelte    # layout, global shortcuts, autosave effect
tests/model.test.ts        # bun:test unit tests for geometry + ops
```

Docs: `plan.md` (feature plan & build order), `ai/decisions.md` (design rationale —
read before changing state management, rendering layers, snapping, or dimensions).

## Invariants (do not break)

1. Document mutations ONLY via pure functions in `model/ops.ts`; never mutate a `PlanDoc`.
   New state enters history exclusively through `plan.commit(label, doc)`.
2. Commits happen at gesture end, never per pointermove; transient drag previews live in
   Canvas `drafts` (`$state.raw`), merged into rendering only.
3. 1 world unit = 1 cm; snap to integers when snap is on; never persist −0; render
   lengths/angles only through `fmtCm` (mm precision).
4. `src/lib/**` internal imports are RELATIVE (bun test has no path aliases);
   components/routes use `$lib/...`. Modules imported by tests must not depend on
   `$app/*` (see `ai/decisions.md` §13).
5. SVG layer order in Canvas is load-bearing (see `ai/decisions.md` §4): grid → walls →
   joint dots → selection overlay → handles → dimensions. Hit-testing relies on
   `data-wall-id` / `data-joint-id` attributes and paint order.
6. Corner extension = half of the thickest neighbor wall at that joint; free ends stay
   flush. `outer = centerline + extStart + extEnd`, `inner = centerline − extStart − extEnd`.
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
