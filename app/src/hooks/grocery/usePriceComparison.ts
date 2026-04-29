import { useCallback, useState } from 'react';
import type { ComparisonResult } from '../../types';

export interface UsePriceComparisonResult {
	comparisonResult: ComparisonResult | null;
	handleCompare: (basePrice: number | null, userPriceInput: string, meta: {
		product: string; location: string; year: string;
	}) => void;
	clearComparison: () => void;
}

/**
 * Encapsulates the price delta + percentage math for the "compare your price" feature.
 * Stateless apart from caching the last result — all inputs are explicit parameters.
 */
export function usePriceComparison(): UsePriceComparisonResult {
	const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);

	const handleCompare = useCallback((
		basePrice: number | null,
		userPriceInput: string,
		meta: { product: string; location: string; year: string },
	) => {
		if (basePrice === null || !userPriceInput) return;
		const userPriceNum = parseFloat(userPriceInput);
		if (Number.isNaN(userPriceNum)) return;

		const difference = userPriceNum - basePrice;
		const percentageDifference = (difference / basePrice) * 100;

		setComparisonResult({
			userPrice: userPriceNum,
			statsCanPrice: basePrice,
			difference: Math.abs(difference),
			percentageDifference,
			isSaving: difference < 0,
			product: meta.product,
			location: meta.location,
			year: meta.year,
		});
	}, []);

	const clearComparison = useCallback(() => setComparisonResult(null), []);

	return { comparisonResult, handleCompare, clearComparison };
}

/** Pure function version — useful for unit tests without React. */
export function computePriceComparison(
	basePrice: number,
	userPrice: number,
	meta: { product: string; location: string; year: string },
): ComparisonResult {
	const difference = userPrice - basePrice;
	return {
		userPrice,
		statsCanPrice: basePrice,
		difference: Math.abs(difference),
		percentageDifference: (difference / basePrice) * 100,
		isSaving: difference < 0,
		product: meta.product,
		location: meta.location,
		year: meta.year,
	};
}
