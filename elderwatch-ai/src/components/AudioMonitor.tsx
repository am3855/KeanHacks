"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { ResidentProfile } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// AudioMonitor — Listens via microphone, sends 6-second audio chunks to
// /api/audio/analyze (ElevenLabs STT), and surfaces distress/choking alerts.
//
// Recording pattern: record CHUNK_DURATION_MS → stop → onstop sends to API →
// start next chunk immediately. This avoids the requestData() race condition.
// ─────────────────────────────────────────────────────────────────────────────

type MicStatus =
  | "idle"
  | "requesting"
  | "listening"
  | "transcribing"
  | "error"
  | "unsupported";

interface AudioClassification {
  eventType: string;
  severity: string;
  confidence: number;
  reason: string;
  matchedKeywords: string[];
  matchedAudioTags: string[];
}

export interface AudioMonitorProps {
  resident: ResidentProfile | null;
  isPaused?: boolean;
  /** Called when urgent/assist audio event detected — triggers clip recording */
  onCriticalAudioDetected?: () => void;
  /** Injects a demo event into the live timeline */
  onInjectDemoEvent?: (eventType: string, severity: string) => void;
  /** Exposes mic stream so video recorder can blend audio into clips */
  onMicStream?: (stream: MediaStream | null) => void;
}

const CHUNK_DURATION_MS = 6000; // 6-second analysis windows

export default function AudioMonitor({
  resident,
  isPaused = false,
  onCriticalAudioDetected,
  onInjectDemoEvent,
  onMicStream,
}: AudioMonitorProps) {
  const [micStatus, setMicStatus] = useState<MicStatus>("idle");
  const [elevenLabsConfigured, setElevenLabsConfigured] = useState<boolean | null>(null);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const [lastClassification, setLastClassification] = useState<AudioClassification | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Use refs for everything that needs to be stable across async callbacks
  const isListeningRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const residentRef = useRef(resident);
  const isPausedRef = useRef(isPaused);
  const onCriticalRef = useRef(onCriticalAudioDetected);
  const onInjectRef = useRef(onInjectDemoEvent);
  const onMicStreamRef = useRef(onMicStream);

  useEffect(() => { residentRef.current = resident; }, [resident]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { onCriticalRef.current = onCriticalAudioDetected; }, [onCriticalAudioDetected]);
  useEffect(() => { onInjectRef.current = onInjectDemoEvent; }, [onInjectDemoEvent]);
  useEffect(() => { onMicStreamRef.current = onMicStream; }, [onMicStream]);

  // Check ElevenLabs status on mount
  useEffect(() => {
    fetch("/api/audio/analyze")
      .then((r) => r.json())
      .then((d) => setElevenLabsConfigured(d.elevenLabsConfigured === true))
      .catch(() => setElevenLabsConfigured(false));
  }, []);

  // ── Send a completed audio chunk to the API ──────────────────────────────────
  const sendChunk = useCallback(async (blob: Blob) => {
    const currentResident = residentRef.current;
    console.log("[AudioMonitor] Chunk ready — size:", blob.size, "bytes");

    if (!currentResident) {
      console.log("[AudioMonitor] No resident selected — skipping analysis");
      return;
    }
    if (blob.size < 500) {
      console.log("[AudioMonitor] Chunk too small — skipping");
      return;
    }
    if (isPausedRef.current) {
      console.log("[AudioMonitor] Paused — skipping analysis");
      return;
    }

    setMicStatus("transcribing");
    try {
      const form = new FormData();
      form.append("audio", blob, "chunk.webm");
      form.append("residentId", currentResident.id);
      form.append("residentName", currentResident.name);
      form.append("room", currentResident.room);

      const res = await fetch("/api/audio/analyze", { method: "POST", body: form });
      const data = await res.json();
      console.log("[AudioMonitor] API response:", data);

      if (data.elevenLabsDisabled) {
        console.log("[AudioMonitor] ElevenLabs not configured");
      } else {
        if (data.transcript) {
          setLastTranscript(data.transcript || "(no speech)");
        }
        if (data.classification) {
          setLastClassification(data.classification);
        }
        if (data.shouldRecordCriticalClip) {
          console.log("[AudioMonitor] Critical event — triggering clip recording");
          onCriticalRef.current?.();
          if (data.classification) {
            onInjectRef.current?.(data.classification.eventType, data.classification.severity);
          }
        }
      }
    } catch (err) {
      console.warn("[AudioMonitor] API call failed:", err);
    } finally {
      if (isListeningRef.current) setMicStatus("listening");
    }
  }, []);

  // ── Record one chunk and schedule the next ────────────────────────────────────
  const recordChunk = useCallback(() => {
    const micStream = streamRef.current;
    if (!isListeningRef.current || !micStream) return;

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "";

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(micStream, mimeType ? { mimeType } : {});
    } catch (err) {
      console.error("[AudioMonitor] MediaRecorder creation failed:", err);
      return;
    }

    recorderRef.current = recorder;
    const chunkData: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunkData.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunkData, { type: mimeType || "audio/webm" });
      sendChunk(blob); // non-blocking

      // Schedule next chunk immediately after stop (100ms gap for stability)
      if (isListeningRef.current) {
        chunkTimerRef.current = setTimeout(recordChunk, 100);
      }
    };

    recorder.onerror = (e) => {
      console.error("[AudioMonitor] Recorder error:", e);
    };

    recorder.start();
    console.log("[AudioMonitor] Recording chunk started (mimeType:", mimeType || "default", ")");

    // Stop after CHUNK_DURATION_MS to trigger onstop
    chunkTimerRef.current = setTimeout(() => {
      if (recorder.state === "recording") {
        recorder.stop();
      }
    }, CHUNK_DURATION_MS);
  }, [sendChunk]);

  // ── Start listening ───────────────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    if (isListeningRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicStatus("unsupported");
      setErrorMsg("Microphone not supported in this browser");
      return;
    }

    setMicStatus("requesting");
    setErrorMsg(null);
    console.log("[AudioMonitor] Requesting microphone permission…");

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
        video: false,
      });

      console.log("[AudioMonitor] Microphone permission granted");
      streamRef.current = micStream;
      isListeningRef.current = true;
      onMicStreamRef.current?.(micStream);
      setMicStatus("listening");

      // Kick off the recording loop
      recordChunk();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[AudioMonitor] Microphone error:", msg);
      setMicStatus("error");
      setErrorMsg(
        msg.toLowerCase().includes("denied") || msg.toLowerCase().includes("permission")
          ? "Microphone permission denied. Please allow access in your browser and try again."
          : `Could not start microphone: ${msg}`
      );
    }
  }, [recordChunk]);

  // ── Stop listening ────────────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    console.log("[AudioMonitor] Stopping audio monitor");
    isListeningRef.current = false;

    if (chunkTimerRef.current !== null) {
      clearTimeout(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    onMicStreamRef.current?.(null);
    setMicStatus("idle");
  }, []);

  // Stop on unmount
  useEffect(() => () => stopListening(), [stopListening]);

  // ── Simulate audio distress ───────────────────────────────────────────────────
  const handleSimulate = useCallback(async () => {
    const currentResident = residentRef.current;
    if (!currentResident) return;
    setSimulating(true);
    console.log("[AudioMonitor] Simulating audio distress");
    try {
      const res = await fetch("/api/audio/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          simulate: true,
          residentId: currentResident.id,
          residentName: currentResident.name,
          room: currentResident.room,
        }),
      });
      const data = await res.json();
      console.log("[AudioMonitor] Simulate response:", data);
      if (data.transcript) setLastTranscript(data.transcript);
      if (data.classification) setLastClassification(data.classification);
      if (data.shouldRecordCriticalClip) {
        onCriticalRef.current?.();
        if (data.classification) {
          onInjectRef.current?.(data.classification.eventType, data.classification.severity);
        }
      }
    } catch (err) {
      console.warn("[AudioMonitor] Simulate failed:", err);
    } finally {
      setSimulating(false);
    }
  }, []);

  const isListening = micStatus === "listening" || micStatus === "transcribing";

  const severityBg: Record<string, string> = {
    urgent: "text-red-300 bg-red-950/40 border-red-800/60",
    assist: "text-orange-300 bg-orange-950/40 border-orange-800/60",
    watch: "text-yellow-300 bg-yellow-950/40 border-yellow-800/60",
    stable: "text-green-300 bg-green-950/40 border-green-800/60",
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🎙️</span>
          <span className="text-white font-semibold text-sm">Audio Monitor</span>
        </div>
        <div className="flex items-center gap-1.5">
          {elevenLabsConfigured === null ? (
            <span className="text-[10px] text-gray-500">checking…</span>
          ) : elevenLabsConfigured ? (
            <span className="flex items-center gap-1 text-[10px] text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              ElevenLabs STT
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-yellow-400">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
              STT Not Configured
            </span>
          )}
        </div>
      </div>

      {/* Paused banner */}
      {isPaused && (
        <div className="bg-yellow-950/40 border border-yellow-800/50 rounded-lg px-3 py-1.5 text-[11px] text-yellow-300 text-center">
          Monitoring paused — audio analysis suspended
        </div>
      )}

      {/* Mic status */}
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full shrink-0 ${
          micStatus === "listening" ? "bg-green-400 animate-pulse" :
          micStatus === "transcribing" ? "bg-blue-400 animate-pulse" :
          micStatus === "requesting" ? "bg-yellow-400 animate-pulse" :
          micStatus === "error" || micStatus === "unsupported" ? "bg-red-400" :
          "bg-gray-600"
        }`} />
        <span className="text-xs text-gray-400">
          {micStatus === "idle" && "Not listening"}
          {micStatus === "requesting" && "Requesting microphone…"}
          {micStatus === "listening" && `Listening — ${CHUNK_DURATION_MS / 1000}s chunks`}
          {micStatus === "transcribing" && "Transcribing with ElevenLabs…"}
          {micStatus === "error" && (errorMsg ?? "Microphone error")}
          {micStatus === "unsupported" && "Microphone not supported"}
        </span>
      </div>

      {/* Error detail */}
      {errorMsg && micStatus === "error" && (
        <div className="bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2 text-[11px] text-red-300">
          {errorMsg}
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-2">
        {!isListening ? (
          <button
            onClick={startListening}
            disabled={micStatus === "requesting" || micStatus === "unsupported" || isPaused}
            className="flex-1 text-xs bg-green-900/60 hover:bg-green-800/70 disabled:opacity-40 disabled:cursor-not-allowed text-green-200 border border-green-800/50 rounded-lg py-1.5 transition-colors"
          >
            {isPaused ? "Paused" : "Start Audio Monitor"}
          </button>
        ) : (
          <button
            onClick={stopListening}
            className="flex-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 border border-gray-600 rounded-lg py-1.5 transition-colors"
          >
            Stop Monitor
          </button>
        )}
        <button
          onClick={handleSimulate}
          disabled={simulating || !resident || isPaused}
          className="text-xs bg-orange-900/60 hover:bg-orange-800/70 disabled:opacity-40 disabled:cursor-not-allowed text-orange-200 border border-orange-800/50 rounded-lg px-3 py-1.5 transition-colors"
        >
          {simulating ? "…" : "Simulate Distress"}
        </button>
      </div>

      {/* Last transcript */}
      {lastTranscript && (
        <div className="bg-gray-700/50 rounded-lg px-3 py-2">
          <p className="text-[10px] text-gray-500 mb-0.5">Last Transcript</p>
          <p className="text-xs text-gray-200 italic">"{lastTranscript}"</p>
        </div>
      )}

      {/* Last classification */}
      {lastClassification && lastClassification.severity !== "stable" && (
        <div className={`border rounded-lg px-3 py-2 text-xs ${
          severityBg[lastClassification.severity] ?? "text-gray-300 bg-gray-700/40 border-gray-600"
        }`}>
          <div className="flex items-center justify-between mb-0.5">
            <span className="font-semibold uppercase text-[10px] tracking-wide">
              {lastClassification.severity}
            </span>
            <span className="text-[10px] opacity-70">
              {Math.round(lastClassification.confidence * 100)}% conf.
            </span>
          </div>
          <p className="opacity-90">{lastClassification.reason}</p>
          {(lastClassification.matchedKeywords.length > 0 ||
            lastClassification.matchedAudioTags.length > 0) && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {lastClassification.matchedKeywords.map((kw) => (
                <span key={kw} className="bg-white/10 rounded-full px-1.5 py-0.5 text-[9px]">
                  "{kw}"
                </span>
              ))}
              {lastClassification.matchedAudioTags.map((tag) => (
                <span key={tag} className="bg-white/10 rounded-full px-1.5 py-0.5 text-[9px] opacity-70">
                  [{tag}]
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {lastClassification?.severity === "stable" && lastTranscript && (
        <p className="text-[10px] text-green-500 text-center">No distress detected</p>
      )}

      <p className="text-[9px] text-gray-700 text-center leading-tight">
        Audio analysis is indicative only · Not for clinical use · Prototype only
      </p>
    </div>
  );
}
