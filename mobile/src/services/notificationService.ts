// mobile/src/services/notificationService.ts
import { Platform } from 'react-native';

export interface ScheduledAlert {
  id: string;
  slotId: string;
  triggerMinutes: number; // minutes from midnight
  displayTime: string;
  subjectName: string;
  type: 'pre_session' | 'post_session';
  message: string;
}

// 1. Synthetic Audio Chime (Zero external assets needed)
export function playNotificationChime() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      // Dual-tone harmonic chime (D5 -> A5)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } catch {
      // Audio context restricted until user interacts
    }
  }
}

// 2. Request System Notifications
export async function requestSystemNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') return true;
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  }
  return true;
}

// 3. Dispatch Live Notification
export function dispatchNotification(title: string, body: string) {
  playNotificationChime();

  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: 'https://cdn-icons-png.flaticon.com/512/3233/3233497.png',
        });
      } catch (e) {
        console.warn('System notification failed:', e);
      }
    }
  }
}

// 4. Calculate Scheduled Alerts for the Active Day
export function calculateDayAlerts(
  slots: any[],
  leadMinutes: number,
  enablePostSession: boolean
): ScheduledAlert[] {
  const alerts: ScheduledAlert[] = [];

  slots.forEach((s) => {
    // A. Pre-session Lead-time Warning
    const preTrigger = Math.max(0, s.start_time_minutes - leadMinutes);
    const preH = Math.floor(preTrigger / 60);
    const preM = preTrigger % 60;
    const prePeriod = preH >= 12 ? 'PM' : 'AM';
    const preH12 = preH % 12 || 12;

    const goalSnippet = s.target_questions > 0 ? `Target: ${s.target_questions} Qs.` : 'Focus mode!';
    const topicSnippet = s.topic ? `Topic: ${s.topic}` : 'Ready your study desk.';

    alerts.push({
      id: `pre_${s.slot_id}`,
      slotId: s.slot_id,
      triggerMinutes: preTrigger,
      displayTime: `${preH12.toString().padStart(2, '0')}:${preM.toString().padStart(2, '0')} ${prePeriod}`,
      subjectName: s.subject_name,
      type: 'pre_session',
      message: `${leadMinutes > 0 ? `Starts in ${leadMinutes}m: ` : 'Starting now: '}${s.subject_name}. ${topicSnippet} (${goalSnippet})`,
    });

    // B. Post-session Accountability Wrap-up
    if (enablePostSession) {
      const postTrigger = s.end_time_minutes;
      const postH = Math.floor(postTrigger / 60);
      const postM = postTrigger % 60;
      const postPeriod = postH >= 12 ? 'PM' : 'AM';
      const postH12 = postH % 12 || 12;

      alerts.push({
        id: `post_${s.slot_id}`,
        slotId: s.slot_id,
        triggerMinutes: postTrigger,
        displayTime: `${postH12.toString().padStart(2, '0')}:${postM.toString().padStart(2, '0')} ${postPeriod}`,
        subjectName: s.subject_name,
        type: 'post_session',
        message: `Session complete: ${s.subject_name}! Did you achieve your goal? Log your status to track your efficiency score.`,
      });
    }
  });

  return alerts.sort((a, b) => a.triggerMinutes - b.triggerMinutes);
}