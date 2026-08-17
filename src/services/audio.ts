import type { PokeIntensity } from "@/types/jelly";

export type JellySoundCue =
  | "poke"
  | "press"
  | "release"
  | "excited"
  | "annoyed"
  | "dizzy"
  | "sleepy"
  | "wake"
  | "blush"
  | "curious";

export class JellyAudio {
  private context: AudioContext | null = null;
  private samples = new Map<string, string>();
  private muted = false;

  setMuted(muted: boolean) {
    this.muted = muted;
  }

  prime() {
    if (this.muted) {
      return;
    }

    this.playHtmlSample("prime");
    this.playWhenReady((context) => {
      const gain = context.createGain();
      const oscillator = context.createOscillator();
      const now = context.currentTime + 0.004;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(32, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.002, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.04);
    });
  }

  private createWaveDataUri(key: string) {
    if (typeof window === "undefined") {
      return "";
    }

    const sampleRate = 24000;
    const settings: Record<string, { duration: number; start: number; end: number; volume: number; water?: number; shimmer?: number; ripple?: number }> = {
      prime: { duration: 0.055, start: 520, end: 520, volume: 0.012 },
      poke: { duration: 0.18, start: 980, end: 330, volume: 0.28, water: 1420, shimmer: 1960, ripple: 42 },
      strong: { duration: 0.22, start: 820, end: 240, volume: 0.32, water: 1180, shimmer: 1760, ripple: 58 },
      press: { duration: 0.3, start: 560, end: 180, volume: 0.24, water: 820, ripple: 34 },
      release: { duration: 0.3, start: 360, end: 980, volume: 0.3, water: 1480, shimmer: 2120, ripple: 48 },
      excited: { duration: 0.36, start: 760, end: 1420, volume: 0.26, water: 1760, shimmer: 2460, ripple: 72 },
      annoyed: { duration: 0.24, start: 460, end: 190, volume: 0.2, water: 620, ripple: 22 },
      dizzy: { duration: 0.42, start: 760, end: 360, volume: 0.24, water: 1080, shimmer: 1680, ripple: 180 },
      sleepy: { duration: 0.58, start: 420, end: 260, volume: 0.14, water: 680, ripple: 12 },
      wake: { duration: 0.36, start: 520, end: 1320, volume: 0.26, water: 1560, shimmer: 2300, ripple: 68 },
      blush: { duration: 0.25, start: 720, end: 1180, volume: 0.22, water: 1620, shimmer: 2260 },
      curious: { duration: 0.22, start: 860, end: 1320, volume: 0.2, water: 1760, shimmer: 2380 }
    };
    const config = settings[key] ?? settings.poke;
    const sampleCount = Math.max(1, Math.floor(config.duration * sampleRate));
    const bytes = new Uint8Array(44 + sampleCount * 2);
    const view = new DataView(bytes.buffer);

    const writeString = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index += 1) {
        view.setUint8(offset + index, value.charCodeAt(index));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + sampleCount * 2, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, sampleCount * 2, true);

    let phase = 0;
    let chirpPhase = 0;
    const twoPi = Math.PI * 2;

    for (let index = 0; index < sampleCount; index += 1) {
      const progress = index / sampleCount;
      const attack = Math.min(1, progress / 0.025);
      const release = Math.min(1, (1 - progress) / 0.64);
      const envelope = Math.sin(Math.min(1, attack) * Math.PI * 0.5) * Math.sin(Math.min(1, release) * Math.PI * 0.5);
      const eased = 1 - (1 - progress) ** 2;
      const freq = config.start + (config.end - config.start) * eased;
      phase += twoPi * freq / sampleRate;
      let sample = Math.sin(phase) * 0.56 + Math.sin(phase * 2.01) * 0.08;

      if (config.ripple) {
        sample += Math.sin(twoPi * config.ripple * progress + Math.sin(progress * twoPi * 5) * 0.7) * 0.08 * (1 - progress);
      }

      if (config.water) {
        const waterEnv = Math.sin(progress * Math.PI) ** 1.45;
        chirpPhase += twoPi * (config.water + 220 * Math.sin(progress * twoPi * 2.2)) / sampleRate;
        sample += Math.sin(chirpPhase) * waterEnv * 0.22;
      }

      if (config.shimmer && progress > 0.18) {
        const shimmerEnv = Math.sin((progress - 0.18) / 0.82 * Math.PI) ** 2;
        sample += Math.sin(twoPi * config.shimmer * progress) * shimmerEnv * 0.1;
      }

      const click = key === "poke" || key === "strong" ? (Math.random() - 0.5) * 0.012 * (1 - progress) : 0;
      const value = Math.max(-1, Math.min(1, (sample + click) * envelope * config.volume));
      view.setInt16(44 + index * 2, value * 32767, true);
    }

    let binary = "";
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }

    return `data:audio/wav;base64,${window.btoa(binary)}`;
  }

  private getSample(key: string) {
    const existing = this.samples.get(key);
    if (existing) {
      return existing;
    }

    const next = this.createWaveDataUri(key);
    if (next) {
      this.samples.set(key, next);
    }
    return next;
  }

  private playHtmlSample(key: string) {
    if (this.muted || typeof Audio === "undefined") {
      return;
    }

    const src = this.getSample(key);
    if (!src) {
      return;
    }

    const audio = new Audio(src);
    audio.volume = key === "prime" ? 0.01 : 0.95;
    audio.preload = "auto";
    void audio.play().catch(() => {
      // Some embedded browsers only allow WebAudio. The oscillator path below still runs.
    });
  }

  private getContext() {
    if (this.context || typeof window === "undefined") {
      return this.context;
    }

    const AudioContextConstructor =
      window.AudioContext ??
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextConstructor) {
      return null;
    }

    this.context = new AudioContextConstructor();
    return this.context;
  }

  private playWhenReady(play: (context: AudioContext) => void) {
    const context = this.getContext();
    if (!context) {
      return;
    }

    if (context.state === "suspended") {
      void context.resume().then(() => {
        if (!this.muted && context.state === "running") {
          play(context);
        }
      });
      return;
    }

    play(context);
  }

  private playTone({
    type = "sine",
    start,
    end,
    duration,
    volume,
    delay = 0,
    filterFrequency = 1100
  }: {
    type?: OscillatorType;
    start: number;
    end: number;
    duration: number;
    volume: number;
    delay?: number;
    filterFrequency?: number;
  }) {
    if (this.muted) {
      return;
    }

    this.playWhenReady((context) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const filter = context.createBiquadFilter();
      const now = context.currentTime + delay + 0.006;
      const variation = 0.94 + Math.random() * 0.12;

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(start * variation, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end * variation), now + duration);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(filterFrequency, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.03);
    });
  }

  private playPop(intensity: PokeIntensity) {
    this.playWhenReady((context) => {
      const oscillator = context.createOscillator();
      const wobble = context.createOscillator();
      const gain = context.createGain();
      const wobbleGain = context.createGain();
      const filter = context.createBiquadFilter();
      const now = context.currentTime + 0.006;
      const variation = 0.94 + Math.random() * 0.12;
      const base = intensity === "strong" ? 620 : 820;
      const end = intensity === "strong" ? 210 : 320;

      oscillator.type = "sine";
      wobble.type = "triangle";
      oscillator.frequency.setValueAtTime(base * variation, now);
      oscillator.frequency.exponentialRampToValueAtTime(end * variation, now + 0.13);
      wobble.frequency.setValueAtTime((base * 1.25 + Math.random() * 80) * variation, now);
      wobble.frequency.exponentialRampToValueAtTime((end * 1.8) * variation, now + 0.18);
      filter.type = "lowpass";
      filter.frequency.value = intensity === "strong" ? 1700 : 2200;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(intensity === "strong" ? 0.045 : 0.034, now + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      wobbleGain.gain.setValueAtTime(0.0001, now);
      wobbleGain.gain.exponentialRampToValueAtTime(intensity === "strong" ? 0.024 : 0.018, now + 0.025);
      wobbleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);
      wobble.connect(wobbleGain);
      wobbleGain.connect(context.destination);
      oscillator.start(now);
      wobble.start(now);
      oscillator.stop(now + 0.14);
      wobble.stop(now + 0.18);
    });
  }

  poke(intensity: PokeIntensity, cue: JellySoundCue = "poke") {
    if (this.muted) {
      return;
    }

    this.playHtmlSample(cue === "poke" ? intensity === "strong" ? "strong" : "poke" : cue);
    this.playPop(intensity);

    if (cue === "excited") {
      this.playTone({ type: "sine", start: 820, end: 1220, duration: 0.1, volume: 0.024, delay: 0.04, filterFrequency: 2400 });
      this.playTone({ type: "sine", start: 1120, end: 1560, duration: 0.13, volume: 0.018, delay: 0.12, filterFrequency: 2800 });
    } else if (cue === "dizzy") {
      this.playTone({ type: "sine", start: 680, end: 300, duration: 0.3, volume: 0.024, delay: 0.03, filterFrequency: 1500 });
      this.playTone({ type: "sine", start: 300, end: 680, duration: 0.28, volume: 0.018, delay: 0.12, filterFrequency: 1500 });
    } else if (cue === "annoyed") {
      this.playTone({ type: "sine", start: 360, end: 170, duration: 0.18, volume: 0.018, delay: 0.03, filterFrequency: 850 });
    } else if (cue === "blush" || cue === "curious") {
      this.playTone({ type: "sine", start: 920, end: 1280, duration: 0.11, volume: 0.016, delay: 0.06, filterFrequency: 2600 });
    } else if (cue === "wake") {
      this.cue("wake");
    }
  }

  cue(cue: JellySoundCue) {
    if (this.muted) {
      return;
    }

    this.playHtmlSample(cue);

    if (cue === "press") {
      this.playTone({ type: "sine", start: 520, end: 180, duration: 0.24, volume: 0.02, filterFrequency: 1200 });
      return;
    }

    if (cue === "sleepy") {
      this.playTone({ type: "sine", start: 320, end: 250, duration: 0.28, volume: 0.018, filterFrequency: 900 });
      this.playTone({ type: "sine", start: 260, end: 205, duration: 0.34, volume: 0.014, delay: 0.2, filterFrequency: 800 });
      return;
    }

    if (cue === "wake") {
      this.playTone({ type: "sine", start: 620, end: 980, duration: 0.12, volume: 0.02, filterFrequency: 2200 });
      this.playTone({ type: "sine", start: 980, end: 1460, duration: 0.16, volume: 0.018, delay: 0.1, filterFrequency: 2800 });
      return;
    }

    if (cue === "annoyed") {
      this.playTone({ type: "sine", start: 340, end: 150, duration: 0.2, volume: 0.016, filterFrequency: 820 });
    }
  }

  release(power: number) {
    if (this.muted) {
      return;
    }

    const clamped = Math.min(Math.max(power, 0), 1);
    this.playHtmlSample("release");

    this.playWhenReady((context) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const now = context.currentTime + 0.006;
      const variation = 0.95 + Math.random() * 0.1;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime((480 + clamped * 160) * variation, now);
      oscillator.frequency.exponentialRampToValueAtTime((980 + clamped * 260) * variation, now + 0.11);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.028 + clamped * 0.024, now + 0.016);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.17);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.18);
    });

    if (clamped > 0.55) {
      this.playTone({ type: "sine", start: 980 + clamped * 80, end: 1460 + clamped * 150, duration: 0.14, volume: 0.014, delay: 0.1, filterFrequency: 3000 });
    }
  }
}
