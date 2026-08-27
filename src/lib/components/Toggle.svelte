<script lang="ts">
let { value, firstValue, secondValue, firstLabel, secondLabel, onToggle } = $props();

function handleChange(event: any) {
  if (typeof onToggle === 'function') {
    onToggle(event.target.value);
  }
}

const id = $props.id();
</script>

<div class="toggle" role="radiogroup">
  <input
    class="toggle__input"
    type="radio"
    id="{id}-radio-one"
    value={firstValue}
    bind:group={value}
    onchange={handleChange}>
  <label class="toggle__label" for="{id}-radio-one">{firstLabel}</label>
  <input
    class="toggle__input"
    type="radio"
    id="{id}-radio-two"
    value={secondValue}
    bind:group={value}
    onchange={handleChange}>
  <label class="toggle__label" for="{id}-radio-two">{secondLabel}</label>
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
  width: 32px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
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
