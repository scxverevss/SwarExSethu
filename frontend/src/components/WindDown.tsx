"use strict";

import { useEffect, useState, useRef, useCallback } from "react";
import { Music2, Sun, Moon } from "lucide-react";

interface Rag { key: string; name: string; bpm: number; }

interface WindDownProps {
  ragas: Rag[];
  onToggle: () => void;
  active: boolean;
}

const NOTE_FREQS: Record<string, number> = {
  C: 261.63, "C#": 277.18, D: 293.66, "D#": 311.13, E: 329.63,
  F: 349.23, "F#": 369.99, G: 392.00, "G#": 415.30, A: 440.00,
  "A#": 466.16, B: 493.88,
};

const RAGA_INTERVALS: Record<string, number[]> = {
  yaman: [0, 2, 4, 6, 7, 9, 11, 12],
  bhairavi: [0, 1, 3, 5, 7, 8, 10, 12],
  bihaq: [0, 2, 4, 6, 7, 9, 11, 12],
  bihang: [0, 2, 4, 6, 7, 9, 11, 12],
};

export function WindDown({ ragas, onToggle, active }: WindDownProps) {
  const [selected, setSelected] = useState<string>(ragas[0]?.key || "yaman");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const gainRef = useRef<GainNode | null>(null);
  const rafRef = useRef<number>();
  const [level, setLevel] = useState(0);

  const start = useCallback(() => {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    if (ctx.state === "suspended") ctx.resume();

    const master = ctx.createGain();
    master.gain.value = active ? 0.45 : 0;
    master.connect(ctx.destination);
    gainRef.current = master;

    const raga = ragas.find((r) => r.key === selected) || ragas[0];
    const intervals = RAGA_INTERVALS[raga.key] || [0, 4, 7];
    const tonic = 130.81; // C3 ~ tanpura Sa
    const droneNotes = [intervals[0], intervals[4], intervals[7 % intervals.length]];

    droneNotes.forEach((semi) => {
      const freq = tonic * Math.pow(2, semi / 12);
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(master);
      osc.start();
      oscillatorsRef.current.push(osc);
    });

    // gentle flute-like melodic flourish
    const fluteGain = ctx.createGain();
    fluteGain.gain.value = 0.08;
    fluteGain.connect(master);
    let noteIdx = 0;
    const playFlute = () => {
      if (!audioCtxRef.current) return;
      const f = tonic * Math.pow(2, intervals[noteIdx % intervals.length] / 12);
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(f, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(f * 1.02, ctx.currentTime + 0.3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
      o.connect(g); g.connect(master);
      o.start();
      o.stop(ctx.currentTime + 1.5);
      noteIdx++;
      setTimeout(playFlute, 2600 / (raga.bpm / 60));
    };
    setTimeout(playFlute, 1000);

    // visual level meter
    const meter = () => {
      setLevel(Math.sin(Date.now() / 300) * 0.3 + 0.5);
      rafRef.current = requestAnimationFrame(meter);
    };
    rafRef.current = requestAnimationFrame(meter);
  }, [active, selected, ragas]);

  const stop = useCallback(() => {
    oscillatorsRef.current.forEach((o) => { try { o.stop(); } catch { } });
    oscillatorsRef.current = [];
    if (gainRef.current) gainRef.current.gain.setTargetAtTime(0, 0, 0.1);
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch { } }
    audioCtxRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setLevel(0);
  }, []);

  useEffect(() => {
    if (active) start(); else stop();
    return () => stop();
  }, [active, start, stop]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Music2 className="w-5 h-5 text-swar-600" />
          <span className="text-sm font-semibold text-slate-800">Evening Wind-Down</span>
        </div>
        <button onClick={onToggle} className="secondary text-xs">
          {active ? "Stop drone" : "Play raga drone"}
        </button>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-slate-600">Raga:</span>
        {ragas.map((r) => (
          <button
            key={r.key}
            onClick={() => setSelected(r.key)}
            className={`px-2 py-1 rounded text-xs border ${
              selected === r.key ? "bg-swar-100 border-swar-600 text-swar-800 font-bold" : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {r.name}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-600">Level:</span>
        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
          <div className={`h-full bg-swar-500 transition-all duration-100`} style={{ width: `${Math.round(level * 100)}%` }} />
        </div>
        <span className="text-xs text-slate-600 w-10 text-right">{Math.round(level * 100)}%</span>
      </div>

      <p className="mt-3 text-[11px] caption">
        Gentle {active ? "playing" : "ready"}: tanpura-style harmonic drone with
        flute flourish. Auto-ducks when SwarExSethu speaks/listens.
      </p>
    </section>
  );
}