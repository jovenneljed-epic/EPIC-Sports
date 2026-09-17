import React, { useState } from 'react';
import { generateSmartSchedule } from '../services/bracketService';
import { type Team, type SportType, type ScheduledMatch } from '../App';
import { Wand2, CalendarCheck } from 'lucide-react';

interface Props {
  teams: Team[];
  sessionId: string;
  sportType: SportType;
  onScheduleGenerated: (newMatches: ScheduledMatch[]) => void;
}

export const SmartScheduleGenerator: React.FC<Props> = ({ teams, sessionId, sportType, onScheduleGenerated }) => {
  const [startTime, setStartTime] = useState('09:00 AM');
  const [intervalMinutes] = useState(60);
  const [courtsInput, setCourtsInput] = useState('Center Court, Court 2');

  const handleGenerate = () => {
    const courts = courtsInput.split(',').map((c) => c.trim()).filter(Boolean);
    if (courts.length === 0) {
      alert('Please specify at least one court.');
      return;
    }

    const matches = generateSmartSchedule(teams, sportType, sessionId, {
      startTime,
      intervalMinutes,
      courts,
    });

    if (matches.length === 0) {
      alert('Not enough teams registered in this sport to generate a schedule (minimum 2 required).');
      return;
    }

    onScheduleGenerated(matches);
    alert(`Successfully generated ${matches.length} conflict-free match schedules!`);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
      <div className="flex items-center gap-2">
        <Wand2 className="w-5 h-5 text-blue-400" />
        <h3 className="text-sm font-black text-white uppercase tracking-wider">Automated Smart Scheduler</h3>
      </div>
      <p className="text-xs text-slate-400">
        Instantly build round-robin matchups with automated conflict checks so no team is double-booked across courts.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div>
          <label className="block font-bold text-slate-400 mb-1">Start Time</label>
          <input
            type="text"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
            placeholder="09:00 AM"
          />
        </div>
        <div>
          <label className="block font-bold text-slate-400 mb-1">Courts (comma separated)</label>
          <input
            type="text"
            value={courtsInput}
            onChange={(e) => setCourtsInput(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
            placeholder="Main Gym, Court 2"
          />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={handleGenerate}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-2 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow transition"
          >
            <CalendarCheck className="w-4 h-4" /> Auto-Generate Schedule
          </button>
        </div>
      </div>
    </div>
  );
};