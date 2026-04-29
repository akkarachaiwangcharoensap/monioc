//! EXIF orientation correction using the `kamadak-exif` crate.
//!
//! Replaces the hand-rolled JPEG/TIFF parser that was in `commands.rs`.
//! `kamadak-exif` handles multi-APP1 JPEGs, EXIF-in-HEIC, PNG EXIF chunks,
//! and corrupt offsets that the previous implementation could not.

use image::DynamicImage;
use std::path::Path;

/// Read EXIF Orientation tag and rotate/flip `img` to match the browser's
/// EXIF-corrected view.  Falls back to identity (orientation 1) if EXIF is
/// absent or unreadable.
pub fn correct_orientation(img: DynamicImage, path: &Path) -> DynamicImage {
    let orientation = read_orientation(path).unwrap_or(1);
    apply_orientation(img, orientation)
}

fn read_orientation(path: &Path) -> Option<u32> {
    let file = std::fs::File::open(path).ok()?;
    let mut bufreader = std::io::BufReader::new(file);
    let exif = exif::Reader::new()
        .read_from_container(&mut bufreader)
        .ok()?;
    exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY)
        .and_then(|f| f.value.get_uint(0))
}

fn apply_orientation(img: DynamicImage, o: u32) -> DynamicImage {
    match o {
        2 => img.fliph(),
        3 => img.rotate180(),
        4 => img.flipv(),
        5 => img.rotate90().fliph(),
        6 => img.rotate90(),
        7 => img.rotate270().fliph(),
        8 => img.rotate270(),
        _ => img, // 1 = normal; unknown values are treated as no-op
    }
}

#[cfg(test)]
mod tests {
    use super::apply_orientation;
    use image::{DynamicImage, RgbaImage};

    fn sample() -> DynamicImage {
        DynamicImage::ImageRgba8(RgbaImage::new(100, 200))
    }

    #[test]
    fn orientation_6_rotates_90_cw() {
        let out = apply_orientation(sample(), 6);
        assert_eq!(out.width(), 200);
        assert_eq!(out.height(), 100);
    }

    #[test]
    fn orientation_8_rotates_270_cw() {
        let out = apply_orientation(sample(), 8);
        assert_eq!(out.width(), 200);
        assert_eq!(out.height(), 100);
    }

    #[test]
    fn orientation_1_is_identity() {
        let out = apply_orientation(sample(), 1);
        assert_eq!(out.width(), 100);
        assert_eq!(out.height(), 200);
    }

    #[test]
    fn unknown_orientation_is_identity() {
        let out = apply_orientation(sample(), 99);
        assert_eq!(out.width(), 100);
        assert_eq!(out.height(), 200);
    }

    /// Orientation 2 = horizontal flip; dimensions stay the same.
    #[test]
    fn orientation_2_flips_horizontally() {
        let out = apply_orientation(sample(), 2);
        assert_eq!(out.width(), 100);
        assert_eq!(out.height(), 200);
    }

    /// Orientation 3 = 180° rotation; dimensions stay the same.
    #[test]
    fn orientation_3_rotates_180() {
        let out = apply_orientation(sample(), 3);
        assert_eq!(out.width(), 100);
        assert_eq!(out.height(), 200);
    }

    /// Orientation 4 = vertical flip; dimensions stay the same.
    #[test]
    fn orientation_4_flips_vertically() {
        let out = apply_orientation(sample(), 4);
        assert_eq!(out.width(), 100);
        assert_eq!(out.height(), 200);
    }

    /// Orientation 5 = 90° CW + horizontal flip; swaps dimensions.
    #[test]
    fn orientation_5_swaps_dimensions() {
        let out = apply_orientation(sample(), 5);
        assert_eq!(out.width(), 200);
        assert_eq!(out.height(), 100);
    }

    /// Orientation 7 = 270° CW + horizontal flip; swaps dimensions.
    #[test]
    fn orientation_7_swaps_dimensions() {
        let out = apply_orientation(sample(), 7);
        assert_eq!(out.width(), 200);
        assert_eq!(out.height(), 100);
    }
}
