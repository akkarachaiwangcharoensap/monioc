import type React from 'react';
import SegmentedControl, { type SegmentedControlOption } from '../ui/SegmentedControl';
import { isWeightUnit, isVolumeUnit, formatUnit } from '../../utils';

interface UnitSelectorProps {
	nativeUnit: string;
	value: string;
	onChange: (unit: string) => void;
}

const WEIGHT_OPTIONS: SegmentedControlOption<'kg' | 'lb'>[] = [
	{ value: 'kg', label: 'KG', ariaLabel: 'Show prices per kilogram' },
	{ value: 'lb', label: 'LB', ariaLabel: 'Show prices per pound' },
];

const VOLUME_OPTIONS: SegmentedControlOption<'l' | 'ml' | 'oz'>[] = [
	{ value: 'l', label: 'L', ariaLabel: 'Show prices per litre' },
	{ value: 'ml', label: 'ML', ariaLabel: 'Show prices per millilitre' },
	{ value: 'oz', label: 'OZ', ariaLabel: 'Show prices per fluid ounce' },
];

/**
 * Renders a unit toggle for weight/volume products, or a static unit badge
 * for products measured by a fixed unit (each, bunch, etc.).
 */
export function UnitSelector({ nativeUnit, value, onChange }: UnitSelectorProps): React.ReactElement {
	const lower = nativeUnit.toLowerCase();

	if (isWeightUnit(lower)) {
		return (
			<SegmentedControl<'kg' | 'lb'>
				value={value as 'kg' | 'lb'}
				onChange={onChange}
				options={WEIGHT_OPTIONS}
				size="lg"
			/>
		);
	}

	if (isVolumeUnit(lower)) {
		return (
			<SegmentedControl<'l' | 'ml' | 'oz'>
				value={value as 'l' | 'ml' | 'oz'}
				onChange={onChange}
				options={VOLUME_OPTIONS}
				size="lg"
			/>
		);
	}

	return (
		<div className="flex items-center gap-2 rounded-lg bg-slate-200 px-3 py-2.5">
			<i className="fas fa-balance-scale text-slate-700" aria-hidden="true" />
			<span className="text-sm font-semibold text-slate-900">per {formatUnit(nativeUnit)}</span>
		</div>
	);
}
