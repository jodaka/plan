export type JointId = string;
export type WallId = string;
export type RoomObjectId = string;

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
 * An entity bound to a room (furniture, window, door, …). Rooms themselves
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

export interface PlanDoc {
  version: 1;
  joints: Record<JointId, Joint>;
  walls: Record<WallId, Wall>;
  /** entities bound to rooms; kept (orphaned) when their room is destroyed */
  roomObjects: Record<RoomObjectId, RoomObject>;
}

export const DEFAULT_THICKNESS = 10;
export const MIN_THICKNESS = 1;
export const MAX_THICKNESS = 100;
