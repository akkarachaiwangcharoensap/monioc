import type React from 'react';

/** Animated placeholder shown while receipt data is loading or hydrating. */
export default function SkeletonBlock(): React.ReactElement {
	return (
		<div className="space-y-3 animate-pulse">
			<div className="h-4 w-40 bg-slate-200 rounded"></div>
			<div className="h-16 w-full bg-slate-100 rounded-2xl"></div>
			<div className="h-16 w-full bg-slate-100 rounded-2xl"></div>
			<div className="h-16 w-full bg-slate-100 rounded-2xl"></div>
		</div>
	);
}
