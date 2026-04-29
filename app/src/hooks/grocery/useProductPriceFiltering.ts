import { useMemo } from 'react';
import type { GroceryPriceResult } from '../../types';
import { DEFAULT_LOCATION } from '../../constants';
import { convertPricePerUnit } from '../../utils';

/** Minimal shape required — compatible with both GroceryLocationRecord and Location. */
export interface LocationLike {
	location: string;
}

export interface UseProductPriceFilteringInput {
	prices: GroceryPriceResult[];
	year: string;
	location: string;
	nativeUnit: string;
	displayUnit: string;
	locationRecords: LocationLike[];
}

export interface UseProductPriceFilteringResult {
	/** Average price across matching entries for year+location in native unit. */
	basePrice: number | null;
	/** basePrice converted into displayUnit; null if displayUnit === nativeUnit. */
	displayPrice: number | null;
	availableYears: string[];
	availableLocations: string[];
}

/**
 * Pure derivation hook — no effects, no IPC calls.
 * Given a flat list of price records and the current filter selections,
 * returns the averaged base price, converted display price, and filter options.
 */
export function useProductPriceFiltering({
	prices,
	year,
	location,
	nativeUnit,
	displayUnit,
	locationRecords,
}: UseProductPriceFilteringInput): UseProductPriceFilteringResult {
	const availableYears = useMemo(
		() => Array.from(new Set(prices.map((p) => p.date.substring(0, 4)))).sort(),
		[prices],
	);

	const availableLocations = useMemo(
		() => [DEFAULT_LOCATION, ...locationRecords.map((l) => l.location).filter((l) => l !== DEFAULT_LOCATION)],
		[locationRecords],
	);

	const basePrice = useMemo((): number | null => {
		if (!year || !location) return null;
		const relevant = prices.filter((p) => {
			const matchesYear = p.date.substring(0, 4) === year;
			const matchesLocation =
				location === DEFAULT_LOCATION ? p.location === DEFAULT_LOCATION : p.location === location;
			return matchesYear && matchesLocation;
		});
		if (relevant.length === 0) return null;
		return relevant.reduce((acc, p) => acc + p.pricePerUnit, 0) / relevant.length;
	}, [prices, year, location]);

	const displayPrice = useMemo((): number | null => {
		if (basePrice === null) return null;
		if (!displayUnit || displayUnit.toLowerCase() === nativeUnit.toLowerCase()) return null;
		try {
			return convertPricePerUnit(basePrice, nativeUnit, displayUnit);
		} catch {
			return null;
		}
	}, [basePrice, nativeUnit, displayUnit]);

	return { basePrice, displayPrice, availableYears, availableLocations };
}

/** Convenience: compute latest year from a price list. */
export function latestYearFromPrices(prices: GroceryPriceResult[]): string {
	if (prices.length === 0) return '';
	return prices[prices.length - 1].date.substring(0, 4);
}
