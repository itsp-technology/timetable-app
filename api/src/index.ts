// api/src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('/*', cors());

// 1. User Registration (Guaranteed Unique Username & Email)
app.post('/api/auth/register', async (c) => {
  const { email, username, password, name } = await c.req.json();

  const cleanEmail = email?.toLowerCase().trim();
  const cleanUsername = username?.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');

  if (!cleanEmail || !cleanUsername || !password) {
    return c.json({ error: 'Username, email, and password are required.' }, 400);
  }

  if (cleanUsername.length < 3) {
    return c.json({ error: 'Username must be at least 3 characters long.' }, 400);
  }

  // Case-insensitive query to prevent any duplicate username/email
  const existing = await c.env.DB.prepare(
    'SELECT id, username, email FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)'
  ).bind(cleanUsername, cleanEmail).first<{ id: string; username: string; email: string }>();

  if (existing) {
    if (existing.username.toLowerCase() === cleanUsername) {
      return c.json({ error: `Username @${cleanUsername} is already taken. Please choose another.` }, 409);
    }
    return c.json({ error: `An account with email ${cleanEmail} already exists. Please sign in.` }, 409);
  }

  const userId = 'usr_' + crypto.randomUUID().replace(/-/g, '').substring(0, 14);
  const now = Date.now();

  await c.env.DB.prepare(
    'INSERT INTO users (id, username, email, created_at) VALUES (?, ?, ?, ?)'
  ).bind(userId, cleanUsername, cleanEmail, now).run();

  const token = 'tok_' + crypto.randomUUID();

  return c.json({
    success: true,
    token,
    user: {
      id: userId,
      username: cleanUsername,
      email: cleanEmail,
      name: name?.trim() || cleanUsername,
    },
  }, 201);
});

// 2. User Login (Username OR Email)
app.post('/api/auth/login', async (c) => {
  const { identifier, email, password } = await c.req.json();

  const loginId = (identifier || email || '').toLowerCase().trim();
  if (!loginId || !password) {
    return c.json({ error: 'Username/Email and password are required.' }, 400);
  }

  const user = await c.env.DB.prepare(
    'SELECT id, username, email FROM users WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)'
  ).bind(loginId, loginId).first<{ id: string; username: string; email: string }>();

  if (!user) {
    return c.json({ error: 'No account found with this username or email.' }, 401);
  }

  const token = 'tok_' + crypto.randomUUID();

  return c.json({
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.username,
    },
  });
});

// 3. Merge Local Guest Sessions into Account
app.post('/api/sync/merge', async (c) => {
  const { targetUserId, slots, subjects } = await c.req.json();

  if (!targetUserId || !Array.isArray(slots)) {
    return c.json({ error: 'Invalid merge payload.' }, 400);
  }

  const statements: D1PreparedStatement[] = [];
  const now = Date.now();

  if (Array.isArray(subjects)) {
    for (const sub of subjects) {
      statements.push(
        c.env.DB.prepare(`
          INSERT INTO subjects (id, user_id, name, room_number, created_at, updated_at, is_deleted)
          VALUES (?, ?, ?, ?, ?, ?, 0)
          ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id, updated_at = excluded.updated_at
        `).bind(sub.id, targetUserId, sub.name, sub.room_number || '', now, now)
      );
    }
  }

  for (const s of slots) {
    statements.push(
      c.env.DB.prepare(`
        INSERT INTO timetable_slots (id, user_id, subject_id, day_of_week, start_time_minutes, end_time_minutes, slot_type, topic, target_questions, created_at, updated_at, is_deleted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id, updated_at = excluded.updated_at
      `).bind(
        s.id, targetUserId, s.subject_id, s.day_of_week, s.start_time_minutes, s.end_time_minutes,
        s.slot_type || 'theory', s.topic || '', s.target_questions || 0, now, now
      )
    );
  }

  if (statements.length > 0) {
    await c.env.DB.batch(statements);
  }

  return c.json({ success: true, mergedSlots: slots.length });
});

// 4. Delta Sync Pull
app.get('/api/sync/pull', async (c) => {
  const userId = c.req.header('x-user-id');
  const since = Number(c.req.query('since') || 0);

  if (!userId) return c.json({ error: 'Missing x-user-id header' }, 401);

  const [subjects, slots, attendance] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT * FROM subjects WHERE user_id = ? AND updated_at > ?').bind(userId, since),
    c.env.DB.prepare('SELECT * FROM timetable_slots WHERE user_id = ? AND updated_at > ?').bind(userId, since),
    c.env.DB.prepare('SELECT * FROM attendance_records WHERE user_id = ? AND updated_at > ?').bind(userId, since),
  ]);

  return c.json({
    server_time: Date.now(),
    changes: {
      subjects: subjects.results,
      slots: slots.results,
      attendance: attendance.results,
    },
  });
});

// 5. Delta Sync Push
app.post('/api/sync/push', async (c) => {
  const userId = c.req.header('x-user-id');
  const { mutations } = await c.req.json();

  if (!userId) return c.json({ error: 'Missing x-user-id header' }, 401);
  if (!mutations || mutations.length === 0) return c.json({ applied: 0 });

  const statements: D1PreparedStatement[] = [];

  for (const m of mutations) {
    if (m.table === 'subjects') {
      statements.push(
        c.env.DB.prepare(`
          INSERT INTO subjects (id, user_id, name, room_number, color_hex, minimum_attendance_pct, created_at, updated_at, is_deleted)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at, is_deleted = excluded.is_deleted
          WHERE excluded.updated_at > subjects.updated_at
        `).bind(
          m.data.id, userId, m.data.name, m.data.room_number || '', m.data.color_hex || '#3B82F6',
          m.data.minimum_attendance_pct || 75, m.data.created_at || m.updated_at, m.updated_at, m.data.is_deleted || 0
        )
      );
    } else if (m.table === 'timetable_slots') {
      statements.push(
        c.env.DB.prepare(`
          INSERT INTO timetable_slots (id, user_id, subject_id, day_of_week, start_time_minutes, end_time_minutes, slot_type, topic, target_questions, created_at, updated_at, is_deleted)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            day_of_week = excluded.day_of_week, start_time_minutes = excluded.start_time_minutes,
            end_time_minutes = excluded.end_time_minutes, slot_type = excluded.slot_type,
            topic = excluded.topic, target_questions = excluded.target_questions,
            updated_at = excluded.updated_at, is_deleted = excluded.is_deleted
          WHERE excluded.updated_at > timetable_slots.updated_at
        `).bind(
          m.data.id, userId, m.data.subject_id, m.data.day_of_week, m.data.start_time_minutes,
          m.data.end_time_minutes, m.data.slot_type || 'theory', m.data.topic || '',
          m.data.target_questions || 0, m.data.created_at || m.updated_at, m.updated_at, m.data.is_deleted || 0
        )
      );
    } else if (m.table === 'attendance_records') {
      statements.push(
        c.env.DB.prepare(`
          INSERT INTO attendance_records (id, user_id, slot_id, date, status, created_at, updated_at, is_deleted)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(slot_id, date) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at, is_deleted = excluded.is_deleted
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