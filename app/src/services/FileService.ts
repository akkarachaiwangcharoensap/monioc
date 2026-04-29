/**
 * FileService — abstract interface for file-system and dialog operations.
 * Production uses TauriFileService; the landing page uses MockFileService.
 */
export interface OpenFileOptions {
	title?: string;
	multiple?: boolean;
	filters?: Array<{ name: string; extensions: string[] }>;
}

export interface SaveFileOptions {
	title?: string;
	defaultPath?: string;
	filters?: Array<{ name: string; extensions: string[] }>;
}

export interface ConfirmOptions {
	title?: string;
	kind?: 'info' | 'warning' | 'error';
	okLabel?: string;
	cancelLabel?: string;
}

export interface FileService {
	openFilePicker(options?: OpenFileOptions): Promise<string[] | null>;
	saveFilePicker(options?: SaveFileOptions): Promise<string | null>;
	readFile(path: string): Promise<Uint8Array>;
	confirm(message: string, options?: ConfirmOptions): Promise<boolean>;
	stat(path: string): Promise<{ size: number } | null>;
	/** Convert a native file path to a URL the browser/webview can display. */
	convertFileSrc(path: string): string;
}
