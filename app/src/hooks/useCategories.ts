import { useState, useCallback, useEffect, useRef } from 'react';
import { CUSTOM_GROCERY_CATEGORIES } from '../types';
import {
	STORAGE_KEYS,
	DEFAULT_CATEGORY_COLORS,
	CATEGORY_SEMANTIC_COLORS,
	FALLBACK_CATEGORY_COLOR,
} from '../constants';
import { TauriApi } from '../services/api';
import { parseTauriError } from '../services/errors';

function colorForIndex(index: number): string {
	return DEFAULT_CATEGORY_COLORS[index % DEFAULT_CATEGORY_COLORS.length];
}

/** Return a semantically appropriate color for a category name, falling back
 *  to the palette-based default for user-defined names. */
function defaultColorForCategory(name: string, index: number): string {
	return CATEGORY_SEMANTIC_COLORS[name] ?? colorForIndex(index);
}

function normalizeHexColor(value: string | undefined): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	if (!/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return null;
	return trimmed.toUpperCase();
}

function buildDefaultColorMap(cats: string[]): Record<string, string> {
	return Object.fromEntries(cats.map((cat, index) => [cat, defaultColorForCategory(cat, index)]));
}

function loadFromStorage(): string[] {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEYS.CATEGORIES);
		if (!raw) return [...CUSTOM_GROCERY_CATEGORIES];
		const parsed = JSON.parse(raw) as unknown;
		if (
			Array.isArray(parsed) &&
			parsed.length > 0 &&
			parsed.every((v) => typeof v === 'string')
		) {
			return parsed as string[];
		}
	} catch {
		// ignore
	}
	return [...CUSTOM_GROCERY_CATEGORIES];
}

function saveToStorage(cats: string[]): void {
	window.localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(cats));
}

export interface UseCategoriesReturn {
	categories: string[];
	categoryColors: Record<string, string>;
	getCategoryColor: (name: string) => string;
	setCategoryColor: (name: string, color: string) => void;
	addCategory: (name: string) => boolean;
	renameCategory: (oldName: string, newName: string) => boolean;
	deleteCategory: (name: string) => void;
	reorderCategory: (from: number, to: number) => void;
	setCategoriesOrder: (ordered: string[]) => void;
	resetToDefaults: () => void;
}

export interface UseCategoriesOptions {
	/** Called when a fire-and-forget DB mutation fails. Use to surface a toast. */
	onMutationError?: (message: string) => void;
}

/**
 * Manages the grocery category list and colours.
 *
 * Category **names and order** are cached in localStorage for instant startup;
 * **colours** are persisted to the SQLite `categories` table via Tauri IPC.
 * On mount the hook loads from the database and reconciles any drift.
 */
export function useCategories({ onMutationError }: UseCategoriesOptions = {}): UseCategoriesReturn {
	const [categories, setCategories] = useState<string[]>(loadFromStorage);
	const [categoryColors, setCategoryColors] = useState<Record<string, string>>(() =>
		buildDefaultColorMap(loadFromStorage()),
	);
	const onMutationErrorRef = useRef(onMutationError);
	onMutationErrorRef.current = onMutationError;

	const reportMutationError = useCallback((err: unknown) => {
		onMutationErrorRef.current?.(parseTauriError(err));
	}, []);

	/** Track whether we've loaded from the database yet. */
	const dbLoadedRef = useRef(false);

	// ── Load from SQLite on mount ────────────────────────────────────────────
	useEffect(() => {
		let cancelled = false;
		async function load() {
			try {
				const rows = await TauriApi.listCategories();
				if (cancelled) return;
				if (rows.length > 0) {
					const names = rows.map((r) => r.name);
					const colors: Record<string, string> = {};
					const colorUpdates: Array<{ name: string; color: string }> = [];
					for (const r of rows) {
						// Upgrade old `#94A3B8` fallback to semantically meaningful color.
						const upgraded =
							r.color === '#94A3B8' || r.color === FALLBACK_CATEGORY_COLOR
								? CATEGORY_SEMANTIC_COLORS[r.name] ?? r.color
								: r.color;
						colors[r.name] = upgraded;
						if (upgraded !== r.color) colorUpdates.push({ name: r.name, color: upgraded });
					}
					setCategories(names);
					setCategoryColors(colors);
					saveToStorage(names);
					// Persist upgraded colors to DB (fire-and-forget).
					for (const { name, color } of colorUpdates) {
						TauriApi.updateCategoryColor(name, color).catch(reportMutationError);
					}
				} else {
					// Database is empty — seed with current localStorage state.
					const cats = loadFromStorage();
					const colorMap = buildDefaultColorMap(cats);
					const inputs = cats.map((name, index) => ({
						name,
						color: colorMap[name],
						sortOrder: index,
					}));
					await TauriApi.saveCategories(inputs);
					if (!cancelled) {
						setCategories(cats);
						setCategoryColors(colorMap);
					}
				}
			} catch {
				// Tauri not available (e.g. tests / browser preview) — keep localStorage fallback.
			}
			dbLoadedRef.current = true;
		}
		void load();
		return () => { cancelled = true; };
	}, [reportMutationError]);

	const getCategoryColor = useCallback((name: string): string => {
		return categoryColors[name] ?? FALLBACK_CATEGORY_COLOR;
	}, [categoryColors]);

	const setCategoryColor = useCallback((name: string, color: string): void => {
		const normalized = normalizeHexColor(color);
		if (!normalized) return;
		setCategoryColors((prev) => {
			if (!Object.prototype.hasOwnProperty.call(prev, name)) return prev;
			if (prev[name] === normalized) return prev;
			const next = { ...prev, [name]: normalized };
			// Persist to SQLite (fire-and-forget).
			TauriApi.updateCategoryColor(name, normalized).catch(reportMutationError);
			return next;
		});
	}, [reportMutationError]);

	const addCategory = useCallback((name: string): boolean => {
		const trimmed = name.trim();
		if (!trimmed) return false;
		setCategories((prev) => {
			if (prev.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return prev;
			const next = [...prev, trimmed];
			saveToStorage(next);
			const newColor = colorForIndex(next.length - 1);
			setCategoryColors((prevColors) => {
				if (Object.prototype.hasOwnProperty.call(prevColors, trimmed)) return prevColors;
				return { ...prevColors, [trimmed]: newColor };
			});
			TauriApi.addCategory(trimmed, newColor, next.length - 1).catch(reportMutationError);
			return next;
		});
		return true;
	}, [reportMutationError]);

	const renameCategory = useCallback((oldName: string, newName: string): boolean => {
		const trimmed = newName.trim();
		if (!trimmed || oldName === trimmed) return false;
		let success = false;
		setCategories((prev) => {
			if (!prev.includes(oldName)) return prev;
			if (prev.some((c) => c !== oldName && c.toLowerCase() === trimmed.toLowerCase())) return prev;
			success = true;
			const next = prev.map((c) => (c === oldName ? trimmed : c));
			saveToStorage(next);
			setCategoryColors((prevColors) => {
				const oldColor = prevColors[oldName] ?? FALLBACK_CATEGORY_COLOR;
				const { [oldName]: _removed, ...rest } = prevColors;
				return { ...rest, [trimmed]: oldColor };
			});
			TauriApi.renameCategory(oldName, trimmed).catch(reportMutationError);
			return next;
		});
		return success;
	}, [reportMutationError]);

	const deleteCategory = useCallback((name: string): void => {
		setCategories((prev) => {
			const next = prev.filter((c) => c !== name);
			const safe = next.length > 0 ? next : prev;
			saveToStorage(safe);
			setCategoryColors((prevColors) => {
				const { [name]: _removed, ...rest } = prevColors;
				// Ensure every remaining category has a colour.
				const result: Record<string, string> = {};
				for (const [i, cat] of safe.entries()) {
					result[cat] = rest[cat] ?? colorForIndex(i);
				}
				return result;
			});
			if (safe !== prev) {
				TauriApi.deleteCategory(name).catch(reportMutationError);
			}
			return safe;
		});
	}, [reportMutationError]);

	const reorderCategory = useCallback((from: number, to: number): void => {
		setCategories((prev) => {
			if (from < 0 || to < 0 || from >= prev.length || to >= prev.length || from === to) {
				return prev;
			}
			const next = [...prev];
			const [item] = next.splice(from, 1);
			next.splice(to, 0, item);
			saveToStorage(next);
			TauriApi.updateCategoryOrder(next).catch(reportMutationError);
			return next;
		});
	}, [reportMutationError]);

	const setCategoriesOrder = useCallback((ordered: string[]): void => {
		setCategories((prev) => {
			if (ordered.length !== prev.length) return prev;
			const prevSet = new Set(prev);
			if (ordered.some((name) => !prevSet.has(name))) return prev;
			if (ordered.every((name, index) => name === prev[index])) return prev;
			saveToStorage(ordered);
			TauriApi.updateCategoryOrder(ordered).catch(reportMutationError);
			return [...ordered];
		});
	}, [reportMutationError]);

	const resetToDefaults = useCallback((): void => {
		const defaults = [...CUSTOM_GROCERY_CATEGORIES];
		saveToStorage(defaults);
		setCategories(defaults);
		const defaultColors = buildDefaultColorMap(defaults);
		setCategoryColors(defaultColors);
		const inputs = defaults.map((name, index) => ({
			name,
			color: defaultColors[name],
			sortOrder: index,
		}));
		TauriApi.saveCategories(inputs).catch(reportMutationError);
	}, [reportMutationError]);

	return {
		categories,
		categoryColors,
		getCategoryColor,
		setCategoryColor,
		addCategory,
		renameCategory,
		deleteCategory,
		reorderCategory,
		setCategoriesOrder,
		resetToDefaults,
	};
}
