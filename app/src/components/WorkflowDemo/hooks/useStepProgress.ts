import { useState, useCallback } from 'react';
import { WORKFLOW_STEPS } from '../steps';

const TOTAL = WORKFLOW_STEPS.length;

export function useStepProgress() {
	const [step, setStep] = useState(1);

	const next = useCallback(() => setStep((s) => Math.min(s + 1, TOTAL)), []);
	const back = useCallback(() => setStep((s) => Math.max(s - 1, 1)), []);

	return { step, setStep, next, back, total: TOTAL } as const;
}
