import { Platform } from 'react-native';

export const API_BASE_URL = Platform.select({
  android: 'http://10.0.2.2:8787',
  ios: 'http://localhost:8787',
  web: 'http://localhost:8787',
  default: 'http://127.0.0.1:8787',
});

export const TEST_USER_ID = 'test_student_123';