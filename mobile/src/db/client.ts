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
  interval_stage: number;
  due_date: string;
  is_completed: number;
  created_at: number;
  updated_at: number;
  is_deleted?: number;
}

export interface DatabaseDriver {
  getAllSync<T = any>(query: string, params?: any[]): T[];
  getFirstSync<T = any>(query: string, params?: any[]): T | null;
  runSync(query: string, params?: any[]): void;
  execSync(query: string): void;
  withTransactionSync(callback: () => void): void;
}

const DEFAULT_CATEGORIES: CategoryItem[] = [
  { id: 'maths', name: 'Mathematics', icon: '📐', color_hex: '#E11D48', bg_hex: '#FFE4E6', is_custom: 0 },
  { id: 'physics', name: 'Physics', icon: '⚡', color_hex: '#F97316', bg_hex: '#FFEDD5', is_custom: 0 },
  { id: 'geo', name: 'Geography', icon: '🌍', color_hex: '#EAB308', bg_hex: '#FEF9C3', is_custom: 0 },
  { id: 'chem', name: 'Chemistry', icon: '🧪', color_hex: '#16A34A', bg_hex: '#DCFCE7', is_custom: 0 },
  { id: 'bio', name: 'Biology', icon: '🧬', color_hex: '#0D9488', bg_hex: '#CCFBF1', is_custom: 0 },
  { id: 'cs', name: 'Computer Science', icon: '💻', color_hex: '#2563EB', bg_hex: '#DBEAFE', is_custom: 0 },
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

const STORAGE_KEY = 'smart_timetable_app_v10';

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
      console.error('Failed to load storage state:', e);
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

export function persistWebState() {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(webData));
    } catch (e) {
      console.error('Failed to persist web data:', e);
    }
  }
}

// 1. Web DB Driver
const webDbDriver: DatabaseDriver = {
  getAllSync<T = any>(query: string, params: any[] = []): T[] {
    if (query.includes('FROM session_categories')) {
      return [...webData.categories] as unknown as T[];
    }

    if (query.includes('FROM revision_milestones')) {
      const userId = params[0];
      return webData.revisions
        .filter((r) => r.user_id === userId && !r.is_deleted)
        .sort((a, b) => a.interval_stage - b.interval_stage) as unknown as T[];
    }

    if (query.includes('FROM timetable_slots')) {
      const date = params[0] || '';
      const userId = params[1] || GUEST_USER_ID;

      return webData.slots
        .filter((s) => s.user_id === userId && !s.is_deleted)
        .sort((a, b) => a.start_time_minutes - b.start_time_minutes)
        .map((slot) => {
          const sub = webData.subjects.find((s) => s.id === slot.subject_id);
          const att = webData.attendance.find((a) => a.slot_id === slot.id && a.date === date && !a.is_deleted);
          return {
            slot_id: slot.id,
            subject_name: sub ? sub.name : 'Class',
            room_number: sub ? sub.room_number : '',
            start_time_minutes: slot.start_time_minutes,
            end_time_minutes: slot.end_time_minutes,
            slot_type: slot.slot_type || '#2563EB',
            topic: slot.topic || '',
            target_questions: slot.target_questions || 0,
            specific_date: slot.specific_date || null,
            day_of_week: Number(slot.day_of_week) || 1,
            status: att ? att.status : null,
          } as unknown as T;
        }) as unknown as T[];
    }

    if (query.includes('FROM sync_queue')) {
      return [...webData.queue] as unknown as T[];
    }
    return [];
  },

  getFirstSync<T = any>(query: string, params: any[] = []): T | null {
    if (query.includes('FROM users')) {
      const p = (params[0] || '').toLowerCase().trim();
      const found = webData.users.find((u) => u.username === p || u.email === p);
      return (found ? { ...found } : null) as unknown as T;
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
      const [id, user_id, subject_id, day_of_week, specific_date, start_time_minutes, end_time_minutes, slot_type, topic, target_questions, created_at, updated_at] = params;
      const idx = webData.slots.findIndex((s) => s.id === id);
      const row = {
        id,
        user_id,
        subject_id,
        day_of_week: Number(day_of_week) || 1,
        specific_date: specific_date || null,
        start_time_minutes: Number(start_time_minutes) || 0,
        end_time_minutes: Number(end_time_minutes) || 60,
        slot_type: slot_type || '#2563EB',
        topic: topic || '',
        target_questions: Number(target_questions) || 0,
        created_at: created_at || Date.now(),
        updated_at: updated_at || Date.now(),
        is_deleted: 0,
      };
      if (idx >= 0) webData.slots[idx] = row;
      else webData.slots.push(row);
    } else if (query.includes('DELETE FROM timetable_slots WHERE id = ?')) {
      const [slotId] = params;
      const idx = webData.slots.findIndex((s) => s.id === slotId);
      if (idx >= 0) webData.slots.splice(idx, 1);
    } else if (query.includes('DELETE FROM timetable_slots WHERE user_id = ?')) {
      const [uId] = params;
      webData.slots = webData.slots.filter((s) => s.user_id !== uId);
    } else if (query.includes('INSERT INTO sync_meta')) {
      const [key, value] = params;
      webData.meta[key] = value;
    }
    persistWebState();
  },

  execSync(): void {},
  withTransactionSync(cb: () => void): void {
    cb();
    persistWebState();
  },
};

// 2. Native SQLite Driver Setup
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
        slot_type TEXT DEFAULT '#2563EB',
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
      CREATE TABLE IF NOT EXISTS sync_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    // Ensure specific_date column exists if migrating from older schema
    try {
      database.execSync('ALTER TABLE timetable_slots ADD COLUMN specific_date TEXT;');
    } catch {}
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
      } catch {}
    },
    withTransactionSync: (cb: () => void): void => {
      try {
        database.withTransactionSync(cb);
      } catch {
        cb();
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
    const rawDb = SQLite.openDatabaseSync('smart_timetable_app_v10.db');
    activeDriver = setupNativeSQLite(rawDb);
  } catch (e) {
    activeDriver = webDbDriver;
  }
}

export const db: DatabaseDriver = activeDriver;
export function initLocalDatabase() {}