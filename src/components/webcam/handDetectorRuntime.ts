export type LandmarkerDelegate = "GPU" | "CPU";
export type DetectorStatus = "loading" | "fallback" | "ready" | "failed" | "busy";

interface ClosableDetector {
  close(): void;
}

export interface DetectorLease<T extends ClosableDetector> {
  readonly detector: T | null;
  readonly delegate: LandmarkerDelegate;
  fallbackToCpu(): Promise<void>;
  release(): void;
}

function cancelled() {
  return new DOMException("Gesture detection was stopped.", "AbortError");
}

/** One task/owner at a time, including initialization and GPU→CPU replacement.
 * A cancelled task is closed even if its uncancellable WASM creation resolves late.
 */
export function createExclusiveDetectorRuntime<T extends ClosableDetector>(
  create: (delegate: LandmarkerDelegate, signal: AbortSignal) => Promise<T>,
  options: { canFallback?: (error: unknown) => boolean } = {},
) {
  interface Request {
    signal: AbortSignal;
    onStatus?: (status: DetectorStatus) => void;
    resolve: (lease: DetectorLease<T>) => void;
    reject: (error: unknown) => void;
    removeAbort: () => void;
    released: boolean;
    pending: boolean;
    settled: boolean;
    detector: T | null;
    delegate: LandmarkerDelegate;
  }
  let active: Request | null = null;
  const queue: Request[] = [];

  const close = (detector: T | null) => {
    try { detector?.close(); } catch { /* A lost GPU context can already be disposed. */ }
  };
  function release(request: Request) {
    if (request.released) return;
    request.released = true;
    request.removeAbort();
    close(request.detector);
    request.detector = null;
    if (!request.settled) {
      request.settled = true;
      request.reject(cancelled());
    }
    const queued = queue.indexOf(request);
    if (queued !== -1) queue.splice(queued, 1);
    if (active === request && !request.pending) active = null;
    void pump();
  }
  async function createFor(request: Request, delegate: LandmarkerDelegate) {
    const detector = await create(delegate, request.signal);
    if (request.released || request.signal.aborted) {
      close(detector);
      throw cancelled();
    }
    request.detector = detector;
    request.delegate = delegate;
  }
  async function pump() {
    if (active) return;
    const request = queue.shift();
    if (!request) return;
    active = request;
    request.pending = true;
    try {
      request.onStatus?.("loading");
      try {
        await createFor(request, "GPU");
      } catch (error) {
        if (request.released || request.signal.aborted || options.canFallback?.(error) === false) throw error;
        request.onStatus?.("fallback");
        await createFor(request, "CPU");
      }
      if (request.released) return;
      request.settled = true;
      request.resolve({
        get detector() { return request.detector; },
        get delegate() { return request.delegate; },
        async fallbackToCpu() {
          if (request.released || request.signal.aborted) throw cancelled();
          if (request.pending) throw new Error("Gesture detection is already restarting.");
          if (request.delegate === "CPU") throw new Error("CPU gesture detection failed.");
          request.pending = true;
          close(request.detector);
          request.detector = null;
          request.onStatus?.("fallback");
          try {
            await createFor(request, "CPU");
          } catch (error) {
            release(request);
            throw error;
          } finally {
            request.pending = false;
            if (request.released && active === request) active = null;
            void pump();
          }
        },
        release: () => release(request),
      });
    } catch (error) {
      if (!request.settled) {
        request.settled = true;
        request.reject(error);
      }
      release(request);
    } finally {
      request.pending = false;
      if (request.released && active === request) active = null;
      void pump();
    }
  }

  return {
    acquire(signal: AbortSignal, onStatus?: (status: DetectorStatus) => void): Promise<DetectorLease<T>> {
      if (signal.aborted) return Promise.reject(cancelled());
      return new Promise((resolve, reject) => {
        const request: Request = {
          signal, onStatus, resolve, reject, removeAbort: () => {},
          released: false, pending: false, settled: false,
          detector: null, delegate: "GPU",
        };
        const onAbort = () => release(request);
        request.removeAbort = () => signal.removeEventListener("abort", onAbort);
        signal.addEventListener("abort", onAbort, { once: true });
        queue.push(request);
        if (active) onStatus?.("busy");
        void pump();
      });
    },
  };
}
