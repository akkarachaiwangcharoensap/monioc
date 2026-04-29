import React from 'react';
import type { ReactElement } from 'react';
import { ComparisonResult } from '../types';
import { formatPrice } from '../utils';
import SegmentedControl, { type SegmentedControlOption } from './ui/SegmentedControl';

interface PriceCalculatorProps {
    userPrice: string;
    unit: string;
    currentPrice: number | null;
    onUserPriceChange: (price: string) => void;
    // onCalculate now accepts an optional user price string to avoid async state races
    onCalculate: (price?: string) => void;
    comparisonResult?: ComparisonResult | null;
}

type InputMode = 'per-unit' | 'price-volume';

/**
 * PriceCalculator component for price input and comparison.
 * Apple-inspired flat design with Font Awesome icons
 * Always shows the input field and displays comparison results as a centered banner.
 * Supports two modes: price per unit or price + volume entry.
 */
export default function PriceCalculator({
    userPrice,
    unit,
    currentPrice,
    onUserPriceChange,
    onCalculate,
    comparisonResult = null,
}: PriceCalculatorProps): ReactElement {
    const [inputMode, setInputMode] = React.useState<InputMode>('per-unit');
    const [productPrice, setProductPrice] = React.useState<string>('');
    const [productVolume, setProductVolume] = React.useState<string>('');

    const canCalculate = inputMode === 'per-unit'
        ? Boolean(userPrice) && currentPrice !== null
        : Boolean(productPrice) && Boolean(productVolume) && currentPrice !== null;

    // Use relative tolerance: prices are the same if difference is less than 1% of the base price
    const tolerance = comparisonResult ? Math.max(1e-6, comparisonResult.statsCanPrice * 0.01) : 1e-6;
    const isSame = comparisonResult ? Math.abs(comparisonResult.difference) < tolerance : false;

    // Calculate price per unit when in price-volume mode
    const handlePriceVolumeCalculate = () => {
        if (productPrice && productVolume) {
            const pricePerUnit = parseFloat(productPrice) / parseFloat(productVolume);
            const priceStr = pricePerUnit.toFixed(2);
            // Update parent's user price and pass the computed value directly to onCalculate
            onUserPriceChange(priceStr);
            onCalculate(priceStr);
        }
    };

    const handleCalculateClick = () => {
        if (inputMode === 'price-volume') {
            handlePriceVolumeCalculate();
        } else {
            onCalculate();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && canCalculate) {
            handleCalculateClick();
        }
    };

    const modeOptions: SegmentedControlOption<InputMode>[] = [
        { value: 'per-unit', label: `Price per ${unit.toUpperCase()}`, ariaLabel: `Enter price per ${unit.toUpperCase()}` },
        { value: 'price-volume', label: 'Price + Volume', ariaLabel: 'Enter product price and volume' },
    ];

    return (
        <div className="rounded-3xl bg-slate-50 p-4 sm:p-6">
            {/* Results Banner - Same Price */}
            {comparisonResult && isSame && (
                <div
                    role="status"
                    aria-live="polite"
                    className="mb-5 rounded-2xl border-2 border-slate-300 bg-slate-100 p-4 text-center"
                >
                    <div className="mb-2">
                        <i className="fas fa-equals text-xl sm:text-2xl text-slate-600" aria-hidden="true"></i>
                    </div>
                    <p className="text-base sm:text-lg font-semibold text-slate-900">You're paying the same average!</p>
                    <p className="text-sm text-slate-600 mt-2">
                        Your price: ${formatPrice(comparisonResult.userPrice)} • StatsCan: ${formatPrice(comparisonResult.statsCanPrice, { official: true })}
                    </p>
                </div>
            )}

            {/* Results Banner - Saving or Paying More */}
            {comparisonResult && !isSame && (
                <div
                    role="status"
                    aria-live="polite"
                    className={`mb-5 rounded-2xl border-2 p-4 text-center ${comparisonResult.isSaving
                        ? 'bg-emerald-50 border-emerald-300'
                        : 'bg-red-50 border-red-300'
                        }`}
                >
                    <div className="mb-2">
                        <i className={`fas ${comparisonResult.isSaving ? 'fa-arrow-down' : 'fa-arrow-up'} text-xl sm:text-2xl ${comparisonResult.isSaving ? 'text-emerald-600' : 'text-red-600'
                            }`} aria-hidden="true"></i>
                    </div>
                    <p className={`text-base sm:text-lg font-semibold ${comparisonResult.isSaving ? 'text-emerald-900' : 'text-red-900'
                        }`}>
                        {comparisonResult.isSaving ? "You're Saving" : "You're Paying More"}
                    </p>
                    <div className="flex items-baseline justify-center gap-2 mt-2">
                        <span className={`text-xl sm:text-2xl font-bold ${comparisonResult.isSaving ? 'text-emerald-700' : 'text-red-700'
                            }`}>
                            {comparisonResult.isSaving ? '-' : '+'}${formatPrice(Math.abs(comparisonResult.difference))}
                        </span>
                        <span className={`text-sm sm:text-base font-medium ${comparisonResult.isSaving ? 'text-emerald-600' : 'text-red-600'
                            }`}>
                            ({Math.abs(comparisonResult.percentageDifference).toFixed(1)}%)
                        </span>
                    </div>
                    <p className="text-sm text-slate-600 mt-3">
                        Your price: ${formatPrice(comparisonResult.userPrice)} vs StatsCan: ${formatPrice(comparisonResult.statsCanPrice, { official: true })}
                    </p>
                </div>
            )}

            {/* Mode Toggle */}
            <div className="mb-5">
                <SegmentedControl
                    className="w-full"
                    value={inputMode}
                    onChange={(value) => setInputMode(value as InputMode)}
                    options={modeOptions}
                    size="lg"
                />
            </div>

            {/* Price Per Unit Input Mode */}
            {inputMode === 'per-unit' && (
                <div className="mb-4">
                    <label htmlFor="price-input" className="block text-sm font-semibold text-slate-700 mb-2 text-left">
                        <i className="fas fa-dollar-sign mr-1" aria-hidden="true"></i>
                        Price per {unit.toUpperCase()}
                    </label>
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium text-sm">
                            $
                        </span>
                        <input
                            id="price-input"
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            value={userPrice}
                            onChange={(e) => onUserPriceChange(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="0.00"
                            aria-describedby="price-unit-desc"
                            className="h-12 w-full rounded-xl border-2 border-slate-300 bg-white pl-8 pr-24 text-base font-medium text-slate-900 placeholder-slate-400 transition-colors focus:border-emerald-500 focus:outline-none"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold text-sm uppercase pointer-events-none">
                            per {unit}
                        </span>
                    </div>
                    <p id="price-unit-desc" className="sr-only">per {unit.toUpperCase()}</p>
                </div>
            )}

            {/* Price + Volume Input Mode */}
            {inputMode === 'price-volume' && (
                <div className="space-y-4 mb-4">
                    {/* Product Price */}
                    <div>
                        <label htmlFor="product-price-input" className="block text-sm font-semibold text-slate-700 mb-2 text-left">
                            <i className="fas fa-tag mr-1" aria-hidden="true"></i>
                            Product Price
                        </label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium text-sm">
                                $
                            </span>
                            <input
                                id="product-price-input"
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                min="0"
                                value={productPrice}
                                onChange={(e) => setProductPrice(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="0.00"
                                className="h-12 w-full rounded-xl border-2 border-slate-300 bg-white pl-8 pr-4 text-base font-medium text-slate-900 placeholder-slate-400 transition-colors focus:border-emerald-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Product Volume */}
                    <div>
                        <label htmlFor="product-volume-input" className="block text-sm font-semibold text-slate-700 mb-2 text-left">
                            <i className="fas fa-weight mr-1" aria-hidden="true"></i>
                            Volume / Weight
                        </label>
                        <div className="relative">
                            <input
                                id="product-volume-input"
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                min="0"
                                value={productVolume}
                                onChange={(e) => setProductVolume(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="0.00"
                                className="h-12 w-full rounded-xl border-2 border-slate-300 bg-white pl-4 pr-4 text-base font-medium text-slate-900 placeholder-slate-400 transition-colors focus:border-emerald-500 focus:outline-none"
                            />
                            <span className="absolute right-14 top-1/2 -translate-y-1/2 text-slate-500 font-semibold text-sm uppercase pointer-events-none">
                                {unit}
                            </span>
                        </div>
                    </div>

                    {/* Calculated Preview */}
                    {productPrice && productVolume && parseFloat(productVolume) > 0 && (() => {
                        const computed = parseFloat(productPrice) / parseFloat(productVolume);
                        const preview = computed.toFixed(2);
                        return (
                            <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4 text-left">
                                <p className="text-xs font-semibold text-emerald-700 mb-1">
                                    <i className="fas fa-calculator mr-1" aria-hidden="true"></i>
                                    Calculated Price per {unit.toUpperCase()}
                                </p>
                                <p className="text-lg sm:text-xl font-bold text-emerald-900">
                                    ${preview}
                                    <span className="text-xs sm:text-sm font-medium text-emerald-600 ml-2">per {unit}</span>
                                </p>
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* Compare Button */}
            <button
                onClick={handleCalculateClick}
                disabled={!canCalculate}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-base font-semibold text-white transition-colors hover:cursor-pointer hover:bg-emerald-600 active:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
            >
                {canCalculate ? (
                    <>
                        <i className="fas fa-calculator" aria-hidden="true"></i>
                        Compare
                    </>
                ) : (
                    inputMode === 'per-unit' ? 'Enter a price' : 'Enter price and volume'
                )}
            </button>
        </div>
    );
}
