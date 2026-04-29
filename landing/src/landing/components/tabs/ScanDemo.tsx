import type React from 'react';
import ScannerInboxCard from '../../../components/receipt-scanner/ScannerInboxCard';
import type { ImageLibraryEntry } from '../../../types/image-library';
import type { Task } from '../../../context/TaskManagerContext';

const fakeEntries: ImageLibraryEntry[] = [
    {
        id: 1,
        filePath: '/path/to/receipt_2024-03-15.jpg',
        addedAt: new Date().toISOString(),
        thumbnailPath: null,
        receiptId: null,
        stagingPath: null,
    },
    {
        id: 2,
        filePath: '/path/to/receipt_2024-03-16.jpg',
        addedAt: new Date().toISOString(),
        thumbnailPath: null,
        receiptId: null,
        stagingPath: null,
    },
    {
        id: 3,
        filePath: '/path/to/receipt_2024-03-17.jpg',
        addedAt: new Date().toISOString(),
        thumbnailPath: null,
        receiptId: null,
        stagingPath: null,
    },
];

const noop = () => { };
const emptyTasks: Record<string, Task> = {} as Record<string, Task>;

export default function ScanDemo(): React.ReactElement {
    return (
        <div className="w-full p-4 scan-demo" aria-hidden="true">
            <style>{` .scan-demo img { display: none !important; } `}</style>
            <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-xl overflow-hidden">
                <div className="flex items-center gap-4 px-6 py-5">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-3xl bg-violet-100 text-violet-600">
                        <i className="fas fa-camera text-lg" aria-hidden="true" />
                    </div>
                    <div>
                        <p className="text-lg font-semibold text-slate-900">Scan Receipts</p>
                        <p className="text-sm text-slate-500">Upload receipt images, then scan them when you&apos;re ready.</p>
                    </div>
                </div>

                <div className="flex items-center justify-between px-6 py-4">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                        {fakeEntries.length} {fakeEntries.length === 1 ? 'image' : 'images'} ready
                    </p>
                    <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-700 transition-all duration-200 cursor-pointer"
                    >
                        <i className="fas fa-search text-[10px]" aria-hidden="true" /> Scan All
                    </button>
                </div>

                <div className="px-6 pb-6 space-y-4">
                    {fakeEntries.map((entry) => (
                        <ScannerInboxCard
                            key={entry.id}
                            entry={entry}
                            donePhase={{}}
                            taskForPath={emptyTasks}
                            perImageScanStatus={{}}
                            queueScanResults={{}}
                            queueErrors={{}}
                            modelsAbsent={false}
                            onScan={noop}
                            onCancel={noop}
                            onEdit={noop}
                            onRevert={noop}
                            onRemove={noop}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
