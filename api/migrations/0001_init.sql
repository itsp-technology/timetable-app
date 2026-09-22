CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    course_code TEXT,
    room_number TEXT,
    color_hex TEXT DEFAULT '#3B82F6',
    minimum_attendance_pct INTEGER DEFAULT 75,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    is_deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS timetable_slots (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL, -- 1=Monday, 7=Sunday
    start_time_minutes INTEGER NOT NULL, -- Minutes from midnight (e.g., 540 = 09:00)
    end_time_minutes INTEGER NOT NULL,   -- Minutes from midnight (e.g., 600 = 10:00)
    slot_type TEXT DEFAULT 'lecture',
    week_cycle TEXT DEFAULT 'all',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    is_deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS attendance_records (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    slot_id TEXT NOT NULL REFERENCES timetable_slots(id) ON DELETE CASCADE,
    date TEXT NOT NULL, -- YYYY-MM-DD
    status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'cancelled')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    is_deleted INTEGER DEFAULT 0,
    UNIQUE(slot_id, date)
);

CREATE INDEX IF NOT EXISTS idx_slots_user_day ON timetable_slots(user_id, day_of_week) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance_records(user_id, date) WHERE is_deleted = 0;