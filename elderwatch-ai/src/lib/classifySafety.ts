import {
  ResidentStatus,
  EventType,
  type SafetySignals,
  type SafetyClassification,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Core Safety Classifier
// Rule-based — no ML model required. Processes pose-derived signals into a
// structured severity + event classification for display and persistence.
// ─────────────────────────────────────────────────────────────────────────────

export function classifyResidentSafety(signals: SafetySignals): SafetyClassification {
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
      reason: "Resident appears to be lying down with minimal movement",
      confidence: 0.9,
    };
  }

  // 3. Fall risk — lying down but still some movement (may be getting up)
  if (signals.isLyingDown && signals.movementScore >= 0.1) {
    return {
      severity: ResidentStatus.ASSIST,
      eventType: EventType.FALL_RISK,
      reason: "Resident is in a low/horizontal position with some movement — possible fall risk",
      confidence: 0.78,
    };
  }

  // 4. Prolonged immobility — no movement for more than 5 minutes
  if (signals.secondsStill > 300) {
    return {
      severity: ResidentStatus.ASSIST,
      eventType: EventType.IMMOBILITY,
      reason: "Resident has shown very little movement for several minutes",
      confidence: 0.84,
    };
  }

  // 5. Wandering — resident left the designated safe zone
  if (!signals.insideSafeZone) {
    return {
      severity: ResidentStatus.WATCH,
      eventType: EventType.WANDERING,
      reason: "Resident has left the designated safe area",
      confidence: 0.78,
    };
  }

  // 6. Unsafe posture — torso heavily tilted (slumping, leaning dangerously)
  if (signals.postureAngle > 60) {
    return {
      severity: ResidentStatus.ASSIST,
      eventType: EventType.UNSAFE_POSTURE,
      reason: "Resident posture appears unstable or heavily slumped",
      confidence: 0.8,
    };
  }

  // 7. Watch — mildly elevated posture angle (early warning)
  if (signals.postureAngle > 35) {
    return {
      severity: ResidentStatus.WATCH,
      eventType: EventType.UNSAFE_POSTURE,
      reason: "Resident is leaning — posture worth monitoring",
      confidence: 0.65,
    };
  }

  // Default: all clear
  return {
    severity: ResidentStatus.STABLE,
    eventType: EventType.NORMAL,
    reason: "No concerning activity detected",
    confidence: 0.95,
  };
}

// ─── Recommended actions for each event type (used in persistence + AI panel) ─
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
  [EventType.OUT_OF_FRAME]:
    "Verify the resident's location manually. They may have moved out of camera view.",
  [EventType.NORMAL]: "No action required. Continue routine monitoring.",
};
