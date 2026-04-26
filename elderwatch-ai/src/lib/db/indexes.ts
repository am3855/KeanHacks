import { getDb } from "../mongodb";

// Creates indexes on all collections. Safe to call multiple times — MongoDB
// ignores createIndex calls if an identical index already exists.
export async function ensureIndexes(): Promise<void> {
  const db = await getDb();

  await Promise.all([
    // safety_events: sorted lookups by resident and by severity
    db.collection("safety_events").createIndex({ residentId: 1, createdAt: -1 }),
    db.collection("safety_events").createIndex({ severity: 1, createdAt: -1 }),
    db.collection("safety_events").createIndex({ createdAt: -1 }),

    // video_clips: per-resident clip list, and lookup by linked event
    db.collection("video_clips").createIndex({ residentId: 1, createdAt: -1 }),
    db.collection("video_clips").createIndex({ eventId: 1 }),

    // caregiver_notes: per-event and per-resident lookups
    db.collection("caregiver_notes").createIndex({ eventId: 1 }),
    db.collection("caregiver_notes").createIndex({ residentId: 1 }),

    // residents: unique lookup by string id field (not _id)
    db.collection("residents").createIndex({ id: 1 }, { unique: true }),
  ]);
}
