"use client";

import { useState, useEffect } from "react";
import SafetyBadge from "./SafetyBadge";
import type { SafetyEvent } from "@/lib/types";

interface EventTimelineProps {
  events: SafetyEvent[];
  onAcknowledge: (eventId: string) => void;
  onAddNote: (eventId: string, residentId: string, note: string) => void;
}

const EVENT_LABELS: Record<string, string> = {
  fall_risk: "Fall Risk",
  possible_fall: "Possible Fall",
  immobility: "Immobility",
  wandering: "Wandering",
  unsafe_posture: "Unsafe Posture",
  seizure_like_motion: "Possible Seizure-Like Movement",
  out_of_frame: "Out of Frame",
  normal: "Normal",
};

const EVENT_ICONS: Record<string, string> = {
  fall_risk: "⚠️",
  possible_fall: "🚨",
  immobility: "🛑",
  wandering: "🚶",
  unsafe_posture: "↗️",
  seizure_like_motion: "⚡",
  out_of_frame: "👁️",
  normal: "✅",
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return `${Math.round(diff / 86400000)}d ago`;
}

// ─── Video clip viewer modal ──────────────────────────────────────────────────
function VideoClipModal({
  clipId,
  eventLabel,
  onClose,
}: {
  clipId: string;
  eventLabel: string;
  onClose: () => void;
}) {
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/video-clips/${clipId}/playback-url`)
      .then((r) => r.json())
      .then((d) => {
        if (d.s3Disabled) {
          setError("S3 not configured in this deployment — demo clips are not playable.");
        } else if (d.playbackUrl) {
          setPlaybackUrl(d.playbackUrl);
        } else {
          setError(d.error ?? "Could not load clip.");
        }
      })
      .catch(() => setError("Failed to load clip URL."))
      .finally(() => setLoading(false));
  }, [clipId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-gray-900 border border-gray-700 rounded-xl p-4 max-w-2xl w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-semibold text-sm">
            📹 Video Clip — {eventLabel}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
            <span className="w-5 h-5 border-2 border-gray-600 border-t-white rounded-full animate-spin mr-2" />
            Loading clip…
          </div>
        )}

        {error && (
          <div className="bg-red-950/50 border border-red-800/60 rounded-lg p-4 text-red-300 text-sm">
            {error}
          </div>
        )}

        {playbackUrl && (
          <video
            src={playbackUrl}
            controls
            autoPlay
            className="w-full rounded-lg bg-black max-h-96"
          />
        )}

        <p className="text-[10px] text-gray-600 mt-2 text-center">
          ⚠️ Prototype only. Not for clinical use. All data is mock/demo data.
        </p>
      </div>
    </div>
  );
}

export default function EventTimeline({ events, onAcknowledge, onAddNote }: EventTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState<Record<string, string>>({});
  const [viewingClip, setViewingClip] = useState<{ clipId: string; label: string } | null>(null);

  const deduplicated = events.filter(
    (e, i, arr) => e.eventType === "normal" || arr.findIndex((x) => x._id === e._id) === i
  );

  return (
    <>
      <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">
        {deduplicated.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-6">
            No events yet — monitoring active
          </p>
        )}

        {deduplicated.map((event) => {
          const isExpanded = expandedId === event._id;
          const isNonStable = event.severity !== "stable";

          return (
            <div
              key={event._id}
              className={`rounded-lg border transition-all duration-200 animate-fade-in
                ${event.severity === "urgent" ? "border-red-800/60 bg-red-950/20" :
                  event.severity === "assist" ? "border-orange-800/60 bg-orange-950/20" :
                  event.severity === "watch" ? "border-yellow-800/60 bg-yellow-950/20" :
                  "border-gray-700/50 bg-gray-800/40"}`}
            >
              {/* Event summary row */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : (event._id ?? null))}
                className="w-full text-left px-3 py-2.5 flex items-start gap-3"
              >
                <span className="text-base mt-0.5 shrink-0">{EVENT_ICONS[event.eventType] ?? "•"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <SafetyBadge severity={event.severity} size="sm" />
                    <span className="text-white text-sm font-medium">
                      {EVENT_LABELS[event.eventType] ?? event.eventType}
                    </span>
                    {event.acknowledged && (
                      <span className="text-[10px] bg-green-900/50 text-green-400 border border-green-800 rounded-full px-1.5 py-0.5">
                        ✓ Acknowledged
                      </span>
                    )}
                    {event.hasVideoClip && (
                      <span className="text-[10px] bg-blue-900/50 text-blue-300 border border-blue-800 rounded-full px-1.5 py-0.5">
                        📹 Video Clip
                      </span>
                    )}
                  </div>
                  <p className="text-gray-400 text-xs mt-0.5 truncate">{event.reason}</p>
                </div>
                <div className="text-right shrink-0 text-[10px] text-gray-500">
                  <div>{formatTimestamp(event.createdAt)}</div>
                  <div className="text-gray-600">{formatRelative(event.createdAt)}</div>
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-3 pb-3 border-t border-gray-700/50 pt-2 space-y-2 animate-fade-in">
                  <p className="text-gray-300 text-xs">{event.reason}</p>
                  <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-gray-400">
                    <span>Confidence: <b className="text-white">{Math.round(event.confidence * 100)}%</b></span>
                    <span>Posture: <b className="text-white">{Math.round(event.signals.postureAngle)}°</b></span>
                    <span>Still: <b className="text-white">{Math.round(event.signals.secondsStill)}s</b></span>
                  </div>

                  {/* View Clip button */}
                  {event.hasVideoClip && event.videoClipId && (
                    <button
                      onClick={() =>
                        setViewingClip({
                          clipId: event.videoClipId!,
                          label: EVENT_LABELS[event.eventType] ?? event.eventType,
                        })
                      }
                      className="w-full text-xs bg-blue-900/50 hover:bg-blue-800/60 text-blue-200 border border-blue-800/60 rounded-lg py-1.5 transition-colors"
                    >
                      📹 View Clip
                    </button>
                  )}

                  {/* Acknowledge button */}
                  {isNonStable && !event.acknowledged && event._id && (
                    <button
                      onClick={() => onAcknowledge(event._id!)}
                      className="w-full text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg py-1.5 transition-colors"
                    >
                      ✓ Acknowledge Alert
                    </button>
                  )}

                  {/* Caregiver note input */}
                  {event._id && (
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={noteText[event._id] ?? ""}
                        onChange={(e) =>
                          setNoteText((prev) => ({ ...prev, [event._id!]: e.target.value }))
                        }
                        placeholder="Add caregiver note…"
                        className="flex-1 text-xs bg-gray-700 text-white rounded-lg px-2 py-1.5 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => {
                          const note = noteText[event._id!]?.trim();
                          if (note && event._id) {
                            onAddNote(event._id, event.residentId, note);
                            setNoteText((prev) => ({ ...prev, [event._id!]: "" }));
                          }
                        }}
                        className="text-xs bg-blue-700 hover:bg-blue-600 text-white rounded-lg px-2.5 py-1.5 transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {viewingClip && (
        <VideoClipModal
          clipId={viewingClip.clipId}
          eventLabel={viewingClip.label}
          onClose={() => setViewingClip(null)}
        />
      )}
    </>
  );
}
