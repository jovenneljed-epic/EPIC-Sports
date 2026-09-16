import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, ShieldCheck, Users, Edit3 } from 'lucide-react';
import type { Team, Player, SportType } from '../App';

interface TeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveTeam: (team: Team) => void;
  initialTeam?: Team | null;
}

interface TempPlayer {
  id?: string;
  name: string;
  jersey: number;
  position: string;
  qrPassId?: string;
  descriptor?: number[];
}

export const SPORT_POSITIONS: Record<SportType, string[]> = {
  basketball: ['PG', 'SG', 'SF', 'PF', 'C'],
  volleyball: ['OH', 'OPP', 'MB', 'S', 'L', 'DS'],
  badminton: ['Singles', 'Doubles (Front)', 'Doubles (Back)', 'All-Rounder'],
};

const COLOR_OPTIONS = [
  { label: 'Sunset Amber', value: 'from-amber-600 to-orange-600' },
  { label: 'Royal Blue', value: 'from-blue-600 to-cyan-600' },
  { label: 'Titan Purple', value: 'from-purple-600 to-indigo-600' },
  { label: 'Emerald Forest', value: 'from-emerald-600 to-teal-600' },
  { label: 'Crimson Bull', value: 'from-red-600 to-rose-600' },
  { label: 'Silver Night', value: 'from-slate-700 to-zinc-900' },
];

export const CreateTeamModal: React.FC<TeamModalProps> = ({
  isOpen,
  onClose,
  onSaveTeam,
  initialTeam,
}) => {
  const [sportType, setSportType] = useState<SportType>('basketball');
  const [teamName, setTeamName] = useState('');
  const [coachName, setCoachName] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[0].value);
  const [players, setPlayers] = useState<TempPlayer[]>([]);

  useEffect(() => {
    if (initialTeam) {
      const activeSport = initialTeam.sportType || 'basketball';
      setSportType(activeSport);
      setTeamName(initialTeam.name);
      setCoachName(initialTeam.coachName || '');
      setSelectedColor(initialTeam.color);
      setPlayers(
        initialTeam.players.map((p) => ({
          id: p.id,
          name: p.name,
          jersey: p.jersey,
          position: p.position || SPORT_POSITIONS[activeSport][0],
          qrPassId: p.qrPassId,
          descriptor: p.descriptor,
        }))
      );
    } else {
      setSportType('basketball');
      setTeamName('');
      setCoachName('');
      setSelectedColor(COLOR_OPTIONS[0].value);
      setPlayers([
        { name: '', jersey: 1, position: 'PG' },
        { name: '', jersey: 2, position: 'SG' },
        { name: '', jersey: 3, position: 'SF' },
        { name: '', jersey: 4, position: 'PF' },
        { name: '', jersey: 5, position: 'C' },
      ]);
    }
  }, [initialTeam, isOpen]);

  if (!isOpen) return null;

  const handleSportTypeChange = (newSport: SportType) => {
    setSportType(newSport);
    const defaultPos = SPORT_POSITIONS[newSport][0];
    setPlayers((prev) =>
      prev.map((player) => ({
        ...player,
        position: defaultPos,
      }))
    );
  };

  const handleAddPlayerSlot = () => {
    const nextJersey = players.length > 0 ? Math.max(...players.map((p) => p.jersey || 0)) + 1 : 1;
    setPlayers((prev) => [
      ...prev,
      { name: '', jersey: nextJersey, position: SPORT_POSITIONS[sportType][0] },
    ]);
  };

  const handleRemovePlayerSlot = (index: number) => {
    if (players.length <= 1) {
      alert('A franchise must maintain at least one active player.');
      return;
    }
    setPlayers((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdatePlayer = (index: number, field: keyof TempPlayer, value: string | number) => {
    setPlayers((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) {
      alert('Please enter a team name');
      return;
    }

    const teamId = initialTeam?.id || `team_${Date.now()}`;
    const validPlayers: Player[] = players
      .filter((p) => p.name.trim() !== '')
      .map((p, idx) => ({
        id: p.id || `p_${teamId}_${Date.now()}_${idx}`,
        name: p.name.trim(),
        jersey: Number(p.jersey) || idx + 1,
        position: p.position || SPORT_POSITIONS[sportType][0],
        teamId: teamId,
        qrPassId:
          p.qrPassId ||
          `PASS-${teamName.slice(0, 3).toUpperCase()}-${String(p.jersey).padStart(2, '0')}-${Date.now().toString().slice(-4)}`,
        descriptor: p.descriptor,
      }));

    if (validPlayers.length === 0) {
      alert('Please provide at least 1 player with a name.');
      return;
    }

    const savedTeam: Team = {
      id: teamId,
      name: teamName.trim(),
      sportType,
      coachName: coachName.trim() || 'Head Coach',
      color: selectedColor,
      players: validPlayers,
      stats: initialTeam?.stats || {
        wins: 0,
        losses: 0,
        ptsScored: 0,
        ptsAllowed: 0,
        streak: '0',
      },
    };

    onSaveTeam(savedTeam);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-5 text-slate-950 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            {initialTeam ? <Edit3 className="w-6 h-6" /> : <Users className="w-6 h-6" />}
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight">
                {initialTeam ? `Edit Franchise: ${initialTeam.name}` : 'Register New Franchise'}
              </h2>
              <p className="text-xs font-semibold opacity-90">Designate sport classification, coach, and roster</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full bg-black/10 hover:bg-black/30 cursor-pointer">
            <X className="w-5 h-5 text-slate-950" />
          </button>
        </div>

        {/* Scrollable Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Sport Classification Selector */}
          <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-2">
            <label className="block text-[11px] font-black text-amber-400 uppercase tracking-wider">
              Step 1: Choose Sport Classification *
            </label>
            <select
              value={sportType}
              onChange={(e) => handleSportTypeChange(e.target.value as SportType)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold text-sm focus:outline-none focus:border-amber-400"
            >
              <option value="basketball">Basketball</option>
              <option value="volleyball">Volleyball</option>
              <option value="badminton">Badminton</option>
            </select>
            <p className="text-[10px] text-slate-500">
              Roster positions below adapt automatically to {sportType}.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Franchise Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Manila Spikers"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-amber-400 font-semibold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Head Coach</label>
              <input
                type="text"
                placeholder="e.g. Coach Silva"
                value={coachName}
                onChange={(e) => setCoachName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-amber-400 font-semibold"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-2">Color Accent</label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  type="button"
                  key={c.value}
                  onClick={() => setSelectedColor(c.value)}
                  className={`h-10 rounded-xl bg-gradient-to-r ${c.value} border-2 cursor-pointer transition ${
                    selectedColor === c.value ? 'border-white scale-105 shadow-md' : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          {/* Player Roster Builder */}
          <div className="space-y-3 pt-4 border-t border-slate-800">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-black uppercase text-amber-400 tracking-wider">
                {sportType} Roster Lineup ({players.length})
              </h3>
              <button
                type="button"
                onClick={handleAddPlayerSlot}
                className="inline-flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-amber-300 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Player
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {players.map((p, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 font-bold w-4 text-center">{idx + 1}</span>
                  <input
                    type="text"
                    placeholder="Player Name"
                    value={p.name}
                    onChange={(e) => handleUpdatePlayer(idx, 'name', e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-amber-400"
                  />
                  <input
                    type="number"
                    placeholder="#"
                    value={p.jersey}
                    onChange={(e) => handleUpdatePlayer(idx, 'jersey', parseInt(e.target.value) || 0)}
                    className="w-14 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-center text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-400"
                  />
                  <select
                    value={p.position}
                    onChange={(e) => handleUpdatePlayer(idx, 'position', e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-200 font-semibold focus:outline-none focus:border-amber-400"
                  >
                    {SPORT_POSITIONS[sportType].map((pos) => (
                      <option key={pos} value={pos}>
                        {pos}
                      </option>
                    ))}
                  </select>
                  {p.descriptor && (
                    <span className="text-[10px] text-emerald-400 px-1.5 py-0.5 bg-emerald-950/60 rounded border border-emerald-800 font-mono">
                      Face ID
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemovePlayerSlot(idx)}
                    className="text-slate-500 hover:text-red-400 p-1 cursor-pointer"
                    title="Remove Player"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl shadow-lg cursor-pointer flex items-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4" /> {initialTeam ? 'Update Franchise' : 'Register Franchise'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};