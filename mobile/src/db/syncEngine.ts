// mobile/src/db/syncEngine.ts
import { db, transferGuestDataToUser, getGuestSnapshot } from './client';
import { API_BASE_URL } from '../utils/constants';

interface PullResponse {
  server_time: number;
  changes: {
    subjects: any[];
    slots: any[];
    attendance: any[];
    categories: any[];
  };
}

export async function runSync(token: string | null, userId: string): Promise<{ success: boolean; pushed: number; pulled: number }> {
  try {
    if (!token) {
      return { success: false, pushed: 0, pulled: 0 };
    }

    // 1. Flush local queue (PUSH)
    const queueRows = db.getAllSync<{
      queue_id: number;
      entity_table: string;
      entity_id: string;
      payload_json: string;
      created_at: number;
    }>('SELECT * FROM sync_queue ORDER BY queue_id ASC');

    let pushedCount = 0;
    if (queueRows.length > 0) {
      const mutations = queueRows.map((r) => ({
        table: r.entity_table,
        record_id: r.entity_id,
        updated_at: r.created_at,
        data: JSON.parse(r.payload_json),
      }));

      const pushRes = await fetch(`${API_BASE_URL}/api/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-user-id': userId,
        },
        body: JSON.stringify({ mutations }),
      });

      if (pushRes.ok) {
        const ids = queueRows.map((r) => r.queue_id).join(',');
        db.execSync(`DELETE FROM sync_queue WHERE queue_id IN (${ids})`);
        pushedCount = queueRows.length;
      }
    }

    // 2. Fetch remote modifications (PULL)
    const metaRow = db.getFirstSync<{ value: string }>(
      'SELECT value FROM sync_meta WHERE key = ?',
      [`last_pull_${userId}`]
    );
    const lastPull = metaRow ? Number(metaRow.value) : 0;

    const pullRes = await fetch(`${API_BASE_URL}/api/sync/pull?since=${lastPull}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-user-id': userId,
      },
    });

    let pulledCount = 0;
    if (pullRes.ok) {
      const data = (await pullRes.json()) as PullResponse;

      db.withTransactionSync(() => {
        for (const sub of data.changes.subjects || []) {
          db.runSync(
            `INSERT INTO subjects (id, user_id, name, room_number, created_at, updated_at, is_deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name, room_number = excluded.room_number, updated_at = excluded.updated_at, is_deleted = excluded.is_deleted
             WHERE excluded.updated_at > subjects.updated_at;`,
            [sub.id, userId, sub.name, sub.room_number, sub.created_at, sub.updated_at, sub.is_deleted]
          );
        }

        for (const slot of data.changes.slots || []) {
          db.runSync(
            `INSERT INTO timetable_slots (id, user_id, subject_id, day_of_week, start_time_minutes, end_time_minutes, slot_type, topic, target_questions, created_at, updated_at, is_deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               day_of_week = excluded.day_of_week, start_time_minutes = excluded.start_time_minutes, end_time_minutes = excluded.end_time_minutes, slot_type = excluded.slot_type, topic = excluded.topic, target_questions = excluded.target_questions, updated_at = excluded.updated_at, is_deleted = excluded.is_deleted
             WHERE excluded.updated_at > timetable_slots.updated_at;`,
            [slot.id, userId, slot.subject_id, slot.day_of_week, slot.start_time_minutes, slot.end_time_minutes, slot.slot_type, slot.topic, slot.target_questions, slot.created_at, slot.updated_at, slot.is_deleted]
          );
        }

        for (const att of data.changes.attendance || []) {
          db.runSync(
            `INSERT INTO attendance_records (id, user_id, slot_id, date, status, created_at, updated_at, is_deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(slot_id, date) DO UPDATE SET
               status = excluded.status, updated_at = excluded.updated_at, is_deleted = excluded.is_deleted
             WHERE excluded.updated_at > attendance_records.updated_at;`,
            [att.id, userId, att.slot_id, att.date, att.status, att.created_at, att.updated_at, att.is_deleted]
          );
        }

        db.runSync(
          `INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
          [`last_pull_${userId}`, data.server_time.toString()]
        );
      });

      pulledCount =
        (data.changes.subjects?.length || 0) +
        (data.changes.slots?.length || 0) +
        (data.changes.attendance?.length || 0);
    }

    return { success: true, pushed: pushedCount, pulled: pulledCount };
  } catch (error) {
    console.error('Sync failed:', error);
    return { success: false, pushed: 0, pulled: 0 };
  }
}

export async function mergeGuestDataToCloud(token: string, userId: string) {
  const snapshot = getGuestSnapshot();
  const res = await fetch(`${API_BASE_URL}/api/sync/merge-guest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(snapshot),
  });

  if (res.ok) {
    transferGuestDataToUser(userId);
  }
}