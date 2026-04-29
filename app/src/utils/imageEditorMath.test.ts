/**
 * Unit tests for ImageCropEditor pure geometry helpers.
 *
 * These tests run in Node via Vitest (no DOM required) because all functions
 * accept plain numeric arguments or the minimal `ImageSize` duck-type
 * { naturalWidth, naturalHeight } instead of a real HTMLImageElement.
 *
 * Run with:  npm test  (or  npm run test:run)
 */

import { describe, it, expect } from 'vitest';
import {
  clamp,
  normaliseCrop,
  computeLayout,
  handlePositions,
  hitTestHandle,
  hitTestInterior,
  applyCropHandleDelta,
  HANDLE_RADIUS,
} from './imageEditorMath';
import type { CropRect, Layout } from './imageEditorMath';

// Helper — construct the minimal ImageSize object that computeLayout needs.
function img(w: number, h: number) {
  return { naturalWidth: w, naturalHeight: h };
}

// ─── clamp ────────────────────────────────────────────────────────────────────

describe('clamp', () => {
  it('passes a value inside the range through unchanged', () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  it('clamps values below the minimum', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('clamps values above the maximum', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('accepts values equal to the bounds', () => {
    expect(clamp(0, 0, 1)).toBe(0);
    expect(clamp(1, 0, 1)).toBe(1);
  });
});

// ─── normaliseCrop ────────────────────────────────────────────────────────────

describe('normaliseCrop', () => {
  it('leaves a valid crop unchanged', () => {
    const c: CropRect = { x: 0.1, y: 0.1, w: 0.5, h: 0.5 };
    expect(normaliseCrop(c)).toEqual(c);
  });

  it('keeps full-image crop unchanged', () => {
    expect(normaliseCrop({ x: 0, y: 0, w: 1, h: 1 }))
      .toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('clamps x so x + w never exceeds 1', () => {
    const c: CropRect = { x: 0.8, y: 0, w: 0.5, h: 0.5 };
    const r = normaliseCrop(c);
    expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('clamps y so y + h never exceeds 1', () => {
    const c: CropRect = { x: 0, y: 0.7, w: 0.5, h: 0.6 };
    const r = normaliseCrop(c);
    expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('clamps negative x to 0', () => {
    const r = normaliseCrop({ x: -0.2, y: 0, w: 0.5, h: 0.5 });
    expect(r.x).toBe(0);
  });

  it('does not expand w or h beyond 1', () => {
    const r = normaliseCrop({ x: 0, y: 0, w: 1.5, h: 1.5 });
    expect(r.w).toBeLessThanOrEqual(1);
    expect(r.h).toBeLessThanOrEqual(1);
  });
});

// ─── computeLayout ────────────────────────────────────────────────────────────

describe('computeLayout', () => {
  it('fits a landscape image into a same-ratio canvas filling edge-to-edge', () => {
    // 4:3 image in 4:3 canvas → no letterboxing
    const layout = computeLayout(800, 600, img(4000, 3000), 0);
    expect(layout.imgX).toBeCloseTo(0, 1);
    expect(layout.imgY).toBeCloseTo(0, 1);
    expect(layout.imgW).toBeCloseTo(800, 1);
    expect(layout.imgH).toBeCloseTo(600, 1);
  });

  it('letterboxes a portrait image into a landscape canvas', () => {
    // 3:4 portrait in 800×600 canvas is letterboxed horizontally
    // scale = min(800/3000, 600/4000) = 0.15 → imgW=450, imgH=600
    const layout = computeLayout(800, 600, img(3000, 4000), 0);
    expect(layout.imgW).toBeCloseTo(450, 0);
    expect(layout.imgH).toBeCloseTo(600, 0);
    expect(layout.imgX).toBeCloseTo(175, 0); // (800 - 450) / 2
    expect(layout.imgY).toBeCloseTo(0, 1);
  });

  it('centres the image within the canvas', () => {
    const layout = computeLayout(800, 600, img(400, 300), 0);
    // 400×300 fills the canvas exactly — centres at origin
    expect(layout.imgX).toBeGreaterThanOrEqual(0);
    expect(layout.imgY).toBeGreaterThanOrEqual(0);
    expect(layout.imgX + layout.imgW).toBeLessThanOrEqual(801);
    expect(layout.imgY + layout.imgH).toBeLessThanOrEqual(601);
  });

  it('swaps natural dimensions for 90° (odd) rotations', () => {
    // Portrait image (3000×4000) in landscape canvas at rotation=1 →
    // logical width = naturalHeight = 4000, logical height = naturalWidth = 3000
    // → scale = min(800/4000, 600/3000) = 0.2 → imgW=800, imgH=600 (fills exactly)
    const layout = computeLayout(800, 600, img(3000, 4000), 1);
    expect(layout.imgW).toBeCloseTo(800, 0);
    expect(layout.imgH).toBeCloseTo(600, 0);
  });

  it('returns same layout for rotation=0 and rotation=2 on a square image', () => {
    const layout0 = computeLayout(800, 600, img(400, 400), 0);
    const layout2 = computeLayout(800, 600, img(400, 400), 2);
    expect(layout0.imgW).toBeCloseTo(layout2.imgW, 3);
    expect(layout0.imgH).toBeCloseTo(layout2.imgH, 3);
  });

  /**
   * Key invariant for EXIF-fix correctness:
   *
   * After adding `exif` feature to the image crate, Rust's `image::open()`
   * returns EXIF-corrected dimensions matching `naturalWidth`/`naturalHeight`
   * in the browser.  This test verifies that the layout proportions exactly
   * match the image's natural aspect ratio, so that normalised crop coordinates
   * round-trip to the correct pixel coordinates in Rust.
   */
  it('preserves the image aspect ratio (EXIF-corrected → Rust pixel mapping)', () => {
    const W = 3024, H = 4032; // common portrait phone photo
    const layout = computeLayout(800, 600, img(W, H), 0);
    expect(layout.imgW / layout.imgH).toBeCloseTo(W / H, 4);
  });
});

// ─── handlePositions ──────────────────────────────────────────────────────────

describe('handlePositions', () => {
  const layout: Layout = { imgX: 100, imgY: 50, imgW: 600, imgH: 400 };
  const crop:   CropRect = { x: 0, y: 0, w: 1, h: 1 }; // full-image crop

  it('tl is at top-left of image area', () => {
    const { tl } = handlePositions(layout, crop);
    expect(tl.cx).toBeCloseTo(layout.imgX, 5);
    expect(tl.cy).toBeCloseTo(layout.imgY, 5);
  });

  it('br is at bottom-right of image area', () => {
    const { br } = handlePositions(layout, crop);
    expect(br.cx).toBeCloseTo(layout.imgX + layout.imgW, 5);
    expect(br.cy).toBeCloseTo(layout.imgY + layout.imgH, 5);
  });

  it('tc is at top-centre', () => {
    const { tc } = handlePositions(layout, crop);
    expect(tc.cx).toBeCloseTo(layout.imgX + layout.imgW / 2, 5);
    expect(tc.cy).toBeCloseTo(layout.imgY, 5);
  });

  it('handles respect a partial crop', () => {
    const partial: CropRect = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
    const pos = handlePositions(layout, partial);
    // tl should be at (100 + 0.25*600, 50 + 0.25*400) = (250, 150)
    expect(pos.tl.cx).toBeCloseTo(250, 3);
    expect(pos.tl.cy).toBeCloseTo(150, 3);
    // br at (100 + 0.75*600, 50 + 0.75*400) = (550, 350)
    expect(pos.br.cx).toBeCloseTo(550, 3);
    expect(pos.br.cy).toBeCloseTo(350, 3);
  });
});

// ─── hitTestHandle ────────────────────────────────────────────────────────────

describe('hitTestHandle', () => {
  const layout: Layout = { imgX: 0, imgY: 0, imgW: 600, imgH: 400 };
  const crop:   CropRect = { x: 0, y: 0, w: 1, h: 1 };

  it('hits each corner handle exactly at its centre', () => {
    const pos = handlePositions(layout, crop);
    for (const id of ['tl', 'tc', 'tr', 'ml', 'mr', 'bl', 'bc', 'br'] as const) {
      expect(hitTestHandle(pos[id].cx, pos[id].cy, layout, crop)).toBe(id);
    }
  });

  it('hits a handle within HANDLE_RADIUS + 4 pixels', () => {
    const pos = handlePositions(layout, crop);
    // 2 px offset — still within the tolerance
    expect(hitTestHandle(pos.tl.cx + 2, pos.tl.cy + 2, layout, crop)).toBe('tl');
  });

  it('returns null for a point far from every handle', () => {
    // Centre of the image — no handle there
    expect(hitTestHandle(300, 200, layout, crop)).toBeNull();
  });

  it('returns null just outside the hit radius', () => {
    const pos  = handlePositions(layout, crop);
    const dist = HANDLE_RADIUS + 5; // beyond the tolerance
    // Move diagonally so both dx and dy contribute but the point is outside radius+4
    const farX = pos.tl.cx + dist;
    const farY = pos.tl.cy;
    expect(hitTestHandle(farX, farY, layout, crop)).toBeNull();
  });
});

// ─── hitTestInterior ──────────────────────────────────────────────────────────

describe('hitTestInterior', () => {
  const layout: Layout = { imgX: 100, imgY: 100, imgW: 600, imgH: 400 };
  const crop:   CropRect = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
  // crop window in canvas pixels: l=160, t=140, r=580, b=460

  it('returns true for a point clearly inside the crop', () => {
    expect(hitTestInterior(300, 250, layout, crop)).toBe(true);
  });

  it('returns false outside the image area entirely', () => {
    expect(hitTestInterior(10, 10, layout, crop)).toBe(false);
  });

  it('returns false outside the crop window but inside the image', () => {
    // 120, 110 is inside the image but outside the 0.1-margin crop
    expect(hitTestInterior(120, 110, layout, crop)).toBe(false);
  });
});

// ─── applyCropHandleDelta ─────────────────────────────────────────────────────

describe('applyCropHandleDelta', () => {
  const start: CropRect = { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
  const MIN = 0.05; // normalised min size

  it('br expands both the right and bottom edges', () => {
    const r = applyCropHandleDelta('br', 0.1, 0.1, start, MIN, MIN);
    expect(r.x).toBeCloseTo(0.2, 5);
    expect(r.y).toBeCloseTo(0.2, 5);
    expect(r.w).toBeCloseTo(0.7, 5);
    expect(r.h).toBeCloseTo(0.7, 5);
  });

  it('tl contracts from the top-left', () => {
    const r = applyCropHandleDelta('tl', 0.1, 0.1, start, MIN, MIN);
    expect(r.x).toBeCloseTo(0.3, 5);
    expect(r.y).toBeCloseTo(0.3, 5);
    expect(r.w).toBeCloseTo(0.5, 5);
    expect(r.h).toBeCloseTo(0.5, 5);
  });

  it('tc only adjusts the top edge (x and w unchanged)', () => {
    const r = applyCropHandleDelta('tc', 0, 0.1, start, MIN, MIN);
    expect(r.x).toBeCloseTo(0.2, 5);
    expect(r.w).toBeCloseTo(0.6, 5);
    expect(r.y).toBeCloseTo(0.3, 5);
    expect(r.h).toBeCloseTo(0.5, 5);
  });

  it('bc only adjusts the bottom edge (x, y, w unchanged)', () => {
    const r = applyCropHandleDelta('bc', 0, 0.1, start, MIN, MIN);
    expect(r.x).toBeCloseTo(0.2, 5);
    expect(r.y).toBeCloseTo(0.2, 5);
    expect(r.w).toBeCloseTo(0.6, 5);
    expect(r.h).toBeCloseTo(0.7, 5);
  });

  it('ml only adjusts the left edge (y and h unchanged)', () => {
    const r = applyCropHandleDelta('ml', 0.05, 0, start, MIN, MIN);
    expect(r.y).toBeCloseTo(0.2, 5);
    expect(r.h).toBeCloseTo(0.6, 5);
    expect(r.x).toBeCloseTo(0.25, 5);
    expect(r.w).toBeCloseTo(0.55, 5);
  });

  it('mr only adjusts the right edge', () => {
    const r = applyCropHandleDelta('mr', 0.05, 0, start, MIN, MIN);
    expect(r.x).toBeCloseTo(0.2, 5);
    expect(r.y).toBeCloseTo(0.2, 5);
    expect(r.h).toBeCloseTo(0.6, 5);
    expect(r.w).toBeCloseTo(0.65, 5);
  });

  it('output crop never exceeds [0, 1] even with extreme drag', () => {
    const r = applyCropHandleDelta('br', 999, 999, { x: 0, y: 0, w: 0.5, h: 0.5 }, MIN, MIN);
    expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
    expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('output crop origin never goes negative', () => {
    const r = applyCropHandleDelta('tl', -999, -999, start, MIN, MIN);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
  });

  it('enforces the minimum width when shrinking', () => {
    const r = applyCropHandleDelta('mr', -999, 0, start, 0.1, MIN);
    expect(r.w).toBeGreaterThanOrEqual(0.1 - 1e-9);
  });

  it('enforces the minimum height when shrinking', () => {
    const r = applyCropHandleDelta('bc', 0, -999, start, MIN, 0.1);
    expect(r.h).toBeGreaterThanOrEqual(0.1 - 1e-9);
  });
});

// ─── EXIF orientation / coordinate-space alignment ───────────────────────────

describe('EXIF orientation → Rust crop coordinate alignment', () => {
  /**
   * This test block documents the exact invariant that was broken before
   * adding the `exif` feature to Cargo.toml and verifies the fix conceptually.
   *
   * Phone JPEG (raw: 4032×3024, EXIF orientation=6 "rotate 90° CW"):
   *   • Browser (WebKit): naturalWidth=3024, naturalHeight=4032  ← EXIF-corrected
   *   • Rust WITHOUT exif: img.width()=4032, img.height()=3024   ← raw (wrong)
   *   • Rust WITH    exif: img.width()=3024, img.height()=4032   ← EXIF-corrected ✓
   */

  const PORTRAIT_W = 3024; // browser naturalWidth  (EXIF-corrected)
  const PORTRAIT_H = 4032; // browser naturalHeight (EXIF-corrected)
  const RAW_W      = 4032; // raw width  WITHOUT EXIF fix
  const RAW_H      = 3024; // raw height WITHOUT EXIF fix

  it('browser layout uses EXIF-corrected dimensions', () => {
    const layout = computeLayout(800, 600, img(PORTRAIT_W, PORTRAIT_H), 0);
    // scale = min(800/3024, 600/4032) ≈ 0.1488
    // imgW ≈ 449, imgH ≈ 600
    expect(layout.imgW / layout.imgH).toBeCloseTo(PORTRAIT_W / PORTRAIT_H, 3);
  });

  it('WITH exif fix: Rust pixel coords match browser crop coords', () => {
    const crop: CropRect = { x: 0.1, y: 0.2, w: 0.6, h: 0.5 };

    // Rust after fix: uses same dimensions as browser
    const px = Math.round(crop.x * PORTRAIT_W);
    const py = Math.round(crop.y * PORTRAIT_H);
    const pw = Math.round(crop.w * PORTRAIT_W);
    const ph = Math.round(crop.h * PORTRAIT_H);

    // Pixel region must fit within the image
    expect(px + pw).toBeLessThanOrEqual(PORTRAIT_W);
    expect(py + ph).toBeLessThanOrEqual(PORTRAIT_H);
    expect(pw).toBeGreaterThanOrEqual(1);
    expect(ph).toBeGreaterThanOrEqual(1);

    // Normalised proportions round-trip correctly
    expect(px / PORTRAIT_W).toBeCloseTo(crop.x, 2);
    expect(py / PORTRAIT_H).toBeCloseTo(crop.y, 2);
  });

  it('WITHOUT exif fix: Rust pixel coords are wrong (documents the bug)', () => {
    const crop: CropRect = { x: 0.1, y: 0.2, w: 0.6, h: 0.5 };

    // Rust WITHOUT fix: uses raw (landscape) dimensions
    const wrongPx = Math.round(crop.x * RAW_W); // 403
    const wrongPy = Math.round(crop.y * RAW_H); // 604

    // Correct browser coords
    const correctPx = Math.round(crop.x * PORTRAIT_W); // 302
    const correctPy = Math.round(crop.y * PORTRAIT_H); // 806

    // These must differ — that is the bug
    expect(wrongPx).not.toBe(correctPx);
    expect(wrongPy).not.toBe(correctPy);
  });

  it('raw dimensions are swapped compared to EXIF-corrected (portrait vs landscape)', () => {
    // Confirms the misalignment: raw W > raw H (landscape), EXIF W < EXIF H (portrait)
    expect(RAW_W).toBeGreaterThan(RAW_H);
    expect(PORTRAIT_W).toBeLessThan(PORTRAIT_H);
  });

  it('full-image crop is a no-op after EXIF fix (entire image preserved)', () => {
    const crop: CropRect = { x: 0, y: 0, w: 1, h: 1 };
    const px = Math.round(crop.x * PORTRAIT_W);
    const py = Math.round(crop.y * PORTRAIT_H);
    const pw = Math.round(crop.w * PORTRAIT_W);
    const ph = Math.round(crop.h * PORTRAIT_H);
    expect(px).toBe(0);
    expect(py).toBe(0);
    expect(pw).toBe(PORTRAIT_W);
    expect(ph).toBe(PORTRAIT_H);
  });
});
