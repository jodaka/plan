<script lang="ts">
import favicon from '$lib/assets/favicon.svg';

let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon}>
</svelte:head>

{@render children()}

<style>
:global(html),
:global(body) {
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #0f172a;
  background: #f8fafc;
}
:global(*) {
  box-sizing: border-box;
}
</style>
