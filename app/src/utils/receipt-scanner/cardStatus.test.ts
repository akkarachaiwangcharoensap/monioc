import { describe, it, expect } from 'vitest';
import { getCardStatus } from './cardStatus';
import type { Task } from '../../context/TaskManagerContext';

function makeTask(overrides: Partial<Task>): Task {
	return {
		id: 'task-1',
		label: 'Scan',
		phase: 'scanning',
		progress: 0,
		startedAt: Date.now(),
		status: 'active',
		canCancel: true,
		_jobKey: 'scan-abc',
		...overrides,
	} as Task;
}

describe('getCardStatus', () => {
	it('returns idle when no task, no status, and no done phase', () => {
		expect(getCardStatus('/a.jpg', {}, {}, {})).toBe('idle');
	});

	it('returns error when the task is cancelled', () => {
		const taskForPath = {
			'/a.jpg': makeTask({ status: 'cancelled' }),
		};
		expect(getCardStatus('/a.jpg', {}, taskForPath, {})).toBe('error');
	});

	it('returns error when the task has error status', () => {
		const taskForPath = {
			'/a.jpg': makeTask({ status: 'error' }),
		};
		expect(getCardStatus('/a.jpg', {}, taskForPath, {})).toBe('error');
	});

	it('returns scanning for an active scan task', () => {
		const taskForPath = {
			'/a.jpg': makeTask({ status: 'active', phase: 'Scanning...' }),
		};
		expect(getCardStatus('/a.jpg', {}, taskForPath, {})).toBe('scanning');
	});

	it('returns categorizing when task phase contains "categoriz"', () => {
		const taskForPath = {
			'/a.jpg': makeTask({ status: 'active', phase: 'Categorizing items' }),
		};
		expect(getCardStatus('/a.jpg', {}, taskForPath, {})).toBe('categorizing');
	});

	it('returns cancelling when task status is cancelling', () => {
		const taskForPath = {
			'/a.jpg': makeTask({ status: 'cancelling' }),
		};
		expect(getCardStatus('/a.jpg', {}, taskForPath, {})).toBe('cancelling');
	});

	it('returns error when perImageScanStatus is error', () => {
		expect(getCardStatus('/a.jpg', {}, {}, { '/a.jpg': 'error' })).toBe('error');
	});

	it('returns check when perImageScanStatus is done', () => {
		expect(getCardStatus('/a.jpg', {}, {}, { '/a.jpg': 'done' })).toBe('check');
	});

	it('returns check from donePhase', () => {
		expect(getCardStatus('/a.jpg', { '/a.jpg': 'check' }, {}, {})).toBe('check');
	});

	it('returns exit from donePhase', () => {
		expect(getCardStatus('/a.jpg', { '/a.jpg': 'exit' }, {}, {})).toBe('exit');
	});
});
