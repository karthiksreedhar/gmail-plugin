const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = process.env.MONGODB_DB || 'gmail_plugin';
const MONGODB_MAX_POOL_SIZE = parseInt(process.env.MONGODB_MAX_POOL_SIZE || '3', 10);
const MONGODB_MIN_POOL_SIZE = parseInt(process.env.MONGODB_MIN_POOL_SIZE || '0', 10);
const MONGODB_MAX_CONNECTING = parseInt(process.env.MONGODB_MAX_CONNECTING || '2', 10);
const MONGODB_WAIT_QUEUE_TIMEOUT_MS = parseInt(process.env.MONGODB_WAIT_QUEUE_TIMEOUT_MS || '15000', 10);

const mongoGlobal = globalThis.__featureGeneratorMongo || (globalThis.__featureGeneratorMongo = {
  client: null,
  db: null,
  connectPromise: null
});

let _client = mongoGlobal.client;
let _db = mongoGlobal.db;
let _connectPromise = mongoGlobal.connectPromise;

async function initMongo() {
  if (_db) return _db;
  if (_connectPromise) return _connectPromise;
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not configured');
  }

  _connectPromise = (async () => {
    _client = new MongoClient(MONGODB_URI, {
      maxPoolSize: Number.isFinite(MONGODB_MAX_POOL_SIZE) && MONGODB_MAX_POOL_SIZE > 0 ? MONGODB_MAX_POOL_SIZE : 3,
      minPoolSize: Number.isFinite(MONGODB_MIN_POOL_SIZE) && MONGODB_MIN_POOL_SIZE >= 0 ? MONGODB_MIN_POOL_SIZE : 0,
      maxConnecting: Number.isFinite(MONGODB_MAX_CONNECTING) && MONGODB_MAX_CONNECTING > 0 ? MONGODB_MAX_CONNECTING : 2,
      waitQueueTimeoutMS: Number.isFinite(MONGODB_WAIT_QUEUE_TIMEOUT_MS) && MONGODB_WAIT_QUEUE_TIMEOUT_MS > 0 ? MONGODB_WAIT_QUEUE_TIMEOUT_MS : 15000,
      maxIdleTimeMS: 30000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 20000,
      serverSelectionTimeoutMS: 15000
    });
    await _client.connect();
    _db = _client.db(DB_NAME);
    mongoGlobal.client = _client;
    mongoGlobal.db = _db;
    mongoGlobal.connectPromise = _connectPromise;
    return _db;
  })();

  try {
    return await _connectPromise;
  } catch (err) {
    _connectPromise = null;
    _client = null;
    _db = null;
    mongoGlobal.connectPromise = null;
    mongoGlobal.client = null;
    mongoGlobal.db = null;
    throw err;
  }
}

function getDb() {
  if (!_db) throw new Error('MongoDB not initialized. Call initMongo() first.');
  return _db;
}

async function getUserDoc(collectionName, userEmail) {
  const db = getDb();
  return (await db.collection(collectionName).findOne({ userEmail })) || null;
}

async function setUserDoc(collectionName, userEmail, payload) {
  const db = getDb();
  const coll = db.collection(collectionName);
  const toStore = { userEmail, ...payload, _updatedAt: new Date() };
  await coll.updateOne({ userEmail }, { $set: toStore }, { upsert: true });
  return true;
}

module.exports = {
  initMongo,
  getDb,
  getUserDoc,
  setUserDoc
};
