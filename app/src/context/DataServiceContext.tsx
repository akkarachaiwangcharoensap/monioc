/**
 * DataServiceContext — provides the DataService implementation to the React tree.
 *
 * In the Tauri app, wraps TauriDataService. On the landing page, wraps MockDataService.
 * Components call `useDataService()` to access the active implementation.
 */
import { createContext, useContext } from 'react';
import type React from 'react';
import type { DataService } from '../services/DataService';

const DataServiceContext = createContext<DataService | null>(null);

export function DataServiceProvider({
	service,
	children,
}: {
	service: DataService;
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<DataServiceContext.Provider value={service}>
			{children}
		</DataServiceContext.Provider>
	);
}

export function useDataService(): DataService {
	const ctx = useContext(DataServiceContext);
	if (!ctx) throw new Error('useDataService must be used within DataServiceProvider');
	return ctx;
}
