<script lang="ts">
let { w, d, scale }: { w: number; d: number; scale: number } = $props();
const hw = $derived(w / 2);
const hd = $derived(d / 2);
const pillowH = $derived(Math.min(24, d * 0.18));
const inset = $derived(Math.min(10, w * 0.12, d * 0.12));
</script>

<rect class="body" x={-hw} y={-hd} width={w} height={d} stroke-width={1 / scale} />
<rect
  class="detail"
  x={-hw + inset}
  y={-hd + inset / 2}
  width={w / 2 - inset * 1.5}
  height={pillowH}
  rx={3 / scale}
  stroke-width={1 / scale} />
<rect
  class="detail"
  x={inset / 2}
  y={-hd + inset / 2}
  width={w / 2 - inset * 1.5}
  height={pillowH}
  rx={3 / scale}
  stroke-width={1 / scale} />
<line
  class="detail"
  x1={-hw}
  y1={-hd + inset / 2 + pillowH + inset}
  x2={hw}
  y2={-hd + inset / 2 + pillowH + inset}
  stroke-width={1 / scale} />
