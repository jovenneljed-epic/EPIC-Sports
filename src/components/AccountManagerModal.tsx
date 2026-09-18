import React, { useState, useEffect } from 'react';
import { X, Trash2, Edit2, CheckCircle, Ban, ShieldAlert } from 'lucide-react';
import { authStore, type UserAccount } from '../auth/authStore';

interface AccountManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount;
  onUserUpdated: (updated: UserAccount) => void;
}

export const AccountManagerModal: React.FC<AccountManagerModalProps> = ({ isOpen, onClose, currentUser, onUserUpdated }) => {
  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'manage'>('profile');
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  
  // Profile form states (Only editable by Commissioner)
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [username, setUsername] = useState(currentUser.username);
  const [newPassword, setNewPassword] = useState('');

  // Sub-account form states
  const [editingAccount, setEditingAccount] = useState<UserAccount | null>(null);
  const [modalUsername, setModalUsername] = useState('');
  const [modalDisplayName, setModalDisplayName] = useState('');
  const [modalRole, setModalRole] = useState<'committee' | 'viewer'>('committee');
  const [modalPassword, setModalPassword] = useState('');

  const isCommissioner = currentUser.role === 'commissioner';

  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (isOpen && isCommissioner) {
        const data = await authStore.getAllAccounts();
        if (isMounted) setAccounts(data || []);
      }
    }
    load();
    return () => { isMounted = false; };
  }, [isOpen, isCommissioner]);

  if (!isOpen) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCommissioner) {
      alert("Permission denied. Only the Administrator can modify account details.");
      return;
    }
    const updated: UserAccount = { 
      ...currentUser, 
      displayName, 
      username, 
      ...(newPassword ? { password: newPassword } : {}) 
    };
    await authStore.saveAccount(updated);
    onUserUpdated(updated);
    alert('Profile updated successfully in database!');
  };

  const handleSaveSubAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCommissioner) return;

    if (!modalUsername || !modalDisplayName) {
      alert('Please fill in all required fields.');
      return;
    }

    const accountData: UserAccount = {
      id: editingAccount ? editingAccount.id : `usr_${Date.now()}`,
      username: modalUsername.trim(),
      displayName: modalDisplayName.trim(),
      role: modalRole,
      isActive: editingAccount ? editingAccount.isActive : true,
      ...(modalPassword ? { password: modalPassword } : {})
    };

    await authStore.saveAccount(accountData);
    const updatedList = await authStore.getAllAccounts();
    setAccounts(updatedList);
    setEditingAccount(null);
    setModalUsername('');
    setModalDisplayName('');
    setModalPassword('');
    alert('Account successfully saved to database!');
  };

  const handleToggleStatus = async (acc: UserAccount) => {
    if (!isCommissioner) return;
    if (acc.username === currentUser.username) {
      alert("You cannot disable your own active admin account.");
      return;
    }
    const updated = { ...acc, isActive: !acc.isActive };
    await authStore.saveAccount(updated);
    setAccounts(await authStore.getAllAccounts());
  };

  const handleDelete = async (usernameOrId: string) => {
    if (!isCommissioner) return;
    if (usernameOrId === currentUser.username) {
      alert("You cannot delete your own admin account.");
      return;
    }
    if (window.confirm("Are you sure you want to permanently delete this account from the database?")) {
      await authStore.deleteAccount(usernameOrId);
      setAccounts(await authStore.getAllAccounts());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-slate-950 p-5 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h3 className="text-base font-black text-white uppercase tracking-wider">Database Security & Permissions</h3>
            <p className="text-xs text-slate-400">
              {isCommissioner ? 'Administrator Access Granted' : 'Restricted Staff Account'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-navigation tabs */}
        <div className="flex bg-slate-950/60 px-5 pt-3 border-b border-slate-800 gap-2">
          <button
            type="button"
            onClick={() => setActiveSubTab('profile')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl transition cursor-pointer ${activeSubTab === 'profile' ? 'bg-slate-900 text-amber-400 border-t border-x border-slate-800' : 'text-slate-400 hover:text-white'}`}
          >
            Account Details
          </button>
          {isCommissioner && (
            <button
              type="button"
              onClick={() => setActiveSubTab('manage')}
              className={`px-4 py-2 text-xs font-bold rounded-t-xl transition cursor-pointer ${activeSubTab === 'manage' ? 'bg-slate-900 text-amber-400 border-t border-x border-slate-800' : 'text-slate-400 hover:text-white'}`}
            >
              Manage Database Accounts ({accounts.length})
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {activeSubTab === 'profile' ? (
            isCommissioner ? (
              <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-400 mb-1">Display Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-400 mb-1">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-bold"
                    required
                  />
                </div>
                <div className="pt-2 border-t border-slate-800">
                  <label className="block font-bold text-slate-400 mb-1">New Password (Optional)</label>
                  <input
                    type="password"
                    autoComplete="current-password"
                    placeholder="Leave blank to keep current password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-bold"
                  />
                </div>
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-xl transition cursor-pointer shadow">
                  Save Profile Changes
                </button>
              </form>
            ) : (
              <div className="text-center py-8 space-y-3">
                <div className="w-12 h-12 bg-amber-500/10 text-amber-400 rounded-2xl flex items-center justify-center mx-auto border border-amber-500/20">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-black text-white">Staff Account Restrictions Active</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  You are logged in as a committee/staff member. Account modifications, password changes, and user management are restricted to the Tournament Administrator.
                </p>
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-left max-w-sm mx-auto space-y-2 text-xs">
                  <div><span className="text-slate-500">Name:</span> <strong className="text-white">{currentUser.displayName}</strong></div>
                  <div><span className="text-slate-500">Username:</span> <strong className="text-white">@{currentUser.username}</strong></div>
                  <div><span className="text-slate-500">Role:</span> <strong className="text-amber-400 uppercase">{currentUser.role}</strong></div>
                </div>
              </div>
            )
          ) : (
            isCommissioner && (
              <div className="space-y-6">
                {/* Add / Edit Sub-Account Form */}
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                  <h4 className="text-xs font-black uppercase text-blue-400">
                    {editingAccount ? 'Edit Account' : 'Register New Committee / Viewer'}
                  </h4>
                  <form onSubmit={handleSaveSubAccount} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <input
                      type="text"
                      placeholder="Display Name (e.g. Scorer John)"
                      value={modalDisplayName}
                      onChange={(e) => setModalDisplayName(e.target.value)}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Username"
                      value={modalUsername}
                      onChange={(e) => setModalUsername(e.target.value)}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                      required
                    />
                    <select
                      value={modalRole}
                      onChange={(e) => setModalRole(e.target.value as any)}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                    >
                      <option value="committee">Committee (Scorer / Staff)</option>
                      <option value="viewer">Viewer (Read-Only)</option>
                    </select>
                    <input
                      type="password"
                      autoComplete="current-password"
                      placeholder="Password"
                      value={modalPassword}
                      onChange={(e) => setModalPassword(e.target.value)}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                      {...(!editingAccount ? { required: true } : {})}
                    />
                    <div className="sm:col-span-2 flex gap-2 pt-1">
                      <button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black py-2 rounded-xl transition cursor-pointer">
                        {editingAccount ? 'Update Account' : 'Create Account'}
                      </button>
                      {editingAccount && (
                        <button type="button" onClick={() => { setEditingAccount(null); setModalUsername(''); setModalDisplayName(''); }} className="px-4 bg-slate-800 text-slate-300 py-2 rounded-xl text-xs font-bold cursor-pointer">
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>
                </div>

                {/* Accounts List Table */}
                <div className="space-y-2">
                  <h4 className="text-xs font-black uppercase text-slate-400">All Database Accounts</h4>
                  <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                        <tr>
                          <th className="p-3">Name / Username</th>
                          <th className="p-3">Role</th>
                          <th className="p-3 text-center">Status</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {accounts.map((acc) => (
                          <tr key={acc.id || acc.username} className="hover:bg-slate-900/50">
                            <td className="p-3">
                              <div className="font-bold text-white">{acc.displayName}</div>
                              <div className="text-[10px] text-slate-500 font-mono">@{acc.username}</div>
                            </td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${acc.role === 'commissioner' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'}`}>
                                {acc.role}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              {acc.isActive ? (
                                <span className="text-emerald-400 inline-flex items-center gap-1 font-bold text-[10px]"><CheckCircle className="w-3 h-3" /> Active</span>
                              ) : (
                                <span className="text-red-400 inline-flex items-center gap-1 font-bold text-[10px]"><Ban className="w-3 h-3" /> Disabled</span>
                              )}
                            </td>
                            <td className="p-3 text-right space-x-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingAccount(acc);
                                  setModalUsername(acc.username);
                                  setModalDisplayName(acc.displayName);
                                  setModalRole(acc.role === 'commissioner' ? 'committee' : acc.role);
                                }}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-lg font-bold text-[11px] cursor-pointer"
                                title="Edit"
                              >
                                <Edit2 className="w-3 h-3 inline" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleStatus(acc)}
                                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] cursor-pointer ${acc.isActive ? 'bg-amber-950/40 text-amber-400 hover:bg-amber-900/60' : 'bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/60'}`}
                                title={acc.isActive ? 'Disable Account' : 'Enable Account'}
                              >
                                {acc.isActive ? 'Disable' : 'Enable'}
                              </button>
                              {acc.role !== 'commissioner' && (
                                <button
                                  type="button"
                                  onClick={() => handleDelete(acc.username)}
                                  className="px-2.5 py-1 bg-red-950/40 hover:bg-red-900/60 text-red-400 rounded-lg font-bold text-[11px] cursor-pointer"
                                  title="Delete Account"
                                >
                                  <Trash2 className="w-3 h-3 inline" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};