import { describe, expect, it } from 'vitest';
import {
  resolvePersistedReceiptImagePath,
  resolveScanSourcePath,
} from './scanSource';

describe('resolveScanSourcePath', () => {
  it('uses edited path when base path has an edit mapping', () => {
    const result = resolveScanSourcePath('/a.jpg', '/a.jpg', {
      '/a.jpg': '/a-edited.jpg',
    });
    expect(result).toBe('/a-edited.jpg');
  });

  it('falls back to active image path when no edit exists', () => {
    const result = resolveScanSourcePath('/a.jpg', '/a.jpg', {});
    expect(result).toBe('/a.jpg');
  });

  it('uses active image path when base path is null', () => {
    const result = resolveScanSourcePath(null, '/active.jpg', {
      '/other.jpg': '/other-edited.jpg',
    });
    expect(result).toBe('/active.jpg');
  });
});

describe('resolvePersistedReceiptImagePath', () => {
  it('prefers base path when available', () => {
    const result = resolvePersistedReceiptImagePath('/base.jpg', '/edited.jpg');
    expect(result).toBe('/base.jpg');
  });

  it('falls back to active image path when base path is null', () => {
    const result = resolvePersistedReceiptImagePath(null, '/active.jpg');
    expect(result).toBe('/active.jpg');
  });
});
