const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = process.env.MONGODB_DB || 'gmail_plugin';

let _client = null;
let _db = null;

async function initMongo() {
  if (_db) return _db;
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not configured');
  }

  _client = new MongoClient(MONGODB_URI, {
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 15000
  });
  await _client.connect();
  _db = _client.db(DB_NAME);
  return _db;
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
