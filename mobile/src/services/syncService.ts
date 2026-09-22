// mobile/src/services/syncService.ts
import { API_BASE_URL } from '../utils/constants';
import { db, GUEST_USER_ID, getRawWebState, transferGuestDataToUser } from '../db/client';
import { authService } from './authService';

export interface SyncResult {
  success: boolean;
  pushed: number;
  pulled: number;
  error?: string;
}

class SyncService {
  // Check how many local unauthenticated slots exist
  public getGuestSlotCount(): number {
    const raw = getRawWebState();
    return raw.slots.filter((s) => s.user_id === GUEST_USER_ID && !s.is_deleted).length;
  }

  // Merge guest sessions into the active user's account
  public async mergeGuestSlotsToAccount(): Promise<{ success: boolean; count: number }> {
    const user = authService.getCurrentUser();
    if (!user) return { success: false, count: 0 };

    const { slotsCount } = transferGuestDataToUser(user.id);

    // If online, send merged slots to Cloudflare D1
    try {
      const raw = getRawWebState();
      const userSlots = raw.slots.filter((s) => s.user_id === user.id && !s.is_deleted);
      const userSubjects = raw.subjects.filter((sub) => sub.user_id === user.id && !sub.is_deleted);

      await fetch(`${API_BASE_URL}/api/sync/merge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
        },
        body: JSON.stringify({
          targetUserId: user.id,
          slots: userSlots,
          subjects: userSubjects,
        }),
      });
    } catch (e) {
      console.warn('Remote merge deferred to regular sync:', e);
    }

    return { success: true, count: slotsCount };
  }

  // Two-way synchronization with Cloudflare D1
  public async syncUserTimetable(): Promise<SyncResult> {
    const user = authService.getCurrentUser();
    const effectiveId = user?.id || GUEST_USER_ID;

    try {
      // 1. Flush local mutation queue (PUSH)
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
            'x-user-id': effectiveId,
          },
          body: JSON.stringify({ mutations }),
        });

        if (pushRes.ok) {
          const ids = queueRows.map((r) => r.queue_id).join(',');
          db.execSync(`DELETE FROM sync_queue WHERE queue_id IN (${ids})`);
          pushedCount = queueRows.length;
        }
      }

      // 2. Pull remote updates (PULL)
      const metaRow = db.getFirstSync<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', ['last_pull_' + effectiveId]);
      const lastPull = metaRow ? Number(metaRow.value) : 0;

      const pullRes = await fetch(`${API_BASE_URL}/api/sync/pull?since=${lastPull}`, {
        headers: { 'x-user-id': effectiveId },
      });

      let pulledCount = 0;
      if (pullRes.ok) {
        const data = await pullRes.json();

        db.withTransactionSync(() => {
          // Upsert subjects
          for (const sub of data.changes.subjects || []) {
            db.runSync(
              `INSERT INTO subjects (id, user_id, name, room_number, created_at, updated_at, is_deleted)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at;`,
              [sub.id, sub.user_id, sub.name, sub.room_number || '', sub.created_at, sub.updated_at, sub.is_deleted]
            );
          }

          // Upsert timetable slots
          for (const s of data.changes.slots || []) {
            db.runSync(
              `INSERT INTO timetable_slots (id, user_id, subject_id, day_of_week, start_time_minutes, end_time_minutes, slot_type, topic, target_questions, created_at, updated_at, is_deleted)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 start_time_minutes = excluded.start_time_minutes, end_time_minutes = excluded.end_time_minutes,
                 topic = excluded.topic, target_questions = excluded.target_questions, updated_at = excluded.updated_at;`,
              [s.id, s.user_id, s.subject_id, s.day_of_week, s.start_time_minutes, s.end_time_minutes, s.slot_type, s.topic || '', s.target_questions || 0, s.created_at, s.updated_at, s.is_deleted]
            );
          }

          db.runSync(
            `INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
            ['last_pull_' + effectiveId, data.server_time.toString()]
          );
        });

        pulledCount = (data.changes.slots?.length || 0) + (data.changes.subjects?.length || 0);
      }

      return { success: true, pushed: pushedCount, pulled: pulledCount };
    } catch (e: any) {
      console.warn('Sync failed:', e);
      return { success: false, pushed: 0, pulled: 0, error: 'Could not connect to Cloudflare edge' };
    }
  }
}

export const syncService = new SyncService();