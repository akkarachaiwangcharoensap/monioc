import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { RefObject, MutableRefObject } from 'react';
import type React from 'react';

export interface CellCoord {
	row: number;
	col: number;
}

export interface NormalisedSelection {
	r0: number;
	r1: number;
	c0: number;
	c1: number;
}

export function normaliseSel(anchor: CellCoord, focus: CellCoord): NormalisedSelection {
	return {
		r0: Math.min(anchor.row, focus.row),
		r1: Math.max(anchor.row, focus.row),
		c0: Math.min(anchor.col, focus.col),
		c1: Math.max(anchor.col, focus.col),
	};
}

const SEL_BORDER = '2px solid #10b981';

export interface UseSpreadsheetSelectionResult {
	selAnchor: CellCoord | null;
	selFocus: CellCoord | null;
	normSel: NormalisedSelection | null;
	isMultiSel: boolean;
	cellInSel: (row: number, col: number) => boolean;
	selBorderEl: (rowIdx: number, col: number) => React.ReactNode;
	cellStyle: (rowIdx: number, col: number, editingCell: CellCoord | null) => React.CSSProperties;
	startCellSelect: (e: React.MouseEvent, rowIdx: number, col: number) => void;
	setSelFocus: React.Dispatch<React.SetStateAction<CellCoord | null>>;
	setSelAnchor: React.Dispatch<React.SetStateAction<CellCoord | null>>;
	clearSelection: () => void;
	selRef: MutableRefObject<{ selAnchor: CellCoord | null; selFocus: CellCoord | null }>;
	isDragSelecting: MutableRefObject<boolean>;
}

export function useSpreadsheetSelection(
	containerRef: RefObject<HTMLDivElement | null>,
): UseSpreadsheetSelectionResult {
	const [selAnchor, setSelAnchor] = useState<CellCoord | null>(null);
	const [selFocus, setSelFocus] = useState<CellCoord | null>(null);

	const selRef = useRef<{ selAnchor: CellCoord | null; selFocus: CellCoord | null }>({
		selAnchor: null,
		selFocus: null,
	});
	const isDragSelecting = useRef(false);

	// Keep selRef in sync
	selRef.current = { selAnchor, selFocus };

	// End drag-selection when the pointer is released anywhere.
	useEffect(() => {
		const end = () => { isDragSelecting.current = false; };
		document.addEventListener('mouseup', end);
		return () => document.removeEventListener('mouseup', end);
	}, []);

	// Clear selection when clicking outside the spreadsheet.
	useEffect(() => {
		const handleOutsideMouseDown = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (
				containerRef.current &&
				!containerRef.current.contains(target) &&
				!target.closest('[class*="rs__"]')
			) {
				setSelAnchor(null);
				setSelFocus(null);
			}
		};
		document.addEventListener('mousedown', handleOutsideMouseDown);
		return () => document.removeEventListener('mousedown', handleOutsideMouseDown);
	}, [containerRef]);

	const normSel = useMemo(
		() => (selAnchor && selFocus ? normaliseSel(selAnchor, selFocus) : null),
		[selAnchor, selFocus],
	);

	const isMultiSel = useMemo(
		() => normSel !== null && (normSel.r0 !== normSel.r1 || normSel.c0 !== normSel.c1),
		[normSel],
	);

	const cellInSel = useCallback(
		(row: number, col: number): boolean =>
			normSel !== null &&
			row >= normSel.r0 &&
			row <= normSel.r1 &&
			col >= normSel.c0 &&
			col <= normSel.c1,
		[normSel],
	);

	const selBorderEl = useCallback(
		(rowIdx: number, col: number): React.ReactNode => {
			if (!normSel || !cellInSel(rowIdx, col)) return null;
			return (
				<div
					className="pointer-events-none absolute"
					style={{
						zIndex: 999,
						inset: '-2px',
						right: '0px',
						borderTop:    rowIdx === normSel.r0 ? SEL_BORDER : 'none',
						borderBottom: rowIdx === normSel.r1 ? SEL_BORDER : 'none',
						borderLeft:   col    === normSel.c0 ? SEL_BORDER : 'none',
						borderRight:  col    === normSel.c1 ? SEL_BORDER : 'none',
					}}
				/>
			);
		},
		[normSel, cellInSel],
	);

	const cellStyle = useCallback(
		(rowIdx: number, col: number, editingCell: CellCoord | null): React.CSSProperties => {
			if (editingCell?.row === rowIdx && editingCell?.col === col) {
				return { boxShadow: 'inset 0 0 0 2px rgba(99,102,241,0.7)', zIndex: 10 };
			}
			return {};
		},
		[],
	);

	const startCellSelect = useCallback(
		(e: React.MouseEvent, rowIdx: number, col: number) => {
			e.preventDefault();
			if (e.shiftKey && selAnchor) {
				setSelFocus({ row: rowIdx, col });
			} else {
				setSelAnchor({ row: rowIdx, col });
				setSelFocus({ row: rowIdx, col });
			}
			isDragSelecting.current = true;
			containerRef.current?.focus({ preventScroll: true });
		},
		[selAnchor, containerRef],
	);

	const clearSelection = useCallback(() => {
		setSelAnchor(null);
		setSelFocus(null);
	}, []);

	return {
		selAnchor, selFocus, normSel, isMultiSel,
		cellInSel, selBorderEl, cellStyle,
		startCellSelect, setSelFocus, setSelAnchor,
		clearSelection, selRef, isDragSelecting,
	};
}
