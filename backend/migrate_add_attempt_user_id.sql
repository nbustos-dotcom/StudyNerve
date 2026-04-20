-- Migrations for security fixes + session-linked insights.
-- Run against Postgres before deploying. Safe to run multiple times.

-- 1. Add user_id to attempts table
ALTER TABLE attempts
  ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ix_attempts_user_id ON attempts(user_id);

-- Back-fill user_id for existing attempts via the question → note chain.
UPDATE attempts a
SET user_id = n.user_id
FROM questions q
JOIN notes n ON q.note_id = n.id
WHERE a.question_id = q.id
  AND a.user_id IS NULL
  AND n.user_id IS NOT NULL;

-- 2. Add session_id to student_insights table
ALTER TABLE student_insights
  ADD COLUMN IF NOT EXISTS session_id VARCHAR(36) NULL;

CREATE INDEX IF NOT EXISTS ix_student_insights_session_id ON student_insights(session_id);

-- 3. Add file_name to chat_messages table
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS file_name VARCHAR(255) NULL;
