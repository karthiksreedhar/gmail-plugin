#!/usr/bin/env node
/**
 * Apply db/schema.sql to the database pointed to by DATABASE_URL.
 *
 * Usage:
 *   PGSSLMODE=require DATABASE_URL=postgres://... node scripts/apply-schema.js
 *
 * Notes:
 * - Uses a single multi-statement query; safe to re-run (CREATE IF NOT EXISTS, ON CONFLICT).
 * - SSL is enabled when PGSSLMODE=require or POSTGRES_SSL=true.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function needSSL() {
  return String(process.env.PGSSLMODE || '').toLowerCase() === 'require' ||
         String(process.env.POSTGRES_SSL || '').toLowerCase() === 'true';
}

async function main() {
  const connStr = process.env.DATABASE_URL;
  if (!connStr) {
    console.error('ERROR: DATABASE_URL env var is required');
    process.exit(1);
  }

  const schemaPath = path.resolve('db', 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.error(`ERROR: Schema file not found: ${schemaPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(schemaPath, 'utf8');
  console.log(`Applying schema from ${schemaPath}...`);
  console.log(`SSL: ${needSSL() ? 'enabled (rejectUnauthorized=false)' : 'disabled'}`);

  const client = new Client({
    connectionString: connStr,
    ssl: needSSL() ? { rejectUnauthorized: false } : undefined
  });

  await client.connect();
  try {
    await client.query(sql);
    console.log('Schema applied successfully.');
  } catch (e) {
    console.error('Failed to apply schema:', e?.message || e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err?.message || err);
  process.exit(1);
});
