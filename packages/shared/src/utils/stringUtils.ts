/**
 * String utility functions for text manipulation
 */

/**
 * Convert a string to a URL-friendly slug
 * @param text - The text to slugify
 * @returns A URL-friendly slug
 */
export function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');
}

/**
 * Capitalize the first letter of a string
 * @param text - The text to capitalize
 * @returns The capitalized text
 */
export function capitalize(text: string): string {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Format a product category name for display
 * Capitalizes words and removes underscores
 * @param category - The category name to format
 * @returns The formatted category name
 */
export function formatCategoryName(category: string): string {
    if (!category) return '';
    return category
        .replace(/_/g, ' ') // Replace underscores with spaces
        .split(' ')
        .map((word) => capitalize(word.toLowerCase()))
        .join(' ');
}

/**
 * Abbreviate a Canadian province / location name for compact UI display.
 * Falls back to the first three uppercase letters for unknown values.
 */
export function abbreviateProvince(name: string): string {
    if (!name) return '';
    const lookup: Record<string, string> = {
        Canada: 'CA',
        'Newfoundland And Labrador': 'NL',
        'Prince Edward Island': 'PE',
        'Nova Scotia': 'NS',
        'New Brunswick': 'NB',
        Quebec: 'QC',
        Ontario: 'ON',
        Manitoba: 'MB',
        Saskatchewan: 'SK',
        Alberta: 'AB',
        'British Columbia': 'BC',
        Yukon: 'YT',
        'Northwest Territories': 'NT',
        Nunavut: 'NU',
    };

    // Direct match
    if (lookup[name]) return lookup[name];

    // Partial matches for entries that include city, e.g. "Whitehorse, Yukon"
    if (name.includes('Yukon')) return 'YT';
    if (name.includes('Northwest')) return 'NT';
    if (name.includes('Whitehorse')) return 'YT';
    if (name.includes('Yellowknife')) return 'NT';

    // Fallback: short uppercased form
    return name.slice(0, 3).toUpperCase();
}
