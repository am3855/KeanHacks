// ─────────────────────────────────────────────────────────────────────────────
// ElderWatch AI — Core Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

// Resident safety severity levels
export const ResidentStatus = {
  STABLE: "stable",
  WATCH: "watch",
  ASSIST: "assist",
  URGENT: "urgent",
} as const;

// Types of safety events that can be detected
export const EventType = {
  FALL_RISK: "fall_risk",
  POSSIBLE_FALL: "possible_fall",
  IMMOBILITY: "immobility",
  WANDERING: "wandering",
  UNSAFE_POSTURE: "unsafe_posture",
  OUT_OF_FRAME: "out_of_frame",
  NORMAL: "normal",
} as const;

export type ResidentStatusValue = (typeof ResidentStatus)[keyof typeof ResidentStatus];
export type EventTypeValue = (typeof EventType)[keyof typeof EventType];

// ─── Mock Resident Profile (MOCK DATA ONLY — not real patient data) ───────────
export interface ResidentProfile {
  id: string;
  name: string;
  age: number;
  room: string;
  mobility: string;
  fallRisk: "Low" | "Medium" | "High";
  conditions: string[];
  careNotes: string;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Pose-derived safety signals computed each frame ─────────────────────────
export interface SafetySignals {
  isLyingDown: boolean;
  movementScore: number;   // 0–1: 0 = no movement, 1 = lots of movement
  postureAngle: number;    // degrees from vertical (0 = upright, 90 = horizontal)
  secondsStill: number;    // seconds since last significant movement
  insideSafeZone: boolean; // whether resident is within the defined safe zone
  visible: boolean;        // whether any pose was detected this frame
}

// ─── Result of applying the safety classifier ────────────────────────────────
export interface SafetyClassification {
  severity: ResidentStatusValue;
  eventType: EventTypeValue;
  reason: string;
  confidence: number; // 0–1
}

// ─── A persisted safety event (stored in MongoDB) ────────────────────────────
export interface SafetyEvent {
  _id?: string;
  residentId: string;
  residentName: string;
  room: string;
  severity: ResidentStatusValue;
  eventType: EventTypeValue;
  confidence: number;
  reason: string;
  recommendedAction: string;
  signals: SafetySignals;
  source: "live_camera" | "manual";
  acknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

// ─── A caregiver note attached to an event ────────────────────────────────────
export interface CaregiverNote {
  _id?: string;
  residentId: string;
  eventId: string;
  note: string;
  createdBy: string;
  createdAt: string;
}

// ─── Dashboard analytics summary ─────────────────────────────────────────────
export interface DashboardAnalytics {
  totalEventsLast24h: number;
  urgentEventsLast24h: number;
  assistEventsLast24h: number;
  mostFrequentEventType: EventTypeValue | null;
  residentWithMostAlerts: { name: string; room: string; count: number } | null;
}

// ─── Resident event history summary ──────────────────────────────────────────
export interface ResidentHistory {
  totalEventsToday: number;
  urgentEvents: number;
  assistEvents: number;
  watchEvents: number;
  mostCommonEventType: EventTypeValue | null;
  lastEventAt: string | null;
  recentEvents: SafetyEvent[];
}

// ─── Safe zone rectangle in normalized camera coordinates (0–1) ───────────────
export interface SafeZone {
  x: number;      // left edge
  y: number;      // top edge
  width: number;
  height: number;
}

// ─── Pose landmark (mirrors MediaPipe NormalizedLandmark) ────────────────────
export interface PoseLandmark {
  x: number; // normalized 0–1
  y: number; // normalized 0–1
  z: number;
  visibility?: number;
}
