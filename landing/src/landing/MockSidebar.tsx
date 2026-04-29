import Image from 'next/image';
import type React from 'react';

export type DemoPage = 'dashboard' | 'receipts' | 'scanner' | 'statistics' | 'prices' | 'prices-category' | 'prices-product' | 'categories' | 'backup' | 'settings';

interface NavEntry {
	id: string;
	label: string;
	icon: string;
	clickable: boolean;
	page?: DemoPage;
	isCta?: boolean;
}

const PRIMARY_NAV: NavEntry[] = [
	{ id: 'dashboard',  label: 'Dashboard',   icon: 'fas fa-home',       clickable: true,  page: 'dashboard'  },
	{ id: 'receipts',   label: 'Receipts',    icon: 'fas fa-receipt',    clickable: true,  page: 'receipts'   },
	{ id: 'statistics', label: 'Statistics',  icon: 'fas fa-chart-line', clickable: true,  page: 'statistics' },
	{ id: 'prices',     label: 'Prices',      icon: 'fas fa-chart-bar',  clickable: true,  page: 'prices'     },
	{ id: 'categories', label: 'Categories',  icon: 'fas fa-tags',       clickable: true,  page: 'categories' },
];

const SCAN_ACTION: NavEntry = {
	id: 'scanner', label: 'Scan Receipt', icon: 'fas fa-camera', clickable: true, page: 'scanner', isCta: true,
};

const BOTTOM_NAV: NavEntry[] = [
	{ id: 'backup',   label: 'Backup',   icon: 'fas fa-hard-drive',      clickable: true,  page: 'backup'   },
	{ id: 'settings', label: 'Settings', icon: 'fas fa-cog',             clickable: true,  page: 'settings' },
	{ id: 'help',     label: 'Help',     icon: 'fas fa-circle-question', clickable: false },
];

interface Props {
	activePage: DemoPage;
	onNavigate: (page: DemoPage) => void;
	collapsed?: boolean;
}

export default function MockSidebar({ activePage, onNavigate, collapsed = false }: Props): React.ReactElement {
	function navItemClass(entry: NavEntry): string {
		const isActive = entry.page != null && (
			activePage === entry.page ||
			(entry.page === 'prices' && (activePage === 'prices-category' || activePage === 'prices-product'))
		);
		const base = `w-full flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} rounded-xl py-2.5 text-sm font-medium`;
		if (entry.isCta) {
			return isActive
				? `${base} transition-colors bg-violet-600 text-white ring-1 ring-violet-500`
				: `${base} transition-colors bg-violet-100 text-violet-700 hover:bg-violet-200 cursor-pointer`;
		}
		if (isActive) {
			return `${base} transition-colors bg-violet-600 text-white cursor-pointer`;
		}
		if (!entry.clickable) {
			return `${base} text-slate-600 cursor-default select-none`;
		}
		return `${base} transition-colors text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 cursor-pointer`;
	}

	function iconClass(entry: NavEntry): string {
		const isActive = entry.page != null && (
			activePage === entry.page ||
			(entry.page === 'prices' && (activePage === 'prices-category' || activePage === 'prices-product'))
		);
		const size = collapsed ? 'text-[16px]' : 'text-[13px]';
		if (isActive) return `${entry.icon} w-4 text-center ${size} text-white`;
		if (entry.isCta) return `${entry.icon} w-4 text-center ${size} text-violet-700`;
		return `${entry.icon} w-4 text-center ${size} text-slate-400`;
	}

	function renderItem(entry: NavEntry): React.ReactElement {
		const cls = navItemClass(entry);
		const icoClass = iconClass(entry);
		const content = (
			<>
				<i className={icoClass} aria-hidden="true" />
				{!collapsed && <span className="text-[13px]">{entry.label}</span>}
			</>
		);
		if (entry.clickable && entry.page) {
			return (
				<button key={entry.id} type="button" onClick={() => onNavigate(entry.page!)} className={cls} title={collapsed ? entry.label : undefined}>
					{content}
				</button>
			);
		}
		return (
			<div key={entry.id} className={cls}>
				{content}
			</div>
		);
	}

	return (
		<aside
			className={`${collapsed ? 'w-20' : 'w-48'} flex-shrink-0 flex flex-col h-full border-r border-slate-200 transition-all duration-200`}
			style={{ backgroundColor: '#f7f7f6' }}
		>
			{/* Brand */}
			<div className={collapsed ? 'px-2 py-2' : 'px-4 py-2.5'}>
				<div className="flex items-center justify-center">
					<Image
						src="/monioc-app.png"
						alt="Monioc logo"
						width={32}
						height={32}
						className="w-8 h-8 object-contain flex-shrink-0"
					/>
					{!collapsed && (
						<span className="ml-2.5 text-[14px] font-bold text-slate-900 leading-tight">
							Monioc
						</span>
					)}
				</div>
			</div>

			{/* Primary nav */}
			<nav className="flex-1 min-h-0 px-2 pt-1.5 pb-3 space-y-0.5 overflow-y-auto">
				{PRIMARY_NAV.map(renderItem)}
				<div className="mt-4 pt-4">
					{!collapsed && (
						<p className="px-3 pb-2 text-[10px] text-left font-semibold uppercase tracking-wider text-slate-400">
							Action
						</p>
					)}
					{renderItem(SCAN_ACTION)}
				</div>
			</nav>

			{/* Bottom nav */}
			<div className="flex-shrink-0 border-t-2 border-slate-200 px-2 pt-2 pb-3 space-y-0.5">
				{BOTTOM_NAV.map(renderItem)}
				{!collapsed && (
					<p className="px-3 pt-2 pb-1 text-[10px] text-slate-400 tabular-nums select-none">
						v0.1.0
					</p>
				)}
			</div>
		</aside>
	);
}
