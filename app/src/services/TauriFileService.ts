/**
 * TauriFileService — production implementation of FileService wrapping
 * @tauri-apps/plugin-dialog and @tauri-apps/plugin-fs.
 */
import type { FileService, OpenFileOptions, SaveFileOptions, ConfirmOptions } from './FileService';
import { open, save, confirm } from '@tauri-apps/plugin-dialog';
import { readFile, stat } from '@tauri-apps/plugin-fs';
import { convertFileSrc as tauriConvertFileSrc } from '@tauri-apps/api/core';

export class TauriFileService implements FileService {
	async openFilePicker(options?: OpenFileOptions): Promise<string[] | null> {
		const result = await open({
			title: options?.title,
			multiple: options?.multiple ?? false,
			filters: options?.filters,
		});
		if (result === null) return null;
		if (typeof result === 'string') return [result];
		return result as string[];
	}

	async saveFilePicker(options?: SaveFileOptions): Promise<string | null> {
		const result = await save({
			title: options?.title,
			defaultPath: options?.defaultPath,
			filters: options?.filters,
		});
		return result ?? null;
	}

	async readFile(path: string): Promise<Uint8Array> {
		return readFile(path);
	}

	async confirm(message: string, options?: ConfirmOptions): Promise<boolean> {
		return confirm(message, {
			title: options?.title,
			kind: options?.kind,
			okLabel: options?.okLabel,
			cancelLabel: options?.cancelLabel,
		});
	}

	async stat(path: string): Promise<{ size: number } | null> {
		try {
			const info = await stat(path);
			return { size: info.size };
		} catch {
			return null;
		}
	}

	convertFileSrc(path: string): string {
		return tauriConvertFileSrc(path);
	}
}
