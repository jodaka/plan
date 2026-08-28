<script lang="ts">
let { w, d, scale }: { w: number; d: number; scale: number } = $props();
const hw = $derived(w / 2);
const hd = $derived(d / 2);
const cr = $derived(Math.min(hw, hd));
const inset = $derived(Math.min(10, w * 0.12, d * 0.12));
</script>

<path
  class="body"
  d="M {-hw} {-hd} L {hw - cr} {-hd} Q {hw} {-hd} {hw} {-hd + cr} L {hw} {hd} L {-hw} {hd} Z"
  stroke-width={1 / scale} />
<path
  class="detail"
  d="M {-hw + inset} {-hd + inset} L {hw - cr * 0.6} {-hd + inset} Q {hw - inset} {-hd + inset} {hw - inset} {-hd + cr * 0.6} L {hw - inset} {hd - inset} L {-hw + inset} {hd - inset} Z"
  fill="none"
  stroke-width={1 / scale} />
