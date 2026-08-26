import type { DoorId, WallId, WindowId } from '../types';

export type Tool = 'select' | 'draw';

export interface LibraryDrag {
  kind: string;
  label: string;
}

let tool = $state<Tool>('select');
let snapEnabled = $state(true);
let showGrid = $state(false);
let selectedWallId = $state<WallId | null>(null);
let selectedWindowId = $state<WindowId | null>(null);
let selectedDoorId = $state<DoorId | null>(null);
let selectedItemId = $state<string | null>(null);
let selectedRoomKey = $state<string | null>(null);
let libraryDrag = $state<LibraryDrag | null>(null);

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
  /** Selecting a wall always drops an opening/item/room selection (and vice versa below). */
  select(wallId: WallId | null): void {
    selectedWallId = wallId;
    selectedWindowId = null;
    selectedDoorId = null;
    selectedItemId = null;
    selectedRoomKey = null;
  },

  get selectedWindowId(): WindowId | null {
    return selectedWindowId;
  },
  /** Selects a window (clearing any door/item selection); its wall stays selected as context. */
  selectWindow(id: WindowId | null): void {
    selectedWindowId = id;
    selectedDoorId = null;
    selectedItemId = null;
    selectedRoomKey = null;
  },

  get selectedDoorId(): DoorId | null {
    return selectedDoorId;
  },
  /** Selects a door (clearing any window/item selection); its wall stays selected as context. */
  selectDoor(id: DoorId | null): void {
    selectedDoorId = id;
    selectedWindowId = null;
    selectedItemId = null;
    selectedRoomKey = null;
  },

  get selectedItemId(): string | null {
    return selectedItemId;
  },
  /** Selects a room item (or deselects), clearing every other selection. */
  selectItem(id: string | null): void {
    selectedItemId = id;
    selectedWallId = null;
    selectedWindowId = null;
    selectedDoorId = null;
    selectedRoomKey = null;
  },

  get selectedRoomKey(): string | null {
    return selectedRoomKey;
  },
  /** Selects a room (by stable key), clearing every other selection; null deselects all. */
  selectRoom(key: string | null): void {
    selectedRoomKey = key;
    selectedWallId = null;
    selectedWindowId = null;
    selectedDoorId = null;
    selectedItemId = null;
  },

  get libraryDrag(): LibraryDrag | null {
    return libraryDrag;
  },
  /** An item kind is being dragged from the library panel onto the canvas. */
  startLibraryDrag(kind: string, label: string): void {
    libraryDrag = { kind, label };
  },
  cancelLibraryDrag(): void {
    libraryDrag = null;
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
