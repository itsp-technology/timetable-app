// mobile/src/theme/themes.ts
export interface ThemeColors {
  name: string;
  icon: string;
  bg: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  primary: string;
  primaryText: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  headerBg: string;
  headerText: string;
  tabBg: string;
  tabActiveBg: string;
  tabText: string;
  tabActiveText: string;
  metricsBg: string;
}

export type ThemeKey = 'smartDark' | 'smartLight' | 'midnight' | 'amoled';

export const THEMES: Record<ThemeKey, ThemeColors> = {
  smartDark: {
    name: 'Smart Dark',
    icon: '🌙',
    bg: '#0F172A',
    surface: '#1E293B',
    surfaceElevated: '#243048',
    border: '#334155',
    primary: '#2563EB',
    primaryText: '#FFFFFF',
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    headerBg: '#090D16',
    headerText: '#F8FAFC',
    tabBg: '#1E293B',
    tabActiveBg: '#2563EB',
    tabText: '#94A3B8',
    tabActiveText: '#FFFFFF',
    metricsBg: '#1E293B',
  },
  smartLight: {
    name: 'Smart Light',
    icon: '☀️',
    bg: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceElevated: '#F1F5F9',
    border: '#E2E8F0',
    primary: '#2563EB',
    primaryText: '#FFFFFF',
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
    textMuted: '#94A3B8',
    headerBg: '#FFFFFF',
    headerText: '#0F172A',
    tabBg: '#F1F5F9',
    tabActiveBg: '#2563EB',
    tabText: '#64748B',
    tabActiveText: '#FFFFFF',
    metricsBg: '#FFFFFF',
  },
  midnight: {
    name: 'Midnight',
    icon: '🌌',
    bg: '#090E17',
    surface: '#121927',
    surfaceElevated: '#1B2438',
    border: '#2A364F',
    primary: '#38BDF8',
    primaryText: '#090E17',
    textPrimary: '#F1F5F9',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    headerBg: '#060A10',
    headerText: '#F1F5F9',
    tabBg: '#121927',
    tabActiveBg: '#38BDF8',
    tabText: '#94A3B8',
    tabActiveText: '#090E17',
    metricsBg: '#121927',
  },
  amoled: {
    name: 'OLED Black',
    icon: '⚫',
    bg: '#000000',
    surface: '#0A0A0A',
    surfaceElevated: '#141414',
    border: '#262626',
    primary: '#3B82F6',
    primaryText: '#FFFFFF',
    textPrimary: '#FFFFFF',
    textSecondary: '#A3A3A3',
    textMuted: '#525252',
    headerBg: '#000000',
    headerText: '#FFFFFF',
    tabBg: '#0A0A0A',
    tabActiveBg: '#3B82F6',
    tabText: '#A3A3A3',
    tabActiveText: '#FFFFFF',
    metricsBg: '#0A0A0A',
  },
};