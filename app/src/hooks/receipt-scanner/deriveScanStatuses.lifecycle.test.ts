/**
 * Lifecycle integration tests for deriveScanStatuses.
 *
 * These tests simulate the full state-transition sequences that occur during
 * real scan/rescan/categorize flows, verifying that the derived status maps
 * remain correct across multiple scan cycles.
 *
 * The core insight being tested: after a scan completes the Rust backend may
 * update the receipt's imagePath (e.g. original.jpg → processed.jpg), but
 * all status maps (jobKeys, queueScanResults, perImageScanStatus) are still
 * keyed by the **original** tracking basePath registered at init time.  The
 * thumbnail strip must use `receiptBasePathMap[id]` — not the cache's
 * `record.imagePath` — to look up the correct status.
 */

import { describe, it, expect } from 'vitest';
import { deriveScanStatuses } from './deriveScanStatuses';
import type { DerivedScanStatuses } from './deriveScanStatuses';
import type { JobStatus, TabMemoryScanResult } from '../../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeResult(overrides?: Partial<TabMemoryScanResult>): TabMemoryScanResult {
	return {
		result: { rows: [] },
		editableData: { rows: [] },
		scanId: 1,
		persistedSignature: 'sig',
		imagePath: '/img.jpg',
		processedImagePath: null,
		...overrides,
	};
}

function makeJob(phase: JobStatus['phase'], jobKey = 'scan-abc'): JobStatus {
	return { jobKey, runId: 1, record: null, seq: 1, phase, error: null };
}

const EMPTY = new Map<string, JobStatus>();

// ── Full rescan lifecycle ─────────────────────────────────────────────────────

describe('deriveScanStatuses — rescan lifecycle', () => {
	const ORIGINAL = '/receipts/original.jpg';
	const PROCESSED = '/receipts/processed_ts1.jpg';
	const PROCESSED_2 = '/receipts/processed_ts2.jpg';

	it('Phase 1: initial scan — pre-store creates scanning status', () => {
		// scan() pre-stores: jobKeys[original] = scanSourcePath (non-numeric)
		// queueScanResults is empty (cleared)
		const r = deriveScanStatuses(
			{},
			{ [ORIGINAL]: ORIGINAL },
			EMPTY,
			undefined,
			undefined,
		);
		expect(r.perImageScanStatus[ORIGINAL]).toBe('scanning');
		expect(r.isScanQueued[ORIGINAL]).toBeUndefined();
	});

	it('Phase 2: initial scan — job arrives in queued phase', () => {
		const jobs = new Map([
			[ORIGINAL, makeJob('queued', ORIGINAL)],
		]);
		const r = deriveScanStatuses(
			{},
			{ [ORIGINAL]: ORIGINAL },
			jobs,
			undefined,
			undefined,
		);
		expect(r.perImageScanStatus[ORIGINAL]).toBe('scanning');
		expect(r.isScanQueued[ORIGINAL]).toBe(true);
	});

	it('Phase 3: initial scan — job transitions to scanning', () => {
		const jobs = new Map([
			[ORIGINAL, makeJob('scanning', ORIGINAL)],
		]);
		const r = deriveScanStatuses(
			{},
			{ [ORIGINAL]: ORIGINAL },
			jobs,
			undefined,
			undefined,
		);
		expect(r.perImageScanStatus[ORIGINAL]).toBe('scanning');
	});

	it('Phase 4: initial scan — job transitions to categorizing', () => {
		const jobs = new Map([
			[ORIGINAL, makeJob('categorizing', ORIGINAL)],
		]);
		const r = deriveScanStatuses(
			{},
			{ [ORIGINAL]: ORIGINAL },
			jobs,
			undefined,
			undefined,
		);
		expect(r.perImageScanStatus[ORIGINAL]).toBe('categorizing');
	});

	it('Phase 5: initial scan done — jobKey remapped to numeric', () => {
		// Done handler remaps: jobKeys[original] = "42", queueScanResults[original] = result
		const r = deriveScanStatuses(
			{
				[ORIGINAL]: makeResult({
					scanId: 42,
					imagePath: PROCESSED,
					processedImagePath: PROCESSED,
				}),
			},
			{ [ORIGINAL]: '42' },
			EMPTY,
			undefined,
			undefined,
		);
		expect(r.perImageScanStatus[ORIGINAL]).toBe('done');
		// No categorizing status without a categorize job
		expect(r.perImageCategorizeStatus[ORIGINAL]).toBeUndefined();
	});

	it('Phase 6: 2nd scan pre-store — clears result, sets non-numeric key', () => {
		// scan() clears queueScanResults[original], sets jobKeys[original] = newScanSource
		const newScanSource = PROCESSED; // The file on disk after 1st scan
		const r = deriveScanStatuses(
			{}, // queueScanResults cleared
			{ [ORIGINAL]: newScanSource }, // non-numeric key
			EMPTY,
			undefined,
			undefined,
		);
		expect(r.perImageScanStatus[ORIGINAL]).toBe('scanning');
	});

	it('Phase 7: 2nd scan completes — same tracking key, new processed path', () => {
		const r = deriveScanStatuses(
			{
				[ORIGINAL]: makeResult({
					scanId: 42,
					imagePath: PROCESSED_2,
					processedImagePath: PROCESSED_2,
				}),
			},
			{ [ORIGINAL]: '42' },
			EMPTY,
			undefined,
			undefined,
		);
		expect(r.perImageScanStatus[ORIGINAL]).toBe('done');
	});

	it('Phase 8: 3rd scan pre-store — still uses original tracking key', () => {
		const r = deriveScanStatuses(
			{},
			{ [ORIGINAL]: PROCESSED_2 },
			EMPTY,
			undefined,
			undefined,
		);
		expect(r.perImageScanStatus[ORIGINAL]).toBe('scanning');
	});
});

// ── Lookup key mismatch (the bug this fix addresses) ──────────────────────────

describe('deriveScanStatuses — basePath key mismatch after rescan', () => {
	const ORIGINAL = '/receipts/costco.jpg';
	const PROCESSED = '/receipts/costco_processed.jpg';

	it('status is undefined when looked up by processed path (stale cache key)', () => {
		// After 2nd scan starts: jobKeys[ORIGINAL] = scanSource, queueScanResults cleared
		const r = deriveScanStatuses(
			{},
			{ [ORIGINAL]: '/receipts/scan-source.jpg' },
			EMPTY,
			undefined,
			undefined,
		);
		// Correct lookup via ORIGINAL → scanning
		expect(r.perImageScanStatus[ORIGINAL]).toBe('scanning');
		// Wrong lookup via PROCESSED (what record?.imagePath would return) → undefined
		expect(r.perImageScanStatus[PROCESSED]).toBeUndefined();
	});

	it('receiptBasePathMap resolves the correct key for the thumbnail strip', () => {
		// Simulate: receiptBasePathMap[42] = ORIGINAL, cache record.imagePath = PROCESSED
		const receiptBasePathMap: Record<number, string> = { 42: ORIGINAL };

		const r = deriveScanStatuses(
			{},
			{ [ORIGINAL]: '/receipts/scan-source.jpg' },
			EMPTY,
			undefined,
			undefined,
		);

		// The thumbnail strip should use receiptBasePathMap[id] to get the tracking key
		const thumbnailLookupKey = receiptBasePathMap[42]; // ORIGINAL
		expect(r.perImageScanStatus[thumbnailLookupKey]).toBe('scanning');
	});
});

// ── Categorize job lifecycle ──────────────────────────────────────────────────

describe('deriveScanStatuses — categorize lifecycle', () => {
	const ORIGINAL = '/receipts/receipt.jpg';

	it('standalone categorize — numeric key with queued phase', () => {
		const jobs = new Map([['42', makeJob('queued', '42')]]);
		const r = deriveScanStatuses(
			{ [ORIGINAL]: makeResult({ scanId: 42 }) },
			{ [ORIGINAL]: '42' },
			jobs,
			undefined,
			undefined,
		);
		expect(r.perImageScanStatus[ORIGINAL]).toBe('done');
		expect(r.perImageCategorizeStatus[ORIGINAL]).toBe('categorizing');
	});

	it('standalone categorize — numeric key with categorizing phase', () => {
		const jobs = new Map([['42', makeJob('categorizing', '42')]]);
		const r = deriveScanStatuses(
			{ [ORIGINAL]: makeResult({ scanId: 42 }) },
			{ [ORIGINAL]: '42' },
			jobs,
			undefined,
			undefined,
		);
		expect(r.perImageScanStatus[ORIGINAL]).toBe('done');
		expect(r.perImageCategorizeStatus[ORIGINAL]).toBe('categorizing');
	});

	it('standalone categorize — completes (done phase)', () => {
		const jobs = new Map([['42', makeJob('done', '42')]]);
		const r = deriveScanStatuses(
			{ [ORIGINAL]: makeResult({ scanId: 42 }) },
			{ [ORIGINAL]: '42' },
			jobs,
			undefined,
			undefined,
		);
		expect(r.perImageScanStatus[ORIGINAL]).toBe('done');
		expect(r.perImageCategorizeStatus[ORIGINAL]).toBeUndefined();
	});

	it('categorize after rescan uses same tracking key', () => {
		// After 2nd scan completes, categorize job uses numeric key
		const jobs = new Map([['42', makeJob('categorizing', '42')]]);
		const r = deriveScanStatuses(
			{
				[ORIGINAL]: makeResult({
					scanId: 42,
					imagePath: '/receipts/processed_v2.jpg',
				}),
			},
			{ [ORIGINAL]: '42' },
			jobs,
			undefined,
			undefined,
		);
		expect(r.perImageScanStatus[ORIGINAL]).toBe('done');
		expect(r.perImageCategorizeStatus[ORIGINAL]).toBe('categorizing');
	});
});

// ── Multiple receipts (editor workspace) ──────────────────────────────────────

describe('deriveScanStatuses — multi-receipt editor workspace', () => {
	const PATH_A = '/receipts/receipt-a.jpg';
	const PATH_B = '/receipts/receipt-b.jpg';
	const PATH_C = '/receipts/receipt-c.jpg';

	it('independent scans: one scanning, one done, one queued', () => {
		const jobs = new Map([
			['scan-a', makeJob('scanning', 'scan-a')],
			['scan-c', makeJob('queued', 'scan-c')],
		]);
		const r = deriveScanStatuses(
			{ [PATH_B]: makeResult({ scanId: 2 }) },
			{
				[PATH_A]: 'scan-a',
				[PATH_B]: '2',
				[PATH_C]: 'scan-c',
			},
			jobs,
			undefined,
			undefined,
		);
		expect(r.perImageScanStatus[PATH_A]).toBe('scanning');
		expect(r.perImageScanStatus[PATH_B]).toBe('done');
		expect(r.perImageScanStatus[PATH_C]).toBe('scanning');
		expect(r.isScanQueued[PATH_A]).toBeUndefined();
		expect(r.isScanQueued[PATH_C]).toBe(true);
	});

	it('mixed: one rescanning, one categorizing, one idle', () => {
		const jobs = new Map([
			['scan-a-v2', makeJob('scanning', 'scan-a-v2')],
			['2', makeJob('categorizing', '2')],
		]);
		const r = deriveScanStatuses(
			{ [PATH_C]: makeResult({ scanId: 3 }) },
			{
				[PATH_A]: 'scan-a-v2',
				[PATH_B]: '2',
				[PATH_C]: '3',
			},
			jobs,
			undefined,
			undefined,
		);
		expect(r.perImageScanStatus[PATH_A]).toBe('scanning');
		expect(r.perImageScanStatus[PATH_B]).toBe('done');
		expect(r.perImageScanStatus[PATH_C]).toBe('done');
		expect(r.perImageCategorizeStatus[PATH_B]).toBe('categorizing');
	});

	it('error on one receipt does not affect others', () => {
		// When a scan errors, the error handler removes the jobKey and stores
		// the error in queueErrors.  Only queueErrors drives the 'error' status.
		const r = deriveScanStatuses(
			{ [PATH_B]: makeResult({ scanId: 2 }) },
			{
				// PATH_A has no jobKey (removed by error handler)
				[PATH_B]: '2',
			},
			EMPTY,
			undefined,
			{ [PATH_A]: 'OCR failed' },
		);
		expect(r.perImageScanStatus[PATH_A]).toBe('error');
		expect(r.perImageScanStatus[PATH_B]).toBe('done');
	});
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('deriveScanStatuses — edge cases', () => {
	it('empty inputs produce empty outputs', () => {
		const r = deriveScanStatuses({}, {}, EMPTY, undefined, undefined);
		expect(r.perImageScanStatus).toEqual({});
		expect(r.isScanQueued).toEqual({});
		expect(r.perImageCategorizeStatus).toEqual({});
	});

	it('queueErrors override scan result status', () => {
		const r = deriveScanStatuses(
			{ '/a.jpg': makeResult() },
			{},
			EMPTY,
			undefined,
			{ '/a.jpg': 'Save failed' },
		);
		expect(r.perImageScanStatus['/a.jpg']).toBe('error');
	});

	it('active job overrides queueErrors', () => {
		const jobs = new Map([['scan-a', makeJob('scanning', 'scan-a')]]);
		const r = deriveScanStatuses(
			{},
			{ '/a.jpg': 'scan-a' },
			jobs,
			undefined,
			{ '/a.jpg': 'stale error' },
		);
		expect(r.perImageScanStatus['/a.jpg']).toBe('scanning');
	});

	it('cancelling path overrides scanning job', () => {
		const jobs = new Map([['scan-a', makeJob('scanning', 'scan-a')]]);
		const r = deriveScanStatuses(
			{},
			{ '/a.jpg': 'scan-a' },
			jobs,
			new Set(['/a.jpg']),
			undefined,
		);
		expect(r.perImageScanStatus['/a.jpg']).toBe('cancelling');
	});

	it('rescan after error — pre-store clears error and shows scanning', () => {
		// User retries after an error: scan() clears queueErrors, pre-stores new key
		const r = deriveScanStatuses(
			{},
			{ '/a.jpg': '/a_source.jpg' },
			EMPTY,
			undefined,
			{}, // queueErrors cleared
		);
		expect(r.perImageScanStatus['/a.jpg']).toBe('scanning');
	});

	it('rescan after cancel — pre-store clears cancelled state', () => {
		const r = deriveScanStatuses(
			{},
			{ '/a.jpg': '/a_source.jpg' },
			EMPTY,
			undefined, // cancellingPaths cleared
			undefined,
		);
		expect(r.perImageScanStatus['/a.jpg']).toBe('scanning');
	});
});

// ── Full multi-scan sequence simulation ───────────────────────────────────────

describe('deriveScanStatuses — complete 3-scan sequence', () => {
	const BASE = '/receipts/grocery-store.jpg';
	const PROC_V1 = '/receipts/grocery-store_v1.jpg';
	const PROC_V2 = '/receipts/grocery-store_v2.jpg';
	const PROC_V3 = '/receipts/grocery-store_v3.jpg';

	/**
	 * Simulate the complete state at each point in a 3-scan lifecycle,
	 * verifying that `perImageScanStatus[BASE]` transitions correctly.
	 */
	const steps: Array<{
		label: string;
		queueScanResults: Record<string, TabMemoryScanResult>;
		jobKeys: Record<string, string>;
		jobs: Map<string, JobStatus>;
		expected: DerivedScanStatuses['perImageScanStatus'][string];
	}> = [
		{
			label: '1st scan: pre-store (no job yet)',
			queueScanResults: {},
			jobKeys: { [BASE]: BASE },
			jobs: new Map(),
			expected: 'scanning',
		},
		{
			label: '1st scan: job queued',
			queueScanResults: {},
			jobKeys: { [BASE]: BASE },
			jobs: new Map([[BASE, makeJob('queued', BASE)]]),
			expected: 'scanning',
		},
		{
			label: '1st scan: job scanning',
			queueScanResults: {},
			jobKeys: { [BASE]: BASE },
			jobs: new Map([[BASE, makeJob('scanning', BASE)]]),
			expected: 'scanning',
		},
		{
			label: '1st scan: done (remapped to numeric)',
			queueScanResults: { [BASE]: makeResult({ scanId: 10, imagePath: PROC_V1 }) },
			jobKeys: { [BASE]: '10' },
			jobs: new Map(),
			expected: 'done',
		},
		{
			label: '2nd scan: pre-store (results cleared, new non-numeric key)',
			queueScanResults: {},
			jobKeys: { [BASE]: PROC_V1 }, // scan source = last processed image
			jobs: new Map(),
			expected: 'scanning',
		},
		{
			label: '2nd scan: job scanning',
			queueScanResults: {},
			jobKeys: { [BASE]: PROC_V1 },
			jobs: new Map([[PROC_V1, makeJob('scanning', PROC_V1)]]),
			expected: 'scanning',
		},
		{
			label: '2nd scan: done (remapped)',
			queueScanResults: { [BASE]: makeResult({ scanId: 10, imagePath: PROC_V2 }) },
			jobKeys: { [BASE]: '10' },
			jobs: new Map(),
			expected: 'done',
		},
		{
			label: '3rd scan: pre-store',
			queueScanResults: {},
			jobKeys: { [BASE]: PROC_V2 },
			jobs: new Map(),
			expected: 'scanning',
		},
		{
			label: '3rd scan: done',
			queueScanResults: { [BASE]: makeResult({ scanId: 10, imagePath: PROC_V3 }) },
			jobKeys: { [BASE]: '10' },
			jobs: new Map(),
			expected: 'done',
		},
	];

	for (const step of steps) {
		it(step.label, () => {
			const r = deriveScanStatuses(
				step.queueScanResults,
				step.jobKeys,
				step.jobs,
				undefined,
				undefined,
			);
			expect(r.perImageScanStatus[BASE]).toBe(step.expected);
		});
	}
});
