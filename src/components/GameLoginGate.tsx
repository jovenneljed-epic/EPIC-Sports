import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { KeyRound, ShieldCheck, Trophy } from 'lucide-react';

interface GameLoginGateProps {
  onGameAuthenticated: (matchData: any) => void;
}

export function GameLoginGate({ onGameAuthenticated }: GameLoginGateProps) {
  const [gameId, setGameId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Query Supabase for the unique game ID credentials
      const { data, error: dbError } = await supabase
        .from('game_credentials')
        .select('*')
        .eq('game_id', gameId.trim().toUpperCase())
        .maybeSingle();

      if (dbError) throw dbError;

      if (!data) {
        setError('Invalid Game ID. Please check with your tournament commissioner.');
        setLoading(false);
        return;
      }

      // Verify the dedicated game password
      if (data.game_password !== password.trim()) {
        setError('Incorrect passcode for this game ID.');
        setLoading(false);
        return;
      }

      // Pass the authenticated match configuration up to App.tsx
      onGameAuthenticated(data);
    } catch (err: any) {
      console.error(err);
      setError('Authentication error. Please try again.');
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
          <h1 className="text-xl font-black uppercase tracking-tight text-white">EPIC Court Scorer Terminal</h1>
          <p className="text-xs text-slate-400">Enter your assigned Unique Game ID and Passcode to initialize officiating.</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl text-center font-bold">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-400 mb-1 uppercase tracking-wider">Unique Game ID</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                <ShieldCheck className="w-4 h-4" />
              </span>
              <input
                type="text"
                required
                placeholder="e.g. EPIC-BBALL-01"
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3 py-3 text-white font-mono font-bold uppercase tracking-wider focus:border-blue-500 outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-400 mb-1 uppercase tracking-wider">Dedicated Game Password</label>
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
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-xl text-xs uppercase tracking-wider shadow-lg transition cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Authenticating Court...' : '🔓 Initialize Scorer Desk'}
          </button>
        </form>

        <div className="text-center text-[10px] text-slate-600 pt-2 border-t border-slate-800/80">
          Powered by Kezjed Solutions • Commercial Edition
        </div>
      </div>
    </div>
  );
}