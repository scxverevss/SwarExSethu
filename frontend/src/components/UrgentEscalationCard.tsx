"use strict";

import { PhoneCall, AlertCircle, Mail, Send } from "lucide-react";

interface UrgentEscalationCardProps {
  instruction: string;
  emergencyContact: string;
  onCallEmergency: () => void;
  onAcknowledge: () => void;
}

export function UrgentEscalationCard({ instruction, emergencyContact, onCallEmergency, onAcknowledge }: UrgentEscalationCardProps) {
  return (
    <div className="urgent-card animate-pulse">
      <div className="flex items-start gap-3 mb-3">
        <AlertCircle className="w-7 h-7 text-red-600 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-bold text-xl text-red-800">Urgent Escalation</h3>
          <p className="text-sm text-red-700 mt-1">
            High-risk symptoms detected. Normal check-in is paused. Act now.
          </p>
        </div>
      </div>

      <div className="bg-white/60 rounded-xl p-4 mb-4 border border-red-100">
        <p className="text-red-800 font-medium leading-relaxed">{instruction}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={onCallEmergency}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 shadow-lg transition"
        >
          <PhoneCall className="w-5 h-5" /> Call {emergencyContact || "112"}
        </button>
        <button
          onClick={onAcknowledge}
          className="secondary flex items-center justify-center gap-2"
        >
          <Send className="w-4 h-4" /> Acknowledged
        </button>
      </div>
    </div>
  );
}