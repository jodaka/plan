# Debugging the app in Firefox via the devtools MCP

Playbook from the zoom-lag investigation (see decisions.md §22). Records what
worked, what silently failed, and the exact snippets to reuse.

## Setup

- Start the dev server first (`bun run dev`) and read its output: **5173 is
  often taken**, Vite then falls back to 5174/5175/5176 — always use the port
  from the log.
- Open the app: `new_page("http://localhost:<port>/")`.
- Navigation to disallowed URLs (e.g. `about:support`) **fails and leaves a
  blank tab selected**. Afterwards check `list_pages` and re-select the app
  tab with `select_page` — otherwise every `evaluate_script` runs against the
  wrong page (`svg is null`).
- `evaluate_script` runs in the page realm and has a default ~5 s timeout
  (parameter `timeout` extends it, but one long combined script still died
  with a BiDi-level timeout at ~180 s). Keep one measurement per call; stash
  loop state on `window` (`window.__probeDead = true` to stop rAF loops from
  earlier calls).

## Loading a plan (import JSON)

The toolbar "Открыть" (Open) button opens a **real file chooser** — not
automatable. What does not work either:

- The hidden `<input type="file" accept=".json">` never appears in the a11y
  snapshot (hidden elements get no UID), so `upload_file_by_uid` can't target
  it.
- Synthesizing the change event does **not** trigger the Svelte handler:
  setting `input.files = dataTransfer.files` and dispatching
  `new Event('change', {bubbles: true})` ran without errors but never
  imported (doc stayed empty, no console output).

Reliable path — write the doc into localStorage and reload:

1. `demo.json` is `{app, appVersion, exportedAt, doc}` — extract `.doc` and
   stringify it as the value of `floorplanner.doc.v1`. In dev, Vite serves
   project-root files, so `fetch('/demo.json')` works from the page:

   ```js
   async () => {
     const res = await fetch('/demo.json');
     const { doc } = await res.json();
     localStorage.setItem('floorplanner.doc.v1', JSON.stringify(doc));
     location.reload();
   }
   ```

2. After reload the app sanitizes + restores the doc and `fit()`s the view.
   Verify: `document.querySelectorAll('[data-wall-id]').length` (demo = 13),
   windows `[data-window-id]` = 3, doors 2, items `[data-item-id]` 16.
3. Alternatively, ask the user to load the file manually in the browser —
   that always works and uses the real import path.

Note: autosave is debounced, so the imported plan persists to localStorage on
its own shortly after loading; a later plain reload keeps it.

## Simulating wheel zoom

The zoom handler lives on the `<svg class="canvas">` element (non-passive
listener, rAF-batched queue — see Canvas.svelte). Dispatch real WheelEvents
on it:

```js
const svg = document.querySelector('svg.canvas');
const r = svg.getBoundingClientRect();
const factor = 1.004;                       // or <1 to zoom out
svg.dispatchEvent(new WheelEvent('wheel', {
  bubbles: true, cancelable: true,
  clientX: r.left + r.width / 2,            // zoom anchor = cursor position
  clientY: r.top + r.height / 2,
  deltaY: -Math.log(factor) / 0.0015,       // inverse of exp(-dY * 0.0015)
  deltaMode: 0,
}));
```

- **Never dispatch in a tight synchronous loop while reading the zoom label**
  to decide when to stop. Zoom is applied once per animation frame and the
  toolbar label updates even later — a sync loop reads stale values and
  massively over-shoots (we pinned the view at the 100 % clamp this way).
  Drive one wheel per `requestAnimationFrame` instead:

  ```js
  const zoomSpan = [...document.querySelectorAll('span')]
    .find((s) => /^\d+%$/.test(s.textContent ?? ''));
  await new Promise((resolve) => {
    function step() {
      if (parseFloat(zoomSpan.textContent) >= 14.9) return resolve();
      wheel(1.004);
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
  ```

- The zoom % lives in the header span matching `/^\d+%$/` (the other header
  span is the hint text).
- Test on a 120 Hz display: frame budget is 8.3 ms, so jank shows up as rAF
  deltas of exactly 16.7 / 25.0 ms (2–3 vsyncs), not the classic 16.6/33 ms
  of a 60 Hz screen.

## Measuring frame pacing (the oscillation harness)

Pattern that produced all usable numbers: park at the start zoom (one wheel
per frame, as above), then oscillate between two zoom levels inside one rAF
loop, recording per-frame deltas + the zoom label + (optionally) a
MutationObserver count and the current grid pattern width
(`svg.querySelector('pattern').getAttribute('width')`) to correlate janky
frames with grid rung flips:

```js
const dts = [];
let dir = 1, reversals = 0, prevPct = pct(), frameStart = performance.now();
await new Promise((resolve) => {
  function frame(now) {
    dts.push(now - frameStart); frameStart = now;
    const p = pct();
    if (p !== prevPct) {
      if ((prevPct < hi && p >= hi) || (prevPct > lo && p <= lo)) reversals++;
      prevPct = p;
    }
    if (reversals >= N) return resolve();
    if (p >= hi - 0.1) dir = -1; else if (p <= lo + 0.1) dir = 1;
    wheel(dir > 0 ? 1.004 : 0.996);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
});
```

Report median/p95/max + count over 20 ms, and keep per-frame samples when you
need to localize *where* in the gesture the jank sits (that is how the grid
transition frames were separated from the zoom frames). Always re-run the
no-grid / previous-variant baseline in the same session — numbers drift
between sessions, and the first run after a reload includes warm-up spikes.

## Toolbar toggles

The toolbar icon buttons (snap, show-grid) expose `title`/`aria-label` text
but **no `aria-pressed`**, and labels are localized (this profile loads RU).
Find and click by text:

```js
const gridBtn = [...document.querySelectorAll('button')]
  .find((b) => `${b.getAttribute('aria-label') ?? ''}${b.title ?? ''}`.includes('сетку'));
gridBtn?.click();
```

Verify the effect in the DOM, not by the button look: the visual grid renders
as `svg rect[fill="url(#fp-grid)"]` (presence = grid on and not zooming).

## Scene DOM structure (for bisecting render cost)

Inside `svg.canvas` there is one `g[transform]` holding everything in paint
order (decisions §4): grid `<defs>`+`<rect>` → room groups
(`g.room` with polygon + label) → wall groups (`polygon.wall-body` +
`polygon.hit`) → `[data-window-id]` → `[data-door-id]` → `[data-item-id]`
groups → joint dots → selection overlays. Hiding whole layer groups by
`style.display` and re-measuring is a fast way to bisect renderer cost.
Careful: `stroke`/`fill` attribute queries can match the app's own pattern
tile path — check `parentNode` before counting "leftovers".

## Firefox profiler: what is usable from the saved JSON

`profiler_start` / `profiler_stop` write the profile to
`~/Downloads/profile-<uuid>.json`. From Python:

- **Symbols are NOT in the file** (symbolication happens in the Firefox UI):
  leaves come out as `0x…` addresses. Marker timestamps were also
  inconsistent in this build. What *did* work:
- `samples.data` rows are `[stack, time, eventDelay, args, threadCPUDelta]`;
  bucket `threadCPUDelta` per 1 s per thread (µs → ms) to see *which thread*
  burns CPU and when. That is how the Renderer thread
  (`RenderThread::UpdateAndRender`) was pinned while every GeckoMain stayed
  in `Wait`.
- `stackTable` schema is `{prefix: 0, frame: 1}` — **prefix first, frame
  second** (getting this backwards yields garbage like "everything is
  Wait"). `stackTable` prefixes always reference a *smaller* index, so leaf
  resolution is one linear pass.
- Main-thread `markers` live in `threads[].markers.data` with names resolved
  through `threads[].stringTable`.

## Screenshots

`screenshot_page` / `screenshot_by_uid` with `saveTo: true` write to
`~/.firefox-devtools-mcp/output/screenshot-<ts>.png`; pass the quoted path
string (`"true"`), then `read` the file to view it.
