"use strict";

import { CheckCircle2, Circle } from "lucide-react";

interface MedPill {
  id: number;
  name: string;
  dosage: string;
  time_slot: string;
  spoken_alias: string;
  checked: boolean;
}

interface MedicationPillsProps {
  meds: MedPill[];
  onToggle: (id: number, taken: boolean) => void;
}

export function MedicationPills({ meds, onToggle }: MedicationPillsProps) {
  if (!meds.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {meds.map((m) => (
        <button
          key={m.id}
          onClick={() => onToggle(m.id, !m.checked)}
          className={`med-pill ${m.checked ? "checked" : "unchecked"}`}
          aria-pressed={m.checked}
          title={m.spoken_alias || m.name}
        >
          {m.checked ? <CheckCircle2 className="w-5 h-5 text-green-600 fill-current" /> : <Circle className="w-5 h-5 text-slate-400" />}
          <div>
            <div className="font-semibold text-slate-800">{m.name}</div>
            <div className="text-xs text-slate-500">{m.dosage} · {m.time_slot}</div>
            {m.spoken_alias && <div className="text-[11px] caption">{m.spoken_alias}</div>}
          </div>
        </button>
      ))}
    </div>
  );
}