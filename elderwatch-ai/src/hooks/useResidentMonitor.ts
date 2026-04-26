"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import {
  calculatePostureAngle,
  detectLyingDown,
  calculateMovementScore,
  calculateMajorBodyMovementScore,
  isInsideSafeZone,
  isPoseVisible,
  detectHandsNearThroatDetails,
  DEFAULT_SAFE_ZONE,
  DETECTION_THRESHOLDS,
} from "@/lib/poseHelpers";
import { classifyResidentSafety, RECOMMENDED_ACTIONS } from "@/lib/classifySafety";
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
// meaningful events to the backend with per-event-type cooldowns.
// ─────────────────────────────────────────────────────────────────────────────

const MOVEMENT_THRESHOLD = 0.02; // below → count as "still"
const MAX_TIMELINE_LENGTH = 50;

interface MonitorOptions {
  isPaused?: boolean;
  seizureDetectionEnabled?: boolean;
}

interface MonitorState {
  signals: SafetySignals;
  classification: SafetyClassification;
  timeline: SafetyEvent[];
}

export function useResidentMonitor(
  landmarks: PoseLandmark[] | null,
  resident: ResidentProfile | null,
  safeZone: SafeZone = DEFAULT_SAFE_ZONE,
  options: MonitorOptions = {}
) {
  // ── Option refs (avoid re-creating processFrame for option changes) ──────────
  const isPausedRef = useRef(options.isPaused ?? false);
  const seizureEnabledRef = useRef(options.seizureDetectionEnabled ?? false);
  const wasPausedRef = useRef(false);
  useEffect(() => { isPausedRef.current = options.isPaused ?? false; }, [options.isPaused]);
  useEffect(() => { seizureEnabledRef.current = options.seizureDetectionEnabled ?? false; }, [options.seizureDetectionEnabled]);

  // ── Time-tracking refs ───────────────────────────────────────────────────────
  const prevLandmarksRef = useRef<PoseLandmark[] | null>(null);
  const stillSinceRef = useRef<number | null>(null);
  const outsideSafeZoneSinceRef = useRef<number | null>(null);
  const highMovementSinceRef = useRef<number | null>(null);
  const handsNearThroatSinceRef = useRef<number | null>(null);
  const lyingDownSinceRef = useRef<number | null>(null);
  const badPostureSinceRef = useRef<number | null>(null);

  // Per-event-type last-persisted timestamps (replaces global EVENT_DEBOUNCE_MS)
  const lastPersistedRef = useRef<Record<string, number>>({});
  // Latch: once possible_fall fires, hold it until the person is clearly upright
  const possibleFallLatchedRef = useRef(false);

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

    // ── Paused: emit a one-shot "paused" classification, then skip ───────────
    if (isPausedRef.current) {
      if (!wasPausedRef.current) {
        wasPausedRef.current = true;
        setState((prev) => ({
          ...prev,
          classification: {
            severity: "stable",
            eventType: "normal",
            reason: "Monitoring paused",
            confidence: 0,
          },
        }));
      }
      return;
    }
    wasPausedRef.current = false;

    const now = Date.now();

    // ── Compute base signals ─────────────────────────────────────────────────
    const visible = landmarks !== null && isPoseVisible(landmarks);

    let movementScore = 0;
    let majorBodyMovementScore = 0;
    let postureAngle = 0;
    let isLyingDown = false;
    let insideSafeZone = true;
    let secondsStill = 0;
    let secondsOutsideSafeZone = 0;
    let secondsHighMovement = 0;
    let handsNearThroatSeconds = 0;
    let leftHandNearThroat = false;
    let rightHandNearThroat = false;
    let bothHandsNearThroat = false;
    let secondsLyingDown = 0;
    let secondsBadPosture = 0;

    if (visible && landmarks) {
      postureAngle = calculatePostureAngle(landmarks);
      isLyingDown = detectLyingDown(landmarks);
      insideSafeZone = isInsideSafeZone(landmarks, safeZone);

      if (prevLandmarksRef.current) {
        movementScore = calculateMovementScore(landmarks, prevLandmarksRef.current);
        majorBodyMovementScore = calculateMajorBodyMovementScore(landmarks, prevLandmarksRef.current);
      } else {
        movementScore = 1;
        majorBodyMovementScore = 1;
      }

      // Track stillness
      if (movementScore < MOVEMENT_THRESHOLD) {
        if (stillSinceRef.current === null) stillSinceRef.current = now;
        secondsStill = (now - stillSinceRef.current) / 1000;
      } else {
        stillSinceRef.current = null;
        secondsStill = 0;
      }

      // Track time outside safe zone
      if (!insideSafeZone) {
        if (outsideSafeZoneSinceRef.current === null) outsideSafeZoneSinceRef.current = now;
        secondsOutsideSafeZone = (now - outsideSafeZoneSinceRef.current) / 1000;
      } else {
        outsideSafeZoneSinceRef.current = null;
        secondsOutsideSafeZone = 0;
      }

      // Track sustained high movement (for experimental seizure detection)
      if (movementScore > DETECTION_THRESHOLDS.seizureMovementThreshold) {
        if (highMovementSinceRef.current === null) highMovementSinceRef.current = now;
        secondsHighMovement = (now - highMovementSinceRef.current) / 1000;
      } else {
        highMovementSinceRef.current = null;
        secondsHighMovement = 0;
      }

      // Track hands near throat (for choking detection)
      const chokingResult = detectHandsNearThroatDetails(landmarks);
      leftHandNearThroat = chokingResult.leftHandNearThroat;
      rightHandNearThroat = chokingResult.rightHandNearThroat;
      bothHandsNearThroat = chokingResult.bothHandsNearThroat;
      if (chokingResult.detected) {
        if (handsNearThroatSinceRef.current === null) handsNearThroatSinceRef.current = now;
        handsNearThroatSeconds = (now - handsNearThroatSinceRef.current) / 1000;
      } else {
        handsNearThroatSinceRef.current = null;
        handsNearThroatSeconds = 0;
      }

      // Track lying-down duration
      if (isLyingDown) {
        if (lyingDownSinceRef.current === null) lyingDownSinceRef.current = now;
        secondsLyingDown = (now - lyingDownSinceRef.current) / 1000;
      } else {
        lyingDownSinceRef.current = null;
        secondsLyingDown = 0;
      }

      // Track bad-posture duration (angle > 30 covers both the watch and assist thresholds)
      if (postureAngle > 30) {
        if (badPostureSinceRef.current === null) badPostureSinceRef.current = now;
        secondsBadPosture = (now - badPostureSinceRef.current) / 1000;
      } else {
        badPostureSinceRef.current = null;
        secondsBadPosture = 0;
      }

      prevLandmarksRef.current = landmarks;
    } else if (stillSinceRef.current !== null) {
      // Not visible — maintain stillness counter
      secondsStill = (now - stillSinceRef.current) / 1000;
    }

    const signals: SafetySignals = {
      isLyingDown,
      movementScore,
      postureAngle,
      secondsStill,
      insideSafeZone,
      visible,
      secondsOutsideSafeZone,
      secondsHighMovement,
      handsNearThroatSeconds,
      secondsLyingDown,
      secondsBadPosture,
      majorBodyMovementScore,
      leftHandNearThroat,
      rightHandNearThroat,
      bothHandsNearThroat,
    };

    let classification = classifyResidentSafety(signals, {
      seizureDetectionEnabled: seizureEnabledRef.current,
    });

    // Latch possible_fall — once the resident is detected lying still, keep the
    // urgent classification until they're clearly upright again. Without this,
    // small movements (breathing, shifting) reset secondsStill and the alert
    // oscillates, spamming the timeline and TTS on every 10-second cycle.
    if (classification.eventType === "possible_fall") {
      possibleFallLatchedRef.current = true;
    }
    if (!signals.isLyingDown) {
      possibleFallLatchedRef.current = false;
    }
    if (possibleFallLatchedRef.current && signals.isLyingDown && classification.eventType !== "possible_fall") {
      classification = {
        severity: "urgent",
        eventType: "possible_fall",
        reason: "Resident appears to be lying down with minimal movement — caregiver should check",
        confidence: 0.9,
      };
    }

    // ── Persist meaningful events with per-event-type cooldowns ─────────────
    if (classification.severity !== "stable") {
      const cooldown = DETECTION_THRESHOLDS.eventCooldowns[classification.eventType] ?? 30_000;
      const lastTime = lastPersistedRef.current[classification.eventType] ?? 0;
      if (now - lastTime > cooldown) {
        lastPersistedRef.current[classification.eventType] = now;
        persistEvent(resident, classification, signals);
      }
    }

    setState((prev) => {
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
              recommendedAction: RECOMMENDED_ACTIONS[classification.eventType] ?? "",
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
        // Non-fatal
      }
    }
    loadHistory();
    return () => { active = false; };
  }, [resident?.id]);

  // ── Demo event injector ────────────────────────────────────────────────────
  const injectDemoEvent = useCallback((
    eventType: SafetyEvent["eventType"] = "possible_fall",
    severity: SafetyEvent["severity"] = "urgent"
  ) => {
    if (!resident) return;
    const now = Date.now();
    const demoSignals: SafetySignals = {
      isLyingDown: severity === "urgent" && eventType === "possible_fall",
      movementScore: eventType === "seizure_like_motion" ? 0.9 : 0.05,
      postureAngle: eventType === "unsafe_posture" ? 65 : eventType === "possible_choking" ? 30 : 8,
      secondsStill: eventType === "possible_fall" ? 12 : 0,
      insideSafeZone: true,
      visible: true,
      handsNearThroatSeconds: eventType === "possible_choking" ? 5 : 0,
      secondsHighMovement: eventType === "seizure_like_motion" ? 8 : 0,
    };
    const demoEvent: SafetyEvent = {
      _id: `demo_${now}`,
      residentId: resident.id,
      residentName: resident.name,
      room: resident.room,
      severity,
      eventType,
      confidence: 0.88,
      reason: `[Demo] ${eventType.replace(/_/g, " ")} simulated via demo trigger`,
      recommendedAction: RECOMMENDED_ACTIONS[eventType] ?? "",
      signals: demoSignals,
      source: "live_camera",
      acknowledged: false,
      acknowledgedBy: null,
      acknowledgedAt: null,
      hasVideoClip: false,
      createdAt: new Date().toISOString(),
    };
    persistEvent(resident, { severity, eventType, reason: demoEvent.reason, confidence: 0.88 }, demoSignals);
    setState((prev) => ({
      ...prev,
      classification: { severity, eventType, reason: demoEvent.reason, confidence: 0.88 },
      timeline: [demoEvent, ...prev.timeline].slice(0, MAX_TIMELINE_LENGTH),
    }));
  }, [resident]);

  return { ...state, injectDemoEvent };
}

// ─── Fire-and-forget event persistence ───────────────────────────────────────
function persistEvent(
  resident: ResidentProfile,
  classification: SafetyClassification,
  signals: SafetySignals
) {
  // Strip the runtime-only timing/debug fields before persisting
  const { secondsOutsideSafeZone, secondsHighMovement, handsNearThroatSeconds, secondsLyingDown, secondsBadPosture, majorBodyMovementScore, leftHandNearThroat, rightHandNearThroat, bothHandsNearThroat, ...coreSignals } = signals;
  void secondsOutsideSafeZone; void secondsHighMovement; void handsNearThroatSeconds; void secondsLyingDown; void secondsBadPosture; void majorBodyMovementScore;
  void leftHandNearThroat; void rightHandNearThroat; void bothHandsNearThroat;

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
      signals: coreSignals,
    }),
  }).catch(() => {/* Non-fatal */});
}
