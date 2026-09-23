// mobile/src/db/client.ts
import { Platform } from 'react-native';

export const GUEST_USER_ID = 'local_guest';

export interface CategoryItem {
  id: string;
  name: string;
  icon: string;
  color_hex: string;
  bg_hex: string;
  is_custom?: number;
}

export interface RevisionMilestone {
  id: string;
  user_id: string;
  slot_id: string;
  subject_name: string;
  topic: string;
  interval_stage: number; // 1 = +2d, 2 = +7d, 3 = +21d
  due_date: string;       // 'YYYY-MM-DD'
  is_completed: number;   // 0 or 1
  created_at: number;
  updated_at: number;
  is_deleted?: number;
}

export interface GuestSnapshot {
  slots: any[];
  subjects: any[];
  attendance: any[];
  revisions: RevisionMilestone[];
}

export interface DatabaseDriver {
  getAllSync<T = any>(query: string, params?: any[]): T[];
  getFirstSync<T = any>(query: string, params?: any[]): T | null;
  runSync(query: string, params?: any[]): void;
  execSync(query: string): void;
  withTransactionSync(callback: () => void): void;
}

const DEFAULT_CATEGORIES: CategoryItem[] = [
  { id: 'theory', name: 'Core Theory', icon: '📖', color_hex: '#2563EB', bg_hex: '#EFF6FF', is_custom: 0 },
  { id: 'pyq', name: 'PYQ Drill', icon: '📝', color_hex: '#059669', bg_hex: '#ECFDF5', is_custom: 0 },
  { id: 'revision', name: 'Active Recall', icon: '⚡', color_hex: '#9333EA', bg_hex: '#FDF4FF', is_custom: 0 },
  { id: 'mock', name: 'Speed Test', icon: '⏱️', color_hex: '#D97706', bg_hex: '#FFF7ED', is_custom: 0 },
];

export interface WebDBState {
  users: any[];
  subjects: any[];
  slots: any[];
  attendance: any[];
  categories: CategoryItem[];
  revisions: RevisionMilestone[];
  queue: any[];
  meta: Record<string, string>;
}

const STORAGE_KEY = 'exam_timetable_v9_dates';

function loadWebState(): WebDBState {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.slots)) {
          return {
            users: parsed.users || [],
            subjects: parsed.subjects || [],
            slots: parsed.slots || [],
            attendance: parsed.attendance || [],
            categories: parsed.categories?.length ? parsed.categories : [...DEFAULT_CATEGORIES],
            revisions: parsed.revisions || [],
            queue: parsed.queue || [],
            meta: parsed.meta || {},
          };
        }
      }
    } catch (e) {
      console.error('Failed to load local storage state:', e);
    }
  }

  return {
    users: [],
    subjects: [],
    slots: [],
    attendance: [],
    categories: [...DEFAULT_CATEGORIES],
    revisions: [],
    queue: [],
    meta: {},
  };
}

let webData: WebDBState = loadWebState();

export function getRawWebState(): WebDBState {
  return webData;
}

export function persistWebState() {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(webData));
    } catch (e) {
      console.error('Failed to persist web data:', e);
    }
  }
}

export function getGuestSnapshot(): GuestSnapshot {
  if (Platform.OS === 'web') {
    const raw = getRawWebState();
    return {
      slots: raw.slots.filter((s) => s.user_id === GUEST_USER_ID && !s.is_deleted),
      subjects: raw.subjects.filter((sub) => sub.user_id === GUEST_USER_ID && !sub.is_deleted),
      attendance: raw.attendance.filter((a) => a.user_id === GUEST_USER_ID && !a.is_deleted),
      revisions: raw.revisions.filter((r) => r.user_id === GUEST_USER_ID && !r.is_deleted),
    };
  } else {
    try {
      const slots = db.getAllSync('SELECT * FROM timetable_slots WHERE user_id = ? AND is_deleted = 0;', [GUEST_USER_ID]);
      const subjects = db.getAllSync('SELECT * FROM subjects WHERE user_id = ? AND is_deleted = 0;', [GUEST_USER_ID]);
      const attendance = db.getAllSync('SELECT * FROM attendance_records WHERE user_id = ? AND is_deleted = 0;', [GUEST_USER_ID]);
      const revisions = db.getAllSync<RevisionMilestone>('SELECT * FROM revision_milestones WHERE user_id = ? AND is_deleted = 0;', [GUEST_USER_ID]);
      return { slots, subjects, attendance, revisions };
    } catch {
      return { slots: [], subjects: [], attendance: [], revisions: [] };
    }
  }
}

export function transferGuestDataToUser(targetUserId: string): { slotsCount: number } {
  let moved = 0;
  if (Platform.OS === 'web') {
    webData.slots.forEach((s) => {
      if (s.user_id === GUEST_USER_ID) {
        s.user_id = targetUserId;
        s.updated_at = Date.now();
        moved++;
      }
    });

    webData.subjects.forEach((sub) => {
      if (sub.user_id === GUEST_USER_ID) {
        sub.user_id = targetUserId;
        sub.updated_at = Date.now();
      }
    });

    webData.revisions.forEach((r) => {
      if (r.user_id === GUEST_USER_ID) {
        r.user_id = targetUserId;
        r.updated_at = Date.now();
      }
    });

    persistWebState();
  } else {
    const now = Date.now();
    try {
      const guestRows = db.getAllSync('SELECT id FROM timetable_slots WHERE user_id = ? AND is_deleted = 0;', [GUEST_USER_ID]);
      moved = guestRows.length;

      db.withTransactionSync(() => {
        db.runSync('UPDATE timetable_slots SET user_id = ?, updated_at = ? WHERE user_id = ?;', [targetUserId, now, GUEST_USER_ID]);
        db.runSync('UPDATE subjects SET user_id = ?, updated_at = ? WHERE user_id = ?;', [targetUserId, now, GUEST_USER_ID]);
        db.runSync('UPDATE attendance_records SET user_id = ?, updated_at = ? WHERE user_id = ?;', [targetUserId, now, GUEST_USER_ID]);
        db.runSync('UPDATE revision_milestones SET user_id = ?, updated_at = ? WHERE user_id = ?;', [targetUserId, now, GUEST_USER_ID]);
      });
    } catch (e) {
      console.warn('Native transfer failed:', e);
    }
  }

  return { slotsCount: moved };
}

// 1. Web Database Driver
const webDbDriver: DatabaseDriver = {
  getAllSync<T = any>(query: string, params: any[] = []): T[] {
    if (query.includes('FROM session_categories')) {
      return [...webData.categories] as unknown as T[];
    }

    if (query.includes('FROM revision_milestones')) {
      const userId = params[0];
      const dueDate = params[1];
      const results = webData.revisions
        .filter((r) => r.user_id === userId && (!dueDate || r.due_date === dueDate) && !r.is_deleted)
        .sort((a, b) => a.interval_stage - b.interval_stage);
      return results as unknown as T[];
    }

    if (query.includes('FROM timetable_slots')) {
      const date = params[0];
      const userId = params[1];
      const targetDate = params[2];
      const dayOfWeek = Number(params[3]);

      const activeSlots = webData.slots
        .filter((s) => {
          if (s.user_id !== userId || s.is_deleted) return false;
          if (s.specific_date) {
            return s.specific_date === targetDate;
          }
          return s.day_of_week === dayOfWeek;
        })
        .sort((a, b) => a.start_time_minutes - b.start_time_minutes);

      return activeSlots.map((slot) => {
        const sub = webData.subjects.find((s) => s.id === slot.subject_id);
        const att = webData.attendance.find((a) => a.slot_id === slot.id && a.date === date && !a.is_deleted);
        return {
          slot_id: slot.id,
          subject_name: sub ? sub.name : 'Unknown Subject',
          room_number: sub ? sub.room_number : '',
          start_time_minutes: slot.start_time_minutes,
          end_time_minutes: slot.end_time_minutes,
          slot_type: slot.slot_type || 'theory',
          topic: slot.topic || '',
          target_questions: slot.target_questions || 0,
          specific_date: slot.specific_date || null,
          status: att ? att.status : null,
        } as unknown as T;
      });
    }

    if (query.includes('FROM sync_queue')) {
      return [...webData.queue] as unknown as T[];
    }
    return [];
  },

  getFirstSync<T = any>(query: string, params: any[] = []): T | null {
    if (query.includes('FROM users')) {
      const p1 = (params[0] || '').toLowerCase().trim();
      const p2 = (params[1] || params[0] || '').toLowerCase().trim();

      const found = webData.users.find(
        (u) =>
          u.username?.toLowerCase() === p1 ||
          u.username?.toLowerCase() === p2 ||
          u.email?.toLowerCase() === p1 ||
          u.email?.toLowerCase() === p2
      );
      return (found ? { ...found } : null) as unknown as T;
    }

    if (query.includes('start_time_minutes < ? AND end_time_minutes > ?')) {
      const userId = params[0];
      const targetDate = params[1];
      const dayOfWeek = Number(params[2]);
      const endM = Number(params[3]);
      const startM = Number(params[4]);

      const collision = webData.slots.find((s) => {
        if (s.user_id !== userId || s.is_deleted) return false;
        if (s.specific_date) {
          if (s.specific_date !== targetDate) return false;
        } else {
          if (s.day_of_week !== dayOfWeek) return false;
        }
        return s.start_time_minutes < endM && s.end_time_minutes > startM;
      });
      return (collision ? { id: collision.id } : null) as unknown as T;
    }

    if (query.includes('FROM sync_meta')) {
      const key = params[0];
      return (webData.meta[key] ? { value: webData.meta[key] } : null) as unknown as T;
    }
    return null;
  },

  runSync(query: string, params: any[] = []): void {
    if (query.includes('INSERT INTO revision_milestones')) {
      const [id, user_id, slot_id, subject_name, topic, interval_stage, due_date, is_completed, created_at, updated_at] = params;
      const idx = webData.revisions.findIndex((r) => r.id === id);
      const row: RevisionMilestone = {
        id,
        user_id,
        slot_id,
        subject_name,
        topic,
        interval_stage: Number(interval_stage) || 1,
        due_date,
        is_completed: is_completed ? 1 : 0,
        created_at: created_at || Date.now(),
        updated_at: updated_at || Date.now(),
        is_deleted: 0,
      };
      if (idx >= 0) webData.revisions[idx] = row;
      else webData.revisions.push(row);
    } else if (query.includes('UPDATE revision_milestones SET is_completed')) {
      const [is_completed, updated_at, id] = params;
      const rev = webData.revisions.find((r) => r.id === id);
      if (rev) {
        rev.is_completed = Number(is_completed) || 0;
        rev.updated_at = updated_at || Date.now();
      }
    } else if (query.includes('INSERT INTO users')) {
      const [id, username, email, name, created_at] = params;
      const cleanUser = {
        id,
        username: username.toLowerCase().trim(),
        email: email.toLowerCase().trim(),
        name: name || username,
        created_at: created_at || Date.now(),
      };
      const idx = webData.users.findIndex((u) => u.username === cleanUser.username || u.email === cleanUser.email);
      if (idx >= 0) webData.users[idx] = cleanUser;
      else webData.users.push(cleanUser);
    } else if (query.includes('INSERT INTO session_categories')) {
      const [id, name, icon, color_hex, bg_hex, is_custom] = params;
      webData.categories.push({ id, name, icon, color_hex, bg_hex, is_custom: is_custom ?? 1 });
    } else if (query.includes('DELETE FROM session_categories')) {
      const [catId] = params;
      const idx = webData.categories.findIndex((c) => c.id === catId);
      if (idx >= 0) webData.categories.splice(idx, 1);
    } else if (query.includes('INSERT INTO subjects')) {
      const [id, user_id, name, room_number, created_at, updated_at] = params;
      const idx = webData.subjects.findIndex((s) => s.id === id);
      const row = { id, user_id, name, room_number, created_at, updated_at, is_deleted: 0 };
      if (idx >= 0) webData.subjects[idx] = row;
      else webData.subjects.push(row);
    } else if (query.includes('INSERT INTO timetable_slots')) {
      const [id, user_id, subject_id, day_of_week, specific_date, start_time_minutes, end_time_minutes, slot_type, topic, target_questions, created_at, updated_at] = params;
      const idx = webData.slots.findIndex((s) => s.id === id);
      const row = {
        id,
        user_id,
        subject_id,
        day_of_week,
        specific_date: specific_date || null,
        start_time_minutes,
        end_time_minutes,
        slot_type,
        topic,
        target_questions,
        created_at,
        updated_at,
        is_deleted: 0,
      };
      if (idx >= 0) webData.slots[idx] = row;
      else webData.slots.push(row);
    } else if (query.includes('DELETE FROM timetable_slots')) {
      const [slotId] = params;
      const idx = webData.slots.findIndex((s) => s.id === slotId);
      if (idx >= 0) webData.slots.splice(idx, 1);
    } else if (query.includes('INSERT INTO attendance_records')) {
      const [id, user_id, slot_id, date, status, created_at, updated_at] = params;
      const idx = webData.attendance.findIndex((a) => a.slot_id === slot_id && a.date === date);
      if (idx >= 0) {
        webData.attendance[idx].status = status;
        webData.attendance[idx].updated_at = updated_at;
      } else {
        webData.attendance.push({ id, user_id, slot_id, date, status, created_at, updated_at, is_deleted: 0 });
      }
    } else if (query.includes('INSERT INTO sync_queue')) {
      const [, entity_table, entity_id, payload_json, created_at] = params;
      webData.queue.push({
        queue_id: Date.now() + Math.floor(Math.random() * 1000),
        entity_table,
        entity_id,
        payload_json,
        created_at,
      });
    } else if (query.includes('INSERT INTO sync_meta')) {
      const [key, value] = params;
      webData.meta[key] = value;
    } else if (query.includes('DELETE FROM sync_meta')) {
      const [key] = params;
      delete webData.meta[key];
    }
    persistWebState();
  },

  execSync(query: string): void {
    if (query.includes('DELETE FROM sync_queue WHERE queue_id IN')) {
      const match = query.match(/\(([^)]+)\)/);
      if (match) {
        const ids = match[1].split(',').map((id) => Number(id.trim()));
        webData.queue = webData.queue.filter((q) => !ids.includes(q.queue_id));
        persistWebState();
      }
    }
  },

  withTransactionSync(callback: () => void): void {
    callback();
    persistWebState();
  },
};

// 2. Native SQLite Setup: Auto-create tables IMMEDIATELY so app never crashes
function setupNativeSQLite(database: any): DatabaseDriver {
  try {
    database.execSync(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS session_categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL,
        color_hex TEXT NOT NULL,
        bg_hex TEXT NOT NULL,
        is_custom INTEGER DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS subjects (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        room_number TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS timetable_slots (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        day_of_week INTEGER NOT NULL,
        specific_date TEXT,
        start_time_minutes INTEGER NOT NULL,
        end_time_minutes INTEGER NOT NULL,
        slot_type TEXT DEFAULT 'theory',
        topic TEXT DEFAULT '',
        target_questions INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS attendance_records (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        slot_id TEXT NOT NULL,
        date TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER DEFAULT 0,
        UNIQUE(slot_id, date)
      );
      CREATE TABLE IF NOT EXISTS revision_milestones (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        slot_id TEXT,
        subject_name TEXT NOT NULL,
        topic TEXT NOT NULL,
        interval_stage INTEGER DEFAULT 1,
        due_date TEXT NOT NULL,
        is_completed INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_revisions_user_date ON revision_milestones(user_id, due_date) WHERE is_deleted = 0;
      CREATE TABLE IF NOT EXISTS sync_queue (
        queue_id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_table TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sync_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    // Safely add specific_date column to existing databases
    try {
      database.execSync('ALTER TABLE timetable_slots ADD COLUMN specific_date TEXT;');
    } catch {
      // Column already exists
    }

    // Seed default categories
    const existingCat = database.getFirstSync('SELECT id FROM session_categories LIMIT 1;');
    if (!existingCat) {
      DEFAULT_CATEGORIES.forEach((c) => {
        database.runSync(
          'INSERT OR IGNORE INTO session_categories (id, name, icon, color_hex, bg_hex, is_custom) VALUES (?, ?, ?, ?, ?, ?);',
          [c.id, c.name, c.icon, c.color_hex, c.bg_hex, 0]
        );
      });
    }
  } catch (err) {
    console.warn('Native SQLite schema setup warning:', err);
  }

  return {
    getAllSync: <T = any>(query: string, params: any[] = []): T[] => {
      try {
        return database.getAllSync(query, params) as T[];
      } catch (e) {
        console.warn('getAllSync error:', e);
        return [];
      }
    },
    getFirstSync: <T = any>(query: string, params: any[] = []): T | null => {
      try {
        return database.getFirstSync(query, params) as T | null;
      } catch (e) {
        console.warn('getFirstSync error:', e);
        return null;
      }
    },
    runSync: (query: string, params: any[] = []): void => {
      try {
        database.runSync(query, params);
      } catch (e) {
        console.warn('runSync error:', e);
      }
    },
    execSync: (query: string): void => {
      try {
        database.execSync(query);
      } catch (e) {
        console.warn('execSync error:', e);
      }
    },
    withTransactionSync: (callback: () => void): void => {
      try {
        database.withTransactionSync(callback);
      } catch {
        callback();
      }
    },
  };
}

let activeDriver: DatabaseDriver;
if (Platform.OS === 'web') {
  activeDriver = webDbDriver;
} else {
  try {
    const SQLite = require('expo-sqlite');
    const rawDb = SQLite.openDatabaseSync('clean_exam_timetable_v7.db');
    activeDriver = setupNativeSQLite(rawDb);
  } catch (e) {
    console.warn('Failed to load expo-sqlite, using memory driver fallback:', e);
    activeDriver = webDbDriver;
  }
}

export const db: DatabaseDriver = activeDriver;
export function initLocalDatabase() {}

export function queueMutation(table: string, id: string, data: any) {
  const now = Date.now();
  db.runSync(
    `INSERT INTO sync_queue (entity_table, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?)`,
    ['sync_queue', table, id, JSON.stringify(data), now]
  );
}