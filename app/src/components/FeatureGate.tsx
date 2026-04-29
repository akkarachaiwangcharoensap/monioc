// Open-source edition: all features are unlocked. Always renders children.
import type React from 'react';

interface FeatureGateProps {
    feature?: string;
    fallback?: React.ReactNode;
    children: React.ReactNode;
}

export function FeatureGate({ children }: FeatureGateProps): React.ReactElement {
    return <>{children}</>;
}
