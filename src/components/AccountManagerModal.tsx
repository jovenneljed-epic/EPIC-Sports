import React, { useState } from 'react';
import { X, KeyRound, UserPlus, Trash2, Shield, User } from 'lucide-react';
import { authStore, type UserAccount, type UserRole } from '../auth/authStore';

interface AccountManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount;
  onUserUpdated: (user: UserAccount) => void;
}

export const AccountManagerModal: React.FC<AccountManagerModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUserUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'users'>('profile');

  // Profile Edit State
  const [username, setUsername] = useState(currentUser.username);
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileMessage, setProfileMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // New User State
  const [newSubUsername, setNewSubUsername] = useState('');
  const [newSubDisplayName, setNewSubDisplayName] = useState('');
  const [newSubPassword, setNewSubPassword] = useState('');
  const [newSubRole, setNewSubRole] = useState<UserRole>('scorer');
  const [userList, setUserList] = useState<UserAccount[]>(() => authStore.getUsers());
  const [addUserMessage, setAddUserMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMessage(null);

    if (newPassword && newPassword !== confirmPassword) {
      setProfileMessage({ type: 'err', text: 'Passwords do not match.' });
      return;
    }

    const success = authStore.updateProfile(currentUser.id, username, displayName, newPassword || undefined);
    if (success) {
      setProfileMessage({ type: 'ok', text: 'Credentials updated successfully!' });
      setNewPassword('');
      setConfirmPassword('');
      const updated = authStore.getCurrentUser();
      if (updated) onUserUpdated(updated);
    } else {
      setProfileMessage({ type: 'err', text: 'Username already taken by another account.' });
    }
  };

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    setAddUserMessage(null);

    if (!newSubUsername.trim() || !newSubPassword.trim()) {
      setAddUserMessage({ type: 'err', text: 'Username and password are required.' });
      return;
    }

    const res = authStore.addUser({
      username: newSubUsername,
      displayName: newSubDisplayName.trim() || newSubUsername,
      passwordHash: newSubPassword,
      role: newSubRole,
    });

    if (res.success) {
      setAddUserMessage({ type: 'ok', text: `User ${newSubUsername} added as ${newSubRole}.` });
      setNewSubUsername('');
      setNewSubDisplayName('');
      setNewSubPassword('');
      setUserList(authStore.getUsers());
    } else {
      setAddUserMessage({ type: 'err', text: res.error || 'Failed to add user.' });
    }
  };

  const handleDeleteUser = (id: string, name: string) => {
    if (id === currentUser.id) {
      alert('You cannot delete your own logged-in account.');
      return;
    }
    if (window.confirm(`Remove user "${name}"?`)) {
      authStore.deleteUser(id);
      setUserList(authStore.getUsers());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5" />
            <div>
              <h3 className="font-black text-base uppercase tracking-tight">Security & Authentication Control</h3>
              <p className="text-xs font-semibold opacity-90">Manage Credentials and Table Official Permissions</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-full bg-black/10 hover:bg-black/30 cursor-pointer">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 p-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`flex-1 py-2 font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'profile' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" /> Edit My Login & Password
          </button>

          {currentUser.role === 'commissioner' && (
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`flex-1 py-2 font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'users' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" /> Manage Table Officials ({userList.length})
            </button>
          )}
        </div>

        {/* Tab 1: Profile & Password Edit */}
        {activeTab === 'profile' && (
          <form onSubmit={handleUpdateProfile} className="p-6 space-y-4 overflow-y-auto text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Display Name</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-semibold focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-semibold focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="pt-3 border-t border-slate-800 space-y-3">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Change Password (Optional)</span>
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">New Password</label>
                <input
                  type="password"
                  placeholder="Leave blank to keep current password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-semibold focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Confirm New Password</label>
                <input
                  type="password"
                  placeholder="Repeat new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-semibold focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {profileMessage && (
              <div
                className={`p-2.5 rounded-xl text-center font-bold ${
                  profileMessage.type === 'ok'
                    ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                    : 'bg-red-950/60 text-red-400 border border-red-800'
                }`}
              >
                {profileMessage.text}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-2.5 rounded-xl cursor-pointer shadow-lg transition"
            >
              Save Changes
            </button>
          </form>
        )}

        {/* Tab 2: Sub-User Creator & Permissions (Commissioner Only) */}
        {activeTab === 'users' && (
          <div className="p-6 space-y-5 overflow-y-auto text-xs">
            {/* Create user form */}
            <form onSubmit={handleCreateUser} className="space-y-3 bg-slate-950 p-4 rounded-2xl border border-slate-800">
              <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider">Register Table Scorer</span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Login Username"
                  value={newSubUsername}
                  onChange={(e) => setNewSubUsername(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                />
                <input
                  type="password"
                  required
                  placeholder="Password"
                  value={newSubPassword}
                  onChange={(e) => setNewSubPassword(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Full Name (e.g. Scorer Mark)"
                  value={newSubDisplayName}
                  onChange={(e) => setNewSubDisplayName(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                />
                <select
                  value={newSubRole}
                  onChange={(e) => setNewSubRole(e.target.value as UserRole)}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 font-bold"
                >
                  <option value="scorer">Table Scorer (Score & Check-In)</option>
                  <option value="viewer">Viewer (Read-Only Scoreboard)</option>
                  <option value="commissioner">Co-Commissioner (Full Admin)</option>
                </select>
              </div>
              {addUserMessage && (
                <p
                  className={`text-[11px] font-bold text-center ${
                    addUserMessage.type === 'ok' ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {addUserMessage.text}
                </p>
              )}
              <button
                type="submit"
                className="w-full bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold py-2 rounded-xl cursor-pointer"
              >
                + Register Official
              </button>
            </form>

            {/* List of active users */}
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Active System Users</span>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {userList.map((u) => (
                  <div key={u.id} className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-slate-500" />
                      <div>
                        <p className="font-bold text-white leading-tight">{u.displayName}</p>
                        <p className="text-[10px] text-slate-400 font-mono">@{u.username}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${
                          u.role === 'commissioner'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : u.role === 'scorer'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {u.role}
                      </span>
                      {u.id !== currentUser.id && u.id !== 'usr_commissioner' && (
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u.id, u.displayName)}
                          className="text-slate-500 hover:text-red-400 p-1 cursor-pointer"
                          title="Remove user"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};