import type { WallId } from '../types';

export type Tool = 'select' | 'draw';

let tool = $state<Tool>('select');
let snapEnabled = $state(true);
let showGrid = $state(false);
let selectedWallId = $state<WallId | null>(null);

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
  select(wallId: WallId | null): void {
    selectedWallId = wallId;
  },
};
