import { createContext, useContext } from 'react';
import type React from 'react';

// Open-source edition: no authentication. User is always null.

interface AuthContextValue {
    user: null;
    loading: boolean;
    openSignIn: () => void;
    signOut: () => Promise<void>;
    refreshSession: () => Promise<void>;
}

const AUTH_STUB: AuthContextValue = {
    user: null,
    loading: false,
    openSignIn: () => {},
    signOut: async () => {},
    refreshSession: async () => {},
};

const AuthContext = createContext<AuthContextValue>(AUTH_STUB);

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
    return (
        <AuthContext.Provider value={AUTH_STUB}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextValue {
    return useContext(AuthContext);
}

// Re-export AuthUser type as null-only for compatibility
export type AuthUser = never;
