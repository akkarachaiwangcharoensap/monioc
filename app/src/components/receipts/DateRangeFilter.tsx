import { useState } from 'react';
import type React from 'react';
import DateTimeRangePicker from '@wojtekmaj/react-datetimerange-picker';
import '@wojtekmaj/react-datetimerange-picker/dist/DateTimeRangePicker.css';
import 'react-calendar/dist/Calendar.css';
import 'react-clock/dist/Clock.css';
import styles from './DateRangeFilter.module.css';

export type DateRangeValue = [Date | null, Date | null];

export type QuickRange = 'all' | 'today' | 'lastWeek' | 'last2Weeks' | 'last3Weeks' | '1month' | '3months' | 'thisMonth' | 'custom';

const DEFAULT_QUICK_RANGES: { id: QuickRange; label: string }[] = [
	{ id: 'all', label: 'All' },
	{ id: 'lastWeek', label: 'Last Week' },
	{ id: 'last2Weeks', label: 'Last 2 Weeks' },
	{ id: '1month', label: '1 Month' },
	{ id: '3months', label: '3 Months' },
	{ id: 'custom', label: 'Custom' },
];

function getTodayRange(): DateRangeValue {
	const start = new Date();
	start.setHours(0, 0, 0, 0);
	const end = new Date();
	end.setHours(23, 59, 59, 999);
	return [start, end];
}

function getQuickRangeDates(range: QuickRange): DateRangeValue {
	if (range === 'all' || range === 'custom') return [null, null];
	if (range === 'today') return getTodayRange();
	const now = new Date();
	const start = new Date(now);
	switch (range) {
		case 'lastWeek':
			start.setDate(now.getDate() - 7);
			break;
		case 'last2Weeks':
			start.setDate(now.getDate() - 14);
			break;
		case 'last3Weeks':
			start.setDate(now.getDate() - 21);
			break;
		case '1month':
			start.setMonth(now.getMonth() - 1);
			break;
		case '3months':
			start.setMonth(now.getMonth() - 3);
			break;
		case 'thisMonth':
			start.setDate(1);
			break;
	}
	start.setHours(0, 0, 0, 0);
	return [start, now];
}

// eslint-disable-next-line react-refresh/only-export-components
export { getQuickRangeDates };

interface DateRangeFilterProps {
	onChange: (range: DateRangeValue) => void;
	/** Override the set of quick-range pills. Defaults to the standard All/LastWeek/… set. */
	quickRanges?: { id: QuickRange; label: string }[];
	/** Which quick range is active on initial render. Defaults to 'all'. */
	defaultQuickRange?: QuickRange;
	/** Called whenever the active quick-range pill changes. Use this to persist the selection. */
	onQuickRangeChange?: (range: QuickRange) => void;
}

// LooseValue type from the picker library: Date | string | null | [Date | string | null, Date | string | null]
type PickerValue = Date | string | null | [Date | string | null, Date | string | null];

export default function DateRangeFilter({ onChange, quickRanges, defaultQuickRange, onQuickRangeChange }: DateRangeFilterProps): React.ReactElement {
	const ranges = quickRanges ?? DEFAULT_QUICK_RANGES;
	const [quickRange, setQuickRange] = useState<QuickRange>(defaultQuickRange ?? 'all');
	const [customValue, setCustomValue] = useState<DateRangeValue>(() => getTodayRange());

	const handleQuickChange = (range: QuickRange) => {
		setQuickRange(range);
		onQuickRangeChange?.(range);
		if (range !== 'custom') {
			onChange(getQuickRangeDates(range));
		} else {
			const nextRange = customValue[0] ?? customValue[1] ? customValue : getTodayRange();
			setCustomValue(nextRange);
			onChange(nextRange);
		}
	};

	const handlePickerChange = (val: PickerValue) => {
		let normalized: DateRangeValue = [null, null];
		if (Array.isArray(val)) {
			const start = val[0] instanceof Date ? val[0] : null;
			const end = val[1] instanceof Date ? val[1] : null;
			normalized = [start, end];
		}
		setCustomValue(normalized);
		onChange(normalized);
	};

	const handleUseToday = () => {
		const todayRange = getTodayRange();
		setCustomValue(todayRange);
		onChange(todayRange);
	};

	return (
		<div className="space-y-2.5">
			{/* Quick-range radio pill buttons */}
			<div
				className="flex flex-wrap items-center gap-1.5"
				role="radiogroup"
				aria-label="Date range filter"
			>
				{ranges.map(({ id, label }) => (
					<button
						key={id}
						type="button"
						role="radio"
						aria-checked={quickRange === id}
						onClick={() => handleQuickChange(id)}
						className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer border ${quickRange === id
							? 'bg-violet-600 text-white border-violet-600 shadow-sm'
							: 'bg-white text-slate-600 border-slate-300 hover:border-violet-300 hover:bg-violet-50'
							}`}
					>
						{label}
					</button>
				))}
			</div>

			{/* Custom date-time range picker (shown only when "Custom" is active) */}
			{quickRange === 'custom' && (
				<div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2.5">
					<div className={styles.wrapper}>
						<DateTimeRangePicker
							onChange={handlePickerChange as (val: PickerValue) => void}
							value={customValue}
							maxDate={new Date()}
							calendarProps={{ maxDate: new Date() }}
							disableClock
							format="y-MM-dd"
						/>
					</div>
					<button
						type="button"
						onClick={handleUseToday}
						aria-label="Use today for custom date range"
						className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 transition-colors hover:text-slate-700"
					>
						<i className="fas fa-calendar-day text-[10px]" aria-hidden="true" />
						Today
					</button>
				</div>
			)}
		</div>
	);
}
