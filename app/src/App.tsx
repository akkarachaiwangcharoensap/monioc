/**
 * Main App component with routing configuration.
 *
 * HashRouter is used instead of BrowserRouter so that deep links such as
 * "/#/products/beef" work correctly inside the Tauri WebView, which serves
 * the app via the `tauri://localhost` custom protocol.  A BrowserRouter
 * would try to fetch `/products/beef` as a real file and 404 on page
 * refresh or direct navigation in the desktop shell.
 */
import React from 'react';
import { HashRouter as Router, Routes, Route, useParams } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ROUTES, STORAGE_KEYS } from './constants';
import { GroceryDataProvider } from './context/GroceryDataContext';
import { CategoriesProvider } from './context/CategoriesContext';
import { AuthProvider } from './context/AuthContext';
import { ModelDownloadProvider } from './context/ModelDownloadContext';
import { TabMemoryProvider } from './context/TabMemoryContext';
import { ToastProvider } from './context/ToastContext';
import { TabProvider, useTabContext } from './context/TabContext';
import { JobStatusProvider } from './context/JobStatusContext';
import { ReceiptCacheProvider } from './context/ReceiptCacheContext';
import { TaskManagerProvider } from './context/TaskManagerContext';
import { ImageLibraryProvider } from './context/ImageLibraryContext';
import { TauriApi } from './services/api';
import { composeProviders } from './utils/composeProviders';
import ToastContainer from './components/ui/ToastContainer';
import TaskManagerWidget from './components/TaskManager/TaskManagerWidget';
import TabBar from './components/ui/TabBar';
import WindowControls from './components/ui/WindowControls';
import { useModelDownloadTask } from './hooks/useModelDownloadTask';
import SideNav from './components/SideNav';
import NavigationButtons from './components/BackButton';
import TutorialModal from './components/TutorialModal';
import { useMenuNavigation } from './hooks/useMenuNavigation';
import './App.css';

/**
 * Mounts the useModelDownloadTask hook so that model download progress
 * is reflected in the TaskManagerWidget. Must be rendered inside both
 * TaskManagerProvider and ModelDownloadProvider.
 */
function ModelDownloadTaskBridge(): null {
    useModelDownloadTask();
    return null;
}

const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const HomePage = React.lazy(() => import('./pages/HomePage'));
const ProductsPage = React.lazy(() => import('./pages/ProductsPage'));
const CategoryPage = React.lazy(() => import('./pages/CategoryPage'));
const ProductDetailPage = React.lazy(() => import('./pages/ProductDetailPage'));
const NewScanPage = React.lazy(() => import('./pages/NewScanPage'));
const ReceiptsDashboardPage = React.lazy(() => import('./pages/ReceiptsDashboardPage'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'));
const CategoriesPage = React.lazy(() => import('./pages/CategoriesPage'));
const BackupPage = React.lazy(() => import('./pages/BackupPage'));
const StatisticsPage = React.lazy(() => import('./pages/StatisticsPage'));
const CategoryDetailPage = React.lazy(() => import('./pages/CategoryDetailPage'));
const CategoryCustomDetailPage = React.lazy(() => import('./pages/CategoryCustomDetailPage'));
const ReceiptEditorPage = React.lazy(() => import('./pages/ReceiptEditorPage'));

/**
 * Wrapper that forces a full remount of ProductDetailPage whenever the
 * category or product slug in the URL changes.  Without this, React Router
 * reuses the same component instance when navigating between products
 * (both URLs match the same route pattern), so all internal state would
 * belong to the previously-viewed product.
 */
function KeyedProductDetailPage(): React.JSX.Element {
    const { category, product } = useParams<{ category: string; product: string }>();
    return <ProductDetailPage key={`${category}/${product}`} />;
}

/**
 * Prevent Backspace from triggering browser/WebView history navigation when
 * focus is not inside an editable element.
 */
function usePreventBackspaceNavigation(): void {
    React.useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key !== 'Backspace') return;
            const target = e.target as HTMLElement;
            const tag = target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
            e.preventDefault();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);
}

/**
 * Desktop shell: persistent left sidebar + scrollable main content area.
 */
function AppLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
    usePreventBackspaceNavigation();
    useMenuNavigation();
    const { activeTabId, closeTab } = useTabContext();

    // Ctrl+W / Cmd+W closes the current tab (prevent the WebView from quitting the app)
    React.useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
                e.preventDefault();
                if (activeTabId) closeTab(activeTabId);
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [activeTabId, closeTab]);

    const [isNavCollapsed, setIsNavCollapsed] = React.useState<boolean>(() => {
        try {
            return window.localStorage.getItem(STORAGE_KEYS.NAV_COLLAPSED) === '1';
        } catch {
            return false;
        }
    });

    const [tutorialOpen, setTutorialOpen] = React.useState<boolean>(() => {
        try {
            return window.localStorage.getItem(STORAGE_KEYS.TUTORIAL_SEEN) !== '1';
        } catch {
            return true;
        }
    });

    const appWindow = React.useMemo(() => getCurrentWindow(), []);

    const handleTutorialClose = React.useCallback(() => {
        setTutorialOpen(false);
        try {
            window.localStorage.setItem(STORAGE_KEYS.TUTORIAL_SEEN, '1');
        } catch {
            // ignore storage write errors
        }
    }, []);

    React.useEffect(() => {
        try {
            window.localStorage.setItem(STORAGE_KEYS.NAV_COLLAPSED, isNavCollapsed ? '1' : '0');
        } catch {
            // ignore storage write errors
        }
    }, [isNavCollapsed]);

    return (
        <div className="flex flex-col h-screen" style={{ backgroundColor: '#f7f7f6' }}>
            {/* ── Title bar ── */}
            <div
                className="flex-shrink-0 h-10 flex items-stretch select-none" style={{ backgroundColor: '#f7f7f6' }}
                onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    if ((e.target as HTMLElement).closest('button, a, [role="tab"]')) return;
                    void appWindow.startDragging();
                }}
                onDoubleClick={(e) => {
                    if ((e.target as HTMLElement).closest('button, a, [role="tab"]')) return;
                    void appWindow.toggleMaximize();
                }}
            >
                {/* Left zone: width matches sidebar. Native macOS traffic
                     lights are positioned by Rust via setFrame:. */}
                <div
                    className={`${isNavCollapsed ? 'w-22' : 'w-48'
                        } flex-shrink-0 border-r border-slate-200 transition-[width] duration-200`}
                    style={{ backgroundColor: '#f7f7f6' }}
                />

                {/* Right area: toggle → nav buttons → tabs, with bottom separator */}
                <div className="flex flex-1 items-center min-w-0 border-b border-slate-200">
                    <button
                        type="button"
                        onClick={() => setIsNavCollapsed((prev) => !prev)}
                        className={`mx-2 h-6 w-6 inline-flex items-center justify-center rounded-md transition-colors flex-shrink-0 ${isNavCollapsed
                            ? 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                            : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                            }`}
                        aria-label={isNavCollapsed ? 'Expand navigation' : 'Collapse navigation'}
                        title={isNavCollapsed ? 'Expand navigation' : 'Collapse navigation'}
                    >
                        <i className="fa-solid fa-table-columns text-[13px]" aria-hidden="true" />
                    </button>
                    <div className="flex-shrink-0">
                        <NavigationButtons />
                    </div>
                    <TabBar />
                </div>
                {/* Windows / Linux: custom close·minimise·maximise buttons */}
                <WindowControls />
            </div>
            {/* ── Body: sidebar + main content ── */}
            <div className="flex flex-1 overflow-hidden">
                <SideNav
                    collapsed={isNavCollapsed}
                    onOpenTutorial={() => setTutorialOpen(true)}
                />
                <main className="relative flex-1 overflow-y-auto bg-white [scrollbar-gutter:stable]">
                    {children}
                </main>
            </div>
            <TutorialModal open={tutorialOpen} onClose={handleTutorialClose} />
        </div>
    );
}

/**
 * Flat provider composition — replaces the deeply nested "Pyramid of Doom".
 * Order matters: later providers may depend on earlier ones through context.
 */
const AppProviders = composeProviders([
    Router as React.ComponentType<{ children: React.ReactNode }>,
    AuthProvider,
    GroceryDataProvider,
    ToastProvider,
    CategoriesProvider,
    ReceiptCacheProvider,
    ImageLibraryProvider,
    JobStatusProvider,
    ModelDownloadProvider,
    [TaskManagerProvider, { onCancelJob: TauriApi.cancelJob }],
    TabMemoryProvider,
    TabProvider,
]);

function App(): React.JSX.Element {
    return (
        <AppProviders>
            <AppLayout>
                <React.Suspense
                    fallback={
                        <div className="min-h-screen flex items-center justify-center">
                            Loading…
                        </div>
                    }
                >
                    <Routes>
                        <Route path={ROUTES.DASHBOARD} element={<DashboardPage />} />
                        <Route path={ROUTES.GROCERY} element={<HomePage />} />
                        <Route path={ROUTES.PRODUCTS} element={<ProductsPage />} />
                        <Route path={ROUTES.CATEGORY} element={<CategoryPage />} />
                        <Route path={ROUTES.PRODUCT_DETAIL} element={<KeyedProductDetailPage />} />
                        <Route path={ROUTES.RECEIPT_SCANNER} element={<NewScanPage />} />
                        <Route path={ROUTES.RECEIPT_SCANNER_NEW} element={<NewScanPage />} />
                        <Route path={ROUTES.RECEIPTS_EDITOR} element={<ReceiptEditorPage />} />
                        <Route path={ROUTES.RECEIPTS} element={<ReceiptsDashboardPage />} />
                        <Route path={ROUTES.SETTINGS} element={<SettingsPage />} />
                        <Route path={ROUTES.CATEGORIES} element={<CategoriesPage />} />
                        <Route path={ROUTES.SETTINGS_CATEGORIES} element={<CategoriesPage />} />
                        <Route path={ROUTES.BACKUP} element={<BackupPage />} />
                        <Route path={ROUTES.STATISTICS} element={<StatisticsPage />} />
                        <Route path={ROUTES.STATISTICS_CATEGORY_CUSTOM} element={<CategoryCustomDetailPage />} />
                        <Route path={ROUTES.STATISTICS_CATEGORY} element={<CategoryDetailPage />} />
                    </Routes>
                </React.Suspense>
            </AppLayout>
            {/* Global overlays */}
            <ToastContainer />
            <TaskManagerWidget />
            <ModelDownloadTaskBridge />
        </AppProviders>
    );
}

export default App;
