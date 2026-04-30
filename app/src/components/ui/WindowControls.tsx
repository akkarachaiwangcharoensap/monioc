import { getCurrentWindow } from '@tauri-apps/api/window';

const appWindow = getCurrentWindow();
const isMac = navigator.userAgent.includes('Mac OS X') || navigator.userAgent.includes('Macintosh');

/**
 * Close / minimise / maximise buttons for Windows and Linux.
 * macOS uses native traffic-light buttons repositioned by Rust, so this
 * component renders nothing there.
 */
export default function WindowControls() {
    if (isMac) return null;

    return (
        <div className="flex items-stretch flex-shrink-0 border-b border-slate-200">
            <button
                type="button"
                className="h-full w-11 inline-flex items-center justify-center text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors"
                onClick={() => void appWindow.minimize()}
                aria-label="Minimize"
            >
                {/* ─ */}
                <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
                    <rect width="10" height="1" />
                </svg>
            </button>
            <button
                type="button"
                className="h-full w-11 inline-flex items-center justify-center text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors"
                onClick={() => void appWindow.toggleMaximize()}
                aria-label="Maximize"
            >
                {/* □ */}
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
                    <rect x="0.5" y="0.5" width="9" height="9" />
                </svg>
            </button>
            <button
                type="button"
                className="h-full w-11 inline-flex items-center justify-center text-slate-500 hover:bg-red-500 hover:text-white transition-colors"
                onClick={() => void appWindow.close()}
                aria-label="Close"
            >
                {/* × */}
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                    <line x1="1" y1="1" x2="9" y2="9" />
                    <line x1="9" y1="1" x2="1" y2="9" />
                </svg>
            </button>
        </div>
    );
}
