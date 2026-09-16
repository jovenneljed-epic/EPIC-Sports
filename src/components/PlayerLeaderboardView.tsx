import React, { useEffect, useState } from 'react';
import { fetchPlayerLeaderboard } from '../services/statsService';
import { PlayerHeroCard } from './PlayerHeroCard';
import { Trophy, RefreshCw, Users } from 'lucide-react';
import { type PlayerStatSummary } from '../types/stats';

export const PlayerLeaderboardView: React.FC = () => {
  const [leaderboard, setLeaderboard] = useState<PlayerStatSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    const data = await fetchPlayerLeaderboard();
    setLeaderboard(data);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header & Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" /> Player Leaderboard & Hero Cards
          </h2>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">
            Real-time tournament player performance metrics powered by Supabase
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 px-4 py-2 rounded-2xl text-xs font-bold flex items-center gap-2 transition active:scale-95 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Stats
        </button>
      </div>

      {/* Content Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="bg-slate-900/50 border border-slate-800/80 rounded-3xl p-6 h-48 animate-pulse" />
          ))}
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center space-y-3">
          <div className="w-12 h-12 bg-slate-800 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">No Player Stats Recorded Yet</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Add players and match statistics to your Supabase tables to see live hero cards and rankings populate here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {leaderboard.map((stat, index) => (
            <PlayerHeroCard key={stat.playerId} stat={stat} rank={index + 1} />
          ))}
        </div>
      )}
    </div>
  );
};