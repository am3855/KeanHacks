"use client";

import { useState, useEffect, useRef } from "react";
import SafetyBadge from "./SafetyBadge";

export interface FeedAlert {
  feedId: string;
  room: string;
  resident: string;
  residentId: string;
  severity: "stable" | "watch" | "assist" | "urgent";
  eventType: string;
  reason: string;
  confidence: number;
  alertSince: number;
}

interface FacilityAlertPanelProps {
  alerts: FeedAlert[];
  onMarkCare?: (feedId: string) => void;
  onSaveToHistory?: (alert: FeedAlert) => Promise<void>;
  onSaveAll?: () => Promise<void>;
}

const EVENT_LABELS: Record<string, string> = {
  normal: "Normal",
  possible_fall: "Possible Fall",
  fall_risk: "Fall Risk",
  wandering: "Wandering",
  possible_choking: "Possible Choking",
  unsafe_posture: "Unsafe Posture",
  immobility: "Immobility",
  audio_distress: "Audio Distress",
  possible_distress_sound: "Distress Sound",
  possible_fall_sound: "Fall Sound",
};

const SEVERITY_ORDER: Record<string, number> = { urgent: 0, assist: 1, watch: 2, stable: 3 };

function useTickingClock(intervalMs = 1000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

function formatWaitTime(alertSince: number): string {
  const secs = Math.max(0, Math.floor((Date.now() - alertSince) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${mins}m ${rem}s`;
}

export default function FacilityAlertPanel({
  alerts,
  onMarkCare,
  onSaveToHistory,
  onSaveAll,
}: FacilityAlertPanelProps) {
  useTickingClock();

  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [markedIds, setMarkedIds] = useState<Set<string>>(new Set());
  const [savingAll, setSavingAll] = useState(false);
  const [savedAllMsg, setSavedAllMsg] = useState<string | null>(null);

  // Clear saved/marked state when alerts change identity
  const prevAlertIdsRef = useRef<string>("");
  useEffect(() => {
    const key = alerts.map(a => a.feedId + a.severity).join(",");
    if (key !== prevAlertIdsRef.current) {
      prevAlertIdsRef.current = key;
      // Clear saved status for feeds that went back to stable
      const stableIds = alerts.filter(a => a.severity === "stable").map(a => a.feedId);
      if (stableIds.length > 0) {
        setSavedIds(prev => { const s = new Set(prev); stableIds.forEach(id => s.delete(id)); return s; });
        setMarkedIds(prev => { const s = new Set(prev); stableIds.forEach(id => s.delete(id)); return s; });
      }
    }
  }, [alerts]);

  const activeAlerts = alerts
    .filter(a => a.severity !== "stable")
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const handleSave = async (alert: FeedAlert) => {
    if (savingIds.has(alert.feedId) || savedIds.has(alert.feedId)) return;
    setSavingIds(prev => new Set(prev).add(alert.feedId));
    try {
      await onSaveToHistory?.(alert);
      setSavedIds(prev => new Set(prev).add(alert.feedId));
    } catch {
      // Non-fatal
    } finally {
      setSavingIds(prev => { const s = new Set(prev); s.delete(alert.feedId); return s; });
    }
  };

  const handleSaveAll = async () => {
    if (savingAll || activeAlerts.length === 0) return;
    setSavingAll(true);
    try {
      await onSaveAll?.();
      setSavedIds(new Set(activeAlerts.map(a => a.feedId)));
      const count = activeAlerts.length;
      setSavedAllMsg(`${count} alert${count !== 1 ? "s" : ""} saved to history`);
      setTimeout(() => setSavedAllMsg(null), 3500);
    } catch {
      setSavedAllMsg("Save failed");
      setTimeout(() => setSavedAllMsg(null), 3000);
    } finally {
      setSavingAll(false);
    }
  };

  const handleMarkCare = (feedId: string) => {
    setMarkedIds(prev => new Set(prev).add(feedId));
    onMarkCare?.(feedId);
  };

  const urgentCount = activeAlerts.filter(a => a.severity === "urgent").length;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl flex flex-col min-h-0 xl:h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-gray-700 shrink-0">
        <div>
          <h3 className="text-white font-semibold text-sm">Facility Alert Panel</h3>
          <p className="text-gray-500 text-[10px] mt-0.5">Simulated multi-room monitoring</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-1.5 bg-gray-700/50 rounded-full px-2.5 py-1">
            <div className={`w-1.5 h-1.5 rounded-full ${urgentCount > 0 ? "bg-red-400 animate-pulse" : activeAlerts.length > 0 ? "bg-yellow-400 animate-pulse" : "bg-green-400"}`} />
            <span className="text-[10px] text-gray-300">
              {activeAlerts.length === 0 ? "All stable" : `${activeAlerts.length} alert${activeAlerts.length !== 1 ? "s" : ""}`}
            </span>
          </div>
          {activeAlerts.length > 0 && (
            <button
              onClick={handleSaveAll}
              disabled={savingAll || activeAlerts.every(a => savedIds.has(a.feedId))}
              className="text-[10px] bg-blue-900/60 hover:bg-blue-800/70 disabled:opacity-40 text-blue-200 border border-blue-800/50 rounded-lg px-2.5 py-1 transition-colors whitespace-nowrap"
            >
              {savingAll ? "Saving…" : "Save All Alerts"}
            </button>
          )}
          {savedAllMsg && (
            <span className="text-[10px] text-green-400">{savedAllMsg}</span>
          )}
        </div>
      </div>

      {/* Alert list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar min-h-[200px]">
        {activeAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-10 h-10 rounded-full bg-green-900/40 border border-green-800/40 flex items-center justify-center mb-3">
              <span className="text-green-400 text-lg">✓</span>
            </div>
            <p className="text-gray-400 text-sm font-medium">All residents stable</p>
            <p className="text-gray-600 text-[10px] mt-1">No active alerts from any feed</p>
          </div>
        ) : (
          activeAlerts.map(alert => {
            const isUrgent = alert.severity === "urgent";
            const isAssist = alert.severity === "assist";
            const borderClass = isUrgent
              ? "bg-red-950/30 border-red-800/50"
              : isAssist
              ? "bg-orange-950/30 border-orange-800/50"
              : "bg-yellow-950/30 border-yellow-800/40";
            const dotClass = isUrgent ? "bg-red-400" : isAssist ? "bg-orange-400" : "bg-yellow-400";
            const labelColor = isUrgent ? "#fca5a5" : isAssist ? "#fdba74" : "#fde047";
            const isCared = markedIds.has(alert.feedId);
            const isSaved = savedIds.has(alert.feedId);
            const isSavingThis = savingIds.has(alert.feedId);

            return (
              <div
                key={alert.feedId}
                className={`rounded-xl border p-3 transition-all duration-300 ${borderClass} ${isCared ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${dotClass} ${isUrgent ? "animate-pulse" : ""}`} />
                    <div>
                      <p className="text-white text-xs font-semibold leading-tight">{alert.resident}</p>
                      <p className="text-gray-400 text-[10px]">{alert.room}</p>
                    </div>
                  </div>
                  <SafetyBadge severity={alert.severity} size="sm" pulse={isUrgent} />
                </div>

                <div className="mb-2">
                  <p className="text-[11px] font-semibold" style={{ color: labelColor }}>
                    {EVENT_LABELS[alert.eventType] ?? alert.eventType}
                  </p>
                  <p className="text-gray-400 text-[10px] mt-0.5 leading-relaxed line-clamp-2">{alert.reason}</p>
                </div>

                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 text-[9px] text-gray-500 flex-wrap">
                    <span>Active {formatWaitTime(alert.alertSince)}</span>
                    <span>·</span>
                    <span>{Math.round(alert.confidence * 100)}% conf.</span>
                    {isCared && <span className="text-green-400 font-medium">✓ In care</span>}
                    {isSaved && <span className="text-blue-400 font-medium">✓ Saved</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleMarkCare(alert.feedId)}
                      disabled={isCared}
                      className="text-[9px] bg-green-900/50 hover:bg-green-800/60 disabled:opacity-40 text-green-200 border border-green-800/40 rounded px-1.5 py-0.5 transition-colors whitespace-nowrap"
                    >
                      {isCared ? "In Care" : "Mark Care"}
                    </button>
                    <button
                      onClick={() => handleSave(alert)}
                      disabled={isSavingThis || isSaved}
                      className="text-[9px] bg-blue-900/50 hover:bg-blue-800/60 disabled:opacity-40 text-blue-200 border border-blue-800/40 rounded px-1.5 py-0.5 transition-colors"
                    >
                      {isSavingThis ? "…" : isSaved ? "Saved" : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="px-4 py-2 border-t border-gray-700 shrink-0">
        <p className="text-[9px] text-gray-600 text-center">
          Simulated alerts · Not for clinical use · Prototype only
        </p>
      </div>
    </div>
  );
}
