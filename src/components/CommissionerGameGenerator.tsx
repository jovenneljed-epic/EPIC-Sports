import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { ShieldPlus, Copy, CheckCircle2, Trophy } from 'lucide-react';

interface CommissionerGameGeneratorProps {
  orgId: string;
}

export function CommissionerGameGenerator({ orgId }: CommissionerGameGeneratorProps) {
  const [courtName, setCourtName] = useState('Court 1 - Main Arena');
  const [sportType, setSportType] = useState('basketball');
  const [teamAName, setTeamAName] = useState('');
  const [teamBName, setTeamBName] = useState('');
  const [customPassword, setCustomPassword] = useState('');
  const [generatedGame, setGeneratedGame] = useState<{ gameId: string; pass: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Generate a secure random password if none provided
  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let pass = '';
    for (let i = 0; i < 6; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  };

  const handleCreateGameId = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamAName || !teamBName) {
      alert('Please enter both team names.');
      return;
    }

    setLoading(true);
    setCopied(false);

    try {
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      const gameId = `EPIC-${sportType.toUpperCase().slice(0, 4)}-${randomNum}`;
      const gamePassword = customPassword.trim() || generatePassword();

      const { error } = await supabase.from('game_credentials').insert({
        game_id: gameId,
        org_id: orgId,
        court_name: courtName,
        sport_type: sportType,
        game_password: gamePassword,
        team_a_name: teamAName.trim(),
        team_b_name: teamBName.trim(),
        is_active: true,
      });

      if (error) throw error;

      setGeneratedGame({ gameId, pass: gamePassword });
      setTeamAName('');
      setTeamBName('');
      setCustomPassword('');
    } catch (err: any) {
      console.error('Error creating game ID:', err);
      alert(`Failed to generate secure Game ID: ${err.message || JSON.stringify(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
      <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
        <div className="w-10 h-10 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center text-amber-400">
          <Trophy className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-wider">Commercial Game ID & Passcode Issuer</h3>
          <p className="text-xs text-slate-400">Generate isolated, secure credentials for tenant leagues or simultaneous court matches.</p>
        </div>
      </div>

      <form onSubmit={handleCreateGameId} className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <div>
          <label className="block font-bold text-slate-400 mb-1 uppercase tracking-wider">Court / Venue Identifier</label>
          <input
            type="text"
            required
            value={courtName}
            onChange={(e) => setCourtName(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-bold"
            placeholder="e.g. Court 1 - Gymnasium"
          />
        </div>

        <div>
          <label className="block font-bold text-slate-400 mb-1 uppercase tracking-wider">Sport Category</label>
          <select
            value={sportType}
            onChange={(e) => setSportType(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-bold capitalize"
          >
            <option value="basketball">Basketball</option>
            <option value="volleyball">Volleyball</option>
            <option value="badminton">Badminton</option>
          </select>
        </div>

        <div>
          <label className="block font-bold text-slate-400 mb-1 uppercase tracking-wider">Home / Team A Name</label>
          <input
            type="text"
            required
            value={teamAName}
            onChange={(e) => setTeamAName(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-bold"
            placeholder="e.g. Barangay San Jose Titans"
          />
        </div>

        <div>
          <label className="block font-bold text-slate-400 mb-1 uppercase tracking-wider">Away / Team B Name</label>
          <input
            type="text"
            required
            value={teamBName}
            onChange={(e) => setTeamBName(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-bold"
            placeholder="e.g. Red Warriors"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block font-bold text-slate-400 mb-1 uppercase tracking-wider">Custom Password (Optional)</label>
          <input
            type="text"
            value={customPassword}
            onChange={(e) => setCustomPassword(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-bold"
            placeholder="e.g. 8882secure (leave blank for random passcode)"
          />
        </div>

        <div className="sm:col-span-2 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-xl text-xs uppercase tracking-wider shadow-lg transition cursor-pointer flex items-center justify-center gap-2"
          >
            <ShieldPlus className="w-4 h-4" /> {loading ? 'Generating Secure ID...' : 'Generate Unique Game ID & Passcode'}
          </button>
        </div>
      </form>

      {generatedGame && (
        <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Secure Game Credentials Issued Successfully
            </span>
            <button
              onClick={() => copyToClipboard(`Game ID: ${generatedGame.gameId}\nPassword: ${generatedGame.pass}`)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5 text-amber-400" /> {copied ? 'Copied!' : 'Copy Credentials'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950 p-4 rounded-xl font-mono text-xs">
            <div>
              <span className="text-slate-500 text-[10px] block uppercase">Assigned Game ID:</span>
              <strong className="text-amber-400 text-sm tracking-widest">{generatedGame.gameId}</strong>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block uppercase">Dedicated Passcode:</span>
              <strong className="text-cyan-400 text-sm tracking-widest">{generatedGame.pass}</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}