import { NextResponse } from "next/server";
import { getResidentHistory } from "@/lib/db/events";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const history = await getResidentHistory(params.id);
    return NextResponse.json(history);
  } catch (err) {
    console.error("GET /api/residents/[id]/history error:", err);
    return NextResponse.json({ error: "Failed to fetch resident history" }, { status: 500 });
  }
}
