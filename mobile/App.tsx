import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
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
} from 'react-native';
import { db, initLocalDatabase, queueMutation } from './src/db/client';
import { runSync } from './src/db/syncEngine';
import { TEST_USER_ID } from './src/utils/constants';

interface SlotViewItem {
  slot_id: string;
  subject_name: string;
  room_number: string;
  start_time_minutes: number;
  end_time_minutes: number;
  status: string | null;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function App() {
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [slots, setSlots] = useState<SlotViewItem[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Form input states
  const [subjectName, setSubjectName] = useState<string>('');
  const [room, setRoom] = useState<string>('');
  const [startHour, setStartHour] = useState<string>('9');
  const [endHour, setEndHour] = useState<string>('10');

  const todayIso = new Date().toISOString().split('T')[0];

  const showFeedback = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  useEffect(() => {
    initLocalDatabase();
    refreshSlots();
  }, [selectedDay]);

  const refreshSlots = () => {
    try {
      const rows = db.getAllSync<SlotViewItem>(
        `SELECT 
          t.id AS slot_id,
          s.name AS subject_name,
          s.room_number,
          t.start_time_minutes,
          t.end_time_minutes,
          a.status
        FROM timetable_slots t
        JOIN subjects s ON t.subject_id = s.id
        LEFT JOIN attendance_records a ON a.slot_id = t.id AND a.date = ? AND a.is_deleted = 0
        WHERE t.user_id = ? AND t.day_of_week = ? AND t.is_deleted = 0
        ORDER BY t.start_time_minutes ASC;`,
        [todayIso, TEST_USER_ID, selectedDay]
      );
      setSlots(rows);
    } catch (e) {
      console.error('Error reading slots:', e);
    }
  };

  const handleCreateSlot = () => {
    if (!subjectName.trim()) {
      showFeedback('Validation Error', 'Subject name is required');
      return;
    }

    const startMinutes = parseInt(startHour, 10) * 60;
    const endMinutes = parseInt(endHour, 10) * 60;

    if (isNaN(startMinutes) || isNaN(endMinutes) || startMinutes >= endMinutes) {
      showFeedback('Validation Error', 'End time must be greater than start time');
      return;
    }

    // Overlap / collision check
    const collision = db.getFirstSync(
      `SELECT id FROM timetable_slots
       WHERE user_id = ? AND day_of_week = ? AND is_deleted = 0
         AND MAX(start_time_minutes, ?) < MIN(end_time_minutes, ?);`,
      [TEST_USER_ID, selectedDay, startMinutes, endMinutes]
    );

    if (collision) {
      showFeedback('Collision Detected', 'This time slot overlaps with another scheduled class.');
      return;
    }

    const now = Date.now();
    const subjectId = 'sub_' + Math.random().toString(36).substring(2, 9);
    const slotId = 'slot_' + Math.random().toString(36).substring(2, 9);

    db.withTransactionSync(() => {
      // 1. Create Subject
      const subData = {
        id: subjectId,
        user_id: TEST_USER_ID,
        name: subjectName.trim(),
        room_number: room.trim() || 'TBD',
        created_at: now,
        updated_at: now,
        is_deleted: 0,
      };
      db.runSync(
        `INSERT INTO subjects (id, user_id, name, room_number, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);`,
        [subData.id, subData.user_id, subData.name, subData.room_number, subData.created_at, subData.updated_at]
      );
      queueMutation('subjects', subjectId, subData);

      // 2. Create Slot
      const slotData = {
        id: slotId,
        user_id: TEST_USER_ID,
        subject_id: subjectId,
        day_of_week: selectedDay,
        start_time_minutes: startMinutes,
        end_time_minutes: endMinutes,
        created_at: now,
        updated_at: now,
        is_deleted: 0,
      };
      db.runSync(
        `INSERT INTO timetable_slots (id, user_id, subject_id, day_of_week, start_time_minutes, end_time_minutes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [slotData.id, slotData.user_id, slotData.subject_id, slotData.day_of_week, slotData.start_time_minutes, slotData.end_time_minutes, slotData.created_at, slotData.updated_at]
      );
      queueMutation('timetable_slots', slotId, slotData);
    });

    setIsModalOpen(false);
    setSubjectName('');
    setRoom('');
    refreshSlots();
  };

  const handleAttendance = (slotId: string, status: 'present' | 'absent') => {
    const now = Date.now();
    const attId = 'att_' + Math.random().toString(36).substring(2, 9);

    const attData = {
      id: attId,
      user_id: TEST_USER_ID,
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
      [attId, TEST_USER_ID, slotId, todayIso, status, now, now]
    );

    queueMutation('attendance_records', attId, attData);
    refreshSlots();
  };

  const handleSync = async () => {
    setIsSyncing(true);
    const result = await runSync();
    setIsSyncing(false);
    refreshSlots();
    showFeedback(
      result.success ? 'Sync Successful' : 'Sync Error',
      `Pushed: ${result.pushed} changes\nPulled: ${result.pulled} changes`
    );
  };

  const formatMinutes = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header Bar */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Student Timetable</Text>
          <Text style={styles.subtitle}>{todayIso}</Text>
        </View>
        <TouchableOpacity style={styles.syncButton} onPress={handleSync} disabled={isSyncing}>
          {isSyncing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.syncText}>Sync</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Day Selector */}
      <View style={styles.daySelector}>
        {DAYS.map((dayLabel, index) => {
          const dayNumber = index + 1;
          const isActive = selectedDay === dayNumber;
          return (
            <TouchableOpacity
              key={dayLabel}
              style={[styles.dayTab, isActive && styles.dayTabActive]}
              onPress={() => setSelectedDay(dayNumber)}
            >
              <Text style={[styles.dayText, isActive && styles.dayTextActive]}>{dayLabel}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Class Schedule List */}
      <FlatList
        data={slots}
        keyExtractor={(item) => item.slot_id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No classes scheduled for {DAYS[selectedDay - 1]}.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardInfo}>
              <Text style={styles.subjectName}>{item.subject_name}</Text>
              <Text style={styles.roomText}>Room: {item.room_number}</Text>
              <Text style={styles.timeText}>
                {formatMinutes(item.start_time_minutes)} - {formatMinutes(item.end_time_minutes)}
              </Text>
            </View>
            <View style={styles.actionColumn}>
              <TouchableOpacity
                style={[styles.attendBtn, item.status === 'present' && styles.attendBtnActive]}
                onPress={() => handleAttendance(item.slot_id, 'present')}
              >
                <Text style={[styles.btnText, item.status === 'present' && styles.btnTextActive]}>Present</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.absentBtn, item.status === 'absent' && styles.absentBtnActive]}
                onPress={() => handleAttendance(item.slot_id, 'absent')}
              >
                <Text style={[styles.btnText, item.status === 'absent' && styles.btnTextActive]}>Absent</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* Floating Add Button */}
      <TouchableOpacity style={styles.fab} onPress={() => setIsModalOpen(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Create Class Modal */}
      <Modal visible={isModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Class ({DAYS[selectedDay - 1]})</Text>
            <TextInput
              placeholder="Subject Name (e.g., Algorithms)"
              placeholderTextColor="#94A3B8"
              style={styles.input}
              value={subjectName}
              onChangeText={setSubjectName}
            />
            <TextInput
              placeholder="Room Number (e.g., Lab 2, 401)"
              placeholderTextColor="#94A3B8"
              style={styles.input}
              value={room}
              onChangeText={setRoom}
            />
            <View style={styles.timeRow}>
              <View style={styles.timeInputCol}>
                <Text style={styles.label}>Start Hour (24h)</Text>
                <TextInput
                  keyboardType="numeric"
                  style={styles.input}
                  value={startHour}
                  onChangeText={setStartHour}
                />
              </View>
              <View style={styles.timeInputCol}>
                <Text style={styles.label}>End Hour (24h)</Text>
                <TextInput
                  keyboardType="numeric"
                  style={styles.input}
                  value={endHour}
                  onChangeText={setEndHour}
                />
              </View>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsModalOpen(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleCreateSlot}>
                <Text style={styles.submitText}>Save Slot</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    ...(Platform.OS === 'web'
      ? {
          height: '100vh',
          maxHeight: '100vh',
          maxWidth: 600,
          marginHorizontal: 'auto' as any,
          width: '100%',
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: '#E2E8F0',
        }
      : {}),
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderColor: '#E2E8F0' },
  title: { fontSize: 22, fontWeight: '700', color: '#0F172A' },
  subtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  syncButton: { backgroundColor: '#3B82F6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  syncText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  daySelector: { flexDirection: 'row', padding: 8, backgroundColor: '#FFFFFF', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#E2E8F0' },
  dayTab: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  dayTabActive: { backgroundColor: '#0F172A' },
  dayText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  dayTextActive: { color: '#FFFFFF' },
  listContent: { padding: 16, paddingBottom: 90 },
  emptyContainer: { marginTop: 60, alignItems: 'center' },
  emptyText: { color: '#94A3B8', fontSize: 15 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', borderWidth: 1, borderColor: '#E2E8F0' },
  cardInfo: { flex: 1 },
  subjectName: { fontSize: 16, fontWeight: '700', color: '#1E293B' },
  roomText: { fontSize: 13, color: '#64748B', marginVertical: 4 },
  timeText: { fontSize: 13, fontWeight: '600', color: '#3B82F6' },
  actionColumn: { justifyContent: 'center', gap: 6 },
  attendBtn: { backgroundColor: '#F1F5F9', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#CBD5E1' },
  attendBtnActive: { backgroundColor: '#10B981', borderColor: '#10B981' },
  absentBtn: { backgroundColor: '#F1F5F9', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#CBD5E1' },
  absentBtnActive: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  btnText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  btnTextActive: { color: '#FFFFFF' },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center', elevation: 4 },
  fabText: { color: '#FFFFFF', fontSize: 28, lineHeight: 30 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16, color: '#0F172A' },
  input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 14, color: '#0F172A' },
  timeRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  timeInputCol: { flex: 1 },
  label: { fontSize: 12, color: '#64748B', marginBottom: 4 },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  cancelBtn: { padding: 10 },
  cancelText: { color: '#64748B', fontWeight: '600' },
  submitBtn: { backgroundColor: '#3B82F6', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  submitText: { color: '#FFFFFF', fontWeight: '600' },
});