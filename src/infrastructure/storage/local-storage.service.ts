import { createReadStream } from 'node:fs';
import { access, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { fileStorageFailedError } from '../../shared/errors/app-error.js';
import { toPosixPath } from '../../shared/utils/file-name.js';
import type { StorageService, StoredFile } from './storage.interface.js';

export class LocalStorageService implements StorageService {
  private readonly root: string;

  constructor(uploadRoot: string, cwd: string = process.cwd()) {
    this.root = path.resolve(cwd, uploadRoot);
  }

  public get rootPath(): string {
    return this.root;
  }

  public async ensureReady(): Promise<boolean> {
    try {
      await mkdir(path.join(this.root, 'originals'), { recursive: true });
      await mkdir(path.join(this.root, 'processed'), { recursive: true });
      await mkdir(path.join(this.root, 'archives'), { recursive: true });
      await access(this.root);
      return true;
    } catch {
      return false;
    }
  }

  public resolvePublicRelativePath(relativePath: string): string {
    const normalized = toPosixPath(this.sanitizeRelativePath(relativePath));
    return normalized.startsWith('uploads/') ? normalized : `uploads/${normalized}`;
  }

  public async saveAtomic(relativePath: string, contents: Buffer): Promise<StoredFile> {
    const absolutePath = this.resolveInsideRoot(relativePath);
    const tempPath = `${absolutePath}.tmp-${process.pid}-${Date.now()}`;

    try {
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(tempPath, contents, { flag: 'wx' });
      await rename(tempPath, absolutePath);
      const fileStat = await stat(absolutePath);
      return {
        relativePath: this.sanitizeRelativePath(relativePath),
        size: fileStat.size,
      };
    } catch {
      await this.safeRemoveAbsolute(tempPath);
      await this.safeRemoveAbsolute(absolutePath);
      throw fileStorageFailedError();
    }
  }

  public async createReadStream(relativePath: string): Promise<NodeJS.ReadableStream> {
    const absolutePath = this.resolveInsideRoot(relativePath);
    try {
      await access(absolutePath);
    } catch {
      throw fileStorageFailedError();
    }
    return createReadStream(absolutePath);
  }

  public async remove(relativePath: string): Promise<void> {
    const absolutePath = this.resolveInsideRoot(relativePath);
    await this.safeRemoveAbsolute(absolutePath);
  }

  public async exists(relativePath: string): Promise<boolean> {
    try {
      await access(this.resolveInsideRoot(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  private sanitizeRelativePath(relativePath: string): string {
    const posix = toPosixPath(relativePath).replace(/^\/+/, '');
    const segments = posix.split('/').filter((segment) => segment.length > 0);
    if (segments.some((segment) => segment === '.' || segment === '..')) {
      throw fileStorageFailedError();
    }
    return segments.join('/');
  }

  private resolveInsideRoot(relativePath: string): string {
    const sanitized = this.sanitizeRelativePath(relativePath);
    const absolutePath = path.resolve(this.root, sanitized);
    const relative = path.relative(this.root, absolutePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw fileStorageFailedError();
    }
    return absolutePath;
  }

  private async safeRemoveAbsolute(absolutePath: string): Promise<void> {
    try {
      await rm(absolutePath, { force: true });
    } catch {
      // Cleanup is best-effort so a failed unlink does not hide the original error.
    }
  }
}
