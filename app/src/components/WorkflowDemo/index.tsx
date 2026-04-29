import { useState, useEffect, useRef, type ReactElement } from 'react';
import { WORKFLOW_STEPS } from './steps';
import { useStepProgress } from './hooks/useStepProgress';
import UploadMockup from './mockups/UploadMockup';
import ScanningMockup from './mockups/ScanningMockup';
import EditorMockup from './mockups/EditorMockup';
import ExportMockup from './mockups/ExportMockup';
import StatsMockup from './mockups/StatsMockup';
import ComparisonMockup from './mockups/ComparisonMockup';

/* ── Eyebrow colour map ─────────────────────────────────────────────────── */
const EYEBROW_CLASSES: Record<string, string> = {
    violet: 'text-violet-600 bg-violet-50',
    emerald: 'text-emerald-600 bg-emerald-50',
    amber: 'text-amber-600 bg-amber-50',
    blue: 'text-blue-600 bg-blue-50',
    rose: 'text-rose-600 bg-rose-50',
};

/* ── Mockup registry ─────────────────────────────────────────────────────── */
const MOCKUP_FOR_STEP: Record<number, () => ReactElement> = {
    1: () => <UploadMockup />,
    2: () => <ScanningMockup />,
    3: () => <EditorMockup />,
    4: () => <ExportMockup />,
    5: () => <StatsMockup />,
    6: () => <ComparisonMockup />,
};

const MOCKUP_ZOOM_LEVELS: Record<number, number> = {
    1: 0.8,
    2: 0.8,
    3: 0.8,
    4: 0.8,
    5: 0.80,
    6: 0.80,
};

/* ── Props ───────────────────────────────────────────────────────────────── */
interface WorkflowDemoProps {
    className?: string;
}

/* ── Main component ──────────────────────────────────────────────────────── */
export default function WorkflowDemo({ className }: WorkflowDemoProps): ReactElement {
    const { step, setStep, next, back, total } = useStepProgress();
    const activeStep = WORKFLOW_STEPS[step - 1];

    /* ── Transition state for mockup swap ─────────────────────────────── */
    const [displayedStep, setDisplayedStep] = useState(step);
    const [transitioning, setTransitioning] = useState(false);
    const [slideDir, setSlideDir] = useState<'left' | 'right'>('left');
    const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    useEffect(() => {
        if (step === displayedStep) return;
        setSlideDir(step > displayedStep ? 'left' : 'right');
        setTransitioning(true);
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            setDisplayedStep(step);
            setTransitioning(false);
        }, 200);
        return () => clearTimeout(timeoutRef.current);
    }, [step, displayedStep]);

    /* ── Keyboard hint auto-fade ──────────────────────────────────────── */
    const currentMockup = MOCKUP_FOR_STEP[displayedStep]?.() ?? null;
    const currentZoom = MOCKUP_ZOOM_LEVELS[displayedStep] ?? 0.78;

    /* ── Transition classes (respects prefers-reduced-motion) ─────────── */
    const motionSafe = typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const mockupTransitionStyle: React.CSSProperties = transitioning
        ? {
            opacity: 0,
            transform: motionSafe ? (slideDir === 'left' ? 'translateX(-24px)' : 'translateX(24px)') : undefined,
            transition: motionSafe ? 'opacity 200ms ease-out, transform 200ms ease-out' : 'opacity 200ms ease-out',
        }
        : {
            opacity: 1,
            transform: 'translateX(0)',
            transition: motionSafe ? 'opacity 250ms ease-out, transform 250ms ease-out' : 'opacity 250ms ease-out',
        };

    return (
        <section
            id="workflow"
            className={`border-y border-slate-100 bg-[#F8F8F6] py-16 sm:py-20 ${className ?? ''}`}
        >
            <div className="mx-auto max-w-[1000px] px-4 sm:px-6 lg:px-8">
                {/* ── Section header ──────────────────────────────────── */}
                <div className="text-center mb-12">
                    <span className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider text-violet-600 bg-violet-50 mb-3">
                        How it works
                    </span>
                    <h2 className="text-3xl sm:text-4xl font-bold text-slate-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                        A simple workflow with insightful results.
                    </h2>
                    <p className="mt-3 text-slate-500 max-w-lg mx-auto">
                        Extract data from your receipts and get insights on your spending.
                    </p>
                </div>

                {/* ── Two-column stage ────────────────────────────────── */}
                <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
                    {/* ── LEFT: Step sidebar (desktop) / pill tabs (mobile) ── */}
                    <StepSidebar step={step} setStep={setStep} />

                    {/* ── RIGHT: Mockup panel ──────────────────────────── */}
                    <div
                        className="flex-1 relative rounded-2xl border border-slate-200 shadow-2xl bg-[#FAFAF9] overflow-hidden flex flex-col"
                        style={{ minHeight: 460 }}
                        role="tabpanel"
                        aria-label={`Workflow demo, step ${step} of ${total}: ${activeStep.label}`}
                    >
                        {/* Progress bar */}
                        <div className="h-1 bg-slate-100 flex-shrink-0">
                            <div
                                className="h-full bg-violet-500 rounded-r-full"
                                style={{
                                    width: `${(step / total) * 100}%`,
                                    transition: 'width 400ms cubic-bezier(0.4, 0, 0.2, 1)',
                                }}
                            />
                        </div>

                        {/* Mockup content */}
                        <div className="flex-1 p-3" style={mockupTransitionStyle}>
                            <div className="mx-auto w-full max-w-[900px]" style={{ zoom: currentZoom, transformOrigin: 'top center' }}>
                                {currentMockup}
                            </div>
                        </div>

                        {/* Callout strip */}
                        <div className="bg-white/80 backdrop-blur-sm border-t border-slate-100 px-5 py-3 pb-6 flex items-start justify-between gap-3 flex-shrink-0">
                            <div>
                                <span className={`inline-block text-[11px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 mb-1 ${EYEBROW_CLASSES[activeStep.eyebrowColor]}`}>
                                    {activeStep.eyebrow}
                                </span>
                                <p className="text-base font-bold text-slate-900">{activeStep.heading}</p>
                                <p className="text-sm text-slate-500 mt-0.5">{activeStep.caption}</p>
                            </div>
                            <span className="text-xs text-slate-400 whitespace-nowrap pt-1">
                                {step}/{total}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="mt-8 text-center px-4">
                    <p className="mx-auto max-w-lg text-[11px] text-slate-500">
                        This demo uses mock data for visual purposes only and may be inaccurate. It is not the final product.
                    </p>
                </div>
                {/* ── Navigation controls ─────────────────────────────── */}
                <div className="mt-4 flex items-center justify-center gap-4">
                    {step > 1 ? (
                        <button
                            type="button"
                            onClick={back}
                            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors px-4 py-2"
                        >
                            <i className="fas fa-arrow-left text-xs" /> Back
                        </button>
                    ) : (
                        <div className="w-[88px]" /* placeholder to keep centering */ />
                    )}

                    <span className="text-sm text-slate-400">
                        Step {step} of {total}
                    </span>

                    {step < total ? (
                        <button
                            type="button"
                            onClick={next}
                            className="flex items-center gap-1.5 rounded-full px-6 py-2.5 text-sm font-semibold shadow-sm bg-violet-600 text-white hover:bg-violet-700 transition-all"
                        >
                            Continue
                            <i className="fas fa-arrow-right text-xs transition-transform group-hover:translate-x-0.5" />
                        </button>
                    ) : (
                        <div className="w-[88px]" /* placeholder to keep centering */ />
                    )}
                </div>

            </div>
        </section>
    );
}

/* ── Step Sidebar ────────────────────────────────────────────────────────── */

function StepSidebar({
    step,
    setStep,
}: {
    step: number;
    setStep: (s: number) => void;
}): ReactElement {
    return (
        <>
            {/* ── Desktop: vertical sidebar ── */}
            <nav
                className="hidden lg:block w-[260px] flex-shrink-0 sticky top-6 self-start"
                role="tablist"
                aria-label="Workflow steps"
            >
                <div className="space-y-0 relative">
                    {/* Connector line */}
                    <div className="absolute left-3 top-3 bottom-3 w-0.5 bg-slate-200">
                        <div
                            className="w-full bg-violet-600 rounded-full origin-top"
                            style={{
                                height: `${((step - 1) / (WORKFLOW_STEPS.length - 1)) * 100}%`,
                                transition: 'height 400ms ease',
                            }}
                        />
                    </div>

                    {WORKFLOW_STEPS.map((s) => {
                        const isActive = s.id === step;
                        return (
                            <button
                                key={s.id}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                aria-current={isActive ? 'step' : undefined}
                                onClick={() => setStep(s.id)}
                                className={`relative w-full flex items-start gap-2 pl-0 pr-3 py-2.5 text-left rounded-lg transition-all duration-300 ${isActive ? 'bg-violet-50 border-l-[3px] border-violet-600 pl-0' : ''
                                    }`}
                            >
                                {/* Step badge */}
                                <div
                                    className={`relative z-10 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors duration-200 ml-[1px] ${isActive
                                        ? 'bg-violet-600 text-white'
                                        : s.id < step
                                            ? 'bg-violet-200 text-violet-700'
                                            : 'bg-slate-200 text-slate-500'
                                        }`}
                                >
                                    {s.id < step ? <i className="fas fa-check text-[9px]" /> : s.id}
                                </div>

                                {/* Label + sublabel */}
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span
                                            className={`text-sm font-semibold transition-colors duration-200 ${isActive ? 'text-slate-800' : 'text-slate-400'
                                                }`}
                                        >
                                            {s.label}
                                        </span>
                                        {s.proOnly && (
                                            <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[9px] font-semibold px-1.5 py-px leading-tight">
                                                Pro
                                            </span>
                                        )}
                                    </div>
                                    <div
                                        className="overflow-hidden transition-all duration-250"
                                        style={{
                                            maxHeight: isActive ? 32 : 0,
                                            opacity: isActive ? 1 : 0,
                                        }}
                                    >
                                        <p className="text-xs text-slate-400 mt-0.5">{s.sublabel}</p>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </nav>

            {/* ── Mobile: horizontal pill tabs ── */}
            <div className="lg:hidden flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-none" role="tablist" aria-label="Workflow steps">
                {WORKFLOW_STEPS.map((s) => {
                    const isActive = s.id === step;
                    return (
                        <button
                            key={s.id}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            aria-current={isActive ? 'step' : undefined}
                            onClick={() => setStep(s.id)}
                            className={`flex-shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-all duration-200 whitespace-nowrap ${isActive
                                ? 'bg-violet-600 text-white shadow-sm'
                                : 'bg-white text-slate-500 border border-slate-200'
                                }`}
                        >
                            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'
                                }`}>
                                {s.id < step ? <i className="fas fa-check text-[7px]" /> : s.id}
                            </span>
                            {s.label}
                        </button>
                    );
                })}
            </div>
        </>
    );
}
