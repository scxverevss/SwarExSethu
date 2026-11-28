"use client";

import { useCallback, useEffect, useState } from "react";
import { User, Pill, Phone, Mail, Plus, Save, Trash2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { api } from "@/lib/api";

const LANG_OPTIONS: { value: string; label: string }[] = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi / Hinglish" },
  { value: "te", label: "Telugu / Tenglish" },
  { value: "kn", label: "Kannada / Kanglish" },
  { value: "ta", label: "Tamil / Tanglish" },
];

const TIME_SLOTS = ["morning", "afternoon", "night"];

export default function Settings() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [meds, setMeds] = useState<any[]>([]);

  const [form, setForm] = useState({
    elder_name: "", age: 70, preferred_language: "hi",
    baseline_conditions: "", emergency_contact: "",
    caregiver_webhook: "", caregiver_email: "", caregiver_telegram: "",
  });
  const [medForm, setMedForm] = useState({ name: "", dosage: "", time_slot: "morning", spoken_alias: "" });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.listProfiles().then((ps: any[]) => {
      setProfiles(ps);
      if (ps.length) {
        setProfile(ps[0]);
        setForm({
          elder_name: ps[0].elder_name, age: ps[0].age,
          preferred_language: ps[0].preferred_language, baseline_conditions: ps[0].baseline_conditions,
          emergency_contact: ps[0].emergency_contact, caregiver_webhook: ps[0].caregiver_webhook,
          caregiver_email: ps[0].caregiver_email, caregiver_telegram: ps[0].caregiver_telegram,
        });
        loadMeds(ps[0].id);
      }
    });
  }, []);

  const loadMeds = (id: number) => {
    api.listMedications(id).then((m: any[]) => setMeds(m));
  };

  const selectProfile = (p: any) => {
    setProfile(p);
    setForm({
      elder_name: p.elder_name, age: p.age, preferred_language: p.preferred_language,
      baseline_conditions: p.baseline_conditions, emergency_contact: p.emergency_contact,
      caregiver_webhook: p.caregiver_webhook, caregiver_email: p.caregiver_email, caregiver_telegram: p.caregiver_telegram,
    });
    setEditingId(null);
    loadMeds(p.id);
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      if (editingId && profile) {
        await api.updateProfile(profile.id, form);
      } else {
        const p = await api.createProfile(form);
        setProfiles([p, ...profiles]);
        setProfile(p);
        setForm({ ...form, elder_name: "" });
      }
      setEditingId(null);
    } finally { setSaving(false); }
  };

  const saveMed = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      if (editingId) {
        await api.updateMedication(editingId, medForm);
      } else {
        await api.createMedication({ ...medForm, profile_id: profile.id });
      }
      setMedForm({ name: "", dosage: "", time_slot: "morning", spoken_alias: "" });
      setEditingId(null);
      loadMeds(profile.id);
    } finally { setSaving(false); }
  };

  const deleteMed = (id: number) => {
    api.updateMedication(id, { is_active: false }).then(() => loadMeds(profile!.id));
  };

  return (
    <div className="min-h-screen">
      <Navbar />

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <User className="w-5 h-5 text-swar-600" />
                <span className="font-semibold text-slate-800">Elder profile</span>
              </div>
              <select
                value={profile?.id ?? ""}
                onChange={(e) => selectProfile(profiles.find((p) => p.id === Number(e.target.value))!)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3"
              >
                <option value="">Select…</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.elder_name} ({p.age})</option>
                ))}
              </select>
              <button
                onClick={() => {
                  setProfile(null); setEditingId(null);
                  setForm({ elder_name: "", age: 70, preferred_language: "hi", baseline_conditions: "", emergency_contact: "", caregiver_webhook: "", caregiver_email: "", caregiver_telegram: "" });
                }}
                className="secondary text-xs w-full"
              >
                <Plus className="w-3 h-3 mr-1" /> New profile
              </button>
            </div>
          </div>

          <div className="md:col-span-8">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h2 className="font-semibold text-slate-800 mb-4">Profile details</h2>
              <form onSubmit={(e) => { e.preventDefault(); saveProfile(); }} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="label">Elder name</label>
                  <input value={form.elder_name} onChange={(e) => setForm({ ...form, elder_name: e.target.value })} placeholder="e.g. Amma" className="input" />
                </div>
                <div>
                  <label className="label">Age</label>
                  <input type="number" value={form.age} onChange={(e) => setForm({ ...form, age: Number(e.target.value) || 70 })} className="input" />
                </div>
                <div>
                  <label className="label">Preferred language</label>
                  <select value={form.preferred_language} onChange={(e) => setForm({ ...form, preferred_language: e.target.value })} className="input">
                    {LANG_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="label">Baseline conditions</label>
                  <input value={form.baseline_conditions} onChange={(e) => setForm({ ...form, baseline_conditions: e.target.value })} placeholder="e.g. Hypertension, Diabetes" className="input" />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Emergency contact</label>
                  <input value={form.emergency_contact} onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })} placeholder="e.g. 9876543210" className="input" />
                </div>
                <div className="md:col-span-4">
                  <label className="label">Caregiver webhook URL</label>
                  <input value={form.caregiver_webhook} onChange={(e) => setForm({ ...form, caregiver_webhook: e.target.value })} placeholder="https://your-server/webhook" className="input" />
                </div>
                <div className="md:col-span-4">
                  <label className="label">Caregiver email</label>
                  <input value={form.caregiver_email} onChange={(e) => setForm({ ...form, caregiver_email: e.target.value })} placeholder="caregiver@example.com" className="input" />
                </div>
                <div className="md:col-span-4">
                  <label className="label">Caregiver Telegram</label>
                  <input value={form.caregiver_telegram} onChange={(e) => setForm({ ...form, caregiver_telegram: e.target.value })} placeholder="@username or chat id" className="input" />
                </div>
                <div className="md:col-span-2">
                  <button type="submit" disabled={saving} className="primary w-full">{saving ? "Saving…" : "Save profile"}</button>
                </div>
                {editingId && (
                  <button type="button" onClick={() => setEditingId(null)} className="md:col-span-2 secondary w-full">Cancel</button>
                )}
              </form>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="font-semibold text-slate-800 mb-4">Medication schedule</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="label">Medicine name</label>
              <input value={medForm.name} onChange={(e) => setMedForm({ ...medForm, name: e.target.value })} placeholder="e.g. Amlodipine" className="input" />
            </div>
            <div>
              <label className="label">Dosage</label>
              <input value={medForm.dosage} onChange={(e) => setMedForm({ ...medForm, dosage: e.target.value })} placeholder="5 mg" className="input" />
            </div>
            <div>
              <label className="label">Time slot</label>
              <select value={medForm.time_slot} onChange={(e) => setMedForm({ ...medForm, time_slot: e.target.value })} className="input">
                {TIME_SLOTS.map((t) => (
                  <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Spoken alias</label>
              <input value={medForm.spoken_alias} onChange={(e) => setMedForm({ ...medForm, spoken_alias: e.target.value })} placeholder="e.g. BP ki goli" className="input" />
              <p className="caption mt-1">What the elder calls it by voice</p>
            </div>
          </div>
          <button onClick={saveMed} disabled={saving || !profile} className="secondary">
            <Save className="w-4 h-4 mr-1" /> {editingId ? "Update medicine" : "Add medicine"}
          </button>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Current medicines</h3>
            <div className="divide-y divide-slate-100">
              {meds.length ? (
                meds.map((m) => (
                  <div key={m.id} className="p-3 flex items-center justify-between bg-slate-50/50 rounded-lg">
                    <div>
                      <div className="font-medium text-slate-800">{m.name}</div>
                      <div className="text-xs text-slate-500">{m.dosage} · {m.time_slot} · {m.is_active ? "active" : "inactive"}</div>
                      {m.spoken_alias && <div className="text-[11px] caption mt-1">Alias: "{m.spoken_alias}"</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      {editingId === m.id ? (
                        <div className="flex items-center gap-1">
                          <input value={medForm.name} onChange={(e) => setMedForm({ ...medForm, name: e.target.value })} className="input input-sm w-20" />
                          <button onClick={saveMed} className="text-xs text-green-600 font-bold">Save</button>
                          <button onClick={() => setEditingId(null)} className="text-xs text-slate-500">Cancel</button>
                        </div>
                      ) : (
                        <>
                          <button onClick={() => { setEditingId(m.id); setMedForm({ name: m.name, dosage: m.dosage, time_slot: m.time_slot, spoken_alias: m.spoken_alias || "" }); }} className="text-xs text-swar-600 underline">Edit</button>
                          <button onClick={() => deleteMed(m.id)} className="text-xs text-red-600 underline">Deactivate</button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 text-center py-4">No medicines added yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}