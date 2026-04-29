import { useState } from 'react';
import type React from 'react';
import type { GroceryProductRecord } from '../../types';
import { formatCategoryName } from '../../utils';
import { CATEGORY_DISPLAY_NAMES } from '../../constants';
import { MOCK_GROCERY_CATEGORIES } from '../mock-data';
import MockProductSearch from '../components/MockProductSearch';
import type { DemoPage } from '../MockSidebar';

import Image from 'next/image';

const categoryIcons: Record<string, { icon?: string; img?: string; colorBg: string; colorHover: string; colorIcon: string; iconColor: string }> = {
	produce: { img: 'produce.png', icon: 'fa-carrot', colorBg: 'bg-green-50', colorHover: 'hover:bg-green-100', colorIcon: 'bg-green-100', iconColor: 'text-green-600' },
	meat_and_seafood: { img: 'meat-and-seafood.png', icon: 'fa-drumstick-bite', colorBg: 'bg-rose-50', colorHover: 'hover:bg-rose-100', colorIcon: 'bg-rose-100', iconColor: 'text-rose-600' },
	dairy_and_eggs: { img: 'dairy-and-eggs.png', icon: 'fa-cheese', colorBg: 'bg-yellow-50', colorHover: 'hover:bg-yellow-100', colorIcon: 'bg-yellow-100', iconColor: 'text-yellow-600' },
	pantry: { img: 'pantry.png', icon: 'fa-box-open', colorBg: 'bg-orange-50', colorHover: 'hover:bg-orange-100', colorIcon: 'bg-orange-100', iconColor: 'text-orange-600' },
	frozen: { img: 'frozen.png', icon: 'fa-snowflake', colorBg: 'bg-cyan-50', colorHover: 'hover:bg-cyan-100', colorIcon: 'bg-cyan-100', iconColor: 'text-cyan-600' },
	bakery: { img: 'bakery.png', icon: 'fa-bread-slice', colorBg: 'bg-stone-50', colorHover: 'hover:bg-stone-100', colorIcon: 'bg-stone-100', iconColor: 'text-stone-600' },
	beverages: { img: 'beverages.png', icon: 'fa-coffee', colorBg: 'bg-amber-50', colorHover: 'hover:bg-amber-100', colorIcon: 'bg-amber-100', iconColor: 'text-amber-600' },
	snacks: { img: 'snacks.png', icon: 'fa-cookie-bite', colorBg: 'bg-orange-50', colorHover: 'hover:bg-orange-100', colorIcon: 'bg-orange-100', iconColor: 'text-orange-600' },
	deli_and_prepared: { img: 'deli-and-prepared.png', icon: 'fa-drumstick-bite', colorBg: 'bg-amber-50', colorHover: 'hover:bg-amber-100', colorIcon: 'bg-amber-100', iconColor: 'text-amber-600' },
	personal_care: { img: 'personal-care.png', icon: 'fa-heart', colorBg: 'bg-slate-50', colorHover: 'hover:bg-slate-100', colorIcon: 'bg-slate-100', iconColor: 'text-slate-600' },
	household: { img: 'household.png', icon: 'fa-home', colorBg: 'bg-slate-50', colorHover: 'hover:bg-slate-100', colorIcon: 'bg-slate-100', iconColor: 'text-slate-600' },
	other: { img: 'other.png', icon: 'fa-shopping-basket', colorBg: 'bg-slate-50', colorHover: 'hover:bg-slate-100', colorIcon: 'bg-slate-100', iconColor: 'text-slate-600' },
};

function CategoryIcon({ imgName, fallbackIcon, label }: { imgName?: string; fallbackIcon?: string; label: string }): React.ReactElement {
	const [error, setError] = useState(false);
	if (imgName && !error) {
		return (
			<Image
				width={36}
				height={36}
				src={`/categories/${imgName}`}
				alt={label}
				className="w-10 h-10 sm:w-12 sm:h-12 object-contain"
				onError={() => setError(true)}
			/>
		);
	}
	return <i className={`fas ${fallbackIcon ?? 'fa-shopping-basket'} text-3xl sm:text-4xl`} aria-hidden="true" />;
}

interface Props {
	onNavigate: (page: DemoPage, opts?: { category?: string; product?: GroceryProductRecord }) => void;
}

export default function MockProductsPage({ onNavigate }: Props): React.ReactElement {
	return (
		<div className="min-h-full bg-white">
			<main className="container mx-auto px-4 pt-8 pb-10 max-w-4xl">
				<div className="mb-8 flex items-start justify-between gap-4">
					<div className="flex items-start gap-3 flex-1">
						<div>
							<div className="flex items-center gap-3 mb-1">
								<div className="inline-flex items-center justify-center w-10 h-10 bg-violet-100 rounded-xl flex-shrink-0">
									<i className="fas fa-chart-bar text-lg text-violet-600" aria-hidden="true" />
								</div>
								<h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Product Categories</h1>
							</div>
							<p className="text-slate-500 mt-1 text-sm">Browse and compare grocery prices across Canada</p>
						</div>
					</div>
				</div>

				{/* Search */}
				<MockProductSearch
					onSelectProduct={(product) =>
						onNavigate('prices-product', { category: product.category, product })
					}
				/>

				{/* Category Grid */}
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
					{MOCK_GROCERY_CATEGORIES.map((cat) => {
						const style = categoryIcons[cat.key] ?? categoryIcons.other;
						const label = CATEGORY_DISPLAY_NAMES[cat.key] ?? formatCategoryName(cat.key);
						return (
							<button
								key={cat.key}
								type="button"
								onClick={() => onNavigate('prices-category', { category: cat.key })}
								className={`group relative ${style.colorBg} rounded-2xl p-5 ${style.colorHover} active:scale-[0.98] transition-all flex flex-col min-h-[100px] text-left`}
							>
								{/* Icon badge */}
								<div className={`absolute top-4 right-4 w-12 h-12 ${style.colorIcon} rounded-xl flex items-center justify-center`}>
									<CategoryIcon imgName={style.img} fallbackIcon={style.icon} label={`${label} icon`} />
								</div>

								{/* Content */}
								<div className="pr-16 flex-1">
									<h3 className="text-base font-semibold text-slate-900 leading-snug group-hover:text-slate-700 transition-colors">
										{label}
									</h3>
									<p className="text-xs text-slate-500 mt-1">
										{cat.count} {cat.count === 1 ? 'product' : 'products'}
									</p>
								</div>

								<i className="fas fa-chevron-right text-[11px] text-slate-400 opacity-0 group-hover:opacity-100 mt-3 transition-opacity" aria-hidden="true" />
							</button>
						);
					})}
				</div>
			</main>
		</div>
	);
}
