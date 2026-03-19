const { MongoClient } = require('mongodb');
require('dotenv').config();

// Connection string: prefer env, else provided default from user
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ks4190_db_user:pulY33BbK3UQRjKW@please-god.erkorn3.mongodb.net/?appName=please-god';
// Database name: prefer env, else sensible default
const DB_NAME = process.env.MONGODB_DB || 'gmail_plugin';
const MONGODB_MAX_POOL_SIZE = parseInt(process.env.MONGODB_MAX_POOL_SIZE || '1', 10);
const MONGODB_MIN_POOL_SIZE = parseInt(process.env.MONGODB_MIN_POOL_SIZE || '0', 10);
const MONGODB_MAX_CONNECTING = parseInt(process.env.MONGODB_MAX_CONNECTING || '1', 10);
const MONGODB_WAIT_QUEUE_TIMEOUT_MS = parseInt(process.env.MONGODB_WAIT_QUEUE_TIMEOUT_MS || '5000', 10);

const mongoGlobal = globalThis.__gmailPluginMongo || (globalThis.__gmailPluginMongo = {
  client: null,
  db: null,
  connectPromise: null
});

let _client = mongoGlobal.client;
let _db = mongoGlobal.db;
let _connectPromise = mongoGlobal.connectPromise;

// Lightweight in-memory cache so synchronous readers can work without async/await refactors
// Shape: { [collection]: { [userEmail]: doc } }
const _cache = Object.create(null);
const COLLECTIONS = [
  'oauth_tokens',
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
  'priority_emails',
  'precategorized_emails'
];
const GENERATED_FEATURES_COLLECTION = 'generated_features';
const USER_FEATURE_PREFERENCES_COLLECTION = 'user_feature_preferences';

async function initMongo() {
  if (_db) return _db;
  if (_connectPromise) return _connectPromise;
  _connectPromise = (async () => {
    _client = new MongoClient(MONGODB_URI, {
      maxPoolSize: Number.isFinite(MONGODB_MAX_POOL_SIZE) && MONGODB_MAX_POOL_SIZE > 0 ? MONGODB_MAX_POOL_SIZE : 1,
      minPoolSize: Number.isFinite(MONGODB_MIN_POOL_SIZE) && MONGODB_MIN_POOL_SIZE >= 0 ? MONGODB_MIN_POOL_SIZE : 0,
      maxConnecting: Number.isFinite(MONGODB_MAX_CONNECTING) && MONGODB_MAX_CONNECTING > 0 ? MONGODB_MAX_CONNECTING : 1,
      waitQueueTimeoutMS: Number.isFinite(MONGODB_WAIT_QUEUE_TIMEOUT_MS) && MONGODB_WAIT_QUEUE_TIMEOUT_MS > 0 ? MONGODB_WAIT_QUEUE_TIMEOUT_MS : 5000,
      maxIdleTimeMS: 10000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 20000,
      serverSelectionTimeoutMS: 15000,
    });
    await _client.connect();
    _db = _client.db(DB_NAME);
    mongoGlobal.client = _client;
    mongoGlobal.db = _db;
    mongoGlobal.connectPromise = _connectPromise;

    // Ensure basic indexes for per-user docs and init cache buckets
    await Promise.all(COLLECTIONS.map(async (name) => {
      _cache[name] = _cache[name] || Object.create(null);
      try { await _db.collection(name).createIndex({ userEmail: 1 }, { unique: true }); } catch (_) {}
    }));
    try {
      await _db.collection(GENERATED_FEATURES_COLLECTION).createIndex({ featureId: 1 }, { unique: true });
    } catch (_) {}
    try {
      await _db.collection(GENERATED_FEATURES_COLLECTION).createIndex({ status: 1 });
    } catch (_) {}
    try {
      await _db.collection(GENERATED_FEATURES_COLLECTION).createIndex({ createdBy: 1 });
    } catch (_) {}
    try {
      await _db.collection(USER_FEATURE_PREFERENCES_COLLECTION).createIndex(
        { userEmail: 1, featureId: 1 },
        { unique: true }
      );
    } catch (_) {}

    return _db;
  })();

  try {
    return await _connectPromise;
  } catch (err) {
    _connectPromise = null;
    _db = null;
    _client = null;
    mongoGlobal.connectPromise = null;
    mongoGlobal.db = null;
    mongoGlobal.client = null;
    throw err;
  }
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

async function createOrUpdateGeneratedFeature(featureId, payload = {}) {
  const db = getDb();
  const coll = db.collection(GENERATED_FEATURES_COLLECTION);
  const now = new Date();
  const normalizedFeatureId = String(featureId || '').trim();
  if (!normalizedFeatureId) {
    throw new Error('featureId is required');
  }

  const toStore = {
    featureId: normalizedFeatureId,
    ...payload,
    updatedAt: now
  };

  await coll.updateOne(
    { featureId: normalizedFeatureId },
    {
      $set: toStore,
      $setOnInsert: { createdAt: now }
    },
    { upsert: true }
  );

  return coll.findOne({ featureId: normalizedFeatureId });
}

async function getGeneratedFeature(featureId) {
  const db = getDb();
  return db.collection(GENERATED_FEATURES_COLLECTION).findOne({ featureId: String(featureId || '').trim() });
}

async function listGeneratedFeatures(filter = {}, options = {}) {
  const db = getDb();
  const sort = options.sort || { updatedAt: -1, createdAt: -1, featureId: 1 };
  return db.collection(GENERATED_FEATURES_COLLECTION).find(filter).sort(sort).toArray();
}

async function updateGeneratedFeatureStatus(featureId, status, extra = {}) {
  return createOrUpdateGeneratedFeature(featureId, {
    ...extra,
    status
  });
}

async function upsertUserFeaturePreference(userEmail, featureId, payload = {}) {
  const db = getDb();
  const coll = db.collection(USER_FEATURE_PREFERENCES_COLLECTION);
  const now = new Date();
  const normalizedUserEmail = String(userEmail || '').trim().toLowerCase();
  const normalizedFeatureId = String(featureId || '').trim();

  if (!normalizedUserEmail || !normalizedFeatureId) {
    throw new Error('userEmail and featureId are required');
  }

  await coll.updateOne(
    { userEmail: normalizedUserEmail, featureId: normalizedFeatureId },
    {
      $set: {
        userEmail: normalizedUserEmail,
        featureId: normalizedFeatureId,
        ...payload,
        updatedAt: now
      },
      $setOnInsert: { createdAt: now }
    },
    { upsert: true }
  );

  return coll.findOne({ userEmail: normalizedUserEmail, featureId: normalizedFeatureId });
}

async function getUserFeaturePreference(userEmail, featureId) {
  const db = getDb();
  return db.collection(USER_FEATURE_PREFERENCES_COLLECTION).findOne({
    userEmail: String(userEmail || '').trim().toLowerCase(),
    featureId: String(featureId || '').trim()
  });
}

async function listUserFeaturePreferences(userEmail) {
  const db = getDb();
  return db.collection(USER_FEATURE_PREFERENCES_COLLECTION).find({
    userEmail: String(userEmail || '').trim().toLowerCase()
  }).toArray();
}

async function getVisibleDeployedFeaturesForUser(userEmail) {
  const [features, preferences] = await Promise.all([
    listGeneratedFeatures({ status: 'deployed' }),
    listUserFeaturePreferences(userEmail)
  ]);

  const prefMap = new Map(preferences.map(pref => [pref.featureId, pref]));
  return features.filter(feature => {
    const pref = prefMap.get(feature.featureId);
    if (!pref) return true;
    return pref.visible !== false && pref.enabled !== false;
  });
}

module.exports = {
  initMongo,
  getDb,
  getUserDoc,
  setUserDoc,
  warmCacheForUser,
  getCachedDoc,
  createOrUpdateGeneratedFeature,
  getGeneratedFeature,
  listGeneratedFeatures,
  updateGeneratedFeatureStatus,
  upsertUserFeaturePreference,
  getUserFeaturePreference,
  listUserFeaturePreferences,
  getVisibleDeployedFeaturesForUser,
};
