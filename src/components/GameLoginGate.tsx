import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { authStore } from '../auth/authStore';
import { KeyRound, ShieldCheck, Trophy, UserCheck } from 'lucide-react';

interface GameLoginGateProps {
  onGameAuthenticated: (matchData: any) => void;
  onAdminAuthenticated: (user: any) => void;
}

export function GameLoginGate({ onGameAuthenticated, onAdminAuthenticated }: GameLoginGateProps) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleHybridLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const cleanId = identifier.trim();
    const cleanPass = password.trim();

    try {
      // 1. Check if the input starts with 'EPIC-' or looks like a Game Token
      if (cleanId.toUpperCase().startsWith('EPIC-')) {
        const { data, error: dbError } = await supabase
          .from('game_credentials')
          .select('*')
          .eq('game_id', cleanId.toUpperCase())
          .maybeSingle();

        if (dbError) throw dbError;

        if (!data) {
          setError('Invalid Game ID token.');
          setLoading(false);
          return;
        }

        if (data.game_password !== cleanPass) {
          setError('Incorrect passcode for this game token.');
          setLoading(false);
          return;
        }

        onGameAuthenticated(data);
        return;
      }

      // 2. Otherwise, treat it as a Master Commissioner / Admin Account login
      const adminUser = await authStore.login(cleanId, cleanPass);
      if (adminUser) {
        onAdminAuthenticated(adminUser);
        return;
      }

      setError('Invalid master username, password, or game token.');
    } catch (err: any) {
      console.error(err);
      setError('Authentication failed. Please check your network or credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto text-amber-400 shadow-inner">
            <Trophy className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-black uppercase tracking-tight text-white">EPIC Tournament Portal</h1>
          <p className="text-xs text-slate-400">Log in with your Commissioner Account or Court Game Token.</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl text-center font-bold">
            {error}
          </div>
        )}

        <form onSubmit={handleHybridLogin} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-400 mb-1 uppercase tracking-wider">Username or Game ID</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                <ShieldCheck className="w-4 h-4" />
              </span>
              <input
                type="text"
                required
                placeholder="e.g. admin or EPIC-BASK-7399"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3 py-3 text-white font-bold focus:border-blue-500 outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-400 mb-1 uppercase tracking-wider">Password or Game Passcode</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                <KeyRound className="w-4 h-4" />
              </span>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3 py-3 text-white font-bold focus:border-blue-500 outline-none transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-xl text-xs uppercase tracking-wider shadow-lg transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <UserCheck className="w-4 h-4" /> {loading ? 'Authenticating...' : 'Authenticate & Enter Portal'}
          </button>
        </form>

        <div className="text-center text-[10px] text-slate-600 pt-2 border-t border-slate-800/80">
          Powered by Kezjed Solutions • Commercial Hybrid Access
        </div>
      </div>
    </div>
  );
}