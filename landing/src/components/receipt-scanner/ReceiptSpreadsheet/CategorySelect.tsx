import { components } from 'react-select';
import type { OptionProps, SingleValueProps, StylesConfig } from 'react-select';
import type React from 'react';

export interface CategoryOption {
	value: string;
	label: string;
	color?: string;
}

// ── Stable module-level styles ─────────────────────────────────────────────
// Hoisted to module scope so the object is created once, not on every render.

export const CATEGORY_SELECT_STYLES: StylesConfig<CategoryOption, false> = {
	container: (base) => ({
		...base,
		width: '100%',
		height: '100%',
		padding: '0',
	}),
	control: (base) => ({
		...base,
		minHeight: '100%',
		height: '100%',
		width: '100%',
		fontSize: '11.5px',
		border: 'none',
		backgroundColor: 'transparent',
		boxShadow: 'none',
		padding: '0',
		flexWrap: 'nowrap',
		justifyContent: 'space-between',
		cursor: 'default',
	}),
	menuPortal: (base) => ({
		...base,
		zIndex: 9999,
	}),
	menu: (base) => ({
		...base,
		top: '-8px',
		left: '-14px',
		width: 'calc(100% + 24px)',
		minWidth: '100%',
		// Inline override because global CSS has box-shadow: none !important
		boxShadow: '0 4px 6px -1px rgba(0,0,0,0.10), 0 2px 4px -2px rgba(0,0,0,0.06)',
		border: '1px solid #e2e8f0',
		overflow: 'hidden',
	}),
	menuList: (base) => ({
		...base,
		fontSize: '11px',
		padding: '2px 0',
	}),
	option: (base, state) => ({
		...base,
		backgroundColor: state.isSelected ? '#f1f5f9' : state.isFocused ? '#f9fafb' : 'white',
		color: '#334155',
		padding: '5px 10px',
		cursor: 'pointer',
	}),
	singleValue: (base) => ({
		...base,
		fontSize: '11.5px',
		lineHeight: '1.2',
		color: '#475569',
		margin: '0',
		padding: '0',
		overflow: 'hidden',
		maxWidth: '100%',
		top: '45%',
		pointerEvents: 'none',
	}),
	input: (base, state) => ({
		...base,
		margin: '0',
		paddingTop: '0',
		paddingBottom: '0',
		paddingLeft: state.hasValue ? '16px' : '2px',
		lineHeight: '1.2',
	}),
	valueContainer: (base) => ({
		...base,
		padding: '0',
		margin: '0',
		minWidth: '0',
		overflow: 'hidden',
		flex: '1 1 auto',
	}),
	indicatorsContainer: (base) => ({
		...base,
		marginLeft: 'auto',
		flexShrink: 0,
	}),
	indicatorSeparator: () => ({
		display: 'none',
	}),
	dropdownIndicator: (base) => ({
		...base,
		padding: '0 4px',
		fontSize: '10px',
		color: '#94a3b8',
		cursor: 'pointer',
		borderRadius: '2px',
		transition: 'background-color 0.1s, color 0.1s',
	}),
};

// ── Custom react-select sub-components ────────────────────────────────────────

export function CategoryOptionComponent(
	props: OptionProps<CategoryOption, false>,
): React.ReactElement {
	const { data } = props;
	const { color, label } = data;
	return (
		<components.Option {...props}>
			<div className="flex min-w-0 items-center gap-2">
				{color && (
					<div
						className="w-3 h-3 rounded-full border border-slate-300 flex-shrink-0"
						style={{ backgroundColor: color }}
						aria-hidden="true"
					/>
				)}
				<span className="truncate text-[12px] text-slate-700">{label}</span>
			</div>
		</components.Option>
	);
}

export function CategorySingleValueComponent(
	props: SingleValueProps<CategoryOption, false>,
): React.ReactElement {
	const { data, children } = props;
	const { color, label } = data;
	return (
		<components.SingleValue {...props}>
			<div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
				{color && (
					<div
						className="h-2.5 w-2.5 flex-shrink-0 rounded-full border border-slate-300"
						style={{ backgroundColor: color }}
						aria-hidden="true"
					/>
				)}
				<span className="truncate text-[11.5px] leading-[1.2] text-slate-600">
					{children ?? label}
				</span>
			</div>
		</components.SingleValue>
	);
}
