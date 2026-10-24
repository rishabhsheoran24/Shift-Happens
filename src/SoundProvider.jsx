import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { SOUNDS } from "./sounds";

const SoundContext = createContext(null);
const MUTE_KEY = "pfa-muted";

/**
 * SoundProvider
 * Wrap your whole app in this once. Then any component can call useSound().
 *
 * It also plays the "click" sound automatically for every <button> in the app.
 * To skip that for one button, add  data-nosound  to it.
 */
export function SoundProvider({ children }) {
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [volume, setVolume] = useState(0.8);

  const audioRef = useRef({}); // name -> Audio element (one copy kept ready)
  const ctxRef = useRef(null); // Web Audio context for the fallback beeps
  const mutedRef = useRef(muted);
  const volumeRef = useRef(volume);

  useEffect(() => {
    mutedRef.current = muted;
    volumeRef.current = volume;
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [muted, volume]);

  // Load all sound files once, in the background.
  useEffect(() => {
    Object.entries(SOUNDS).forEach(([name, def]) => {
      const a = new Audio(def.file);
      a.preload = "auto";
      audioRef.current[name] = a;
    });
  }, []);

  // A simple generated beep, used when a sound file is missing or fails.
  const beep = useCallback((tone, vol) => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!ctxRef.current) ctxRef.current = new AC();
      const ctx = ctxRef.current;
      if (ctx.state === "suspended") ctx.resume();

      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.type || "sine";
      osc.frequency.setValueAtTime(tone.freq, t);
      osc.frequency.exponentialRampToValueAtTime(tone.endFreq || tone.freq, t + tone.duration);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(vol * 0.3, 0.0002), t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + tone.duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + tone.duration + 0.02);
    } catch {
      /* sound is optional, never crash the game over it */
    }
  }, []);

  const play = useCallback(
    (name) => {
      const def = SOUNDS[name];
      if (!def || mutedRef.current) return;
      const vol = Math.min(1, def.volume * volumeRef.current);

      const base = audioRef.current[name];
      if (base) {
        // Clone so the same sound can overlap itself (fast clicking).
        const clip = base.cloneNode();
        clip.volume = vol;
        clip.play().catch(() => beep(def.tone, vol));
      } else {
        beep(def.tone, vol);
      }
    },
    [beep]
  );

  // Automatic click sound for every button in the app.
  useEffect(() => {
    const onClick = (e) => {
      const btn = e.target.closest?.("button");
      if (btn && !btn.disabled && !btn.hasAttribute("data-nosound")) play("click");
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [play]);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  return (
    <SoundContext.Provider value={{ play, muted, toggleMute, volume, setVolume }}>
      {children}
    </SoundContext.Provider>
  );
}

/**
 * useSound
 * const { play, muted, toggleMute, volume, setVolume } = useSound();
 * play("battleStart");
 */
export function useSound() {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error("useSound must be used inside <SoundProvider>");
  return ctx;
}
