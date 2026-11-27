"use strict";

import { useEffect, useRef, useCallback } from "react";
import { Mic, Ear, MicOff } from "lucide-react";

type Mode = "idle" | "listening" | "speaking" | "analyzing";

interface VoiceOrbProps {
  mode: Mode;
  amplitude: number; // 0..1
  label: string;
  onMicToggle?: () => void;
  micOn: boolean;
}

export function VoiceOrb({ mode, amplitude, label, onMicToggle, micOn }: VoiceOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>();

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height;
    const cx = w / 2, cy = h / 2;
    const baseR = Math.min(w, h) * 0.34;
    const ampR = baseR + amplitude * 40;

    ctx.clearRect(0, 0, w, h);

    // concentric rings
    const rings = 3;
    for (let i = 0; i < rings; i++) {
      const r = baseR - i * 14 + amplitude * 20;
      const alpha = 0.35 - i * 0.1 + amplitude * 0.3;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(6, r), 0, Math.PI * 2);
      const color = mode === "speaking" ? "34,197,94" : mode === "listening" ? "34,197,94" : mode === "analyzing" ? "59,130,246" : "203,213,225";
      ctx.strokeStyle = `rgba(${color},${alpha})`;
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    // core
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(10, ampR * 0.55), 0, Math.PI * 2);
    const coreColor = mode === "speaking" ? "rgba(34,197,94,0.95)" : mode === "listening" ? "rgba(34,197,94,0.85)" : mode === "analyzing" ? "rgba(59,130,246,0.85)" : "rgba(203,213,225,0.9)";
    ctx.fillStyle = coreColor;
    ctx.fill();
    ctx.shadowColor = coreColor;
    ctx.shadowBlur = mode === "idle" ? 0 : 24;

    rafRef.current = requestAnimationFrame(draw);
  }, [mode, amplitude]);

  useEffect(() => {
    draw();
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [draw]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`voice-orb w-40 h-40 ${mode === "listening" ? "voice-orb-listening" : mode === "speaking" ? "voice-orb-speaking" : mode === "analyzing" ? "voice-orb-analyzing" : "voice-orb-idle"}`}>
        <canvas className="absolute inset-0 rounded-full" ref={canvasRef} />
        <div className="absolute inset-0 flex items-center justify-center">
          {micOn ? (
            <Mic className="w-8 h-8 text-white drop-shadow" />
          ) : (
            <MicOff className="w-8 h-8 text-slate-400" />
          )}
        </div>
      </div>
      <div className="text-xs text-slate-500 font-medium">{label}</div>
      <div className={`flex items-center gap-1 text-xs ${mode === "listening" ? "text-green-600" : mode === "speaking" ? "text-emerald-600" : mode === "analyzing" ? "text-blue-600" : "text-slate-400"}`}>
        {mode === "listening" && <Ear className="w-4 h-4 fill-current animate-pulse" />}
        {label}
      </div>
      {onMicToggle && (
        <button
          onClick={onMicToggle}
          className="mt-2 secondary"
          aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
        >
          {micOn ? "Mic On" : "Mic Off"}
        </button>
      )}
    </div>
  );
}