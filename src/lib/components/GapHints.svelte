<script lang="ts">
import { addPt, fmtCm, mul, sub, unit, type Pt } from '$lib/geometry';

interface Props {
  /** wall centerline endpoints (rendered joints) */
  a: Pt;
  b: Pt;
  thickness: number;
  scale: number;
  /** gap boundaries in cm from the wall start: [leftFrom…winFrom] and [winTo…rightTo] */
  leftFrom: number;
  winFrom: number;
  winTo: number;
  rightTo: number;
  /** draw on the flipped normal side — the wall's outer side */
  flip?: boolean;
}

let { a, b, thickness, scale, leftFrom, winFrom, winTo, rightTo, flip = false }: Props = $props();

const u = $derived(unit(sub(b, a)));
const n0 = $derived({ x: -u.y, y: u.x });
const n = $derived(flip ? mul(n0, -1) : n0);

const gap = $derived(thickness / 2 + 7 / scale);
const lift = $derived(10 / scale);
const tick = $derived(4 / scale);
const fs = $derived(10 / scale);

const at = (t: number) => addPt(a, mul(u, t));

/** rotation parallel to the wall, normalized to (−90°, 90°] so labels stay upright */
const rotDeg = $derived.by(() => {
  const deg = (Math.atan2(u.y, u.x) * 180) / Math.PI;
  return deg > 90 ? deg - 180 : deg <= -90 ? deg + 180 : deg;
});

interface Gap {
  from: number;
  to: number;
}

const gaps = $derived.by<Gap[]>(() => [
  { from: leftFrom, to: winFrom },
  { from: winTo, to: rightTo },
]);
</script>

<g class="gap-hints">
  {#each gaps as g, i (`${g.from}:${g.to}`)}
    {@const A = addPt(at(g.from), mul(n, gap))}
    {@const B = addPt(at(g.to), mul(n, gap))}
    {@const mid = addPt(mul(addPt(A, B), 0.5), mul(n, lift))}
    <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke-width={1 / scale} />
    <line
      x1={A.x - u.x * tick}
      y1={A.y - u.y * tick}
      x2={A.x + u.x * tick}
      y2={A.y + u.y * tick}
      stroke-width={1 / scale} />
    <line
      x1={B.x - u.x * tick}
      y1={B.y - u.y * tick}
      x2={B.x + u.x * tick}
      y2={B.y + u.y * tick}
      stroke-width={1 / scale} />
    <text
      x={mid.x}
      y={mid.y}
      font-size={fs}
      text-anchor="middle"
      dominant-baseline="middle"
      stroke-width={3 / scale}
      transform="rotate({rotDeg} {mid.x} {mid.y})">
      {fmtCm(g.to - g.from)}
    </text>
  {/each}
</g>

<style>
.gap-hints {
  pointer-events: none;
}
.gap-hints line {
  stroke: #d97706;
}
.gap-hints text {
  fill: #92400e;
  stroke: #ffffff;
  paint-order: stroke;
  font-weight: 600;
  user-select: none;
}
</style>
