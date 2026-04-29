/**
 * ImageLibraryContext — persistent, tab-independent image staging.
 *
 * Replaces the in-memory `imageQueue` that was stored in TabMemory.
 * Backed by a Rust-side SQLite table.  Re-fetches automatically when
 * the backend emits `library:changed`.
 */

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from 'react';
import type React from 'react';
import { listen } from '@tauri-apps/api/event';
import type { ImageLibraryEntry } from '../types';
import { TauriApi } from '../services/api';
import { AppEvents } from '../constants';

// ── Context shape ─────────────────────────────────────────────────────────────

interface ImageLibraryContextValue {
	/** Live list of images from the Rust-side library (newest first). */
	images: ImageLibraryEntry[];
	/** True during the initial fetch on mount. */
	isLoading: boolean;
	/** Add images to the library. Returns the newly created entries. */
	addImages: (paths: string[]) => Promise<ImageLibraryEntry[]>;
	/** Remove a single image from the library. */
	removeImage: (id: number) => Promise<void>;
	/** Remove all images from the library. */
	clearLibrary: () => Promise<void>;
	/** Link an image to a receipt after a successful scan. */
	linkToReceipt: (imageId: number, receiptId: number) => Promise<void>;
	/** Update the staging (crop) path for an image. */
	updateStaging: (id: number, stagingPath: string | null) => Promise<void>;
	/** Look up a single entry by ID from the current cache. */
	getEntry: (id: number) => ImageLibraryEntry | undefined;
}

const ImageLibraryContext = createContext<ImageLibraryContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function ImageLibraryProvider({
	children,
}: {
	children: React.ReactNode;
}): React.JSX.Element {
	const [images, setImages] = useState<ImageLibraryEntry[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	// Debounce re-fetches to coalesce rapid backend mutations (50ms).
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const fetchLibrary = useCallback(async () => {
		try {
			const list = await TauriApi.getImageLibrary();
			setImages((prev) => {
				// Preserve any in-flight optimistic entries (negative IDs) so that
				// a library:changed event fired by image N doesn't wipe the
				// placeholders for images N+1, N+2, … that aren't in the DB yet.
				const optimistic = prev.filter((e) => e.id < 0);
				if (optimistic.length === 0) return list;
				// Exclude real entries whose file path still has a pending placeholder
				// (the placeholder will be swapped by the upload loop's setImages map).
				const optimisticPaths = new Set(optimistic.map((e) => e.filePath));
				const realWithoutPending = list.filter((e) => !optimisticPaths.has(e.filePath));
				return [...optimistic, ...realWithoutPending];
			});
		} catch (err) {
			console.error('Failed to fetch image library:', err);
		}
	}, []);

	// Initial fetch on mount.
	useEffect(() => {
		fetchLibrary().then(() => setIsLoading(false));
	}, [fetchLibrary]);

	// Listen to `library:changed` events from the backend.
	useEffect(() => {
		const unlisten = listen(AppEvents.LIBRARY_CHANGED, () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
			debounceRef.current = setTimeout(() => {
				void fetchLibrary();
			}, 50);
		});

		return () => {
			unlisten.then((fn) => fn());
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [fetchLibrary]);

	/** Snapshot ref kept in sync on every render so addImages can read it synchronously. */
	const imagesRef = useRef(images);
	useEffect(() => { imagesRef.current = images; });

	const addImages = useCallback(
		async (paths: string[]): Promise<ImageLibraryEntry[]> => {
			// Read current state synchronously via ref to decide which paths need
			// a placeholder.  Paths already visible in the inbox (receiptId == null)
			// do not get one — that would produce a brief duplicate flash on reupload.
			const inboxPaths = new Set(
				imagesRef.current
					.filter((e) => e.receiptId == null)
					.map((e) => e.filePath),
			);

			const now = new Date().toISOString();
			// Build placeholders synchronously (outside any setState callback) so
			// the for-loop below can reference them by identity once it resumes.
			const optimisticEntries: ImageLibraryEntry[] = paths
				.filter((p) => !inboxPaths.has(p))
				.map((p, i) => ({
					id: -(Date.now() + i),
					filePath: p,
					addedAt: now,
					thumbnailPath: null,
					receiptId: null,
					stagingPath: null,
				}));

			if (optimisticEntries.length > 0) {
				setImages((prev) => [...optimisticEntries, ...prev]);
			}

			// Process each image one-by-one so the Rust side can generate
			// thumbnails and emit library-changed events per image.
			const allEntries: ImageLibraryEntry[] = [];
			for (const path of paths) {
				const placeholder = optimisticEntries.find((e) => e.filePath === path);
				try {
					const entries = await TauriApi.addImagesToLibrary([path]);
					const entry = entries[0];
					if (entry) {
						setImages((prev) => {
							// If the entry already exists in state (Rust returned an existing
							// DB entry for a duplicate path), update it in-place and remove
							// any placeholder — avoids a momentary visual duplicate.
							const alreadyPresent = prev.some(
								(e) => e.id === entry.id && e.id > 0,
							);
							if (alreadyPresent) {
								return prev
									.filter((e) => e.id !== (placeholder?.id ?? -Infinity))
									.map((e) => (e.id === entry.id ? entry : e));
							}
							// Genuinely new entry — replace the placeholder.
							if (placeholder) {
								return prev.map((e) =>
									e.id === placeholder.id ? entry : e,
								);
							}
							return prev;
						});
						allEntries.push(entry);
					} else if (placeholder) {
						setImages((prev) =>
							prev.filter((e) => e.id !== placeholder.id),
						);
					}
				} catch (err) {
					if (placeholder) {
						setImages((prev) =>
							prev.filter((e) => e.id !== placeholder.id),
						);
					}
					console.error('Failed to add image to library:', path, err);
				}
			}

			return allEntries;
		},
		[],
	);

	const removeImage = useCallback(async (id: number): Promise<void> => {
		await TauriApi.removeFromLibrary(id);
		setImages((prev) => prev.filter((e) => e.id !== id));
	}, []);

	const clearLibraryFn = useCallback(async (): Promise<void> => {
		await TauriApi.clearLibrary();
		setImages([]);
	}, []);

	const linkToReceipt = useCallback(
		async (imageId: number, receiptId: number): Promise<void> => {
			await TauriApi.linkImageToReceipt(imageId, receiptId);
			// Optimistic update.
			setImages((prev) =>
				prev.map((e) =>
					e.id === imageId ? { ...e, receiptId } : e,
				),
			);
		},
		[],
	);

	const updateStaging = useCallback(
		async (id: number, stagingPath: string | null): Promise<void> => {
			await TauriApi.updateLibraryEntryStaging(id, stagingPath);
			setImages((prev) =>
				prev.map((e) =>
					e.id === id ? { ...e, stagingPath } : e,
				),
			);
		},
		[],
	);

	const getEntry = useCallback(
		(id: number): ImageLibraryEntry | undefined =>
			images.find((e) => e.id === id),
		[images],
	);

	const value: ImageLibraryContextValue = {
		images,
		isLoading,
		addImages,
		removeImage,
		clearLibrary: clearLibraryFn,
		linkToReceipt,
		updateStaging,
		getEntry,
	};

	return (
		<ImageLibraryContext.Provider value={value}>
			{children}
		</ImageLibraryContext.Provider>
	);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useImageLibrary(): ImageLibraryContextValue {
	const ctx = useContext(ImageLibraryContext);
	if (!ctx)
		throw new Error(
			'useImageLibrary must be used within <ImageLibraryProvider>',
		);
	return ctx;
}
