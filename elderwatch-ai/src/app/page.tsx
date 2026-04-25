"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { MOCK_RESIDENTS } from "@/lib/mockData";
import { DEFAULT_SAFE_ZONE } from "@/lib/poseHelpers";
import { usePoseDetection } from "@/hooks/usePoseDetection";
import { useResidentMonitor } from "@/hooks/useResidentMonitor";
import { useAlerts } from "@/hooks/useAlerts";
import { useVideoRecorder } from "@/hooks/useVideoRecorder";
import ResidentCard from "@/components/ResidentCard";
import EventTimeline from "@/components/EventTimeline";
import AnalyticsCard from "@/components/AnalyticsCard";
import AIAssistant from "@/components/AIAssistant";
import AudioMonitor from "@/components/AudioMonitor";
import type { ResidentProfile, SafetyEvent, VideoClip } from "@/lib/types";

// PoseCamera uses canvas/webcam APIs — load client-only
const PoseCamera = dynamic(() => import("@/components/PoseCamera"), { ssr: false });

// ─────────────────────────────────────────────────────────────────────────────
// ElderWatch AI — Main Dashboard Page
// ─────────────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [residents] = useState<ResidentProfile[]>(MOCK_RESIDENTS);
  const [selectedResidentId, setSelectedResidentId] = useState<string>(MOCK_RESIDENTS[0].id);
  const [mongoConnected, setMongoConnected] = useState(false);
  const [s3Configured, setS3Configured] = useState(false);
  const [elevenLabsConfigured, setElevenLabsConfigured] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [seizureDetectionEnabled, setSeizureDetectionEnabled] = useState(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const [analyticsRefreshKey, setAnalyticsRefreshKey] = useState(0);
  const [isSeedLoading, setIsSeedLoading] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"monitor" | "history">("monitor");

  const selectedResident = residents.find((r) => r.id === selectedResidentId) ?? residents[0];

  // ── Pose detection ────────────────────────────────────────────────────────
  const { landmarks, videoRef, canvasRef, status: poseStatus, errorMessage, stream } = usePoseDetection();

  // ── Safety monitoring ─────────────────────────────────────────────────────
  const { signals, classification, timeline, injectDemoEvent } = useResidentMonitor(
    landmarks,
    selectedResident,
    DEFAULT_SAFE_ZONE,
    { isPaused, seizureDetectionEnabled }
  );

  // ── TTS + visual alerts ───────────────────────────────────────────────────
  useAlerts(classification, selectedResident);

  // ── Critical event video recording (with optional mic audio) ─────────────
  const { recordingStatus, statusMessage: recordingMessage, triggerDemo } = useVideoRecorder(
    stream,
    classification,
    selectedResident,
    micStreamRef.current,
    isPaused
  );

  // ── Combined demo trigger: inject event into timeline + start recording ──
  const handleTriggerDemo = useCallback(() => {
    injectDemoEvent("possible_fall", "urgent");
    triggerDemo();
  }, [injectDemoEvent, triggerDemo]);

  // ── Check MongoDB + S3 connection on mount ───────────────────────────────
  useEffect(() => {
    fetch("/api/residents")
      .then((r) => r.json())
      .then((d) => setMongoConnected(d.mongoConnected === true))
      .catch(() => setMongoConnected(false));

    fetch("/api/video-clips/presign-upload")
      .then((r) => r.json())
      .then((d) => setS3Configured(d.s3Configured === true))
      .catch(() => setS3Configured(false));

    fetch("/api/audio/analyze")
      .then((r) => r.json())
      .then((d) => setElevenLabsConfigured(d.elevenLabsConfigured === true))
      .catch(() => setElevenLabsConfigured(false));
  }, []);

  // ── Acknowledge event ─────────────────────────────────────────────────────
  const handleAcknowledge = useCallback(async (eventId: string) => {
    try {
      await fetch(`/api/events/${eventId}/acknowledge`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acknowledgedBy: "Demo Caregiver" }),
      });
      setAnalyticsRefreshKey((k) => k + 1);
    } catch {
      // Non-fatal
    }
  }, []);

  // ── Add caregiver note ────────────────────────────────────────────────────
  const handleAddNote = useCallback(
    async (eventId: string, residentId: string, note: string) => {
      try {
        await fetch(`/api/events/${eventId}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ residentId, note, createdBy: "Demo Caregiver" }),
        });
      } catch {
        // Non-fatal
      }
    },
    []
  );

  // ── Seed demo data ────────────────────────────────────────────────────────
  const handleSeed = async () => {
    setIsSeedLoading(true);
    setSeedMessage(null);
    try {
      const res = await fetch("/api/seed", { method: "POST" });
      const data = await res.json();
      setSeedMessage(data.message ?? "Done");
      if (data.s3Configured !== undefined) setS3Configured(data.s3Configured);
      setAnalyticsRefreshKey((k) => k + 1);
    } catch {
      setSeedMessage("Seed failed. Check server logs.");
    } finally {
      setIsSeedLoading(false);
      setTimeout(() => setSeedMessage(null), 4000);
    }
  };

  const severityGlow: Record<string, string> = {
    stable: "",
    watch: "shadow-yellow-500/20 shadow-lg",
    assist: "shadow-orange-500/30 shadow-xl",
    urgent: "shadow-red-500/40 shadow-2xl",
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="border-b border-gray-800 bg-slate-900/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-sm font-bold">
              EW
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">ElderWatch AI</h1>
              <p className="text-gray-500 text-xs">Real-time visual safety monitoring</p>
            </div>
          </div>

          {/* Status indicators */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {isPaused && (
              <span className="text-xs font-bold text-yellow-300 bg-yellow-900/60 border border-yellow-700 rounded-lg px-3 py-1.5 animate-pulse">
                ⏸ MONITORING PAUSED
              </span>
            )}
            <StatusPill
              active={poseStatus === "running" && !isPaused}
              label={isPaused ? "Paused" : poseStatus === "running" ? "Camera Live" : "Camera " + poseStatus}
              color={isPaused ? "yellow" : poseStatus === "running" ? "green" : poseStatus === "loading" ? "yellow" : "red"}
            />
            <StatusPill
              active={mongoConnected}
              label={mongoConnected ? "MongoDB Connected" : "Demo Mode"}
              color={mongoConnected ? "green" : "yellow"}
            />
            <StatusPill
              active={s3Configured}
              label={s3Configured ? "S3 Ready" : "S3 Off"}
              color={s3Configured ? "green" : "yellow"}
            />
            <StatusPill
              active={elevenLabsConfigured}
              label={elevenLabsConfigured ? "STT Ready" : "STT Off"}
              color={elevenLabsConfigured ? "green" : "yellow"}
            />
            {/* Pause / Resume */}
            <button
              onClick={() => setIsPaused((p) => !p)}
              className={`text-xs rounded-lg px-3 py-1.5 transition-colors border font-medium ${
                isPaused
                  ? "bg-green-900/70 hover:bg-green-800/80 text-green-200 border-green-700"
                  : "bg-yellow-900/70 hover:bg-yellow-800/80 text-yellow-200 border-yellow-700"
              }`}
            >
              {isPaused ? "▶ Resume Monitoring" : "⏸ Pause Monitoring"}
            </button>
            <button
              onClick={handleTriggerDemo}
              disabled={poseStatus !== "running" || isPaused}
              className="text-xs bg-red-900/70 hover:bg-red-800/80 disabled:bg-gray-700 disabled:text-gray-500 text-red-200 border border-red-800/60 rounded-lg px-3 py-1.5 transition-colors"
            >
              ⚡ Trigger Critical Event
            </button>
            <button
              onClick={handleSeed}
              disabled={isSeedLoading}
              className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg px-3 py-1.5 transition-colors"
            >
              {isSeedLoading ? "Seeding…" : "Seed Demo Data"}
            </button>
          </div>
        </div>

        {/* Disclaimer banner */}
        <div className="bg-amber-950/50 border-t border-amber-900/50 px-4 py-1.5 text-center">
          <p className="text-amber-400 text-xs">
            ⚠️ <strong>Prototype only.</strong> Not a medical device. Do not use for real patient care.
            All resident data shown is <strong>mock/demo data only</strong>.
          </p>
        </div>
      </header>

      {/* ── Seed message toast ────────────────────────────────────────────── */}
      {seedMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-green-900 text-green-200 border border-green-700 rounded-xl px-4 py-2 text-sm shadow-xl animate-fade-in">
          {seedMessage}
        </div>
      )}

      {/* ── Recording status toast ────────────────────────────────────────── */}
      {recordingMessage && (
        <div className={`fixed top-20 right-4 z-50 rounded-xl px-4 py-2 text-sm shadow-xl border animate-fade-in flex items-center gap-2
          ${recordingStatus === "capturing" ? "bg-red-900 text-red-200 border-red-700" :
            recordingStatus === "uploading" ? "bg-blue-900 text-blue-200 border-blue-700" :
            recordingStatus === "saved" ? "bg-green-900 text-green-200 border-green-700" :
            recordingStatus === "s3-disabled" ? "bg-yellow-900/80 text-yellow-200 border-yellow-700" :
            "bg-red-900 text-red-200 border-red-700"}`}
        >
          {recordingStatus === "capturing" && (
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          )}
          {recordingStatus === "uploading" && (
            <span className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-300 rounded-full animate-spin" />
          )}
          {recordingMessage}
        </div>
      )}

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-[1400px] mx-auto w-full px-4 py-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-5">

        {/* ── Left column: Camera + Analytics + AI ─────────────────────── */}
        <div className="flex flex-col gap-5">

          {/* Camera feed */}
          <div className={`rounded-xl overflow-hidden transition-shadow duration-500 ${severityGlow[classification.severity]}`}>
            <div className="flex items-center justify-between px-1 mb-2">
              <h2 className="text-gray-300 text-sm font-medium flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                Live Feed — {selectedResident.room}
              </h2>
              <span className="text-xs text-gray-600">MediaPipe Pose Landmarker</span>
            </div>
            <PoseCamera
              videoRef={videoRef}
              canvasRef={canvasRef}
              landmarks={landmarks}
              status={poseStatus}
              errorMessage={errorMessage}
              safeZone={DEFAULT_SAFE_ZONE}
              severity={classification.severity}
            />
          </div>

          {/* Experimental seizure detection toggle */}
          <div className="flex items-center gap-2.5 bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={seizureDetectionEnabled}
                onChange={(e) => setSeizureDetectionEnabled(e.target.checked)}
                className="w-3.5 h-3.5 accent-purple-500"
              />
              <span className="text-xs text-gray-400">
                <span className="text-purple-300 font-medium">Experimental:</span> Seizure-like movement detection
              </span>
            </label>
            <span className="text-[10px] text-gray-600 ml-auto">
              {seizureDetectionEnabled ? "ON — requires 6s sustained motion" : "OFF (default — prevents false positives)"}
            </span>
          </div>

          {/* Analytics + AI + Audio Monitor in a 3-col grid on wider screens */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnalyticsCard mongoConnected={mongoConnected} refreshTrigger={analyticsRefreshKey} />
            <AIAssistant resident={selectedResident} classification={classification} />
            <AudioMonitor
              resident={selectedResident}
              isPaused={isPaused}
              onCriticalAudioDetected={triggerDemo}
              onInjectDemoEvent={injectDemoEvent as (eventType: string, severity: string) => void}
              onMicStream={(s) => { micStreamRef.current = s; }}
            />
          </div>
        </div>

        {/* ── Right column: Resident panel + Timeline ───────────────────── */}
        <div className="flex flex-col gap-4">

          {/* Resident card */}
          <ResidentCard
            resident={selectedResident}
            classification={classification}
            signals={signals}
            residents={residents}
            onSelectResident={setSelectedResidentId}
          />

          {/* Tabs: Monitor timeline vs History */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 flex flex-col">
            <div className="flex border-b border-gray-700">
              <TabButton
                active={activeTab === "monitor"}
                onClick={() => setActiveTab("monitor")}
                label="Live Events"
              />
              <TabButton
                active={activeTab === "history"}
                onClick={() => setActiveTab("history")}
                label="History"
              />
            </div>

            <div className="p-3">
              {activeTab === "monitor" && (
                <EventTimeline
                  events={timeline.filter((e) => e.eventType !== "normal")}
                  onAcknowledge={handleAcknowledge}
                  onAddNote={handleAddNote}
                />
              )}
              {activeTab === "history" && (
                <ResidentHistoryPanel residentId={selectedResident.id} />
              )}
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-800 py-3 px-4 text-center text-xs text-gray-700">
        ElderWatch AI — Prototype · Hackathon Demo · Not for clinical use ·{" "}
        <span className="text-gray-600">Mock resident data only</span>
      </footer>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatusPill({
  active,
  label,
  color,
}: {
  active: boolean;
  label: string;
  color: "green" | "yellow" | "red";
}) {
  const dotColor =
    color === "green" ? "bg-green-400" : color === "yellow" ? "bg-yellow-400" : "bg-red-400";
  const textColor =
    color === "green" ? "text-green-300" : color === "yellow" ? "text-yellow-300" : "text-red-300";

  return (
    <div className="flex items-center gap-1.5 bg-gray-800 rounded-full px-2.5 py-1 border border-gray-700">
      <div className={`w-1.5 h-1.5 rounded-full ${dotColor} ${active ? "animate-pulse" : ""}`} />
      <span className={`text-xs ${textColor}`}>{label}</span>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "text-blue-400 border-b-2 border-blue-400"
          : "text-gray-500 hover:text-gray-300"
      }`}
    >
      {label}
    </button>
  );
}

// ─── Resident history panel ────────────────────────────────────────────────────
function ResidentHistoryPanel({ residentId }: { residentId: string }) {
  const [history, setHistory] = useState<{
    totalEventsToday: number;
    urgentEvents: number;
    assistEvents: number;
    watchEvents: number;
    totalVideoClips: number;
    latestVideoClipAt: string | null;
    mostCommonEventType: string | null;
    lastEventAt: string | null;
    recentEvents: SafetyEvent[];
    videoClips: VideoClip[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewingClip, setViewingClip] = useState<{ id: string; label: string } | null>(null);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [clipLoading, setClipLoading] = useState(false);
  const [clipError, setClipError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/residents/${residentId}/history`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHistory(d))
      .catch(() => setHistory(null))
      .finally(() => setLoading(false));
  }, [residentId]);

  const handleViewClip = async (clipId: string, label: string) => {
    setViewingClip({ id: clipId, label });
    setClipUrl(null);
    setClipError(null);
    setClipLoading(true);
    try {
      const res = await fetch(`/api/video-clips/${clipId}/playback-url`);
      const data = await res.json();
      if (data.s3Disabled) {
        setClipError("S3 not configured — demo clips are not playable in this deployment.");
      } else if (data.playbackUrl) {
        setClipUrl(data.playbackUrl);
      } else {
        setClipError(data.error ?? "Could not load clip.");
      }
    } catch {
      setClipError("Failed to load clip URL.");
    } finally {
      setClipLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 bg-gray-700/40 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!history) {
    return <p className="text-gray-500 text-sm text-center py-4">History unavailable</p>;
  }

  const EVENT_LABELS: Record<string, string> = {
    fall_risk: "Fall Risk",
    possible_fall: "Possible Fall",
    immobility: "Immobility",
    wandering: "Wandering",
    unsafe_posture: "Unsafe Posture",
    seizure_like_motion: "Seizure-Like Motion",
    out_of_frame: "Out of Frame",
    audio_distress: "Audio Distress",
    possible_distress_sound: "Distress Sound",
    possible_fall_sound: "Fall Sound",
    possible_choking: "Possible Choking",
  };

  return (
    <div className="space-y-3">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-700/40 rounded-lg p-2">
          <p className="text-gray-500">Today</p>
          <p className="text-white font-bold text-lg">{history.totalEventsToday}</p>
          <p className="text-gray-500">events</p>
        </div>
        <div className="bg-red-950/30 rounded-lg p-2 border border-red-900/40">
          <p className="text-gray-500">Urgent (all time)</p>
          <p className="text-red-300 font-bold text-lg">{history.urgentEvents}</p>
        </div>
        <div className="bg-orange-950/30 rounded-lg p-2 border border-orange-900/40">
          <p className="text-gray-500">Assist</p>
          <p className="text-orange-300 font-bold text-lg">{history.assistEvents}</p>
        </div>
        <div className="bg-blue-950/30 rounded-lg p-2 border border-blue-900/40">
          <p className="text-gray-500">Video Clips</p>
          <p className="text-blue-300 font-bold text-lg">{history.totalVideoClips ?? 0}</p>
        </div>
      </div>

      {history.mostCommonEventType && (
        <p className="text-xs text-gray-400">
          Most common:{" "}
          <span className="text-white font-medium">
            {EVENT_LABELS[history.mostCommonEventType] ?? history.mostCommonEventType}
          </span>
        </p>
      )}

      {/* Video clips list */}
      {(history.videoClips ?? []).length > 0 && (
        <div>
          <p className="text-[11px] text-gray-500 font-medium mb-1.5">📹 Video Clips</p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
            {(history.videoClips ?? []).map((clip) => (
              <div
                key={clip._id}
                className="flex items-center gap-2 text-xs bg-blue-950/20 border border-blue-900/30 rounded-lg p-2"
              >
                <span className="text-blue-400 shrink-0">📹</span>
                <div className="flex-1 min-w-0">
                  <span className="text-blue-200">{EVENT_LABELS[clip.eventType] ?? clip.eventType}</span>
                  <span className="text-gray-600 ml-1.5">
                    {new Date(clip.createdAt).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="text-gray-600 ml-1">· {clip.durationSeconds}s</span>
                </div>
                {clip._id && (
                  <button
                    onClick={() => handleViewClip(clip._id!, EVENT_LABELS[clip.eventType] ?? clip.eventType)}
                    className="shrink-0 text-[10px] bg-blue-800/50 hover:bg-blue-700/60 text-blue-200 rounded px-2 py-0.5 transition-colors"
                  >
                    View
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clip viewer modal */}
      {viewingClip && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setViewingClip(null)}
        >
          <div
            className="relative bg-gray-900 border border-gray-700 rounded-xl p-4 max-w-2xl w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold text-sm">📹 {viewingClip.label}</h3>
              <button onClick={() => setViewingClip(null)} className="text-gray-500 hover:text-white text-lg">✕</button>
            </div>
            {clipLoading && (
              <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
                <span className="w-5 h-5 border-2 border-gray-600 border-t-white rounded-full animate-spin mr-2" />
                Loading clip…
              </div>
            )}
            {clipError && (
              <div className="bg-red-950/50 border border-red-800/60 rounded-lg p-4 text-red-300 text-sm">{clipError}</div>
            )}
            {clipUrl && (
              <video src={clipUrl} controls autoPlay className="w-full rounded-lg bg-black max-h-96" />
            )}
            <p className="text-[10px] text-gray-600 mt-2 text-center">
              ⚠️ Prototype only. Not for clinical use. All data is mock/demo data.
            </p>
          </div>
        </div>
      )}

      {/* Recent events list */}
      <div>
        <p className="text-[11px] text-gray-500 font-medium mb-1.5">Recent Events</p>
        <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
          {(history.recentEvents ?? []).length === 0 && (
            <p className="text-gray-600 text-xs text-center py-4">No events recorded</p>
          )}
          {(history.recentEvents ?? []).map((e) => (
            <div
              key={e._id}
              className="flex items-start gap-2 text-xs text-gray-400 bg-gray-700/30 rounded-lg p-2"
            >
              <span
                className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                  e.severity === "urgent"
                    ? "bg-red-400"
                    : e.severity === "assist"
                    ? "bg-orange-400"
                    : e.severity === "watch"
                    ? "bg-yellow-400"
                    : "bg-green-400"
                }`}
              />
              <div className="flex-1 min-w-0">
                <span className="text-white">{EVENT_LABELS[e.eventType] ?? e.eventType}</span>
                {e.source === "audio_monitor" && <span className="ml-1 text-purple-400 text-[10px]">🎙️</span>}
                {e.hasVideoClip && <span className="ml-1 text-blue-400 text-[10px]">📹</span>}
                <span className="text-gray-600 ml-1.5">
                  {new Date(e.createdAt).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
