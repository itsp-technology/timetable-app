// mobile/src/styles/appStyles.ts
import { StyleSheet, Platform } from 'react-native';
import { ThemeColors } from '../theme/themes';

export function getAppStyles(theme: ThemeColors, isDesktop: boolean) {
  const isLight = theme.bg === '#F8FAFC' || theme.bg === '#FFFFFF';
  const sidebarBg = isLight ? '#F1F5F9' : '#0B0F19';
  const canvasBg = theme.bg;
  const brandBlue = '#2563EB';

  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: sidebarBg,
    },
    rootContainer: {
      flex: 1,
      flexDirection: isDesktop ? 'row' : 'column',
      backgroundColor: canvasBg,
      width: '100%',
      ...(Platform.OS === 'web' ? ({ height: '100vh', maxHeight: '100vh' } as any) : {}),
    },

    // ==========================================
    // 1. SIDEBAR (Navigation Drawer)
    // ==========================================
    sidebar: {
      width: isDesktop ? 220 : '100%',
      backgroundColor: sidebarBg,
      borderRightWidth: isDesktop ? 1 : 0,
      borderBottomWidth: isDesktop ? 0 : 1,
      borderColor: theme.border,
      paddingHorizontal: 14,
      paddingTop: 16,
      paddingBottom: 14,
      justifyContent: 'space-between',
    },
    sidebarLogoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    sidebarLogoText: {
      fontSize: 18,
      fontWeight: '900',
      color: brandBlue,
      letterSpacing: -0.5,
    },
    sidebarSectionTitle: {
      fontSize: 10,
      fontWeight: '700',
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginTop: 12,
      marginBottom: 4,
      paddingHorizontal: 6,
    },
    sidebarNavItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 8,
      marginVertical: 1,
      gap: 10,
    },
    sidebarNavItemActive: {
      backgroundColor: isLight ? '#E0F2FE' : 'rgba(37, 99, 235, 0.2)',
      borderLeftWidth: 3,
      borderLeftColor: brandBlue,
    },
    sidebarNavIcon: {
      fontSize: 15,
      color: theme.textSecondary,
    },
    sidebarNavIconActive: {
      color: brandBlue,
    },
    sidebarNavLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textPrimary,
    },
    sidebarNavLabelActive: {
      color: brandBlue,
      fontWeight: '800',
    },
    sidebarAddBtn: {
      backgroundColor: brandBlue,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderRadius: 20,
      marginTop: 14,
      gap: 6,
      elevation: 2,
    },
    sidebarAddBtnText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '800',
    },
    sidebarFooter: {
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      gap: 8,
    },
    sidebarToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 6,
    },
    sidebarToggleLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.textSecondary,
    },

    // ==========================================
    // 2. MAIN CONTENT AREA & TOOLBAR
    // ==========================================
    mainContent: {
      flex: 1,
      backgroundColor: canvasBg,
      overflow: 'hidden',
    },
    topToolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      backgroundColor: canvasBg,
      flexWrap: 'wrap',
      gap: 8,
    },
    dateNavigatorPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isLight ? '#F1F5F9' : theme.surfaceElevated,
      borderRadius: 20,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: theme.border,
    },
    dateNavArrowBtn: {
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    dateNavArrowText: {
      fontSize: 14,
      fontWeight: '800',
      color: brandBlue,
    },
    dateNavTitleText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.textPrimary,
      paddingHorizontal: 6,
    },
    viewControlsGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    todayPillBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: brandBlue,
      backgroundColor: isLight ? '#FFFFFF' : 'transparent',
    },
    todayPillBtnText: {
      fontSize: 11,
      fontWeight: '700',
      color: brandBlue,
    },

    // ==========================================
    // 3. SMART TIMETABLE RAINBOW CARDS (image_72eafe.png)
    // ==========================================
    smartTimelineList: {
      flex: 1,
      padding: 14,
    },
    smartClassCard: {
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
    },
    smartClassIndexCol: {
      width: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    smartClassIndexText: {
      fontSize: 16,
      fontWeight: '800',
      opacity: 0.95,
    },
    smartClassTimeCol: {
      width: 55,
      marginLeft: 4,
    },
    smartClassTimeText: {
      fontSize: 11,
      fontWeight: '700',
      opacity: 0.95,
      lineHeight: 14,
    },
    smartClassContentCol: {
      flex: 1,
      marginLeft: 10,
    },
    smartClassTitleText: {
      fontSize: 15,
      fontWeight: '900',
      letterSpacing: -0.2,
    },
    smartClassSubtitleText: {
      fontSize: 11,
      fontWeight: '600',
      opacity: 0.85,
      marginTop: 2,
    },
    smartBadgePill: {
      backgroundColor: 'rgba(255, 255, 255, 0.28)',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.4)',
    },
    smartBadgeText: {
      fontSize: 11,
      fontWeight: '800',
    },

    // ==========================================
    // 4. TIMETABLE GENERATOR APP GRID (image_728c49.png)
    // ==========================================
    generatorRoot: {
      flex: 1,
      padding: 16,
      backgroundColor: isLight ? '#F8FAFC' : '#0B0F19',
    },
    generatorTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 6,
    },
    generatorTitleInput: {
      backgroundColor: isLight ? '#FFFFFF' : '#141A29',
      color: theme.textPrimary,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 6,
      fontSize: 14,
      fontWeight: '800',
      borderWidth: 1,
      borderColor: theme.border,
      minWidth: 180,
    },
    generatorActionsGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    genBtnDark: {
      backgroundColor: isLight ? '#FFFFFF' : '#182030',
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 6,
    },
    genBtnDarkText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.textPrimary,
    },
    genBtnDanger: {
      backgroundColor: '#EF4444',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 6,
    },
    genBtnDangerText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    genBtnPrimary: {
      backgroundColor: brandBlue,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 6,
    },
    genBtnPrimaryText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    generatorSubNotice: {
      fontSize: 12,
      color: theme.textSecondary,
      marginBottom: 12,
    },
    scheduleTableCard: {
      backgroundColor: isLight ? '#FFFFFF' : '#131826',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
      marginBottom: 16,
    },
    scheduleTableHeaderRow: {
      flexDirection: 'row',
      backgroundColor: isLight ? '#F1F5F9' : '#1A2133',
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    scheduleTimeHeaderCol: {
      width: 140,
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderRightWidth: 1,
      borderRightColor: theme.border,
      justifyContent: 'center',
    },
    scheduleTimeHeaderText: {
      fontSize: 12,
      fontWeight: '800',
      color: theme.textPrimary,
    },
    scheduleDayHeaderCol: {
      width: 125,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderRightWidth: 1,
      borderRightColor: theme.border,
    },
    scheduleDayHeaderText: {
      fontSize: 12,
      fontWeight: '800',
      color: theme.textPrimary,
    },
    scheduleTableRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      minHeight: 70,
    },
    scheduleTimeInfoCol: {
      width: 140,
      padding: 10,
      borderRightWidth: 1,
      borderRightColor: theme.border,
      justifyContent: 'center',
    },
    schedulePeriodLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    schedulePeriodTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: theme.textPrimary,
    },
    schedulePeriodRange: {
      fontSize: 10,
      color: theme.textSecondary,
      marginTop: 2,
    },
    periodActionIcons: {
      flexDirection: 'row',
      gap: 4,
    },
    periodIconBtn: {
      padding: 3,
    },
    periodIconText: {
      fontSize: 11,
      color: theme.textMuted,
    },
    scheduleCell: {
      width: 125,
      borderRightWidth: 1,
      borderRightColor: theme.border,
      padding: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scheduleCellPlusBtn: {
      width: '90%',
      height: '80%',
      borderRadius: 6,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: isLight ? '#CBD5E1' : '#2C3549',
      alignItems: 'center',
      justifyContent: 'center',
    },
    scheduleCellPlusText: {
      fontSize: 18,
      fontWeight: '700',
      color: isLight ? '#94A3B8' : '#475569',
    },
    scheduleClassBadge: {
      width: '95%',
      height: '90%',
      borderRadius: 6,
      padding: 6,
      justifyContent: 'center',
    },
    scheduleClassTitle: {
      fontSize: 11,
      fontWeight: '900',
    },
    scheduleClassDesc: {
      fontSize: 9,
      opacity: 0.9,
      marginTop: 1,
    },
    addTimeSlotRow: {
      alignItems: 'center',
      paddingVertical: 12,
      backgroundColor: isLight ? '#F8FAFC' : '#101420',
    },
    addTimeSlotBtn: {
      backgroundColor: isLight ? '#E2E8F0' : '#1E2638',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.border,
    },
    addTimeSlotBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.textPrimary,
    },

    // ==========================================
    // 5. MODALS & TEXTINPUT
    // ==========================================
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.72)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 16,
    },
    classModalCard: {
      width: '95%',
      maxWidth: 460,
      backgroundColor: isLight ? '#FFFFFF' : '#151922',
      borderRadius: 12,
      padding: 18,
      borderWidth: 1,
      borderColor: theme.border,
    },
    classModalHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    classModalTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.textPrimary,
    },
    classModalCloseBtn: {
      padding: 4,
    },
    classModalCloseText: {
      fontSize: 16,
      color: theme.textMuted,
      fontWeight: '700',
    },
    formLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.textSecondary,
      marginBottom: 4,
      marginTop: 8,
    },
    textInput: {
      backgroundColor: isLight ? '#F8FAFC' : '#1E2536',
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 13,
      color: theme.textPrimary,
    },
    colorPickerRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginVertical: 6,
    },
    colorCircle: {
      width: 32,
      height: 32,
      borderRadius: 8,
    },
    colorCircleSelected: {
      borderWidth: 3,
      borderColor: '#FFFFFF',
      transform: [{ scale: 1.1 }],
    },
    daysCheckboxContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginVertical: 6,
    },
    dayCheckboxItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      width: '45%',
      marginVertical: 2,
    },
    checkboxSquare: {
      width: 18,
      height: 18,
      borderRadius: 4,
      borderWidth: 1.5,
      borderColor: isLight ? '#94A3B8' : '#4B5563',
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxSquareChecked: {
      backgroundColor: brandBlue,
      borderColor: brandBlue,
    },
    checkboxCheckText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '800',
    },
    dayCheckboxLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.textPrimary,
    },
    modalBtnRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: 18,
      gap: 10,
    },
    cancelBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 6,
      backgroundColor: isLight ? '#E2E8F0' : '#222838',
    },
    cancelBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.textSecondary,
    },
    saveBtn: {
      backgroundColor: brandBlue,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 6,
    },
    saveBtnText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },

    // Pomodoro Timer
    pomodoroContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    pomodoroTimerText: {
      fontSize: 72,
      fontWeight: '900',
      color: theme.textPrimary,
      fontVariant: ['tabular-nums'],
      letterSpacing: -1,
      marginBottom: 24,
    },
    pomodoroStartBtn: {
      backgroundColor: brandBlue,
      paddingHorizontal: 36,
      paddingVertical: 12,
      borderRadius: 30,
    },
    pomodoroStartBtnText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '800',
    },
  });
}