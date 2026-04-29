import type React from 'react';

export interface FeatureCardData {
	/** Font Awesome icon class, e.g. "fa-chart-line" */
	icon: string;
	/** Tailwind bg class for the icon badge, e.g. "bg-blue-100" */
	iconBg: string;
	/** Tailwind text color for the icon, e.g. "text-blue-600" */
	iconColor: string;
	title: string;
	description: string;
}

interface FeatureCardProps extends FeatureCardData {
	className?: string;
}

/**
 * A data-driven feature highlight card. Accepts a plain data object
 * describing the feature and renders a consistent visual. Suitable for
 * landing pages, marketing sections, and the HomePage feature grid.
 */
export default function FeatureCard({
	icon,
	iconBg,
	iconColor,
	title,
	description,
	className = '',
}: FeatureCardProps): React.ReactElement {
	return (
		<div className={`group bg-slate-50 rounded-3xl p-8 hover:bg-slate-100 transition-colors ${className}`.trim()}>
			<div className="flex sm:flex-col items-start sm:items-center gap-4 sm:gap-0">
				<div className={`flex-shrink-0 w-16 h-16 flex items-center justify-center ${iconBg} rounded-2xl sm:mb-5`}>
					<i className={`fas ${icon} text-3xl ${iconColor}`} aria-hidden="true" />
				</div>
				<div className="flex-1 sm:text-center">
					<h3 className="text-xl font-semibold text-slate-900 mb-2">{title}</h3>
					<p className="text-base text-slate-600 leading-relaxed">{description}</p>
				</div>
			</div>
		</div>
	);
}
