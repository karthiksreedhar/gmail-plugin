/**
 * MongoDB connection helper for gmail-plugin
 * - Uses official mongodb driver
 * - Reads MONGO_URI and MONGO_DB_NAME from environment variables
 * - Exposes getDb() and getCollection(name)
 * - Provides ensureIndexes() to set common indexes
 *
 * Required env:
 *   MONGO_URI=mongodb+srv://...
 *   MONGO_DB_NAME=gmail-plugin (or your chosen DB)
 *
 * Optional env:
 *   MONGO_MAX_POOL=20
 */

const { MongoClient } = require('mongodb');

let _client = null;
let _db = null;
let _dbName = null;

async function connectMongo() {
  if (_db) return _db;

  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME || 'gmail-plugin';
  if (!uri) {
    throw new Error('Missing MONGO_URI environment variable');
  }

  const maxPool = Number(process.env.MONGO_MAX_POOL || 20);

  _client = new MongoClient(uri, {
    maxPoolSize: maxPool,
    serverSelectionTimeoutMS: 20000,
    retryWrites: true
  });

  await _client.connect();
  _db = _client.db(dbName);
  _dbName = dbName;

  return _db;
}

/**
 * Return the active DB instance (connects lazily if needed).
 */
async function getDb() {
  if (_db) return _db;
  return await connectMongo();
}

/**
 * Shorthand to get a collection
 */
async function getCollection(name) {
  const db = await getDb();
  return db.collection(name);
}

/**
 * Ensure common indexes used across the app.
 * Safe to call on startup; createIndex is idempotent.
 */
async function ensureIndexes() {
  const db = await getDb();

  // Users
  await db.collection('users').createIndex({ user_email: 1 }, { unique: true });

  // Response emails
  await db.collection('response_emails').createIndex({ user_email: 1, id: 1 }, { unique: true });
  await db.collection('response_emails').createIndex({ user_email: 1, date: -1 });
  await db.collection('response_emails').createIndex({ user_email: 1, category: 1 });

  // Email threads
  await db.collection('email_threads').createIndex({ user_email: 1, id: 1 }, { unique: true });
  await db.collection('email_threads').createIndex({ user_email: 1, date: -1 });

  // Unreplied emails
  await db.collection('unreplied_emails').createIndex({ user_email: 1, id: 1 }, { unique: true });
  await db.collection('unreplied_emails').createIndex({ user_email: 1, date: -1 });

  // Notes
  await db.collection('notes').createIndex({ user_email: 1, id: 1 }, { unique: true });
  await db.collection('notes').createIndex({ user_email: 1, category: 1 });

  // Email notes
  await db.collection('email_notes').createIndex({ user_email: 1, id: 1 }, { unique: true });
  await db.collection('email_notes').createIndex({ user_email: 1, email_id: 1 });

  // Category guidelines/summaries
  await db.collection('category_guidelines').createIndex({ user_email: 1 }, { unique: true });
  await db.collection('category_summaries').createIndex({ user_email: 1 }, { unique: true });

  // Categories list
  await db.collection('categories_list').createIndex({ user_email: 1, nameLower: 1 }, { unique: true });
  await db.collection('categories_list').createIndex({ user_email: 1, position: 1 });

  // Hidden
  await db.collection('hidden_threads').createIndex({ user_email: 1, id: 1 }, { unique: true });
  await db.collection('hidden_inbox').createIndex({ user_email: 1, id: 1 }, { unique: false });

  // Scenarios / Generations / Refinements
  await db.collection('scenarios').createIndex({ user_email: 1, id: 1 }, { unique: true });
  await db.collection('saved_generations').createIndex({ user_email: 1, id: 1 }, { unique: true });
  await db.collection('refinements').createIndex({ user_email: 1, id: 1 }, { unique: true });

  // Gmail tokens
  await db.collection('gmail_tokens').createIndex({ user_email: 1 }, { unique: true });
}

module.exports = {
  connectMongo,
  getDb,
  getCollection,
  ensureIndexes
};
