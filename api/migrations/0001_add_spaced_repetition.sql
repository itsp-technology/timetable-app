-- Migration: Add Spaced Repetition Milestones
CREATE TABLE IF NOT EXISTS revision_milestones (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    slot_id TEXT REFERENCES timetable_slots(id) ON DELETE CASCADE,
    subject_name TEXT NOT NULL,
    topic TEXT NOT NULL,
    interval_stage INTEGER DEFAULT 1, -- 1 = +2d, 2 = +7d, 3 = +21d
    due_date TEXT NOT NULL,           -- 'YYYY-MM-DD'
    is_completed INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    is_deleted INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_revisions_user_date ON revision_milestones(user_id, due_date) WHERE is_deleted = 0;