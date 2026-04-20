-- Migration: add user_id to attempts table
-- Run this against your Postgres database before deploying.
-- Safe to run multiple times (IF NOT EXISTS guard).

ALTER TABLE attempts
  ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ix_attempts_user_id ON attempts(user_id);

-- Back-fill user_id for existing attempts via the question → note chain.
-- Rows that can't be resolved (orphaned questions) are left NULL.
UPDATE attempts a
SET user_id = n.user_id
FROM questions q
JOIN notes n ON q.note_id = n.id
WHERE a.question_id = q.id
  AND a.user_id IS NULL
  AND n.user_id IS NOT NULL;
