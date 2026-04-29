import { useState, useEffect, useRef, useMemo } from 'react';
import type React from 'react';
import { useNavigate } from 'react-router-dom';
import type { GroceryProductRecord } from '../types';
import { slugify, formatCategoryName } from '../utils';
import { ROUTES } from '../constants';
import { TauriApi } from '../services/api';

interface ProductSearchProps {
	/** Scope search to a specific category slug. Omit for global search. */
	category?: string;
}

/**
 * ProductSearch component with typeahead suggestions and keyboard navigation
 * Apple-inspired flat design with Font Awesome icons
 */
export default function ProductSearch({ category = '' }: ProductSearchProps): React.ReactElement {
	const [query, setQuery] = useState<string>('');
	const [results, setResults] = useState<GroceryProductRecord[]>([]);
	const [open, setOpen] = useState<boolean>(false);
	const [activeIndex, setActiveIndex] = useState<number>(-1);
	const [isFocused, setIsFocused] = useState<boolean>(false);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const listRef = useRef<HTMLUListElement | null>(null);
	const navigate = useNavigate();

	// debounced IPC search
	useEffect(() => {
		const q = query.trim();
		if (!q) {
			setResults([]);
			setOpen(false);
			setActiveIndex(-1);
			return;
		}

		const handle = setTimeout(async () => {
			try {
				const page = await TauriApi.listGroceryProducts({ category, search: q, page: 1, pageSize: 8 });
				setResults(page.products);
				setOpen(true);
				setActiveIndex(-1);
			} catch (err) {
				console.error('Product search error:', err);
			}
		}, 200);

		return () => clearTimeout(handle);
	}, [query, category]);

	// keyboard navigation
	const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (!open) return;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setActiveIndex((i) => Math.min(i + 1, results.length - 1));
		}

		if (e.key === 'ArrowUp') {
			e.preventDefault();
			setActiveIndex((i) => Math.max(i - 1, 0));
		}

		if (e.key === 'Enter') {
			e.preventDefault();
			const sel = results[activeIndex] ?? results[0];
			if (sel) selectProduct(sel);
		}

		if (e.key === 'Escape') {
			setOpen(false);
			setActiveIndex(-1);
		}
	};

	// Navigate using React Router — required for HashRouter compatibility in Tauri
	const selectProduct = (p: GroceryProductRecord) => {
		setOpen(false);
		setQuery('');
		setIsFocused(false);
		inputRef.current?.blur();
		navigate(`${ROUTES.PRODUCTS}/${p.category}/${slugify(p.name)}`);
	};

	// close on outside click
	useEffect(() => {
		const handleClick = (ev: MouseEvent) => {
			if (
				inputRef.current &&
				ev.target instanceof Node &&
				!inputRef.current.contains(ev.target) &&
				listRef.current &&
				!listRef.current.contains(ev.target)
			) {
				setOpen(false);
			}
		};

		document.addEventListener('click', handleClick);
		return () => document.removeEventListener('click', handleClick);
	}, []);

	// build highlighted text
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
			<label htmlFor="product-search" className="sr-only">
				Search products
			</label>

			{/* Search Input Container */}
			<div className="relative">
				{/* Search Icon */}
				<div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
					<i className="fas fa-search text-slate-400 text-sm" aria-hidden="true"></i>
				</div>

				{/* Input Field */}
				<input
					id="product-search"
					ref={inputRef}
					type="text"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={onKeyDown}
					onFocus={() => setIsFocused(true)}
					onBlur={() => setIsFocused(false)}
					placeholder="Search products (e.g. milk, chicken, bread)"
					className={`w-full pl-9 pr-9 py-2.5 bg-white rounded-xl text-sm text-slate-900 placeholder:text-slate-400 transition-all border border-slate-200 focus:outline-none ${
						isFocused ? 'border-violet-400 bg-white ring-2 ring-violet-100' : ''
					}`}
					role="searchbox"
					aria-label="Search products"
					aria-autocomplete="list"
					aria-controls="product-search-list"
					aria-haspopup="listbox"
				/>

				{/* Clear Button */}
				{query && (
					<button
						type="button"
						onClick={clearSearch}
						className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-slate-200 hover:bg-slate-300 active:bg-slate-400 hover:cursor-pointer transition-colors"
						aria-label="Clear search"
					>
						<i className="fas fa-times text-slate-600 text-xs" aria-hidden="true"></i>
					</button>
				)}
			</div>

			{/* Results Dropdown */}
			{open && results.length > 0 && (
				<ul
					id="product-search-list"
					ref={listRef}
					role="listbox"
					className="absolute z-40 left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl max-h-[400px] overflow-auto"
				>
					{results.map((p, idx) => (
						<li
							key={`${p.name}-${idx}`}
							role="option"
							aria-selected={activeIndex === idx}
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => selectProduct(p)}
							className={`px-4 py-3 cursor-pointer transition-colors border-b border-slate-100 last:border-b-0 active:bg-violet-50 ${activeIndex === idx ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
						>
							<div className="flex items-start justify-between gap-3">
								<div className="flex-1 min-w-0">
									<div className="text-sm font-semibold text-slate-900 mb-1 truncate">
										{highlight(p.name, queryTrimmed)}
									</div>
									<div className="flex items-center gap-2 text-xs text-slate-500">
										<span className="capitalize bg-slate-100 px-2 py-0.5 rounded-full font-medium">
											{formatCategoryName(p.category)}
										</span>
										<span className="text-slate-300">•</span>
										<span className="uppercase font-medium">{p.unit}</span>
									</div>
								</div>

								{/* Arrow indicator */}
								<div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
									<i className="fas fa-chevron-right text-violet-500 text-xs" aria-hidden="true"></i>
								</div>
							</div>
						</li>
					))}
				</ul>
			)}

			{/* No results message */}
		{open && queryTrimmed && results.length === 0 && (
				<div className="absolute z-40 left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl p-8 text-center">
					<div className="mb-3">
						<i className="fas fa-search text-4xl text-slate-300" aria-hidden="true"></i>
					</div>
					<p className="text-slate-600 font-semibold">No products found</p>
					<p className="text-sm text-slate-500 mt-1">Try a different search term</p>
				</div>
			)}
		</div>
	);
}
