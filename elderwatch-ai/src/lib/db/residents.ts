import { getDb, isMongoEnabled } from "../mongodb";
import { MOCK_RESIDENTS, getInMemoryStore } from "../mockData";
import type { ResidentProfile } from "../types";

const COLLECTION = "residents";

export async function getResidents(): Promise<ResidentProfile[]> {
  if (!isMongoEnabled()) {
    return getInMemoryStore().getResidents();
  }
  const db = await getDb();
  return db.collection<ResidentProfile>(COLLECTION).find({}).toArray() as Promise<ResidentProfile[]>;
}

export async function getResidentById(id: string): Promise<ResidentProfile | null> {
  if (!isMongoEnabled()) {
    return getInMemoryStore().getResidentById(id);
  }
  const db = await getDb();
  return db.collection<ResidentProfile>(COLLECTION).findOne({ id }) as Promise<ResidentProfile | null>;
}

export async function seedResidents(): Promise<void> {
  if (!isMongoEnabled()) return; // In-memory already has data

  const db = await getDb();
  const col = db.collection<ResidentProfile>(COLLECTION);

  // Upsert each mock resident by their string id field
  for (const resident of MOCK_RESIDENTS) {
    await col.updateOne(
      { id: resident.id },
      { $setOnInsert: resident },
      { upsert: true }
    );
  }
}
