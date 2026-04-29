import { describe, expect, it } from 'vitest';
import { formatBytes } from '../fileFormatting';
import { estimateReceiptDataSizeBytes } from './receiptData';
import { formatMoney } from '../priceFormatting';

describe('formatBytes', () => {
  it('handles bytes and kilobytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('handles megabytes', () => {
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.00 MB');
  });
});

describe('estimateReceiptDataSizeBytes', () => {
  it('returns a positive byte count', () => {
    const size = estimateReceiptDataSizeBytes({
      rows: [
        { name: 'Milk', price: 3.99 },
        { name: 'Eggs', price: 5.49 },
      ],
    });

    expect(size).toBeGreaterThan(0);
  });
});

describe('formatMoney', () => {
  it('returns CAD formatted values', () => {
    const value = formatMoney(12.5);
    expect(value).toContain('12.50');
  });
});
