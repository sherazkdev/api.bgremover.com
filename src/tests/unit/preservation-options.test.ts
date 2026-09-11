import { describe, expect, it } from 'vitest';

import {
  isGraphicCutoutMode,
  isSubjectCutoutMode,
  resolvePreservationOptions,
} from '../../infrastructure/cv/preservation-options.js';

describe('resolvePreservationOptions', () => {
  it('forces text preservation in text_background mode', () => {
    const options = resolvePreservationOptions('text_background', {
      preserveText: false,
      preserveLogos: true,
      preserveTextContainers: true,
    });
    expect(options).toEqual({
      preserveText: true,
      preserveLogos: true,
      preserveTextContainers: true,
    });
  });

  it('defaults containers and logos off in text_background mode', () => {
    const options = resolvePreservationOptions('text_background', {});
    expect(options).toEqual({
      preserveText: true,
      preserveLogos: false,
      preserveTextContainers: false,
    });
  });

  it('defaults overlays on for person cutouts', () => {
    const options = resolvePreservationOptions('person', {});
    expect(options).toEqual({
      preserveText: true,
      preserveLogos: true,
      preserveTextContainers: true,
    });
  });
});

describe('mode helpers', () => {
  it('classifies subject and graphic modes', () => {
    expect(isSubjectCutoutMode('person')).toBe(true);
    expect(isSubjectCutoutMode('object')).toBe(true);
    expect(isGraphicCutoutMode('text_background')).toBe(true);
    expect(isGraphicCutoutMode('screenshot')).toBe(true);
    expect(isSubjectCutoutMode('graphic')).toBe(false);
  });
});
