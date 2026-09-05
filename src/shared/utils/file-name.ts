import { randomUUID } from 'node:crypto';
import path from 'node:path';

const SAFE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'zip']);

export function generateImageId(): string {
  return randomUUID();
}

export function normalizeExtension(format: string): string {
  const cleaned = format.toLowerCase().replace(/^\./, '');
  if (cleaned === 'jpeg') {
    return 'jpg';
  }
  return cleaned;
}

export function assertSafeExtension(extension: string): string {
  const normalized = normalizeExtension(extension);
  if (!SAFE_EXTENSIONS.has(normalized)) {
    throw new Error(`Unsafe file extension: ${extension}`);
  }
  return normalized === 'jpeg' ? 'jpg' : normalized;
}

export function buildDatedRelativePath(
  kind: 'originals' | 'processed' | 'archives',
  id: string,
  extension: string,
  date: Date = new Date(),
): string {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const safeId = path.basename(id);
  const safeExtension = assertSafeExtension(extension);
  return `${kind}/${year}/${month}/${safeId}.${safeExtension}`;
}

export function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

export function sanitizeContentDispositionFilename(filename: string): string {
  return path.basename(filename).replace(/[^\w.-]/g, '_');
}
