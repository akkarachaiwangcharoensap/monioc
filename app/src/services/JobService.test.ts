import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appBus } from './bus';
import type { BusJobStatusEvent } from './bus';

// Mock TauriApi before importing JobService so the mock is in place.
const mockScanReceipt = vi.fn<(p: unknown) => Promise<string>>();
const mockInferItemCategories = vi.fn<(p: unknown) => Promise<string>>();
const mockCancelJob = vi.fn<(k: string) => Promise<void>>();

vi.mock('./api', () => ({
    TauriApi: {
        scanReceipt: (p: unknown) => mockScanReceipt(p),
        inferItemCategories: (p: unknown) => mockInferItemCategories(p),
        cancelJob: (k: string) => mockCancelJob(k),
    },
}));

import { JobService } from './JobService';

function emitTerminal(jobKey: string, phase: 'done' | 'cancelled' | 'error'): void {
    const event: BusJobStatusEvent = {
        jobKey,
        phase,
        kind: 'scan',
        tabId: null,
        runId: 1,
        seq: 1,
        record: null,
        error: null,
    };
    appBus.emit('job:status', event);
}

beforeEach(() => {
    vi.clearAllMocks();
    JobService._reset();
});

describe('JobService.submitScan', () => {
    it('calls TauriApi.scanReceipt with the given params and returns jobKey', async () => {
        mockScanReceipt.mockResolvedValue('/path/to/image.jpg');
        const key = await JobService.submitScan({
            imagePath: '/path/to/image.jpg',
            withAutoCat: false,
            categories: [],
            tabId: 'tab-A',
        });
        expect(key).toBe('/path/to/image.jpg');
        expect(mockScanReceipt).toHaveBeenCalledOnce();
    });

    it('registers job attribution for the tab', async () => {
        mockScanReceipt.mockResolvedValue('job-1');
        await JobService.submitScan({ imagePath: 'job-1', withAutoCat: false, categories: [], tabId: 'tab-A' });
        expect(JobService.getJobKeysForTab('tab-A').has('job-1')).toBe(true);
        expect(JobService.getTabIdForJob('job-1')).toBe('tab-A');
    });

    it('does not register attribution when tabId is null', async () => {
        mockScanReceipt.mockResolvedValue('job-2');
        await JobService.submitScan({ imagePath: 'job-2', withAutoCat: false, categories: [], tabId: null });
        expect(JobService.getTabIdForJob('job-2')).toBeNull();
    });
});

describe('JobService.submitCategorize', () => {
    it('calls TauriApi.inferItemCategories and returns jobKey', async () => {
        mockInferItemCategories.mockResolvedValue('42');
        const key = await JobService.submitCategorize({
            receiptId: 42,
            items: ['milk'],
            categories: ['Dairy'],
            data: { rows: [], storeName: '', date: '', total: '', tax: '' } as never,
            tabId: 'tab-B',
        });
        expect(key).toBe('42');
        expect(JobService.getJobKeysForTab('tab-B').has('42')).toBe(true);
    });
});

describe('JobService.cancel', () => {
    it('delegates to TauriApi.cancelJob', async () => {
        mockCancelJob.mockResolvedValue(undefined);
        await JobService.cancel('job-key');
        expect(mockCancelJob).toHaveBeenCalledWith('job-key');
    });
});

describe('JobService.cancelByTab', () => {
    it('cancels all jobs for the tab', async () => {
        mockScanReceipt
            .mockResolvedValueOnce('job-a')
            .mockResolvedValueOnce('job-b');
        mockCancelJob.mockResolvedValue(undefined);

        await JobService.submitScan({ imagePath: 'job-a', withAutoCat: false, categories: [], tabId: 'tab-C' });
        await JobService.submitScan({ imagePath: 'job-b', withAutoCat: false, categories: [], tabId: 'tab-C' });

        await JobService.cancelByTab('tab-C');
        expect(mockCancelJob).toHaveBeenCalledTimes(2);
    });

    it('is a no-op for unknown tab', async () => {
        await JobService.cancelByTab('unknown-tab');
        expect(mockCancelJob).not.toHaveBeenCalled();
    });
});

describe('attribution cleanup on terminal events', () => {
    it('removes job from registry on done', async () => {
        mockScanReceipt.mockResolvedValue('job-done');
        await JobService.submitScan({ imagePath: 'job-done', withAutoCat: false, categories: [], tabId: 'tab-D' });
        expect(JobService.getTabIdForJob('job-done')).toBe('tab-D');

        emitTerminal('job-done', 'done');
        expect(JobService.getTabIdForJob('job-done')).toBeNull();
        expect(JobService.getJobKeysForTab('tab-D').has('job-done')).toBe(false);
    });

    it('removes job from registry on cancelled', async () => {
        mockScanReceipt.mockResolvedValue('job-cancel');
        await JobService.submitScan({ imagePath: 'job-cancel', withAutoCat: false, categories: [], tabId: 'tab-E' });
        emitTerminal('job-cancel', 'cancelled');
        expect(JobService.getTabIdForJob('job-cancel')).toBeNull();
    });

    it('removes job from registry on error', async () => {
        mockScanReceipt.mockResolvedValue('job-error');
        await JobService.submitScan({ imagePath: 'job-error', withAutoCat: false, categories: [], tabId: 'tab-F' });
        emitTerminal('job-error', 'error');
        expect(JobService.getTabIdForJob('job-error')).toBeNull();
    });
});
