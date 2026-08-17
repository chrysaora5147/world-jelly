const VISITOR_STORAGE_KEY = "world-jelly:visitor-id:v1";
const SESSION_FLUSH_INTERVAL_MS = 5000;

type GameplaySessionState = {
  visitorId: string;
  sessionId: string;
  startedAt: string;
  startedAtMs: number;
  pokes: number;
  giveJellyOpened: boolean;
  soundMuted: boolean;
  shareClicked: boolean;
};

function createUuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (character) => {
    const random = typeof crypto !== "undefined" && "getRandomValues" in crypto
      ? crypto.getRandomValues(new Uint8Array(1))[0]
      : Math.floor(Math.random() * 256);
    return (Number(character) ^ (random & (15 >> (Number(character) / 4)))).toString(16);
  });
}

function getVisitorId() {
  const existing = window.localStorage.getItem(VISITOR_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const next = createUuid();
  window.localStorage.setItem(VISITOR_STORAGE_KEY, next);
  return next;
}

function sessionPayload(state: GameplaySessionState) {
  return {
    visitor_id: state.visitorId,
    session_id: state.sessionId,
    started_at: state.startedAt,
    duration_seconds: Math.max(0, Math.round((Date.now() - state.startedAtMs) / 1000)),
    pokes: state.pokes,
    give_jelly_opened: state.giveJellyOpened,
    sound_muted: state.soundMuted,
    share_clicked: state.shareClicked
  };
}

function sendSessionBeacon(state: GameplaySessionState) {
  if (typeof navigator === "undefined" || !navigator.sendBeacon) {
    return false;
  }

  return navigator.sendBeacon(
    "/api/analytics/session",
    new Blob([JSON.stringify(sessionPayload(state))], { type: "application/json" })
  );
}

async function postSession(state: GameplaySessionState) {
  await fetch("/api/analytics/session", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(sessionPayload(state)),
    keepalive: true
  });
}

export function createGameplayAnalytics(initialSoundMuted: boolean) {
  const state: GameplaySessionState = {
    visitorId: getVisitorId(),
    sessionId: createUuid(),
    startedAt: new Date().toISOString(),
    startedAtMs: Date.now(),
    pokes: 0,
    giveJellyOpened: false,
    soundMuted: initialSoundMuted,
    shareClicked: false
  };
  let timer: number | null = null;

  const flush = () => {
    void postSession(state).catch(() => {
      // Analytics should never interrupt jelly play.
    });
  };

  const flushNow = () => {
    void postSession(state).catch(() => {
      // Analytics should never interrupt jelly play.
    });
  };

  const flushWithBeacon = () => {
    if (!sendSessionBeacon(state)) {
      flushNow();
    }
  };

  timer = window.setInterval(flush, SESSION_FLUSH_INTERVAL_MS);
  flush();

  return {
    recordPoke() {
      state.pokes += 1;
    },
    recordGiveJellyOpened() {
      state.giveJellyOpened = true;
      flushNow();
    },
    setSoundMuted(muted: boolean) {
      state.soundMuted = muted;
    },
    flush: flushNow,
    flushWithBeacon,
    dispose() {
      if (timer) {
        window.clearInterval(timer);
        timer = null;
      }
    }
  };
}
