import type React from 'react';

const mockReceipts = [
	{ id: 1, size: '1.2 MB' },
	{ id: 2, size: '1.4 MB' },
	{ id: 3, size: '1.0 MB' },
];

export default function MockEditorThumbnailStrip(): React.ReactElement {
	return (
		<div className="space-y-3 mb-2">
			<div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
				<div className="inline-flex items-center gap-2">
					<i className="fas fa-receipt text-slate-400" aria-hidden="true" />
					<span className="font-medium text-slate-700">{mockReceipts.length} receipt{mockReceipts.length === 1 ? '' : 's'}</span>
				</div>
				<span>3.6 MB</span>
			</div>

			<div className="flex gap-2 overflow-x-auto pt-2 pb-2 px-1 -mx-1">
				{mockReceipts.map((receipt, index) => (
					<div key={receipt.id} className="relative w-16 h-16 flex-shrink-0 select-none">
						<button
							type="button"
							className={`relative w-full h-full rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${index === 0 ? 'border-violet-500' : 'border-slate-200 hover:border-slate-400'}`}
						>
							<div className="w-full h-full bg-slate-100 flex items-center justify-center">
								<i className="fas fa-receipt text-slate-400 text-base" aria-hidden="true" />
							</div>
							<div className="absolute bottom-1 left-1 right-1 rounded bg-black/55 px-1 py-0.5 text-[9px] text-white text-center truncate pointer-events-none">
								{receipt.size}
							</div>
						</button>
						{index === 0 && (
							<button
								type="button"
								className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center bg-slate-700 hover:bg-red-500 text-white rounded-full text-[9px] transition-colors cursor-pointer"
								aria-label="Remove receipt"
							>
								<i className="fas fa-times" aria-hidden="true" />
							</button>
						)}
					</div>
				))}
				<button
					type="button"
					className="w-16 h-16 flex-shrink-0 rounded-xl border-2 border-dashed border-slate-300 hover:border-violet-400 flex items-center justify-center transition-colors cursor-pointer text-slate-400 hover:text-violet-500"
					aria-label="Add receipt"
				>
					<i className="fas fa-plus text-base" aria-hidden="true" />
				</button>
			</div>
		</div>
	);
}
