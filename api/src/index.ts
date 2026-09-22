import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('/*', cors());

app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

// 1. Fetch complete schedule with subject join
app.get('/api/timetable/:userId', async (c) => {
  const userId = c.req.param('userId');

  const { results } = await c.env.DB.prepare(`
    SELECT 
      t.id AS slot_id,
      t.day_of_week,
      t.start_time_minutes,
      t.end_time_minutes,
      t.slot_type,
      s.id AS subject_id,
      s.name AS subject_name,
      s.course_code,
      s.room_number,
      s.color_hex
    FROM timetable_slots t
    JOIN subjects s ON t.subject_id = s.id
    WHERE t.user_id = ? AND t.is_deleted = 0 AND s.is_deleted = 0
    ORDER BY t.day_of_week ASC, t.start_time_minutes ASC
  `).bind(userId).all();

  return c.json({ timetable: results });
});

// 2. Add slot with collision checking
app.post('/api/timetable/slots', async (c) => {
  const body = await c.req.json();
  const { userId, subjectId, dayOfWeek, startTimeMinutes, endTimeMinutes, slotType } = body;

  if (startTimeMinutes >= endTimeMinutes) {
    return c.json({ error: 'End time must be after start time' }, 400);
  }

  // Check overlap: max(start1, start2) < min(end1, end2)
  const collision = await c.env.DB.prepare(`
    SELECT id FROM timetable_slots
    WHERE user_id = ? 
      AND day_of_week = ? 
      AND is_deleted = 0
      AND MAX(start_time_minutes, ?) < MIN(end_time_minutes, ?)
  `).bind(userId, dayOfWeek, startTimeMinutes, endTimeMinutes).first();

  if (collision) {
    return c.json({ error: 'Slot collides with an existing class' }, 409);
  }

  const slotId = crypto.randomUUID();
  const now = Date.now();

  await c.env.DB.prepare(`
    INSERT INTO timetable_slots (id, user_id, subject_id, day_of_week, start_time_minutes, end_time_minutes, slot_type, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(slotId, userId, subjectId, dayOfWeek, startTimeMinutes, endTimeMinutes, slotType || 'lecture', now, now).run();

  return c.json({ success: true, slotId }, 201);
});

// 3. Delta Sync: Pull remote updates
app.get('/api/sync/pull', async (c) => {
  const userId = c.req.header('x-user-id');
  const since = Number(c.req.query('since') || 0);

  if (!userId) return c.json({ error: 'Missing x-user-id header' }, 401);

  const [subjects, slots, attendance] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT * FROM subjects WHERE user_id = ? AND updated_at > ?').bind(userId, since),
    c.env.DB.prepare('SELECT * FROM timetable_slots WHERE user_id = ? AND updated_at > ?').bind(userId, since),
    c.env.DB.prepare('SELECT * FROM attendance_records WHERE user_id = ? AND updated_at > ?').bind(userId, since)
  ]);

  return c.json({
    server_time: Date.now(),
    changes: {
      subjects: subjects.results,
      slots: slots.results,
      attendance: attendance.results
    }
  });
});

// 4. Delta Sync: Push local queue
app.post('/api/sync/push', async (c) => {
  const userId = c.req.header('x-user-id');
  const { mutations } = await c.req.json<{ mutations: Array<{ table: string; data: any; updated_at: number }> }>();

  if (!userId) return c.json({ error: 'Missing x-user-id header' }, 401);
  if (!mutations || mutations.length === 0) return c.json({ applied: 0 });

  const statements: D1PreparedStatement[] = [];

  for (const m of mutations) {
    if (m.table === 'subjects') {
      statements.push(
        c.env.DB.prepare(`
          INSERT INTO subjects (id, user_id, name, course_code, room_number, color_hex, minimum_attendance_pct, created_at, updated_at, is_deleted)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            course_code = excluded.course_code,
            room_number = excluded.room_number,
            color_hex = excluded.color_hex,
            minimum_attendance_pct = excluded.minimum_attendance_pct,
            updated_at = excluded.updated_at,
            is_deleted = excluded.is_deleted
          WHERE excluded.updated_at > subjects.updated_at
        `).bind(
          m.data.id, userId, m.data.name, m.data.course_code, m.data.room_number,
          m.data.color_hex || '#3B82F6', m.data.minimum_attendance_pct || 75,
          m.data.created_at || m.updated_at, m.updated_at, m.data.is_deleted || 0
        )
      );
    } else if (m.table === 'timetable_slots') {
      statements.push(
        c.env.DB.prepare(`
          INSERT INTO timetable_slots (id, user_id, subject_id, day_of_week, start_time_minutes, end_time_minutes, slot_type, week_cycle, created_at, updated_at, is_deleted)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            day_of_week = excluded.day_of_week,
            start_time_minutes = excluded.start_time_minutes,
            end_time_minutes = excluded.end_time_minutes,
            slot_type = excluded.slot_type,
            week_cycle = excluded.week_cycle,
            updated_at = excluded.updated_at,
            is_deleted = excluded.is_deleted
          WHERE excluded.updated_at > timetable_slots.updated_at
        `).bind(
          m.data.id, userId, m.data.subject_id, m.data.day_of_week,
          m.data.start_time_minutes, m.data.end_time_minutes, m.data.slot_type || 'lecture',
          m.data.week_cycle || 'all', m.data.created_at || m.updated_at, m.updated_at, m.data.is_deleted || 0
        )
      );
    } else if (m.table === 'attendance_records') {
      statements.push(
        c.env.DB.prepare(`
          INSERT INTO attendance_records (id, user_id, slot_id, date, status, created_at, updated_at, is_deleted)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(slot_id, date) DO UPDATE SET
            status = excluded.status,
            updated_at = excluded.updated_at,
            is_deleted = excluded.is_deleted
          WHERE excluded.updated_at > attendance_records.updated_at
        `).bind(
          m.data.id, userId, m.data.slot_id, m.data.date, m.data.status,
          m.data.created_at || m.updated_at, m.updated_at, m.data.is_deleted || 0
        )
      );
    }
  }

  if (statements.length > 0) {
    await c.env.DB.batch(statements);
  }

  return c.json({ success: true, processed: statements.length });
});

export default app;