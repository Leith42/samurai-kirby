import { useCallback, useEffect, useRef } from "react";
import type { Player } from "../types";
import fightSnd from "../assets/audio/fight.mp3";
import signalSnd from "../assets/audio/signal.mp3";
import kirbyHitSnd from "../assets/audio/kirby-hit.mp3";
import dededeHitSnd from "../assets/audio/king-dedede-hit.mp3";
import drawSnd from "../assets/audio/draw.mp3";

interface Params {
  status:
    | "idle"
    | "joining"
    | "lobby"
    | "staring"
    | "waiting"
    | "signaled"
    | "result";
  round: number;
  winnerId: string | null;
  players: Player[];
  muted: boolean;
  volume: number;
}

function applyAudioSettings(
  a: HTMLAudioElement | null,
  isMuted: boolean,
  vol: number,
): void {
  if (!a) return;
  a.muted = isMuted || vol === 0;
  a.volume = isMuted ? 0 : vol;
}

function createAudio(
  src: string,
  opts?: { loop?: boolean; volume?: number },
): HTMLAudioElement {
  const a = new Audio(src);
  a.preload = "auto";
  if (opts?.loop) a.loop = true;
  if (typeof opts?.volume === "number") a.volume = opts.volume;
  return a;
}

function safePlay(
  a: HTMLAudioElement | null,
  isMuted: boolean,
  vol: number,
  opts?: { resetTime?: boolean; label?: string },
): void {
  if (!a) return;
  try {
    if (opts?.resetTime) a.currentTime = 0;
    applyAudioSettings(a, isMuted, vol);
    const p = a.play();
    if (p)
      p.catch((err) => {
        if (opts?.label) console.error(`Error playing ${opts.label}:`, err);
        else console.error("Error playing audio:", err);
      });
  } catch (e) {
    if (opts?.label) console.error(`Error playing ${opts.label}:`, e);
    else console.error("Error playing audio:", e);
  }
}

function safePause(a: HTMLAudioElement | null, label?: string): void {
  if (!a) return;
  try {
    a.pause();
  } catch (e) {
    if (label) console.error(`Error pausing ${label}:`, e);
    else console.error("Error pausing audio:", e);
  }
}

function safeStop(a: HTMLAudioElement | null, label?: string): void {
  if (!a) return;
  try {
    a.pause();
    a.currentTime = 0;
  } catch (e) {
    if (label) console.error(`Error stopping ${label}:`, e);
    else console.error("Error stopping audio:", e);
  }
}

function pickWinnerAudio(
  winnerId: string | null,
  players: Player[],
  refs: {
    kirby: HTMLAudioElement | null;
    dedede: HTMLAudioElement | null;
    draw: HTMLAudioElement | null;
  },
): { el: HTMLAudioElement | null; label: string } {
  if (!winnerId) return { el: refs.draw, label: "draw audio" };
  if (players[0]?.id === winnerId)
    return { el: refs.kirby, label: "Kirby hit audio" };
  if (players[1]?.id === winnerId)
    return { el: refs.dedede, label: "Dedede hit audio" };
  return { el: null, label: "hit audio" };
}

export default function useGameAudio({
  status,
  round,
  winnerId,
  players,
  muted,
  volume,
}: Params) {
  const fightAudioRef = useRef<HTMLAudioElement | null>(null);
  const signalAudioRef = useRef<HTMLAudioElement | null>(null);
  const kirbyHitAudioRef = useRef<HTMLAudioElement | null>(null);
  const dededeHitAudioRef = useRef<HTMLAudioElement | null>(null);
  const drawAudioRef = useRef<HTMLAudioElement | null>(null);

  const lastSignalRoundRef = useRef<number>(0);
  const lastHitRoundRef = useRef<number>(0);
  const lastFightRoundRef = useRef<number>(0);

  // Initialize all audio elements once
  useEffect(() => {
    const fight = createAudio(fightSnd, { loop: true, volume: 1 });
    fightAudioRef.current = fight;

    const sig = createAudio(signalSnd);
    signalAudioRef.current = sig;

    const kh = createAudio(kirbyHitSnd);
    kirbyHitAudioRef.current = kh;

    const dd = createAudio(dededeHitSnd);
    dededeHitAudioRef.current = dd;

    const dr = createAudio(drawSnd);
    drawAudioRef.current = dr;

    return () => {
      safePause(fight, "fight audio");
      safePause(sig, "signal audio");
      safePause(kh, "Kirby hit audio");
      safePause(dd, "Dedede hit audio");
      safePause(dr, "draw audio");
    };
  }, []);

  // Fight BGM: play in staring + waiting, stop otherwise
  useEffect(() => {
    const a = fightAudioRef.current;
    if (!a) return;
    if (status === "staring" || status === "waiting") {
      const shouldReset =
        lastFightRoundRef.current !== round && status === "staring";
      if (shouldReset) {
        lastFightRoundRef.current = round;
      }
      safePlay(a, muted, volume, {
        resetTime: shouldReset,
        label: "fight audio",
      });
    } else {
      safeStop(a, "fight audio");
    }
  }, [status, round, muted, volume]);

  // Signal SFX: on signal state once per round
  useEffect(() => {
    if (status !== "signaled") return;
    if (lastSignalRoundRef.current === round) return;
    lastSignalRoundRef.current = round;
    safePlay(signalAudioRef.current, muted, volume, {
      resetTime: true,
      label: "signal audio",
    });
  }, [status, round, muted, volume]);

  // Hit/Draw SFX: on result once per round
  useEffect(() => {
    if (status !== "result") return;
    if (lastHitRoundRef.current === round) return;
    lastHitRoundRef.current = round;
    const { el, label } = pickWinnerAudio(winnerId, players, {
      kirby: kirbyHitAudioRef.current,
      dedede: dededeHitAudioRef.current,
      draw: drawAudioRef.current,
    });
    if (!el) return;
    safePlay(el, muted, volume, { resetTime: true, label });
  }, [status, round, winnerId, players, muted, volume]);

  // Apply global volume/mute to all audio refs on changes
  useEffect(() => {
    const arr = [
      fightAudioRef.current,
      signalAudioRef.current,
      kirbyHitAudioRef.current,
      dededeHitAudioRef.current,
      drawAudioRef.current,
    ];
    for (const el of arr) applyAudioSettings(el, muted, volume);
  }, [volume, muted]);

  // Provide immediate application method for slider drag
  const applyVolumeImmediate = useCallback((vol: number, isMuted: boolean) => {
    const arr = [
      fightAudioRef.current,
      signalAudioRef.current,
      kirbyHitAudioRef.current,
      dededeHitAudioRef.current,
      drawAudioRef.current,
    ];
    for (const el of arr) applyAudioSettings(el, isMuted, vol);
  }, []);

  return { applyVolumeImmediate } as const;
}
