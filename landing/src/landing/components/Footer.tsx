import type React from 'react';

const GITHUB_URL = process.env.NEXT_PUBLIC_GITHUB_URL ?? 'https://github.com/your-org/monioc';

export default function Footer(): React.ReactElement {
	return (
		<footer className="border-t border-slate-200/80 bg-slate-50 py-5">
			<div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
				<div className="flex flex-col items-center justify-between gap-5 sm:flex-row">
					<div className="flex items-center gap-1">
						<img src="/monioc/monioc-app.png" alt="Monioc logo" className="h-7 w-7 flex-shrink-0 rounded-lg object-contain" />
						<span className="text-sm font-bold text-slate-700" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
							Monioc
						</span>
					</div>
					<p className="text-center text-xs text-slate-400 sm:text-left">
						&copy; {new Date().getFullYear()} Monioc contributors. Released under the{' '}
						<a href={`${GITHUB_URL}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 underline">
							MIT License
						</a>.
					</p>
					<div className="flex items-center gap-5 text-xs font-medium text-slate-500">
						<a
							href={GITHUB_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1.5 transition-colors hover:text-slate-800"
						>
							<i className="fab fa-github" aria-hidden="true" />
							GitHub
						</a>
						<a
							href={`${GITHUB_URL}/blob/main/CONTRIBUTING.md`}
							target="_blank"
							rel="noopener noreferrer"
							className="transition-colors hover:text-slate-800"
						>
							Contributing
						</a>
						<a
							href={`${GITHUB_URL}/issues`}
							target="_blank"
							rel="noopener noreferrer"
							className="transition-colors hover:text-slate-800"
						>
							Issues
						</a>
					</div>
				</div>
			</div>
		</footer>
	);
}
