<script lang="ts">
let { w, d, scale }: { w: number; d: number; scale: number } = $props();
const hw = $derived(w / 2);
const hd = $derived(d / 2);
</script>

<rect class="body" x={-hw} y={-hd} width={w} height={d} stroke-width={1 / scale} />
{#if w >= d}
  <line class="detail" x1={0} y1={-hd} x2={0} y2={hd} stroke-width={1 / scale} />
  <circle class="hinge" cx={-3 / scale} cy={0} r={1.5 / scale} />
  <circle class="hinge" cx={3 / scale} cy={0} r={1.5 / scale} />
{:else}
  <line class="detail" x1={-hw} y1={0} x2={hw} y2={0} stroke-width={1 / scale} />
  <circle class="hinge" cx={0} cy={-3 / scale} r={1.5 / scale} />
  <circle class="hinge" cx={0} cy={3 / scale} r={1.5 / scale} />
{/if}
