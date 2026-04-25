import { NextResponse } from "next/server";
import { getRecentEvents, createSafetyEvent } from "@/lib/db/events";
import { RECOMMENDED_ACTIONS } from "@/lib/classifySafety";
import type { SafetyEvent } from "@/lib/types";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "50");
  try {
    const events = await getRecentEvents(limit);
    return NextResponse.json({ events });
  } catch (err) {
    console.error("GET /api/events error:", err);
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      residentId, residentName, room, severity, eventType,
      confidence, reason, signals, videoClip,
    } = body;

    if (!residentId || !severity || !eventType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const event: Omit<SafetyEvent, "_id"> = {
      residentId,
      residentName,
      room,
      severity,
      eventType,
      confidence,
      reason,
      recommendedAction: RECOMMENDED_ACTIONS[eventType] ?? "",
      signals,
      source: "live_camera",
      acknowledged: false,
      acknowledgedBy: null,
      acknowledgedAt: null,
      hasVideoClip: !!videoClip,
      videoClipId: null,
      videoClip: videoClip ?? null,
      createdAt: new Date().toISOString(),
    };

    const created = await createSafetyEvent(event);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error("POST /api/events error:", err);
    return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
  }
}
