/**
 * TutorialModal — Apple-inspired onboarding walkthrough.
 *
 * Shown automatically on first launch (controlled by the parent via
 * `open` + `onClose`).  Users can also reopen it via the Help button in the
 * sidebar.  Navigation is a horizontal slide between steps.
 */
import { APP_NAME } from '@/constants';
import React, { useState, useCallback, useEffect } from 'react';

interface Step {
    icon: string;
    iconBg: string;
    iconColor: string;
    title: string;
    subtitle: string;
    body: string;
}

const STEPS: Step[] = [
    {
        icon: '',
        iconBg: '',
        iconColor: '',
        title: `Welcome to ${APP_NAME}!`,
        subtitle: 'Your personal grocery tracker',
        body: 'Track receipts, monitor spending, and stay on top of grocery prices — all in one place. Here\'s a quick look at what you can do.',
    },
    {
        icon: 'fas fa-camera',
        iconBg: 'bg-blue-50',
        iconColor: 'text-blue-500',
        title: 'Scan Your Receipts',
        subtitle: 'Upload · AI reads · Categorised',
        body: 'Tap Scan Receipt to upload a photo or image file. The built-in AI reads every line item, assigns it a category, and saves it to your history — no manual entry needed.',
    },
    {
        icon: 'fas fa-receipt',
        iconBg: 'bg-emerald-50',
        iconColor: 'text-emerald-500',
        title: 'Review & Manage Receipts',
        subtitle: 'Every trip in one place',
        body: 'The Receipts dashboard shows all your scanned trips sorted by date. Tap any receipt to edit items, fix categories, or delete entries you don\'t need.',
    },
    {
        icon: 'fas fa-chart-bar',
        iconBg: 'bg-amber-50',
        iconColor: 'text-amber-500',
        title: 'Browse Grocery Prices',
        subtitle: 'Statistics Canada data, updated regularly',
        body: 'The Prices section is powered by Statistics Canada data. Browse average prices by category, compare products, and spot trends before you head to the store.',
    },
    {
        icon: 'fas fa-chart-line',
        iconBg: 'bg-pink-50',
        iconColor: 'text-pink-500',
        title: 'Understand Your Spending',
        subtitle: 'Monthly totals · Category breakdowns',
        body: 'Statistics turns your receipt history into clear charts. See monthly totals, category breakdowns, and how your spending changes over time.',
    },
];

interface TutorialModalProps {
    open: boolean;
    onClose: () => void;
}

export default function TutorialModal({ open, onClose }: TutorialModalProps): React.ReactElement | null {
    const [step, setStep] = useState(0);
    const [direction, setDirection] = useState<'forward' | 'back'>('forward');
    const [animating, setAnimating] = useState(false);

    // Reset to first step whenever the modal is reopened
    useEffect(() => {
        if (open) setStep(0);
    }, [open]);

    const goTo = useCallback((next: number, dir: 'forward' | 'back') => {
        if (animating) return;
        setDirection(dir);
        setAnimating(true);
        setTimeout(() => {
            setStep(next);
            setAnimating(false);
        }, 200);
    }, [animating]);

    const handleNext = useCallback(() => {
        if (step < STEPS.length - 1) {
            goTo(step + 1, 'forward');
        } else {
            onClose();
        }
    }, [step, goTo, onClose]);

    const handleBack = useCallback(() => {
        if (step > 0) goTo(step - 1, 'back');
    }, [step, goTo]);

    const handleDotClick = useCallback((idx: number) => {
        if (idx === step) return;
        goTo(idx, idx > step ? 'forward' : 'back');
    }, [step, goTo]);

    // Close on Escape
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [open, onClose]);

    if (!open) return null;

    const current = STEPS[step];
    const isLast = step === STEPS.length - 1;

    const slideClass = animating
        ? direction === 'forward'
            ? 'opacity-0 translate-x-4'
            : 'opacity-0 -translate-x-4'
        : 'opacity-100 translate-x-0';

    return (
        /* ── Backdrop ────────────────────────────────────────────── */
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="App tutorial"
        >
            {/* ── Card ─────────────────────────────────────────────── */}
            <div
                className="relative w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden"
                style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.22), 0 8px 24px rgba(0,0,0,0.12)' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close button */}
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute right-4 top-4 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
                    aria-label="Close tutorial"
                >
                    <i className="fas fa-xmark text-[12px]" aria-hidden="true" />
                </button>

                {/* ── Step content ─────────────────────────────────── */}
                <div
                    className={`flex flex-col items-center px-8 pb-6 pt-10 text-center transition-all duration-200 ease-out ${slideClass}`}
                >
                    {/* Icon badge */}
                    {step === 0 ? (
                        <div className="mb-6 flex h-20 w-20 items-center justify-center">
                            <img src="/grocery-app-logo.png" alt={APP_NAME} className="h-20 w-20 object-cover" />
                        </div>
                    ) : (
                        <div className={`mb-6 flex h-20 w-20 items-center justify-center rounded-[22px] ${current.iconBg} shadow-sm`}>
                            <i className={`${current.icon} text-3xl ${current.iconColor}`} aria-hidden="true" />
                        </div>
                    )}

                    {/* Title */}
                    <h2 className="mb-1 text-[22px] font-bold tracking-tight text-slate-900 leading-snug">
                        {current.title}
                    </h2>

                    {/* Subtitle */}
                    <p className="mb-4 text-[13px] font-medium text-slate-400 tracking-wide uppercase">
                        {current.subtitle}
                    </p>

                    {/* Body */}
                    <p className="text-[15px] leading-relaxed text-slate-600 max-w-sm">
                        {current.body}
                    </p>
                </div>

                {/* ── Dots ─────────────────────────────────────────── */}
                <div className="flex justify-center gap-1.5 pb-2">
                    {STEPS.map((_, idx) => (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => handleDotClick(idx)}
                            aria-label={`Go to step ${idx + 1}`}
                            className={`h-1.5 rounded-full transition-all duration-200 ${idx === step
                                ? 'w-5 bg-violet-500'
                                : 'w-1.5 bg-slate-200 hover:bg-slate-300'
                                }`}
                        />
                    ))}
                </div>

                {/* ── Navigation buttons ───────────────────────────── */}
                <div className="flex items-center gap-3 px-8 py-5 border-t border-slate-100">
                    {step > 0 ? (
                        <button
                            type="button"
                            onClick={handleBack}
                            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-[14px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                        >
                            Back
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-[14px] font-semibold text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
                        >
                            Skip
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={handleNext}
                        className="flex-1 rounded-xl bg-violet-600 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 active:bg-violet-800"
                    >
                        {isLast ? 'Get Started' : 'Next'}
                    </button>
                </div>
            </div>
        </div>
    );
}
