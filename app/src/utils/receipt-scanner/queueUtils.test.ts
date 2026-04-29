import { describe, it, expect } from 'vitest';
import {
	isAllowedImagePath,
	mergeQueue,
	resolveEditedPath,
	removeEdit,
	removePendingScansForBasePath,
	shouldAcceptDragEnter,
} from './queueUtils';

// ── isAllowedImagePath ────────────────────────────────────────────────────────

describe('isAllowedImagePath', () => {
	it('allows png, jpg, jpeg, webp, bmp extensions', () => {
		expect(isAllowedImagePath('/receipts/scan.png')).toBe(true);
		expect(isAllowedImagePath('/receipts/scan.jpg')).toBe(true);
		expect(isAllowedImagePath('/receipts/scan.jpeg')).toBe(true);
		expect(isAllowedImagePath('/receipts/scan.webp')).toBe(true);
		expect(isAllowedImagePath('/receipts/scan.bmp')).toBe(true);
	});

	it('is case-insensitive for the extension', () => {
		expect(isAllowedImagePath('/receipts/scan.PNG')).toBe(true);
		expect(isAllowedImagePath('/receipts/scan.JPG')).toBe(true);
		expect(isAllowedImagePath('/receipts/scan.JPEG')).toBe(true);
	});

	it('rejects non-image file types', () => {
		expect(isAllowedImagePath('/receipts/document.pdf')).toBe(false);
		expect(isAllowedImagePath('/receipts/data.txt')).toBe(false);
		expect(isAllowedImagePath('/receipts/clip.mp4')).toBe(false);
	});

	it('rejects paths with no extension', () => {
		expect(isAllowedImagePath('/receipts/no-extension')).toBe(false);
		expect(isAllowedImagePath('')).toBe(false);
	});
});

// ── mergeQueue ────────────────────────────────────────────────────────────────

describe('mergeQueue', () => {
	it('adds new paths to the queue', () => {
		const { queue, added } = mergeQueue(['/a.jpg', '/b.jpg'], ['/c.jpg', '/d.jpg']);
		expect(queue).toEqual(['/a.jpg', '/b.jpg', '/c.jpg', '/d.jpg']);
		expect(added).toEqual(['/c.jpg', '/d.jpg']);
	});

	it('deduplicates paths already present in the queue', () => {
		const { queue, added } = mergeQueue(['/a.jpg', '/b.jpg'], ['/b.jpg', '/c.jpg']);
		expect(queue).toEqual(['/a.jpg', '/b.jpg', '/c.jpg']);
		expect(added).toEqual(['/c.jpg']);
	});

	it('returns an empty added array when all additions are duplicates', () => {
		const { queue, added } = mergeQueue(['/a.jpg', '/b.jpg'], ['/a.jpg', '/b.jpg']);
		expect(queue).toEqual(['/a.jpg', '/b.jpg']);
		expect(added).toEqual([]);
	});

	it('handles an empty current queue', () => {
		const { queue, added } = mergeQueue([], ['/a.jpg']);
		expect(queue).toEqual(['/a.jpg']);
		expect(added).toEqual(['/a.jpg']);
	});

	it('handles an empty additions array', () => {
		const { queue, added } = mergeQueue(['/a.jpg'], []);
		expect(queue).toEqual(['/a.jpg']);
		expect(added).toEqual([]);
	});
});

// ── resolveEditedPath ─────────────────────────────────────────────────────────

describe('resolveEditedPath', () => {
	it('returns the edited path when one exists for the base path', () => {
		const edits = { '/original.jpg': '/edited.jpg' };
		expect(resolveEditedPath('/original.jpg', edits)).toBe('/edited.jpg');
	});

	it('returns the base path when no edit exists', () => {
		expect(resolveEditedPath('/original.jpg', {})).toBe('/original.jpg');
	});

	it('returns the correct edit when multiple edits are present', () => {
		const edits = { '/a.jpg': '/a_v2.jpg', '/b.jpg': '/b_v2.jpg' };
		expect(resolveEditedPath('/b.jpg', edits)).toBe('/b_v2.jpg');
	});

	it('does not return a wrong edit for a different base path', () => {
		const edits = { '/a.jpg': '/a_v2.jpg' };
		expect(resolveEditedPath('/b.jpg', edits)).toBe('/b.jpg');
	});
});

// ── removeEdit ────────────────────────────────────────────────────────────────

describe('removeEdit', () => {
	it('removes the specified base path key from the edits map', () => {
		const edits = { '/a.jpg': '/a_v2.jpg', '/b.jpg': '/b_v2.jpg' };
		const result = removeEdit(edits, '/a.jpg');
		expect(result).toEqual({ '/b.jpg': '/b_v2.jpg' });
	});

	it('returns an equivalent map when the path is not present', () => {
		const edits = { '/a.jpg': '/a_v2.jpg' };
		const result = removeEdit(edits, '/missing.jpg');
		expect(result).toEqual({ '/a.jpg': '/a_v2.jpg' });
	});

	it('does not mutate the original edits object', () => {
		const edits = { '/a.jpg': '/a_v2.jpg' };
		removeEdit(edits, '/a.jpg');
		// original must be unchanged
		expect(edits).toEqual({ '/a.jpg': '/a_v2.jpg' });
	});

	it('returns an empty map when the only key is removed', () => {
		const edits = { '/a.jpg': '/a_v2.jpg' };
		expect(removeEdit(edits, '/a.jpg')).toEqual({});
	});
});

// ── shouldAcceptDragEnter ─────────────────────────────────────────────────────

describe('shouldAcceptDragEnter', () => {
	it('returns true for a single allowed image path', () => {
		expect(shouldAcceptDragEnter(['/photo.jpg'])).toBe(true);
	});

	it('returns true when at least one path is an allowed image', () => {
		expect(shouldAcceptDragEnter(['/doc.pdf', '/photo.png'])).toBe(true);
	});

	it('returns false for an empty paths array (internal element drag)', () => {
		// WebKit/Tauri surfaces internal <img> drags with paths: []
		expect(shouldAcceptDragEnter([])).toBe(false);
	});

	it('returns false when no path has an allowed image extension', () => {
		expect(shouldAcceptDragEnter(['/doc.pdf', '/data.txt'])).toBe(false);
	});

	it('accepts all supported image types', () => {
		for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'bmp']) {
			expect(shouldAcceptDragEnter([`/image.${ext}`])).toBe(true);
		}
	});
});

// ── removePendingScansForBasePath ───────────────────────────────────────────

describe('removePendingScansForBasePath', () => {
	it('removes all queued entries that match the removed base path', () => {
		const queue = [
			{ basePath: '/a.jpg', scanSourcePath: '/a-edited.jpg', persistedImagePath: '/a.jpg', scanId: 1 },
			{ basePath: '/b.jpg', scanSourcePath: '/b.jpg', persistedImagePath: '/b.jpg', scanId: 2 },
			{ basePath: '/a.jpg', scanSourcePath: '/a-processed.jpg', persistedImagePath: '/a.jpg', scanId: 3 },
		];

		expect(removePendingScansForBasePath(queue, '/a.jpg')).toEqual([
			{ basePath: '/b.jpg', scanSourcePath: '/b.jpg', persistedImagePath: '/b.jpg', scanId: 2 },
		]);
	});

	it('keeps queue unchanged when no entry matches the base path', () => {
		const queue = [
			{ basePath: '/a.jpg', scanSourcePath: '/a-edited.jpg', persistedImagePath: '/a.jpg', scanId: 1 },
			{ basePath: '/b.jpg', scanSourcePath: '/b.jpg', persistedImagePath: '/b.jpg', scanId: 2 },
		];

		expect(removePendingScansForBasePath(queue, '/c.jpg')).toEqual(queue);
	});
});

