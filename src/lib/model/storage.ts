import { browser } from '$app/environment';
import type { PlanDoc } from '../types';

const STORAGE_KEY = 'floorplanner.doc.v1';

export function loadSavedDoc(): PlanDoc | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		return sanitize(JSON.parse(raw));
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

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null;
}

function num(v: unknown): v is number {
	return typeof v === 'number' && Number.isFinite(v);
}

/** Repairs/culls malformed persisted data so a corrupt entry can't crash the app. */
function sanitize(data: unknown): PlanDoc | null {
	if (!isRecord(data) || data.version !== 1 || !isRecord(data.joints) || !isRecord(data.walls)) {
		return null;
	}
	const joints: PlanDoc['joints'] = {};
	const walls: PlanDoc['walls'] = {};

	for (const [id, j] of Object.entries(data.joints)) {
		if (isRecord(j) && num(j.x) && num(j.y)) {
			joints[id] = { id, x: j.x, y: j.y };
		}
	}
	for (const [id, w] of Object.entries(data.walls)) {
		if (
			isRecord(w) &&
			typeof w.startJointId === 'string' &&
			typeof w.endJointId === 'string' &&
			joints[w.startJointId] &&
			joints[w.endJointId] &&
			num(w.thickness)
		) {
			walls[id] = {
				id,
				startJointId: w.startJointId,
				endJointId: w.endJointId,
				thickness: w.thickness
			};
		}
	}
	return { version: 1, joints, walls };
}
