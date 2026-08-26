import type { WallId, WindowId } from '../types';

export type Tool = 'select' | 'draw';

let tool = $state<Tool>('select');
let snapEnabled = $state(true);
let showGrid = $state(false);
let selectedWallId = $state<WallId | null>(null);
let selectedWindowId = $state<WindowId | null>(null);

let errorMsg = $state<string | null>(null);
let errorTimer: ReturnType<typeof setTimeout> | undefined;

export const ui = {
  get tool(): Tool {
    return tool;
  },
  setTool(t: Tool): void {
    tool = t;
    if (t === 'draw') selectedWallId = null;
  },

  get snapEnabled(): boolean {
    return snapEnabled;
  },
  toggleSnap(): void {
    snapEnabled = !snapEnabled;
  },

  get showGrid(): boolean {
    return showGrid;
  },
  toggleGrid(): void {
    showGrid = !showGrid;
  },

  get selectedWallId(): WallId | null {
    return selectedWallId;
  },
  /** Selecting a wall always drops a window selection (and vice versa below). */
  select(wallId: WallId | null): void {
    selectedWallId = wallId;
    selectedWindowId = null;
  },

  get selectedWindowId(): WindowId | null {
    return selectedWindowId;
  },
  /** Selects a window; its wall stays selected as context. */
  selectWindow(id: WindowId | null): void {
    selectedWindowId = id;
  },

  get error(): string | null {
    return errorMsg;
  },
  /** Shows a transient error toast (auto-hides). */
  showError(msg: string): void {
    errorMsg = msg;
    clearTimeout(errorTimer);
    errorTimer = setTimeout(() => (errorMsg = null), 4000);
  },
};
