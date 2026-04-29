/**
 * TauriDataService — production implementation of DataService that delegates
 * every call to the existing TauriApi IPC layer.
 */
import type { DataService } from './DataService';
import { TauriApi } from './api';

export class TauriDataService implements DataService {
	// ── Receipts ────────────────────────────────────────────────────────────────
	listReceiptScans = TauriApi.listReceiptScans;
	saveReceiptScan = TauriApi.saveReceiptScan;
	updateReceiptScan = TauriApi.updateReceiptScan;
	deleteReceiptScan = TauriApi.deleteReceiptScan;
	renameReceiptScan = TauriApi.renameReceiptScan;
	updateReceiptPurchaseDate = TauriApi.updateReceiptPurchaseDate;
	updateReceiptCreatedAt = TauriApi.updateReceiptCreatedAt;
	exportReceiptCsv = TauriApi.exportReceiptCsv;
	scanReceipt = TauriApi.scanReceipt;
	inferItemCategories = TauriApi.inferItemCategories;

	// ── Categories ──────────────────────────────────────────────────────────────
	listCategories = TauriApi.listCategories;
	saveCategories = TauriApi.saveCategories;
	updateCategoryColor = TauriApi.updateCategoryColor;
	renameCategory = TauriApi.renameCategory;
	deleteCategory = TauriApi.deleteCategory;
	addCategory = TauriApi.addCategory;
	updateCategoryOrder = TauriApi.updateCategoryOrder;

	// ── Backup / Restore ────────────────────────────────────────────────────────
	exportBackup = TauriApi.exportBackup;
	importBackup = TauriApi.importBackup;

	// ── System / Misc ───────────────────────────────────────────────────────────
	clearReceiptStaging = TauriApi.clearReceiptStaging;
	removeReceiptImages = TauriApi.removeReceiptImages;
	removeAllAppData = TauriApi.removeAllAppData;
	openAppDataDir = TauriApi.openAppDataDir;
	getStorageInfo = TauriApi.getStorageInfo;
	editImage = TauriApi.editImage;
	getAppVersion = TauriApi.getAppVersion;
	cancelJob = TauriApi.cancelJob;
	checkModelStatus = TauriApi.checkModelStatus;
	downloadModels = TauriApi.downloadModels;
	cancelModelDownload = TauriApi.cancelModelDownload;
	modelDownloadProgress = TauriApi.modelDownloadProgress;
	removeModels = TauriApi.removeModels;

	// ── Grocery reference data ──────────────────────────────────────────────────
	getGroceryMetadata = TauriApi.getGroceryMetadata;
	listGroceryCategories = TauriApi.listGroceryCategories;
	listGroceryLocations = TauriApi.listGroceryLocations;
	listGroceryProducts = TauriApi.listGroceryProducts;
	getGroceryPrices = TauriApi.getGroceryPrices;

	// ── Image Library ───────────────────────────────────────────────────────────
	addImagesToLibrary = TauriApi.addImagesToLibrary;
	getImageLibrary = TauriApi.getImageLibrary;
	getLibraryEntry = TauriApi.getLibraryEntry;
	removeFromLibrary = TauriApi.removeFromLibrary;
	clearLibrary = TauriApi.clearLibrary;
	linkImageToReceipt = TauriApi.linkImageToReceipt;
	updateLibraryEntryStaging = TauriApi.updateLibraryEntryStaging;
}
