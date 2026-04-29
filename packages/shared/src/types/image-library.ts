/**
 * Image library types.
 *
 * The image library is a persistent Rust-side store of images staged for
 * receipt scanning.  Entries survive app restarts and tab closes.
 */

/** A single entry in the image library (mirrors Rust `ImageLibraryEntry`). */
export interface ImageLibraryEntry {
	id: number;
	filePath: string;
	addedAt: string;
	thumbnailPath: string | null;
	receiptId: number | null;
	stagingPath: string | null;
}
