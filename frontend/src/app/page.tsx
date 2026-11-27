"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Phone, Mic, MicOff, RefreshCw, ChevronRight } from "lucide-react";
import { VoiceOrb } from "@/components/VoiceOrb";
import { StatusPill } from "@/components/StatusPill";
import { MedicationPills } from "@/components/MedicationPills";
import { UrgentEscalationCard } from "@/components/UrgentEscalationCard";
import { WindDown } from "@/components/WindDown";
import { api } from "@/lib/api";

type Mode = "idle" | "listening" | "speaking" | "analyzing";

interface MedPill {
  id: number;
  name: string;
  dosage: string;
  time_slot: string;
  spoken_alias: string;
  checked: boolean;
}

const LANG_LABEL: Record<string, string> = {
  en: "English", hi: "Hindi / Hinglish", te: "Telugu / Tenglish",
  kn: "Kannada / Kanglish", ta: "Tamil / Tanglish",
};

export default function Home() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [turns, setTurns] = useState<any[]>([]);
  const [mode, setMode] = useState<Mode>("idle");
  const [assistantText, setAssistantText] = useState("");
  const [elderTranscript, setElderTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [volume, setVolume] = useState(0);
  const [snr, setSnr] = useState(0);
  const [input_source, setInputSource] = useState<string>("mic_whisper");
  const [meds, setMeds] = useState<MedPill[]>([]);
  const [escalation, setEscalation] = useState<{ active: boolean; instruction: string; emergencyContact: string } | null>(null);
  const [language, setLanguage] = useState("en");
  const [summary, setSummary] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recognitionRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // ---------- profile boot ----------
  const loadProfiles = useCallback(async () => {
    try {
      const ps = await api.listProfiles();
      setProfiles(ps);
      if (ps.length && !selectedProfileId) setSelectedProfileId(ps[0].id);
    } catch (e) {
      setProfiles([]);
    }
  }, [selectedProfileId]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const createDefaultProfile = useCallback(async () => {
    try {
      const p = await api.createProfile({
        elder_name: "Elder",
        age: 70,
        preferred_language: "hi",
        baseline_conditions: "Hypertension, Diabetes",
        emergency_contact: "112",
        caregiver_webhook: "",
      });
      setProfiles([p, ...profiles]);
      setSelectedProfileId(p.id);
    } catch (e) {
      setError("Could not create default profile");
    }
  }, [profiles]);

  const selectProfile = useCallback(async (id: number) => {
    setSelectedProfileId(id);
    const p = profiles.find((x) => x.id === id);
    if (p) setProfile(p);
    setLanguage(p?.preferred_language || "en");
    setSession(null);
    setTurns([]);
    setAssistantText("");
    setEscalation(null);
    setSummary("");
  }, [profiles]);

  useEffect(() => {
    if (selectedProfileId) {
      const p = profiles.find((x) => x.id === selectedProfileId);
      setProfile(p);
      setLanguage(p?.preferred_language || "en");
    }
  }, [selectedProfileId, profiles]);

  // ---------- session ----------
  const startSession = useCallback(async () => {
    if (!selectedProfileId) return;
    setMode("analyzing");
    try {
      const started = await api.startSession(selectedProfileId);
      setSession(started);
      setTurns([]);
      setAssistantText(started.reply_text);
      setLanguage(started.language);
      setMeds(
        (started.medications_to_confirm || []).map((m: any) => ({
          id: m.id, name: m.name, dosage: m.dosage,
          time_slot: m.time_slot, spoken_alias: m.spoken_alias, checked: false,
        }))
      );
      await speakText(started.reply_text, started.language);
      setMode("idle");
    } catch (e: any) {
      setError(e.message || "Failed to start session");
      setMode("idle");
    }
  }, [selectedProfileId]);

  // ---------- TTS ----------
  const speakText = useCallback(async (text: string, lang: string) => {
    if (!text) return;
    setMode("speaking");
    try {
      const blob = await api.synthesizeSpeech(text, lang);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); setMode("idle"); };
      audio.onerror = () => { URL.revokeObjectURL(url); browserSpeak(text, lang); setMode("idle"); };
      audio.play().catch(() => browserSpeak(text, lang));
    } catch {
      browserSpeak(text, lang);
      setMode("idle");
    }
  }, []);

  const browserSpeak = useCallback((text: string, lang: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "en" ? "en-IN" : `${lang}-IN`;
    u.rate = 0.95;
    u.onend = () => setMode("idle");
    window.speechSynthesis.speak(u);
  }, []);

  // ---------- medication ----------
  const toggleMed = useCallback((id: number, taken: boolean) => {
    setMeds((prev) => prev.map((m) => (m.id === id ? { ...m, checked: taken } : m)));
    api.checkInMedication(id, taken).catch(() => {});
  }, []);

  // ---------- escalation ----------
  const acknowledgeEscalation = useCallback(() => {
    setEscalation(null);
    if (session?.id) api.listTurns(session.id).then(setTurns);
  }, [session?.id]);

  let rafRef = useRef<number>(0);

  // ---------- mic / audio capture ----------
    rec.start();
    return () => { try { rec.stop(); } catch { } recognitionRef.current = null; };
  }, [isRecording, language]);

  // ---------- send transcript ----------
  const handleTranscribe = useCallback(async (blob: Blob) => {
    setMode("analyzing");
    try {
      const asr = await api.transcribeAudio(blob);
      const transcript = asr.transcript.trim();
      setFinalTranscript((p) => (p ? p + " " : "") + transcript);
      setElderTranscript(transcript);
  const handleMicToggle = useCallback(async () => {
    if (isRecording) { stopRecording(); return; }
    startRecording();
  }, [isRecording, startRecording, stopRecording]);


  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  // ---------- live speech recognition ----------
  useEffect(() => {
    if (!isRecording) return;
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = language === "en" ? "en-IN" : `${language}-IN`;
    recognitionRef.current = rec;
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          setElderTranscript((p) => (p ? p + " " : "") + t.trim());
        } else interim += t;
      }
      setElderTranscript((p) => (p || "") + (interim ? " " + interim : ""));
    };
    rec.onend = () => { if (isRecording) rec.start(); };
  const startRecording = useCallback(async () => {
    setError("");
    setElderTranscript("");
    setMode("listening");
    setIsRecording(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        analyserRef.current = analyser;
        const data = new Uint8Array(analyser.frequencyBinCount);
        const meter = () => {
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((a: number, b: number) => a + b, 0) / data.length;
          setVolume(Math.min(1, avg / 160));
          setSnr(Math.min(60, Math.max(0, (avg - 40) / 2)));
          if (streamRef.current) rafRef.current = requestAnimationFrame(meter);
        };
        rafRef.current = requestAnimationFrame(meter);
      }
      const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = rec;
      const chunks: Blob[] = [];
      rec.ondataavailable = (e: any) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = async () => {
        setIsRecording(false);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch { } }
        audioCtxRef.current = null;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        setVolume(0); setSnr(0);
        const blob = new Blob(chunks, { type: "audio/webm" });
        await handleTranscribe(blob);
      };
      rec.start(200);
    } catch (e: any) {
      setError("Microphone access failed: " + (e.message || String(e)));
      setMode("idle");
      setIsRecording(false);
    }
  }, [handleTranscribe]);
      if (!transcript) { setMode("idle"); return; }
      await sendMessage(transcript, asr.confidence, asr.language);
    } catch { setMode("idle"); }
    setMode("idle");
  }, [sendMessage]);

  const sendMessage = useCallback(async (text: string, confidence?: number, lang?: string) => {
    if (!session?.id) return;
    setMode("analyzing");
    try {
      const out = await api.sendMessage(session.id, {
        text, asr_confidence: confidence, snr_db: snr, language: lang || language, input_source: input_source,
      });
      setAssistantText(out.reply_text);
      setLanguage(out.language || language);
      setSummary(out.summary || "");
      if (out.escalation) {
        setEscalation({
          active: true, instruction: out.escalation.instruction,
          emergencyContact: out.escalation.call_emergency || profile?.emergency_contact || "112",
        });
      }
      try { setTurns(await api.listTurns(session.id)); } catch {}
      await speakText(out.reply_text, out.language || language);
    } catch (e: any) {
      setError(e.message || "Failed to process message");
      setMode("idle");
    }
  }, [session, language, snr, profile, input_source, speakText]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-20">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-swar-600 flex items-center justify-center text-white font-bold text-lg">S</div>
            <span className="font-bold text-xl tracking-tight">SwarExSethu</span>
          </div>
          <div className="flex items-center gap-3">
            <StatusPill status={mode} subtitle={finalTranscript ? `\u00B7 ${finalTranscript}` : undefined} />
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Voice Input:</span>
              <span className={`font-medium ${input_source === "wispr_flow" ? "text-swar-600" : "text-slate-500"}`} id="wispr-mode-indicator">
                {input_source === "wispr_flow" ? "Wispr Flow" : "Built-in Mic"}
              </span>
            </div>
            {error && <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">{error}</span>}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 border rounded-2xl p-4 bg-white shadow-sm">
          <label className="text-sm font-medium text-slate-600">Elder</label>
          <select
            value={selectedProfileId ?? ""}
            onChange={(e) => selectProfile(Number(e.target.value))}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select profile</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.elder_name} ({p.age}) · {LANG_LABEL[p.preferred_language] || p.preferred_language}
              </option>
            ))}
          </select>
          <button onClick={createDefaultProfile} disabled={profiles.length > 0} className="secondary text-xs">
            Create default elder
          </button>
          {profiles.length === 0 && (
            <p className="text-xs text-slate-500">No profiles yet. Create one to begin.</p>
          )}
        </div>

        {!selectedProfileId || !profile ? null : (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="font-bold text-lg">{profile.elder_name}</div>
                  <div className="text-xs text-slate-500">
                    {profile.age} yrs · {LANG_LABEL[profile.preferred_language] || profile.preferred_language}
                  </div>
                </div>
                <button onClick={startSession} disabled={!!session || escalation?.active} className="primary">
                  {session ? "Session Active" : "Start Check-In"}
                </button>
              </div>

              {escalation?.active && (
                <UrgentEscalationCard
                  instruction={escalation.instruction}
                  emergencyContact={profile.emergency_contact || "112"}
                  onCallEmergency={() => { if (escalation.emergencyContact) location.href = `tel:${escalation.emergencyContact}`; }}
                  onAcknowledge={acknowledgeEscalation}
                />
              )}

              {!escalation?.active && (
                <>
                  <div className="flex flex-col items-center gap-4 mb-6">
                    <VoiceOrb mode={mode} amplitude={volume} label={mode === "idle" ? "Press mic to speak" : mode} onMicToggle={handleMicToggle} micOn={isRecording} />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Mic</span>
                      <input type="range" min="0" max="100" value={Math.round(volume * 100)} className="w-24 accent-swar-600" readOnly />
                      <span className="text-xs text-slate-400">SNR {Math.round(snr)} dB</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() => setInputSource("wispr_flow")}
                        className={`
                          px-3 py-1 rounded-lg text-sm font-medium transition-colors
                          ${input_source === "wispr_flow" ? "bg-swar-100 border-swar-600 text-swar-800" : "border-slate-300 text-slate-600 hover:bg-slate-50"}
                        `}
                        aria-label="Switch to Wispr Flow dictation"
                      >
                        Wispr Flow
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 mb-4">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-semibold text-slate-500">Elder</span>
                      <span className="text-xs text-swar-600">{LANG_LABEL[language] || language}</span>
                    </div>
                    <div className="elder-text text-slate-800">{elderTranscript || finalTranscript || "—"}</div>
                    {mode === "listening" && <p className="mt-2 text-xs text-green-600">Listening… speak now.</p>}
                  </div>

                  {assistantText && (
                    <div className="bg-swar-50 rounded-xl p-4 border border-swar-100 mb-4">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-semibold text-swar-700">SwarExSethu</span>
                        <button onClick={() => speakText(assistantText, language)} className="secondary text-xs" title="Repeat">
                          <Mic className="w-3 h-3 mr-1" /> Repeat
                        </button>
                      </div>
                      <div className="elder-text text-slate-800">{assistantText}</div>
                    </div>
                  )}

                  {meds.length > 0 && (
                    <div className="mb-4">
                      <div className="text-xs font-semibold text-slate-600 mb-2">Medicines due now</div>
                      <MedicationPills meds={meds} onToggle={toggleMed} />
                    </div>
                  )}

                  {summary && (
                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                      <div className="text-xs font-semibold text-blue-700 mb-1">Check-in summary</div>
                      <div className="text-sm text-slate-800">{summary}</div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
