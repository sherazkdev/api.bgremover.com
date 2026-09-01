import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LocalStorageService } from '../../infrastructure/storage/local-storage.service.js';

describe('LocalStorageService', () => {
  it('writes atomically and rejects path traversal', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'bg-storage-'));
    const storage = new LocalStorageService(root);
    try {
      const stored = await storage.saveAtomic('originals/2026/09/sample.jpg', Buffer.from('abc'));
      expect(stored.relativePath).toBe('originals/2026/09/sample.jpg');
      expect(stored.size).toBe(3);
      const written = await readFile(
        path.join(root, 'originals', '2026', '09', 'sample.jpg'),
        'utf8',
      );
      expect(written).toBe('abc');

      await expect(storage.saveAtomic('../outside.jpg', Buffer.from('nope'))).rejects.toMatchObject(
        {
          code: 'FILE_STORAGE_FAILED',
        },
      );
      await expect(
        storage.saveAtomic('originals/../../secret.jpg', Buffer.from('nope')),
      ).rejects.toMatchObject({
        code: 'FILE_STORAGE_FAILED',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
