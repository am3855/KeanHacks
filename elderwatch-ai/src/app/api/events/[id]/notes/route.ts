import { NextResponse } from "next/server";
import { getNotesForEvent, createCaregiverNote } from "@/lib/db/notes";
import type { CaregiverNote } from "@/lib/types";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const notes = await getNotesForEvent(params.id);
    return NextResponse.json({ notes });
  } catch (err) {
    console.error("GET /api/events/[id]/notes error:", err);
    return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { residentId, note, createdBy } = body;

    if (!note?.trim()) {
      return NextResponse.json({ error: "Note text is required" }, { status: 400 });
    }

    const noteDoc: Omit<CaregiverNote, "_id"> = {
      residentId: residentId || "unknown",
      eventId: params.id,
      note: note.trim(),
      createdBy: createdBy || "Demo Caregiver",
      createdAt: new Date().toISOString(),
    };

    const created = await createCaregiverNote(noteDoc);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error("POST /api/events/[id]/notes error:", err);
    return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
  }
}
