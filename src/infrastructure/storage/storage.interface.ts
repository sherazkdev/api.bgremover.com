export interface StoredFile {
  relativePath: string;
  size: number;
}

export interface StorageService {
  saveAtomic(relativePath: string, contents: Buffer): Promise<StoredFile>;
  createReadStream(relativePath: string): Promise<NodeJS.ReadableStream>;
  remove(relativePath: string): Promise<void>;
  exists(relativePath: string): Promise<boolean>;
  ensureReady(): Promise<boolean>;
  resolvePublicRelativePath(relativePath: string): string;
}

export type { StoredFile as StoredImageFile };
