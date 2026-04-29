import type React from 'react';
import MockStatisticsPage from '../../../landing/pages/MockStatisticsPage';

export default function StatsMockup(): React.ReactElement {
	return (
		<div className="w-full overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-xl overflow-hidden" aria-hidden="true">
			<MockStatisticsPage />
		</div>
	);
}
