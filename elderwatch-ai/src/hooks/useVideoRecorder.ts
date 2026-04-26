"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { SafetyClassification, ResidentProfile } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// useVideoRecorder — Records a short combined audio+video clip when a
// high-severity event occurs, uploads it directly to S3 via a presigned PUT
// URL, and saves the metadata in MongoDB.
//
// All critical event paths (visual, audio, manual, simulated) call
// startRecording which is the single shared recording function.
//
// On each startRecording call:
//   1. Uses the mic stream passed in from AudioMonitor if available.
//   2. If no mic stream, tries navigator.mediaDevices.getUserMedia({ audio }).
//   3. Combines video + audio tracks into one MediaStream before recording.
//   4. Falls back to video-only if mic is denied/unavailable.
// ─────────────────────────────────────────────────────────────────────────────

export type RecordingStatus =
  | "idle"
  | "capturing"
  | "uploading"
  | "saved"
  | "error"
  | "s3-disabled";

const CLIP_DURATION_MS = 15_000;   // 15-second clip
const COOLDOWN_MS = 120_000;       // 2 minutes between clips per resident
// Only record clips for urgent events to prevent S3 spam
const TRIGGER_SEVERITIES = new Set(["urgent"]);
const TRIGGER_EVENTS = new Set([
  "possible_fall",
  "seizure_like_motion",
  "possible_choking",
  "audio_distress",
]);

export interface VideoRecorderResult {
  recordingStatus: RecordingStatus;
  statusMessage: string | null;
  /** Call this to manually trigger a demo clip recording */
  triggerDemo: () => void;
}

export function useVideoRecorder(
  stream: MediaStream | null,
  classification: SafetyClassification,
  resident: ResidentProfile | null,
  micStream?: MediaStream | null,
  isPaused?: boolean
): VideoRecorderResult {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cooldownUntilRef = useRef<number>(0);
  const isRecordingRef = useRef<boolean>(false);

  // Keep refs current so async callbacks always see the latest props
  const residentRef = useRef(resident);
  const classificationRef = useRef(classification);
  const micStreamRef = useRef(micStream ?? null);
  const isPausedRef = useRef(isPaused ?? false);

  useEffect(() => { residentRef.current = resident; }, [resident]);
  useEffect(() => { classificationRef.current = classification; }, [classification]);
  useEffect(() => { micStreamRef.current = micStream ?? null; }, [micStream]);
  useEffect(() => { isPausedRef.current = isPaused ?? false; }, [isPaused]);

  // ── Core upload + save function ─────────────────────────────────────────────
  const uploadClip = useCallback(async (
    blob: Blob,
    clipStartTime: string,
    clipEndTime: string,
    hasVideoTrack: boolean,
    hasAudioTrack: boolean
  ) => {
    const currentResident = residentRef.current;
    const currentClass = classificationRef.current;
    if (!currentResident) { isRecordingRef.current = false; return; }

    setStatus("uploading");
    setStatusMessage("Uploading clip to S3…");

    try {
      // 1. Request presigned upload URL
      const presignRes = await fetch("/api/video-clips/presign-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          residentId: currentResident.id,
          eventType: currentClass.eventType,
          contentType: blob.type || "video/webm",
        }),
      });

      const presignData = await presignRes.json();

      if (!presignRes.ok || presignData.s3Disabled) {
        setStatus("s3-disabled");
        setStatusMessage("S3 not configured — event saved without video");
        setTimeout(() => { setStatus("idle"); setStatusMessage(null); }, 5000);
        isRecordingRef.current = false;
        return;
      }

      const { uploadUrl, s3Key, bucket } = presignData;

      // 2. Upload directly to S3 (browser → S3, no server proxy)
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": blob.type || "video/webm" },
      });
      if (!uploadRes.ok) throw new Error(`S3 PUT failed: ${uploadRes.status}`);

      console.log("[VideoRecorder] Critical clip uploaded", s3Key);

      // 3. Save clip metadata in MongoDB
      const clipRes = await fetch("/api/video-clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          residentId: currentResident.id,
          residentName: currentResident.name,
          room: currentResident.room,
          severity: currentClass.severity,
          eventType: currentClass.eventType,
          source: "live_camera",
          s3Key,
          bucket,
          contentType: blob.type || "video/webm",
          durationSeconds: Math.round(
            (new Date(clipEndTime).getTime() - new Date(clipStartTime).getTime()) / 1000
          ),
          clipStartTime,
          clipEndTime,
          hasVideoTrack,
          hasAudioTrack,
        }),
      });

      if (clipRes.ok) {
        const clipData = await clipRes.json();
        console.log("[VideoRecorder] Critical clip attached to event", clipData._id ?? clipData.id ?? "saved");
      }

      setStatus("saved");
      setStatusMessage(
        hasAudioTrack
          ? "Clip saved (audio + video)"
          : "Clip saved (video only — mic unavailable)"
      );
      setTimeout(() => { setStatus("idle"); setStatusMessage(null); }, 6000);
    } catch (err) {
      console.error("[VideoRecorder] Upload error:", err);
      setStatus("error");
      setStatusMessage("Clip upload failed");
      setTimeout(() => { setStatus("idle"); setStatusMessage(null); }, 5000);
    } finally {
      isRecordingRef.current = false;
    }
  }, []);

  // ── Start recording a clip ───────────────────────────────────────────────────
  // This is the single shared recording function used by all critical event paths.
  const startRecording = useCallback(() => {
    if (!stream || isRecordingRef.current) return;
    if (isPausedRef.current) return;
    if (Date.now() < cooldownUntilRef.current) {
      console.log("[VideoRecorder] Skipped — cooldown active");
      return;
    }

    const eventType = classificationRef.current?.eventType ?? "unknown";
    console.log("[VideoRecorder] Critical clip recording requested", eventType, "source=visual/manual");

    void (async () => {
      // Try to get mic audio — use existing AudioMonitor stream if available,
      // otherwise request a fresh audio-only stream.
      let mic: MediaStream | null = micStreamRef.current;
      let ownedMicStream: MediaStream | null = null;

      if (!mic || mic.getAudioTracks().length === 0) {
        try {
          ownedMicStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
            video: false,
          });
          mic = ownedMicStream;
        } catch {
          // Microphone denied or unavailable — continue with video-only
        }
      }

      const videoTracks = stream.getVideoTracks();
      const audioTracks = mic ? mic.getAudioTracks() : [];
      const hasAudio = audioTracks.length > 0;

      const recordingStream = hasAudio
        ? new MediaStream([...videoTracks, ...audioTracks])
        : stream;

      console.log("[VideoRecorder] Combined stream tracks", videoTracks.length, audioTracks.length);

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "";

      try {
        const recorder = new MediaRecorder(recordingStream, mimeType ? { mimeType } : {});
        recorderRef.current = recorder;
        chunksRef.current = [];
        isRecordingRef.current = true;
        cooldownUntilRef.current = Date.now() + COOLDOWN_MS;

        const clipStartTime = new Date().toISOString();

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
          const clipEndTime = new Date().toISOString();
          chunksRef.current = [];
          recorderRef.current = null;
          // Stop any mic stream we own (not the shared AudioMonitor stream)
          if (ownedMicStream) ownedMicStream.getTracks().forEach((t) => t.stop());
          uploadClip(blob, clipStartTime, clipEndTime, videoTracks.length > 0, hasAudio);
        };

        recorder.start(1000);
        console.log("[VideoRecorder] MediaRecorder started");
        setStatus("capturing");
        setStatusMessage(
          hasAudio
            ? "Recording critical event clip…"
            : "Microphone unavailable — saved video-only clip."
        );

        setTimeout(() => {
          if (recorderRef.current && recorderRef.current.state === "recording") {
            recorderRef.current.stop();
          }
        }, CLIP_DURATION_MS);
      } catch (err) {
        console.error("[VideoRecorder] Failed to start recorder:", err);
        isRecordingRef.current = false;
        if (ownedMicStream) ownedMicStream.getTracks().forEach((t) => t.stop());
      }
    })();
  }, [stream, uploadClip]);

  // ── Watch for critical classification changes (visual event trigger) ─────────
  useEffect(() => {
    if (
      stream &&
      !isPausedRef.current &&
      TRIGGER_SEVERITIES.has(classification.severity) &&
      TRIGGER_EVENTS.has(classification.eventType)
    ) {
      startRecording();
    }
  }, [classification.severity, classification.eventType, stream, startRecording]);

  // ── Demo / manual / audio trigger ────────────────────────────────────────────
  const triggerDemo = useCallback(() => {
    if (!stream) {
      setStatusMessage("Webcam not available for demo clip");
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }
    cooldownUntilRef.current = 0; // bypass cooldown for manual triggers
    startRecording();
  }, [stream, startRecording]);

  return { recordingStatus: status, statusMessage, triggerDemo };
}
