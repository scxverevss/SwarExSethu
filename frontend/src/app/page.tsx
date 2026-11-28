"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Mic,
  Volume2,
  ShieldAlert,
  Sparkles,
  UserPlus,
  Send,
  Activity,
  PhoneCall,
  HeartHandshake,
  Languages,
  ArrowUpRight,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
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
  en: "English",
  hi: "Hindi / Hinglish",
  te: "Telugu / Tenglish",
  kn: "Kannada / Kanglish",
  ta: "Tamil / Tanglish",
};

const DEFAULT_RAGAS = [
  { key: "yaman", name: "Raga Yaman", bpm: 58 },
  { key: "bhairavi", name: "Raga Bhairavi", bpm: 52 },
  { key: "bihag", name: "Raga Bihag", bpm: 60 },
];

export default function Home() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [turns, setTurns] = useState<any[]>([]);
  const [mode, setMode] = useState<Mode>("idle");
  const [assistantText, setAssistantText] = useState("");
  const [elderTranscript, setElderTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [draftUtterance, setDraftUtterance] = useState("");
  const [volume, setVolume] = useState(0);
  const [snr, setSnr] = useState(0);
  const [inputSource, setInputSource] = useState<string>("wispr_flow");
  const [meds, setMeds] = useState<MedPill[]>([]);
  const [escalation, setEscalation] = useState<{
    active: boolean;
    instruction: string;
    emergencyContact: string;
  } | null>(null);
  const [language, setLanguage] = useState("hi");
  const [summary, setSummary] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [error, setError] = useState("");
  const [ragas, setRagas] = useState<any[]>(DEFAULT_RAGAS);
  const [windDownActive, setWindDownActive] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recognitionRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  // ---------- profile & raga boot ----------
  const loadProfiles = useCallback(async () => {
    setLoadingProfiles(true);
    try {
      const ps = await api.listProfiles();
      setProfiles(ps);
      if (ps.length && !selectedProfileId) {
        setSelectedProfileId(ps[0].id);
      }
      setError("");
    } catch {
      setProfiles([]);
    } finally {
      setLoadingProfiles(false);
    }
  }, [selectedProfileId]);

  useEffect(() => {
    loadProfiles();
    api
      .listRagas()
      .then((list) => {
        if (Array.isArray(list) && list.length) setRagas(list);
      })
      .catch(() => {});
  }, [loadProfiles]);

  const createDefaultProfile = useCallback(async () => {
    setCreatingProfile(true);
    setError("");
    try {
      const p = await api.createProfile({
        elder_name: "Amma (Lakshmi)",
        age: 72,
        preferred_language: "hi",
        baseline_conditions: "Hypertension, Type 2 Diabetes",
        emergency_contact: "112",
        caregiver_webhook: "",
      });
      setProfiles((prev) => [p, ...prev]);
      setSelectedProfileId(p.id);
    } catch (e: any) {
      setError(e.message || "Backend is waking up on Render—please try again in a few seconds.");
    } finally {
      setCreatingProfile(false);
    }
  }, []);

  const selectProfile = useCallback(
    (id: number) => {
      setSelectedProfileId(id);
      const p = profiles.find((x) => x.id === id);
      if (p) setProfile(p);
      setLanguage(p?.preferred_language || "en");
      setSession(null);
      setTurns([]);
      setAssistantText("");
      setElderTranscript("");
      setFinalTranscript("");
      setEscalation(null);
      setSummary("");
    },
    [profiles]
  );

  useEffect(() => {
    if (selectedProfileId) {
      const p = profiles.find((x) => x.id === selectedProfileId);
      setProfile(p || null);
      setLanguage(p?.preferred_language || "en");
    }
  }, [selectedProfileId, profiles]);

  // ---------- TTS ----------
  const browserSpeak = useCallback((text: string, lang: string) => {
    if (!("speechSynthesis" in window)) {
      setMode("idle");
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "en" ? "en-IN" : `${lang}-IN`;
    u.rate = 0.95;
    u.onend = () => setMode("idle");
    u.onerror = () => setMode("idle");
    window.speechSynthesis.speak(u);
  }, []);

  const speakText = useCallback(
    async (text: string, lang: string) => {
      if (!text) return;
      if (windDownActive) setWindDownActive(false);
      setMode("speaking");
      try {
        const blob = await api.synthesizeSpeech(text, lang);
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => {
          URL.revokeObjectURL(url);
          setMode("idle");
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          browserSpeak(text, lang);
        };
        await audio.play();
      } catch {
        browserSpeak(text, lang);
      }
    },
    [browserSpeak, windDownActive]
  );

  // ---------- session ----------
  const startSession = useCallback(async () => {
    if (!selectedProfileId) return;
    setMode("analyzing");
    setError("");
    try {
      const started = await api.startSession(selectedProfileId);
      setSession(started);
      setTurns([]);
      setAssistantText(started.reply_text);
      setLanguage(started.language);
      setMeds(
        (started.medications_to_confirm || []).map((m: any) => ({
          id: m.id,
          name: m.name,
          dosage: m.dosage,
          time_slot: m.time_slot,
          spoken_alias: m.spoken_alias,
          checked: false,
        }))
      );
      await speakText(started.reply_text, started.language);
      setMode("idle");
    } catch (e: any) {
      setError(e.message || "Failed to start session");
      setMode("idle");
    }
  }, [selectedProfileId, speakText]);

  // ---------- medication ----------
  const toggleMed = useCallback((id: number, taken: boolean) => {
    setMeds((prev) => prev.map((m) => (m.id === id ? { ...m, checked: taken } : m)));
    api.checkInMedication(id, taken).catch(() => {});
  }, []);

  // ---------- escalation ----------
  const acknowledgeEscalation = useCallback(() => {
    setEscalation(null);
    if (session?.id) {
      api.listTurns(session.id).then(setTurns).catch(() => {});
    }
  }, [session?.id]);

  // ---------- send message & transcript ----------
  const sendMessage = useCallback(
    async (text: string, confidence?: number, lang?: string) => {
      const clean = text.trim();
      if (!clean) return;
      if (!session?.id) {
        setError("Start a Check-In session first so SwarExSethu can log and respond.");
        setMode("idle");
        return;
      }
      setError("");
      setMode("analyzing");
      setElderTranscript(clean);
      setFinalTranscript((p) => (p ? `${p} ${clean}` : clean));
      try {
        const out = await api.sendMessage(session.id, {
          text: clean,
          asr_confidence: confidence ?? 0.96,
          snr_db: snr || 28,
          language: lang || language,
          input_source: inputSource,
        });
        setAssistantText(out.reply_text);
        setLanguage(out.language || language);
        setSummary(out.summary || "");
        if (out.escalation) {
          setEscalation({
            active: true,
            instruction: out.escalation.instruction,
            emergencyContact:
              out.escalation.call_emergency || profile?.emergency_contact || "112",
          });
        }
        try {
          setTurns(await api.listTurns(session.id));
        } catch {}
        await speakText(out.reply_text, out.language || language);
      } catch (e: any) {
        setError(e.message || "Failed to process message");
        setMode("idle");
      }
    },
    [session, language, snr, profile, inputSource, speakText]
  );

  const handleTranscribe = useCallback(
    async (blob: Blob) => {
      setMode("analyzing");
      try {
        const asr = await api.transcribeAudio(blob);
        const transcript = (asr.transcript || "").trim();
        if (transcript) {
          await sendMessage(transcript, asr.confidence, asr.language || language);
        } else {
          setMode("idle");
        }
      } catch {
        setMode("idle");
      }
    },
    [sendMessage, language]
  );

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    setError("");
    setElderTranscript("");
    if (windDownActive) setWindDownActive(false);
    setMode("listening");
    setIsRecording(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
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
          if (streamRef.current) {
            rafRef.current = requestAnimationFrame(meter);
          }
        };
        rafRef.current = requestAnimationFrame(meter);
      }
      const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = rec;
      const chunks: Blob[] = [];
      rec.ondataavailable = (e: any) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = async () => {
        setIsRecording(false);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (audioCtxRef.current) {
          try {
            await audioCtxRef.current.close();
          } catch {}
        }
        audioCtxRef.current = null;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        setVolume(0);
        setSnr(0);
        const blob = new Blob(chunks, { type: "audio/webm" });
        await handleTranscribe(blob);
      };
      rec.start(200);
    } catch (e: any) {
      setError("Microphone access failed: " + (e.message || String(e)));
      setMode("idle");
      setIsRecording(false);
    }
  }, [handleTranscribe, windDownActive]);

  const handleMicToggle = useCallback(() => {
    if (isRecording) {
      stopRecording();
      return;
    }
    startRecording();
  }, [isRecording, startRecording, stopRecording]);

  // ---------- live speech recognition ----------
  useEffect(() => {
    if (!isRecording) return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
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
          setElderTranscript((p) => (p ? `${p} ${t.trim()}` : t.trim()));
        } else {
          interim += t;
        }
      }
      if (interim) {
        setElderTranscript((p) => (p ? `${p} ${interim}` : interim));
      }
    };
    rec.onend = () => {
      if (isRecording) {
        try {
          rec.start();
        } catch {}
      }
    };
    try {
      rec.start();
    } catch {}
    return () => {
      try {
        rec.stop();
      } catch {}
      recognitionRef.current = null;
    };
  }, [isRecording, language]);

  return (
    <div className="min-h-screen pb-16">
      <Navbar
        rightSlot={
          <StatusPill
            status={mode}
            subtitle={
              finalTranscript
                ? finalTranscript.slice(0, 28) + (finalTranscript.length > 28 ? "…" : "")
                : undefined
            }
          />
        }
      />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 space-y-6">
        {/* Hero / Profile Selector Bar */}
        <section className="glass-card p-5 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-swar-50 text-swar-700 border border-swar-200 text-xs font-semibold mb-2">
                <HeartHandshake className="w-3.5 h-3.5" /> Voice-First Preventive Care for Indian Elders
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                Daily Wellness &amp; Medication Check-In
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Speak naturally in Hindi, Telugu, Kannada, Tamil, or English — with instant red-flag triage and caregiver sync.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 bg-slate-50/90 p-3 rounded-2xl border border-slate-200/80">
              <div className="min-w-[200px]">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                  Active Elder Profile
                </span>
                <select
                  value={selectedProfileId ?? ""}
                  onChange={(e) => selectProfile(Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-medium text-slate-800"
                >
                  <option value="">
                    {loadingProfiles ? "Connecting to backend…" : "Select elder profile"}
                  </option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.elder_name} ({p.age}y) · {LANG_LABEL[p.preferred_language] || p.preferred_language}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={createDefaultProfile}
                disabled={creatingProfile}
                className="secondary text-xs sm:text-sm h-[38px] mt-auto"
              >
                <UserPlus className="w-4 h-4 mr-1.5 text-swar-600" />
                {creatingProfile ? "Creating…" : "Quick Sample Elder"}
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-xs sm:text-sm text-red-700">
              <span>{error}</span>
              <button onClick={() => setError("")} className="font-semibold underline">
                Dismiss
              </button>
            </div>
          )}
        </section>

        {/* Empty State Onboarding Card */}
        {!selectedProfileId || !profile ? (
          <section className="glass-card p-8 sm:p-12 text-center max-w-2xl mx-auto">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-swar-100 to-indigo-100 text-swar-700 flex items-center justify-center mx-auto mb-4 shadow-inner">
              <Sparkles className="w-8 h-8" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
              {loadingProfiles ? "Waking Up SwarExSethu Services…" : "Ready for Your First Elder Check-In"}
            </h2>
            <p className="text-sm sm:text-base text-slate-600 mt-2 max-w-lg mx-auto">
              {loadingProfiles
                ? "Connecting to the cloud health engine. If Render was sleeping, this takes about 15–20 seconds."
                : "Create a one-click sample elder profile with baseline conditions and Indian language support, or configure custom medicines in Settings."}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={createDefaultProfile}
                disabled={creatingProfile}
                className="primary"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                {creatingProfile ? "Setting Up Profile…" : "Create Sample Elder (Amma)"}
              </button>
              <Link href="/settings" className="secondary">
                Custom Setup in Settings <ArrowUpRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
          </section>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Main Voice Check-In Stage */}
            <section className="lg:col-span-8 glass-card p-6 sm:p-8 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-100">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-swar-500 to-indigo-600 text-white font-bold text-lg flex items-center justify-center shadow-md">
                    {profile.elder_name?.[0]?.toUpperCase() || "E"}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold text-slate-900">{profile.elder_name}</h2>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                        {profile.age} yrs
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                      <span className="inline-flex items-center gap-1 text-swar-700 font-medium">
                        <Languages className="w-3.5 h-3.5" />
                        {LANG_LABEL[language] || language}
                      </span>
                      {profile.baseline_conditions && (
                        <>
                          <span>·</span>
                          <span>{profile.baseline_conditions}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {session && (
                    <button
                      onClick={() => {
                        setSession(null);
                        setTurns([]);
                        setAssistantText("");
                        setElderTranscript("");
                        setFinalTranscript("");
                        setSummary("");
                        setEscalation(null);
                      }}
                      className="secondary text-xs"
                    >
                      New Session
                    </button>
                  )}
                  <button
                    onClick={startSession}
                    disabled={!!session || escalation?.active || mode === "analyzing"}
                    className="primary"
                  >
                    {session ? "Session Live" : "Start Check-In"}
                  </button>
                </div>
              </div>

              {escalation?.active ? (
                <UrgentEscalationCard
                  instruction={escalation.instruction}
                  emergencyContact={profile.emergency_contact || "112"}
                  onCallEmergency={() => {
                    if (escalation.emergencyContact) {
                      location.href = `tel:${escalation.emergencyContact}`;
                    }
                  }}
                  onAcknowledge={acknowledgeEscalation}
                />
              ) : (
                <>
                  {/* Input Mode Switcher & Voice Orb */}
                  <div className="rounded-2xl bg-gradient-to-b from-slate-50/90 to-white border border-slate-200/70 p-6 flex flex-col items-center">
                    <div className="inline-flex items-center p-1 rounded-xl bg-slate-200/70 mb-5">
                      <button
                        type="button"
                        onClick={() => setInputSource("wispr_flow")}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                          inputSource === "wispr_flow"
                            ? "bg-white text-swar-800 shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        Wispr Flow Dictation
                      </button>
                      <button
                        type="button"
                        onClick={() => setInputSource("mic_whisper")}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                          inputSource === "mic_whisper"
                            ? "bg-white text-swar-800 shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        Built-in Mic ASR
                      </button>
                    </div>

                    <VoiceOrb
                      mode={mode}
                      amplitude={volume}
                      label={
                        mode === "idle"
                          ? session
                            ? "Tap mic to speak"
                            : "Start check-in to begin"
                          : mode
                      }
                      onMicToggle={handleMicToggle}
                      micOn={isRecording}
                    />

                    {/* Audio Telemetry Strip */}
                    <div className="mt-5 w-full max-w-xs flex items-center gap-3 text-xs text-slate-500">
                      <span>Level</span>
                      <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-swar-500 to-emerald-500 transition-all duration-75"
                          style={{ width: `${Math.round(volume * 100)}%` }}
                        />
                      </div>
                      <span className="font-mono text-[11px]">SNR {Math.round(snr)} dB</span>
                    </div>

                    {/* Direct Wispr Flow / Utterance Input Box */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!draftUtterance.trim()) return;
                        const text = draftUtterance;
                        setDraftUtterance("");
                        sendMessage(text, 0.98, language);
                      }}
                      className="mt-5 w-full flex flex-col sm:flex-row gap-2"
                    >
                      <input
                        value={draftUtterance}
                        onChange={(e) => setDraftUtterance(e.target.value)}
                        placeholder={
                          inputSource === "wispr_flow"
                            ? "Click here & dictate with Wispr Flow (e.g. 'Subah ki BP goli kha li, thoda chakkar aa raha hai')…"
                            : "Or type / paste elder response here…"
                        }
                        className="flex-1 bg-white"
                      />
                      <button
                        type="submit"
                        disabled={!draftUtterance.trim() || mode === "analyzing"}
                        className="primary text-xs sm:text-sm shrink-0"
                      >
                        <Send className="w-3.5 h-3.5 mr-1.5" /> Send Turn
                      </button>
                    </form>
                  </div>

                  {/* Conversation Dialogue Cards */}
                  <div className="grid grid-cols-1 gap-4">
                    <div className="rounded-2xl bg-slate-50 p-4 sm:p-5 border border-slate-200/70">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Elder Utterance
                        </span>
                        <span className="text-xs font-medium text-swar-700">
                          {LANG_LABEL[language] || language}
                        </span>
                      </div>
                      <div className="elder-text text-slate-900">
                        {elderTranscript || finalTranscript || "Waiting for elder voice input…"}
                      </div>
                      {mode === "listening" && (
                        <p className="mt-2 text-xs font-medium text-emerald-600">
                          Listening… speak clearly now.
                        </p>
                      )}
                    </div>

                    {assistantText && (
                      <div className="rounded-2xl bg-gradient-to-br from-swar-50 to-indigo-50/60 p-4 sm:p-5 border border-swar-200/80 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-swar-800">
                            SwarExSethu Companion
                          </span>
                          <button
                            onClick={() => speakText(assistantText, language)}
                            className="secondary text-xs py-1 px-2.5"
                            title="Repeat aloud"
                          >
                            <Volume2 className="w-3.5 h-3.5 mr-1 text-swar-600" /> Replay Voice
                          </button>
                        </div>
                        <div className="elder-text text-slate-900">{assistantText}</div>
                      </div>
                    )}
                  </div>

                  {/* Medications Due */}
                  {meds.length > 0 && (
                    <div className="pt-2">
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Medicines Due Now (Voice or Tap)
                        </span>
                        <span className="text-xs text-slate-500">
                          {meds.filter((m) => m.checked).length}/{meds.length} confirmed
                        </span>
                      </div>
                      <MedicationPills meds={meds} onToggle={toggleMed} />
                    </div>
                  )}

                  {/* Session Summary */}
                  {summary && (
                    <div className="rounded-2xl bg-blue-50/90 p-4 border border-blue-200/80">
                      <div className="text-xs font-bold uppercase tracking-wider text-blue-800 mb-1">
                        Clinical Check-In Summary
                      </div>
                      <div className="text-sm text-slate-800 leading-relaxed">{summary}</div>
                    </div>
                  )}
                </>
              )}
            </section>

            {/* Right Companion Rail */}
            <aside className="lg:col-span-4 space-y-6">
              {/* Caregiver & Safety Card */}
              <div className="glass-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-swar-600" />
                    <h3 className="text-base font-bold text-slate-900">Safety &amp; Caregiver Sync</h3>
                  </div>
                  <Link
                    href="/caregiver"
                    className="text-xs font-semibold text-swar-700 hover:underline inline-flex items-center"
                  >
                    Dashboard <ArrowUpRight className="w-3.5 h-3.5 ml-0.5" />
                  </Link>
                </div>

                <div className="rounded-2xl bg-slate-50 p-3.5 border border-slate-200/70 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Session Turns</span>
                    <span className="font-semibold text-slate-800">{turns.length} logged</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Emergency Line</span>
                    <a
                      href={`tel:${profile.emergency_contact || "112"}`}
                      className="font-semibold text-red-600 inline-flex items-center gap-1 hover:underline"
                    >
                      <PhoneCall className="w-3 h-3" /> {profile.emergency_contact || "112"}
                    </a>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Triage Guard</span>
                    <span className="font-semibold text-emerald-700">Active (Red-Flag Ready)</span>
                  </div>
                </div>

                <div className="pt-1">
                  <p className="text-xs text-slate-500 mb-2">
                    Quick demo phrases (click after starting session):
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={!session || mode === "analyzing"}
                      onClick={() =>
                        sendMessage("I took my morning BP tablet and slept well.", 0.98, "en")
                      }
                      className="text-[11px] px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      Routine Check-In
                    </button>
                    <button
                      type="button"
                      disabled={!session || mode === "analyzing"}
                      onClick={() =>
                        sendMessage(
                          "I am having severe chest pain and feeling very dizzy right now.",
                          0.98,
                          "en"
                        )
                      }
                      className="text-[11px] px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      <ShieldAlert className="w-3 h-3" /> Test Red-Flag Triage
                    </button>
                  </div>
                </div>
              </div>

              {/* Evening Wind-Down Raga Player */}
              <WindDown
                ragas={ragas}
                active={windDownActive}
                onToggle={() => setWindDownActive((v) => !v)}
              />
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
