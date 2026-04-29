/**
 * Unit conversion utilities for grocery price comparisons
 */

import { GRAMS_PER_POUND, ML_PER_FL_OZ, ML_PER_GALLON } from '../constants';

/**
 * Supported measurement units for grocery items.
 */
export type MeasurementUnit =
    | 'g'
    | 'kg'
    | 'mg'
    | 'oz'
    | 'lb'
    | 'ml'
    | 'l'
    | 'fl oz'
    | 'gal'
    | 'unit'
    | 'each'
    | 'pack'
    | 'dozen';

/** Return true if the unit represents a weight measurement. */
export function isWeightUnit(unit: string): boolean {
    const lower = unit.toLowerCase().trim();
    return ['g', 'kg', 'mg', 'oz', 'lb', 'lbs', 'pound', 'gram', 'kilogram'].includes(lower);
}

/** Return true if the unit represents a volume measurement. */
export function isVolumeUnit(unit: string): boolean {
    const lower = unit.toLowerCase().trim();
    return ['ml', 'l', 'fl oz', 'oz', 'gal', 'litre', 'liter', 'millilitre', 'milliliter'].includes(lower);
}

/**
 * Convert a weight value to grams (base unit for weight comparisons).
 */
export function convertWeight(value: number, from: string): number {
    const unit = from.toLowerCase().trim();
    switch (unit) {
        case 'g':
        case 'gram':
        case 'grams':
            return value;
        case 'kg':
        case 'kilogram':
        case 'kilograms':
            return value * 1000;
        case 'mg':
        case 'milligram':
        case 'milligrams':
            return value / 1000;
        case 'lb':
        case 'lbs':
        case 'pound':
        case 'pounds':
            return value * GRAMS_PER_POUND;
        default:
            return value;
    }
}

/**
 * Convert a volume value to millilitres (base unit for volume comparisons).
 */
export function convertVolume(value: number, from: string): number {
    const unit = from.toLowerCase().trim();
    switch (unit) {
        case 'ml':
        case 'millilitre':
        case 'milliliter':
        case 'millilitres':
        case 'milliliters':
            return value;
        case 'l':
        case 'litre':
        case 'liter':
        case 'litres':
        case 'liters':
            return value * 1000;
        case 'oz':
        case 'fl oz':
        case 'fluid oz':
        case 'fluid ounce':
        case 'fluid ounces':
            return value * ML_PER_FL_OZ;
        case 'gal':
        case 'gallon':
        case 'gallons':
            return value * ML_PER_GALLON;
        default:
            return value;
    }
}

/**
 * Convert a price per `fromUnit` to a price per `toUnit`.
 * For example, convert $5/kg to $/lb.
 *
 * @param price    - Price in dollars per fromUnit.
 * @param fromUnit - The unit the price is currently expressed in.
 * @param toUnit   - The unit to convert to.
 * @returns Converted price, or original price if units are incompatible.
 */
export function convertPricePerUnit(price: number, fromUnit: string, toUnit: string): number {
    const from = fromUnit.toLowerCase().trim();
    const to = toUnit.toLowerCase().trim();

    if (from === to) return price;

    if (isWeightUnit(from) && isWeightUnit(to)) {
        const fromBase = convertWeight(1, from); // grams per 1 fromUnit
        const toBase = convertWeight(1, to);     // grams per 1 toUnit
        // price/fromUnit * (toBase g/toUnit) / (fromBase g/fromUnit) = price/toUnit
        return price * (toBase / fromBase);
    }

    if (isVolumeUnit(from) && isVolumeUnit(to)) {
        const fromBase = convertVolume(1, from); // ml per 1 fromUnit
        const toBase = convertVolume(1, to);     // ml per 1 toUnit
        return price * (toBase / fromBase);
    }

    return price;
}

/**
 * Format a unit string for human-readable display.
 * @param unit    - Raw unit string.
 * @param amount  - Optional numeric amount (affects singular vs. plural).
 * @returns Formatted unit label.
 */
export function formatUnit(unit: string, amount?: number): string {
    const lower = unit.toLowerCase().trim();
    const plural = amount === undefined || Math.abs(amount) !== 1;

    const map: Record<string, [string, string]> = {
        g: ['g', 'g'],
        kg: ['kg', 'kg'],
        mg: ['mg', 'mg'],
        oz: ['oz', 'oz'],
        lb: ['lb', 'lbs'],
        lbs: ['lb', 'lbs'],
        ml: ['ml', 'ml'],
        l: ['L', 'L'],
        'fl oz': ['fl oz', 'fl oz'],
        gal: ['gal', 'gal'],
        unit: ['unit', 'units'],
        each: ['each', 'each'],
        pack: ['pack', 'packs'],
        dozen: ['dozen', 'dozen'],
    };

    const entry = map[lower];
    if (!entry) return unit;
    return plural ? entry[1] : entry[0];
}
