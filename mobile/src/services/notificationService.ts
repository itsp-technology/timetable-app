// mobile/src/services/notificationService.ts
import { Platform } from 'react-native';

export interface ScheduledAlert {
  id: string;
  slotId: string;
  triggerMinutes: number;
  displayTime: string;
  subjectName: string;
  type: 'pre_session' | 'post_session';
  message: string;
}

const ANDROID_CHANNEL_ID = 'study-alerts-channel';

let NotificationsModule: any = null;

if (Platform.OS !== 'web') {
  try {
    NotificationsModule = require('expo-notifications');
    if (NotificationsModule && NotificationsModule.setNotificationHandler) {
      NotificationsModule.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
    }
  } catch (e) {
    console.warn('Notifications native module unavailable:', e);
  }
}

export async function setupMobileNotificationChannel() {
  if (Platform.OS === 'android' && NotificationsModule?.setNotificationChannelAsync) {
    try {
      await NotificationsModule.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'Study Alarms & Session Reminders',
        importance: NotificationsModule.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563EB',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
    } catch (e) {
      console.warn('Channel creation error:', e);
    }
  }
}

export function playNotificationChime() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } catch {}
  }
}

export async function requestSystemNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') return true;
      if (Notification.permission !== 'denied') {
        const p = await Notification.requestPermission();
        return p === 'granted';
      }
    }
    return false;
  } else {
    if (!NotificationsModule) return false;
    try {
      await setupMobileNotificationChannel();
      const settings = await NotificationsModule.getPermissionsAsync();
      if (settings.granted || settings.ios?.status === NotificationsModule.IosAuthorizationStatus.PROVISIONAL) {
        return true;
      }
      const request = await NotificationsModule.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
        android: {},
      });
      return request.granted;
    } catch {
      return false;
    }
  }
}

export async function dispatchNotification(title: string, body: string) {
  if (Platform.OS === 'web') {
    playNotificationChime();
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, { body });
      } catch {}
    }
  } else {
    if (NotificationsModule?.scheduleNotificationAsync) {
      try {
        await NotificationsModule.scheduleNotificationAsync({
          content: {
            title,
            body,
            sound: 'default',
            vibrate: [0, 250, 250, 250],
            channelId: ANDROID_CHANNEL_ID,
          },
          trigger: null,
        });
      } catch (e) {
        console.warn('Native notification failed:', e);
      }
    }
  }
}

export async function scheduleNativeAlarmsForToday(alerts: ScheduledAlert[]) {
  if (Platform.OS === 'web' || !NotificationsModule?.scheduleNotificationAsync) return;

  try {
    await NotificationsModule.cancelAllScheduledNotificationsAsync();
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (const alert of alerts) {
      if (alert.triggerMinutes > currentMinutes) {
        const delaySeconds = (alert.triggerMinutes - currentMinutes) * 60 - now.getSeconds();
        if (delaySeconds > 0) {
          await NotificationsModule.scheduleNotificationAsync({
            content: {
              title: alert.type === 'pre_session' ? `🔔 Upcoming: ${alert.subjectName}` : '🎯 Accountability Check',
              body: alert.message,
              sound: 'default',
              channelId: ANDROID_CHANNEL_ID,
            },
            trigger: {
              type: NotificationsModule.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: delaySeconds,
            },
          });
        }
      }
    }
  } catch (e) {
    console.warn('Schedule alarms error:', e);
  }
}

export function calculateDayAlerts(
  slots: any[],
  leadMinutes: number,
  enablePostSession: boolean
): ScheduledAlert[] {
  const alerts: ScheduledAlert[] = [];

  slots.forEach((s) => {
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
        message: `Session complete: ${s.subject_name}! Did you achieve your goal? Log your progress.`,
      });
    }
  });

  return alerts.sort((a, b) => a.triggerMinutes - b.triggerMinutes);
}