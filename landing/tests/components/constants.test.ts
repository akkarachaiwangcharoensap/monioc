import { describe, it, expect } from "vitest";
import {
  CUSTOM_GROCERY_CATEGORIES,
  CHART_COLORS,
  FALLBACK_CATEGORY_COLOR,
  CATEGORY_NONE_LABEL,
  CHART_ANIMATION_DURATION_MS,
  CHART_TRANSITION_DURATION_MS,
  NANOID_LENGTH,
  MAX_CATEGORY_NAME_LENGTH,
  CATEGORY_DISPLAY_NAMES,
  CATEGORY_SEMANTIC_COLORS,
  DEFAULT_CATEGORY_COLORS,
  ROUTES,
  SpreadsheetColumn,
} from "@/constants";

describe("CUSTOM_GROCERY_CATEGORIES", () => {
  it("is a non-empty tuple", () => {
    expect(CUSTOM_GROCERY_CATEGORIES.length).toBeGreaterThan(0);
  });

  it("contains expected categories", () => {
    expect(CUSTOM_GROCERY_CATEGORIES).toContain("Vegetable");
    expect(CUSTOM_GROCERY_CATEGORIES).toContain("Fruit");
    expect(CUSTOM_GROCERY_CATEGORIES).toContain("Meat");
    expect(CUSTOM_GROCERY_CATEGORIES).toContain("Other");
  });

  it("has no duplicate entries", () => {
    const arr = Array.from(CUSTOM_GROCERY_CATEGORIES);
    expect(new Set(arr).size).toBe(arr.length);
  });
});

describe("CHART_COLORS", () => {
  it("is a non-empty array", () => {
    expect(CHART_COLORS.length).toBeGreaterThan(0);
  });

  it("all entries are hex color strings", () => {
    for (const color of CHART_COLORS) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("FALLBACK_CATEGORY_COLOR", () => {
  it("is a hex color string", () => {
    expect(FALLBACK_CATEGORY_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("CATEGORY_NONE_LABEL", () => {
  it("is a non-empty string", () => {
    expect(typeof CATEGORY_NONE_LABEL).toBe("string");
    expect(CATEGORY_NONE_LABEL.length).toBeGreaterThan(0);
  });
});

describe("timing constants", () => {
  it("CHART_ANIMATION_DURATION_MS is a positive number", () => {
    expect(CHART_ANIMATION_DURATION_MS).toBeGreaterThan(0);
  });

  it("CHART_TRANSITION_DURATION_MS is a positive number", () => {
    expect(CHART_TRANSITION_DURATION_MS).toBeGreaterThan(0);
  });
});

describe("size constants", () => {
  it("NANOID_LENGTH is positive", () => {
    expect(NANOID_LENGTH).toBeGreaterThan(0);
  });

  it("MAX_CATEGORY_NAME_LENGTH is positive", () => {
    expect(MAX_CATEGORY_NAME_LENGTH).toBeGreaterThan(0);
  });
});

describe("CATEGORY_DISPLAY_NAMES", () => {
  it("is a non-empty record", () => {
    expect(Object.keys(CATEGORY_DISPLAY_NAMES).length).toBeGreaterThan(0);
  });

  it("maps known DB slugs to human labels", () => {
    expect(CATEGORY_DISPLAY_NAMES["produce"]).toBe("Produce");
    expect(CATEGORY_DISPLAY_NAMES["meat_and_seafood"]).toBe("Meat & Seafood");
    expect(CATEGORY_DISPLAY_NAMES["dairy_and_eggs"]).toBe("Dairy & Eggs");
  });
});

describe("CATEGORY_SEMANTIC_COLORS", () => {
  it("is a non-empty record", () => {
    expect(Object.keys(CATEGORY_SEMANTIC_COLORS).length).toBeGreaterThan(0);
  });

  it("all values are hex color strings", () => {
    for (const color of Object.values(CATEGORY_SEMANTIC_COLORS)) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("DEFAULT_CATEGORY_COLORS", () => {
  it("has at least 10 colors", () => {
    expect(DEFAULT_CATEGORY_COLORS.length).toBeGreaterThanOrEqual(10);
  });

  it("all entries are hex color strings", () => {
    for (const color of DEFAULT_CATEGORY_COLORS) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("ROUTES", () => {
  it("has a DASHBOARD route", () => {
    expect(ROUTES.DASHBOARD).toBe("/");
  });

  it("all route values start with /", () => {
    for (const route of Object.values(ROUTES)) {
      expect(route.startsWith("/")).toBe(true);
    }
  });
});

describe("SpreadsheetColumn enum", () => {
  it("Name is 0", () => {
    expect(SpreadsheetColumn.Name).toBe(0);
  });

  it("Category is 1", () => {
    expect(SpreadsheetColumn.Category).toBe(1);
  });

  it("Price is 2", () => {
    expect(SpreadsheetColumn.Price).toBe(2);
  });
});
