import { useState, useEffect, useCallback } from 'react';
import type React from 'react';
import { useParams, useLocation } from 'react-router-dom';
import type { GroceryProductRecord } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import ProductHeader from '../components/ProductHeader';
import ProductSearch from '../components/ProductSearch';
import PriceCalculator from '../components/PriceCalculator';
import SelectField from '../components/ui/SelectField';
import {
	UnitSelector,
	OfficialPriceBlock,
	NoPriceMessage,
	ProductErrorState,
	ProductNotFoundState,
} from '../components/product';
import { formatCategoryName } from '../utils';
import { useGroceryData } from '../hooks';
import { CATEGORY_DISPLAY_NAMES } from '../constants';
import { convertPricePerUnit } from '../utils';
import { useLocationPreference } from '../hooks/useLocationPreference';
import {
	useProductData,
	useProductPriceFiltering,
	usePriceComparison,
	latestYearFromPrices,
} from '../hooks/grocery';

export default function ProductDetailPage(): React.ReactElement {
	const { category, product: productSlug } = useParams<{ category: string; product: string }>();
	const routeLocation = useLocation();
	const initial = routeLocation.state?.product as GroceryProductRecord | undefined;

	const { data } = useGroceryData();
	const { location: globalLocation } = useLocationPreference();

	// ── Remote data ──────────────────────────────────────────────────────────
	const { product, prices, loading, error } = useProductData(category, productSlug, initial);

	// ── Filter selections ────────────────────────────────────────────────────
	const [year, setYear] = useState('');
	const [location, setLocation] = useState(globalLocation);
	const [displayUnit, setDisplayUnit] = useState('');
	const [userPrice, setUserPrice] = useState('');

	// Sync location when global preference changes elsewhere.
	useEffect(() => { setLocation(globalLocation); }, [globalLocation]);

	// Initialise year + unit when product+prices first arrive.
	useEffect(() => {
		if (!product) return;
		setDisplayUnit(product.unit);
		setYear(latestYearFromPrices(prices));
		setUserPrice('');
		clearComparison();
	}, [product, prices]); // eslint-disable-line react-hooks/exhaustive-deps

	// ── Derived prices ───────────────────────────────────────────────────────
	const { basePrice, displayPrice, availableYears, availableLocations } = useProductPriceFiltering({
		prices,
		year,
		location,
		nativeUnit: product?.unit ?? '',
		displayUnit,
		locationRecords: data?.locations ?? [],
	});

	// ── Comparison ───────────────────────────────────────────────────────────
	const { comparisonResult, handleCompare, clearComparison } = usePriceComparison();

	const effectivePrice = displayPrice ?? basePrice;

	const onCalculate = useCallback((overrideUserPrice?: string) => {
		handleCompare(
			effectivePrice,
			overrideUserPrice ?? userPrice,
			{ product: product?.name ?? '', location, year },
		);
	}, [handleCompare, effectivePrice, userPrice, product, location, year]);

	// ── Unit toggle ──────────────────────────────────────────────────────────
	const handleUnitChange = useCallback((newUnit: string) => {
		if (!product) return;
		try {
			if (basePrice !== null) {
				convertPricePerUnit(basePrice, product.unit, newUnit); // validate conversion is possible
			}
			setDisplayUnit(newUnit);
		} catch {
			// unsupported conversion — ignore silently
		}
	}, [basePrice, product]);

	// ── Render guards ─────────────────────────────────────────────────────────
	if (loading) return <LoadingSpinner message="Loading product details..." />;
	if (error) return <ProductErrorState message={error} />;
	if (!product) return <ProductNotFoundState />;

	const effectiveUnit = (displayUnit || product.unit).toLowerCase();
	const locationOptions = availableLocations.map((l) => ({ value: l, label: l }));
	const yearOptions = availableYears.map((y) => ({ value: y, label: y }));

	return (
		<div className="min-h-screen bg-white">
			<main className="container mx-auto max-w-4xl px-4 pb-0">
				<div className="pt-4 sm:pt-5">
					<ProductHeader categorySlug={category ?? ''} categoryName={category ?? ''} />
				</div>

				<ProductSearch />

				<div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
					<div className="border-b border-slate-200 p-5">
						<div className="mb-5 flex items-start justify-between gap-4">
							<div className="flex-1 min-w-0">
								<h1 className="mb-2.5 break-words text-xl font-semibold capitalize tracking-tight text-slate-900 sm:text-2xl">
									{product.name}
								</h1>
								<span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">
									<i className="fas fa-tag" aria-hidden="true" />
									{CATEGORY_DISPLAY_NAMES[category ?? ''] ?? formatCategoryName(category ?? '')}
								</span>
							</div>
							<UnitSelector nativeUnit={product.unit} value={effectiveUnit} onChange={handleUnitChange} />
						</div>

						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
							<SelectField
								id="location-select"
								label="Location"
								iconClassName="fas fa-map-marker-alt"
								value={location}
								onChange={setLocation}
								options={locationOptions}
							/>
							<SelectField
								id="year-select"
								label="Year"
								iconClassName="fas fa-calendar-alt"
								value={year}
								onChange={setYear}
								options={yearOptions}
							/>
						</div>
					</div>

					{effectivePrice !== null && (
						<OfficialPriceBlock
							price={effectivePrice}
							displayUnit={displayUnit || product.unit}
							location={location}
							year={year}
						/>
					)}

					{effectivePrice === null && year && location && <NoPriceMessage />}
				</div>

				<PriceCalculator
					userPrice={userPrice}
					unit={displayUnit || product.unit}
					currentPrice={basePrice}
					onUserPriceChange={setUserPrice}
					onCalculate={onCalculate}
					comparisonResult={comparisonResult}
				/>
			</main>
		</div>
	);
}
