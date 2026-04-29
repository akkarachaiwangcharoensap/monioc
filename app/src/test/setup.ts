import { afterEach, expect } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
expect.extend(matchers);

// @testing-library/react auto-cleanup requires globals:true in vitest config.
// Since we don't use globals, register it manually.
afterEach(() => { cleanup(); });
