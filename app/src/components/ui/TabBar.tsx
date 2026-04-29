import React from 'react';
import { useTabContext } from '../../context/TabContext';

interface TabGhost {
	label: string;
	x: number;
	y: number;
	width: number;
	offsetX: number;
	offsetY: number;
}

/**
 * Horizontal tab strip in the title bar. Supports pointer-based drag-to-reorder
 * with a visible drop-line indicator (same pattern as CategoriesPage).
 */
export default function TabBar(): React.JSX.Element {
	const { tabs, activeTabId, switchTab, closeTab, reorderTabs, pendingCloseConfirm, confirmClose, cancelClose, workingTabs, openTab } = useTabContext();

	// ── Context menu state ────────────────────────────────────────────────────
	const [ctxMenu, setCtxMenu] = React.useState<{ tabId: string; x: number; y: number } | null>(null);

	// Close context menu on any outside click or Escape.
	React.useEffect(() => {
		if (!ctxMenu) return;
		const close = () => setCtxMenu(null);
		const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
		window.addEventListener('pointerdown', close);
		window.addEventListener('keydown', onKey);
		return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', onKey); };
	}, [ctxMenu]);

	const handleContextMenu = React.useCallback((e: React.MouseEvent, tabId: string) => {
		e.preventDefault();
		setCtxMenu({ tabId, x: e.clientX, y: e.clientY });
	}, []);

	// Index of the tab being dragged (-1 = none)
	const [dragIdx, setDragIdx] = React.useState<number>(-1);
	// The insert position (0…tabs.length) shown by the drop line
	const [dropPos, setDropPos] = React.useState<number>(-1);
	// Ghost element that follows the cursor
	const [ghost, setGhost] = React.useState<TabGhost | null>(null);
	const containerRef = React.useRef<HTMLDivElement>(null);

	/** Returns the insert index (0…tabs.length) based on the pointer's clientX. */
	const getInsertPos = React.useCallback((clientX: number): number => {
		const container = containerRef.current;
		if (!container) return 0;
		const tabEls = Array.from(container.querySelectorAll('[data-tab-idx]')) as HTMLElement[];
		for (let i = 0; i < tabEls.length; i++) {
			const r = tabEls[i].getBoundingClientRect();
			if (clientX < r.left + r.width / 2) return i;
		}
		return tabEls.length;
	}, []);

	// Minimum pointer travel (px) before a press is treated as a drag.
	// Below this threshold a press+release is a plain click and routes to onClick.
	const DRAG_THRESHOLD = 4;

	const handleTabPointerDown = React.useCallback((
		e: React.PointerEvent<HTMLDivElement>,
		idx: number,
	) => {
		// Only drag on primary button; let close-button clicks pass through.
		if (e.button !== 0) return;
		const target = e.target as HTMLElement;
		if (target.closest('button')) return;

		// Capture the pointer early so we keep receiving move events even if the
		// cursor leaves the element — but do NOT call e.preventDefault() here.
		// Calling preventDefault() on pointerdown suppresses the click event in
		// WebKit (Tauri's WebView), so plain tab clicks would never fire onClick.
		e.currentTarget.setPointerCapture(e.pointerId);

		const startX = e.clientX;
		const startY = e.clientY;
		const rect = e.currentTarget.getBoundingClientRect();
		const offsetX = startX - rect.left;
		const offsetY = startY - rect.top;

		// Whether drag mode has been armed (movement exceeded threshold).
		let dragArmed = false;

		const armDrag = (clientX: number, clientY: number) => {
			dragArmed = true;
			setDragIdx(idx);
			setDropPos(getInsertPos(clientX));
			setGhost({
				label: tabs[idx]?.label ?? '',
				x: clientX - offsetX,
				y: clientY - offsetY,
				width: rect.width,
				offsetX,
				offsetY,
			});
		};

		const onMove = (ev: PointerEvent) => {
			if (!dragArmed) {
				const dx = ev.clientX - startX;
				const dy = ev.clientY - startY;
				if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
					armDrag(ev.clientX, ev.clientY);
				}
				return;
			}
			setDropPos(getInsertPos(ev.clientX));
			setGhost((prev) =>
				prev ? { ...prev, x: ev.clientX - prev.offsetX, y: ev.clientY - prev.offsetY } : null,
			);
		};

		const onUp = (ev: PointerEvent) => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			window.removeEventListener('pointercancel', onUp);

			// Plain click (no threshold movement) — let the div's onClick handle it.
			if (!dragArmed) return;

			const insertAt = getInsertPos(ev.clientX);
			const finalIdx = insertAt > idx ? insertAt - 1 : insertAt;
			setDragIdx(-1);
			setDropPos(-1);
			setGhost(null);
			if (finalIdx !== idx) reorderTabs(idx, finalIdx);
		};

		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('pointercancel', onUp);
	}, [getInsertPos, reorderTabs, tabs]);

	return (
		<>
			<div
				ref={containerRef}
				className="flex items-center flex-1 min-w-0 overflow-x-auto no-scrollbar h-full px-1"
			>
				{tabs.map((tab, idx) => {
					const active = tab.id === activeTabId;
					const isDragging = dragIdx === idx;
					// Show drop line to the LEFT of this tab
					const showLineBefore = dropPos === idx && dragIdx !== -1 && dragIdx !== idx && dropPos !== dragIdx + 1;
					// Show drop line to the RIGHT of last tab
					const isLast = idx === tabs.length - 1;
					const showLineAfter = isLast && dropPos === tabs.length && dragIdx !== -1 && dragIdx !== tabs.length - 1;

					return (
						<React.Fragment key={tab.id}>
							{/* Vertical drop indicator ─ before this tab */}
							{showLineBefore && (
								<div className="w-0.5 h-5 bg-violet-500 rounded-full mx-0.5 flex-shrink-0" />
							)}

							<div
								data-tab-idx={idx}
								onPointerDown={(e) => handleTabPointerDown(e, idx)}
								onContextMenu={(e) => handleContextMenu(e, tab.id)}
								className={`group flex items-center gap-1.5 px-3 h-7 text-[13px] font-medium rounded-md cursor-pointer transition-all flex-shrink-0 max-w-[220px] select-none mx-0.5 ${
									active
										? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200'
										: 'text-slate-500 hover:text-slate-800 hover:bg-white/70'
								} ${isDragging ? 'opacity-30 scale-95' : ''}`}
								onClick={() => { if (dragIdx === -1) switchTab(tab.id); }}
								onKeyDown={(e) => { if (e.key === 'Enter') switchTab(tab.id); }}
								role="tab"
								aria-selected={active}
								tabIndex={0}
							>
								<span className="truncate">{tab.label}</span>
								{workingTabs.has(tab.id) && (
									<span
										className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse"
										aria-label="Processing"
									/>
								)}
							{tabs.length > 1 && (
									<button
										type="button"
										onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
										className={`flex-shrink-0 inline-flex items-center justify-center w-4 h-4 rounded transition-colors ${
											active
												? 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'
												: 'text-slate-300 hover:text-slate-500 hover:bg-slate-200 opacity-0 group-hover:opacity-100'
										}`}
										aria-label={`Close ${tab.label}`}
									>
										<i className="fas fa-xmark text-[9px]" aria-hidden="true" />
									</button>
								)}
							</div>

							{/* Vertical drop indicator ─ after last tab */}
							{showLineAfter && (
								<div className="w-0.5 h-5 bg-violet-500 rounded-full mx-0.5 flex-shrink-0" />
							)}
						</React.Fragment>
					);
				})}
			</div>

			{/* Floating ghost tab that follows the cursor while dragging */}
			{ghost && (
				<div
					aria-hidden="true"
					style={{
						position: 'fixed',
						left: ghost.x,
						top: ghost.y,
						width: ghost.width,
						pointerEvents: 'none',
						zIndex: 9999,
						transform: 'rotate(1deg) scale(1.04)',
					}}
					className="flex items-center gap-1.5 px-3 h-7 text-[13px] font-medium rounded-md bg-white text-slate-800 shadow-lg ring-1 ring-violet-300 opacity-90 select-none"
				>
					<span className="truncate">{ghost.label}</span>
				</div>
			)}

			{/* Right-click context menu */}
			{ctxMenu && (() => {
				const tab = tabs.find((t) => t.id === ctxMenu.tabId);
				if (!tab) return null;
				return (
					<div
						style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 9999 }}
						className="min-w-[160px] rounded-lg bg-white shadow-xl ring-1 ring-slate-200 py-1 text-[13px]"
						role="menu"
						onPointerDown={(e) => e.stopPropagation()}
					>
						<button
							type="button"
							role="menuitem"
							className="w-full text-left px-3 py-1.5 hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
							onClick={() => { openTab(tab.path, tab.label); setCtxMenu(null); }}
						>
							Open in new tab
						</button>
						{tabs.length > 1 && (
							<button
								type="button"
								role="menuitem"
								className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600 transition-colors cursor-pointer"
								onClick={() => { closeTab(tab.id); setCtxMenu(null); }}
							>
								Close tab
							</button>
						)}
					</div>
				);
			})()}

			{/* Tab close confirmation dialog */}
			{pendingCloseConfirm && (
				<div
					className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/30 backdrop-blur-[2px]"
					role="dialog"
					aria-modal="true"
					aria-labelledby="tab-close-dialog-title"
				>
					<div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4">
						<div className="flex items-start gap-3">
							<span className="flex-shrink-0 w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">
								<i className="fas fa-triangle-exclamation text-amber-500" aria-hidden="true" />
							</span>
							<div>
								<h2 id="tab-close-dialog-title" className="text-[15px] font-semibold text-slate-800 leading-snug">
									Close &ldquo;{pendingCloseConfirm.tabLabel}&rdquo;?
								</h2>
								<p className="mt-1 text-[13px] text-slate-500 leading-relaxed">
									A receipt is still being scanned or categorised. Closing this tab will cancel the work in progress.
								</p>
							</div>
						</div>
						<div className="flex justify-end gap-2 pt-1">
							<button
								type="button"
								onClick={cancelClose}
								className="px-4 py-2 rounded-lg text-[13px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
							>
								Keep tab open
							</button>
							<button
								type="button"
								onClick={confirmClose}
								className="px-4 py-2 rounded-lg text-[13px] font-medium text-white bg-red-500 hover:bg-red-600 transition-colors cursor-pointer"
							>
								Close and cancel
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}
