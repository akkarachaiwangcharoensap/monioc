import { useState, useCallback, useRef } from 'react';
import type React from 'react';
import type { ReceiptScanRecord, GroceryProductRecord } from '../types';
import MockSidebar from './MockSidebar';
import type { DemoPage } from './MockSidebar';
import MockDashboardPage from './pages/MockDashboardPage';
import MockStatisticsPage from './pages/MockStatisticsPage';
import MockGroceryPricesPage from './pages/MockGroceryPricesPage';
import MockProductsPage from './pages/MockProductsPage';
import MockCategoryPage from './pages/MockCategoryPage';
import MockCategoriesPage from './pages/MockCategoriesPage';
import MockBackupPage from './pages/MockBackupPage';
import MockSettingsPage from './pages/MockSettingsPage';
import MockReceiptScannerPage from './pages/MockReceiptScannerPage';
import MockReceiptEditorPage from './pages/MockReceiptEditorPage';
import MockReceiptsListPage from './pages/MockReceiptsListPage';

export default function DemoAppWindow(): React.ReactElement {
	const [activePage, setActivePage] = useState<DemoPage>('dashboard');
	const [selectedReceipt, setSelectedReceipt] = useState<ReceiptScanRecord | null>(null);
	const [pricesCategory, setPricesCategory] = useState<string | null>(null);
	const [pricesProduct, setPricesProduct] = useState<GroceryProductRecord | null>(null);
	const [returnPage, setReturnPage] = useState<DemoPage>('dashboard');
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [expanded, setExpanded] = useState(false);
	const [transitioning, setTransitioning] = useState(false);
	const transitionLock = useRef(false);

	const navigateTo = useCallback((page: DemoPage, opts?: { receipt?: ReceiptScanRecord; category?: string; product?: GroceryProductRecord }) => {
		if (transitionLock.current) return;
		transitionLock.current = true;
		setTransitioning(true);
		setTimeout(() => {
			if (opts?.receipt !== undefined) setSelectedReceipt(opts.receipt);
			if (opts?.category !== undefined) setPricesCategory(opts.category);
			if (opts?.product !== undefined) setPricesProduct(opts.product);
			setActivePage(page);
			setTimeout(() => {
				setTransitioning(false);
				transitionLock.current = false;
			}, 30);
		}, 140);
	}, []);

	const handleOpenReceipt = useCallback(
		(_receipt: ReceiptScanRecord) => {
			navigateTo('receipts');
		},
		[navigateTo],
	);

	const PAGE_LABELS: Record<DemoPage, string> = {
		dashboard: 'Dashboard',
		receipts: 'Receipts',
		scanner: 'Scan Receipts',
		statistics: 'Statistics',
		prices: 'Prices',
		'prices-category': 'Prices',
		'prices-product': 'Prices',
		categories: 'Categories',
		backup: 'Backup & Restore',
		settings: 'Settings',
	};

	const renderPage = () => {
		switch (activePage) {
			case 'dashboard':
				return (
					<MockDashboardPage
						onOpenReceipt={handleOpenReceipt}
						onNavigate={(p) => navigateTo(p as DemoPage)}
					/>
				);
			case 'receipts':
				return (
					<MockReceiptsListPage
						onOpenReceipt={handleOpenReceipt}
						onNavigate={(p) => navigateTo(p as DemoPage)}
					/>
				);
			case 'scanner':
				return (
					<MockReceiptScannerPage
						onNavigate={(p) => navigateTo(p as DemoPage)}
					/>
				);
			case 'statistics':
				return <MockStatisticsPage />;
			case 'prices':
				return <MockProductsPage onNavigate={navigateTo} />;
			case 'prices-category':
				return <MockCategoryPage category={pricesCategory ?? ''} onNavigate={navigateTo} />;
			case 'prices-product':
				return <MockGroceryPricesPage product={pricesProduct} category={pricesCategory ?? ''} onNavigate={navigateTo} />;
			case 'categories':
				return <MockCategoriesPage />;
			case 'backup':
				return <MockBackupPage />;
			case 'settings':
				return <MockSettingsPage />;
			default:
				return null;
		}
	};

	return (
		<div className="relative">
			{/* Clipping wrapper — animates from collapsed preview to full height */}
			<div
				className="relative overflow-hidden rounded-2xl"
				style={{
					maxHeight: expanded ? '680px' : '252px',
					transition: 'max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
				}}
			>
				{/* zoom:0.8 — reduced text size and padding vs real app */}
				<div style={{ width: '1000px', zoom: 0.8, marginLeft: 'auto', marginRight: 'auto' }}>
					<div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden shadow-sm mb-1">
						{/* macOS title bar — matches real Tauri app layout */}
						<div className="flex-shrink-0 flex items-stretch select-none" style={{ height: 40, backgroundColor: '#f7f7f6' }}>
							{/* Left: sidebar-width zone with traffic lights */}
							<div className={`${sidebarCollapsed ? 'w-20' : 'w-48'} flex-shrink-0 border-r border-slate-200 transition-[width] duration-200 flex items-center px-4 gap-1.5`}>
								<span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
								<span className="h-3 w-3 rounded-full bg-[#febc2e]" />
								<span className="h-3 w-3 rounded-full bg-[#28c840]" />
							</div>
							{/* Right: toggle + nav + active page tab */}
							<div className="flex flex-1 items-center min-w-0 border-b border-slate-200 px-2 gap-1">
								<button
									type="button"
									onClick={() => setSidebarCollapsed((v) => !v)}
									className={`h-6 w-6 inline-flex items-center justify-center rounded-md transition-colors cursor-pointer ${!sidebarCollapsed ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
									aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
								>
									<i className="fa-solid fa-table-columns" style={{ fontSize: 11 }} aria-hidden="true" />
								</button>
								<button className="h-6 w-6 inline-flex items-center justify-center rounded-md text-slate-300 cursor-default" type="button" disabled>
									<i className="fas fa-chevron-left" style={{ fontSize: 10 }} aria-hidden="true" />
								</button>
								<button className="h-6 w-6 inline-flex items-center justify-center rounded-md text-slate-300 cursor-default" type="button" disabled>
									<i className="fas fa-chevron-right" style={{ fontSize: 10 }} aria-hidden="true" />
								</button>
								{/* Active tab */}
								<div className="ml-1 flex items-center gap-1.5 px-3 bg-white text-slate-800 ring-1 ring-slate-200 rounded-md flex-shrink-0" style={{ height: 28, fontSize: 13, fontWeight: 500 }}>
									{PAGE_LABELS[activePage]}
								</div>
							</div>
						</div>

						{/* Body: sidebar + page */}
						<div className="flex" style={{ height: 820 }}>
							<MockSidebar activePage={activePage} onNavigate={(p) => navigateTo(p)} collapsed={sidebarCollapsed} />
							<div className="flex-1 overflow-hidden">
								<div
									className="h-full"
									style={{
										overflowY: expanded ? 'auto' : 'hidden',
										opacity: transitioning ? 0 : 1,
										transform: transitioning ? 'translateY(-5px)' : 'translateY(0)',
										transition: 'opacity 200ms ease, transform 200ms ease',
									}}
								>
									{renderPage()}
								</div>
							</div>
						</div>
					</div>
				</div>
				{/* Bottom gradient fade — visible only when collapsed */}
				<div
					className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
					style={{
						background: 'linear-gradient(to top, white 30%, transparent)',
						opacity: expanded ? 0 : 1,
						transition: 'opacity 0.3s ease',
					}}
				/>
			</div>

			<div className="mt-4 text-center px-4">
				<p className="mx-auto max-w-lg text-[11px] text-slate-500">
					This demo uses mock data for visual purposes only and may be inaccurate. It is not the final product.
				</p>
			</div>

			{/* Expand / collapse CTA */}
			<div className="mt-5 flex justify-center">
				<button
					type="button"
					onClick={() => setExpanded((v) => !v)}
					className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
				>
					{expanded ? (
						<>
							<i className="fas fa-chevron-up text-[10px]" aria-hidden="true" />
							Collapse
						</>
					) : (
						<>
							<i className="fas fa-chevron-down text-[10px]" aria-hidden="true" />
							Try the demo
						</>
					)}
				</button>
			</div>
		</div>
	);
}
