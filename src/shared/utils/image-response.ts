import { MIME_BY_FORMAT, type OutputFormat } from '../../config/constants.js';
import { sanitizeContentDispositionFilename, toPosixPath } from './file-name.js';

export function buildPublicUrl(publicBaseUrl: string, relativePath: string): string {
  const base = publicBaseUrl.replace(/\/+$/, '');
  const normalized = toPosixPath(relativePath).replace(/^\/+/, '');
  const withUploads = normalized.startsWith('uploads/') ? normalized : `uploads/${normalized}`;
  return `${base}/${withUploads}`;
}

export function mimeTypeForFormat(format: OutputFormat | 'jpeg' | 'jpg'): string {
  if (format === 'jpg' || format === 'jpeg') {
    return MIME_BY_FORMAT.jpg;
  }
  return MIME_BY_FORMAT[format];
}

export function contentDispositionForImage(id: string, format: OutputFormat): string {
  const filename = sanitizeContentDispositionFilename(`background-removed-${id}.${format}`);
  return `inline; filename="${filename}"`;
}

export function relativeUploadUrlPath(relativeStoragePath: string): string {
  const normalized = toPosixPath(relativeStoragePath).replace(/^\/+/, '');
  return normalized.startsWith('uploads/') ? normalized : `uploads/${normalized}`;
}
