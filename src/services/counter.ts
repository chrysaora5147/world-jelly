export interface PokeCounterService {
  getCount(): Promise<number>;
  increment(delta: number): Promise<number>;
}

type CounterSyncOptions = {
  onSynced?: (total: number) => void;
  onError?: (error: unknown, delta: number) => void;
};

type PokeStatsResponse = {
  totalPokes: number;
};

async function readPokeResponse(response: Response) {
  const data = await response.json() as Partial<PokeStatsResponse> & { error?: string };

  if (!response.ok || typeof data.totalPokes !== "number" || !Number.isFinite(data.totalPokes)) {
    throw new Error(data.error ?? "Invalid poke stats response.");
  }

  return data.totalPokes;
}

function sendBeaconDelta(delta: number) {
  if (typeof navigator === "undefined" || !navigator.sendBeacon) {
    return false;
  }

  const payload = new Blob([JSON.stringify({ delta })], { type: "application/json" });
  return navigator.sendBeacon("/api/pokes", payload);
}

class ApiPokeCounterService implements PokeCounterService {
  async getCount() {
    return readPokeResponse(await fetch("/api/pokes", { cache: "no-store" }));
  }

  async increment(delta: number) {
    return readPokeResponse(await fetch("/api/pokes", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ delta }),
      keepalive: delta <= 50
    }));
  }
}

export const pokeCounterService: PokeCounterService = new ApiPokeCounterService();

export function createBatchedCounterSync(service: PokeCounterService, options: CounterSyncOptions = {}) {
  let pending = 0;
  let timer: number | null = null;
  let flushing = false;

  const flush = async () => {
    if (pending === 0 || flushing) {
      return;
    }

    const delta = pending;
    pending = 0;
    flushing = true;

    try {
      const total = await service.increment(delta);
      options.onSynced?.(total);
    } catch (error) {
      pending += delta;
      options.onError?.(error, delta);
    } finally {
      flushing = false;
      if (pending > 0) {
        scheduleFlush();
      }
    }
  };

  const scheduleFlush = () => {
    if (timer) {
      window.clearTimeout(timer);
    }

    timer = window.setTimeout(() => {
      timer = null;
      void flush();
    }, 1000);
  };

  return {
    queueIncrement() {
      pending += 1;

      if (pending >= 50) {
        if (timer) {
          window.clearTimeout(timer);
          timer = null;
        }
        if (flushing) {
          scheduleFlush();
        } else {
          void flush();
        }
        return;
      }

      scheduleFlush();
    },
    flush,
    flushWithBeacon() {
      if (pending === 0) {
        return;
      }

      const delta = pending;
      pending = 0;
      if (!sendBeaconDelta(delta)) {
        pending = delta;
      }
    },
    dispose() {
      if (timer) {
        window.clearTimeout(timer);
      }
      timer = null;
    }
  };
}
