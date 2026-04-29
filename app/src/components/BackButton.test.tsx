/**
 * Unit tests for BackButton (NavigationButtons).
 *
 * Key behaviour under test:
 * - Back/forward buttons call `navigateBack` / `navigateForward` from TabContext
 *   (NOT the raw `navigate(-1)` from usePageHistory, so the isHistoryNavigationRef
 *   flag is set and no spurious new tab is created).
 * - Buttons reflect the `canGoBack` / `canGoForward` state from usePageHistory.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockNavigateBack = vi.fn();
const mockNavigateForward = vi.fn();

vi.mock('../context/TabContext', () => ({
	useTabContext: () => ({
		navigateBack: mockNavigateBack,
		navigateForward: mockNavigateForward,
	}),
}));

const mockPageHistory = { canGoBack: false, canGoForward: false };
vi.mock('../hooks/usePageHistory', () => ({
	usePageHistory: () => mockPageHistory,
}));

// Import after mocks are set up
import NavigationButtons from './BackButton';

describe('NavigationButtons (BackButton)', () => {
	beforeEach(() => {
		mockNavigateBack.mockClear();
		mockNavigateForward.mockClear();
		mockPageHistory.canGoBack = false;
		mockPageHistory.canGoForward = false;
	});

	it('renders back and forward buttons', () => {
		render(<NavigationButtons />);
		expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /go forward/i })).toBeInTheDocument();
	});

	it('back button is disabled when canGoBack is false', () => {
		render(<NavigationButtons />);
		expect(screen.getByRole('button', { name: /go back/i })).toBeDisabled();
	});

	it('forward button is disabled when canGoForward is false', () => {
		render(<NavigationButtons />);
		expect(screen.getByRole('button', { name: /go forward/i })).toBeDisabled();
	});

	it('calls navigateBack (from TabContext) when back button is clicked', () => {
		mockPageHistory.canGoBack = true;
		render(<NavigationButtons />);
		fireEvent.click(screen.getByRole('button', { name: /go back/i }));
		expect(mockNavigateBack).toHaveBeenCalledOnce();
		expect(mockNavigateForward).not.toHaveBeenCalled();
	});

	it('calls navigateForward (from TabContext) when forward button is clicked', () => {
		mockPageHistory.canGoForward = true;
		render(<NavigationButtons />);
		fireEvent.click(screen.getByRole('button', { name: /go forward/i }));
		expect(mockNavigateForward).toHaveBeenCalledOnce();
		expect(mockNavigateBack).not.toHaveBeenCalled();
	});

	it('back button is enabled when canGoBack is true', () => {
		mockPageHistory.canGoBack = true;
		render(<NavigationButtons />);
		expect(screen.getByRole('button', { name: /go back/i })).not.toBeDisabled();
	});

	it('forward button is enabled when canGoForward is true', () => {
		mockPageHistory.canGoForward = true;
		render(<NavigationButtons />);
		expect(screen.getByRole('button', { name: /go forward/i })).not.toBeDisabled();
	});
});
