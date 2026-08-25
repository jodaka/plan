# Design & Code Decisions

Context for future maintainers (human or AI): why the floorplanner codebase is the way it is.
Read together with `plan.md` (feature plan) and `AGENTS.md` (conventions & commands).

## 1. State management: Svelte 5 runes + structurally-shared snapshot history

**Decision**: `src/lib/stores/plan.svelte.ts` keeps history as an array of
`{ label, doc }` entries (`$state.raw`), with an index pointer. Undo/redo = moving the
index; the current doc is just `entries[index].doc`.

**Why not the alternatives** (discussed at length with the user):
- *Deep-clone snapshots* were rejected for good reason: a 300-wall plan is ~100 KB, so
  1000 clones ≈ 100 MB.
- *mobx-state-tree / Immer patches* have the same asymptotic memory as structural sharing
  (patches are just a serialized diff between two structurally-shared trees) but add
  interpretation machinery: inverse-patch application can silently corrupt state when
  applied out of order or onto a diverged base. Swapping a reference (`doc = history[--i]`)
  cannot desync by construction.
- *Command pattern* (moveVertex, createVertex, … with inverses) was rejected because
  auto-join makes gestures composite (one drag can move several walls and merge joints);
  hand-written inverse commands are a classic corruption bug farm, and the features that
  justify commands (collaboration, action-stream sync, macros) are not requirements.
  Undo-by-replay needs checkpoints anyway — which are snapshots.
- Memory numbers: with structural sharing a history entry only allocates what changed
  (~6 KB for a corner drag in a 300-wall plan); 500-entry cap ≈ a few MB.

**Consequences / invariants**:
- All mutations are pure functions in `src/lib/model/ops.ts`: `(doc, …) => doc`, never
  mutating the input. If a command log or sync is ever needed, recording the action stream
  alongside is additive — no migration.
- `plan.commit(label, doc)` is the ONLY way state enters history. It no-ops when the doc
  reference is unchanged (identity check) — this is what keeps "drag that ends where it
  started" from creating junk history entries.
- Commits happen at gesture end (pointerup), never per pointermove. Live drag previews use
  transient `drafts` state in `Canvas.svelte` and are merged into rendering only.
- History entries carry human labels ("Move joint", "Add wall") used for undo/redo
  tooltips — this preserves the command-pattern UX without command machinery.
- `$state.raw` (not `$state`) is used for doc/history because deep proxies would destroy
  structural sharing (every read wraps objects, breaking reference identity).

## 2. Data model: joints are first-class entities

**Decision**: `Joint { id, x, y }` + `Wall { id, startJointId, endJointId, thickness }`.
Walls reference joints; they never store coordinates.

**Why**: the user required auto-join (dragging a shared corner moves all attached walls)
and angle readouts between connected walls. With joint entities both fall out naturally:
- `moveJoint` updates one record; all attached walls stretch automatically.
- Angle between walls at a joint = angle between vectors to the other joints.
- `deleteWall` prunes joints that lost their last wall (no orphans, no dangling refs).

**Units**: 1 world unit = 1 cm everywhere. Snap grid = 1 cm. Only the view layer converts
to pixels (`viewport.scale` px per cm).

## 3. Rendering: SVG, walls as thick `<line>` elements

**Why SVG over Canvas 2D**: DOM events give free hit-testing and per-element cursors;
vector output stays crisp at any zoom; floor-plan scale (hundreds of walls) is trivial for
the DOM. Canvas would force manual hit-testing math for no benefit here.

**Wall geometry**: a wall renders as a `<line>` with `stroke-width = thickness` and butt
caps. The centerline is the joint-to-joint segment; thickness extends ±t/2 perpendicular.

### Corner extension rule
A wall end extends outward by **half of the thickest OTHER wall at that joint**
(`wallExts` derived in Canvas, passed to WallView). Free ends (joint with only this wall)
extend by 0 — they stay flush so the painted length equals the measured length.
- Why neighbor's thickness, not the wall's own: with mixed thicknesses (e.g. 10cm wall
  meeting a 20cm wall), extending by own t/2 leaves a gap; the extension must reach the
  neighbor's far face.
- Why max over neighbors: one extension value per end must close the corner against every
  attached wall.

## 4. Paint-order layering in the SVG (important!)

SVG has no z-index; document order decides. Several bugs came from this, solved by moving
things into explicit top layers inside the transformed `<g>`:

1. grid lines → walls (`WallView`: body + transparent fat hit-line) → joint dots →
   selection overlay (`sel-overlay` lines) → endpoint handles → dimension lines
   (`WallDims`, pointer-events: none).
- Hit-lines must NOT cover handles: a neighbor wall's fat invisible hit-line rendered
  later in DOM would swallow pointerdowns aimed at a corner handle. Hence handles live in
  a top-level layer keyed off the selected wall (`handleJoints`), not inside WallView.
- The selection highlight must NOT be painted inside WallView: later walls' opaque strokes
  cover the selected wall's ends at corners (only a ~46px slice remained visible — real
  bug). Hence the selected wall is re-drawn on top (`sel-overlay`), and handles render
  after the overlay so they stay visible/clickable.
- Joint dots and dimension layers are `pointer-events: none` so they never block
  hit-testing.
- Hit-testing uses `e.target.closest('[data-wall-id]' / '[data-joint-id]')` — synthetic
  `dispatchEvent` bypasses browser hit-testing (target = dispatch element), which matters
  for tests.

## 5. Outer vs inner wall dimensions

**Definitions** (implemented, verified against painted geometry):
- `outer = |AB| + extStart + extEnd` — the full painted span, corner to corner.
- `inner (clear) = |AB| − extStart − extEnd`, clamped ≥ 0 — the architectural clear span
  between the neighbors' inner faces. (ext = neighbor t / 2 per connected end.)
- Note: the user's initial formula "outer − Σ(neighbor t/2)" actually yields the
  *centerline* length; the geometrically correct inner span subtracts a full neighbor
  thickness per end. Example rectangle: centerline 13, walls 10 → outer 23, inner 3.

**Which side is "outer"**: computed from the first connected wall at the start joint —
if the neighbor lies along the chosen normal direction, the normal is flipped (neighbors
extend into the room; outer is the opposite side). Free ends keep the default side.

**Where shown**: `WallDims.svelte` draws extension lines, dimension lines with end ticks
and labels ("outer 23 cm" / "inner 3 cm") on canvas while a wall is selected;
`InspectorPanel.svelte` mirrors the numbers (editable field remains centerline length —
editing moves the end joint along the current direction).

## 6. Viewport & navigation

- Screen = world·scale + pan; scale in px/cm, `BASE_PX_PER_CM = 15` (≈ physical size at
  100%). Zoom clamped to 5%–2000% (`MIN/MAX_SCALE`), anchored at the cursor:
  `pan' = p − (p − pan)·k`.
- Wheel listener is attached manually with `{ passive: false }` inside `$effect` —
  Svelte's `onwheel` attribute can't guarantee preventDefault works.
- `e.ctrlKey` wheel (trackpad pinch) uses higher sensitivity.
- Space + drag pans; space is tracked on window keydown/keyup, suppresses tool handling,
  and switches cursor. Middle-button (button 1) also pans.
- Initial view: first time canvas size is known, `viewport.fit(docBBox(doc))` centers the
  saved plan (or origin when empty).
- Counter-scaling: screen-constant elements (handle radius, hit-line min width, grid line
  width, font sizes) are divided by `scale` so they stay constant in pixels.

## 7. Snapping & drawing UX

- Grid snap: round to 1 cm (`geometry.snap`; also normalizes −0 → 0, which otherwise leaks
  from `Math.round` and breaks `toEqual` tests).
- H/V snap: after grid snap, if the segment to any connected/fixed end is within 1° of
  horizontal/vertical (`axisAlign`), the free coordinate is projected exactly onto the
  axis. This is what makes "strictly horizontal/vertical" walls achievable.
- Attach tolerance is expressed in **screen px converted to world** (`12 / scale`), not
  absolute cm — otherwise the same gesture feels different at different zooms.
- Drawing is chained clicks: click sets anchor, preview follows cursor (dashed line +
  live length label), click fixes a wall and chains from its end; clicking within zero
  distance of the anchor closes the chain; Esc/right-click also end it. Endpoints attach
  to existing joints within tolerance (`addWall` with `attachTolCm`).
- Wall body drag snaps the **delta**, not absolute positions — moving a wall keeps its
  exact shape/length.
- Angle badges (during joint drag): per connected wall, absolute orientation with green
  H/V chip when axis-locked, plus the pairwise angle between connected walls (purple),
  positioned in screen space around the dragged joint. Rendered from a `$derived` reading
  `drafts`, so they appear only mid-gesture.

## 8. Pointer handling details

- `setPointerCapture` is wrapped in try/catch: for synthetic events (tests, automation)
  there is no active pointer with that id and the call throws NotFoundError, which
  previously aborted the whole pointerdown handler (drawing silently did nothing).
  Real pointers are unaffected.
- Wall selection = clicking the transparent fat hit-line (`stroke-width ≥ 14px/scale`);
  handles are grabbed via `data-joint-id` circles. Clicking empty canvas deselects and
  cancels an active draw chain.
- Drag state split: reactive (`$state`) only for what rendering reads (drafts, which
  joint/wall is being dragged, cursor mode); plain variables for handler-only bookkeeping
  (drag origins, "has moved" flags). Avoids unnecessary reactivity.

## 9. Persistence

- `localStorage` key `floorplanner.doc.v1` (version field inside the doc for future
  migrations). Save is debounced 250 ms from a `$effect` watching `plan.doc` in
  `+page.svelte`, with timer cleanup in the effect teardown.
- Load is sanitized (`model/storage.ts`): malformed JSON, wrong version, non-finite
  coordinates and dangling joint references are dropped, so a corrupt entry degrades to a
  partial plan instead of crashing.
- The route exports `ssr = false` (`+page.ts`): the whole app is a client-side canvas
  tool; storage module additionally guards with `browser` so module-init is SSR-safe.

## 10. Svelte 5 patterns used (and why)

- Stores are plain objects with getters + methods in `.svelte.ts` modules
  (`plan`, `viewport`, `ui`). Module-level rune variables are never exported directly
  (Svelte forbids exporting reassigned state); getters keep reads reactive.
- Derived values that need loops/conditionals use `$derived.by`; type annotation goes on
  the derived (`$derived.by<Record<string, Joint>>(...)`) — spreading `Record<string,Joint>`
  with `Record<string,Pt>` infers an unusable union otherwise.
- Effects are limited to genuine side effects: wheel-listener wiring, canvas-size sync,
  one-time initial fit, debounced save, resetting the draw chain on tool change. The
  svelte-autofixer heuristic flags "function call inside $effect" on these; they are
  reviewed and intentional (the suggestion itself says to ignore such cases).

## 11. Testing

- `bun test` with `bun:test` — no vitest/jest dependency; bun runs TS natively.
- Tests live in `tests/` and import lib modules via **relative paths**: files under
  `src/lib/**` import each other relatively (not `$lib/...`) precisely so bun's resolver
  (no path aliases) can run them. Components/routes keep using `$lib`.
- `@types/bun` is a devDependency and `"types": ["bun"]` is set in tsconfig.json —
  without it svelte-check cannot resolve `bun:test`.
- Coverage focus: geometry primitives and every ops mutation (attach, orphan pruning,
  clamps, immutability of the input doc).

## 13. Import / export

**Format** (pretty-printed JSON):
```json
{ "app": "floorplanner", "appVersion": "0.1.0", "exportedAt": "<ISO>", "doc": { …PlanDoc } }
```
- `APP_VERSION` lives in `src/lib/version.ts`, manually synced with package.json.
  Importing package.json was avoided (keeps bun test and the build simple).
- Filename: `floorplan_<YYYY-MM-DD_HH-mm-ss local>.json` — no colons (Windows-hostile).

**Import validation chain** (`model/io.ts` → `parseImport`): JSON.parse → must be an
object → must carry a non-empty `appVersion` string (per requirement: no version =
foreign file = error) → file's major version must not exceed the app's major version →
`sanitizeDoc` (shape, finite coords, dangling refs). Errors are human-readable strings
surfaced via `alert`.

**Data-loss rule**: `sanitizeDoc` silently culls broken entries (right for localStorage
recovery), but for imports a file that *claims* walls yet yields none after sanitization
is rejected as invalid instead of silently importing an empty plan. Partial loss (some
valid walls) still imports the valid subset — consistent with load behavior.

**Import is a history commit**: success path is `plan.commit('Import plan', doc)` —
undoable like any edit, reusing all existing machinery. Tool resets to select, selection
cleared, view fits the imported bbox.

**Save-first flow**: if the current plan has walls, native `confirm()` offers exporting
the current drawing before the file chooser opens (requirement). Native `confirm`/`alert`
were chosen over building modal/toast infrastructure for v1.

**bun-test constraint**: `io.ts` deliberately avoids `$app/environment` (uses a
`typeof document` guard in `downloadPlan`) because tests import it transitively and bun
cannot resolve kit aliases. For the same reason `sanitizeDoc` moved to
`model/validate.ts` (pure), while `model/storage.ts` keeps the `browser` guard.

## 14. Display precision

All user-facing lengths/angles go through `geometry.fmtCm` (rounds to 0.1 cm = 1 mm,
strips trailing `.0`). Raw floats must never be rendered — drag geometry produces values
like 165.6399122740582. The length input rounds via `Math.round(v * 10) / 10` because it
needs a number, not a string.

## 15. Deliberately not done (yet)

- Grid visibility defaults to OFF (spec: invisible grid defines snapping; toggle exists).
- No marquee/multi-select, no wall splitting, no rooms/areas, no doors/windows.
- Inspector length edits commit per `change` event (spinner clicks can create several
  history entries; capped by the 500-entry limit).
- Extension geometry assumes (near-)perpendicular corners; non-right angles use the same
  t/2 extension (standard in lightweight planners, slightly imperfect miters).
