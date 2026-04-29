import { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import type React from 'react';
import { listen } from '@tauri-apps/api/event';
import { useCategories as useCategoriesHook } from '../hooks/useCategories';
import type { UseCategoriesReturn } from '../hooks/useCategories';
import { AppEvents } from '../constants';
import { useToast } from './ToastContext';

const CategoriesContext = createContext<UseCategoriesReturn | null>(null);

export function CategoriesProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
	const { addToast } = useToast();
	const onMutationError = useCallback((message: string) => {
		addToast({ type: 'error', title: 'Category save failed', message, duration: 5000 });
	}, [addToast]);
	const value = useCategoriesHook({ onMutationError });
	const valueRef = useRef(value);
	valueRef.current = value;

	// Auto-reload when the entire DB is replaced (backup restore).
	// Same-window category mutations are already reflected by the shared state.
	useEffect(() => {
		const unlisten = listen(AppEvents.DATA_RESTORED, () => {
			valueRef.current.resetToDefaults();
		});
		return () => { void unlisten.then((fn) => fn()); };
	}, []);

	return <CategoriesContext.Provider value={value}>{children}</CategoriesContext.Provider>;
}

export function useCategoriesContext(): UseCategoriesReturn {
	const ctx = useContext(CategoriesContext);
	if (!ctx) throw new Error('useCategoriesContext must be used within CategoriesProvider');
	return ctx;
}
