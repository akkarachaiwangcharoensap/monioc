import { describe, it, expect } from 'vitest';
import { deriveScanStatuses } from './deriveScanStatuses';
import type { JobStatus, TabMemoryScanResult } from '../../types';

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

function makeJob(phase: JobStatus['phase'], error?: string): JobStatus {
	return { jobKey: 'scan-abc', runId: 1, record: null, seq: 1, phase, error: error ?? null };
}

const EMPTY_JOBS = new Map<string, JobStatus>();

describe('deriveScanStatuses', () => {
	describe('perImageScanStatus', () => {
		it('marks paths with scan results as done', () => {
			const result = deriveScanStatuses(
				{ '/a.jpg': makeResult() },
				{},
				EMPTY_JOBS,
				undefined,
				undefined,
			);
			expect(result.perImageScanStatus['/a.jpg']).toBe('done');
		});

		it('marks paths with errorMsg in scan results as error', () => {
			const result = deriveScanStatuses(
				{ '/a.jpg': makeResult({ errorMsg: 'fail' } as Partial<TabMemoryScanResult>) },
				{},
				EMPTY_JOBS,
				undefined,
				undefined,
			);
			expect(result.perImageScanStatus['/a.jpg']).toBe('error');
		});

		it('marks paths in queueErrors as error', () => {
			const result = deriveScanStatuses(
				{ '/a.jpg': makeResult() },
				{},
				EMPTY_JOBS,
				undefined,
				{ '/a.jpg': 'Save failed' },
			);
			expect(result.perImageScanStatus['/a.jpg']).toBe('error');
		});

		it('marks paths with active scan job key (no job found) as scanning', () => {
			const result = deriveScanStatuses(
				{},
				{ '/a.jpg': 'scan-abc' },
				EMPTY_JOBS,
				undefined,
				undefined,
			);
			expect(result.perImageScanStatus['/a.jpg']).toBe('scanning');
		});

		it('reflects active job phase for scanning jobs', () => {
			const jobs = new Map([['scan-abc', makeJob('scanning')]]);
			const result = deriveScanStatuses(
				{},
				{ '/a.jpg': 'scan-abc' },
				jobs,
				undefined,
				undefined,
			);
			expect(result.perImageScanStatus['/a.jpg']).toBe('scanning');
		});

		it('reflects categorizing phase from active job', () => {
			const jobs = new Map([['scan-abc', makeJob('categorizing')]]);
			const result = deriveScanStatuses(
				{},
				{ '/a.jpg': 'scan-abc' },
				jobs,
				undefined,
				undefined,
			);
			expect(result.perImageScanStatus['/a.jpg']).toBe('categorizing');
		});

		it('reflects done phase from active job', () => {
			const jobs = new Map([['scan-abc', makeJob('done')]]);
			const result = deriveScanStatuses(
				{},
				{ '/a.jpg': 'scan-abc' },
				jobs,
				undefined,
				undefined,
			);
			expect(result.perImageScanStatus['/a.jpg']).toBe('done');
		});

		it('reflects error phase from active job', () => {
			const jobs = new Map([['scan-abc', makeJob('error', 'OCR failed')]]);
			const result = deriveScanStatuses(
				{},
				{ '/a.jpg': 'scan-abc' },
				jobs,
				undefined,
				undefined,
			);
			expect(result.perImageScanStatus['/a.jpg']).toBe('error');
		});

		it('reflects cancelled phase as error', () => {
			const jobs = new Map([['scan-abc', makeJob('cancelled')]]);
			const result = deriveScanStatuses(
				{},
				{ '/a.jpg': 'scan-abc' },
				jobs,
				undefined,
				undefined,
			);
			expect(result.perImageScanStatus['/a.jpg']).toBe('error');
		});

		it('marks cancelling paths as cancelling', () => {
			const result = deriveScanStatuses(
				{},
				{ '/a.jpg': 'scan-abc' },
				EMPTY_JOBS,
				new Set(['/a.jpg']),
				undefined,
			);
			expect(result.perImageScanStatus['/a.jpg']).toBe('cancelling');
		});

		it('cancelling overrides active job phase', () => {
			const jobs = new Map([['scan-abc', makeJob('scanning')]]);
			const result = deriveScanStatuses(
				{},
				{ '/a.jpg': 'scan-abc' },
				jobs,
				new Set(['/a.jpg']),
				undefined,
			);
			expect(result.perImageScanStatus['/a.jpg']).toBe('cancelling');
		});

		it('numeric job key (categorize) defaults to done without overriding', () => {
			const result = deriveScanStatuses(
				{},
				{ '/a.jpg': '42' },
				EMPTY_JOBS,
				undefined,
				undefined,
			);
			expect(result.perImageScanStatus['/a.jpg']).toBe('done');
		});

		it('preserves existing status for numeric job keys', () => {
			const result = deriveScanStatuses(
				{ '/a.jpg': makeResult() },
				{ '/a.jpg': '42' },
				EMPTY_JOBS,
				undefined,
				undefined,
			);
			expect(result.perImageScanStatus['/a.jpg']).toBe('done');
		});
	});

	describe('isScanQueued', () => {
		it('is empty when no jobs are queued', () => {
			const result = deriveScanStatuses(
				{},
				{ '/a.jpg': 'scan-abc' },
				new Map([['scan-abc', makeJob('scanning')]]),
				undefined,
				undefined,
			);
			expect(result.isScanQueued).toEqual({});
		});

		it('marks path as queued when job phase is queued', () => {
			const result = deriveScanStatuses(
				{},
				{ '/a.jpg': 'scan-abc' },
				new Map([['scan-abc', makeJob('queued')]]),
				undefined,
				undefined,
			);
			expect(result.isScanQueued['/a.jpg']).toBe(true);
		});

		it('skips numeric job keys (categorize jobs)', () => {
			const result = deriveScanStatuses(
				{},
				{ '/a.jpg': '42' },
				new Map([['42', makeJob('queued')]]),
				undefined,
				undefined,
			);
			expect(result.isScanQueued).toEqual({});
		});
	});

	describe('perImageCategorizeStatus', () => {
		it('marks categorize job in queued phase', () => {
			const result = deriveScanStatuses(
				{},
				{ '/a.jpg': '42' },
				new Map([['42', makeJob('queued')]]),
				undefined,
				undefined,
			);
			expect(result.perImageCategorizeStatus['/a.jpg']).toBe('categorizing');
		});

		it('marks categorize job in categorizing phase', () => {
			const result = deriveScanStatuses(
				{},
				{ '/a.jpg': '42' },
				new Map([['42', makeJob('categorizing')]]),
				undefined,
				undefined,
			);
			expect(result.perImageCategorizeStatus['/a.jpg']).toBe('categorizing');
		});

		it('does not mark categorize job in done phase', () => {
			const result = deriveScanStatuses(
				{},
				{ '/a.jpg': '42' },
				new Map([['42', makeJob('done')]]),
				undefined,
				undefined,
			);
			expect(result.perImageCategorizeStatus['/a.jpg']).toBeUndefined();
		});

		it('does not mark non-numeric job keys as categorizing', () => {
			const result = deriveScanStatuses(
				{},
				{ '/a.jpg': 'scan-abc' },
				new Map([['scan-abc', makeJob('categorizing')]]),
				undefined,
				undefined,
			);
			expect(result.perImageCategorizeStatus['/a.jpg']).toBeUndefined();
		});
	});

	describe('multiple paths', () => {
		it('derives independent statuses for each path', () => {
			const jobs = new Map<string, JobStatus>([
				['scan-a', makeJob('scanning')],
				['42', makeJob('categorizing')],
			]);
			const result = deriveScanStatuses(
				{ '/c.jpg': makeResult() },
				{ '/a.jpg': 'scan-a', '/b.jpg': '42' },
				jobs,
				undefined,
				undefined,
			);
			expect(result.perImageScanStatus['/a.jpg']).toBe('scanning');
			expect(result.perImageScanStatus['/b.jpg']).toBe('done');
			expect(result.perImageScanStatus['/c.jpg']).toBe('done');
			expect(result.perImageCategorizeStatus['/b.jpg']).toBe('categorizing');
		});
	});

	describe('retry after cancel/error', () => {
		it('error status allows retry: new job key replaces old errored status', () => {
			// Simulate: old job errored, new job submitted with fresh key
			const jobs = new Map<string, JobStatus>([
				['scan-new', makeJob('scanning')],
			]);
			const result = deriveScanStatuses(
				{},
				{ '/a.jpg': 'scan-new' },
				jobs,
				undefined,
				undefined,
			);
			// After retry, status transitions from error to scanning
			expect(result.perImageScanStatus['/a.jpg']).toBe('scanning');
		});

		it('queueErrors is overridden by a new active job', () => {
			// Old job left an error in queueErrors, but a new job is now active
			const jobs = new Map<string, JobStatus>([
				['scan-retry', makeJob('scanning')],
			]);
			const result = deriveScanStatuses(
				{},
				{ '/a.jpg': 'scan-retry' },
				jobs,
				undefined,
				{ '/a.jpg': 'Previous scan failed' },
			);
			// Active job overrides the stale queueErrors entry
			expect(result.perImageScanStatus['/a.jpg']).toBe('scanning');
		});

		it('cancelled job shows error status (retryable)', () => {
			const jobs = new Map<string, JobStatus>([
				['scan-abc', makeJob('cancelled')],
			]);
			const result = deriveScanStatuses(
				{},
				{ '/a.jpg': 'scan-abc' },
				jobs,
				undefined,
				undefined,
			);
			expect(result.perImageScanStatus['/a.jpg']).toBe('error');
		});
	});
});
