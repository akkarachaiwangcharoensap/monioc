/**
 * Tauri API shim for landing page — replaces all @tauri-apps/* imports
 * with no-ops so adapted components can render without a Tauri runtime.
 */

// ── Plugin stubs ──────────────────────────────────────────────────────────────

export const open = async () => null;
export const save = async () => null;
export const readFile = async () => new Uint8Array();
export const readTextFile = async () => '';
export const writeFile = async () => {};
export const writeTextFile = async () => {};
export const readDir = async () => [];
export const mkdir = async () => {};
export const exists = async () => false;
export const remove = async () => {};
export const rename = async () => {};

// ── IPC / core stubs ─────────────────────────────────────────────────────────

export const invoke = async (_cmd: string, _args?: unknown) => null;
export const convertFileSrc = (path: string) => path;
export const listen = async () => () => {};
export const emit = async () => {};
export const event = { listen, emit };

// ── Window / shell stubs ─────────────────────────────────────────────────────

export const getCurrentWindow = () => ({
  setTitle: async () => {},
  close: async () => {},
  minimize: async () => {},
  maximize: async () => {},
  onCloseRequested: async () => () => {},
});

export const Command = class {
  static sidecar() { return new Command(); }
  async execute() { return { code: 0, stdout: '', stderr: '' }; }
};

// Default export for modules that do `import x from '@tauri-apps/...'`
export default {
  open, save, readFile, writeFile, readTextFile, writeTextFile,
  readDir, mkdir, exists, remove, rename,
  invoke, convertFileSrc, listen, emit, event,
  getCurrentWindow, Command,
};
