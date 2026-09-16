import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  BarChart3, Settings, Plus, Users, Award, Flame, Edit3, 
  Trash2, LogOut, UserCog, Printer, FileText, Calendar, 
  ArrowLeftRight, Wifi, WifiOff, Lock
} from 'lucide-react';

// --- Multi-Tenant & Multi-Sport Domain Models ---
export type SportType = 'basketball' | 'volleyball' | 'badminton';
export type MatchStatus = 'Upcoming' | 'Live' | 'Final';
export type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'OT' | 'Final';

export interface TournamentSession {
  id: string;
  name: string;
  venue: string;
  sportType: SportType;
  startDate: string;
  endDate: string;
}

export interface SportConfig {
  id: SportType;
  name: string;
  hasQuarters: boolean;
  hasSets: boolean;
  maxScorePerSet?: number;
  periodsName: string;
}

export const SPORT_CONFIGS: Record<SportType, SportConfig> = {
  basketball: {
    id: 'basketball',
    name: 'Basketball',
    hasQuarters: true,
    hasSets: false,
    periodsName: 'Quarters',
  },
  volleyball: {
    id: 'volleyball',
    name: 'Volleyball',
    hasQuarters: false,
    hasSets: true,
    maxScorePerSet: 25,
    periodsName: 'Sets',
  },
  badminton: {
    id: 'badminton',
    name: 'Badminton',
    hasQuarters: false,
    hasSets: true,
    maxScorePerSet: 21,
    periodsName: 'Sets',
  },
};

export const getStorageKey = (sessionId: string, entity: string): string => {
  return `epic_${sessionId}_${entity}`;
};

type NavTab = 'desk' | 'roster' | 'stats' | 'schedule' | 'report';

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
  sportType: SportType;
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

export interface SetHistoryEntry {
  setNumber: number;
  scoreA: number;
  scoreB: number;
}

export interface Match {
  id: string;
  sessionId: string;
  sportType: SportType;
  courtId?: string;
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
  setsA?: number;
  setsB?: number;
  currentSet?: number;
  history?: SetHistoryEntry[];
  stats: Record<string, PlayerMatchStats>;
}

export interface ScheduledMatch {
  id: string;
  sessionId: string;
  sportType: SportType;
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

const DEFAULT_SESSION: TournamentSession = {
  id: 'epic-circuit-2026',
  name: 'EPIC Tournament Circuit',
  venue: 'Main Gymnasium',
  sportType: 'basketball',
  startDate: '2026-09-20',
  endDate: '2026-09-21',
};

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => authStore.getCurrentUser());
  const [activeTab, setActiveTab] = useState<NavTab>('roster');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  // Franchise & Standings Sport Filtering Tab State
  const [selectedSportTab, setSelectedSportTab] = useState<SportType>('basketball');

  // Tournament Session Context
  const [activeSession, _setActiveSession] = useState<TournamentSession>(() => {
    const saved = localStorage.getItem('epic_active_session');
    return saved ? JSON.parse(saved) : DEFAULT_SESSION;
  });

  const [teams, setTeams] = useState<Team[]>(() => {
    const saved = localStorage.getItem(getStorageKey(activeSession.id, 'teams'));
    return saved ? JSON.parse(saved) : [];
  });

  const [scheduledMatches, setScheduledMatches] = useState<ScheduledMatch[]>(() => {
    const saved = localStorage.getItem(getStorageKey(activeSession.id, 'scheduled_matches'));
    return saved ? JSON.parse(saved) : [];
  });

  const [gameSettings, setGameSettings] = useState<GameSettings>(() => {
    const saved = localStorage.getItem(getStorageKey(activeSession.id, 'settings'));
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const [activeMatch, setActiveMatch] = useState<Match>(() => {
    const defaultState: Match = {
      id: `m_${Date.now()}`,
      sessionId: activeSession?.id || 'epic-circuit-2026',
      sportType: activeSession?.sportType || 'basketball',
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
      setsA: 0,
      setsB: 0,
      currentSet: 1,
      history: [],
      stats: {},
    };

    const saved = localStorage.getItem(getStorageKey(activeSession?.id || 'epic-circuit-2026', 'active_match'));
    if (saved) {
      try {
        return { ...defaultState, ...JSON.parse(saved) };
      } catch (err) {
        console.error('Failed to parse active match:', err);
      }
    }
    return defaultState;
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

  // Sync Stores to LocalStorage
  useEffect(() => {
    localStorage.setItem('epic_active_session', JSON.stringify(activeSession));
  }, [activeSession]);

  useEffect(() => {
    localStorage.setItem(getStorageKey(activeSession.id, 'teams'), JSON.stringify(teams));
  }, [teams, activeSession.id]);

  useEffect(() => {
    localStorage.setItem(getStorageKey(activeSession.id, 'scheduled_matches'), JSON.stringify(scheduledMatches));
  }, [scheduledMatches, activeSession.id]);

  useEffect(() => {
    localStorage.setItem(getStorageKey(activeSession.id, 'active_match'), JSON.stringify(activeMatch));
  }, [activeMatch, activeSession.id]);

  // Modals
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [enrollingPlayer, setEnrollingPlayer] = useState<Player | null>(null);
  const [isLivenessModalOpen, setIsLivenessModalOpen] = useState(false);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

  // Match Queue Form State
  const [queueSportType, setQueueSportType] = useState<SportType>(activeSession.sportType || 'basketball');
  const [queueTeamA, setQueueTeamA] = useState('');
  const [queueTeamB, setQueueTeamB] = useState('');
  const [queueTime, setQueueTime] = useState('10:00 AM');

  // Clock
  const [gameSeconds, setGameSeconds] = useState(DEFAULT_SETTINGS.quarterMinutes * 60);
  const [shotClock, setShotClock] = useState(DEFAULT_SETTINGS.shotClockSeconds);
  const [isClockRunning, setIsClockRunning] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Safe Biometrics Hydration (Guarded against 401 unmount loops)
  useEffect(() => {
    let isMounted = true;

    async function loadBiometrics() {
      try {
        const { data, error, status } = await supabase
          .from('sports_players')
          .select('id, face_descriptor');

        if (status === 401) {
          console.warn('Supabase: Unauthorized access (401). Operating in local biometric mode.');
          return;
        }

        if (data && !error && isMounted) {
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

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  const handleLogout = () => {
    authStore.logout();
    setCurrentUser(null);
  };

  const handleSaveSettings = (newSettings: GameSettings) => {
    setGameSettings(newSettings);
    localStorage.setItem(getStorageKey(activeSession.id, 'settings'), JSON.stringify(newSettings));
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

  const filteredTeams = useMemo(() => {
    return teams.filter((t) => (t.sportType || 'basketball') === selectedSportTab);
  }, [teams, selectedSportTab]);

  useEffect(() => {
    if (!isClockRunning) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = window.setInterval(() => {
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
      localStorage.setItem(getStorageKey(activeSession.id, 'teams'), JSON.stringify(updated));
      return updated;
    });

    try {
      await supabase.from('sports_players').update({ face_descriptor: descriptor }).eq('id', idKey);
    } catch (err) {
      console.warn('Could not persist to Supabase:', err);
    }
  }, [activeSession.id]);

  const handleScore = useCallback(
    (playerId: string, teamKey: 'A' | 'B', pt: number) => {
      if (currentUser?.role === 'viewer') {
        alert('Viewer accounts have read-only access.');
        return;
      }

      setActiveMatch((prev) => {
        if (prev.status === 'Final') {
          alert('Match is finalized. Scores are permanently locked.');
          return prev;
        }

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

        const config = SPORT_CONFIGS[prev.sportType || 'basketball'];

        if (config.hasSets) {
          const maxScore = config.maxScorePerSet || 25;
          const currentScoreA = teamKey === 'A' ? prev.scoreA + pt : prev.scoreA;
          const currentScoreB = teamKey === 'B' ? prev.scoreB + pt : prev.scoreB;

          if (teamKey === 'A' && currentScoreA >= maxScore && currentScoreA - prev.scoreB >= 2) {
            const newHistory: SetHistoryEntry[] = [...(prev.history || []), { setNumber: prev.currentSet || 1, scoreA: currentScoreA, scoreB: prev.scoreB }];
            return {
              ...prev,
              scoreA: 0,
              scoreB: 0,
              setsA: (prev.setsA || 0) + 1,
              currentSet: (prev.currentSet || 1) + 1,
              history: newHistory,
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
          } else if (teamKey === 'B' && currentScoreB >= maxScore && currentScoreB - prev.scoreA >= 2) {
            const newHistory: SetHistoryEntry[] = [...(prev.history || []), { setNumber: prev.currentSet || 1, scoreA: prev.scoreA, scoreB: currentScoreB }];
            return {
              ...prev,
              scoreA: 0,
              scoreB: 0,
              setsB: (prev.setsB || 0) + 1,
              currentSet: (prev.currentSet || 1) + 1,
              history: newHistory,
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
          }

          return {
            ...prev,
            scoreA: currentScoreA,
            scoreB: currentScoreB,
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
        } else {
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
        }
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
        if (prev.status === 'Final') {
          alert('Match is finalized. Scores are permanently locked.');
          return prev;
        }

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
      localStorage.setItem(getStorageKey(activeSession.id, 'teams'), JSON.stringify(updated));
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

    if (window.confirm(`Disband and remove "${targetTeam.name}" from tournament?`)) {
      setTeams((prev) => {
        const filtered = prev.filter((t) => t.id !== teamId);
        localStorage.setItem(getStorageKey(activeSession.id, 'teams'), JSON.stringify(filtered));
        return filtered;
      });
    }
  };

  const teamA = useMemo(() => teams.find((t) => t.id === activeMatch.teamAId), [teams, activeMatch.teamAId]);
  const teamB = useMemo(() => teams.find((t) => t.id === activeMatch.teamBId), [teams, activeMatch.teamBId]);
  const currentSportConfig = SPORT_CONFIGS[activeMatch.sportType || 'basketball'];

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

  // ALL HOOKS MUST COMPLETE BEFORE THIS EARLY RETURN CHECK
  if (!currentUser) {
    return <AdminLoginGate onAuthenticated={(user) => setCurrentUser(user)} />;
  }

  const isCommissioner = currentUser.role === 'commissioner';
  const isViewer = currentUser.role === 'viewer';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white print:bg-white print:text-black">
      {/* Top Header - Mobile Adaptive */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 shadow-xl print:hidden">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center justify-between w-full md:w-auto">
            <div className="flex items-center gap-2.5">
              <img
                src="/epic-logo.png"
                alt="EPIC Logo"
                className="w-9 h-9 rounded-xl shadow-lg border border-blue-500/30 object-cover"
              />
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h1 className="text-base font-black tracking-tight text-white uppercase">EPIC SPORTS</h1>
                  <span className="text-[9px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/30 px-1.5 py-0.2 rounded-full uppercase">
                    Kezjed
                  </span>
                  {isOnline ? (
                    <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-black px-1.5 py-0.5 rounded uppercase hidden sm:inline-flex items-center gap-1">
                      <Wifi className="w-2 h-2" /> Online
                    </span>
                  ) : (
                    <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 text-[9px] font-black px-1.5 py-0.5 rounded uppercase hidden sm:inline-flex items-center gap-1">
                      <WifiOff className="w-2 h-2" /> Offline
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 font-semibold">{activeSession.venue}</p>
              </div>
            </div>
          </div>

          {/* Mobile-scrollable Nav Tabs */}
          <nav className="flex items-center bg-slate-950/90 p-1 rounded-xl border border-slate-800 overflow-x-auto max-w-full w-full md:w-auto scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveTab('roster')}
              className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                activeTab === 'roster' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" /> Franchises
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('schedule')}
              className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                activeTab === 'schedule' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" /> Schedule ({scheduledMatches.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('desk')}
              className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                activeTab === 'desk' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" /> Desk
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('stats')}
              className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                activeTab === 'stats' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" /> Standings
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('report')}
              className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                activeTab === 'report' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" /> Report
              {activeMatch.status !== 'Final' && (
                <span title="Report unlocks when match is final">
                  <Lock className="w-3 h-3 text-slate-500" />
                </span>
              )}
            </button>
          </nav>

          <div className="flex items-center gap-1.5 justify-end w-full md:w-auto">
            {!isViewer && (
              <>
                <button
                  type="button"
                  onClick={() => setIsLivenessModalOpen(true)}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1.5 text-[11px] font-black rounded-lg flex items-center gap-1 shadow cursor-pointer"
                >
                  <ScanFace className="w-3.5 h-3.5" /> Face ID
                </button>
                <button
                  type="button"
                  onClick={() => setIsQrScannerOpen(true)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2 py-1.5 text-[11px] font-bold rounded-lg flex items-center gap-1 cursor-pointer"
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
      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 flex-1 w-full print:p-0 print:max-w-none">
        
        {/* VIEW 1: FRANCHISES */}
        {activeTab === 'roster' && (
          <div className="space-y-6 print:hidden">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div>
                <h2 className="text-xl font-black text-white uppercase tracking-tight">Official Tournament Franchises</h2>
                <p className="text-xs text-slate-400">
                  Showing franchises for <strong className="text-amber-400 uppercase">{selectedSportTab}</strong> in {activeSession.name}
                </p>
              </div>

              {/* Sport Category Filter Tabs */}
              <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl gap-1 overflow-x-auto max-w-full">
                {(['basketball', 'volleyball', 'badminton'] as SportType[]).map((sport) => {
                  const sportCount = teams.filter((t) => (t.sportType || 'basketball') === sport).length;
                  return (
                    <button
                      key={sport}
                      type="button"
                      onClick={() => setSelectedSportTab(sport)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition cursor-pointer whitespace-nowrap ${
                        selectedSportTab === sport
                          ? 'bg-blue-600 text-white shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {sport} ({sportCount})
                    </button>
                  );
                })}
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

            {filteredTeams.length === 0 ? (
              <div className="bg-slate-900/50 border-2 border-dashed border-slate-800 rounded-3xl p-12 text-center space-y-4">
                <div className="w-16 h-16 bg-blue-600/10 border border-blue-500/20 rounded-full flex items-center justify-center mx-auto text-blue-400">
                  <Users className="w-8 h-8" />
                </div>
                <div className="max-w-sm mx-auto">
                  <h3 className="text-base font-bold text-white capitalize">No {selectedSportTab} Teams Registered Yet</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Click below to add your first official {selectedSportTab} team and roster.
                  </p>
                </div>
                {isCommissioner && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTeam(null);
                      setIsTeamModalOpen(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-black px-5 py-2.5 rounded-xl text-xs inline-flex items-center gap-2 cursor-pointer shadow-lg capitalize"
                  >
                    <Plus className="w-4 h-4" /> Add {selectedSportTab} Team
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-8">
                {filteredTeams.map((team) => (
                  <div key={team.id} className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
                    <div className="flex flex-wrap justify-between items-center gap-4 pb-4 border-b border-slate-800">
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-10 rounded-full bg-gradient-to-b ${team.color}`} />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-lg font-black text-white">{team.name}</h3>
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-full border border-amber-500/30">
                              {team.sportType || 'basketball'}
                            </span>
                          </div>
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
                <p className="text-xs text-slate-400">Queue up matchups and load them straight to the scorer desk</p>
              </div>
            </div>

            {/* Schedule Builder Form */}
            {isCommissioner && teams.length >= 2 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-blue-400">Schedule New Matchup</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-400 mb-1">Sport Type</label>
                    <select
                      value={queueSportType}
                      onChange={(e) => {
                        const newSport = e.target.value as SportType;
                        setQueueSportType(newSport);
                        setQueueTeamA('');
                        setQueueTeamB('');
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                    >
                      <option value="basketball">Basketball</option>
                      <option value="volleyball">Volleyball</option>
                      <option value="badminton">Badminton</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-400 mb-1">Home Team</label>
                    <select
                      value={queueTeamA}
                      onChange={(e) => setQueueTeamA(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                    >
                      <option value="">Select Home Team</option>
                      {teams
                        .filter((t) => (t.sportType || 'basketball') === queueSportType)
                        .filter((t) => t.id !== queueTeamB)
                        .map((t) => (
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
                      {teams
                        .filter((t) => (t.sportType || 'basketball') === queueSportType)
                        .filter((t) => t.id !== queueTeamA)
                        .map((t) => (
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
                            sessionId: activeSession.id,
                            sportType: queueSportType,
                            teamAId: queueTeamA,
                            teamBId: queueTeamB,
                            timeSlot: queueTime.trim() || 'TBD',
                            status: 'Upcoming',
                          };
                          setScheduledMatches((prev) => [...prev, newMatch]);
                          setQueueTeamA('');
                          setQueueTeamB('');
                        }}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-black px-4 py-2 rounded-xl cursor-pointer shadow whitespace-nowrap"
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
                No matches scheduled yet. Use the form above to queue up games.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {scheduledMatches.map((m) => {
                  const tA = teams.find((t) => t.id === m.teamAId);
                  const tB = teams.find((t) => t.id === m.teamBId);
                  if (!tA || !tB) return null;

                  return (
                    <div key={m.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-4 shadow-xl">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/30 font-mono">
                            {m.timeSlot}
                          </span>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-full border border-amber-500/30">
                            {m.sportType}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-white mt-2">{tA.name} <span className="text-slate-500 font-normal">vs</span> {tB.name}</h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMatch((prev) => ({
                              ...prev,
                              sessionId: activeSession.id,
                              sportType: m.sportType,
                              teamAId: m.teamAId,
                              teamBId: m.teamBId,
                              scoreA: 0,
                              scoreB: 0,
                              setsA: 0,
                              setsB: 0,
                              currentSet: 1,
                              history: [],
                              quarter: 'Q1',
                              status: 'Live',
                              teamAFouls: 0,
                              teamBFouls: 0,
                              stats: {},
                            }));
                            setActiveTab('desk');
                          }}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-3 py-2 rounded-xl text-xs cursor-pointer shadow whitespace-nowrap"
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
                {/* Fixed & Locked Matchup Banner */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 p-3.5 rounded-2xl border border-slate-800 text-xs shadow-md">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Matchup:</span>
                      <span className="px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-lg font-black uppercase text-[11px]">
                        {currentSportConfig.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 font-bold overflow-x-auto">
                      <span className="text-white truncate max-w-[120px]">{teamA?.name || 'Home'}</span>
                      <span className="text-slate-600 text-[10px]">VS</span>
                      <span className="text-white truncate max-w-[120px]">{teamB?.name || 'Away'}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveTab('schedule')}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 rounded-lg font-bold text-[11px] cursor-pointer transition flex items-center gap-1"
                      title="Select a different game from queue"
                    >
                      <Calendar className="w-3 h-3" /> Change Match
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto max-w-full">
                    <span className="text-[10px] text-slate-400 font-bold uppercase whitespace-nowrap">{currentSportConfig.periodsName}:</span>
                    {currentSportConfig.hasSets ? (
                      <span className="px-3 py-1 rounded bg-blue-600 text-white font-black text-xs">
                        Set {activeMatch.currentSet || 1}
                      </span>
                    ) : (
                      (['Q1', 'Q2', 'Q3', 'Q4', 'OT', 'Final'] as Quarter[]).map((q) => (
                        <button
                          type="button"
                          key={q}
                          disabled={isViewer || activeMatch.status === 'Final'}
                          onClick={() => setActiveMatch((prev) => ({ ...prev, quarter: q }))}
                          className={`px-2 py-0.5 rounded font-bold transition cursor-pointer text-[11px] disabled:opacity-50 whitespace-nowrap ${
                            activeMatch.quarter === q ? 'bg-blue-600 text-white font-black' : 'bg-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          {q}
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* Scoreboard */}
                {teamA && teamB && (
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl relative">
                    <div className="flex flex-col lg:flex-row items-center justify-between gap-6 pb-6 border-b border-slate-800">
                      <div className="flex-1 text-center lg:text-left w-full">
                        <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Home</span>
                        <h2 className="text-2xl font-black text-white truncate">{teamA.name}</h2>
                        <p className="text-xs text-slate-400">Coach: {teamA.coachName || 'Staff'}</p>
                        {currentSportConfig.hasSets ? (
                          <span className="inline-block mt-2 text-xs px-3 py-1 rounded-full font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                            Sets Won: {activeMatch.setsA || 0}
                          </span>
                        ) : (
                          <span className={`inline-block mt-2 text-xs px-3 py-1 rounded-full font-bold border ${activeMatch.teamAFouls >= 5 ? 'bg-red-500/20 text-red-400 border-red-500' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                            Team Fouls: {activeMatch.teamAFouls} {activeMatch.teamAFouls >= 5 ? '• BONUS' : ''}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col items-center bg-slate-950 px-6 sm:px-8 py-4 rounded-2xl border border-slate-800 shadow-inner w-full lg:w-auto">
                        <span className="text-xs text-amber-400 font-black uppercase mb-1 tracking-wider text-center">
                          {currentSportConfig.name} • {activeMatch.court} • {activeMatch.status}
                        </span>
                        
                        {/* Possession/Serving Indicator */}
                        <button
                          type="button"
                          disabled={activeMatch.status === 'Final'}
                          onClick={() => setActiveMatch((prev) => ({ ...prev, possession: prev.possession === 'A' ? 'B' : 'A' }))}
                          className="my-1.5 px-3 py-1 bg-slate-900 border border-slate-700 hover:border-blue-500 rounded-full text-[11px] font-bold text-slate-300 flex items-center gap-2 cursor-pointer transition shadow disabled:opacity-60 max-w-full overflow-hidden"
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                          <span className="truncate">{currentSportConfig.hasSets ? 'SERVING: ' : 'POSSESSION: '}
                            <strong className="text-amber-400">{activeMatch.possession === 'A' ? teamA.name : teamB.name}</strong>
                          </span>
                        </button>

                        <div className="flex items-center gap-6 sm:gap-8 mb-3">
                          <span className="text-5xl sm:text-6xl font-black text-amber-400 tabular-nums">{activeMatch.scoreA}</span>
                          <span className="text-slate-700 font-bold text-3xl">:</span>
                          <span className="text-5xl sm:text-6xl font-black text-cyan-400 tabular-nums">{activeMatch.scoreB}</span>
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-5 pt-3 border-t border-slate-800/80 w-full">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-slate-400" />
                            <span className="font-mono text-xl font-black text-white">{formatTime(gameSeconds)}</span>
                            {!isViewer && activeMatch.status !== 'Final' && (
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

                          {!currentSportConfig.hasSets && (
                            <div className="flex items-center gap-2 pl-0 sm:pl-4 sm:border-l border-slate-800">
                              <span className="text-[10px] text-slate-400 font-bold uppercase">Shot</span>
                              <span className={`font-mono text-xl font-black tabular-nums ${shotClock <= 5 ? 'text-red-500' : 'text-amber-400'}`}>
                                {shotClock}s
                              </span>
                              {!isViewer && activeMatch.status !== 'Final' && (
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
                          )}
                        </div>
                      </div>

                      <div className="flex-1 text-center lg:text-right w-full">
                        <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Away</span>
                        <h2 className="text-2xl font-black text-white truncate">{teamB.name}</h2>
                        <p className="text-xs text-slate-400">Coach: {teamB.coachName || 'Staff'}</p>
                        {currentSportConfig.hasSets ? (
                          <span className="inline-block mt-2 text-xs px-3 py-1 rounded-full font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                            Sets Won: {activeMatch.setsB || 0}
                          </span>
                        ) : (
                          <span className={`inline-block mt-2 text-xs px-3 py-1 rounded-full font-bold border ${activeMatch.teamBFouls >= 5 ? 'bg-red-500/20 text-red-400 border-red-500' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                            Team Fouls: {activeMatch.teamBFouls} {activeMatch.teamBFouls >= 5 ? '• BONUS' : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-lg border border-slate-700 overflow-x-auto max-w-full">
                        <button type="button" onClick={() => arenaAudio.playSubstitutionHorn()} className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-amber-300 rounded font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap">
                          <Volume2 className="w-3 h-3" /> Horn
                        </button>
                        <button type="button" onClick={() => arenaAudio.playWhistle()} className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap">
                          <Volume2 className="w-3 h-3" /> Whistle
                        </button>
                        <button type="button" onClick={() => arenaAudio.playArenaBuzzer()} className="px-2.5 py-1 bg-red-900/60 hover:bg-red-800 text-red-200 rounded font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap">
                          <Volume2 className="w-3 h-3" /> Buzzer
                        </button>
                      </div>

                      {/* Match Finalizer Switch */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-[11px] text-slate-400 flex items-center gap-1 hidden sm:inline-flex">
                          <ShieldAlert className="w-3.5 h-3.5 text-amber-400" /> Only verified checked-in players can score
                        </span>
                        {!isViewer && activeMatch.status !== 'Final' ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm('Declare match FINAL? This locks scoring and enables the certified Game Report.')) {
                                setIsClockRunning(false);
                                setActiveMatch((prev) => ({
                                  ...prev,
                                  status: 'Final',
                                  quarter: 'Final',
                                }));
                                arenaAudio.playArenaBuzzer();
                              }
                            }}
                            className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow transition cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Finalize Match
                          </button>
                        ) : (
                          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-black uppercase tracking-wider">
                            Match Finalized
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Team Tables with Responsive Horizontal Scroll */}
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
                          <span className="text-xs text-slate-300 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-700 whitespace-nowrap">
                            {t.players.filter((p) => activeMatch.stats[String(p.id)]?.isCheckedIn).length} / {t.players.length} Active
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs whitespace-nowrap">
                            <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase font-bold border-b border-slate-800">
                              <tr>
                                <th className="p-3">#</th>
                                <th className="p-3">Player</th>
                                <th className="p-3 text-center">Status</th>
                                <th className="p-3 text-center">Lineup</th>
                                <th className="p-3 text-center">PTS</th>
                                {!currentSportConfig.hasSets && <th className="p-3 text-center">FOULS</th>}
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
                                        {p.descriptor && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" title="Biometrics Enrolled" />}
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
                                    <td className="p-3 text-center">
                                      <button
                                        type="button"
                                        disabled={!st.isCheckedIn || activeMatch.status === 'Final'}
                                        onClick={() => togglePlayerOnCourt(p.id)}
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${
                                          st.isOnCourt ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                                        } disabled:opacity-50`}
                                      >
                                        {st.isOnCourt ? 'On Court' : 'Bench'}
                                      </button>
                                    </td>
                                    <td className="p-3 text-center font-bold text-white text-sm">{st.points}</td>
                                    {!currentSportConfig.hasSets && (
                                      <td className="p-3 text-center font-bold">
                                        <span className={st.isFouledOut ? 'text-red-500 font-black' : ''}>
                                          {st.fouls} / {gameSettings.foulDisqualificationLimit}
                                        </span>
                                      </td>
                                    )}
                                    {!isViewer && (
                                      <td className="p-3 text-right">
                                        <div className="inline-flex gap-1">
                                          {currentSportConfig.hasSets ? (
                                            <button
                                              type="button"
                                              disabled={!st.isCheckedIn || activeMatch.status === 'Final'}
                                              onClick={() => handleScore(p.id, key, 1)}
                                              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white text-xs font-bold rounded cursor-pointer"
                                            >
                                              +1 Point
                                            </button>
                                          ) : (
                                            <>
                                              <button
                                                type="button"
                                                disabled={!st.isCheckedIn || st.isFouledOut || activeMatch.status === 'Final'}
                                                onClick={() => handleScore(p.id, key, 1)}
                                                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-[10px] font-bold rounded cursor-pointer"
                                              >
                                                +1
                                              </button>
                                              <button
                                                type="button"
                                                disabled={!st.isCheckedIn || st.isFouledOut || activeMatch.status === 'Final'}
                                                onClick={() => handleScore(p.id, key, 2)}
                                                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-[10px] font-bold rounded cursor-pointer"
                                              >
                                                +2
                                              </button>
                                              <button
                                                type="button"
                                                disabled={!st.isCheckedIn || st.isFouledOut || activeMatch.status === 'Final'}
                                                onClick={() => handleScore(p.id, key, 3)}
                                                className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white text-[10px] font-bold rounded cursor-pointer"
                                              >
                                                +3
                                              </button>
                                              <button
                                                type="button"
                                                disabled={!st.isCheckedIn || st.isFouledOut || activeMatch.status === 'Final'}
                                                onClick={() => handleFoul(p.id, key)}
                                                className="px-2 py-1 bg-red-900/60 hover:bg-red-800 disabled:opacity-30 text-red-200 text-[10px] font-bold rounded cursor-pointer"
                                              >
                                                FOUL
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* VIEW 4: STATS & INDIVIDUAL PERFORMANCE REPORT */}
        {activeTab === 'stats' && (
          <div className="space-y-8 print:hidden">
            {/* Header and Sport Filter Tabs */}
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div className="flex items-center gap-2.5">
                <Award className="w-6 h-6 text-amber-400" />
                <div>
                  <h2 className="text-xl font-black text-white uppercase tracking-tight">Circuit Standings & Player Progress</h2>
                  <p className="text-xs text-slate-400">Official tournament records and player metrics for {activeSession.name}</p>
                </div>
              </div>

              {/* Sport Category Filter */}
              <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl gap-1 overflow-x-auto max-w-full">
                {(['basketball', 'volleyball', 'badminton'] as SportType[]).map((sport) => {
                  const count = teams.filter((t) => (t.sportType || 'basketball') === sport).length;
                  return (
                    <button
                      key={sport}
                      type="button"
                      onClick={() => setSelectedSportTab(sport)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition cursor-pointer whitespace-nowrap ${
                        selectedSportTab === sport
                          ? 'bg-blue-600 text-white shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {sport} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 1. Team Standings Filtered by Selected Sport */}
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
                <span className="text-amber-400 capitalize">{selectedSportTab}</span> Franchise Leaderboard
              </h3>
              
              {filteredTeams.length === 0 ? (
                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 text-center text-xs text-slate-500 capitalize">
                  No {selectedSportTab} franchises registered yet.
                </div>
              ) : (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs whitespace-nowrap">
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
                        {[...filteredTeams]
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
                </div>
              )}
            </div>

            {/* 2. Individual Player Performance & Progress Report By Franchise */}
            <div className="space-y-6 pt-4 border-t border-slate-800">
              <div>
                <h3 className="text-sm font-black uppercase text-white tracking-wider flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-400" />
                  Roster Performance By Franchise (<span className="text-amber-400 capitalize">{selectedSportTab}</span>)
                </h3>
                <p className="text-[11px] text-slate-400">Player production and progress isolated by team</p>
              </div>

              {filteredTeams.length === 0 ? (
                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 text-center text-xs text-slate-500 capitalize">
                  No {selectedSportTab} teams registered yet.
                </div>
              ) : (
                <div className="space-y-6">
                  {filteredTeams.map((team) => (
                    <div key={team.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                      {/* Team Card Header */}
                      <div className="bg-slate-800/80 px-4 py-3 border-b border-slate-700 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-7 rounded-full bg-gradient-to-b ${team.color}`} />
                          <div>
                            <h4 className="font-black text-sm text-white">{team.name}</h4>
                            <p className="text-[10px] text-slate-400">Coach: {team.coachName || 'Staff'}</p>
                          </div>
                        </div>
                        <span className="text-[11px] text-amber-400 font-mono bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 font-bold whitespace-nowrap">
                          {team.players.length} Players
                        </span>
                      </div>

                      {/* Team Specific Player Roster Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs whitespace-nowrap">
                          <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase font-bold border-b border-slate-800">
                            <tr>
                              <th className="p-3">#</th>
                              <th className="p-3">Player Name</th>
                              <th className="p-3 text-center">Position</th>
                              <th className="p-3 text-center">PTS</th>
                              {selectedSportTab === 'basketball' && (
                                <>
                                  <th className="p-3 text-center">3PT</th>
                                  <th className="p-3 text-center">FT</th>
                                  <th className="p-3 text-center">Fouls</th>
                                </>
                              )}
                              <th className="p-3 text-center">Verification</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-medium">
                            {team.players.map((player) => {
                              const st = activeMatch.stats[String(player.id)] || {
                                points: 0,
                                fg3: 0,
                                ft: 0,
                                fouls: 0,
                              };

                              return (
                                <tr key={player.id} className="hover:bg-slate-800/30">
                                  <td className="p-3 font-mono font-bold text-amber-400">#{player.jersey}</td>
                                  <td className="p-3 font-bold text-white">
                                    <span className="inline-flex items-center gap-1.5">
                                      {player.name}
                                      {player.descriptor && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" title="Biometrics Verified" />
                                      )}
                                    </span>
                                  </td>
                                  <td className="p-3 text-center font-bold text-slate-400">{player.position}</td>
                                  <td className="p-3 text-center font-black text-amber-400 tabular-nums text-sm">
                                    {st.points}
                                  </td>
                                  {selectedSportTab === 'basketball' && (
                                    <>
                                      <td className="p-3 text-center tabular-nums text-slate-300">{st.fg3}</td>
                                      <td className="p-3 text-center tabular-nums text-slate-300">{st.ft}</td>
                                      <td className="p-3 text-center tabular-nums text-slate-400">{st.fouls}</td>
                                    </>
                                  )}
                                  <td className="p-3 text-center">
                                    {player.descriptor ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                                        <CheckCircle2 className="w-3 h-3" /> Biometric ID
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-semibold">
                                        QR Pass
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 5: PRINTABLE OFFICIAL GAME REPORT & BOX SCORE */}
        {activeTab === 'report' && (
          <div className="space-y-6">
            {activeMatch.status !== 'Final' ? (
              /* GATED NOTICE: Enabled only when match is finalized */
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 text-center max-w-xl mx-auto space-y-4 shadow-xl">
                <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto text-amber-400">
                  <Lock className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">Official Game Report Locked</h3>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                    The certified game report and official box scores are generated exclusively after a match has been declared <strong>FINAL</strong> on the Scorer Desk.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('desk')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow"
                >
                  Return to Scorer Desk
                </button>
              </div>
            ) : (
              /* FINALIZED CERTIFIED 1-SHEET REPORT */
              <div
                id="official-game-report"
                className="space-y-4 bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl print:bg-white print:border-none print:shadow-none print:text-black print:p-0"
              >
                {/* Header & Print Button */}
                <div className="flex flex-wrap justify-between items-center gap-4 pb-4 border-b border-slate-800 print:border-black print:pb-2">
                  <div className="flex items-center gap-3">
                    <img src="/epic-logo.png" alt="EPIC" className="w-10 h-10 rounded-xl border border-blue-500/30 object-cover print:w-9 print:h-9 flex-shrink-0" />
                    <div>
                      <h1 className="text-base sm:text-lg font-black uppercase text-white print:text-black tracking-tight leading-tight">
                        EPIC Sports Official Game Report
                      </h1>
                      <p className="text-[10px] text-slate-400 print:text-gray-700 font-semibold">
                        {activeSession.venue} • {gameSettings.courtName} • Certified Official Summary
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const printWindow = window.open('', '_blank', 'width=850,height=950');
                      if (!printWindow) {
                        alert('Pop-up blocked! Allow pop-ups to print the official report.');
                        return;
                      }

                      printWindow.document.write(`
                        <!DOCTYPE html>
                        <html>
                          <head>
                            <title>EPIC Sports Official Game Report - Final</title>
                            <style>
                              @page {
                                size: A4 portrait;
                                margin: 6mm 8mm;
                              }
                              * { box-sizing: border-box; }
                              body {
                                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                                color: #000;
                                background: #fff;
                                margin: 0;
                                padding: 0;
                                font-size: 9.5px;
                                line-height: 1.2;
                              }
                              .header {
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                                border-bottom: 2px solid #000;
                                padding-bottom: 5px;
                                margin-bottom: 6px;
                              }
                              .title-block h1 { margin: 0; font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.5px; }
                              .title-block p { margin: 1px 0 0; font-size: 8.5px; color: #444; }
                              .stamp {
                                border: 1.5px solid #059669;
                                color: #059669;
                                padding: 2px 6px;
                                font-weight: 900;
                                text-transform: uppercase;
                                font-size: 9px;
                                border-radius: 4px;
                              }
                              .match-summary {
                                display: grid;
                                grid-template-columns: 1fr auto 1fr;
                                align-items: center;
                                border: 1.5px solid #000;
                                border-radius: 6px;
                                padding: 6px 10px;
                                background: #fafafa;
                                margin-bottom: 8px;
                              }
                              .team-box h2 { margin: 0; font-size: 13px; font-weight: 900; }
                              .team-box p { margin: 1px 0 0; font-size: 8.5px; color: #555; }
                              .score-pill {
                                font-size: 22px;
                                font-weight: 900;
                                letter-spacing: 1px;
                                padding: 2px 10px;
                                border: 1.5px solid #000;
                                border-radius: 6px;
                                background: #fff;
                                display: inline-block;
                              }
                              .totals-bar {
                                display: grid;
                                grid-template-columns: 1fr 1fr;
                                gap: 8px;
                                margin-bottom: 8px;
                              }
                              .total-card {
                                border: 1px solid #999;
                                border-radius: 5px;
                                padding: 4px 6px;
                                background: #fdfdfd;
                                font-size: 8.5px;
                              }
                              .total-card strong { font-size: 9px; }
                              .roster-grid {
                                display: grid;
                                grid-template-columns: 1fr 1fr;
                                gap: 8px;
                                margin-bottom: 8px;
                              }
                              .table-wrap {
                                border: 1px solid #666;
                                border-radius: 5px;
                                overflow: hidden;
                              }
                              .table-title {
                                background: #eee;
                                font-weight: 800;
                                font-size: 9px;
                                padding: 3px 5px;
                                border-bottom: 1px solid #666;
                                text-transform: uppercase;
                              }
                              table { width: 100%; border-collapse: collapse; font-size: 8.5px; }
                              th, td { padding: 2.5px 4px; border-bottom: 0.5px solid #ddd; text-align: left; }
                              th { background: #f5f5f5; font-weight: 700; border-bottom: 1px solid #999; font-size: 8px; }
                              .text-center { text-align: center; }
                              .text-right { text-align: right; }
                              .signatories {
                                display: grid;
                                grid-template-columns: 1fr 1fr 1fr;
                                gap: 15px;
                                margin-top: 10px;
                                padding-top: 5px;
                                border-top: 1px solid #999;
                                text-align: center;
                                page-break-inside: avoid;
                              }
                              .sign-line {
                                border-bottom: 1px solid #000;
                                height: 22px;
                                margin-bottom: 2px;
                                font-weight: 700;
                                display: flex;
                                align-items: flex-end;
                                justify-content: center;
                                font-size: 8.5px;
                              }
                              .sign-label { font-size: 7.5px; font-weight: 800; text-transform: uppercase; color: #333; }
                            </style>
                          </head>
                          <body>
                            <div class="header">
                              <div class="title-block">
                                <h1>EPIC Sports Official Game Report</h1>
                                <p>${activeSession.venue} • ${gameSettings.courtName} • Certified Match Box Score</p>
                              </div>
                              <div class="stamp">CERTIFIED FINAL</div>
                            </div>

                            <div class="match-summary">
                              <div class="team-box" style="text-align: left;">
                                <h2>${teamA?.name}</h2>
                                <p>Coach: ${teamA?.coachName || 'Staff'}</p>
                              </div>
                              <div class="text-center">
                                <div class="score-pill">${activeMatch.scoreA} : ${activeMatch.scoreB}</div>
                                <div style="font-size: 7.5px; font-weight: bold; margin-top: 2px; text-transform: uppercase;">
                                  ${currentSportConfig.name} • Official Result
                                </div>
                              </div>
                              <div class="team-box" style="text-align: right;">
                                <h2>${teamB?.name}</h2>
                                <p>Coach: ${teamB?.coachName || 'Staff'}</p>
                              </div>
                            </div>

                            <div class="totals-bar">
                              <div class="total-card">
                                <strong>${teamA?.name} Summary:</strong> Total Pts: ${teamATotals.pts} 
                                ${currentSportConfig.hasSets ? `• Sets Won: ${activeMatch.setsA || 0}` : `• Fouls: ${activeMatch.teamAFouls}`}
                              </div>
                              <div class="total-card" style="text-align: right;">
                                <strong>${teamB?.name} Summary:</strong> Total Pts: ${teamBTotals.pts}
                                ${currentSportConfig.hasSets ? `• Sets Won: ${activeMatch.setsB || 0}` : `• Fouls: ${activeMatch.teamBFouls}`}
                              </div>
                            </div>

                            <div class="roster-grid">
                              <!-- Team A Box Score -->
                              <div class="table-wrap">
                                <div class="table-title">${teamA?.name}</div>
                                <table>
                                  <thead>
                                    <tr>
                                      <th style="width: 18px;">#</th>
                                      <th>Player</th>
                                      <th class="text-center">Pos</th>
                                      <th class="text-center">PTS</th>
                                      ${!currentSportConfig.hasSets ? '<th class="text-center">3PT</th><th class="text-center">FLS</th>' : ''}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    ${teamA?.players.map((p) => {
                                      const st = activeMatch.stats[String(p.id)] || { points: 0, fg3: 0, fouls: 0 };
                                      return `
                                        <tr>
                                          <td><b>#${p.jersey}</b></td>
                                          <td>${p.name}</td>
                                          <td class="text-center">${p.position}</td>
                                          <td class="text-center"><b>${st.points}</b></td>
                                          ${!currentSportConfig.hasSets ? `<td class="text-center">${st.fg3}</td><td class="text-center">${st.fouls}</td>` : ''}
                                        </tr>
                                      `;
                                    }).join('')}
                                  </tbody>
                                </table>
                              </div>

                              <!-- Team B Box Score -->
                              <div class="table-wrap">
                                <div class="table-title">${teamB?.name}</div>
                                <table>
                                  <thead>
                                    <tr>
                                      <th style="width: 18px;">#</th>
                                      <th>Player</th>
                                      <th class="text-center">Pos</th>
                                      <th class="text-center">PTS</th>
                                      ${!currentSportConfig.hasSets ? '<th class="text-center">3PT</th><th class="text-center">FLS</th>' : ''}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    ${teamB?.players.map((p) => {
                                      const st = activeMatch.stats[String(p.id)] || { points: 0, fg3: 0, fouls: 0 };
                                      return `
                                        <tr>
                                          <td><b>#${p.jersey}</b></td>
                                          <td>${p.name}</td>
                                          <td class="text-center">${p.position}</td>
                                          <td class="text-center"><b>${st.points}</b></td>
                                          ${!currentSportConfig.hasSets ? `<td class="text-center">${st.fg3}</td><td class="text-center">${st.fouls}</td>` : ''}
                                        </tr>
                                      `;
                                    }).join('')}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            <div class="signatories">
                              <div>
                                <div class="sign-line">${currentUser.displayName}</div>
                                <div class="sign-label">Official Scorer / Table Master</div>
                              </div>
                              <div>
                                <div class="sign-line">Certified Official</div>
                                <div class="sign-label">Head Referee / Umpire</div>
                              </div>
                              <div>
                                <div class="sign-line">Tournament Executive</div>
                                <div class="sign-label">Tournament Commissioner</div>
                              </div>
                            </div>
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
                    className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white font-black px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow cursor-pointer print:hidden"
                  >
                    <Printer className="w-4 h-4" /> Print 1-Sheet Report (PDF)
                  </button>
                </div>

                {/* Live Preview Display on Web UI */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 text-center space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                    Certified Match Final • {currentSportConfig.name}
                  </span>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8">
                    <div className="text-center sm:text-right flex-1 w-full">
                      <h2 className="text-xl font-black text-white truncate">{teamA?.name}</h2>
                      <p className="text-[11px] text-slate-400">Coach: {teamA?.coachName || 'Staff'}</p>
                    </div>
                    <div className="flex items-center gap-4 bg-slate-900 px-6 py-2.5 rounded-xl border border-slate-800 flex-shrink-0">
                      <span className="text-3xl sm:text-4xl font-black text-amber-400">{activeMatch.scoreA}</span>
                      <span className="text-slate-600 text-xl font-bold">:</span>
                      <span className="text-3xl sm:text-4xl font-black text-cyan-400">{activeMatch.scoreB}</span>
                    </div>
                    <div className="text-center sm:text-left flex-1 w-full">
                      <h2 className="text-xl font-black text-white truncate">{teamB?.name}</h2>
                      <p className="text-[11px] text-slate-400">Coach: {teamB?.coachName || 'Staff'}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* --- FOOTER --- */}
      <footer className="border-t border-slate-800 bg-slate-950 py-4 px-4 sm:px-6 mt-auto print:hidden">
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