/**
 * TabLink — drop-in replacement for react-router-dom <Link> that integrates
 * with the tab system:
 *   • Left-click  → replaceCurrentTab(to) then navigate (via <Link>)
 *   • Right-click → context menu with "Open in New Tab" → openTab(to)
 */
import { Link } from 'react-router-dom';
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { useTabContext } from '../../context/TabContext';

interface TabLinkProps extends React.ComponentPropsWithoutRef<typeof Link> {
	/** Tab label shown in the tab bar (defaults to inferred route label). */
	tabLabel?: string;
}

function TabContextMenu({
	x,
	y,
	onOpenInNewTab,
}: {
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

export default function TabLink({ to, tabLabel, children, onClick, onContextMenu, ...rest }: TabLinkProps): React.ReactElement {
	const { replaceCurrentTab, openTab } = useTabContext();
	const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

	useEffect(() => {
		if (!ctxMenu) return;
		const close = () => setCtxMenu(null);
		document.addEventListener('pointerdown', close, { once: true });
		return () => document.removeEventListener('pointerdown', close);
	}, [ctxMenu]);

	const handleClick = useCallback(
		(e: React.MouseEvent<HTMLAnchorElement>) => {
			const handled = replaceCurrentTab(to.toString(), tabLabel);
			if (handled) e.preventDefault();
			onClick?.(e);
		},
		[to, tabLabel, replaceCurrentTab, onClick],
	);

	const handleContextMenu = useCallback(
		(e: React.MouseEvent<HTMLAnchorElement>) => {
			e.preventDefault();
			setCtxMenu({ x: e.clientX, y: e.clientY });
			onContextMenu?.(e);
		},
		[onContextMenu],
	);

	return (
		<>
			<Link to={to} onClick={handleClick} onContextMenu={handleContextMenu} {...rest}>
				{children}
			</Link>
			{ctxMenu &&
				createPortal(
					<TabContextMenu
						x={ctxMenu.x}
						y={ctxMenu.y}
						onOpenInNewTab={() => {
							openTab(to.toString(), tabLabel);
							setCtxMenu(null);
						}}
					/>,
					document.body,
				)}
		</>
	);
}
