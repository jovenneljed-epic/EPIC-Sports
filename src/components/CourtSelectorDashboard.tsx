
import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Monitor, Activity } from 'lucide-react';

interface LiveCourt {
  match_id: string;
  org_id: string;
  court_name: string;
  match_data: any;
  updated_at: string;
}

interface CourtSelectorDashboardProps {
  sessionId: string;
  onSelectCourtMatch: (matchData: any) => void;
}

export function CourtSelectorDashboard({ sessionId, onSelectCourtMatch }: CourtSelectorDashboardProps) {
  const [liveCourts, setLiveCourts] = useState<LiveCourt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLiveCourts() {
      try {
        const { data, error } = await supabase
          .from('live_active_matches')
          .select('*')
          .eq('org_id', sessionId);

        if (error) throw error;
        if (data) setLiveCourts(data);
      } catch (err) {
        console.error('Error fetching live courts:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchLiveCourts();

    // Subscribe to real-time changes across all courts simultaneously
    const channel = supabase
      .channel('court-selector-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_active_matches' },
        () => {
          fetchLiveCourts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  if (loading) {
    return <div className="text-center py-12 text-slate-400 text-xs">Loading active arena courts...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-md">
        <div>
          <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400 animate-pulse" /> Multi-Court Live Control Center
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Monitor and switch between simultaneous games running across different venue courts.</p>
        </div>
      </div>

      {liveCourts.length === 0 ? (
        <div className="bg-slate-900/50 border-2 border-dashed border-slate-800 rounded-3xl p-12 text-center space-y-3">
          <Monitor className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-sm font-bold text-white">No Simultaneous Matches Active</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">Load matches from your tournament schedule to run multiple games concurrently across different courts.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {liveCourts.map((court) => {
            const m = court.match_data;
            return (
              <div key={court.match_id} className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4 hover:border-blue-500/50 transition">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <span className="text-[11px] font-black uppercase px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-lg">
                    📍 {court.court_name}
                  </span>
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                    {m.status} • {m.quarter}
                  </span>
                </div>

                <div className="flex items-center justify-between text-center py-2">
                  <div className="flex-1 truncate px-1">
                    <p className="text-[10px] text-slate-500 font-bold uppercase truncate">Home</p>
                    <h4 className="text-xs font-black text-white truncate mt-0.5">{m.teamAName || 'Home Team'}</h4>
                    <span className="text-3xl font-black text-amber-400 tabular-nums">{m.scoreA}</span>
                  </div>
                  <span className="text-slate-700 font-bold text-xl px-1">:</span>
                  <div className="flex-1 truncate px-1">
                    <p className="text-[10px] text-slate-500 font-bold uppercase truncate">Away</p>
                    <h4 className="text-xs font-black text-white truncate mt-0.5">{m.teamBName || 'Away Team'}</h4>
                    <span className="text-3xl font-black text-cyan-400 tabular-nums">{m.scoreB}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectCourtMatch(m)}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow"
                >
                  <Monitor className="w-3.5 h-3.5" /> Control This Court Desk
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}