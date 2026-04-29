/**
 * ReceiptSpreadsheet — refactored with stable row IDs and extracted hooks.
 *
 * Architecture:
 *  - ReceiptSpreadsheet: public export, wraps SpreadsheetProvider with config
 *  - SpreadsheetGrid: inner component that consumes SpreadsheetContext + all hooks
 *  - Hooks: useReceiptHistory, useSpreadsheetSelection, usePriceDraft, useSpreadsheetKeys
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type React from 'react';
import Select, { type SelectInstance } from 'react-select';

import type { ReceiptData, ReceiptRow } from '../../types';
import { CUSTOM_GROCERY_CATEGORIES } from '../../types';
import { CATEGORY_NONE_LABEL } from '../../constants';
import {
	receiptDataSignature,
	selectionToClipboardText,
} from '../../utils/receipt-scanner/receiptData';
import { makeRow, hydrateIds } from '../../domain/receipt';
import { useReceiptHistory } from '../../hooks/receipt-scanner/useReceiptHistory';
import {
	useSpreadsheetSelection,
	normaliseSel,
	type CellCoord,
} from '../../hooks/receipt-scanner/useSpreadsheetSelection';
import { usePriceDraft } from '../../hooks/receipt-scanner/usePriceDraft';
import { useSpreadsheetKeys } from '../../hooks/receipt-scanner/useSpreadsheetKeys';
import {
	SpreadsheetProvider,
	useSpreadsheetConfig,
} from './ReceiptSpreadsheet/SpreadsheetContext';
import SheetContextMenu from './ReceiptSpreadsheet/SheetContextMenu';
import {
	type CategoryOption,
	CategoryOptionComponent,
	CategorySingleValueComponent,
	CATEGORY_SELECT_STYLES,
} from './ReceiptSpreadsheet/CategorySelect';

// ── Constants & interfaces ────────────────────────────────────────────────

const GRID_COLS = '44px minmax(0,1fr) 212px 90px';
const COL_NAME = 0;
const COL_CATEGORY = 1;
const COL_PRICE = 2;

export interface ReceiptSpreadsheetProps {
	data: ReceiptData;
	onChange: (next: ReceiptData) => void;
	/** Override the category list shown in the dropdown. Defaults to CUSTOM_GROCERY_CATEGORIES. */
	categories?: string[];
	/** Function to resolve category names to hex colors. */
	getCategoryColor?: (name: string) => string;
	/** Disable native select in favor of react-select */
	useReactSelect?: boolean;
	/** When true, renders a blocking overlay so the user cannot interact with the grid. */
	disabled?: boolean;
}

interface SheetMenuState {
	x: number; y: number; rowIdx: number;
	isMulti: boolean; r0: number; r1: number;
}

// ── Inner component (consumes SpreadsheetContext) ─────────────────────────

function SpreadsheetGrid({ data, onChange }: Pick<ReceiptSpreadsheetProps, 'data' | 'onChange'>) {
	const { categories, getCategoryColor, useReactSelect } = useSpreadsheetConfig();
	const containerRef = useRef<HTMLDivElement>(null);
	const [openCategoryRow, setOpenCategoryRow] = useState<number | null>(null);
	// Mirror state into a ref so the container keydown handler can read the current
	// value synchronously (no stale-closure issue, no need to re-create the callback).
	const openCategoryRowRef = useRef<number | null>(null);
	openCategoryRowRef.current = openCategoryRow;
	const [categorySearchInput, setCategorySearchInput] = useState('');
	const [editingCell, setEditingCell] = useState<CellCoord | null>(null);
	const [menu, setMenu] = useState<SheetMenuState | null>(null);
	const isNavigatingRef = useRef(false);
	const inputRefs = useRef<Map<string, [HTMLInputElement | null, HTMLInputElement | null]>>(new Map());
	const categorySelectRefs = useRef<Map<string, SelectInstance<CategoryOption, false> | null>>(new Map());

	const onChangeRef = useRef(onChange);
	const prevSigRef = useRef(receiptDataSignature(data));
	useEffect(() => { onChangeRef.current = onChange; });

	const publish = useCallback((nextRows: ReceiptRow[]) => {
		const safe = nextRows.length > 0 ? nextRows : [makeRow()];
		prevSigRef.current = receiptDataSignature({ rows: safe });
		onChangeRef.current({ rows: safe });
		return safe;
	}, []);

	const { rows, setRows, rowsRef, pushHistory, publishTyping, flushPending, undo, redo } =
		useReceiptHistory(() => hydrateIds(data.rows.length > 0 ? data.rows : [makeRow()]), { publish });

	const publishWithHistory = useCallback((next: ReceiptRow[], prev: ReceiptRow[]) => {
		pushHistory(prev);
		publish(next);
	}, [pushHistory, publish]);

	const sel = useSpreadsheetSelection(containerRef);
	const { setSelAnchor, setSelFocus, clearSelection } = sel;
	const pd = usePriceDraft();

	const categoryOptions = useMemo<CategoryOption[]>(() => [
		{ value: '', label: CATEGORY_NONE_LABEL },
		...categories.map((cat) => ({ value: cat, label: cat, color: getCategoryColor?.(cat) })),
	], [categories, getCategoryColor]);

	// Sync rows when external data changes (e.g. after a fresh scan).
	useEffect(() => {
		const sig = receiptDataSignature(data);
		if (sig === prevSigRef.current) return;
		prevSigRef.current = sig;
		setRows(hydrateIds(data.rows.length > 0 ? data.rows : [makeRow()]));
		// Do NOT call setEditingCell(null) here — autosave round-trips should not
		// interrupt the user's current cell editing session.
	}, [data, setRows]);

	const focusCell = useCallback((rowIdx: number, col: 0 | 1 | 2) => {
		if (col === COL_CATEGORY) return;
		const id = rowsRef.current[rowIdx]?._id;
		if (!id) return;
		const input = inputRefs.current.get(id)?.[col === COL_PRICE ? 1 : 0];
		// preventScroll: true keeps the browser from jumping the <main> scroll
		// container; the caller is responsible for scrollIntoView separately.
		input?.focus({ preventScroll: true });
		input?.select();
	}, [rowsRef]);

	const moveSelection = useCallback((row: number, col: 0 | 1 | 2) => {
		isNavigatingRef.current = true;
		setEditingCell(null);
		setSelAnchor({ row, col });
		setSelFocus({ row, col });
		setTimeout(() => {
			containerRef.current?.focus({ preventScroll: true });
			(containerRef.current?.querySelector(
				`[data-cell-row="${row}"][data-cell-col="${col}"]`,
			) as HTMLElement)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
			isNavigatingRef.current = false;
		}, 0);
	}, [setSelAnchor, setSelFocus]);

	const navigate = useCallback((row: number, col: 0 | 1 | 2) => {
		isNavigatingRef.current = true;
		setEditingCell({ row, col });
		clearSelection();
		setTimeout(() => { focusCell(row, col); isNavigatingRef.current = false; }, 0);
	}, [clearSelection, focusCell]);

	const { handleContainerKeyDown, handleCellKeyDown } = useSpreadsheetKeys({
		selRef: sel.selRef,
		rowsRef, undo, redo,
		moveSelection, navigate, clearSelection, setSelFocus,
		setEditingCell, setRows, publishWithHistory, publishTyping, flushPending,
		seedPriceDraft: pd.seedDraft, useReactSelect,
		categorySelectRefs, setOpenCategoryRow, setCategorySearchInput,
		inputRefs, containerRef, isNavigatingRef, openCategoryRowRef,
	});

	// ── Row mutations ─────────────────────────────────────────────────────

	const startEditCell = useCallback((rowIdx: number, col: 0 | 1 | 2 = COL_NAME) => {
		isNavigatingRef.current = true;
		setEditingCell({ row: rowIdx, col });
		clearSelection();
		setTimeout(() => { focusCell(rowIdx, col); isNavigatingRef.current = false; }, 0);
	}, [clearSelection, focusCell]);

	const insertRowAt = useCallback((idx: number) => {
		setRows((prev) => { const next = [...prev.slice(0, idx), makeRow(), ...prev.slice(idx)]; publishWithHistory(next, prev); return next; });
		startEditCell(idx);
	}, [publishWithHistory, setRows, startEditCell]);

	const deleteRowAt = useCallback((idx: number) => {
		setRows((prev) => { const next = prev.length > 1 ? prev.filter((_, i) => i !== idx) : [makeRow()]; publishWithHistory(next, prev); return next; });
		setEditingCell(null);
	}, [publishWithHistory, setRows]);

	const addRow = useCallback(() => {
		const newIdx = rowsRef.current.length;
		setRows((prev) => { const next = [...prev, makeRow()]; publishWithHistory(next, prev); return next; });
		startEditCell(newIdx);
	}, [publishWithHistory, rowsRef, setRows, startEditCell]);

	const deleteRowsInRange = useCallback((r0: number, r1: number) => {
		setRows((prev) => { const next = prev.filter((_, i) => i < r0 || i > r1); const safe = next.length > 0 ? next : [makeRow()]; publishWithHistory(safe, prev); return safe; });
		clearSelection();
		setEditingCell(null);
	}, [clearSelection, publishWithHistory, setRows]);

	const updateCategory = useCallback((rowIdx: number, category: string) => {
		setRows((prev) => { const next = prev.map((r, i) => i === rowIdx ? { ...r, category: category || undefined } : r); publishWithHistory(next, prev); return next; });
	}, [publishWithHistory, setRows]);

	const copySelection = useCallback(() => {
		const { selAnchor: a, selFocus: f } = sel.selRef.current;
		if (!a || !f) return;
		const ns = normaliseSel(a, f);
		void navigator.clipboard.writeText(selectionToClipboardText(rowsRef.current, ns.r0, ns.r1, ns.c0, ns.c1));
	}, [rowsRef, sel.selRef]);

	const toggleCategoryDropdown = useCallback((rowIdx: number) => {
		setOpenCategoryRow((prev) => {
			if (prev === rowIdx) { setCategorySearchInput(''); return null; }
			const id = rowsRef.current[rowIdx]?._id;
			setTimeout(() => { if (id) categorySelectRefs.current.get(id)?.focus(); }, 0);
			return rowIdx;
		});
	}, [rowsRef]);

	// ── Render ────────────────────────────────────────────────────────────

	const { normSel, isMultiSel } = sel;



	return (
		<>
			<div
				ref={containerRef}
				tabIndex={0}
				className="w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] outline-none"
				onKeyDown={handleContainerKeyDown}
				onMouseDown={(e) => {
					if ((e.target as HTMLElement).tagName !== 'INPUT') {
						e.preventDefault();
						containerRef.current?.focus({ preventScroll: true });
					}
				}}
			>
				{/* Column headers */}
				<div
					className="grid select-none border-b border-slate-200/80 bg-[#f6f6f7]"
					style={{ gridTemplateColumns: GRID_COLS }}
				>
					<div className="h-9 border-r border-slate-200/80" />
					<div className="h-9 flex items-center px-3 border-r border-slate-200/80">
						<span className="text-[10.5px] font-semibold tracking-[0.09em] uppercase text-slate-400">Name</span>
					</div>
					<div className="h-9 flex items-center px-3 border-r border-slate-200/80">
						<span className="text-[10.5px] font-semibold tracking-[0.09em] uppercase text-slate-400">Category</span>
					</div>
					<div className="h-9 flex items-center justify-end px-3">
						<span className="text-[10.5px] font-semibold tracking-[0.09em] uppercase text-slate-400">Price</span>
					</div>
				</div>

				{/* Data rows */}
				{rows.map((row, rowIdx) => {
					const id = row._id ?? `row-${rowIdx}`;
					return (
						<div
							key={id}
							onContextMenu={(e) => {
								e.preventDefault();
								setOpenCategoryRow(null);
								setCategorySearchInput('');
								const isInMultiSel = isMultiSel && normSel !== null && rowIdx >= normSel.r0 && rowIdx <= normSel.r1 && normSel.r0 !== normSel.r1;
								setMenu({ x: e.clientX, y: e.clientY, rowIdx, isMulti: isInMultiSel, r0: isInMultiSel ? normSel.r0 : rowIdx, r1: isInMultiSel ? normSel.r1 : rowIdx });
							}}
							className={`grid group${rowIdx < rows.length - 1 ? ' border-b border-slate-200' : ''}`}
							style={{ gridTemplateColumns: GRID_COLS }}
						>
							{/* Row index */}
							<div className="flex h-10 items-center justify-center border-r border-slate-200 text-[11px] font-medium text-slate-300 select-none transition-colors group-hover:text-slate-400">
								{rowIdx + 1}
							</div>

							{/* Name cell */}
							<div
								data-cell-row={rowIdx}
								data-cell-col={0}
								className={`relative h-10 border-r border-slate-200 cursor-default select-none${editingCell?.row === rowIdx && editingCell?.col === 0 ? ' bg-indigo-50/30' : sel.cellInSel(rowIdx, 0) ? ' bg-emerald-50' : ''}`}
								style={sel.cellStyle(rowIdx, 0, editingCell)}
								onMouseDown={(e) => {
									if (e.button === 2) return;
									if (editingCell?.row === rowIdx && editingCell?.col === 0) return;
									setOpenCategoryRow(null);
									setCategorySearchInput('');
									sel.startCellSelect(e, rowIdx, 0);
								}}
								onMouseEnter={() => { if (sel.isDragSelecting.current) setSelFocus({ row: rowIdx, col: 0 }); }}
								onDoubleClick={() => { setEditingCell({ row: rowIdx, col: 0 }); clearSelection(); setTimeout(() => focusCell(rowIdx, 0), 0); }}
							>
								{sel.selBorderEl(rowIdx, 0)}
								<input
									ref={(el) => {
										if (!inputRefs.current.has(id)) inputRefs.current.set(id, [null, null]);
										inputRefs.current.get(id)![0] = el;
									}}
									type="text"
									readOnly={!(editingCell?.row === rowIdx && editingCell?.col === 0)}
									value={row.name}
									placeholder="Item name"
									onChange={(e) => {
										const val = e.target.value;
										setRows((prev) => { const next = prev.map((r, i) => i === rowIdx ? { ...r, name: val } : r); publishTyping(next, prev); return next; });
									}}
									onKeyDown={(e) => handleCellKeyDown(e, rowIdx, 0, rows.length)}
									onBlur={() => { flushPending(); if (!isNavigatingRef.current) setEditingCell(null); }}
									className={`absolute inset-0 h-full w-full bg-transparent px-3 text-[13px] text-slate-800 outline-none placeholder:text-slate-300${editingCell?.row === rowIdx && editingCell?.col === 0 ? ' cursor-text' : ' cursor-default pointer-events-none'}`}
								/>
							</div>

							{/* Category cell */}
							<div
								data-cell-row={rowIdx}
								data-cell-col={COL_CATEGORY}
								className={`relative h-10 cursor-default border-r border-slate-200 px-3 transition-[filter] duration-150 hover:brightness-[0.94]${isMultiSel && sel.cellInSel(rowIdx, COL_CATEGORY) ? ' bg-emerald-50' : ''}`}
								style={{
									...sel.cellStyle(rowIdx, COL_CATEGORY, editingCell),
									backgroundColor: isMultiSel && sel.cellInSel(rowIdx, COL_CATEGORY) ? '#ecfdf5' : row.category && getCategoryColor ? `${getCategoryColor(row.category)}20` : undefined,
								}}
								onMouseDown={(e) => {
									if (e.button !== 0) return;
									e.stopPropagation();
									const clickedSearchInput = (e.target as HTMLElement).tagName === 'INPUT';
									const clickedIndicator = !!(e.target as HTMLElement).closest('.rs__dropdown-indicator');
									if (!clickedSearchInput && !clickedIndicator) containerRef.current?.focus({ preventScroll: true });
									if (e.shiftKey && sel.selAnchor) {
										setSelFocus({ row: rowIdx, col: COL_CATEGORY });
									} else {
										setSelAnchor({ row: rowIdx, col: COL_CATEGORY });
										setSelFocus({ row: rowIdx, col: COL_CATEGORY });
									}
									sel.isDragSelecting.current = true;
									// Clicking the cell body only selects it (for copy); only the dropdown
									// arrow indicator opens the search menu. Guard against calling
									// toggleCategoryDropdown when the menu is already open for this row
									// because react-select fires onMenuClose first (before this handler),
									// and calling toggle on top of that re-opens the menu immediately.
									if (useReactSelect && clickedIndicator && openCategoryRow !== rowIdx) toggleCategoryDropdown(rowIdx);
								}}
								onMouseEnter={() => { if (sel.isDragSelecting.current) setSelFocus({ row: rowIdx, col: COL_CATEGORY }); }}
							>
								{row.category && getCategoryColor && (
									<div className="pointer-events-none absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: getCategoryColor(row.category), zIndex: 1 }} />
								)}
								{sel.selBorderEl(rowIdx, COL_CATEGORY)}
								{useReactSelect ? (
									<Select<CategoryOption, false>
										ref={(instance) => { categorySelectRefs.current.set(id, instance); }}
										options={categoryOptions}
										value={categoryOptions.find((opt) => opt.value === (row.category ?? '')) ?? null}
										menuIsOpen={openCategoryRow === rowIdx}
										inputValue={openCategoryRow === rowIdx ? categorySearchInput : ''}
										openMenuOnFocus={false}
										openMenuOnClick={false}
							onMenuClose={() => { setOpenCategoryRow((prev) => (prev === rowIdx ? null : prev)); setCategorySearchInput(''); setTimeout(() => containerRef.current?.focus({ preventScroll: true }), 0); }}
							onInputChange={(value, meta) => { if (meta.action === 'input-change') setCategorySearchInput(value); else if (meta.action === 'menu-close') setCategorySearchInput(''); return value; }}
							onChange={(option) => { updateCategory(rowIdx, option?.value ?? ''); setOpenCategoryRow(null); setCategorySearchInput(''); setTimeout(() => containerRef.current?.focus({ preventScroll: true }), 0); }}
										components={{ Option: CategoryOptionComponent, SingleValue: CategorySingleValueComponent }}
										isSearchable isClearable={false} isMulti={false}
										menuPlacement="auto" menuPosition="fixed" menuPortalTarget={document.body} maxMenuHeight={200}
										className="react-select-tiny w-full" classNamePrefix="rs"
										aria-label={`Category for row ${rowIdx + 1}`}
										styles={CATEGORY_SELECT_STYLES}
									/>
								) : (
									<select
										value={row.category ?? ''}
										onChange={(e) => updateCategory(rowIdx, e.target.value)}
										aria-label={`Category for row ${rowIdx + 1}`}
										className="w-full bg-transparent text-[11.5px] text-slate-600 outline-none cursor-pointer truncate leading-tight"
									>
										<option value="">-- None --</option>
										{categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
									</select>
								)}
							</div>

							{/* Price cell */}
							<div
								data-cell-row={rowIdx}
								data-cell-col={COL_PRICE}
								className={`relative h-10 cursor-default select-none${editingCell?.row === rowIdx && editingCell?.col === COL_PRICE ? ' bg-indigo-50/30' : sel.cellInSel(rowIdx, COL_PRICE) ? ' bg-emerald-50' : ''}`}
								style={sel.cellStyle(rowIdx, COL_PRICE, editingCell)}
								onMouseDown={(e) => {
									if (e.button === 2) return;
									if (editingCell?.row === rowIdx && editingCell?.col === COL_PRICE) return;
									setOpenCategoryRow(null);
									setCategorySearchInput('');
									sel.startCellSelect(e, rowIdx, COL_PRICE);
								}}
								onMouseEnter={() => { if (sel.isDragSelecting.current) setSelFocus({ row: rowIdx, col: COL_PRICE }); }}
								onDoubleClick={() => { setEditingCell({ row: rowIdx, col: COL_PRICE }); clearSelection(); setTimeout(() => focusCell(rowIdx, COL_PRICE), 0); }}
							>
								{sel.selBorderEl(rowIdx, COL_PRICE)}
								<input
									ref={(el) => {
										if (!inputRefs.current.has(id)) inputRefs.current.set(id, [null, null]);
										inputRefs.current.get(id)![1] = el;
									}}
									type="text"
									inputMode="decimal"
									value={pd.getDisplayValue(rowIdx, row.price)}
									placeholder="0.00"
									readOnly={!(editingCell?.row === rowIdx && editingCell?.col === COL_PRICE)}
									onChange={(e) => pd.handleChange(rowIdx, e.target.value)}
									onFocus={() => pd.handleFocus(rowIdx, row.price)}
									onBlur={() => {
										pd.handleBlur(rowIdx, (parsed) => {
											setRows((prev) => { const next = prev.map((r, i) => i === rowIdx ? { ...r, price: parsed } : r); publishWithHistory(next, prev); return next; });
										});
										if (!isNavigatingRef.current) setEditingCell(null);
									}}
									onKeyDown={(e) => handleCellKeyDown(e, rowIdx, COL_PRICE, rows.length)}
									className={`absolute inset-0 h-full w-full bg-transparent px-3 text-right text-[13px] text-slate-800 outline-none placeholder:text-slate-300${editingCell?.row === rowIdx && editingCell?.col === COL_PRICE ? ' cursor-text' : ' cursor-default pointer-events-none'}`}
								/>
							</div>
						</div>
					);
				})}

				{/* Add row */}
				<button
					onMouseDown={(e) => e.preventDefault()}
					onClick={addRow}
					className="flex h-9 w-full cursor-default items-center gap-1.5 border-t border-slate-200 px-[14px] text-[12px] text-slate-400 transition-colors hover:bg-slate-50/80 hover:text-slate-600"
				>
					<svg className="h-[11px] w-[11px] shrink-0" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
						<path d="M6.5 1a.5.5 0 0 0-1 0v4.5H1a.5.5 0 0 0 0 1h4.5V11a.5.5 0 0 0 1 0V6.5H11a.5.5 0 0 0 0-1H6.5V1z" />
					</svg>
					Add row
				</button>
			</div>

			{menu && (
				<SheetContextMenu
					x={menu.x}
					y={menu.y}
					isMultiSel={menu.isMulti}
					onClose={() => setMenu(null)}
					onInsertAbove={() => insertRowAt(menu.rowIdx)}
					onInsertBelow={() => insertRowAt(menu.rowIdx + 1)}
					onAddToEnd={addRow}
					onDelete={() => deleteRowAt(menu.rowIdx)}
					onCopy={copySelection}
					onDeleteSelected={() => deleteRowsInRange(menu.r0, menu.r1)}
				/>
			)}
		</>
	);
}

// ── Public component ──────────────────────────────────────────────────────

export default function ReceiptSpreadsheet({
	data,
	onChange,
	categories: categoriesProp,
	getCategoryColor,
	useReactSelect = false,
	disabled = false,
}: ReceiptSpreadsheetProps): React.ReactElement {
	return (
		<SpreadsheetProvider
			value={{
				categories: categoriesProp ?? [...CUSTOM_GROCERY_CATEGORIES],
				getCategoryColor,
				useReactSelect,
			}}
		>
			<div className="relative">
				<SpreadsheetGrid data={data} onChange={onChange} />
				{disabled && (
					<div
						className="absolute inset-0 z-10 flex cursor-not-allowed items-center justify-center bg-white/60"
						aria-hidden="true"
					/>
				)}
			</div>
		</SpreadsheetProvider>
	);
}

