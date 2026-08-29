import type { Pt } from '../geometry';
import type { JointId } from '../types';

/**
 * Transient drag previews, keyed by entity id. Drafts drive rendering only —
 * they are merged into the scene's derived values and never enter the doc;
 * commits happen at gesture end (see ai/decisions.md §invariant 2).
 */

/** joint position overrides while a joint or room drag is in flight */
let jointDrafts = $state.raw<Record<JointId, Pt>>({});

/** opening (window/door) offset/length overrides while an opening drag is in flight */
export interface OpenDraft {
  offset: number;
  length: number;
}
let openDrafts = $state.raw<Record<string, OpenDraft>>({});

/** item position/size/rotation overrides while an item drag is in flight */
export interface ItemDraft {
  x: number;
  y: number;
  w: number;
  d: number;
  rotation: number;
}
let itemDrafts = $state.raw<Record<string, ItemDraft>>({});

export const drafts = {
  get joints(): Record<JointId, Pt> {
    return jointDrafts;
  },
  setJoint(id: JointId, p: Pt): void {
    jointDrafts = { ...jointDrafts, [id]: p };
  },
  clearJoints(): void {
    jointDrafts = {};
  },

  get openings(): Record<string, OpenDraft> {
    return openDrafts;
  },
  setOpen(id: string, d: OpenDraft): void {
    openDrafts = { ...openDrafts, [id]: d };
  },
  clearOpenings(): void {
    openDrafts = {};
  },

  get items(): Record<string, ItemDraft> {
    return itemDrafts;
  },
  setItem(id: string, d: ItemDraft): void {
    itemDrafts = { ...itemDrafts, [id]: d };
  },
  clearItems(): void {
    itemDrafts = {};
  },
};
