<script lang="ts">
import { docBBox } from '$lib/model/ops';
import { downloadPlan, parseImport } from '$lib/model/io';
import { downloadSvg } from '$lib/model/svgExport';
import { plan } from '$lib/stores/plan.svelte';
import { ui } from '$lib/stores/ui.svelte';
import { viewport } from '$lib/stores/viewport.svelte';
import { m } from '$lib/paraglide/messages';
import { setLocale, getLocale } from '$lib/paraglide/runtime';
import type { Tool } from '$lib/stores/ui.svelte';
import fitIcon from '$lib/assets/icons/fit.svg?raw';
import snapToGridIcon from '$lib/assets/icons/snap-to-grid.svg?raw';
import Toggle from './Toggle.svelte';

let fileInput: HTMLInputElement | undefined = $state();

function exportPlan() {
  downloadPlan(plan.doc);
}

function importClicked() {
  if (Object.keys(plan.doc.walls).length > 0) {
    const saveFirst = window.confirm(m.toolbar__importClickConfirmation());
    if (saveFirst) {
      downloadPlan(plan.doc);
    }
  }
  fileInput?.click();
}

function svgExportClicker() {
  downloadSvg(plan.doc);
}

async function onFileChosen(e: Event) {
  const input = e.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ''; // allow re-choosing the same file later
  if (!file) {
    return;
  }
  const res = parseImport(await file.text());
  if (!res.ok) {
    window.alert(m.toolbar__importFailed({ error: res.error }));
    return;
  }
  plan.commit(m.history__importPlan(), res.doc);
  ui.setTool('select');
  ui.select(null);
  viewport.fit(docBBox(res.doc));
}
const lang = getLocale() as 'en' | 'ru';
</script>

<div class="toolbar">
  <div class="group" role="group" aria-label="Logo">
    <img
      class="logo"
      src={lang === 'en' ? "./plan_en.svg" : "./plan.svg"}
      width="150"
      height="100%"
      alt={m.toolbar__logoAlt()}>
  </div>

  <div class="group" role="group" aria-label="Lang">
    <Toggle
      value={lang}
      options={[
        { value: 'en', label: 'EN' },
        { value: 'ru', label: 'RU' },
      ]}
      onToggle={(newLang: 'en'|'ru') => setLocale(newLang)} />
  </div>

  <div class="group" role="group" aria-label="Tools">
    <Toggle
      value={ui.tool}
      options={[
        { value: 'select', label: m.toolbar__selectButton(), title: m.toolbar__selectButtonTitle() },
        { value: 'draw', label: m.toolbar__drawButton(), title: m.toolbar__drawButtonTitle() },
        { value: 'ruler', label: m.toolbar__rulerButton(), title: m.toolbar__rulerButtonTitle() },
      ]}
      onToggle={(newTool: Tool) => ui.setTool(newTool)} />
  </div>

  <div class="group" role="group" aria-label="Snapping">
    <button
      class="toolbarIcon"
      class:active={ui.snapEnabled}
      onclick={() => ui.toggleSnap()}
      title={m.toolbar__snapButtonTitle()}>
      {@html snapToGridIcon}
    </button>
    <button class:active={ui.showGrid} onclick={() => ui.toggleGrid()} title={m.toolbar__gridButtonTitle()}>
      {m.toolbar__gridButton()}
    </button>
  </div>

  <div class="group" role="group" aria-label="File">
    <button onclick={exportPlan} title={m.toolbar__downloadTitle()}>{m.toolbar__downloadButton()}</button>
    <button onclick={importClicked} title={m.toolbar__openTitle()}>{m.toolbar__openButton()}</button>
    <button onclick={svgExportClicker} title={m.toolbar__svgExportTitle()}>{m.toolbar__svgExportButton()}</button>
  </div>

  <div class="group" role="group" aria-label="History">
    <button
      disabled={!plan.canUndo}
      onclick={() => plan.undo()}
      title={plan.undoLabel ? m.toolbar__undoTitle({ label: plan.undoLabel }) : m.toolbar__undoTitleEmpty()}>
      {m.toolbar__undoButton()}
    </button>
    <button
      disabled={!plan.canRedo}
      onclick={() => plan.redo()}
      title={plan.redoLabel ? m.toolbar__redoTitle({ label: plan.redoLabel }) : m.toolbar__redoTitleEmpty()}>
      {m.toolbar__redoButton()}
    </button>
  </div>

  <input bind:this={fileInput} type="file" accept=".json,application/json" hidden onchange={onFileChosen}>

  <span class="hint">{m.toolbar__hint()}</span>
</div>
<div class="zoomGroup">
  <button onclick={() => viewport.zoomCenter(0.8)} title={m.toolbar__zoomOutTitle()}>−</button>
  <span class="pct">{Math.round(viewport.zoomPct)}%</span>
  <button onclick={() => viewport.zoomCenter(1.25)} title={m.toolbar__zoomInTitle()}>+</button>
  <button class="icon" onclick={() => viewport.fit(docBBox(plan.doc))} title={m.toolbar__fitTitle()}>
    {@html fitIcon}
  </button>
</div>

<style>
.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 12px;
  background: #ffffff;
  flex-wrap: wrap;
}
.group {
  display: flex;
  align-items: center;
  gap: 4px;
}
button {
  border: 1px solid #e2e8f0;
  background: #ffffff;
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 13px;
  cursor: pointer;
  color: #334155;
}
button:hover:not(:disabled) {
  background: #f1f5f9;
}
button.active {
  background: #dbeafe;
  border-color: #93c5fd;
  color: #1d4ed8;
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
.pct {
  min-width: 44px;
  text-align: center;
  font-size: 13px;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}
.hint {
  margin-left: auto;
  font-size: 12px;
  color: #94a3b8;
}

.toolbarIcon {
  height: 28px;
  padding: 2px;
}

.zoomGroup {
  position: absolute;
  bottom: 16px;
  left: 16px;
  display: flex;
  flex-direction: column;
  width: 36px;
  gap: 8px;
  align-items: center;

  & button {
    overflow: hidden;
    width: 36px;
    height: 30px;
  }

  .icon {
    color: #333333;
    padding: 5px;
  }
}
</style>
