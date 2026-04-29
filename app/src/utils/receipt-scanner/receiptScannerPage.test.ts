import { describe, expect, it } from 'vitest';
import {
	matrixToReceipt,
	receiptToMatrix,
	rowsToCsv,
	selectionToClipboardText,
} from './receiptData';
import {
	getReceiptDisplayName,
	getReceiptFallbackName,
	resolveReceiptImageState,
} from './receiptSession';

describe('ReceiptScannerPage spreadsheet mapping', () => {
	it('formats receipt rows to spreadsheet matrix with fixed 2-decimal price strings', () => {
		const matrix = receiptToMatrix({
			rows: [
				{ name: 'Milk', price: 3.5 },
				{ name: 'Eggs', price: Number.NaN },
			],
		});

		expect(matrix).toEqual([
			['Milk', '3.50'],
			['Eggs', '0.00'],
		]);
	});

	it('maps spreadsheet matrix to receipt rows and trims trailing blank rows', () => {
		const receipt = matrixToReceipt([
			[' Apples ', '2.75'],
			['', ''],
		]);

		expect(receipt).toEqual({
			rows: [{ name: 'Apples', price: 2.75 }],
		});
	});

	it('preserves intentional blank rows in the middle of data', () => {
		const receipt = matrixToReceipt([
			['Bread', '1.20'],
			['', ''],
			['Butter', '4.30'],
		]);

		expect(receipt).toEqual({
			rows: [
				{ name: 'Bread', price: 1.2 },
				{ name: '', price: 0 },
				{ name: 'Butter', price: 4.3 },
			],
		});
	});

	it('receiptToMatrix with empty rows returns an empty matrix', () => {
		expect(receiptToMatrix({ rows: [] })).toEqual([]);
	});

	it('receiptToMatrix handles zero and negative prices', () => {
		const matrix = receiptToMatrix({
			rows: [
				{ name: 'Free item', price: 0 },
				{ name: 'Discount', price: -1.5 },
			],
		});

		expect(matrix[0][1]).toBe('0.00');
		expect(matrix[1][1]).toBe('-1.50');
	});

	it('matrixToReceipt handles undefined and missing cell values gracefully', () => {
		// Simulates sparse/incomplete rows that could arise from external data
		const matrix = [
			[undefined as unknown as string, undefined as unknown as string],
			[undefined as unknown as string, undefined as unknown as string],
			['Bread', '1.20'],
		] as Parameters<typeof matrixToReceipt>[0];

		const receipt = matrixToReceipt(matrix);

		expect(receipt.rows[0]).toEqual({ name: '', price: 0 });
		expect(receipt.rows[1]).toEqual({ name: '', price: 0 });
		expect(receipt.rows[2]).toEqual({ name: 'Bread', price: 1.2 });
	});

	it('matrixToReceipt trims multiple trailing blank rows', () => {
		const receipt = matrixToReceipt([
			['Apple', '1.00'],
			['', ''],
			['', ''],
			['', ''],
		]);

		expect(receipt.rows).toHaveLength(1);
		expect(receipt.rows[0].name).toBe('Apple');
	});

	it('receiptToMatrix and matrixToReceipt round-trip for non-blank-trailing data', () => {
		const original = {
			rows: [
				{ name: 'Milk', price: 3.5 },
				{ name: '', price: 0 },
				{ name: 'Bread', price: 2.1 },
			],
		};

		expect(matrixToReceipt(receiptToMatrix(original))).toEqual(original);
	});

	it('matrixToReceipt coerces non-numeric price strings to 0', () => {
		const receipt = matrixToReceipt([['Widget', 'n/a']]);

		expect(receipt.rows[0].price).toBe(0);
	});
});

describe('rowsToCsv', () => {
	it('produces a UTF-8 BOM header row followed by name,price lines', () => {
		const csv = rowsToCsv([
			{ name: 'Milk', price: 3.5 },
			{ name: 'Eggs', price: 2.99 },
		]);
		const lines = csv.split('\n');
		expect(lines[0]).toBe('\uFEFFName,Price');
		expect(lines[1]).toBe('Milk,3.50');
		expect(lines[2]).toBe('Eggs,2.99');
	});

	it('quotes values containing commas', () => {
		const csv = rowsToCsv([{ name: 'Ham, smoked', price: 5.0 }]);
		expect(csv).toContain('"Ham, smoked"');
	});

	it('quotes values containing double-quotes and escapes them', () => {
		const csv = rowsToCsv([{ name: '12" ruler', price: 1.0 }]);
		expect(csv).toContain('"12"" ruler"');
	});

	it('quotes values containing newlines', () => {
		const csv = rowsToCsv([{ name: 'Line1\nLine2', price: 0 }]);
		expect(csv).toContain('"Line1\nLine2"');
	});

	it('outputs 0.00 for zero/invalid price', () => {
		const csv = rowsToCsv([{ name: 'Free', price: 0 }]);
		expect(csv).toContain('Free,0.00');
	});

	it('handles an empty row array — only header', () => {
		const csv = rowsToCsv([]);
		expect(csv).toBe('\uFEFFName,Price');
	});
});

describe('selectionToClipboardText', () => {
	const rows = [
		{ name: 'Apple', price: 1.5 },
		{ name: 'Banana', price: 0.75 },
		{ name: 'Cherry', price: 3.0 },
	];

	it('copies a single name cell', () => {
		expect(selectionToClipboardText(rows, 0, 0, 0, 0)).toBe('Apple');
	});

	it('copies a single price cell (positive)', () => {
		expect(selectionToClipboardText(rows, 1, 1, 2, 2)).toBe('0.75');
	});

	it('copies a single price cell with zero price as empty string', () => {
		const zeroRows = [{ name: 'Free', price: 0 }];
		expect(selectionToClipboardText(zeroRows, 0, 0, 2, 2)).toBe('');
	});

	it('copies a full row as tab-separated name, category, and price', () => {
		expect(selectionToClipboardText(rows, 0, 0, 0, 2)).toBe('Apple\t\t1.50');
	});

	it('copies multiple rows as newline-separated tab-separated values', () => {
		const text = selectionToClipboardText(rows, 0, 2, 0, 2);
		const lines = text.split('\n');
		expect(lines).toHaveLength(3);
		expect(lines[0]).toBe('Apple\t\t1.50');
		expect(lines[1]).toBe('Banana\t\t0.75');
		expect(lines[2]).toBe('Cherry\t\t3.00');
	});

	it('copies only the name column for a multi-row name-only selection', () => {
		const text = selectionToClipboardText(rows, 0, 1, 0, 0);
		expect(text).toBe('Apple\nBanana');
	});

	it('skips out-of-bounds rows gracefully', () => {
		// r1 beyond array length — should not throw, just skip missing rows
		expect(() => selectionToClipboardText(rows, 2, 5, 0, 2)).not.toThrow();
		const text = selectionToClipboardText(rows, 2, 5, 0, 2);
		expect(text.split('\n')[0]).toBe('Cherry\t\t3.00');
	});
});

describe('receipt session helpers', () => {
	it('falls back to a readable name when no custom receipt name exists', () => {
		expect(getReceiptFallbackName('/receipts/freshco-weekly-01.jpg')).toBe('freshco weekly 01');
		expect(getReceiptDisplayName(null, '/receipts/freshco-weekly-01.jpg')).toBe('freshco weekly 01');
	});

	it('prefers the saved display name when present', () => {
		expect(getReceiptDisplayName('Saturday groceries', '/receipts/freshco-weekly-01.jpg')).toBe('Saturday groceries');
	});

	it('restores the saved processed image when revisiting a queued receipt', () => {
		expect(
			resolveReceiptImageState('/receipts/original.jpg', {}, {
				imagePath: '/receipts/original.jpg',
				processedImagePath: '/receipts/processed.jpg',
			}),
		).toEqual({
			imagePath: '/receipts/original.jpg',
			processedImagePath: '/receipts/processed.jpg',
			previewPath: '/receipts/processed.jpg',
			hasTemporaryEdit: false,
		});
	});

	it('keeps a temporary crop active without discarding the saved receipt record', () => {
		expect(
			resolveReceiptImageState('/receipts/original.jpg', {
				'/receipts/original.jpg': '/receipts/crop.jpg',
			}, {
				imagePath: '/receipts/original.jpg',
				processedImagePath: '/receipts/processed.jpg',
			}),
		).toEqual({
			imagePath: '/receipts/crop.jpg',
			processedImagePath: null,
			previewPath: '/receipts/crop.jpg',
			hasTemporaryEdit: true,
		});
	});
});

// ── Feature: right-click preserves multi-cell selection ───────────────────────

describe('right-click cell selection guard', () => {
	function makeOnMouseDown(
		editingCell: { row: number; col: number } | null,
		rowIdx: number,
		col: 0 | 1,
		onStartSelect: () => void,
	) {
		return (e: { button: number }) => {
			// This mirrors the fix applied to both Name and Price cell onMouseDown handlers.
			if (e.button === 2) return;
			if (editingCell?.row === rowIdx && editingCell?.col === col) return;
			onStartSelect();
		};
	}

	it('does NOT call startCellSelect on right-click (button 2)', () => {
		let called = false;
		const handler = makeOnMouseDown(null, 0, 0, () => { called = true; });
		handler({ button: 2 });
		expect(called).toBe(false);
	});

	it('calls startCellSelect on left-click (button 0)', () => {
		let called = false;
		const handler = makeOnMouseDown(null, 0, 0, () => { called = true; });
		handler({ button: 0 });
		expect(called).toBe(true);
	});

	it('does NOT call startCellSelect when the cell is already being edited', () => {
		let called = false;
		const handler = makeOnMouseDown({ row: 2, col: 0 }, 2, 0, () => { called = true; });
		handler({ button: 0 });
		expect(called).toBe(false);
	});

	it('right-click on an editing cell also returns early (button 2 beats editing guard)', () => {
		let called = false;
		const handler = makeOnMouseDown({ row: 2, col: 0 }, 2, 0, () => { called = true; });
		handler({ button: 2 });
		expect(called).toBe(false);
	});
});

// ── Feature: receiptIds URL parameter parsing ─────────────────────────────────

describe('receiptIds URL parameter parsing', () => {
	function parseReceiptIds(raw: string): number[] {
		return raw.split(',').filter(Boolean).map(Number).filter(Number.isFinite);
	}

	it('parses comma-separated IDs correctly', () => {
		expect(parseReceiptIds('1,2,3')).toEqual([1, 2, 3]);
	});

	it('handles a single ID', () => {
		expect(parseReceiptIds('42')).toEqual([42]);
	});

	it('filters out non-numeric values', () => {
		expect(parseReceiptIds('1,abc,3')).toEqual([1, 3]);
	});

	it('filters out empty segments from trailing commas', () => {
		expect(parseReceiptIds('1,2,')).toEqual([1, 2]);
	});

	it('filters out empty segments from consecutive commas', () => {
		expect(parseReceiptIds('1,,3')).toEqual([1, 3]);
	});

	it('returns empty array for fully non-numeric input', () => {
		expect(parseReceiptIds('abc,def')).toEqual([]);
	});

	it('preserves order of IDs as they appear in the URL', () => {
		expect(parseReceiptIds('7,3,15,1')).toEqual([7, 3, 15, 1]);
	});
});

// ── Feature: serial scan queue processes tasks one-at-a-time ─────────────────

describe('serial scan queue', () => {
	/** Minimal re-implementation of the drainScanQueue logic for isolation testing. */
	function makeSerialQueue() {
		let isProcessing = false;
		const queue: Array<() => Promise<void>> = [];
		// eslint-disable-next-line prefer-const -- forward reference: drain() calls drainRef before drainRef = drain executes
		let drainRef: () => void;

		function drain() {
			if (isProcessing) return;
			const task = queue.shift();
			if (!task) return;
			isProcessing = true;
			void task().finally(() => {
				isProcessing = false;
				drainRef();
			});
		}

		drainRef = drain;
		return { queue, drain };
	}

	const tick = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

	it('executes queued tasks serially in FIFO order', async () => {
		const { queue, drain } = makeSerialQueue();
		const order: number[] = [];

		queue.push(async () => { await tick(15); order.push(1); });
		queue.push(async () => { await tick(5);  order.push(2); });
		queue.push(async () => { await tick(1);  order.push(3); });

		drain();
		await tick(60);

		expect(order).toEqual([1, 2, 3]);
	});

	it('never runs more than one task concurrently', async () => {
		const { queue, drain } = makeSerialQueue();
		let active = 0;
		let maxActive = 0;

		for (let i = 0; i < 4; i++) {
			queue.push(async () => {
				active++;
				maxActive = Math.max(maxActive, active);
				await tick(10);
				active--;
			});
		}

		drain();
		drain(); // Calling drain multiple times must not bypass the mutex.
		drain();
		await tick(100);

		expect(maxActive).toBe(1);
	});

	it('a new task added after drain completes is processed on the next drain call', async () => {
		const { queue, drain } = makeSerialQueue();
		const order: number[] = [];

		queue.push(async () => { order.push(1); });
		drain();
		await tick(20); // Let first task finish.

		queue.push(async () => { order.push(2); });
		drain(); // Must start task 2.
		await tick(20);

		expect(order).toEqual([1, 2]);
	});

	it('handles an empty queue without errors', () => {
		const { drain } = makeSerialQueue();
		expect(() => drain()).not.toThrow();
	});
});
