import type React from 'react';

interface BulkActionBarProps {
	selectedCount: number;
	totalFiltered: number;
	isDeleting: boolean;
	onSelectAll: () => void;
	onClearSelection: () => void;
	onViewSelected: () => void;
	onDeleteSelected: () => void;
}

export default function BulkActionBar({
	selectedCount,
	totalFiltered,
	isDeleting,
	onSelectAll,
	onClearSelection,
	onViewSelected,
	onDeleteSelected,
}: BulkActionBarProps): React.ReactElement {
	return (
		<div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-3 px-4 py-3 bg-slate-900 text-white border-t border-slate-700 safe-bottom">
			<div className="flex items-center gap-3">
				<span className="text-sm font-medium">
					{selectedCount} selected
				</span>
				<button
					type="button"
					onClick={onSelectAll}
					className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer underline"
				>
					All ({totalFiltered})
				</button>
				<button
					type="button"
					onClick={onClearSelection}
					className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer underline"
				>
					Clear
				</button>
			</div>
			<div className="flex items-center gap-2">
				{selectedCount > 0 && (
					<button
						type="button"
						onClick={onViewSelected}
						className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors cursor-pointer"
					>
						<i className="fas fa-eye text-xs" aria-hidden="true" />
						View {selectedCount}
					</button>
				)}
				<button
					type="button"
					onClick={onDeleteSelected}
					disabled={isDeleting || selectedCount === 0}
					className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors cursor-pointer"
				>
					<i className="fas fa-trash text-xs" aria-hidden="true" />
					{isDeleting ? 'Deleting…' : `Delete ${selectedCount}`}
				</button>
			</div>
		</div>
	);
}
