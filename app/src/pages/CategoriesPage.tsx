import { useState, useCallback, useRef, useEffect } from 'react';
import type React from 'react';
import { useCategoriesContext as useCategories } from '../context/CategoriesContext';
import { confirm as confirmDialog } from '@tauri-apps/plugin-dialog';
import { TOAST_DURATION_MS, MAX_CATEGORY_NAME_LENGTH } from '../constants';

// ── Inline editable row ───────────────────────────────────────────────────────

interface CategoryRowProps {
	name: string;
	color: string;
	onRowPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
	onRename: (oldName: string, newName: string) => void;
	onColorChange: (name: string, color: string) => void;
	onDelete: (name: string) => void;
}

function CategoryRow({
	name,
	color,
	onRowPointerDown,
	onRename,
	onColorChange,
	onDelete,
}: CategoryRowProps): React.ReactElement {
	const [editing, setEditing] = useState(false);
	const [hovered, setHovered] = useState(false);
	const [draft, setDraft] = useState(name);
	const inputRef = useRef<HTMLInputElement>(null);
	const isCommittingRef = useRef(false);

	useEffect(() => {
		if (editing) {
			setDraft(name);
			requestAnimationFrame(() => {
				const el = inputRef.current;
				if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
			});
		}
	}, [editing, name]);

	const commit = useCallback(async () => {
		if (isCommittingRef.current) return;
		isCommittingRef.current = true;
		try {
			const trimmed = draft.trim();
			if (trimmed && trimmed !== name) {
				onRename(name, trimmed);
			}
		} finally {
			isCommittingRef.current = false;
			setEditing(false);
		}
	}, [draft, name, onRename]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') { e.preventDefault(); void commit(); }
		if (e.key === 'Escape') { setEditing(false); setDraft(name); }
	};

	return (
		<div
			onPointerDown={editing ? undefined : onRowPointerDown}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			className={`group flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2.5 transition-[border-color,background-color] duration-150 hover:border-slate-200 select-none touch-none ${editing ? '' : 'cursor-grab active:cursor-grabbing'}`}
			style={{
				borderLeftWidth: '3px',
				borderLeftColor: color,
				backgroundColor: hovered ? `${color}18` : '#ffffff',
			}}
			aria-label={`Category row ${name}`}
		>
			<div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-slate-300 group-hover:text-slate-500">
				<i className="fas fa-grip-vertical text-xs" aria-hidden="true" />
			</div>

			{/* Label / inline edit */}
			{editing ? (
				<input
					ref={inputRef}
					type="text"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onBlur={() => { void commit(); }}
					onKeyDown={handleKeyDown}
					maxLength={MAX_CATEGORY_NAME_LENGTH}
					onClick={(e) => e.stopPropagation()}
					className="flex-1 min-w-0 rounded-lg border border-violet-300 bg-violet-50 px-2.5 py-1 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-400 cursor-text"
					aria-label="Edit category name"
				/>
			) : (
				<span className="flex-1 min-w-0 truncate text-sm text-slate-800">{name}</span>
			)}

			{/* Action buttons */}
			<div className="flex items-center gap-1 flex-shrink-0">
				{!editing && (
					<label
						title={`Change color for ${name}`}
						className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white cursor-pointer"
						onPointerDown={(e) => e.stopPropagation()}
					>
						<input
							type="color"
							value={color}
							onChange={(e) => onColorChange(name, e.target.value)}
							onClick={(e) => e.stopPropagation()}
							className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
							aria-label={`Change color for ${name}`}
						/>
						<span
							className="h-3.5 w-3.5 rounded-full border border-white"
							style={{ backgroundColor: color }}
							aria-hidden="true"
						/>
					</label>
				)}
				{editing ? (
					<button
						type="button"
						onMouseDown={(e) => e.preventDefault()}
						onClick={() => void commit()}
						aria-label="Save"
						className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-700 transition-colors cursor-pointer"
					>
						<i className="fas fa-check text-[10px]" aria-hidden="true" />
						Save
					</button>
				) : (
					<button
						type="button"
						onClick={(e) => { e.stopPropagation(); setEditing(true); }}
						aria-label={`Rename ${name}`}
						className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
					>
						<i className="fas fa-pencil-alt text-xs" aria-hidden="true" />
					</button>
				)}
				{!editing && (
					<button
						type="button"
						onClick={(e) => { e.stopPropagation(); onDelete(name); }}
						aria-label={`Delete ${name}`}
						className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors cursor-pointer"
					>
						<i className="fas fa-trash-alt text-xs" aria-hidden="true" />
					</button>
				)}
			</div>
		</div>
	);
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface DragGhost {
	name: string;
	color: string;
	left: number;
	top: number;
	width: number;
	offsetX: number;
	offsetY: number;
}

export default function CategoriesPage(): React.ReactElement {
	const {
		categories,
		addCategory,
		renameCategory,
		deleteCategory,
		setCategoriesOrder,
		resetToDefaults,
		getCategoryColor,
		setCategoryColor,
	} =
		useCategories();

	const [newName, setNewName] = useState('');
	const [addError, setAddError] = useState<string | null>(null);
	const [toast, setToast] = useState<{ text: string; tone: 'saved' | 'notice' } | null>(null);
	const [dragIndex, setDragIndex] = useState<number | null>(null);
	const [overIndex, setOverIndex] = useState<number | null>(null);
	const [dragGhost, setDragGhost] = useState<DragGhost | null>(null);

	const listRef = useRef<HTMLDivElement>(null);
	const newInputRef = useRef<HTMLInputElement>(null);
	const toastTimerRef = useRef<number | null>(null);

	const showToast = useCallback((text: string, tone: 'saved' | 'notice' = 'saved') => {
		if (toastTimerRef.current) {
			window.clearTimeout(toastTimerRef.current);
		}
		setToast({ text, tone });
		toastTimerRef.current = window.setTimeout(() => {
			setToast(null);
			toastTimerRef.current = null;
		}, TOAST_DURATION_MS);
	}, []);

	useEffect(() => {
		return () => {
			if (toastTimerRef.current) {
				window.clearTimeout(toastTimerRef.current);
			}
		};
	}, []);

	// ── Drag helpers ─────────────────────────────────────────────────────────

	const getInsertIndex = useCallback((clientY: number): number => {
		const container = listRef.current;
		if (!container) return 0;
		const rows = Array.from(container.children) as HTMLElement[];
		for (let i = 0; i < rows.length; i++) {
			const rect = rows[i].getBoundingClientRect();
			if (clientY < rect.top + rect.height / 2) return i;
		}
		return rows.length;
	}, []);

	const handleRowPointerDown = useCallback((
		e: React.PointerEvent<HTMLDivElement>,
		index: number,
		name: string,
	) => {
		// Let clicks on interactive elements pass through.
		const target = e.target as HTMLElement;
		if (target.closest('button, input, textarea, a')) return;
		e.preventDefault();

		const snapshot = [...categories];
		const rowRect = e.currentTarget.getBoundingClientRect();
		const ghostWidth = rowRect.width || listRef.current?.offsetWidth || 340;
		const offsetX = e.clientX - rowRect.left;
		const offsetY = e.clientY - rowRect.top;

		setDragIndex(index);
		setOverIndex(index);
		setDragGhost({
			name,
			color: getCategoryColor(name),
			left: e.clientX - offsetX,
			top: e.clientY - offsetY,
			width: ghostWidth,
			offsetX,
			offsetY,
		});

		const onMove = (ev: PointerEvent) => {
			setOverIndex(getInsertIndex(ev.clientY));
			setDragGhost((prev) => {
				if (!prev) return null;
				return {
					...prev,
					left: ev.clientX - prev.offsetX,
					top: ev.clientY - prev.offsetY,
				};
			});
		};

		const onUp = (ev: PointerEvent) => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			window.removeEventListener('pointercancel', onUp);
			document.body.style.cursor = '';

			setDragIndex(null);
			setOverIndex(null);
			setDragGhost(null);

			const insertAt = getInsertIndex(ev.clientY);
			const finalIndex = insertAt > index ? insertAt - 1 : insertAt;
			if (finalIndex === index) return;

			const next = [...snapshot];
			const [moved] = next.splice(index, 1);
			next.splice(finalIndex, 0, moved);

			setCategoriesOrder(next);
			showToast(`Reordered "${name}".`);
		};

		document.body.style.cursor = 'grabbing';
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('pointercancel', onUp);
	}, [categories, getCategoryColor, getInsertIndex, setCategoriesOrder, showToast]);

	// ── Category actions ──────────────────────────────────────────────────────

	const handleAdd = useCallback(() => {
		const trimmed = newName.trim();
		if (!trimmed) { setAddError('Name cannot be empty.'); return; }
		if (categories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
			setAddError('A category with that name already exists.');
			return;
		}
		addCategory(trimmed);
		setNewName('');
		setAddError(null);
		showToast(`Added "${trimmed}".`);
	}, [newName, categories, addCategory, showToast]);

	const handleRename = useCallback((oldName: string, newCatName: string) => {
		const ok = renameCategory(oldName, newCatName);
		if (ok) showToast(`Renamed to "${newCatName}".`);
	}, [renameCategory, showToast]);

	const handleColorChange = useCallback((name: string, color: string) => {
		setCategoryColor(name, color);
		showToast(`Updated color for "${name}".`);
	}, [setCategoryColor, showToast]);

	const handleDelete = useCallback(async (name: string) => {
		if (categories.length <= 1) {
			showToast('Cannot delete the last category.', 'notice');
			return;
		}
		const ok = await confirmDialog(
			`Delete the category "${name}"? Any receipt rows assigned to it will keep the label but it won't appear in future dropdowns.`,
		);
		if (ok) {
			deleteCategory(name);
			showToast(`Deleted "${name}".`);
		}
	}, [categories.length, deleteCategory, showToast]);

	const handleReset = useCallback(async () => {
		const ok = await confirmDialog(
			'Reset all categories to the built-in defaults? Your custom categories will be removed.',
		);
		if (ok) {
			resetToDefaults();
			showToast('Categories reset to defaults.');
		}
	}, [resetToDefaults, showToast]);

	// Show drop indicator before row i only if the drag target lands there
	// and it's meaningfully different from the current position.
	const showDropLineBefore = (i: number) =>
		dragIndex !== null &&
		overIndex === i &&
		overIndex !== dragIndex &&
		overIndex !== dragIndex + 1;

	return (
		<div className="min-h-screen bg-white">
			<main className="container mx-auto px-4 pt-8 pb-18 max-w-4xl">

				<div className="mb-8">
					<div className="flex items-center gap-3 mb-1">
						<div className="inline-flex items-center justify-center w-10 h-10 bg-violet-100 rounded-xl flex-shrink-0">
							<i className="fas fa-tags text-lg text-violet-600" aria-hidden="true" />
						</div>
						<h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Categories</h1>
					</div>
					<p className="text-slate-500 mt-1 text-sm">
						Manage the grocery categories used in receipts and auto-categorization.
						Changes take effect immediately.
					</p>
				</div>

				{/* Add new category */}
				<section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
					<h2 className="mb-2 text-sm font-semibold text-slate-800">Add category</h2>
					<div className="flex gap-2">
						<input
							ref={newInputRef}
							type="text"
							value={newName}
							onChange={(e) => { setNewName(e.target.value); setAddError(null); }}
							onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
							placeholder="e.g. Baby & Toddler"
							maxLength={MAX_CATEGORY_NAME_LENGTH}
							className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200 transition"
							aria-label="New category name"
						/>
						<button
							type="button"
							onClick={handleAdd}
							className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 active:bg-violet-800 transition-colors cursor-pointer flex-shrink-0"
						>
							<i className="fas fa-plus text-xs" aria-hidden="true" />
							Add
						</button>
					</div>
					{addError && (
						<p className="mt-1.5 text-xs text-red-600">
							<i className="fas fa-exclamation-circle mr-1" aria-hidden="true" />
							{addError}
						</p>
					)}
				</section>

				{/* Category list */}
				<section className="rounded-2xl border border-slate-200 bg-white p-5">
					<div className="mb-3 flex items-center justify-between">
						<h2 className="text-sm font-semibold text-slate-800">
							{categories.length} {categories.length === 1 ? 'category' : 'categories'}
						</h2>
						<button
							type="button"
							onClick={() => void handleReset()}
							className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:border-red-200 hover:text-red-500 transition-colors cursor-pointer"
						>
							<i className="fas fa-undo text-[10px]" aria-hidden="true" />
							Reset to defaults
						</button>
					</div>

					<div ref={listRef} className="space-y-1.5">
						{categories.map((name, index) => (
							<div key={name}>
								{showDropLineBefore(index) && (
									<div className="h-0.5 bg-violet-400 rounded-full mb-1.5" />
								)}
								{index === dragIndex ? (
									/* Placeholder slot — shows where the item came from */
									<div className="h-[46px] rounded-xl border-2 border-dashed border-violet-200 bg-violet-50/40" />
								) : (
									<CategoryRow
										name={name}
										color={getCategoryColor(name)}
										onRowPointerDown={(e) => handleRowPointerDown(e, index, name)}
										onRename={handleRename}
										onColorChange={handleColorChange}
										onDelete={(n) => { void handleDelete(n); }}
									/>
								)}
							</div>
						))}
						{/* Drop indicator after the last item */}
						{dragIndex !== null && overIndex === categories.length && dragIndex !== categories.length - 1 && (
							<div className="h-0.5 bg-violet-400 rounded-full mt-1.5" />
						)}
					</div>
				</section>

				<p className="mt-4 text-xs text-slate-400 text-center">
					<i className="fas fa-lightbulb text-amber-400 mr-1" aria-hidden="true" />
					Tip: drag any row to reorder. The order matches the dropdown in the receipt editor.
				</p>
			</main>

			{/* Floating ghost element that follows the cursor while dragging */}
			{dragGhost && (
				<div
					aria-hidden="true"
					style={{
						position: 'fixed',
						left: dragGhost.left,
						top: dragGhost.top,
						width: dragGhost.width,
						pointerEvents: 'none',
						zIndex: 9999,
						transform: 'rotate(1.5deg)',
						borderLeftWidth: '3px',
						borderLeftColor: dragGhost.color,
					}}
					className="flex items-center gap-2 rounded-xl border border-violet-300 bg-white px-3 py-2.5 opacity-95"
				>
					<div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-violet-400">
						<i className="fas fa-grip-vertical text-xs" aria-hidden="true" />
					</div>
					<span className="flex-1 min-w-0 truncate text-sm font-medium text-slate-800">
						{dragGhost.name}
					</span>
				</div>
			)}

			{toast && (
				<div
					className={`fixed bottom-5 right-6 z-50 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white pointer-events-none select-none transition-opacity duration-200 ${toast.tone === 'saved' ? 'bg-emerald-600' : 'bg-slate-800/90'
						}`}
				>
					<i
						className={toast.tone === 'saved' ? 'fas fa-check-circle' : 'fas fa-circle-info'}
						aria-hidden="true"
					/>
					<span>{toast.text}</span>
				</div>
			)}
		</div>
	);
}
