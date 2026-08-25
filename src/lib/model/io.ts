import { APP_VERSION } from '../version';
import type { PlanDoc } from '../types';
import { sanitizeDoc } from './validate';

const EXPORT_APP = 'floorplanner';

interface ExportPayload {
  app: string;
  appVersion: string;
  exportedAt: string;
  doc: PlanDoc;
}

export function serializeExport(doc: PlanDoc): string {
  const payload: ExportPayload = {
    app: EXPORT_APP,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    doc,
  };
  return JSON.stringify(payload, null, '\t');
}

export type ImportResult = { ok: true; doc: PlanDoc } | { ok: false; error: string };

/**
 * Validates an imported file: JSON syntax, app-version metadata presence
 * (files without it are treated as foreign), major-version compatibility,
 * and finally plan-data sanitization.
 */
export function parseImport(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'the file is not valid JSON' };
  }
  if (typeof data !== 'object' || data === null) {
    return { ok: false, error: 'the file does not contain a JSON object' };
  }
  const rec = data as Record<string, unknown>;
  if (typeof rec.appVersion !== 'string' || rec.appVersion.length === 0) {
    return {
      ok: false,
      error: 'missing app version metadata, so this is not a floorplanner export',
    };
  }
  const fileMajor = Number.parseInt(rec.appVersion.split('.')[0] ?? '', 10);
  const appMajor = Number.parseInt(APP_VERSION.split('.')[0], 10);
  if (Number.isFinite(fileMajor) && Number.isFinite(appMajor) && fileMajor > appMajor) {
    return { ok: false, error: `the file was written by a newer app version (${rec.appVersion})` };
  }
  const doc = sanitizeDoc(rec.doc);
  if (!doc) {
    return { ok: false, error: 'the plan data is invalid or uses an unsupported format' };
  }
  // sanitizeDoc culls invalid entries; if the file claimed walls but none
  // survived, treat the file as broken instead of silently importing nothing
  const rawDoc = rec.doc;
  if (
    typeof rawDoc === 'object' &&
    rawDoc !== null &&
    typeof (rawDoc as Record<string, unknown>).walls === 'object' &&
    (rawDoc as Record<string, unknown>).walls !== null &&
    Object.keys((rawDoc as Record<string, unknown>).walls as object).length > 0 &&
    Object.keys(doc.walls).length === 0
  ) {
    return { ok: false, error: 'the plan data is invalid or uses an unsupported format' };
  }
  return { ok: true, doc };
}

/** Local timestamp, filename-safe (no colons): 2026-08-25_14-30-05 */
function fileStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
  );
}

export function downloadPlan(doc: PlanDoc): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([serializeExport(doc)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `floorplan_${fileStamp()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
