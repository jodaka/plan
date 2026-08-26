export type JointId = string;
export type WallId = string;
export type RoomObjectId = string;
export type WindowId = string;

export interface Joint {
  id: JointId;
  /** cm */
  x: number;
  /** cm */
  y: number;
}

export interface Wall {
  id: WallId;
  startJointId: JointId;
  endJointId: JointId;
  /** cm */
  thickness: number;
}

/**
 * An entity bound to a room (furniture, door, …). Rooms themselves
 * are derived from the wall graph (see model/rooms.ts) — objects reference
 * them via the room's stable key so the binding survives joint moves,
 * thickness edits and undo/redo, and breaks only when the room's loop breaks.
 */
export interface RoomObject {
  id: RoomObjectId;
  /** stable key of the bound room (sorted wall ids of its loop — model/rooms.ts) */
  roomId: string;
  /** open-ended for future entity types: 'furniture' | 'door' | 'window' | … */
  kind: string;
  /** world position, cm */
  x: number;
  /** world position, cm */
  y: number;
}

/**
 * An opening in a wall. Windows are bound to their wall and parameterized
 * along it: `offset` cm from the wall's start joint (centerline) to the
 * window's near edge, `length` cm along the wall axis. This keeps them
 * anchored in place through joint moves/resizes; `model/ops.ts` clamps the
 * offset so a window never leaves its wall. Thickness is NOT stored — a
 * window always spans its wall's full thickness.
 */
export interface WallWindow {
  id: WindowId;
  wallId: WallId;
  /** cm from wall start joint to the window's near edge, centerline */
  offset: number;
  /** cm along the wall centerline */
  length: number;
}

export interface PlanDoc {
  version: 1;
  joints: Record<JointId, Joint>;
  walls: Record<WallId, Wall>;
  /** entities bound to rooms; kept (orphaned) when their room is destroyed */
  roomObjects: Record<RoomObjectId, RoomObject>;
  /** openings in walls; die with their wall */
  windows: Record<WindowId, WallWindow>;
}

export const DEFAULT_THICKNESS = 10;
export const MIN_THICKNESS = 1;
export const MAX_THICKNESS = 100;

export const DEFAULT_WINDOW_LENGTH = 100;
export const MIN_WINDOW_LENGTH = 10;
