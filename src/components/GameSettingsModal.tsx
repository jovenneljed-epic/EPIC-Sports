import React, { useState } from 'react';
import { X, Sliders, Check } from 'lucide-react';

export interface GameSettings {
  quarterMinutes: number;
  shotClockSeconds: number;
  offensiveReboundShotClock: number;
  foulDisqualificationLimit: number;
  courtName: string;
}

interface GameSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: GameSettings;
  onSaveSettings: (newSettings: GameSettings) => void;
}

export const GameSettingsModal: React.FC<GameSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
}) => {
  const [quarterMinutes, setQuarterMinutes] = useState(settings.quarterMinutes);
  const [shotClockSeconds, setShotClockSeconds] = useState(settings.shotClockSeconds);
  const [offensiveReboundShotClock, setOffensiveReboundShotClock] = useState(settings.offensiveReboundShotClock);
  const [foulDisqualificationLimit, setFoulDisqualificationLimit] = useState(settings.foulDisqualificationLimit);
  const [courtName, setCourtName] = useState(settings.courtName);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings({
      quarterMinutes,
      shotClockSeconds,
      offensiveReboundShotClock,
      foulDisqualificationLimit,
      courtName: courtName.trim() || 'Main Hardwood Arena',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-5">
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <h3 className="font-bold text-base text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-amber-400" /> NBA Match Regulation Settings
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {/* Quarter Length */}
          <div>
            <label className="block text-slate-300 font-bold uppercase mb-1">Quarter Duration (Minutes)</label>
            <div className="grid grid-cols-3 gap-2">
              {[8, 10, 12].map((min) => (
                <button
                  type="button"
                  key={min}
                  onClick={() => setQuarterMinutes(min)}
                  className={`py-2 rounded-xl font-bold border transition cursor-pointer ${
                    quarterMinutes === min
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  {min} Mins {min === 12 ? '(NBA)' : min === 10 ? '(FIBA)' : ''}
                </button>
              ))}
            </div>
          </div>

          {/* Shot Clock Settings */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-bold uppercase mb-1">Full Shot Clock</label>
              <select
                value={shotClockSeconds}
                onChange={(e) => setShotClockSeconds(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-semibold"
              >
                <option value={24}>24 Seconds (NBA/FIBA)</option>
                <option value={30}>30 Seconds (College)</option>
                <option value={35}>35 Seconds</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-300 font-bold uppercase mb-1">Offensive Reb. Reset</label>
              <select
                value={offensiveReboundShotClock}
                onChange={(e) => setOffensiveReboundShotClock(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-semibold"
              >
                <option value={14}>14 Seconds</option>
                <option value={24}>Full Reset (24s)</option>
              </select>
            </div>
          </div>

          {/* Personal Foul Limit */}
          <div>
            <label className="block text-slate-300 font-bold uppercase mb-1">Player Disqualification Limit</label>
            <div className="grid grid-cols-2 gap-2">
              {[5, 6].map((fouls) => (
                <button
                  type="button"
                  key={fouls}
                  onClick={() => setFoulDisqualificationLimit(fouls)}
                  className={`py-2 rounded-xl font-bold border transition cursor-pointer ${
                    foulDisqualificationLimit === fouls
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  {fouls} Fouls {fouls === 6 ? '(NBA)' : '(FIBA/Varsity)'}
                </button>
              ))}
            </div>
          </div>

          {/* Arena Name */}
          <div>
            <label className="block text-slate-300 font-bold uppercase mb-1">Venue / Arena Name</label>
            <input
              type="text"
              value={courtName}
              onChange={(e) => setCourtName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-semibold focus:outline-none focus:border-amber-400"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl cursor-pointer flex items-center gap-1.5 shadow-lg"
            >
              <Check className="w-4 h-4" /> Apply Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};