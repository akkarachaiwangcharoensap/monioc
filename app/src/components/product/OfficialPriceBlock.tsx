import type React from 'react';
import { formatPrice, formatUnit } from '../../utils';

interface OfficialPriceBlockProps {
	price: number;
	displayUnit: string;
	location: string;
	year: string;
}

/** Renders the green "Official Price" card when a matching price exists. */
export function OfficialPriceBlock({ price, displayUnit, location, year }: OfficialPriceBlockProps): React.ReactElement {
	return (
		<div className="bg-emerald-50 p-5">
			<div className="flex items-end justify-between">
				<div>
					<p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-800 sm:text-sm">
						<i className="fas fa-check-circle mr-1" aria-hidden="true" />
						Official Price
					</p>
					<div className="flex items-baseline gap-3">
						<span className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
							${formatPrice(price, { official: true })}
						</span>
						<span className="text-sm font-medium text-slate-600">per {formatUnit(displayUnit)}</span>
					</div>
				</div>
				<div className="text-right">
					<p className="text-xs font-semibold text-slate-900 sm:text-sm">
						<i className="fas fa-map-pin mr-1" aria-hidden="true" />
						{location}
					</p>
					<p className="text-xs text-slate-600 sm:text-sm">{year}</p>
				</div>
			</div>
		</div>
	);
}
