import type React from 'react';

interface PageLayoutProps {
	children: React.ReactNode;
	/** Max width Tailwind class (default: 'max-w-4xl') */
	maxWidth?: string;
	className?: string;
}

/**
 * Consistent page-level wrapper providing background, centering, and padding.
 * Every top-level page should use this to maintain a uniform chrome.
 */
export default function PageLayout({
	children,
	maxWidth = 'max-w-4xl',
	className = '',
}: PageLayoutProps): React.ReactElement {
	return (
		<div className="min-h-screen bg-white">
			<div className={`mx-auto ${maxWidth} px-4 sm:px-6 lg:px-8 pt-8 pb-28 ${className}`.trim()}>
				{children}
			</div>
		</div>
	);
}
