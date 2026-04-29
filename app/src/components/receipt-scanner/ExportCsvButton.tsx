import type React from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { TauriApi } from '../../services/api';
import type { ReceiptData, ReceiptRow } from '../../types';

interface ExportCsvButtonProps {
	rows: ReceiptRow[];
	scanId: number | null;
}

/**
 * Triggers a Tauri save-dialog and delegates CSV generation to Rust.
 */
export default function ExportCsvButton({
	rows,
	scanId,
}: ExportCsvButtonProps): React.ReactElement {
	const handleExport = async () => {
		const defaultPath = scanId != null ? `receipt-${scanId}.csv` : 'receipt.csv';
		const filePath = await save({
			defaultPath,
			filters: [{ name: 'CSV', extensions: ['csv'] }],
		});
		if (!filePath) return;
		await TauriApi.exportReceiptCsv({
			data: { rows } satisfies ReceiptData,
			destPath: filePath,
		});
	};

	return (
		<button
			onClick={() => {
				void handleExport();
			}}
			className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
		>
			<i className="fas fa-file-csv" aria-hidden="true" />
			Export CSV
		</button>
	);
}
