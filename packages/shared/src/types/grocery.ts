/**
 * Grocery reference data types (from SQLite via Tauri IPC).
 */

export interface GroceryCategoryRecord {
	id: number;
	name: string;
	count: number;
}

export interface GroceryLocationRecord {
	id: number;
	location: string;
	city: string;
	province: string;
}

export interface GroceryProductRecord {
	id: number;
	name: string;
	category: string;
	unit: string;
}

export interface GroceryPriceResult {
	date: string;
	productName: string;
	category: string;
	pricePerUnit: number;
	unit: string;
	location: string;
	city: string;
	province: string;
}

export interface GroceryMetadata {
	totalRecords: number;
	totalProducts: number;
	totalLocations: number;
	totalCategories: number;
	dateMin: string;
	dateMax: string;
}

export interface ProductPage {
	products: GroceryProductRecord[];
	total: number;
	page: number;
	pageSize: number;
}

export interface PricePage {
	prices: GroceryPriceResult[];
	total: number;
	page: number;
	pageSize: number;
}

// ── Legacy types kept for backwards-compatibility with existing page components ─
// Pages that previously used the JSON-blob GroceryData shape continue to work.
// The context now populates these from SQLite IPC data.

export interface Category {
	name: string;
	count: number;
}

export interface Location {
	location: string;
	city: string;
	province: string;
}

export interface Product {
	product_name: string;
	product_category: string;
	product_unit: string;
}

export interface PriceRecord {
	date: string;
	product_name: string;
	product_category: string;
	price_per_unit: number;
	product_unit: string;
	location: string;
	city: string;
	province: string;
}

export interface Metadata {
	source: string;
	processed_date: string;
	total_records: number;
	date_range: {
		min: string;
		max: string;
	};
	total_products: number;
	total_locations: number;
	total_categories: number;
}

export interface GroceryData {
	metadata: Metadata;
	categories: Category[];
	locations: Location[];
	products: Product[];
	prices: PriceRecord[];
}

export interface ComparisonResult {
	userPrice: number;
	statsCanPrice: number;
	difference: number;
	percentageDifference: number;
	isSaving: boolean;
	product: string;
	location: string;
	year: string;
}
