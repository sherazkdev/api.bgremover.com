import type { RemovalMode } from '../../config/constants.js';

export function normalizeRemovalMode(mode: RemovalMode): RemovalMode {
  if (mode === 'object') {
    return 'product';
  }
  return mode;
}

export function appliedRemovalMode(mode: RemovalMode): RemovalMode {
  return mode;
}
