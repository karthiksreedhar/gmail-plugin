const { MongoClient } = require('mongodb');
require('dotenv').config({ path: ['.env.local', '.env'] });

// Connection string: required. A hardcoded fallback used to live here, which
// meant the credentials shipped in git and every checkout pointed at the same
// production cluster. Fail fast instead so a missing env var is obvious.
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error('MONGODB_URI is required. Set it in .env (see SETUP_INSTRUCTIONS.md).');
}
// Database name: prefer env, else sensible default
const DB_NAME = process.env.MONGODB_DB || 'gmail_plugin';
// Pool defaults: 3 connections proved too small — request bursts (registry +
// emails + notes + feature calls in parallel) exhausted the pool and follow-up
// writes died with WaitQueueTimeoutError ("Failed to archive" in the UI).
const MONGODB_MAX_POOL_SIZE = parseInt(process.env.MONGODB_MAX_POOL_SIZE || '10', 10);
const MONGODB_MIN_POOL_SIZE = parseInt(process.env.MONGODB_MIN_POOL_SIZE || '0', 10);
const MONGODB_MAX_CONNECTING = parseInt(process.env.MONGODB_MAX_CONNECTING || '4', 10);
const MONGODB_WAIT_QUEUE_TIMEOUT_MS = parseInt(process.env.MONGODB_WAIT_QUEUE_TIMEOUT_MS || '15000', 10);

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
  'archived_emails',
  'test_emails',
  'user_state',
  'drafts',
  'response_templates',
  'template_matches',
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
      maxPoolSize: Number.isFinite(MONGODB_MAX_POOL_SIZE) && MONGODB_MAX_POOL_SIZE > 0 ? MONGODB_MAX_POOL_SIZE : 3,
      minPoolSize: Number.isFinite(MONGODB_MIN_POOL_SIZE) && MONGODB_MIN_POOL_SIZE >= 0 ? MONGODB_MIN_POOL_SIZE : 0,
      maxConnecting: Number.isFinite(MONGODB_MAX_CONNECTING) && MONGODB_MAX_CONNECTING > 0 ? MONGODB_MAX_CONNECTING : 2,
      waitQueueTimeoutMS: Number.isFinite(MONGODB_WAIT_QUEUE_TIMEOUT_MS) && MONGODB_WAIT_QUEUE_TIMEOUT_MS > 0 ? MONGODB_WAIT_QUEUE_TIMEOUT_MS : 15000,
      maxIdleTimeMS: 30000,
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

const CORE_WARM_COLLECTIONS = [
  'oauth_tokens',
  'categories',
  'response_emails',
  'email_threads',
  'unreplied_emails',
  'priority_emails',
  'precategorized_emails',
  'hidden_threads',
  'hidden_inbox'
];

async function warmCacheForUser(userEmail, options = {}) {
  const db = getDb();
  const include = Array.isArray(options.include) && options.include.length > 0
    ? options.include
    : CORE_WARM_COLLECTIONS;
  const maxTimeMS = Number.isFinite(options.maxTimeMS) && options.maxTimeMS > 0 ? options.maxTimeMS : 1500;

  const tasks = include.map(async (name) => {
    try {
      _cache[name] = _cache[name] || Object.create(null);
      const doc = await db.collection(name).findOne({ userEmail }, { maxTimeMS });
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

// --- Session store ---
// express-session's default MemoryStore is per-process. On Vercel that meant
// every cold start dropped every session, so identity silently fell back to a
// plaintext cookie. Sessions live in Mongo instead: they survive restarts and
// are shared across instances. A TTL index expires them server-side.
const SESSIONS_COLLECTION = 'sessions';
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function createMongoSessionStore(session, options = {}) {
  const ttlMs = Number.isFinite(options.ttlMs) && options.ttlMs > 0
    ? options.ttlMs
    : DEFAULT_SESSION_TTL_MS;

  class MongoSessionStore extends session.Store {
    constructor() {
      super();
      // Kick off index creation once; every operation awaits initMongo anyway.
      this.indexReady = initMongo()
        .then(db => db.collection(SESSIONS_COLLECTION).createIndex(
          { expiresAt: 1 },
          { expireAfterSeconds: 0 }
        ))
        .catch(err => {
          console.warn('[SessionStore] TTL index creation failed:', err?.message || err);
        });
    }

    async collection() {
      await initMongo();
      return getDb().collection(SESSIONS_COLLECTION);
    }

    expiryFor(sess) {
      const cookieExpires = sess?.cookie?.expires;
      if (cookieExpires) {
        const parsed = new Date(cookieExpires);
        if (!Number.isNaN(parsed.getTime())) return parsed;
      }
      return new Date(Date.now() + ttlMs);
    }

    get(sid, callback) {
      this.collection()
        .then(coll => coll.findOne({ _id: sid }))
        .then(doc => {
          if (!doc) return callback(null, null);
          // Mongo's TTL reaper runs about once a minute, so an expired doc can
          // still be readable. Treat it as absent rather than honoring it.
          if (doc.expiresAt && doc.expiresAt.getTime() <= Date.now()) {
            return callback(null, null);
          }
          let parsed = null;
          try {
            parsed = typeof doc.session === 'string' ? JSON.parse(doc.session) : doc.session;
          } catch (err) {
            return callback(null, null);
          }
          return callback(null, parsed || null);
        })
        .catch(err => {
          // Erroring here would 500 every request while Mongo is unreachable.
          // Report "no session" instead and let the signed identity cookie
          // carry the request.
          console.warn('[SessionStore] get failed:', err?.message || err);
          callback(null, null);
        });
    }

    set(sid, sess, callback) {
      let serialized;
      try {
        serialized = JSON.stringify(sess);
      } catch (err) {
        return callback(err);
      }
      this.collection()
        .then(coll => coll.updateOne(
          { _id: sid },
          {
            $set: {
              session: serialized,
              expiresAt: this.expiryFor(sess),
              updatedAt: new Date()
            }
          },
          { upsert: true }
        ))
        .then(() => callback(null))
        .catch(err => {
          console.warn('[SessionStore] set failed:', err?.message || err);
          callback(null);
        });
    }

    touch(sid, sess, callback) {
      this.collection()
        .then(coll => coll.updateOne(
          { _id: sid },
          { $set: { expiresAt: this.expiryFor(sess), updatedAt: new Date() } }
        ))
        .then(() => callback(null))
        .catch(err => {
          console.warn('[SessionStore] touch failed:', err?.message || err);
          callback(null);
        });
    }

    destroy(sid, callback) {
      this.collection()
        .then(coll => coll.deleteOne({ _id: sid }))
        .then(() => callback(null))
        .catch(err => callback(err));
    }
  }

  return new MongoSessionStore();
}

module.exports = {
  initMongo,
  createMongoSessionStore,
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
