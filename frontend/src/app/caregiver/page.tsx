"use client";

import { useEffect, useState } from "react";
import { Bar, Line } from "react-chartjs-2";
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, Send, Phone, Mail } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { api } from "@/lib/api";

export default function Caregiver() {
  const [profile, setProfile] = useState<any>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [digest, setDigest] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [digestPreview, setDigestPreview] = useState("");

  useEffect(() => {
    api.listProfiles().then((ps: any[]) => {
      setProfiles(ps);
      if (ps.length) setProfile(ps[0]);
    });
  }, []);

  const loadData = () => {
    if (!profile) return;
    setLoading(true);
    api.getDigest(profile.id).then((d: any) => { setDigest(d); setLoading(false); });
    api.listAlerts(profile.id).then((a: any[]) => setAlerts(a));
  };

  const sendDigest = async () => {
    if (!profile) return;
    setLoading(true);
    const d = await api.getDigest(profile.id);
    setDigestPreview(JSON.stringify(d, null, 2));
    setLoading(false);
  };

  const ack = (id: number) => {
    api.acknowledgeAlert(id).then(() => {
      setAlerts(alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
    });
  };

  const severityColor = (s: string) => {
    if (s === "urgent_red_flag") return "bg-red-100 text-red-700 border border-red-200";
    if (s === "elevated_watch") return "bg-amber-100 text-amber-700 border border-amber-200";
    return "bg-slate-100 text-slate-600 border border-slate-200";
  };

  const chartData = {
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    datasets: [
      { label: "Symptom severity", data: [2, 3, 1, 4, 2, 1, 0], borderColor: "#e879f9", backgroundColor: "rgba(232,121,249,0.2)", fill: true, tension: 0.3 },
      { label: "Sleep quality (1-5)", data: [4, 3, 5, 2, 4, 4, 5], borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.2)", fill: true, tension: 0.3 },
    ],
  };

  const adherenceData = {
    labels: ["Morning", "Afternoon", "Night"],
    datasets: [{ label: "Adherence %", data: [90, 75, 85], backgroundColor: ["#22c55e", "#eab308", "#ef4444"] }],
  };

  return (
    <div className="min-h-screen">
      <Navbar />

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <label className="text-sm font-medium text-slate-600">Elder</label>
          <select
            value={profile?.id ?? ""}
            onChange={(e) => { setProfile(profiles.find((p) => p.id === Number(e.target.value))); loadData(); }}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full sm:w-64"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.elder_name} ({p.age})</option>
            ))}
          </select>
          <button onClick={loadData} disabled={loading} className="secondary">
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </button>
        </div>

        {!profile ? (
          <p className="text-slate-500">No profiles. Create one in Settings.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                <div className="text-xs text-slate-500">Check-ins (7d)</div>
                <div className="text-2xl font-bold">{digest?.sessions_count ?? "–"}</div>
              </div>
              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                <div className="text-xs text-slate-500">Medication adherence</div>
                <div className="text-2xl font-bold">{digest?.adherence_percent ?? "–"}%</div>
              </div>
              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                <div className="text-xs text-slate-500">Red-flag alerts</div>
                <div className="text-2xl font-bold text-red-600">{digest?.red_flags ?? "–"}</div>
              </div>
              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                <div className="text-xs text-slate-500">Unacknowledged</div>
                <div className="text-2xl font-bold text-slate-800">{alerts.filter((a) => !a.acknowledged).length}</div>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-800">7-day Symptom & Sleep Trend</h3>
                  <span className="text-xs text-slate-500">per session</span>
                </div>
                <div className="h-64"><Line data={chartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } } } /></div>
              </div>
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                <h3 className="font-semibold text-slate-800 mb-4">Medication Adherence</h3>
                <div className="h-64"><Bar data={adherenceData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } } /></div>
                <div className="mt-4 text-sm text-slate-600">Quick-tap check-off pills on the elder's screen sync adherence by voice & tap.</div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-slate-200">
                <h3 className="font-semibold text-slate-800">Recent Sessions & Turns</h3>
                <button onClick={loadData} className="secondary text-xs"><RefreshCw className="w-3 h-3 mr-1" /> Refresh</button>
              </div>
              <div className="divide-y divide-slate-100">
                {digest ? (
                  <div className="p-4"><p className="text-sm text-slate-600">{digest.summary}</p></div>
                ) : (
                  <div className="p-8 text-center text-slate-400">No check-in sessions yet.</div>
                )}
                {sessions.length > 0 && (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Time</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">State</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Severity</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Red Flag</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2 text-slate-600">{new Date(s.started_at).toLocaleString()}</td>
                          <td className="px-4 py-2">{s.state}</td>
                          <td className="px-4 py-2">{s.severity_score ?? "–"}</td>
                          <td className="px-4 py-2">{s.red_flag ? <span className="text-red-600 font-bold">⚠</span> : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-slate-200">
                <h3 className="font-semibold text-slate-800">Caregiver Alerts</h3>
                <button onClick={sendDigest} disabled={loading} className="secondary text-xs">
                  <Send className="w-3 h-3 mr-1" /> {loading ? "Sending…" : "Send Daily Digest Now"}
                </button>
              </div>
              <div className="divide-y divide-slate-100">
                {alerts.length ? (
                  alerts.map((a) => (
                    <div key={a.id} className="p-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${severityColor(a.severity)}`}>
                          {a.severity.replace(/_/g, " ").toUpperCase()}
                        </span>
                        {!a.acknowledged && <button onClick={() => ack(a.id)} className="text-xs text-swar-600 underline">Acknowledge</button>}
                      </div>
                      <div className="text-sm text-slate-700 mb-1">{a.trigger_reason}</div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>{new Date(a.created_at).toLocaleString()}</span>
                        {a.delivery_log && <span>· delivered</span>}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-slate-400">No alerts.</div>
                )}
              </div>
              {digestPreview && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl mt-4">
                  <h4 className="text-xs font-semibold text-slate-600 mb-2">Digest Preview</h4>
                  <pre className="text-xs text-slate-700 overflow-auto max-h-48">{digestPreview}</pre>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}