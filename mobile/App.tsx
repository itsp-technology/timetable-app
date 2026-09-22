// mobile/App.tsx
import React, { useEffect, useState, useMemo } from 'react';
import {
  Text,
  View,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  StatusBar,
  Platform,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { db, initLocalDatabase, queueMutation } from './src/db/client';
import { runSync } from './src/db/syncEngine';
import { THEMES, ThemeKey } from './src/theme/themes';
import { getAppStyles } from './src/styles/appStyles';

export type SessionType = 'theory' | 'pyq' | 'revision' | 'mock';

interface ExamSlotItem {
  slot_id: string;
  subject_name: string;
  room_number: string;
  start_time_minutes: number;
  end_time_minutes: number;
  slot_type: SessionType;
  topic: string;
  target_questions: number;
  status: 'completed' | 'skipped' | null;
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

const SESSION_META: Record<SessionType, { label: string; bg: string; text: string; icon: string }> = {
  theory: { label: 'Core Theory', bg: '#EFF6FF', text: '#2563EB', icon: '📖' },
  pyq: { label: 'PYQ Drill', bg: '#ECFDF5', text: '#059669', icon: '📝' },
  revision: { label: 'Active Recall', bg: '#FDF4FF', text: '#9333EA', icon: '⚡' },
  mock: { label: 'Speed Test', bg: '#FFF7ED', text: '#D97706', icon: '⏱️' },
};

export default function App() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  // Active Theme State
  const [currentThemeKey, setCurrentThemeKey] = useState<ThemeKey>('midnight');
  const [isThemeModalOpen, setIsThemeModalOpen] = useState<boolean>(false);

  // Dynamic User & Target Exam State
  const [userId, setUserId] = useState<string>('');
  const [examName, setExamName] = useState<string>('My Competitive Exam');
  const [examDate, setExamDate] = useState<string>('');
  const [isGoalModalOpen, setIsGoalModalOpen] = useState<boolean>(false);

  // Goal Form Fields
  const [tempExamName, setTempExamName] = useState<string>('');
  const [tempExamDate, setTempExamDate] = useState<string>('');
  const [tempUserId, setTempUserId] = useState<string>('');

  const activeTheme = THEMES[currentThemeKey];
  const styles = useMemo(() => getAppStyles(activeTheme, isDesktop), [activeTheme, isDesktop]);

  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [slots, setSlots] = useState<ExamSlotItem[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Slot Form Inputs (All starting completely clean)
  const [subjectName, setSubjectName] = useState<string>('');
  const [topicName, setTopicName] = useState<string>('');
  const [sessionType, setSessionType] = useState<SessionType>('theory');
  const [targetQuestions, setTargetQuestions] = useState<string>('');
  const [startTimeStr, setStartTimeStr] = useState<string>('');
  const [endTimeStr, setEndTimeStr] = useState<string>('');

  const todayIso = new Date().toISOString().split('T')[0];

  // Dynamic Countdown Calculation
  const daysLeft = useMemo(() => {
    if (!examDate) return null;
    const target = new Date(`${examDate}T00:00:00`);
    if (isNaN(target.getTime())) return null;
    const now = new Date();
    const diff = target.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [examDate]);

  const notifyUser = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  // Initialize DB and Load User Configuration from SQLite sync_meta
  useEffect(() => {
    initLocalDatabase();

    const storedUser = db.getFirstSync<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', ['user_id']);
    const effectiveUserId = storedUser?.value || `aspirant_${Math.random().toString(36).substring(2, 7)}`;
    if (!storedUser) {
      db.runSync(`INSERT INTO sync_meta (key, value) VALUES ('user_id', ?)`, [effectiveUserId]);
    }
    setUserId(effectiveUserId);

    const storedTheme = db.getFirstSync<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', ['preferred_theme']);
    if (storedTheme && storedTheme.value in THEMES) {
      setCurrentThemeKey(storedTheme.value as ThemeKey);
    }

    const storedExam = db.getFirstSync<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', ['exam_name']);
    if (storedExam?.value) setExamName(storedExam.value);

    const storedExamDate = db.getFirstSync<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', ['exam_date']);
    if (storedExamDate?.value) setExamDate(storedExamDate.value);
  }, []);

  useEffect(() => {
    if (userId) {
      refreshSlots();
    }
  }, [selectedDay, userId]);

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
          a.status
        FROM timetable_slots t
        JOIN subjects s ON t.subject_id = s.id
        LEFT JOIN attendance_records a ON a.slot_id = t.id AND a.date = ? AND a.is_deleted = 0
        WHERE t.user_id = ? AND t.day_of_week = ? AND t.is_deleted = 0
        ORDER BY t.start_time_minutes ASC;`,
        [todayIso, userId, selectedDay]
      );
      setSlots(rows);
    } catch (e) {
      console.error('Error fetching timetable slots:', e);
    }
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
    setTempUserId(userId);
    setIsGoalModalOpen(true);
  };

  const handleSaveGoal = () => {
    if (!tempExamName.trim()) {
      notifyUser('Required', 'Please enter your exam title');
      return;
    }
    const cleanExam = tempExamName.trim();
    const cleanDate = tempExamDate.trim();
    const cleanUser = tempUserId.trim() || userId;

    setExamName(cleanExam);
    setExamDate(cleanDate);
    setUserId(cleanUser);

    db.runSync(`INSERT INTO sync_meta (key, value) VALUES ('exam_name', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;`, [cleanExam]);
    db.runSync(`INSERT INTO sync_meta (key, value) VALUES ('exam_date', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;`, [cleanDate]);
    db.runSync(`INSERT INTO sync_meta (key, value) VALUES ('user_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;`, [cleanUser]);

    setIsGoalModalOpen(false);
    refreshSlots();
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

  const parseTimeToMinutes = (timeStr: string): number => {
    const parts = timeStr.trim().split(':');
    if (parts.length < 2) return NaN;
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  };

  const handleCreateSlot = () => {
    if (!subjectName.trim()) {
      notifyUser('Required Field', 'Please enter a Subject name.');
      return;
    }

    const startMinutes = parseTimeToMinutes(startTimeStr);
    const endMinutes = parseTimeToMinutes(endTimeStr);

    if (isNaN(startMinutes) || isNaN(endMinutes) || startMinutes >= endMinutes) {
      notifyUser('Invalid Time Interval', 'Provide valid start and end times in 24-hr format (e.g. 09:30 and 11:30).');
      return;
    }

    const collision = db.getFirstSync(
      `SELECT id FROM timetable_slots
       WHERE user_id = ? AND day_of_week = ? AND is_deleted = 0
         AND MAX(start_time_minutes, ?) < MIN(end_time_minutes, ?);`,
      [userId, selectedDay, startMinutes, endMinutes]
    );

    if (collision) {
      notifyUser('Slot Collision', 'This time period overlaps with an existing class or session.');
      return;
    }

    const now = Date.now();
    const subjectId = 'sub_' + Math.random().toString(36).substring(2, 9);
    const slotId = 'slot_' + Math.random().toString(36).substring(2, 9);
    const qCount = parseInt(targetQuestions, 10) || 0;

    db.withTransactionSync(() => {
      const subData = {
        id: subjectId,
        user_id: userId,
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
        user_id: userId,
        subject_id: subjectId,
        day_of_week: selectedDay,
        start_time_minutes: startMinutes,
        end_time_minutes: endMinutes,
        slot_type: sessionType,
        topic: topicName.trim(),
        target_questions: qCount,
        created_at: now,
        updated_at: now,
        is_deleted: 0,
      };
      db.runSync(
        `INSERT INTO timetable_slots (id, user_id, subject_id, day_of_week, start_time_minutes, end_time_minutes, slot_type, topic, target_questions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [slotData.id, slotData.user_id, slotData.subject_id, slotData.day_of_week, slotData.start_time_minutes, slotData.end_time_minutes, slotData.slot_type, slotData.topic, slotData.target_questions, slotData.created_at, slotData.updated_at]
      );
      queueMutation('timetable_slots', slotId, slotData);
    });

    setIsModalOpen(false);
    setSubjectName('');
    setTopicName('');
    setStartTimeStr('');
    setEndTimeStr('');
    setTargetQuestions('');
    refreshSlots();
  };

  const handleDeleteSlot = (slotId: string) => {
    db.runSync(`DELETE FROM timetable_slots WHERE id = ?;`, [slotId]);
    refreshSlots();
  };

  const handleUpdateStatus = (slotId: string, status: 'completed' | 'skipped') => {
    const now = Date.now();
    const attId = 'att_' + Math.random().toString(36).substring(2, 9);

    const attData = {
      id: attId,
      user_id: userId,
      slot_id: slotId,
      date: todayIso,
      status,
      created_at: now,
      updated_at: now,
      is_deleted: 0,
    };

    db.runSync(
      `INSERT INTO attendance_records (id, user_id, slot_id, date, status, created_at, updated_at, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0);`,
      [attId, userId, slotId, todayIso, status, now, now]
    );

    queueMutation('attendance_records', attId, attData);
    refreshSlots();
  };

  const handleCloudSync = async () => {
    setIsSyncing(true);
    const result = await runSync();
    setIsSyncing(false);
    refreshSlots();
    notifyUser(
      result.success ? 'Synced with Cloud' : 'Sync Offline',
      `Synchronized: ${result.pushed} local changes uploaded | ${result.pulled} remote changes pulled.`
    );
  };

  const formatMinutes = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={currentThemeKey === 'light' ? 'dark-content' : 'light-content'} backgroundColor={activeTheme.headerBg} />

      <View style={[styles.mainLayout, isDesktop && styles.desktopLayout]}>
        {/* Top Header */}
        <View style={styles.topHeader}>
          <View>
            <View style={styles.badgeRow}>
              <TouchableOpacity style={styles.examTag} onPress={handleOpenGoalModal}>
                <Text style={styles.examTagText}>{examName} ✏️</Text>
              </TouchableOpacity>
              <Text style={styles.countdownText}>
                {daysLeft !== null ? `🎯 ${daysLeft} Days Left` : '🎯 Set Target Date'}
              </Text>
            </View>
            <Text style={styles.portalTitle}>Student Timetable</Text>
          </View>

          <View style={styles.headerRightGroup}>
            <TouchableOpacity style={styles.headerButton} onPress={() => setIsThemeModalOpen(true)}>
              <Text style={styles.headerButtonText}>{activeTheme.icon} Theme</Text>
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

        {/* Real-time Metrics Card */}
        <View style={styles.metricsContainer}>
          <View style={styles.metricBox}>
            <Text style={styles.metricVal}>{metrics.completedHours}h / {metrics.plannedHours}h</Text>
            <Text style={styles.metricLabel}>Study Time Done</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricBox}>
            <Text style={[styles.metricVal, { color: metrics.completionRate >= 75 ? '#10B981' : '#F59E0B' }]}>
              {metrics.completionRate}%
            </Text>
            <Text style={styles.metricLabel}>Daily Completion</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricBox}>
            <Text style={styles.metricVal}>{metrics.questionsCompleted}/{metrics.questionsTargeted}</Text>
            <Text style={styles.metricLabel}>Questions Done</Text>
          </View>
        </View>

        {/* Day Selector Tabs */}
        <View style={styles.daySelectorWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayScrollContent}>
            {DAYS.map((d, idx) => {
              const dayNum = idx + 1;
              const isActive = selectedDay === dayNum;
              return (
                <TouchableOpacity
                  key={d.short}
                  style={[styles.dayTab, isActive && styles.dayTabActive]}
                  onPress={() => setSelectedDay(dayNum)}
                >
                  <Text style={[styles.dayTabShort, isActive && styles.dayTabShortActive]}>{d.short}</Text>
                  <Text style={[styles.dayTabFull, isActive && styles.dayTabFullActive]}>{d.full}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Study Stream */}
        <FlatList
          data={slots}
          keyExtractor={(item) => item.slot_id}
          contentContainerStyle={styles.streamContent}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>📝</Text>
              <Text style={styles.emptyTitle}>No classes or sessions scheduled for {DAYS[selectedDay - 1].full}</Text>
              <Text style={styles.emptySub}>Tap "+ Add Study Slot" below to build your customized routine.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const meta = SESSION_META[item.slot_type] || SESSION_META.theory;
            const durationHrs = ((item.end_time_minutes - item.start_time_minutes) / 60).toFixed(1);
            const isCompleted = item.status === 'completed';
            const isSkipped = item.status === 'skipped';

            return (
              <View style={[styles.slotCard, isCompleted && styles.slotCardCompleted]}>
                <View style={[styles.slotTypeAccent, { backgroundColor: meta.text }]} />

                <View style={styles.slotBody}>
                  <View style={styles.cardHeaderRow}>
                    <View style={[styles.typeBadge, { backgroundColor: meta.bg }]}>
                      <Text style={[styles.typeBadgeText, { color: meta.text }]}>
                        {meta.icon} {meta.label}
                      </Text>
                    </View>
                    <View style={styles.timeSpanGroup}>
                      <Text style={styles.timeSpanText}>
                        {formatMinutes(item.start_time_minutes)} - {formatMinutes(item.end_time_minutes)} ({durationHrs}h)
                      </Text>
                      <TouchableOpacity style={styles.deleteSlotBtn} onPress={() => handleDeleteSlot(item.slot_id)}>
                        <Text style={styles.deleteSlotText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text style={styles.subjectText}>{item.subject_name}</Text>
                  {item.topic ? <Text style={styles.topicText}>📌 {item.topic}</Text> : null}

                  <View style={styles.cardFooterRow}>
                    <View style={styles.qTargetBadge}>
                      <Text style={styles.qTargetText}>🎯 Goal: {item.target_questions} Qs</Text>
                    </View>

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
          }}
        />

        {/* Floating Add Trigger */}
        <TouchableOpacity style={styles.fabTrigger} onPress={() => setIsModalOpen(true)}>
          <Text style={styles.fabIcon}>+ Add Study Slot</Text>
        </TouchableOpacity>

        {/* Modal 1: Goal & Student Settings */}
        <Modal visible={isGoalModalOpen} animationType="fade" transparent>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, isDesktop && { maxWidth: 480 }]}>
              <Text style={styles.modalHeading}>Exam Goal & Identity</Text>
              <Text style={styles.modalSubheading}>Configure target exam and calculate dynamic countdown</Text>

              <Text style={styles.fieldLabel}>Exam Title</Text>
              <TextInput
                placeholder="e.g. GATE CSE, UPSC Prelims, SSC CGL"
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

              <Text style={styles.fieldLabel}>Student / User ID</Text>
              <TextInput
                placeholder="e.g. aspirant_01"
                placeholderTextColor={activeTheme.textMuted}
                style={styles.textInput}
                value={tempUserId}
                onChangeText={setTempUserId}
              />

              <View style={styles.modalActionGroup}>
                <TouchableOpacity style={styles.abortBtn} onPress={() => setIsGoalModalOpen(false)}>
                  <Text style={styles.abortBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} onPress={handleSaveGoal}>
                  <Text style={styles.confirmBtnText}>Save Target</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal 2: Theme Selector Modal */}
        <Modal visible={isThemeModalOpen} animationType="fade" transparent>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, isDesktop && { maxWidth: 460 }]}>
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
                        <Text style={{ fontSize: 20 }}>{item.icon}</Text>
                        <Text style={styles.themeOptionTitle}>{item.name}</Text>
                      </View>
                      {isCurrent && <Text style={{ color: activeTheme.primary, fontWeight: '700' }}>Active</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.modalActionGroup}>
                <TouchableOpacity style={styles.confirmBtn} onPress={() => setIsThemeModalOpen(false)}>
                  <Text style={styles.confirmBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal 3: Add Slot Modal */}
        <Modal visible={isModalOpen} animationType="slide" transparent>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, isDesktop && { maxWidth: 550 }]}>
              <Text style={styles.modalHeading}>Schedule Session</Text>
              <Text style={styles.modalSubheading}>{DAYS[selectedDay - 1].full} Routine Plan</Text>

              <Text style={styles.fieldLabel}>Subject / Course</Text>
              <TextInput
                placeholder="e.g. Operating Systems, Mathematics"
                placeholderTextColor={activeTheme.textMuted}
                style={styles.textInput}
                value={subjectName}
                onChangeText={setSubjectName}
              />

              <Text style={styles.fieldLabel}>Topic / Chapter (Optional)</Text>
              <TextInput
                placeholder="e.g. Process Sync, Normalization"
                placeholderTextColor={activeTheme.textMuted}
                style={styles.textInput}
                value={topicName}
                onChangeText={setTopicName}
              />

              <Text style={styles.fieldLabel}>Session Category</Text>
              <View style={styles.typeSelectorRow}>
                {(['theory', 'pyq', 'revision', 'mock'] as SessionType[]).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeChoice, sessionType === t && styles.typeChoiceActive]}
                    onPress={() => setSessionType(t)}
                  >
                    <Text style={[styles.typeChoiceText, sessionType === t && styles.typeChoiceTextActive]}>
                      {SESSION_META[t].icon} {SESSION_META[t].label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.timeInputsRow}>
                <View style={styles.inputCol}>
                  <Text style={styles.fieldLabel}>Start Time (HH:MM)</Text>
                  <TextInput
                    placeholder="09:00"
                    placeholderTextColor={activeTheme.textMuted}
                    style={styles.textInput}
                    value={startTimeStr}
                    onChangeText={setStartTimeStr}
                  />
                </View>
                <View style={styles.inputCol}>
                  <Text style={styles.fieldLabel}>End Time (HH:MM)</Text>
                  <TextInput
                    placeholder="11:00"
                    placeholderTextColor={activeTheme.textMuted}
                    style={styles.textInput}
                    value={endTimeStr}
                    onChangeText={setEndTimeStr}
                  />
                </View>
                <View style={styles.inputCol}>
                  <Text style={styles.fieldLabel}>Target Qs</Text>
                  <TextInput
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={activeTheme.textMuted}
                    style={styles.textInput}
                    value={targetQuestions}
                    onChangeText={setTargetQuestions}
                  />
                </View>
              </View>

              <View style={styles.modalActionGroup}>
                <TouchableOpacity style={styles.abortBtn} onPress={() => setIsModalOpen(false)}>
                  <Text style={styles.abortBtnText}>Dismiss</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} onPress={handleCreateSlot}>
                  <Text style={styles.confirmBtnText}>Save Study Block</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}