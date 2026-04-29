import { createContext, useContext } from 'react';
import type React from 'react';
import { CUSTOM_GROCERY_CATEGORIES } from '../../../types';

export interface SpreadsheetConfig {
	categories: string[];
	getCategoryColor: ((name: string) => string) | undefined;
	useReactSelect: boolean;
}

const SpreadsheetContext = createContext<SpreadsheetConfig>({
	categories: [...CUSTOM_GROCERY_CATEGORIES],
	getCategoryColor: undefined,
	useReactSelect: false,
});

export function SpreadsheetProvider({
	value,
	children,
}: {
	value: SpreadsheetConfig;
	children: React.ReactNode;
}) {
	return <SpreadsheetContext.Provider value={value}>{children}</SpreadsheetContext.Provider>;
}

export function useSpreadsheetConfig(): SpreadsheetConfig {
	return useContext(SpreadsheetContext);
}
