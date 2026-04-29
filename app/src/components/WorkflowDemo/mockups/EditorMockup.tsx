import type React from 'react';
import { useMemo } from 'react';
import MockReceiptEditorPage from '@landing/pages/MockReceiptEditorPage';
import { MOCK_RECEIPTS } from '@landing/mock-data';

const noop = () => {};

export default function EditorMockup(): React.ReactElement {
	const receipt = useMemo(() => MOCK_RECEIPTS[0] ?? null, []);

	return (
		<div className="w-full overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-xl overflow-hidden" aria-hidden="true">
			<MockReceiptEditorPage receipt={receipt} onBack={noop} />
		</div>
	);
}
