const { MongoClient } = require('mongodb');
require('dotenv').config({ path: ['.env.local', '.env'] });

const MONGODB_URI = String(process.env.MONGODB_URI || '').trim();
const DB_NAME = String(process.env.MONGODB_DB || 'gmail_plugin').trim();

function redactMongoUri(uri) {
  if (!uri) return '(empty)';
  return uri.replace(/\/\/([^:\/]+):([^@]+)@/, '//$1:***@');
}

async function checkMongoConnection() {
  if (!MONGODB_URI) {
    console.error('ERROR: MONGODB_URI is not set.');
    process.exit(1);
  }

  console.log('Checking MongoDB connection...');
  console.log(`URI: ${redactMongoUri(MONGODB_URI)}`);
  console.log(`DB: ${DB_NAME}`);

  const client = new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000
  });

  try {
    await client.connect();

    const db = client.db(DB_NAME);
    const ping = await db.command({ ping: 1 });
    if (ping.ok !== 1) {
      throw new Error(`Unexpected ping response: ${JSON.stringify(ping)}`);
    }

    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    console.log('SUCCESS: Connected to MongoDB.');
    console.log(`Collections found: ${collections.length}`);
    process.exit(0);
  } catch (err) {
    console.error('FAILED: MongoDB connection check failed.');
    console.error(err && err.message ? err.message : err);
    process.exit(2);
  } finally {
    try {
      await client.close();
    } catch (_) {}
  }
}

checkMongoConnection();
