import { useCallback } from 'react';
import type React from 'react';
import MockDashboardPage from '@landing/pages/MockDashboardPage';

const noop = () => {};

export default function ExportMockup(): React.ReactElement {
	const handleOpenReceipt = useCallback(noop, []);
	const handleNavigate = useCallback(noop, []);

	return (
		<div className="w-full overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-xl overflow-hidden" aria-hidden="true">
			<MockDashboardPage onOpenReceipt={handleOpenReceipt} onNavigate={handleNavigate} />
		</div>
	);
}
