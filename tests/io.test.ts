import { describe, expect, test } from 'bun:test';
import { parseImport, serializeExport } from '../src/lib/model/io';
import { addWall, emptyDoc } from '../src/lib/model/ops';
import { APP_VERSION } from '../src/lib/version';

describe('io', () => {
	test('export → import round-trips the doc', () => {
		const { doc } = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 100, y: 0 });
		const parsed = parseImport(serializeExport(doc));
		expect(parsed.ok).toBe(true);
		if (parsed.ok) expect(parsed.doc).toEqual(doc);
	});

	test('export payload carries metadata', () => {
		const raw = JSON.parse(serializeExport(emptyDoc())) as Record<string, unknown>;
		expect(raw.app).toBe('floorplanner');
		expect(raw.appVersion).toBe(APP_VERSION);
		expect(typeof raw.exportedAt).toBe('string');
	});

	test('rejects json without app version metadata', () => {
		const { doc } = addWall(emptyDoc(), { x: 0, y: 0 }, { x: 5, y: 0 });
		const parsed = parseImport(JSON.stringify(doc));
		expect(parsed.ok).toBe(false);
		if (!parsed.ok) expect(parsed.error).toContain('version');
	});

	test('rejects invalid json and non-objects', () => {
		expect(parseImport('not json').ok).toBe(false);
		expect(parseImport('[1,2]').ok).toBe(false);
	});

	test('rejects files from a newer major version', () => {
		const payload = {
			app: 'floorplanner',
			appVersion: '99.0.0',
			exportedAt: '2026-01-01T00:00:00Z',
			doc: emptyDoc()
		};
		const parsed = parseImport(JSON.stringify(payload));
		expect(parsed.ok).toBe(false);
		if (!parsed.ok) expect(parsed.error).toContain('newer');
	});

	test('accepts same-version metadata with valid doc', () => {
		const payload = {
			app: 'floorplanner',
			appVersion: '0.0.1',
			exportedAt: '2026-01-01T00:00:00Z',
			doc: emptyDoc()
		};
		expect(parseImport(JSON.stringify(payload)).ok).toBe(true);
	});

	test('rejects valid metadata but broken plan data', () => {
		const payload = {
			app: 'floorplanner',
			appVersion: APP_VERSION,
			exportedAt: '2026-01-01T00:00:00Z',
			doc: { version: 1, joints: {}, walls: { w1: { garbage: true } } }
		};
		const parsed = parseImport(JSON.stringify(payload));
		expect(parsed.ok).toBe(false);
		if (!parsed.ok) expect(parsed.error).toContain('invalid');
	});
});
