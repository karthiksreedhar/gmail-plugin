#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config();
const { initMongo, getUserDoc, setUserDoc, getDb } = require('../db');

const TARGET_CATEGORIES = new Set(['grants/funding', 'columbia core/teaching']);

function hasTargetCategory(item) {
  if (!item) return false;
  const allCats = [];
  if (item.category) allCats.push(String(item.category));
  if (Array.isArray(item.categories)) allCats.push(...item.categories.map(c => String(c || '')));
  return allCats.some(c => TARGET_CATEGORIES.has(String(c || '').trim().toLowerCase()));
}

function parseArgs(argv) {
  const out = { user: process.env.CURRENT_USER_EMAIL || '', apply: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--user' && argv[i + 1]) {
      out.user = argv[++i];
    } else if (a === '--dry-run') {
      out.apply = false;
    }
  }
  return out;
}

async function getTargetUsers(userFromArg) {
  if (userFromArg) return [String(userFromArg).trim().toLowerCase()];
  const db = getDb();
  const docs = await db.collection('oauth_tokens').find({}).project({ userEmail: 1 }).toArray();
  return Array.from(new Set(docs.map(d => String(d?.userEmail || '').trim().toLowerCase()).filter(Boolean)));
}

async function processUser(userEmail, apply) {
  const responseDoc = await getUserDoc('response_emails', userEmail);
  const threadDoc = await getUserDoc('email_threads', userEmail);
  const unrepliedDoc = await getUserDoc('unreplied_emails', userEmail);

  const responses = Array.isArray(responseDoc?.emails) ? responseDoc.emails : [];
  const threads = Array.isArray(threadDoc?.threads) ? threadDoc.threads : [];
  const unreplied = Array.isArray(unrepliedDoc?.emails) ? unrepliedDoc.emails : [];

  const idsToRemove = new Set(responses.filter(hasTargetCategory).map(r => r.id).filter(Boolean));
  const filteredResponses = responses.filter(r => !idsToRemove.has(r?.id));
  const filteredThreads = threads.filter(t => {
    if (!t) return true;
    if (t.responseId && idsToRemove.has(t.responseId)) return false;
    if (Array.isArray(t.messages) && t.messages.some(m => m && idsToRemove.has(m.id))) return false;
    return true;
  });
  const filteredUnreplied = unreplied.filter(u => {
    if (!u) return true;
    if (u.id && idsToRemove.has(u.id)) return false;
    if (hasTargetCategory(u)) return false;
    return true;
  });

  const summary = {
    userEmail,
    removedResponses: responses.length - filteredResponses.length,
    removedThreads: threads.length - filteredThreads.length,
    removedUnreplied: unreplied.length - filteredUnreplied.length
  };

  if (apply) {
    await setUserDoc('response_emails', userEmail, { emails: filteredResponses });
    await setUserDoc('email_threads', userEmail, { threads: filteredThreads });
    await setUserDoc('unreplied_emails', userEmail, { emails: filteredUnreplied });
  }

  return summary;
}

async function main() {
  const args = parseArgs(process.argv);
  await initMongo();
  const users = await getTargetUsers(args.user);
  if (!users.length) {
    console.log('No users found.');
    return;
  }

  console.log(`${args.apply ? 'Applying' : 'Dry-run'} removal for categories: Grants/Funding, Columbia Core/Teaching`);
  for (const user of users) {
    const s = await processUser(user, args.apply);
    console.log(
      `${s.userEmail}: responses -${s.removedResponses}, threads -${s.removedThreads}, unreplied -${s.removedUnreplied}`
    );
  }
}

main().catch(err => {
  console.error('Script failed:', err?.message || err);
  process.exit(1);
});

