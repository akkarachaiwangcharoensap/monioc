import { useCallback } from 'react';
import type { MutableRefObject, RefObject, Dispatch, SetStateAction } from 'react';
import type React from 'react';
import type { SelectInstance } from 'react-select';

import type { ReceiptRow } from '../../types';
import type { CategoryOption } from '../../components/receipt-scanner/ReceiptSpreadsheet/CategorySelect';
import type { CellCoord, NormalisedSelection } from './useSpreadsheetSelection';
import { normaliseSel } from './useSpreadsheetSelection';
import { selectionToClipboardText } from '../../utils/receipt-scanner/receiptData';
import { makeRow } from '../../domain/receipt';

const COL_NAME = 0;
const COL_CATEGORY = 1;
const COL_PRICE = 2;
const TOTAL_COLS = 3;

// ── Internal strategy helpers ──────────────────────────────────────────────

function handleUndoRedo(
	e: React.KeyboardEvent,
	undo: () => void,
	redo: () => void,
): boolean {
	const isUndo = (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'z';
	const isRedo = (e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z';
	if (isUndo) { e.preventDefault(); undo(); return true; }
	if (isRedo) { e.preventDefault(); redo(); return true; }
	return false;
}

function handleClipboard(
	e: React.KeyboardEvent,
	selRef: MutableRefObject<{ selAnchor: CellCoord | null; selFocus: CellCoord | null }>,
	rowsRef: MutableRefObject<ReceiptRow[]>,
	setRows: Dispatch<SetStateAction<ReceiptRow[]>>,
	publishWithHistory: (next: ReceiptRow[], prev: ReceiptRow[]) => void,
	anchor: CellCoord | null,
): boolean {
	const isCopy  = (e.metaKey || e.ctrlKey) && e.key === 'c';
	const isPaste = (e.metaKey || e.ctrlKey) && e.key === 'v';

	if (isCopy) {
		const { selAnchor: a, selFocus: f } = selRef.current;
		if (!a || !f) return false;
		e.preventDefault();
		const ns = normaliseSel(a, f);
		void navigator.clipboard.writeText(
			selectionToClipboardText(rowsRef.current, ns.r0, ns.r1, ns.c0, ns.c1),
		);
		return true;
	}

	if (isPaste) {
		if (!anchor) return false;
		e.preventDefault();
		void navigator.clipboard.readText().then((text) => {
			// Trim a single trailing newline that some clipboard sources append.
			const trimmed = text.endsWith('\n') ? text.slice(0, -1) : text;
			const pastedLines = trimmed.split('\n');
			const { selAnchor: a, selFocus: f } = selRef.current;
			const ns = a && f ? normaliseSel(a, f) : null;

			setRows((prev) => {
				const next = [...prev];

				// Single clipboard line pasted into a multi-cell selection:
				// broadcast the value to every selected cell.
				if (pastedLines.length === 1 && ns && (ns.r1 > ns.r0 || ns.c1 > ns.c0)) {
					const cells = pastedLines[0].split('\t');
					for (let r = ns.r0; r <= ns.r1; r++) {
						if (cells.length >= 3) {
							next[r] = { ...next[r], name: cells[0].trim(), category: cells[1].trim() || undefined, price: parseFloat(cells[2]) || 0 };
						} else if (cells.length === 2) {
							if (ns.c0 === COL_NAME)          next[r] = { ...next[r], name: cells[0].trim(), category: cells[1].trim() || undefined };
							else if (ns.c0 === COL_CATEGORY) next[r] = { ...next[r], category: cells[0].trim() || undefined, price: parseFloat(cells[1]) || 0 };
							else                             next[r] = { ...next[r], name: cells[0].trim(), price: parseFloat(cells[1]) || 0 };
						} else {
							const val = cells[0].trim();
							for (let c = ns.c0; c <= ns.c1; c++) {
								if (c === COL_NAME)          next[r] = { ...next[r], name: val };
								else if (c === COL_CATEGORY) next[r] = { ...next[r], category: val || undefined };
								else                         next[r] = { ...next[r], price: parseFloat(val) || 0 };
							}
						}
					}
					publishWithHistory(next, prev);
					return next;
				}

				// Multi-line clipboard: paste downward from the anchor row.
				pastedLines.forEach((line, lineIdx) => {
					const rowIdx = anchor.row + lineIdx;
					if (rowIdx >= next.length) next.push(makeRow());
					const cells = line.split('\t');
					if (cells.length >= 3) {
						next[rowIdx] = {
							...next[rowIdx],
							name:     cells[0].trim(),
							category: cells[1].trim() || undefined,
							price:    parseFloat(cells[2]) || 0,
						};
					} else if (cells.length === 2) {
						if (anchor.col === COL_NAME) {
							next[rowIdx] = { ...next[rowIdx], name: cells[0].trim(), category: cells[1].trim() || undefined };
						} else if (anchor.col === COL_CATEGORY) {
							next[rowIdx] = { ...next[rowIdx], category: cells[0].trim() || undefined, price: parseFloat(cells[1]) || 0 };
						} else {
							next[rowIdx] = { ...next[rowIdx], name: cells[0].trim(), price: parseFloat(cells[1]) || 0 };
						}
					} else {
						if (anchor.col === COL_NAME)          next[rowIdx] = { ...next[rowIdx], name: cells[0].trim() };
						else if (anchor.col === COL_CATEGORY) next[rowIdx] = { ...next[rowIdx], category: cells[0].trim() || undefined };
						else                                  next[rowIdx] = { ...next[rowIdx], price: parseFloat(cells[0]) || 0 };
					}
				});
				publishWithHistory(next, prev);
				return next;
			});
		});
		return true;
	}

	return false;
}

function handleNavigation(
	e: React.KeyboardEvent,
	focus: CellCoord,
	rowCount: number,
	moveSelection: (row: number, col: 0 | 1 | 2) => void,
	navigate: (row: number, col: 0 | 1 | 2) => void,
	clearSelection: () => void,
	setSelFocus: Dispatch<SetStateAction<CellCoord | null>>,
): boolean {
	switch (e.key) {
		case 'ArrowUp':
			e.preventDefault();
			if (focus.row > 0) {
				if (e.shiftKey) setSelFocus({ row: focus.row - 1, col: focus.col });
				else moveSelection(focus.row - 1, focus.col as 0 | 1 | 2);
			}
			return true;
		case 'ArrowDown':
			e.preventDefault();
			if (focus.row < rowCount - 1) {
				if (e.shiftKey) setSelFocus({ row: focus.row + 1, col: focus.col });
				else moveSelection(focus.row + 1, focus.col as 0 | 1 | 2);
			}
			return true;
		case 'ArrowLeft':
			e.preventDefault();
			if (focus.col > 0) {
				if (e.shiftKey) setSelFocus({ row: focus.row, col: focus.col - 1 });
				else moveSelection(focus.row, (focus.col - 1) as 0 | 1 | 2);
			}
			// No row wrap-around: ArrowLeft at col 0 stays put
			return true;
		case 'ArrowRight':
			e.preventDefault();
			if (focus.col < TOTAL_COLS - 1) {
				if (e.shiftKey) setSelFocus({ row: focus.row, col: focus.col + 1 });
				else moveSelection(focus.row, (focus.col + 1) as 0 | 1 | 2);
			}
			// No row wrap-around: ArrowRight at last col stays put
			return true;
		case 'Enter':
		case 'F2':
			e.preventDefault();
			navigate(focus.row, focus.col as 0 | 1 | 2);
			return true;
		case 'Tab':
			e.preventDefault();
			if (!e.shiftKey) {
				if (focus.col < TOTAL_COLS - 1) moveSelection(focus.row, (focus.col + 1) as 0 | 1 | 2);
				else if (focus.row < rowCount - 1) moveSelection(focus.row + 1, COL_NAME);
			} else {
				if (focus.col > 0) moveSelection(focus.row, (focus.col - 1) as 0 | 1 | 2);
				else if (focus.row > 0) moveSelection(focus.row - 1, COL_PRICE);
			}
			return true;
		case 'Escape':
			clearSelection();
			return true;
	}
	return false;
}

function handleTypeToEdit(
	e: React.KeyboardEvent,
	focus: CellCoord,
	useReactSelect: boolean,
	setEditingCell: Dispatch<SetStateAction<CellCoord | null>>,
	clearSelection: () => void,
	setRows: Dispatch<SetStateAction<ReceiptRow[]>>,
	publishTyping: (next: ReceiptRow[], prev: ReceiptRow[]) => void,
	seedPriceDraft: (rowIdx: number, key: string) => void,
	categorySelectRefs: MutableRefObject<Map<string, SelectInstance<CategoryOption, false> | null>>,
	rowsRef: MutableRefObject<ReceiptRow[]>,
	setOpenCategoryRow: Dispatch<SetStateAction<number | null>>,
	setCategorySearchInput: Dispatch<SetStateAction<string>>,
	inputRefs: MutableRefObject<Map<string, [HTMLInputElement | null, HTMLInputElement | null]>>,
): boolean {
	if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return false;
	const key = e.key;

	if (focus.col === COL_CATEGORY) {
		if (!useReactSelect) return false;
		e.preventDefault();
		setOpenCategoryRow(focus.row);
		setCategorySearchInput(key);
		const id = rowsRef.current[focus.row]?._id;
		if (id) setTimeout(() => categorySelectRefs.current.get(id)?.focus(), 0);
		return true;
	}

	e.preventDefault();

	if (focus.col === COL_NAME) {
		// Use publishTyping (buffered) so the first keystroke does NOT immediately
		// fire onChange/autosave. The edit will be committed via flushPending on
		// blur or navigation — exactly the same as subsequent keystrokes in the cell.
		setRows((prev) => {
			const next = [...prev];
			next[focus.row] = { ...next[focus.row], name: key };
			publishTyping(next, prev);
			return next;
		});
	} else {
		if (!/[\d.]/.test(key)) return false;
		seedPriceDraft(focus.row, key);
	}

	setEditingCell({ row: focus.row, col: focus.col });
	clearSelection();
	setTimeout(() => {
		const id = rowsRef.current[focus.row]?._id;
		if (!id) return;
		const inputIdx = focus.col === COL_PRICE ? 1 : 0;
		const input = inputRefs.current.get(id)?.[inputIdx];
		if (input) {
			input.focus({ preventScroll: true });
			input.setSelectionRange(1, 1);
		}
	}, 0);
	return true;
}

function handleCellClear(
	e: React.KeyboardEvent,
	anchor: CellCoord | null,
	focus: CellCoord,
	setRows: Dispatch<SetStateAction<ReceiptRow[]>>,
	publishWithHistory: (next: ReceiptRow[], prev: ReceiptRow[]) => void,
): boolean {
	if (e.key !== 'Backspace' && e.key !== 'Delete') return false;
	e.preventDefault();
	const ns: NormalisedSelection = normaliseSel(anchor ?? focus, focus);
	setRows((prev) => {
		const next = [...prev];
		for (let r = ns.r0; r <= ns.r1; r++) {
			for (let c = ns.c0; c <= ns.c1; c++) {
				if (c === COL_NAME)          next[r] = { ...next[r], name: '' };
				else if (c === COL_CATEGORY) next[r] = { ...next[r], category: undefined };
				else                         next[r] = { ...next[r], price: 0 };
			}
		}
		publishWithHistory(next, prev);
		return next;
	});
	return true;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export interface UseSpreadsheetKeysOptions {
	selRef: MutableRefObject<{ selAnchor: CellCoord | null; selFocus: CellCoord | null }>;
	rowsRef: MutableRefObject<ReceiptRow[]>;
	undo: () => void;
	redo: () => void;
	moveSelection: (row: number, col: 0 | 1 | 2) => void;
	navigate: (row: number, col: 0 | 1 | 2) => void;
	clearSelection: () => void;
	setSelFocus: Dispatch<SetStateAction<CellCoord | null>>;
	setEditingCell: Dispatch<SetStateAction<CellCoord | null>>;
	setRows: Dispatch<SetStateAction<ReceiptRow[]>>;
	publishWithHistory: (next: ReceiptRow[], prev: ReceiptRow[]) => void;
	publishTyping: (next: ReceiptRow[], prev: ReceiptRow[]) => void;
	flushPending: () => void;
	seedPriceDraft: (rowIdx: number, key: string) => void;
	useReactSelect: boolean;
	categorySelectRefs: MutableRefObject<Map<string, SelectInstance<CategoryOption, false> | null>>;
	setOpenCategoryRow: Dispatch<SetStateAction<number | null>>;
	setCategorySearchInput: Dispatch<SetStateAction<string>>;
	inputRefs: MutableRefObject<Map<string, [HTMLInputElement | null, HTMLInputElement | null]>>;
	containerRef: RefObject<HTMLDivElement | null>;
	isNavigatingRef: MutableRefObject<boolean>;
}

export interface UseSpreadsheetKeysResult {
	handleContainerKeyDown: React.KeyboardEventHandler;
	handleCellKeyDown: (
		e: React.KeyboardEvent<HTMLInputElement>,
		rowIdx: number,
		col: 0 | 1 | 2,
		rowCount: number,
	) => void;
}

export function useSpreadsheetKeys(opts: UseSpreadsheetKeysOptions): UseSpreadsheetKeysResult {
	const {
		selRef, rowsRef, undo, redo,
		moveSelection, navigate, clearSelection, setSelFocus,
		setEditingCell, setRows, publishWithHistory, publishTyping, flushPending,
		seedPriceDraft, useReactSelect,
		categorySelectRefs, setOpenCategoryRow, setCategorySearchInput,
		inputRefs, containerRef, isNavigatingRef,
	} = opts;

	const handleContainerKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if ((e.target as HTMLElement).tagName === 'INPUT') return;
			if (handleUndoRedo(e, undo, redo)) return;

			const { selAnchor: a, selFocus: f } = selRef.current;

			if (handleClipboard(e, selRef, rowsRef, setRows, publishWithHistory, a)) return;

			if (f) {
				const rowCount = rowsRef.current.length;
				if (handleNavigation(e, f, rowCount, moveSelection, navigate, clearSelection, setSelFocus)) return;
				if (handleTypeToEdit(e, f, useReactSelect, setEditingCell, clearSelection, setRows, publishTyping, seedPriceDraft, categorySelectRefs, rowsRef, setOpenCategoryRow, setCategorySearchInput, inputRefs)) return;
				handleCellClear(e, a, f, setRows, publishWithHistory);
			}
		},
		[undo, redo, selRef, rowsRef, setRows, publishWithHistory, publishTyping, moveSelection, navigate, clearSelection, setSelFocus, setEditingCell, useReactSelect, seedPriceDraft, categorySelectRefs, setOpenCategoryRow, setCategorySearchInput, inputRefs],
	);

	const handleCellKeyDown = useCallback(
		(
			e: React.KeyboardEvent<HTMLInputElement>,
			rowIdx: number,
			col: 0 | 1 | 2,
			rowCount: number,
		) => {
			switch (e.key) {
				case 'Tab':
					e.preventDefault();
					if (!e.shiftKey) {
						if (col === COL_NAME) moveSelection(rowIdx, COL_CATEGORY);
						else if (rowIdx < rowCount - 1) moveSelection(rowIdx + 1, COL_NAME);
					} else {
						if (col === COL_PRICE) moveSelection(rowIdx, COL_CATEGORY);
						else if (rowIdx > 0) moveSelection(rowIdx - 1, COL_PRICE);
					}
					break;
				case 'Enter':
					e.preventDefault();
					if (rowIdx < rowCount - 1) moveSelection(rowIdx + 1, col);
					else {
						setEditingCell(null);
						containerRef.current?.focus({ preventScroll: true });
					}
					break;
				case 'ArrowUp':
					if (rowIdx > 0) { e.preventDefault(); moveSelection(rowIdx - 1, col); }
					break;
				case 'ArrowDown':
					if (rowIdx < rowCount - 1) { e.preventDefault(); moveSelection(rowIdx + 1, col); }
					break;
				case 'Escape':
					setEditingCell(null);
					containerRef.current?.focus({ preventScroll: true });
					break;
			}
			if (e.key === 'Escape' && !isNavigatingRef.current) {
				flushPending();
			}
		},
		[moveSelection, setEditingCell, containerRef, flushPending, isNavigatingRef],
	);

	return { handleContainerKeyDown, handleCellKeyDown };
}
