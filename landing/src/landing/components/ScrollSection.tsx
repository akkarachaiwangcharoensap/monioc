import type React from 'react';
import { useScrollReveal } from '../hooks/useScrollReveal';

interface ScrollSectionProps {
	eyebrow: string;
	eyebrowColor?: 'violet' | 'emerald' | 'amber';
	title: string;
	description: string;
	visual: React.ReactNode;
	visualClassName?: string;
	flip?: boolean;
}

const eyebrowColors = {
	violet: 'text-violet-600 bg-violet-50',
	emerald: 'text-emerald-600 bg-emerald-50',
	amber: 'text-amber-600 bg-amber-50',
} as const;

export default function ScrollSection({
	eyebrow,
	eyebrowColor = 'violet',
	title,
	description,
	visual,
	visualClassName,
	flip = false,
}: ScrollSectionProps): React.ReactElement {
	const ref = useScrollReveal();

	return (
		<div ref={ref} className="reveal-block">
			<div className={`flex flex-col ${flip ? 'md:flex-row-reverse' : 'md:flex-row'} items-center gap-10 md:gap-16`}>
				<div className="md:flex-[0.8] min-w-0">
					<span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${eyebrowColors[eyebrowColor]} mb-3`}>
						{eyebrow}
					</span>
					<h2
						className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mb-3"
						style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
					>
						{title}
					</h2>
					<p className="text-base text-slate-600 leading-relaxed">{description}</p>
				</div>
				<div className={`w-full min-w-0 md:flex-[1.18] ${visualClassName ?? 'max-w-md'}`}>{visual}</div>
			</div>
		</div>
	);
}
