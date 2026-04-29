import { useState, useRef, useEffect } from 'react';
import type React from 'react';
import { useGroceryData } from '../hooks';
import { useLocationPreference } from '../hooks/useLocationPreference';
import { abbreviateProvince } from '../utils/stringUtils';
import { DEFAULT_LOCATION } from '../constants';

export default function LocationSelector(): React.ReactElement | null {
    const { data, loading } = useGroceryData();
    const { location, setLocation } = useLocationPreference();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Show loading state
    if (loading || !data) {
        return (
            <div className="relative">
                <button
                    disabled
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-400 text-sm font-medium opacity-60 cursor-not-allowed"
                    aria-label="Loading locations"
                >
                    <i className="fas fa-spinner fa-spin text-[11px]" aria-hidden="true" />
                    <span>Loading…</span>
                </button>
            </div>
        );
    }

    const locations = [DEFAULT_LOCATION, ...data.locations.map((l) => l.location).filter((loc) => loc !== DEFAULT_LOCATION)];

    const handleSelect = (loc: string) => {
        setLocation(loc);
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer shadow-sm"
                aria-haspopup="true"
                aria-expanded={isOpen}
                title={location}
            >
                <i className="fas fa-location-dot text-violet-500 text-[11px]" aria-hidden="true" />
                <span>{abbreviateProvince(location)}</span>
                <i className={`fas fa-chevron-down text-[9px] text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-1.5 w-52 bg-white border border-slate-200 rounded-xl overflow-hidden z-50 shadow-lg">
                    <div className="max-h-72 overflow-y-auto">
                        {locations.map((loc) => (
                            <button
                                key={loc}
                                onClick={() => handleSelect(loc)}
                                className={`w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer flex items-center justify-between ${
                                    loc === location
                                        ? 'bg-violet-50 font-medium text-violet-700'
                                        : 'text-slate-700 hover:bg-slate-50'
                                }`}
                            >
                                <span>{loc}</span>
                                {loc === location && (
                                    <i className="fas fa-check text-violet-600 text-xs" aria-hidden="true" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
