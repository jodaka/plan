<script lang="ts">
import { addPt, fmtCm, mul, sub, unit, type Pt } from '$lib/geometry';

interface Props {
  /** painted outer corners of the selected wall */
  ra: Pt;
  rb: Pt;
  /** inner (clear) span endpoints on the wall centerline */
  innerA: Pt;
  innerB: Pt;
  /** unit normal pointing to the outer side */
  outerN: Pt;
  thickness: number;
  scale: number;
  outer: number;
  inner: number;
}

let { ra, rb, innerA, innerB, outerN, thickness, scale, outer, inner }: Props = $props();

/** anchors (ra/rb = outer corners, innerA/innerB = inner-face points) sit on
 * the wall faces; dim lines float this far outside them */
const gap = $derived(18 / scale);
const tick = $derived(5 / scale);
const fs = $derived(11 / scale);

const innerN = $derived(mul(outerN, -1));
const oA = $derived(addPt(ra, mul(outerN, gap)));
const oB = $derived(addPt(rb, mul(outerN, gap)));
const iA = $derived(addPt(innerA, mul(innerN, gap)));
const iB = $derived(addPt(innerB, mul(innerN, gap)));

const u = $derived(unit(sub(rb, ra)));

interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cls: string;
}

const segs = $derived.by<Seg[]>(() => {
  const list: Seg[] = [];
  const ext = (from: Pt, to: Pt) => list.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y, cls: 'ext' });
  const dim = (from: Pt, to: Pt) => list.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y, cls: 'dim' });
  const cross = (p: Pt) =>
    list.push({
      x1: p.x - u.x * tick,
      y1: p.y - u.y * tick,
      x2: p.x + u.x * tick,
      y2: p.y + u.y * tick,
      cls: 'dim',
    });

  // outer dimension
  ext(ra, addPt(oA, mul(outerN, tick)));
  ext(rb, addPt(oB, mul(outerN, tick)));
  dim(oA, oB);
  cross(oA);
  cross(oB);

  // inner dimension
  ext(innerA, addPt(iA, mul(innerN, tick)));
  ext(innerB, addPt(iB, mul(innerN, tick)));
  dim(iA, iB);
  cross(iA);
  cross(iB);
  return list;
});

const oT = $derived(addPt(mul(addPt(oA, oB), 0.5), mul(outerN, 11 / scale)));
const iT = $derived(addPt(mul(addPt(iA, iB), 0.5), mul(innerN, 11 / scale)));
</script>

<g class="wall-dims">
  {#each segs as s, i (i)}
    <line class={s.cls} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke-width={1 / scale} />
  {/each}
  <text
    class="dim-text"
    x={oT.x}
    y={oT.y}
    font-size={fs}
    text-anchor="middle"
    dominant-baseline="middle"
    stroke-width={3 / scale}>
    outer {fmtCm(outer)} cm
  </text>
  <text
    class="dim-text inner"
    x={iT.x}
    y={iT.y}
    font-size={fs}
    text-anchor="middle"
    dominant-baseline="middle"
    stroke-width={3 / scale}>
    inner {fmtCm(inner)} cm
  </text>
</g>

<style>
.wall-dims {
  pointer-events: none;
}
.wall-dims line {
  stroke: #94a3b8;
}
.wall-dims line.ext {
  stroke: #cbd5e1;
}
.dim-text {
  fill: #1e293b;
  stroke: #ffffff;
  paint-order: stroke;
  font-weight: 600;
  user-select: none;
}
.dim-text.inner {
  fill: #0f766e;
}
</style>
