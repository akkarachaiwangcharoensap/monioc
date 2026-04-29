/**
 * NavButton — a <button> that navigates via the tab system.
 *
 * Mirrors TabLink behaviour for button-based navigation:
 *   • Left-click  → replaceCurrentTab(to) then navigate(to)
 *   • Right-click → context menu "Open in New Tab" → openTab(to)
 */
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { useTabContext } from '../../context/TabContext';

interface NavButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
	to: string;
	tabLabel?: string;
}

function NavContextMenu({
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

export default function NavButton({ to, tabLabel, children, onContextMenu, ...rest }: NavButtonProps): React.ReactElement {
	const navigate = useNavigate();
	const { replaceCurrentTab, openTab } = useTabContext();
	const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

	useEffect(() => {
		if (!ctxMenu) return;
		const close = () => setCtxMenu(null);
		document.addEventListener('pointerdown', close, { once: true });
		return () => document.removeEventListener('pointerdown', close);
	}, [ctxMenu]);

	const handleClick = useCallback(() => {
		const handled = replaceCurrentTab(to, tabLabel);
		if (!handled) void navigate(to);
	}, [to, tabLabel, replaceCurrentTab, navigate]);

	const handleContextMenu = useCallback(
		(e: React.MouseEvent<HTMLButtonElement>) => {
			e.preventDefault();
			setCtxMenu({ x: e.clientX, y: e.clientY });
			onContextMenu?.(e);
		},
		[onContextMenu],
	);

	return (
		<>
			<button type="button" onClick={handleClick} onContextMenu={handleContextMenu} {...rest}>
				{children}
			</button>
			{ctxMenu &&
				createPortal(
					<NavContextMenu
						x={ctxMenu.x}
						y={ctxMenu.y}
						onOpenInNewTab={() => {
							openTab(to, tabLabel);
							setCtxMenu(null);
						}}
					/>,
					document.body,
				)}
		</>
	);
}
