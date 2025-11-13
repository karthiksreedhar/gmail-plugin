-- Heroku Postgres bootstrap schema for gmail-plugin
-- Safe to paste into Heroku Data -> SQL editor, or run via psql.
-- This schema models all local JSON stores in relational form, scoped by user_email.

-- Optional extensions (ignored if not permitted)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users (tenants)
CREATE TABLE IF NOT EXISTS users (
  user_email TEXT PRIMARY KEY,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Gmail OAuth tokens per user
CREATE TABLE IF NOT EXISTS gmail_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL REFERENCES users(user_email) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  token_type TEXT,
  scope TEXT,
  expiry_date TIMESTAMPTZ,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gmail_tokens_user ON gmail_tokens(user_email);

-- Authoritative categories list (names + ordering)
CREATE TABLE IF NOT EXISTS categories_list (
  id BIGSERIAL PRIMARY KEY,
  user_email TEXT NOT NULL REFERENCES users(user_email) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
-- One row per unique (user, category name) ignoring case
CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_list_user_name ON categories_list (user_email, lower(name));

-- Response emails (RHS list)
CREATE TABLE IF NOT EXISTS response_emails (
  id TEXT PRIMARY KEY, -- Gmail message id
  user_email TEXT NOT NULL REFERENCES users(user_email) ON DELETE CASCADE,
  subject TEXT,
  from_header TEXT,
  original_from TEXT,
  date TIMESTAMPTZ,
  category TEXT,
  categories JSONB,
  body TEXT,
  snippet TEXT,
  seeded_original_only BOOLEAN NOT NULL DEFAULT FALSE,
  original_body TEXT,
  web_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_response_emails_user_date ON response_emails(user_email, date);
CREATE INDEX IF NOT EXISTS idx_response_emails_user_category ON response_emails(user_email, category);

-- Email threads (full conversation or synthesized)
CREATE TABLE IF NOT EXISTS email_threads (
  id TEXT PRIMARY KEY, -- e.g., thread-<gmailThreadId> or synthetic
  user_email TEXT NOT NULL REFERENCES users(user_email) ON DELETE CASCADE,
  subject TEXT,
  from_header TEXT,
  original_from TEXT,
  date TIMESTAMPTZ,
  response_id TEXT, -- links to response_emails.id (not enforced for legacy)
  messages JSONB,   -- [{id, from, to[], date, subject, body, isResponse}]
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_threads_user_date ON email_threads(user_email, date);

-- Unreplied inbox emails (LHS Inbox modal)
CREATE TABLE IF NOT EXISTS unreplied_emails (
  id TEXT PRIMARY KEY, -- Gmail message id
  user_email TEXT NOT NULL REFERENCES users(user_email) ON DELETE CASCADE,
  subject TEXT,
  from_header TEXT,
  date TIMESTAMPTZ,
  thread_id TEXT,
  body TEXT,
  snippet TEXT,
  category TEXT,
  categories JSONB,
  tags JSONB,      -- e.g., {"unreplied":true, "thread":false}
  source TEXT,     -- e.g., "gmail-api", "seed-categories"
  web_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_unreplied_emails_user_date ON unreplied_emails(user_email, date);

-- Notes (global and category-local)
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL REFERENCES users(user_email) ON DELETE CASCADE,
  category TEXT,
  text TEXT,
  scope TEXT CHECK (scope IN ('GLOBAL','LOCAL')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_user_category ON notes(user_email, category);

-- Per-email notes (flattened from notesByEmail map)
CREATE TABLE IF NOT EXISTS email_notes (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL REFERENCES users(user_email) ON DELETE CASCADE,
  email_id TEXT NOT NULL,
  text TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_notes_user_emailid ON email_notes(user_email, email_id);

-- Category guidelines (array of {name, notes})
CREATE TABLE IF NOT EXISTS category_guidelines (
  user_email TEXT PRIMARY KEY REFERENCES users(user_email) ON DELETE CASCADE,
  categories JSONB NOT NULL,  -- [{name, notes}]
  updated_at TIMESTAMPTZ NOT NULL
);

-- Category summaries ({ [name]: text })
CREATE TABLE IF NOT EXISTS category_summaries (
  user_email TEXT PRIMARY KEY REFERENCES users(user_email) ON DELETE CASCADE,
  summaries JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

-- Hidden threads (to suppress in UI)
CREATE TABLE IF NOT EXISTS hidden_threads (
  id TEXT PRIMARY KEY, -- thread id
  user_email TEXT NOT NULL REFERENCES users(user_email) ON DELETE CASCADE,
  subject TEXT,
  response_ids JSONB,  -- []
  original_ids JSONB,  -- []
  date TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_hidden_threads_user ON hidden_threads(user_email);

-- Hidden inbox items (by id or subject)
CREATE TABLE IF NOT EXISTS hidden_inbox (
  id TEXT PRIMARY KEY, -- message id (may be empty if subject-based)
  user_email TEXT NOT NULL REFERENCES users(user_email) ON DELETE CASCADE,
  subject TEXT,
  date TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_hidden_inbox_user ON hidden_inbox(user_email);

-- Scenarios
CREATE TABLE IF NOT EXISTS scenarios (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL REFERENCES users(user_email) ON DELETE CASCADE,
  name TEXT,
  description TEXT,
  emails JSONB,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scenarios_user ON scenarios(user_email);

-- Saved generations
CREATE TABLE IF NOT EXISTS saved_generations (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL REFERENCES users(user_email) ON DELETE CASCADE,
  original_email JSONB,
  generated_response TEXT,
  justification TEXT,
  timestamp TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_saved_generations_user ON saved_generations(user_email);

-- Refinements
CREATE TABLE IF NOT EXISTS refinements (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL REFERENCES users(user_email) ON DELETE CASCADE,
  prompt TEXT,
  original_response TEXT,
  refined_response TEXT,
  analysis JSONB,
  timestamp TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_refinements_user ON refinements(user_email);

-- Seed the two known users (safe UPSERTs; edit display names as needed)
INSERT INTO users (user_email, display_name)
VALUES 
  ('ks4190@columbia.edu', 'Karthik Sreedhar'),
  ('lc3251@columbia.edu', 'Lydia Chilton')
ON CONFLICT (user_email) DO UPDATE
SET display_name = EXCLUDED.display_name,
    updated_at = now();

-- Helpful comments:
-- - Primary keys use message/thread ids as-is; collisions across users are unlikely but possible.
--   If you prefer strict tenant isolation at PK-level, switch to composite PKs (user_email, id) per table.
-- - App code should always filter by user_email to avoid cross-tenant leakage.
