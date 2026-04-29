import type React from 'react';

export interface SelectFieldOption {
	value: string;
	label: string;
}

interface SelectFieldProps {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	options: SelectFieldOption[];
	iconClassName?: string;
	className?: string;
}

export default function SelectField({
	id,
	label,
	value,
	onChange,
	options,
	iconClassName,
	className,
}: SelectFieldProps): React.ReactElement {
	return (
		<div className={className}>
			<label htmlFor={id} className="mb-2 block text-sm font-semibold text-slate-700 text-left">
				{iconClassName && <i className={`${iconClassName} mr-1`} aria-hidden="true" />}
				{label}
			</label>
			<div className="relative">
				<select
					id={id}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className="min-h-[24px] w-full appearance-none rounded-xl border-2 border-slate-300 bg-white px-4 py-2 pr-10 text-sm font-medium text-slate-800 transition-colors hover:border-slate-400 focus:border-emerald-500 focus:outline-none"
				>
					{options.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
				<i
					className="fas fa-chevron-down pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
					aria-hidden="true"
				/>
			</div>
		</div>
	);
}
