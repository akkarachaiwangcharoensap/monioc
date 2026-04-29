import { useState, useEffect } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

/**
 * Wires a Tauri v2 `onDragDropEvent` listener to the current webview window.
 *
 * Returns `isDragOver` — `true` while the user hovers files over the window.
 *
 * @param onDrop  Called with the dropped file paths on a successful drop.
 * @param accept  Guard predicate; return `false` to suppress the overlay for
 *                internal element drags (which surface with `paths: []`).
 */
export function useTauriDragDrop(
	onDrop: (paths: string[]) => void,
	accept: (paths: string[]) => boolean,
): boolean {
	const [isDragOver, setIsDragOver] = useState(false);

	useEffect(() => {
		let unlisten: (() => void) | undefined;
		let cancelled = false;

		void getCurrentWebviewWindow()
			.onDragDropEvent((event) => {
				if (event.payload.type === 'enter') {
					if (accept(event.payload.paths)) setIsDragOver(true);
				} else if (event.payload.type === 'leave') {
					setIsDragOver(false);
				} else if (event.payload.type === 'drop') {
					setIsDragOver(false);
					onDrop(event.payload.paths);
				}
			})
			.then((fn) => {
				if (cancelled) {
					fn();  // component already gone — unregister immediately
				} else {
					unlisten = fn;
				}
			});

		return () => {
			cancelled = true;   // signal that cleanup already ran
			unlisten?.();       // covers the normal case (promise resolved in time)
		};
	}, [onDrop, accept]);

	return isDragOver;
}