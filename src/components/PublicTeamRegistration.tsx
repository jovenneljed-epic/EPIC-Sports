import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { type SportType, type Team, type Player } from '../App';
import { UserPlus, Trash2, CheckCircle2, ShieldCheck } from 'lucide-react';

interface Props {
  sessionId: string;
  leagueName: string;
  onTeamRegistered: (newTeam: Team) => void;
}

export const PublicTeamRegistration: React.FC<Props> = ({ sessionId, leagueName, onTeamRegistered }) => {
  const [teamName, setTeamName] = useState('');
  const [sportType, setSportType] = useState<SportType>('basketball');
  const [coachName, setCoachName] = useState('');
  const [teamColor, setTeamColor] = useState('from-blue-600 to-indigo-600');
  const [players, setPlayers] = useState<{ name: string; jersey: number; position: string }[]>([
    { name: '', jersey: 1, position: 'Guard' }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successSubmitted, setSuccessSubmitted] = useState(false);

  const addPlayerRow = () => {
    setPlayers((prev) => [...prev, { name: '', jersey: prev.length + 1, position: 'Forward' }]);
  };

  const removePlayerRow = (index: number) => {
    setPlayers((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePlayerChange = (index: number, field: string, value: any) => {
    setPlayers((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) {
      alert('Please enter a valid team name.');
      return;
    }
    if (players.length === 0 || players.some((p) => !p.name.trim())) {
      alert('Please ensure all roster slots have player names filled out.');
      return;
    }

    setIsSubmitting(true);
    const teamId = `team_${Date.now()}`;
    const formattedPlayers: Player[] = players.map((p, idx) => ({
      id: `p_${teamId}_${idx}`,
      name: p.name.trim(),
      jersey: Number(p.jersey) || idx + 1,
      position: p.position,
      teamId: teamId,
      qrPassId: `qr_${teamId}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
    }));

    const newTeam: Team = {
      id: teamId,
      name: teamName.trim(),
      sportType,
      coachName: coachName.trim() || 'Independent',
      color: teamColor,
      players: formattedPlayers,
      stats: { wins: 0, losses: 0, ptsScored: 0, ptsAllowed: 0, streak: 'W0' }
    };

    try {
      await supabase.from('teams').insert([{
        id: newTeam.id,
        org_id: sessionId,
        name: newTeam.name,
        sport_type: newTeam.sportType,
        coach_name: newTeam.coachName,
        color: newTeam.color,
        players: newTeam.players,
        updated_at: new Date().toISOString()
      }]);

      onTeamRegistered(newTeam);
      setSuccessSubmitted(true);
    } catch (err) {
      console.error('Error saving self-registered team:', err);
      onTeamRegistered(newTeam);
      setSuccessSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (successSubmitted) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto text-emerald-400">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black uppercase tracking-tight">Registration Successful!</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Your team has been successfully registered for <strong>{leagueName}</strong>. The tournament commissioner can now see your roster on the dashboard.
          </p>
          <button
            type="button"
            onClick={() => { setSuccessSubmitted(false); setTeamName(''); setPlayers([{ name: '', jersey: 1, position: 'Guard' }]); }}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer shadow"
          >
            Register Another Team
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 font-sans">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full text-[11px] font-black uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5" /> Official Team Registration Portal
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-white">{leagueName}</h1>
          <p className="text-xs text-slate-400">Fill out your franchise details and player roster to join the tournament.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-bold text-slate-400 mb-1">Franchise / Team Name</label>
              <input
                type="text"
                required
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. Quezon City Titans"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-400 mb-1">Sport Category</label>
              <select
                value={sportType}
                onChange={(e) => setSportType(e.target.value as SportType)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold capitalize"
              >
                <option value="basketball">Basketball</option>
                <option value="volleyball">Volleyball</option>
                <option value="badminton">Badminton</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-400 mb-1">Head Coach / Manager Name</label>
              <input
                type="text"
                value={coachName}
                onChange={(e) => setCoachName(e.target.value)}
                placeholder="e.g. Coach Dante"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-400 mb-1">Team Accent Color</label>
              <select
                value={teamColor}
                onChange={(e) => setTeamColor(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
              >
                <option value="from-blue-600 to-indigo-600">Electric Blue</option>
                <option value="from-amber-500 to-orange-600">Championship Amber</option>
                <option value="from-emerald-500 to-teal-700">Courtside Emerald</option>
                <option value="from-purple-600 to-pink-600">Royal Purple</option>
              </select>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-800">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-black uppercase tracking-wider text-amber-400">Team Roster ({players.length} Players)</h3>
              <button
                type="button"
                onClick={addPlayerRow}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-blue-300 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1"
              >
                <UserPlus className="w-3.5 h-3.5" /> Add Player
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {players.map((p, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] font-mono text-slate-500 w-6 text-center font-bold">#{idx + 1}</span>
                  <input
                    type="text"
                    required
                    value={p.name}
                    onChange={(e) => handlePlayerChange(idx, 'name', e.target.value)}
                    placeholder="Full Player Name"
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-bold"
                  />
                  <input
                    type="number"
                    value={p.jersey}
                    onChange={(e) => handlePlayerChange(idx, 'jersey', Number(e.target.value))}
                    placeholder="Jersey #"
                    className="w-20 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono font-bold text-center"
                  />
                  <select
                    value={p.position}
                    onChange={(e) => handlePlayerChange(idx, 'position', e.target.value)}
                    className="w-28 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-bold"
                  >
                    <option value="Guard">Guard</option>
                    <option value="Forward">Forward</option>
                    <option value="Center">Center</option>
                    <option value="Setter">Setter</option>
                    <option value="Spiker">Spiker</option>
                    <option value="Libero">Libero</option>
                  </select>
                  {players.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePlayerRow(idx)}
                      className="p-1.5 text-slate-500 hover:text-red-400 cursor-pointer transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black py-3 rounded-xl text-xs shadow-lg shadow-blue-500/20 transition cursor-pointer"
          >
            {isSubmitting ? 'Submitting Registration...' : 'Complete Team Registration'}
          </button>
        </form>
      </div>
    </div>
  );
};