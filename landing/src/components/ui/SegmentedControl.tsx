import type React from 'react';

export interface SegmentedControlOption<T extends string> {
	value: T;
	label: string;
	ariaLabel?: string;
}

interface SegmentedControlProps<T extends string> {
	value: T;
	onChange: (value: T) => void;
	options: SegmentedControlOption<T>[];
	className?: string;
	size?: 'md' | 'lg';
}

export default function SegmentedControl<T extends string>({
	value,
	onChange,
	options,
	className,
	size = 'md',
}: SegmentedControlProps<T>): React.ReactElement {
	const buttonSizeClass =
		size === 'lg'
			? 'min-w-[72px] rounded px-4 py-2 text-sm font-semibold'
			: 'min-w-[56px] rounded px-3 py-1 text-xs font-medium';

	return (
		<div
			className={`inline-flex rounded-lg bg-slate-100 ${size === 'lg' ? 'p-2' : 'px-1'} ${className ?? ''}`.trim()}
			role="radiogroup"
		>
			{options.map((option) => {
				const isActive = option.value === value;
				return (
					<button
						key={option.value}
						type="button"
						role="radio"
						aria-checked={isActive}
						aria-label={option.ariaLabel ?? option.label}
						onClick={() => onChange(option.value)}
						className={`${buttonSizeClass} transition-colors ${
							isActive
								? 'bg-white text-slate-800 border border-slate-200'
								: 'text-slate-500 border border-transparent hover:text-slate-700'
						}`}
					>
						{option.label}
					</button>
				);
			})}
		</div>
	);
}
