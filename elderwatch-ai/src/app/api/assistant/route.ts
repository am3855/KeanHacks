import { NextResponse } from "next/server";
import type { ResidentProfile, SafetyClassification } from "@/lib/types";
import { RECOMMENDED_ACTIONS } from "@/lib/classifySafety";

// ─────────────────────────────────────────────────────────────────────────────
// AI Care Assistant Route
// Returns general (non-medical, non-diagnostic) guidance for caregivers.
// Uses Claude API if ANTHROPIC_API_KEY is set; otherwise returns realistic
// mock guidance grounded in the current event context.
//
// DISCLAIMER: Responses are general guidance only and do not constitute
// medical advice. Always follow your facility's protocols.
// ─────────────────────────────────────────────────────────────────────────────

interface AssistantRequest {
  question: string;
  resident: ResidentProfile;
  classification: SafetyClassification;
}

const MOCK_RESPONSES: Record<string, string> = {
  possible_fall:
    "A possible fall was detected. Approach calmly and check if the resident is conscious and responsive. Do not move them if they report pain or injury is suspected. Clear the area of hazards and call for help if needed. Follow your facility's emergency protocol and notify medical staff promptly.",
  fall_risk:
    "The resident appears to be in a low or unstable position. Approach carefully, offer a steady hand, and help them return to a safe seated or standing posture. Ensure the floor is clear of obstacles and document the incident per your facility's protocol.",
  immobility:
    "The resident has had very little movement for an extended period. Check in gently to confirm they are comfortable and alert. Offer water and ask if they need assistance. If they appear unresponsive or unusually lethargic, escalate to your supervisor or medical staff immediately.",
  wandering:
    "The resident has moved outside their designated safe area. Approach calmly without startling them and gently redirect them back to their room or common area. Note the time and circumstances in the care log. Consider whether the resident's environment needs adjustment.",
  unsafe_posture:
    "The resident's posture appears unstable. Assist them to a comfortable, well-supported position. Ask if they feel dizzy or in pain. If they report any discomfort, do not force movement and request a clinical assessment.",
  out_of_frame:
    "The resident is no longer visible on camera. Perform a manual check of the room and nearby areas. If they cannot be found within a few minutes, alert your supervisor per facility protocol.",
  normal:
    "No concerns are currently detected. Continue your routine monitoring. Use this time to review the event log and follow up on any previously acknowledged alerts.",
};

async function callClaudeAPI(
  question: string,
  resident: ResidentProfile,
  classification: SafetyClassification
): Promise<string> {
  const systemPrompt = `You are a helpful assistant for professional caregivers at an elderly care facility.
You provide general, practical guidance only — you do not diagnose conditions or replace medical professionals.
Always remind the caregiver to follow their facility's protocols.
Keep responses concise (2–4 sentences), calm, and actionable.
Never make specific medical claims or diagnoses.`;

  const userMessage = `Resident: ${resident.name}, age ${resident.age}, Room ${resident.room}
Mobility: ${resident.mobility}, Fall Risk: ${resident.fallRisk}
Conditions (general notes): ${resident.conditions.join(", ")}
Care notes: ${resident.careNotes}

Current alert: ${classification.severity.toUpperCase()} — ${classification.eventType} (${Math.round(classification.confidence * 100)}% confidence)
Reason: ${classification.reason}
Recommended action: ${RECOMMENDED_ACTIONS[classification.eventType] || "Follow facility protocol"}

Caregiver question: ${question}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
  const data = await response.json();
  return data.content?.[0]?.text ?? "No guidance available at this time.";
}

export async function POST(req: Request) {
  try {
    const body: AssistantRequest = await req.json();
    const { question, resident, classification } = body;

    if (!question || !classification) {
      return NextResponse.json({ error: "Missing question or classification" }, { status: 400 });
    }

    let guidance: string;

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        guidance = await callClaudeAPI(question, resident, classification);
      } catch (apiErr) {
        console.warn("Claude API call failed, using mock:", apiErr);
        guidance =
          MOCK_RESPONSES[classification.eventType] ??
          "Please follow your facility's standard care protocol and check on the resident directly.";
      }
    } else {
      // Mock response — realistic and grounded in the event type
      guidance =
        MOCK_RESPONSES[classification.eventType] ??
        "Please follow your facility's standard care protocol and check on the resident directly.";
    }

    return NextResponse.json({
      guidance,
      disclaimer:
        "This guidance is general information only and does not constitute medical advice. Always follow your facility's protocols and involve medical staff when appropriate.",
      generatedBy: process.env.ANTHROPIC_API_KEY ? "claude" : "mock",
    });
  } catch (err) {
    console.error("POST /api/assistant error:", err);
    return NextResponse.json({ error: "Assistant unavailable" }, { status: 500 });
  }
}
