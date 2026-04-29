import { describe, it, expect } from "vitest";
import { parseSqliteDate, effectiveDate } from "@/utils/statistics";
import type { ReceiptScanRecord } from "@/types/receipt";

function makeReceipt(overrides: Partial<ReceiptScanRecord> = {}): ReceiptScanRecord {
  return {
    id: 1,
    displayName: "Test",
    imagePath: null,
    processedImagePath: null,
    data: { rows: [] },
    createdAt: "2026-04-01 12:00:00",
    updatedAt: "2026-04-01 12:00:00",
    purchaseDate: "2026-04-01",
    ...overrides,
  };
}

describe("parseSqliteDate", () => {
  it("parses a date-only string", () => {
    const d = parseSqliteDate("2026-04-01");
    expect(d).toBeInstanceOf(Date);
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(3); // April = 3
    expect(d!.getDate()).toBe(1);
  });

  it("parses a datetime string with space separator", () => {
    const d = parseSqliteDate("2026-04-01 14:32:00");
    expect(d).toBeInstanceOf(Date);
    expect(d!.getFullYear()).toBe(2026);
  });

  it("parses a datetime string with T separator", () => {
    const d = parseSqliteDate("2026-04-01T14:32:00Z");
    expect(d).toBeInstanceOf(Date);
    expect(d!.getFullYear()).toBe(2026);
  });

  it("returns null for an invalid string", () => {
    expect(parseSqliteDate("not-a-date")).toBeNull();
    expect(parseSqliteDate("")).toBeNull();
  });
});

describe("effectiveDate", () => {
  it("returns purchaseDate when set", () => {
    const r = makeReceipt({ purchaseDate: "2026-03-15" });
    const d = effectiveDate(r);
    expect(d).not.toBeNull();
    expect(d!.getDate()).toBe(15);
    expect(d!.getMonth()).toBe(2); // March = 2
  });

  it("falls back to createdAt when purchaseDate is null", () => {
    const r = makeReceipt({
      purchaseDate: null,
      createdAt: "2026-04-01 12:00:00",
    });
    const d = effectiveDate(r);
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(3); // April = 3
  });
});
