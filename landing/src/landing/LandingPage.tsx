import type React from 'react';
import Nav from './components/Nav';
import Hero from './components/Hero';
import ScrollSection from './components/ScrollSection';
import TrustStrip from './components/TrustStrip';
import WorkflowDemo from '../components/WorkflowDemo';
import Footer from './components/Footer';
import { MockReceiptScannerPreview } from './pages/MockReceiptScannerPage';
import { MockGroceryPricesPreview } from './pages/MockGroceryPricesPage';
import { MockStatisticsPreview } from './pages/MockStatisticsPage';

const GITHUB_URL = process.env.NEXT_PUBLIC_GITHUB_URL ?? 'https://github.com/your-org/monioc';

/* ── Realistic mockup visuals for scroll sections (matching Tauri app) ──── */

function ScannerMockup(): React.ReactElement {
	return <MockReceiptScannerPreview style={{ zoom: '0.8' }} />;
}

function PricesMockup(): React.ReactElement {
	return <MockGroceryPricesPreview style={{ zoom: '0.8' }} />;
}

function StatsMockup(): React.ReactElement {
	return <MockStatisticsPreview style={{ zoom: '0.65' }} />;
}

function OpenSourceSection(): React.ReactElement {
	return (
		<section className="py-14 sm:py-20">
			<div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
				<div className="grid gap-10 sm:grid-cols-2">
					{/* Open Source */}
					<div className="rounded-2xl border border-slate-200 bg-white p-7">
						<div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
							<i className="fab fa-github text-violet-600 text-[18px]" aria-hidden="true" />
						</div>
						<h3 className="mb-2 text-base font-semibold text-slate-900">Fully Open Source</h3>
						<p className="text-sm text-slate-600 leading-relaxed">
							Monioc is MIT-licensed. Read the code, fork it, contribute improvements, or self-host.
						</p>
						<a
							href={GITHUB_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:underline"
						>
							View on GitHub →
						</a>
					</div>

					{/* Statistics Canada data */}
					<div className="rounded-2xl border border-slate-200 bg-white p-7">
						<div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
							<i className="fas fa-database text-emerald-600 text-[16px]" aria-hidden="true" />
						</div>
						<h3 className="mb-2 text-base font-semibold text-slate-900">Statistics Canada</h3>
						<p className="text-sm text-slate-600 leading-relaxed">
							Price comparisons use the <strong>Statistics Canada Monthly Average Retail Prices</strong> dataset.
						</p>
						<a
							href="https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810024501"
							target="_blank"
							rel="noopener noreferrer"
							className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:underline"
						>
							Statistics Canada open data →
						</a>
					</div>
				</div>
			</div>
		</section>
	);
}

export default function LandingPage(): React.ReactElement {
	return (
		<div className="min-h-screen bg-white" style={{ fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif" }}>
			<Nav />
			<Hero />
			{/* Scroll-reveal value proposition sections */}
			<section id="features" className="py-14 sm:py-20">
				<div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 space-y-14 sm:space-y-20">
					<ScrollSection
						eyebrow="Receipt Scanning"
						eyebrowColor="violet"
						title="Scan any receipt."
						description="Drop an image and a local AI model extracts receipt data offline, and privately."
						visual={<ScannerMockup />}
						visualClassName="self-center max-w-none"
					/>
					<ScrollSection
						eyebrow="Price Comparison"
						eyebrowColor="emerald"
						title="Check if you're paying too much."
						description="Compare your grocery prices to official Statistics Canada averages across all provinces. Find out if you're getting a good deal or if you should switch stores."
						visual={<PricesMockup />}
						flip
					/>
					<ScrollSection
						eyebrow="Analytics"
						eyebrowColor="amber"
						title="See where your money really goes."
						description="Interactive charts break down your spending by category, week, or month."
						visual={<StatsMockup />}
					/>
				</div>
			</section>

			<WorkflowDemo />
			<OpenSourceSection />
			<Footer />
		</div>
	);
}
