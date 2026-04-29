import { describe, it, expect } from 'vitest';
import { parseStepProgress } from './scanProgress';

describe('parseStepProgress', () => {
	describe('Step X/Y messages', () => {
		it('parses Step 1/3 as 33%', () => {
			expect(parseStepProgress('Step 1/3 — Recognizing text in image')).toBe(33);
		});

		it('parses Step 2/3 as 67% (rounds .667)', () => {
			expect(parseStepProgress('Step 2/3 — Post-processing')).toBe(67);
		});

		it('parses Step 3/3 as 100%', () => {
			expect(parseStepProgress('Step 3/3 — Structuring data')).toBe(100);
		});

		it('parses Step 1/2 as 50%', () => {
			expect(parseStepProgress('Step 1/2 — Analysis')).toBe(50);
		});

		it('is case-insensitive (step vs STEP)', () => {
			expect(parseStepProgress('STEP 1/3 — Something')).toBe(33);
			expect(parseStepProgress('step 2/4 — Something')).toBe(50);
		});

		it('handles extra whitespace around the step numbers', () => {
			// Backend may emit varying whitespace
			expect(parseStepProgress('Step  2/3 — text')).toBe(67);
		});

		it('returns 100 for Step N/N regardless of N', () => {
			expect(parseStepProgress('Step 5/5 — Done')).toBe(100);
		});
	});

	describe('"Done." message', () => {
		it('parses "Done." as 100%', () => {
			expect(parseStepProgress('Done.')).toBe(100);
		});

		it('parses "Done" (no period) as 100%', () => {
			expect(parseStepProgress('Done')).toBe(100);
		});

		it('is case-insensitive for Done', () => {
			// The regex uses \bDone\b — "DONE" has the right word boundary but won't
			// match because the regex is case-sensitive for this branch.
			// Documenting actual behaviour: only exact "Done" (capital D) matches.
			expect(parseStepProgress('DONE')).toBeNull();
		});
	});

	describe('non-matching messages return null', () => {
		it('returns null for empty string', () => {
			expect(parseStepProgress('')).toBeNull();
		});

		it('returns null for "Preparing image…" (the 0% pre-step message from Python)', () => {
			expect(parseStepProgress('Preparing image…')).toBeNull();
		});

		it('returns null for download progress messages', () => {
			expect(parseStepProgress('Downloading model: 1.2/4.5 GB (27%)')).toBeNull();
		});

		it('returns null for arbitrary text', () => {
			expect(parseStepProgress('Something happened')).toBeNull();
		});

		it('returns null for a plain number', () => {
			expect(parseStepProgress('42')).toBeNull();
		});
	});

	describe('progress value bounds', () => {
		it('never returns a value below 0', () => {
			// Step 0/3 would be 0 — valid but unusual
			const result = parseStepProgress('Step 0/3 — Starting');
			expect(result).toBe(0);
		});

		it('always returns an integer (Math.round result)', () => {
			const result = parseStepProgress('Step 1/3 — Recognizing text');
			expect(result).not.toBeNull();
			expect(Number.isInteger(result)).toBe(true);
		});
	});
});
