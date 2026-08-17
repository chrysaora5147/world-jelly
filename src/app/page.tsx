"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { GiveModal } from "@/components/GiveModal";
import { WorldJelly } from "@/components/WorldJelly";
import { createBatchedCounterSync, pokeCounterService, type PokeStats } from "@/services/counter";
import { createGameplayAnalytics } from "@/services/gameplay-analytics";
import { JellyAudio, type JellySoundCue } from "@/services/audio";
import { formatFortune } from "@/services/fortune";
import type { PokeIntensity } from "@/types/jelly";

const numberFormatter = new Intl.NumberFormat("en-US");

export default function Home() {
  const [jellyStats, setJellyStats] = useState<PokeStats | null>(null);
  const [sessionPokes, setSessionPokes] = useState(0);
  const [muted, setMuted] = useState(false);
  const [isGiveOpen, setGiveOpen] = useState(false);
  const audio = useRef<JellyAudio | null>(null);
  const counterSync = useRef<ReturnType<typeof createBatchedCounterSync> | null>(null);
  const gameplayAnalytics = useRef<ReturnType<typeof createGameplayAnalytics> | null>(null);

  useEffect(() => {
    audio.current = new JellyAudio();
    gameplayAnalytics.current = createGameplayAnalytics(false);
    counterSync.current = createBatchedCounterSync(pokeCounterService, {
      onSynced(stats) {
        setJellyStats((current) => ({
          ...stats,
          totalPokes: Math.max(current?.totalPokes ?? 0, stats.totalPokes)
        }));
      }
    });

    void pokeCounterService.getStats().then((stats) => {
      setJellyStats((current) => ({
        ...stats,
        totalPokes: Math.max(current?.totalPokes ?? 0, stats.totalPokes)
      }));
    }).catch(() => {
      // Keep the jelly playable if the production counter is temporarily unavailable.
    });

    const handlePageHide = () => {
      counterSync.current?.flushWithBeacon();
      gameplayAnalytics.current?.flushWithBeacon();
    };

    window.addEventListener("pagehide", handlePageHide);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        handlePageHide();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      handlePageHide();
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      counterSync.current?.dispose();
      gameplayAnalytics.current?.dispose();
    };
  }, []);

  useEffect(() => {
    audio.current?.setMuted(muted);
    gameplayAnalytics.current?.setSoundMuted(muted);
  }, [muted]);

  const jellyTone = useMemo(() => {
    if (sessionPokes >= 25) {
      return "The jelly has opinions.";
    }
    if (sessionPokes > 0 && sessionPokes % 10 === 0) {
      return "Wobble checkpoint.";
    }
    return "One jelly. One internet.";
  }, [sessionPokes]);

  const handlePoke = (intensity: PokeIntensity, cue: JellySoundCue) => {
    setJellyStats((stats) => stats ? { ...stats, totalPokes: stats.totalPokes + 1 } : stats);
    setSessionPokes((count) => count + 1);
    gameplayAnalytics.current?.recordPoke();
    counterSync.current?.queueIncrement();
    audio.current?.poke(intensity, cue);
  };

  const handleGiveOpen = () => {
    gameplayAnalytics.current?.recordGiveJellyOpened();
    setGiveOpen(true);
  };

  return (
    <main className="world-shell">
      <section className="hero" aria-label="World Jelly interactive toy">
        <header className="topbar">
          <div>
            <p className="eyebrow">WORLD JELLY</p>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label={muted ? "Unmute sound" : "Mute sound"}
            title={muted ? "Unmute" : "Mute"}
            onClick={() => setMuted((value) => !value)}
          >
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
        </header>

        <div className="stage">
          <WorldJelly
            sessionPokes={sessionPokes}
            onPoke={handlePoke}
            onRelease={(power) => audio.current?.release(power)}
            onPrimeSound={() => audio.current?.prime()}
            onSound={(cue) => audio.current?.cue(cue)}
          />
          <p className="poke-hint">poke me</p>
        </div>

        <div className="status-row" aria-live="polite">
          <div className="stat-block">
            <span>GLOBAL POKES</span>
            <strong>{jellyStats ? numberFormatter.format(jellyStats.totalPokes) : "syncing"}</strong>
          </div>
          <div className="stat-block">
            <span>JELLY&apos;S FORTUNE</span>
            <strong>{jellyStats ? formatFortune(jellyStats.fortuneBaht, "THB") : "syncing"}</strong>
            <small>{jellyStats ? "Live from Supabase" : "Connecting"}</small>
          </div>
        </div>

        <footer className="actions">
          <p>{jellyTone}</p>
          <button className="give-button" type="button" onClick={handleGiveOpen}>
            Give Jelly ฿
          </button>
        </footer>
      </section>

      <GiveModal open={isGiveOpen} onClose={() => setGiveOpen(false)} />
    </main>
  );
}
