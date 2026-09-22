// mobile/src/components/AuthModal.tsx
import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { ThemeColors } from '../theme/themes';
import { authService, AuthUser } from '../services/authService';
import { syncService } from '../services/syncService';

interface AuthModalProps {
  visible: boolean;
  onClose: () => void;
  theme: ThemeColors;
  onAuthSuccess: (user: AuthUser | null) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  visible,
  onClose,
  theme,
  onAuthSuccess,
}) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [autoMerge, setAutoMerge] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [guestCount, setGuestCount] = useState(0);

  const currentUser = authService.getCurrentUser();

  useEffect(() => {
    if (visible) {
      setErrorMessage('');
      setGuestCount(syncService.getGuestSlotCount());
    }
  }, [visible]);

  const handleAuthSubmit = async () => {
    setErrorMessage('');
    setLoading(true);

    let res;
    if (tab === 'login') {
      res = await authService.login(identifier, password);
    } else {
      res = await authService.register(email, username, password, name);
    }

    setLoading(false);

    if (res.success && res.user) {
      if (autoMerge && guestCount > 0) {
        await syncService.mergeGuestSlotsToAccount();
      }
      onAuthSuccess(res.user);
      onClose();
    } else {
      setErrorMessage(res.error || 'Authentication failed. Please check your credentials.');
    }
  };

  const handleLogout = () => {
    authService.logout();
    setIdentifier('');
    setPassword('');
    onAuthSuccess(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {currentUser ? (
              // Active Logged-In Profile
              <View>
                <Text style={[modalStyles.title, { color: theme.textPrimary }]}>👤 Student Profile</Text>
                <Text style={[modalStyles.sub, { color: theme.textSecondary }]}>
                  Your routine is synchronized to your unique account.
                </Text>

                <View style={[modalStyles.infoBox, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                  <Text style={[modalStyles.infoLabel, { color: theme.textSecondary }]}>Username</Text>
                  <Text style={[modalStyles.infoValue, { color: theme.primary }]}>@{currentUser.username}</Text>

                  <Text style={[modalStyles.infoLabel, { color: theme.textSecondary, marginTop: 8 }]}>Email Address</Text>
                  <Text style={[modalStyles.infoValue, { color: theme.textPrimary }]}>{currentUser.email}</Text>

                  <Text style={[modalStyles.infoLabel, { color: theme.textSecondary, marginTop: 8 }]}>Student ID</Text>
                  <Text style={[modalStyles.infoValue, { color: theme.textSecondary, fontSize: 11 }]}>{currentUser.id}</Text>
                </View>

                {guestCount > 0 && (
                  <TouchableOpacity
                    style={[modalStyles.mergeBanner, { backgroundColor: `${theme.primary}18`, borderColor: theme.primary }]}
                    onPress={async () => {
                      await syncService.mergeGuestSlotsToAccount();
                      setGuestCount(0);
                      onAuthSuccess(currentUser);
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primary }}>
                      📥 Found {guestCount} offline guest session(s). Tap to merge!
                    </Text>
                  </TouchableOpacity>
                )}

                <View style={modalStyles.btnRow}>
                  <TouchableOpacity style={[modalStyles.logoutBtn, { borderColor: '#EF4444' }]} onPress={handleLogout}>
                    <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 12 }}>Logout (Guest Mode)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[modalStyles.closeBtn, { backgroundColor: theme.primary }]} onPress={onClose}>
                    <Text style={{ color: theme.primaryText, fontWeight: '700', fontSize: 12 }}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              // Login / Register Form
              <View>
                <View style={modalStyles.tabBar}>
                  <TouchableOpacity
                    style={[modalStyles.tabBtn, tab === 'login' && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
                    onPress={() => { setTab('login'); setErrorMessage(''); }}
                  >
                    <Text style={[modalStyles.tabText, { color: tab === 'login' ? theme.primary : theme.textSecondary }]}>
                      Login
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[modalStyles.tabBtn, tab === 'register' && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
                    onPress={() => { setTab('register'); setErrorMessage(''); }}
                  >
                    <Text style={[modalStyles.tabText, { color: tab === 'register' ? theme.primary : theme.textSecondary }]}>
                      Register
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={[modalStyles.sub, { color: theme.textSecondary, marginTop: 10 }]}>
                  {tab === 'login'
                    ? 'Log in with your Username or Email to load your routine.'
                    : 'Create your unique student account to safeguard your timetable.'}
                </Text>

                {errorMessage ? (
                  <View style={modalStyles.errorBox}>
                    <Text style={modalStyles.errorText}>⚠️ {errorMessage}</Text>
                  </View>
                ) : null}

                {/* LOGIN */}
                {tab === 'login' && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={[modalStyles.inputLabel, { color: theme.textSecondary }]}>Username or Email</Text>
                    <TextInput
                      placeholder="e.g. vivek_2026 or student@example.com"
                      placeholderTextColor={theme.textMuted}
                      autoCapitalize="none"
                      style={[modalStyles.input, { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}
                      value={identifier}
                      onChangeText={setIdentifier}
                    />
                  </View>
                )}

                {/* REGISTER */}
                {tab === 'register' && (
                  <>
                    <View style={{ marginTop: 8 }}>
                      <Text style={[modalStyles.inputLabel, { color: theme.textSecondary }]}>Unique Username</Text>
                      <TextInput
                        placeholder="e.g. vivek_gate (letters, numbers, _)"
                        placeholderTextColor={theme.textMuted}
                        autoCapitalize="none"
                        style={[modalStyles.input, { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}
                        value={username}
                        onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      />
                    </View>

                    <View style={{ marginTop: 8 }}>
                      <Text style={[modalStyles.inputLabel, { color: theme.textSecondary }]}>Full Name</Text>
                      <TextInput
                        placeholder="e.g. Vivek Kumar"
                        placeholderTextColor={theme.textMuted}
                        style={[modalStyles.input, { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}
                        value={name}
                        onChangeText={setName}
                      />
                    </View>

                    <View style={{ marginTop: 8 }}>
                      <Text style={[modalStyles.inputLabel, { color: theme.textSecondary }]}>Email Address</Text>
                      <TextInput
                        placeholder="student@example.com"
                        placeholderTextColor={theme.textMuted}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        style={[modalStyles.input, { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}
                        value={email}
                        onChangeText={setEmail}
                      />
                    </View>
                  </>
                )}

                <View style={{ marginTop: 8 }}>
                  <Text style={[modalStyles.inputLabel, { color: theme.textSecondary }]}>Password</Text>
                  <TextInput
                    placeholder="••••••••"
                    placeholderTextColor={theme.textMuted}
                    secureTextEntry
                    style={[modalStyles.input, { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}
                    value={password}
                    onChangeText={setPassword}
                  />
                </View>

                {guestCount > 0 && (
                  <TouchableOpacity
                    style={modalStyles.checkboxRow}
                    onPress={() => setAutoMerge(!autoMerge)}
                  >
                    <View style={[modalStyles.checkbox, autoMerge && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
                      {autoMerge && <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>✓</Text>}
                    </View>
                    <Text style={[modalStyles.checkboxText, { color: theme.textSecondary }]}>
                      Merge <Text style={{ fontWeight: '800', color: theme.textPrimary }}>{guestCount} offline session(s)</Text> into this account
                    </Text>
                  </TouchableOpacity>
                )}

                <View style={modalStyles.btnRow}>
                  <TouchableOpacity style={modalStyles.cancelBtn} onPress={onClose}>
                    <Text style={{ color: theme.textMuted, fontWeight: '600', fontSize: 12 }}>Continue as Guest</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[modalStyles.submitBtn, { backgroundColor: theme.primary }]}
                    onPress={handleAuthSubmit}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={{ color: theme.primaryText, fontWeight: '700', fontSize: 12 }}>
                        {tab === 'login' ? 'Sign In' : 'Register Account'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    borderRadius: 14,
    padding: 18,
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  sub: {
    fontSize: 11,
    marginBottom: 8,
    lineHeight: 16,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 3,
  },
  input: {
    borderWidth: 1,
    borderRadius: 7,
    padding: 8,
    fontSize: 12,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    padding: 8,
    borderRadius: 6,
    marginVertical: 6,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '600',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxText: {
    fontSize: 11,
    flex: 1,
  },
  infoBox: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 8,
  },
  infoLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  mergeBanner: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 6,
    alignItems: 'center',
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  cancelBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  submitBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 7,
  },
  logoutBtn: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 7,
  },
  closeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 7,
  },
});