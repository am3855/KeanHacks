"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import {
  calculatePostureAngle,
  detectLyingDown,
  calculateMovementScore,
  isInsideSafeZone,
  isPoseVisible,
  DEFAULT_SAFE_ZONE,
} from "@/lib/poseHelpers";
import { classifyResidentSafety } from "@/lib/classifySafety";
import type {
  PoseLandmark,
  SafetySignals,
  SafetyClassification,
  SafetyEvent,
  ResidentProfile,
  SafeZone,
} from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// useResidentMonitor — Converts raw pose landmarks into safety signals, runs
// the classifier each frame, maintains the local event timeline, and persists
// meaningful events to the backend (which writes to MongoDB or in-memory store).
// ─────────────────────────────────────────────────────────────────────────────

const MOVEMENT_THRESHOLD = 0.02;  // Below this score → count as "still"
const EVENT_DEBOUNCE_MS = 8000;   // Min ms between persisting the same event type
const MAX_TIMELINE_LENGTH = 50;

interface MonitorState {
  signals: SafetySignals;
  classification: SafetyClassification;
  timeline: SafetyEvent[];
}

export function useResidentMonitor(
  landmarks: PoseLandmark[] | null,
  resident: ResidentProfile | null,
  safeZone: SafeZone = DEFAULT_SAFE_ZONE
) {
  const prevLandmarksRef = useRef<PoseLandmark[] | null>(null);
  const stillSinceRef = useRef<number | null>(null);
  const lastPersistedRef = useRef<Record<string, number>>({});

  const [state, setState] = useState<MonitorState>(() => ({
    signals: {
      isLyingDown: false,
      movementScore: 1,
      postureAngle: 0,
      secondsStill: 0,
      insideSafeZone: true,
      visible: false,
    },
    classification: {
      severity: "stable",
      eventType: "normal",
      reason: "Waiting for camera…",
      confidence: 0,
    },
    timeline: [],
  }));

  const processFrame = useCallback(() => {
    if (!resident) return;

    const now = Date.now();

    // ── Compute signals ──────────────────────────────────────────────────────
    const visible = landmarks !== null && isPoseVisible(landmarks);

    let movementScore = 0;
    let postureAngle = 0;
    let isLyingDown = false;
    let insideSafeZone = true;
    let secondsStill = 0;

    if (visible && landmarks) {
      postureAngle = calculatePostureAngle(landmarks);
      isLyingDown = detectLyingDown(landmarks);
      insideSafeZone = isInsideSafeZone(landmarks, safeZone);

      if (prevLandmarksRef.current) {
        movementScore = calculateMovementScore(landmarks, prevLandmarksRef.current);
      } else {
        movementScore = 1; // First frame — assume movement
      }

      // Track stillness duration
      if (movementScore < MOVEMENT_THRESHOLD) {
        if (stillSinceRef.current === null) {
          stillSinceRef.current = now;
        }
        secondsStill = (now - stillSinceRef.current) / 1000;
      } else {
        stillSinceRef.current = null;
        secondsStill = 0;
      }

      prevLandmarksRef.current = landmarks;
    } else {
      // Resident not visible — maintain stillness counter
      if (stillSinceRef.current !== null) {
        secondsStill = (now - stillSinceRef.current) / 1000;
      }
    }

    const signals: SafetySignals = {
      isLyingDown,
      movementScore,
      postureAngle,
      secondsStill,
      insideSafeZone,
      visible,
    };

    const classification = classifyResidentSafety(signals);

    // ── Persist meaningful events (debounced per event type) ────────────────
    if (classification.severity !== "stable") {
      const lastTime = lastPersistedRef.current[classification.eventType] ?? 0;
      if (now - lastTime > EVENT_DEBOUNCE_MS) {
        lastPersistedRef.current[classification.eventType] = now;
        persistEvent(resident, classification, signals);
      }
    }

    setState((prev) => {
      // Only update timeline when classification changes or on first event
      const changed =
        prev.classification.severity !== classification.severity ||
        prev.classification.eventType !== classification.eventType;

      const newTimeline = changed
        ? [
            {
              _id: `local_${now}`,
              residentId: resident.id,
              residentName: resident.name,
              room: resident.room,
              severity: classification.severity,
              eventType: classification.eventType,
              confidence: classification.confidence,
              reason: classification.reason,
              recommendedAction: "",
              signals,
              source: "live_camera" as const,
              acknowledged: false,
              acknowledgedBy: null,
              acknowledgedAt: null,
              createdAt: new Date().toISOString(),
            },
            ...prev.timeline,
          ].slice(0, MAX_TIMELINE_LENGTH)
        : prev.timeline;

      return { signals, classification, timeline: newTimeline };
    });
  }, [landmarks, resident, safeZone]);

  // Run processFrame whenever landmarks change
  useEffect(() => {
    processFrame();
  }, [processFrame]);

  // Load historical events from the server on mount / resident change
  useEffect(() => {
    if (!resident) return;
    let active = true;
    async function loadHistory() {
      try {
        const res = await fetch("/api/events?limit=20");
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        const residentEvents: SafetyEvent[] = (data.events as SafetyEvent[]).filter(
          (e) => e.residentId === resident!.id
        );
        setState((prev) => ({
          ...prev,
          timeline: [...prev.timeline, ...residentEvents].slice(0, MAX_TIMELINE_LENGTH),
        }));
      } catch {
        // Non-fatal — dashboard still works from local state
      }
    }
    loadHistory();
    return () => { active = false; };
  }, [resident?.id]);

  return state;
}

// ─── Fire-and-forget event persistence ───────────────────────────────────────
function persistEvent(
  resident: ResidentProfile,
  classification: SafetyClassification,
  signals: SafetySignals
) {
  fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      residentId: resident.id,
      residentName: resident.name,
      room: resident.room,
      severity: classification.severity,
      eventType: classification.eventType,
      confidence: classification.confidence,
      reason: classification.reason,
      signals,
    }),
  }).catch(() => {/* Non-fatal */});
}
