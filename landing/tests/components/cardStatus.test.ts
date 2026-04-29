import { describe, it, expect } from "vitest";
import {
  getCardStatus,
  getCardPhaseLabel,
  getCardProgress,
} from "@/utils/receipt-scanner/cardStatus";
import type { Task } from "@/context/TaskManagerContext";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "test-id",
    kind: "scan",
    title: "Scanning receipt",
    phase: "Scanning…",
    progress: 50,
    progressLabel: "50%",
    status: "active",
    canCancel: true,
    createdAt: Date.now(),
    _progressTarget: 50,
    _jobKey: "job-1",
    ...overrides,
  };
}

describe("getCardStatus", () => {
  const PATH = "/tmp/img.jpg";

  it("returns 'exit' when donePhase is exit", () => {
    expect(getCardStatus(PATH, { [PATH]: "exit" }, {}, {})).toBe("exit");
  });

  it("returns 'check' when donePhase is check", () => {
    expect(getCardStatus(PATH, { [PATH]: "check" }, {}, {})).toBe("check");
  });

  it("returns 'idle' when no task and no status", () => {
    expect(getCardStatus(PATH, {}, {}, {})).toBe("idle");
  });

  it("returns 'check' when task status is done", () => {
    const task = makeTask({ status: "done" });
    expect(getCardStatus(PATH, {}, { [PATH]: task }, {})).toBe("check");
  });

  it("returns 'error' when task status is error", () => {
    const task = makeTask({ status: "error" });
    expect(getCardStatus(PATH, {}, { [PATH]: task }, {})).toBe("error");
  });

  it("returns 'error' when task status is cancelled", () => {
    const task = makeTask({ status: "cancelled" });
    expect(getCardStatus(PATH, {}, { [PATH]: task }, {})).toBe("error");
  });

  it("returns 'cancelling' when task status is cancelling", () => {
    const task = makeTask({ status: "cancelling" });
    expect(getCardStatus(PATH, {}, { [PATH]: task }, {})).toBe("cancelling");
  });

  it("returns 'queued' when phase contains queued", () => {
    const task = makeTask({ phase: "Queued (2 of 3)" });
    expect(getCardStatus(PATH, {}, { [PATH]: task }, {})).toBe("queued");
  });

  it("returns 'categorizing' when phase contains categoriz", () => {
    const task = makeTask({ phase: "Categorizing items…" });
    expect(getCardStatus(PATH, {}, { [PATH]: task }, {})).toBe("categorizing");
  });

  it("returns 'scanning' for generic active task", () => {
    const task = makeTask({ phase: "Processing image" });
    expect(getCardStatus(PATH, {}, { [PATH]: task }, {})).toBe("scanning");
  });

  it("returns 'scanning' from perImageScanStatus", () => {
    expect(getCardStatus(PATH, {}, {}, { [PATH]: "scanning" })).toBe("scanning");
  });

  it("returns 'error' from perImageScanStatus", () => {
    expect(getCardStatus(PATH, {}, {}, { [PATH]: "error" })).toBe("error");
  });

  it("donePhase takes precedence over task status", () => {
    const task = makeTask({ status: "active" });
    expect(getCardStatus(PATH, { [PATH]: "check" }, { [PATH]: task }, {})).toBe("check");
  });
});

describe("getCardPhaseLabel", () => {
  const PATH = "/tmp/img.jpg";

  it("returns null when no task", () => {
    expect(getCardPhaseLabel(PATH, {})).toBeNull();
  });

  it("returns null when task is not active", () => {
    const task = makeTask({ status: "done" });
    expect(getCardPhaseLabel(PATH, { [PATH]: task })).toBeNull();
  });

  it("returns phase label when task is active", () => {
    const task = makeTask({ phase: "Scanning…", status: "active" });
    expect(getCardPhaseLabel(PATH, { [PATH]: task })).toBe("Scanning…");
  });
});

describe("getCardProgress", () => {
  const PATH = "/tmp/img.jpg";

  it("returns null when no task", () => {
    expect(getCardProgress(PATH, {})).toBeNull();
  });

  it("returns null when task is not active", () => {
    const task = makeTask({ status: "done", progress: 100 });
    expect(getCardProgress(PATH, { [PATH]: task })).toBeNull();
  });

  it("returns null when progress is 0", () => {
    const task = makeTask({ progress: 0 });
    expect(getCardProgress(PATH, { [PATH]: task })).toBeNull();
  });

  it("returns progress value when task is active and progress > 0", () => {
    const task = makeTask({ progress: 72 });
    expect(getCardProgress(PATH, { [PATH]: task })).toBe(72);
  });
});
