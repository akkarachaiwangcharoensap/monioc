//! Image edit pipeline: parameters, deterministic transform chain, crop math.

use image::DynamicImage;
use serde::{Deserialize, Serialize};

/// Parameters for image editing operations (crop, rotate, flip, brightness, contrast).
///
/// All coordinate values are normalised to [0, 1] relative to the
/// **EXIF-corrected** image dimensions so they align with browser
/// `naturalWidth` / `naturalHeight`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageEditParams {
    /// Horizontal origin of crop rectangle (0..1, post-rotation space)
    pub crop_x: f64,
    /// Vertical origin of crop rectangle (0..1, post-rotation space)
    pub crop_y: f64,
    /// Width of crop rectangle (0..1 normalised)
    pub crop_w: f64,
    /// Height of crop rectangle (0..1 normalised)
    pub crop_h: f64,
    /// Rotation: 0 = 0°, 1 = 90° CW, 2 = 180°, 3 = 270° CW
    pub rotation: u8,
    /// Horizontal flip applied before rotation, matching canvas transform order
    pub flip_h: bool,
    /// Brightness adjustment (–100..100; 0 = no change)
    pub brightness: i32,
    /// Contrast adjustment (–100..100; 0 = no change)
    pub contrast: i32,
    /// Convert to grayscale / B&W for improved OCR accuracy.
    #[serde(default)]
    pub grayscale: bool,
}

/// Applies a deterministic sequence of edits to a `DynamicImage`.
///
/// Call `exif::correct_orientation` on the image before constructing the
/// pipeline so that pixel coordinates match the browser's EXIF-corrected view.
///
/// Edit order: flip → rotate → crop → tone adjustments.
pub struct EditPipeline<'a> {
    pub params: &'a ImageEditParams,
}

impl<'a> EditPipeline<'a> {
    pub fn apply(&self, img: DynamicImage) -> DynamicImage {
        let img = if self.params.flip_h { img.fliph() } else { img };
        let img = self.rotate(img);
        let img = self.crop(img);
        self.apply_tone_adjustments(img)
    }

    fn rotate(&self, img: DynamicImage) -> DynamicImage {
        match self.params.rotation % 4 {
            1 => img.rotate90(),
            2 => img.rotate180(),
            3 => img.rotate270(),
            _ => img,
        }
    }

    fn crop(&self, img: DynamicImage) -> DynamicImage {
        let p = self.params;
        let (iw, ih) = (img.width(), img.height());
        let (px, py, pw, ph) =
            compute_crop_pixels(p.crop_x, p.crop_y, p.crop_w, p.crop_h, iw, ih);
        img.crop_imm(px, py, pw, ph)
    }

    fn apply_tone_adjustments(&self, img: DynamicImage) -> DynamicImage {
        if self.params.brightness == 0 && self.params.contrast == 0 && !self.params.grayscale {
            return img;
        }

        let brightness_factor = 1.0_f32 + self.params.brightness as f32 / 100.0;
        let contrast_factor = 1.0_f32 + self.params.contrast as f32 / 100.0;
        let mut rgba = img.to_rgba8();

        for pixel in rgba.pixels_mut() {
            let mut red = pixel[0] as f32;
            let mut green = pixel[1] as f32;
            let mut blue = pixel[2] as f32;

            if self.params.brightness != 0 {
                red = (red * brightness_factor).clamp(0.0, 255.0);
                green = (green * brightness_factor).clamp(0.0, 255.0);
                blue = (blue * brightness_factor).clamp(0.0, 255.0);
            }

            if self.params.contrast != 0 {
                red = (((red / 255.0 - 0.5) * contrast_factor + 0.5).clamp(0.0, 1.0) * 255.0)
                    .clamp(0.0, 255.0);
                green = (((green / 255.0 - 0.5) * contrast_factor + 0.5).clamp(0.0, 1.0) * 255.0)
                    .clamp(0.0, 255.0);
                blue = (((blue / 255.0 - 0.5) * contrast_factor + 0.5).clamp(0.0, 1.0) * 255.0)
                    .clamp(0.0, 255.0);
            }

            if self.params.grayscale {
                let luma = red * 0.299 + green * 0.587 + blue * 0.114;
                red = luma;
                green = luma;
                blue = luma;
            }

            pixel[0] = red.clamp(0.0, 255.0) as u8;
            pixel[1] = green.clamp(0.0, 255.0) as u8;
            pixel[2] = blue.clamp(0.0, 255.0) as u8;
        }

        DynamicImage::ImageRgba8(rgba)
    }
}

/// Convert normalised [0, 1] crop coordinates to a pixel rect `(x, y, w, h)`.
///
/// `exif::correct_orientation` must be applied first so `img_width`/`img_height`
/// match the browser's `naturalWidth`/`naturalHeight` (EXIF-corrected).
/// The result is clamped to image bounds and the minimum dimension is 1 px.
pub fn compute_crop_pixels(
    crop_x: f64,
    crop_y: f64,
    crop_w: f64,
    crop_h: f64,
    img_width: u32,
    img_height: u32,
) -> (u32, u32, u32, u32) {
    let px = ((crop_x * img_width as f64).round() as u32).min(img_width.saturating_sub(1));
    let py = ((crop_y * img_height as f64).round() as u32).min(img_height.saturating_sub(1));
    let pw = ((crop_w * img_width as f64).round() as u32)
        .min(img_width.saturating_sub(px))
        .max(1);
    let ph = ((crop_h * img_height as f64).round() as u32)
        .min(img_height.saturating_sub(py))
        .max(1);
    (px, py, pw, ph)
}

#[cfg(test)]
mod tests {
    use super::compute_crop_pixels;

    // ── compute_crop_pixels ───────────────────────────────────────────────────

    #[test]
    fn full_image_crop_returns_full_dimensions() {
        let (px, py, pw, ph) = compute_crop_pixels(0.0, 0.0, 1.0, 1.0, 3024, 4032);
        assert_eq!(px, 0);
        assert_eq!(py, 0);
        assert_eq!(pw, 3024);
        assert_eq!(ph, 4032);
    }

    #[test]
    fn centre_half_crop_produces_correct_pixel_region() {
        // crop 50% centred → starts at 25%, size 50% of each dimension
        let (px, py, pw, ph) = compute_crop_pixels(0.25, 0.25, 0.5, 0.5, 4000, 3000);
        assert_eq!(px, 1000); // 0.25 * 4000
        assert_eq!(py, 750);  // 0.25 * 3000
        assert_eq!(pw, 2000); // 0.5  * 4000
        assert_eq!(ph, 1500); // 0.5  * 3000
    }

    #[test]
    fn crop_never_overflows_image_bounds() {
        let (px, py, pw, ph) = compute_crop_pixels(0.5, 0.5, 0.6, 0.6, 1000, 1000);
        assert!(px + pw <= 1000, "x + w overflows: {} + {} > 1000", px, pw);
        assert!(py + ph <= 1000, "y + h overflows: {} + {} > 1000", py, ph);
    }

    #[test]
    fn zero_sized_crop_is_clamped_to_one_pixel() {
        let (_, _, pw, ph) = compute_crop_pixels(0.0, 0.0, 0.0, 0.0, 500, 500);
        assert!(pw >= 1);
        assert!(ph >= 1);
    }

    #[test]
    fn crop_x_at_boundary_is_clamped() {
        // crop_x = 1.0 would make px = width (out-of-bounds); must saturate
        let (px, _, _, _) = compute_crop_pixels(1.0, 0.0, 0.5, 0.5, 100, 100);
        assert!(px < 100, "px must be < image width, got {}", px);
    }

    // ── EXIF orientation coordinate-space invariant ───────────────────────────
    //
    // Phone JPEG raw:                   4032 × 3024  (landscape, EXIF = 6)
    // Browser naturalWidth / Height:    3024 × 4032  (EXIF-corrected portrait)
    // Rust WITHOUT correct_orientation: img.width()=4032  ← broken coordinate space
    // Rust WITH    correct_orientation: img.width()=3024  ← matches browser

    #[test]
    fn crop_coords_match_browser_after_exif_fix() {
        let portrait_w: u32 = 3024;
        let portrait_h: u32 = 4032;

        let (px, py, pw, ph) =
            compute_crop_pixels(0.1, 0.2, 0.6, 0.5, portrait_w, portrait_h);

        let back_x = px as f64 / portrait_w as f64;
        let back_y = py as f64 / portrait_h as f64;
        assert!((back_x - 0.1).abs() < 0.005, "x round-trip: {}", back_x);
        assert!((back_y - 0.2).abs() < 0.005, "y round-trip: {}", back_y);
        assert!(px + pw <= portrait_w);
        assert!(py + ph <= portrait_h);
    }

    #[test]
    fn wrong_dimensions_without_exif_fix_would_differ() {
        // Documents the bug that correct_orientation fixes.
        let portrait_w: u32 = 3024;
        let portrait_h: u32 = 4032;
        let raw_w: u32 = 4032; // what Rust returned without EXIF correction
        let raw_h: u32 = 3024;

        let (correct_px, correct_py, _, _) =
            compute_crop_pixels(0.1, 0.2, 0.5, 0.5, portrait_w, portrait_h);
        let (wrong_px, wrong_py, _, _) =
            compute_crop_pixels(0.1, 0.2, 0.5, 0.5, raw_w, raw_h);

        assert_ne!(correct_px, wrong_px, "x coords should differ with wrong dims");
        assert_ne!(correct_py, wrong_py, "y coords should differ with wrong dims");
    }

    // ── rotation arithmetic ───────────────────────────────────────────────────

    #[test]
    fn rotation_modulo_wraps_correctly() {
        let cases: &[(u8, u8)] = &[(0, 0), (1, 1), (2, 2), (3, 3), (4, 0), (5, 1)];
        for &(input, expected_mod) in cases {
            assert_eq!(
                input % 4,
                expected_mod,
                "rotation {} % 4 should be {}",
                input,
                expected_mod
            );
        }
    }

    // ── EditPipeline::apply ───────────────────────────────────────────────────

    use image::{DynamicImage, RgbaImage};
    use crate::image_ops::pipeline::{EditPipeline, ImageEditParams};

    fn blank(w: u32, h: u32) -> DynamicImage {
        DynamicImage::ImageRgba8(RgbaImage::new(w, h))
    }

    fn params_identity() -> ImageEditParams {
        ImageEditParams {
            crop_x: 0.0, crop_y: 0.0, crop_w: 1.0, crop_h: 1.0,
            rotation: 0, flip_h: false, brightness: 0, contrast: 0,
            grayscale: false,
        }
    }

    /// Identity pipeline: no edits → dimensions unchanged.
    #[test]
    fn pipeline_identity_preserves_dimensions() {
        let img = blank(300, 200);
        let out = EditPipeline { params: &params_identity() }.apply(img);
        assert_eq!(out.width(), 300);
        assert_eq!(out.height(), 200);
    }

    /// Rotation 1 (90° CW) swaps width and height.
    #[test]
    fn pipeline_rotation_1_swaps_dimensions() {
        let params = ImageEditParams { rotation: 1, ..params_identity() };
        let out = EditPipeline { params: &params }.apply(blank(300, 200));
        assert_eq!(out.width(), 200);
        assert_eq!(out.height(), 300);
    }

    /// Rotation 2 (180°) preserves dimensions.
    #[test]
    fn pipeline_rotation_2_preserves_dimensions() {
        let params = ImageEditParams { rotation: 2, ..params_identity() };
        let out = EditPipeline { params: &params }.apply(blank(300, 200));
        assert_eq!(out.width(), 300);
        assert_eq!(out.height(), 200);
    }

    /// Rotation 3 (270° CW) swaps width and height.
    #[test]
    fn pipeline_rotation_3_swaps_dimensions() {
        let params = ImageEditParams { rotation: 3, ..params_identity() };
        let out = EditPipeline { params: &params }.apply(blank(300, 200));
        assert_eq!(out.width(), 200);
        assert_eq!(out.height(), 300);
    }

    /// Horizontal flip does not change dimensions.
    #[test]
    fn pipeline_flip_h_preserves_dimensions() {
        let params = ImageEditParams { flip_h: true, ..params_identity() };
        let out = EditPipeline { params: &params }.apply(blank(300, 200));
        assert_eq!(out.width(), 300);
        assert_eq!(out.height(), 200);
    }

    /// Crop to the centred 50% reduces dimensions by half.
    #[test]
    fn pipeline_crop_half_halves_dimensions() {
        let params = ImageEditParams {
            crop_x: 0.25, crop_y: 0.25, crop_w: 0.5, crop_h: 0.5,
            ..params_identity()
        };
        let out = EditPipeline { params: &params }.apply(blank(400, 200));
        assert_eq!(out.width(), 200);
        assert_eq!(out.height(), 100);
    }

    /// Rotation 1 followed by a full-image crop preserves swapped dimensions.
    #[test]
    fn pipeline_rotation_then_full_crop_gives_rotated_dimensions() {
        let params = ImageEditParams { rotation: 1, ..params_identity() };
        let out = EditPipeline { params: &params }.apply(blank(400, 200));
        // 90° CW: width becomes old height, height becomes old width
        assert_eq!(out.width(), 200);
        assert_eq!(out.height(), 400);
    }

    /// Rotation 4 is equivalent to 0 (mod 4).
    #[test]
    fn pipeline_rotation_4_is_identity() {
        let params = ImageEditParams { rotation: 4, ..params_identity() };
        let out = EditPipeline { params: &params }.apply(blank(300, 200));
        assert_eq!(out.width(), 300);
        assert_eq!(out.height(), 200);
    }
}
