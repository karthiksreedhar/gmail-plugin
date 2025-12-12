const { MongoClient } = require('mongodb');
require('dotenv').config();

// Connection string: prefer env, else provided default from user
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ks4190_db_user:pulY33BbK3UQRjKW@please-god.erkorn3.mongodb.net/?appName=please-god';
// Database name: prefer env, else sensible default
const DB_NAME = process.env.MONGODB_DB || 'gmail_plugin';

let _client = null;
let _db = null;

// Lightweight in-memory cache so synchronous readers can work without async/await refactors
// Shape: { [collection]: { [userEmail]: doc } }
const _cache = Object.create(null);
const COLLECTIONS = [
  'response_emails',
  'email_threads',
  'unreplied_emails',
  'notes',
  'categories',
  'category_guidelines',
  'category_summaries',
  'email_notes',
  'hidden_threads',
  'hidden_inbox',
  'test_emails',
  'user_state',
  'classifier_log',
  'priority_emails'
];

async function initMongo() {
  if (_db) return _db;
  _client = new MongoClient(MONGODB_URI, {
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 15000,
  });
  await _client.connect();
  _db = _client.db(DB_NAME);

  // Ensure basic indexes for per-user docs and init cache buckets
  await Promise.all(COLLECTIONS.map(async (name) => {
    _cache[name] = _cache[name] || Object.create(null);
    try { await _db.collection(name).createIndex({ userEmail: 1 }, { unique: true }); } catch (_) {}
  }));

  return _db;
}

function getDb() {
  if (!_db) throw new Error('MongoDB not initialized. Call initMongo() first.');
  return _db;
}

async function warmCacheForUser(userEmail) {
  const db = getDb();
  const tasks = COLLECTIONS.map(async (name) => {
    try {
      const doc = await db.collection(name).findOne({ userEmail });
      if (doc) {
        _cache[name][userEmail] = doc;
      }
    } catch (_) {}
  });
  await Promise.all(tasks);
}

function getCachedDoc(collectionName, userEmail) {
  const bucket = _cache[collectionName] || {};
  return bucket[userEmail] || null;
}

async function getUserDoc(collectionName, userEmail) {
  const db = getDb();
  const coll = db.collection(collectionName);
  const doc = await coll.findOne({ userEmail });
  // Update cache on read-through
  if (doc) {
    _cache[collectionName] = _cache[collectionName] || Object.create(null);
    _cache[collectionName][userEmail] = doc;
  }
  return doc || null;
}

async function setUserDoc(collectionName, userEmail, payload) {
  const db = getDb();
  const coll = db.collection(collectionName);
  const now = new Date();
  const toStore = { userEmail, ...payload, _updatedAt: now };
  await coll.updateOne(
    { userEmail },
    { $set: toStore },
    { upsert: true }
  );
  // Update cache after write
  _cache[collectionName] = _cache[collectionName] || Object.create(null);
  _cache[collectionName][userEmail] = toStore;
  return true;
}

module.exports = {
  initMongo,
  getDb,
  getUserDoc,
  setUserDoc,
  warmCacheForUser,
  getCachedDoc,
};
