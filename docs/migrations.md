# Database Migrations

## 001 — Add tldraw_state to vision_boards

**Date:** 2026-05-03
**Purpose:** Brainspace Phase 1 — store tldraw canvas JSON snapshot per board.

### Supabase SQL (run in Supabase SQL Editor)

```sql
ALTER TABLE vision_boards
  ADD COLUMN IF NOT EXISTS tldraw_state TEXT DEFAULT NULL;
```

### Notes
- Column is nullable TEXT. Existing boards default to NULL (empty canvas on open).
- The column stores the raw JSON string from tldraw's `editor.getSnapshot()`.
- SQLAlchemy model: `VisionBoard.tldraw_state: Mapped[Optional[str]]`
- Old `VisionStep` rows are untouched — node-based data still exists for any future migration path.
