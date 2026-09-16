import React, { useState } from 'react';
import { ShieldCheck, User, KeyRound, AlertCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { type UserAccount } from '../auth/authStore';

interface AdminLoginGateProps {
  onAuthenticated: (user: UserAccount) => void;
}

export const AdminLoginGate: React.FC<AdminLoginGateProps> = ({ onAuthenticated }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setError('');
    setIsSubmitting(true);

    try {
      // Query the database directly for user verification
      const { data, error: dbError } = await supabase
        .from('user_accounts')
        .select('*')
        .eq('username', username.trim())
        .eq('password', password) // In production, match your hashed password approach
        .single();

      if (dbError || !data) {
        throw new Error('Invalid username or password.');
      }

      const authenticatedUser: UserAccount = {
        id: data.id,
        username: data.username,
        displayName: data.display_name || data.username,
        role: data.role || 'scorer'
      };

      setTimeout(() => {
        onAuthenticated(authenticatedUser);
      }, 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication encountered an error.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans selection:bg-blue-600 selection:text-white">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />

        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-3 mb-6">
          <img
            src="/epic-logo.png"
            alt="EPIC Logo"
            className="w-16 h-16 rounded-2xl shadow-xl border border-blue-500/30 object-cover"
          />
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white uppercase">EPIC SPORTS</h1>
            <p className="text-xs font-bold text-amber-400 tracking-wider uppercase mt-0.5">powered by Kezjed</p>
            <p className="text-[11px] text-slate-400 font-semibold mt-1">Official Tournament Desk Access Gate</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1.5">Username</label>
            <div className="relative">
              <input
                type="text"
                required
                autoFocus
                disabled={isSubmitting}
                placeholder="e.g. admin or scorer1"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (error) setError('');
                }}
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 disabled:opacity-50 rounded-2xl pl-11 pr-4 py-3 text-sm text-white focus:outline-none transition font-semibold"
              />
              <User className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1.5">Password</label>
            <div className="relative">
              <input
                type="password"
                required
                disabled={isSubmitting}
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 disabled:opacity-50 rounded-2xl pl-11 pr-4 py-3 text-sm text-white focus:outline-none transition font-semibold"
              />
              <KeyRound className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
            </div>
            {error && (
              <p className="text-red-400 text-xs font-semibold flex items-center gap-1.5 mt-2 animate-in fade-in duration-100">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-50 text-white font-black py-3 rounded-2xl text-xs uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-blue-950/60"
          >
            <ShieldCheck className="w-4 h-4" /> 
            {isSubmitting ? 'Authenticating...' : 'Authenticate & Unlock Table'}
          </button>
        </form>

        {/* Credentials Reminder */}
        <div className="mt-4 p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl text-center text-[11px] text-slate-400">
          Database Authentication Active
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-slate-800 text-center space-y-1.5">
          <p className="text-[10px] text-slate-400 italic">
            "I can do all things through Christ who strengthens me." <span className="text-amber-400/90 font-semibold not-italic">— Philippians 4:13</span>
          </p>
          <p className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold">
            Registered Trademark by <span className="text-slate-400">Kezjed Solutions</span>
          </p>
        </div>
      </div>
    </div>
  );
};