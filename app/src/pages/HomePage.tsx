import TabLink from '../components/ui/TabLink';
import FeatureCard from '../components/ui/FeatureCard';
import type React from 'react';
import { APP_NAME, ROUTES } from '../constants';
import { HOME_FEATURES } from './home-data';

/**
 * HomePage — landing page with hero section and data-driven feature grid.
 */
export default function HomePage(): React.ReactElement {
	return (
		<div className="min-h-screen bg-white">
			{/* Hero Section */}
			<div className="mx-auto max-w-4xl px-4 pt-14 pb-10 sm:pt-20 sm:pb-14">
				<div className="max-w-2xl mx-auto text-center">
					<div className="inline-flex items-center justify-center w-34 h-34 mb-8 bg-gray-100 rounded-3xl">
						<img src="/monioc-app.png" alt={`${APP_NAME} logo`} className="w-22 h-22 object-contain" />
					</div>
					<h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold text-slate-900 mb-5 leading-tight tracking-tight">
						{APP_NAME}
						<br />
						Price Tracker
					</h1>

					<p className="text-xl sm:text-2xl text-slate-600 mb-12 max-w-xl mx-auto leading-relaxed font-normal">
						Compare your grocery prices with official Statistics Canada data
					</p>

					<TabLink
						to={ROUTES.PRODUCTS}
						className="inline-flex items-center justify-center w-full sm:w-auto px-10 py-4 bg-emerald-500 text-white rounded-full text-lg font-medium hover:bg-emerald-600 active:bg-emerald-700 active:scale-[0.98] transition-all min-h-[56px] gap-2"
					>
						Browse Products
						<i className="fas fa-arrow-right" aria-hidden="true" />
					</TabLink>
				</div>
			</div>

			{/* Feature Cards — rendered from data */}
			<div className="mx-auto max-w-4xl px-4 pb-16">
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
					{HOME_FEATURES.map((feature) => (
						<FeatureCard key={feature.title} {...feature} />
					))}
				</div>
			</div>
		</div>
	);
}
