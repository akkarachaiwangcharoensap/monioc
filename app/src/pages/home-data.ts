import type { FeatureCardData } from '../components/ui/FeatureCard';

/**
 * Data-driven feature list for the home page and future landing page.
 */
export const HOME_FEATURES: readonly FeatureCardData[] = [
	{
		icon: 'fa-chart-line',
		iconBg: 'bg-blue-100',
		iconColor: 'text-blue-600',
		title: 'Official Data',
		description: 'Compare with Statistics Canada pricing data',
	},
	{
		icon: 'fa-map-marker-alt',
		iconBg: 'bg-red-100',
		iconColor: 'text-red-600',
		title: 'All Provinces',
		description: 'See regional price differences across Canada',
	},
	{
		icon: 'fa-piggy-bank',
		iconBg: 'bg-emerald-100',
		iconColor: 'text-emerald-600',
		title: 'Save Money',
		description: 'Make informed decisions about your groceries',
	},
];
