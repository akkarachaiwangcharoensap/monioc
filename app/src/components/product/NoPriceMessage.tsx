import type React from 'react';

/** Shown when no price data matches the selected year + location. */
export function NoPriceMessage(): React.ReactElement {
	return (
		<div className="border-t border-yellow-200 bg-yellow-50 p-5">
			<div className="flex items-center gap-3">
				<i className="fas fa-exclamation-circle text-2xl text-yellow-600" aria-hidden="true" />
				<div>
					<p className="text-sm font-semibold text-yellow-900 sm:text-base">No price data available</p>
					<p className="text-xs text-yellow-700 mt-0.5">Try selecting a different year or location</p>
				</div>
			</div>
		</div>
	);
}
