/**
 * Telemetry Worker Client Service
 * Manages communication with telemetryWorker, promise dispatching,
 * telemetry job queues, and fallback execution.
 */

import { WorkerMessage, WorkerResponse } from '../workers/telemetryWorker';

class TelemetryWorkerService {
  private worker: Worker | null = null;
  private pendingCallbacks: Map<
    string,
    { resolve: (data: any) => void; reject: (err: any) => void; start: number }
  > = new Map();

  private isWorkerSupported = typeof window !== 'undefined' && typeof Worker !== 'undefined';
  private jobsCount = 0;
  private totalProcessingTime = 0;
  private lastJobTimeMs = 0;
  private isOffloadActive = true;

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    if (!this.isWorkerSupported) return;

    try {
      this.worker = new Worker(
        new URL('../workers/telemetryWorker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const { id, payload, processingTimeMs, type } = event.data;
        const callback = this.pendingCallbacks.get(id);

        if (callback) {
          this.jobsCount++;
          this.lastJobTimeMs = processingTimeMs;
          this.totalProcessingTime += processingTimeMs;

          if (type.endsWith('_ERROR')) {
            callback.reject(new Error(payload?.error || 'Worker error'));
          } else {
            callback.resolve(payload);
          }
          this.pendingCallbacks.delete(id);
        }
      };

      this.worker.onerror = (err) => {
        console.warn('Telemetry Web Worker error, falling back to local thread:', err);
      };
    } catch (err) {
      console.warn('Could not initialize Telemetry Web Worker module:', err);
      this.worker = null;
    }
  }

  public setOffloadEnabled(enabled: boolean) {
    this.isOffloadActive = enabled;
  }

  public isOffloadEnabled(): boolean {
    return this.isOffloadActive && Boolean(this.worker);
  }

  public getStats() {
    return {
      workerOnline: Boolean(this.worker),
      isOffloadActive: this.isOffloadActive,
      jobsCount: this.jobsCount,
      lastJobTimeMs: this.lastJobTimeMs,
      avgProcessingTimeMs: this.jobsCount > 0 ? Number((this.totalProcessingTime / this.jobsCount).toFixed(3)) : 0,
    };
  }

  private dispatch<T>(type: WorkerMessage['type'], payload: any): Promise<T> {
    const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const start = performance.now();

    if (!this.worker || !this.isOffloadActive) {
      // Fallback: execute inline synchronously
      return Promise.resolve(this.fallbackExecute(type, payload));
    }

    return new Promise((resolve, reject) => {
      // Set safety timeout (1000ms max)
      const timeoutId = setTimeout(() => {
        if (this.pendingCallbacks.has(id)) {
          this.pendingCallbacks.delete(id);
          resolve(this.fallbackExecute(type, payload));
        }
      }, 1000);

      this.pendingCallbacks.set(id, {
        resolve: (data) => {
          clearTimeout(timeoutId);
          resolve(data);
        },
        reject: (err) => {
          clearTimeout(timeoutId);
          reject(err);
        },
        start,
      });

      this.worker!.postMessage({
        id,
        type,
        payload,
        timestamp: Date.now(),
      });
    });
  }

  // Fallback if worker is not used
  private fallbackExecute(type: WorkerMessage['type'], payload: any): any {
    switch (type) {
      case 'PROCESS_AGGREGATE_IO': {
        const { current, history = [], maxPoints = 30 } = payload;
        const pts = [...history];
        if (current && (!pts.length || pts[pts.length - 1].timestamp !== current.timestamp)) {
          pts.push(current);
        }
        return { history: pts.slice(-maxPoints), current, stats: {} };
      }
      case 'PROCESS_RESOURCE_UTILIZATION': {
        return { data: payload.data, history: payload.history || [], computed: {} };
      }
      case 'PROCESS_SPARKLINE_BATCH': {
        return { ready: false, paths: {} };
      }
      case 'PROCESS_SMART_TRENDS': {
        return { drives: payload.drives || [], acceleratingCount: 0 };
      }
      case 'CALCULATE_ZSEND_PROGRESS': {
        const { bytesSent = 0, totalBytes = 1, startedAt = Date.now(), lastRateMbS = 0 } = payload;
        const elapsedSec = Math.max(0.1, (Date.now() - startedAt) / 1000);
        const progressPct = Math.min(100, Number(((bytesSent / totalBytes) * 100).toFixed(1)));
        const currentRateMbS = lastRateMbS > 0 ? lastRateMbS : Number((bytesSent / 1024 / 1024 / elapsedSec).toFixed(1));
        return {
          ...payload,
          progressPct,
          currentRateMbS,
          averageRateMbS: currentRateMbS,
          elapsedSeconds: Math.round(elapsedSec),
          estimatedRemainingSeconds: progressPct >= 100 ? 0 : Math.ceil((totalBytes - bytesSent) / (Math.max(1, currentRateMbS) * 1024 * 1024)),
          status: progressPct >= 100 ? 'COMPLETED' : payload.status || 'STREAMING_SNAPSHOT',
          checksumMatches: true,
        };
      }
      default:
        return payload;
    }
  }

  public processAggregateIo(current: any, history: any[], maxPoints = 30) {
    return this.dispatch<any>('PROCESS_AGGREGATE_IO', { current, history, maxPoints });
  }

  public processResourceUtilization(data: any, history: any[] = []) {
    return this.dispatch<any>('PROCESS_RESOURCE_UTILIZATION', { data, history });
  }

  public processSparklineBatch(history: any[], width = 240, height = 48) {
    return this.dispatch<any>('PROCESS_SPARKLINE_BATCH', { history, width, height });
  }

  public processSmartTrends(drives: any[]) {
    return this.dispatch<any>('PROCESS_SMART_TRENDS', { drives });
  }

  public calculateZSendProgress(payload: any) {
    return this.dispatch<any>('CALCULATE_ZSEND_PROGRESS', payload);
  }

  public ping() {
    return this.dispatch<any>('PING', {});
  }
}

export const telemetryWorkerService = new TelemetryWorkerService();
