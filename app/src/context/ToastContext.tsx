import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type React from 'react';

export type ToastType = 'info' | 'success' | 'error' | 'progress';

export interface ToastItem {
	id: string;
	type: ToastType;
	title: string;
	message?: string;
	/** 0–100, shown when type is 'progress'. */
	progress?: number;
	/** Human-readable label below the progress bar. */
	progressLabel?: string;
	/** Optional FA icon class override (e.g. 'fa-receipt'). Falls back to the type-default icon. */
	icon?: string;
	dismissible?: boolean;
	/** Auto-dismiss after this many ms. 0 or omitted = no auto-dismiss. */
	duration?: number;
	/** Optional cancel action — renders a Cancel button on progress toasts. */
	onCancel?: () => void;
}

interface ToastContextValue {
	toasts: ToastItem[];
	/** Add a toast. Returns the generated id. */
	addToast(options: Omit<ToastItem, 'id'>): string;
	/** Partially update an existing toast by id. */
	updateToast(id: string, options: Partial<Omit<ToastItem, 'id'>>): void;
	/** Remove a toast immediately. */
	dismissToast(id: string): void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
	const [toasts, setToasts] = useState<ToastItem[]>([]);
	const nextId = useRef(0);
	const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

	const dismissToast = useCallback((id: string) => {
		const t = timers.current.get(id);
		if (t) {
			clearTimeout(t);
			timers.current.delete(id);
		}
		setToasts((prev) => prev.filter((toast) => toast.id !== id));
	}, []);

	const addToast = useCallback(
		(options: Omit<ToastItem, 'id'>): string => {
			const id = `toast-${nextId.current++}`;
			const toast: ToastItem = { dismissible: true, ...options, id };
			setToasts((prev) => [...prev, toast]);
			if (toast.duration && toast.duration > 0) {
				const t = setTimeout(() => dismissToast(id), toast.duration);
				timers.current.set(id, t);
			}
			return id;
		},
		[dismissToast],
	);

	const updateToast = useCallback(
		(id: string, options: Partial<Omit<ToastItem, 'id'>>) => {
			setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, ...options } : t)));
			// If a new duration is supplied, restart the auto-dismiss timer.
			if (options.duration && options.duration > 0) {
				const existing = timers.current.get(id);
				if (existing) clearTimeout(existing);
				const t = setTimeout(() => dismissToast(id), options.duration);
				timers.current.set(id, t);
			}
		},
		[dismissToast],
	);

	return (
		<ToastContext.Provider value={{ toasts, addToast, updateToast, dismissToast }}>
			{children}
		</ToastContext.Provider>
	);
}

export function useToast(): ToastContextValue {
	const ctx = useContext(ToastContext);
	if (!ctx) throw new Error('useToast must be used within ToastProvider');
	return ctx;
}
