// @vitest-environment jsdom
/**
 * Unit tests for the useCategories hook.
 *
 * The hook manages a grocery category list persisted in localStorage.
 * Tests cover all CRUD operations, persistence, and edge-case guards.
 *
 * Run with: npm test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCategories } from './useCategories';
import { CUSTOM_GROCERY_CATEGORIES } from '../types';
import { STORAGE_KEYS } from '../constants';

const STORAGE_KEY = STORAGE_KEYS.CATEGORIES;

describe('useCategories', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	// ── Initialization ────────────────────────────────────────────────────────

	describe('initialization', () => {
		it('loads the built-in CUSTOM_GROCERY_CATEGORIES when localStorage is empty', () => {
			const { result } = renderHook(() => useCategories());
			expect(result.current.categories).toEqual([...CUSTOM_GROCERY_CATEGORIES]);
		});

		it('loads persisted categories from localStorage', () => {
			const saved = ['Fruits', 'Vegetables', 'Meat'];
			localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
			const { result } = renderHook(() => useCategories());
			expect(result.current.categories).toEqual(saved);
		});

		it('falls back to defaults when localStorage value is not valid JSON', () => {
			localStorage.setItem(STORAGE_KEY, 'corrupted-data');
			const { result } = renderHook(() => useCategories());
			expect(result.current.categories).toEqual([...CUSTOM_GROCERY_CATEGORIES]);
		});

		it('falls back to defaults when localStorage value is an empty array', () => {
			localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
			const { result } = renderHook(() => useCategories());
			expect(result.current.categories).toEqual([...CUSTOM_GROCERY_CATEGORIES]);
		});

		it('falls back to defaults when localStorage value is not a string array', () => {
			localStorage.setItem(STORAGE_KEY, JSON.stringify([1, 2, 3]));
			const { result } = renderHook(() => useCategories());
			expect(result.current.categories).toEqual([...CUSTOM_GROCERY_CATEGORIES]);
		});
	});

	// ── addCategory ───────────────────────────────────────────────────────────

	describe('addCategory', () => {
		it('appends a new unique category to the list', () => {
			const { result } = renderHook(() => useCategories());
			act(() => { result.current.addCategory('Baby Foods'); });
			expect(result.current.categories).toContain('Baby Foods');
		});

		it('persists the new category to localStorage', () => {
			const { result } = renderHook(() => useCategories());
			act(() => { result.current.addCategory('Baby Foods'); });
			const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[];
			expect(stored).toContain('Baby Foods');
		});

		it('does not add a category that already exists (case-insensitive)', () => {
			const { result } = renderHook(() => useCategories());
			const before = result.current.categories.length;
			act(() => { result.current.addCategory('vegetable'); }); // 'Vegetable' already exists
			const count = result.current.categories.filter(
				(c) => c.toLowerCase() === 'vegetable',
			).length;
			expect(count).toBe(1);
			expect(result.current.categories.length).toBe(before);
		});

		it('rejects blank / whitespace-only names', () => {
			const { result } = renderHook(() => useCategories());
			const before = result.current.categories.length;
			act(() => { result.current.addCategory('   '); });
			expect(result.current.categories.length).toBe(before);
		});

		it('trims leading/trailing whitespace from the new name', () => {
			const { result } = renderHook(() => useCategories());
			act(() => { result.current.addCategory('  Baby Foods  '); });
			expect(result.current.categories).toContain('Baby Foods');
			expect(result.current.categories).not.toContain('  Baby Foods  ');
		});
	});

	// ── renameCategory ────────────────────────────────────────────────────────

	describe('renameCategory', () => {
		it('replaces the old name with the new name', () => {
			const { result } = renderHook(() => useCategories());
			act(() => { result.current.renameCategory('Vegetable', 'Fresh Vegetables'); });
			expect(result.current.categories).toContain('Fresh Vegetables');
			expect(result.current.categories).not.toContain('Vegetable');
		});

		it('returns true on success', () => {
			const { result } = renderHook(() => useCategories());
			let ok = false;
			act(() => { ok = result.current.renameCategory('Vegetable', 'Fresh Vegetables'); });
			expect(ok).toBe(true);
		});

		it('returns false when oldName does not exist in the list', () => {
			const { result } = renderHook(() => useCategories());
			let ok = true;
			act(() => { ok = result.current.renameCategory('Nonexistent', 'Something'); });
			expect(ok).toBe(false);
		});

		it('returns false when the new name already belongs to a different category', () => {
			const { result } = renderHook(() => useCategories());
			let ok = true;
			act(() => { ok = result.current.renameCategory('Vegetable', 'Beverages'); });
			expect(ok).toBe(false);
		});

		it('persists the rename to localStorage', () => {
			const { result } = renderHook(() => useCategories());
			act(() => { result.current.renameCategory('Vegetable', 'Fresh Vegetables'); });
			const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[];
			expect(stored).toContain('Fresh Vegetables');
			expect(stored).not.toContain('Vegetable');
		});
	});

	// ── deleteCategory ────────────────────────────────────────────────────────

	describe('deleteCategory', () => {
		it('removes the named category from the list', () => {
			const { result } = renderHook(() => useCategories());
			act(() => { result.current.deleteCategory('Produce'); });
			expect(result.current.categories).not.toContain('Produce');
		});

		it('persists the deletion to localStorage', () => {
			const { result } = renderHook(() => useCategories());
			act(() => { result.current.deleteCategory('Produce'); });
			const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[];
			expect(stored).not.toContain('Produce');
		});

		it('keeps at least one category when deleting the last one', () => {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(['OnlyOne']));
			const { result } = renderHook(() => useCategories());
			act(() => { result.current.deleteCategory('OnlyOne'); });
			expect(result.current.categories.length).toBeGreaterThanOrEqual(1);
		});
	});

	// ── reorderCategory ───────────────────────────────────────────────────────

	describe('reorderCategory', () => {
		it('moves an item forward (from lower to higher index)', () => {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(['A', 'B', 'C', 'D']));
			const { result } = renderHook(() => useCategories());
			act(() => { result.current.reorderCategory(0, 2); }); // 'A' moves to index 2
			expect(result.current.categories).toEqual(['B', 'C', 'A', 'D']);
		});

		it('moves an item backward (from higher to lower index)', () => {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(['A', 'B', 'C', 'D']));
			const { result } = renderHook(() => useCategories());
			act(() => { result.current.reorderCategory(3, 1); }); // 'D' moves to index 1
			expect(result.current.categories).toEqual(['A', 'D', 'B', 'C']);
		});

		it('does nothing when from and to are the same index', () => {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(['A', 'B', 'C']));
			const { result } = renderHook(() => useCategories());
			act(() => { result.current.reorderCategory(1, 1); });
			expect(result.current.categories).toEqual(['A', 'B', 'C']);
		});

		it('does nothing when toIndex is out of bounds', () => {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(['A', 'B', 'C']));
			const { result } = renderHook(() => useCategories());
			act(() => { result.current.reorderCategory(0, 10); });
			expect(result.current.categories).toEqual(['A', 'B', 'C']);
		});

		it('persists the reorder to localStorage', () => {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(['A', 'B', 'C']));
			const { result } = renderHook(() => useCategories());
			act(() => { result.current.reorderCategory(0, 2); });
			const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[];
			expect(stored).toEqual(['B', 'C', 'A']);
		});
	});

	// ── resetToDefaults ───────────────────────────────────────────────────────

	describe('setCategoriesOrder', () => {
		it('replaces the category order when provided a valid full ordering', () => {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(['A', 'B', 'C']));
			const { result } = renderHook(() => useCategories());
			act(() => { result.current.setCategoriesOrder(['B', 'A', 'C']); });
			expect(result.current.categories).toEqual(['B', 'A', 'C']);
		});

		it('ignores invalid orderings that change list length', () => {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(['A', 'B', 'C']));
			const { result } = renderHook(() => useCategories());
			act(() => { result.current.setCategoriesOrder(['B', 'A']); });
			expect(result.current.categories).toEqual(['A', 'B', 'C']);
		});

		it('ignores invalid orderings that include unknown category names', () => {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(['A', 'B', 'C']));
			const { result } = renderHook(() => useCategories());
			act(() => { result.current.setCategoriesOrder(['B', 'A', 'X']); });
			expect(result.current.categories).toEqual(['A', 'B', 'C']);
		});
	});

	describe('resetToDefaults', () => {
		it('replaces custom categories with the built-in defaults', () => {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(['Custom1', 'Custom2']));
			const { result } = renderHook(() => useCategories());
			act(() => { result.current.resetToDefaults(); });
			expect(result.current.categories).toEqual([...CUSTOM_GROCERY_CATEGORIES]);
		});

		it('persists the defaults to localStorage after reset', () => {
			const { result } = renderHook(() => useCategories());
			act(() => { result.current.addCategory('Temporary'); });
			act(() => { result.current.resetToDefaults(); });
			const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[];
			expect(stored).toEqual([...CUSTOM_GROCERY_CATEGORIES]);
		});
	});
});
