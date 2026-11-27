"use strict";

type Status = "idle" | "listening" | "analyzing" | "speaking" | "clarifying";

const STYLE: Record<Status, string> = {
  idle: "status-idle",
  listening: "status-listening",
  analyzing: "status-analyzing",
  speaking: "status-speaking",
  clarifying: "status-clarifying",
};

const LABEL: Record<Status, string> = {
  idle: "Ready",
  listening: "Listening",
  analyzing: "Analyzing Tone & Words",
  speaking: "Speaking",
  clarifying: "Clarifying",
};

interface StatusPillProps { status: Status; subtitle?: string; }
export function StatusPill({ status, subtitle }: StatusPillProps) {
  return (
    <span className={`status-pill ${STYLE[status]}`}>
      <span className="w-2 h-2 rounded-full bg-current"></span>
      {LABEL[status]} {subtitle ? `· ${subtitle}` : ""}
    </span>
  );
}