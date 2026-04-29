import { useState, useEffect, useMemo } from 'react';
import { stat } from '@tauri-apps/plugin-fs';

/**
 * Batches `stat()` calls for a list of file paths and returns a stable map of
 * `path → size in bytes` (or `null` when the file is unreadable / size unknown).
 *
 * Entries for paths that leave the list are evicted automatically.
 * The caller should memoize the `paths` array to avoid spurious effect runs.
 */
export function useFileSizes(paths: string[]): Record<string, number | null> {
	const [sizeMap, setSizeMap] = useState<Record<string, number | null>>({});

	// Evict entries whose paths are no longer tracked.
	useEffect(() => {
		setSizeMap((prev) => {
			const pathSet = new Set(paths);
			const pruned: Record<string, number | null> = {};
			for (const path of paths) {
				if (path in prev) pruned[path] = prev[path];
			}
			// Skip the update when nothing was evicted.
			return Object.keys(prev).some((k) => !pathSet.has(k)) ? pruned : prev;
		});
	}, [paths]); // NOTE: depends on reference identity — callers should memoize

	// Fetch sizes for paths not yet in the map.
	const missingPaths = useMemo(
		() => paths.filter((path) => sizeMap[path] === undefined),
		[paths, sizeMap],
	);

	useEffect(() => {
		if (missingPaths.length === 0) return;

		let cancelled = false;

		void (async () => {
			const entries = await Promise.all(
				missingPaths.map(async (path): Promise<[string, number | null]> => {
					try {
						const info = await stat(path);
						const size = Number.isFinite(info.size) ? info.size : null;
						return [path, size];
					} catch {
						return [path, null];
					}
				}),
			);

			if (cancelled) return;

			setSizeMap((prev) => {
				const next = { ...prev };
				for (const [path, size] of entries) next[path] = size;
				return next;
			});
		})();

		return () => {
			cancelled = true;
		};
	}, [missingPaths]);

	return sizeMap;
}
