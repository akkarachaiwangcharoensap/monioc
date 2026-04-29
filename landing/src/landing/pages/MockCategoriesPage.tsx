/**
 * Mock Categories page for the landing demo.
 * Matches the design and interactivity of the real CategoriesPage.
 */
import { useState } from 'react';
import type React from 'react';
import { MOCK_CATEGORIES } from '../mock-data';

interface Category {
	id: number;
	name: string;
	color: string;
}

const DEFAULT_CATEGORIES: Category[] = MOCK_CATEGORIES.map((c) => ({ ...c }));

// ── Category Row — matches real CategoryRow ──────────────────────────────────

interface CategoryRowProps {
	cat: Category;
	onRename: (id: number, name: string) => void;
	onColorChange: (id: number, color: string) => void;
	onDelete: (id: number) => void;
}

function CategoryRow({ cat, onRename, onColorChange, onDelete }: CategoryRowProps): React.ReactElement {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(cat.name);
	const [hovered, setHovered] = useState(false);

	const saveEdit = () => {
		if (draft.trim()) onRename(cat.id, draft.trim());
		setEditing(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			saveEdit();
		}
		if (e.key === 'Escape') {
			setEditing(false);
			setDraft(cat.name);
		}
	};

	return (
		<div
			className={`group flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2.5 transition-[border-color,background-color] duration-150 hover:border-slate-200 select-none touch-none ${editing ? '' : 'cursor-grab active:cursor-grabbing'}`}
			style={{
				borderLeftWidth: '3px',
				borderLeftColor: cat.color,
				backgroundColor: hovered ? `${cat.color}18` : '#ffffff',
			}}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			{/* Grab handle */}
			<div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-slate-300 group-hover:text-slate-500">
				<i className="fas fa-grip-vertical text-xs" aria-hidden="true" />
			</div>

			{/* Name / edit input */}
			{editing ? (
				<input
					autoFocus
					type="text"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onBlur={saveEdit}
					onKeyDown={handleKeyDown}
					className="flex-1 min-w-0 rounded-lg border border-violet-300 bg-violet-50 px-2.5 py-1 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-400 cursor-text"
					aria-label="Edit category name"
				/>
			) : (
				<span className="flex-1 min-w-0 truncate text-sm text-slate-800 text-left">{cat.name}</span>
			)}

			{/* Action buttons */}
			<div className="flex items-center gap-1 flex-shrink-0">
				<label
					title={`Change color for ${cat.name}`}
					className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white cursor-pointer"
					onPointerDown={(e) => e.stopPropagation()}
				>
					<input
						type="color"
						value={cat.color}
						onChange={(e) => onColorChange(cat.id, e.target.value)}
						onClick={(e) => e.stopPropagation()}
						className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
						aria-label={`Change color for ${cat.name}`}
					/>
					<span
						className="h-3.5 w-3.5 rounded-full border border-white"
						style={{ backgroundColor: cat.color }}
						aria-hidden="true"
					/>
				</label>
				{editing ? (
					<button
						type="button"
						onMouseDown={(e) => e.preventDefault()}
						onClick={saveEdit}
						className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-700 transition-colors cursor-pointer"
					>
						<i className="fas fa-check text-[10px]" aria-hidden="true" />
						Save
					</button>
				) : (
					<button
						type="button"
						onClick={(e) => { e.stopPropagation(); setEditing(true); }}
						aria-label={`Rename ${cat.name}`}
						className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
					>
						<i className="fas fa-pencil-alt text-xs" aria-hidden="true" />
					</button>
				)}
				{!editing && (
					<button
						type="button"
						onClick={(e) => { e.stopPropagation(); onDelete(cat.id); }}
						aria-label={`Delete ${cat.name}`}
						className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors cursor-pointer"
					>
						<i className="fas fa-trash-alt text-xs" aria-hidden="true" />
					</button>
				)}
			</div>
		</div>
	);
}

// ── Page ─────────────────────────────────────────────────────────────────────

interface Props {
	onNavigate?: (page: string) => void;
}

export default function MockCategoriesPage({ onNavigate: _onNavigate }: Props): React.ReactElement {
	const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
	const [newName, setNewName] = useState('');

	const addCategory = () => {
		const name = newName.trim();
		if (!name) return;
		const colors = ['#6366f1', '#f97316', '#0ea5e9', '#d946ef', '#84cc16', '#f43f5e'];
		const color = colors[categories.length % colors.length];
		setCategories((prev) => [...prev, { id: Date.now(), name, color }]);
		setNewName('');
	};

	const renameCategory = (id: number, name: string) =>
		setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));

	const recolorCategory = (id: number, color: string) =>
		setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, color } : c)));

	const deleteCategory = (id: number) =>
		setCategories((prev) => prev.filter((c) => c.id !== id));

	return (
		<div className="min-h-full bg-white">
			<main className="container mx-auto px-4 pt-8 pb-10 max-w-3xl">

				{/* ── Page header ──────────────────────────────────── */}
				<div className="mb-8">
					<div className="flex items-center gap-3 mb-1">
						<div className="inline-flex items-center justify-center w-10 h-10 bg-violet-100 rounded-xl flex-shrink-0">
							<i className="fas fa-tags text-lg text-violet-600" aria-hidden="true" />
						</div>
						<h1 className="text-2xl font-semibold text-slate-900 tracking-tight text-left">Categories</h1>
					</div>
					<p className="text-slate-500 mt-1 text-sm text-left">
						Manage the grocery categories used in receipts and auto-categorization.
						Changes take effect immediately.
					</p>
				</div>

				{/* ── Add category card ─────────────────────────────── */}
				<div className="rounded-2xl border border-slate-200 bg-white p-4 mb-4">
					<h2 className="mb-3 text-sm font-semibold text-slate-700 text-left">Add category</h2>
					<div className="flex items-center gap-2">
						<input
							type="text"
							value={newName}
							onChange={(e) => setNewName(e.target.value)}
							onKeyDown={(e) => { if (e.key === 'Enter') addCategory(); }}
							placeholder="e.g. Baby & Toddler"
							className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200 transition"
							aria-label="New category name"
						/>
						<button
							type="button"
							onClick={addCategory}
							disabled={!newName.trim()}
							className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 active:bg-violet-800 transition-colors cursor-pointer flex-shrink-0"
						>
							<i className="fas fa-plus text-xs" aria-hidden="true" /> Add
						</button>
					</div>
				</div>

				{/* ── Category list card ────────────────────────────── */}
				<div className="rounded-2xl border border-slate-200 bg-white p-5">
					<div className="flex items-center justify-between mb-4">
						<h2 className="text-sm font-semibold text-slate-700">
							{categories.length} {categories.length === 1 ? 'category' : 'categories'}
						</h2>
						<button
							type="button"
							onClick={() => setCategories(DEFAULT_CATEGORIES)}
							className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:border-red-200 hover:text-red-500 transition-colors cursor-pointer"
						>
							<i className="fas fa-rotate-left text-[10px]" aria-hidden="true" /> Reset to defaults
						</button>
					</div>

					<div className="space-y-1.5">
						{categories.map((cat) => (
							<CategoryRow
								key={cat.id}
								cat={cat}
								onRename={renameCategory}
								onColorChange={recolorCategory}
								onDelete={deleteCategory}
							/>
						))}
						{categories.length === 0 && (
							<p className="py-6 text-center text-sm text-slate-400">No categories yet. Add one above.</p>
						)}
					</div>

					{/* Footer tip */}
					<p className="mt-4 text-xs text-slate-400">
						<i className="fas fa-lightbulb text-amber-400 mr-1" aria-hidden="true" />
						Tip: drag any row to reorder categories. Changes apply automatically.
					</p>
				</div>

			</main>
		</div>
	);
}
