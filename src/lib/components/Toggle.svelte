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
  border: 1px solid #93c5fd;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  gap: 1px;
  height: 28px;
}

.toggle__input {
  position: absolute;
  clip: rect(0, 0, 0, 0);
  height: 1px;
  width: 1px;
  border: 0;
  overflow: hidden;
}

.toggle__label {
  background-color: #fff;
  color: rgba(0, 0, 0, 0.6);
  width: fit-content;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  padding: 0 8px;
  box-shadow:
    inset 0 1px 2px rgba(0, 0, 0, 0.1),
    0 1px rgba(255, 255, 255, 0.1);
  transition: all 0.1s ease-in-out;
}

.toggle__label:first-of-type {
  border-radius: 6px 0 0 6px;
}

.toggle__label:last-of-type {
  border-radius: 0 6px 6px 0;
}

.toggle__label:hover {
  cursor: pointer;
}

.toggle__input:checked + .toggle__label {
  background-color: #dbeafe;
  box-shadow: none;
}
</style>
