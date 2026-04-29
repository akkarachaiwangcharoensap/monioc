/**
 * Dev-only logging helpers.
 * In production these are no-ops so no log output leaks.
 */

const DEV = import.meta.env.DEV;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function devLog(tag: string, ...args: any[]): void {
    if (DEV) console.log(`[${tag}]`, ...args);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function devError(tag: string, ...args: any[]): void {
    if (DEV) console.error(`[${tag}]`, ...args);
}
