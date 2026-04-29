import { useMemo, useState, useEffect } from 'react';
import type React from 'react';
import TabLink from '../components/ui/TabLink';
import LoadingSpinner from '../components/LoadingSpinner';
import ProductSearch from '../components/ProductSearch';

import { formatCategoryName } from '../utils';
import { CATEGORY_DISPLAY_NAMES } from '../constants';
import { TauriApi } from '../services/api';
import { parseTauriError } from '../services/errors';
import LocationSelector from '../components/LocationSelector';

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
	baby: { img: 'baby.png', icon: 'fa-baby', colorBg: 'bg-pink-50', colorHover: 'hover:bg-pink-100', colorIcon: 'bg-pink-100', iconColor: 'text-pink-600' },
	household: { img: 'household.png', icon: 'fa-home', colorBg: 'bg-slate-50', colorHover: 'hover:bg-slate-100', colorIcon: 'bg-slate-100', iconColor: 'text-slate-600' },
	other: { img: 'other.png', icon: 'fa-shopping-basket', colorBg: 'bg-slate-50', colorHover: 'hover:bg-slate-100', colorIcon: 'bg-slate-100', iconColor: 'text-slate-600' },
};

function CategoryIcon({ imgName, fallbackIcon, label }: { imgName?: string; fallbackIcon?: string; label: string }): React.ReactElement {
	const [error, setError] = useState(false);

	if (imgName && !error) {
		return (
			<img
				src={`/categories/${imgName}`}
				alt={label}
				className="w-10 h-10 sm:w-12 sm:h-12 object-contain"
				onError={() => setError(true)}
			/>
		);
	}

	return <i className={`fas ${fallbackIcon ?? 'fa-shopping-basket'} text-3xl sm:text-4xl`} aria-hidden="true"></i>;
}

const DESIRED_CATEGORIES: ReadonlyArray<{ key: string; label: string }> = [
	{ key: 'produce', label: 'Produce' },
	{ key: 'meat_and_seafood', label: 'Meat & Seafood' },
	{ key: 'dairy_and_eggs', label: 'Dairy & Eggs' },
	{ key: 'pantry', label: 'Pantry' },
	{ key: 'frozen', label: 'Frozen' },
	{ key: 'bakery', label: 'Bakery' },
	{ key: 'beverages', label: 'Beverages' },
	{ key: 'snacks', label: 'Snacks' },
	{ key: 'deli_and_prepared', label: 'Deli & Prepared' },
	{ key: 'personal_care', label: 'Personal Care' },
	{ key: 'baby', label: 'Baby' },
	{ key: 'household', label: 'Household' },
	{ key: 'other', label: 'Other' },
];

/**
 * ProductsPage — loads category list (with product counts) directly from the
 * grocery SQLite database via IPC, then displays them in the desired order.
 */
export default function ProductsPage(): React.ReactElement {
	const [rawCategories, setRawCategories] = useState<{ name: string; count: number }[]>([]);
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		TauriApi.listGroceryCategories()
			.then((cats) => {
				if (!cancelled) setRawCategories(cats.map((c) => ({ name: c.name, count: c.count })));
			})
			.catch((err: unknown) => {
				if (!cancelled) setError(parseTauriError(err));
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => { cancelled = true; };
	}, []);

	// Order categories per DESIRED_CATEGORIES; append any extras from the DB at the end.
	const orderedCategories = useMemo(() => {
		const byName = new Map(rawCategories.map((c) => [c.name, c.count]));
		const ordered = DESIRED_CATEGORIES.map((d) => ({ name: d.key, count: byName.get(d.key) ?? 0 }));
		const extra = rawCategories.filter((c) => !DESIRED_CATEGORIES.some((d) => d.key === c.name));
		return [...ordered, ...extra];
	}, [rawCategories]);

	if (error) {
		return (
			<div className="min-h-screen bg-white flex items-center justify-center p-4">
				<div className="bg-red-50 rounded-3xl p-8 max-w-md w-full">
					<div className="text-center mb-4">
						<i className="fas fa-exclamation-triangle text-5xl text-red-500" aria-hidden="true"></i>
					</div>
					<p className="text-red-600 text-center font-semibold">Error loading data</p>
					<p className="text-slate-600 text-center mt-2">{error}</p>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-white">
			<main className="container mx-auto px-4 pt-8 pb-28 max-w-4xl">

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
					<div className="flex-shrink-0 mt-1">
						<LocationSelector />
					</div>
				</div>

				{/* Search Component */}
				<ProductSearch />

				{/* Category Grid / Loading / Empty states */}
				{loading ? (
					<div className="py-12 flex items-center justify-center">
						<LoadingSpinner message="Loading categories..." />
					</div>
				) : orderedCategories.length === 0 ? (
					<div className="bg-slate-50 rounded-3xl p-8 max-w-md w-full mx-auto">
						<div className="text-center mb-4">
							<i className="fas fa-box-open text-5xl text-slate-400" aria-hidden="true"></i>
						</div>
						<p className="text-slate-600 text-center">No categories available</p>
					</div>
				) : (
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
						{orderedCategories.map((category) => {
							const categoryStyle = categoryIcons[category.name] || categoryIcons.other;

							return (
								<TabLink
									key={category.name}
									to={`/products/${category.name}`}
									className={`group relative ${categoryStyle.colorBg} rounded-2xl p-5 ${categoryStyle.colorHover} active:scale-[0.98] transition-all flex flex-col min-h-[100px]`}
								>
									{/* Icon badge */}
									<div className={`absolute top-4 right-4 w-12 h-12 ${categoryStyle.colorIcon} rounded-xl flex items-center justify-center`}>
										<CategoryIcon imgName={categoryStyle.img} fallbackIcon={categoryStyle.icon} label={`${CATEGORY_DISPLAY_NAMES[category.name] ?? formatCategoryName(category.name)} icon`} />
									</div>

									{/* Content */}
									<div className="pr-16 flex-1">
										<h3 className="text-base font-semibold text-slate-900 leading-snug group-hover:text-slate-700 transition-colors">
											{CATEGORY_DISPLAY_NAMES[category.name] ?? formatCategoryName(category.name)}
										</h3>
										<p className="text-xs text-slate-500 mt-1">
											{category.count} {category.count === 1 ? 'product' : 'products'}
										</p>
									</div>

									<i className="fas fa-chevron-right text-[11px] text-slate-400 opacity-0 group-hover:opacity-100 mt-3 transition-opacity" aria-hidden="true" />
								</TabLink>
							);
						})}
					</div>
				)}
			</main>
		</div>
	);
}
