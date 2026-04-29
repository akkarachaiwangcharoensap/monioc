import { useEffect, useState } from 'react';
import type React from 'react';
import DemoAppWindow from '../DemoAppWindow';

const GITHUB_URL = process.env.NEXT_PUBLIC_GITHUB_URL ?? 'https://github.com/akkarachaiwangcharoensap/monioc';
const RELEASES_URL = `${GITHUB_URL}/releases/latest`;

export default function Hero(): React.ReactElement {
	const [visible, setVisible] = useState(false);
	useEffect(() => { setVisible(true); }, []);

	return (
		<section className="relative overflow-hidden pb-6 pt-24 sm:pb-8 sm:pt-32">
			{/* Gradient background orbs */}
			<div className="pointer-events-none absolute left-1/4 top-20 h-96 w-96 rounded-full bg-violet-200/30 blur-3xl" />
			<div className="pointer-events-none absolute bottom-10 right-1/4 h-80 w-80 rounded-full bg-emerald-200/20 blur-3xl" />

			<div className="relative mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
				<h1
					className="text-3xl font-extrabold tracking-tight text-slate-900 transition-all duration-500 ease-out sm:text-4xl lg:text-5xl"
					style={{
						fontFamily: "'Plus Jakarta Sans', sans-serif",
						opacity: visible ? 1 : 0,
						transform: visible ? 'none' : 'translateY(16px)',
					}}
				>
					<p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Free &amp; Open Source</p>
					<span className="bg-gradient-to-r from-violet-600 to-emerald-500 bg-clip-text text-transparent">
						Grocery Receipts Tracker.
					</span>
				</h1>

				<p
					className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-600 transition-all duration-500 ease-out sm:text-lg"
					style={{
						fontFamily: "'Plus Jakarta Sans', sans-serif",
						opacity: visible ? 1 : 0,
						transform: visible ? 'none' : 'translateY(16px)',
						transitionDelay: '80ms',
					}}
				>
					Scan receipts, track what you paid, and compare prices to Statistics Canada averages.
				</p>

				<div
					className="mt-8 flex flex-col items-center justify-center gap-3 transition-all duration-500 ease-out sm:flex-row"
					style={{
						opacity: visible ? 1 : 0,
						transform: visible ? 'none' : 'translateY(16px)',
						transitionDelay: '140ms',
					}}
				>
					{/* <a
						href="#download"
						className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
					>
						Download for free
					</a> */}
					<a
						href={GITHUB_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 inline-flex items-center gap-2"
					>
						<i className="fab fa-github text-[13px]" aria-hidden="true" />
						View on GitHub
					</a>
				</div>

				{/* <div
					id="download"
					className="mt-6 flex flex-col items-center gap-4 transition-all duration-500 ease-out"
					style={{
						opacity: visible ? 1 : 0,
						transform: visible ? 'none' : 'translateY(16px)',
						transitionDelay: '180ms',
					}}
				>
					<p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Download for your platform</p>
					<div className="grid w-full max-w-2xl grid-cols-3 gap-3">
						<a
							href={`${RELEASES_URL}/download/Monioc.dmg`}
							className="group flex flex-col items-center rounded-[24px] border border-slate-200 bg-white px-3 py-4 text-center shadow-sm transition-shadow hover:shadow-md hover:border-slate-300"
						>
							<span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-[22px] text-slate-900 transition-colors group-hover:bg-violet-50 group-hover:text-violet-700">
								<i className="fab fa-apple" aria-hidden="true" />
							</span>
							<p className="mt-2.5 text-xs font-semibold text-slate-900">macOS</p>
							<p className="mt-1 text-[11px] font-medium text-violet-600">Download →</p>
						</a>
						<a
							href={`${RELEASES_URL}/download/Monioc-setup.exe`}
							className="group flex flex-col items-center rounded-[24px] border border-slate-200 bg-white px-3 py-4 text-center shadow-sm transition-shadow hover:shadow-md hover:border-slate-300"
						>
							<span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-[22px] text-slate-900 transition-colors group-hover:bg-violet-50 group-hover:text-violet-700">
								<i className="fab fa-windows" aria-hidden="true" />
							</span>
							<p className="mt-2.5 text-xs font-semibold text-slate-900">Windows</p>
							<p className="mt-1 text-[11px] font-medium text-violet-600">Download →</p>
						</a>
						<a
							href={`${RELEASES_URL}/download/monioc.AppImage`}
							className="group flex flex-col items-center rounded-[24px] border border-slate-200 bg-white px-3 py-4 text-center shadow-sm transition-shadow hover:shadow-md hover:border-slate-300"
						>
							<span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-[22px] text-slate-900 transition-colors group-hover:bg-violet-50 group-hover:text-violet-700">
								<i className="fab fa-linux" aria-hidden="true" />
							</span>
							<p className="mt-2.5 text-xs font-semibold text-slate-900">Linux</p>
							<p className="mt-1 text-[11px] font-medium text-violet-600">Download →</p>
						</a>
					</div>
					<p className="text-[11px] text-slate-400">
						Or{' '}
						<a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline">
							browse all releases
						</a>
						{' '}on GitHub
					</p>
				</div> */}

				{/* App window preview - interactive demo */}
				<div
					className="mx-auto mt-12 max-w-4xl transition-all duration-700 ease-out"
					style={{
						opacity: visible ? 1 : 0,
						transform: visible ? 'none' : 'translateY(24px)',
						transitionDelay: '220ms',
					}}
				>
					<DemoAppWindow />
				</div>
			</div>
		</section>
	);
}
