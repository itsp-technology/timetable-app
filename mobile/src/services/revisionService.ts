// mobile/src/services/revisionService.ts
import { db, RevisionMilestone } from '../db/client';

export function formatDateToISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysToDate(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const target = new Date(year, month - 1, day);
  target.setDate(target.getDate() + days);
  return formatDateToISO(target);
}

/**
 * Creates 3 Spaced Repetition milestones (+2d, +7d, +21d) for a completed topic
 */
export function scheduleSpacedRepetitionMilestones(
  userId: string,
  slotId: string,
  subjectName: string,
  topic: string,
  baseDateISO: string
): { success: boolean; scheduledDates: string[] } {
  const intervals = [
    { stage: 1, days: 2 },
    { stage: 2, days: 7 },
    { stage: 3, days: 21 },
  ];

  const now = Date.now();
  const scheduledDates: string[] = [];

  try {
    intervals.forEach(({ stage, days }) => {
      const dueDate = addDaysToDate(baseDateISO, days);
      scheduledDates.push(dueDate);
      const milestoneId = `rev_${slotId}_s${stage}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      db.runSync(
        `INSERT INTO revision_milestones (
          id, user_id, slot_id, subject_name, topic, interval_stage, due_date, is_completed, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?);`,
        [milestoneId, userId, slotId, subjectName, topic, stage, dueDate, now, now]
      );
    });

    return { success: true, scheduledDates };
  } catch (err) {
    console.error('Failed to schedule spaced repetition:', err);
    return { success: false, scheduledDates: [] };
  }
}

/**
 * Fetches all Active Recall revisions due on a specific calendar date
 */
export function getRevisionsDueForDate(userId: string, dateISO: string): RevisionMilestone[] {
  try {
    return db.getAllSync<RevisionMilestone>(
      `SELECT * FROM revision_milestones WHERE user_id = ? AND due_date = ? AND is_deleted = 0 ORDER BY interval_stage ASC;`,
      [userId, dateISO]
    );
  } catch {
    return [];
  }
}

/**
 * Mark a revision milestone as completed
 */
export function toggleRevisionStatus(milestoneId: string, isCompleted: boolean) {
  const now = Date.now();
  db.runSync(
    `UPDATE revision_milestones SET is_completed = ?, updated_at = ? WHERE id = ?;`,
    [isCompleted ? 1 : 0, now, milestoneId]
  );
}