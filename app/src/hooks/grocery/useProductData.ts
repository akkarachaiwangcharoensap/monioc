import { useState, useEffect } from 'react';
import type { GroceryProductRecord, GroceryPriceResult } from '../../types';
import { TauriApi } from '../../services/api';
import { parseTauriError } from '../../services/errors';
import { slugify } from '../../utils';

export interface UseProductDataResult {
	product: GroceryProductRecord | null;
	prices: GroceryPriceResult[];
	loading: boolean;
	error: string | null;
}

/**
 * Fetches product record and all prices for a given category + slug.
 * If `initial` is provided (passed via router state) it is used immediately
 * and only prices are fetched, avoiding a redundant product list call.
 */
export function useProductData(
	category: string | undefined,
	productSlug: string | undefined,
	initial?: GroceryProductRecord,
): UseProductDataResult {
	const [product, setProduct] = useState<GroceryProductRecord | null>(initial ?? null);
	const [prices, setPrices] = useState<GroceryPriceResult[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!category || !productSlug) return;
		let cancelled = false;
		setLoading(true);
		setError(null);

		const resolveProduct = (): Promise<GroceryProductRecord | null> => {
			if (initial) return Promise.resolve(initial);
			return TauriApi.listGroceryProducts({ category, search: '', page: 1, pageSize: 200 })
				.then((page) => page.products.find((p) => slugify(p.name) === productSlug) ?? null);
		};

		resolveProduct()
			.then(async (found) => {
				if (cancelled) return;
				setProduct(found);
				if (!found) return;
				const pricePage = await TauriApi.getGroceryPrices({
					productName: found.name,
					location: '',
					year: '',
					page: 1,
					pageSize: 500,
				});
				if (!cancelled) setPrices(pricePage.prices);
			})
			.catch((err: unknown) => {
				if (!cancelled) setError(parseTauriError(err));
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => { cancelled = true; };
	}, [category, productSlug]); // eslint-disable-line react-hooks/exhaustive-deps

	return { product, prices, loading, error };
}
