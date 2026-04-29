/**
 * Price formatting utilities to handle various price ranges with appropriate precision.
 * Uses dynamic decimal places based on price magnitude to avoid rounding errors.
 */

import {
    VERY_SMALL_PRICE_THRESHOLD,
    SMALL_PRICE_THRESHOLD,
    VERY_SMALL_DECIMALS_OFFICIAL,
    VERY_SMALL_DECIMALS,
    SMALL_DECIMALS,
    NORMAL_DECIMALS,
    CURRENCY_CODE,
} from '../constants';

interface FormatPriceOptions {
    official?: boolean;
}

/**
 * Format a numeric price as a dollar string with dynamic decimal places:
 * - Very small prices (< 0.01): 5 decimals (official) or 4 decimals
 * - Small prices (< 1):         3 decimal places
 * - Normal prices (>= 1):       2 decimal places
 */
export function formatPrice(price: number, options?: FormatPriceOptions): string {
    if (price === 0) return '0.00';
    if (price < VERY_SMALL_PRICE_THRESHOLD) {
        return options?.official ? price.toFixed(VERY_SMALL_DECIMALS_OFFICIAL) : price.toFixed(VERY_SMALL_DECIMALS);
    }
    if (price < SMALL_PRICE_THRESHOLD) {
        return price.toFixed(SMALL_DECIMALS);
    }
    return price.toFixed(NORMAL_DECIMALS);
}

/**
 * Format a price with a dollar sign prefix.
 * @param price - The price to format.
 * @returns Formatted price string, e.g. "$3.99"
 */
export function formatPriceWithSymbol(price: number): string {
    return `$${price.toFixed(2)}`;
}

/**
 * Format a number as a CAD currency string.
 * @param amount - The numeric amount to format.
 * @returns Locale-formatted currency string, e.g. "$12.50".
 */
export function formatMoney(amount: number): string {
    return amount.toLocaleString(undefined, {
        style: 'currency',
        currency: CURRENCY_CODE,
        maximumFractionDigits: NORMAL_DECIMALS,
    });
}
