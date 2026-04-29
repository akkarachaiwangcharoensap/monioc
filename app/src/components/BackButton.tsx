import type React from 'react';
import { usePageHistory } from '../hooks/usePageHistory';
import { useTabContext } from '../context/TabContext';

/**
 * Navigation buttons (back/forward) following Apple design principles:
 * - Minimal and subtle
 * - Chevron icons with no background fill
 * - Subtle hover effect
 * - Located in top-left area
 */
export default function NavigationButtons(): React.JSX.Element {
	const { navigateBack, navigateForward } = useTabContext();
	const { canGoBack, canGoForward } = usePageHistory();

	const buttonClass = (enabled: boolean) =>
		`inline-flex h-7 w-7 items-center justify-center ${
			enabled
				? 'cursor-pointer text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
				: 'text-slate-300 cursor-not-allowed'
		} rounded-full transition-colors duration-150 ${enabled ? 'active:bg-slate-200/70' : ''}`;

	return (
		<div className="inline-flex items-center gap-0.5 rounded-full bg-transparent p-0.5">
			<button
				onClick={navigateBack}
				disabled={!canGoBack}
				className={buttonClass(canGoBack)}
				aria-label="Go back to previous page"
				title="Go back"
			>
				<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
				</svg>
			</button>
			<button
				onClick={navigateForward}
				disabled={!canGoForward}
				className={buttonClass(canGoForward)}
				aria-label="Go forward to next page"
				title="Go forward"
			>
				<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
				</svg>
			</button>
		</div>
	);
}
