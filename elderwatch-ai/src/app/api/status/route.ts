import { NextResponse } from "next/server";
import { isMongoEnabled, getDb } from "@/lib/mongodb";
import { isS3Configured } from "@/lib/s3";
import { isSmsConfigured } from "@/lib/sms";

// GET /api/status
// Returns actual connectivity state: pings MongoDB and checks S3 env vars.
// Used by the dashboard header indicators on mount.
export async function GET() {
  let mongoConnected = false;

  if (isMongoEnabled()) {
    try {
      const db = await Promise.race([
        getDb(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("MongoDB connection timeout")), 3000)
        ),
      ]);
      await db.command({ ping: 1 });
      mongoConnected = true;
    } catch {
      mongoConnected = false;
    }
  }

  return NextResponse.json({
    mongoConnected,
    s3Configured: isS3Configured(),
    smsConfigured: isSmsConfigured(),
    demoMode: !isMongoEnabled(),
  });
}
