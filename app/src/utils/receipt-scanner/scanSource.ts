/**
 * Helpers for choosing receipt image paths during scan and persistence.
 *
 * We keep the original image path as the canonical receipt identity,
 * while allowing scans to run against a temporary edited/cropped image.
 */

/**
 * Resolve the path that OCR should scan.
 *
 * Priority:
 * 1. Edited path bound to the base image in `edits`.
 * 2. Current active image path.
 */
export function resolveScanSourcePath(
  basePath: string | null,
  activeImagePath: string,
  edits: Record<string, string>,
): string {
  if (basePath) {
    const edited = edits[basePath];
    if (edited) return edited;
  }
  return activeImagePath;
}

/**
 * Resolve the path persisted as `imagePath` for the receipt record.
 *
 * When available, we keep `basePath` so records remain attached to the
 * original source image even after temporary edits.
 */
export function resolvePersistedReceiptImagePath(
  basePath: string | null,
  activeImagePath: string,
): string {
  return basePath ?? activeImagePath;
}
