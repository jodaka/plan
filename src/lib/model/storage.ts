import { browser } from '$app/environment';
import type { PlanDoc } from '../types';
import { sanitizeDoc } from './validate';

const STORAGE_KEY = 'floorplanner.doc.v1';

export function loadSavedDoc(): PlanDoc | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitizeDoc(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveDoc(doc: PlanDoc): void {
  if (!browser) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch {
    // storage unavailable/full — non-fatal
  }
}
