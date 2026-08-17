export interface PokeCounterService {
  getCount(): Promise<number>;
  increment(delta: number): Promise<number>;
}

const STORAGE_KEY = "world-jelly:pokes:v0";
const MOCK_BASE_COUNT = 3829417;

function readLocalCount() {
  if (typeof window === "undefined") {
    return MOCK_BASE_COUNT;
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  const parsed = stored ? Number.parseInt(stored, 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : MOCK_BASE_COUNT;
}

function writeLocalCount(count: number) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, String(count));
  }
}

class LocalPokeCounterService implements PokeCounterService {
  async getCount() {
    return readLocalCount();
  }

  async increment(delta: number) {
    const next = readLocalCount() + delta;
    writeLocalCount(next);
    return next;
  }
}

export const pokeCounterService: PokeCounterService = new LocalPokeCounterService();

export function createBatchedCounterSync(service: PokeCounterService) {
  let pending = 0;
  let timer: number | null = null;

  const flush = async () => {
    if (pending === 0) {
      return;
    }

    const delta = pending;
    pending = 0;
    await service.increment(delta);
  };

  return {
    queueIncrement() {
      pending += 1;

      if (timer) {
        window.clearTimeout(timer);
      }

      timer = window.setTimeout(() => {
        timer = null;
        void flush();
      }, 700);
    },
    flush,
    dispose() {
      if (timer) {
        window.clearTimeout(timer);
      }
      timer = null;
      pending = 0;
    }
  };
}
