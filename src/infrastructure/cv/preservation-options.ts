import type { RemovalMode } from '../../config/constants.js';

export interface PreservationOptions {
  preserveText: boolean;
  preserveLogos: boolean;
  preserveTextContainers: boolean;
}

export interface PreservationInput {
  preserveText?: boolean;
  preserve_text?: boolean;
  preserveLogos?: boolean;
  preserve_logos?: boolean;
  preserveTextContainers?: boolean;
  preserve_text_containers?: boolean;
}

export function resolvePreservationOptions(
  mode: RemovalMode,
  input: PreservationInput = {},
): PreservationOptions {
  const preserveText = readBool(input.preserveText ?? input.preserve_text);
  const preserveLogos = readBool(input.preserveLogos ?? input.preserve_logos);
  const preserveTextContainers = readBool(
    input.preserveTextContainers ?? input.preserve_text_containers,
  );

  if (mode === 'text_background') {
    return {
      preserveText: true,
      preserveLogos: preserveLogos ?? false,
      preserveTextContainers: preserveTextContainers ?? false,
    };
  }

  if (mode === 'person' || mode === 'product' || mode === 'object') {
    return {
      preserveText: preserveText ?? true,
      preserveLogos: preserveLogos ?? true,
      preserveTextContainers: preserveTextContainers ?? true,
    };
  }

  return {
    preserveText: preserveText ?? true,
    preserveLogos: preserveLogos ?? true,
    preserveTextContainers: preserveTextContainers ?? true,
  };
}

export function isSubjectCutoutMode(mode: RemovalMode): boolean {
  return mode === 'person' || mode === 'product' || mode === 'object';
}

export function isGraphicCutoutMode(mode: RemovalMode): boolean {
  return (
    mode === 'graphic' ||
    mode === 'document' ||
    mode === 'text_background' ||
    mode === 'screenshot'
  );
}

function readBool(value: boolean | string | number | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  return undefined;
}
