import { useState, useEffect } from 'react';
import type React from 'react';
import { useParams } from 'react-router-dom';
import TabLink from '../components/ui/TabLink';
import type { GroceryProductRecord } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';

import ProductSearch from '../components/ProductSearch';
import { slugify, formatCategoryName } from '../utils';
import { TauriApi } from '../services/api';
import { parseTauriError } from '../services/errors';
import LocationSelector from '../components/LocationSelector';
import { ROUTES, CATEGORY_DISPLAY_NAMES } from '../constants';

/**
 * CategoryPage — loads products for the given category directly from SQLite
 * via IPC instead of pulling them from the shared GroceryDataContext.
 */
export default function CategoryPage(): React.ReactElement {
	const { category } = useParams<{ category: string }>();
	const [products, setProducts] = useState<GroceryProductRecord[]>([]);
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!category) return;
		let cancelled = false;
		setLoading(true);
		setError(null);

		// A single page is sufficient; products per category is small (≤30).
		TauriApi.listGroceryProducts({ category, search: '', page: 1, pageSize: 200 })
			.then((page) => {
				if (!cancelled) setProducts(page.products);
			})
			.catch((err: unknown) => {
				if (!cancelled) setError(parseTauriError(err));
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => { cancelled = true; };
	}, [category]);

	if (loading) return <LoadingSpinner message="Loading products..." />;

	if (error) {
		return (
			<div className="min-h-screen bg-white flex items-center justify-center p-4">
				<div className="bg-red-50 rounded-3xl p-8 max-w-md w-full">
					<div className="text-center mb-4">
						<i className="fas fa-exclamation-triangle text-5xl text-red-500" aria-hidden="true"></i>
					</div>
					<p className="text-red-600 text-center font-semibold">Error loading products</p>
					<p className="text-slate-600 text-center mt-2">{error}</p>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-white">
			<main className="container mx-auto px-4 pt-8 pb-28 max-w-4xl">
				<TabLink
					to={ROUTES.PRODUCTS}
					className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 mt-4 mb-8 transition-colors w-fit"
				>
					<i className="fas fa-chevron-left text-[11px]" aria-hidden="true"></i>
					Product Categories
				</TabLink>

				<div className="mb-8 flex items-start justify-between gap-4">
					<div>
						<div className="flex items-center gap-3 mb-1">
							<div className="inline-flex items-center justify-center w-10 h-10 bg-violet-100 rounded-xl flex-shrink-0">
								<i className="fas fa-tag text-lg text-violet-600" aria-hidden="true" />
							</div>
							<h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
							{CATEGORY_DISPLAY_NAMES[category || ''] ?? formatCategoryName(category || '')}
						</h1>
					</div>
					<p className="text-slate-500 mt-1 text-sm">
						Browse all {CATEGORY_DISPLAY_NAMES[category || ''] ?? formatCategoryName(category || '')} products and compare prices
						</p>
					</div>
					<div className="flex-shrink-0 mt-1">
						<LocationSelector />
					</div>
				</div>

				{/* Search scoped to this category */}
				<ProductSearch category={category} />

				{/* Products Grid */}
				{products.length === 0 ? (
					<div className="bg-slate-50 rounded-3xl p-10 text-center">
						<div className="mb-4">
							<i className="fas fa-box-open text-5xl text-slate-300" aria-hidden="true"></i>
						</div>
						<p className="text-slate-600 font-semibold text-lg">No products available in this category</p>
						<p className="text-sm text-slate-500 mt-2">Try browsing other categories</p>
					</div>
				) : (
					<>
						{/* Product count */}
						<div className="mb-5 text-sm text-slate-500">
							{products.length} {products.length === 1 ? 'product' : 'products'}
						</div>

						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
							{products.map((product) => (
								<TabLink
									key={product.id}
									to={`/products/${category}/${slugify(product.name)}`}
									state={{ product }}
									className="group bg-white rounded-2xl border border-slate-200 p-5 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] transition-all flex flex-col justify-between"
								>
									{/* Product Name */}
									<div className="flex-1">
										<h3 className="text-base font-semibold text-slate-900 mb-2 group-hover:text-violet-700 transition-colors capitalize break-words leading-snug">
											{product.name}
										</h3>

										{/* Unit Badge */}
										<div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-full">
											<i className="fas fa-balance-scale text-xs text-slate-400" aria-hidden="true"></i>
											<span className="text-xs font-semibold text-slate-600 uppercase">
												{product.unit}
											</span>
										</div>
									</div>

									{/* Action Footer */}
									<div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
										<span className="text-sm font-semibold text-violet-600 group-hover:translate-x-0.5 transition-transform">
											Compare Price
										</span>
										<i className="fas fa-chevron-right text-violet-400 text-xs" aria-hidden="true"></i>
									</div>
								</TabLink>
							))}
						</div>
					</>
				)}
			</main>
		</div>
	);
}

