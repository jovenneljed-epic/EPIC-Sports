export type UserRole = 'commissioner' | 'scorer' | 'viewer';

export interface UserAccount {
  id: string;
  username: string;
  passwordHash: string; // Plain/hashed comparison key
  displayName: string;
  role: UserRole;
  createdAt: string;
}

const STORAGE_KEY_USERS = 'epic_sports_users';
const STORAGE_KEY_SESSION = 'epic_sports_session';

// Default commissioner account initialized on first run
const ROOT_ADMIN: UserAccount = {
  id: 'usr_commissioner',
  username: 'admin',
  passwordHash: '2026',
  displayName: 'Tournament Commissioner',
  role: 'commissioner',
  createdAt: new Date().toISOString(),
};

export const authStore = {
  // Retrieve all accounts
  getUsers(): UserAccount[] {
    const raw = localStorage.getItem(STORAGE_KEY_USERS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify([ROOT_ADMIN]));
      return [ROOT_ADMIN];
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : [ROOT_ADMIN];
    } catch {
      return [ROOT_ADMIN];
    }
  },

  // Get active session
  getCurrentUser(): UserAccount | null {
    const raw = localStorage.getItem(STORAGE_KEY_SESSION);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  // Login
  login(username: string, password: string): { success: boolean; user?: UserAccount; error?: string } {
    const users = this.getUsers();
    const cleanUser = username.trim().toLowerCase();

    const matched = users.find(
      (u) => u.username.toLowerCase() === cleanUser && u.passwordHash === password
    );

    if (!matched) {
      return { success: false, error: 'Invalid username or password credentials.' };
    }

    localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(matched));
    return { success: true, user: matched };
  },

  // Logout
  logout() {
    localStorage.removeItem(STORAGE_KEY_SESSION);
  },

  // Update own credentials (username, password, display name)
  updateProfile(userId: string, newUsername: string, newDisplayName: string, newPassword?: string): boolean {
    const users = this.getUsers();
    const targetIdx = users.findIndex((u) => u.id === userId);
    if (targetIdx === -1) return false;

    // Check if new username is taken by someone else
    const usernameTaken = users.some(
      (u) => u.id !== userId && u.username.toLowerCase() === newUsername.trim().toLowerCase()
    );
    if (usernameTaken) return false;

    users[targetIdx].username = newUsername.trim();
    users[targetIdx].displayName = newDisplayName.trim();
    if (newPassword && newPassword.trim().length > 0) {
      users[targetIdx].passwordHash = newPassword.trim();
    }

    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(users[targetIdx]));
    return true;
  },

  // Add sub-user (Scorer / Viewer)
  addUser(account: Omit<UserAccount, 'id' | 'createdAt'>): { success: boolean; error?: string } {
    const users = this.getUsers();
    const cleanUser = account.username.trim().toLowerCase();

    if (users.some((u) => u.username.toLowerCase() === cleanUser)) {
      return { success: false, error: 'Username already registered.' };
    }

    const newUser: UserAccount = {
      ...account,
      id: `usr_${Date.now()}`,
      username: cleanUser,
      createdAt: new Date().toISOString(),
    };

    users.push(newUser);
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    return { success: true };
  },

  // Remove sub-user
  deleteUser(userId: string): boolean {
    const users = this.getUsers();
    if (userId === 'usr_commissioner') return false; // Prevent root lockout
    const filtered = users.filter((u) => u.id !== userId);
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(filtered));
    return true;
  },
};