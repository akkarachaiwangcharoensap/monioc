/**
 * Listens for macOS native menu-bar navigation events emitted from the Tauri
 * backend and translates them into React Router navigations.
 *
 * Each menu item emits `"menu-navigate"` with a string payload that maps to a
 * known route or action (e.g. `"nav_dashboard"`, `"backup_export"`).
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listen } from '@tauri-apps/api/event';
import { save, open as openFilePicker, confirm as confirmDialog } from '@tauri-apps/plugin-dialog';
import { TauriApi } from '../services/api';
import { ROUTES } from '../constants';
import { useTabContext } from '../context/TabContext';

const MENU_ROUTE_MAP: Record<string, string> = {
    nav_dashboard: ROUTES.DASHBOARD,
    nav_receipts: ROUTES.RECEIPTS,
    nav_statistics: ROUTES.STATISTICS,
    nav_prices: ROUTES.PRODUCTS,
    nav_categories: ROUTES.CATEGORIES,
    nav_backup: ROUTES.BACKUP,
    settings: ROUTES.SETTINGS,
    scan_receipt: ROUTES.RECEIPT_SCANNER,
};

export function useMenuNavigation(): void {
    const navigate = useNavigate();
    const { replaceCurrentTab } = useTabContext();

    useEffect(() => {
        let unlisten: (() => void) | null = null;

        const setup = async () => {
            unlisten = await listen<string>('menu-navigate', async (event) => {
                const id = event.payload;

                if (id === 'backup_export') {
                    const now = new Date();
                    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
                    const destPath = await save({
                        defaultPath: `grocery-backup-${stamp}.gbak`,
                        filters: [{ name: 'Grocery Backup', extensions: ['gbak'] }],
                    });
                    if (destPath) {
                        try {
                            await TauriApi.exportBackup(destPath);
                        } catch (err) {
                            console.error('Menu export failed:', err);
                        }
                    }
                    return;
                }

                if (id === 'backup_import') {
                    const sourcePath = await openFilePicker({
                        multiple: false,
                        filters: [{ name: 'Grocery Backup', extensions: ['gbak'] }],
                    });
                    if (!sourcePath) return;
                    const ok = await confirmDialog(
                        'Importing a backup will replace ALL current data (receipts, categories, settings). This cannot be undone.\n\nContinue?',
                        { title: 'Restore from Backup', kind: 'warning' },
                    );
                    if (!ok) return;
                    try {
                        await TauriApi.importBackup(sourcePath);
                        window.location.reload();
                    } catch (err) {
                        console.error('Menu import failed:', err);
                    }
                    return;
                }

                // Belt-and-suspenders: wipe stale new-scan session before navigating.
                if (id === 'scan_receipt') {
                    const handled = replaceCurrentTab(ROUTES.RECEIPT_SCANNER);
                    if (!handled) navigate(ROUTES.RECEIPT_SCANNER);
                    return;
                }

                const route = MENU_ROUTE_MAP[id];
                if (route) {
                    const handled = replaceCurrentTab(route);
                    if (!handled) navigate(route);
                }
            });
        };

        void setup();
        return () => { unlisten?.(); };
    }, [navigate, replaceCurrentTab]);
}
