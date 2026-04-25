import { MongoClient, Db } from "mongodb";

// ─────────────────────────────────────────────────────────────────────────────
// MongoDB Connection Helper
// Caches the client in the Node.js global object during development to prevent
// exhausting the connection pool across hot-reloads.
// Falls back gracefully when MONGODB_URI is not set.
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME = process.env.MONGODB_DB || "elderwatch_ai";

declare global {
  // Cached promise lives on the Node.js global object
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

let clientPromise: Promise<MongoClient> | null = null;

export function isMongoEnabled(): boolean {
  return !!process.env.MONGODB_URI;
}

export async function getMongoClient(): Promise<MongoClient> {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set");
  }

  if (process.env.NODE_ENV === "development") {
    // In dev, reuse the cached promise to avoid too many connections
    if (!global._mongoClientPromise) {
      const client = new MongoClient(process.env.MONGODB_URI);
      global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
  } else {
    if (!clientPromise) {
      const client = new MongoClient(process.env.MONGODB_URI);
      clientPromise = client.connect();
    }
  }

  return clientPromise!;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(DB_NAME);
}
