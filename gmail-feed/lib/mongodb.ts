import { MongoClient, Db } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI!;
const DB_NAME = process.env.MONGODB_DB || 'gmail_feed';

let client: MongoClient | null = null;
let db: Db | null = null;

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

export async function connectToDatabase(): Promise<Db> {
  if (db) return db;

  if (process.env.NODE_ENV === 'development') {
    if (!global._mongoClientPromise) {
      client = new MongoClient(MONGODB_URI, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 15000,
      });
      global._mongoClientPromise = client.connect();
    }
    client = await global._mongoClientPromise;
  } else {
    if (!client) {
      client = new MongoClient(MONGODB_URI, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 15000,
      });
      await client.connect();
    }
  }

  db = client.db(DB_NAME);
  return db;
}

// Token storage - MULTI-USER
export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  userEmail: string;
  updatedAt: Date;
}

export async function getStoredTokens(userEmail: string): Promise<TokenData | null> {
  const database = await connectToDatabase();
  const doc = await database.collection('oauth_tokens').findOne({ userEmail });
  return doc as TokenData | null;
}

export async function getAllUsers(): Promise<TokenData[]> {
  const database = await connectToDatabase();
  const docs = await database.collection<TokenData>('oauth_tokens').find({}).toArray();
  return docs as unknown as TokenData[];
}

export async function storeTokens(tokens: Omit<TokenData, 'updatedAt'>): Promise<void> {
  const database = await connectToDatabase();
  await database.collection('oauth_tokens').updateOne(
    { userEmail: tokens.userEmail },
    {
      $set: {
        ...tokens,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
}

export async function deleteTokens(userEmail: string): Promise<void> {
  const database = await connectToDatabase();
  await database.collection('oauth_tokens').deleteOne({ userEmail });
}

// Message within a thread
export interface ThreadMessage {
  id: string;
  snippet: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
  isUnread: boolean;
  labels: string[];
  isSent: boolean; // true if sent by the user
}

// Thread (group of messages)
export interface EmailThread {
  threadId: string;
  subject: string;
  snippet: string; // Latest message snippet
  participants: string[]; // All participants in the thread
  messageCount: number;
  messages: ThreadMessage[];
  lastMessageDate: string;
  hasUnread: boolean;
  labels: string[];
}

export interface ThreadCache {
  threads: EmailThread[];
  lastFetched: Date;
  userEmail: string;
}

// Get cached threads for a specific user
export async function getCachedThreads(userEmail: string): Promise<ThreadCache | null> {
  const database = await connectToDatabase();
  const doc = await database.collection('thread_cache').findOne({ userEmail });
  return doc as ThreadCache | null;
}

// Cache threads for a specific user
export async function cacheThreads(threads: EmailThread[], userEmail: string): Promise<void> {
  const database = await connectToDatabase();
  await database.collection('thread_cache').updateOne(
    { userEmail },
    {
      $set: {
        threads,
        userEmail,
        lastFetched: new Date(),
      },
    },
    { upsert: true }
  );
}

// Delete thread cache for a user (logout)
export async function deleteThreadCache(userEmail: string): Promise<void> {
  const database = await connectToDatabase();
  await database.collection('thread_cache').deleteOne({ userEmail });
}

// Legacy - keep for backwards compatibility
export interface StoredEmail {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
  isUnread: boolean;
  labels: string[];
}

export interface EmailCache {
  emails: StoredEmail[];
  lastFetched: Date;
  userEmail: string;
}

export async function getCachedEmails(userEmail: string): Promise<EmailCache | null> {
  const database = await connectToDatabase();
  const doc = await database.collection('email_cache').findOne({ userEmail });
  return doc as EmailCache | null;
}

export async function cacheEmails(emails: StoredEmail[], userEmail: string): Promise<void> {
  const database = await connectToDatabase();
  await database.collection('email_cache').updateOne(
    { userEmail },
    {
      $set: {
        emails,
        userEmail,
        lastFetched: new Date(),
      },
    },
    { upsert: true }
  );
}

export async function deleteEmailCache(userEmail: string): Promise<void> {
  const database = await connectToDatabase();
  await database.collection('email_cache').deleteOne({ userEmail });
}
