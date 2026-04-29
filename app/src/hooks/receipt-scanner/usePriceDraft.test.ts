import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePriceDraft } from './usePriceDraft';

describe('usePriceDraft', () => {
	// TC-P1: getDisplayValue returns formatted price when not drafting
	it('TC-P1: getDisplayValue returns formatted price string when not drafting', () => {
		const { result } = renderHook(() => usePriceDraft());
		expect(result.current.getDisplayValue(0, 2.5)).toBe('2.50');
	});

	// TC-P2: getDisplayValue returns empty string when price is 0 and not drafting
	it('TC-P2: getDisplayValue returns empty string for zero price', () => {
		const { result } = renderHook(() => usePriceDraft());
		expect(result.current.getDisplayValue(0, 0)).toBe('');
	});

	// TC-P3: handleFocus sets draft to formatted price
	it('TC-P3: handleFocus seeds draft with formatted stored price', () => {
		const { result } = renderHook(() => usePriceDraft());

		act(() => { result.current.handleFocus(0, 3.75); });

		expect(result.current.getDisplayValue(0, 3.75)).toBe('3.75');
		expect(result.current.isDrafting(0)).toBe(true);
	});

	// TC-P4: handleFocus does not overwrite existing draft
	it('TC-P4: handleFocus is idempotent when already drafting that row', () => {
		const { result } = renderHook(() => usePriceDraft());

		act(() => { result.current.handleFocus(0, 3.75); });
		act(() => { result.current.handleChange(0, '9.99'); });
		act(() => { result.current.handleFocus(0, 3.75); }); // should NOT reset to 3.75

		expect(result.current.getDisplayValue(0, 3.75)).toBe('9.99');
	});

	// TC-P5: handleChange updates draft value
	it('TC-P5: handleChange updates the draft string', () => {
		const { result } = renderHook(() => usePriceDraft());

		act(() => { result.current.handleFocus(0, 1.0); });
		act(() => { result.current.handleChange(0, '5.5'); });

		expect(result.current.getDisplayValue(0, 1.0)).toBe('5.5');
	});

	// TC-P6: handleChange ignores different row
	it('TC-P6: handleChange ignores updates for a different row index', () => {
		const { result } = renderHook(() => usePriceDraft());

		act(() => { result.current.handleFocus(0, 1.0); });
		act(() => { result.current.handleChange(1, '999'); }); // row 1, not row 0

		// row 0 draft should still be '1.00'
		expect(result.current.getDisplayValue(0, 1.0)).toBe('1.00');
	});

	// TC-P7: handleBlur calls onCommit with parsed price and clears draft
	it('TC-P7: handleBlur calls onCommit with parsed float and clears draft', () => {
		const { result } = renderHook(() => usePriceDraft());
		const onCommit = vi.fn();

		act(() => { result.current.handleFocus(0, 1.0); });
		act(() => { result.current.handleChange(0, '4.20'); });
		act(() => { result.current.handleBlur(0, onCommit); });

		expect(onCommit).toHaveBeenCalledWith(4.2);
		expect(result.current.isDrafting(0)).toBe(false);
	});

	// TC-P8: handleBlur with invalid text commits 0
	it('TC-P8: handleBlur with non-numeric string commits 0', () => {
		const { result } = renderHook(() => usePriceDraft());
		const onCommit = vi.fn();

		act(() => { result.current.handleFocus(0, 1.0); });
		act(() => { result.current.handleChange(0, 'abc'); });
		act(() => { result.current.handleBlur(0, onCommit); });

		expect(onCommit).toHaveBeenCalledWith(0);
	});

	// TC-P9: seedDraft sets draft to given key string
	it('TC-P9: seedDraft initialises draft with a key character', () => {
		const { result } = renderHook(() => usePriceDraft());

		act(() => { result.current.seedDraft(2, '7'); });

		expect(result.current.isDrafting(2)).toBe(true);
		expect(result.current.getDisplayValue(2, 9.99)).toBe('7');
	});

	// TC-P10: isDrafting returns false for other rows
	it('TC-P10: isDrafting returns false for rows other than active draft', () => {
		const { result } = renderHook(() => usePriceDraft());

		act(() => { result.current.handleFocus(1, 2.0); });

		expect(result.current.isDrafting(0)).toBe(false);
		expect(result.current.isDrafting(1)).toBe(true);
	});
});
