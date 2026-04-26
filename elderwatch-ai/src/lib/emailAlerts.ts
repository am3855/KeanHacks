import { Resend } from "resend";
import type { SafetyEvent } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Resend email alert integration — server-side only.
// Never import this file from any client component.
// ─────────────────────────────────────────────────────────────────────────────

export function isEmailAlertsConfigured(): boolean {
  return !!(
    process.env.RESEND_API_KEY &&
    process.env.CAREGIVER_EMAIL &&
    process.env.ALERT_FROM_EMAIL
  );
}

const EVENT_LABELS: Record<string, string> = {
  fall_risk: "Fall Risk",
  possible_fall: "Possible Fall",
  immobility: "Immobility",
  wandering: "Wandering",
  unsafe_posture: "Unsafe Posture",
  seizure_like_motion: "Seizure-Like Motion",
  out_of_frame: "Out of Frame",
  audio_distress: "Audio Distress",
  possible_distress_sound: "Distress Sound",
  possible_fall_sound: "Fall Sound",
  possible_choking: "Possible Choking",
};

function getSourceLabel(source: string): string {
  if (source === "audio_monitor") return "Audio";
  if (source === "live_camera") return "Vision";
  return "Demo";
}

function formatEmailHtml(event: SafetyEvent): string {
  const name = event.residentName ?? "Unknown";
  const room = event.room ?? "Unknown";
  const label = EVENT_LABELS[event.eventType] ?? event.eventType.replace(/_/g, " ");
  const source = getSourceLabel(event.source);
  const timestamp = new Date(event.createdAt).toLocaleString();
  const hasClip = event.hasVideoClip || !!event.videoClipId || !!event.videoClip;
  const clipRow = hasClip
    ? `<tr><td style="padding:8px 0;color:#9ca3af;vertical-align:top;">Clip</td><td style="padding:8px 0;color:#60a5fa;">Audio/video clip saved in resident history.</td></tr>`
    : "";
  const actionRow = event.recommendedAction
    ? `<tr><td style="padding:8px 0;color:#9ca3af;vertical-align:top;">Action</td><td style="padding:8px 0;color:#86efac;">${event.recommendedAction}</td></tr>`
    : "";

  return `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f1a14;color:#e8f0e9;border-radius:12px;overflow:hidden;">
  <div style="background:#b91c1c;padding:20px 24px;text-align:center;">
    <h1 style="margin:0;font-size:20px;color:#fff;letter-spacing:0.5px;">🚨 URGENT Safety Alert</h1>
    <p style="margin:6px 0 0;font-size:14px;color:#fca5a5;">Sensara Visual Safety Monitoring</p>
  </div>
  <div style="padding:24px;">
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;color:#9ca3af;width:140px;">Resident</td><td style="padding:8px 0;font-weight:bold;color:#fff;">${name}</td></tr>
      <tr><td style="padding:8px 0;color:#9ca3af;">Room</td><td style="padding:8px 0;color:#e5e7eb;">${room}</td></tr>
      <tr><td style="padding:8px 0;color:#9ca3af;">Event</td><td style="padding:8px 0;color:#fca5a5;font-weight:bold;">${label}</td></tr>
      <tr><td style="padding:8px 0;color:#9ca3af;">Severity</td><td style="padding:8px 0;color:#f87171;font-weight:bold;text-transform:uppercase;">URGENT</td></tr>
      <tr><td style="padding:8px 0;color:#9ca3af;vertical-align:top;">Reason</td><td style="padding:8px 0;color:#e5e7eb;">${event.reason ?? "Not specified"}</td></tr>
      ${actionRow}
      <tr><td style="padding:8px 0;color:#9ca3af;">Source</td><td style="padding:8px 0;color:#e5e7eb;">${source}</td></tr>
      <tr><td style="padding:8px 0;color:#9ca3af;">Time</td><td style="padding:8px 0;color:#e5e7eb;">${timestamp}</td></tr>
      ${clipRow}
    </table>
    <div style="margin-top:20px;padding:12px 16px;background:#1c2e22;border-left:3px solid #4ade80;border-radius:4px;font-size:12px;color:#6b7280;">
      ⚠️ Prototype only — not a medical device. Caregiver should verify in person.
    </div>
  </div>
</div>`.trim();
}

export async function sendUrgentEmailAlert(event: SafetyEvent): Promise<void> {
  if (event.severity !== "urgent") return;
  if (!isEmailAlertsConfigured()) {
    console.log("[Email] Not configured — skipping alert.");
    return;
  }

  const name = event.residentName ?? "Unknown";
  const label = EVENT_LABELS[event.eventType] ?? event.eventType.replace(/_/g, " ");

  try {
    const resend = new Resend(process.env.RESEND_API_KEY!);
    const { data, error } = await resend.emails.send({
      from: process.env.ALERT_FROM_EMAIL!,
      to: process.env.CAREGIVER_EMAIL!,
      subject: `🚨 ElderWatch URGENT: ${label} for ${name}`,
      html: formatEmailHtml(event),
    });

    if (error) {
      console.error("[Email] Resend API error:", error);
    } else {
      console.log(`[Email] Alert sent (id: ${data?.id}) for ${event.eventType} — ${name}`);
    }
  } catch (err) {
    console.error("[Email] Failed to send alert:", err);
  }
}
