import { describe, it, expect } from "vitest";
import {
  MOCK_RECEIPTS,
  MOCK_CATEGORIES,
  MOCK_PRODUCTS,
  MOCK_PRICES,
  MOCK_KPIS,
  MOCK_BAR_DATA,
  MOCK_CATEGORY_TOTALS,
  MOCK_GROCERY_CATEGORIES,
  MOCK_PRODUCTS_BY_CATEGORY,
  ALL_MOCK_PRODUCTS,
  EXTENDED_MOCK_PRICES,
  getMockCategoryColor,
  buildMockBarData,
  MOCK_DATA_START_YEAR,
} from "@/landing/mock-data";

describe("MOCK_RECEIPTS", () => {
  it("is non-empty", () => {
    expect(MOCK_RECEIPTS.length).toBeGreaterThan(0);
  });

  it("each receipt has required fields", () => {
    for (const r of MOCK_RECEIPTS) {
      expect(typeof r.id).toBe("number");
      expect(typeof r.displayName).toBe("string");
      expect(typeof r.createdAt).toBe("string");
      expect(typeof r.updatedAt).toBe("string");
      expect(r.data).toBeDefined();
      expect(Array.isArray(r.data.rows)).toBe(true);
    }
  });

  it("each receipt row has name, price, and category", () => {
    for (const r of MOCK_RECEIPTS) {
      for (const row of r.data.rows) {
        expect(typeof row.name).toBe("string");
        expect(row.name.length).toBeGreaterThan(0);
        expect(typeof row.price).toBe("number");
        expect(row.price).toBeGreaterThan(0);
        expect(typeof row.category).toBe("string");
      }
    }
  });
});

describe("MOCK_CATEGORIES", () => {
  it("is non-empty", () => {
    expect(MOCK_CATEGORIES.length).toBeGreaterThan(0);
  });

  it("each category has id, name, and color", () => {
    for (const c of MOCK_CATEGORIES) {
      expect(typeof c.id).toBe("number");
      expect(typeof c.name).toBe("string");
      expect(c.name.length).toBeGreaterThan(0);
      expect(typeof c.color).toBe("string");
      expect(c.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("category IDs are unique", () => {
    const ids = MOCK_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("MOCK_PRODUCTS", () => {
  it("is non-empty", () => {
    expect(MOCK_PRODUCTS.length).toBeGreaterThan(0);
  });

  it("each product has required fields", () => {
    for (const p of MOCK_PRODUCTS) {
      expect(typeof p.id).toBe("number");
      expect(typeof p.name).toBe("string");
      expect(typeof p.category).toBe("string");
      expect(typeof p.unit).toBe("string");
    }
  });
});

describe("MOCK_PRICES", () => {
  it("is non-empty", () => {
    expect(MOCK_PRICES.length).toBeGreaterThan(0);
  });

  it("each price entry has required fields", () => {
    for (const p of MOCK_PRICES) {
      expect(typeof p.productName).toBe("string");
      expect(typeof p.location).toBe("string");
      expect(typeof p.date).toBe("string");
      expect(typeof p.pricePerUnit).toBe("number");
      expect(p.pricePerUnit).toBeGreaterThan(0);
      expect(typeof p.unit).toBe("string");
      expect(typeof p.category).toBe("string");
    }
  });
});

describe("MOCK_KPIS", () => {
  it("has all required KPI fields", () => {
    expect(typeof MOCK_KPIS.monthTotal).toBe("number");
    expect(typeof MOCK_KPIS.prevMonthTotal).toBe("number");
    expect(typeof MOCK_KPIS.deltaPercent).toBe("number");
    expect(typeof MOCK_KPIS.receiptsThisPeriod).toBe("number");
    expect(typeof MOCK_KPIS.statCanAvg).toBe("number");
    expect(typeof MOCK_KPIS.savings).toBe("number");
  });
});

describe("MOCK_BAR_DATA", () => {
  it("has 12 months", () => {
    expect(MOCK_BAR_DATA.length).toBe(12);
  });

  it("each bar has label, total, and receipts", () => {
    for (const bar of MOCK_BAR_DATA) {
      expect(typeof bar.label).toBe("string");
      expect(typeof bar.total).toBe("number");
      expect(typeof bar.receipts).toBe("number");
    }
  });
});

describe("MOCK_CATEGORY_TOTALS", () => {
  it("is non-empty", () => {
    expect(MOCK_CATEGORY_TOTALS.length).toBeGreaterThan(0);
  });

  it("each entry has category, amount, items, and color", () => {
    for (const c of MOCK_CATEGORY_TOTALS) {
      expect(typeof c.category).toBe("string");
      expect(typeof c.amount).toBe("number");
      expect(typeof c.items).toBe("number");
      expect(typeof c.color).toBe("string");
      expect(c.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("MOCK_GROCERY_CATEGORIES", () => {
  it("is non-empty", () => {
    expect(MOCK_GROCERY_CATEGORIES.length).toBeGreaterThan(0);
  });

  it("each entry has key and count", () => {
    for (const c of MOCK_GROCERY_CATEGORIES) {
      expect(typeof c.key).toBe("string");
      expect(typeof c.count).toBe("number");
      expect(c.count).toBeGreaterThan(0);
    }
  });
});

describe("MOCK_PRODUCTS_BY_CATEGORY", () => {
  it("has at least one category", () => {
    expect(Object.keys(MOCK_PRODUCTS_BY_CATEGORY).length).toBeGreaterThan(0);
  });

  it("each category list is non-empty", () => {
    for (const [key, products] of Object.entries(MOCK_PRODUCTS_BY_CATEGORY)) {
      expect(products.length, `${key} should be non-empty`).toBeGreaterThan(0);
    }
  });
});

describe("ALL_MOCK_PRODUCTS", () => {
  it("contains all products from all categories combined", () => {
    const total = Object.values(MOCK_PRODUCTS_BY_CATEGORY).reduce(
      (sum, arr) => sum + arr.length,
      0,
    );
    expect(ALL_MOCK_PRODUCTS.length).toBe(total);
  });

  it("is non-empty", () => {
    expect(ALL_MOCK_PRODUCTS.length).toBeGreaterThan(0);
  });
});

describe("EXTENDED_MOCK_PRICES", () => {
  it("is non-empty", () => {
    expect(EXTENDED_MOCK_PRICES.length).toBeGreaterThan(0);
  });

  it("each entry has required price fields", () => {
    for (const p of EXTENDED_MOCK_PRICES) {
      expect(typeof p.productName).toBe("string");
      expect(typeof p.location).toBe("string");
      expect(typeof p.pricePerUnit).toBe("number");
      expect(p.pricePerUnit).toBeGreaterThan(0);
    }
  });
});

describe("getMockCategoryColor", () => {
  it("returns a hex color for known category", () => {
    const color = getMockCategoryColor("Produce");
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("returns fallback color for unknown category", () => {
    const color = getMockCategoryColor("NonExistentCategory");
    expect(color).toBe("#94a3b8");
  });
});

describe("buildMockBarData", () => {
  it("returns the same 12-entry array as MOCK_BAR_DATA", () => {
    const result = buildMockBarData();
    expect(result.length).toBe(12);
    expect(result[0].label).toBe("Jan");
  });
});

describe("MOCK_DATA_START_YEAR", () => {
  it("is a reasonable year number", () => {
    expect(typeof MOCK_DATA_START_YEAR).toBe("number");
    expect(MOCK_DATA_START_YEAR).toBeGreaterThan(2020);
    expect(MOCK_DATA_START_YEAR).toBeLessThan(2100);
  });
});
