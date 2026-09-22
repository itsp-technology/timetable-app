// mobile/src/services/authService.ts
import { API_BASE_URL } from '../utils/constants';
import { db, GUEST_USER_ID } from '../db/client';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  name: string;
}

export interface AuthResponse {
  success: boolean;
  user?: AuthUser;
  token?: string;
  error?: string;
}

const AUTH_USER_KEY = 'exam_auth_user';
const AUTH_TOKEN_KEY = 'exam_auth_token';

class AuthService {
  private currentUser: AuthUser | null = null;
  private token: string | null = null;

  constructor() {
    this.loadPersistedAuth();
  }

  public loadPersistedAuth(): AuthUser | null {
    const userRow = db.getFirstSync<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', [AUTH_USER_KEY]);
    const tokenRow = db.getFirstSync<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', [AUTH_TOKEN_KEY]);

    if (userRow?.value) {
      try {
        this.currentUser = JSON.parse(userRow.value);
        this.token = tokenRow?.value || null;
      } catch {
        this.currentUser = null;
        this.token = null;
      }
    } else {
      this.currentUser = null;
      this.token = null;
    }
    return this.currentUser;
  }

  public getCurrentUser(): AuthUser | null {
    return this.currentUser;
  }

  public getToken(): string | null {
    return this.token;
  }

  public isLoggedIn(): boolean {
    return this.currentUser !== null;
  }

  public getEffectiveUserId(): string {
    return this.currentUser?.id || GUEST_USER_ID;
  }

  // 1. Register with Strict Pre-flight Duplicate Checks
  public async register(email: string, username: string, password: string, name: string): Promise<AuthResponse> {
    const cleanEmail = email.toLowerCase().trim();
    const cleanUsername = username.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');

    if (!cleanEmail || !cleanUsername || !password) {
      return { success: false, error: 'Username, email, and password are required.' };
    }

    if (cleanUsername.length < 3) {
      return { success: false, error: 'Username must be at least 3 characters long.' };
    }

    // Step A: Local database duplicate pre-check
    const localExisting = db.getFirstSync<{ id: string; username: string; email: string }>(
      'SELECT id, username, email FROM users WHERE username = ? OR email = ?',
      [cleanUsername, cleanEmail]
    );

    if (localExisting) {
      if (localExisting.username?.toLowerCase() === cleanUsername) {
        return { success: false, error: `Username @${cleanUsername} is already registered. Please choose another.` };
      }
      return { success: false, error: `An account with email ${cleanEmail} already exists. Please log in.` };
    }

    // Step B: Remote Cloudflare API registration
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, username: cleanUsername, password, name }),
      });

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || 'Registration failed.' };
      }

      // Record in local user registry
      db.runSync(
        'INSERT INTO users (id, username, email, name, created_at) VALUES (?, ?, ?, ?, ?)',
        [data.user.id, data.user.username, data.user.email, data.user.name, Date.now()]
      );

      this.saveSession(data.user, data.token);
      return { success: true, user: data.user, token: data.token };
    } catch {
      // Step C: Offline development fallback with guaranteed local unique persistence
      const mockUser: AuthUser = {
        id: 'usr_' + Math.random().toString(36).substring(2, 10),
        username: cleanUsername,
        email: cleanEmail,
        name: name.trim() || cleanUsername,
      };

      db.runSync(
        'INSERT INTO users (id, username, email, name, created_at) VALUES (?, ?, ?, ?, ?)',
        [mockUser.id, mockUser.username, mockUser.email, mockUser.name, Date.now()]
      );

      this.saveSession(mockUser, 'local_dev_token');
      return { success: true, user: mockUser, token: 'local_dev_token' };
    }
  }

  // 2. Login with Username OR Email
  public async login(identifier: string, password: string): Promise<AuthResponse> {
    const cleanId = identifier.toLowerCase().trim();
    if (!cleanId || !password) {
      return { success: false, error: 'Username/Email and password are required.' };
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: cleanId, password }),
      });

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || 'Invalid credentials.' };
      }

      // Save user to local registry
      db.runSync(
        'INSERT INTO users (id, username, email, name, created_at) VALUES (?, ?, ?, ?, ?)',
        [data.user.id, data.user.username, data.user.email, data.user.name, Date.now()]
      );

      this.saveSession(data.user, data.token);
      return { success: true, user: data.user, token: data.token };
    } catch {
      // Local fallback lookup
      const localUser = db.getFirstSync<{ id: string; username: string; email: string; name: string }>(
        'SELECT id, username, email, name FROM users WHERE username = ? OR email = ?',
        [cleanId, cleanId]
      );

      if (localUser) {
        const userObj: AuthUser = {
          id: localUser.id,
          username: localUser.username,
          email: localUser.email,
          name: localUser.name || localUser.username,
        };
        this.saveSession(userObj, 'local_dev_token');
        return { success: true, user: userObj, token: 'local_dev_token' };
      }

      return { success: false, error: `Account "${cleanId}" not found. Please register first.` };
    }
  }

  // 3. Complete Logout (Destroys memory and SQLite/Web session keys)
  public logout(): void {
    this.currentUser = null;
    this.token = null;
    db.runSync('DELETE FROM sync_meta WHERE key = ?;', [AUTH_USER_KEY]);
    db.runSync('DELETE FROM sync_meta WHERE key = ?;', [AUTH_TOKEN_KEY]);
  }

  private saveSession(user: AuthUser, token: string) {
    this.currentUser = user;
    this.token = token;
    db.runSync(
      `INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
      [AUTH_USER_KEY, JSON.stringify(user)]
    );
    db.runSync(
      `INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
      [AUTH_TOKEN_KEY, token]
    );
  }
}

export const authService = new AuthService();