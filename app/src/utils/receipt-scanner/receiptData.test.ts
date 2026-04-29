import { describe, expect, it } from 'vitest';
import {
	parseEditableJson,
	receiptDataSignature,
	toEditableJson,
} from './receiptData';
import type { ReceiptData } from '../../types';

// ── receiptDataSignature ──────────────────────────────────────────────────────

describe('receiptDataSignature', () => {
	it('returns the same signature for structurally identical data', () => {
		const a: ReceiptData = { rows: [{ name: 'Milk', price: 3.5 }] };
		const b: ReceiptData = { rows: [{ name: 'Milk', price: 3.5 }] };
		expect(receiptDataSignature(a)).toBe(receiptDataSignature(b));
	});

	it('returns different signatures for different row counts', () => {
		const a: ReceiptData = { rows: [{ name: 'Milk', price: 3.5 }] };
		const b: ReceiptData = {
			rows: [
				{ name: 'Milk', price: 3.5 },
				{ name: 'Eggs', price: 2.0 },
			],
		};
		expect(receiptDataSignature(a)).not.toBe(receiptDataSignature(b));
	});

	it('returns different signatures when a price changes', () => {
		const a: ReceiptData = { rows: [{ name: 'Milk', price: 3.5 }] };
		const b: ReceiptData = { rows: [{ name: 'Milk', price: 4.0 }] };
		expect(receiptDataSignature(a)).not.toBe(receiptDataSignature(b));
	});

	it('returns different signatures when a name changes', () => {
		const a: ReceiptData = { rows: [{ name: 'Milk', price: 3.5 }] };
		const b: ReceiptData = { rows: [{ name: 'Soy Milk', price: 3.5 }] };
		expect(receiptDataSignature(a)).not.toBe(receiptDataSignature(b));
	});

	it('returns an empty-array JSON string for data with no rows', () => {
		expect(receiptDataSignature({ rows: [] })).toBe('[]');
	});
});

// ── toEditableJson ────────────────────────────────────────────────────────────

describe('toEditableJson', () => {
	it('produces valid, pretty-printed JSON', () => {
		const data: ReceiptData = { rows: [{ name: 'Milk', price: 3.5 }] };
		const json = toEditableJson(data);
		expect(() => JSON.parse(json)).not.toThrow();
		// Indented with 2 spaces
		expect(json).toContain('\n  ');
	});

	it('round-trips through JSON.parse without data loss', () => {
		const data: ReceiptData = {
			rows: [
				{ name: 'Milk', price: 3.5 },
				{ name: 'Eggs', price: 2.99 },
			],
		};
		const parsed = JSON.parse(toEditableJson(data)) as ReceiptData;
		expect(parsed).toEqual(data);
	});

	it('outputs an empty rows array for empty data', () => {
		const json = toEditableJson({ rows: [] });
		expect(JSON.parse(json)).toEqual({ rows: [] });
	});
});

// ── parseEditableJson ─────────────────────────────────────────────────────────

describe('parseEditableJson', () => {
	it('parses valid JSON with correct rows', () => {
		const input = JSON.stringify({
			rows: [
				{ name: 'Milk', price: 3.5 },
				{ name: 'Eggs', price: 2.99 },
			],
		});
		const result = parseEditableJson(input);
		expect(result.rows).toHaveLength(2);
		expect(result.rows[0]).toEqual({ name: 'Milk', price: 3.5 });
		expect(result.rows[1]).toEqual({ name: 'Eggs', price: 2.99 });
	});

	it('trims whitespace from names', () => {
		const input = JSON.stringify({ rows: [{ name: '  Bread  ', price: 1.2 }] });
		expect(parseEditableJson(input).rows[0].name).toBe('Bread');
	});

	it('coerces numeric-looking string prices to numbers', () => {
		const input = '{"rows":[{"name":"Item","price":"4.50"}]}';
		expect(parseEditableJson(input).rows[0].price).toBe(4.5);
	});

	it('coerces null name to empty string', () => {
		const input = JSON.stringify({ rows: [{ name: null, price: 1.0 }] });
		expect(parseEditableJson(input).rows[0].name).toBe('');
	});

	it('coerces undefined name to empty string', () => {
		const input = '{"rows":[{"price":1.0}]}';
		expect(parseEditableJson(input).rows[0].name).toBe('');
	});

	it('throws when input is not valid JSON', () => {
		expect(() => parseEditableJson('not json')).toThrow();
	});

	it('throws when rows is missing from parsed object', () => {
		expect(() => parseEditableJson(JSON.stringify({ data: [] }))).toThrow(
			'JSON must contain rows array.',
		);
	});

	it('throws when rows is not an array', () => {
		expect(() =>
			parseEditableJson(JSON.stringify({ rows: 'invalid' })),
		).toThrow('JSON must contain rows array.');
	});

	it('throws when the parsed value is null', () => {
		expect(() => parseEditableJson('null')).toThrow(
			'JSON must contain rows array.',
		);
	});

	it('toEditableJson → parseEditableJson round-trip preserves data', () => {
		const original: ReceiptData = {
			rows: [
				{ name: 'Milk', price: 3.5 },
				{ name: 'Bread', price: 1.2 },
			],
		};
		expect(parseEditableJson(toEditableJson(original))).toEqual(original);
	});
});

// ── savedResultForActive guard (regression: TC-CAT-1 to TC-CAT-3) ────────────
//
// Reproduces the guard condition in useScanReceipt that caused auto-categorize
// to not update spreadsheet cells when triggered after a name-cell edit whose
// debounced auto-save hadn't yet fired.
//
// Guard: `receiptDataSignature(editableData) !== lastPersistedSignatureRef.current`
//
// Before the fix, `lastPersistedSignatureRef.current` held the *pre-edit*
// signature, so the guard was true and blocked the update.  After the fix,
// `lastPersistedSignatureRef.current` is advanced to match `editableData`
// before the Rust job is submitted, so the guard is false and the incoming
// categorized result is applied.

describe('receiptDataSignature – savedResultForActive guard (regression)', () => {
	// TC-CAT-1: Simulates the state *before* the fix.
	// After editing a name, editableData signature != lastPersistedSignature.
	// The guard would have blocked the update.
	it('TC-CAT-1: guard is true (blocking) when lastPersistedSignature is stale after a name edit', () => {
		const original: ReceiptData = { rows: [{ name: 'Milk', price: 3.5 }] };
		const edited: ReceiptData = { rows: [{ name: 'Soy Milk', price: 3.5 }] };

		const lastPersistedSignature = receiptDataSignature(original); // stale – pre-edit
		const currentEditableSignature = receiptDataSignature(edited);

		// Guard would fire (true = block update)
		expect(currentEditableSignature !== lastPersistedSignature).toBe(true);
	});

	// TC-CAT-2: Simulates the state *after* the fix.
	// Before submitting the Rust job, lastPersistedSignatureRef is advanced to
	// match editableData.  The guard should be false, allowing the update.
	it('TC-CAT-2: guard is false (non-blocking) after lastPersistedSignature is advanced to current editableData', () => {
		const edited: ReceiptData = { rows: [{ name: 'Soy Milk', price: 3.5 }] };

		// Simulate the fix: advance lastPersistedSignature to current editableData
		const lastPersistedSignature = receiptDataSignature(edited);
		const currentEditableSignature = receiptDataSignature(edited);

		// Guard should not fire (false = allow update)
		expect(currentEditableSignature !== lastPersistedSignature).toBe(false);
	});

	// TC-CAT-3: Categorize result (with categories applied) differs from
	// editableData (no categories), so the incoming signature is distinct and
	// the final signature-equality short-circuit does not skip the update.
	it('TC-CAT-3: incoming categorized signature differs from pre-categorize signature', () => {
		const preCategorize: ReceiptData = { rows: [{ name: 'Soy Milk', price: 3.5 }] };
		const postCategorize: ReceiptData = {
			rows: [{ name: 'Soy Milk', price: 3.5, category: 'Dairy & Alternatives' }],
		};

		expect(receiptDataSignature(postCategorize)).not.toBe(
			receiptDataSignature(preCategorize),
		);
	});
});
