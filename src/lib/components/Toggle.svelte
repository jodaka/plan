<script lang="ts" generics="T extends string">
let {
  value,
  options,
  onToggle,
}: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onToggle?: (value: T) => void;
} = $props();

function handleChange(event: Event) {
  const target = event.target as HTMLInputElement;
  if (typeof onToggle === 'function') {
    onToggle(target.value as T);
  }
}

const id = $props.id();
</script>

<div class="toggle" role="radiogroup">
  {#each options as opt, i (opt.value)}
    <input
      class="toggle__input"
      type="radio"
      id="{id}-radio-{i}"
      value={opt.value}
      bind:group={value}
      onchange={handleChange}>
    <label class="toggle__label" for="{id}-radio-{i}" title={opt.title}>{opt.label}</label>
  {/each}
</div>

<style>
.toggle {
  display: flex;
  background: var(--surface-alt);
  border-radius: var(--radius-pill);
  padding: 2px;
  gap: 1px;
}
.toggle__input {
  position: absolute;
  clip: rect(0 0 0 0);
  width: 1px;
  height: 1px;
}
.toggle__label {
  padding: 8px 12px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  user-select: none;
}
.toggle__label:hover {
  color: var(--fg);
}
.toggle__input:checked + .toggle__label {
  background: var(--surface);
  color: var(--fg);
  box-shadow:
    0 1px 3px oklch(0% 0 0 / 0.06),
    0 0 0 1px oklch(0% 0 0 / 0.04);
}
.toggle__input:focus-visible + .toggle__label {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
