// mobile/src/theme/themes.ts

export type ThemeKey = 'midnight' | 'light' | 'oled' | 'forest';

export interface ThemeColors {
  name: string;
  icon: string;
  bg: string;
  surface: string;
  surfaceElevated: string;
  headerBg: string;
  headerText: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryText: string;
  accent: string;
  tabBg: string;
  tabActiveBg: string;
  tabText: string;
  tabActiveText: string;
  metricsBg: string;
}

export const THEMES: Record<ThemeKey, ThemeColors> = {
  midnight: {
    name: 'Midnight Slate',
    icon: '🌙',
    bg: '#0B0F19',
    surface: '#111827',
    surfaceElevated: '#1F2937',
    headerBg: '#0F172A',
    headerText: '#FFFFFF',
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    border: '#1E293B',
    primary: '#3B82F6',
    primaryText: '#FFFFFF',
    accent: '#38BDF8',
    tabBg: '#1E293B',
    tabActiveBg: '#3B82F6',
    tabText: '#94A3B8',
    tabActiveText: '#FFFFFF',
    metricsBg: '#111827',
  },
  light: {
    name: 'Clean Paper',
    icon: '☀️',
    bg: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceElevated: '#F1F5F9',
    headerBg: '#FFFFFF',
    headerText: '#0F172A',
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#94A3B8',
    border: '#E2E8F0',
    primary: '#2563EB',
    primaryText: '#FFFFFF',
    accent: '#0284C7',
    tabBg: '#F1F5F9',
    tabActiveBg: '#0F172A',
    tabText: '#64748B',
    tabActiveText: '#FFFFFF',
    metricsBg: '#FFFFFF',
  },
  oled: {
    name: 'OLED Black',
    icon: '⚡',
    bg: '#000000',
    surface: '#0A0A0A',
    surfaceElevated: '#141414',
    headerBg: '#000000',
    headerText: '#FFFFFF',
    textPrimary: '#EDEDED',
    textSecondary: '#A1A1AA',
    textMuted: '#52525B',
    border: '#27272A',
    primary: '#06B6D4',
    primaryText: '#000000',
    accent: '#22D3EE',
    tabBg: '#18181B',
    tabActiveBg: '#27272A',
    tabText: '#A1A1AA',
    tabActiveText: '#22D3EE',
    metricsBg: '#09090B',
  },
  forest: {
    name: 'Deep Forest',
    icon: '🌲',
    bg: '#022C22',
    surface: '#064E3B',
    surfaceElevated: '#047857',
    headerBg: '#022C22',
    headerText: '#ECFDF5',
    textPrimary: '#ECFDF5',
    textSecondary: '#A7F3D0',
    textMuted: '#6EE7B7',
    border: '#065F46',
    primary: '#10B981',
    primaryText: '#FFFFFF',
    accent: '#34D399',
    tabBg: '#064E3B',
    tabActiveBg: '#10B981',
    tabText: '#A7F3D0',
    tabActiveText: '#FFFFFF',
    metricsBg: '#064E3B',
  },
};