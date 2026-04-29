import type React from 'react';
import SegmentedControl from './SegmentedControl';
import type { SegmentedControlOption } from './SegmentedControl';

export type GranularityToggleValue = 'year' | 'month' | 'week';

const options: SegmentedControlOption<GranularityToggleValue>[] = [
	{ value: 'year', label: 'Year', ariaLabel: 'Year granularity' },
	{ value: 'month', label: 'Month', ariaLabel: 'Month granularity' },
	{ value: 'week', label: 'Week', ariaLabel: 'Week granularity' },
];

interface Props {
	value: GranularityToggleValue;
	onChange: (value: GranularityToggleValue) => void;
	className?: string;
}

export default function GranularityToggle({ value, onChange, className }: Props): React.ReactElement {
	return (
		<div className={`rounded-xl bg-slate-100 p-1 ${className ?? ''}`.trim()}>
			<SegmentedControl<GranularityToggleValue> value={value} onChange={onChange} options={options} size="md" />
		</div>
	);
}
