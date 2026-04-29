import type React from 'react';

interface ProductErrorStateProps {
	message: string;
}

export function ProductErrorState({ message }: ProductErrorStateProps): React.ReactElement {
	return (
		<div className="min-h-screen bg-white flex items-center justify-center p-4">
			<div className="bg-red-50 rounded-3xl p-8 max-w-md w-full">
				<div className="text-center mb-4">
					<i className="fas fa-exclamation-triangle text-5xl text-red-500" aria-hidden="true" />
				</div>
				<p className="text-red-600 text-center font-semibold">Error loading product</p>
				<p className="text-slate-600 text-center mt-2">{message}</p>
			</div>
		</div>
	);
}
