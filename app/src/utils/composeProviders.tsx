import type React from 'react';

/**
 * Compose an array of React context providers into a single wrapper component.
 *
 * Each entry is a tuple of `[Provider, props]` where `props` omits `children`
 * (children are threaded automatically).  Provider-less entries (just the
 * component) are also accepted when no extra props are needed.
 *
 * Usage:
 *   const AppProviders = composeProviders([
 *       [ThemeProvider, { theme: 'dark' }],
 *       AuthProvider,             // no extra props
 *       [DataProvider, { url }],
 *   ]);
 *   <AppProviders>{children}</AppProviders>
 */

type ProviderEntry =
    | React.ComponentType<{ children: React.ReactNode }>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | [React.ComponentType<any>, Record<string, unknown>];

export function composeProviders(
    providers: ProviderEntry[],
): React.ComponentType<{ children: React.ReactNode }> {
    return function ComposedProviders({ children }: { children: React.ReactNode }) {
        return providers.reduceRight<React.ReactNode>((acc, entry) => {
            if (Array.isArray(entry)) {
                const [Provider, props] = entry;
                return <Provider {...props}>{acc}</Provider>;
            }
            const Provider = entry;
            return <Provider>{acc}</Provider>;
        }, children) as React.ReactElement;
    };
}
