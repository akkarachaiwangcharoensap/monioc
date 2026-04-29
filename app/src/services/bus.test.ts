import { describe, it, expect, vi } from 'vitest';
import { AppBus, ScopedAppBus } from './bus';
import type { BusJobStatusEvent } from './bus';

function makeJobEvent(overrides: Partial<BusJobStatusEvent> = {}): BusJobStatusEvent {
    return {
        jobKey: '/tmp/receipt.jpg',
        phase: 'queued',
        kind: 'scan',
        tabId: null,
        runId: 0,
        seq: 0,
        record: null,
        error: null,
        ...overrides,
    };
}

describe('AppBus', () => {
    it('delivers emitted events to registered handlers', () => {
        const bus = new AppBus();
        const handler = vi.fn();
        bus.on('job:status', handler);
        const event = makeJobEvent();
        bus.emit('job:status', event);
        expect(handler).toHaveBeenCalledOnce();
        expect(handler).toHaveBeenCalledWith(event);
    });

    it('delivers to multiple handlers', () => {
        const bus = new AppBus();
        const h1 = vi.fn();
        const h2 = vi.fn();
        bus.on('job:status', h1);
        bus.on('job:status', h2);
        bus.emit('job:status', makeJobEvent());
        expect(h1).toHaveBeenCalledOnce();
        expect(h2).toHaveBeenCalledOnce();
    });

    it('does not deliver after unsubscribe', () => {
        const bus = new AppBus();
        const handler = vi.fn();
        const unsub = bus.on('job:status', handler);
        unsub();
        bus.emit('job:status', makeJobEvent());
        expect(handler).not.toHaveBeenCalled();
    });

    it('does not deliver to handlers for other events', () => {
        const bus = new AppBus();
        const handler = vi.fn();
        bus.on('receipt:saved', handler as never);
        bus.emit('job:status', makeJobEvent());
        expect(handler).not.toHaveBeenCalled();
    });

    it('handles void-payload events', () => {
        const bus = new AppBus();
        const handler = vi.fn();
        bus.on('data:restored', handler);
        bus.emit('data:restored', undefined as void);
        expect(handler).toHaveBeenCalledOnce();
    });

    describe('onForTab', () => {
        it('delivers events with matching tabId', () => {
            const bus = new AppBus();
            const handler = vi.fn();
            bus.onForTab('job:status', 'tab-A', handler);
            bus.emit('job:status', makeJobEvent({ tabId: 'tab-A' }));
            expect(handler).toHaveBeenCalledOnce();
        });

        it('does not deliver events with non-matching tabId', () => {
            const bus = new AppBus();
            const handler = vi.fn();
            bus.onForTab('job:status', 'tab-A', handler);
            bus.emit('job:status', makeJobEvent({ tabId: 'tab-B' }));
            expect(handler).not.toHaveBeenCalled();
        });

        it('delivers events with tabId === null to all tab-scoped subscribers', () => {
            const bus = new AppBus();
            const handler = vi.fn();
            bus.onForTab('job:status', 'tab-A', handler);
            bus.emit('job:status', makeJobEvent({ tabId: null }));
            expect(handler).toHaveBeenCalledOnce();
        });

        it('delivers void-payload events (no tabId field) to tab-scoped subscribers', () => {
            const bus = new AppBus();
            const handler = vi.fn();
            bus.onForTab('data:restored', 'tab-A', handler);
            bus.emit('data:restored', undefined as void);
            expect(handler).toHaveBeenCalledOnce();
        });

        it('unsubscribes correctly', () => {
            const bus = new AppBus();
            const handler = vi.fn();
            const unsub = bus.onForTab('job:status', 'tab-A', handler);
            unsub();
            bus.emit('job:status', makeJobEvent({ tabId: 'tab-A' }));
            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe('scope()', () => {
        it('returns a ScopedAppBus', () => {
            const bus = new AppBus();
            const scoped = bus.scope('tab-X');
            expect(scoped).toBeInstanceOf(ScopedAppBus);
            expect(scoped.tabId).toBe('tab-X');
        });

        it('scoped bus filters by tabId', () => {
            const bus = new AppBus();
            const scoped = bus.scope('tab-X');
            const handler = vi.fn();
            scoped.on('job:status', handler);
            bus.emit('job:status', makeJobEvent({ tabId: 'tab-Y' }));
            expect(handler).not.toHaveBeenCalled();
            bus.emit('job:status', makeJobEvent({ tabId: 'tab-X' }));
            expect(handler).toHaveBeenCalledOnce();
        });

        it('scoped bus emit goes through global bus', () => {
            const bus = new AppBus();
            const scoped = bus.scope('tab-X');
            const globalHandler = vi.fn();
            bus.on('job:status', globalHandler);
            scoped.emit('job:status', makeJobEvent({ tabId: 'tab-X' }));
            expect(globalHandler).toHaveBeenCalledOnce();
        });
    });
});
