<script lang="ts">
let { w, d, scale }: { w: number; d: number; scale: number } = $props();
const hw = $derived(w / 2);
const hd = $derived(d / 2);
</script>

<rect class="body" x={-hw} y={-hd} width={w} height={d} stroke-width={1 / scale} />
<rect class="detail" x={-hw} y={-hd} width={w} height={Math.min(8, d * 0.2)} stroke-width={1 / scale} />
