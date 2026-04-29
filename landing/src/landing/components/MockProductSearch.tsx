import { useState, useEffect, useRef, useMemo } from 'react';
import type React from 'react';
import type { GroceryProductRecord } from '../../types';
import { ALL_MOCK_PRODUCTS } from '../mock-data';
import { formatCategoryName } from '../../utils';
import { CATEGORY_DISPLAY_NAMES } from '../../constants';

interface MockProductSearchProps {
	/** Scope search to a specific category key. Omit for global search. */
	category?: string;
	onSelectProduct: (product: GroceryProductRecord) => void;
}

export default function MockProductSearch({ category = '', onSelectProduct }: MockProductSearchProps): React.ReactElement {
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<GroceryProductRecord[]>([]);
	const [open, setOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(-1);
	const [isFocused, setIsFocused] = useState(false);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const listRef = useRef<HTMLUListElement | null>(null);

	useEffect(() => {
		const q = query.trim().toLowerCase();
		if (!q) {
			setResults([]);
			setOpen(false);
			setActiveIndex(-1);
			return;
		}
		const filtered = ALL_MOCK_PRODUCTS.filter((p) => {
			const matchesSearch = p.name.toLowerCase().includes(q);
			const matchesCategory = !category || p.category === category;
			return matchesSearch && matchesCategory;
		}).slice(0, 8);
		setResults(filtered);
		setOpen(filtered.length > 0);
		setActiveIndex(-1);
	}, [query, category]);

	const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (!open) return;
		if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)); }
		if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
		if (e.key === 'Enter')     { e.preventDefault(); const sel = results[activeIndex] ?? results[0]; if (sel) selectProduct(sel); }
		if (e.key === 'Escape')    { setOpen(false); setActiveIndex(-1); }
	};

	const selectProduct = (p: GroceryProductRecord) => {
		setOpen(false);
		setQuery('');
		setIsFocused(false);
		inputRef.current?.blur();
		onSelectProduct(p);
	};

	useEffect(() => {
		const handleClick = (ev: MouseEvent) => {
			if (
				inputRef.current && ev.target instanceof Node && !inputRef.current.contains(ev.target) &&
				listRef.current && !listRef.current.contains(ev.target)
			) {
				setOpen(false);
			}
		};
		document.addEventListener('click', handleClick);
		return () => document.removeEventListener('click', handleClick);
	}, []);

	const highlight = (name: string, q: string) => {
		if (!q) return name;
		const idx = name.toLowerCase().indexOf(q.toLowerCase());
		if (idx === -1) return name;
		return (
			<>
				{name.substring(0, idx)}
				<strong className="bg-violet-100 text-violet-900 px-0.5 rounded">{name.substring(idx, idx + q.length)}</strong>
				{name.substring(idx + q.length)}
			</>
		);
	};

	const queryTrimmed = useMemo(() => query.trim(), [query]);

	const clearSearch = () => {
		setQuery('');
		setResults([]);
		setOpen(false);
		setActiveIndex(-1);
		inputRef.current?.focus();
	};

	return (
		<div className="relative mb-6">
			<label htmlFor="mock-product-search" className="sr-only">Search products</label>
			<div className="relative">
				<div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
					<i className="fas fa-search text-slate-400 text-sm" aria-hidden="true" />
				</div>
				<input
					id="mock-product-search"
					ref={inputRef}
					type="text"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={onKeyDown}
					onFocus={() => setIsFocused(true)}
					onBlur={() => setIsFocused(false)}
					placeholder="Search products (e.g. milk, chicken, bread)"
					className={`w-full pl-9 pr-9 py-2.5 bg-white rounded-xl text-sm text-slate-900 placeholder:text-slate-400 transition-all border border-slate-200 focus:outline-none ${
						isFocused ? 'border-violet-400 ring-2 ring-violet-100' : ''
					}`}
					role="searchbox"
					aria-label="Search products"
					aria-autocomplete="list"
					aria-controls="mock-product-search-list"
					aria-haspopup="listbox"
				/>
				{query && (
					<button
						type="button"
						onClick={clearSearch}
						className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-slate-200 hover:bg-slate-300 active:bg-slate-400 cursor-pointer transition-colors"
						aria-label="Clear search"
					>
						<i className="fas fa-times text-slate-600 text-xs" aria-hidden="true" />
					</button>
				)}
			</div>

			{open && results.length > 0 && (
				<ul
					id="mock-product-search-list"
					ref={listRef}
					role="listbox"
					className="absolute z-40 left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl max-h-[400px] overflow-auto shadow-lg"
				>
					{results.map((p, idx) => (
						<li
							key={`${p.name}-${idx}`}
							role="option"
							aria-selected={activeIndex === idx}
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => selectProduct(p)}
							className={`px-4 py-3 cursor-pointer transition-colors border-b border-slate-100 last:border-b-0 active:bg-violet-50 ${
								activeIndex === idx ? 'bg-slate-50' : 'hover:bg-slate-50'
							}`}
						>
							<div className="flex items-start justify-between gap-3">
								<div className="flex-1 min-w-0">
									<div className="text-sm font-semibold text-slate-900 mb-1 truncate">
										{highlight(p.name, queryTrimmed)}
									</div>
									<div className="flex items-center gap-2 text-xs text-slate-500">
										<span className="capitalize bg-slate-100 px-2 py-0.5 rounded-full font-medium">
											{CATEGORY_DISPLAY_NAMES[p.category] ?? formatCategoryName(p.category)}
										</span>
										<span>per {p.unit}</span>
									</div>
								</div>
								<div className="flex-shrink-0 flex items-center text-xs text-violet-600">
									<i className="fas fa-arrow-right text-[10px]" aria-hidden="true" />
								</div>
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
