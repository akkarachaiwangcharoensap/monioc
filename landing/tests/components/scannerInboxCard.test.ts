import { describe, it, expect } from "vitest";
import type { ScannerInboxCardProps } from "@/components/receipt-scanner/ScannerInboxCard";
import type { ImageLibraryEntry } from "@/types/image-library";
import type { Task } from "@/context/TaskManagerContext";

// Verify that the prop types use the monioc-web local types correctly.
// These compile-time checks ensure the public API shape is preserved.

function makeEntry(overrides: Partial<ImageLibraryEntry> = {}): ImageLibraryEntry {
  return {
    id: 1,
    filePath: "/tmp/receipt.jpg",
    addedAt: "2026-04-01T12:00:00Z",
    thumbnailPath: null,
    receiptId: null,
    stagingPath: null,
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "job-1",
    kind: "scan",
    title: "Scanning",
    phase: "Scanning…",
    progress: 0,
    progressLabel: "",
    status: "active",
    canCancel: true,
    createdAt: Date.now(),
    _progressTarget: 0,
    _jobKey: "job-1",
    ...overrides,
  };
}

describe("ScannerInboxCardProps contract", () => {
  it("can construct a valid props object for an idle card", () => {
    const props: ScannerInboxCardProps = {
      entry: makeEntry(),
      donePhase: {},
      taskForPath: {},
      perImageScanStatus: {},
      queueScanResults: {},
      queueErrors: undefined,
      modelsAbsent: false,
      onScan: (_path: string) => {},
      onCancel: (_path: string, _task: Task | undefined) => {},
      onEdit: (_entry: ImageLibraryEntry) => {},
      onRevert: (_entry: ImageLibraryEntry) => {},
      onRemove: (_entry: ImageLibraryEntry) => {},
    };
    expect(props.entry.id).toBe(1);
    expect(props.modelsAbsent).toBe(false);
  });

  it("can construct props with an active task for the entry's path", () => {
    const entry = makeEntry({ filePath: "/tmp/img.jpg" });
    const task = makeTask({ status: "active", progress: 72 });
    const props: ScannerInboxCardProps = {
      entry,
      donePhase: {},
      taskForPath: { [entry.filePath]: task },
      perImageScanStatus: {},
      queueScanResults: {},
      queueErrors: {},
      modelsAbsent: false,
      onScan: () => {},
      onCancel: () => {},
      onEdit: () => {},
      onRevert: () => {},
      onRemove: () => {},
    };
    expect(props.taskForPath[entry.filePath]).toBeDefined();
    expect(props.taskForPath[entry.filePath]?.progress).toBe(72);
  });

  it("can construct props for an uploading entry (id < 0)", () => {
    const entry = makeEntry({ id: -1, filePath: "/tmp/uploading.jpg" });
    const props: ScannerInboxCardProps = {
      entry,
      donePhase: {},
      taskForPath: {},
      perImageScanStatus: {},
      queueScanResults: {},
      queueErrors: undefined,
      modelsAbsent: false,
      onScan: () => {},
      onCancel: () => {},
      onEdit: () => {},
      onRevert: () => {},
      onRemove: () => {},
    };
    expect(props.entry.id).toBe(-1);
  });

  it("queueScanResults can carry an error message", () => {
    const PATH = "/tmp/err.jpg";
    const props: ScannerInboxCardProps = {
      entry: makeEntry({ filePath: PATH }),
      donePhase: {},
      taskForPath: {},
      perImageScanStatus: {},
      queueScanResults: { [PATH]: { errorMsg: "OCR failed" } },
      queueErrors: undefined,
      modelsAbsent: true,
      onScan: () => {},
      onCancel: () => {},
      onEdit: () => {},
      onRevert: () => {},
      onRemove: () => {},
    };
    expect(props.queueScanResults[PATH]?.errorMsg).toBe("OCR failed");
    expect(props.modelsAbsent).toBe(true);
  });
});
