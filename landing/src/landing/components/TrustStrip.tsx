import type React from 'react';
import { useScrollReveal } from '../hooks/useScrollReveal';

export default function TrustStrip(): React.ReactElement {
    const ref = useScrollReveal();

    return (
        <div ref={ref} className="reveal-block stagger border-y border-slate-100 bg-slate-50/50 py-4">
            <div className="mx-auto max-w-4xl px-4 flex flex-wrap items-center justify-center gap-5 sm:gap-8 text-xs text-slate-400 font-medium">
                <span>
                    <i className="fas fa-shield-halved mr-1 text-emerald-400" aria-hidden="true" />100% offline
                </span>
                <span>
                    <i className="fas fa-database mr-1 text-violet-400" aria-hidden="true" />Statistics Canada data
                </span>
                <span>
                    <i className="fas fa-lock mr-1 text-slate-400" aria-hidden="true" />Your data stays local
                </span>
                <span>
                    <i className="fas fa-desktop mr-1 text-blue-400" aria-hidden="true" />macOS · Windows · Linux
                </span>
            </div>
        </div>
    );
}
