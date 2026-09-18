import { supabase } from '../supabaseClient';

export interface UserAccount {
  id: string;
  username: string;
  displayName: string;
  role: 'commissioner' | 'committee' | 'viewer';
  isActive: boolean;
  password?: string;
}

const CURRENT_USER_KEY = 'epic_current_user';
const STORAGE_KEY = 'epic_accounts';

export const authStore = {
  // Retrieve currently logged-in user session
  getCurrentUser: async (): Promise<UserAccount | null> => {
    const stored = localStorage.getItem(CURRENT_USER_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    }
    return null;
  },

  // Authenticate user against your real Supabase user_accounts table
  login: async (username: string, password?: string): Promise<UserAccount | null> => {
    try {
      const { data, error } = await supabase
        .from('user_accounts')
        .select('*')
        .ilike('username', username.trim());

      // Handle database errors gracefully without crashing or showing raw query codes
      if (error || !data || data.length === 0) {
        console.warn("Authentication warning: Username not found or multiple matches.");
        return null;
      }

      // If multiple rows are returned, pick the first match or handle appropriately
      const userRow = data[0];

      // Verify password if provided
      if (userRow.password && password && userRow.password !== password) {
        return null;
      }

      const user: UserAccount = {
        id: userRow.id || userRow.username,
        username: userRow.username,
        displayName: userRow.display_name,
        role: userRow.role,
        isActive: userRow.is_active ?? true,
        password: userRow.password
      };

      if (!user.isActive) {
        throw new Error("This account has been disabled by the Administrator.");
      }

      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
      return user;
    } catch (err: any) {
      console.error("Login authentication exception:", err.message);
      return null;
    }
  },

  // Clear local session
  logout: () => {
    localStorage.removeItem(CURRENT_USER_KEY);
  },

  // Fetch all accounts from Supabase
  getAllAccounts: async (): Promise<UserAccount[]> => {
    const { data, error } = await supabase
      .from('user_accounts')
      .select('*');

    if (error || !data) {
      console.error('Error fetching accounts from Supabase:', error);
      return [];
    }

    return data.map((row: any) => ({
      id: row.id || row.username,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
      isActive: row.is_active ?? true,
      password: row.password
    }));
  },


// Inside your authStore.ts saveAccount method:
saveAccount: async (account: UserAccount) => {
  const payload: any = {
    // Always provide an explicit id so it never evaluates to null
    id: account.id && !account.id.startsWith('acc_') ? account.id : `usr_${Date.now()}`,
    username: account.username.trim(),
    display_name: account.displayName.trim(),
    role: account.role,
    ...(account.password ? { password: account.password } : {})
  };

  const { error } = await supabase
    .from('user_accounts')
    .upsert(payload, { onConflict: 'username' });

  if (error) {
    console.error('Detailed Supabase Save Error:', JSON.stringify(error, null, 2));
    throw error;
  }

  const currentUser = await authStore.getCurrentUser();
  if (currentUser && currentUser.username === account.username) {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(account));
  }
},
  // Delete account from Supabase
  deleteAccount: async (usernameOrId: string) => {
    const { error } = await supabase
      .from('user_accounts')
      .delete()
      .or(`id.eq.${usernameOrId},username.eq.${usernameOrId}`);

    if (error) {
      console.error('Error deleting account from Supabase:', error);
      throw error;
    }
  }
};