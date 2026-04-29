import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type React from 'react';

export interface SheetContextMenuProps {
	x: number;
	y: number;
	isMultiSel: boolean;
	onClose: () => void;
	onInsertAbove: () => void;
	onInsertBelow: () => void;
	onAddToEnd: () => void;
	onDelete: () => void;
	onCopy: () => void;
	onDeleteSelected: () => void;
}

/**
 * macOS-style right-click context menu for the receipt spreadsheet.
 * Portalled to `document.body` and clamped to the viewport.
 */
export default function SheetContextMenu({
	x,
	y,
	isMultiSel,
	onClose,
	onInsertAbove,
	onInsertBelow,
	onAddToEnd,
	onDelete,
	onCopy,
	onDeleteSelected,
}: SheetContextMenuProps): React.ReactElement {
	const menuRef = useRef<HTMLDivElement>(null);
	const [pos, setPos] = useState({ left: x, top: y });

	// Clamp to viewport after initial paint so the menu never clips off-screen.
	useEffect(() => {
		const el = menuRef.current;
		if (!el) return;
		const { width, height } = el.getBoundingClientRect();
		setPos({
			left: Math.min(x, window.innerWidth - width - 8),
			top: Math.min(y, window.innerHeight - height - 8),
		});
	}, [x, y]);

	// Dismiss on outside pointer-down or Escape.
	useEffect(() => {
		const onOutside = (e: PointerEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose();
			}
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		document.addEventListener('pointerdown', onOutside, true);
		document.addEventListener('keydown', onKey, true);
		return () => {
			document.removeEventListener('pointerdown', onOutside, true);
			document.removeEventListener('keydown', onKey, true);
		};
	}, [onClose]);

	return createPortal(
		<div
			ref={menuRef}
			style={{ left: pos.left, top: pos.top }}
			className="fixed z-[20000] min-w-[196px] select-none overflow-hidden rounded-[13px] border border-black/[0.07] bg-white/96 py-1 shadow-[0_8px_32px_rgba(0,0,0,0.13),0_2px_8px_rgba(0,0,0,0.07)] backdrop-blur-2xl"
		>
			{isMultiSel ? (
				<>
					<button
						onMouseDown={(e) => e.preventDefault()}
						onClick={() => { onCopy(); onClose(); }}
						className="flex w-full cursor-default items-center gap-2.5 px-3 py-[7px] text-[13px] leading-snug text-slate-700 transition-colors hover:bg-slate-100/80"
					>
						<span className="w-[18px] shrink-0 text-center text-[13px] text-slate-400">⎘</span>
						Copy
					</button>
					<div className="mx-2.5 my-[5px] h-px bg-slate-100" />
					<button
						onMouseDown={(e) => e.preventDefault()}
						onClick={() => { onDeleteSelected(); onClose(); }}
						className="flex w-full cursor-default items-center gap-2.5 px-3 py-[7px] text-[13px] leading-snug text-red-500 transition-colors hover:bg-red-50/70"
					>
						<span className="w-[18px] shrink-0 text-center text-[13px] text-red-400">⊘</span>
						Delete rows
					</button>
				</>
			) : (
				<>
					{([
						{ label: 'Insert row above', icon: '↑', action: onInsertAbove },
						{ label: 'Insert row below', icon: '↓', action: onInsertBelow },
						{ label: 'Add row to end', icon: '+', action: onAddToEnd },
					] as const).map(({ label, icon, action }) => (
						<button
							key={label}
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => { action(); onClose(); }}
							className="flex w-full cursor-default items-center gap-2.5 px-3 py-[7px] text-[13px] leading-snug text-slate-700 transition-colors hover:bg-slate-100/80"
						>
							<span className="w-[18px] shrink-0 text-center text-[13px] text-slate-400">{icon}</span>
							{label}
						</button>
					))}
					<div className="mx-2.5 my-[5px] h-px bg-slate-100" />
					<button
						onMouseDown={(e) => e.preventDefault()}
						onClick={() => { onDelete(); onClose(); }}
						className="flex w-full cursor-default items-center gap-2.5 px-3 py-[7px] text-[13px] leading-snug text-red-500 transition-colors hover:bg-red-50/70"
					>
						<span className="w-[18px] shrink-0 text-center text-[13px] text-red-400">⊘</span>
						Delete row
					</button>
				</>
			)}
		</div>,
		document.body,
	);
}
