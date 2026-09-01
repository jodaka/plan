# Debugging the app in Safari via the Safari MCP server

## Tool notes (differ from the Firefox/Chrome devtools MCPs)

- Tabs are addressed by *handle* from `list_tabs` (`create_tab` returns one);
  `switch_tab` before per-tab tools when several are open.
- No a11y-snapshot/UID layer: interaction goes through `page_interactions`
  (click, type, scroll, hover, keyPress…) or `evaluate_javascript`.
- `evaluate_javascript` is the workhorse — same usage patterns as the Firefox
  playbook (`ai/firefox-mcp.md`): one measurement per call, stash loop state
  on `window`, prefer rAF-paced loops over synchronous ones.
- `screenshot` returns the current page as PNG; `set_viewport_size` for
  responsive checks.

## App-specific recipes (same tricks as Firefox)

- **Start the dev server first** (`bun run dev`) and use the port from its
  log (5173 is often taken).
- **Loading a plan**: file-input automation is flaky everywhere — write the
  doc into localStorage and reload (see `ai/firefox-mcp.md` "Loading a plan";
  same `floorplanner.doc.v1` key works here).
- **Simulating wheel zoom**: dispatch real WheelEvents on `svg.canvas`, one
  per `requestAnimationFrame` (see `ai/firefox-mcp.md` "Simulating wheel
  zoom" — sync loops over-shoot the rAF-batched queue).
- **Simulating trackpad pinch (Safari-only path)**: `GestureEvent` has no
  constructor, but the handlers (Canvas.svelte) only read `scale`, `clientX`,
  `clientY`, so a plain Event with those props attached exercises the code
  path end-to-end:

  ```js
  const svg = document.querySelector('svg.canvas');
  const r = svg.getBoundingClientRect();
  const gesture = (type, scale) => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    e.scale = scale;                     // absolute ratio vs. gesture start
    e.clientX = r.left + r.width / 2;    // zoom anchor = cursor position
    e.clientY = r.top + r.height / 2;
    svg.dispatchEvent(e);
  };
  // one pair per frame: start resets the baseline, change applies the delta
  gesture('gesturestart', 1.0);
  gesture('gesturechange', 1.2);
  ```

  `preventDefault()` on `gesturestart` is what opts out of Safari's native
  full-page pinch zoom — verify the page itself does not zoom during the
  gesture (real trackpad test), since a synthetic dispatch skips that path.

## History

- 2026-09-01: first Safari session found that trackpad pinch did nothing
  (WebKit fires `gesturestart/change/end`, not ctrl+wheel) — fixed in
  Canvas.svelte, see `ai/decisions.md` §6.
