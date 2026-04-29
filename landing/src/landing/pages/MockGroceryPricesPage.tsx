import { useState, useEffect, useCallback } from 'react';
import type React from 'react';
import type { GroceryProductRecord } from '../../types';
import type { ComparisonResult } from '../../types';
import { formatPrice, formatUnit, isWeightUnit, isVolumeUnit, convertPricePerUnit, formatCategoryName } from '../../utils';
import { CATEGORY_DISPLAY_NAMES } from '../../constants';
import { EXTENDED_MOCK_PRICES } from '../mock-data';
import MockProductSearch from '../components/MockProductSearch';
import PriceCalculator from '../../components/PriceCalculator';
import SegmentedControl, { type SegmentedControlOption } from '../../components/ui/SegmentedControl';
import SelectField from '../../components/ui/SelectField';
import type { DemoPage } from '../MockSidebar';

const LOCATIONS = ['Canada', 'Ontario', 'British Columbia', 'Alberta', 'Quebec'];
const YEARS = ['2024', '2025'];

interface Props {
	product: GroceryProductRecord | null;
	category: string;
	onNavigate: (page: DemoPage, opts?: { category?: string; product?: GroceryProductRecord }) => void;
}

const PREVIEW_PRODUCT: GroceryProductRecord = {
	id: 0,
	name: 'Whole Milk',
	category: 'dairy',
	unit: 'L',
};

export function MockGroceryPricesPreview({ style }: { style?: React.CSSProperties }): React.ReactElement {
	const product = PREVIEW_PRODUCT;
	const [selectedLocation] = useState('Canada');
	const [selectedYear] = useState('2025');
	const [selectedDisplayUnit, setSelectedDisplayUnit] = useState(product.unit);
	const [displayPrice, setDisplayPrice] = useState<number | null>(null);
	const [userPrice, setUserPrice] = useState('');
	const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);

	useEffect(() => {
		setSelectedDisplayUnit(product.unit);
		setUserPrice('');
		setComparisonResult(null);
		setDisplayPrice(null);
	}, [product]);

	const getCurrentPrice = useCallback((): number | null => {
		const matches = EXTENDED_MOCK_PRICES.filter(
			(p) =>
				p.productName === product.name &&
				p.location === selectedLocation &&
				p.date.startsWith(selectedYear),
		);
		if (matches.length === 0) return null;
		return matches.reduce((sum, item) => sum + item.pricePerUnit, 0) / matches.length;
	}, [product, selectedLocation, selectedYear]);

	useEffect(() => {
		const base = getCurrentPrice();
		if (base === null || !selectedDisplayUnit || selectedDisplayUnit.toLowerCase() === product.unit.toLowerCase()) {
			setDisplayPrice(null);
			return;
		}
		try {
			setDisplayPrice(convertPricePerUnit(base, product.unit, selectedDisplayUnit));
		} catch {
			setDisplayPrice(null);
		}
	}, [getCurrentPrice, selectedDisplayUnit, product]);

	const handleCompare = useCallback(
		(overrideUserPrice?: string) => {
			const basePrice = displayPrice !== null ? displayPrice : getCurrentPrice();
			const priceStr = overrideUserPrice ?? userPrice;
			if (!basePrice || !priceStr) return;
			const num = parseFloat(priceStr);
			if (Number.isNaN(num)) return;
			const difference = num - basePrice;
			setComparisonResult({
				userPrice: num,
				statsCanPrice: basePrice,
				difference: Math.abs(difference),
				percentageDifference: (difference / basePrice) * 100,
				isSaving: difference < 0,
				product: product.name,
				location: selectedLocation,
				year: selectedYear,
			});
		},
		[displayPrice, getCurrentPrice, product, selectedLocation, selectedYear, userPrice],
	);

	const currentPrice = getCurrentPrice();
	const effectiveUnit = (selectedDisplayUnit || product.unit).toLowerCase();

	return (
		<div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden" style={style}>
			<div className="space-y-4 p-4 sm:p-5">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Price Comparison</p>
						<h2 className="text-lg font-semibold text-slate-900">{product.name}</h2>
						<p className="text-xs text-slate-500 mt-1">Compare your receipt price to StatsCan averages.</p>
					</div>
					<span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
						{formatCategoryName(product.category)}
					</span>
				</div>

				<PriceCalculator
					userPrice={userPrice}
					unit={selectedDisplayUnit || product.unit}
					currentPrice={currentPrice}
					onUserPriceChange={setUserPrice}
					onCalculate={handleCompare}
					comparisonResult={comparisonResult}
				/>

				<div className="text-sm text-slate-500">
					<p>Official average for {selectedLocation}, {selectedYear}.</p>
					<p className="mt-1">Use the calculator above to compare per {effectiveUnit}.</p>
				</div>
			</div>
		</div>
	);
}

export default function MockGroceryPricesPage({ product, category, onNavigate }: Props): React.ReactElement {
	const [selectedLocation, setSelectedLocation] = useState('Canada');
	const [selectedYear, setSelectedYear] = useState('2025');
	const [selectedDisplayUnit, setSelectedDisplayUnit] = useState(product?.unit ?? 'kg');
	const [displayPrice, setDisplayPrice] = useState<number | null>(null);
	const [userPrice, setUserPrice] = useState('');
	const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);

	useEffect(() => {
		if (!product) return;
		setSelectedDisplayUnit(product.unit);
		setUserPrice('');
		setComparisonResult(null);
		setDisplayPrice(null);
	}, [product]);

	const getCurrentPrice = useCallback((): number | null => {
		if (!product) return null;
		const matches = EXTENDED_MOCK_PRICES.filter(
			(p) =>
				p.productName === product.name &&
				p.location === selectedLocation &&
				p.date.startsWith(selectedYear),
		);
		if (matches.length === 0) return null;
		return matches.reduce((s, p) => s + p.pricePerUnit, 0) / matches.length;
	}, [product, selectedLocation, selectedYear]);

	useEffect(() => {
		if (!product) return;
		const base = getCurrentPrice();
		if (base === null || !selectedDisplayUnit || selectedDisplayUnit.toLowerCase() === product.unit.toLowerCase()) {
			setDisplayPrice(null);
			return;
		}
		try {
			setDisplayPrice(convertPricePerUnit(base, product.unit, selectedDisplayUnit));
		} catch {
			setDisplayPrice(null);
		}
	}, [getCurrentPrice, selectedDisplayUnit, product]);

	const handleCompare = useCallback((overrideUserPrice?: string) => {
		const basePrice = displayPrice !== null ? displayPrice : getCurrentPrice();
		const priceStr = overrideUserPrice ?? userPrice;
		if (!basePrice || !priceStr || !product) return;
		const num = parseFloat(priceStr);
		if (Number.isNaN(num)) return;
		const difference = num - basePrice;
		setComparisonResult({
			userPrice: num,
			statsCanPrice: basePrice,
			difference: Math.abs(difference),
			percentageDifference: (difference / basePrice) * 100,
			isSaving: difference < 0,
			product: product.name,
			location: selectedLocation,
			year: selectedYear,
		});
	}, [displayPrice, getCurrentPrice, userPrice, product, selectedLocation, selectedYear]);

	const handleUnitChange = useCallback((newUnit: string) => {
		if (!product) return;
		try {
			const base = getCurrentPrice();
			if (base !== null) {
				setDisplayPrice(convertPricePerUnit(base, product.unit, newUnit));
			}
			setSelectedDisplayUnit(newUnit);
		} catch {
			setSelectedDisplayUnit(newUnit);
		}
	}, [getCurrentPrice, product]);

	if (!product) {
		return (
			<div className="min-h-full bg-white">
				<main className="container mx-auto max-w-4xl px-4 pb-0">
					<button
						type="button"
						onClick={() => onNavigate('prices')}
						className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 mt-8 mb-8 transition-colors"
					>
						<i className="fas fa-chevron-left text-[11px]" aria-hidden="true" />
						Product Categories
					</button>
					<div className="bg-slate-50 rounded-3xl p-8 max-w-md w-full mx-auto text-center">
						<i className="fas fa-search text-5xl text-slate-300 mb-4 block" aria-hidden="true" />
						<p className="text-slate-600 font-semibold">No product selected</p>
						<p className="text-sm text-slate-500 mt-2">Search for a product or browse by category</p>
					</div>
				</main>
			</div>
		);
	}

	const currentPrice = getCurrentPrice();
	const effectiveUnit = (selectedDisplayUnit || product.unit).toLowerCase();
	const locationOptions = LOCATIONS.map((l) => ({ value: l, label: l }));
	const yearOptions = YEARS.map((y) => ({ value: y, label: y }));

	const weightUnitOptions: SegmentedControlOption<'kg' | 'lb'>[] = [
		{ value: 'kg', label: 'KG', ariaLabel: 'Show prices per kilogram' },
		{ value: 'lb', label: 'LB', ariaLabel: 'Show prices per pound' },
	];
	const volumeUnitOptions: SegmentedControlOption<'l' | 'ml' | 'oz'>[] = [
		{ value: 'l', label: 'L', ariaLabel: 'Show prices per litre' },
		{ value: 'ml', label: 'ML', ariaLabel: 'Show prices per millilitre' },
		{ value: 'oz', label: 'OZ', ariaLabel: 'Show prices per fluid ounce' },
	];

	const categoryLabel = CATEGORY_DISPLAY_NAMES[category] ?? formatCategoryName(category);

	return (
		<div className="max-h-screen bg-white">
			<main className="container mx-auto max-w-4xl px-4 pb-4 text-left">
				<div className="pt-4 sm:pt-5">
					<button
						type="button"
						onClick={() => onNavigate('prices-category', { category })}
						className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 mb-6 transition-colors"
					>
						<i className="fas fa-chevron-left text-[11px]" aria-hidden="true" />
						{categoryLabel}
					</button>
				</div>

				<MockProductSearch
					onSelectProduct={(p) => onNavigate('prices-product', { category: p.category, product: p })}
				/>

				<div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
					<div className="border-b border-slate-200 p-5">
						<div className="mb-5 flex items-start justify-between gap-4">
							<div className="flex-1 min-w-0 text-left">
								<h1 className="mb-2.5 break-words text-xl font-semibold capitalize tracking-tight text-slate-900 sm:text-2xl">
									{product.name}
								</h1>
								<span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">
									<i className="fas fa-tag" aria-hidden="true" />
									{categoryLabel}
								</span>
							</div>

							{isWeightUnit(product.unit.toLowerCase()) && (
								<SegmentedControl
									value={effectiveUnit}
									onChange={handleUnitChange}
									options={weightUnitOptions}
									size="lg"
								/>
							)}
							{isVolumeUnit(product.unit.toLowerCase()) && (
								<SegmentedControl
									value={effectiveUnit}
									onChange={handleUnitChange}
									options={volumeUnitOptions}
									size="lg"
								/>
							)}
							{!isWeightUnit(product.unit.toLowerCase()) && !isVolumeUnit(product.unit.toLowerCase()) && (
								<div className="flex items-center gap-2 rounded-lg bg-slate-200 px-3 py-2.5">
									<i className="fas fa-balance-scale text-slate-700" aria-hidden="true" />
									<span className="text-sm font-semibold text-slate-900">
										per {formatUnit(selectedDisplayUnit || product.unit)}
									</span>
								</div>
							)}
						</div>

						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
							<SelectField
								id="mock-location-select"
								label="Location"
								iconClassName="fas fa-map-marker-alt"
								value={selectedLocation}
								onChange={setSelectedLocation}
								options={locationOptions}
							/>
							<SelectField
								id="mock-year-select"
								label="Year"
								iconClassName="fas fa-calendar-alt"
								value={selectedYear}
								onChange={setSelectedYear}
								options={yearOptions}
							/>
						</div>
					</div>

					{currentPrice !== null && (
						<div className="bg-emerald-50 p-5">
							<div className="flex items-end justify-between">
								<div>
									<p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-800 sm:text-sm">
										<i className="fas fa-check-circle mr-1" aria-hidden="true" />
										Official Price
									</p>
									<div className="flex items-baseline gap-3">
										<span className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
											${formatPrice(displayPrice !== null ? displayPrice : currentPrice, { official: true })}
										</span>
										<span className="text-sm font-medium text-slate-600">
											per {formatUnit(selectedDisplayUnit || product.unit)}
										</span>
									</div>
								</div>
								<div className="text-right">
									<p className="text-xs font-semibold text-slate-900 sm:text-sm">
										<i className="fas fa-map-pin mr-1" aria-hidden="true" />
										{selectedLocation}
									</p>
									<p className="text-xs text-slate-600 sm:text-sm">{selectedYear}</p>
								</div>
							</div>
						</div>
					)}

					{!currentPrice && (
						<div className="border-t border-yellow-200 bg-yellow-50 p-5">
							<div className="flex items-center gap-3">
								<i className="fas fa-exclamation-circle text-2xl text-yellow-600" aria-hidden="true" />
								<div>
									<p className="text-sm font-semibold text-yellow-900 sm:text-base">No price data available</p>
									<p className="text-xs text-yellow-700 mt-0.5">Try selecting a different year or location</p>
								</div>
							</div>
						</div>
					)}
				</div>

				<PriceCalculator
					userPrice={userPrice}
					unit={selectedDisplayUnit || product.unit}
					currentPrice={currentPrice}
					onUserPriceChange={setUserPrice}
					onCalculate={handleCompare}
					comparisonResult={comparisonResult}
				/>
			</main>
		</div>
	);
}
