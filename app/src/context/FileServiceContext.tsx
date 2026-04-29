/**
 * FileServiceContext — provides the FileService implementation to the React tree.
 */
import { createContext, useContext } from 'react';
import type React from 'react';
import type { FileService } from '../services/FileService';

const FileServiceContext = createContext<FileService | null>(null);

export function FileServiceProvider({
	service,
	children,
}: {
	service: FileService;
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<FileServiceContext.Provider value={service}>
			{children}
		</FileServiceContext.Provider>
	);
}

export function useFileService(): FileService {
	const ctx = useContext(FileServiceContext);
	if (!ctx) throw new Error('useFileService must be used within FileServiceProvider');
	return ctx;
}
