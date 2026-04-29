import type React from 'react';

export function ProductNotFoundState(): React.ReactElement {
	return (
		<div className="min-h-screen bg-white flex items-center justify-center p-4">
			<div className="bg-slate-50 rounded-3xl p-8 max-w-md w-full">
				<div className="text-center mb-4">
					<i className="fas fa-search text-5xl text-slate-300" aria-hidden="true" />
				</div>
				<p className="text-slate-600 text-center font-semibold">Product not found</p>
				<p className="text-sm text-slate-500 text-center mt-2">Try searching for a different product</p>
			</div>
		</div>
	);
}
