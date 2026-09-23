// mobile/App.tsx
import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Text,
  View,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  StatusBar,
  Platform,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import {
  db,
  initLocalDatabase,
  queueMutation,
  CategoryItem,
  GUEST_USER_ID,
  RevisionMilestone,
} from './src/db/client';
import { THEMES, ThemeKey } from './src/theme/themes';
import { getAppStyles } from './src/styles/appStyles';
import { authService, AuthUser } from './src/services/authService';
import { syncService } from './src/services/syncService';
import { AuthModal } from './src/components/AuthModal';
import {
  dispatchNotification,
  requestSystemNotificationPermission,
  calculateDayAlerts,
  ScheduledAlert,
} from './src/services/notificationService';

type Period = 'AM' | 'PM';
type ViewLayoutMode = 'extra_large' | 'large' | 'medium' | 'small' | 'list' | 'details' | 'tiles' | 'content';
type SortOrderMode = 'time' | 'duration' | 'subject' | 'target' | 'status';

interface ExamSlotItem {
  slot_id: string;
  subject_name: string;
  room_number: string;
  start_time_minutes: number;
  end_time_minutes: number;
  slot_type: string;
  topic: string;
  target_questions: number;
  specific_date?: string | null;
  status: 'completed' | 'skipped' | null;
}

interface CustomDialogState {
  visible: boolean;
  title: string;
  message: string;
  isConfirm?: boolean;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  onConfirm?: () => void;
}

const DAYS = [
  { short: 'Mon', full: 'Monday' },
  { short: 'Tue', full: 'Tuesday' },
  { short: 'Wed', full: 'Wednesday' },
  { short: 'Thu', full: 'Thursday' },
  { short: 'Fri', full: 'Friday' },
  { short: 'Sat', full: 'Saturday' },
  { short: 'Sun', full: 'Sunday' },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const LEAD_TIME_OPTIONS = [0, 5, 10, 15];

const PRESET_ROUTINES = [
  { label: '🌅 Early Morning', startH: 6, startM: 0, startP: 'AM' as Period, endH: 8, endM: 0, endP: 'AM' as Period },
  { label: '☀️ Forenoon', startH: 9, startM: 0, startP: 'AM' as Period, endH: 11, endM: 30, endP: 'AM' as Period },
  { label: '🌤️ Afternoon', startH: 2, startM: 0, startP: 'PM' as Period, endH: 4, endM: 30, endP: 'PM' as Period },
  { label: '🌙 Night Drill', startH: 8, startM: 0, startP: 'PM' as Period, endH: 10, endM: 0, endP: 'PM' as Period },
];

const EMOJI_PALETTE = ['📖', '📝', '⚡', '⏱️', '🎯', '✍️', '🧠', '📊', '💻', '🔬', '📚', '🏆', '🧪', '💡', '📌', '📑'];
const COLOR_PALETTE = ['#2563EB', '#059669', '#9333EA', '#D97706', '#E11D48', '#0891B2', '#4F46E5', '#16A34A'];

function toMinutes(hour12: number, minute: number, period: Period): number {
  let h = hour12 % 12;
  if (period === 'PM') h += 12;
  return h * 60 + minute;
}

function formatMinutesTo12Hour(totalMinutes: number): string {
  let hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const period: Period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function formatDateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysToIso(isoStr: string, days: number): string {
  const [y, m, d] = isoStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return formatDateToIso(date);
}

export default function App() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  // Active Theme & Modals
  const [currentThemeKey, setCurrentThemeKey] = useState<ThemeKey>('midnight');
  const [isThemeModalOpen, setIsThemeModalOpen] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  // Authentication & User State
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(authService.getCurrentUser());
  const activeUserId = currentUser ? currentUser.id : GUEST_USER_ID;

  // Goal & Countdown States
  const [examName, setExamName] = useState<string>('Target Competitive Exam');
  const [examDate, setExamDate] = useState<string>('');
  const [isGoalModalOpen, setIsGoalModalOpen] = useState<boolean>(false);
  const [tempExamName, setTempExamName] = useState<string>('');
  const [tempExamDate, setTempExamDate] = useState<string>('');

  // Notification Engine States
  const [notifEnabled, setNotifEnabled] = useState<boolean>(true);
  const [leadMinutes, setLeadMinutes] = useState<number>(10);
  const [enablePostSessionCheck, setEnablePostSessionCheck] = useState<boolean>(true);
  const [isNotifModalOpen, setIsNotifModalOpen] = useState<boolean>(false);
  const firedAlertsRef = useRef<Set<string>>(new Set());

  const activeTheme = THEMES[currentThemeKey];
  const styles = useMemo(() => getAppStyles(activeTheme, isDesktop), [activeTheme, isDesktop]);

  // 📅 Calendar & Date States
  const todayIso = useMemo(() => formatDateToIso(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [calendarViewMode, setCalendarViewMode] = useState<'month' | 'week'>('month');

  const selectedDateObj = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [selectedDate]);

  const [viewYear, setViewYear] = useState<number>(selectedDateObj.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(selectedDateObj.getMonth());

  const selectedDay = useMemo(() => {
    const d = selectedDateObj.getDay();
    return d === 0 ? 7 : d;
  }, [selectedDateObj]);

  // 🗂️ EXPLORER "SORT ⌵" & "VIEW ⌵" VIEW STATES
  const [currentViewLayout, setCurrentViewLayout] = useState<ViewLayoutMode>('large');
  const [currentSortOrder, setCurrentSortOrder] = useState<SortOrderMode>('time');
  const [showDetailsPane, setShowDetailsPane] = useState<boolean>(true);
  const [showPreviewPane, setShowPreviewPane] = useState<boolean>(true);

  // Explorer Dropdown Popover Menus
  const [isViewMenuOpen, setIsViewMenuOpen] = useState<boolean>(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState<boolean>(false);

  // 7-day strip
  const weekStripDays = useMemo(() => {
    const list = [];
    const base = new Date(selectedDateObj);
    base.setDate(base.getDate() - 3);

    for (let i = 0; i < 7; i++) {
      const cur = new Date(base);
      cur.setDate(base.getDate() + i);
      const iso = formatDateToIso(cur);
      const dayIdx = cur.getDay() === 0 ? 6 : cur.getDay() - 1;
      list.push({
        iso,
        dayNum: cur.getDate(),
        dayShort: DAYS[dayIdx].short,
        isToday: iso === todayIso,
        isSelected: iso === selectedDate,
      });
    }
    return list;
  }, [selectedDate, todayIso, selectedDateObj]);

  // Month grid
  const monthGridData = useMemo(() => {
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstDayIndex = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;

    const cells = [];
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push({ key: `pad_${i}`, dayNum: 0, iso: '' });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        key: iso,
        dayNum: d,
        iso,
        isToday: iso === todayIso,
        isSelected: iso === selectedDate,
      });
    }
    return cells;
  }, [viewYear, viewMonth, todayIso, selectedDate]);

  const [slots, setSlots] = useState<ExamSlotItem[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Spaced Repetition States
  const [revisionsDue, setRevisionsDue] = useState<RevisionMilestone[]>([]);
  const [recallPromptSlot, setRecallPromptSlot] = useState<ExamSlotItem | null>(null);
  const [isRecallModalOpen, setIsRecallModalOpen] = useState<boolean>(false);

  // Categories & Filtering
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [activeFilterCategory, setActiveFilterCategory] = useState<string>('ALL');

  // Main Page Category Modal
  const [isMainCatModalOpen, setIsMainCatModalOpen] = useState<boolean>(false);
  const [isInlineCatCreatorOpen, setIsInlineCatCreatorOpen] = useState<boolean>(false);

  // Category Inputs
  const [newCatName, setNewCatName] = useState<string>('');
  const [newCatEmoji, setNewCatEmoji] = useState<string>('🎯');
  const [newCatColor, setNewCatColor] = useState<string>('#2563EB');

  // Slot Form Inputs & Frequency
  const [subjectName, setSubjectName] = useState<string>('');
  const [topicName, setTopicName] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('theory');
  const [targetQuestions, setTargetQuestions] = useState<string>('');
  const [slotFrequency, setSlotFrequency] = useState<'specific_date' | 'weekly'>('specific_date');

  // Watch Selector States
  const [startHour, setStartHour] = useState<number>(9);
  const [startMinute, setStartMinute] = useState<number>(0);
  const [startPeriod, setStartPeriod] = useState<Period>('AM');

  const [endHour, setEndHour] = useState<number>(11);
  const [endMinute, setEndMinute] = useState<number>(0);
  const [endPeriod, setEndPeriod] = useState<Period>('AM');

  // Dialog State
  const [dialog, setDialog] = useState<CustomDialogState>({
    visible: false,
    title: '',
    message: '',
  });

  const showAppAlert = (title: string, message: string) => {
    setDialog({ visible: true, title, message, isConfirm: false });
  };

  const showAppConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    confirmText: string = 'Confirm',
    isDanger: boolean = false
  ) => {
    setDialog({
      visible: true,
      title,
      message,
      isConfirm: true,
      confirmText,
      cancelText: 'Cancel',
      isDanger,
      onConfirm,
    });
  };

  const closeDialog = () => {
    setDialog((prev) => ({ ...prev, visible: false }));
  };

  // Sync background on web to remove white gap
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.body.style.backgroundColor = activeTheme.bg;
      document.body.style.margin = '0';
      document.body.style.padding = '0';
      document.body.style.overflowX = 'hidden';
    }
  }, [activeTheme]);

  const scheduledAlerts: ScheduledAlert[] = useMemo(() => {
    return calculateDayAlerts(slots, leadMinutes, enablePostSessionCheck);
  }, [slots, leadMinutes, enablePostSessionCheck]);

  // Background Alert Watcher
  useEffect(() => {
    if (!notifEnabled) return;
    const interval = setInterval(() => {
      const now = new Date();
      const currentDay = now.getDay() === 0 ? 7 : now.getDay();
      if (currentDay !== selectedDay) return;

      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      scheduledAlerts.forEach((alert) => {
        if (alert.triggerMinutes === currentMinutes && !firedAlertsRef.current.has(alert.id)) {
          firedAlertsRef.current.add(alert.id);
          dispatchNotification(
            alert.type === 'pre_session' ? `🔔 Upcoming: ${alert.subjectName}` : `🎯 Accountability Check`,
            alert.message
          );
        }
      });
    }, 20000);

    return () => clearInterval(interval);
  }, [notifEnabled, scheduledAlerts, selectedDay]);

  const handleTestNotification = async () => {
    await requestSystemNotificationPermission();
    dispatchNotification('🔔 Focus Alert', 'Operating Systems starts in 10 mins! Goal: 25 questions.');
  };

  const calculatedStartMinutes = useMemo(
    () => toMinutes(startHour, startMinute, startPeriod),
    [startHour, startMinute, startPeriod]
  );

  const calculatedEndMinutes = useMemo(
    () => toMinutes(endHour, endMinute, endPeriod),
    [endHour, endMinute, endPeriod]
  );

  const durationHours = useMemo(() => {
    const diff = calculatedEndMinutes - calculatedStartMinutes;
    return diff > 0 ? (diff / 60).toFixed(1) : '0.0';
  }, [calculatedStartMinutes, calculatedEndMinutes]);

  const isTimeIntervalValid = calculatedEndMinutes > calculatedStartMinutes;

  const daysLeft = useMemo(() => {
    if (!examDate) return null;
    const target = new Date(`${examDate}T00:00:00`);
    if (isNaN(target.getTime())) return null;
    const now = new Date();
    const diff = target.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [examDate]);

  // Load Initial Database State
  useEffect(() => {
    initLocalDatabase();

    const storedTheme = db.getFirstSync<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', ['preferred_theme']);
    if (storedTheme && storedTheme.value in THEMES) {
      setCurrentThemeKey(storedTheme.value as ThemeKey);
    }

    const storedExam = db.getFirstSync<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', ['exam_name']);
    if (storedExam?.value) setExamName(storedExam.value);

    const storedExamDate = db.getFirstSync<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', ['exam_date']);
    if (storedExamDate?.value) setExamDate(storedExamDate.value);

    refreshCategories();
  }, []);

  // Reload timetable and revisions whenever active user or selected date changes
  useEffect(() => {
    refreshSlots();
    refreshRevisions();
  }, [selectedDate, activeUserId]);

  const refreshCategories = () => {
    const rows = db.getAllSync<CategoryItem>('SELECT * FROM session_categories');
    setCategories(rows);
    if (rows.length > 0 && !selectedCategory) {
      setSelectedCategory(rows[0].id);
    }
  };

  const refreshRevisions = () => {
    try {
      const rows = db.getAllSync<RevisionMilestone>(
        `SELECT * FROM revision_milestones WHERE user_id = ? AND due_date = ? AND is_deleted = 0 ORDER BY interval_stage ASC;`,
        [activeUserId, selectedDate]
      );
      setRevisionsDue(rows);
    } catch {
      setRevisionsDue([]);
    }
  };

  const refreshSlots = () => {
    try {
      const rows = db.getAllSync<ExamSlotItem>(
        `SELECT 
          t.id AS slot_id,
          s.name AS subject_name,
          s.room_number,
          t.start_time_minutes,
          t.end_time_minutes,
          t.slot_type,
          t.topic,
          t.target_questions,
          t.specific_date,
          a.status
        FROM timetable_slots t
        JOIN subjects s ON t.subject_id = s.id
        LEFT JOIN attendance_records a ON a.slot_id = t.id AND a.date = ? AND a.is_deleted = 0
        WHERE t.user_id = ? 
          AND (t.specific_date = ? OR (t.specific_date IS NULL AND t.day_of_week = ?))
          AND t.is_deleted = 0
        ORDER BY t.start_time_minutes ASC;`,
        [selectedDate, activeUserId, selectedDate, selectedDay]
      );
      setSlots(rows);
    } catch (e) {
      console.error('Error fetching timetable slots:', e);
    }
  };

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    slots.forEach((s) => {
      map[s.slot_type] = (map[s.slot_type] || 0) + 1;
    });
    return map;
  }, [slots]);

  // Filter and Sort sessions according to current user selections
  const sortedAndFilteredSlots = useMemo(() => {
    let result = activeFilterCategory === 'ALL'
      ? [...slots]
      : slots.filter((s) => s.slot_type === activeFilterCategory);

    // Apply sorting
    result.sort((a, b) => {
      if (currentSortOrder === 'time') {
        return a.start_time_minutes - b.start_time_minutes;
      }
      if (currentSortOrder === 'duration') {
        const durA = a.end_time_minutes - a.start_time_minutes;
        const durB = b.end_time_minutes - b.start_time_minutes;
        return durB - durA;
      }
      if (currentSortOrder === 'subject') {
        return a.subject_name.localeCompare(b.subject_name);
      }
      if (currentSortOrder === 'target') {
        return (b.target_questions || 0) - (a.target_questions || 0);
      }
      if (currentSortOrder === 'status') {
        const order = { null: 0, completed: 1, skipped: 2 };
        const statusA = order[a.status as keyof typeof order] ?? 0;
        const statusB = order[b.status as keyof typeof order] ?? 0;
        return statusA - statusB;
      }
      return 0;
    });

    return result;
  }, [slots, activeFilterCategory, currentSortOrder]);

  const handleCreateCategory = (fromInline: boolean = false) => {
    if (!newCatName.trim()) {
      showAppAlert('Required', 'Please enter a Category Title.');
      return;
    }
    const catId = 'cat_' + Math.random().toString(36).substring(2, 9);
    const catBg = `${newCatColor}18`;

    db.runSync(
      'INSERT INTO session_categories (id, name, icon, color_hex, bg_hex, is_custom) VALUES (?, ?, ?, ?, ?, ?)',
      [catId, newCatName.trim(), newCatEmoji, newCatColor, catBg, 1]
    );

    refreshCategories();
    setSelectedCategory(catId);
    setNewCatName('');

    if (fromInline) setIsInlineCatCreatorOpen(false);
    else setIsMainCatModalOpen(false);

    showAppAlert('Category Added', `"${newCatName.trim()}" is now available.`);
  };

  const handleDeleteCategory = (cat: CategoryItem) => {
    showAppConfirm(
      'Delete Category',
      `Delete "${cat.name}"? Slots using this category will remain intact.`,
      () => {
        db.runSync('DELETE FROM session_categories WHERE id = ?;', [cat.id]);
        if (activeFilterCategory === cat.id) setActiveFilterCategory('ALL');
        if (selectedCategory === cat.id) setSelectedCategory('theory');
        refreshCategories();
      },
      'Delete',
      true
    );
  };

  const handleApplyPreset = (p: typeof PRESET_ROUTINES[0]) => {
    setStartHour(p.startH);
    setStartMinute(p.startM);
    setStartPeriod(p.startP);
    setEndHour(p.endH);
    setEndMinute(p.endM);
    setEndPeriod(p.endP);
  };

  const stepHour = (current: number, delta: number) => {
    let next = current + delta;
    if (next > 12) next = 1;
    if (next < 1) next = 12;
    return next;
  };

  const stepMinute = (current: number, delta: number) => {
    let next = (current + delta * 15) % 60;
    if (next < 0) next = 45;
    return next;
  };

  const handleSelectTheme = (key: ThemeKey) => {
    setCurrentThemeKey(key);
    db.runSync(
      `INSERT INTO sync_meta (key, value) VALUES ('preferred_theme', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
      [key]
    );
    setIsThemeModalOpen(false);
  };

  const handleOpenGoalModal = () => {
    setTempExamName(examName);
    setTempExamDate(examDate);
    setIsGoalModalOpen(true);
  };

  const handleSaveGoal = () => {
    if (!tempExamName.trim()) {
      showAppAlert('Required', 'Please enter your exam title');
      return;
    }
    const cleanExam = tempExamName.trim();
    const cleanDate = tempExamDate.trim();

    setExamName(cleanExam);
    setExamDate(cleanDate);

    db.runSync(`INSERT INTO sync_meta (key, value) VALUES ('exam_name', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;`, [cleanExam]);
    db.runSync(`INSERT INTO sync_meta (key, value) VALUES ('exam_date', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;`, [cleanDate]);

    setIsGoalModalOpen(false);
  };

  const metrics = useMemo(() => {
    let totalMinutesPlanned = 0;
    let totalMinutesCompleted = 0;
    let questionsTargeted = 0;
    let questionsCompleted = 0;

    slots.forEach((s) => {
      const duration = s.end_time_minutes - s.start_time_minutes;
      totalMinutesPlanned += duration;
      questionsTargeted += Number(s.target_questions || 0);

      if (s.status === 'completed') {
        totalMinutesCompleted += duration;
        questionsCompleted += Number(s.target_questions || 0);
      }
    });

    const plannedHours = (totalMinutesPlanned / 60).toFixed(1);
    const completedHours = (totalMinutesCompleted / 60).toFixed(1);
    const completionRate = totalMinutesPlanned > 0 ? Math.round((totalMinutesCompleted / totalMinutesPlanned) * 100) : 0;

    return { plannedHours, completedHours, completionRate, questionsTargeted, questionsCompleted };
  }, [slots]);

  const handleStepMonth = (delta: number) => {
    let nextM = viewMonth + delta;
    let nextY = viewYear;
    if (nextM > 11) {
      nextM = 0;
      nextY += 1;
    } else if (nextM < 0) {
      nextM = 11;
      nextY -= 1;
    }
    setViewMonth(nextM);
    setViewYear(nextY);
  };

  const handleStepDay = (delta: number) => {
    const nextDate = addDaysToIso(selectedDate, delta);
    setSelectedDate(nextDate);
    const [y, m] = nextDate.split('-').map(Number);
    setViewYear(y);
    setViewMonth(m - 1);
  };

  const handleCreateSlot = () => {
    if (!subjectName.trim()) {
      showAppAlert('Required Field', 'Please provide a Subject name.');
      return;
    }

    if (!isTimeIntervalValid) {
      showAppAlert('Invalid Time', 'End time must be later than start time.');
      return;
    }

    const collision = db.getFirstSync(
      `SELECT id FROM timetable_slots
       WHERE user_id = ? 
         AND (specific_date = ? OR (specific_date IS NULL AND day_of_week = ?))
         AND is_deleted = 0
         AND start_time_minutes < ? AND end_time_minutes > ?;`,
      [
        activeUserId,
        slotFrequency === 'specific_date' ? selectedDate : '',
        selectedDay,
        calculatedEndMinutes,
        calculatedStartMinutes,
      ]
    );

    if (collision) {
      showAppAlert('Slot Collision', 'This time period overlaps with an existing session.');
      return;
    }

    const now = Date.now();
    const subjectId = 'sub_' + Math.random().toString(36).substring(2, 9);
    const slotId = 'slot_' + Math.random().toString(36).substring(2, 9);
    const qCount = parseInt(targetQuestions, 10) || 0;
    const finalSpecificDate = slotFrequency === 'specific_date' ? selectedDate : null;

    db.withTransactionSync(() => {
      const subData = {
        id: subjectId,
        user_id: activeUserId,
        name: subjectName.trim(),
        room_number: '',
        created_at: now,
        updated_at: now,
        is_deleted: 0,
      };
      db.runSync(
        `INSERT INTO subjects (id, user_id, name, room_number, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);`,
        [subData.id, subData.user_id, subData.name, subData.room_number, subData.created_at, subData.updated_at]
      );
      queueMutation('subjects', subjectId, subData);

      const slotData = {
        id: slotId,
        user_id: activeUserId,
        subject_id: subjectId,
        day_of_week: selectedDay,
        specific_date: finalSpecificDate,
        start_time_minutes: calculatedStartMinutes,
        end_time_minutes: calculatedEndMinutes,
        slot_type: selectedCategory,
        topic: topicName.trim(),
        target_questions: qCount,
        created_at: now,
        updated_at: now,
        is_deleted: 0,
      };
      db.runSync(
        `INSERT INTO timetable_slots (id, user_id, subject_id, day_of_week, specific_date, start_time_minutes, end_time_minutes, slot_type, topic, target_questions, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          slotData.id,
          slotData.user_id,
          slotData.subject_id,
          slotData.day_of_week,
          slotData.specific_date,
          slotData.start_time_minutes,
          slotData.end_time_minutes,
          slotData.slot_type,
          slotData.topic,
          slotData.target_questions,
          slotData.created_at,
          slotData.updated_at,
        ]
      );
      queueMutation('timetable_slots', slotId, slotData);
    });

    setIsModalOpen(false);
    setIsInlineCatCreatorOpen(false);
    setSubjectName('');
    setTopicName('');
    setTargetQuestions('');
    refreshSlots();
  };

  const handleDeleteSlot = (slotId: string) => {
    showAppConfirm(
      'Remove Study Slot',
      'Remove this session from your schedule?',
      () => {
        db.runSync(`DELETE FROM timetable_slots WHERE id = ?;`, [slotId]);
        refreshSlots();
      },
      'Remove',
      true
    );
  };

  const handleUpdateStatus = (slotId: string, status: 'completed' | 'skipped') => {
    const now = Date.now();
    const attId = 'att_' + Math.random().toString(36).substring(2, 9);

    const attData = {
      id: attId,
      user_id: activeUserId,
      slot_id: slotId,
      date: selectedDate,
      status,
      created_at: now,
      updated_at: now,
      is_deleted: 0,
    };

    db.runSync(
      `INSERT INTO attendance_records (id, user_id, slot_id, date, status, created_at, updated_at, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0);`,
      [attId, activeUserId, slotId, selectedDate, status, now, now]
    );

    queueMutation('attendance_records', attId, attData);
    refreshSlots();

    if (status === 'completed') {
      const completedSlot = slots.find((s) => s.slot_id === slotId);
      if (completedSlot) {
        setRecallPromptSlot(completedSlot);
        setIsRecallModalOpen(true);
      }
    }
  };

  const handleConfirmSpacedRepetition = () => {
    if (!recallPromptSlot) return;

    const topicTitle = recallPromptSlot.topic.trim() || recallPromptSlot.subject_name;
    const intervals = [
      { stage: 1, days: 2 },
      { stage: 2, days: 7 },
      { stage: 3, days: 21 },
    ];
    const now = Date.now();
    const createdDates: string[] = [];

    db.withTransactionSync(() => {
      intervals.forEach(({ stage, days }) => {
        const dueDate = addDaysToIso(selectedDate, days);
        createdDates.push(dueDate);
        const revId = 'rev_' + Math.random().toString(36).substring(2, 9);

        const revData = {
          id: revId,
          user_id: activeUserId,
          slot_id: recallPromptSlot.slot_id,
          subject_name: recallPromptSlot.subject_name,
          topic: topicTitle,
          interval_stage: stage,
          due_date: dueDate,
          is_completed: 0,
          created_at: now,
          updated_at: now,
          is_deleted: 0,
        };

        db.runSync(
          `INSERT INTO revision_milestones (id, user_id, slot_id, subject_name, topic, interval_stage, due_date, is_completed, created_at, updated_at, is_deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            revData.id,
            revData.user_id,
            revData.slot_id,
            revData.subject_name,
            revData.topic,
            revData.interval_stage,
            revData.due_date,
            revData.is_completed,
            revData.created_at,
            revData.updated_at,
            revData.is_deleted,
          ]
        );
        queueMutation('revision_milestones', revId, revData);
      });
    });

    setIsRecallModalOpen(false);
    setRecallPromptSlot(null);
    refreshRevisions();

    dispatchNotification(
      '🧠 Active Recall Scheduled',
      `Checkpoints set for: ${createdDates.join(', ')}`
    );

    showAppAlert(
      'Active Recall Scheduled',
      `Checkpoints scheduled for:\n• Day +2: ${createdDates[0]}\n• Day +7: ${createdDates[1]}\n• Day +21: ${createdDates[2]}`
    );
  };

  const handleToggleRevision = (rev: RevisionMilestone) => {
    const nextVal = rev.is_completed === 1 ? 0 : 1;
    const now = Date.now();

    db.runSync(
      `UPDATE revision_milestones SET is_completed = ?, updated_at = ? WHERE id = ?;`,
      [nextVal, now, rev.id]
    );
    queueMutation('revision_milestones', rev.id, {
      id: rev.id,
      is_completed: nextVal,
      updated_at: now,
    });
    refreshRevisions();
  };

  const handleCloudSync = async () => {
    setIsSyncing(true);
    const result = await syncService.syncUserTimetable();
    setIsSyncing(false);
    refreshSlots();
    refreshRevisions();
    showAppAlert(
      result.success ? 'Sync Completed' : 'Sync Status',
      result.success
        ? `Uploaded: ${result.pushed} changes | Downloaded: ${result.pulled} changes.`
        : (result.error || 'Running in local offline mode.')
    );
  };

  // Helper render for various view modes
  const renderSlotItem = ({ item }: { item: ExamSlotItem }) => {
    const cat = categories.find((c) => c.id === item.slot_type) || {
      name: item.slot_type,
      icon: '📌',
      color_hex: activeTheme.primary,
      bg_hex: activeTheme.surfaceElevated,
    };
    const durationHrs = ((item.end_time_minutes - item.start_time_minutes) / 60).toFixed(1);
    const isCompleted = item.status === 'completed';
    const isSkipped = item.status === 'skipped';

    // 1. Compact / List View Mode
    if (currentViewLayout === 'list' || currentViewLayout === 'small') {
      return (
        <View style={[styles.compactSlotRow, { borderLeftColor: cat.color_hex }, isCompleted && styles.slotCardCompleted]}>
          <View style={styles.compactTimeCol}>
            <Text style={styles.compactTimeText}>{formatMinutesTo12Hour(item.start_time_minutes)}</Text>
            <Text style={{ fontSize: 9, color: activeTheme.textSecondary }}>{durationHrs}h</Text>
          </View>

          <View style={styles.compactSubjectCol}>
            <Text style={styles.compactSubjectTitle} numberOfLines={1}>{item.subject_name}</Text>
            {showPreviewPane && item.topic ? (
              <Text style={styles.compactTopicText} numberOfLines={1}>{item.topic}</Text>
            ) : null}
          </View>

          {showDetailsPane && item.target_questions > 0 && (
            <View style={[styles.qTargetBadge, { marginHorizontal: 6 }]}>
              <Text style={styles.qTargetText}>🎯 {item.target_questions} Qs</Text>
            </View>
          )}

          <View style={styles.actionBtnGroup}>
            <TouchableOpacity
              style={[styles.statusBtn, isCompleted && styles.completedActiveBtn, { paddingHorizontal: 6, paddingVertical: 3 }]}
              onPress={() => handleUpdateStatus(item.slot_id, 'completed')}
            >
              <Text style={[styles.statusBtnText, isCompleted && styles.statusBtnTextActive, { fontSize: 9 }]}>
                {isCompleted ? '✓' : 'Done'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.deleteSlotBtn} onPress={() => handleDeleteSlot(item.slot_id)}>
              <Text style={styles.deleteSlotText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    // 2. Tiles / Medium / Grid View Mode
    if (currentViewLayout === 'tiles' || currentViewLayout === 'medium') {
      return (
        <View style={[styles.gridSlotCard, { borderTopColor: cat.color_hex }, isCompleted && styles.slotCardCompleted]}>
          <View style={styles.gridHeaderRow}>
            <Text style={[styles.typeBadgeText, { color: cat.color_hex }]}>{cat.icon} {cat.name}</Text>
            <Text style={styles.gridTimeText}>{formatMinutesTo12Hour(item.start_time_minutes)} ({durationHrs}h)</Text>
          </View>

          <Text style={styles.gridSubjectText} numberOfLines={1}>{item.subject_name}</Text>
          {showPreviewPane && item.topic ? (
            <Text style={styles.topicText} numberOfLines={1}>📌 {item.topic}</Text>
          ) : null}

          <View style={[styles.cardFooterRow, { paddingTop: 6, marginTop: 4 }]}>
            {showDetailsPane ? (
              <Text style={styles.qTargetText}>🎯 {item.target_questions || 0} Qs</Text>
            ) : <View />}

            <View style={styles.actionBtnGroup}>
              <TouchableOpacity
                style={[styles.statusBtn, isCompleted && styles.completedActiveBtn]}
                onPress={() => handleUpdateStatus(item.slot_id, 'completed')}
              >
                <Text style={[styles.statusBtnText, isCompleted && styles.statusBtnTextActive]}>
                  {isCompleted ? '✓ Done' : 'Done'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteSlotBtn} onPress={() => handleDeleteSlot(item.slot_id)}>
                <Text style={styles.deleteSlotText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    // 3. Large / Extra Large / Details Cards Mode (Default)
    return (
      <View style={[styles.slotCard, isCompleted && styles.slotCardCompleted]}>
        <View style={[styles.slotTypeAccent, { backgroundColor: cat.color_hex }]} />

        <View style={styles.slotBody}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.typeBadge, { backgroundColor: cat.bg_hex }]}>
              <Text style={[styles.typeBadgeText, { color: cat.color_hex }]}>
                {cat.icon} {cat.name}
              </Text>
            </View>
            <View style={styles.timeSpanGroup}>
              <Text style={styles.timeSpanText}>
                {formatMinutesTo12Hour(item.start_time_minutes)} - {formatMinutesTo12Hour(item.end_time_minutes)} ({durationHrs}h)
              </Text>
              <TouchableOpacity style={styles.deleteSlotBtn} onPress={() => handleDeleteSlot(item.slot_id)}>
                <Text style={styles.deleteSlotText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.subjectText}>{item.subject_name}</Text>
          {showPreviewPane && item.topic ? <Text style={styles.topicText}>📌 {item.topic}</Text> : null}

          <View style={styles.cardFooterRow}>
            {showDetailsPane ? (
              <View style={styles.qTargetBadge}>
                <Text style={styles.qTargetText}>🎯 Goal: {item.target_questions} Qs</Text>
              </View>
            ) : <View />}

            <View style={styles.actionBtnGroup}>
              <TouchableOpacity
                style={[styles.statusBtn, isCompleted && styles.completedActiveBtn]}
                onPress={() => handleUpdateStatus(item.slot_id, 'completed')}
              >
                <Text style={[styles.statusBtnText, isCompleted && styles.statusBtnTextActive]}>
                  {isCompleted ? '✓ Done' : 'Mark Done'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.statusBtn, isSkipped && styles.skippedActiveBtn]}
                onPress={() => handleUpdateStatus(item.slot_id, 'skipped')}
              >
                <Text style={[styles.statusBtnText, isSkipped && styles.statusBtnTextActive]}>
                  {isSkipped ? '✕ Missed' : 'Skip'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={currentThemeKey === 'light' ? 'dark-content' : 'light-content'} backgroundColor={activeTheme.headerBg} />

      <View style={[styles.mainLayout, isDesktop && styles.desktopLayout]}>
        {/* Top Header */}
        <View style={styles.topHeader}>
          <View style={styles.headerTopRow}>
            <View style={styles.titleContainer}>
              <Text style={styles.portalTitle} numberOfLines={1}>Student Timetable</Text>
            </View>

            <View style={styles.headerRightGroup}>
              <TouchableOpacity
                style={[styles.headerButton, currentUser && { borderColor: activeTheme.primary }]}
                onPress={() => setIsAuthModalOpen(true)}
              >
                <Text style={[styles.headerButtonText, currentUser && { color: activeTheme.primary, fontWeight: '700' }]}>
                  {currentUser ? `👤 @${currentUser.username || currentUser.name}` : '👤 Guest'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.headerButton} onPress={() => setIsNotifModalOpen(true)}>
                <Text style={styles.headerButtonText}>🔔 Alerts</Text>
                {notifEnabled && <View style={styles.notifStatusDot} />}
              </TouchableOpacity>

              <TouchableOpacity style={styles.headerButton} onPress={() => setIsThemeModalOpen(true)}>
                <Text style={styles.headerButtonText}>{activeTheme.icon}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.headerButton} onPress={handleCloudSync} disabled={isSyncing}>
                {isSyncing ? (
                  <ActivityIndicator size="small" color={activeTheme.textPrimary} />
                ) : (
                  <Text style={styles.headerButtonText}>Sync</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Exam Goal & Countdown */}
          <View style={styles.headerSubRow}>
            <TouchableOpacity style={styles.examTag} onPress={handleOpenGoalModal}>
              <Text style={styles.examTagText} numberOfLines={1}>{examName} ✏️</Text>
            </TouchableOpacity>
            <Text style={styles.countdownText} numberOfLines={1}>
              {daysLeft !== null ? `🎯 ${daysLeft} Days Left` : '🎯 Set Target Date'}
            </Text>
          </View>
        </View>

        {/* Real-time Metrics Card */}
        <View style={styles.metricsContainer}>
          <View style={styles.metricBox}>
            <Text style={styles.metricVal}>{metrics.completedHours}h / {metrics.plannedHours}h</Text>
            <Text style={styles.metricLabel}>Study Time</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricBox}>
            <Text style={[styles.metricVal, { color: metrics.completionRate >= 75 ? '#10B981' : '#F59E0B' }]}>
              {metrics.completionRate}%
            </Text>
            <Text style={styles.metricLabel}>Completion</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricBox}>
            <Text style={styles.metricVal}>{metrics.questionsCompleted}/{metrics.questionsTargeted}</Text>
            <Text style={styles.metricLabel}>Questions</Text>
          </View>
        </View>

        {/* 📅 FULL INTERACTIVE MONTH & WEEK CALENDAR */}
        <View style={styles.calendarCard}>
          <View style={styles.calendarNavRow}>
            <View style={styles.calendarNavControls}>
              <TouchableOpacity style={styles.calendarMonthArrowBtn} onPress={() => handleStepMonth(-1)}>
                <Text style={styles.calendarMonthArrowText}>◀</Text>
              </TouchableOpacity>
              <Text style={styles.calendarMonthLabel}>
                {MONTH_NAMES[viewMonth]} {viewYear}
              </Text>
              <TouchableOpacity style={styles.calendarMonthArrowBtn} onPress={() => handleStepMonth(1)}>
                <Text style={styles.calendarMonthArrowText}>▶</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.calendarRightActions}>
              <TouchableOpacity
                style={styles.calendarViewModeBtn}
                onPress={() => setCalendarViewMode((m) => (m === 'month' ? 'week' : 'month'))}
              >
                <Text style={styles.calendarViewModeText}>
                  {calendarViewMode === 'month' ? '↔ Strip' : '📅 Month'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.calendarTodayBtn}
                onPress={() => {
                  setSelectedDate(todayIso);
                  const [y, m] = todayIso.split('-').map(Number);
                  setViewYear(y);
                  setViewMonth(m - 1);
                }}
              >
                <Text style={styles.calendarTodayText}>Today</Text>
              </TouchableOpacity>
            </View>
          </View>

          {calendarViewMode === 'month' ? (
            <View>
              <View style={styles.monthWeekHeadersRow}>
                {DAYS.map((d) => (
                  <View key={d.short} style={styles.monthWeekHeaderCol}>
                    <Text style={styles.monthWeekHeaderText}>{d.short}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.monthGridRow}>
                {monthGridData.map((cell) => {
                  if (!cell.dayNum) {
                    return <View key={cell.key} style={styles.monthGridCell} />;
                  }
                  return (
                    <TouchableOpacity
                      key={cell.key}
                      style={[
                        styles.monthGridCell,
                        cell.isToday && styles.monthGridCellToday,
                        cell.isSelected && styles.monthGridCellSelected,
                      ]}
                      onPress={() => setSelectedDate(cell.iso)}
                    >
                      <Text
                        style={[
                          styles.monthGridCellText,
                          cell.isSelected && styles.monthGridCellTextSelected,
                        ]}
                      >
                        {cell.dayNum}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={styles.weekStripContainer}>
              {weekStripDays.map((d) => (
                <TouchableOpacity
                  key={d.iso}
                  style={[
                    styles.weekStripDayCard,
                    d.isSelected && { backgroundColor: activeTheme.primary, borderColor: activeTheme.primary },
                    d.isToday && !d.isSelected && { borderColor: activeTheme.primary, borderWidth: 1.5 },
                  ]}
                  onPress={() => setSelectedDate(d.iso)}
                >
                  <Text style={[styles.weekStripDayName, d.isSelected && { color: '#FFFFFF', fontWeight: '700' }]}>
                    {d.dayShort}
                  </Text>
                  <Text style={[styles.weekStripDayNum, d.isSelected && { color: '#FFFFFF', fontWeight: '800' }]}>
                    {d.dayNum}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Daily Schedule Navigation Banner */}
        <View style={styles.dayBannerCard}>
          <TouchableOpacity style={styles.dayBannerBtn} onPress={() => handleStepDay(-1)}>
            <Text style={styles.dayBannerBtnText}>◀ Prev</Text>
          </TouchableOpacity>

          <View>
            <Text style={styles.dayBannerTitle}>
              {DAYS[selectedDay - 1].full}, {selectedDateObj.getDate()} {MONTH_NAMES[selectedDateObj.getMonth()]}
            </Text>
            <Text style={styles.dayBannerSub}>
              {slots.length} Session(s) Scheduled
            </Text>
          </View>

          <TouchableOpacity style={styles.dayBannerBtn} onPress={() => handleStepDay(1)}>
            <Text style={styles.dayBannerBtnText}>Next ▶</Text>
          </TouchableOpacity>
        </View>

        {/* ⚡ Active Recall Revisions Due Today */}
        {revisionsDue.length > 0 && (
          <View style={styles.recallDueCard}>
            <View style={styles.recallDueHeader}>
              <Text style={styles.recallDueTitle}>⚡ ACTIVE RECALL DUE TODAY</Text>
              <Text style={styles.recallDueCount}>
                {revisionsDue.filter((r) => r.is_completed === 1).length}/{revisionsDue.length} Completed
              </Text>
            </View>

            {revisionsDue.map((rev) => {
              const isDone = rev.is_completed === 1;
              return (
                <TouchableOpacity
                  key={rev.id}
                  style={[styles.recallDueRow, isDone && { opacity: 0.65 }]}
                  onPress={() => handleToggleRevision(rev)}
                >
                  <View style={[styles.recallCheckbox, isDone && styles.recallCheckboxChecked]}>
                    {isDone && <Text style={styles.recallCheckmark}>✓</Text>}
                  </View>

                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.recallTopicText, isDone && styles.recallTopicDone]}>
                      {rev.topic}
                    </Text>
                    <Text style={styles.recallMetaText}>
                      {rev.subject_name} • Stage {rev.interval_stage} ({rev.interval_stage === 1 ? '48h recall' : rev.interval_stage === 2 ? '7d recall' : '21d recall'})
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Categories Rail & Filter Bar */}
        <View style={styles.categoryTrackerSection}>
          <View style={styles.categoryTrackerHeader}>
            <Text style={styles.categoryTrackerTitle}>Categories & Filters</Text>
            <TouchableOpacity
              style={styles.categoryTrackerAddBtn}
              onPress={() => {
                setNewCatName('');
                setIsMainCatModalOpen(true);
              }}
            >
              <Text style={styles.categoryTrackerAddText}>+ Add Category</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRailScroll}>
            <TouchableOpacity
              style={[styles.categoryPill, activeFilterCategory === 'ALL' && styles.categoryPillActive]}
              onPress={() => setActiveFilterCategory('ALL')}
            >
              <Text style={styles.categoryPillText}>⚡ All Sessions</Text>
              <View style={styles.categoryCountBadge}>
                <Text style={styles.categoryCountBadgeText}>{slots.length}</Text>
              </View>
            </TouchableOpacity>

            {categories.map((c) => {
              const count = categoryCounts[c.id] || 0;
              const isActive = activeFilterCategory === c.id;
              return (
                <View
                  key={c.id}
                  style={[styles.categoryPill, isActive && styles.categoryPillActive, isActive && { borderColor: c.color_hex }]}
                >
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
                    onPress={() => setActiveFilterCategory(c.id)}
                  >
                    <Text style={{ fontSize: 12 }}>{c.icon}</Text>
                    <Text style={[styles.categoryPillText, isActive && { color: c.color_hex }]}>{c.name}</Text>
                    <View style={[styles.categoryCountBadge, isActive && { backgroundColor: `${c.color_hex}25` }]}>
                      <Text style={[styles.categoryCountBadgeText, isActive && { color: c.color_hex }]}>{count}</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.catDeletePillBtn} onPress={() => handleDeleteCategory(c)}>
                    <Text style={styles.catDeletePillText}>✕</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        </View>

        {/* 🗂️ EXPLORER "SORT ⌵" & "VIEW ⌵" TOOLBAR */}
        <View style={styles.viewToolbarContainer}>
          <View style={styles.viewToolbarLeft}>
            {/* Sort ⌵ Dropdown Button */}
            <TouchableOpacity
              style={[styles.viewDropdownTriggerBtn, isSortMenuOpen && styles.viewDropdownTriggerBtnActive]}
              onPress={() => {
                setIsViewMenuOpen(false);
                setIsSortMenuOpen((prev) => !prev);
              }}
            >
              <Text style={styles.viewDropdownTriggerText}>Sort</Text>
              <Text style={styles.viewDropdownCaret}>▼</Text>
            </TouchableOpacity>

            {/* View ⌵ Dropdown Button */}
            <TouchableOpacity
              style={[styles.viewDropdownTriggerBtn, isViewMenuOpen && styles.viewDropdownTriggerBtnActive]}
              onPress={() => {
                setIsSortMenuOpen(false);
                setIsViewMenuOpen((prev) => !prev);
              }}
            >
              <Text style={{ fontSize: 12 }}>🔲</Text>
              <Text style={styles.viewDropdownTriggerText}>View</Text>
              <Text style={styles.viewDropdownCaret}>▼</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.viewCountLabel}>
            {sortedAndFilteredSlots.length} item(s)
          </Text>
        </View>

        {/* Study Stream */}
        <FlatList
          key={currentViewLayout === 'tiles' || currentViewLayout === 'medium' ? 'grid_2' : 'list_1'}
          numColumns={currentViewLayout === 'tiles' || currentViewLayout === 'medium' ? 2 : 1}
          columnWrapperStyle={currentViewLayout === 'tiles' || currentViewLayout === 'medium' ? styles.gridStreamRow : undefined}
          data={sortedAndFilteredSlots}
          keyExtractor={(item) => item.slot_id}
          contentContainerStyle={styles.streamContent}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>📝</Text>
              <Text style={styles.emptyTitle}>No sessions scheduled for this date</Text>
              <Text style={styles.emptySub}>
                Tap "+ Add Study Slot" below to schedule a session for {DAYS[selectedDay - 1].full}, {selectedDateObj.getDate()} {MONTH_NAMES[selectedDateObj.getMonth()]}.
              </Text>
            </View>
          }
          renderItem={renderSlotItem}
        />

        {/* Floating Add Trigger */}
        <TouchableOpacity style={styles.fabTrigger} onPress={() => setIsModalOpen(true)}>
          <Text style={styles.fabIcon}>+ Add Study Slot</Text>
        </TouchableOpacity>

        {/* 🔲 EXPLORER VIEW DROPDOWN MENU MODAL */}
        <Modal visible={isViewMenuOpen} transparent animationType="fade" onRequestClose={() => setIsViewMenuOpen(false)}>
          <TouchableOpacity style={styles.explorerMenuBackdrop} activeOpacity={1} onPress={() => setIsViewMenuOpen(false)}>
            <View style={[styles.explorerMenuCard, { marginLeft: 65 }]}>
              {/* Extra large icons */}
              <TouchableOpacity
                style={[styles.explorerMenuItem, currentViewLayout === 'extra_large' && styles.explorerMenuItemHover]}
                onPress={() => { setCurrentViewLayout('extra_large'); setIsViewMenuOpen(false); }}
              >
                <View style={styles.explorerBulletCol}>
                  {currentViewLayout === 'extra_large' && <Text style={styles.explorerBulletDot}>•</Text>}
                </View>
                <View style={styles.explorerMenuIconCol}>
                  <Text style={styles.explorerMenuIcon}>🔲</Text>
                </View>
                <Text style={styles.explorerMenuLabel}>Extra large icons</Text>
              </TouchableOpacity>

              {/* Large icons */}
              <TouchableOpacity
                style={[styles.explorerMenuItem, currentViewLayout === 'large' && styles.explorerMenuItemHover]}
                onPress={() => { setCurrentViewLayout('large'); setIsViewMenuOpen(false); }}
              >
                <View style={styles.explorerBulletCol}>
                  {currentViewLayout === 'large' && <Text style={styles.explorerBulletDot}>•</Text>}
                </View>
                <View style={styles.explorerMenuIconCol}>
                  <Text style={styles.explorerMenuIcon}>🔲</Text>
                </View>
                <Text style={styles.explorerMenuLabel}>Large icons</Text>
              </TouchableOpacity>

              {/* Medium icons */}
              <TouchableOpacity
                style={[styles.explorerMenuItem, currentViewLayout === 'medium' && styles.explorerMenuItemHover]}
                onPress={() => { setCurrentViewLayout('medium'); setIsViewMenuOpen(false); }}
              >
                <View style={styles.explorerBulletCol}>
                  {currentViewLayout === 'medium' && <Text style={styles.explorerBulletDot}>•</Text>}
                </View>
                <View style={styles.explorerMenuIconCol}>
                  <Text style={styles.explorerMenuIcon}>🔲</Text>
                </View>
                <Text style={styles.explorerMenuLabel}>Medium icons</Text>
              </TouchableOpacity>

              {/* Small icons */}
              <TouchableOpacity
                style={[styles.explorerMenuItem, currentViewLayout === 'small' && styles.explorerMenuItemHover]}
                onPress={() => { setCurrentViewLayout('small'); setIsViewMenuOpen(false); }}
              >
                <View style={styles.explorerBulletCol}>
                  {currentViewLayout === 'small' && <Text style={styles.explorerBulletDot}>•</Text>}
                </View>
                <View style={styles.explorerMenuIconCol}>
                  <Text style={styles.explorerMenuIcon}>⸬</Text>
                </View>
                <Text style={styles.explorerMenuLabel}>Small icons</Text>
              </TouchableOpacity>

              {/* List */}
              <TouchableOpacity
                style={[styles.explorerMenuItem, currentViewLayout === 'list' && styles.explorerMenuItemHover]}
                onPress={() => { setCurrentViewLayout('list'); setIsViewMenuOpen(false); }}
              >
                <View style={styles.explorerBulletCol}>
                  {currentViewLayout === 'list' && <Text style={styles.explorerBulletDot}>•</Text>}
                </View>
                <View style={styles.explorerMenuIconCol}>
                  <Text style={styles.explorerMenuIcon}>☰</Text>
                </View>
                <Text style={styles.explorerMenuLabel}>List</Text>
              </TouchableOpacity>

              {/* Details */}
              <TouchableOpacity
                style={[styles.explorerMenuItem, currentViewLayout === 'details' && styles.explorerMenuItemHover]}
                onPress={() => { setCurrentViewLayout('details'); setIsViewMenuOpen(false); }}
              >
                <View style={styles.explorerBulletCol}>
                  {currentViewLayout === 'details' && <Text style={styles.explorerBulletDot}>•</Text>}
                </View>
                <View style={styles.explorerMenuIconCol}>
                  <Text style={styles.explorerMenuIcon}>≡</Text>
                </View>
                <Text style={styles.explorerMenuLabel}>Details</Text>
              </TouchableOpacity>

              {/* Tiles */}
              <TouchableOpacity
                style={[styles.explorerMenuItem, currentViewLayout === 'tiles' && styles.explorerMenuItemHover]}
                onPress={() => { setCurrentViewLayout('tiles'); setIsViewMenuOpen(false); }}
              >
                <View style={styles.explorerBulletCol}>
                  {currentViewLayout === 'tiles' && <Text style={styles.explorerBulletDot}>•</Text>}
                </View>
                <View style={styles.explorerMenuIconCol}>
                  <Text style={styles.explorerMenuIcon}>⊞</Text>
                </View>
                <Text style={styles.explorerMenuLabel}>Tiles</Text>
              </TouchableOpacity>

              {/* Content */}
              <TouchableOpacity
                style={[styles.explorerMenuItem, currentViewLayout === 'content' && styles.explorerMenuItemHover]}
                onPress={() => { setCurrentViewLayout('content'); setIsViewMenuOpen(false); }}
              >
                <View style={styles.explorerBulletCol}>
                  {currentViewLayout === 'content' && <Text style={styles.explorerBulletDot}>•</Text>}
                </View>
                <View style={styles.explorerMenuIconCol}>
                  <Text style={styles.explorerMenuIcon}>⁝≡</Text>
                </View>
                <Text style={styles.explorerMenuLabel}>Content</Text>
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.explorerMenuDivider} />

              {/* Details pane toggle */}
              <TouchableOpacity
                style={styles.explorerMenuItem}
                onPress={() => setShowDetailsPane((prev) => !prev)}
              >
                <View style={styles.explorerBulletCol}>
                  {showDetailsPane && <Text style={styles.explorerBulletDot}>•</Text>}
                </View>
                <View style={styles.explorerMenuIconCol}>
                  <Text style={[styles.explorerMenuIcon, { color: '#38BDF8' }]}>◨</Text>
                </View>
                <Text style={styles.explorerMenuLabel}>Details pane</Text>
              </TouchableOpacity>

              {/* Preview pane toggle */}
              <TouchableOpacity
                style={styles.explorerMenuItem}
                onPress={() => setShowPreviewPane((prev) => !prev)}
              >
                <View style={styles.explorerBulletCol}>
                  {showPreviewPane && <Text style={styles.explorerBulletDot}>•</Text>}
                </View>
                <View style={styles.explorerMenuIconCol}>
                  <Text style={[styles.explorerMenuIcon, { color: '#38BDF8' }]}>◧</Text>
                </View>
                <Text style={styles.explorerMenuLabel}>Preview pane</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* ⇅ SORT DROPDOWN MENU MODAL */}
        <Modal visible={isSortMenuOpen} transparent animationType="fade" onRequestClose={() => setIsSortMenuOpen(false)}>
          <TouchableOpacity style={styles.explorerMenuBackdrop} activeOpacity={1} onPress={() => setIsSortMenuOpen(false)}>
            <View style={[styles.explorerMenuCard, { marginLeft: 12 }]}>
              {/* By Time */}
              <TouchableOpacity
                style={[styles.explorerMenuItem, currentSortOrder === 'time' && styles.explorerMenuItemHover]}
                onPress={() => { setCurrentSortOrder('time'); setIsSortMenuOpen(false); }}
              >
                <View style={styles.explorerBulletCol}>
                  {currentSortOrder === 'time' && <Text style={styles.explorerBulletDot}>•</Text>}
                </View>
                <View style={styles.explorerMenuIconCol}>
                  <Text style={styles.explorerMenuIcon}>⏰</Text>
                </View>
                <Text style={styles.explorerMenuLabel}>Time (Earliest first)</Text>
              </TouchableOpacity>

              {/* By Duration */}
              <TouchableOpacity
                style={[styles.explorerMenuItem, currentSortOrder === 'duration' && styles.explorerMenuItemHover]}
                onPress={() => { setCurrentSortOrder('duration'); setIsSortMenuOpen(false); }}
              >
                <View style={styles.explorerBulletCol}>
                  {currentSortOrder === 'duration' && <Text style={styles.explorerBulletDot}>•</Text>}
                </View>
                <View style={styles.explorerMenuIconCol}>
                  <Text style={styles.explorerMenuIcon}>⏳</Text>
                </View>
                <Text style={styles.explorerMenuLabel}>Duration (Longest first)</Text>
              </TouchableOpacity>

              {/* By Subject */}
              <TouchableOpacity
                style={[styles.explorerMenuItem, currentSortOrder === 'subject' && styles.explorerMenuItemHover]}
                onPress={() => { setCurrentSortOrder('subject'); setIsSortMenuOpen(false); }}
              >
                <View style={styles.explorerBulletCol}>
                  {currentSortOrder === 'subject' && <Text style={styles.explorerBulletDot}>•</Text>}
                </View>
                <View style={styles.explorerMenuIconCol}>
                  <Text style={styles.explorerMenuIcon}>🔤</Text>
                </View>
                <Text style={styles.explorerMenuLabel}>Subject (A - Z)</Text>
              </TouchableOpacity>

              {/* By Question Goals */}
              <TouchableOpacity
                style={[styles.explorerMenuItem, currentSortOrder === 'target' && styles.explorerMenuItemHover]}
                onPress={() => { setCurrentSortOrder('target'); setIsSortMenuOpen(false); }}
              >
                <View style={styles.explorerBulletCol}>
                  {currentSortOrder === 'target' && <Text style={styles.explorerBulletDot}>•</Text>}
                </View>
                <View style={styles.explorerMenuIconCol}>
                  <Text style={styles.explorerMenuIcon}>🎯</Text>
                </View>
                <Text style={styles.explorerMenuLabel}>Target Questions</Text>
              </TouchableOpacity>

              {/* By Status */}
              <TouchableOpacity
                style={[styles.explorerMenuItem, currentSortOrder === 'status' && styles.explorerMenuItemHover]}
                onPress={() => { setCurrentSortOrder('status'); setIsSortMenuOpen(false); }}
              >
                <View style={styles.explorerBulletCol}>
                  {currentSortOrder === 'status' && <Text style={styles.explorerBulletDot}>•</Text>}
                </View>
                <View style={styles.explorerMenuIconCol}>
                  <Text style={styles.explorerMenuIcon}>✓</Text>
                </View>
                <Text style={styles.explorerMenuLabel}>Status (Pending first)</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* 🧠 Spaced Repetition Modal Prompt */}
        <Modal visible={isRecallModalOpen} animationType="fade" transparent onRequestClose={() => setIsRecallModalOpen(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, isDesktop && { maxWidth: 440 }]}>
              <Text style={[styles.modalHeading, { textAlign: 'center' }]}>🧠 Schedule Active Recall?</Text>
              <Text style={[styles.modalSubheading, { textAlign: 'center', marginBottom: 12 }]}>
                Solidify <Text style={{ fontWeight: '700', color: activeTheme.textPrimary }}>"{recallPromptSlot?.topic || recallPromptSlot?.subject_name}"</Text> in long-term memory.
              </Text>

              <View style={styles.recallPreviewBox}>
                <Text style={styles.recallPreviewRow}>
                  • <Text style={{ fontWeight: '700', color: activeTheme.primary }}>Day +2</Text> ({addDaysToIso(selectedDate, 2)}): Rapid Concept Check
                </Text>
                <Text style={styles.recallPreviewRow}>
                  • <Text style={{ fontWeight: '700', color: activeTheme.primary }}>Day +7</Text> ({addDaysToIso(selectedDate, 7)}): PYQ & Problem Drill
                </Text>
                <Text style={styles.recallPreviewRow}>
                  • <Text style={{ fontWeight: '700', color: activeTheme.primary }}>Day +21</Text> ({addDaysToIso(selectedDate, 21)}): Comprehensive Recall
                </Text>
              </View>

              <View style={[styles.modalActionGroup, { marginTop: 16 }]}>
                <TouchableOpacity style={styles.abortBtn} onPress={() => setIsRecallModalOpen(false)}>
                  <Text style={styles.abortBtnText}>Maybe Later</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirmSpacedRepetition}>
                  <Text style={styles.confirmBtnText}>Schedule Recall</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Auth Modal */}
        <AuthModal
          visible={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          theme={activeTheme}
          onAuthSuccess={(user) => {
            setCurrentUser(user);
            refreshSlots();
            refreshRevisions();
          }}
        />

        {/* Notifications Modal */}
        <Modal visible={isNotifModalOpen} animationType="fade" transparent>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, isDesktop && { maxWidth: 460 }]}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.modalHeading}>🔔 Study Alarms & Reminders</Text>
                <Text style={styles.modalSubheading}>Lead-time focus alerts & post-session wrap-ups</Text>

                <View style={styles.notifToggleCard}>
                  <View>
                    <Text style={styles.notifToggleTitle}>Enable Study Notifications</Text>
                    <Text style={styles.notifToggleSubtitle}>Plays sound chime & fires desktop/mobile popups</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.notifSwitchBtn, notifEnabled && styles.notifSwitchBtnActive]}
                    onPress={() => setNotifEnabled(!notifEnabled)}
                  >
                    <Text style={styles.notifSwitchText}>{notifEnabled ? 'ON' : 'OFF'}</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.testAlarmBtn} onPress={handleTestNotification}>
                  <Text style={styles.testAlarmBtnText}>🔊 Test Sound & Notification Now</Text>
                </TouchableOpacity>

                <Text style={styles.fieldLabel}>Pre-Session Alert Lead Time</Text>
                <View style={styles.notifLeadPillsRow}>
                  {LEAD_TIME_OPTIONS.map((mins) => (
                    <TouchableOpacity
                      key={mins}
                      style={[styles.notifLeadPill, leadMinutes === mins && styles.notifLeadPillActive]}
                      onPress={() => setLeadMinutes(mins)}
                    >
                      <Text style={[styles.notifLeadPillText, leadMinutes === mins && styles.notifLeadPillTextActive]}>
                        {mins === 0 ? 'Exact Time' : `${mins}m prior`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={[styles.notifToggleCard, { marginTop: 6 }]}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.notifToggleTitle}>End-of-Session Review Check</Text>
                    <Text style={styles.notifToggleSubtitle}>Reminds you to log attendance when session finishes</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.notifSwitchBtn, enablePostSessionCheck && styles.notifSwitchBtnActive]}
                    onPress={() => setEnablePostSessionCheck(!enablePostSessionCheck)}
                  >
                    <Text style={styles.notifSwitchText}>{enablePostSessionCheck ? 'ON' : 'OFF'}</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.modalActionGroup}>
                  <TouchableOpacity style={styles.confirmBtn} onPress={() => setIsNotifModalOpen(false)}>
                    <Text style={styles.confirmBtnText}>Save & Close</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Goal Modal */}
        <Modal visible={isGoalModalOpen} animationType="fade" transparent>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, isDesktop && { maxWidth: 420 }]}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.modalHeading}>Exam Goal Setup</Text>
                <Text style={styles.modalSubheading}>Configure target exam and calculate countdown</Text>

                <Text style={styles.fieldLabel}>Exam Title</Text>
                <TextInput
                  placeholder="e.g. GATE CSE, UPSC Prelims"
                  placeholderTextColor={activeTheme.textMuted}
                  style={styles.textInput}
                  value={tempExamName}
                  onChangeText={setTempExamName}
                />

                <Text style={styles.fieldLabel}>Target Date (YYYY-MM-DD)</Text>
                <TextInput
                  placeholder="e.g. 2027-02-06"
                  placeholderTextColor={activeTheme.textMuted}
                  style={styles.textInput}
                  value={tempExamDate}
                  onChangeText={setTempExamDate}
                />

                <View style={styles.modalActionGroup}>
                  <TouchableOpacity style={styles.abortBtn} onPress={() => setIsGoalModalOpen(false)}>
                    <Text style={styles.abortBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={handleSaveGoal}>
                    <Text style={styles.confirmBtnText}>Save Target</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Theme Modal */}
        <Modal visible={isThemeModalOpen} animationType="fade" transparent>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, isDesktop && { maxWidth: 400 }]}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.modalHeading}>Select Interface Theme</Text>
                <Text style={styles.modalSubheading}>Choose a theme tuned for long study sessions</Text>

                <View style={styles.themeListRow}>
                  {(Object.keys(THEMES) as ThemeKey[]).map((key) => {
                    const item = THEMES[key];
                    const isCurrent = currentThemeKey === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[styles.themeOptionBtn, isCurrent && styles.themeOptionBtnActive]}
                        onPress={() => handleSelectTheme(key)}
                      >
                        <View style={styles.themeOptionLeft}>
                          <Text style={{ fontSize: 16 }}>{item.icon}</Text>
                          <Text style={styles.themeOptionTitle}>{item.name}</Text>
                        </View>
                        {isCurrent && <Text style={{ color: activeTheme.primary, fontWeight: '700', fontSize: 11 }}>Active</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.modalActionGroup}>
                  <TouchableOpacity style={styles.confirmBtn} onPress={() => setIsThemeModalOpen(false)}>
                    <Text style={styles.confirmBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Category Modal */}
        <Modal visible={isMainCatModalOpen} animationType="fade" transparent>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, isDesktop && { maxWidth: 420 }]}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.modalHeading}>Create Category</Text>
                <Text style={styles.modalSubheading}>Add a custom focus category</Text>

                <Text style={styles.fieldLabel}>Category Title</Text>
                <TextInput
                  placeholder="e.g. Answer Writing, Mock Analysis"
                  placeholderTextColor={activeTheme.textMuted}
                  style={styles.textInput}
                  value={newCatName}
                  onChangeText={setNewCatName}
                />

                <Text style={styles.fieldLabel}>Choose Badge Icon</Text>
                <View style={styles.emojiGrid}>
                  {EMOJI_PALETTE.map((emoji) => (
                    <TouchableOpacity
                      key={emoji}
                      style={[styles.emojiChoice, newCatEmoji === emoji && styles.emojiChoiceActive]}
                      onPress={() => setNewCatEmoji(emoji)}
                    >
                      <Text style={{ fontSize: 16 }}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.fieldLabel}>Choose Color</Text>
                <View style={styles.colorPaletteGrid}>
                  {COLOR_PALETTE.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.colorBall, { backgroundColor: c }, newCatColor === c && styles.colorBallActive]}
                      onPress={() => setNewCatColor(c)}
                    />
                  ))}
                </View>

                <View style={styles.modalActionGroup}>
                  <TouchableOpacity style={styles.abortBtn} onPress={() => setIsMainCatModalOpen(false)}>
                    <Text style={styles.abortBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={() => handleCreateCategory(false)}>
                    <Text style={styles.confirmBtnText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Add Study Slot Modal */}
        <Modal visible={isModalOpen} animationType="slide" transparent>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, isDesktop && { maxWidth: 500 }]}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.modalHeading}>Schedule Study Session</Text>
                <Text style={styles.modalSubheading}>
                  Target Date: {selectedDate} ({DAYS[selectedDay - 1].full})
                </Text>

                <Text style={styles.fieldLabel}>Schedule Frequency</Text>
                <View style={styles.frequencyToggleRow}>
                  <TouchableOpacity
                    style={[styles.frequencyPill, slotFrequency === 'specific_date' && styles.frequencyPillActive]}
                    onPress={() => setSlotFrequency('specific_date')}
                  >
                    <Text style={[styles.frequencyPillText, slotFrequency === 'specific_date' && styles.frequencyPillTextActive]}>
                      📌 Only on {selectedDate}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.frequencyPill, slotFrequency === 'weekly' && styles.frequencyPillActive]}
                    onPress={() => setSlotFrequency('weekly')}
                  >
                    <Text style={[styles.frequencyPillText, slotFrequency === 'weekly' && styles.frequencyPillTextActive]}>
                      🔄 Every {DAYS[selectedDay - 1].full}
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.fieldLabel}>Subject / Course</Text>
                <TextInput
                  placeholder="e.g. Operating Systems, Quantitative Aptitude"
                  placeholderTextColor={activeTheme.textMuted}
                  style={styles.textInput}
                  value={subjectName}
                  onChangeText={setSubjectName}
                />

                <Text style={styles.fieldLabel}>Topic / Target (Optional)</Text>
                <TextInput
                  placeholder="e.g. Process Sync, Normalization PYQs"
                  placeholderTextColor={activeTheme.textMuted}
                  style={styles.textInput}
                  value={topicName}
                  onChangeText={setTopicName}
                />

                <View style={styles.categoryLabelRow}>
                  <Text style={[styles.fieldLabel, { marginTop: 0, marginBottom: 0 }]}>Session Category</Text>
                  <TouchableOpacity onPress={() => setIsInlineCatCreatorOpen((prev) => !prev)}>
                    <Text style={styles.addCategoryLink}>
                      {isInlineCatCreatorOpen ? '− Hide Creator' : '+ New Category'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {isInlineCatCreatorOpen && (
                  <View style={styles.inlineCategoryBox}>
                    <View style={styles.inlineCategoryHeader}>
                      <Text style={styles.inlineCategoryTitle}>Create New Category</Text>
                      <TouchableOpacity onPress={() => setIsInlineCatCreatorOpen(false)}>
                        <Text style={styles.inlineCategoryClose}>✕</Text>
                      </TouchableOpacity>
                    </View>

                    <TextInput
                      placeholder="Category Title"
                      placeholderTextColor={activeTheme.textMuted}
                      style={[styles.textInput, { backgroundColor: activeTheme.surface }]}
                      value={newCatName}
                      onChangeText={setNewCatName}
                    />

                    <Text style={[styles.fieldLabel, { marginTop: 6 }]}>Choose Icon</Text>
                    <View style={styles.emojiGrid}>
                      {EMOJI_PALETTE.map((emoji) => (
                        <TouchableOpacity
                          key={emoji}
                          style={[styles.emojiChoice, newCatEmoji === emoji && styles.emojiChoiceActive]}
                          onPress={() => setNewCatEmoji(emoji)}
                        >
                          <Text style={{ fontSize: 15 }}>{emoji}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={[styles.fieldLabel, { marginTop: 6 }]}>Choose Color</Text>
                    <View style={styles.colorPaletteGrid}>
                      {COLOR_PALETTE.map((c) => (
                        <TouchableOpacity
                          key={c}
                          style={[styles.colorBall, { backgroundColor: c }, newCatColor === c && styles.colorBallActive]}
                          onPress={() => setNewCatColor(c)}
                        />
                      ))}
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
                      <TouchableOpacity
                        style={[styles.confirmBtn, { paddingVertical: 5, paddingHorizontal: 12 }]}
                        onPress={() => handleCreateCategory(true)}
                      >
                        <Text style={styles.confirmBtnText}>Add & Select</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                <View style={styles.typeSelectorRow}>
                  {categories.map((c) => {
                    const isSelected = selectedCategory === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[
                          styles.typeChoice,
                          isSelected && { backgroundColor: c.color_hex, borderColor: c.color_hex },
                        ]}
                        onPress={() => setSelectedCategory(c.id)}
                      >
                        <Text style={{ fontSize: 11 }}>{c.icon}</Text>
                        <Text style={[styles.typeChoiceText, { color: isSelected ? '#FFFFFF' : activeTheme.textSecondary }]}>
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Quick Routines</Text>
                <View style={styles.quickSlotsRow}>
                  {PRESET_ROUTINES.map((p) => (
                    <TouchableOpacity key={p.label} style={styles.quickSlotChip} onPress={() => handleApplyPreset(p)}>
                      <Text style={styles.quickSlotChipText}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Digital Watch Controls */}
                <View style={styles.dualWatchContainer}>
                  <View style={styles.watchCard}>
                    <View style={styles.watchHeader}>
                      <Text style={styles.watchHeaderTitle}>🟢 Start Watch</Text>
                    </View>

                    <View style={styles.watchBigDisplay}>
                      <View style={styles.watchDigitBlock}>
                        <Text style={styles.watchBigDigit}>{startHour.toString().padStart(2, '0')}</Text>
                      </View>
                      <Text style={styles.watchColon}>:</Text>
                      <View style={styles.watchDigitBlock}>
                        <Text style={styles.watchBigDigit}>{startMinute.toString().padStart(2, '0')}</Text>
                      </View>
                      <Text style={[styles.watchBigDigit, { fontSize: 13, color: activeTheme.primary, marginLeft: 3 }]}>
                        {startPeriod}
                      </Text>
                    </View>

                    <View style={styles.watchStepperRow}>
                      <View style={styles.stepperCol}>
                        <TouchableOpacity style={styles.stepperBtn} onPress={() => setStartHour((h) => stepHour(h, -1))}>
                          <Text style={styles.stepperBtnText}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.stepperValText}>{startHour}h</Text>
                        <TouchableOpacity style={styles.stepperBtn} onPress={() => setStartHour((h) => stepHour(h, 1))}>
                          <Text style={styles.stepperBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.stepperCol}>
                        <TouchableOpacity style={styles.stepperBtn} onPress={() => setStartMinute((m) => stepMinute(m, -1))}>
                          <Text style={styles.stepperBtnText}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.stepperValText}>{startMinute}m</Text>
                        <TouchableOpacity style={styles.stepperBtn} onPress={() => setStartMinute((m) => stepMinute(m, 1))}>
                          <Text style={styles.stepperBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity style={styles.ampmToggleBtn} onPress={() => setStartPeriod((p) => (p === 'AM' ? 'PM' : 'AM'))}>
                        <Text style={styles.ampmToggleText}>{startPeriod}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.watchCard}>
                    <View style={styles.watchHeader}>
                      <Text style={styles.watchHeaderTitle}>🔴 End Watch</Text>
                    </View>

                    <View style={styles.watchBigDisplay}>
                      <View style={styles.watchDigitBlock}>
                        <Text style={styles.watchBigDigit}>{endHour.toString().padStart(2, '0')}</Text>
                      </View>
                      <Text style={styles.watchColon}>:</Text>
                      <View style={styles.watchDigitBlock}>
                        <Text style={styles.watchBigDigit}>{endMinute.toString().padStart(2, '0')}</Text>
                      </View>
                      <Text style={[styles.watchBigDigit, { fontSize: 13, color: activeTheme.primary, marginLeft: 3 }]}>
                        {endPeriod}
                      </Text>
                    </View>

                    <View style={styles.watchStepperRow}>
                      <View style={styles.stepperCol}>
                        <TouchableOpacity style={styles.stepperBtn} onPress={() => setEndHour((h) => stepHour(h, -1))}>
                          <Text style={styles.stepperBtnText}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.stepperValText}>{endHour}h</Text>
                        <TouchableOpacity style={styles.stepperBtn} onPress={() => setEndHour((h) => stepHour(h, 1))}>
                          <Text style={styles.stepperBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.stepperCol}>
                        <TouchableOpacity style={styles.stepperBtn} onPress={() => setEndMinute((m) => stepMinute(m, -1))}>
                          <Text style={styles.stepperBtnText}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.stepperValText}>{endMinute}m</Text>
                        <TouchableOpacity style={styles.stepperBtn} onPress={() => setEndMinute((m) => stepMinute(m, 1))}>
                          <Text style={styles.stepperBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity style={styles.ampmToggleBtn} onPress={() => setEndPeriod((p) => (p === 'AM' ? 'PM' : 'AM'))}>
                        <Text style={styles.ampmToggleText}>{endPeriod}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* Target Questions Input */}
                <Text style={styles.fieldLabel}>Target Questions (Goal Count)</Text>
                <TextInput
                  keyboardType="numeric"
                  placeholder="e.g. 25"
                  placeholderTextColor={activeTheme.textMuted}
                  style={styles.textInput}
                  value={targetQuestions}
                  onChangeText={setTargetQuestions}
                />

                <View style={[styles.previewBanner, isTimeIntervalValid ? styles.previewBannerValid : styles.previewBannerInvalid]}>
                  <Text style={[styles.previewBannerText, { color: isTimeIntervalValid ? '#10B981' : '#EF4444' }]}>
                    {isTimeIntervalValid
                      ? `🕒 ${formatMinutesTo12Hour(calculatedStartMinutes)} → ${formatMinutesTo12Hour(calculatedEndMinutes)} (${durationHours}h)`
                      : '⚠️ End time must be later than start time'}
                  </Text>
                </View>

                <View style={styles.modalActionGroup}>
                  <TouchableOpacity style={styles.abortBtn} onPress={() => setIsModalOpen(false)}>
                    <Text style={styles.abortBtnText}>Dismiss</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.confirmBtn, !isTimeIntervalValid && styles.confirmBtnDisabled]}
                    onPress={handleCreateSlot}
                    disabled={!isTimeIntervalValid}
                  >
                    <Text style={styles.confirmBtnText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Custom Dialog */}
        <Modal visible={dialog.visible} animationType="fade" transparent onRequestClose={closeDialog}>
          <View style={styles.customDialogOverlay}>
            <View style={styles.customDialogCard}>
              <Text style={styles.customDialogTitle}>{dialog.title}</Text>
              <Text style={styles.customDialogMessage}>{dialog.message}</Text>

              <View style={styles.customDialogBtnGroup}>
                {dialog.isConfirm && (
                  <TouchableOpacity style={styles.customDialogCancelBtn} onPress={closeDialog}>
                    <Text style={styles.customDialogCancelText}>{dialog.cancelText || 'Cancel'}</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.customDialogConfirmBtn, dialog.isDanger && styles.customDialogDangerBtn]}
                  onPress={() => {
                    closeDialog();
                    if (dialog.onConfirm) dialog.onConfirm();
                  }}
                >
                  <Text style={styles.customDialogConfirmText}>
                    {dialog.isConfirm ? dialog.confirmText || 'Confirm' : 'OK'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}