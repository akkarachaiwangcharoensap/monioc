/**
 * GroceryDataContext — loads Statistics Canada reference data (categories and
 * locations) from the bundled SQLite database via Tauri IPC commands.
 *
 * Only lightweight dimension tables are loaded here so the context stays fast.
 * Products and prices are loaded on-demand in individual page components.
 *
 * The exposed `GroceryData` shape keeps `products` and `prices` as empty
 * arrays for backwards compatibility with any consumers that check nullability,
 * but pages should use TauriApi directly for those datasets.
 */
import { createContext, useContext, useState, useEffect } from 'react';
import type React from 'react';
import type { GroceryData } from '../types';
import { TauriApi } from '../services/api';
import { parseTauriError } from '../services/errors';

interface GroceryDataContextValue {
    data: GroceryData | null;
    loading: boolean;
    error: string | null;
}

const GroceryDataContext = createContext<GroceryDataContextValue | null>(null);

export function GroceryDataProvider({ children }: { children: React.ReactNode }): React.ReactElement {
    const [data, setData] = useState<GroceryData | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                setLoading(true);
                setError(null);

                // Only load the small dimension tables — products and prices are
                // fetched on-demand by individual page components.
                const [metadata, categories, locations] = await Promise.all([
                    TauriApi.getGroceryMetadata(),
                    TauriApi.listGroceryCategories(),
                    TauriApi.listGroceryLocations(),
                ]);

                if (cancelled) return;

                setData({
                    metadata: {
                        source: 'Statistics Canada',
                        processed_date: new Date().toISOString().slice(0, 10),
                        total_records: metadata.totalRecords,
                        date_range: { min: metadata.dateMin, max: metadata.dateMax },
                        total_products: metadata.totalProducts,
                        total_locations: metadata.totalLocations,
                        total_categories: metadata.totalCategories,
                    },
                    categories: categories.map((c) => ({ name: c.name, count: c.count })),
                    locations: locations.map((l) => ({ location: l.location, city: l.city, province: l.province })),
                    // Products and prices are loaded on-demand per page.
                    products: [],
                    prices: [],
                });
            } catch (err) {
                if (!cancelled) {
                    setError(parseTauriError(err));
                    console.error('Error loading grocery reference data:', err);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void load();
        return () => { cancelled = true; };
    }, []);

    return (
        <GroceryDataContext.Provider value={{ data, loading, error }}>
            {children}
        </GroceryDataContext.Provider>
    );
}

export function useGroceryDataContext(): GroceryDataContextValue {
    const ctx = useContext(GroceryDataContext);
    if (!ctx) {
        throw new Error('useGroceryDataContext must be used inside GroceryDataProvider');
    }
    return ctx;
}

