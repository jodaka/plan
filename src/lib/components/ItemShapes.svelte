<script lang="ts">
import type { ItemShape } from '$lib/items/types';

interface Props {
  shapes: ItemShape[];
  /** world cm per... stroke reference: shapes draw stroke-width 1/scale */
  scale: number;
  /** tint variant: '' | 'flagged' (red) | 'orphan' (gray dashed) */
  tone?: '' | 'flagged' | 'orphan';
}

let { shapes, scale, tone = '' }: Props = $props();
</script>

<g class={tone}>
  {#each shapes as s, i (i)}
    {#if s.el === 'rect'}
      <rect
        class={s.part ?? 'body'}
        x={s.x}
        y={s.y}
        width={s.width}
        height={s.height}
        rx={s.rx}
        stroke-width={1 / scale} />
    {:else if s.el === 'line'}
      <line class={s.part ?? 'body'} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke-width={1 / scale} />
    {:else if s.el === 'circle'}
      <circle class={s.part ?? 'body'} cx={s.cx} cy={s.cy} r={s.r} />
    {:else}
      <path class={s.part ?? 'body'} d={s.d} stroke-width={1 / scale} />
    {/if}
  {/each}
</g>

<style>
.body {
  fill: #e2e8f0;
  stroke: #475569;
}
.detail {
  fill: #f1f5f9;
  fill-opacity: 0.6;
  stroke: #94a3b8;
}
.hinge {
  fill: #64748b;
}
.flagged .body {
  fill: #fecaca;
  stroke: #dc2626;
}
.flagged .detail {
  fill: #fee2e2;
  fill-opacity: 0.7;
  stroke: #dc2626;
}
.orphan .body {
  fill: #f8fafc;
  stroke: #94a3b8;
  stroke-dasharray: 4 3;
}
</style>
