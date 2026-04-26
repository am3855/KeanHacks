import {
  ResidentStatus,
  EventType,
  type SafetySignals,
  type SafetyClassification,
} from "./types";
import { DETECTION_THRESHOLDS } from "./poseHelpers";

// ─────────────────────────────────────────────────────────────────────────────
// Core Safety Classifier
// Rule-based — no ML model required. Processes pose-derived signals into a
// structured severity + event classification for display and persistence.
//
// IMPORTANT HEALTHCARE DISCLAIMER:
// This is a prototype system for demonstration only. It does not detect,
// diagnose, or confirm any medical condition. All classifications are
// heuristic and require human verification.
// ─────────────────────────────────────────────────────────────────────────────

export interface ClassifyOptions {
  // Seizure-like motion detection is experimental and defaults to OFF.
  // False positives during demo are common without sustained measurement.
  seizureDetectionEnabled?: boolean;
}

export function classifyResidentSafety(
  signals: SafetySignals,
  options: ClassifyOptions = {}
): SafetyClassification {
  const { seizureDetectionEnabled = false } = options;

  // 1. Resident no longer visible in frame
  if (!signals.visible) {
    return {
      severity: ResidentStatus.WATCH,
      eventType: EventType.OUT_OF_FRAME,
      reason: "Resident is no longer visible in the camera frame",
      confidence: 0.72,
    };
  }

  // 2. Likely fall — lying down with minimal movement for several seconds
  if (signals.isLyingDown && signals.movementScore < 0.1 && signals.secondsStill > 10) {
    return {
      severity: ResidentStatus.URGENT,
      eventType: EventType.POSSIBLE_FALL,
      reason: "Resident appears to be lying down with minimal movement — caregiver should check",
      confidence: 0.9,
    };
  }

  // 3. Fall risk — lying down with some movement (possibly getting up)
  if (signals.isLyingDown && signals.movementScore >= 0.1) {
    return {
      severity: ResidentStatus.ASSIST,
      eventType: EventType.FALL_RISK,
      reason: "Resident is in a low/horizontal position with some movement — possible fall risk",
      confidence: 0.78,
    };
  }

  // 4. Possible choking — sustained hands-near-throat/mouth gesture (VISUAL ONLY).
  // Requires 4+ seconds of hands near throat. Audio phrases alone do NOT create this event.
  if (
    signals.handsNearThroatSeconds !== undefined &&
    signals.handsNearThroatSeconds >= DETECTION_THRESHOLDS.chokingHandDurationSeconds &&
    !signals.isLyingDown
  ) {
    return {
      severity: ResidentStatus.URGENT,
      eventType: EventType.POSSIBLE_CHOKING,
      reason: `Possible choking indicator — sustained hands near throat/mouth area for ${Math.round(signals.handsNearThroatSeconds)}s. Caregiver should check immediately.`,
      confidence: signals.bothHandsNearThroat ? 0.9 : 0.82,
    };
  }

  // 5. Possible seizure-like motion — conservative, experimental, default OFF.
  // Requires: detection enabled + sustained high movement for 6+ seconds +
  // major body landmarks (not just wrists) are moving + not lying down.
  if (
    seizureDetectionEnabled &&
    !signals.isLyingDown &&
    signals.secondsHighMovement !== undefined &&
    signals.secondsHighMovement >= DETECTION_THRESHOLDS.seizureMinDurationSeconds &&
    signals.movementScore > DETECTION_THRESHOLDS.seizureMovementThreshold &&
    signals.majorBodyMovementScore !== undefined &&
    signals.majorBodyMovementScore > DETECTION_THRESHOLDS.seizureMajorBodyThreshold
  ) {
    return {
      severity: ResidentStatus.URGENT,
      eventType: EventType.SEIZURE_LIKE_MOTION,
      reason: `Sustained unusual repetitive motion for ${Math.round(signals.secondsHighMovement)}s — caregiver should check. This system does not diagnose seizures.`,
      confidence: 0.62,
    };
  }

  // 6. Prolonged immobility — no movement for more than 5 minutes
  if (signals.secondsStill > 300) {
    return {
      severity: ResidentStatus.ASSIST,
      eventType: EventType.IMMOBILITY,
      reason: "Resident has shown very little movement for several minutes",
      confidence: 0.84,
    };
  }

  // 7. Wandering — torso center outside safe zone for 3+ continuous seconds.
  // Short excursions (reaching, leaning) do not trigger this rule.
  if (
    !signals.insideSafeZone &&
    signals.secondsOutsideSafeZone !== undefined &&
    signals.secondsOutsideSafeZone >= DETECTION_THRESHOLDS.wanderingOutsideDurationSeconds
  ) {
    return {
      severity: ResidentStatus.WATCH,
      eventType: EventType.WANDERING,
      reason: "Resident's torso center has been outside the designated safe area",
      confidence: 0.78,
    };
  }

  // 8. Unsafe posture — torso heavily tilted
  if (signals.postureAngle > 60) {
    return {
      severity: ResidentStatus.ASSIST,
      eventType: EventType.UNSAFE_POSTURE,
      reason: "Resident posture appears unstable or heavily slumped",
      confidence: 0.8,
    };
  }

  // 9. Early warning — mild lean
  if (signals.postureAngle > 35) {
    return {
      severity: ResidentStatus.WATCH,
      eventType: EventType.UNSAFE_POSTURE,
      reason: "Resident is leaning — posture worth monitoring",
      confidence: 0.65,
    };
  }

  return {
    severity: ResidentStatus.STABLE,
    eventType: EventType.NORMAL,
    reason: "No concerning activity detected",
    confidence: 0.95,
  };
}

// ─── Recommended actions for each event type ──────────────────────────────────
export const RECOMMENDED_ACTIONS: Record<string, string> = {
  [EventType.POSSIBLE_FALL]:
    "Check if the resident is conscious and responsive. Do not move them if they report pain or injury is suspected. Follow your facility's emergency protocol and notify medical staff if needed.",
  [EventType.FALL_RISK]:
    "Approach carefully and assist the resident. Ensure the floor is clear of hazards. Do not rush.",
  [EventType.IMMOBILITY]:
    "Check on the resident to ensure they are comfortable and responsive. Offer fluids and assess for any discomfort.",
  [EventType.WANDERING]:
    "Gently redirect the resident to their safe area. Note the time and location in the care log.",
  [EventType.UNSAFE_POSTURE]:
    "Assist the resident to a more comfortable and stable seated or standing position. Check for dizziness.",
  [EventType.SEIZURE_LIKE_MOTION]:
    "Sustained unusual motion detected. Assess the resident immediately. Do not restrain. If seizure-like activity is confirmed, follow your facility's seizure response protocol and call medical staff.",
  [EventType.POSSIBLE_CHOKING]:
    "Possible choking gesture detected. Go to the resident immediately. Ask if they can speak or breathe. If choking is confirmed, follow your facility's choking response protocol. Call emergency services if needed.",
  [EventType.OUT_OF_FRAME]:
    "Verify the resident's location manually. They may have moved out of camera view.",
  [EventType.AUDIO_DISTRESS]:
    "Verbal distress detected. Go to the resident immediately and assess the situation. Call for additional staff if needed.",
  [EventType.POSSIBLE_DISTRESS_SOUND]:
    "Possible distress sound detected. Perform a visual or in-person check on the resident.",
  [EventType.POSSIBLE_FALL_SOUND]:
    "A possible fall sound was detected. Check on the resident's location and condition.",
  [EventType.NORMAL]: "No action required. Continue routine monitoring.",
};
