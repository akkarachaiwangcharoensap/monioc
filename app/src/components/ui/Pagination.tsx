import type React from 'react';

interface PaginationProps {
	currentPage: number;
	totalPages: number;
	onPageChange: (page: number) => void;
	totalItems?: number;
	pageSize?: number;
}

export default function Pagination({
	currentPage,
	totalPages,
	onPageChange,
	totalItems,
	pageSize,
}: PaginationProps): React.ReactElement | null {
	if (totalPages <= 1) return null;

	const showingFrom = totalItems !== undefined && pageSize !== undefined
		? Math.min((currentPage - 1) * pageSize + 1, totalItems)
		: undefined;
	const showingTo = totalItems !== undefined && pageSize !== undefined
		? Math.min(currentPage * pageSize, totalItems)
		: undefined;

	return (
		<div className="pt-4 flex items-center gap-3">
			{showingFrom !== undefined && showingTo !== undefined && totalItems !== undefined && (
				<span className="text-xs text-slate-500 mr-auto">
					{showingFrom}–{showingTo} of {totalItems}
				</span>
			)}
			<div className="flex items-center gap-2 ml-auto">
				<button
					type="button"
					onClick={() => onPageChange(Math.max(1, currentPage - 1))}
					disabled={currentPage <= 1}
					aria-label="Previous page"
					className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
				>
					<i className="fas fa-chevron-left text-[10px]" aria-hidden="true" />
					Previous
				</button>
				<span className="text-xs text-slate-500 tabular-nums">
					{currentPage} / {totalPages}
				</span>
				<button
					type="button"
					onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
					disabled={currentPage >= totalPages}
					aria-label="Next page"
					className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
				>
					Next
					<i className="fas fa-chevron-right text-[10px]" aria-hidden="true" />
				</button>
			</div>
		</div>
	);
}
