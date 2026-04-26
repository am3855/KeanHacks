import type { PoseLandmark, SafeZone } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Pose Signal Extraction Helpers
// These functions turn raw MediaPipe landmark arrays into the SafetySignals
// needed by the classifier. All coordinates are normalized (0–1).
// ─────────────────────────────────────────────────────────────────────────────

// MediaPipe Pose Landmarker indices we care about
export const LM = {
  NOSE: 0,
  LEFT_EYE: 1,
  RIGHT_EYE: 2,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Detection thresholds — tune these constants to adjust sensitivity.
// ─────────────────────────────────────────────────────────────────────────────
export const DETECTION_THRESHOLDS = {
  // Seizure-like motion detection (experimental — OFF by default)
  seizureMinDurationSeconds: 6,
  seizureMovementThreshold: 0.70,   // overall movementScore minimum
  seizureMajorBodyThreshold: 0.55,  // majorBodyMovementScore minimum (excludes wrists)
  seizureCooldownMs: 180_000,       // 3 minutes between seizure events

  // Wandering: torso center must be outside zone for this long before flagging
  wanderingOutsideDurationSeconds: 3,
  wanderingCooldownMs: 60_000,

  // Choking: hands near throat must be sustained this long before flagging
  chokingHandDurationSeconds: 3,
  chokingCooldownMs: 120_000,

  // Safe zone: expand inward tolerance so transient boundary touches don't trigger
  safeZoneMargin: 0.05,

  // Video clip: only record on urgent, 2-minute cooldown per resident
  criticalClipCooldownMs: 120_000,

  // Per-event-type persistence cooldowns (ms) — prevents MongoDB/S3 spam
  eventCooldowns: {
    wandering: 60_000,
    possible_fall: 120_000,
    fall_risk: 60_000,
    immobility: 120_000,
    unsafe_posture: 60_000,
    seizure_like_motion: 180_000,
    possible_choking: 120_000,
    audio_distress: 60_000,
    possible_distress_sound: 60_000,
    possible_fall_sound: 120_000,
    out_of_frame: 60_000,
    normal: 0,
  } as Record<string, number>,
} as const;

// ─── Midpoint between two landmarks ──────────────────────────────────────────
function mid(a: PoseLandmark, b: PoseLandmark): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// ─── Angle between the torso vector and the vertical axis ────────────────────
// Returns 0 when standing upright, ~90 when lying flat.
export function calculatePostureAngle(landmarks: PoseLandmark[]): number {
  const lShoulder = landmarks[LM.LEFT_SHOULDER];
  const rShoulder = landmarks[LM.RIGHT_SHOULDER];
  const lHip = landmarks[LM.LEFT_HIP];
  const rHip = landmarks[LM.RIGHT_HIP];

  if (!lShoulder || !rShoulder || !lHip || !rHip) return 0;

  const shoulder = mid(lShoulder, rShoulder);
  const hip = mid(lHip, rHip);

  const dx = Math.abs(shoulder.x - hip.x);
  const dy = Math.abs(shoulder.y - hip.y);

  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

// ─── Determine if the resident is lying down ─────────────────────────────────
export function detectLyingDown(landmarks: PoseLandmark[]): boolean {
  const lShoulder = landmarks[LM.LEFT_SHOULDER];
  const rShoulder = landmarks[LM.RIGHT_SHOULDER];
  const lHip = landmarks[LM.LEFT_HIP];
  const rHip = landmarks[LM.RIGHT_HIP];
  const lAnkle = landmarks[LM.LEFT_ANKLE];
  const rAnkle = landmarks[LM.RIGHT_ANKLE];

  if (!lShoulder || !rShoulder || !lHip || !rHip) return false;

  const angle = calculatePostureAngle(landmarks);
  if (angle > 50) return true;

  const yValues = [lShoulder.y, rShoulder.y, lHip.y, rHip.y];
  const xValues = [lShoulder.x, rShoulder.x, lHip.x, rHip.x];

  if (lAnkle) { yValues.push(lAnkle.y); xValues.push(lAnkle.x); }
  if (rAnkle) { yValues.push(rAnkle.y); xValues.push(rAnkle.x); }

  const verticalSpread = Math.max(...yValues) - Math.min(...yValues);
  const horizontalSpread = Math.max(...xValues) - Math.min(...xValues);

  return horizontalSpread > verticalSpread * 1.3;
}

// ─── Full-body movement score (includes wrists) ───────────────────────────────
// Returns 0–1 where 0 = completely still and 1 = large movement.
export function calculateMovementScore(
  current: PoseLandmark[],
  previous: PoseLandmark[]
): number {
  const keyIndices = [
    LM.NOSE,
    LM.LEFT_SHOULDER,
    LM.RIGHT_SHOULDER,
    LM.LEFT_HIP,
    LM.RIGHT_HIP,
    LM.LEFT_WRIST,
    LM.RIGHT_WRIST,
  ];

  let totalDelta = 0;
  let count = 0;

  for (const idx of keyIndices) {
    const c = current[idx];
    const p = previous[idx];
    if (!c || !p) continue;
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    totalDelta += Math.sqrt(dx * dx + dy * dy);
    count++;
  }

  if (count === 0) return 0;
  return Math.min((totalDelta / count) / 0.05, 1);
}

// ─── Major-body movement score (excludes wrists/elbows) ──────────────────────
// Used for seizure detection to avoid false positives from hand/arm movement.
export function calculateMajorBodyMovementScore(
  current: PoseLandmark[],
  previous: PoseLandmark[]
): number {
  const keyIndices = [
    LM.NOSE,
    LM.LEFT_SHOULDER,
    LM.RIGHT_SHOULDER,
    LM.LEFT_HIP,
    LM.RIGHT_HIP,
  ];

  let totalDelta = 0;
  let count = 0;

  for (const idx of keyIndices) {
    const c = current[idx];
    const p = previous[idx];
    if (!c || !p) continue;
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    totalDelta += Math.sqrt(dx * dx + dy * dy);
    count++;
  }

  if (count === 0) return 0;
  return Math.min((totalDelta / count) / 0.05, 1);
}

// ─── Body center position (torso center in normalized coords) ─────────────────
// Uses average of shoulders + hips for better stability than hip-only.
export function getBodyCenter(landmarks: PoseLandmark[]): { x: number; y: number } | null {
  const lShoulder = landmarks[LM.LEFT_SHOULDER];
  const rShoulder = landmarks[LM.RIGHT_SHOULDER];
  const lHip = landmarks[LM.LEFT_HIP];
  const rHip = landmarks[LM.RIGHT_HIP];

  const available = [lShoulder, rShoulder, lHip, rHip].filter(Boolean) as PoseLandmark[];
  if (available.length < 2) return null;

  const x = available.reduce((s, lm) => s + lm.x, 0) / available.length;
  const y = available.reduce((s, lm) => s + lm.y, 0) / available.length;
  return { x, y };
}

// ─── Safe-zone check using torso center + outward margin ─────────────────────
// The margin expands the effective zone so boundary glitches don't trigger.
// Wandering should still be debounced in the hook for 3+ seconds.
export function isInsideSafeZone(landmarks: PoseLandmark[], zone: SafeZone): boolean {
  const center = getBodyCenter(landmarks);
  if (!center) return true; // default safe when position unknown

  const m = DETECTION_THRESHOLDS.safeZoneMargin;
  return (
    center.x >= zone.x - m &&
    center.x <= zone.x + zone.width + m &&
    center.y >= zone.y - m &&
    center.y <= zone.y + zone.height + m
  );
}

// ─── Detect if hands are near the throat/neck area ───────────────────────────
// Throat is approximated as the midpoint between nose and shoulder midpoint.
// Returns true if at least one wrist is within HAND_THROAT_DIST of the throat.
export function detectHandsNearThroat(landmarks: PoseLandmark[]): boolean {
  const nose = landmarks[LM.NOSE];
  const lShoulder = landmarks[LM.LEFT_SHOULDER];
  const rShoulder = landmarks[LM.RIGHT_SHOULDER];
  const lWrist = landmarks[LM.LEFT_WRIST];
  const rWrist = landmarks[LM.RIGHT_WRIST];

  if (!nose || !lShoulder || !rShoulder) return false;

  const shoulderMidX = (lShoulder.x + rShoulder.x) / 2;
  const shoulderMidY = (lShoulder.y + rShoulder.y) / 2;
  const throatX = (nose.x + shoulderMidX) / 2;
  const throatY = (nose.y + shoulderMidY) / 2;

  const HAND_THROAT_DIST = 0.12; // normalized units

  const dist = (lm: PoseLandmark) =>
    Math.sqrt((lm.x - throatX) ** 2 + (lm.y - throatY) ** 2);

  return (lWrist && dist(lWrist) < HAND_THROAT_DIST) ||
    (rWrist && dist(rWrist) < HAND_THROAT_DIST) ||
    false;
}

// ─── Check that at least the core landmarks are visible ──────────────────────
export function isPoseVisible(landmarks: PoseLandmark[]): boolean {
  if (!landmarks || landmarks.length === 0) return false;
  const keyIndices = [LM.NOSE, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP];
  let count = 0;
  for (const idx of keyIndices) {
    const lm = landmarks[idx];
    if (lm && (lm.visibility === undefined || lm.visibility > 0.3)) count++;
  }
  return count >= 2;
}

// ─── Clamp a safe zone so all values are valid ────────────────────────────────
// x+width ≤ 1, y+height ≤ 1, width/height ≥ 0.1
export function clampSafeZone(z: SafeZone): SafeZone {
  const x = Math.max(0, Math.min(0.9, z.x));
  const y = Math.max(0, Math.min(0.9, z.y));
  const width = Math.max(0.1, Math.min(1 - x, z.width));
  const height = Math.max(0.1, Math.min(1 - y, z.height));
  return { x, y, width, height };
}

// ─── Default safe zone: almost full frame (4% left/right, 2% top/bottom) ─────
export const DEFAULT_SAFE_ZONE: SafeZone = {
  x: 0.04,
  y: 0.02,
  width: 0.92,
  height: 0.96,
};

// ─── MediaPipe skeleton connections ───────────────────────────────────────────
export const POSE_CONNECTIONS: [number, number][] = [
  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
  [LM.LEFT_SHOULDER, LM.LEFT_HIP],
  [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
  [LM.LEFT_HIP, LM.RIGHT_HIP],
  [LM.LEFT_SHOULDER, LM.LEFT_ELBOW],
  [LM.LEFT_ELBOW, LM.LEFT_WRIST],
  [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
  [LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
  [LM.LEFT_HIP, LM.LEFT_KNEE],
  [LM.LEFT_KNEE, LM.LEFT_ANKLE],
  [LM.RIGHT_HIP, LM.RIGHT_KNEE],
  [LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  [LM.NOSE, LM.LEFT_SHOULDER],
  [LM.NOSE, LM.RIGHT_SHOULDER],
];
