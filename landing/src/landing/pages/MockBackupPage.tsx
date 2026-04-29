/**
 * Mock Backup & Restore page for the landing demo.
 * Matches the design of the real BackupPage.
 */
import type React from 'react';

export default function MockBackupPage(): React.ReactElement {
	return (
		<div className="min-h-full bg-white">
			<main className="container mx-auto px-4 pt-8 pb-10 max-w-3xl text-left">
				{/* Header */}
				<div className="mb-8">
					<h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Backup &amp; Restore</h1>
					<p className="text-slate-500 mt-1 text-base">
						Export your data to a file or restore from a previous backup.
					</p>
				</div>

				{/* ── Export section ────────────────────────────────────── */}
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
							className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors flex-shrink-0 cursor-pointer"
						>
							<i className="fas fa-download text-xs" aria-hidden="true" />
							Save Backup
						</button>
					</div>
				</section>

				{/* ── Import section ────────────────────────────────────── */}
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
							className="inline-flex items-center gap-2 rounded-full border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors flex-shrink-0 cursor-pointer"
						>
							<i className="fas fa-upload text-xs" aria-hidden="true" />
							Restore
						</button>
					</div>
				</section>

				{/* ── Tip ──────────────────────────────────────────────── */}
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
	);
}
