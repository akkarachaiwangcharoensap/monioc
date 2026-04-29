import Image from 'next/image';
import type React from 'react';

const GITHUB_URL = process.env.NEXT_PUBLIC_GITHUB_URL ?? 'https://github.com/your-org/monioc';

export default function Nav(): React.ReactElement {
	return (
		<nav className="fixed top-0 left-0 right-0 z-50 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
			<div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
				<div className="flex items-center gap-1">
					<Image src="/monioc-app.png" alt="Monioc logo" width={32} height={32} className="w-8 h-8 object-contain flex-shrink-0 rounded-xl" />
					<span className="text-lg font-bold tracking-tight text-slate-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
						Monioc
					</span>
				</div>
				<div className="hidden items-center gap-6 text-[13px] font-medium text-slate-600 sm:flex">
					<a href="#features" className="transition-colors hover:text-slate-900">Features</a>
					<a href="#workflow" className="transition-colors hover:text-slate-900">Workflow</a>
				</div>
				<div className="flex items-center gap-2">
					<a
						href={GITHUB_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="hidden rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 sm:inline-flex items-center gap-1.5"
					>
						<i className="fab fa-github text-[13px]" aria-hidden="true" />
						GitHub
					</a>
					{/* <a
						href="#download"
						className="rounded-full bg-slate-900 px-3.5 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-slate-800"
					>
						Download Free
					</a> */}
				</div>
			</div>
		</nav>
	);
}
