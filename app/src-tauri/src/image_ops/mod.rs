//! Image processing module: EXIF correction, edit pipeline, and JPEG storage.

pub mod exif;
pub mod pipeline;
pub mod storage;

pub use pipeline::ImageEditParams;
