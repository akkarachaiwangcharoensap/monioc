import type React from 'react';

interface ReceiptRowProps {
    store: string;
    date: string;
    total: string;
    items: number;
    active?: boolean;
}

export function ReceiptRow({ store, date, total, items, active }: ReceiptRowProps): React.ReactElement {
    const storeInitial = store[0];
    return (
        <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${active ? 'bg-violet-50 border border-violet-100' : 'hover:bg-slate-50'}`}>
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-emerald-400 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-[11px] font-bold">{storeInitial}</span>
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate">{store}</p>
                <p className="text-[10px] text-slate-400">{date} · {items} items</p>
            </div>
            <span className="text-xs font-semibold text-slate-700 tabular-nums">{total}</span>
        </div>
    );
}
