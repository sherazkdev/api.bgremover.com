export interface AsyncQueueOptions {
  concurrency: number;
  maxQueueSize: number;
}

export interface AsyncQueueStats {
  active: number;
  queued: number;
  concurrency: number;
  maxQueueSize: number;
}

export class QueueFullError extends Error {
  constructor(message = 'Processing queue is full') {
    super(message);
    this.name = 'QueueFullError';
  }
}

interface QueueJob<T> {
  task: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  enqueuedAt: number;
}

export class AsyncQueue {
  private readonly concurrency: number;
  private readonly maxQueueSize: number;
  private activeCount = 0;
  private readonly waiting: Array<QueueJob<unknown>> = [];

  constructor(options: AsyncQueueOptions) {
    if (options.concurrency < 1) {
      throw new Error('AsyncQueue concurrency must be at least 1');
    }
    if (options.maxQueueSize < 0) {
      throw new Error('AsyncQueue maxQueueSize must be at least 0');
    }
    this.concurrency = options.concurrency;
    this.maxQueueSize = options.maxQueueSize;
  }

  public get stats(): AsyncQueueStats {
    return {
      active: this.activeCount,
      queued: this.waiting.length,
      concurrency: this.concurrency,
      maxQueueSize: this.maxQueueSize,
    };
  }

  public async add<T>(task: () => Promise<T>): Promise<T> {
    const canStartImmediately = this.activeCount < this.concurrency && this.waiting.length === 0;
    if (!canStartImmediately && this.waiting.length >= this.maxQueueSize) {
      throw new QueueFullError();
    }

    return new Promise<T>((resolve, reject) => {
      const job: QueueJob<T> = {
        task,
        resolve,
        reject,
        enqueuedAt: Date.now(),
      };
      this.waiting.push(job as QueueJob<unknown>);
      this.pump();
    });
  }

  public async onIdle(): Promise<void> {
    if (this.activeCount === 0 && this.waiting.length === 0) {
      return;
    }
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (this.activeCount === 0 && this.waiting.length === 0) {
          clearInterval(timer);
          resolve();
        }
      }, 10);
    });
  }

  private pump(): void {
    while (this.activeCount < this.concurrency && this.waiting.length > 0) {
      const job = this.waiting.shift();
      if (!job) {
        return;
      }
      this.activeCount += 1;
      void this.execute(job);
    }
  }

  private async execute(job: QueueJob<unknown>): Promise<void> {
    try {
      const result = await job.task();
      job.resolve(result);
    } catch (error) {
      job.reject(error);
    } finally {
      this.activeCount -= 1;
      this.pump();
    }
  }
}
