import { describe, expect, it } from 'vitest';

import { parseBooleanField } from '../../shared/utils/boolean-field.js';

describe('parseBooleanField', () => {
  it('defaults when the value is missing', () => {
    expect(parseBooleanField(undefined, true)).toBe(true);
    expect(parseBooleanField('maybe', false)).toBe(false);
  });

  it('accepts common true and false tokens', () => {
    expect(parseBooleanField('true', false)).toBe(true);
    expect(parseBooleanField('1', false)).toBe(true);
    expect(parseBooleanField('on', false)).toBe(true);
    expect(parseBooleanField('false', true)).toBe(false);
    expect(parseBooleanField('0', true)).toBe(false);
    expect(parseBooleanField(false, true)).toBe(false);
  });
});
