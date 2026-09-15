import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from './supabaseClient';
import { arenaAudio } from './audioEngine';
import { authStore, type UserAccount } from './auth/authStore';
import { PlayerEnrollModal } from './components/PlayerEnrollModal';
import { FaceLivenessScannerModal } from './components/FaceLivenessScannerModal';
import { QrAttendanceScannerModal } from './components/QrAttendanceScannerModal';
import { CreateTeamModal } from './components/CreateTeamModal';
import { GameSettingsModal, type GameSettings } from './components/GameSettingsModal';
import { AdminLoginGate } from './components/AdminLoginGate';
import { AccountManagerModal } from './components/AccountManagerModal';
import { 
  ShieldAlert, Play, Pause, X, Clock, Volume2, 
  CheckCircle2, Camera, UserCheck, AlertCircle, ScanFace,
  BarChart3, Settings, Plus, Users, Award, Flame, Edit3, Trash2, LogOut, UserCog, Printer, FileText, Calendar, ArrowLeftRight, Wifi, WifiOff
} from 'lucide-react';

// --- Domain Models & Types ---
type NavTab = 'desk' | 'roster' | 'stats' | 'schedule' | 'report';
type MatchStatus = 'Upcoming' | 'Live' | 'Final';
type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'OT' | 'Final';

export interface Player {
  id: string;
  name: string;
  jersey: number;
  position: string;
  teamId: string;
  qrPassId: string;
  height?: string;
  weight?: string;
  descriptor?: number[];
}

export interface TeamStats {
  wins: number;
  losses: number;
  ptsScored: number;
  ptsAllowed: number;
  streak: string;
}

export interface Team {
  id: string;
  name: string;
  coachName?: string;
  color: string;
  players: Player[];
  stats?: TeamStats;
}

interface PlayerMatchStats {
  playerId: string;
  points: number;
  ft: number;
  fg2: number;
  fg3: number;
  fouls: number;
  isCheckedIn: boolean;
  isOnCourt: boolean;
  isFouledOut: boolean;
}

interface Match {
  id: string;
  teamAId: string;
  teamBId: string;
  scoreA: number;
  scoreB: number;
  quarter: Quarter;
  court: string;
  status: MatchStatus;
  teamAFouls: number;
  teamBFouls: number;
  possession: 'A' | 'B';
  stats: Record<string, PlayerMatchStats>;
}

export interface ScheduledMatch {
  id: string;
  teamAId: string;
  teamBId: string;
  timeSlot: string;
  status: 'Upcoming' | 'Completed';
}

const DEFAULT_SETTINGS: GameSettings = {
  quarterMinutes: 12,
  shotClockSeconds: 24,
  offensiveReboundShotClock: 14,
  foulDisqualificationLimit: 6,
  courtName: 'EPIC Sports Championship Arena',
};

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => authStore.getCurrentUser());
  const [activeTab, setActiveTab] = useState<NavTab>('roster');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  const [teams, setTeams] = useState<Team[]>(() => {
    const saved = localStorage.getItem('nba_tournament_teams');
    return saved ? JSON.parse(saved) : [];
  });

  const [scheduledMatches, setScheduledMatches] = useState<ScheduledMatch[]>(() => {
    const saved = localStorage.getItem('epic_scheduled_matches');
    return saved ? JSON.parse(saved) : [];
  });

  const [gameSettings, setGameSettings] = useState<GameSettings>(() => {
    const saved = localStorage.getItem('nba_tournament_settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const [activeMatch, setActiveMatch] = useState<Match>({
    id: `m_${Date.now()}`,
    teamAId: '',
    teamBId: '',
    scoreA: 0,
    scoreB: 0,
    quarter: 'Q1',
    court: DEFAULT_SETTINGS.courtName,
    status: 'Live',
    teamAFouls: 0,
    teamBFouls: 0,
    possession: 'A',
    stats: {},
  });

  // Online status monitor
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (teams.length >= 2 && (!activeMatch.teamAId || !activeMatch.teamBId)) {
      setActiveMatch((prev) => ({
        ...prev,
        teamAId: prev.teamAId || teams[0].id,
        teamBId: prev.teamBId || teams[1].id,
      }));
    }
    localStorage.setItem('nba_tournament_teams', JSON.stringify(teams));
  }, [teams]);

  useEffect(() => {
    localStorage.setItem('epic_scheduled_matches', JSON.stringify(scheduledMatches));
  }, [scheduledMatches]);

  // Modals
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [enrollingPlayer, setEnrollingPlayer] = useState<Player | null>(null);
  const [isLivenessModalOpen, setIsLivenessModalOpen] = useState(false);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

  // New Match Queue Form State
  const [queueTeamA, setQueueTeamA] = useState('');
  const [queueTeamB, setQueueTeamB] = useState('');
  const [queueTime, setQueueTime] = useState('10:00 AM');

  // Clock
  const [gameSeconds, setGameSeconds] = useState(DEFAULT_SETTINGS.quarterMinutes * 60);
  const [shotClock, setShotClock] = useState(DEFAULT_SETTINGS.shotClockSeconds);
  const [isClockRunning, setIsClockRunning] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    async function loadBiometrics() {
      try {
        const { data, error } = await supabase.from('sports_players').select('id, face_descriptor');
        if (data && !error) {
          setTeams((prev) =>
            prev.map((t) => ({
              ...t,
              players: t.players.map((p) => {
                const dbMatch = data.find((row: any) => String(row.id) === String(p.id));
                return dbMatch?.face_descriptor ? { ...p, descriptor: dbMatch.face_descriptor } : p;
              }),
            }))
          );
        }
      } catch (e) {
        console.warn('Supabase offline or not connected:', e);
      }
    }
    if (currentUser) {
      loadBiometrics();
    }
  }, [currentUser]);

  const handleLogout = () => {
    authStore.logout();
    setCurrentUser(null);
  };

  const handleSaveSettings = (newSettings: GameSettings) => {
    setGameSettings(newSettings);
    localStorage.setItem('nba_tournament_settings', JSON.stringify(newSettings));
    setGameSeconds(newSettings.quarterMinutes * 60);
    setShotClock(newSettings.shotClockSeconds);
    setActiveMatch((prev) => ({ ...prev, court: newSettings.courtName }));
  };

  const enrolledRoster = useMemo(() => {
    return teams
      .flatMap((t) => t.players)
      .filter((p) => p.descriptor)
      .map((p) => ({
        id: String(p.id),
        name: p.name,
        jersey: p.jersey,
        descriptor: p.descriptor!,
      }));
  }, [teams]);

  const allPlayers = useMemo(() => teams.flatMap((t) => t.players), [teams]);

  useEffect(() => {
    if (!isClockRunning) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setGameSeconds((prev) => {
        if (prev <= 1) {
          setIsClockRunning(false);
          arenaAudio.playArenaBuzzer();
          return 0;
        }
        return prev - 1;
      });

      setShotClock((prev) => {
        if (prev <= 1) {
          arenaAudio.playArenaBuzzer();
          setIsClockRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isClockRunning]);

  const formatTime = useCallback((totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const verifyPlayerCheckIn = useCallback((playerId: string) => {
    const idKey = String(playerId).trim();
    setActiveMatch((prev) => ({
      ...prev,
      stats: {
        ...prev.stats,
        [idKey]: {
          ...(prev.stats[idKey] || {
            playerId: idKey, points: 0, ft: 0, fg2: 0, fg3: 0, fouls: 0, isCheckedIn: false, isOnCourt: true, isFouledOut: false,
          }),
          isCheckedIn: true,
          isOnCourt: true,
        },
      },
    }));
  }, []);

  const togglePlayerOnCourt = useCallback((playerId: string) => {
    const idKey = String(playerId).trim();
    setActiveMatch((prev) => {
      const st = prev.stats[idKey];
      if (!st || !st.isCheckedIn) return prev;
      return {
        ...prev,
        stats: {
          ...prev.stats,
          [idKey]: { ...st, isOnCourt: !st.isOnCourt },
        },
      };
    });
  }, []);

  const handleEnrollSuccess = useCallback(async (playerId: string, descriptor: number[]) => {
    const idKey = String(playerId).trim();
    setTeams((prev) => {
      const updated = prev.map((t) => ({
        ...t,
        players: t.players.map((p) => (String(p.id) === idKey ? { ...p, descriptor } : p)),
      }));
      localStorage.setItem('nba_tournament_teams', JSON.stringify(updated));
      return updated;
    });

    try {
      await supabase.from('sports_players').update({ face_descriptor: descriptor }).eq('id', idKey);
    } catch (err) {
      console.warn('Could not persist to Supabase:', err);
    }
  }, []);

  const handleScore = useCallback(
    (playerId: string, teamKey: 'A' | 'B', pt: 1 | 2 | 3) => {
      if (currentUser?.role === 'viewer') {
        alert('Viewer accounts have read-only access.');
        return;
      }

      setActiveMatch((prev) => {
        const idKey = String(playerId).trim();
        const st = prev.stats[idKey] || {
          playerId: idKey, points: 0, ft: 0, fg2: 0, fg3: 0, fouls: 0, isCheckedIn: false, isOnCourt: true, isFouledOut: false,
        };

        if (!st.isCheckedIn) {
          alert('ATTENDANCE LOCKOUT: Verify player identity first.');
          return prev;
        }
        if (st.isFouledOut) {
          alert(`PLAYER DISQUALIFIED: Exceeded ${gameSettings.foulDisqualificationLimit} personal fouls.`);
          return prev;
        }

        arenaAudio.playSwish();
        setShotClock(gameSettings.shotClockSeconds);

        return {
          ...prev,
          scoreA: teamKey === 'A' ? prev.scoreA + pt : prev.scoreA,
          scoreB: teamKey === 'B' ? prev.scoreB + pt : prev.scoreB,
          stats: {
            ...prev.stats,
            [idKey]: {
              ...st,
              points: st.points + pt,
              ft: pt === 1 ? st.ft + 1 : st.ft,
              fg2: pt === 2 ? st.fg2 + 1 : st.fg2,
              fg3: pt === 3 ? st.fg3 + 1 : st.fg3,
            },
          },
        };
      });
    },
    [currentUser, gameSettings]
  );

  const handleFoul = useCallback(
    (playerId: string, teamKey: 'A' | 'B') => {
      if (currentUser?.role === 'viewer') {
        alert('Viewer accounts have read-only access.');
        return;
      }

      setActiveMatch((prev) => {
        const idKey = String(playerId).trim();
        const st = prev.stats[idKey] || {
          playerId: idKey, points: 0, ft: 0, fg2: 0, fg3: 0, fouls: 0, isCheckedIn: false, isOnCourt: true, isFouledOut: false,
        };

        if (!st.isCheckedIn) {
          alert('ATTENDANCE LOCKOUT: Verify player identity first.');
          return prev;
        }
        if (st.isFouledOut) return prev;

        arenaAudio.playWhistle();
        const nextFouls = st.fouls + 1;
        const fouledOut = nextFouls >= gameSettings.foulDisqualificationLimit;

        return {
          ...prev,
          teamAFouls: teamKey === 'A' ? prev.teamAFouls + 1 : prev.teamAFouls,
          teamBFouls: teamKey === 'B' ? prev.teamBFouls + 1 : prev.teamBFouls,
          stats: {
            ...prev.stats,
            [idKey]: {
              ...st,
              fouls: nextFouls,
              isFouledOut: fouledOut,
            },
          },
        };
      });
    },
    [currentUser, gameSettings.foulDisqualificationLimit]
  );

  const handleSaveTeam = (teamData: Team) => {
    setTeams((prev) => {
      const exists = prev.some((t) => t.id === teamData.id);
      const updated = exists ? prev.map((t) => (t.id === teamData.id ? teamData : t)) : [...prev, teamData];
      localStorage.setItem('nba_tournament_teams', JSON.stringify(updated));
      return updated;
    });
    setEditingTeam(null);
  };

  const handleDeleteTeam = (teamId: string) => {
    if (currentUser?.role !== 'commissioner') {
      alert('Only the Tournament Commissioner can delete registered franchises.');
      return;
    }

    const targetTeam = teams.find((t) => t.id === teamId);
    if (!targetTeam) return;

    if (window.confirm(`Disband and remove "${targetTeam.name}" from Sunday tournament?`)) {
      setTeams((prev) => {
        const filtered = prev.filter((t) => t.id !== teamId);
        localStorage.setItem('nba_tournament_teams', JSON.stringify(filtered));
        return filtered;
      });
    }
  };

  const teamA = useMemo(() => teams.find((t) => t.id === activeMatch.teamAId), [teams, activeMatch.teamAId]);
  const teamB = useMemo(() => teams.find((t) => t.id === activeMatch.teamBId), [teams, activeMatch.teamBId]);

  if (!currentUser) {
    return <AdminLoginGate onAuthenticated={(user) => setCurrentUser(user)} />;
  }

  const isCommissioner = currentUser.role === 'commissioner';
  const isViewer = currentUser.role === 'viewer';

  const teamATotals = useMemo(() => {
    if (!teamA) return { pts: 0, fouls: 0, fg3: 0, ft: 0 };
    let pts = 0, fouls = 0, fg3 = 0, ft = 0;
    teamA.players.forEach((p) => {
      const st = activeMatch.stats[String(p.id)];
      if (st) {
        pts += st.points;
        fouls += st.fouls;
        fg3 += st.fg3;
        ft += st.ft;
      }
    });
    return { pts, fouls, fg3, ft };
  }, [teamA, activeMatch.stats]);

  const teamBTotals = useMemo(() => {
    if (!teamB) return { pts: 0, fouls: 0, fg3: 0, ft: 0 };
    let pts = 0, fouls = 0, fg3 = 0, ft = 0;
    teamB.players.forEach((p) => {
      const st = activeMatch.stats[String(p.id)];
      if (st) {
        pts += st.points;
        fouls += st.fouls;
        fg3 += st.fg3;
        ft += st.ft;
      }
    });
    return { pts, fouls, fg3, ft };
  }, [teamB, activeMatch.stats]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white print:bg-white print:text-black">
      {/* Top Header */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 shadow-xl print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src="/epic-logo.png"
              alt="EPIC Logo"
              className="w-10 h-10 rounded-xl shadow-lg border border-blue-500/30 object-cover"
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-white uppercase">
                  EPIC SPORTS
                </h1>
                <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/30 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  powered by Kezjed
                </span>
                {isOnline ? (
                  <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-black px-1.5 py-0.5 rounded tracking-widest uppercase inline-flex items-center gap-1">
                    <Wifi className="w-2.5 h-2.5" /> Online
                  </span>
                ) : (
                  <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 text-[9px] font-black px-1.5 py-0.5 rounded tracking-widest uppercase inline-flex items-center gap-1">
                    <WifiOff className="w-2.5 h-2.5" /> Offline Mode
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-semibold">{gameSettings.courtName}</p>
            </div>
          </div>

          <nav className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('roster')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'roster' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" /> Franchises
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('schedule')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'schedule' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" /> Schedule ({scheduledMatches.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('desk')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'desk' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" /> Scorer Desk
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('stats')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'stats' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" /> Standings
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('report')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'report' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" /> Game Report
            </button>
          </nav>

          <div className="flex items-center gap-2">
            {!isViewer && (
              <>
                <button
                  type="button"
                  onClick={() => setIsLivenessModalOpen(true)}
                  className="bg-blue-600 hover:bg-blue-500 active:scale-95 text-white px-3 py-1.5 text-xs font-black rounded-lg transition cursor-pointer flex items-center gap-1.5 shadow"
                >
                  <ScanFace className="w-4 h-4" /> Face ID
                </button>
                <button
                  type="button"
                  onClick={() => setIsQrScannerOpen(true)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                >
                  <Camera className="w-3.5 h-3.5" /> QR
                </button>
              </>
            )}

            {isCommissioner && (
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 cursor-pointer"
                title="Match Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsAccountModalOpen(true)}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            >
              <UserCog className="w-4 h-4 text-blue-400" />
              <span className="hidden md:inline">{currentUser.displayName}</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="p-2 bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900/50 rounded-lg cursor-pointer transition"
              title="Lock Desk"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Viewport */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full print:p-0 print:max-w-none">
        
        {/* VIEW 1: FRANCHISES */}
        {activeTab === 'roster' && (
          <div className="space-y-6 print:hidden">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div>
                <h2 className="text-xl font-black text-white uppercase tracking-tight">Official Tournament Franchises</h2>
                <p className="text-xs text-slate-400">Add official teams, head coaches, and players for Sunday</p>
              </div>
              {isCommissioner && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingTeam(null);
                    setIsTeamModalOpen(true);
                  }}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-black px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-lg cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Enter Official Team
                </button>
              )}
            </div>

            {teams.length === 0 ? (
              <div className="bg-slate-900/50 border-2 border-dashed border-slate-800 rounded-3xl p-12 text-center space-y-4">
                <div className="w-16 h-16 bg-blue-600/10 border border-blue-500/20 rounded-full flex items-center justify-center mx-auto text-blue-400">
                  <Users className="w-8 h-8" />
                </div>
                <div className="max-w-sm mx-auto">
                  <h3 className="text-base font-bold text-white">No Teams Registered Yet</h3>
                  <p className="text-xs text-slate-400 mt-1">Click below to add your first official team and roster.</p>
                </div>
                {isCommissioner && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTeam(null);
                      setIsTeamModalOpen(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-black px-5 py-2.5 rounded-xl text-xs inline-flex items-center gap-2 cursor-pointer shadow-lg"
                  >
                    <Plus className="w-4 h-4" /> Add Team #1
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-8">
                {teams.map((team) => (
                  <div key={team.id} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
                    <div className="flex flex-wrap justify-between items-center gap-4 pb-4 border-b border-slate-800">
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-10 rounded-full bg-gradient-to-b ${team.color}`} />
                        <div>
                          <h3 className="text-lg font-black text-white">{team.name}</h3>
                          <p className="text-xs text-slate-400">
                            Coach: <span className="text-white font-semibold">{team.coachName || 'Staff'}</span> • {team.players.length} Players
                          </p>
                        </div>
                      </div>

                      {isCommissioner && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTeam(team);
                              setIsTeamModalOpen(true);
                            }}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-blue-400" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTeam(team.id)}
                            className="bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-900/60 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-400" /> Remove
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {team.players.map((player) => (
                        <div key={player.id} className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between text-center space-y-3">
                          <div>
                            <p className="text-[10px] font-mono text-amber-400 font-bold">#{player.jersey} • {player.position}</p>
                            <h4 className="text-sm font-bold text-white mt-0.5">{player.name}</h4>
                          </div>

                          <div>
                            {player.descriptor ? (
                              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] px-2.5 py-0.5 rounded-full font-bold inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Biometrics Saved
                              </span>
                            ) : (
                              <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] px-2.5 py-0.5 rounded-full font-bold inline-flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> No Face Scan
                              </span>
                            )}
                          </div>

                          <div className="flex gap-1.5 pt-1">
                            {!isViewer && (
                              <button
                                type="button"
                                onClick={() => setEnrollingPlayer(player)}
                                className="flex-1 bg-slate-800 hover:bg-slate-700 text-blue-300 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center justify-center gap-1"
                              >
                                <Camera className="w-3 h-3" /> {player.descriptor ? 'Update' : 'Enroll'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedPlayer(player)}
                              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer"
                            >
                              QR Pass
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: SCHEDULE / MATCH QUEUE TAB */}
        {activeTab === 'schedule' && (
          <div className="space-y-6 print:hidden">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div>
                <h2 className="text-xl font-black text-white uppercase tracking-tight">Tournament Match Schedule</h2>
                <p className="text-xs text-slate-400">Queue up Sunday matchups and load them straight to the scorer desk</p>
              </div>
            </div>

            {/* Schedule Builder Form */}
            {isCommissioner && teams.length >= 2 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-blue-400">Schedule New Matchup</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-400 mb-1">Home Team</label>
                    <select
                      value={queueTeamA}
                      onChange={(e) => setQueueTeamA(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                    >
                      <option value="">Select Home Team</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-400 mb-1">Away Team</label>
                    <select
                      value={queueTeamB}
                      onChange={(e) => setQueueTeamB(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                    >
                      <option value="">Select Away Team</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-400 mb-1">Time Slot</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g. 10:00 AM"
                        value={queueTime}
                        onChange={(e) => setQueueTime(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!queueTeamA || !queueTeamB || queueTeamA === queueTeamB) {
                            alert('Please select two distinct teams.');
                            return;
                          }
                          const newMatch: ScheduledMatch = {
                            id: `sched_${Date.now()}`,
                            teamAId: queueTeamA,
                            teamBId: queueTeamB,
                            timeSlot: queueTime.trim() || 'TBD',
                            status: 'Upcoming',
                          };
                          setScheduledMatches((prev) => [...prev, newMatch]);
                          setQueueTeamA('');
                          setQueueTeamB('');
                        }}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-black px-4 py-2 rounded-xl cursor-pointer shadow"
                      >
                        Add to Queue
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Scheduled Matches List */}
            {scheduledMatches.length === 0 ? (
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 text-center text-xs text-slate-400">
                No matches scheduled yet. Use the form above to queue up Sunday's games.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {scheduledMatches.map((m) => {
                  const tA = teams.find((t) => t.id === m.teamAId);
                  const tB = teams.find((t) => t.id === m.teamBId);
                  if (!tA || !tB) return null;

                  return (
                    <div key={m.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center justify-between gap-4 shadow-xl">
                      <div>
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/30 font-mono">
                          {m.timeSlot}
                        </span>
                        <h4 className="text-sm font-bold text-white mt-2">{tA.name} <span className="text-slate-500 font-normal">vs</span> {tB.name}</h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMatch((prev) => ({
                              ...prev,
                              teamAId: m.teamAId,
                              teamBId: m.teamBId,
                              scoreA: 0,
                              scoreB: 0,
                              teamAFouls: 0,
                              teamBFouls: 0,
                              stats: {},
                            }));
                            setActiveTab('desk');
                          }}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-3 py-2 rounded-xl text-xs cursor-pointer shadow"
                        >
                          Load to Desk
                        </button>
                        {isCommissioner && (
                          <button
                            type="button"
                            onClick={() => setScheduledMatches((prev) => prev.filter((item) => item.id !== m.id))}
                            className="text-slate-500 hover:text-red-400 p-1.5 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* VIEW 3: SCORER DESK */}
        {activeTab === 'desk' && (
          <div className="space-y-6 print:hidden">
            {teams.length < 2 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                <h3 className="text-sm font-bold text-white">Add at least 2 teams to activate Scorer Desk</h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('roster')}
                  className="bg-blue-600 text-white font-bold px-4 py-2 rounded-xl text-xs cursor-pointer"
                >
                  Go to Franchises
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/60 p-3 rounded-xl border border-slate-800 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-bold uppercase text-[10px]">Select Matchup:</span>
                    <select
                      value={activeMatch.teamAId}
                      disabled={isViewer}
                      onChange={(e) => setActiveMatch((prev) => ({ ...prev, teamAId: e.target.value }))}
                      className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-white font-bold disabled:opacity-60"
                    >
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>{t.name} (Home)</option>
                      ))}
                    </select>
                    <span className="text-slate-500 font-bold">VS</span>
                    <select
                      value={activeMatch.teamBId}
                      disabled={isViewer}
                      onChange={(e) => setActiveMatch((prev) => ({ ...prev, teamBId: e.target.value }))}
                      className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-white font-bold disabled:opacity-60"
                    >
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>{t.name} (Away)</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Quarter:</span>
                    {(['Q1', 'Q2', 'Q3', 'Q4', 'OT', 'Final'] as Quarter[]).map((q) => (
                      <button
                        type="button"
                        key={q}
                        disabled={isViewer}
                        onClick={() => setActiveMatch((prev) => ({ ...prev, quarter: q }))}
                        className={`px-2 py-0.5 rounded font-bold transition cursor-pointer text-[11px] disabled:opacity-50 ${
                          activeMatch.quarter === q ? 'bg-blue-600 text-white font-black' : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Scoreboard */}
                {teamA && teamB && (
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative">
                    <div className="flex flex-col lg:flex-row items-center justify-between gap-6 pb-6 border-b border-slate-800">
                      <div className="flex-1 text-center lg:text-left">
                        <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Home</span>
                        <h2 className="text-2xl font-black text-white">{teamA.name}</h2>
                        <p className="text-xs text-slate-400">Coach: {teamA.coachName || 'Staff'}</p>
                        <span className={`inline-block mt-2 text-xs px-3 py-1 rounded-full font-bold border ${activeMatch.teamAFouls >= 5 ? 'bg-red-500/20 text-red-400 border-red-500' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                          Team Fouls: {activeMatch.teamAFouls} {activeMatch.teamAFouls >= 5 ? '• BONUS' : ''}
                        </span>
                      </div>

                      <div className="flex flex-col items-center bg-slate-950 px-8 py-4 rounded-2xl border border-slate-800 shadow-inner">
                        <span className="text-xs text-amber-400 font-black uppercase mb-1 tracking-wider">
                          {activeMatch.quarter} • {activeMatch.court}
                        </span>
                        
                        {/* Possession Arrow Toggle */}
                        <button
                          type="button"
                          onClick={() => setActiveMatch((prev) => ({ ...prev, possession: prev.possession === 'A' ? 'B' : 'A' }))}
                          className="my-1.5 px-3 py-1 bg-slate-900 border border-slate-700 hover:border-blue-500 rounded-full text-[11px] font-bold text-slate-300 flex items-center gap-2 cursor-pointer transition shadow"
                          title="Click to flip possession arrow"
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5 text-blue-400" />
                          <span>POSSESSION: <strong className="text-amber-400">{activeMatch.possession === 'A' ? teamA.name : teamB.name}</strong></span>
                        </button>

                        <div className="flex items-center gap-8 mb-3">
                          <span className="text-6xl font-black text-amber-400 tabular-nums">{activeMatch.scoreA}</span>
                          <span className="text-slate-700 font-bold text-3xl">:</span>
                          <span className="text-6xl font-black text-cyan-400 tabular-nums">{activeMatch.scoreB}</span>
                        </div>

                        <div className="flex items-center gap-5 pt-3 border-t border-slate-800/80">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-slate-400" />
                            <span className="font-mono text-xl font-black text-white">{formatTime(gameSeconds)}</span>
                            {!isViewer && (
                              <button
                                type="button"
                                onClick={() => setIsClockRunning((prev) => !prev)}
                                className={`p-1.5 rounded-lg text-slate-950 font-bold cursor-pointer transition ${
                                  isClockRunning ? 'bg-amber-400' : 'bg-emerald-400'
                                }`}
                              >
                                {isClockRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-2 pl-4 border-l border-slate-800">
                            <span className="text-[10px] text-slate-400 font-bold uppercase">Shot</span>
                            <span className={`font-mono text-xl font-black tabular-nums ${shotClock <= 5 ? 'text-red-500' : 'text-amber-400'}`}>
                              {shotClock}s
                            </span>
                            {!isViewer && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setShotClock(gameSettings.shotClockSeconds)}
                                  className="text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-slate-300 font-bold cursor-pointer"
                                >
                                  {gameSettings.shotClockSeconds}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setShotClock(gameSettings.offensiveReboundShotClock)}
                                  className="text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-slate-300 font-bold cursor-pointer"
                                >
                                  {gameSettings.offensiveReboundShotClock}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex-1 text-center lg:text-right">
                        <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Away</span>
                        <h2 className="text-2xl font-black text-white">{teamB.name}</h2>
                        <p className="text-xs text-slate-400">Coach: {teamB.coachName || 'Staff'}</p>
                        <span className={`inline-block mt-2 text-xs px-3 py-1 rounded-full font-bold border ${activeMatch.teamBFouls >= 5 ? 'bg-red-500/20 text-red-400 border-red-500' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                          Team Fouls: {activeMatch.teamBFouls} {activeMatch.teamBFouls >= 5 ? '• BONUS' : ''}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-lg border border-slate-700">
                        <button type="button" onClick={() => arenaAudio.playSubstitutionHorn()} className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-amber-300 rounded font-bold flex items-center gap-1 cursor-pointer">
                          <Volume2 className="w-3 h-3" /> Sub Horn
                        </button>
                        <button type="button" onClick={() => arenaAudio.playWhistle()} className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded font-bold flex items-center gap-1 cursor-pointer">
                          <Volume2 className="w-3 h-3" /> Whistle
                        </button>
                        <button type="button" onClick={() => arenaAudio.playArenaBuzzer()} className="px-2.5 py-1 bg-red-900/60 hover:bg-red-800 text-red-200 rounded font-bold flex items-center gap-1 cursor-pointer">
                          <Volume2 className="w-3 h-3" /> Buzzer
                        </button>
                      </div>
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-400" /> Only verified checked-in players can score
                      </span>
                    </div>
                  </div>
                )}

                {/* Team Tables with On-Court / Bench Toggles */}
                {teamA && teamB && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {[
                      { t: teamA, key: 'A' as const, color: 'text-amber-400' },
                      { t: teamB, key: 'B' as const, color: 'text-cyan-400' },
                    ].map(({ t, key, color }) => (
                      <div key={t.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                        <div className="bg-slate-800/80 px-4 py-3 border-b border-slate-700 flex justify-between items-center">
                          <div>
                            <h3 className={`font-black text-sm ${color}`}>{t.name}</h3>
                            <p className="text-[10px] text-slate-400">Coach: {t.coachName || 'Staff'}</p>
                          </div>
                          <span className="text-xs text-slate-300 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
                            {t.players.filter((p) => activeMatch.stats[String(p.id)]?.isCheckedIn).length} / {t.players.length} Active
                          </span>
                        </div>

                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase font-bold border-b border-slate-800">
                            <tr>
                              <th className="p-3">#</th>
                              <th className="p-3">Player</th>
                              <th className="p-3 text-center">Status</th>
                              <th className="p-3 text-center">Lineup</th>
                              <th className="p-3 text-center">PTS</th>
                              <th className="p-3 text-center">FOULS</th>
                              {!isViewer && <th className="p-3 text-right">Scorer Action</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {t.players.map((p) => {
                              const st = activeMatch.stats[String(p.id)] || {
                                points: 0, ft: 0, fg2: 0, fg3: 0, fouls: 0, isCheckedIn: false, isOnCourt: true, isFouledOut: false,
                              };
                              return (
                                <tr key={p.id} className={!st.isCheckedIn ? 'opacity-45 bg-slate-950/40' : 'hover:bg-slate-800/30'}>
                                  <td className={`p-3 font-mono font-bold ${color}`}>#{p.jersey}</td>
                                  <td className="p-3">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedPlayer(p)}
                                      className="font-semibold text-white hover:underline cursor-pointer flex items-center gap-1.5"
                                    >
                                      {p.name}
                                      {p.descriptor && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Biometrics Enrolled" />}
                                    </button>
                                  </td>
                                  <td className="p-3 text-center">
                                    {st.isCheckedIn ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-bold">
                                        <CheckCircle2 className="w-3 h-3" /> Ready
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded font-bold">
                                        <AlertCircle className="w-3 h-3" /> Locked
                                      </span>
                                    )}
                                  </td>
                                  {/* On-Court vs Bench Toggle */}
                                  <td className="p-3 text-center">
                                    <button
                                      type="button"
                                      disabled={!st.isCheckedIn}
                                      onClick={() => togglePlayerOnCourt(p.id)}
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${
                                        st.isOnCourt
                                          ? 'bg-blue-600 text-white'
                                          : 'bg-slate-800 text-slate-400 hover:text-white'
                                      }`}
                                    >
                                      {st.isOnCourt ? 'On Court' : 'Bench'}
                                    </button>
                                  </td>
                                  <td className="p-3 text-center font-bold text-white text-sm">{st.points}</td>
                                  <td className="p-3 text-center font-bold">
                                    <span className={st.isFouledOut ? 'text-red-500 font-black' : ''}>
                                      {st.fouls} / {gameSettings.foulDisqualificationLimit}
                                    </span>
                                  </td>
                                  {!isViewer && (
                                    <td className="p-3 text-right">
                                      <div className="inline-flex gap-1">
                                        <button
                                          type="button"
                                          disabled={!st.isCheckedIn || st.isFouledOut}
                                          onClick={() => handleScore(p.id, key, 1)}
                                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-[10px] font-bold rounded cursor-pointer"
                                        >
                                          +1
                                        </button>
                                        <button
                                          type="button"
                                          disabled={!st.isCheckedIn || st.isFouledOut}
                                          onClick={() => handleScore(p.id, key, 2)}
                                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-[10px] font-bold rounded cursor-pointer"
                                        >
                                          +2
                                        </button>
                                        <button
                                          type="button"
                                          disabled={!st.isCheckedIn || st.isFouledOut}
                                          onClick={() => handleScore(p.id, key, 3)}
                                          className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white text-[10px] font-bold rounded cursor-pointer"
                                        >
                                          +3
                                        </button>
                                        <button
                                          type="button"
                                          disabled={!st.isCheckedIn || st.isFouledOut}
                                          onClick={() => handleFoul(p.id, key)}
                                          className="px-2 py-1 bg-red-900/60 hover:bg-red-800 disabled:opacity-30 text-red-200 text-[10px] font-bold rounded cursor-pointer"
                                        >
                                          FOUL
                                        </button>
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* VIEW 4: STATS */}
        {activeTab === 'stats' && (
          <div className="space-y-6 print:hidden">
            <div className="flex items-center gap-2.5">
              <Award className="w-6 h-6 text-amber-400" />
              <div>
                <h2 className="text-xl font-black text-white uppercase tracking-tight">Circuit Standings</h2>
                <p className="text-xs text-slate-400">Regular tournament records and point differentials</p>
              </div>
            </div>

            {teams.length === 0 ? (
              <p className="text-xs text-slate-500">Register franchises to start recording stats.</p>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase font-bold border-b border-slate-800">
                    <tr>
                      <th className="p-3.5">Rank & Franchise</th>
                      <th className="p-3.5">Head Coach</th>
                      <th className="p-3.5 text-center">W</th>
                      <th className="p-3.5 text-center">L</th>
                      <th className="p-3.5 text-center">PCT</th>
                      <th className="p-3.5 text-center">PTS</th>
                      <th className="p-3.5 text-center">OPP</th>
                      <th className="p-3.5 text-center">DIFF</th>
                      <th className="p-3.5 text-center">STREAK</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-semibold">
                    {[...teams]
                      .sort((a, b) => (b.stats?.wins || 0) - (a.stats?.wins || 0))
                      .map((team, idx) => {
                        const wins = team.stats?.wins || 0;
                        const losses = team.stats?.losses || 0;
                        const total = wins + losses;
                        const pct = total > 0 ? (wins / total).toFixed(3) : '.000';
                        const diff = (team.stats?.ptsScored || 0) - (team.stats?.ptsAllowed || 0);

                        return (
                          <tr key={team.id} className="hover:bg-slate-800/30">
                            <td className="p-3.5 flex items-center gap-3">
                              <span className="font-mono text-slate-500 font-bold">{idx + 1}</span>
                              <div className={`w-2.5 h-6 rounded-full bg-gradient-to-b ${team.color}`} />
                              <span className="text-white font-bold">{team.name}</span>
                            </td>
                            <td className="p-3.5 text-slate-400">{team.coachName || 'Staff'}</td>
                            <td className="p-3.5 text-center font-bold text-emerald-400">{wins}</td>
                            <td className="p-3.5 text-center font-bold text-red-400">{losses}</td>
                            <td className="p-3.5 text-center font-mono text-slate-300">{pct}</td>
                            <td className="p-3.5 text-center text-slate-300">{team.stats?.ptsScored || 0}</td>
                            <td className="p-3.5 text-center text-slate-300">{team.stats?.ptsAllowed || 0}</td>
                            <td className={`p-3.5 text-center font-mono font-bold ${diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {diff > 0 ? `+${diff}` : diff}
                            </td>
                            <td className="p-3.5 text-center">
                              <span className="inline-flex items-center gap-0.5 bg-slate-800 px-2 py-0.5 rounded text-[10px] font-bold text-amber-300 font-mono">
                                <Flame className="w-3 h-3 text-orange-400" /> {team.stats?.streak || 'W0'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* VIEW 5: PRINTABLE OFFICIAL GAME REPORT & BOX SCORE */}
        {activeTab === 'report' && (
          <div id="official-game-report" className="space-y-6 bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl print:bg-white print:border-none print:shadow-none print:text-black">
            <div className="flex justify-between items-center pb-6 border-b border-slate-800 print:border-black">
              <div className="flex items-center gap-3">
                <img src="/epic-logo.png" alt="EPIC" className="w-12 h-12 rounded-xl border border-blue-500/30 object-cover" />
                <div>
                  <h1 className="text-xl font-black uppercase text-white print:text-black tracking-tight">EPIC Sports Official Game Report</h1>
                  <p className="text-xs text-slate-400 print:text-gray-700 font-semibold">{gameSettings.courtName} • Certified Box Score & Results</p>
                </div>
              </div>

              {/* Bulletproof Print Stream Handler */}
              <button
                type="button"
                onClick={() => {
                  const printContent = document.getElementById('official-game-report');
                  if (!printContent) return;
                  
                  const printWindow = window.open('', '_blank', 'width=900,height=700');
                  if (!printWindow) {
                    alert('Pop-up blocked! Please allow pop-ups for this site to print the report.');
                    return;
                  }

                  printWindow.document.write(`
                    <html>
                      <head>
                        <title>EPIC Sports Official Game Report</title>
                        <style>
                          body { font-family: Arial, sans-serif; color: #000; padding: 20px; background: #fff; }
                          h1, h2, h3, h4 { margin: 0 0 5px 0; }
                          .header { display: flex; align-items: center; gap: 15px; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px; }
                          .score-box { border: 2px solid #000; border-radius: 12px; padding: 15px; text-align: center; margin-bottom: 20px; background: #f9f9f9; }
                          .score-grid { display: flex; justify-content: space-around; align-items: center; font-size: 24px; font-weight: bold; margin-top: 10px; }
                          .totals-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
                          .total-card { border: 1px solid #000; border-radius: 8px; padding: 10px; background: #fdfdfd; }
                          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
                          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
                          th { background-color: #eee; }
                          .text-center { text-align: center; }
                          .signatories { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 30px; margin-top: 50px; text-align: center; }
                        </style>
                      </head>
                      <body>
                        ${printContent.innerHTML}
                      </body>
                    </html>
                  `);

                  printWindow.document.close();
                  printWindow.focus();
                  
                  setTimeout(() => {
                    printWindow.print();
                    printWindow.close();
                  }, 400);
                }}
                className="bg-blue-600 hover:bg-blue-500 text-white font-black px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-lg cursor-pointer print:hidden"
              >
                <Printer className="w-4 h-4" /> Print Official Report / PDF
              </button>
            </div>

            {teams.length < 2 || !teamA || !teamB ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                Select a valid matchup with at least 2 teams on the Scorer Desk to generate the game report.
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 text-center space-y-3 print:bg-gray-100 print:border-black">
                  <span className="text-xs font-bold uppercase tracking-widest text-amber-400 print:text-black">
                    Match Status: {activeMatch.status} • Quarter: {activeMatch.quarter}
                  </span>
                  <div className="flex items-center justify-center gap-8">
                    <div className="text-right flex-1">
                      <h2 className="text-2xl font-black text-white print:text-black">{teamA.name}</h2>
                      <p className="text-xs text-slate-400 print:text-gray-700">Coach: {teamA.coachName || 'Staff'}</p>
                    </div>
                    <div className="flex items-center gap-4 bg-slate-900 px-6 py-3 rounded-2xl border border-slate-800 print:bg-white print:border-black">
                      <span className="text-5xl font-black text-amber-400 print:text-black">{activeMatch.scoreA}</span>
                      <span className="text-slate-600 text-2xl font-bold">:</span>
                      <span className="text-5xl font-black text-cyan-400 print:text-black">{activeMatch.scoreB}</span>
                    </div>
                    <div className="text-left flex-1">
                      <h2 className="text-2xl font-black text-white print:text-black">{teamB.name}</h2>
                      <p className="text-xs text-slate-400 print:text-gray-700">Coach: {teamB.coachName || 'Staff'}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 print:bg-gray-50 print:border-black">
                    <h3 className="font-bold text-sm text-amber-400 print:text-black border-b border-slate-800 pb-1">{teamA.name} — Team Totals</h3>
                    <div className="grid grid-cols-3 text-xs font-semibold">
                      <p>Total Points: <strong className="text-white print:text-black">{teamATotals.pts}</strong></p>
                      <p>Team Fouls: <strong className="text-white print:text-black">{activeMatch.teamAFouls}</strong></p>
                      <p>3-Pointers: <strong className="text-white print:text-black">{teamATotals.fg3}</strong></p>
                    </div>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 print:bg-gray-50 print:border-black">
                    <h3 className="font-bold text-sm text-cyan-400 print:text-black border-b border-slate-800 pb-1">{teamB.name} — Team Totals</h3>
                    <div className="grid grid-cols-3 text-xs font-semibold">
                      <p>Total Points: <strong className="text-white print:text-black">{teamBTotals.pts}</strong></p>
                      <p>Team Fouls: <strong className="text-white print:text-black">{activeMatch.teamBFouls}</strong></p>
                      <p>3-Pointers: <strong className="text-white print:text-black">{teamBTotals.fg3}</strong></p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden print:bg-white print:border-black">
                    <div className="bg-slate-900 px-4 py-2.5 font-bold text-xs text-amber-400 print:bg-gray-200 print:text-black border-b border-slate-800">
                      {teamA.name} — Individual Box Score
                    </div>
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900/60 text-slate-400 print:text-black text-[10px] uppercase font-bold border-b border-slate-800">
                        <tr>
                          <th className="p-2.5">#</th>
                          <th className="p-2.5">Player Name</th>
                          <th className="p-2.5 text-center">PTS</th>
                          <th className="p-2.5 text-center">3PT</th>
                          <th className="p-2.5 text-center">FT</th>
                          <th className="p-2.5 text-center">FOULS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 print:divide-gray-300">
                        {teamA.players.map((p) => {
                          const st = activeMatch.stats[String(p.id)] || { points: 0, ft: 0, fg2: 0, fg3: 0, fouls: 0 };
                          return (
                            <tr key={p.id}>
                              <td className="p-2.5 font-mono font-bold">#{p.jersey}</td>
                              <td className="p-2.5 font-semibold">{p.name}</td>
                              <td className="p-2.5 text-center font-bold text-amber-400 print:text-black">{st.points}</td>
                              <td className="p-2.5 text-center">{st.fg3}</td>
                              <td className="p-2.5 text-center">{st.ft}</td>
                              <td className="p-2.5 text-center">{st.fouls}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden print:bg-white print:border-black">
                    <div className="bg-slate-900 px-4 py-2.5 font-bold text-xs text-cyan-400 print:bg-gray-200 print:text-black border-b border-slate-800">
                      {teamB.name} — Individual Box Score
                    </div>
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900/60 text-slate-400 print:text-black text-[10px] uppercase font-bold border-b border-slate-800">
                        <tr>
                          <th className="p-2.5">#</th>
                          <th className="p-2.5">Player Name</th>
                          <th className="p-2.5 text-center">PTS</th>
                          <th className="p-2.5 text-center">3PT</th>
                          <th className="p-2.5 text-center">FT</th>
                          <th className="p-2.5 text-center">FOULS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 print:divide-gray-300">
                        {teamB.players.map((p) => {
                          const st = activeMatch.stats[String(p.id)] || { points: 0, ft: 0, fg2: 0, fg3: 0, fouls: 0 };
                          return (
                            <tr key={p.id}>
                              <td className="p-2.5 font-mono font-bold">#{p.jersey}</td>
                              <td className="p-2.5 font-semibold">{p.name}</td>
                              <td className="p-2.5 text-center font-bold text-cyan-400 print:text-black">{st.points}</td>
                              <td className="p-2.5 text-center">{st.fg3}</td>
                              <td className="p-2.5 text-center">{st.ft}</td>
                              <td className="p-2.5 text-center">{st.fouls}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Signatories */}
                <div className="pt-10 mt-10 border-t-2 border-slate-800 print:border-black space-y-6">
                  <div className="text-center">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 print:text-black">
                      Official Game Authentication & Signatories
                    </h4>
                    <p className="text-[10px] text-slate-500">
                      Signatures below verify the accuracy and authenticity of the recorded match scores and statistics.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 pt-6">
                    <div className="text-center space-y-2">
                      <div className="border-b border-slate-600 print:border-black h-12 flex items-end justify-center pb-1">
                        <span className="text-xs font-bold text-slate-300 print:text-black">{currentUser.displayName}</span>
                      </div>
                      <p className="text-[11px] font-bold text-slate-400 print:text-black uppercase">Table Official / Scorer</p>
                    </div>

                    <div className="text-center space-y-2">
                      <div className="border-b border-slate-600 print:border-black h-12 flex items-end justify-center pb-1">
                        <span className="text-[11px] text-slate-500 italic">Certified Official</span>
                      </div>
                      <p className="text-[11px] font-bold text-slate-400 print:text-black uppercase">Head Referee</p>
                    </div>

                    <div className="text-center space-y-2">
                      <div className="border-b border-slate-600 print:border-black h-12 flex items-end justify-center pb-1">
                        <span className="text-[11px] text-slate-500 italic">Kezjed Solutions</span>
                      </div>
                      <p className="text-[11px] font-bold text-slate-400 print:text-black uppercase">Tournament Commissioner</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* --- FOOTER --- */}
      <footer className="border-t border-slate-800 bg-slate-950 py-4 px-6 mt-auto print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <p className="text-[11px] text-slate-400 italic">
            "I can do all things through Christ who strengthens me." <span className="text-amber-400/90 font-semibold not-italic">— Philippians 4:13</span>
          </p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
            Registered Trademark by <span className="text-slate-400">Kezjed Solutions</span>
          </p>
        </div>
      </footer>

      {/* --- ALL MODALS --- */}
      {selectedPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-150 print:hidden">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl relative">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white flex justify-between items-start">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider bg-black/20 px-2 py-0.5 rounded">Official Tournament Pass</span>
                <h3 className="text-xl font-black mt-1">{selectedPlayer.name}</h3>
                <p className="text-xs font-bold opacity-90">{selectedPlayer.position} • Jersey #{selectedPlayer.jersey}</p>
              </div>
              <button type="button" onClick={() => setSelectedPlayer(null)} className="p-1 rounded-full bg-black/10 hover:bg-black/30 cursor-pointer">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <div className="p-6 flex flex-col items-center text-center space-y-4">
              <div className="bg-white p-4 rounded-2xl shadow-xl">
                <QRCodeSVG value={selectedPlayer.qrPassId} size={150} />
              </div>

              <div className="w-full space-y-2">
                {!isViewer && (
                  <button
                    type="button"
                    onClick={() => {
                      const p = selectedPlayer;
                      setSelectedPlayer(null);
                      setEnrollingPlayer(p);
                    }}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-blue-300 font-bold py-2.5 rounded-xl text-xs border border-slate-700 cursor-pointer flex items-center justify-center gap-1.5 transition"
                  >
                    <Camera className="w-4 h-4" /> Enroll / Update Face ID Scan
                  </button>
                )}

                {!isViewer && (
                  <button
                    type="button"
                    onClick={() => {
                      verifyPlayerCheckIn(selectedPlayer.id);
                      setSelectedPlayer(null);
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <UserCheck className="w-4 h-4" /> Manual Check-In
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {enrollingPlayer && (
        <PlayerEnrollModal
          player={enrollingPlayer}
          onClose={() => setEnrollingPlayer(null)}
          onEnrollSuccess={handleEnrollSuccess}
        />
      )}

      <FaceLivenessScannerModal
        isOpen={isLivenessModalOpen}
        onClose={() => setIsLivenessModalOpen(false)}
        roster={enrolledRoster}
        onPlayerVerified={verifyPlayerCheckIn}
      />

      <QrAttendanceScannerModal
        isOpen={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        players={allPlayers}
        onPlayerVerified={verifyPlayerCheckIn}
      />

      <CreateTeamModal
        isOpen={isTeamModalOpen}
        onClose={() => {
          setIsTeamModalOpen(false);
          setEditingTeam(null);
        }}
        onSaveTeam={handleSaveTeam}
        initialTeam={editingTeam}
      />

      <GameSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={gameSettings}
        onSaveSettings={handleSaveSettings}
      />

      {currentUser && (
        <AccountManagerModal
          isOpen={isAccountModalOpen}
          onClose={() => setIsAccountModalOpen(false)}
          currentUser={currentUser}
          onUserUpdated={(updated) => setCurrentUser(updated)}
        />
      )}
    </div>
  );
}