/**
 * Mock Settings page for the landing demo.
 * Matches the real SettingsPage: AI Models section first, then Storage.
 */
import type React from 'react';

export default function MockSettingsPage(): React.ReactElement {
	return (
		<div className="min-h-full bg-white">
			<main className="container mx-auto px-4 pt-8 pb-10 max-w-3xl">
				<div className="mb-8">
					<h1 className="text-2xl font-semibold text-slate-900 tracking-tight text-left">Settings</h1>
					<p className="text-slate-500 mt-1 text-base text-left">Storage and AI model management.</p>
				</div>

				<section className="rounded-2xl border border-slate-200 bg-white p-5">
					<div className="flex items-start justify-between gap-4">
						<div className="flex items-start gap-3">
							<div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
								<i className="fas fa-brain text-sm text-blue-500" aria-hidden="true" />
							</div>
							<div>
								<p className="text-sm font-semibold text-slate-800 text-left">AI Models</p>
								<p className="text-xs text-slate-500 mt-0.5 text-left">Ready · 5.34 GB</p>
							</div>
						</div>
						<button
							type="button"
							className="inline-flex items-center gap-1.5 rounded-full border border-red-200 px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-50 active:scale-[0.98] transition-all cursor-pointer"
						>
							<i className="fas fa-trash-alt text-[10px]" aria-hidden="true" />
							Remove
						</button>
					</div>

					<div className="mt-3 flex items-center gap-1.5">
						<span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
						<span className="text-xs text-emerald-700">Ready to scan receipts</span>
					</div>
				</section>

				<section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
					<div className="flex items-center justify-between">
						<h2 className="text-base font-semibold text-slate-800">Storage</h2>
						<button
							type="button"
							className="text-xs text-slate-500 hover:text-slate-700 disabled:opacity-50 transition-colors cursor-pointer"
						>
							<i className="fas fa-sync-alt mr-1" aria-hidden="true" />
							Refresh
						</button>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-center">
							<p className="text-2xl font-semibold text-slate-800">847</p>
							<p className="text-xs text-slate-500 mt-0.5">Files</p>
						</div>
						<div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-center">
							<p className="text-2xl font-semibold text-slate-800">458 MB</p>
							<p className="text-xs text-slate-500 mt-0.5">Total size</p>
						</div>
					</div>

					<div className="rounded-xl bg-slate-50 border border-slate-100 divide-y divide-slate-100">
						<div className="flex items-center justify-between px-4 py-2.5">
							<span className="flex items-center gap-2 text-xs text-slate-600">
								<i className="fas fa-database w-3 text-slate-400" aria-hidden="true" />
								Database
							</span>
							<span className="text-xs font-medium text-slate-700 tabular-nums">12 MB</span>
						</div>
						<div className="flex items-center justify-between px-4 py-2.5 gap-3">
							<span className="flex items-center gap-2 text-xs text-slate-600">
								<i className="fas fa-image w-3 text-slate-400" aria-hidden="true" />
								Receipt files
								<span className="relative group">
									<i className="fas fa-circle-info text-[10px] text-slate-300 cursor-help" aria-hidden="true" />
									<span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-48 rounded-lg bg-slate-800 px-3 py-2 text-[11px] leading-relaxed text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50">
										Includes saved receipt images and temporary files created during scanning.
									</span>
								</span>
							</span>
							<div className="flex items-center gap-3">
								<span className="text-xs font-medium text-slate-700 tabular-nums">446 MB</span>
								<button
									type="button"
									className="text-xs text-red-500 hover:text-red-700 transition-colors cursor-pointer"
								>
									Clear
								</button>
							</div>
						</div>
						<div className="flex items-center justify-between px-4 py-2.5">
							<span className="flex items-center gap-2 text-xs text-slate-600">
								<i className="fas fa-brain w-3 text-slate-400" aria-hidden="true" />
								AI Models
							</span>
							<span className="text-xs font-medium text-slate-700 tabular-nums">5.34 GB</span>
						</div>
					</div>

					<div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
						<p className="text-xs font-medium text-slate-600 mb-1 text-left">Location</p>
						<p className="text-xs text-slate-500 break-all font-mono text-left">~/Library/Application Support/com.monioc.grocery</p>
					</div>

					<div className="flex flex-wrap gap-2 pt-1">
						<button
							type="button"
							className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
						>
							<i className="fas fa-folder-open text-xs" aria-hidden="true" />
							Open Folder
						</button>
						<button
							type="button"
							className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-violet-200 text-sm text-violet-700 hover:bg-violet-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
						>
							<i className={`fas fa-rotate-right text-xs`} aria-hidden="true" />
							Refresh Cache
						</button>
						<button
							type="button"
							className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-red-200 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
						>
							<i className="fas fa-trash-alt text-xs" aria-hidden="true" />
							Remove All
						</button>
					</div>
				</section>
			</main>
		</div>
	);
}
