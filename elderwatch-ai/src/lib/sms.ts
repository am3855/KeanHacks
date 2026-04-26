import type { SafetyEvent } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Twilio SMS integration — server-side only.
// Never import this file from any client component.
// ─────────────────────────────────────────────────────────────────────────────

export function isSmsConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER &&
    process.env.CAREGIVER_PHONE_NUMBER
  );
}

// In-memory cooldown: key = `${residentId}:${eventType}`, value = last sent ms.
// Resets on server restart — acceptable for MVP.
const lastSmsSent = new Map<string, number>();
const SMS_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

function formatSmsBody(event: SafetyEvent): string {
  const name   = event.residentName ?? "Unknown resident";
  const room   = event.room         ?? "unknown room";
  const type   = event.eventType.replace(/_/g, " ");
  const reason = event.reason       ?? "No details available";
  return (
    `Sensara URGENT: ${type} detected for ${name} in ${room}. ` +
    `Reason: ${reason} ` +
    `Check immediately. Prototype only.`
  );
}

export async function sendUrgentSmsAlert(event: SafetyEvent): Promise<void> {
  if (event.severity !== "urgent") return;
  if (!isSmsConfigured()) {
    console.log("[SMS] Not configured — skipping alert.");
    return;
  }

  const cooldownKey = `${event.residentId}:${event.eventType}`;
  const lastSent = lastSmsSent.get(cooldownKey) ?? 0;
  if (Date.now() - lastSent < SMS_COOLDOWN_MS) {
    console.log(`[SMS] Cooldown active for ${cooldownKey} — skipping.`);
    return;
  }

  lastSmsSent.set(cooldownKey, Date.now());

  try {
    // Dynamic import keeps Twilio out of any client bundle
    const twilio = (await import("twilio")).default;
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    );

    await client.messages.create({
      body: formatSmsBody(event),
      from: process.env.TWILIO_PHONE_NUMBER!,
      to:   process.env.CAREGIVER_PHONE_NUMBER!,
    });

    console.log(`[SMS] Alert sent for ${event.eventType} — ${event.residentName}`);
  } catch (err) {
    // SMS failure must never break event creation or the UI
    console.error("[SMS] Failed to send alert:", err);
  }
}
