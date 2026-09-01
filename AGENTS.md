# PLAN

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
bun run release    # release helper: bump version everywhere, commit, tag vX.Y.Z, push (see ai/decisions.md §23)
```

## Code style & enforcement

- All formatting/linting rules live in `biome.json` — write code that passes `bun run lint`
  with 0 diagnostics; prefer `bun run lint:fix` over hand-fixing style issues. Never argue
  with the formatter.
- Commits are guarded by a lefthook `pre-commit` hook (installed via the `prepare` script):
  staged files must pass `biome check --staged` (auto-fixable issues are fixed and re-staged)
  and the whole project must pass `svelte-check`. Code with lint/format/type errors cannot
  be committed — fix it rather than bypassing the hook (`--no-verify` only as a last resort).
- Ensure you are documenting all the code you write with comments. Update ./ai/decisions.md 
  as necessary.
- Try to use as little 3rd party npm modules as possible

## Current feature set

- Canvas: wheel zoom (5%–100%, cursor-anchored), space+drag pan, zoom-to-fit
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
- Rooms: any closed wall figure is a room (derived — the room entity is never
  persisted; the optional name is the sole exception, stored in `doc.roomNames` by
  stable key) — painted
  `rgb(250, 235, 215)` under the walls with the clear-floor area (inner m², inset by
  wall halves) at its centroid; deleting or moving walls updates/dissolves rooms
  automatically; the m² label doubles as a drag handle — dragging it translates the
  whole room rigidly (all loop joints + its room-bound objects), REJECTED with an
  error toast when a room corner is attached to walls outside the room; clicking
  empty space inside a room (or the label) selects it — the inspector shows the
  clear-floor m² and an optional name (persisted in `doc.roomNames` by stable key,
  inspector-only, survives the room being destroyed/redrawn with the same walls)
- Windows: "Add window" in the inspector places a default window on the selected wall
  (centered in the largest gap); windows are selectable, resizable by dragging their two
  round handles on canvas or via the inspector length field, and slidable by dragging
  their body; a selected window shows amber gap hints (distance to the nearest
  other-window edge on each side, or to the wall ends when it has no neighbors);
  thickness always equals the host wall's; deleting a wall deletes its
  windows; wall resizes keep opening offsets while they fit (else clamp flush) and are
  REJECTED with an error toast when a wall would get shorter than its total opening span
- Doors: like windows ("Add door" on a selected wall — default 80 cm, min 30 cm) but
  rendered with the classic plan symbol: jamb frame + leaf standing perpendicular to the
  wall + dashed quarter-circle swing arc; a selected door's inspector button cycles its
  swing mode through top-left → top-right → bottom-right → bottom-left → no swing
  (modes are quadrants relative to the wall axis start→end); doors share the wall axis
  with windows (gaps/floors count both), delete with their wall, show the same amber
  gap hints as windows when selected, and persist as `doc.doors`
- Ruler: a toolbar tool (Select / Draw wall / Ruler toggle) that measures distances —
  click places the start point, a second click completes the measurement (live preview
  with a `fmtCm` label while placing); completed rulers accumulate, may overlap, and
  stay rendered until Esc or leaving the tool (V/D) clears them; endpoints follow the
  snap toggle (joints + 1 cm grid); rulers are UI-only (see `ai/decisions.md` §21) —
  never in the doc, history, or exports
- Room items (furniture): a categorized library in the side panel (Bedroom: bed,
  double bed · Living room: chair, sofa, table, corner table, L-shaped table, closet,
  floor lamp) rendered as a NAMELESS two-column palette of visual previews —
  drag a tile onto
  a room to place it (`Add ${label}`); the library lives in `src/lib/items/` — adding
  an item = one `items/library/<kind>.ts` file (defaults + inline `{ en, ru? }` label
  + optional collision shapes + optional declarative SVG view shapes) + one line in
  `items/registry.ts`;
  items are bound to the room's stable key and move with it (room drag translates them);
  selectable, draggable (snaps to wall inner faces, sibling edges/centers + grid),
  resizable via 4 corner handles, rotatable via a lollipop handle (15° detents, exact
  angle in the inspector); item–item overlap is ALLOWED but both items tint red;
  item–wall/door/window overlap or leaving the room is forbidden — live red tint and
  REJECTED with an error toast on release (library drops included); dropping into a
  different room re-binds it; orphaned items (room destroyed) render grayed and can be
  re-bound by dropping them into any room
- Room-bound entities: `doc.roomObjects` (furniture, keyed by the room's stable
  wall-set key) — deleting a wall that belongs to a room asks for confirmation first
  (it would destroy the room and orphan its objects; objects are kept, never culled)
- Undo/redo (Ctrl/Cmd+Z, Ctrl+Shift+Z / Ctrl+Y, toolbar buttons) with labeled entries;
  Delete/Backspace deletes the current selection (wall, window, door or item)
- Persistence: debounced localStorage (`plan.doc.v1`), sanitized on load
- Import/export (toolbar): JSON file `floorplan_<timestamp>.json` with metadata
  (`app`, `appVersion`, `exportedAt`, `doc`); import validates version metadata
  (no version → error), is undoable, and offers to export the current plan first
  when walls exist; "Export SVG" downloads the live canvas clone as a standalone
  vector drawing (`floorplan_<timestamp>.svg`, inlined styles, recomputed viewport —
  see `ai/decisions.md` §19)
- All displayed lengths/angles are mm-precision (`fmtCm`); raw floats never rendered
- Page is client-only (`export const ssr = false` in `src/routes/+page.ts`)
- i18n: Paraglide JS (en/ru, `ai/decisions.md` §20) — UI strings in `messages/en.json`
  + `messages/ru.json` (key-aligned, `component__key` naming, `{param}` interpolation),
  used via `m.<key>()` from `$lib/paraglide/messages`; `src/lib/paraglide/` is
  generated (gitignored); locale switched by the toolbar EN/RU toggle (cookie +
  document reload)

## Architecture

```
messages/                  # paraglide catalogs en.json / ru.json — UI strings live here
project.inlang/            # paraglide project settings (locales, message format)
src/
  hooks.ts                 # client reroute: deLocalizeUrl (i18n URL-prefix stripping)
  hooks.server.ts          # paraglide middleware: injects <html lang/dir> into app.html
src/lib/
  types.ts                 # Joint, Wall, RoomObject, PlanDoc; thickness constants
  geometry.ts              # pure math: snap, angles, itemCorners/SAT/snap, fmtCm (unit = 1 cm)
  model/
    ops.ts                 # ALL document mutations as pure (doc, …) => doc functions
    rooms.ts               # findRooms: bounded faces of the wall graph (derived rooms)
    storage.ts             # localStorage load/save (browser-guarded)
    validate.ts            # sanitizeDoc: repairs/culls malformed plan data (pure)
    io.ts                  # export serialize/download + import parse/validate (pure)
  items/
    types.ts               # ItemDef, ItemShape, categories; hooks optional (rect defaults)
    registry.ts            # THE item list — register new library/<kind>.ts files here
    library/<kind>.ts      # ONE file per item: defaults + collision shapes + view shapes
  version.ts               # APP_VERSION written into export files
  stores/
    plan.svelte.ts         # doc + history: commit(label, doc)/undo/redo, $state.raw
    viewport.svelte.ts     # scale/pan, toWorld/toScreen, zoomAt/fit, clamps
    ui.svelte.ts           # tool, snap/grid toggles, selection ids, error toast
  canvas/
    drafts.svelte.ts       # transient drag previews: joint/opening/item overrides
    scene.svelte.ts        # THE derivation core (renderJoints, rooms — the single
                           # findRooms call site — walls, openings, items, overlays)
    drawWall.svelte.ts     # wall-chain drawing gesture
    jointDrag.svelte.ts    # joint drag gesture (highlight + opening-floor rejection)
    openingDrag.svelte.ts  # window/door slide + resize gesture (shared wall axis)
    roomDrag.svelte.ts     # rigid room-translation gesture (m² label as handle)
    ruler.svelte.ts        # ruler tool: two-point measurements (UI-only state)
    itemDrag.svelte.ts     # item move/resize/rotate gesture
    libraryDrop.svelte.ts  # library palette → canvas drop gesture + ghost
  components/
    Canvas.svelte          # svg, hit-testing + gesture dispatch, pan/zoom, top layers
    WallView.svelte        # wall body + invisible fat hit-line (corner extension math)
    WindowView.svelte      # window frame + glass on its wall + invisible hit area
    DoorView.svelte        # door jamb frame + swing leaf/arc + invisible hit area
    ItemShapes.svelte      # generic renderer for item view shapes (canvas + palette)
    FurnitureView.svelte   # item wrapper: transform, selection outline, hit area
    RoomView.svelte        # room polygon + m² label at centroid (label = room drag handle)
    WallDims.svelte        # outer/inner dimension lines for highlighted walls
    AngleArcs.svelte       # angle arcs at joints of highlighted walls
    Toolbar.svelte         # tools, snap/grid, zoom, undo/redo, import/export
    InspectorPanel.svelte  # selected-entity numeric editing + item library palette
src/routes/+page.svelte    # layout, global shortcuts, autosave effect
scripts/release.ts         # release helper: package.json is the version source of truth;
                           # rewrites version.ts/Cargo.toml/Cargo.lock, commits, tags, pushes
tests/                     # bun:test unit tests: model (geometry + ops), rooms, io
```

## Invariants (do not break)

1. Document mutations ONLY via pure functions in `model/ops.ts`; never mutate a `PlanDoc`.
   New state enters history exclusively through `plan.commit(label, doc)`.
2. Commits happen at gesture end, never per pointermove; transient drag previews live in
   `lib/canvas/drafts.svelte.ts` (`$state.raw`), merged into rendering only.
3. 1 world unit = 1 cm; snap to integers when snap is on; never persist −0; render
   lengths/angles only through `fmtCm` (mm precision).
4. `src/lib/**` internal imports are RELATIVE (bun test has no path aliases);
   components/routes use `$lib/...`. Modules imported by tests must not depend on
   `$app/*` (see `ai/decisions.md` §12).
5. SVG layer order in Canvas is load-bearing (see `ai/decisions.md` §4): grid → rooms →
   walls → windows → doors → items → joint dots → selection overlay → wall handles →
   window handles → door handles → item handles → dimensions. Hit-testing relies on
   `data-wall-id` / `data-joint-id` / `data-window-id` / `data-door-id` /
   `data-item-id` attributes and paint order.
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
9. package.json is the single source of the app version (see `ai/decisions.md` §23);
   `src/lib/version.ts`, `src-tauri/Cargo.toml` (+ its Cargo.lock entry) are rewritten only
   by `scripts/release.ts`, and `tauri.conf.json` inherits via `"version": "../package.json"`.
   Release via the Release workflow (dispatch) or `bun run release` — never hand-edit
   these version copies.

## Definition of done for changes

- `bun run check` → 0 errors, 0 warnings
- `bun test` → all pass
- `svelte-autofixer` (Svelte MCP) run on every touched `.svelte` / `.svelte.ts` file;
  remaining suggestions must be reviewed (known intentional `$effect` patterns are
  documented in `ai/decisions.md` §10)
- Interaction changes verified in the browser (dev server + devtools)

## Browser devtools MCPs (Chrome / Firefox / Safari)

Three browser MCP servers are available for verification and debugging; pick the
one matching the browser under test (or cross-check all three):

- **chrome-devtools** — Chromium: pages, a11y snapshots, performance traces,
  Lighthouse audits.
- **firefox-devtools** — Firefox: follow the playbook in `ai/firefox-mcp.md` —
  it covers loading a plan (localStorage injection works; synthetic file-input
  events do not), simulating wheel zoom correctly (rAF-paced dispatch; sync
  loops over-shoot), the frame-pacing harness, toolbar toggle automation,
  scene DOM bisecting, and how to make sense of saved Gecko profiler JSON.
- **safari-mcp** — Safari Technology Preview via Follow `ai/safari-mcp.md` for setup (enable
  remote automation in STP settings), tool differences (handle-based tabs,
  no UID layer — use `page_interactions` / `evaluate_javascript`), and the
  synthetic GestureEvent recipe for testing trackpad pinch.

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
