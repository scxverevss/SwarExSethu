"use client";

import { useEffect, useState } from "react";
import { User, Pill, Plus, Save } from "lucide-react";
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
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [form, setForm] = useState({
    elder_name: "",
    age: 70,
    preferred_language: "hi",
    baseline_conditions: "",
    emergency_contact: "",
    caregiver_webhook: "",
    caregiver_email: "",
    caregiver_telegram: "",
  });
  const [medForm, setMedForm] = useState({
    name: "",
    dosage: "",
    time_slot: "morning",
    spoken_alias: "",
  });

  const [editingMedId, setEditingMedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const hydrateForm = (p: any) => {
    setForm({
      elder_name: p?.elder_name || "",
      age: p?.age || 70,
      preferred_language: p?.preferred_language || "hi",
      baseline_conditions: p?.baseline_conditions || "",
      emergency_contact: p?.emergency_contact || "",
      caregiver_webhook: p?.caregiver_webhook || "",
      caregiver_email: p?.caregiver_email || "",
      caregiver_telegram: p?.caregiver_telegram || "",
    });
  };

  const loadMeds = (id: number) => {
    api
      .listMedications(id)
      .then((m: any[]) => setMeds(Array.isArray(m) ? m : []))
      .catch(() => setMeds([]));
  };

  useEffect(() => {
    api
      .listProfiles()
      .then((ps: any[]) => {
        const list = Array.isArray(ps) ? ps : [];
        setProfiles(list);
        if (list.length) {
          setProfile(list[0]);
          hydrateForm(list[0]);
          loadMeds(list[0].id);
        }
      })
      .catch(() => setProfiles([]));
  }, []);

  const selectProfile = (id: number) => {
    const chosen = profiles.find((p) => p.id === id) || null;
    setProfile(chosen);
    setStatusMsg("");
    setErrorMsg("");
    setEditingMedId(null);
    if (chosen) {
      hydrateForm(chosen);
      loadMeds(chosen.id);
    } else {
      setMeds([]);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    setStatusMsg("");
    setErrorMsg("");
    try {
      if (profile?.id) {
        const updated = await api.updateProfile(profile.id, form);
        const merged = updated?.id ? updated : { ...profile, ...form };
        setProfile(merged);
        setProfiles((prev) => prev.map((x) => (x.id === merged.id ? merged : x)));
        setStatusMsg("Profile settings saved.");
      } else {
        const created = await api.createProfile(form);
        setProfiles((prev) => [created, ...prev]);
        setProfile(created);
        loadMeds(created.id);
        setStatusMsg("Profile saved.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Could not save profile.");
    } finally {
      setSaving(false);
    }
  };

  const saveMed = async () => {
    if (!profile?.id || !medForm.name.trim()) return;
    setSaving(true);
    setStatusMsg("");
    setErrorMsg("");
    try {
      if (editingMedId) {
        await api.updateMedication(editingMedId, medForm);
        setStatusMsg("Medicine updated.");
      } else {
        await api.createMedication({ ...medForm, profile_id: profile.id });
        setStatusMsg("Medicine added to schedule.");
      }
      setMedForm({ name: "", dosage: "", time_slot: "morning", spoken_alias: "" });
      setEditingMedId(null);
      loadMeds(profile.id);
    } catch (err: any) {
      setErrorMsg(err.message || "Could not save medicine.");
    } finally {
      setSaving(false);
    }
  };

  const deleteMed = (id: number) => {
    if (!profile?.id) return;
    api
      .updateMedication(id, { is_active: false })
      .then(() => {
        setStatusMsg("Medicine deactivated.");
        loadMeds(profile.id);
      })
      .catch(() => {});
  };

  return (
    <div className="min-h-screen pb-16">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 space-y-6">
        <div className="glass-card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Settings &amp; Medication Management</h1>
            <p className="text-sm text-slate-600 mt-1">
              Manage active elder preferences, caregiver alert endpoints, and daily medication schedules.
            </p>
          </div>

          <div className="flex items-center gap-2.5 min-w-[240px]">
            <User className="w-4 h-4 text-swar-600 shrink-0" />
            <select
              value={profile?.id ?? ""}
              onChange={(e) => selectProfile(Number(e.target.value))}
              className="w-full"
              aria-label="Select elder profile to manage"
            >
              {profiles.length === 0 && <option value="">No profiles available</option>}
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.elder_name} ({p.age})
                </option>
              ))}
            </select>
            {profiles.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  setProfile(null);
                  setForm({
                    elder_name: "",
                    age: 70,
                    preferred_language: "hi",
                    baseline_conditions: "",
                    emergency_contact: "",
                    caregiver_webhook: "",
                    caregiver_email: "",
                    caregiver_telegram: "",
                  });
                }}
                className="secondary text-xs whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add
              </button>
            )}
          </div>
        </div>

        {statusMsg && (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs sm:text-sm text-emerald-800">
            {statusMsg}
          </div>
        )}
        {errorMsg && (
          <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-xs sm:text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        <div className="glass-card p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Profile &amp; Caregiver Channels</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveProfile();
            }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            <div>
              <label>Elder name</label>
              <input
                value={form.elder_name}
                onChange={(e) => setForm({ ...form, elder_name: e.target.value })}
                placeholder="Elder name"
                className="w-full"
              />
            </div>
            <div>
              <label>Age</label>
              <input
                type="number"
                value={form.age}
                onChange={(e) => setForm({ ...form, age: Number(e.target.value) || 70 })}
                className="w-full"
              />
            </div>

            <div>
              <label>Preferred language</label>
              <select
                value={form.preferred_language}
                onChange={(e) => setForm({ ...form, preferred_language: e.target.value })}
                className="w-full"
              >
                {LANG_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Emergency contact</label>
              <input
                value={form.emergency_contact}
                onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })}
                placeholder="112 or emergency number"
                className="w-full"
              />
            </div>

            <div className="sm:col-span-2">
              <label>Baseline conditions</label>
              <input
                value={form.baseline_conditions}
                onChange={(e) => setForm({ ...form, baseline_conditions: e.target.value })}
                placeholder="Hypertension, Diabetes"
                className="w-full"
              />
            </div>

            <div className="sm:col-span-2">
              <label>Caregiver webhook URL</label>
              <input
                value={form.caregiver_webhook}
                onChange={(e) => setForm({ ...form, caregiver_webhook: e.target.value })}
                placeholder="https://your-server/webhook"
                className="w-full"
              />
            </div>

            <div>
              <label>Caregiver email</label>
              <input
                value={form.caregiver_email}
                onChange={(e) => setForm({ ...form, caregiver_email: e.target.value })}
                placeholder="caregiver@example.com"
                className="w-full"
              />
            </div>
            <div>
              <label>Caregiver Telegram</label>
              <input
                value={form.caregiver_telegram}
                onChange={(e) => setForm({ ...form, caregiver_telegram: e.target.value })}
                placeholder="@username or chat id"
                className="w-full"
              />
            </div>

            <div className="sm:col-span-2 pt-2">
              <button type="submit" disabled={saving || (!profile?.id && profiles.length > 0)} className="primary">
                <Save className="w-4 h-4 mr-2" />
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Pill className="w-5 h-5 text-swar-600" />
            <h2 className="text-lg font-bold text-slate-900">Medication Schedule</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label>Medicine name</label>
              <input
                value={medForm.name}
                onChange={(e) => setMedForm({ ...medForm, name: e.target.value })}
                placeholder="Amlodipine"
                className="w-full"
              />
            </div>
            <div>
              <label>Dosage</label>
              <input
                value={medForm.dosage}
                onChange={(e) => setMedForm({ ...medForm, dosage: e.target.value })}
                placeholder="5 mg"
                className="w-full"
              />
            </div>
            <div>
              <label>Time slot</label>
              <select
                value={medForm.time_slot}
                onChange={(e) => setMedForm({ ...medForm, time_slot: e.target.value })}
                className="w-full"
              >
                {TIME_SLOTS.map((t) => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Spoken alias</label>
              <input
                value={medForm.spoken_alias}
                onChange={(e) => setMedForm({ ...medForm, spoken_alias: e.target.value })}
                placeholder="BP ki goli"
                className="w-full"
              />
              <p className="caption mt-1 text-xs">Voice alias used during check-ins</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={saveMed}
              disabled={saving || !profile?.id}
              className="secondary text-sm"
            >
              <Save className="w-4 h-4 mr-1.5" />
              {editingMedId ? "Update Medicine" : "Add Medicine"}
            </button>
            {editingMedId && (
              <button
                type="button"
                onClick={() => {
                  setEditingMedId(null);
                  setMedForm({ name: "", dosage: "", time_slot: "morning", spoken_alias: "" });
                }}
                className="secondary text-sm"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Scheduled medicines</h3>
            <div className="divide-y divide-slate-100">
              {meds.length ? (
                meds.map((m) => (
                  <div
                    key={m.id}
                    className="p-3.5 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 rounded-xl my-1.5"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{m.name}</div>
                      <div className="text-xs text-slate-500">
                        {m.dosage} · {m.time_slot} · {m.is_active ? "active" : "inactive"}
                      </div>
                      {m.spoken_alias && (
                        <div className="text-xs caption mt-0.5">Alias: &ldquo;{m.spoken_alias}&rdquo;</div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMedId(m.id);
                          setMedForm({
                            name: m.name,
                            dosage: m.dosage,
                            time_slot: m.time_slot,
                            spoken_alias: m.spoken_alias || "",
                          });
                        }}
                        className="text-xs font-medium text-swar-700 underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMed(m.id)}
                        className="text-xs font-medium text-red-600 underline"
                      >
                        Deactivate
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 text-center py-4">
                  No medicines scheduled for this profile.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
