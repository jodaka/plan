<script lang="ts">
import type { ItemShape } from '$lib/items/types';

interface Props {
  shapes: ItemShape[];
  /** tint variant: '' | 'flagged' (red) | 'orphan' (gray dashed) */
  tone?: '' | 'flagged' | 'orphan';
}

let { shapes, tone = '' }: Props = $props();
</script>

<!-- Hairline strokes/radii are SCREEN px via the canvas `--inv` var (1/scale,
     set on the svg root): these style strings are static, so zooming never
     re-renders this component. Set `--inv` on the containing svg when used
     outside the canvas (library palette). -->
<g class={tone}>
  {#each shapes as s, i (i)}
    {#if s.el === 'rect'}
      <rect
        class={s.part ?? 'body'}
        x={s.x}
        y={s.y}
        width={s.width}
        height={s.height}
        style={`stroke-width: calc(1px * var(--inv)); rx: calc(${s.rx ?? 0}px * var(--inv));`} />
    {:else if s.el === 'line'}
      <line
        class={s.part ?? 'body'}
        x1={s.x1}
        y1={s.y1}
        x2={s.x2}
        y2={s.y2}
        style="stroke-width: calc(1px * var(--inv));" />
    {:else if s.el === 'circle'}
      <circle class={s.part ?? 'body'} cx={s.cx} cy={s.cy} r={s.r} style="stroke-width: calc(1px * var(--inv));" />
    {:else}
      <path class={s.part ?? 'body'} d={s.d} style="stroke-width: calc(1px * var(--inv));" />
    {/if}
  {/each}
</g>

<style>
/* Plan-symbol palette (neutral 250 hue, app oklch tokens). Silhouette =
     light fill + dark hairline; interior linework is stroke-only; hinge dots
     stay 2 SCREEN px at any zoom, like DoorView. */
.body {
  fill: oklch(97.5% 0.004 250);
  stroke: oklch(48% 0.015 250);
}
.detail {
  fill: none;
  stroke: oklch(55% 0.012 250);
}
.hinge {
  fill: oklch(48% 0.015 250);
  r: calc(2px * var(--inv));
}
.flagged .body {
  fill: oklch(95% 0.045 25);
  stroke: oklch(55% 0.2 25);
}
.flagged .detail {
  fill: none;
  stroke: oklch(55% 0.2 25);
}
.orphan .body {
  fill: oklch(98.5% 0.002 250);
  stroke: oklch(65% 0.01 250);
  stroke-dasharray: calc(4px * var(--inv)) calc(3px * var(--inv));
}
.orphan .detail {
  fill: none;
  stroke: oklch(72% 0.008 250);
}
</style>
