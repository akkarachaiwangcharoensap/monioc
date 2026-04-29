/**
 * Helpers for handling structured errors from the Tauri backend.
 *
 * AppError is serialized by Rust as { "kind": "...", "message": "..." }.
 * parseTauriError() extracts the human-readable message regardless of whether
 * the error is in the new structured form, a plain string (legacy), or a JS Error.
 */

export type AppErrorKind = 'Io' | 'Json' | 'Processing' | 'Path' | 'Database' | 'NotFound' | 'Image';

export interface TauriError {
    kind: AppErrorKind;
    message: string;
}

export function isTauriError(err: unknown): err is TauriError {
    return (
        err !== null &&
        typeof err === 'object' &&
        'kind' in err &&
        'message' in err
    );
}

export function parseTauriError(err: unknown): string {
    if (isTauriError(err)) return err.message;
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return String(err);
}
