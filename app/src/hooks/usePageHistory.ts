import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';

/**
 * Hook to track page navigation history and provide back/forward functionality.
 * Uses React Router's built-in history navigation (navigate(-1/1)) and keeps
 * a lightweight in-memory timeline so UI can know when back/forward is available.
 */
export function usePageHistory() {
	const location = useLocation();
	const navigate = useNavigate();
	const navigationType = useNavigationType();
	const locationKey = location.key;
	const locationHref = useMemo(
		() => `${location.pathname}${location.search}${location.hash}`,
		[location.pathname, location.search, location.hash],
	);

	type HistoryEntry = { key: string; href: string };

	const [timeline, setTimeline] = useState<{ entries: HistoryEntry[]; index: number }>(() => ({
		entries: [{ key: locationKey, href: locationHref }],
		index: 0,
	}));

	// Track page visits
	useEffect(() => {
		setTimeline((prev) => {
			if (prev.entries.length === 0) {
				return { entries: [{ key: locationKey, href: locationHref }], index: 0 };
			}

			const current = prev.entries[prev.index];
			if (current?.key === locationKey && current?.href === locationHref) {
				return prev;
			}

			if (navigationType === 'POP') {
				const keyIdx = prev.entries.findIndex((entry) => entry.key === locationKey);
				if (keyIdx >= 0) return { ...prev, index: keyIdx };

				const hrefIdx = prev.entries.findIndex((entry) => entry.href === locationHref);
				if (hrefIdx >= 0) return { ...prev, index: hrefIdx };

				const nextEntries = [...prev.entries, { key: locationKey, href: locationHref }];
				return { entries: nextEntries, index: nextEntries.length - 1 };
			}

			if (navigationType === 'REPLACE') {
				const nextEntries = [...prev.entries];
				nextEntries[prev.index] = { key: locationKey, href: locationHref };
				return { entries: nextEntries, index: prev.index };
			}

			const base = prev.entries.slice(0, prev.index + 1);
			base.push({ key: locationKey, href: locationHref });
			return { entries: base, index: base.length - 1 };
		});
	}, [locationKey, locationHref, navigationType]);

	const goBack = () => {
		if (timeline.index <= 0) return;
		navigate(-1);
	};

	const goForward = () => {
		if (timeline.index >= timeline.entries.length - 1) return;
		navigate(1);
	};

	const canGoBack = timeline.index > 0;
	const canGoForward = timeline.index < timeline.entries.length - 1;

	return { goBack, goForward, canGoBack, canGoForward };
}
