export type JointId = string;
export type WallId = string;
export type RoomObjectId = string;
export type WindowId = string;
export type DoorId = string;

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
 * An item placed inside a room (furniture). Rooms themselves are derived
 * from the wall graph (see model/rooms.ts) — items reference them via the
 * room's stable key so the binding survives joint moves, thickness edits and
 * undo/redo, and breaks (orphans) only when the room's loop breaks.
 * Position is the item CENTER in cm; `w`×`d` is the size along its LOCAL
 * axes (before rotation); `rotation` in degrees, normalized [0, 360).
 * Shape is always a rectangle (decorative details are drawn inside it).
 */
export interface RoomObject {
  id: RoomObjectId;
  /** stable key of the bound room (sorted wall ids of its loop — model/rooms.ts) */
  roomId: string;
  /** catalog kind id: 'bed' | 'sofa' | … (items/library/*.ts, items/registry.ts) */
  kind: string;
  /** world position of the item center, cm */
  x: number;
  /** world position of the item center, cm */
  y: number;
  /** size along the item's local x axis, cm */
  w: number;
  /** size along the item's local y axis, cm */
  d: number;
  /** rotation around the center, degrees, [0, 360) */
  rotation: number;
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

/**
 * How a door swings. The four swinging modes are quadrants in the door's own
 * frame, named as they read on a left-to-right horizontal wall: the FIRST
 * letter picks the cross-wall side the leaf opens toward (t = −normal = up,
 * b = +normal = down), the SECOND the hinge jamb along the wall axis
 * (l = start edge, r = end edge). 'none' renders no leaf/arc at all.
 */
export const DOOR_MODES = ['tl', 'tr', 'br', 'bl', 'none'] as const;
export type DoorMode = (typeof DOOR_MODES)[number];

export interface WallDoor extends WallWindow {
  mode: DoorMode;
}

export interface PlanDoc {
  version: 1;
  joints: Record<JointId, Joint>;
  walls: Record<WallId, Wall>;
  /** entities bound to rooms; kept (orphaned) when their room is destroyed */
  roomObjects: Record<RoomObjectId, RoomObject>;
  /** openings in walls; die with their wall */
  windows: Record<WindowId, WallWindow>;
  /** openings in walls; die with their wall */
  doors: Record<DoorId, WallDoor>;
  /** optional user-facing room names, keyed by the room's stable key (§15) —
   * shown in the inspector only; kept when the room is destroyed */
  roomNames: Record<string, string>;
}

export const DEFAULT_THICKNESS = 10;
export const MIN_THICKNESS = 1;
export const MAX_THICKNESS = 100;

export const DEFAULT_WINDOW_LENGTH = 100;
export const MIN_WINDOW_LENGTH = 10;

export const DEFAULT_DOOR_LENGTH = 80;
export const MIN_DOOR_LENGTH = 30;
