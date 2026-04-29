import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type React from 'react';
import { save, open as openFilePicker, confirm as confirmDialog } from '@tauri-apps/plugin-dialog';
import { TauriApi, type BackupInfo } from '../services/api';
import { parseTauriError } from '../services/errors';
import { formatBytes } from '../utils';

export default function BackupPage(): React.ReactElement {
	const [exporting, setExporting] = useState(false);
	const [importing, setImporting] = useState(false);
	const [lastBackup, setLastBackup] = useState<BackupInfo | null>(null);
	const [toastMsg, setToastMsg] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);

	const showToast = useCallback((text: string, kind: 'success' | 'error') => {
		setToastMsg({ text, kind });
		setTimeout(() => setToastMsg(null), 3000);
	}, []);

	const handleExport = useCallback(async () => {
		const now = new Date();
		const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
		const destPath = await save({
			defaultPath: `grocery-backup-${stamp}.gbak`,
			filters: [{ name: 'Grocery Backup', extensions: ['gbak'] }],
		});
		if (!destPath) return;

		setExporting(true);
		try {
			const info = await TauriApi.exportBackup(destPath);
			setLastBackup(info);
			showToast(`Backup saved (${formatBytes(info.sizeBytes)}).`, 'success');
		} catch (err) {
			showToast(`Export failed: ${parseTauriError(err)}`, 'error');
		} finally {
			setExporting(false);
		}
	}, [showToast]);

	const handleImport = useCallback(async () => {
		const sourcePath = await openFilePicker({
			multiple: false,
			filters: [{ name: 'Grocery Backup', extensions: ['gbak'] }],
		});
		if (!sourcePath) return;

		const confirmed = await confirmDialog(
			'Importing a backup will replace ALL current data (receipts, categories, settings). This cannot be undone.\n\nContinue?',
			{ title: 'Restore from Backup', kind: 'warning' },
		);
		if (!confirmed) return;

		setImporting(true);
		try {
			await TauriApi.importBackup(sourcePath);
			showToast('Backup restored. The app will reload now.', 'success');
			// Give the user a moment to read the message, then reload to pick up new data.
			setTimeout(() => { window.location.reload(); }, 1500);
		} catch (err) {
			showToast(`Import failed: ${parseTauriError(err)}`, 'error');
		} finally {
			setImporting(false);
		}
	}, [showToast]);

	return (
		<>
		<div className="min-h-screen bg-white">
			<main className="container mx-auto px-4 pt-8 pb-10 max-w-3xl">

				<div className="mb-8">
					<h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Backup &amp; Restore</h1>
					<p className="text-slate-500 mt-1 text-base">
						Export your data to a file or restore from a previous backup.
					</p>
				</div>

				{/* ── Export section ──────────────────────────────────── */}
				<section className="rounded-2xl border border-slate-200 bg-white p-5">
					<div className="flex items-start justify-between gap-4">
						<div>
							<p className="text-sm font-semibold text-slate-800">Export backup</p>
							<p className="text-xs text-slate-500 mt-1">
								Save a full copy of your database — receipts, categories, and settings — to a file on your computer.
							</p>
						</div>
						<button
							type="button"
							disabled={exporting}
							onClick={() => void handleExport()}
							className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors flex-shrink-0 disabled:opacity-50 cursor-pointer"
						>
							{exporting ? (
								<i className="fas fa-spinner fa-spin text-xs" aria-hidden="true" />
							) : (
								<i className="fas fa-download text-xs" aria-hidden="true" />
							)}
							{exporting ? 'Saving…' : 'Save Backup'}
						</button>
					</div>

					{lastBackup && (
						<div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
							<p className="text-xs font-medium text-slate-600 mb-1">Last export</p>
							<p className="text-xs text-slate-500 break-all font-mono">{lastBackup.path}</p>
						<p className="text-xs text-slate-400 mt-1">
							{formatBytes(lastBackup.sizeBytes)}
							{lastBackup.entryCount > 0 && (
								<span className="ml-2 text-slate-300">·</span>
							)}
							{lastBackup.entryCount > 0 && (
								<span className="ml-2">{lastBackup.entryCount} file{lastBackup.entryCount !== 1 ? 's' : ''} archived</span>
							)}
						</p>
						</div>
					)}
				</section>

				{/* ── Import section ──────────────────────────────────── */}
				<section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
					<div className="flex items-start justify-between gap-4">
						<div>
							<p className="text-sm font-semibold text-slate-800">Restore from backup</p>
							<p className="text-xs text-slate-500 mt-1">
								Replace all current data — receipts, images, and categories — with a previously exported <code className="font-mono">.gbak</code> file. The app will reload after restore.
							</p>
						</div>
						<button
							type="button"
							disabled={importing}
							onClick={() => void handleImport()}
							className="inline-flex items-center gap-2 rounded-full border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors flex-shrink-0 disabled:opacity-50 cursor-pointer"
						>
							{importing ? (
								<i className="fas fa-spinner fa-spin text-xs" aria-hidden="true" />
							) : (
								<i className="fas fa-upload text-xs" aria-hidden="true" />
							)}
							{importing ? 'Restoring…' : 'Restore'}
						</button>
					</div>
				</section>

				{/* ── Tip ─────────────────────────────────────────────── */}
				<div className="mt-8 rounded-2xl bg-slate-50 border border-slate-100 px-5 py-4">
					<p className="text-xs font-medium text-slate-600 mb-1">
						<i className="fas fa-lightbulb text-amber-400 mr-1.5" aria-hidden="true" />
						Tip
					</p>
					<p className="text-xs text-slate-500 leading-relaxed">
					Back up regularly — especially before importing data or updating the app. Backups include all receipts, receipt images, categories, and colour settings in a single compressed <code className="font-mono">.gbak</code> file.
					</p>
				</div>
			</main>
		</div>

		{/* ── Status toast (portalled to body) ─────────────────────────────── */}
		{createPortal(
			<div
				className={`fixed bottom-5 right-6 z-50 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white pointer-events-none select-none transition-opacity duration-200 ${
					toastMsg
						? toastMsg.kind === 'error'
							? 'opacity-100 bg-red-600'
							: 'opacity-100 bg-emerald-600'
						: 'opacity-0'
				}`}
			>
				{toastMsg && (
					<>
						<i className={`fas ${toastMsg.kind === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'}`} aria-hidden="true" />
						<span>{toastMsg.text}</span>
					</>
				)}
			</div>,
			document.body,
		)}
		</>
	);
}
