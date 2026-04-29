/**
 * Type definitions for Statistics Canada Grocery Price Tracker.
 *
 * All types are defined in domain-focused modules under src/types/ and
 * re-exported here so existing `import { X } from '../types'` paths
 * continue to work without changes.
 */

export * from './types/index';

// Re-export runtime constant from constants.ts so existing
// `import { CUSTOM_GROCERY_CATEGORIES } from '../types'` still works.
export { CUSTOM_GROCERY_CATEGORIES } from './constants';
