// mobile/App.tsx
import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  Modal,
  TextInput,
  StatusBar,
  ScrollView,
  useWindowDimensions,
  Alert,
} from 'react-native';
import {
  db,
  initLocalDatabase,
  GUEST_USER_ID,
} from './src/db/client';
import { THEMES, ThemeKey } from './src/theme/themes';
import { getAppStyles } from './src/styles/appStyles';
import { authService, AuthUser } from './src/services/authService';
import { AuthModal } from './src/components/AuthModal';
import { dispatchNotification } from './src/services/notificationService';

type NavScreen = 'Timeline' | 'Grid' | 'Focus Timer';

interface SchedulePeriod {
  id: string;
  label: string;
  start_time: string;
  end_time: string;
  start_minutes: number;
  end_minutes: number;
}

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
  day_of_week: number;
  status: 'completed' | 'skipped' | null;
}

const DEFAULT_PERIODS: SchedulePeriod[] = [
  { id: 'p1', label: 'Period 1', start_time: '08:30', end_time: '09:15', start_minutes: 510, end_minutes: 555 },
  { id: 'p2', label: 'Period 2', start_time: '09:30', end_time: '10:15', start_minutes: 570, end_minutes: 615 },
  { id: 'p3', label: 'Period 3', start_time: '10:30', end_time: '11:15', start_minutes: 630, end_minutes: 675 },
  { id: 'p4', label: 'Period 4', start_time: '11:30', end_time: '12:15', start_minutes: 690, end_minutes: 735 },
  { id: 'p5', label: 'Period 5', start_time: '12:30', end_time: '13:15', start_minutes: 750, end_minutes: 795 },
  { id: 'p6', label: 'Period 6', start_time: '13:30', end_time: '14:15', start_minutes: 810, end_minutes: 855 },
  { id: 'p7', label: 'Period 7', start_time: '14:30', end_time: '15:15', start_minutes: 870, end_minutes: 915 },
];

// Smart Timetable Official Color Palette (from smart-timetable.app)
const SMART_COLORS = [
  '#E11D48', // 1. Maths (Crimson Rose)
  '#F97316', // 2. Physics (Tangerine Orange)
  '#EAB308', // 3. Geography (Sunny Amber)
  '#16A34A', // 4. Chemistry (Emerald Green)
  '#0D9488', // 5. Biology (Ocean Teal)
  '#2563EB', // 6. English (Cobalt Blue)
  '#8B5CF6', // 7. History (Royal Purple)
  '#EC4899', // 8. Literature (Bubblegum Pink)
];

const WEEKDAYS = [
  { id: 1, name: 'Monday', short: 'Mon' },
  { id: 2, name: 'Tuesday', short: 'Tue' },
  { id: 3, name: 'Wednesday', short: 'Wed' },
  { id: 4, name: 'Thursday', short: 'Thu' },
  { id: 5, name: 'Friday', short: 'Fri' },
  { id: 6, name: 'Saturday', short: 'Sat' },
  { id: 7, name: 'Sunday', short: 'Sun' },
];

function formatIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function App() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  // Active Screen & Theme
  const [activeScreen, setActiveScreen] = useState<NavScreen>('Grid'); // Opens directly to Timetable Grid!
  const [currentThemeKey, setCurrentThemeKey] = useState<ThemeKey>('smartDark');
  const activeTheme = THEMES[currentThemeKey];
  const styles = useMemo(() => getAppStyles(activeTheme, isDesktop), [activeTheme, isDesktop]);

  // Auth State
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(authService.getCurrentUser());
  const activeUserId = currentUser ? currentUser.id : GUEST_USER_ID;
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Date State
  const todayIso = useMemo(() => formatIso(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);

  const selectedDateObj = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [selectedDate]);

  const selectedDay = useMemo(() => {
    const d = selectedDateObj.getDay();
    return d === 0 ? 7 : d;
  }, [selectedDateObj]);

  // Schedule Grid States (image_728c49.png)
  const [scheduleTitle, setScheduleTitle] = useState('Weekly Schedule');
  const [hideWeekends, setHideWeekends] = useState(false);
  const [periods, setPeriods] = useState<SchedulePeriod[]>(DEFAULT_PERIODS);

  // Add Class Modal States (image_728c8d.png)
  const [isAddClassOpen, setIsAddClassOpen] = useState(false);
  const [targetPeriod, setTargetPeriod] = useState<SchedulePeriod | null>(null);
  const [classNameInput, setClassNameInput] = useState('');
  const [classDescInput, setClassDescInput] = useState('');
  const [selectedColor, setSelectedColor] = useState(SMART_COLORS[0]);
  const [selectedDays, setSelectedDays] = useState<number[]>([1]);

  // Edit Period Modal States (image_728d08.png)
  const [isEditPeriodOpen, setIsEditPeriodOpen] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<SchedulePeriod | null>(null);
  const [editLabelInput, setEditLabelInput] = useState('');
  const [editStartTimeInput, setEditStartTimeInput] = useState('10:00');
  const [editEndTimeInput, setEditEndTimeInput] = useState('11:00');

  // Database Slots
  const [slots, setSlots] = useState<ExamSlotItem[]>([]);

  // Focus Timer States
  const [pomoSecondsLeft, setPomoSecondsLeft] = useState(25 * 60);
  const [isPomoRunning, setIsPomoRunning] = useState(false);
  const pomoTimerRef = useRef<any>(null);

  useEffect(() => {
    initLocalDatabase();
    refreshSlots();
  }, [activeUserId]);

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
          t.day_of_week,
          a.status
        FROM timetable_slots t
        LEFT JOIN subjects s ON t.subject_id = s.id
        LEFT JOIN attendance_records a ON a.slot_id = t.id AND a.date = ? AND a.is_deleted = 0
        WHERE t.user_id = ? AND t.is_deleted = 0
        ORDER BY t.start_time_minutes ASC;`,
        [todayIso, activeUserId]
      );
      setSlots(rows);
    } catch {
      setSlots([]);
    }
  };

  // Slots for the Smart Timetable daily timeline
  const todayTimelineSlots = useMemo(() => {
    return slots.filter((s) => s.day_of_week === selectedDay);
  }, [slots, selectedDay]);

  // Open "Add New Class" modal for specific cell (+)
  const handleOpenCellPlus = (period: SchedulePeriod, dayId: number) => {
    setTargetPeriod(period);
    setSelectedDays([dayId]);
    setClassNameInput('');
    setClassDescInput('');
    setSelectedColor(SMART_COLORS[(dayId - 1) % SMART_COLORS.length]);
    setIsAddClassOpen(true);
  };

  const toggleDaySelection = (dayId: number) => {
    setSelectedDays((prev) =>
      prev.includes(dayId) ? prev.filter((d) => d !== dayId) : [...prev, dayId]
    );
  };

  // Save Class into SQLite and Grid
  const handleSaveClass = () => {
    if (!classNameInput.trim()) {
      Alert.alert('Subject Required', 'Please enter a subject name (e.g. Mathematics).');
      return;
    }
    if (!targetPeriod) {
      Alert.alert('Period Required', 'Please select a valid time period.');
      return;
    }
    if (selectedDays.length === 0) {
      Alert.alert('Day Required', 'Please select at least one day in "Apply to Days".');
      return;
    }

    const now = Date.now();
    const subId = `sub_${Date.now()}`;

    db.withTransactionSync(() => {
      // 1. Insert Subject
      db.runSync(
        `INSERT INTO subjects (id, user_id, name, room_number, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);`,
        [subId, activeUserId, classNameInput.trim(), classDescInput.trim(), now, now]
      );

      // 2. Insert Timetable Slot for each chosen day (12 aligned placeholders and values)
      selectedDays.forEach((dayNum) => {
        const slotId = `slot_${Date.now()}_d${dayNum}_${Math.random().toString(36).substring(2, 6)}`;
        db.runSync(
          `INSERT INTO timetable_slots (
            id, user_id, subject_id, day_of_week, specific_date,
            start_time_minutes, end_time_minutes, slot_type, topic,
            target_questions, created_at, updated_at, is_deleted
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0);`,
          [
            slotId,
            activeUserId,
            subId,
            dayNum,
            null, // specific_date is null for recurring weekly routine
            targetPeriod.start_minutes,
            targetPeriod.end_minutes,
            selectedColor,
            classDescInput.trim(),
            15,
            now,
            now,
          ]
        );
      });
    });

    setIsAddClassOpen(false);
    refreshSlots();
    dispatchNotification('✅ Class Scheduled', `"${classNameInput.trim()}" added to ${selectedDays.length} day(s)!`);
  };

  const handleOpenEditPeriod = (p: SchedulePeriod) => {
    setEditingPeriod(p);
    setEditLabelInput(p.label);
    setEditStartTimeInput(p.start_time);
    setEditEndTimeInput(p.end_time);
    setIsEditPeriodOpen(true);
  };

  const handleSavePeriodChanges = () => {
    if (!editingPeriod || !editLabelInput.trim()) return;

    const [sh, sm] = editStartTimeInput.split(':').map((v) => parseInt(v, 10) || 0);
    const [eh, em] = editEndTimeInput.split(':').map((v) => parseInt(v, 10) || 0);
    const sMinutes = sh * 60 + sm;
    const eMinutes = eh * 60 + em;

    setPeriods((prev) =>
      prev.map((p) =>
        p.id === editingPeriod.id
          ? {
              ...p,
              label: editLabelInput.trim(),
              start_time: editStartTimeInput,
              end_time: editEndTimeInput,
              start_minutes: sMinutes,
              end_minutes: eMinutes,
            }
          : p
      )
    );

    setIsEditPeriodOpen(false);
  };

  const handleDeletePeriod = (periodId: string) => {
    setPeriods((prev) => prev.filter((p) => p.id !== periodId));
  };

  const handleAddExtraPeriod = () => {
    const nextIdx = periods.length + 1;
    const lastP = periods[periods.length - 1];
    const newStartM = lastP ? lastP.end_minutes : 510;
    const newEndM = newStartM + 45;

    const sh = String(Math.floor(newStartM / 60)).padStart(2, '0');
    const sm = String(newStartM % 60).padStart(2, '0');
    const eh = String(Math.floor(newEndM / 60)).padStart(2, '0');
    const em = String(newEndM % 60).padStart(2, '0');

    const newP: SchedulePeriod = {
      id: `p_${Date.now()}`,
      label: `Period ${nextIdx}`,
      start_time: `${sh}:${sm}`,
      end_time: `${eh}:${em}`,
      start_minutes: newStartM,
      end_minutes: newEndM,
    };
    setPeriods([...periods, newP]);
  };

  // Load Sample Schedule Matching smart-timetable.app!
  const handleLoadSample = () => {
    const samples = [
      { name: 'Maths', desc: 'Pythagoras', color: '#E11D48', day: 1, pIdx: 0 },
      { name: 'Physics', desc: 'Nikola Tesla', color: '#F97316', day: 1, pIdx: 1 },
      { name: 'Geography', desc: 'Fernand Magellan', color: '#EAB308', day: 1, pIdx: 2 },
      { name: 'Chemistry', desc: 'Dmitriy Mendeleev', color: '#16A34A', day: 1, pIdx: 3 },
      { name: 'Biology', desc: 'Charles Darwin', color: '#0D9488', day: 1, pIdx: 4 },
      { name: 'Maths', desc: 'Pythagoras', color: '#2563EB', day: 1, pIdx: 5 },
    ];

    const now = Date.now();
    db.withTransactionSync(() => {
      samples.forEach((item, idx) => {
        const period = periods[item.pIdx] || periods[0];
        const subId = `sub_smart_${idx}_${Date.now()}`;
        db.runSync(`INSERT INTO subjects (id, user_id, name, room_number, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);`, [
          subId, activeUserId, item.name, item.desc, now, now
        ]);
        db.runSync(
          `INSERT INTO timetable_slots (
            id, user_id, subject_id, day_of_week, specific_date,
            start_time_minutes, end_time_minutes, slot_type, topic,
            target_questions, created_at, updated_at, is_deleted
          ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 15, ?, ?, 0);`,
          [
            `slot_smart_${idx}_${Date.now()}`,
            activeUserId,
            subId,
            item.day,
            period.start_minutes,
            period.end_minutes,
            item.color,
            item.desc,
            now,
            now,
          ]
        );
      });
    });

    refreshSlots();
    Alert.alert('Smart Timetable Loaded', 'Loaded the sample schedule from smart-timetable.app!');
  };

  const visibleWeekdays = useMemo(() => {
    return hideWeekends ? WEEKDAYS.filter((d) => d.id <= 5) : WEEKDAYS;
  }, [hideWeekends]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={currentThemeKey === 'smartLight' ? 'dark-content' : 'light-content'} backgroundColor={styles.sidebar.backgroundColor} />

      <View style={styles.rootContainer}>
        {/* ========================================================= */}
        {/* 1. SIDEBAR (Navigation Drawer)                            */}
        {/* ========================================================= */}
        <View style={styles.sidebar}>
          <View>
            <View style={styles.sidebarLogoRow}>
              <Text style={styles.sidebarLogoText}>⚡ Smart Timetable</Text>
            </View>

            <Text style={styles.sidebarSectionTitle}>VIEWS</Text>
            <TouchableOpacity
              style={[styles.sidebarNavItem, activeScreen === 'Grid' && styles.sidebarNavItemActive]}
              onPress={() => setActiveScreen('Grid')}
            >
              <Text style={[styles.sidebarNavIcon, activeScreen === 'Grid' && styles.sidebarNavIconActive]}>📊</Text>
              <Text style={[styles.sidebarNavLabel, activeScreen === 'Grid' && styles.sidebarNavLabelActive]}>Weekly Grid</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sidebarNavItem, activeScreen === 'Timeline' && styles.sidebarNavItemActive]}
              onPress={() => setActiveScreen('Timeline')}
            >
              <Text style={[styles.sidebarNavIcon, activeScreen === 'Timeline' && styles.sidebarNavIconActive]}>🌈</Text>
              <Text style={[styles.sidebarNavLabel, activeScreen === 'Timeline' && styles.sidebarNavLabelActive]}>Daily Timeline</Text>
            </TouchableOpacity>

            <Text style={styles.sidebarSectionTitle}>TOOLS</Text>
            <TouchableOpacity
              style={[styles.sidebarNavItem, activeScreen === 'Focus Timer' && styles.sidebarNavItemActive]}
              onPress={() => setActiveScreen('Focus Timer')}
            >
              <Text style={[styles.sidebarNavIcon, activeScreen === 'Focus Timer' && styles.sidebarNavIconActive]}>⏱️</Text>
              <Text style={[styles.sidebarNavLabel, activeScreen === 'Focus Timer' && styles.sidebarNavLabelActive]}>Focus Timer</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sidebarAddBtn}
              onPress={() => {
                if (periods.length > 0) handleOpenCellPlus(periods[0], selectedDay);
              }}
            >
              <Text style={styles.sidebarAddBtnText}>+ Add Class</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sidebarFooter}>
            <View style={styles.sidebarToggleRow}>
              <Text style={styles.sidebarToggleLabel}>Theme</Text>
              <TouchableOpacity onPress={() => setCurrentThemeKey(currentThemeKey === 'smartLight' ? 'smartDark' : 'smartLight')}>
                <Text style={{ fontSize: 16 }}>{currentThemeKey === 'smartLight' ? '☀️' : '🌙'}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={{ paddingHorizontal: 6 }} onPress={() => setIsAuthModalOpen(true)}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: activeTheme.primary }}>
                {currentUser ? `👤 @${currentUser.username}` : '👤 Sign In / Guest'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ========================================================= */}
        {/* 2. MAIN CONTENT AREA                                      */}
        {/* ========================================================= */}
        <View style={styles.mainContent}>
          {/* ========================================================= */}
          {/* SCREEN: SCHEDULE GENERATOR GRID (image_728c49.png)        */}
          {/* ========================================================= */}
          {activeScreen === 'Grid' && (
            <ScrollView style={styles.generatorRoot} showsVerticalScrollIndicator={false}>
              <View style={styles.generatorTopRow}>
                <TextInput
                  style={styles.generatorTitleInput}
                  value={scheduleTitle}
                  onChangeText={setScheduleTitle}
                  placeholder="Weekly Schedule"
                  placeholderTextColor={activeTheme.textMuted}
                />

                <View style={styles.generatorActionsGroup}>
                  <TouchableOpacity style={styles.genBtnDark} onPress={handleLoadSample}>
                    <Text style={styles.genBtnDarkText}>Load Sample</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.genBtnDark} onPress={() => setHideWeekends(!hideWeekends)}>
                    <Text style={styles.genBtnDarkText}>
                      📅 {hideWeekends ? 'Show Weekends' : 'Hide Weekends'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.genBtnDanger}
                    onPress={() => {
                      db.runSync(`DELETE FROM timetable_slots WHERE user_id = ?;`, [activeUserId]);
                      refreshSlots();
                    }}
                  >
                    <Text style={styles.genBtnDangerText}>Clear All</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.genBtnPrimary}
                    onPress={() => Alert.alert('Saved', 'Your schedule is synced and saved.')}
                  >
                    <Text style={styles.genBtnPrimaryText}>💾 Download PDF</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.generatorSubNotice}>
                Click any cell to add or edit classes. Your timetable is automatically saved.
              </Text>

              {/* Scrollable Matrix Grid */}
              <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                <View style={styles.scheduleTableCard}>
                  {/* Header Row */}
                  <View style={styles.scheduleTableHeaderRow}>
                    <View style={styles.scheduleTimeHeaderCol}>
                      <Text style={styles.scheduleTimeHeaderText}>⏰ Time</Text>
                    </View>
                    {visibleWeekdays.map((day) => (
                      <View key={day.id} style={styles.scheduleDayHeaderCol}>
                        <Text style={styles.scheduleDayHeaderText}>{day.name}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Period Rows */}
                  {periods.map((period) => (
                    <View key={period.id} style={styles.scheduleTableRow}>
                      <View style={styles.scheduleTimeInfoCol}>
                        <View style={styles.schedulePeriodLabelRow}>
                          <Text style={styles.schedulePeriodTitle}>{period.label}</Text>
                          <View style={styles.periodActionIcons}>
                            <TouchableOpacity style={styles.periodIconBtn} onPress={() => handleOpenEditPeriod(period)}>
                              <Text style={styles.periodIconText}>✏️</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.periodIconBtn} onPress={() => handleDeletePeriod(period.id)}>
                              <Text style={styles.periodIconText}>🗑️</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        <Text style={styles.schedulePeriodRange}>{period.start_time} - {period.end_time}</Text>
                      </View>

                      {/* Day Cells with Clickable "+" */}
                      {visibleWeekdays.map((day) => {
                        const matchingSlot = slots.find(
                          (s) => s.day_of_week === day.id && s.start_time_minutes === period.start_minutes
                        );

                        return (
                          <View key={day.id} style={styles.scheduleCell}>
                            {matchingSlot ? (
                              <TouchableOpacity
                                style={[
                                  styles.scheduleClassBadge,
                                  { backgroundColor: matchingSlot.slot_type.startsWith('#') ? matchingSlot.slot_type : '#2563EB' },
                                ]}
                                onPress={() => {
                                  Alert.alert(
                                    matchingSlot.subject_name,
                                    `${matchingSlot.topic || 'No extra notes'}\nTime: ${period.start_time} - ${period.end_time}`,
                                    [
                                      { text: 'OK' },
                                      {
                                        text: 'Remove',
                                        style: 'destructive',
                                        onPress: () => {
                                          db.runSync(`DELETE FROM timetable_slots WHERE id = ?;`, [matchingSlot.slot_id]);
                                          refreshSlots();
                                        },
                                      },
                                    ]
                                  );
                                }}
                              >
                                <Text
                                  style={[
                                    styles.scheduleClassTitle,
                                    { color: matchingSlot.slot_type === '#EAB308' ? '#0F172A' : '#FFFFFF' },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {matchingSlot.subject_name}
                                </Text>
                                {matchingSlot.topic ? (
                                  <Text
                                    style={[
                                      styles.scheduleClassDesc,
                                      { color: matchingSlot.slot_type === '#EAB308' ? '#334155' : 'rgba(255, 255, 255, 0.85)' },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {matchingSlot.topic}
                                  </Text>
                                ) : null}
                              </TouchableOpacity>
                            ) : (
                              <TouchableOpacity
                                style={styles.scheduleCellPlusBtn}
                                onPress={() => handleOpenCellPlus(period, day.id)}
                              >
                                <Text style={styles.scheduleCellPlusText}>+</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  ))}

                  {/* + Add Time Slot Row */}
                  <View style={styles.addTimeSlotRow}>
                    <TouchableOpacity style={styles.addTimeSlotBtn} onPress={handleAddExtraPeriod}>
                      <Text style={{ fontSize: 13 }}>+</Text>
                      <Text style={styles.addTimeSlotBtnText}>Add Time Slot</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            </ScrollView>
          )}

          {/* ========================================================= */}
          {/* SCREEN: SMART TIMETABLE RAINBOW VIEW (image_72eafe.png)   */}
          {/* ========================================================= */}
          {activeScreen === 'Timeline' && (
            <View style={{ flex: 1 }}>
              <View style={styles.topToolbar}>
                <View style={styles.dateNavigatorPill}>
                  <TouchableOpacity
                    style={styles.dateNavArrowBtn}
                    onPress={() => setSelectedDate(formatIso(new Date(selectedDateObj.getTime() - 86400000)))}
                  >
                    <Text style={styles.dateNavArrowText}>‹</Text>
                  </TouchableOpacity>
                  <Text style={styles.dateNavTitleText}>
                    {WEEKDAYS[selectedDay - 1].name} ({selectedDate})
                  </Text>
                  <TouchableOpacity
                    style={styles.dateNavArrowBtn}
                    onPress={() => setSelectedDate(formatIso(new Date(selectedDateObj.getTime() + 86400000)))}
                  >
                    <Text style={styles.dateNavArrowText}>›</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.viewControlsGroup}>
                  <TouchableOpacity style={styles.todayPillBtn} onPress={handleLoadSample}>
                    <Text style={styles.todayPillBtnText}>⚡ Load Demo Classes</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.todayPillBtn} onPress={() => setSelectedDate(todayIso)}>
                    <Text style={styles.todayPillBtnText}>Today</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView style={styles.smartTimelineList} showsVerticalScrollIndicator={false}>
                {todayTimelineSlots.length === 0 ? (
                  <View style={{ padding: 40, alignItems: 'center' }}>
                    <Text style={{ fontSize: 32, marginBottom: 8 }}>📚</Text>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: activeTheme.textPrimary }}>
                      No classes for {WEEKDAYS[selectedDay - 1].name}
                    </Text>
                    <Text style={{ fontSize: 12, color: activeTheme.textSecondary, marginTop: 4, textAlign: 'center' }}>
                      Tap "+ Add Class" or tap "Weekly Grid" to build your schedule!
                    </Text>
                  </View>
                ) : (
                  todayTimelineSlots.map((slot, idx) => {
                    const cardBg = slot.slot_type.startsWith('#') ? slot.slot_type : SMART_COLORS[idx % SMART_COLORS.length];
                    const isYellow = cardBg === '#EAB308' || cardBg === '#FACC15';
                    const textColor = isYellow ? '#0F172A' : '#FFFFFF';

                    const sh = String(Math.floor(slot.start_time_minutes / 60)).padStart(2, '0');
                    const sm = String(slot.start_time_minutes % 60).padStart(2, '0');
                    const eh = String(Math.floor(slot.end_time_minutes / 60)).padStart(2, '0');
                    const em = String(slot.end_time_minutes % 60).padStart(2, '0');

                    return (
                      <View key={slot.slot_id} style={[styles.smartClassCard, { backgroundColor: cardBg }]}>
                        <View style={styles.smartClassIndexCol}>
                          <Text style={[styles.smartClassIndexText, { color: textColor }]}>{idx + 1}</Text>
                        </View>

                        <View style={styles.smartClassTimeCol}>
                          <Text style={[styles.smartClassTimeText, { color: textColor }]}>{sh}:{sm}</Text>
                          <Text style={[styles.smartClassTimeText, { color: textColor }]}>{eh}:{em}</Text>
                        </View>

                        <View style={styles.smartClassContentCol}>
                          <Text style={[styles.smartClassTitleText, { color: textColor }]}>{slot.subject_name}</Text>
                          <Text style={[styles.smartClassSubtitleText, { color: textColor }]} numberOfLines={1}>
                            {slot.topic || 'Classroom'}
                          </Text>
                        </View>

                        <View style={[styles.smartBadgePill, isYellow && { backgroundColor: 'rgba(0, 0, 0, 0.12)', borderColor: 'rgba(0, 0, 0, 0.2)' }]}>
                          <Text style={[styles.smartBadgeText, { color: textColor }]}>
                            {idx === 0 ? '27:19' : idx === 1 ? 'Next' : '✓ Done'}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          )}

          {/* SCREEN: FOCUS TIMER */}
          {activeScreen === 'Focus Timer' && (
            <View style={styles.pomodoroContainer}>
              <Text style={styles.pomodoroTimerText}>
                {Math.floor(pomoSecondsLeft / 60).toString().padStart(2, '0')}:{(pomoSecondsLeft % 60).toString().padStart(2, '0')}
              </Text>
              <TouchableOpacity
                style={styles.pomodoroStartBtn}
                onPress={() => setIsPomoRunning(!isPomoRunning)}
              >
                <Text style={styles.pomodoroStartBtnText}>{isPomoRunning ? 'PAUSE' : 'START'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* ========================================================= */}
      {/* 3. MODAL: ADD NEW CLASS (image_728c8d.png)                 */}
      {/* ========================================================= */}
      <Modal visible={isAddClassOpen} transparent animationType="fade" onRequestClose={() => setIsAddClassOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.classModalCard}>
            <View style={styles.classModalHeaderRow}>
              <Text style={styles.classModalTitle}>+ Add New Class</Text>
              <TouchableOpacity style={styles.classModalCloseBtn} onPress={() => setIsAddClassOpen(false)}>
                <Text style={styles.classModalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.formLabel}>Subject *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g., Mathematics"
              placeholderTextColor={activeTheme.textMuted}
              value={classNameInput}
              onChangeText={setClassNameInput}
            />

            <Text style={styles.formLabel}>Description</Text>
            <TextInput
              style={[styles.textInput, { height: 60, textAlignVertical: 'top' }]}
              placeholder="Additional details..."
              placeholderTextColor={activeTheme.textMuted}
              multiline
              value={classDescInput}
              onChangeText={setClassDescInput}
            />

            {/* Smart Timetable Color Palette */}
            <Text style={styles.formLabel}>🎨 Color</Text>
            <View style={styles.colorPickerRow}>
              {SMART_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorCircle, { backgroundColor: c }, selectedColor === c && styles.colorCircleSelected]}
                  onPress={() => setSelectedColor(c)}
                />
              ))}
            </View>

            {/* Apply to Days Checkboxes */}
            <Text style={styles.formLabel}>Apply to Days *</Text>
            <View style={styles.daysCheckboxContainer}>
              {WEEKDAYS.map((day) => {
                const isChecked = selectedDays.includes(day.id);
                return (
                  <TouchableOpacity
                    key={day.id}
                    style={styles.dayCheckboxItem}
                    onPress={() => toggleDaySelection(day.id)}
                  >
                    <View style={[styles.checkboxSquare, isChecked && styles.checkboxSquareChecked]}>
                      {isChecked && <Text style={styles.checkboxCheckText}>✓</Text>}
                    </View>
                    <Text style={styles.dayCheckboxLabel}>{day.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsAddClassOpen(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveClass}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================= */}
      {/* 4. MODAL: EDIT TIME SLOT (image_728d08.png)                */}
      {/* ========================================================= */}
      <Modal visible={isEditPeriodOpen} transparent animationType="fade" onRequestClose={() => setIsEditPeriodOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.classModalCard}>
            <View style={styles.classModalHeaderRow}>
              <Text style={styles.classModalTitle}>⏰ Edit Time Slot</Text>
              <TouchableOpacity style={styles.classModalCloseBtn} onPress={() => setIsEditPeriodOpen(false)}>
                <Text style={styles.classModalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.formLabel}>Label *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Period 2"
              placeholderTextColor={activeTheme.textMuted}
              value={editLabelInput}
              onChangeText={setEditLabelInput}
            />

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>Start Time *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="10:00"
                  placeholderTextColor={activeTheme.textMuted}
                  value={editStartTimeInput}
                  onChangeText={setEditStartTimeInput}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>End Time *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="11:00"
                  placeholderTextColor={activeTheme.textMuted}
                  value={editEndTimeInput}
                  onChangeText={setEditEndTimeInput}
                />
              </View>
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsEditPeriodOpen(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSavePeriodChanges}>
                <Text style={styles.saveBtnText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <AuthModal
        visible={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        theme={activeTheme}
        onAuthSuccess={(user) => {
          setCurrentUser(user);
          refreshSlots();
        }}
      />
    </SafeAreaView>
  );
}