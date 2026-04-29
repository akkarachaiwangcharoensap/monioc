import type React from 'react';

interface SearchInputProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	ariaLabel?: string;
	className?: string;
}

export default function SearchInput({
	value,
	onChange,
	placeholder = 'Search…',
	ariaLabel,
	className = '',
}: SearchInputProps): React.ReactElement {
	return (
		<div className={`relative ${className}`}>
			<i
				className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"
				aria-hidden="true"
			/>
			<input
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				aria-label={ariaLabel ?? placeholder}
				className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-6 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
			/>
			{value && (
				<button
					type="button"
					onClick={() => onChange('')}
					aria-label="Clear search"
					className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
				>
					<i className="fas fa-xmark text-xs" aria-hidden="true" />
				</button>
			)}
		</div>
	);
}
