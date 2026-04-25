import { ObjectId } from "mongodb";
import { getDb, isMongoEnabled } from "../mongodb";
import { getInMemoryStore } from "../mockData";
import type { VideoClip } from "../types";

const COLLECTION = "video_clips";

export async function createVideoClip(clip: Omit<VideoClip, "_id">): Promise<VideoClip> {
  if (!isMongoEnabled()) {
    const stored: VideoClip = { ...clip, _id: new ObjectId().toHexString() };
    return getInMemoryStore().createVideoClip(stored);
  }
  const db = await getDb();
  const result = await db.collection(COLLECTION).insertOne(clip);
  return { ...clip, _id: result.insertedId.toHexString() };
}

export async function getVideoClipsByResident(residentId: string, limit = 20): Promise<VideoClip[]> {
  if (!isMongoEnabled()) {
    return getInMemoryStore().getVideoClipsByResident(residentId).slice(0, limit);
  }
  const db = await getDb();
  return db
    .collection<VideoClip>(COLLECTION)
    .find({ residentId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray() as Promise<VideoClip[]>;
}

export async function getVideoClipById(id: string): Promise<VideoClip | null> {
  if (!isMongoEnabled()) {
    return getInMemoryStore().getVideoClipById(id);
  }
  const db = await getDb();
  let filter: object;
  try {
    filter = { _id: new ObjectId(id) };
  } catch {
    filter = { _id: id };
  }
  return db.collection<VideoClip>(COLLECTION).findOne(filter) as Promise<VideoClip | null>;
}

export async function seedVideoClips(): Promise<void> {
  if (!isMongoEnabled()) return;
  const db = await getDb();
  const col = db.collection(COLLECTION);
  const existing = await col.countDocuments();
  if (existing > 0) return;
  // Seed is intentionally a no-op for real clips since there's no actual S3 content in demo
}
