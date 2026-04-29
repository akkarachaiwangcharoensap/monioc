import { describe, it, expect } from "vitest";
import {
  fileNameFromPath,
  cleanScanError,
} from "@/utils/receipt-scanner/formatting";

describe("fileNameFromPath", () => {
  it("extracts filename from Unix path", () => {
    expect(fileNameFromPath("/home/user/photos/receipt.jpg")).toBe("receipt.jpg");
  });

  it("extracts filename from Windows path", () => {
    expect(fileNameFromPath("C:\\Users\\user\\receipt.png")).toBe("receipt.png");
  });

  it("returns bare filename unchanged", () => {
    expect(fileNameFromPath("receipt.jpg")).toBe("receipt.jpg");
  });

  it("handles path ending with directory separator", () => {
    expect(fileNameFromPath("/tmp/")).toBe("");
  });

  it("handles nested path", () => {
    expect(fileNameFromPath("/a/b/c/d.webp")).toBe("d.webp");
  });
});

describe("cleanScanError", () => {
  it("returns cancellation message for 'cancelled'", () => {
    expect(cleanScanError("Job cancelled by user")).toBe("Scan cancelled.");
  });

  it("returns cancellation message for 'canceled' (US spelling)", () => {
    expect(cleanScanError("Task was canceled")).toBe("Scan cancelled.");
  });

  it("strips 'Processing error:' prefix", () => {
    const result = cleanScanError("Processing error: file not found");
    expect(result).toBe("file not found");
  });

  it("strips 'I/O error:' prefix", () => {
    const result = cleanScanError("I/O error: permission denied");
    expect(result).toBe("permission denied");
  });

  it("returns fallback for empty string", () => {
    expect(cleanScanError("")).toBe("Scan failed. Please try again.");
  });

  it("extracts last meaningful error from multi-line traceback", () => {
    const raw = [
      "Traceback (most recent call last):",
      '  File "scan.py", line 42, in run',
      "ValueError: invalid image format",
    ].join("\n");
    const result = cleanScanError(raw);
    expect(result).toBe("ValueError: invalid image format");
  });

  it("returns single-line error as-is", () => {
    expect(cleanScanError("Something went wrong")).toBe("Something went wrong");
  });
});
