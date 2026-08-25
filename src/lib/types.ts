export type JointId = string;
export type WallId = string;

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

export interface PlanDoc {
  version: 1;
  joints: Record<JointId, Joint>;
  walls: Record<WallId, Wall>;
}

export const DEFAULT_THICKNESS = 10;
export const MIN_THICKNESS = 1;
export const MAX_THICKNESS = 100;
