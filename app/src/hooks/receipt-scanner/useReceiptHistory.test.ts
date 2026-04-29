import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReceiptHistory } from './useReceiptHistory';
import { rows } from '../../test/factories';

describe('useReceiptHistory', () => {
	let publish: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		publish = vi.fn();
	});

	// TC-H1: Initial rows are returned as-is
	it('TC-H1: returns initial rows', () => {
		const initial = rows(2);
		const { result } = renderHook(() =>
			useReceiptHistory(initial, { publish }),
		);
		expect(result.current.rows).toEqual(initial);
	});

	// TC-H2: pushHistory records prev snapshot, setRows updates rows
	it('TC-H2: pushHistory stores snapshot; setRows updates state', () => {
		const initial = rows(2);
		const next = rows(3);
		const { result } = renderHook(() =>
			useReceiptHistory(initial, { publish }),
		);

		act(() => {
			result.current.pushHistory(initial);
			result.current.setRows(next);
		});

		expect(result.current.rows).toEqual(next);
	});

	// TC-H3: undo restores previous state and calls publish
	it('TC-H3: undo restores previous rows and calls publish', () => {
		const initial = rows(2);
		const next = rows(3);
		const { result } = renderHook(() =>
			useReceiptHistory(initial, { publish }),
		);

		act(() => {
			result.current.pushHistory(initial);
			result.current.setRows(next);
		});

		act(() => {
			result.current.undo();
		});

		expect(result.current.rows).toEqual(initial);
		expect(publish).toHaveBeenCalledWith(initial);
	});

	// TC-H4: redo restores the undone state
	it('TC-H4: redo restores the undone state', () => {
		const initial = rows(2);
		const next = rows(3);
		const { result } = renderHook(() =>
			useReceiptHistory(initial, { publish }),
		);

		act(() => {
			result.current.pushHistory(initial);
			result.current.setRows(next);
		});

		act(() => { result.current.undo(); });
		act(() => { result.current.redo(); });

		expect(result.current.rows).toEqual(next);
		expect(publish).toHaveBeenLastCalledWith(next);
	});

	// TC-H5: undo does nothing when history is empty
	it('TC-H5: undo is a no-op when history is empty', () => {
		const initial = rows(2);
		const { result } = renderHook(() =>
			useReceiptHistory(initial, { publish }),
		);

		act(() => { result.current.undo(); });

		expect(result.current.rows).toEqual(initial);
		expect(publish).not.toHaveBeenCalled();
	});

	// TC-H6: redo does nothing when future is empty
	it('TC-H6: redo is a no-op when future is empty', () => {
		const initial = rows(2);
		const { result } = renderHook(() =>
			useReceiptHistory(initial, { publish }),
		);

		act(() => { result.current.redo(); });

		expect(result.current.rows).toEqual(initial);
		expect(publish).not.toHaveBeenCalled();
	});

	// TC-H7: publishTyping keeps changes local; flushPending commits on blur
	it('TC-H7: publishTyping keeps changes local; flushPending publishes only on blur', () => {
		const initial = rows(2);
		const next = rows(2, { name: 'Updated' });
		const { result } = renderHook(() =>
			useReceiptHistory(initial, { publish }),
		);

		act(() => {
			result.current.setRows((prev) => {
				result.current.publishTyping(next, prev);
				return next;
			});
		});

		// publish should not have been called — typing is kept local
		expect(publish).not.toHaveBeenCalled();

		// flushPending (called on blur) — should commit deferred publish
		act(() => {
			result.current.flushPending();
		});
		expect(publish).toHaveBeenCalledWith(next);

		// undo should now recover original
		act(() => {
			result.current.setRows(next);
			result.current.undo();
		});

		expect(result.current.rows).toEqual(initial);
	});

	// TC-H8: pushHistory clears future (redo stack)
	it('TC-H8: pushHistory clears the redo stack', () => {
		const initial = rows(2);
		const next1 = rows(3);
		const next2 = rows(4);
		const { result } = renderHook(() =>
			useReceiptHistory(initial, { publish }),
		);

		// Build some undo/redo state
		act(() => {
			result.current.pushHistory(initial);
			result.current.setRows(next1);
		});

		act(() => { result.current.undo(); });

		// Now push a new history entry — should clear future
		act(() => {
			result.current.pushHistory(initial);
			result.current.setRows(next2);
		});

		// undo once — goes to initial, future should be next2
		act(() => { result.current.undo(); });
		expect(result.current.rows).toEqual(initial);

		// redo once — goes to next2, not next1 (old future was cleared)
		act(() => { result.current.redo(); });
		expect(result.current.rows).toEqual(next2);
	});
});
