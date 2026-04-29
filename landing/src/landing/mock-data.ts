/**
 * Mock data for the landing page demo.
 * Receipt dates are relative to today so the dashboard always shows recent data.
 */

import type { ReceiptScanRecord, GroceryProductRecord, GroceryPriceResult } from '../types';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function dateTimeAgo(n: number, time: string): string {
  return `${daysAgo(n)} ${time}`;
}

export const MOCK_RECEIPTS: ReceiptScanRecord[] = [
  {
    id: 1,
    imagePath: '/demo/loblaws.jpg',
    processedImagePath: '/demo/loblaws.jpg',
    displayName: 'Loblaws — Kanata',
    createdAt: dateTimeAgo(3, '14:32:00'),
    updatedAt: dateTimeAgo(3, '14:32:00'),
    purchaseDate: daysAgo(3),
    data: {
      rows: [
        { name: 'Whole Milk 4L',      price: 5.49, category: 'Dairy'   },
        { name: 'Large Eggs 12pk',    price: 4.29, category: 'Dairy'   },
        { name: 'Chicken Breast 1kg', price: 11.99, category: 'Meat'   },
        { name: 'Baby Spinach 142g',  price: 3.99, category: 'Produce' },
        { name: 'Sliced Bread 675g',  price: 3.49, category: 'Bakery'  },
        { name: 'Greek Yogurt 750g',  price: 6.49, category: 'Dairy'   },
        { name: 'Cheddar Cheese 400g',price: 7.99, category: 'Dairy'   },
        { name: 'Roma Tomatoes 1kg',  price: 4.49, category: 'Produce' },
      ],
    },
  },
  {
    id: 2,
    imagePath: '/demo/nofrills.jpg',
    processedImagePath: '/demo/nofrills.jpg',
    displayName: 'No Frills — Merivale',
    createdAt: dateTimeAgo(8, '10:11:00'),
    updatedAt: dateTimeAgo(8, '10:11:00'),
    purchaseDate: daysAgo(8),
    data: {
      rows: [
        { name: 'Bananas 1kg',        price: 1.69, category: 'Produce'   },
        { name: 'Orange Juice 1.89L', price: 4.99, category: 'Beverages' },
        { name: 'Ground Beef 1kg',    price: 9.99, category: 'Meat'      },
        { name: 'Pasta 900g',         price: 2.79, category: 'Dry Goods' },
        { name: 'Tomato Sauce 680mL', price: 2.49, category: 'Dry Goods' },
      ],
    },
  },
  {
    id: 3,
    imagePath: null,
    processedImagePath: null,
    displayName: 'Metro — Bank St',
    createdAt: dateTimeAgo(16, '16:05:00'),
    updatedAt: dateTimeAgo(16, '16:05:00'),
    purchaseDate: daysAgo(16),
    data: {
      rows: [
        { name: 'Salmon Fillet 500g', price: 12.99, category: 'Meat'      },
        { name: 'Broccoli 1 bunch',   price: 2.49,  category: 'Produce'   },
        { name: 'Brown Rice 900g',    price: 3.99,  category: 'Dry Goods' },
        { name: 'Olive Oil 500mL',    price: 7.49,  category: 'Dry Goods' },
        { name: 'Butter 454g',        price: 5.79,  category: 'Dairy'     },
        { name: 'Apples 3lb bag',     price: 4.99,  category: 'Produce'   },
      ],
    },
  },
  {
    id: 4,
    imagePath: null,
    processedImagePath: null,
    displayName: 'FreshCo — Baseline',
    createdAt: dateTimeAgo(23, '11:30:00'),
    updatedAt: dateTimeAgo(23, '11:30:00'),
    purchaseDate: daysAgo(23),
    data: {
      rows: [
        { name: 'Carrots 2lb',       price: 2.49, category: 'Produce'   },
        { name: 'Pork Chops 1kg',    price: 8.99, category: 'Meat'      },
        { name: 'Yogurt 6pk',        price: 5.49, category: 'Dairy'     },
        { name: 'Cereal 450g',       price: 4.99, category: 'Dry Goods' },
        { name: 'Coffee 340g',       price: 9.99, category: 'Beverages' },
      ],
    },
  },
  {
    id: 5,
    imagePath: null,
    processedImagePath: null,
    displayName: 'Costco — Merivale',
    createdAt: dateTimeAgo(30, '09:20:00'),
    updatedAt: dateTimeAgo(30, '09:20:00'),
    purchaseDate: daysAgo(30),
    data: {
      rows: [
        { name: 'Chicken Thighs 2kg', price: 16.99, category: 'Meat'      },
        { name: 'Milk 4L × 2',        price: 10.49, category: 'Dairy'     },
        { name: 'Mixed Berries 1kg',   price: 8.99,  category: 'Produce'   },
        { name: 'Granola Bars 36pk',   price: 12.99, category: 'Dry Goods' },
        { name: 'Sparkling Water 24pk',price: 7.99,  category: 'Beverages' },
        { name: 'Bagels 12pk',         price: 5.99,  category: 'Bakery'    },
        { name: 'Mozzarella 700g',     price: 9.49,  category: 'Dairy'     },
      ],
    },
  },
];

export const MOCK_CATEGORIES = [
  { id: 1, name: 'Produce',   color: '#10b981' },
  { id: 2, name: 'Dairy',     color: '#8b5cf6' },
  { id: 3, name: 'Meat',      color: '#f59e0b' },
  { id: 4, name: 'Bakery',    color: '#3b82f6' },
  { id: 5, name: 'Dry Goods', color: '#ec4899' },
  { id: 6, name: 'Beverages', color: '#14b8a6' },
];

export const MOCK_PRODUCTS: GroceryProductRecord[] = [
  { id: 1, name: 'Whole Milk',     category: 'dairy',   unit: 'l'   },
  { id: 2, name: 'Large Eggs',     category: 'eggs',    unit: 'doz' },
  { id: 3, name: 'Chicken',        category: 'poultry', unit: 'kg'  },
  { id: 4, name: 'White Bread',    category: 'bakery',  unit: 'kg'  },
  { id: 5, name: 'Cheddar Cheese', category: 'dairy',   unit: 'kg'  },
  { id: 6, name: 'Apples',         category: 'fruit',   unit: 'kg'  },
];

export const MOCK_PRICES: GroceryPriceResult[] = [
  // Whole Milk
  { productName: 'Whole Milk', location: 'Ontario', city: '', province: 'Ontario', date: '2024-01', pricePerUnit: 5.89, unit: 'l', category: 'dairy' },
  { productName: 'Whole Milk', location: 'Ontario', city: '', province: 'Ontario', date: '2024-06', pricePerUnit: 6.09, unit: 'l', category: 'dairy' },
  { productName: 'Whole Milk', location: 'Ontario', city: '', province: 'Ontario', date: '2025-01', pricePerUnit: 6.19, unit: 'l', category: 'dairy' },
  { productName: 'Whole Milk', location: 'British Columbia', city: '', province: 'British Columbia', date: '2025-01', pricePerUnit: 6.49, unit: 'l', category: 'dairy' },
  { productName: 'Whole Milk', location: 'Alberta', city: '', province: 'Alberta', date: '2025-01', pricePerUnit: 5.99, unit: 'l', category: 'dairy' },
  { productName: 'Whole Milk', location: 'Quebec', city: '', province: 'Quebec', date: '2025-01', pricePerUnit: 6.29, unit: 'l', category: 'dairy' },
  // Large Eggs
  { productName: 'Large Eggs', location: 'Ontario', city: '', province: 'Ontario', date: '2025-01', pricePerUnit: 3.89, unit: 'doz', category: 'eggs' },
  { productName: 'Large Eggs', location: 'British Columbia', city: '', province: 'British Columbia', date: '2025-01', pricePerUnit: 4.29, unit: 'doz', category: 'eggs' },
  { productName: 'Large Eggs', location: 'Alberta', city: '', province: 'Alberta', date: '2025-01', pricePerUnit: 3.69, unit: 'doz', category: 'eggs' },
  { productName: 'Large Eggs', location: 'Quebec', city: '', province: 'Quebec', date: '2025-01', pricePerUnit: 4.09, unit: 'doz', category: 'eggs' },
  // Chicken
  { productName: 'Chicken', location: 'Ontario', city: '', province: 'Ontario', date: '2025-01', pricePerUnit: 11.49, unit: 'kg', category: 'poultry' },
  { productName: 'Chicken', location: 'British Columbia', city: '', province: 'British Columbia', date: '2025-01', pricePerUnit: 12.29, unit: 'kg', category: 'poultry' },
  { productName: 'Chicken', location: 'Alberta', city: '', province: 'Alberta', date: '2025-01', pricePerUnit: 10.99, unit: 'kg', category: 'poultry' },
  // White Bread
  { productName: 'White Bread', location: 'Ontario', city: '', province: 'Ontario', date: '2025-01', pricePerUnit: 3.49, unit: 'kg', category: 'bakery' },
  { productName: 'White Bread', location: 'Alberta', city: '', province: 'Alberta', date: '2025-01', pricePerUnit: 3.29, unit: 'kg', category: 'bakery' },
  // Cheddar Cheese
  { productName: 'Cheddar Cheese', location: 'Ontario', city: '', province: 'Ontario', date: '2025-01', pricePerUnit: 14.99, unit: 'kg', category: 'dairy' },
  { productName: 'Cheddar Cheese', location: 'British Columbia', city: '', province: 'British Columbia', date: '2025-01', pricePerUnit: 15.49, unit: 'kg', category: 'dairy' },
  // Apples
  { productName: 'Apples', location: 'Ontario', city: '', province: 'Ontario', date: '2025-01', pricePerUnit: 4.39, unit: 'kg', category: 'fruit' },
  { productName: 'Apples', location: 'British Columbia', city: '', province: 'British Columbia', date: '2025-01', pricePerUnit: 4.69, unit: 'kg', category: 'fruit' },
  { productName: 'Apples', location: 'Alberta', city: '', province: 'Alberta', date: '2025-01', pricePerUnit: 4.19, unit: 'kg', category: 'fruit' },
];

export const MOCK_KPIS = {
  monthTotal: 284.50,
  prevMonthTotal: 263.10,
  deltaPercent: 8.1,
  receiptsThisPeriod: 12,
  statCanAvg: 327.40,
  savings: 42.90,
};

const _MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const _TOTALS    = [241, 198, 263, 284]; // oldest → newest, for the 4 months with data
const _RECEIPTS  = [9,   7,   11,  12];
const _CUR       = new Date().getMonth(); // 0 = Jan

export const MOCK_BAR_DATA = _MONTH_LABELS.map((label, i) => {
  const back = _CUR - i; // negative = future month
  if (back >= 0 && back < 4) {
    return { label, total: _TOTALS[3 - back], receipts: _RECEIPTS[3 - back] };
  }
  return { label, total: 0, receipts: 0 };
});

export const MOCK_CATEGORY_TOTALS = [
  { category: 'Produce',   amount: 82,  items: 14, color: '#10b981' },
  { category: 'Meat',      amount: 67,  items: 6,  color: '#f59e0b' },
  { category: 'Dairy',     amount: 51,  items: 8,  color: '#8b5cf6' },
  { category: 'Bakery',    amount: 37,  items: 5,  color: '#3b82f6' },
  { category: 'Dry Goods', amount: 28,  items: 7,  color: '#ec4899' },
  { category: 'Beverages', amount: 19,  items: 3,  color: '#14b8a6' },
];

/** Look up category color by name. */
export function getMockCategoryColor(name: string): string {
  return MOCK_CATEGORY_TOTALS.find((c) => c.category === name)?.color ?? '#94a3b8';
}

/** Returns the pre-derived monthly bar data. */
export function buildMockBarData(): typeof MOCK_BAR_DATA {
  return MOCK_BAR_DATA;
}

/** The earliest year present in mock data, used to restrict analytics back-navigation. */
export const MOCK_DATA_START_YEAR = new Date().getFullYear();

// ── Prices flow: categories → products → detail ───────────────────────────────

export const MOCK_GROCERY_CATEGORIES: { key: string; count: number }[] = [
  { key: 'produce',          count: 8 },
  { key: 'meat_and_seafood', count: 5 },
  { key: 'dairy_and_eggs',   count: 7 },
  { key: 'pantry',           count: 6 },
  { key: 'frozen',           count: 3 },
  { key: 'bakery',           count: 3 },
  { key: 'beverages',        count: 5 },
  { key: 'snacks',           count: 4 },
];

export const MOCK_PRODUCTS_BY_CATEGORY: Record<string, GroceryProductRecord[]> = {
  produce: [
    { id: 101, name: 'Apples',        category: 'produce', unit: 'kg' },
    { id: 102, name: 'Bananas',       category: 'produce', unit: 'kg' },
    { id: 103, name: 'Baby Spinach',  category: 'produce', unit: 'kg' },
    { id: 104, name: 'Roma Tomatoes', category: 'produce', unit: 'kg' },
    { id: 105, name: 'Carrots',       category: 'produce', unit: 'kg' },
    { id: 106, name: 'Broccoli',      category: 'produce', unit: 'kg' },
    { id: 107, name: 'Potatoes',      category: 'produce', unit: 'kg' },
    { id: 108, name: 'Onions',        category: 'produce', unit: 'kg' },
  ],
  meat_and_seafood: [
    { id: 201, name: 'Chicken Breast', category: 'meat_and_seafood', unit: 'kg' },
    { id: 202, name: 'Ground Beef',    category: 'meat_and_seafood', unit: 'kg' },
    { id: 203, name: 'Salmon Fillet',  category: 'meat_and_seafood', unit: 'kg' },
    { id: 204, name: 'Pork Chops',     category: 'meat_and_seafood', unit: 'kg' },
    { id: 205, name: 'Shrimp',         category: 'meat_and_seafood', unit: 'kg' },
  ],
  dairy_and_eggs: [
    { id: 301, name: 'Whole Milk',         category: 'dairy_and_eggs', unit: 'l'   },
    { id: 302, name: 'Large Eggs',         category: 'dairy_and_eggs', unit: 'doz' },
    { id: 303, name: 'Cheddar Cheese',     category: 'dairy_and_eggs', unit: 'kg'  },
    { id: 304, name: 'Greek Yogurt',       category: 'dairy_and_eggs', unit: 'kg'  },
    { id: 305, name: 'Butter',             category: 'dairy_and_eggs', unit: 'kg'  },
    { id: 306, name: 'Cream Cheese',       category: 'dairy_and_eggs', unit: 'kg'  },
    { id: 307, name: 'Sour Cream 14% MF',  category: 'dairy_and_eggs', unit: 'kg'  },
  ],
  pantry: [
    { id: 601, name: 'Pasta',            category: 'pantry', unit: 'kg' },
    { id: 602, name: 'Brown Rice',       category: 'pantry', unit: 'kg' },
    { id: 603, name: 'Olive Oil',        category: 'pantry', unit: 'l'  },
    { id: 604, name: 'Tomato Sauce',     category: 'pantry', unit: 'kg' },
    { id: 605, name: 'Canned Chickpeas', category: 'pantry', unit: 'kg' },
    { id: 606, name: 'Peanut Butter',    category: 'pantry', unit: 'kg' },
  ],
  frozen: [
    { id: 701, name: 'Mixed Berries', category: 'frozen', unit: 'kg' },
    { id: 702, name: 'Edamame',       category: 'frozen', unit: 'kg' },
    { id: 703, name: 'Frozen Peas',   category: 'frozen', unit: 'kg' },
  ],
  bakery: [
    { id: 401, name: 'White Bread',       category: 'bakery', unit: 'kg' },
    { id: 402, name: 'Bagels',            category: 'bakery', unit: 'kg' },
    { id: 403, name: 'Whole Wheat Bread', category: 'bakery', unit: 'kg' },
  ],
  beverages: [
    { id: 501, name: 'Orange Juice',    category: 'beverages', unit: 'l'  },
    { id: 502, name: 'Coffee',          category: 'beverages', unit: 'kg' },
    { id: 503, name: 'Green Tea',       category: 'beverages', unit: 'kg' },
    { id: 504, name: 'Sparkling Water', category: 'beverages', unit: 'l'  },
    { id: 505, name: 'Apple Juice',     category: 'beverages', unit: 'l'  },
  ],
  snacks: [
    { id: 801, name: 'Granola Bars',   category: 'snacks', unit: 'kg' },
    { id: 802, name: 'Almonds',        category: 'snacks', unit: 'kg' },
    { id: 803, name: 'Potato Chips',   category: 'snacks', unit: 'kg' },
    { id: 804, name: 'Dark Chocolate', category: 'snacks', unit: 'kg' },
  ],
};

export const ALL_MOCK_PRODUCTS: GroceryProductRecord[] = Object.values(MOCK_PRODUCTS_BY_CATEGORY).flat();

// Price table: productName → year → location → price per unit
const _PRICE_DATA: Record<string, Record<string, Record<string, number>>> = {
  // Produce
  Apples:        { '2024': { Canada: 4.09, Ontario: 4.09, 'British Columbia': 4.29, Alberta: 3.89, Quebec: 4.19 }, '2025': { Canada: 4.19, Ontario: 4.19, 'British Columbia': 4.39, Alberta: 3.99, Quebec: 4.29 } },
  Bananas:       { '2024': { Canada: 1.89, Ontario: 1.89, 'British Columbia': 1.99, Alberta: 1.79, Quebec: 1.99 }, '2025': { Canada: 1.99, Ontario: 1.99, 'British Columbia': 2.09, Alberta: 1.89, Quebec: 2.19 } },
  'Baby Spinach':  { '2024': { Canada: 9.69, Ontario: 9.69, 'British Columbia': 9.99, Alberta: 9.49, Quebec: 9.89 }, '2025': { Canada: 9.99, Ontario: 9.99, 'British Columbia': 10.29, Alberta: 9.79, Quebec: 10.49 } },
  'Roma Tomatoes': { '2024': { Canada: 4.19, Ontario: 4.19, 'British Columbia': 4.49, Alberta: 3.99, Quebec: 4.39 }, '2025': { Canada: 4.49, Ontario: 4.49, 'British Columbia': 4.79, Alberta: 4.29, Quebec: 4.69 } },
  Carrots:       { '2024': { Canada: 1.69, Ontario: 1.69, 'British Columbia': 1.89, Alberta: 1.59, Quebec: 1.79 }, '2025': { Canada: 1.79, Ontario: 1.79, 'British Columbia': 1.99, Alberta: 1.69, Quebec: 1.89 } },
  Broccoli:      { '2024': { Canada: 3.29, Ontario: 3.29, 'British Columbia': 3.59, Alberta: 3.09, Quebec: 3.39 }, '2025': { Canada: 3.49, Ontario: 3.49, 'British Columbia': 3.79, Alberta: 3.29, Quebec: 3.59 } },
  Potatoes:      { '2024': { Canada: 2.79, Ontario: 2.79, 'British Columbia': 2.99, Alberta: 2.59, Quebec: 2.89 }, '2025': { Canada: 2.99, Ontario: 2.99, 'British Columbia': 3.19, Alberta: 2.79, Quebec: 3.09 } },
  Onions:        { '2024': { Canada: 1.79, Ontario: 1.79, 'British Columbia': 1.89, Alberta: 1.69, Quebec: 1.89 }, '2025': { Canada: 1.89, Ontario: 1.89, 'British Columbia': 1.99, Alberta: 1.79, Quebec: 1.99 } },
  // Meat & Seafood
  'Chicken Breast': { '2024': { Canada: 11.29, Ontario: 11.29, 'British Columbia': 11.79, Alberta: 10.79, Quebec: 11.59 }, '2025': { Canada: 11.99, Ontario: 11.99, 'British Columbia': 12.49, Alberta: 10.99, Quebec: 12.29 } },
  'Ground Beef':    { '2024': { Canada: 9.49,  Ontario: 9.49,  'British Columbia': 9.99,  Alberta: 8.99,  Quebec: 9.79  }, '2025': { Canada: 9.99,  Ontario: 9.99,  'British Columbia': 10.49, Alberta: 9.49,  Quebec: 10.29 } },
  'Salmon Fillet':  { '2024': { Canada: 23.49, Ontario: 23.49, 'British Columbia': 20.99, Alberta: 22.99, Quebec: 24.49 }, '2025': { Canada: 24.99, Ontario: 24.99, 'British Columbia': 22.49, Alberta: 24.29, Quebec: 25.49 } },
  'Pork Chops':     { '2024': { Canada: 8.49,  Ontario: 8.49,  'British Columbia': 8.99,  Alberta: 7.99,  Quebec: 8.79  }, '2025': { Canada: 8.99,  Ontario: 8.99,  'British Columbia': 9.49,  Alberta: 8.49,  Quebec: 9.29  } },
  Shrimp:           { '2024': { Canada: 17.99, Ontario: 17.99, 'British Columbia': 16.99, Alberta: 18.29, Quebec: 18.49 }, '2025': { Canada: 18.99, Ontario: 18.99, 'British Columbia': 17.99, Alberta: 19.29, Quebec: 19.49 } },
  // Dairy & Eggs
  'Whole Milk':         { '2024': { Canada: 5.99, Ontario: 5.99, 'British Columbia': 6.29, Alberta: 5.79, Quebec: 6.09 }, '2025': { Canada: 6.19, Ontario: 6.19, 'British Columbia': 6.49, Alberta: 5.99, Quebec: 6.29 } },
  'Large Eggs':         { '2024': { Canada: 3.69, Ontario: 3.69, 'British Columbia': 4.09, Alberta: 3.49, Quebec: 3.89 }, '2025': { Canada: 3.89, Ontario: 3.89, 'British Columbia': 4.29, Alberta: 3.69, Quebec: 4.09 } },
  'Cheddar Cheese':     { '2024': { Canada: 14.49, Ontario: 14.49, 'British Columbia': 14.99, Alberta: 13.99, Quebec: 14.79 }, '2025': { Canada: 14.99, Ontario: 14.99, 'British Columbia': 15.49, Alberta: 14.49, Quebec: 15.29 } },
  'Greek Yogurt':       { '2024': { Canada: 8.49, Ontario: 8.49, 'British Columbia': 8.99, Alberta: 8.29, Quebec: 8.79 }, '2025': { Canada: 8.99, Ontario: 8.99, 'British Columbia': 9.49, Alberta: 8.79, Quebec: 9.29 } },
  Butter:               { '2024': { Canada: 9.49, Ontario: 9.49, 'British Columbia': 9.99, Alberta: 9.29, Quebec: 9.79 }, '2025': { Canada: 9.99, Ontario: 9.99, 'British Columbia': 10.49, Alberta: 9.79, Quebec: 10.29 } },
  'Cream Cheese':       { '2024': { Canada: 11.49, Ontario: 11.49, 'British Columbia': 11.99, Alberta: 11.29, Quebec: 11.79 }, '2025': { Canada: 11.99, Ontario: 11.99, 'British Columbia': 12.49, Alberta: 11.79, Quebec: 12.29 } },
  'Sour Cream 14% MF':  { '2024': { Canada: 6.49, Ontario: 6.49, 'British Columbia': 6.79, Alberta: 6.29, Quebec: 6.59 }, '2025': { Canada: 6.99, Ontario: 6.99, 'British Columbia': 7.29, Alberta: 6.79, Quebec: 7.09 } },
  // Pantry
  Pasta:            { '2024': { Canada: 3.69, Ontario: 3.69, 'British Columbia': 3.89, Alberta: 3.49, Quebec: 3.79 }, '2025': { Canada: 3.99, Ontario: 3.99, 'British Columbia': 4.19, Alberta: 3.79, Quebec: 4.09 } },
  'Brown Rice':     { '2024': { Canada: 3.19, Ontario: 3.19, 'British Columbia': 3.39, Alberta: 2.99, Quebec: 3.29 }, '2025': { Canada: 3.49, Ontario: 3.49, 'British Columbia': 3.69, Alberta: 3.29, Quebec: 3.59 } },
  'Olive Oil':      { '2024': { Canada: 13.99, Ontario: 13.99, 'British Columbia': 14.49, Alberta: 13.49, Quebec: 14.29 }, '2025': { Canada: 14.99, Ontario: 14.99, 'British Columbia': 15.49, Alberta: 14.49, Quebec: 15.29 } },
  'Tomato Sauce':   { '2024': { Canada: 3.69, Ontario: 3.69, 'British Columbia': 3.89, Alberta: 3.49, Quebec: 3.79 }, '2025': { Canada: 3.99, Ontario: 3.99, 'British Columbia': 4.19, Alberta: 3.79, Quebec: 4.09 } },
  'Canned Chickpeas':{ '2024': { Canada: 2.69, Ontario: 2.69, 'British Columbia': 2.89, Alberta: 2.49, Quebec: 2.79 }, '2025': { Canada: 2.99, Ontario: 2.99, 'British Columbia': 3.19, Alberta: 2.79, Quebec: 3.09 } },
  'Peanut Butter':  { '2024': { Canada: 7.49, Ontario: 7.49, 'British Columbia': 7.79, Alberta: 7.29, Quebec: 7.69 }, '2025': { Canada: 7.99, Ontario: 7.99, 'British Columbia': 8.29, Alberta: 7.79, Quebec: 8.09 } },
  // Frozen
  'Mixed Berries':   { '2024': { Canada: 7.49, Ontario: 7.49, 'British Columbia': 7.79, Alberta: 7.29, Quebec: 7.69 }, '2025': { Canada: 7.99, Ontario: 7.99, 'British Columbia': 8.29, Alberta: 7.79, Quebec: 8.09 } },
  Edamame:           { '2024': { Canada: 5.49, Ontario: 5.49, 'British Columbia': 5.79, Alberta: 5.29, Quebec: 5.69 }, '2025': { Canada: 5.99, Ontario: 5.99, 'British Columbia': 6.29, Alberta: 5.79, Quebec: 6.09 } },
  'Frozen Peas':     { '2024': { Canada: 3.19, Ontario: 3.19, 'British Columbia': 3.39, Alberta: 2.99, Quebec: 3.29 }, '2025': { Canada: 3.49, Ontario: 3.49, 'British Columbia': 3.69, Alberta: 3.29, Quebec: 3.59 } },
  // Bakery
  'White Bread':       { '2024': { Canada: 3.19, Ontario: 3.19, 'British Columbia': 3.49, Alberta: 2.99, Quebec: 3.29 }, '2025': { Canada: 3.49, Ontario: 3.49, 'British Columbia': 3.79, Alberta: 3.29, Quebec: 3.59 } },
  Bagels:              { '2024': { Canada: 5.49, Ontario: 5.49, 'British Columbia': 5.79, Alberta: 5.29, Quebec: 5.69 }, '2025': { Canada: 5.99, Ontario: 5.99, 'British Columbia': 6.29, Alberta: 5.79, Quebec: 6.09 } },
  'Whole Wheat Bread': { '2024': { Canada: 3.49, Ontario: 3.49, 'British Columbia': 3.79, Alberta: 3.29, Quebec: 3.59 }, '2025': { Canada: 3.79, Ontario: 3.79, 'British Columbia': 4.09, Alberta: 3.59, Quebec: 3.89 } },
  // Beverages
  'Orange Juice':    { '2024': { Canada: 5.69, Ontario: 5.69, 'British Columbia': 5.99, Alberta: 5.49, Quebec: 5.89 }, '2025': { Canada: 5.99, Ontario: 5.99, 'British Columbia': 6.29, Alberta: 5.79, Quebec: 6.19 } },
  Coffee:            { '2024': { Canada: 21.49, Ontario: 21.49, 'British Columbia': 22.49, Alberta: 20.99, Quebec: 21.99 }, '2025': { Canada: 21.99, Ontario: 21.99, 'British Columbia': 22.99, Alberta: 21.49, Quebec: 22.49 } },
  'Green Tea':       { '2024': { Canada: 25.99, Ontario: 25.99, 'British Columbia': 26.99, Alberta: 25.49, Quebec: 26.49 }, '2025': { Canada: 27.99, Ontario: 27.99, 'British Columbia': 28.99, Alberta: 27.49, Quebec: 28.49 } },
  'Sparkling Water': { '2024': { Canada: 2.19, Ontario: 2.19, 'British Columbia': 2.39, Alberta: 2.09, Quebec: 2.29 }, '2025': { Canada: 2.49, Ontario: 2.49, 'British Columbia': 2.69, Alberta: 2.39, Quebec: 2.59 } },
  'Apple Juice':     { '2024': { Canada: 4.69, Ontario: 4.69, 'British Columbia': 4.99, Alberta: 4.49, Quebec: 4.89 }, '2025': { Canada: 4.99, Ontario: 4.99, 'British Columbia': 5.29, Alberta: 4.79, Quebec: 5.09 } },
  // Snacks
  'Granola Bars':    { '2024': { Canada: 13.99, Ontario: 13.99, 'British Columbia': 14.49, Alberta: 13.49, Quebec: 14.29 }, '2025': { Canada: 14.99, Ontario: 14.99, 'British Columbia': 15.49, Alberta: 14.49, Quebec: 15.29 } },
  Almonds:           { '2024': { Canada: 18.99, Ontario: 18.99, 'British Columbia': 19.49, Alberta: 18.49, Quebec: 19.29 }, '2025': { Canada: 19.99, Ontario: 19.99, 'British Columbia': 20.49, Alberta: 19.79, Quebec: 20.29 } },
  'Potato Chips':    { '2024': { Canada: 11.99, Ontario: 11.99, 'British Columbia': 12.49, Alberta: 11.49, Quebec: 12.29 }, '2025': { Canada: 12.99, Ontario: 12.99, 'British Columbia': 13.49, Alberta: 12.79, Quebec: 13.29 } },
  'Dark Chocolate':  { '2024': { Canada: 21.99, Ontario: 21.99, 'British Columbia': 22.49, Alberta: 21.49, Quebec: 22.29 }, '2025': { Canada: 22.99, Ontario: 22.99, 'British Columbia': 23.49, Alberta: 22.79, Quebec: 23.29 } },
};

/** Flat price array derived from the price table above. */
export const EXTENDED_MOCK_PRICES: GroceryPriceResult[] = (() => {
  const results: GroceryPriceResult[] = [];
  const productMap = new Map(ALL_MOCK_PRODUCTS.map((p) => [p.name, p]));
  for (const [productName, yearData] of Object.entries(_PRICE_DATA)) {
    const product = productMap.get(productName);
    if (!product) continue;
    for (const [year, locData] of Object.entries(yearData)) {
      for (const [location, price] of Object.entries(locData)) {
        results.push({
          productName,
          location,
          city: '',
          province: location,
          date: `${year}-01`,
          pricePerUnit: price,
          unit: product.unit,
          category: product.category,
        });
      }
    }
  }
  return results;
})();
