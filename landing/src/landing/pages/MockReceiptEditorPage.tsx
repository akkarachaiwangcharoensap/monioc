import { useMemo, useState } from 'react';
import type React from 'react';
import DatePicker from 'react-date-picker';
import 'react-date-picker/dist/DatePicker.css';
import 'react-calendar/dist/Calendar.css';
import purchaseDatePickerStyles from '../../components/receipt-scanner/PurchaseDatePicker.module.css';
import ReceiptSpreadsheet from '../../components/receipt-scanner/ReceiptSpreadsheet';
import MockEditorThumbnailStrip from '../components/MockEditorThumbnailStrip';
import { MOCK_CATEGORIES } from '../mock-data';
import type { ReceiptScanRecord, ReceiptData } from '../../types/receipt';

interface Props {
	receipt: ReceiptScanRecord | null;
	onBack: () => void;
}

const FALLBACK_ITEMS = [
	{ name: 'Chicken Breast 1kg', price: 11.99, category: 'Meat' },
	{ name: 'Baby Spinach 142g', price: 3.99, category: 'Produce' },
	{ name: 'Greek Yogurt 750g', price: 6.49, category: 'Dairy' },
	{ name: 'Olive Oil 500mL', price: 7.49, category: 'Dry Goods' },
	{ name: 'Bananas 1kg', price: 1.69, category: 'Produce' },
];

const DEFAULT_RECEIPT: ReceiptScanRecord = {
	id: -1,
	displayName: 'Receipt',
	imagePath: null,
	processedImagePath: null,
	data: { rows: FALLBACK_ITEMS },
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
	purchaseDate: null,
};

const getCategoryColor = (name: string): string => {
	return MOCK_CATEGORIES.find((category) => category.name === name)?.color ?? '#94a3b8';
};

const categoryNames = MOCK_CATEGORIES.map((category) => category.name);

export default function MockReceiptEditorPage({ receipt, onBack }: Props): React.ReactElement {
	const activeReceipt = useMemo(() => receipt ?? DEFAULT_RECEIPT, [receipt]);
	const editableData = useMemo<ReceiptData>(() => activeReceipt.data, [activeReceipt]);
	const storeName = activeReceipt.displayName ?? 'Receipt';
	const dateStr = activeReceipt.purchaseDate ?? activeReceipt.createdAt ?? '';

	const formattedDate = useMemo(() => {
		if (!dateStr) return 'Unknown date';
		try {
			const d = new Date(dateStr.includes('T') || dateStr.includes(' ') ? dateStr.replace(' ', 'T') : `${dateStr}T12:00:00`);
			if (Number.isNaN(d.getTime())) return dateStr;
			return d.toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
		} catch {
			return dateStr;
		}
	}, [dateStr]);

	const [editorTab, setEditorTab] = useState<'table' | 'json'>('table');
	const [purchasedDate, setPurchasedDate] = useState<Date | null>(new Date('2024-03-15T12:00:00'));
	const [scannedDate, setScannedDate] = useState<Date | null>(new Date('2024-03-16T12:00:00'));

	const jsonValue = useMemo(() => JSON.stringify(editableData, null, 2), [editableData]);

	return (
		<div className="bg-white">
			<main className="container mx-auto px-4 md:px-4 lg:px-4 pt-4 pb-1 max-w-4xl lg:max-w-7xl">
				<div className="mb-2 flex items-center gap-1.5 text-xs text-slate-400">
					<button
						type="button"
						onClick={onBack}
						className="hover:text-violet-600 transition-colors"
					>
						Receipts
					</button>
					<i className="fas fa-chevron-right text-[8px]" aria-hidden="true" />
					<span className="text-slate-700 font-medium truncate max-w-[160px]">{storeName}</span>
				</div>

				<div className="mb-6">
					<div className="flex items-center gap-3 mb-1">
						<div className="inline-flex items-center justify-center w-10 h-10 bg-violet-100 rounded-xl flex-shrink-0">
							<i className="fas fa-file-lines text-lg text-violet-600" aria-hidden="true" />
						</div>
						<div>
							<h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Receipts Editor</h1>
							<p className="text-slate-500 mt-1 text-sm">{formattedDate}</p>
						</div>
					</div>
				</div>

				<MockEditorThumbnailStrip />

				{/* Side-by-side layout: image + editor */}
				<div className="flex flex-col lg:flex-row lg:gap-6 lg:items-start">
					{/* Left column: receipt image (sticky on lg+) */}
					<div className="w-full lg:w-[40%] lg:max-w-md lg:sticky lg:top-8 lg:self-start flex-shrink-0">
						{/* Large image preview */}
						<div className="relative mt-19 rounded-3xl overflow-hidden border border-slate-200 bg-slate-50 select-none mb-4">
							<div className="h-60 lg:h-auto lg:max-h-[70vh] bg-slate-100 flex items-center justify-center text-slate-400">
								<i className="fas fa-image text-5xl h-60 pt-24" aria-hidden="true" />
							</div>
						</div>

						{/* Re-Scan button */}
						<div className="flex gap-3 mb-4 lg:mb-0">
							<button
								type="button"
								className="flex-1 inline-flex items-center justify-center gap-2 py-3 bg-violet-600 text-white rounded-full text-sm font-medium hover:bg-violet-700 active:bg-violet-800 active:scale-[0.98] transition-all cursor-pointer"
							>
								<i className="fas fa-search" aria-hidden="true" /> Re-Scan Receipt
							</button>
						</div>
					</div>

					{/* Right column: receipt editor */}
					<div className="w-full lg:flex-1 lg:min-w-0">
				<div className="mb-2">
					<div className="mb-2 flex items-center justify-between">
						<div className="flex items-center gap-2">
							<span className="text-lg font-semibold text-slate-900">{storeName}</span>
							<button
								type="button"
								aria-label="Rename receipt"
								title="Rename"
								className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors cursor-pointer"
							>
								<i className="fas fa-pencil text-xs" aria-hidden="true" />
							</button>
						</div>

						{/* Table / Raw JSON tab switcher */}
						<div className="inline-flex rounded-full bg-slate-100 p-1">
							<button
								type="button"
								onClick={() => setEditorTab('table')}
								className={`px-3 py-1 text-xs rounded-full cursor-pointer ${editorTab === 'table' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
							>
								Table
							</button>
							<button
								type="button"
								onClick={() => setEditorTab('json')}
								className={`px-3 py-1 text-xs rounded-full cursor-pointer ${editorTab === 'json' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
							>
								Raw JSON
							</button>
						</div>
					</div>

					{/* Dates row */}
					<div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
						<div className="flex items-center gap-2">
							<span className="text-xs text-slate-500">Purchased</span>
							<div className={purchaseDatePickerStyles.wrapper}>
								<DatePicker
									value={purchasedDate}
									onChange={(v) => setPurchasedDate(Array.isArray(v) ? v[0] : v)}
									locale="en-US"
									calendarIcon={<i className="fas fa-calendar-alt" style={{ fontSize: '10px' }} />}
									clearIcon={purchasedDate ? <i className="fas fa-times" style={{ fontSize: '9px' }} /> : null}
									dayPlaceholder="dd"
									monthPlaceholder="mm"
									yearPlaceholder="yyyy"
								/>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<span className="text-xs text-slate-400">Scanned</span>
							<div className={purchaseDatePickerStyles.wrapper}>
								<DatePicker
									value={scannedDate}
									onChange={(v) => setScannedDate(Array.isArray(v) ? v[0] : v)}
									locale="en-US"
									calendarIcon={<i className="fas fa-calendar-alt" style={{ fontSize: '10px' }} />}
									clearIcon={null}
									dayPlaceholder="dd"
									monthPlaceholder="mm"
									yearPlaceholder="yyyy"
								/>
							</div>
						</div>
					</div>

					{editorTab === 'table' ? (
						<div className="space-y-3">
							<ReceiptSpreadsheet
								data={editableData}
								onChange={() => {}}
								categories={categoryNames}
								getCategoryColor={getCategoryColor}
								useReactSelect={true}
								disabled={false}
							/>
							<div className="flex flex-wrap gap-2 justify-end">
								<button
									type="button"
									className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-violet-300 text-sm text-violet-700 hover:bg-violet-50 cursor-pointer transition-colors"
								>
									<i className="fas fa-tags" aria-hidden="true" /> Auto-categorize
								</button>
								<button
									type="button"
									className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
								>
									<i className="fas fa-download" aria-hidden="true" /> Export
								</button>
							</div>
						</div>
					) : (
						<textarea
							value={jsonValue}
							readOnly
							className="w-full min-h-64 rounded-2xl border border-slate-300 p-3 text-sm font-mono text-slate-700"
						/>
					)}
				</div>
					</div>
				</div>
			</main>
			<style>
				{`
					.grid {
						grid-template-columns: 32px 180px 140px 60px !important;
					}
				`}
			</style>
		</div>
	);
}
