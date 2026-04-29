import { useCallback, useState, useRef } from 'react';
import type React from 'react';
import MockGroceryPricesPage from '../../../landing/pages/MockGroceryPricesPage';
import type { GroceryProductRecord } from '../../../types/grocery';
import type { DemoPage } from '../../../landing/MockSidebar';

const SAMPLE_PRODUCT: GroceryProductRecord = {
	id: 0,
	name: 'Whole Milk',
	category: 'dairy',
	unit: 'L',
};

export default function ComparisonMockup(): React.ReactElement {
	const [product, setProduct] = useState<GroceryProductRecord>(SAMPLE_PRODUCT);
	const [category, setCategory] = useState('dairy');
	const [transitioning, setTransitioning] = useState(false);
	const transitionLock = useRef(false);

	const handleNavigate = useCallback((page: DemoPage, opts?: { category?: string; product?: GroceryProductRecord }) => {
		if (transitionLock.current) return;
		const nextProduct = opts?.product;
		const nextCategory = opts?.category;
		if (page === 'prices-product' && !nextProduct && !nextCategory) return;
		if (page === 'prices-category' && !nextCategory) return;
		transitionLock.current = true;
		setTransitioning(true);
		window.setTimeout(() => {
			if (page === 'prices-product' && nextProduct) {
				setProduct(nextProduct);
				if (nextCategory) setCategory(nextCategory);
			}
			if (page === 'prices-category' && nextCategory) {
				setCategory(nextCategory);
			}
			setTransitioning(false);
			transitionLock.current = false;
		}, 180);
	}, []);

	const contentStyle: React.CSSProperties = transitioning
		? { opacity: 0, transform: 'translateY(-12px)', transition: 'opacity 200ms ease, transform 200ms ease' }
		: { opacity: 1, transform: 'translateY(0)', transition: 'opacity 200ms ease, transform 200ms ease' };

	return (
		<div className="w-full overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-xl overflow-hidden" aria-hidden="true">
			<div style={contentStyle}>
				<MockGroceryPricesPage product={product} category={category} onNavigate={handleNavigate} />
			</div>
		</div>
	);
}
