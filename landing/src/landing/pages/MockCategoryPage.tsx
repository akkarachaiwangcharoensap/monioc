import type React from 'react';
import type { GroceryProductRecord } from '../../types';
import { formatCategoryName } from '../../utils';
import { CATEGORY_DISPLAY_NAMES } from '../../constants';
import { MOCK_PRODUCTS_BY_CATEGORY } from '../mock-data';
import MockProductSearch from '../components/MockProductSearch';
import type { DemoPage } from '../MockSidebar';

interface Props {
	category: string;
	onNavigate: (page: DemoPage, opts?: { category?: string; product?: GroceryProductRecord }) => void;
}

export default function MockCategoryPage({ category, onNavigate }: Props): React.ReactElement {
	const products = MOCK_PRODUCTS_BY_CATEGORY[category] ?? [];
	const categoryLabel = CATEGORY_DISPLAY_NAMES[category] ?? formatCategoryName(category);

	return (
		<div className="min-h-full bg-white">
			<main className="container mx-auto px-4 pt-2 pb-10 max-w-4xl text-left">

				{/* Back link */}
				<button
					type="button"
					onClick={() => onNavigate('prices')}
					className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 mt-4 mb-4 transition-colors"
				>
					<i className="fas fa-chevron-left text-[11px]" aria-hidden="true" />
					Product Categories
				</button>

				{/* Header */}
				<div className="mb-8 flex items-start justify-between gap-4">
					<div>
						<div className="flex items-center gap-3 mb-1">
							<div className="inline-flex items-center justify-center w-10 h-10 bg-violet-100 rounded-xl flex-shrink-0">
								<i className="fas fa-tag text-lg text-violet-600" aria-hidden="true" />
							</div>
							<h1 className="text-2xl font-semibold text-slate-900 tracking-tight">{categoryLabel}</h1>
						</div>
						<p className="text-slate-500 mt-1 text-sm">
							Browse all {categoryLabel} products and compare prices
						</p>
					</div>
				</div>

				{/* Search scoped to this category */}
				<MockProductSearch
					category={category}
					onSelectProduct={(product) => onNavigate('prices-product', { category, product })}
				/>

				{/* Products Grid */}
				{products.length === 0 ? (
					<div className="bg-slate-50 rounded-3xl p-10 text-center">
						<div className="mb-4">
							<i className="fas fa-box-open text-5xl text-slate-300" aria-hidden="true" />
						</div>
						<p className="text-slate-600 font-semibold text-lg">No products available</p>
					</div>
				) : (
					<>
						<div className="mb-5 text-sm text-slate-500">
							{products.length} {products.length === 1 ? 'product' : 'products'}
						</div>

						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
							{products.map((product) => (
								<button
									key={product.id}
									type="button"
									onClick={() => onNavigate('prices-product', { category, product })}
									className="group bg-white rounded-2xl border border-slate-200 p-5 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] transition-all flex flex-col justify-between text-left"
								>
									{/* Product Name */}
									<div className="flex-1">
										<h3 className="text-base font-semibold text-slate-900 mb-2 group-hover:text-violet-700 transition-colors capitalize break-words leading-snug">
											{product.name}
										</h3>
										{/* Unit Badge */}
										<div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-full">
											<i className="fas fa-balance-scale text-xs text-slate-400" aria-hidden="true" />
											<span className="text-xs font-semibold text-slate-600 uppercase">{product.unit}</span>
										</div>
									</div>

									{/* Action Footer */}
									<div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
										<span className="text-sm font-semibold text-violet-600 group-hover:translate-x-0.5 transition-transform">
											Compare Price
										</span>
										<i className="fas fa-chevron-right text-violet-400 text-xs" aria-hidden="true" />
									</div>
								</button>
							))}
						</div>
					</>
				)}
			</main>
		</div>
	);
}
