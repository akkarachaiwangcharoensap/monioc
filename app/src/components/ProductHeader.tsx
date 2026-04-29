import TabLink from './ui/TabLink';
import type React from 'react';
import LocationSelector from './LocationSelector';
import { ROUTES } from '../constants';

interface ProductHeaderProps {
	categorySlug: string;
	categoryName: string;
}

/**
 * ProductHeader component displays a back navigation link
 * Apple-inspired flat design with Font Awesome icon
 */
export default function ProductHeader({ categorySlug, categoryName }: ProductHeaderProps): React.ReactElement {
	const backPath = ROUTES.PRODUCTS;
	const backText = categorySlug ? 'Categories' : categoryName;

	return (
		<div className="mb-6 sm:mb-8 flex items-center justify-between">
			<div>
				<TabLink
					to={backPath}
					className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-colors"
				>
					<i className="fas fa-chevron-left text-[11px]" aria-hidden="true"></i>
					<span>{backText}</span>
				</TabLink>
			</div>
			<div className="flex items-center">
				<LocationSelector />
			</div>
		</div>
	);
}
