import React, { useState } from 'react';
import { PlayerLeaderboardView } from './PlayerLeaderboardView';
import { Trophy, LayoutDashboard, Shield } from 'lucide-react';

export const TournamentDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'leaderboard'>('leaderboard');

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-black">
              EP
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight uppercase">EPIC Sports Desk</h1>
              <p className="text-xs text-slate-400">Tournament Management & Live Stats</p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-900 p-1.5 border border-slate-800 rounded-2xl">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'overview'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" /> Brackets & Matches
            </button>
            <button
              onClick={() => setActiveTab('leaderboard')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'leaderboard'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Trophy className="w-3.5 h-3.5" /> Player Hero Cards
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center space-y-3">
            <Shield className="w-10 h-10 text-blue-500 mx-auto" />
            <h2 className="text-base font-bold text-white">Tournament Bracket View</h2>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Your match schedules and brackets will display here. Click the "Player Hero Cards" tab above to test the live Supabase player leaderboards!
            </p>
          </div>
        ) : (
          <PlayerLeaderboardView />
        )}

      </div>
    </div>
  );
};