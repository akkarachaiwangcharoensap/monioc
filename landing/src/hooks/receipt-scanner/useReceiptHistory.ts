import { useState, useRef, useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { ReceiptRow } from '../../types';

interface HistoryEntry {
	rows: ReceiptRow[];
}

interface UseReceiptHistoryOptions {
	publish: (rows: ReceiptRow[]) => void;
}

export interface UseReceiptHistoryResult {
	rows: ReceiptRow[];
	setRows: React.Dispatch<React.SetStateAction<ReceiptRow[]>>;
	rowsRef: MutableRefObject<ReceiptRow[]>;
	pushHistory: (prevRows: ReceiptRow[]) => void;
	publishTyping: (next: ReceiptRow[], prev: ReceiptRow[]) => void;
	flushPending: () => void;
	undo: () => void;
	redo: () => void;
}

export function useReceiptHistory(
	initial: ReceiptRow[] | (() => ReceiptRow[]),
	{ publish }: UseReceiptHistoryOptions,
): UseReceiptHistoryResult {
	const [rows, setRows] = useState<ReceiptRow[]>(initial);
	const [history, setHistory] = useState<HistoryEntry[]>([]);
	const [future, setFuture] = useState<HistoryEntry[]>([]);

	const rowsRef = useRef<ReceiptRow[]>(typeof initial === 'function' ? initial() : initial);
	const historyRef = useRef<HistoryEntry[]>([]);
	const futureRef = useRef<HistoryEntry[]>([]);
	const pendingHistoryRef = useRef<ReceiptRow[] | null>(null);
	const publishRef = useRef(publish);

	// Keep refs in sync
	rowsRef.current = rows;
	historyRef.current = history;
	futureRef.current = future;
	publishRef.current = publish;

	const pushHistory = useCallback((prevRows: ReceiptRow[]) => {
		setHistory((h) => [...h, { rows: prevRows }]);
		setFuture([]);
	}, []);

	const flushPending = useCallback(() => {
		if (pendingHistoryRef.current !== null) {
			const snapshot = pendingHistoryRef.current;
			pendingHistoryRef.current = null;
			setHistory((h) => [...h, { rows: snapshot }]);
			setFuture([]);
			// Commit staged typing changes only when edit session is finalized.
			publishRef.current(rowsRef.current);
		}
	}, []);

	const publishTyping = useCallback((next: ReceiptRow[], prev: ReceiptRow[]) => {
		rowsRef.current = next;
		if (pendingHistoryRef.current === null) {
			pendingHistoryRef.current = prev;
			setFuture([]);
		}
		// Typing changes are kept local. Publish only when flushPending is called explicitly
		// (on blur, navigation, or undo). No auto-publish on delay.
	}, []);

	const undo = useCallback(() => {
		// Flush any pending edits so Cmd+Z undoes the whole edit session
		let hist = historyRef.current;
		if (pendingHistoryRef.current !== null) {
			hist = [...hist, { rows: pendingHistoryRef.current }];
			pendingHistoryRef.current = null;
		}
		if (hist.length === 0) return;
		const entry = hist[hist.length - 1];
		setHistory(hist.slice(0, -1));
		setFuture((ft) => [{ rows: rowsRef.current }, ...ft]);
		setRows(entry.rows);
		publishRef.current(entry.rows);
	}, []);

	const redo = useCallback(() => {
		const fut = futureRef.current;
		if (fut.length === 0) return;
		const entry = fut[0];
		setFuture(fut.slice(1));
		setHistory((ht) => [...ht, { rows: rowsRef.current }]);
		setRows(entry.rows);
		publishRef.current(entry.rows);
	}, []);

	return { rows, setRows, rowsRef, pushHistory, publishTyping, flushPending, undo, redo };
}
