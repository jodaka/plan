<script lang="ts">
import favicon from '$lib/assets/favicon.svg';

let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon}>
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
</svelte:head>
{@render children()}

<style>
:global(:root) {
  --bg: oklch(99% 0.002 240);
  --surface: oklch(100% 0 0);
  --fg: oklch(18% 0.012 250);
  --muted: oklch(54% 0.012 250);
  --border: oklch(92% 0.005 250);
  --accent: oklch(58% 0.18 255);
  --accent-soft: oklch(95% 0.04 255);
  --accent-hover: oklch(92% 0.06 255);
  --danger: oklch(55% 0.22 25);
  --danger-soft: oklch(95% 0.04 25);
  --danger-hover: oklch(92% 0.05 25);
  --surface-alt: oklch(97% 0.003 240);
  --hover: oklch(96% 0.005 240);
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-pill: 100px;
}

:global(html),
:global(body) {
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
  color: var(--fg);
  background: var(--bg);
}

:global(*) {
  box-sizing: border-box;
}

:global(:root) {
  --bg: oklch(99% 0.002 240);
  --surface: oklch(100% 0 0);
  --fg: oklch(18% 0.012 250);
  --muted: oklch(54% 0.012 250);
  --border: oklch(92% 0.005 250);
  --accent: oklch(58% 0.18 255);
  --accent-soft: oklch(95% 0.04 255);
  --danger: oklch(55% 0.22 25);
  --danger-soft: oklch(95% 0.04 25);
  --surface-alt: oklch(97% 0.003 240);
  --hover: oklch(96% 0.005 240);
  --radius-pill: 100px;
}
</style>
