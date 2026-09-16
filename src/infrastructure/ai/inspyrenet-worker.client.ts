import { processingFailedError } from '../../shared/errors/app-error.js';
import type { Env } from '../../config/env.js';

export class InspyrenetWorkerClient {
  private ready = false;

  constructor(private readonly env: Pick<Env, 'INSPIRENET_WORKER_URL' | 'INSPIRENET_WORKER_TIMEOUT_MS'>) {}

  public get baseUrl(): string {
    return this.env.INSPIRENET_WORKER_URL.replace(/\/+$/, '');
  }

  public isReady(): boolean {
    return this.ready;
  }

  public async initialize(): Promise<void> {
    const deadline = Date.now() + this.env.INSPIRENET_WORKER_TIMEOUT_MS;
    let lastError = 'Worker not reachable';
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
        if (response.ok) {
          const body = (await response.json()) as { ready?: boolean };
          if (body.ready) {
            this.ready = true;
            return;
          }
          lastError = 'Worker health reported not ready';
        } else {
          lastError = `Worker health HTTP ${response.status}`;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Worker health failed';
      }
      await sleep(1000);
    }
    throw processingFailedError(`InSPyReNet worker unavailable: ${lastError}`);
  }

  public async removePhoto(
    image: Buffer,
    requestId: string,
  ): Promise<{
    buffer: Buffer;
    durationMs: number;
    roundTripMs: number;
    workerDecodeMs: number;
    workerInferMs: number;
    workerPngMs: number;
  }> {
    if (!this.ready) {
      throw processingFailedError('InSPyReNet worker is not ready');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.env.INSPIRENET_WORKER_TIMEOUT_MS);
    try {
      const roundTripStarted = Date.now();
      const response = await fetch(`${this.baseUrl}/remove`, {
        method: 'POST',
        headers: {
          'X-Request-Id': requestId,
          'Content-Type': 'application/octet-stream',
        },
        body: new Uint8Array(image.buffer, image.byteOffset, image.byteLength),
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw processingFailedError(
          text ? `InSPyReNet worker failed: ${text.slice(0, 200)}` : `InSPyReNet worker HTTP ${response.status}`,
        );
      }
      const durationHeader = response.headers.get('x-processing-duration-ms');
      const durationMs = durationHeader ? Number(durationHeader) : 0;
      const workerDecodeMs = Number(response.headers.get('x-worker-decode-ms') ?? 0);
      const workerInferMs = Number(response.headers.get('x-worker-infer-ms') ?? durationMs);
      const workerPngMs = Number(response.headers.get('x-worker-png-ms') ?? 0);
      const arrayBuffer = await response.arrayBuffer();
      const roundTripMs = Date.now() - roundTripStarted;
      return {
        buffer: Buffer.from(arrayBuffer),
        durationMs: Number.isFinite(durationMs) ? durationMs : 0,
        roundTripMs,
        workerDecodeMs: Number.isFinite(workerDecodeMs) ? workerDecodeMs : 0,
        workerInferMs: Number.isFinite(workerInferMs) ? workerInferMs : 0,
        workerPngMs: Number.isFinite(workerPngMs) ? workerPngMs : 0,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
