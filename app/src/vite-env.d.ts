/// <reference types="vite/client" />

// Tauri environment variables injected at build time.
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly SSR: boolean;
  // Tauri-specific env vars (set when running via `tauri dev / tauri build`).
  readonly TAURI_ENV_TARGET_TRIPLE?: string;
  readonly TAURI_DEBUG?: string;
  // Subscription / cloud compute env vars (set per mode in .env.development.* files).
  readonly VITE_TIER_OVERRIDE?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_AUTH_ENABLED?: string;
}
