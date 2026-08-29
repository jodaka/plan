import { loadSavedDoc } from '../model/storage';
import { emptyDoc } from '../model/ops';
import { m } from '../paraglide/messages';
import type { PlanDoc } from '../types';

interface HistoryEntry {
  label: string;
  doc: PlanDoc;
}

const HISTORY_LIMIT = 50;

let entries = $state.raw<HistoryEntry[]>([{ label: m.history__start(), doc: loadSavedDoc() ?? emptyDoc() }]);
let index = $state(0);

export const plan = {
  get doc(): PlanDoc {
    return entries[index].doc;
  },

  get label(): string {
    return entries[index].label;
  },

  get canUndo(): boolean {
    return index > 0;
  },
  get canRedo(): boolean {
    return index < entries.length - 1;
  },
  get undoLabel(): string | null {
    return this.canUndo ? entries[index].label : null;
  },
  get redoLabel(): string | null {
    return this.canRedo ? entries[index + 1].label : null;
  },

  /** Commits a new document state produced by a pure op. Truncates the redo tail. */
  commit(label: string, doc: PlanDoc): void {
    if (doc === this.doc) return;
    const next = entries.slice(0, index + 1);
    next.push({ label, doc });
    const overflow = next.length - HISTORY_LIMIT;
    if (overflow > 0) next.splice(0, overflow);
    entries = next;
    index = next.length - 1;
  },

  undo(): void {
    if (this.canUndo) index -= 1;
  },
  redo(): void {
    if (this.canRedo) index += 1;
  },
};
