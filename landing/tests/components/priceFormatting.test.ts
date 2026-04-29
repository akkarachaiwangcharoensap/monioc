import { describe, it, expect } from "vitest";
import { formatPrice, formatPriceWithSymbol, formatMoney } from "@/utils/priceFormatting";

describe("formatPrice", () => {
  it("returns '0.00' for zero", () => {
    expect(formatPrice(0)).toBe("0.00");
  });

  it("returns 2 decimals for normal prices (>= 1)", () => {
    expect(formatPrice(5.49)).toBe("5.49");
    expect(formatPrice(12.0)).toBe("12.00");
  });

  it("returns 3 decimals for small prices (< 1)", () => {
    expect(formatPrice(0.5)).toBe("0.500");
  });

  it("returns 4 decimals for very small prices (< 0.01) by default", () => {
    expect(formatPrice(0.005)).toBe("0.0050");
  });

  it("returns 5 decimals for very small prices when official=true", () => {
    expect(formatPrice(0.005, { official: true })).toBe("0.00500");
  });
});

describe("formatPriceWithSymbol", () => {
  it("prepends a dollar sign", () => {
    expect(formatPriceWithSymbol(3.99)).toBe("$3.99");
  });

  it("always shows 2 decimal places", () => {
    expect(formatPriceWithSymbol(5)).toBe("$5.00");
  });
});

describe("formatMoney", () => {
  it("returns a string containing the numeric amount", () => {
    const result = formatMoney(12.5);
    expect(typeof result).toBe("string");
    expect(result).toContain("12");
  });

  it("returns a non-empty string for zero", () => {
    const result = formatMoney(0);
    expect(result.length).toBeGreaterThan(0);
  });
});
