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

// ─── Midpoint between two landmarks ──────────────────────────────────────────
function mid(a: PoseLandmark, b: PoseLandmark): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// ─── Angle between the torso vector and the vertical axis ────────────────────
// Returns 0 when standing upright, ~90 when lying flat.
// Uses the midpoint of shoulders → midpoint of hips as the torso vector.
export function calculatePostureAngle(landmarks: PoseLandmark[]): number {
  const lShoulder = landmarks[LM.LEFT_SHOULDER];
  const rShoulder = landmarks[LM.RIGHT_SHOULDER];
  const lHip = landmarks[LM.LEFT_HIP];
  const rHip = landmarks[LM.RIGHT_HIP];

  if (!lShoulder || !rShoulder || !lHip || !rHip) return 0;

  const shoulder = mid(lShoulder, rShoulder);
  const hip = mid(lHip, rHip);

  // dx = horizontal offset, dy = vertical offset between shoulder and hip mid-points
  const dx = Math.abs(shoulder.x - hip.x);
  const dy = Math.abs(shoulder.y - hip.y);

  // atan2(horizontal, vertical) gives angle from vertical
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

// ─── Determine if the resident is lying down ─────────────────────────────────
// Two complementary heuristics for robustness:
// 1. Torso angle > 50° (more horizontal than vertical)
// 2. Vertical spread of key body landmarks is small compared to horizontal spread
export function detectLyingDown(landmarks: PoseLandmark[]): boolean {
  const lShoulder = landmarks[LM.LEFT_SHOULDER];
  const rShoulder = landmarks[LM.RIGHT_SHOULDER];
  const lHip = landmarks[LM.LEFT_HIP];
  const rHip = landmarks[LM.RIGHT_HIP];
  const lAnkle = landmarks[LM.LEFT_ANKLE];
  const rAnkle = landmarks[LM.RIGHT_ANKLE];

  if (!lShoulder || !rShoulder || !lHip || !rHip) return false;

  // Heuristic 1: torso angle
  const angle = calculatePostureAngle(landmarks);
  if (angle > 50) return true;

  // Heuristic 2: overall body aspect ratio
  // Collect all available key-point Y values to measure vertical extent
  const yValues = [lShoulder.y, rShoulder.y, lHip.y, rHip.y];
  const xValues = [lShoulder.x, rShoulder.x, lHip.x, rHip.x];

  if (lAnkle) { yValues.push(lAnkle.y); xValues.push(lAnkle.x); }
  if (rAnkle) { yValues.push(rAnkle.y); xValues.push(rAnkle.x); }

  const verticalSpread = Math.max(...yValues) - Math.min(...yValues);
  const horizontalSpread = Math.max(...xValues) - Math.min(...xValues);

  // If the body is wider than it is tall (in normalized frame), likely lying
  return horizontalSpread > verticalSpread * 1.3;
}

// ─── Movement score between two consecutive landmark frames ──────────────────
// Returns 0–1 where 0 = completely still and 1 = large movement.
// Compares the position deltas of key anchor points.
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
  const avgDelta = totalDelta / count;

  // Scale: 0.05 normalized units per frame is considered "a lot" of movement
  return Math.min(avgDelta / 0.05, 1);
}

// ─── Body center position (hip midpoint in normalized coords) ─────────────────
export function getBodyCenter(landmarks: PoseLandmark[]): { x: number; y: number } | null {
  const lHip = landmarks[LM.LEFT_HIP];
  const rHip = landmarks[LM.RIGHT_HIP];
  if (!lHip || !rHip) return null;
  return mid(lHip, rHip);
}

// ─── Check if body center is inside the safe zone rectangle ──────────────────
export function isInsideSafeZone(landmarks: PoseLandmark[], zone: SafeZone): boolean {
  const center = getBodyCenter(landmarks);
  if (!center) return true; // default to safe when position is unknown

  return (
    center.x >= zone.x &&
    center.x <= zone.x + zone.width &&
    center.y >= zone.y &&
    center.y <= zone.y + zone.height
  );
}

// ─── Check that at least the core landmarks are visible with good confidence ──
// Uses `some` across nose + shoulders + hips so that partially-occluded poses
// (e.g. hips out of frame) still register as visible when shoulders are clear.
export function isPoseVisible(landmarks: PoseLandmark[]): boolean {
  if (!landmarks || landmarks.length === 0) return false;
  // Require at least 2 of these 5 key landmarks to have reasonable visibility
  const keyIndices = [LM.NOSE, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP];
  let count = 0;
  for (const idx of keyIndices) {
    const lm = landmarks[idx];
    if (lm && (lm.visibility === undefined || lm.visibility > 0.3)) count++;
  }
  return count >= 2;
}

// ─── Default safe zone: 80% of the frame (10% margin on each side) ───────────
export const DEFAULT_SAFE_ZONE: SafeZone = {
  x: 0.1,
  y: 0.05,
  width: 0.8,
  height: 0.9,
};

// ─── MediaPipe connections for drawing the skeleton ───────────────────────────
// Each pair is [from, to] landmark index.
export const POSE_CONNECTIONS: [number, number][] = [
  // Torso
  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
  [LM.LEFT_SHOULDER, LM.LEFT_HIP],
  [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
  [LM.LEFT_HIP, LM.RIGHT_HIP],
  // Left arm
  [LM.LEFT_SHOULDER, LM.LEFT_ELBOW],
  [LM.LEFT_ELBOW, LM.LEFT_WRIST],
  // Right arm
  [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
  [LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
  // Left leg
  [LM.LEFT_HIP, LM.LEFT_KNEE],
  [LM.LEFT_KNEE, LM.LEFT_ANKLE],
  // Right leg
  [LM.RIGHT_HIP, LM.RIGHT_KNEE],
  [LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  // Head to shoulders
  [LM.NOSE, LM.LEFT_SHOULDER],
  [LM.NOSE, LM.RIGHT_SHOULDER],
];
