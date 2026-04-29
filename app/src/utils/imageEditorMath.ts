/**
 * Pure geometry / coordinate helpers for ImageCropEditor.
 *
 * All functions are free of side-effects and carry no DOM / canvas / React
 * dependencies, making them fully unit-testable in a Node environment.
 *
 * COORDINATE CONTRACT
 * ───────────────────
 * `crop` values (x, y, w, h) are **normalised** — each in [0, 1] — relative to
 * the image's displayed area on the canvas (NOT the full canvas size).
 *
 * When Tauri's `edit_image` command receives these values it must multiply by:
 *   - `img.width()` (post-EXIF, post-rotation) to get the pixel x / w
 *   - `img.height()` (post-EXIF, post-rotation) to get the pixel y / h
 *
 * The browser side uses `img.naturalWidth` / `img.naturalHeight`, which modern
 * WebKit already returns in the EXIF-corrected orientation.  To keep the two
 * coordinate spaces in sync, `image::open()` on the Rust side MUST have the
 * `exif` feature enabled so it also reads the EXIF-corrected dimensions.
 */

// ─── types ───────────────────────────────────────────────────────────────────

export interface CropRect {
  x: number; // normalised 0-1 within the displayed image
  y: number;
  w: number;
  h: number;
}

export type HandleId =
  | 'tl' | 'tc' | 'tr'
  | 'ml' |        'mr'
  | 'bl' | 'bc' | 'br';

export interface Layout {
  imgX: number; // canvas-pixel offset from canvas origin
  imgY: number;
  imgW: number; // displayed image width in canvas pixels
  imgH: number;
}

/**
 * Minimal duck-type for a loaded image.  Compatible with `HTMLImageElement`
 * but does NOT require a DOM, so tests can run in Node / vitest without jsdom.
 */
export interface ImageSize {
  naturalWidth:  number;
  naturalHeight: number;
}

// ─── constants ───────────────────────────────────────────────────────────────

/** Radius (canvas pixels) of each crop handle for hit-testing. */
export const HANDLE_RADIUS = 7;

// ─── pure helpers ────────────────────────────────────────────────────────────

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Clamp crop so it never overflows [0, 1] × [0, 1].
 * Width / height are not changed (only position is clamped); callers are
 * responsible for enforcing a minimum size before calling.
 */
export function normaliseCrop(c: CropRect): CropRect {
  return {
    x: clamp(c.x, 0, 1 - c.w),
    y: clamp(c.y, 0, 1 - c.h),
    w: clamp(c.w, 0, 1),
    h: clamp(c.h, 0, 1),
  };
}

/**
 * Compute the letterboxed image layout within a canvas of `canvasW × canvasH`.
 *
 * `rotation` is in quarter-turns (0 = 0°, 1 = 90° CW, 2 = 180°, 3 = 270° CW).
 * For odd rotations the natural dimensions are swapped before fitting, matching
 * the canvas `ctx.rotate((r * Math.PI) / 2)` drawing convention.
 *
 * IMPORTANT: `img.naturalWidth` and `img.naturalHeight` must be the
 * EXIF-corrected display dimensions (which is what modern browsers / WebKit
 * return).  The returned layout is in the same space as the crop rect.
 */
export function computeLayout(
  canvasW: number,
  canvasH: number,
  img: ImageSize,
  rotation: number,
): Layout {
  const rotated = rotation % 2 !== 0;
  const srcW = rotated ? img.naturalHeight : img.naturalWidth;
  const srcH = rotated ? img.naturalWidth  : img.naturalHeight;
  const scale = Math.min(canvasW / srcW, canvasH / srcH);
  const imgW  = srcW * scale;
  const imgH  = srcH * scale;
  return {
    imgX: (canvasW - imgW) / 2,
    imgY: (canvasH - imgH) / 2,
    imgW,
    imgH,
  };
}

/** Canvas-pixel coordinates of all 8 crop handles. */
export function handlePositions(
  { imgX, imgY, imgW, imgH }: Layout,
  crop: CropRect,
): Record<HandleId, { cx: number; cy: number }> {
  const l  = imgX + crop.x * imgW;
  const t  = imgY + crop.y * imgH;
  const r  = l + crop.w * imgW;
  const b  = t + crop.h * imgH;
  const mx = (l + r) / 2;
  const my = (t + b) / 2;
  return {
    tl: { cx: l,  cy: t  }, tc: { cx: mx, cy: t  }, tr: { cx: r,  cy: t  },
    ml: { cx: l,  cy: my },                           mr: { cx: r,  cy: my },
    bl: { cx: l,  cy: b  }, bc: { cx: mx, cy: b  }, br: { cx: r,  cy: b  },
  };
}

/**
 * Return the HandleId of the handle nearest to `(px, py)`, or `null` if no
 * handle is within `HANDLE_RADIUS + 4` canvas pixels.
 */
export function hitTestHandle(
  px: number, py: number, layout: Layout, crop: CropRect,
): HandleId | null {
  for (const [id, pos] of Object.entries(handlePositions(layout, crop)) as
      [HandleId, { cx: number; cy: number }][]) {
    const dx = px - pos.cx;
    const dy = py - pos.cy;
    if (Math.sqrt(dx * dx + dy * dy) <= HANDLE_RADIUS + 4) return id;
  }
  return null;
}

/** Return `true` if `(px, py)` is strictly inside the current crop rectangle. */
export function hitTestInterior(
  px: number, py: number, layout: Layout, crop: CropRect,
): boolean {
  const l = layout.imgX + crop.x * layout.imgW;
  const t = layout.imgY + crop.y * layout.imgH;
  const r = l + crop.w * layout.imgW;
  const b = t + crop.h * layout.imgH;
  return px > l && px < r && py > t && py < b;
}

/**
 * Compute the new crop rectangle after dragging handle `handle` by a
 * normalised delta `(dx, dy)`.
 *
 * `minW` and `minH` are the minimum allowed width / height in **normalised**
 * units (caller converts from pixels: `MIN_CROP_PX / layout.imgW`).
 */
export function applyCropHandleDelta(
  handle: HandleId,
  dx: number,
  dy: number,
  start: CropRect,
  minW: number,
  minH: number,
): CropRect {
  let { x, y, w, h } = start;

  // Handles on the left edge → move x, shrink w
  if (handle === 'tl' || handle === 'ml' || handle === 'bl') {
    const nx = clamp(x + dx, 0, x + w - minW);
    w = w - (nx - x); x = nx;
  }
  // Handles on the right edge → only grow/shrink w
  if (handle === 'tr' || handle === 'mr' || handle === 'br') {
    w = clamp(w + dx, minW, 1 - x);
  }
  // Handles on the top edge → move y, shrink h
  if (handle === 'tl' || handle === 'tc' || handle === 'tr') {
    const ny = clamp(y + dy, 0, y + h - minH);
    h = h - (ny - y); y = ny;
  }
  // Handles on the bottom edge → only grow/shrink h
  if (handle === 'bl' || handle === 'bc' || handle === 'br') {
    h = clamp(h + dy, minH, 1 - y);
  }
  return normaliseCrop({ x, y, w, h });
}
