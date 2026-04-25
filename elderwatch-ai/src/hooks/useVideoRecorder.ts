"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { SafetyClassification, ResidentProfile } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// useVideoRecorder — Records a short clip when a high-severity event occurs,
// uploads it directly to S3 via a presigned PUT URL, and saves the metadata
// in MongoDB. Falls back gracefully when S3 is not configured.
//
// Note: Uses post-event recording (starts on event detection) rather than a
// rolling pre-event buffer. Rolling buffers require keyframe-aware chunking
// which is unreliable across browsers on MediaRecorder; the simple approach
// is more reliable for a hackathon demo.
// ─────────────────────────────────────────────────────────────────────────────

export type RecordingStatus =
  | "idle"
  | "capturing"
  | "uploading"
  | "saved"
  | "error"
  | "s3-disabled";

const CLIP_DURATION_MS = 15_000;  // record 15 seconds per clip
const COOLDOWN_MS = 45_000;        // 45s between recordings for the same resident
const TRIGGER_SEVERITIES = new Set(["urgent", "assist"]);
const TRIGGER_EVENTS = new Set([
  "possible_fall",
  "fall_risk",
  "immobility",
  "unsafe_posture",
  "seizure_like_motion",
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
  resident: ResidentProfile | null
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
  useEffect(() => { residentRef.current = resident; }, [resident]);
  useEffect(() => { classificationRef.current = classification; }, [classification]);

  // ── Core upload + save function ─────────────────────────────────────────────
  const uploadClip = useCallback(async (blob: Blob, clipStartTime: string, clipEndTime: string) => {
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

      // 3. Save clip metadata in MongoDB
      await fetch("/api/video-clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          residentId: currentResident.id,
          residentName: currentResident.name,
          room: currentResident.room,
          severity: currentClass.severity,
          eventType: currentClass.eventType,
          s3Key,
          bucket,
          contentType: blob.type || "video/webm",
          durationSeconds: Math.round(
            (new Date(clipEndTime).getTime() - new Date(clipStartTime).getTime()) / 1000
          ),
          clipStartTime,
          clipEndTime,
        }),
      });

      setStatus("saved");
      setStatusMessage("Clip saved");
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
  const startRecording = useCallback(() => {
    if (!stream || isRecordingRef.current) return;
    if (Date.now() < cooldownUntilRef.current) return;

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : MediaRecorder.isTypeSupported("video/webm")
      ? "video/webm"
      : "";

    try {
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
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
        uploadClip(blob, clipStartTime, clipEndTime);
      };

      recorder.start(1000);
      setStatus("capturing");
      setStatusMessage("Recording critical event clip…");

      setTimeout(() => {
        if (recorderRef.current && recorderRef.current.state === "recording") {
          recorderRef.current.stop();
        }
      }, CLIP_DURATION_MS);
    } catch (err) {
      console.error("[VideoRecorder] Failed to start recorder:", err);
      isRecordingRef.current = false;
    }
  }, [stream, uploadClip]);

  // ── Watch for critical classification changes ────────────────────────────────
  useEffect(() => {
    if (
      stream &&
      TRIGGER_SEVERITIES.has(classification.severity) &&
      TRIGGER_EVENTS.has(classification.eventType)
    ) {
      startRecording();
    }
  }, [classification.severity, classification.eventType, stream, startRecording]);

  // ── Demo trigger ─────────────────────────────────────────────────────────────
  const triggerDemo = useCallback(() => {
    if (!stream) {
      setStatusMessage("Webcam not available for demo clip");
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }
    cooldownUntilRef.current = 0; // bypass cooldown for demo
    startRecording();
  }, [stream, startRecording]);

  return { recordingStatus: status, statusMessage, triggerDemo };
}
