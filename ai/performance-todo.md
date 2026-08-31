# Rendering performance — candidates not yet done

Measured baseline (Chrome trace, 4× CPU throttle, ~6% zoom, 5-wall plan): the
pattern grid (decisions §22) removed the per-frame node churn; painting is
~0.4 ms/frame and was never the bottleneck. The remaining items below target
DOM/style work that grows with plan size and input frequency. Items are ordered
by effort/impact; numbers in parentheses are trace evidence from the A/B
recording session (2026-08-31).

## 1. rAF-coalesce pan and gesture pointermove (same class as the wheel fix)

- **Status**: wheel zoom is already coalesced (Canvas `wheelQueue` +
  `applyQueuedZoom`, decisions §6). Pan (`viewport.panBy` from `onPointerMove`,
  Canvas.svelte) and the drag gestures (`drawWall.move`, `ruler.move`,
  `jointDrag.apply`, …) still apply per pointermove event.
- **Why**: high-frequency mice (1000 Hz) and some trackpads fire several
  pointermove events per frame; each triggers a Svelte flush and a style/layout
  pass for the transient previews.
- **Care**: unlike the wheel, gesture handlers mutate draft state read by
  hit-testing and gesture logic; coalescing must not delay gesture *state*
  (only rendering). Likely approach: keep gesture state updates immediate,
  batch only the viewport `panBy` (pure view transform, safe like the wheel).
  The draft-preview path is probably fine as-is because Svelte batches
  microtask flushes anyway — verify with a trace before doing more.
- **Effort**: small. **Payoff**: only on high-Hz input devices.

## 2. Per-component `scale` prop churn — consolidate counter-scaled attributes

- **Status**: every entity component derives screen-constant attributes from
  the `scale` prop and therefore re-renders on every zoom frame:
  - `FurnitureView.svelte`: re-derives `itemShapes(kind, w, d, scale)` per
    frame + outline/hit rect strokes (`2 / scale`, `4 / scale`)
  - `DoorView.svelte`: hit quad (`6 / scale`), swing arc dasharray,
    hinge radius, outline stroke (lines 38–78)
  - `WindowView.svelte`: frame strokes, glass dasharray
  - `RoomView.svelte`: label font-size, hit rect, m² chip radius
  - `Canvas.svelte`: 22 `… / viewport.scale` expressions (handles, joints,
    ruler, draw preview)
- **Why**: at ~10 entities this is invisible; at 100+ walls/items it becomes
  hundreds of attribute writes + style recalc per zoom frame (cold master
  trace showed `UpdateLayoutTree` elementCount ≈ 172/frame just for the old
  grid — the same mechanism, smaller multiplier).
- **Approach**: set one CSS custom property per frame on the root `<g>`
  (e.g. `style="--inv:{1/viewport.scale}"`) and express counter-scaled
  `stroke-width` / `r` / `font-size` / `stroke-dasharray` via CSS `calc()`.
  Collapses N attribute writes into 1 style write per frame.
- **Risk**: SVG geometry properties as CSS (`r`, `cx`, `stroke-width: calc`)
  are solid in Chromium, patchier in Firefox/Safari — check caniuse before
  committing; keep attribute fallbacks where support is doubtful.
- **Effort**: medium (touches all view components). **Payoff**: scales with
  plan size.

## 3. Joint dots → single `<path>` (same trick as the pattern grid)

- **Status**: one `<circle class="joint-dot">` per joint, `r={3 / scale}`
  updates every zoom frame (Canvas.svelte, joints layer).
- **Approach**: render all dots as one path (`M x y m -r 0 a r r 0 1 0 …` per
  dot or `M x-r y A …` arcs), one node, one `d` + one `stroke-width` update
  per frame. Alternatively keep circles but drop them into a `<g>` with
  counter-scaled `r` via CSS (see item 2).
- **Effort**: small. **Payoff**: only matters with many joints (50+); typical
  plans are far below.

## 4. Viewport culling for large plans

- **Status**: all keyed-each layers render every entity regardless of
  visibility (walls, openings, items, rooms, joints).
- **Why**: DOM size should be bounded by what's visible, not plan size. At
  ~6% zoom a large plan can hold hundreds of offscreen entities that still
  cost style/layout per frame.
- **Approach**: filter each keyed-each source by AABB ∩ `scene.visibleRect`.
  Items already carry `aabb` (RenderItem); walls/rooms need a cheap per-frame
  bbox from their joints (two `Math.min/max` per wall). Cull with a margin
  (~half screen) so pan doesn't pop entities at edges.
- **Care**: hit-testing relies on `data-*` paint order (decisions §4) —
  culling preserves order if the filter is per-layer; selection overlays of
  offscreen entities are invisible anyway, but inspector-driven highlight of
  an offscreen selection must not crash on missing view nodes (it doesn't —
  overlays are derived from doc, not DOM).
- **Effort**: medium. **Payoff**: the only item that bounds worst-case cost
  for big plans; do this one when plans realistically exceed ~200 entities.

## Non-issues (verified, don't spend time here)

- Rasterization/paint: ~0.4 ms/frame even at 6% zoom — SVG painting of the
  plan was never the problem.
- Doc-derived chain (`scene.svelte.ts`: `renderJoints`, `wallEndNeighbors`,
  `rooms`, openings): keyed by doc identity, does NOT recompute during
  pan/zoom — already structurally shared.
- Zoom range: capped at 5–100% (decisions §6), which bounds worst-case grid
  density and DOM extents.
- `bind:clientWidth/Height` + ResizeObserver: resize-only, not per-frame.
