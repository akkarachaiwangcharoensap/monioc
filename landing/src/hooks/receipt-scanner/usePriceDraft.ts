import { useState, useCallback } from 'react';

interface PriceDraftState {
	rowIdx: number;
	value: string;
}

export interface UsePriceDraftResult {
	getDisplayValue: (rowIdx: number, storedPrice: number) => string;
	handleFocus: (rowIdx: number, storedPrice: number) => void;
	handleChange: (rowIdx: number, value: string) => void;
	handleBlur: (rowIdx: number, onCommit: (price: number) => void) => void;
	seedDraft: (rowIdx: number, key: string) => void;
	isDrafting: (rowIdx: number) => boolean;
}

export function usePriceDraft(): UsePriceDraftResult {
	const [priceDraft, setPriceDraft] = useState<PriceDraftState | null>(null);

	const getDisplayValue = useCallback(
		(rowIdx: number, storedPrice: number): string => {
			if (priceDraft?.rowIdx === rowIdx) return priceDraft.value;
			return storedPrice > 0 ? storedPrice.toFixed(2) : '';
		},
		[priceDraft],
	);

	const handleFocus = useCallback(
		(rowIdx: number, storedPrice: number) => {
			if (priceDraft?.rowIdx === rowIdx) return;
			setPriceDraft({ rowIdx, value: storedPrice > 0 ? storedPrice.toFixed(2) : '' });
		},
		[priceDraft],
	);

	const handleChange = useCallback(
		(rowIdx: number, value: string) => {
			if (priceDraft?.rowIdx !== rowIdx) return;
			setPriceDraft({ rowIdx, value });
		},
		[priceDraft],
	);

	const handleBlur = useCallback(
		(rowIdx: number, onCommit: (price: number) => void) => {
			if (priceDraft?.rowIdx === rowIdx) {
				onCommit(parseFloat(priceDraft.value) || 0);
				setPriceDraft(null);
			}
		},
		[priceDraft],
	);

	const seedDraft = useCallback((rowIdx: number, key: string) => {
		setPriceDraft({ rowIdx, value: key });
	}, []);

	const isDrafting = useCallback(
		(rowIdx: number): boolean => priceDraft?.rowIdx === rowIdx,
		[priceDraft],
	);

	return { getDisplayValue, handleFocus, handleChange, handleBlur, seedDraft, isDrafting };
}
