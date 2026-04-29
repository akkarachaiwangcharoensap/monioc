/**
 * Mock Receipt Scanner page for the landing demo.
 * Matches the exact design of the real ReceiptScannerPage + ScannerInboxCard.
 * Animation loops indefinitely — never reaches the "all done" state.
 */
import { useState } from 'react';
import type React from 'react';

type MockStatus = 'idle' | 'scanning' | 'check';

interface MockImage {
	id: number;
	filename: string;
	label: string;
}

const MOCK_IMAGES: MockImage[] = [
	{ id: 1, filename: 'loblaws_kanata_mar28.jpg', label: 'Loblaws, Kanata — Mar 28' },
	{ id: 2, filename: 'metro_bank_st_apr03.jpg', label: 'Metro, Bank St — Apr 3' },
	{ id: 3, filename: 'nofrills_merivale_apr12.jpg', label: 'No Frills, Merivale — Apr 12' },
];

// ── Status badge — matches real ScannerInboxCard StatusBadge ──────────────────

function StatusBadge({ status }: { status: MockStatus }): React.ReactElement {
	if (status === 'scanning') {
		return (
			<span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
				<i className="fas fa-spinner fa-spin text-[10px]" aria-hidden="true" /> Scanning
			</span>
		);
	}
	if (status === 'check') {
		return (
			<span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
				<i className="fas fa-check text-[10px]" aria-hidden="true" /> Scanned
			</span>
		);
	}
	return (
		<span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-400">
			<i className="fas fa-image text-[10px]" aria-hidden="true" /> Ready
		</span>
	);
}

// ── Card — matches real ScannerInboxCard layout ───────────────────────────────

function MockScannerCard({ img, status }: { img: MockImage; status: MockStatus }): React.ReactElement {
	return (
		<div className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-100 transition-all duration-300">
			{/* Thumbnail */}
			<div className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-100 ring-1 ring-black/5 flex-shrink-0 flex items-center justify-center text-slate-300">
				<i className="fas fa-image text-xl" aria-hidden="true" />
				{status === 'scanning' && (
					<div className="absolute inset-0 bg-violet-500/20 flex items-center justify-center">
						<i className="fas fa-spinner fa-spin text-white text-sm drop-shadow" aria-hidden="true" />
					</div>
				)}
				{status === 'check' && (
					<div className="absolute inset-0 bg-emerald-500/85 flex items-center justify-center">
						<i className="fas fa-check text-white text-base" aria-hidden="true" />
					</div>
				)}
			</div>

			{/* Info */}
			<div className="flex-1 min-w-0 text-left">
				<p className="text-sm font-semibold text-slate-800 truncate">{img.filename}</p>
				<div className="mt-1 ">
					<StatusBadge status={status} />
				</div>
			</div>

			{/* Actions — matches real ScannerInboxCard button layout */}
			<div className="flex items-center gap-2 flex-shrink-0">
				{status === 'idle' && (
					<>
						<button
							type="button"
							className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors cursor-pointer"
							aria-label="Scan this image"
						>
							<i className="fas fa-search text-[10px]" aria-hidden="true" /> Scan
						</button>
						<button
							type="button"
							className="inline-flex items-center justify-center w-8 h-8 rounded-full text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors cursor-pointer"
							aria-label="Edit image"
							title="Crop &amp; adjust"
						>
							<i className="fas fa-crop-simple text-xs" aria-hidden="true" />
						</button>
						<button
							type="button"
							className="inline-flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
							aria-label="Remove from inbox"
						>
							<i className="fas fa-xmark text-xs" aria-hidden="true" />
						</button>
					</>
				)}
				{status === 'scanning' && (
					<button
						type="button"
						className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border border-red-200 text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
						aria-label="Cancel scan"
					>
						<i className="fas fa-xmark text-[10px]" aria-hidden="true" /> Cancel
					</button>
				)}
			</div>
		</div>
	);
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface Props {
	onNavigate?: (page: string) => void;
	style?: React.CSSProperties;
}

export function MockReceiptScannerPreview({ style }: { style?: React.CSSProperties }): React.ReactElement {
	return (
		<div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
			<div className="overflow-y-auto">
				<main className="mx-auto py-6 max-w-xl" style={style}>
					<MockReceiptScannerContent />
				</main>
			</div>
		</div>
	);
}

function MockReceiptScannerContent(): React.ReactElement {
	const [statuses] = useState<Record<number, MockStatus>>({ 1: 'check', 2: 'scanning', 3: 'idle' });

	const hasScanable = Object.values(statuses).some((s) => s === 'idle');
	const isScanning = Object.values(statuses).some((s) => s === 'scanning');

	return (
		<>
			{/* ── Page header ────────────────────────────────────── */}
			<div className="mb-8">
				<div className="flex items-center gap-3 mb-1">
					<div className="inline-flex items-center justify-center w-10 h-10 bg-violet-100 rounded-xl flex-shrink-0">
						<i className="fas fa-camera text-lg text-violet-600" aria-hidden="true" />
					</div>
					<h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Scan Receipts</h1>
				</div>
				<p className="text-slate-500 mt-1 text-sm text-left">
					Upload receipt images, then scan them when you&apos;re ready.
				</p>
			</div>

			{/* ── Inbox image cards ────────────────────────────────── */}
			<div className="mb-6">
				{/* Inbox header */}
				<div className="flex items-center justify-between mb-3">
					<p className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-100">
						1 image ready
					</p>
					<div className="flex items-center gap-2">
						{hasScanable && (
							<button
								type="button"
								className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-700 transition-all duration-200 cursor-pointer"
								aria-label="Scan all images"
							>
								<i className="fas fa-search text-[10px]" aria-hidden="true" />Scan All
							</button>
						)}
						{isScanning && !hasScanable && (
							<button
								type="button"
								className="inline-flex items-center gap-1.5 rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-50 transition-all duration-200 cursor-pointer"
								aria-label="Cancel all scans"
							>
								<i className="fas fa-xmark text-[10px]" aria-hidden="true" /> Cancel All
							</button>
						)}
					</div>
				</div>

				<div className="space-y-3">
					{MOCK_IMAGES.map((img) => (
						<MockScannerCard key={img.id} img={img} status={statuses[img.id] ?? 'idle'} />
					))}
				</div>
			</div>

			{/* ── Add more images ────────────────────────────────── */}
			<button
				type="button"
				className="w-full py-2.5 border-2 border-dashed border-slate-200 hover:border-violet-400 rounded-2xl text-xs text-slate-400 hover:text-violet-500 transition-colors cursor-pointer flex items-center justify-center gap-2"
			>
				<i className="fas fa-plus" aria-hidden="true" /> Add more images
			</button>
		</>
	);
}

export default function MockReceiptScannerPage({ onNavigate: _onNavigate, style }: Props): React.ReactElement {
	return (
		<div className="min-h-full bg-white">
			<main className="container mx-auto px-8 pt-8 pb-10 max-w-4xl" style={style}>
				<MockReceiptScannerContent />
			</main>
		</div>
	);
}
