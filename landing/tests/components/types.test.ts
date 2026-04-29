import { describe, it, expect } from "vitest";
import type {
  ReceiptRow,
  ReceiptData,
  ReceiptScanRecord,
} from "@/types/receipt";
import type { GroceryProductRecord, ComparisonResult } from "@/types/grocery";
import type { ImageLibraryEntry } from "@/types/image-library";
import type { Task } from "@/context/TaskManagerContext";

// Type-level tests: ensure objects shaped to the interfaces satisfy TypeScript.
// These are compile-time checks as well as runtime shape assertions.

describe("ReceiptRow shape", () => {
  it("accepts a minimal valid row", () => {
    const row: ReceiptRow = { name: "Milk 4L", price: 5.49 };
    expect(row.name).toBe("Milk 4L");
    expect(row.price).toBe(5.49);
  });

  it("accepts a row with optional category and _id", () => {
    const row: ReceiptRow = {
      _id: "abc123",
      name: "Eggs 12pk",
      price: 4.29,
      category: "Dairy",
    };
    expect(row._id).toBe("abc123");
    expect(row.category).toBe("Dairy");
  });
});

describe("ReceiptData shape", () => {
  it("accepts a data object with a rows array", () => {
    const data: ReceiptData = {
      rows: [{ name: "Bread", price: 3.49 }],
    };
    expect(data.rows.length).toBe(1);
  });

  it("accepts an empty rows array", () => {
    const data: ReceiptData = { rows: [] };
    expect(data.rows).toEqual([]);
  });
});

describe("ReceiptScanRecord shape", () => {
  it("accepts a full record", () => {
    const record: ReceiptScanRecord = {
      id: 1,
      displayName: "Loblaws",
      imagePath: "/tmp/img.jpg",
      processedImagePath: "/tmp/proc.jpg",
      data: { rows: [] },
      createdAt: "2026-04-01 12:00:00",
      updatedAt: "2026-04-01 12:00:00",
      purchaseDate: "2026-04-01",
    };
    expect(record.id).toBe(1);
    expect(record.displayName).toBe("Loblaws");
  });

  it("accepts null for nullable fields", () => {
    const record: ReceiptScanRecord = {
      id: 2,
      displayName: null,
      imagePath: null,
      processedImagePath: null,
      data: { rows: [] },
      createdAt: "2026-04-01 12:00:00",
      updatedAt: "2026-04-01 12:00:00",
      purchaseDate: null,
    };
    expect(record.displayName).toBeNull();
    expect(record.purchaseDate).toBeNull();
  });
});

describe("GroceryProductRecord shape", () => {
  it("accepts a valid product", () => {
    const p: GroceryProductRecord = {
      id: 101,
      name: "Whole Milk",
      category: "dairy",
      unit: "l",
    };
    expect(p.id).toBe(101);
    expect(p.unit).toBe("l");
  });
});

describe("ComparisonResult shape", () => {
  it("accepts a valid comparison result", () => {
    const result: ComparisonResult = {
      userPrice: 5.49,
      statsCanPrice: 6.19,
      difference: -0.7,
      percentageDifference: -11.3,
      isSaving: true,
      product: "Whole Milk",
      location: "Ontario",
      year: "2025",
    };
    expect(result.isSaving).toBe(true);
    expect(result.difference).toBeLessThan(0);
  });
});

describe("ImageLibraryEntry shape", () => {
  it("accepts a full entry", () => {
    const entry: ImageLibraryEntry = {
      id: 1,
      filePath: "/tmp/img.jpg",
      addedAt: "2026-04-01T12:00:00Z",
      thumbnailPath: "/tmp/thumb.jpg",
      receiptId: 42,
      stagingPath: null,
    };
    expect(entry.id).toBe(1);
    expect(entry.stagingPath).toBeNull();
  });

  it("accepts null for optional image fields", () => {
    const entry: ImageLibraryEntry = {
      id: 2,
      filePath: "/tmp/img2.jpg",
      addedAt: "2026-04-01T12:00:00Z",
      thumbnailPath: null,
      receiptId: null,
      stagingPath: null,
    };
    expect(entry.thumbnailPath).toBeNull();
    expect(entry.receiptId).toBeNull();
  });
});

describe("Task shape", () => {
  it("accepts a valid scan task", () => {
    const task: Task = {
      id: "job-1",
      kind: "scan",
      title: "Scanning receipt",
      phase: "Scanning…",
      progress: 50,
      progressLabel: "50%",
      status: "active",
      canCancel: true,
      createdAt: 1714000000000,
      _progressTarget: 50,
      _jobKey: "job-1",
    };
    expect(task.kind).toBe("scan");
    expect(task.status).toBe("active");
  });

  it("accepts all status values", () => {
    const statuses: Task["status"][] = [
      "active",
      "cancelling",
      "done",
      "error",
      "cancelled",
    ];
    for (const status of statuses) {
      const task: Task = {
        id: "t",
        kind: "generic",
        title: "T",
        phase: "p",
        progress: 0,
        progressLabel: "",
        status,
        canCancel: false,
        createdAt: 0,
        _progressTarget: 0,
        _jobKey: "k",
      };
      expect(task.status).toBe(status);
    }
  });
});
