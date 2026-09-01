# Database Migrations

SQLite auto-creates tables on startup via `Base.metadata.create_all`.
For **Supabase (PostgreSQL)**, run these SQL statements manually in the
Supabase SQL editor or via `psql` after deploying.

---

## Workflow Nodes — Phase 1

Added in: Vision Board workflow feature (Phase 1)

```sql
-- Execution plan records (one per planning invocation)
CREATE TABLE IF NOT EXISTS workflow_runs (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vision_board_id  INTEGER NOT NULL REFERENCES vision_boards(id) ON DELETE CASCADE,
    plan             JSONB,
    status           VARCHAR(30) NOT NULL DEFAULT 'planning',
    started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_workflow_runs_user_id         ON workflow_runs(user_id);
CREATE INDEX IF NOT EXISTS ix_workflow_runs_vision_board_id ON workflow_runs(vision_board_id);

-- Individual AI processing nodes attached to a Vision Board
CREATE TABLE IF NOT EXISTS workflow_nodes (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vision_board_id     INTEGER NOT NULL REFERENCES vision_boards(id) ON DELETE CASCADE,
    node_order          INTEGER NOT NULL,
    node_type           VARCHAR(30) NOT NULL,
    prompt              TEXT,
    provider            VARCHAR(30),
    model               VARCHAR(100),
    input_from_node_id  INTEGER REFERENCES workflow_nodes(id) ON DELETE SET NULL,
    output_data         JSONB,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_workflow_nodes_user_id         ON workflow_nodes(user_id);
CREATE INDEX IF NOT EXISTS ix_workflow_nodes_vision_board_id ON workflow_nodes(vision_board_id);
```

### Valid enum values

| Column | Valid values |
|--------|-------------|
| `workflow_nodes.node_type` | `chatgpt_text`, `chatgpt_image`, `claude_text`, `gemini_text`, `gemini_image`, `meshy_3d`, `stability_image`, `internal_quiz`, `internal_flashcard`, `internal_summary` |
| `workflow_nodes.status` | `pending`, `running`, `done`, `failed`, `skipped` |
| `workflow_runs.status` | `planning`, `awaiting_confirmation`, `running`, `done`, `failed` |

---

## Previous Migrations

### Add `user_id` to `attempts` table

```sql
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS ix_attempts_user_id ON attempts(user_id);
```

### Add `study_guide` to `notes` table

```sql
ALTER TABLE notes ADD COLUMN IF NOT EXISTS study_guide TEXT;
```

---

## 2026-09-01 — Vision Board + workflow tables removed
Dropped: workflow_nodes, workflow_runs, vision_board_snapshots, vision_steps, vision_boards.
Reason: Vision Board feature deleted (commit 986a46f). Drop order FK-safe.
