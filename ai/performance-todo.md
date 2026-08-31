# Rendering performance — candidates not yet done

Measured baselines (2026-08-31): Chromium trace at ~6% zoom — the pattern grid
(decisions §22) + the `--inv` CSS-var refactor (decisions §6) leave a zoom frame
with only the root transform, the `--inv` write, and the openings' hit-quad
points; painting is ~0.4 ms/frame in Chromium, CONTENT_FULL_PAINT_TIME p50
2.5 ms in Firefox. Firefox profile of real scroll-zoom on the demo plan showed
CONTENT_FRAME_TIME p50 15.5 ms with 25 stalls of 34–100 ms per 4.4 s — the
remaining stalls come from the per-frame scene rebuild itself (picture cache
invalidated every frame) plus GC, not from rasterization.

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
- **Effort**: small. **Payoff**: only on high-Hz input devices.

## 2. Screen-space decoration layer (the remaining Firefox lever)

- **Status**: after the `--inv` refactor the plan content itself is stable
  across zoom frames, but every frame still changes the root `<g>` transform
  AND every counter-scaled stroke value (via the var), so WebRender rebuilds
  the whole scene and invalidates its picture cache each frame
  (`NumPictureCacheInvalidated` ≈ 1/frame in the profile).
- **Idea**: move screen-constant decoration (hairline strokes on items,
  handles, joint dots, rulers, grid) into a separate NON-zoomed overlay svg
  positioned in screen space (the ruler labels already work this way), so
  zooming mutates only a transform on the plan svg — zero display-list diffs
  for plan content, picture caches survive, FF gets compositor-only frames.
- **Cost**: big architectural change (hit-testing in screen space, export
  must merge layers); do only if FF smoothness still matters after item 1.
- **Effort**: large. **Payoff**: transform-only zooming in every browser.

## 3. Viewport culling for large plans

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
  offscreen entities are invisible anyway.
- **Effort**: medium. **Payoff**: the only item that bounds worst-case cost
  for big plans; do this one when plans realistically exceed ~200 entities.

## 4. Selection-time components still take `scale` props

- **Status**: `AngleArcs`, `GapHints`, `WallDims` and the WindowView/DoorView
  hit quads still compute from `viewport.scale` — they re-render per zoom
  frame ONLY while something is selected (rare during pure zooming; the
  MutationObserver burst showed just 5 hit-quads mutating).
- **Effort**: small if ever needed. **Payoff**: niche (selected wall + zoom).

## Done (2026-08-31, see decisions §6 / §22)

- ~~Per-component `scale` prop churn~~ → `--inv` CSS var + static calc styles;
  `itemShapes(kind, w, d)` no longer re-derives per zoom frame (16 items went
  from full shape rebuild per frame to zero re-renders).
- ~~Joint dots per-frame `r` attribute~~ → static calc style (node merging is
  no longer needed; 13 circles with zero per-frame writes).
- Wheel zoom rAF-coalescing + `deltaMode` normalization (Firefox line deltas).

## Non-issues (verified, don't spend time here)

- Rasterization: ~0.4 ms/frame Chromium, 2.5 ms full paint Firefox — painting
  was never the bottleneck.
- Doc-derived chain (`scene.svelte.ts`: `renderJoints`, `wallEndNeighbors`,
  `rooms`, openings): keyed by doc identity, does NOT recompute during
  pan/zoom — already structurally shared.
- Zoom range: capped at 5–100% (decisions §6), which bounds worst-case grid
  density and DOM extents.
- `bind:clientWidth/Height` + ResizeObserver: resize-only, not per-frame.

