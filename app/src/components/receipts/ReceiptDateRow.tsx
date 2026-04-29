import type React from 'react';
import DatePicker from 'react-date-picker';
import 'react-date-picker/dist/DatePicker.css';
import 'react-calendar/dist/Calendar.css';
import purchaseDatePickerStyles from '../receipt-scanner/PurchaseDatePicker.module.css';

interface ReceiptDateRowProps {
	purchaseDate: string | null | undefined;
	createdAt: string | null | undefined;
	/** When provided, the purchased date is shown as an editable DatePicker. */
	onPurchaseDateChange?: (date: string | null) => void;
	/** When provided, the scanned date is shown as an editable DatePicker. */
	onCreatedAtChange?: (date: string) => void;
	className?: string;
}

function parseDateValue(raw: string | null | undefined): Date | null {
	if (!raw) return null;
	const datePart = raw.split(/[T ]/)[0];
	const d = new Date(`${datePart}T12:00:00`);
	return Number.isNaN(d.getTime()) ? null : d;
}

function toSqliteDate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateOnly(raw: string | null | undefined): string | null {
	const d = parseDateValue(raw);
	if (!d) return null;
	return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function pickDate(value: Date | [Date | null, Date | null] | null): Date | null {
	return Array.isArray(value) ? value[0] : value;
}

/**
 * Renders the purchased and scanned date fields for a receipt.
 *
 * - Shows an editable DatePicker when the corresponding onChange prop is
 *   provided; otherwise shows a formatted date-only string (no time).
 * - When purchaseDate is null the picker shows empty placeholders rather than
 *   falling back to createdAt.  This allows users to explicitly clear the date
 *   and have that decision persist through multi-select toggles and remounts.
 */
export default function ReceiptDateRow({
	purchaseDate,
	createdAt,
	onPurchaseDateChange,
	onCreatedAtChange,
	className,
}: ReceiptDateRowProps): React.ReactElement {
	const purchaseDateValue = parseDateValue(purchaseDate);

	return (
		<div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className ?? ''}`}>
			{/* Purchased date */}
			<div className="flex items-center gap-1.5">
				<span className="text-xs text-slate-500">Purchased</span>
				{onPurchaseDateChange ? (
					<div
						className={purchaseDatePickerStyles.wrapper}
						onClick={(e) => e.stopPropagation()}
					>
						<DatePicker
							value={purchaseDateValue}
							onChange={(value) => {
								const date = pickDate(value);
								if (date instanceof Date) {
									onPurchaseDateChange(toSqliteDate(date));
								} else {
									onPurchaseDateChange(null);
								}
							}}
							locale="en-US"
							calendarIcon={<i className="fas fa-calendar-alt" style={{ fontSize: '9px' }} />}
							clearIcon={purchaseDateValue ? <i className="fas fa-times" style={{ fontSize: '8px' }} /> : null}
							dayPlaceholder="dd"
							monthPlaceholder="mm"
							yearPlaceholder="yyyy"
						/>
					</div>
				) : (
					<span className="text-xs text-slate-600">
						{formatDateOnly(purchaseDate) ?? '—'}
					</span>
				)}
			</div>

			{/* Scanned date */}
			{createdAt && (
				<div className="flex items-center gap-1.5">
					<span className="text-xs text-slate-400">Scanned</span>
					{onCreatedAtChange ? (
						<div className={purchaseDatePickerStyles.wrapper}>
							<DatePicker
								value={parseDateValue(createdAt) ?? new Date()}
								onChange={(value) => {
									const date = pickDate(value);
									if (date instanceof Date) onCreatedAtChange(`${toSqliteDate(date)} 00:00:00`);
								}}
								locale="en-US"
								calendarIcon={<i className="fas fa-calendar-alt" style={{ fontSize: '9px' }} />}
								clearIcon={null}
								dayPlaceholder="dd"
								monthPlaceholder="mm"
								yearPlaceholder="yyyy"
							/>
						</div>
					) : (
						<span className="text-xs text-slate-400">
							{formatDateOnly(createdAt) ?? '—'}
						</span>
					)}
				</div>
			)}
		</div>
	);
}
