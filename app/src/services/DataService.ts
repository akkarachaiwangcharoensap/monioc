/**
 * DataService — abstract interface decoupling React components from the Tauri
 * IPC layer.  Production uses TauriDataService; the landing page uses
 * MockDataService backed by static data.
 */
import type {
	ReceiptScanRecord,
	ReceiptData,
	GroceryMetadata,
	GroceryCategoryRecord,
	GroceryLocationRecord,
	ProductPage,
	PricePage,
	ImageLibraryEntry,
} from '../types';
import type {
	CategoryRecord,
	CategoryInput,
	BackupInfo,
	StorageInfo,
	ModelStatus,
	ModelDownloadProgress,
	ImageEditParams,
} from './api';

export interface DataService {
	// ── Receipts ────────────────────────────────────────────────────────────────
	listReceiptScans(): Promise<ReceiptScanRecord[]>;
	saveReceiptScan(payload: {
		imagePath: string | null;
		processedImagePath: string | null;
		data: ReceiptData;
		displayName?: string | null;
	}): Promise<ReceiptScanRecord>;
	updateReceiptScan(payload: {
		id: number;
		imagePath: string | null;
		processedImagePath: string | null;
		data: ReceiptData;
	}): Promise<ReceiptScanRecord>;
	deleteReceiptScan(id: number): Promise<void>;
	renameReceiptScan(id: number, name: string | null): Promise<void>;
	updateReceiptPurchaseDate(id: number, purchaseDate: string | null): Promise<ReceiptScanRecord>;
	updateReceiptCreatedAt(id: number, createdAt: string): Promise<ReceiptScanRecord>;
	exportReceiptCsv(payload: { data: ReceiptData; destPath: string }): Promise<void>;
	scanReceipt(payload: {
		imagePath: string;
		receiptId?: number | null;
		withAutoCat: boolean;
		categories: string[];
	}): Promise<string>;
	inferItemCategories(payload: {
		receiptId: number;
		items: string[];
		categories: string[];
		data: ReceiptData;
	}): Promise<string>;

	// ── Categories ──────────────────────────────────────────────────────────────
	listCategories(): Promise<CategoryRecord[]>;
	saveCategories(categories: CategoryInput[]): Promise<void>;
	updateCategoryColor(name: string, color: string): Promise<void>;
	renameCategory(oldName: string, newName: string): Promise<void>;
	deleteCategory(name: string): Promise<void>;
	addCategory(name: string, color: string, sortOrder: number): Promise<void>;
	updateCategoryOrder(orderedNames: string[]): Promise<void>;

	// ── Backup / Restore ────────────────────────────────────────────────────────
	exportBackup(destPath: string): Promise<BackupInfo>;
	importBackup(sourcePath: string): Promise<void>;

	// ── System / Misc ───────────────────────────────────────────────────────────
	clearReceiptStaging(): Promise<void>;
	removeReceiptImages(): Promise<void>;
	removeAllAppData(): Promise<void>;
	openAppDataDir(): Promise<void>;
	getStorageInfo(): Promise<StorageInfo>;
	editImage(payload: { sourcePath: string; params: ImageEditParams }): Promise<string>;
	getAppVersion(): Promise<string>;
	cancelJob(jobKey: string): Promise<void>;
	checkModelStatus(): Promise<ModelStatus>;
	downloadModels(): Promise<ModelStatus>;
	cancelModelDownload(): Promise<void>;
	modelDownloadProgress(): Promise<ModelDownloadProgress>;
	removeModels(): Promise<void>;

	// ── Grocery reference data ──────────────────────────────────────────────────
	getGroceryMetadata(): Promise<GroceryMetadata>;
	listGroceryCategories(): Promise<GroceryCategoryRecord[]>;
	listGroceryLocations(): Promise<GroceryLocationRecord[]>;
	listGroceryProducts(payload: {
		category: string;
		search: string;
		page: number;
		pageSize: number;
	}): Promise<ProductPage>;
	getGroceryPrices(payload: {
		productName: string;
		location: string;
		year: string;
		page: number;
		pageSize: number;
	}): Promise<PricePage>;

	// ── Image Library ───────────────────────────────────────────────────────────
	addImagesToLibrary(paths: string[]): Promise<ImageLibraryEntry[]>;
	getImageLibrary(): Promise<ImageLibraryEntry[]>;
	getLibraryEntry(id: number): Promise<ImageLibraryEntry | null>;
	removeFromLibrary(id: number): Promise<void>;
	clearLibrary(): Promise<void>;
	linkImageToReceipt(id: number, receiptId: number): Promise<void>;
	updateLibraryEntryStaging(id: number, stagingPath: string | null): Promise<void>;
}
