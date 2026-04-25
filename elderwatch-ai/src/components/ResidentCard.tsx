"use client";

import SafetyBadge from "./SafetyBadge";
import type { ResidentProfile, SafetyClassification, SafetySignals } from "@/lib/types";

interface ResidentCardProps {
  resident: ResidentProfile;
  classification: SafetyClassification;
  signals: SafetySignals;
  residents: ResidentProfile[];
  onSelectResident: (id: string) => void;
}

const FALL_RISK_COLOR = {
  Low: "text-green-400",
  Medium: "text-yellow-400",
  High: "text-red-400",
};

const EVENT_LABELS: Record<string, string> = {
  fall_risk: "Fall Risk",
  possible_fall: "Possible Fall",
  immobility: "Immobility",
  wandering: "Wandering",
  unsafe_posture: "Unsafe Posture",
  out_of_frame: "Out of Frame",
  normal: "Normal",
};

// Pulse border style depending on severity
const PULSE_BORDER: Record<string, string> = {
  stable: "border-gray-700",
  watch: "border-yellow-600 animate-pulse-watch",
  assist: "border-orange-500 animate-pulse-assist",
  urgent: "border-red-500 animate-pulse-urgent",
};

const BG_TINT: Record<string, string> = {
  stable: "bg-gray-800",
  watch: "bg-yellow-950/20",
  assist: "bg-orange-950/30",
  urgent: "bg-red-950/30",
};

export default function ResidentCard({
  resident,
  classification,
  signals,
  residents,
  onSelectResident,
}: ResidentCardProps) {
  const { severity, eventType, reason, confidence } = classification;

  return (
    <div
      className={`rounded-xl border-2 p-4 transition-all duration-300 ${PULSE_BORDER[severity]} ${BG_TINT[severity]}`}
    >
      {/* Resident selector */}
      <div className="flex items-center justify-between mb-3">
        <select
          value={resident.id}
          onChange={(e) => onSelectResident(e.target.value)}
          className="bg-gray-700 text-white text-sm rounded-lg px-3 py-1.5 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
        >
          {residents.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} — {r.room}
            </option>
          ))}
        </select>
        <SafetyBadge severity={severity} size="md" pulse />
      </div>

      {/* Profile info */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Name</p>
          <p className="text-white font-semibold">{resident.name}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Room</p>
          <p className="text-white font-semibold">{resident.room}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Age</p>
          <p className="text-gray-300">{resident.age}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Fall Risk</p>
          <p className={`font-semibold ${FALL_RISK_COLOR[resident.fallRisk]}`}>
            {resident.fallRisk}
          </p>
        </div>
        <div className="col-span-2">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Mobility</p>
          <p className="text-gray-300">{resident.mobility}</p>
        </div>
        <div className="col-span-2">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Conditions</p>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {resident.conditions.map((c) => (
              <span key={c} className="text-xs bg-gray-700 text-gray-300 rounded-full px-2 py-0.5">
                {c}
              </span>
            ))}
          </div>
        </div>
        <div className="col-span-2">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Care Notes</p>
          <p className="text-gray-400 text-sm italic">{resident.careNotes}</p>
        </div>
      </div>

      <hr className="border-gray-700 mb-3" />

      {/* Current event */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">Current Status</p>
        <div className="bg-gray-900/60 rounded-lg p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-white">
              {EVENT_LABELS[eventType] ?? eventType}
            </span>
            <span className="text-xs text-gray-400">
              {Math.round(confidence * 100)}% confidence
            </span>
          </div>
          <p className="text-sm text-gray-300">{reason}</p>

          {/* Pose signal summary */}
          <div className="grid grid-cols-3 gap-1 mt-2 text-[10px] font-mono">
            <SignalPill label="Posture" value={`${Math.round(signals.postureAngle)}°`} warn={signals.postureAngle > 35} danger={signals.postureAngle > 60} />
            <SignalPill label="Still" value={signals.secondsStill > 0 ? `${Math.round(signals.secondsStill)}s` : "Moving"} warn={signals.secondsStill > 60} danger={signals.secondsStill > 300} />
            <SignalPill label="Zone" value={signals.insideSafeZone ? "Safe" : "Outside"} danger={!signals.insideSafeZone} />
          </div>
        </div>
      </div>

      {/* Mock data disclaimer */}
      <p className="text-[10px] text-gray-600 mt-3 text-center">
        MOCK DATA ONLY — Not a real resident
      </p>
    </div>
  );
}

function SignalPill({
  label,
  value,
  warn = false,
  danger = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
  danger?: boolean;
}) {
  const color = danger
    ? "bg-red-950/50 text-red-300 border-red-800"
    : warn
    ? "bg-yellow-950/50 text-yellow-300 border-yellow-800"
    : "bg-gray-700/50 text-gray-400 border-gray-600";

  return (
    <div className={`rounded border px-1.5 py-1 text-center ${color}`}>
      <div className="text-gray-500 mb-0.5">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
