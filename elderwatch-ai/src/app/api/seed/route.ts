import { NextResponse } from "next/server";
import { seedResidents } from "@/lib/db/residents";
import { seedEvents } from "@/lib/db/events";
import { seedNotes } from "@/lib/db/notes";
import { isMongoEnabled } from "@/lib/mongodb";

export async function POST() {
  if (!isMongoEnabled()) {
    return NextResponse.json({
      message: "Running in demo mode — in-memory data already pre-loaded. No seeding needed.",
      mongoConnected: false,
    });
  }

  try {
    await Promise.all([seedResidents(), seedEvents(), seedNotes()]);
    return NextResponse.json({
      message: "Demo data seeded successfully into MongoDB.",
      mongoConnected: true,
    });
  } catch (err) {
    console.error("POST /api/seed error:", err);
    return NextResponse.json({ error: "Seed failed", details: String(err) }, { status: 500 });
  }
}
