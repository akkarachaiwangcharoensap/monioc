import type React from 'react';

interface ErrorBannerProps {
	message: string;
	onDismiss: () => void;
}

export default function ErrorBanner({ message, onDismiss }: ErrorBannerProps): React.ReactElement {
	return (
		<div
			role="alert"
			className="mb-4 flex items-center rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
		>
			<i className="fas fa-circle-exclamation mr-2 flex-shrink-0" aria-hidden="true" />
			<span className="flex-1">{message}</span>
			<button
				type="button"
				onClick={onDismiss}
				aria-label="Dismiss error"
				className="ml-3 underline cursor-pointer hover:text-red-800 transition-colors"
			>
				Dismiss
			</button>
		</div>
	);
}
