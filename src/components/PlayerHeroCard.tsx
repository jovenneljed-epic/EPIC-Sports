import React from 'react';
import { Trophy, Award, Zap, Shield } from 'lucide-react';
import { type PlayerStatSummary } from '../types/stats';

interface PlayerHeroCardProps {
  stat: PlayerStatSummary;
  rank: number;
}

export const PlayerHeroCard: React.FC<PlayerHeroCardProps> = ({ stat, rank }) => {
  const getRankBadge = (r: number) => {
    if (r === 1) return 'bg-amber-500 text-slate-950 border-amber-400 shadow-amber-500/30';
    if (r === 2) return 'bg-slate-300 text-slate-950 border-slate-200 shadow-slate-300/30';
    if (r === 3) return 'bg-amber-700 text-white border-amber-600 shadow-amber-700/30';
    return 'bg-slate-900 text-slate-400 border-slate-800';
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden group hover:border-blue-500/50 transition-all duration-300">
      {/* Glow Effect */}
      <div className="absolute -top-16 -right-16 w-32 h-32 bg-blue-600/10 rounded-full blur-2xl group-hover:bg-blue-600/20 transition" />

      {/* Rank & Header */}
      <div className="flex items-center justify-between mb-4">
        <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shadow-lg border ${getRankBadge(rank)}`}>
          #{rank}
        </span>
        <div className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full text-blue-400 text-xs font-bold">
          <Zap className="w-3.5 h-3.5" /> {stat.totalPoints} PTS
        </div>
      </div>

      {/* Player Identity */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xl font-black text-white shadow-inner uppercase">
          {stat.playerName.substring(0, 2)}
        </div>
        <div>
          <h3 className="text-base font-black text-white tracking-tight">{stat.playerName}</h3>
          <p className="text-xs text-slate-400 font-semibold">{stat.teamName || 'Independent Roster'}</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2 pt-4 border-t border-slate-800/80 text-center">
        <div className="bg-slate-950/60 border border-slate-800/60 rounded-2xl p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Assists</p>
          <p className="text-sm font-black text-slate-200">{stat.totalAssists}</p>
        </div>
        <div className="bg-slate-950/60 border border-slate-800/60 rounded-2xl p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">MVPs</p>
          <p className="text-sm font-black text-amber-400 flex items-center justify-center gap-1">
            <Trophy className="w-3.5 h-3.5" /> {stat.mvpCount}
          </p>
        </div>
        <div className="bg-slate-950/60 border border-slate-800/60 rounded-2xl p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Games</p>
          <p className="text-sm font-black text-slate-200">{stat.gamesPlayed}</p>
        </div>
      </div>
    </div>
  );
};