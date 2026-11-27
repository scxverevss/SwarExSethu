/**
 * SwarExSethu frontend API client.
 * Reads NEXT_PUBLIC_API_URL (default http://localhost:8000).
 */

const BASE = (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL)
  ? process.env.NEXT_PUBLIC_API_URL
  : "http://localhost:8000";

async function request(path: string, opts: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return res;
}

export const api = {
  // ---------- Profiles ----------
  listProfiles: () => request("/api/profiles").then((r) => r.json()),
  createProfile: (body: any) => request("/api/profiles", { method: "POST", body: JSON.stringify(body) }).then((r) => r.json()),
  getProfile: (id: number) => request(`/api/profiles/${id}`).then((r) => r.json()),
  updateProfile: (id: number, body: any) =>
    request(`/api/profiles/${id}`, { method: "PUT", body: JSON.stringify(body) }).then((r) => r.json()),

  // ---------- Medications ----------
  listMedications: (profileId: number) =>
    request(`/api/medications?profile_id=${profileId}`).then((r) => r.json()),
  createMedication: (body: any) =>
    request("/api/medications", { method: "POST", body: JSON.stringify(body) }).then((r) => r.json()),
  updateMedication: (id: number, body: any) =>
    request(`/api/medications/${id}`, { method: "PUT", body: JSON.stringify(body) }).then((r) => r.json()),
  checkInMedication: (medicationId: number, taken: boolean) =>
    request("/api/medications/checkin", {
      method: "POST",
      body: JSON.stringify({ medication_id: medicationId, taken }),
    }).then((r) => r.json()),

  // ---------- Sessions ----------
  startSession: (profileId: number) =>
    request("/api/sessions/start", {
      method: "POST",
      body: JSON.stringify({ profile_id: profileId }),
    }).then((r) => r.json()),
  sendMessage: (sessionId: number, body: { text: string; asr_confidence?: number; snr_db?: number; language?: string }) =>
    request(`/api/sessions/${sessionId}/message`, {
      method: "POST",
      body: JSON.stringify(body),
    }).then((r) => r.json()),
  getSession: (sessionId: number) =>
    request(`/api/sessions/${sessionId}`).then((r) => r.json()),
  listTurns: (sessionId: number) =>
    request(`/api/sessions/${sessionId}/turns`).then((r) => r.json()),

  // ---------- Audio ----------
  transcribeAudio: (blob: Blob) => {
    const form = new FormData();
    form.append("file", blob, "audio.webm");
    return request("/api/audio/transcribe", { method: "POST", body: form, headers: {} as any }).then((r) => r.json());
  },
  synthesizeSpeech: (text: string, language: string) =>
    request(`/api/audio/synthesize?text=${encodeURIComponent(text)}&language=${encodeURIComponent(language)}`)
      .then((r) => r.blob()),

  // ---------- Wind-down ----------
  listRagas: () => request("/api/audio/wind-down/ragas").then((r) => r.json()),

  // ---------- Alerts ----------
  listAlerts: (profileId: number) =>
    request(`/api/alerts?profile_id=${profileId}`).then((r) => r.json()),
  acknowledgeAlert: (alertId: number) =>
    request(`/api/alerts/${alertId}/acknowledge`, { method: "POST" }).then((r) => r.json()),

  // ---------- Digest ----------
  getDigest: (profileId: number, days = 7) =>
    request(`/api/digest?profile_id=${profileId}&days=${days}`).then((r) => r.json()),
};

export type WSMessage = {
  text?: string;
  asr_confidence?: number;
  snr_db?: number;
  language?: string;
};

export function connectWebSocket(sessionId: number, onMessage: (data: any) => void, onClose?: () => void) {
  const ws = new WebSocket(`${BASE.replace("http", "ws")}/api/ws/stream/${sessionId}`);
  ws.onmessage = (ev) => {
    try { onMessage(JSON.parse(ev.data)); } catch { onMessage(ev.data); }
  };
  ws.onclose = () => onClose?.();
  return ws;
}