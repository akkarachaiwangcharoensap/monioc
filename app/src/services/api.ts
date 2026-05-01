import { invoke } from '@tauri-apps/api/core';
import type {
    ReceiptData,
    ReceiptScanRecord,
    GroceryMetadata,
    GroceryCategoryRecord,
    GroceryLocationRecord,
    ProductPage,
    PricePage,
    ImageLibraryEntry,
} from '../types';

export interface ModelStatus {
    ocr: boolean;
    llm: boolean;
    /** Human-readable failure reason from the Python downloader. Present only
     * when `ocr` or `llm` is false; the UI shows this in place of a generic
     * message so production users can see the real cause (e.g. HF Hub symlink
     * failure, antivirus lock, path too long). */
    error?: string | null;
}

export interface ModelDownloadProgress {
    downloadedBytes: number;
    totalBytes: number;
    downloadedFiles: number;
    totalFiles: number;
}

export interface PythonSetupStatus {
    /** Interpreter installed AND `pip install -r requirements.txt` finished. */
    ready: boolean;
    /** Absolute path to the embedded interpreter, when installed. */
    interpreterPath?: string | null;
    /** True only on platforms where the embedded-Python flow applies (Windows).
     * macOS / Linux clients can use this to skip the setup-step UI. */
    required: boolean;
}

export interface StorageInfo {
    appDataDir: string;
    fileCount: number;
    totalSizeBytes: number;
    dbSizeBytes?: number;
    receiptImagesBytes?: number;
    stagingBytes?: number;
    modelsBytes?: number;
    otherBytes?: number;
}

export interface ImageEditParams {
    cropX: number;
    cropY: number;
    cropW: number;
    cropH: number;
    rotation: number;
    flipH: boolean;
    brightness: number;
    contrast: number;
    grayscale: boolean;
}

export interface CategoryRecord {
    id: number;
    name: string;
    color: string;
    sortOrder: number;
}

export interface CategoryInput {
    name: string;
    color: string;
    sortOrder: number;
}

export interface BackupInfo {
    path: string;
    sizeBytes: number;
    /** Number of files packed into the archive (database + images). */
    entryCount: number;
}

/**
 * Abstraction layer for Tauri IPC backend interactions.
 * This decouples the React UI components from Tauri strings
 * and provides type-safety across boundaries.
 */
export const TauriApi = {
    // Receipts
    listReceiptScans: () => invoke<ReceiptScanRecord[]>('list_receipt_scans'),
    saveReceiptScan: (payload: { imagePath: string | null; processedImagePath: string | null; data: import('../types').ReceiptData; displayName?: string | null }) =>
        invoke<ReceiptScanRecord>('save_receipt_scan', payload),
    updateReceiptScan: (payload: { id: number; imagePath: string | null; processedImagePath: string | null; data: import('../types').ReceiptData }) =>
        invoke<ReceiptScanRecord>('update_receipt_scan', payload),
    deleteReceiptScan: (id: number) => invoke<void>('delete_receipt_scan', { id }),
    renameReceiptScan: (id: number, name: string | null) => invoke<void>('rename_receipt_scan', { id, name }),
    updateReceiptPurchaseDate: (id: number, purchaseDate: string | null) =>
        invoke<import('../types').ReceiptScanRecord>('update_receipt_purchase_date', { id, purchaseDate }),
    updateReceiptCreatedAt: (id: number, createdAt: string) =>
        invoke<import('../types').ReceiptScanRecord>('update_receipt_created_at', { id, createdAt }),
    exportReceiptCsv: (payload: { data: import('../types').ReceiptData; destPath: string }) => invoke<void>('export_receipt_csv', payload),
    scanReceipt: (payload: { imagePath: string; receiptId?: number | null; withAutoCat: boolean; categories: string[] }) => invoke<string>('scan_receipt', payload),
    inferItemCategories: (payload: { receiptId: number; items: string[]; categories: string[]; data: ReceiptData }) =>
        invoke<string>('infer_item_categories', payload),

    // Categories
    listCategories: () => invoke<CategoryRecord[]>('list_categories'),
    saveCategories: (categories: CategoryInput[]) => invoke<void>('save_categories', { categories }),
    updateCategoryColor: (name: string, color: string) => invoke<void>('update_category_color', { name, color }),
    renameCategory: (oldName: string, newName: string) => invoke<void>('rename_category', { oldName, newName }),
    deleteCategory: (name: string) => invoke<void>('delete_category', { name }),
    addCategory: (name: string, color: string, sortOrder: number) => invoke<void>('add_category', { name, color, sortOrder }),
    updateCategoryOrder: (orderedNames: string[]) => invoke<void>('update_category_order', { orderedNames }),

    // Backup / Restore
    exportBackup: (destPath: string) => invoke<BackupInfo>('export_backup', { destPath }),
    importBackup: (sourcePath: string) => invoke<void>('import_backup', { sourcePath }),

    // System / Misc
    clearReceiptStaging: () => invoke<void>('clear_receipt_staging'),
    removeReceiptImages: () => invoke<void>('remove_receipt_images'),
    removeAllAppData: () => invoke<void>('remove_all_app_data'),
    openAppDataDir: () => invoke<void>('open_app_data_dir'),
    getStorageInfo: () => invoke<StorageInfo>('get_storage_info'),
    editImage: (payload: { sourcePath: string; params: ImageEditParams }) => invoke<string>('edit_image', payload),
    getAppVersion: () => invoke<string>('get_app_version'),
    cancelJob: (jobKey: string) => invoke<void>('cancel_job', { jobKey }),
    checkModelStatus: () => invoke<ModelStatus>('check_model_status'),
    downloadModels: () => invoke<ModelStatus>('download_models'),
    cancelModelDownload: () => invoke<void>('cancel_model_download'),
    modelDownloadProgress: () => invoke<ModelDownloadProgress>('model_download_progress'),
    removeModels: () => invoke<void>('remove_models'),
    checkPythonEnv: () => invoke<PythonSetupStatus>('check_python_env'),

    // Grocery reference data (Statistics Canada SQLite)
    getGroceryMetadata: () =>
        invoke<GroceryMetadata>('get_grocery_metadata'),
    listGroceryCategories: () =>
        invoke<GroceryCategoryRecord[]>('list_grocery_categories'),
    listGroceryLocations: () =>
        invoke<GroceryLocationRecord[]>('list_grocery_locations'),
    listGroceryProducts: (payload: {
        category: string;
        search: string;
        page: number;
        pageSize: number;
    }) => invoke<ProductPage>('list_grocery_products', payload),
    getGroceryPrices: (payload: {
        productName: string;
        location: string;
        year: string;
        page: number;
        pageSize: number;
    }) => invoke<PricePage>('get_grocery_prices', payload),

    // Image Library
    addImagesToLibrary: (paths: string[]) =>
        invoke<ImageLibraryEntry[]>('add_images_to_library', { paths }),
    getImageLibrary: () =>
        invoke<ImageLibraryEntry[]>('get_image_library'),
    getLibraryEntry: (id: number) =>
        invoke<ImageLibraryEntry | null>('get_library_entry', { id }),
    removeFromLibrary: (id: number) =>
        invoke<void>('remove_from_library', { id }),
    clearLibrary: () =>
        invoke<void>('clear_library'),
    linkImageToReceipt: (id: number, receiptId: number) =>
        invoke<void>('link_image_to_receipt', { id, receiptId }),
    updateLibraryEntryStaging: (id: number, stagingPath: string | null) =>
        invoke<void>('update_library_entry_staging', { id, stagingPath }),
};
