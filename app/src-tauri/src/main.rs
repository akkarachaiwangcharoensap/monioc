//! Application entry point.
//!
//! On Windows, hides the console window in release builds.
//! Delegates to the library entry point in `lib.rs` for platform independence.

// Hides the Windows console window in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    monioc_app_lib::run();
}
