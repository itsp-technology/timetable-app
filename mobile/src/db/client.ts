// mobile/src/db/client.ts
import { Platform } from 'react-native';

export interface DatabaseDriver {
  getAllSync<T = any>(query: string, params?: any[]): T[];
  getFirstSync<T = any>(query: string, params?: any[]): T | null;
  runSync(query: string, params?: any[]): void;
  execSync(query: string): void;
  withTransactionSync(callback: () => void): void;
}

interface WebDBState {
  subjects: any[];
  slots: any[];
  attendance: any[];
  queue: any[];
  meta: Record<string, string>;
}

const STORAGE_KEY = 'exam_timetable_user_clean_v1';

function loadWebState(): WebDBState {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load local storage state:', e);
  }

  // 100% Clean initial state - Zero hardcoded subjects or slots
  return {
    subjects: [],
    slots: [],
    attendance: [],
    queue: [],
    meta: {},
  };
}

let webData: WebDBState = loadWebState();

function persistWebState() {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(webData));
    } catch (e) {
      console.error('Failed to save state:', e);
    }
  }
}

const webDbDriver: DatabaseDriver = {
  getAllSync<T = any>(query: string, params: any[] = []): T[] {
    if (query.includes('FROM timetable_slots')) {
      const date = params[0];
      const userId = params[1];
      const dayOfWeek = Number(params[2]);

      const activeSlots = webData.slots
        .filter((s) => s.user_id === userId && s.day_of_week === dayOfWeek && !s.is_deleted)
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
    if (query.includes('MAX(start_time_minutes')) {
      const userId = params[0];
      const dayOfWeek = Number(params[1]);
      const startM = Number(params[2]);
      const endM = Number(params[3]);

      const collision = webData.slots.find(
        (s) =>
          s.user_id === userId &&
          s.day_of_week === dayOfWeek &&
          !s.is_deleted &&
          Math.max(s.start_time_minutes, startM) < Math.min(s.end_time_minutes, endM)
      );
      return (collision ? { id: collision.id } : null) as unknown as T;
    }

    if (query.includes('FROM sync_meta')) {
      const key = params[0];
      return (webData.meta[key] ? { value: webData.meta[key] } : null) as unknown as T;
    }
    return null;
  },

  runSync(query: string, params: any[] = []): void {
    if (query.includes('INSERT INTO subjects')) {
      const [id, user_id, name, room_number, created_at, updated_at] = params;
      const idx = webData.subjects.findIndex((s) => s.id === id);
      const row = { id, user_id, name, room_number, created_at, updated_at, is_deleted: 0 };
      if (idx >= 0) webData.subjects[idx] = row;
      else webData.subjects.push(row);
    } else if (query.includes('INSERT INTO timetable_slots')) {
      const [id, user_id, subject_id, day_of_week, start_time_minutes, end_time_minutes, slot_type, topic, target_questions, created_at, updated_at] = params;
      const idx = webData.slots.findIndex((s) => s.id === id);
      const row = { id, user_id, subject_id, day_of_week, start_time_minutes, end_time_minutes, slot_type, topic, target_questions, created_at, updated_at, is_deleted: 0 };
      if (idx >= 0) webData.slots[idx] = row;
      else webData.slots.push(row);
    } else if (query.includes('DELETE FROM timetable_slots')) {
      const [slotId] = params;
      const idx = webData.slots.findIndex((s) => s.id === slotId);
      if (idx >= 0) {
        webData.slots.splice(idx, 1);
      }
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

let activeDriver: DatabaseDriver;
if (Platform.OS === 'web') {
  activeDriver = webDbDriver;
} else {
  const SQLite = require('expo-sqlite');
  activeDriver = SQLite.openDatabaseSync('clean_exam_timetable.db');
}

export const db: DatabaseDriver = activeDriver;

export function initLocalDatabase() {
  if (Platform.OS !== 'web') {
    db.execSync(`
      PRAGMA foreign_keys = ON;
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
  }
}

export function queueMutation(table: string, id: string, data: any) {
  const now = Date.now();
  db.runSync(
    `INSERT INTO sync_queue (entity_table, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?)`,
    ['sync_queue', table, id, JSON.stringify(data), now]
  );
}