"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { GiveModal } from "@/components/GiveModal";
import { WorldJelly } from "@/components/WorldJelly";
import { createBatchedCounterSync, pokeCounterService } from "@/services/counter";
import { JellyAudio, type JellySoundCue } from "@/services/audio";
import { formatFortune, getJellyFortune } from "@/services/fortune";
import type { PokeIntensity } from "@/types/jelly";

const numberFormatter = new Intl.NumberFormat("en-US");

export default function Home() {
  const [globalPokes, setGlobalPokes] = useState(3829417);
  const [sessionPokes, setSessionPokes] = useState(0);
  const [muted, setMuted] = useState(false);
  const [isGiveOpen, setGiveOpen] = useState(false);
  const audio = useRef<JellyAudio | null>(null);
  const counterSync = useRef<ReturnType<typeof createBatchedCounterSync> | null>(null);
  const fortune = getJellyFortune();

  useEffect(() => {
    audio.current = new JellyAudio();
    counterSync.current = createBatchedCounterSync(pokeCounterService);

    void pokeCounterService.getCount().then(setGlobalPokes);

    return () => {
      void counterSync.current?.flush();
      counterSync.current?.dispose();
    };
  }, []);

  useEffect(() => {
    audio.current?.setMuted(muted);
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
    setGlobalPokes((count) => count + 1);
    setSessionPokes((count) => count + 1);
    counterSync.current?.queueIncrement();
    audio.current?.poke(intensity, cue);
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
            <strong>{numberFormatter.format(globalPokes)}</strong>
          </div>
          <div className="stat-block">
            <span>JELLY&apos;S FORTUNE</span>
            <strong>{formatFortune(fortune.amount, fortune.currency)}</strong>
            <small>{fortune.note}</small>
          </div>
        </div>

        <footer className="actions">
          <p>{jellyTone}</p>
          <button className="give-button" type="button" onClick={() => setGiveOpen(true)}>
            Give Jelly ฿
          </button>
        </footer>
      </section>

      <GiveModal open={isGiveOpen} onClose={() => setGiveOpen(false)} />
    </main>
  );
}
