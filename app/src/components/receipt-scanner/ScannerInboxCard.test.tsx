/**
 * Unit tests for ScannerInboxCard thumbnail fallback and reset behaviour.
 *
 * Validates:
 *  1. Thumbnail uses stagingPath when present.
 *  2. Thumbnail skips stagingPath when null (uses filePath instead).
 *  3. When the entry is re-rendered with stagingPath cleared (same id),
 *     the component resets its internal fallback index so the stale
 *     staging image is no longer shown.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ScannerInboxCard from './ScannerInboxCard';
import type { ScannerInboxCardProps } from './ScannerInboxCard';
import type { ImageLibraryEntry } from '../../types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// convertFileSrc: identity function (same as the E2E shim).
vi.mock('@tauri-apps/api/core', () => ({
	convertFileSrc: (path: string) => path,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntry(
	overrides: Partial<ImageLibraryEntry> & { id: number; filePath: string },
): ImageLibraryEntry {
	return {
		addedAt: '2024-01-01T00:00:00Z',
		thumbnailPath: null,
		receiptId: null,
		stagingPath: null,
		...overrides,
	};
}

const noop = () => { };

function baseProps(entry: ImageLibraryEntry): ScannerInboxCardProps {
	return {
		entry,
		donePhase: {},
		taskForPath: {},
		perImageScanStatus: {},
		queueScanResults: {},
		queueErrors: undefined,
		modelsAbsent: false,
		onScan: noop,
		onCancel: noop,
		onEdit: noop,
		onRevert: noop,
		onRemove: noop,
	};
}

afterEach(() => {
	cleanup();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ScannerInboxCard — thumbnail source', () => {
	it('uses stagingPath as img src when present', () => {
		const entry = makeEntry({
			id: 1,
			filePath: '/photos/receipt.jpg',
			stagingPath: '/staging/receipt-cropped.jpg',
		});
		render(<ScannerInboxCard {...baseProps(entry)} />);

		const img = screen.getByRole('status').querySelector('img');
		expect(img).not.toBeNull();
		expect(img!.getAttribute('src')).toBe('/staging/receipt-cropped.jpg');
	});

	it('uses filePath as img src when stagingPath is null', () => {
		const entry = makeEntry({
			id: 2,
			filePath: '/photos/receipt.jpg',
			stagingPath: null,
		});
		render(<ScannerInboxCard {...baseProps(entry)} />);

		const img = screen.getByRole('status').querySelector('img');
		expect(img).not.toBeNull();
		expect(img!.getAttribute('src')).toBe('/photos/receipt.jpg');
	});

	it('resets thumbnail when entry changes from stagingPath to null (same id)', () => {
		const entryWithStaging = makeEntry({
			id: 3,
			filePath: '/photos/receipt.jpg',
			stagingPath: '/staging/receipt-cropped.jpg',
		});

		const { rerender } = render(
			<ScannerInboxCard {...baseProps(entryWithStaging)} />,
		);

		// Initially shows staging path.
		let img = screen.getByRole('status').querySelector('img');
		expect(img!.getAttribute('src')).toBe('/staging/receipt-cropped.jpg');

		// Simulate re-upload: same id, staging cleared.
		const entryWithoutStaging = makeEntry({
			id: 3,
			filePath: '/photos/receipt.jpg',
			stagingPath: null,
		});
		rerender(<ScannerInboxCard {...baseProps(entryWithoutStaging)} />);

		// After re-render, should use the original file path, NOT the stale staging.
		img = screen.getByRole('status').querySelector('img');
		expect(img).not.toBeNull();
		expect(img!.getAttribute('src')).toBe('/photos/receipt.jpg');
	});

	it('uses thumbnailPath when stagingPath is null', () => {
		const entry = makeEntry({
			id: 4,
			filePath: '/photos/receipt.jpg',
			thumbnailPath: '/thumbs/receipt-thumb.jpg',
			stagingPath: null,
		});
		render(<ScannerInboxCard {...baseProps(entry)} />);

		const img = screen.getByRole('status').querySelector('img');
		expect(img).not.toBeNull();
		expect(img!.getAttribute('src')).toBe('/thumbs/receipt-thumb.jpg');
	});

	it('prioritises stagingPath over thumbnailPath', () => {
		const entry = makeEntry({
			id: 5,
			filePath: '/photos/receipt.jpg',
			thumbnailPath: '/thumbs/receipt-thumb.jpg',
			stagingPath: '/staging/receipt-cropped.jpg',
		});
		render(<ScannerInboxCard {...baseProps(entry)} />);

		const img = screen.getByRole('status').querySelector('img');
		expect(img).not.toBeNull();
		expect(img!.getAttribute('src')).toBe('/staging/receipt-cropped.jpg');
	});
});
