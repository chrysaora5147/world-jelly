"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { JellySoundCue } from "@/services/audio";
import type { PokeIntensity } from "@/types/jelly";

type WorldJellyProps = {
  sessionPokes: number;
  onPoke: (intensity: PokeIntensity, cue: JellySoundCue) => void;
  onRelease: (power: number) => void;
  onPrimeSound: () => void;
  onSound: (cue: JellySoundCue) => void;
};

export type JellyReaction =
  | "default"
  | "surprised"
  | "excited"
  | "squished"
  | "annoyed"
  | "dizzy"
  | "sleepy"
  | "blush"
  | "curious";

type Reaction = JellyReaction;
type Direction = "center" | "left" | "right" | "top" | "bottom";
type AnimationFlow = "idle" | "poke" | "press" | "release" | "spam" | "wake";

type LocalPoint = {
  x: number;
  y: number;
};

type Particle = {
  id: number;
  x: number;
  y: number;
  kind: "bubble" | "sparkle" | "star" | "z";
  angle: number;
};

const reactionDuration: Record<Reaction, number> = {
  default: 0,
  surprised: 760,
  excited: 1060,
  squished: 980,
  annoyed: 2400,
  dizzy: 1800,
  sleepy: 0,
  blush: 1200,
  curious: 900
};

const reactionPriority: Record<Reaction, number> = {
  dizzy: 9,
  annoyed: 8,
  squished: 7,
  surprised: 6,
  excited: 5,
  blush: 4,
  curious: 3,
  default: 2,
  sleepy: 1
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const chooseWeighted = (choices: Array<[Reaction, number]>, recent: Reaction[]) => {
  const adjusted = choices.map(([reaction, weight]) => [reaction, recent.includes(reaction) ? weight * 0.24 : weight] as const);
  const total = adjusted.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = Math.random() * total;

  for (const [reaction, weight] of adjusted) {
    cursor -= weight;
    if (cursor <= 0) {
      return reaction;
    }
  }

  return adjusted[0][0];
};

const directionFromPoint = ({ x, y }: LocalPoint): Direction => {
  if (y < 35) {
    return "top";
  }
  if (y > 72) {
    return "bottom";
  }
  if (x < 38) {
    return "left";
  }
  if (x > 62) {
    return "right";
  }
  return "center";
};

function GlossyEye({ cx, cy = 51.2, rx = 5.7, ry = 7.6 }: { cx: number; cy?: number; rx?: number; ry?: number }) {
  return (
    <>
      <ellipse className="jelly-face-eye-rim" cx={cx} cy={cy} rx={rx * 1.08} ry={ry * 1.08} />
      <ellipse className="jelly-face-eye" cx={cx} cy={cy} rx={rx} ry={ry} />
      <ellipse className="jelly-face-eye-depth" cx={cx + rx * 0.18} cy={cy + ry * 0.34} rx={rx * 0.58} ry={ry * 0.3} />
      <ellipse className="jelly-face-eye-gloss" cx={cx - rx * 0.34} cy={cy - ry * 0.44} rx={rx * 0.42} ry={ry * 0.33} />
      <circle className="jelly-face-eye-spark" cx={cx + rx * 0.34} cy={cy + ry * 0.2} r={rx * 0.17} />
      <circle className="jelly-face-eye-spark jelly-face-eye-spark-small" cx={cx - rx * 0.16} cy={cy + ry * 0.54} r={rx * 0.1} />
    </>
  );
}

function LegacyFaceParts({ reaction }: { reaction: Reaction }) {
  const cheekOpacity = reaction === "sleepy" || reaction === "annoyed" ? 0.72 : 1;
  const cheekScale = reaction === "blush" ? 1.22 : reaction === "excited" ? 1.08 : 1;

  return (
    <>
      <defs>
        <radialGradient id="jellyEyeGloss" cx="34%" cy="27%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="20%" stopColor="#fbffff" />
          <stop offset="23%" stopColor="#143da6" />
          <stop offset="57%" stopColor="#061764" />
          <stop offset="100%" stopColor="#020622" />
        </radialGradient>
        <radialGradient id="jellyEyeDepth" cx="54%" cy="68%" r="48%">
          <stop offset="0%" stopColor="#16a8ff" stopOpacity="0.64" />
          <stop offset="72%" stopColor="#0a217b" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#061247" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="jellyMouthGloss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#071045" />
          <stop offset="72%" stopColor="#030617" />
        </linearGradient>
        <linearGradient id="jellyTongueGloss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff82b4" />
          <stop offset="100%" stopColor="#ff4d91" />
        </linearGradient>
        <filter id="jellyCheekGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="2.7" />
        </filter>
      </defs>

      <g className="jelly-face-cheeks" opacity={cheekOpacity}>
        <ellipse className="jelly-face-cheek" cx="21.2" cy="60.8" rx={6.6 * cheekScale} ry={4.2 * cheekScale} />
        <ellipse className="jelly-face-cheek" cx="78.8" cy="60.8" rx={6.6 * cheekScale} ry={4.2 * cheekScale} />
        <ellipse className="jelly-face-cheek-shine" cx="19.7" cy="59.4" rx={1.35 * cheekScale} ry={0.5 * cheekScale} />
        <ellipse className="jelly-face-cheek-shine" cx="77.3" cy="59.4" rx={1.35 * cheekScale} ry={0.5 * cheekScale} />
      </g>

      {reaction === "surprised" && (
        <>
          <g className="jelly-face-left-eye">
            <GlossyEye cx={33.6} cy={50.8} rx={6.25} ry={8.25} />
          </g>
          <g className="jelly-face-right-eye">
            <GlossyEye cx={66.4} cy={50.8} rx={6.25} ry={8.25} />
          </g>
          <g className="jelly-face-mouth">
            <ellipse className="jelly-face-mouth-fill" cx="50" cy="64.4" rx="2.6" ry="4.05" />
            <ellipse className="jelly-face-tongue" cx="50" cy="66.1" rx="1.45" ry="1.05" />
          </g>
        </>
      )}

      {reaction === "excited" && (
        <>
          <g className="jelly-face-left-eye">
            <path className="jelly-face-line jelly-face-thick" d="M29.6 54 L43.2 48 L30.2 43" />
            <path className="jelly-face-shine-line" d="M32.2 44.2 L40.1 47.7" />
          </g>
          <g className="jelly-face-right-eye">
            <path className="jelly-face-line jelly-face-thick" d="M70.4 54 L56.8 48 L69.8 43" />
            <path className="jelly-face-shine-line" d="M67.8 44.2 L59.9 47.7" />
          </g>
          <g className="jelly-face-mouth">
            <path className="jelly-face-mouth-fill" d="M42.5 59 Q50 69 57.5 59 Q50 62.8 42.5 59Z" />
            <path className="jelly-face-tongue" d="M45.8 63 Q50 66.2 54.2 63 Q50 65 45.8 63Z" />
          </g>
        </>
      )}

      {reaction === "squished" && (
        <>
          <g className="jelly-face-left-eye">
            <path className="jelly-face-line jelly-face-thick" d="M41.9 45.5 L29.5 51.6 L41.9 57.7" />
          </g>
          <g className="jelly-face-right-eye">
            <path className="jelly-face-line jelly-face-thick" d="M58.1 45.5 L70.5 51.6 L58.1 57.7" />
          </g>
          <g className="jelly-face-mouth">
            <path className="jelly-face-line jelly-face-soft-line" d="M43.4 62.5 C45.8 58.8 48.3 66.2 50.3 62.5 C52.5 58.7 54.9 66.2 57.3 62.5" />
          </g>
        </>
      )}

      {reaction === "annoyed" && (
        <>
          <g className="jelly-face-left-eye">
            <path className="jelly-face-eye-fill" d="M29 51.6 Q36.4 47.5 43.3 50.6 Q36.5 56.2 29 51.6Z" />
            <path className="jelly-face-line jelly-face-brow" d="M29.8 45.1 L43.4 43.8" />
            <ellipse className="jelly-face-shine" cx="33.5" cy="50.3" rx="1.1" ry="0.72" />
          </g>
          <g className="jelly-face-right-eye">
            <path className="jelly-face-eye-fill" d="M56.7 50.6 Q63.6 47.5 71 51.6 Q63.5 56.2 56.7 50.6Z" />
            <path className="jelly-face-line jelly-face-brow" d="M56.6 43.8 L70.2 45.1" />
            <ellipse className="jelly-face-shine" cx="60.4" cy="50.3" rx="1.1" ry="0.72" />
          </g>
          <g className="jelly-face-mouth">
            <path className="jelly-face-line" d="M43.8 64.2 Q50 58.5 56.2 64.2" />
          </g>
        </>
      )}

      {reaction === "dizzy" && (
        <>
          <g className="jelly-face-left-eye">
            <path className="jelly-face-line jelly-face-spiral" d="M34.2 46 C27.8 46 27.8 58.1 34.2 58.1 C39.5 58.1 39.3 50.8 34.2 50.8 C31.5 50.8 31.3 54.2 34.2 54.2" />
          </g>
          <g className="jelly-face-right-eye">
            <path className="jelly-face-line jelly-face-spiral" d="M65.8 46 C72.2 46 72.2 58.1 65.8 58.1 C60.5 58.1 60.7 50.8 65.8 50.8 C68.5 50.8 68.7 54.2 65.8 54.2" />
          </g>
          <g className="jelly-face-mouth">
            <ellipse className="jelly-face-mouth-fill jelly-face-small-mouth" cx="50" cy="64.1" rx="2.05" ry="2.75" />
            <ellipse className="jelly-face-tongue" cx="50" cy="65.2" rx="1.12" ry="0.72" />
          </g>
        </>
      )}

      {reaction === "sleepy" && (
        <>
          <g className="jelly-face-left-eye">
            <path className="jelly-face-line jelly-face-soft-line" d="M29.2 52.6 Q35.2 55.8 41.2 52.6" />
          </g>
          <g className="jelly-face-right-eye">
            <path className="jelly-face-line jelly-face-soft-line" d="M58.8 52.6 Q64.8 55.8 70.8 52.6" />
          </g>
          <g className="jelly-face-mouth">
            <ellipse className="jelly-face-mouth-fill jelly-face-small-mouth" cx="50" cy="65.3" rx="1.65" ry="2.25" />
            <ellipse className="jelly-face-tongue" cx="50" cy="66" rx="0.85" ry="0.52" />
          </g>
        </>
      )}

      {reaction === "curious" && (
        <>
          <g className="jelly-face-left-eye">
            <GlossyEye cx={32.2} cy={51.5} rx={6.4} ry={8.5} />
          </g>
          <g className="jelly-face-right-eye">
            <GlossyEye cx={67.8} cy={49.8} rx={6.4} ry={8.5} />
          </g>
          <g className="jelly-face-mouth">
            <path className="jelly-face-line jelly-face-soft-line" d="M42.9 61.2 C42.9 65.2 48.1 65.2 49.7 61.9 C51.3 65.2 56.5 65.2 56.5 61.2" />
          </g>
        </>
      )}

      {(reaction === "default" || reaction === "blush") && (
        <>
          <g className="jelly-face-left-eye">
            <GlossyEye cx={32.7} cy={50.8} />
          </g>
          <g className="jelly-face-right-eye">
            <GlossyEye cx={67.3} cy={50.8} />
          </g>
          <g className="jelly-face-mouth">
            <path className="jelly-face-line jelly-face-soft-line" d="M42.7 60.2 C42.7 64.6 48.4 64.6 50 60.9 C51.6 64.6 57.3 64.6 57.3 60.2" />
          </g>
        </>
      )}
    </>
  );
}

function RedesignedFaceParts({ reaction }: { reaction: Reaction }) {
  const cheekOpacity = reaction === "sleepy" || reaction === "annoyed" ? 0.76 : 1;
  const cheekScale = reaction === "blush" ? 1.28 : reaction === "excited" ? 1.08 : 1;

  return (
    <>
      <defs>
        <radialGradient id="jellyEyeGloss" cx="34%" cy="27%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="20%" stopColor="#fbffff" />
          <stop offset="23%" stopColor="#143da6" />
          <stop offset="57%" stopColor="#061764" />
          <stop offset="100%" stopColor="#020622" />
        </radialGradient>
        <radialGradient id="jellyEyeDepth" cx="54%" cy="68%" r="48%">
          <stop offset="0%" stopColor="#16a8ff" stopOpacity="0.64" />
          <stop offset="72%" stopColor="#0a217b" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#061247" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="jellyMouthGloss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#071045" />
          <stop offset="72%" stopColor="#030617" />
        </linearGradient>
        <linearGradient id="jellyTongueGloss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff82b4" />
          <stop offset="100%" stopColor="#ff4d91" />
        </linearGradient>
        <filter id="jellyCheekGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="2.7" />
        </filter>
      </defs>

      <g className="jelly-face-cheeks" opacity={cheekOpacity}>
        <ellipse className="jelly-face-cheek" cx="20.4" cy="60.4" rx={6.7 * cheekScale} ry={3.55 * cheekScale} />
        <ellipse className="jelly-face-cheek" cx="79.6" cy="60.4" rx={6.7 * cheekScale} ry={3.55 * cheekScale} />
        <ellipse className="jelly-face-cheek-shine" cx="18.7" cy="59" rx={1.25 * cheekScale} ry={0.45 * cheekScale} />
        <ellipse className="jelly-face-cheek-shine" cx="77.9" cy="59" rx={1.25 * cheekScale} ry={0.45 * cheekScale} />
      </g>

      {reaction === "surprised" && (
        <>
          <g className="jelly-face-emote jelly-face-surprise-lines">
            <path d="M15.2 37.6 L10.6 31.6" />
            <path d="M19.7 34 L18 27.8" />
            <path d="M23.8 35.8 L27.5 30.5" />
          </g>
          <g className="jelly-face-left-eye">
            <GlossyEye cx={33.2} cy={50.9} rx={5.9} ry={7.9} />
          </g>
          <g className="jelly-face-right-eye">
            <GlossyEye cx={66.8} cy={50.9} rx={5.9} ry={7.9} />
          </g>
          <g className="jelly-face-mouth">
            <ellipse className="jelly-face-mouth-fill" cx="50" cy="64.5" rx="3" ry="4.9" />
            <ellipse className="jelly-face-tongue" cx="50" cy="66.8" rx="1.65" ry="1.25" />
          </g>
        </>
      )}

      {reaction === "excited" && (
        <>
          <g className="jelly-face-emote jelly-face-joy-lines">
            <path d="M15.2 38.8 L8.8 33.4" />
            <path d="M18.8 35.2 L16.2 27.6" />
            <path d="M84.8 38.8 L91.2 33.4" />
            <path d="M81.2 35.2 L83.8 27.6" />
          </g>
          <g className="jelly-face-left-eye">
            <path className="jelly-face-line jelly-face-thick" d="M30.5 54.4 L42.7 49.2 L30.5 44.2" />
          </g>
          <g className="jelly-face-right-eye">
            <path className="jelly-face-line jelly-face-thick" d="M69.5 54.4 L57.3 49.2 L69.5 44.2" />
          </g>
          <g className="jelly-face-mouth">
            <path className="jelly-face-mouth-fill" d="M43.5 58.7 Q50 69.8 56.5 58.7 Q50 62.3 43.5 58.7Z" />
            <path className="jelly-face-tongue" d="M46.5 63 Q50 66.6 53.5 63 Q50 65.2 46.5 63Z" />
          </g>
        </>
      )}

      {reaction === "squished" && (
        <>
          <g className="jelly-face-emote jelly-face-heart-mark">
            <path d="M12.8 40 C9.5 35.8 3.5 39.5 7 44.6 C9 47.5 12.8 50.5 12.8 50.5 C12.8 50.5 16.6 47.5 18.6 44.6 C22.1 39.5 16.1 35.8 12.8 40Z" />
          </g>
          <g className="jelly-face-left-eye">
            <path className="jelly-face-line jelly-face-thick" d="M41.7 46 L30.2 51.6 L41.7 57.2" />
          </g>
          <g className="jelly-face-right-eye">
            <path className="jelly-face-line jelly-face-thick" d="M58.3 46 L69.8 51.6 L58.3 57.2" />
          </g>
          <g className="jelly-face-mouth">
            <path className="jelly-face-line" d="M43.9 65.1 Q50 59.4 56.1 65.1" />
          </g>
        </>
      )}

      {reaction === "annoyed" && (
        <>
          <g className="jelly-face-emote jelly-face-puff-mark">
            <path d="M12.7 39 C8.3 35 10.6 28.8 16.7 30.2 C19.5 25.2 27.5 27.2 27.7 33.2 C33.1 33.7 34.6 40.7 29.5 43.3" />
            <path d="M29.5 43.3 L33.2 46.8" />
          </g>
          <g className="jelly-face-left-eye">
            <path className="jelly-face-eye-fill" d="M29.2 51.9 Q36.2 47.6 43.2 50.8 Q36.2 55.8 29.2 51.9Z" />
            <path className="jelly-face-line jelly-face-brow" d="M29.2 45.5 L43.7 43.7" />
            <ellipse className="jelly-face-shine" cx="33.2" cy="50.2" rx="1.05" ry="0.66" />
          </g>
          <g className="jelly-face-right-eye">
            <path className="jelly-face-eye-fill" d="M56.8 50.8 Q63.8 47.6 70.8 51.9 Q63.8 55.8 56.8 50.8Z" />
            <path className="jelly-face-line jelly-face-brow" d="M56.3 43.7 L70.8 45.5" />
            <ellipse className="jelly-face-shine" cx="60.1" cy="50.2" rx="1.05" ry="0.66" />
          </g>
          <g className="jelly-face-mouth">
            <path className="jelly-face-line jelly-face-knot-mouth" d="M46.2 64 L49.2 61.6 L50.8 64 L53.8 61.6" />
          </g>
        </>
      )}

      {reaction === "dizzy" && (
        <>
          <g className="jelly-face-emote jelly-face-dizzy-marks">
            <path d="M16 34 C22 28 30 35 22 41 C15 45 13 36 20 36" />
            <path d="M83.8 35 C91.8 28 96.5 39.5 88 43.2 C82.3 45.7 82.2 38.8 87.2 38.2" />
          </g>
          <g className="jelly-face-left-eye">
            <path className="jelly-face-line jelly-face-spiral" d="M34.2 45.6 C27.5 45.6 27.5 58.4 34.2 58.4 C39.9 58.4 39.6 50.7 34.2 50.7 C31.4 50.7 31.2 54.2 34.2 54.2" />
          </g>
          <g className="jelly-face-right-eye">
            <path className="jelly-face-line jelly-face-spiral" d="M65.8 45.6 C72.5 45.6 72.5 58.4 65.8 58.4 C60.1 58.4 60.4 50.7 65.8 50.7 C68.6 50.7 68.8 54.2 65.8 54.2" />
          </g>
          <g className="jelly-face-mouth">
            <ellipse className="jelly-face-mouth-fill jelly-face-small-mouth" cx="50" cy="64.2" rx="2.25" ry="3" />
          </g>
        </>
      )}

      {reaction === "sleepy" && (
        <>
          <g className="jelly-face-emote jelly-face-z-mark">
            <path d="M11.5 32 H19 L11.5 41 H19" />
            <path d="M20.8 43 H26.4 L20.8 49.6 H26.4" />
          </g>
          <g className="jelly-face-left-eye">
            <path className="jelly-face-line jelly-face-soft-line" d="M29.4 53 Q35.1 56.2 40.8 53" />
          </g>
          <g className="jelly-face-right-eye">
            <path className="jelly-face-line jelly-face-soft-line" d="M59.2 53 Q64.9 56.2 70.6 53" />
          </g>
          <g className="jelly-face-mouth">
            <ellipse className="jelly-face-mouth-fill jelly-face-small-mouth" cx="50" cy="66" rx="1.75" ry="2.5" />
            <ellipse className="jelly-face-tongue" cx="50" cy="66.9" rx="0.9" ry="0.55" />
          </g>
        </>
      )}

      {reaction === "blush" && (
        <>
          <g className="jelly-face-emote jelly-face-blush-hearts">
            <path d="M14 37 C11.5 33.5 6.5 36 9.2 40.3 C10.8 42.7 14 45.2 14 45.2 C14 45.2 17.2 42.7 18.8 40.3 C21.5 36 16.5 33.5 14 37Z" />
            <path d="M19.5 29.4 C17.8 27 14.4 28.8 16.2 31.7 C17.3 33.4 19.5 35.1 19.5 35.1 C19.5 35.1 21.7 33.4 22.8 31.7 C24.6 28.8 21.2 27 19.5 29.4Z" />
          </g>
          <g className="jelly-face-left-eye">
            <GlossyEye cx={33.3} cy={51.1} rx={5.85} ry={7.8} />
          </g>
          <g className="jelly-face-right-eye">
            <GlossyEye cx={66.7} cy={51.1} rx={5.85} ry={7.8} />
          </g>
          <g className="jelly-face-blush-stripes">
            <path d="M21.8 64.6 L24.1 61.3" />
            <path d="M26 65.4 L28.4 62" />
            <path d="M73.9 62 L76.2 65.4" />
            <path d="M78.2 61.3 L80.5 64.6" />
          </g>
          <g className="jelly-face-mouth">
            <path className="jelly-face-line jelly-face-knot-mouth" d="M46.4 64.2 L49.3 61.8 L50.7 64.2 L53.6 61.8" />
          </g>
        </>
      )}

      {reaction === "curious" && (
        <>
          <g className="jelly-face-emote jelly-face-star-mark">
            <path d="M15.4 30.5 L18.2 37.8 L25.7 40.5 L18.2 43.2 L15.4 50.5 L12.7 43.2 L5.2 40.5 L12.7 37.8Z" />
          </g>
          <g className="jelly-face-left-eye">
            <GlossyEye cx={32.8} cy={51.2} rx={5.9} ry={7.9} />
          </g>
          <g className="jelly-face-right-eye">
            <path className="jelly-face-line jelly-face-thick" d="M59.8 49 Q65 54.6 70.4 49" />
          </g>
          <g className="jelly-face-mouth">
            <path className="jelly-face-line jelly-face-soft-line" d="M44 60.7 C44 64.8 48.8 64.9 50 61.6 C51.2 64.4 54.8 64.5 56.2 61.6" />
            <path className="jelly-face-tongue" d="M49.4 64.1 Q52 69.2 55 64.1 Q52.2 66.2 49.4 64.1Z" />
          </g>
        </>
      )}

      {reaction === "default" && (
        <>
          <g className="jelly-face-left-eye">
            <GlossyEye cx={32.7} cy={50.8} />
          </g>
          <g className="jelly-face-right-eye">
            <GlossyEye cx={67.3} cy={50.8} />
          </g>
          <g className="jelly-face-mouth">
            <path className="jelly-face-line jelly-face-soft-line" d="M42.7 60.2 C42.7 64.6 48.4 64.6 50 60.9 C51.6 64.6 57.3 64.6 57.3 60.2" />
          </g>
        </>
      )}
    </>
  );
}

const faceAssetMap: Partial<Record<Reaction, string>> = {
  default: "/world-jelly-faces/default.png",
  excited: "/world-jelly-faces/excited.png",
  squished: "/world-jelly-faces/squished.png",
  annoyed: "/world-jelly-faces/annoyed.png",
  dizzy: "/world-jelly-faces/dizzy.png",
  sleepy: "/world-jelly-faces/sleepy.png",
  blush: "/world-jelly-faces/blush.png",
  curious: "/world-jelly-faces/curious.png"
};

function AssetFaceParts({ reaction }: { reaction: Reaction }) {
  const src = faceAssetMap[reaction];

  if (!src) {
    return <RedesignedFaceParts reaction={reaction} />;
  }

  return <image className="jelly-face-asset" href={src} x="-2" y="-2" width="104" height="104" preserveAspectRatio="xMidYMid meet" />;
}

const faceBanks = {
  legacy: LegacyFaceParts,
  redesign: RedesignedFaceParts,
  assets: AssetFaceParts
};

const ActiveFaceParts = faceBanks.assets;

function FaceParts({ reaction }: { reaction: Reaction }) {
  return <ActiveFaceParts reaction={reaction} />;
}

export function WorldJelly({ sessionPokes, onPoke, onRelease, onPrimeSound, onSound }: WorldJellyProps) {
  const shouldReduceMotion = useReducedMotion();
  const shellRef = useRef<HTMLButtonElement | null>(null);
  const recentPokes = useRef<number[]>([]);
  const reactionHistory = useRef<Reaction[]>([]);
  const idleTimer = useRef<number | null>(null);
  const returnTimer = useRef<number | null>(null);
  const holdTimer = useRef<number | null>(null);
  const longHoldTimer = useRef<number | null>(null);
  const particleId = useRef(0);
  const pressStartedAt = useRef(0);
  const lastInteractionAt = useRef(typeof performance === "undefined" ? 0 : performance.now());
  const localPokes = useRef(0);
  const [reaction, setReaction] = useState<Reaction>("default");
  const [direction, setDirection] = useState<Direction>("center");
  const [pokePoint, setPokePoint] = useState<LocalPoint>({ x: 50, y: 52 });
  const [isPressed, setPressed] = useState(false);
  const [animationFlow, setAnimationFlow] = useState<AnimationFlow>("idle");
  const [sequence, setSequence] = useState(0);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [isTouchLike, setTouchLike] = useState(false);

  const clearHoldTimers = useCallback(() => {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (longHoldTimer.current) {
      window.clearTimeout(longHoldTimer.current);
      longHoldTimer.current = null;
    }
  }, []);

  const setReactionSafely = useCallback(
    (next: Reaction, options?: { force?: boolean; duration?: number }) => {
      setReaction((current) => {
        if (!options?.force && reactionPriority[next] < reactionPriority[current]) {
          return current;
        }
        return next;
      });
      setSequence((value) => value + 1);
      reactionHistory.current = [next, ...reactionHistory.current.filter((item) => item !== next)].slice(0, 2);

      if (returnTimer.current) {
        window.clearTimeout(returnTimer.current);
      }

      const duration = options?.duration ?? reactionDuration[next];
      if (duration > 0) {
        returnTimer.current = window.setTimeout(() => setReaction("default"), shouldReduceMotion ? Math.min(duration, 220) : duration);
      }
    },
    [shouldReduceMotion]
  );

  const scheduleSleepy = useCallback(() => {
    if (idleTimer.current) {
      window.clearTimeout(idleTimer.current);
    }
    idleTimer.current = window.setTimeout(() => {
      setReactionSafely("sleepy", { force: true });
      onSound("sleepy");
      if (!shouldReduceMotion) {
        setParticles((items) => [
          ...items.slice(-10),
          { id: particleId.current++, x: 66, y: 22, kind: "z", angle: -Math.PI / 2 }
        ]);
      }
    }, shouldReduceMotion ? 60000 : 52000);
  }, [onSound, setReactionSafely, shouldReduceMotion]);

  useEffect(() => {
    scheduleSleepy();
    return () => {
      if (idleTimer.current) {
        window.clearTimeout(idleTimer.current);
      }
      if (returnTimer.current) {
        window.clearTimeout(returnTimer.current);
      }
      clearHoldTimers();
    };
  }, [clearHoldTimers, scheduleSleepy]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ reaction?: Reaction; duration?: number }>).detail;
      if (detail?.reaction) {
        setReactionSafely(detail.reaction, {
          force: true,
          duration: detail.duration ?? (detail.reaction === "default" || detail.reaction === "sleepy" ? 0 : 1600)
        });
      }
    };
    window.addEventListener("world-jelly:set-reaction", handler);
    return () => window.removeEventListener("world-jelly:set-reaction", handler);
  }, [setReactionSafely]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(hover: none), (pointer: coarse), (max-width: 680px)");
    const update = () => setTouchLike(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  const localFromPointer = (clientX: number, clientY: number) => {
    const rect = shellRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: 50, y: 52 };
    }

    return {
      x: clamp(((clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((clientY - rect.top) / rect.height) * 100, 0, 100)
    };
  };

  const addParticles = useCallback(
    (point: LocalPoint, kind: Particle["kind"], count: number) => {
      if (shouldReduceMotion) {
        return;
      }
      const particleCount = isTouchLike ? Math.min(count, 2) : count;
      setParticles((items) => [
        ...items.slice(isTouchLike ? -6 : -16),
        ...Array.from({ length: particleCount }, (_, index) => ({
          id: particleId.current++,
          x: point.x + (Math.random() - 0.5) * (isTouchLike ? 6 : 10),
          y: point.y + (Math.random() - 0.5) * (isTouchLike ? 5 : 8),
          kind,
          angle: Math.PI * 2 * ((index + Math.random()) / Math.max(particleCount, 1))
        }))
      ]);
    },
    [isTouchLike, shouldReduceMotion]
  );

  const pickReaction = (point: LocalPoint, recentCount: number, nextDirection: Direction) => {
    localPokes.current += 1;
    const idleGap = performance.now() - lastInteractionAt.current;
    const nearFace = point.x > 33 && point.x < 67 && point.y > 38 && point.y < 64;

    if (reaction === "sleepy") {
      return "surprised";
    }
    if (recentCount >= 13) {
      return "dizzy";
    }
    if (recentCount >= 8) {
      return "annoyed";
    }
    if (nextDirection === "top") {
      return "squished";
    }
    if (localPokes.current % 10 === 0 || sessionPokes > 0 && (sessionPokes + 1) % 10 === 0) {
      return "excited";
    }
    if (idleGap > 9000 || nearFace && Math.random() < 0.48) {
      return "surprised";
    }

    return chooseWeighted(
      [
        ["default", 58],
        ["surprised", 14],
        ["blush", 11],
        ["curious", 10],
        ["excited", 7]
      ],
      reactionHistory.current
    );
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    onPrimeSound();
    const point = localFromPointer(event.clientX, event.clientY);
    const nextDirection = directionFromPoint(point);
    const now = performance.now();
    recentPokes.current = [...recentPokes.current.filter((time) => now - time < 2000), now];
    const next = pickReaction(point, recentPokes.current.length, nextDirection);
    const intensity: PokeIntensity = next === "annoyed" || next === "dizzy" || recentPokes.current.length >= 5 ? "strong" : "soft";
    const nextFlow: AnimationFlow =
      reaction === "sleepy"
        ? "wake"
        : recentPokes.current.length >= 8
          ? "spam"
          : nextDirection === "top"
            ? "press"
            : "poke";
    const soundCue: JellySoundCue =
      reaction === "sleepy"
        ? "wake"
        : next === "dizzy"
          ? "dizzy"
          : next === "annoyed"
            ? "annoyed"
            : next === "excited"
              ? "excited"
              : next === "blush"
                ? "blush"
                : next === "curious"
                  ? "curious"
                  : nextDirection === "top"
                    ? "press"
                    : "poke";

    lastInteractionAt.current = now;
    pressStartedAt.current = now;
    setPressed(true);
    setAnimationFlow(nextFlow);
    setPokePoint(point);
    setDirection(nextDirection);
    setReactionSafely(next, { force: true });
    clearHoldTimers();
    holdTimer.current = window.setTimeout(() => {
      setAnimationFlow("press");
      setDirection((current) => current === "center" ? "top" : current);
      setReactionSafely("squished", { force: true, duration: 1100 });
      onSound("press");
      addParticles({ x: point.x, y: point.y }, "bubble", 2);
    }, shouldReduceMotion ? 900 : 360);
    longHoldTimer.current = window.setTimeout(() => {
      setAnimationFlow("spam");
      setReactionSafely("annoyed", { force: true, duration: 1700 });
      onSound("annoyed");
      addParticles({ x: 50, y: 28 }, "star", 3);
    }, shouldReduceMotion ? 1600 : 1150);
    addParticles(
      next === "dizzy" || next === "annoyed" ? { x: 50, y: 28 } : point,
      next === "dizzy" || next === "annoyed" ? "star" : next === "excited" ? "sparkle" : "bubble",
      next === "default" ? 1 : next === "dizzy" || next === "annoyed" ? 4 : 3
    );
    onPoke(intensity, soundCue);

    if (intensity === "strong" && typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(next === "dizzy" ? 18 : 12);
    }
    scheduleSleepy();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (isTouchLike && !isPressed) {
      return;
    }

    const point = localFromPointer(event.clientX, event.clientY);

    if (!isPressed && reaction !== "sleepy" && reactionPriority[reaction] <= reactionPriority.curious) {
      setPokePoint(point);
      setDirection(directionFromPoint(point));
    }

    if (isPressed) {
      setPokePoint(point);
      setDirection(directionFromPoint(point));
      if (point.y < 32 || point.y > 74) {
        setReactionSafely("squished", { force: reaction !== "dizzy" });
      }
    }
  };

  const handleRelease = () => {
    const held = performance.now() - pressStartedAt.current;
    const power = clamp(held / 800, 0, 1);
    clearHoldTimers();
    setPressed(false);
    setAnimationFlow("release");
    setSequence((value) => value + 1);
    onRelease(power);
    if (held > 1100 && reaction !== "dizzy") {
      setReactionSafely("annoyed", { force: true, duration: 1400 });
    } else if (held > 420 && reaction !== "dizzy") {
      setReactionSafely("squished", { force: true, duration: 780 });
    }
    scheduleSleepy();
  };

  const bodyAnimate = useMemo(() => {
    const side = direction === "left" ? 1 : direction === "right" ? -1 : 0;
    const down = direction === "top" || reaction === "squished";
    const up = direction === "bottom";
    const short = shouldReduceMotion;
    const soft = isTouchLike;

    if (short) {
      return { scaleX: 1, scaleY: 1, x: 0, y: 0, rotate: 0 };
    }
    if (soft && animationFlow === "press" && isPressed) {
      return {
        scaleX: [1, 1.035, 1.075],
        scaleY: [1, 0.955, 0.89],
        y: [0, 6, 12],
        x: [0, side * 2, side * 4],
        rotate: [0, side * 0.25, side * 0.45]
      };
    }
    if (soft && animationFlow === "poke" && isPressed) {
      return {
        scaleX: [1, 1.055, 0.982, 1.024, 1],
        scaleY: [1, 0.925, 1.055, 0.985, 1],
        x: [0, side * 5, side * -2, side, 0],
        y: [0, 8, -8, 3, 0],
        rotate: [0, side * 0.5, side * -0.7, side * 0.25, 0]
      };
    }
    if (soft && animationFlow === "release") {
      return {
        scaleX: [1, 0.972, 1.064, 0.99, 1],
        scaleY: [1, 1.058, 0.918, 1.028, 1],
        x: [0, side * -3, side * 2, 0],
        y: [0, -10, 5, 0],
        rotate: [0, side * -0.65, side * 0.42, 0]
      };
    }
    if (soft && (animationFlow === "spam" || reaction === "dizzy" || reaction === "annoyed")) {
      return {
        scaleX: [1, 1.018, 0.99, 1.016, 1],
        scaleY: [1, 0.982, 1.018, 0.99, 1],
        x: [0, -4, 5, -2, 0],
        y: [0, 2, -2, 1, 0],
        rotate: [0, -0.8, 0.9, -0.35, 0]
      };
    }
    if (animationFlow === "wake") {
      return {
        scaleX: [1, 0.98, 1.035, 0.99, 1.012, 1],
        scaleY: [1, 1.02, 0.965, 1.035, 0.99, 1],
        y: [0, 4, -12, 4, -2, 0],
        rotate: [0, side * -0.5, side * 0.9, side * -0.4, 0]
      };
    }
    if (animationFlow === "spam" || reaction === "dizzy" || reaction === "annoyed") {
      return {
        scaleX: [1, 1.035, 0.982, 1.04, 0.99, 1.016, 1],
        scaleY: [1, 0.955, 1.035, 0.965, 1.022, 0.99, 1],
        x: [0, -10, 11, -8, 7, -3, 0],
        y: [0, 5, -4, 4, -3, 1, 0],
        rotate: [0, -2.4, 2.8, -2, 1.5, -0.6, 0]
      };
    }
    if (animationFlow === "press" && isPressed) {
      return {
        scaleX: [1, 1.055, 1.16],
        scaleY: [1, 0.92, 0.77],
        y: [0, 10, 24],
        x: [0, side * 4, side * 8],
        rotate: [0, side * 0.6, side * 1.2]
      };
    }
    if (animationFlow === "poke" && isPressed) {
      return {
        scaleX: [1, side ? 0.968 : 1.035, 1.13, 0.948, 1.052, 1],
        scaleY: [1, side ? 1.025 : 0.955, 0.82, 1.14, 0.958, 1],
        x: [0, side * 12, side * 5, side * -5, side * 3, 0],
        y: [0, 6, 16, -18, 7, 0],
        rotate: [0, side * 1.4, side * 0.4, side * -2.2, side * 1.1, 0]
      };
    }
    if (animationFlow === "release") {
      return {
        scaleX: [1, 0.94, 1.14, 0.972, 1.04, 0.995, 1],
        scaleY: [1, 1.17, 0.84, 1.08, 0.974, 1.012, 1],
        x: [0, side * -7, side * 5, side * -2, side, 0],
        y: [0, -22, 12, -8, 3, -1, 0],
        rotate: [0, side * -1.7, side * 1.1, side * -0.5, side * 0.2, 0]
      };
    }
    if (isPressed) {
      return {
        scaleX: down ? 1.13 : side ? 0.952 : 1.07,
        scaleY: down ? 0.79 : side ? 1.048 : 0.89,
        x: side * 12,
        y: down ? 22 : up ? -9 : 8,
        rotate: side * 1.8
      };
    }
    if (reaction === "excited") {
      return { scaleX: [1, 1.07, 0.97, 1.035, 1], scaleY: [1, 0.925, 1.065, 0.98, 1], y: [0, 9, -16, 5, 0], rotate: [0, -1.6, 1.8, -0.7, 0] };
    }
    if (reaction === "sleepy") {
      return { scaleX: [1, 1.025, 1], scaleY: [1, 0.985, 1], y: [0, 3, 0] };
    }
    if (reaction === "surprised") {
      return { scaleX: [1, 0.975, 1.025, 0.995, 1], scaleY: [1, 1.045, 0.965, 1.015, 1], y: [0, -10, 6, -2, 0], x: [0, -side * 6, side * 2, 0] };
    }
    if (reaction === "blush") {
      return { x: [0, -5, 4, -2, 0], rotate: [0, -1.3, 1, -0.5, 0], scaleX: [1, 1.02, 1], scaleY: [1, 0.99, 1] };
    }
    if (reaction === "curious") {
      return { x: side * -5, rotate: side * -1.6, y: -2 };
    }

    return {
      scaleX: down
        ? soft ? [1, 1.035, 0.994, 1] : [1, 1.08, 0.985, 1.035, 1]
        : up
          ? soft ? [1, 0.986, 1.018, 1] : [1, 0.965, 1.035, 1]
          : soft ? [1, 1.018, 0.995, 1] : [1, 1.045, 0.988, 1.018, 1],
      scaleY: down
        ? soft ? [1, 0.955, 1.018, 1] : [1, 0.89, 1.055, 0.985, 1]
        : up
          ? soft ? [1, 1.022, 0.99, 1] : [1, 1.06, 0.955, 1]
          : soft ? [1, 0.974, 1.015, 1] : [1, 0.94, 1.04, 0.992, 1],
      x: soft ? [0, side * 5, side * -2, 0] : [0, side * 13, side * -6, side * 2, 0],
      y: down
        ? soft ? [0, 6, -3, 0] : [0, 12, -7, 2, 0]
        : up
          ? soft ? [0, -5, 2, 0] : [0, -11, 5, 0]
          : soft ? [0, 4, -2, 0] : [0, 8, -5, 1, 0],
      rotate: soft ? [0, side * 0.55, side * -0.25, 0] : [0, side * 1.6, side * -0.9, 0]
    };
  }, [animationFlow, direction, isPressed, isTouchLike, reaction, shouldReduceMotion]);

  const shadowAnimate = isPressed
    ? { scaleX: direction === "top" || reaction === "squished" ? 1.34 : 1.18, scaleY: 0.76, opacity: 0.24, x: 0 }
    : animationFlow === "release"
      ? { scaleX: [1.24, 0.78, 1.12, 1], scaleY: [0.78, 1.24, 0.92, 1], opacity: [0.22, 0.09, 0.16, 0.13] }
      : reaction === "sleepy"
    ? { scaleX: 1.04, scaleY: 1.02, opacity: 0.15, x: 0 }
    : reaction === "squished" || direction === "top"
      ? { scaleX: [1, 1.12, 1.03, 1.06], scaleY: [1, 0.88, 0.96, 1], opacity: [0.13, 0.19, 0.15] }
      : { scaleX: [1, 0.94, 1.03, 1], scaleY: [1, 1.08, 0.98, 1], opacity: [0.13, 0.1, 0.14] };

  const faceLagX = clamp((pokePoint.x - 50) / 22, -3.2, 3.2);
  const faceLagY = clamp((pokePoint.y - 54) / 24, -2.4, 2.8);

  return (
    <button
      ref={shellRef}
      className="jelly-hitbox jelly-hitbox-image jelly-character"
      type="button"
      aria-label="Poke and stretch the world jelly"
      data-reaction={reaction}
      data-pressed={isPressed}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handleRelease}
      onPointerCancel={handleRelease}
      onPointerLeave={() => {
        clearHoldTimers();
        setPressed(false);
      }}
    >
      <motion.span className="jelly-character-shadow" animate={shadowAnimate} transition={{ duration: 0.42, ease: "easeOut" }} />

      <motion.span
        key={sequence}
        className="jelly-character-body"
        animate={bodyAnimate}
        transition={{
          duration:
            isTouchLike
              ? animationFlow === "release"
                ? 0.5
                : animationFlow === "spam" || reaction === "annoyed" || reaction === "dizzy"
                  ? 0.64
                  : animationFlow === "press"
                    ? 0.34
                    : animationFlow === "poke"
                      ? 0.28
                      : 0.38
              : animationFlow === "release"
                ? 0.82
                : animationFlow === "spam" || reaction === "annoyed" || reaction === "dizzy"
                  ? 1.08
                  : animationFlow === "press"
                    ? 0.62
                    : animationFlow === "poke"
                      ? 0.42
                      : 0.54,
          ease: [0.16, 0.9, 0.18, 1]
        }}
      >
        <Image
          className="jelly-character-image"
          src="/world-jelly-body.png"
          alt=""
          width={1254}
          height={1254}
          priority
          draggable={false}
        />
        <motion.span
          className="jelly-character-highlight"
          animate={{ x: -faceLagX * 1.3, y: -faceLagY * 0.7, scale: reaction === "surprised" ? 1.12 : 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        />
        <motion.span
          className="jelly-character-dent"
          style={{ left: `${pokePoint.x}%`, top: `${pokePoint.y}%` }}
          animate={{ opacity: isPressed || reaction === "squished" ? 0.54 : 0, scale: isPressed ? 1.28 : 0.45 }}
          transition={{ duration: isPressed ? 0.08 : 0.22 }}
        />
        <motion.span
          key={`ring-${sequence}`}
          className="jelly-squish-ring"
          style={{ left: `${pokePoint.x}%`, top: `${pokePoint.y}%` }}
          initial={{ opacity: 0, scale: 0.34 }}
          animate={{ opacity: isPressed ? 0.34 : [0.26, 0], scale: isPressed ? 0.58 : [0.72, 1.55] }}
          transition={{ duration: isPressed ? 0.08 : 0.46, ease: "easeOut" }}
        />
        <motion.span
          className="jelly-expression-motion"
          animate={{
            x: 0,
            y: reaction === "squished" ? 4 : reaction === "surprised" ? -2 : 0,
            scaleX: reaction === "squished" ? 1.08 : 1,
            scaleY: reaction === "squished" ? 0.74 : reaction === "surprised" ? 1.08 : 1
          }}
          transition={{ type: "spring", stiffness: 420, damping: 24 }}
        >
          <svg className="jelly-expression" viewBox="0 0 100 100" aria-hidden="true">
            <FaceParts reaction={reaction} />
          </svg>
        </motion.span>
      </motion.span>

      <AnimatePresence>
        {particles.map((particle) => (
          <motion.span
            className={`jelly-reaction-particle is-${particle.kind}`}
            key={particle.id}
            style={{ left: `${particle.x}%`, top: `${particle.y}%` }}
            initial={{ opacity: 0, scale: 0.5, x: 0, y: 0 }}
            animate={{
              opacity: [0, 1, 0],
              scale: particle.kind === "z" ? [0.7, 1, 1.06] : [0.45, 1, 0.7],
              x: Math.cos(particle.angle) * (particle.kind === "z" ? 18 : 34),
              y: Math.sin(particle.angle) * (particle.kind === "z" ? 34 : 25)
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: particle.kind === "z" ? 1.5 : 0.82, ease: "easeOut" }}
            onAnimationComplete={() => setParticles((items) => items.filter((item) => item.id !== particle.id))}
          >
            {particle.kind === "sparkle" ? "*" : particle.kind === "star" ? "+" : particle.kind === "z" ? "z" : ""}
          </motion.span>
        ))}
      </AnimatePresence>
    </button>
  );
}
