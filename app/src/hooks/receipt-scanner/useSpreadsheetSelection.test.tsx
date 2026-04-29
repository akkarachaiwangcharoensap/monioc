import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpreadsheetSelection, normaliseSel } from './useSpreadsheetSelection';
import { createRef } from 'react';

function makeContainerRef() {
	// Create a real DOM div for tests that need containerRef
	const div = document.createElement('div');
	document.body.appendChild(div);
	const ref = createRef<HTMLDivElement>() as React.MutableRefObject<HTMLDivElement>;
	(ref as React.MutableRefObject<HTMLDivElement | null>).current = div;
	return { ref, div, cleanup: () => document.body.removeChild(div) };
}

describe('normaliseSel (pure helper)', () => {
	// TC-S1: normaliseSel normalises forward selection
	it('TC-S1: normaliseSel returns correct bounds for forward selection', () => {
		const result = normaliseSel({ row: 0, col: 0 }, { row: 2, col: 2 });
		expect(result).toEqual({ r0: 0, r1: 2, c0: 0, c1: 2 });
	});

	// TC-S2: normaliseSel normalises reverse (bottom-to-top) selection
	it('TC-S2: normaliseSel normalises reverse selection', () => {
		const result = normaliseSel({ row: 3, col: 2 }, { row: 1, col: 0 });
		expect(result).toEqual({ r0: 1, r1: 3, c0: 0, c1: 2 });
	});

	// TC-S3: normaliseSel handles single-cell selection
	it('TC-S3: normaliseSel works for a single cell', () => {
		const result = normaliseSel({ row: 1, col: 1 }, { row: 1, col: 1 });
		expect(result).toEqual({ r0: 1, r1: 1, c0: 1, c1: 1 });
	});
});

describe('useSpreadsheetSelection', () => {
	// TC-S4: initial state is null/null
	it('TC-S4: initial selAnchor and selFocus are null', () => {
		const { ref } = makeContainerRef();
		const { result } = renderHook(() => useSpreadsheetSelection(ref));
		expect(result.current.selAnchor).toBeNull();
		expect(result.current.selFocus).toBeNull();
		expect(result.current.normSel).toBeNull();
	});

	// TC-S5: setSelAnchor and setSelFocus update state
	it('TC-S5: setSelAnchor/setSelFocus update anchor and focus', () => {
		const { ref } = makeContainerRef();
		const { result } = renderHook(() => useSpreadsheetSelection(ref));

		act(() => {
			result.current.setSelAnchor({ row: 0, col: 0 });
			result.current.setSelFocus({ row: 2, col: 1 });
		});

		expect(result.current.selAnchor).toEqual({ row: 0, col: 0 });
		expect(result.current.selFocus).toEqual({ row: 2, col: 1 });
	});

	// TC-S6: normSel is computed from anchor and focus
	it('TC-S6: normSel is correctly computed', () => {
		const { ref } = makeContainerRef();
		const { result } = renderHook(() => useSpreadsheetSelection(ref));

		act(() => {
			result.current.setSelAnchor({ row: 2, col: 2 });
			result.current.setSelFocus({ row: 0, col: 0 });
		});

		expect(result.current.normSel).toEqual({ r0: 0, r1: 2, c0: 0, c1: 2 });
	});

	// TC-S7: cellInSel returns true for a cell inside the selection
	it('TC-S7: cellInSel returns true for cell within selection', () => {
		const { ref } = makeContainerRef();
		const { result } = renderHook(() => useSpreadsheetSelection(ref));

		act(() => {
			result.current.setSelAnchor({ row: 0, col: 0 });
			result.current.setSelFocus({ row: 2, col: 2 });
		});

		expect(result.current.cellInSel(1, 1)).toBe(true);
		expect(result.current.cellInSel(3, 0)).toBe(false);
	});

	// TC-S8: clearSelection resets to null/null
	it('TC-S8: clearSelection resets anchor and focus to null', () => {
		const { ref } = makeContainerRef();
		const { result } = renderHook(() => useSpreadsheetSelection(ref));

		act(() => {
			result.current.setSelAnchor({ row: 0, col: 0 });
			result.current.setSelFocus({ row: 1, col: 1 });
		});

		act(() => { result.current.clearSelection(); });

		expect(result.current.selAnchor).toBeNull();
		expect(result.current.selFocus).toBeNull();
		expect(result.current.normSel).toBeNull();
	});

	// TC-S9: isMultiSel is false for a single cell selection
	it('TC-S9: isMultiSel is false for a single-cell selection', () => {
		const { ref } = makeContainerRef();
		const { result } = renderHook(() => useSpreadsheetSelection(ref));

		act(() => {
			result.current.setSelAnchor({ row: 1, col: 0 });
			result.current.setSelFocus({ row: 1, col: 0 });
		});

		expect(result.current.isMultiSel).toBe(false);
	});

	// TC-S10: isMultiSel is true for multi-row selection
	it('TC-S10: isMultiSel is true for multi-row selection', () => {
		const { ref } = makeContainerRef();
		const { result } = renderHook(() => useSpreadsheetSelection(ref));

		act(() => {
			result.current.setSelAnchor({ row: 0, col: 0 });
			result.current.setSelFocus({ row: 2, col: 0 });
		});

		expect(result.current.isMultiSel).toBe(true);
	});
});
