import { NavLink } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { APP_NAME, ROUTES } from '../constants';
import { TauriApi } from '../services/api';
import { useTabContext } from '../context/TabContext';

interface NavItem {
	to: string;
	label: string;
	icon: string;
	end?: boolean;
	isCta?: boolean;
}

const PRIMARY_NAV: NavItem[] = [
	{ to: ROUTES.DASHBOARD, label: 'Dashboard', icon: 'fas fa-home', end: true },
	{ to: ROUTES.RECEIPTS, label: 'Receipts', icon: 'fas fa-receipt' },
	{ to: ROUTES.STATISTICS, label: 'Statistics', icon: 'fas fa-chart-line' },
	{ to: ROUTES.PRODUCTS, label: 'Prices', icon: 'fas fa-chart-bar' },
	{ to: ROUTES.CATEGORIES, label: 'Categories', icon: 'fas fa-tags' },
];

const SCAN_RECEIPT_ACTION: NavItem = {
	to: ROUTES.RECEIPT_SCANNER_NEW,
	label: 'Scan Receipt',
	icon: 'fas fa-camera',
	isCta: true,
};

function NavContextMenu({ x, y, onOpenInNewTab }: {
	x: number;
	y: number;
	onOpenInNewTab: () => void;
}): React.ReactElement {
	const isDev = import.meta.env.DEV;
	return (
		<div
			style={{ position: 'fixed', left: x, top: y, zIndex: 9999 }}
			className="bg-white rounded-lg shadow-xl border border-slate-200/80 py-1 min-w-[190px]"
			onPointerDown={(e) => e.stopPropagation()}
		>
			<button
				type="button"
				className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
				onClick={onOpenInNewTab}
			>
				<i className="fas fa-arrow-up-right-from-square text-[11px] text-slate-400 w-4 text-center" aria-hidden="true" />
				Open in New Tab
			</button>
			{isDev && (
				<>
					<div className="my-1 border-t border-slate-100" />
					<button
						type="button"
						className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 transition-colors"
						onClick={() => void invoke('dev_open_devtools')}
					>
						<i className="fas fa-bug text-[11px] text-slate-400 w-4 text-center" aria-hidden="true" />
						Inspect Element
					</button>
				</>
			)}
		</div>
	);
}

function NavItemLink({ item, collapsed, forceActive }: { item: NavItem; collapsed: boolean; forceActive?: boolean }): React.ReactElement {
	const { replaceCurrentTab, openTab } = useTabContext();
	const [ctxMenu, setCtxMenu] = React.useState<{ x: number; y: number } | null>(null);

	React.useEffect(() => {
		if (!ctxMenu) return;
		const close = () => setCtxMenu(null);
		document.addEventListener('pointerdown', close, { once: true });
		return () => document.removeEventListener('pointerdown', close);
	}, [ctxMenu]);

	const handleClick = React.useCallback(() => {
		replaceCurrentTab(item.to);
	}, [item.to, replaceCurrentTab]);

	const handleContextMenu = React.useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		setCtxMenu({ x: e.clientX, y: e.clientY });
	}, []);

	if (item.isCta) {
		return (
			<>
				<NavLink
					to={item.to}
					end
					title={collapsed ? item.label : undefined}
					onClick={handleClick}
					onContextMenu={handleContextMenu}
					className={({ isActive }) =>
						`flex items-center ${collapsed ? 'justify-center' : 'gap-3'} rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${isActive
							? 'bg-violet-600 text-white shadow-sm ring-1 ring-violet-500'
							: 'bg-violet-100 text-violet-700 hover:bg-violet-200'
						}`
					}
				>
					<i className={`${item.icon} w-4 text-center ${collapsed ? 'text-[16px]' : 'text-[13px]'}`} aria-hidden="true" />
					{!collapsed && item.label}
				</NavLink>
				{ctxMenu && createPortal(
					<NavContextMenu
						x={ctxMenu.x} y={ctxMenu.y}
						onOpenInNewTab={() => { openTab(item.to); setCtxMenu(null); }}
					/>,
					document.body
				)}
			</>
		);
	}

	return (
		<>
			<NavLink
				to={item.to}
				end={item.end}
				title={collapsed ? item.label : undefined}
				onClick={handleClick}
				onContextMenu={handleContextMenu}
				className={({ isActive }) =>
					`flex items-center ${collapsed ? 'justify-center' : 'gap-3'} rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${(isActive || forceActive)
						? 'bg-violet-600 text-white'
						: 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
					}`
				}
			>
				{({ isActive }) => (
					<>
						<i
							className={`${item.icon} w-4 text-center ${collapsed ? 'text-[16px]' : 'text-[13px]'} ${(isActive || forceActive) ? 'text-white' : 'text-slate-400'}`}
							aria-hidden="true"
						/>
						{!collapsed && item.label}
					</>
				)}
			</NavLink>
			{ctxMenu && createPortal(
				<NavContextMenu
					x={ctxMenu.x} y={ctxMenu.y}
					onOpenInNewTab={() => { openTab(item.to); setCtxMenu(null); }}
				/>,
				document.body
			)}
		</>
	);
}

/**
 * Desktop sidebar navigation with collapse/expand support.
 */
export default function SideNav({
	collapsed,
	onOpenTutorial,
}: {
	collapsed: boolean;
	onOpenTutorial: () => void;
}): React.ReactElement {
	const [version, setVersion] = useState<string | null>(null);

	useEffect(() => {
		TauriApi.getAppVersion().then(setVersion).catch(() => null);
	}, []);

	return (
		<aside
			className={`${collapsed ? 'w-22' : 'w-48'} relative flex-shrink-0 flex flex-col h-full border-r border-slate-200 transition-all duration-200`}
			style={{ backgroundColor: '#f7f7f6' }}
			aria-label="Main navigation"
		>
			{/* ── Brand ─────────────────────────────────────────────── */}
			<div className={`${collapsed ? 'px-2 py-2' : 'px-4 py-2.5'}`}>
				<div className="flex items-center justify-center">
					<NavLink
						to="/"
						end
						title={collapsed ? APP_NAME : undefined}
						className={`flex items-center ${collapsed ? 'justify-center w-10 h-10' : 'gap-2.5'} group focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded-lg`}
						aria-label={`${APP_NAME} home`}
					>
						<img
							src="/monioc-app.png"
							alt=""
							aria-hidden="true"
							className="w-8 h-8 object-contain flex-shrink-0"
						/>
						{!collapsed && <span className="text-[14px] font-bold text-slate-900 leading-tight">
							{APP_NAME}
						</span>}
					</NavLink>
				</div>
			</div>

			{/* ── Primary nav ───────────────────────────────────────── */}
			<nav className="flex-1 min-h-0 px-2 pt-1.5 pb-3 space-y-0.5 overflow-y-auto">
				{PRIMARY_NAV.map((item) => (
					<NavItemLink
						key={item.to}
						item={item}
						collapsed={collapsed}
					/>
				))}

				<div className="mt-4 pt-4">
					{!collapsed && (
						<p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
							Action
						</p>
					)}
					<NavItemLink item={SCAN_RECEIPT_ACTION} collapsed={collapsed} />
				</div>
			</nav>

			{/* ── Bottom nav ─────────────────────────────────────────── */}
			<div className="flex-shrink-0 border-t-2 border-slate-200 px-2 pt-2 pb-3 space-y-0.5">
				<NavItemLink
					item={{ to: ROUTES.BACKUP, label: 'Backup', icon: 'fas fa-hard-drive' }}
					collapsed={collapsed}
				/>
				<NavItemLink
					item={{ to: ROUTES.SETTINGS, label: 'Settings', icon: 'fas fa-cog' }}
					collapsed={collapsed}
				/>
				<button
					type="button"
					onClick={onOpenTutorial}
					title={collapsed ? 'Help & Tutorial' : undefined}
					className={`flex w-full items-center ${collapsed ? 'justify-center' : 'gap-3'} rounded-xl px-3 py-2.5 text-sm font-medium transition-colors text-slate-600 hover:bg-slate-200/60 hover:text-slate-900`}
					aria-label="Open tutorial"
				>
					<i className={`fas fa-circle-question w-4 text-center ${collapsed ? 'text-[16px]' : 'text-[13px]'} text-slate-400`} aria-hidden="true" />
					{!collapsed && 'Help'}
				</button>
				{version && !collapsed && (
					<p className="px-3 pt-2 pb-1 text-[10px] text-slate-400 tabular-nums select-none">
						v{version}
					</p>
				)}
			</div>

		</aside>
	);
}
