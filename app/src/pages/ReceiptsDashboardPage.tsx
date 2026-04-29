import { useEffect, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type React from 'react';
import { useSearchParams } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { stat } from '@tauri-apps/plugin-fs';
import { confirm as confirmDialog } from '@tauri-apps/plugin-dialog';
import { TauriApi } from '../services/api';
import { parseTauriError } from '../services/errors';
import { useCategoriesContext as useCategories } from '../context/CategoriesContext';
import { QUERY_PARAMS } from '../constants';
import { useTabContext } from '../context/TabContext';

import { useReceiptScans } from '../hooks/receipt-scanner/useReceiptScans';
import { useReceiptCache } from '../context/ReceiptCacheContext';

import SearchInput from '../components/ui/SearchInput';
import Pagination from '../components/ui/Pagination';
import EmptyState from '../components/ui/EmptyState';
import ErrorBanner from '../components/ui/ErrorBanner';
import ModelDownloadBanner from '../components/receipt-scanner/ModelDownloadBanner';
import DateRangeFilter, { type DateRangeValue } from '../components/receipts/DateRangeFilter';
import ReceiptCard from '../components/receipts/ReceiptCard';
import BulkActionBar from '../components/receipts/BulkActionBar';
import {
	getReceiptDisplayName as getReceiptDisplayLabel,
	getReceiptFallbackName,
} from '../utils/receipt-scanner/receiptSession';
import type { ReceiptScanRecord } from '../types';
import { parseSqliteDate } from '../utils';

const PAGE_SIZE = 5;

function getReceiptDisplayName(record: ReceiptScanRecord): string {
	return getReceiptDisplayLabel(record.displayName, record.imagePath);
}

function SkeletonCard(): React.ReactElement {
	return (
		<div className="rounded-3xl border border-slate-200 p-4 animate-pulse">
			<div className="flex items-start gap-4">
				<div className="w-16 h-20 sm:w-20 sm:h-24 rounded-2xl bg-slate-100 flex-shrink-0" />
				<div className="flex-1 space-y-2 py-1">
					<div className="h-4 w-36 bg-slate-200 rounded" />
					<div className="h-3 w-24 bg-slate-100 rounded" />
					<div className="mt-3 flex gap-2">
						<div className="h-5 w-16 bg-slate-100 rounded-full" />
						<div className="h-5 w-20 bg-slate-100 rounded-full" />
						<div className="h-5 w-24 bg-slate-100 rounded-full" />
					</div>
				</div>
			</div>
		</div>
	);
}

export default function ReceiptsDashboardPage(): React.ReactElement {
	const { openTab, openReceiptEditorTab } = useTabContext();
	const { getCategoryColor } = useCategories();

	// ── State ────────────────────────────────────────────────────────────────

	// Data — from cache (push-based; updated by Tauri events)
	const { savedScans: records, isListLoading: isLoading } = useReceiptScans();
	const { applyOptimistic, applyOptimisticDelete, getReceipt, forceReload } = useReceiptCache();

	// Filters
	const [query, setQuery] = useState('');
	const [searchParams] = useSearchParams();
	const [dateRange, setDateRange] = useState<DateRangeValue>(() => {
		const from = searchParams.get(QUERY_PARAMS.DATE_FROM);
		const to = searchParams.get(QUERY_PARAMS.DATE_TO);
		if (from || to) {
			return [from ? new Date(from) : null, to ? new Date(to) : null];
		}
		return [null, null];
	});
	const [sortField, setSortField] = useState<'purchased' | 'scanned'>('scanned');
	const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
	const [page, setPage] = useState(1);

	// Image sizes
	const [thumbLoadFailedById, setThumbLoadFailedById] = useState<Record<number, boolean>>({});
	const [imageSizeByPath, setImageSizeByPath] = useState<Record<string, number | null>>({});

	// Selection
	const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
	const [isSelectMode, setIsSelectMode] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [deleteErrorMsg, setDeleteErrorMsg] = useState<string | null>(null);

	// Rename
	const [renamingId, setRenamingId] = useState<number | null>(null);
	const [renameValue, setRenameValue] = useState('');

	// Receipt card context menu
	const [cardCtxMenu, setCardCtxMenu] = useState<{ x: number; y: number; record: ReceiptScanRecord } | null>(null);

	useEffect(() => {
		if (!cardCtxMenu) return;
		const close = () => setCardCtxMenu(null);
		document.addEventListener('pointerdown', close, { once: true });
		return () => document.removeEventListener('pointerdown', close);
	}, [cardCtxMenu]);

	// Save toast
	const [saveMsg, setSaveMsg] = useState<string | null>(null);

	const showSaveToast = useCallback((msg: string) => {
		setSaveMsg(msg);
		setTimeout(() => setSaveMsg(null), 2500);
	}, []);

	// ── Derived: filtered + sorted list (must come before callbacks that use it) ──

	const filteredAndSorted = useMemo(() => {
		const q = query.trim().toLowerCase();
		const [rangeStart, rangeEnd] = dateRange;

		const filtered = records.filter((record) => {
			if (rangeStart || rangeEnd) {
				// Filter by purchase date when available, fall back to scanned date.
				const raw = record.purchaseDate ?? record.createdAt;
				const d = parseSqliteDate(raw);
				if (!d) return false;
				if (rangeStart && d < rangeStart) return false;
				if (rangeEnd) {
					const endOfDay = new Date(rangeEnd);
					endOfDay.setHours(23, 59, 59, 999);
					if (d > endOfDay) return false;
				}
			}
			if (q.length > 0) {
				const name = getReceiptDisplayName(record).toLowerCase();
				const rows = record.data.rows;
				if (
					!name.includes(q) &&
					!String(record.id).includes(q) &&
					!rows.some((row) => row.name.toLowerCase().includes(q))
				)
					return false;
			}
			return true;
		});

		filtered.sort((a, b) => {
			const getMs = (r: ReceiptScanRecord) => {
				const raw = sortField === 'scanned' ? r.createdAt : (r.purchaseDate ?? r.createdAt);
				const ms = raw ? Date.parse(raw.replace(' ', 'T')) : NaN;
				return Number.isFinite(ms) ? ms : 0;
			};
			return sortDir === 'asc' ? getMs(a) - getMs(b) : getMs(b) - getMs(a);
		});

		return filtered;
	}, [query, records, dateRange, sortField, sortDir]);

	// Reset to page 1 whenever filters change
	useEffect(() => {
		setPage(1);
	}, [query, dateRange, sortField, sortDir]);

	const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / PAGE_SIZE));
	const clampedPage = Math.min(page, totalPages);

	const pageItems = useMemo(() => {
		const start = (clampedPage - 1) * PAGE_SIZE;
		return filteredAndSorted.slice(start, start + PAGE_SIZE);
	}, [clampedPage, filteredAndSorted]);

	const hasActiveFilter = Boolean(dateRange[0] ?? dateRange[1]) || query.length > 0;

	// ── Callbacks ─────────────────────────────────────────────────────────────

	const toggleSelect = useCallback((id: number, e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	// filteredAndSorted is declared above — safe to reference here
	const selectAll = useCallback(
		() => setSelectedIds(new Set(filteredAndSorted.map((r) => r.id))),
		[filteredAndSorted],
	);

	const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

	const startRename = useCallback((e: React.MouseEvent, record: ReceiptScanRecord) => {
		e.preventDefault();
		e.stopPropagation();
		setRenamingId(record.id);
		setRenameValue(record.displayName ?? getReceiptFallbackName(record.imagePath));
	}, []);

	const confirmRename = useCallback(
		async (id: number) => {
			const trimmed = renameValue.trim();
			try {
				const existing = getReceipt(id);
				if (existing) applyOptimistic({ ...existing, displayName: trimmed || null });
				await TauriApi.renameReceiptScan(id, trimmed || null);
				showSaveToast('Name saved');
			} catch {
				void forceReload();
			}
			setRenamingId(null);
			setRenameValue('');
		},
		[renameValue, showSaveToast, getReceipt, applyOptimistic, forceReload],
	);

	const updatePurchaseDate = useCallback(
		async (id: number, date: string | null) => {
			try {
				const existing = getReceipt(id);
				if (existing) applyOptimistic({ ...existing, purchaseDate: date });
				await TauriApi.updateReceiptPurchaseDate(id, date);
				showSaveToast('Purchase date saved');
			} catch {
				void forceReload();
			}
		},
		[showSaveToast, getReceipt, applyOptimistic, forceReload],
	);

	const deleteSelected = useCallback(async () => {
		const ok = await confirmDialog(
			`Delete ${selectedIds.size} receipt${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`,
		);
		if (!ok) return;
		setIsDeleting(true);
		for (const id of selectedIds) applyOptimisticDelete(id);
		try {
			await Promise.all([...selectedIds].map((id) => TauriApi.deleteReceiptScan(id)));
			setSelectedIds(new Set());
		} catch (err) {
			setDeleteErrorMsg(parseTauriError(err));
			void forceReload();
		} finally {
			setIsDeleting(false);
		}
	}, [selectedIds, applyOptimisticDelete, forceReload]);

	const toggleSelectMode = useCallback(() => {
		setIsSelectMode((m) => !m);
		setSelectedIds(new Set());
	}, []);


	const receiptImagePaths = useMemo(
		() =>
			Array.from(
				new Set(
					records
						.map((record) => record.processedImagePath ?? record.imagePath)
						.filter((path): path is string => Boolean(path)),
				),
			),
		[records],
	);

	const missingImageSizePaths = useMemo(
		() => receiptImagePaths.filter((path) => imageSizeByPath[path] === undefined),
		[receiptImagePaths, imageSizeByPath],
	);

	// Prune stale image-size entries when records change
	useEffect(() => {
		setImageSizeByPath((prev) => {
			const next: Record<string, number | null> = {};
			for (const path of receiptImagePaths) {
				if (path in prev) next[path] = prev[path];
			}
			const prevKeys = Object.keys(prev);
			const nextKeys = Object.keys(next);
			return prevKeys.length === nextKeys.length ? prev : next;
		});
	}, [receiptImagePaths]);

	// Load file sizes for any newly-seen images
	useEffect(() => {
		if (missingImageSizePaths.length === 0) return;

		let cancelled = false;

		void (async () => {
			const entries = await Promise.all(
				missingImageSizePaths.map(async (path): Promise<[string, number | null]> => {
					try {
						const info = await stat(path);
						const size = Number.isFinite(info.size) ? info.size : null;
						return [path, size];
					} catch {
						return [path, null];
					}
				}),
			);

			if (cancelled) return;

			setImageSizeByPath((prev) => {
				const next = { ...prev };
				for (const [path, size] of entries) {
					next[path] = size;
				}
				return next;
			});
		})();

		return () => {
			cancelled = true;
		};
	}, [missingImageSizePaths]);

	return (
		<div className="min-h-screen bg-white">
			<main className="mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-28 max-w-4xl">


				{/* ── Page header ────────────────────────────────────── */}
				<div className="flex flex-wrap items-start justify-between gap-4 mb-8">
					<div>
						<div className="flex items-center gap-3 mb-1">
							<div className="inline-flex items-center justify-center w-10 h-10 bg-violet-100 rounded-xl flex-shrink-0">
								<i className="fas fa-receipt text-lg text-violet-600" aria-hidden="true" />
							</div>
							<h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
								Receipts
							</h1>
						</div>
						<p className="text-slate-500 text-sm mt-1">
							{isLoading
								? 'Loading…'
								: `Browse and manage your scanned receipts.`}
						</p>
					</div>
					<div className="flex items-center gap-2 flex-shrink-0">
						<button
							type="button"
							onClick={toggleSelectMode}
							className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer border ${isSelectMode
								? 'bg-emerald-600 text-white border-emerald-600'
								: 'border-slate-300 text-slate-700 hover:bg-slate-50'
								}`}
						>
							{isSelectMode ? (
								<>
									<i className="fas fa-xmark text-[11px]" aria-hidden="true" />
									Done
								</>
							) : (
								<>
									<i className="fas fa-list-check text-[11px]" aria-hidden="true" />
									Select
								</>
							)}
						</button>
						<button
							type="button"
							onClick={() => openReceiptEditorTab([])}
							className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer border border-slate-300 text-slate-700 hover:bg-slate-50"
						>
							<i className="fas fa-file-lines text-[11px]" aria-hidden="true" />
							Editor
						</button>
						<button
							type="button"
							onClick={() => openTab('/receipt-scanner/new')}
							className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors cursor-pointer"
						>
							<i className="fas fa-plus" aria-hidden="true" />
							Add New
						</button>
					</div>
				</div>

				{/* ── AI model readiness banner ──────────────────────── */}
				<div className="mb-5">
					<ModelDownloadBanner />
				</div>

				{/* ── Filters panel ────────────────────────────────────── */}
				<div className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-4 mb-5 space-y-3">
					<SearchInput
						value={query}
						onChange={setQuery}
						placeholder="Search by name or item…"
						ariaLabel="Search receipts"
					/>

					{/* Purchase date filter */}
					<div className="flex flex-wrap items-start gap-x-2 gap-y-1">
						<div className="flex items-center gap-1.5 flex-shrink-0 mt-2">
							<i className="fas fa-calendar-alt text-slate-400 text-xs" aria-hidden="true" />
							<span className="text-xs text-slate-400 font-medium">Purchase date</span>
						</div>
						<DateRangeFilter onChange={setDateRange} />
					</div>

					{/* Sort controls */}
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
						<div className="flex items-center gap-1.5 flex-shrink-0">
							<i className="fas fa-arrow-up-wide-short text-slate-400 text-xs" aria-hidden="true" />
							<span className="text-xs text-slate-400 font-medium">Sort by</span>
						</div>
						<div className="flex gap-1.5" role="radiogroup" aria-label="Sort order">
							{(['purchased', 'scanned'] as const).map((field) => (
								<button
									key={field}
									type="button"
									role="radio"
									aria-checked={sortField === field}
									onClick={() => {
										if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
										else { setSortField(field); setSortDir('desc'); }
									}}
									className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${sortField === field
										? 'bg-violet-600 text-white'
										: 'bg-slate-100 text-slate-500 hover:bg-slate-200'
										}`}
								>
									{field === 'purchased' ? 'Purchased' : 'Scanned'}
									{sortField === field && (
										<i className={`fas fa-arrow-${sortDir === 'desc' ? 'down' : 'up'} text-[9px]`} aria-hidden="true" />
									)}
								</button>
							))}
						</div>
					</div>

					<div className="flex items-center justify-between pt-1 border-t border-slate-200">
						<span className="text-xs text-slate-500">
							{filteredAndSorted.length}{' '}
							{filteredAndSorted.length === 1 ? 'result' : 'results'}
							{hasActiveFilter && <span className="ml-1 text-slate-400">(filtered)</span>}
						</span>
						{totalPages > 1 && (
							<span className="text-xs text-slate-400 tabular-nums">
								Page {clampedPage} of {totalPages}
							</span>
						)}
					</div>
				</div>

				{/* ── Error banner ─────────────────────────────────────── */}
				{deleteErrorMsg && (
					<ErrorBanner
						message={deleteErrorMsg}
						onDismiss={() => setDeleteErrorMsg(null)}
					/>
				)}

				{/* ── Receipt list ─────────────────────────────────────── */}
				{isLoading ? (
					<div className="space-y-3">
						<SkeletonCard />
						<SkeletonCard />
						<SkeletonCard />
					</div>
				) : filteredAndSorted.length === 0 ? (
					<EmptyState
						icon="fa-receipt"
						message="No matching receipts found."
						subMessage={hasActiveFilter ? 'Try adjusting or clearing the filters.' : undefined}
						action={
							!hasActiveFilter ? (
								<button
									type="button"
									onClick={() => openTab('/receipt-scanner/new')}
									className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors cursor-pointer"
								>
									<i className="fas fa-plus" aria-hidden="true" />
									Scan your first receipt
								</button>
							) : undefined
						}
					/>
				) : (
					<>
						<div className="space-y-3">
							{pageItems.map((record) => {
								const primaryThumbPath = record.processedImagePath ?? record.imagePath;
								const imageSizeBytes = primaryThumbPath
									? imageSizeByPath[primaryThumbPath]
									: undefined;

								return (
									<ReceiptCard
										key={record.id}
										record={record}
										displayName={getReceiptDisplayName(record)}
										isUpdated={false}
										getCategoryColor={getCategoryColor}
										isSelected={selectedIds.has(record.id)}
										isSelectMode={isSelectMode}
										isRenaming={renamingId === record.id}
										renameValue={renameValue}
										imageSizeBytes={imageSizeBytes}
										thumbLoadFailed={thumbLoadFailedById[record.id] ?? false} onContextMenu={(e) => {
											e.preventDefault();
											setCardCtxMenu({ x: e.clientX, y: e.clientY, record });
										}} onCardClick={() => {
											if (isSelectMode) {
												setSelectedIds((prev) => {
													const next = new Set(prev);
													if (next.has(record.id)) next.delete(record.id);
													else next.add(record.id);
													return next;
												});
											} else if (renamingId !== record.id) {
												openReceiptEditorTab(record.id);
											}
										}}
										onToggleSelect={(e) => toggleSelect(record.id, e)}
										onRenameStart={(e) => startRename(e, record)}
										onRenameChange={setRenameValue}
										onRenameConfirm={() => void confirmRename(record.id)}
										onRenameCancel={() => {
											setRenamingId(null);
											setRenameValue('');
										}}
										onPurchaseDateChange={(date) => void updatePurchaseDate(record.id, date)}
										onThumbError={() => {
											if (!thumbLoadFailedById[record.id]) {
												setThumbLoadFailedById((prev) => ({
													...prev,
													[record.id]: true,
												}));
											}
										}}
									/>
								);
							})}
						</div>

						<Pagination
							currentPage={clampedPage}
							totalPages={totalPages}
							onPageChange={setPage}
							totalItems={filteredAndSorted.length}
							pageSize={PAGE_SIZE}
						/>
					</>
				)}
			</main>

			{/* ── Bulk action bar ──────────────────────────────────────── */}
			{isSelectMode && (
				<BulkActionBar
					selectedCount={selectedIds.size}
					totalFiltered={filteredAndSorted.length}
					isDeleting={isDeleting}
					onSelectAll={selectAll}
					onClearSelection={clearSelection}
					onViewSelected={() => {
						openReceiptEditorTab(Array.from(selectedIds));
						clearSelection();
						toggleSelectMode();
					}}
					onDeleteSelected={() => void deleteSelected()}
				/>
			)}

			{/* ── Save toast (portalled to body) ───────────────────────────── */}
			{cardCtxMenu && createPortal(
				<div
					style={{ position: 'fixed', left: cardCtxMenu.x, top: cardCtxMenu.y, zIndex: 9999 }}
					className="bg-white rounded-lg shadow-xl border border-slate-200/80 py-1 min-w-[190px]"
					onPointerDown={(e) => e.stopPropagation()}
				>
					<button
						type="button"
						className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
						onClick={() => {
							const { record } = cardCtxMenu;
							openReceiptEditorTab(record.id);
							setCardCtxMenu(null);
						}}
					>
						<i className="fas fa-arrow-up-right-from-square text-[11px] text-slate-400 w-4 text-center" aria-hidden="true" />
						Open in Editor
					</button>
					{import.meta.env.DEV && (
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
				</div>,
				document.body,
			)}
			{createPortal(
				<div
					className={`fixed bottom-5 right-6 z-50 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white pointer-events-none select-none transition-opacity duration-200 ${saveMsg ? 'opacity-100 bg-emerald-600' : 'opacity-0'
						}`}
				>
					{saveMsg && (
						<>
							<i className="fas fa-check-circle" aria-hidden="true" />
							<span>{saveMsg}</span>
						</>
					)}
				</div>,
				document.body,
			)}
		</div>
	);
}


