import path from "path";
import type { NextConfig } from "next";

const tauriShim = "./src/landing/tauri-shim.ts";

const nextConfig: NextConfig = {
  basePath: "/monioc",
  assetPrefix: "/monioc/",
  output: "export",
  transpilePackages: ["@monioc/shared"],
  trailingSlash: true,
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: path.join(__dirname, '..'),
    resolveAlias: {
      "@tauri-apps/plugin-dialog": tauriShim,
      "@tauri-apps/plugin-fs": tauriShim,
      "@tauri-apps/plugin-shell": tauriShim,
      "@tauri-apps/plugin-clipboard-manager": tauriShim,
      "@tauri-apps/api/webviewWindow": tauriShim,
      "@tauri-apps/api/core": tauriShim,
      "@tauri-apps/api/event": tauriShim,
      "@tauri-apps/api/window": tauriShim,
      "@tauri-apps/api": tauriShim,
    },
  },
};

export default nextConfig;
