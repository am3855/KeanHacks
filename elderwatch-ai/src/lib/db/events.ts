import { ObjectId } from "mongodb";
import { getDb, isMongoEnabled } from "../mongodb";
import { generateMockEvents, getInMemoryStore } from "../mockData";
import { getVideoClipsByResident } from "./videoClips";
import type { SafetyEvent, DashboardAnalytics, ResidentHistory, EventTypeValue } from "../types";

const COLLECTION = "safety_events";

export async function createSafetyEvent(event: Omit<SafetyEvent, "_id">): Promise<SafetyEvent> {
  if (!isMongoEnabled()) {
    const stored: SafetyEvent = { ...event, _id: new ObjectId().toHexString() };
    return getInMemoryStore().createEvent(stored);
  }
  const db = await getDb();
  const result = await db.collection(COLLECTION).insertOne(event);
  return { ...event, _id: result.insertedId.toHexString() };
}

export async function getRecentEvents(limit = 50): Promise<SafetyEvent[]> {
  if (!isMongoEnabled()) {
    return getInMemoryStore().getRecentEvents(limit);
  }
  const db = await getDb();
  return db
    .collection<SafetyEvent>(COLLECTION)
    .find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray() as Promise<SafetyEvent[]>;
}

export async function getEventsByResident(
  residentId: string,
  limit = 30
): Promise<SafetyEvent[]> {
  if (!isMongoEnabled()) {
    return getInMemoryStore().getEventsByResident(residentId, limit);
  }
  const db = await getDb();
  return db
    .collection<SafetyEvent>(COLLECTION)
    .find({ residentId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray() as Promise<SafetyEvent[]>;
}

export async function acknowledgeEvent(
  id: string,
  acknowledgedBy: string
): Promise<SafetyEvent | null> {
  if (!isMongoEnabled()) {
    return getInMemoryStore().acknowledgeEvent(id, acknowledgedBy);
  }
  const db = await getDb();
  const now = new Date().toISOString();
  let filter: object;
  try {
    filter = { _id: new ObjectId(id) };
  } catch {
    filter = { _id: id };
  }
  const result = await db.collection<SafetyEvent>(COLLECTION).findOneAndUpdate(
    filter,
    { $set: { acknowledged: true, acknowledgedBy, acknowledgedAt: now } },
    { returnDocument: "after" }
  );
  return result as SafetyEvent | null;
}

export async function getEventAnalytics(): Promise<DashboardAnalytics> {
  if (!isMongoEnabled()) {
    return getInMemoryStore().getAnalytics() as DashboardAnalytics;
  }
  const db = await getDb();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [total, urgent, assist] = await Promise.all([
    db.collection(COLLECTION).countDocuments({ createdAt: { $gte: cutoff } }),
    db.collection(COLLECTION).countDocuments({ severity: "urgent", createdAt: { $gte: cutoff } }),
    db.collection(COLLECTION).countDocuments({ severity: "assist", createdAt: { $gte: cutoff } }),
  ]);

  const typeAgg = await db
    .collection(COLLECTION)
    .aggregate([
      { $match: { createdAt: { $gte: cutoff } } },
      { $group: { _id: "$eventType", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 },
    ])
    .toArray();

  const residentAgg = await db
    .collection(COLLECTION)
    .aggregate([
      { $match: { createdAt: { $gte: cutoff } } },
      {
        $group: {
          _id: "$residentId",
          name: { $first: "$residentName" },
          room: { $first: "$room" },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 1 },
    ])
    .toArray();

  return {
    totalEventsLast24h: total,
    urgentEventsLast24h: urgent,
    assistEventsLast24h: assist,
    mostFrequentEventType: (typeAgg[0]?._id as EventTypeValue) ?? null,
    residentWithMostAlerts: residentAgg[0]
      ? { name: residentAgg[0].name, room: residentAgg[0].room, count: residentAgg[0].count }
      : null,
  };
}

export async function getResidentHistory(residentId: string): Promise<ResidentHistory> {
  if (!isMongoEnabled()) {
    return getInMemoryStore().getResidentHistory(residentId) as ResidentHistory;
  }
  const db = await getDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();

  const [todayEvents, allEvents, videoClips] = await Promise.all([
    db
      .collection(COLLECTION)
      .countDocuments({ residentId, createdAt: { $gte: todayStr } }),
    db
      .collection<SafetyEvent>(COLLECTION)
      .find({ residentId })
      .sort({ createdAt: -1 })
      .limit(30)
      .toArray(),
    getVideoClipsByResident(residentId, 10),
  ]);

  const typeCounts: Record<string, number> = {};
  for (const e of allEvents) {
    typeCounts[e.eventType] = (typeCounts[e.eventType] || 0) + 1;
  }
  const mostCommon = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];

  return {
    totalEventsToday: todayEvents,
    urgentEvents: allEvents.filter((e) => e.severity === "urgent").length,
    assistEvents: allEvents.filter((e) => e.severity === "assist").length,
    watchEvents: allEvents.filter((e) => e.severity === "watch").length,
    totalVideoClips: videoClips.length,
    latestVideoClipAt: videoClips[0]?.createdAt ?? null,
    mostCommonEventType: (mostCommon?.[0] as EventTypeValue) ?? null,
    lastEventAt: allEvents[0]?.createdAt ?? null,
    recentEvents: allEvents.slice(0, 20) as SafetyEvent[],
    videoClips,
  };
}

export async function seedEvents(): Promise<void> {
  if (!isMongoEnabled()) return;
  const db = await getDb();
  const col = db.collection(COLLECTION);
  const existing = await col.countDocuments();
  if (existing > 0) return; // Don't re-seed
  const events = generateMockEvents();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await col.insertMany(events as any);
}
