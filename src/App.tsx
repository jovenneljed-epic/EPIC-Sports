import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';
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
import { PlayerLeaderboardView } from './components/PlayerLeaderboardView';
import { SmartScheduleGenerator } from './components/SmartScheduleGenerator';
import { LeagueBrandingModal, type LeagueBranding } from './components/LeagueBrandingModal';
import { PublicTeamRegistration } from './components/PublicTeamRegistration';
import { checkCanFinalizeMatch, TIER_PRICES } from './utils/tierLimits';
import { 
  Play, Pause, X, Clock, Volume2, 
  CheckCircle2, Camera, UserCheck, AlertCircle, 
  BarChart3, Plus, Users, Award, Flame, Edit3, 
  Trash2, LogOut, UserCog, Printer, FileText, Calendar, 
  ArrowLeftRight, Lock, Download, Upload, Monitor, Activity, Zap, Palette, Megaphone
} from 'lucide-react';

// --- Domain Models ---
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
  basketball: { id: 'basketball', name: 'Basketball', hasQuarters: true, hasSets: false, periodsName: 'Quarters' },
  volleyball: { id: 'volleyball', name: 'Volleyball', hasQuarters: false, hasSets: true, maxScorePerSet: 25, periodsName: 'Sets' },
  badminton: { id: 'badminton', name: 'Badminton', hasQuarters: false, hasSets: true, maxScorePerSet: 21, periodsName: 'Sets' },
};

type NavTab = 'desk' | 'roster' | 'stats' | 'schedule' | 'report' | 'leaderboard' | 'register';

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

export interface PlayLog {
  id: string;
  timestamp: string;
  description: string;
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
  logs?: PlayLog[];
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

// --- Manual Arena Voice Announcer Utility ---
const speakAnnouncement = (text: string) => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1.1;
    utterance.volume = 1.0;
    window.speechSynthesis.speak(utterance);
  }
};

// --- Flexible Starting Lineup Announcer Helper ---
const announceStartingLineups = (team: Team) => {
  if (!team || !team.players || team.players.length === 0) {
    speakAnnouncement(`And now, introducing the players for ${team?.name || 'the team'}.`);
    return;
  }

  let introScript = `And now, ladies and gentlemen, let's welcome the players for, ${team.name}! Head Coach, ${team.coachName || 'Staff'}. `;
  
  team.players.forEach((player) => {
    const positionName = player.position || 'Player';
    introScript += `${positionName}, ${player.name}! `;
  });

  introScript += `Let's get ready for tip-off!`;
  
  speakAnnouncement(introScript);

  setTimeout(() => {
    arenaAudio.playCrowdClapping();
  }, 3500);
};

// --- Champion Banner Template Component for Free Facebook Automation ---
interface ChampionBannerProps {
  tournamentName: string;
  winner: string;
  loser: string;
  score: string;
}

const ChampionBanner = React.forwardRef<HTMLDivElement, ChampionBannerProps>(
  ({ tournamentName, winner, loser, score }, ref) => {
    return (
      <div style={{ position: 'absolute', top: -9999, left: -9999, visibility: 'visible' }}>
        <div
          ref={ref}
          style={{
            width: '1200px',
            height: '630px',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)',
            color: '#ffffff',
            fontFamily: 'sans-serif',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '60px',
            boxSizing: 'border-box',
            border: '8px solid #f59e0b',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#f59e0b', letterSpacing: '2px' }}>
              EPIC SPORTS CIRCUIT
            </span>
            <span style={{ fontSize: '20px', color: '#93c5fd' }}>{tournamentName}</span>
          </div>

          <div style={{ textAlign: 'center', margin: 'auto 0' }}>
            <div style={{ fontSize: '32px', textTransform: 'uppercase', color: '#f59e0b', fontWeight: 'bold', marginBottom: '10px' }}>
              🏆 Official Champions 🏆
            </div>
            <h1 style={{ fontSize: '72px', margin: '0 0 20px 0', fontWeight: '900', textShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
              {winner}
            </h1>
            <div style={{ fontSize: '28px', color: '#cbd5e1' }}>
              Defeated {loser} • Final Score: <span style={{ color: '#6ee7b7', fontWeight: 'bold' }}>{score}</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid rgba(255,255,255,0.2)', paddingTop: '20px' }}>
            <span style={{ fontSize: '18px', color: '#94a3b8' }}>#EPICSports #Championship #Victory</span>
            <span style={{ fontSize: '18px', color: '#f59e0b', fontWeight: 'bold' }}>The Home of Champions</span>
          </div>
        </div>
      </div>
    );
  }
);
ChampionBanner.displayName = 'ChampionBanner';

// --- Header Action Cluster for Free FB Automated Posting ---
interface HeaderActionClusterProps {
  isCommissioner: boolean;
}

function HeaderActionCluster({ isCommissioner }: HeaderActionClusterProps) {
  const bannerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);

  // Hide completely from non-commissioners (viewers/committee)
  if (!isCommissioner) return null;

  const handleTestPost = async () => {
    if (!bannerRef.current) return;
    setLoading(true);

    try {
      const canvas = await html2canvas(bannerRef.current, { scale: 2 });
      const blob = await new Promise<Blob>((resolve) => 
        canvas.toBlob((b) => resolve(b!), 'image/png')
      );

      const formData = new FormData();
      formData.append("image", blob, "champion.png");
      formData.append("message", `🏆 TOURNAMENT CHAMPIONS! 🏆\n\nCongratulations to Team Titans for taking the crown in the EPIC Inter-Barangay Circuit! 🏀🔥`);

      const response = await fetch(`https://ukhmrgbkrfawgszltzsr.supabase.co/functions/v1/post-to-facebook`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        alert("Success! Check your Facebook page to see your free automated champion post.");
      } else {
        alert(`Failed: ${result.error || JSON.stringify(result)}`);
      }
    } catch (err: any) {
      console.error(err);
      alert(`Error: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <ChampionBanner 
        ref={bannerRef} 
        tournamentName="EPIC Inter-Barangay Circuit" 
        winner="Team Titans" 
        loser="Ballers United" 
        score="88 - 82" 
      />
      <button
        onClick={handleTestPost}
        disabled={loading}
        className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1 shadow-sm disabled:opacity-50 cursor-pointer"
        title="Test Automated Facebook Champion Post"
      >
        {loading ? 'Broadcasting...' : '📢 Test FB Post'}
      </button>
    </>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  
  // Initialize session safely using useEffect
  useEffect(() => {
    async function initSession() {
      const user = await authStore.getCurrentUser();
      setCurrentUser(user);
    }
    initSession();
  }, []);

  const [activeTab, setActiveTab] = useState<NavTab>('roster');
  const [isSpectatorMode, setIsSpectatorMode] = useState<boolean>(false);
  const [selectedSportTab, setSelectedSportTab] = useState<SportType>('basketball');

  // Subscription & Tier States
  const [currentTier, setCurrentTier] = useState<string>('free');
  const [showUpgradeModal, setShowUpgradeModal] = useState<boolean>(false);

  // White-Labeling & Branding States
  const [isBrandingModalOpen, setIsBrandingModalOpen] = useState(false);
  const [leagueBranding, setLeagueBranding] = useState<LeagueBranding>({
    leagueName: 'EPIC TOURNAMENT CIRCUIT',
    venueName: 'Main Gymnasium',
    logoUrl: '/epic-logo.png',
    sponsorTagline: 'Powered by Kezjed Solutions',
    accentColor: 'amber',
  });

  const [activeSession, _setActiveSession] = useState<TournamentSession>(DEFAULT_SESSION);
  const [teams, setTeams] = useState<Team[]>([]);
  const [scheduledMatches, setScheduledMatches] = useState<ScheduledMatch[]>([]);
  const [gameSettings, setGameSettings] = useState<GameSettings>(DEFAULT_SETTINGS);

  // Cloud Sync Data Fetcher from Supabase
  useEffect(() => {
    async function loadCloudData() {
      try {
        const { data: orgData } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', activeSession.id)
          .maybeSingle();

        if (orgData) {
          setCurrentTier(orgData.tier || 'free');
          if (orgData.name) {
            setLeagueBranding((prev) => ({
              ...prev,
              leagueName: orgData.name,
              venueName: orgData.venue || prev.venueName,
              logoUrl: orgData.branding?.logoUrl || prev.logoUrl,
              sponsorTagline: orgData.branding?.sponsorTagline || prev.sponsorTagline,
              accentColor: orgData.branding?.accentColor || prev.accentColor,
            }));
          }
        } else {
          await supabase.from('organizations').insert([{
            id: activeSession.id,
            name: activeSession.name,
            venue: activeSession.venue,
            sport_type: activeSession.sportType,
            start_date: activeSession.startDate,
            end_date: activeSession.endDate,
            tier: 'free',
            is_pro: false
          }]);
        }

        const { data: teamData } = await supabase
          .from('teams')
          .select('*')
          .eq('org_id', activeSession.id);

        if (teamData) {
          setTeams(teamData.map((t: any) => ({
            id: t.id,
            name: t.name,
            sportType: t.sport_type,
            coachName: t.coach_name,
            color: t.color,
            players: t.players || []
          })));
        }

        const { data: matchData } = await supabase
          .from('scheduled_matches')
          .select('*')
          .eq('org_id', activeSession.id);

        if (matchData) {
          setScheduledMatches(matchData.map((m: any) => ({
            id: m.id,
            sessionId: m.org_id,
            sportType: m.sport_type,
            teamAId: m.team_a_id,
            teamBId: m.team_b_id,
            timeSlot: m.time_slot,
            status: m.status
          })));
        }

        const { data: settingsData } = await supabase
          .from('game_settings')
          .select('*')
          .eq('org_id', activeSession.id)
          .maybeSingle();

        if (settingsData) {
          setGameSettings({
            quarterMinutes: settingsData.quarter_minutes,
            shotClockSeconds: settingsData.shot_clock_seconds,
            offensiveReboundShotClock: settingsData.offensive_rebound_shot_clock,
            foulDisqualificationLimit: settingsData.foul_disqualification_limit,
            courtName: settingsData.court_name
          });
        }
      } catch (err) {
        console.error('Error loading cloud data from Supabase:', err);
      }
    }

    if (currentUser) {
      loadCloudData();
    }
  }, [activeSession.id, currentUser]);

  // Compute completed matches count for this session
  const completedMatchesCount = useMemo(() => {
    return scheduledMatches.filter((m) => m.status === 'Completed').length;
  }, [scheduledMatches]);

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
      logs: [],
      stats: {},
    };
    return defaultState;
  });

  // Dynamic PayMongo Checkout Handler with Tier Support
  const handleSelectTier = async (tierKey: 'basic' | 'essential' | 'pro') => {
    const tierInfo = TIER_PRICES[tierKey];
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: {
          orgId: activeSession.id,
          amountInPesos: tierInfo.price,
          tier: tierKey,
        },
      });

      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("PayMongo Checkout Error:", err);
      alert("Could not initialize payment session.");
    }
  };

  // Match Finalization Check against Tier Limits
  const handleAttemptFinalizeMatch = () => {
    const canProceed = checkCanFinalizeMatch(currentTier, completedMatchesCount);
    if (!canProceed) {
      setShowUpgradeModal(true);
      return;
    }

    if (window.confirm('Declare match FINAL? This locks scoring and enables the certified Game Report.')) {
      setIsClockRunning(false);
      setActiveMatch((prev) => ({ ...prev, status: 'Final', quarter: 'Final' }));
      arenaAudio.playArenaBuzzer();
      speakAnnouncement("The match is now final!");
    }
  };

  // Modals state
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

  // Biometrics hydration
  useEffect(() => {
    let isMounted = true;
    async function loadBiometrics() {
      try {
        const { data, error, status } = await supabase.from('sports_players').select('id, face_descriptor');
        if (status === 401) return;
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
        console.warn('Supabase offline:', e);
      }
    }
    if (currentUser) loadBiometrics();
    return () => { isMounted = false; };
  }, [currentUser]);

  const handleLogout = () => {
    authStore.logout();
    setCurrentUser(null);
  };

  // Cloud-Synced Game Settings Save Handler
  const handleSaveSettings = async (newSettings: GameSettings) => {
    setGameSettings(newSettings);
    setGameSeconds(newSettings.quarterMinutes * 60);
    setShotClock(newSettings.shotClockSeconds);
    setActiveMatch((prev) => ({ ...prev, court: newSettings.courtName }));

    await supabase.from('game_settings').upsert({
      org_id: activeSession.id,
      quarter_minutes: newSettings.quarterMinutes,
      shot_clock_seconds: newSettings.shotClockSeconds,
      offensive_rebound_shot_clock: newSettings.offensiveReboundShotClock,
      foul_disqualification_limit: newSettings.foulDisqualificationLimit,
      court_name: newSettings.courtName
    });
  };

  // JSON Backup / Restore handlers
  const exportTournamentData = () => {
    const backup = {
      session: activeSession,
      teams,
      scheduledMatches,
      gameSettings,
      leagueBranding,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `epic-tournament-backup-${activeSession.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importTournamentData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.teams && data.session) {
          _setActiveSession(data.session);
          setTeams(data.teams);
          if (data.scheduledMatches) setScheduledMatches(data.scheduledMatches);
          if (data.gameSettings) setGameSettings(data.gameSettings);
          if (data.leagueBranding) setLeagueBranding(data.leagueBranding);
          alert('Tournament backup successfully restored!');
        } else {
          alert('Invalid backup file structure.');
        }
      } catch (err) {
        console.error(err);
        alert('Failed to parse JSON backup file.');
      }
    };
    reader.readAsText(file);
  };

  const enrolledRoster = useMemo(() => {
    return teams.flatMap((t) => t.players).filter((p) => p.descriptor).map((p) => ({
      id: String(p.id),
      name: p.name,
      jersey: p.jersey,
      descriptor: p.descriptor!,
    }));
  }, [teams]);

  const allPlayers = useMemo(() => teams.flatMap((t) => t.players), [teams]);
  const filteredTeams = useMemo(() => teams.filter((t) => (t.sportType || 'basketball') === selectedSportTab), [teams, selectedSportTab]);

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
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
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
          ...(prev.stats[idKey] || { playerId: idKey, points: 0, ft: 0, fg2: 0, fg3: 0, fouls: 0, isCheckedIn: false, isOnCourt: true, isFouledOut: false }),
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
        stats: { ...prev.stats, [idKey]: { ...st, isOnCourt: !st.isOnCourt } },
      };
    });
  }, []);

  const handleEnrollSuccess = useCallback(async (playerId: string, descriptor: number[]) => {
    const idKey = String(playerId).trim();
    setTeams((prev) => {
      return prev.map((t) => ({
        ...t,
        players: t.players.map((p) => (String(p.id) === idKey ? { ...p, descriptor } : p)),
      }));
    });
    try {
      await supabase.from('sports_players').update({ face_descriptor: descriptor }).eq('id', idKey);
    } catch (err) {
      console.warn('Supabase offline:', err);
    }
  }, []);

  const handleScore = useCallback((playerId: string, teamKey: 'A' | 'B', pt: number) => {
    if (currentUser?.role === 'viewer') {
      alert('Viewer accounts have read-only access.');
      return;
    }

    setActiveMatch((prev) => {
      if (prev.status === 'Final') return prev;
      const idKey = String(playerId).trim();
      const st = prev.stats[idKey] || { playerId: idKey, points: 0, ft: 0, fg2: 0, fg3: 0, fouls: 0, isCheckedIn: false, isOnCourt: true, isFouledOut: false };

      if (!st.isCheckedIn) {
        alert('ATTENDANCE LOCKOUT: Verify player identity first.');
        return prev;
      }
      if (st.isFouledOut) return prev;

      arenaAudio.playSwish();
      setShotClock(gameSettings.shotClockSeconds);

      const teamName = (teamKey === 'A' ? teams.find(t => t.id === prev.teamAId)?.name : teams.find(t => t.id === prev.teamBId)?.name) || 'Team';
      const logEntry: PlayLog = {
        id: `log_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        description: `${teamName} scored +${pt}pt(s)`,
      };

      return {
        ...prev,
        scoreA: teamKey === 'A' ? prev.scoreA + pt : prev.scoreA,
        scoreB: teamKey === 'B' ? prev.scoreB + pt : prev.scoreB,
        logs: [logEntry, ...(prev.logs || [])],
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
  }, [currentUser, gameSettings, teams]);

  const handleFoul = useCallback((playerId: string, teamKey: 'A' | 'B') => {
    if (currentUser?.role === 'viewer') return;
    setActiveMatch((prev) => {
      if (prev.status === 'Final') return prev;
      const idKey = String(playerId).trim();
      const st = prev.stats[idKey] || { playerId: idKey, points: 0, ft: 0, fg2: 0, fg3: 0, fouls: 0, isCheckedIn: false, isOnCourt: true, isFouledOut: false };
      if (!st.isCheckedIn || st.isFouledOut) return prev;

      arenaAudio.playWhistle();
      const nextFouls = st.fouls + 1;
      const fouledOut = nextFouls >= gameSettings.foulDisqualificationLimit;
      const nextTeamAFouls = teamKey === 'A' ? prev.teamAFouls + 1 : prev.teamAFouls;
      const nextTeamBFouls = teamKey === 'B' ? prev.teamBFouls + 1 : prev.teamBFouls;

      const teamName = (teamKey === 'A' ? teams.find(t => t.id === prev.teamAId)?.name : teams.find(t => t.id === prev.teamBId)?.name) || 'Team';

      const logEntry: PlayLog = {
        id: `log_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        description: `Personal foul called on ${teamName} player`,
      };

      return {
        ...prev,
        teamAFouls: nextTeamAFouls,
        teamBFouls: nextTeamBFouls,
        logs: [logEntry, ...(prev.logs || [])],
        stats: {
          ...prev.stats,
          [idKey]: { ...st, fouls: nextFouls, isFouledOut: fouledOut },
        },
      };
    });
  }, [currentUser, gameSettings, teams]);

  // Cloud-Synced Save Team Handler
  const handleSaveTeam = async (teamData: Team) => {
    setTeams((prev) => {
      const exists = prev.some((t) => t.id === teamData.id);
      return exists ? prev.map((t) => (t.id === teamData.id ? teamData : t)) : [...prev, teamData];
    });
    setEditingTeam(null);

    await supabase.from('teams').upsert({
      id: teamData.id,
      org_id: activeSession.id,
      name: teamData.name,
      sport_type: teamData.sportType,
      coach_name: teamData.coachName,
      color: teamData.color,
      players: teamData.players,
      updated_at: new Date().toISOString()
    });
  };

  // Cloud-Synced Delete Team Handler
  const handleDeleteTeam = async (teamId: string) => {
    if (currentUser?.role !== 'commissioner') {
      alert('Only the Tournament Commissioner can delete registered franchises.');
      return;
    }
    if (window.confirm('Disband and remove this franchise?')) {
      setTeams((prev) => prev.filter((t) => t.id !== teamId));
      await supabase.from('teams').delete().eq('id', teamId);
    }
  };

  const teamA = useMemo(() => teams.find((t) => t.id === activeMatch.teamAId), [teams, activeMatch.teamAId]);
  const teamB = useMemo(() => teams.find((t) => t.id === activeMatch.teamBId), [teams, activeMatch.teamBId]);
  const currentSportConfig = SPORT_CONFIGS[activeMatch.sportType || 'basketball'];

  if (!currentUser) {
    return <AdminLoginGate onAuthenticated={(user) => setCurrentUser(user)} />;
  }

  const isCommissioner = currentUser.role === 'commissioner';
  const isViewer = currentUser.role === 'viewer';

  // --- SPECTATOR TV DISPLAY MODE ---
  if (isSpectatorMode) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col justify-between p-8 font-sans selection:bg-none">
        <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <img 
              src={leagueBranding.logoUrl || '/epic-logo.png'} 
              alt="League Logo" 
              onError={(e) => { (e.target as HTMLImageElement).src = '/epic-logo.png'; }}
              className="w-12 h-12 rounded-2xl border border-blue-500/30 object-cover bg-zinc-900" 
            />
            <div>
              <h1 className="text-xl font-black uppercase tracking-wider text-amber-400">
                {leagueBranding.leagueName}
              </h1>
              <p className="text-xs text-zinc-400">
                {leagueBranding.venueName} • {gameSettings.courtName}
              </p>
              {leagueBranding.sponsorTagline && (
                <p className="text-[10px] text-amber-400/80 font-bold uppercase tracking-widest mt-0.5">
                  ★ {leagueBranding.sponsorTagline}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => setIsSpectatorMode(false)}
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-bold border border-zinc-800 cursor-pointer"
          >
            Exit TV Mode
          </button>
        </div>

        {teamA && teamB ? (
          <div className="grid grid-cols-3 items-center text-center my-auto py-12">
            <div className="space-y-2">
              <span className="text-xs font-black uppercase tracking-widest text-zinc-500">Home Team</span>
              <h2 className="text-4xl lg:text-5xl font-black text-white">{teamA.name}</h2>
              <p className="text-sm text-zinc-400">Coach: {teamA.coachName || 'Staff'}</p>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xs font-black uppercase tracking-widest text-amber-400 mb-2">{activeMatch.status} • {activeMatch.quarter}</span>
              <div className="flex items-center gap-6 bg-zinc-950 px-12 py-6 rounded-3xl border border-zinc-800 shadow-2xl">
                <span className="text-8xl lg:text-9xl font-black text-amber-400 tabular-nums">{activeMatch.scoreA}</span>
                <span className="text-zinc-600 text-5xl font-bold">:</span>
                <span className="text-8xl lg:text-9xl font-black text-cyan-400 tabular-nums">{activeMatch.scoreB}</span>
              </div>
              <div className="mt-4 font-mono text-3xl font-black text-white tracking-widest bg-zinc-900 px-6 py-2 rounded-xl border border-zinc-800">
                {formatTime(gameSeconds)}
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-xs font-black uppercase tracking-widest text-zinc-500">Away Team</span>
              <h2 className="text-4xl lg:text-5xl font-black text-white">{teamB.name}</h2>
              <p className="text-sm text-zinc-400">Coach: {teamB.coachName || 'Staff'}</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-24 text-zinc-500 text-xl font-bold">No active match loaded on Scorer Desk.</div>
        )}

        <div className="text-center text-xs text-zinc-600 border-t border-zinc-900 pt-4">
          Powered by Kezjed Solutions • Philippians 4:13
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white print:bg-white print:text-black">
      {/* Top Header */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 shadow-xl print:hidden">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center justify-between w-full md:w-auto">
            <div className="flex items-center gap-2.5">
              <img 
                src={leagueBranding.logoUrl || '/epic-logo.png'} 
                alt="League Logo" 
                onError={(e) => { (e.target as HTMLImageElement).src = '/epic-logo.png'; }}
                className="w-9 h-9 rounded-xl shadow-lg border border-blue-500/30 object-cover bg-slate-900" 
              />
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h1 className="text-base font-black tracking-tight text-white uppercase">
                    {leagueBranding.leagueName}
                  </h1>
                  {leagueBranding.sponsorTagline && (
                    <span className="text-[9px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/30 px-1.5 py-0.2 rounded-full uppercase truncate max-w-[160px]">
                      {leagueBranding.sponsorTagline}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 font-semibold">{leagueBranding.venueName}</p>
              </div>
            </div>
          </div>

          <nav className="flex items-center bg-slate-950/90 p-1 rounded-xl border border-slate-800 overflow-x-auto max-w-full w-full md:w-auto scrollbar-none">
            <button type="button" onClick={() => setActiveTab('roster')} className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${activeTab === 'roster' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>
              <Users className="w-3.5 h-3.5" /> Franchises
            </button>
            <button type="button" onClick={() => setActiveTab('schedule')} className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${activeTab === 'schedule' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>
              <Calendar className="w-3.5 h-3.5" /> Schedule ({scheduledMatches.length})
            </button>
            <button type="button" onClick={() => setActiveTab('desk')} className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${activeTab === 'desk' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>
              <Clock className="w-3.5 h-3.5" /> Desk
            </button>
            <button type="button" onClick={() => setActiveTab('stats')} className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${activeTab === 'stats' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>
              <BarChart3 className="w-3.5 h-3.5" /> Standings
            </button>
            <button type="button" onClick={() => setActiveTab('leaderboard')} className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${activeTab === 'leaderboard' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>
              <Award className="w-3.5 h-3.5 text-amber-400" /> Hero Cards
            </button>
            <button type="button" onClick={() => setActiveTab('report')} className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${activeTab === 'report' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>
              <FileText className="w-3.5 h-3.5" /> Report {activeMatch.status !== 'Final' && <Lock className="w-3 h-3 text-slate-500" />}
            </button>
          </nav>

          <div className="flex items-center gap-1.5 justify-end w-full md:w-auto flex-wrap">
            {/* Automated Free Facebook Test Button (Commissioner Only) */}
            <HeaderActionCluster isCommissioner={isCommissioner} />

            {/* Active Subscription Tier Badge */}
            <div className={`px-2.5 py-1 text-[11px] font-black uppercase rounded-lg border ${
              currentTier === 'pro' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
              currentTier === 'essential' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
              currentTier === 'basic' ? 'bg-slate-800 text-slate-300 border-slate-700' :
              'bg-zinc-800 text-zinc-400 border-zinc-700'
            }`}>
              Plan: {currentTier}
            </div>

            <button type="button" onClick={() => setShowUpgradeModal(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-2.5 py-1.5 text-[11px] rounded-lg flex items-center gap-1 cursor-pointer shadow transition" title="Upgrade Subscription">
              <Zap className="w-3.5 h-3.5" /> Upgrade Tiers
            </button>

            {isCommissioner && (
              <>
                <button
                  type="button"
                  onClick={() => setIsBrandingModalOpen(true)}
                  className="bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 px-2.5 py-1.5 text-[11px] font-bold rounded-lg flex items-center gap-1 cursor-pointer transition shadow"
                  title="Custom League White-Labeling"
                >
                  <Palette className="w-3.5 h-3.5" /> Brand
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('register')}
                  className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg border flex items-center gap-1 transition cursor-pointer shadow ${activeTab === 'register' ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border-slate-700'}`}
                  title="Open Public Team Registration Link"
                >
                  <Users className="w-3.5 h-3.5" /> Registration Link
                </button>
              </>
            )}

            <button type="button" onClick={() => setIsSpectatorMode(true)} className="bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 px-2.5 py-1.5 text-[11px] font-bold rounded-lg flex items-center gap-1 cursor-pointer" title="Fullscreen Arena Display">
              <Monitor className="w-3.5 h-3.5" /> TV Mode
            </button>
            {isCommissioner && (
              <>
                <button type="button" onClick={exportTournamentData} className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-2.5 py-1.5 text-[11px] font-bold rounded-lg flex items-center gap-1 cursor-pointer" title="Export Backup JSON">
                  <Download className="w-3.5 h-3.5" /> Export
                </button>
                <label className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-2.5 py-1.5 text-[11px] font-bold rounded-lg flex items-center gap-1 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" /> Import
                  <input type="file" accept=".json" onChange={importTournamentData} className="hidden" />
                </label>
              </>
            )}
            <button type="button" onClick={() => setIsAccountModalOpen(true)} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 cursor-pointer" title="Account Settings & RBAC">
              <UserCog className="w-4 h-4 text-blue-400" />
            </button>
            <button type="button" onClick={handleLogout} className="p-2 bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900/50 rounded-lg cursor-pointer transition" title="Log Out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Viewport */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 flex-1 w-full print:p-0 print:max-w-none">
        
        {/* VIEW: PUBLIC REGISTRATION PORTAL */}
        {activeTab === 'register' && (
          <div className="space-y-6 print:hidden">
            <div className="flex justify-between items-center bg-slate-900 p-4 rounded-2xl border border-slate-800">
              <div>
                <h2 className="text-sm font-black text-white uppercase">Public Registration Portal Preview</h2>
                <p className="text-xs text-slate-400">Share this view or URL with team captains to let them self-register.</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('roster')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Back to Dashboard
              </button>
            </div>

            <PublicTeamRegistration
              sessionId={activeSession.id}
              leagueName={leagueBranding.leagueName}
              onTeamRegistered={async (newTeam) => {
                setTeams((prev) => [...prev, newTeam]);
                setActiveTab('roster');
                alert(`Team "${newTeam.name}" successfully registered and added to your roster!`);
              }}
            />
          </div>
        )}

        {/* VIEW 1: FRANCHISES */}
        {activeTab === 'roster' && (
          <div className="space-y-6 print:hidden">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div>
                <h2 className="text-xl font-black text-white uppercase tracking-tight">Official Tournament Franchises</h2>
                <p className="text-xs text-slate-400">Showing franchises for <strong className="text-amber-400 uppercase">{selectedSportTab}</strong> in {leagueBranding.leagueName}</p>
              </div>

              <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl gap-1 overflow-x-auto max-w-full">
                {(['basketball', 'volleyball', 'badminton'] as SportType[]).map((sport) => {
                  const sportCount = teams.filter((t) => (t.sportType || 'basketball') === sport).length;
                  return (
                    <button key={sport} type="button" onClick={() => setSelectedSportTab(sport)} className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition cursor-pointer whitespace-nowrap ${selectedSportTab === sport ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
                      {sport} ({sportCount})
                    </button>
                  );
                })}
              </div>

              {isCommissioner && (
                <button type="button" onClick={() => { setEditingTeam(null); setIsTeamModalOpen(true); }} className="bg-blue-600 hover:bg-blue-500 text-white font-black px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-lg cursor-pointer">
                  <Plus className="w-4 h-4" /> Enter Official Team
                </button>
              )}
            </div>

            {filteredTeams.length === 0 ? (
              <div className="bg-slate-900/50 border-2 border-dashed border-slate-800 rounded-3xl p-12 text-center space-y-4">
                <div className="w-16 h-16 bg-blue-600/10 border border-blue-500/20 rounded-full flex items-center justify-center mx-auto text-blue-400"><Users className="w-8 h-8" /></div>
                <h3 className="text-base font-bold text-white capitalize">No {selectedSportTab} Teams Registered Yet</h3>
                {isCommissioner && (
                  <button type="button" onClick={() => { setEditingTeam(null); setIsTeamModalOpen(true); }} className="bg-blue-600 hover:bg-blue-500 text-white font-black px-5 py-2.5 rounded-xl text-xs inline-flex items-center gap-2 cursor-pointer shadow-lg capitalize">
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
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-full border border-amber-500/30">{team.sportType || 'basketball'}</span>
                          </div>
                          <p className="text-xs text-slate-400">Coach: <span className="text-white font-semibold">{team.coachName || 'Staff'}</span> • {team.players.length} Players</p>
                        </div>
                      </div>

                      {isCommissioner && (
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => { setEditingTeam(team); setIsTeamModalOpen(true); }} className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"><Edit3 className="w-3.5 h-3.5 text-blue-400" /> Edit</button>
                          <button type="button" onClick={() => handleDeleteTeam(team.id)} className="bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-900/60 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"><Trash2 className="w-3.5 h-3.5 text-red-400" /> Remove</button>
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
                              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] px-2.5 py-0.5 rounded-full font-bold inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Biometrics Saved</span>
                            ) : (
                              <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] px-2.5 py-0.5 rounded-full font-bold inline-flex items-center gap-1"><AlertCircle className="w-3 h-3" /> No Face Scan</span>
                            )}
                          </div>
                          <div className="flex gap-1.5 pt-1">
                            {!isViewer && (
                              <button type="button" onClick={() => setEnrollingPlayer(player)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-blue-300 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center justify-center gap-1"><Camera className="w-3 h-3" /> {player.descriptor ? 'Update' : 'Enroll'}</button>
                            )}
                            <button type="button" onClick={() => setSelectedPlayer(player)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer">QR Pass</button>
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

        {/* VIEW 2: SCHEDULE */}
        {activeTab === 'schedule' && (
          <div className="space-y-6 print:hidden">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div>
                <h2 className="text-xl font-black text-white uppercase tracking-tight">Tournament Match Schedule</h2>
                <p className="text-xs text-slate-400">Auto-generate conflict-free schedules or queue individual matchups</p>
              </div>
            </div>

            {/* Automated Smart Scheduler Component */}
            {isCommissioner && (
              <SmartScheduleGenerator
                teams={teams}
                sessionId={activeSession.id}
                sportType={selectedSportTab}
                onScheduleGenerated={async (newMatches) => {
                  setScheduledMatches((prev) => [...prev, ...newMatches]);
                  for (const m of newMatches) {
                    await supabase.from('scheduled_matches').upsert({
                      id: m.id,
                      org_id: activeSession.id,
                      sport_type: m.sportType,
                      team_a_id: m.teamAId,
                      team_b_id: m.teamBId,
                      time_slot: m.timeSlot,
                      status: m.status,
                      updated_at: new Date().toISOString()
                    });
                  }
                }}
              />
            )}

            {isCommissioner && teams.length >= 2 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-blue-400">Schedule New Matchup Manually</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-400 mb-1">Sport Type</label>
                    <select value={queueSportType} onChange={(e) => { setQueueSportType(e.target.value as SportType); setQueueTeamA(''); setQueueTeamB(''); }} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold">
                      <option value="basketball">Basketball</option>
                      <option value="volleyball">Volleyball</option>
                      <option value="badminton">Badminton</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-400 mb-1">Home Team</label>
                    <select value={queueTeamA} onChange={(e) => setQueueTeamA(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold">
                      <option value="">Select Home Team</option>
                      {teams.filter((t) => (t.sportType || 'basketball') === queueSportType).filter((t) => t.id !== queueTeamB).map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-400 mb-1">Away Team</label>
                    <select value={queueTeamB} onChange={(e) => setQueueTeamB(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold">
                      <option value="">Select Away Team</option>
                      {teams.filter((t) => (t.sportType || 'basketball') === queueSportType).filter((t) => t.id !== queueTeamA).map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-400 mb-1">Time Slot</label>
                    <div className="flex gap-2">
                      <input type="text" placeholder="e.g. 10:00 AM" value={queueTime} onChange={(e) => setQueueTime(e.target.value)} className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold" />
                      <button type="button" onClick={async () => {
                        if (!queueTeamA || !queueTeamB || queueTeamA === queueTeamB) { alert('Select two distinct teams.'); return; }
                        const newMatch: ScheduledMatch = { id: `sched_${Date.now()}`, sessionId: activeSession.id, sportType: queueSportType, teamAId: queueTeamA, teamBId: queueTeamB, timeSlot: queueTime.trim() || 'TBD', status: 'Upcoming' };
                        setScheduledMatches((prev) => [...prev, newMatch]);
                        
                        await supabase.from('scheduled_matches').upsert({
                          id: newMatch.id,
                          org_id: activeSession.id,
                          sport_type: newMatch.sportType,
                          team_a_id: newMatch.teamAId,
                          team_b_id: newMatch.teamBId,
                          time_slot: newMatch.timeSlot,
                          status: newMatch.status,
                          updated_at: new Date().toISOString()
                        });

                        setQueueTeamA(''); setQueueTeamB('');
                      }} className="bg-blue-600 hover:bg-blue-500 text-white font-black px-4 py-2 rounded-xl cursor-pointer shadow whitespace-nowrap">Add</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {scheduledMatches.length === 0 ? (
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 text-center text-xs text-slate-400">No matches scheduled yet.</div>
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
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/30 font-mono">{m.timeSlot}</span>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-full border border-amber-500/30">{m.sportType}</span>
                        </div>
                        <h4 className="text-sm font-bold text-white mt-2">{tA.name} <span className="text-slate-500 font-normal">vs</span> {tB.name}</h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => {
                          setActiveMatch((prev) => ({ ...prev, sessionId: activeSession.id, sportType: m.sportType, teamAId: m.teamAId, teamBId: m.teamBId, scoreA: 0, scoreB: 0, setsA: 0, setsB: 0, currentSet: 1, history: [], logs: [], quarter: 'Q1', status: 'Live', teamAFouls: 0, teamBFouls: 0, stats: {} }));
                          setActiveTab('desk');
                        }} className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-3 py-2 rounded-xl text-xs cursor-pointer shadow whitespace-nowrap">Load to Desk</button>
                        {isCommissioner && <button type="button" onClick={async () => {
                          setScheduledMatches((prev) => prev.filter((item) => item.id !== m.id));
                          await supabase.from('scheduled_matches').delete().eq('id', m.id);
                        }} className="text-slate-500 hover:text-red-400 p-1.5 cursor-pointer"><Trash2 className="w-4 h-4" /></button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* VIEW 3: SCORER DESK & CHRONOLOGICAL LOG */}
        {activeTab === 'desk' && (
          <div className="space-y-6 print:hidden">
            {teams.length < 2 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                <h3 className="text-sm font-bold text-white">Add at least 2 teams to activate Scorer Desk</h3>
                <button type="button" onClick={() => setActiveTab('roster')} className="bg-blue-600 text-white font-bold px-4 py-2 rounded-xl text-xs cursor-pointer">Go to Franchises</button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 p-3.5 rounded-2xl border border-slate-800 text-xs shadow-md">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Matchup:</span>
                    <span className="px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-lg font-black uppercase text-[11px]">{currentSportConfig.name}</span>
                    <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 font-bold overflow-x-auto">
                      <span className="text-white truncate max-w-[120px]">{teamA?.name || 'Home'}</span>
                      <span className="text-slate-600 text-[10px]">VS</span>
                      <span className="text-white truncate max-w-[120px]">{teamB?.name || 'Away'}</span>
                    </div>
                    <button type="button" onClick={() => setActiveTab('schedule')} className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 rounded-lg font-bold text-[11px] cursor-pointer transition flex items-center gap-1"><Calendar className="w-3 h-3" /> Change</button>
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    <span className="text-[10px] text-slate-400 font-bold uppercase whitespace-nowrap">{currentSportConfig.periodsName}:</span>
                    {currentSportConfig.hasSets ? (
                      <span className="px-3 py-1 rounded bg-blue-600 text-white font-black text-xs">Set {activeMatch.currentSet || 1}</span>
                    ) : (
                      (['Q1', 'Q2', 'Q3', 'Q4', 'OT', 'Final'] as Quarter[]).map((q) => (
                        <button key={q} type="button" disabled={isViewer || activeMatch.status === 'Final'} onClick={() => setActiveMatch((prev) => ({ ...prev, quarter: q }))} className={`px-2 py-0.5 rounded font-bold transition cursor-pointer text-[11px] disabled:opacity-50 whitespace-nowrap ${activeMatch.quarter === q ? 'bg-blue-600 text-white font-black' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>{q}</button>
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
                          <span className="inline-block mt-2 text-xs px-3 py-1 rounded-full font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">Sets Won: {activeMatch.setsA || 0}</span>
                        ) : (
                          <span className={`inline-block mt-2 text-xs px-3 py-1 rounded-full font-bold border ${activeMatch.teamAFouls >= 5 ? 'bg-red-500/20 text-red-400 border-red-500' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>Team Fouls: {activeMatch.teamAFouls} {activeMatch.teamAFouls >= 5 ? '• BONUS' : ''}</span>
                        )}
                      </div>

                      <div className="flex flex-col items-center bg-slate-950 px-6 sm:px-8 py-4 rounded-2xl border border-slate-800 shadow-inner w-full lg:w-auto">
                        <span className="text-xs text-amber-400 font-black uppercase mb-1 tracking-wider text-center">{currentSportConfig.name} • {activeMatch.court} • {activeMatch.status}</span>
                        <button type="button" disabled={activeMatch.status === 'Final'} onClick={() => setActiveMatch((prev) => ({ ...prev, possession: prev.possession === 'A' ? 'B' : 'A' }))} className="my-1.5 px-3 py-1 bg-slate-900 border border-slate-700 hover:border-blue-500 rounded-full text-[11px] font-bold text-slate-300 flex items-center gap-2 cursor-pointer transition shadow disabled:opacity-60">
                          <ArrowLeftRight className="w-3.5 h-3.5 text-blue-400" />
                          <span>{currentSportConfig.hasSets ? 'SERVING: ' : 'POSSESSION: '} <strong className="text-amber-400">{activeMatch.possession === 'A' ? teamA.name : teamB.name}</strong></span>
                        </button>

                        <div className="flex items-center gap-6 sm:gap-8 mb-3">
                          <span className="text-5xl sm:text-6xl font-black text-amber-400 tabular-nums">{activeMatch.scoreA}</span>
                          <span className="text-slate-700 font-bold text-3xl">:</span>
                          <span className="text-5xl sm:text-6xl font-black text-cyan-400 tabular-nums">{activeMatch.scoreB}</span>
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-4 pt-3 border-t border-slate-800/80 w-full">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-slate-400" />
                            <span className="font-mono text-xl font-black text-white">{formatTime(gameSeconds)}</span>
                            {!isViewer && activeMatch.status !== 'Final' && (
                              <button type="button" onClick={() => setIsClockRunning((prev) => !prev)} className={`p-1.5 rounded-lg text-slate-950 font-bold cursor-pointer transition ${isClockRunning ? 'bg-amber-400' : 'bg-emerald-400'}`}>
                                {isClockRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>
                          {!currentSportConfig.hasSets && (
                            <div className="flex items-center gap-2 sm:border-l sm:pl-4 border-slate-800">
                              <span className="text-[10px] text-slate-400 font-bold uppercase">Shot</span>
                              <span className={`font-mono text-xl font-black tabular-nums ${shotClock <= 5 ? 'text-red-500' : 'text-amber-400'}`}>{shotClock}s</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex-1 text-center lg:text-right w-full">
                        <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Away</span>
                        <h2 className="text-2xl font-black text-white truncate">{teamB.name}</h2>
                        <p className="text-xs text-slate-400">Coach: {teamB.coachName || 'Staff'}</p>
                        {currentSportConfig.hasSets ? (
                          <span className="inline-block mt-2 text-xs px-3 py-1 rounded-full font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">Sets Won: {activeMatch.setsB || 0}</span>
                        ) : (
                          <span className={`inline-block mt-2 text-xs px-3 py-1 rounded-full font-bold border ${activeMatch.teamBFouls >= 5 ? 'bg-red-500/20 text-red-400 border-red-500' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>Team Fouls: {activeMatch.teamBFouls} {activeMatch.teamBFouls >= 5 ? '• BONUS' : ''}</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-lg border border-slate-700 overflow-x-auto max-w-full">
                        <button type="button" disabled={isViewer} onClick={() => arenaAudio.playSubstitutionHorn()} className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-amber-300 rounded font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"><Volume2 className="w-3 h-3" /> Horn</button>
                        <button type="button" disabled={isViewer} onClick={() => arenaAudio.playWhistle()} className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-slate-200 rounded font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"><Volume2 className="w-3 h-3" /> Whistle</button>
                        <button type="button" disabled={isViewer} onClick={() => arenaAudio.playArenaBuzzer()} className="px-2.5 py-1 bg-red-900/60 hover:bg-red-800 disabled:opacity-30 disabled:cursor-not-allowed text-red-200 rounded font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"><Volume2 className="w-3 h-3" /> Buzzer</button>
                      </div>

                      <div className="flex items-center gap-3 flex-wrap">
                        {!isViewer && activeMatch.status !== 'Final' ? (
                          <button type="button" onClick={handleAttemptFinalizeMatch} className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow transition cursor-pointer">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Finalize Match
                          </button>
                        ) : (
                          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-black uppercase tracking-wider">Match Finalized</span>
                        )}
                      </div>
                    </div>

                    {/* Manual Arena Voice Announcer Soundboard Panel */}
                    <div className={`mt-4 pt-4 border-t border-slate-800 bg-slate-950/60 p-3 rounded-2xl border ${isViewer ? 'opacity-60 pointer-events-none' : ''}`}>
                      {isViewer && (
                        <div className="mb-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 p-2 rounded-xl text-[11px] font-bold text-center">
                          👀 Spectator Mode: Announcer and sound effects are restricted to Table Officials and Commissioners.
                        </div>
                      )}
                      <div className="flex items-center gap-2 mb-2">
                        <Megaphone className="w-4 h-4 text-amber-400" />
                        <span className="text-[11px] font-black uppercase tracking-wider text-amber-400">Manual Arena Voice Announcer Panel</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                        <button 
                          type="button" 
                          disabled={isViewer}
                          onClick={() => { 
                            arenaAudio.playSubstitutionHorn(); 
                            speakAnnouncement("Ladies and gentlemen, teams, get ready! One minute until tip-off! Clear the court, check your QR passes and face recognition, and let's bring the energy. The battle for supremacy in the EPIC Tournament Circuit starts right now! Five, four, three, two, one, let's play!"); 
                          }} 
                          className="bg-amber-600 hover:bg-amber-500 text-slate-950 py-1.5 px-2 rounded-xl text-[11px] font-black cursor-pointer transition border border-amber-400 col-span-2 sm:col-span-4 lg:col-span-2 disabled:opacity-50"
                        >
                          🔥 1-Min Pre-Game Countdown
                        </button>
                        <button 
                          type="button" 
                          disabled={isViewer || !teamA} 
                          onClick={() => teamA && announceStartingLineups(teamA)} 
                          className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 py-1.5 px-2 rounded-xl text-[11px] font-bold cursor-pointer transition border border-amber-500/30 disabled:opacity-40"
                        >
                          🎙️ Intro Home Lineup ({teamA?.name || 'Home'})
                        </button>
                        <button 
                          type="button" 
                          disabled={isViewer || !teamB} 
                          onClick={() => teamB && announceStartingLineups(teamB)} 
                          className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 py-1.5 px-2 rounded-xl text-[11px] font-bold cursor-pointer transition border border-cyan-500/30 disabled:opacity-40"
                        >
                          🎙️ Intro Away Lineup ({teamB?.name || 'Away'})
                        </button>
                        <button type="button" disabled={isViewer} onClick={() => speakAnnouncement("Five minutes pre-play warmup remaining for each team before the game starts.")} className="bg-blue-950/40 hover:bg-blue-900/60 text-blue-300 py-1.5 px-2 rounded-xl text-[11px] font-bold cursor-pointer transition border border-blue-900/50 disabled:opacity-50">
                          ⏳ 5 Mins Pre-Play
                        </button>
                        <button type="button" disabled={isViewer} onClick={() => speakAnnouncement("Ten minutes before game start, facial recognition and QR code scanning will begin. No face recognition and QR code scanning, no play!")} className="bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 py-1.5 px-2 rounded-xl text-[11px] font-bold cursor-pointer transition border border-amber-900/50 disabled:opacity-50">
                          📷 10 Mins Scan Call
                        </button>
                        <button type="button" disabled={isViewer} onClick={() => speakAnnouncement("Two minutes remaining in the period.")} className="bg-slate-800 hover:bg-slate-700 text-slate-200 py-1.5 px-2 rounded-xl text-[11px] font-bold cursor-pointer transition border border-slate-700 disabled:opacity-50">
                          ⏱️ 2 Min Warning
                        </button>
                        <button type="button" disabled={isViewer} onClick={() => speakAnnouncement("One minute remaining.")} className="bg-slate-800 hover:bg-slate-700 text-slate-200 py-1.5 px-2 rounded-xl text-[11px] font-bold cursor-pointer transition border border-slate-700 disabled:opacity-50">
                          ⏱️ 1 Min Warning
                        </button>
                        <button type="button" disabled={isViewer} onClick={() => { arenaAudio.playSubstitutionHorn(); speakAnnouncement("Ten seconds remaining."); }} className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 py-1.5 px-2 rounded-xl text-[11px] font-bold cursor-pointer transition border border-amber-500/30 disabled:opacity-50">
                          🔔 Final 10 Seconds
                        </button>
                        <button type="button" disabled={isViewer} onClick={() => { arenaAudio.playArenaBuzzer(); speakAnnouncement("Shot clock violation!"); }} className="bg-red-950/40 hover:bg-red-900/60 text-red-300 py-1.5 px-2 rounded-xl text-[11px] font-bold cursor-pointer transition border border-red-900/50 disabled:opacity-50">
                          🚨 Shot Clock Violation
                        </button>
                        <button type="button" disabled={isViewer} onClick={() => speakAnnouncement(`Current score: Home team ${activeMatch.scoreA}, Away team ${activeMatch.scoreB}.`)} className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 py-1.5 px-2 rounded-xl text-[11px] font-bold cursor-pointer transition border border-blue-500/30 disabled:opacity-50">
                          📊 Announce Score
                        </button>
                        <button type="button" disabled={isViewer} onClick={() => speakAnnouncement("The team is in the bonus.")} className="bg-purple-950/40 hover:bg-purple-900/60 text-purple-300 py-1.5 px-2 rounded-xl text-[11px] font-bold cursor-pointer transition border border-purple-900/50 disabled:opacity-50">
                          ⚠️ Bonus Fouls
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Live Play-by-Play Activity Log */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5"><Activity className="w-4 h-4 text-blue-400" /> Live Play-by-Play Activity Log</h3>
                  <div className="bg-slate-950 rounded-xl p-3 max-h-36 overflow-y-auto space-y-1.5 font-mono text-[11px] text-slate-300">
                    {activeMatch.logs && activeMatch.logs.length > 0 ? (
                      activeMatch.logs.map((log) => (
                        <div key={log.id} className="flex items-center justify-between border-b border-slate-900 pb-1">
                          <span className="text-amber-400 font-bold">{log.description}</span>
                          <span className="text-slate-500 text-[10px]">{log.timestamp}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-600 text-center italic py-2">Match activities will appear here as scoring and fouls occur...</p>
                    )}
                  </div>
                </div>

                {/* Team Tables */}
                {teamA && teamB && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {[{ t: teamA, key: 'A' as const, color: 'text-amber-400' }, { t: teamB, key: 'B' as const, color: 'text-cyan-400' }].map(({ t, key, color }) => (
                      <div key={t.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                        <div className="bg-slate-800/80 px-4 py-3 border-b border-slate-700 flex justify-between items-center">
                          <div>
                            <h3 className={`font-black text-sm ${color}`}>{t.name}</h3>
                            <p className="text-[10px] text-slate-400">Coach: {t.coachName || 'Staff'}</p>
                          </div>
                          <span className="text-xs text-slate-300 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-700 whitespace-nowrap">{t.players.filter((p) => activeMatch.stats[String(p.id)]?.isCheckedIn).length} / {t.players.length} Active</span>
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
                                const st = activeMatch.stats[String(p.id)] || { points: 0, ft: 0, fg2: 0, fg3: 0, fouls: 0, isCheckedIn: false, isOnCourt: true, isFouledOut: false };
                                return (
                                  <tr key={p.id} className={!st.isCheckedIn ? 'opacity-45 bg-slate-950/40' : 'hover:bg-slate-800/30'}>
                                    <td className={`p-3 font-mono font-bold ${color}`}>#{p.jersey}</td>
                                    <td className="p-3">
                                      <button type="button" onClick={() => setSelectedPlayer(p)} className="font-semibold text-white hover:underline cursor-pointer flex items-center gap-1.5">
                                        {p.name} {p.descriptor && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />}
                                      </button>
                                    </td>
                                    <td className="p-3 text-center">
                                      {st.isCheckedIn ? <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-bold"><CheckCircle2 className="w-3 h-3" /> Ready</span> : <span className="inline-flex items-center gap-1 text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded font-bold"><AlertCircle className="w-3 h-3" /> Locked</span>}
                                    </td>
                                    <td className="p-3 text-center">
                                      <button type="button" disabled={isViewer || !st.isCheckedIn || activeMatch.status === 'Final'} onClick={() => togglePlayerOnCourt(p.id)} className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${st.isOnCourt ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'} disabled:opacity-50`}>
                                        {st.isOnCourt ? 'On Court' : 'Bench'}
                                      </button>
                                    </td>
                                    <td className="p-3 text-center font-bold text-white text-sm">{st.points}</td>
                                    {!currentSportConfig.hasSets && <td className="p-3 text-center font-bold"><span className={st.isFouledOut ? 'text-red-500 font-black' : ''}>{st.fouls} / {gameSettings.foulDisqualificationLimit}</span></td>}
                                    {!isViewer && (
                                      <td className="p-3 text-right">
                                        <div className="inline-flex gap-1">
                                          {currentSportConfig.hasSets ? (
                                            <button type="button" disabled={!st.isCheckedIn || activeMatch.status === 'Final'} onClick={() => handleScore(p.id, key, 1)} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white text-xs font-bold rounded cursor-pointer">+1 Pt</button>
                                          ) : (
                                            <>
                                              <button type="button" disabled={!st.isCheckedIn || st.isFouledOut || activeMatch.status === 'Final'} onClick={() => handleScore(p.id, key, 1)} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-[10px] font-bold rounded cursor-pointer">+1</button>
                                              <button type="button" disabled={!st.isCheckedIn || st.isFouledOut || activeMatch.status === 'Final'} onClick={() => handleScore(p.id, key, 2)} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-[10px] font-bold rounded cursor-pointer">+2</button>
                                              <button type="button" disabled={!st.isCheckedIn || st.isFouledOut || activeMatch.status === 'Final'} onClick={() => handleScore(p.id, key, 3)} className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white text-[10px] font-bold rounded cursor-pointer">+3</button>
                                              <button type="button" disabled={!st.isCheckedIn || st.isFouledOut || activeMatch.status === 'Final'} onClick={() => handleFoul(p.id, key)} className="px-2 py-1 bg-red-900/60 hover:bg-red-800 disabled:opacity-30 text-red-200 text-[10px] font-bold rounded cursor-pointer">FOUL</button>
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

        {/* VIEW 4: STANDINGS */}
        {activeTab === 'stats' && (
          <div className="space-y-8 print:hidden">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div className="flex items-center gap-2.5">
                <Award className="w-6 h-6 text-amber-400" />
                <div>
                  <h2 className="text-xl font-black text-white uppercase tracking-tight">Circuit Standings & Player Progress</h2>
                  <p className="text-xs text-slate-400">Official tournament records sorted by Wins → Point Differential → Points Scored</p>
                </div>
              </div>

              <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl gap-1 overflow-x-auto max-w-full">
                {(['basketball', 'volleyball', 'badminton'] as SportType[]).map((sport) => {
                  const count = teams.filter((t) => (t.sportType || 'basketball') === sport).length;
                  return (
                    <button key={sport} type="button" onClick={() => setSelectedSportTab(sport)} className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition cursor-pointer whitespace-nowrap ${selectedSportTab === sport ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
                      {sport} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400"><span className="text-amber-400 capitalize">{selectedSportTab}</span> Franchise Leaderboard</h3>
              {filteredTeams.length === 0 ? (
                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 text-center text-xs text-slate-500 capitalize">No {selectedSportTab} franchises registered yet.</div>
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
                          .sort((a, b) => {
                            const winsA = a.stats?.wins || 0;
                            const winsB = b.stats?.wins || 0;
                            if (winsB !== winsA) return winsB - winsA;
                            const diffA = (a.stats?.ptsScored || 0) - (a.stats?.ptsAllowed || 0);
                            const diffB = (b.stats?.ptsScored || 0) - (b.stats?.ptsAllowed || 0);
                            if (diffB !== diffA) return diffB - diffA;
                            return (b.stats?.ptsScored || 0) - (a.stats?.ptsScored || 0);
                          })
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
                                <td className={`p-3.5 text-center font-mono font-bold ${diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{diff > 0 ? `+${diff}` : diff}</td>
                                <td className="p-3.5 text-center"><span className="inline-flex items-center gap-0.5 bg-slate-800 px-2 py-0.5 rounded text-[10px] font-bold text-amber-300 font-mono"><Flame className="w-3 h-3 text-orange-400" /> {team.stats?.streak || 'W0'}</span></td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 5: PLAYER HERO CARDS & LEADERBOARD */}
        {activeTab === 'leaderboard' && (
          <div className="space-y-6 print:hidden">
            <PlayerLeaderboardView />
          </div>
        )}

        {/* VIEW 6: PRINTABLE OFFICIAL GAME REPORT */}
        {activeTab === 'report' && (
          <div className="space-y-6">
            {activeMatch.status !== 'Final' ? (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 text-center max-w-xl mx-auto space-y-4 shadow-xl">
                <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto text-amber-400"><Lock className="w-8 h-8" /></div>
                <div>
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">Official Game Report Locked</h3>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">Certified game reports and play logs are generated exclusively after a match is declared <strong>FINAL</strong>.</p>
                </div>
                <button type="button" onClick={() => setActiveTab('desk')} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow">Return to Scorer Desk</button>
              </div>
            ) : (
              <div id="official-game-report" className="space-y-4 bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl print:bg-white print:border-none print:shadow-none print:text-black print:p-0">
                <div className="flex flex-wrap justify-between items-center gap-4 pb-4 border-b border-slate-800 print:border-black print:pb-2">
                  <div className="flex items-center gap-3">
                    <img 
                      src={leagueBranding.logoUrl || '/epic-logo.png'} 
                      alt="League Logo" 
                      onError={(e) => { (e.target as HTMLImageElement).src = '/epic-logo.png'; }}
                      className="w-10 h-10 rounded-xl border border-blue-500/30 object-cover print:w-9 print:h-9 flex-shrink-0 bg-white" 
                    />
                    <div>
                      <h1 className="text-base sm:text-lg font-black uppercase text-white print:text-black tracking-tight leading-tight">{leagueBranding.leagueName} - Official Game Report</h1>
                      <p className="text-[10px] text-slate-400 print:text-gray-700 font-semibold">{leagueBranding.venueName} • {gameSettings.courtName} • Certified Official Summary</p>
                    </div>
                  </div>

                  <button type="button" onClick={() => {
                    const printWindow = window.open('', '_blank', 'width=850,height=950');
                    if (!printWindow) { alert('Pop-up blocked!'); return; }
                    printWindow.document.write(`
                      <!DOCTYPE html>
                      <html>
                        <head>
                          <title>${leagueBranding.leagueName} - Official Game Report</title>
                          <style>
                            @page { size: A4 portrait; margin: 6mm 8mm; }
                            * { box-sizing: border-box; }
                            body { font-family: sans-serif; color: #000; background: #fff; margin: 0; padding: 0; font-size: 9px; line-height: 1.15; }
                            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 6px; }
                            .title-block h1 { margin: 0; font-size: 13px; font-weight: 900; text-transform: uppercase; }
                            .title-block p { margin: 1px 0 0; font-size: 8px; color: #444; }
                            .stamp { border: 1.5px solid #059669; color: #059669; padding: 2px 6px; font-weight: 900; font-size: 9px; border-radius: 4px; }
                            .match-summary { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; border: 1.5px solid #000; border-radius: 6px; padding: 5px 8px; background: #fafafa; margin-bottom: 6px; }
                            .score-pill { font-size: 20px; font-weight: 900; padding: 2px 10px; border: 1.5px solid #000; border-radius: 6px; background: #fff; display: inline-block; }
                            .roster-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 6px; }
                            .table-wrap { border: 1px solid #666; border-radius: 4px; overflow: hidden; }
                            .table-title { background: #eee; font-weight: 800; font-size: 8.5px; padding: 2px 4px; border-bottom: 1px solid #666; text-transform: uppercase; }
                            table { width: 100%; border-collapse: collapse; font-size: 8px; }
                            th, td { padding: 2px 3px; border-bottom: 0.5px solid #ddd; text-align: left; }
                            th { background: #f5f5f5; font-weight: 700; font-size: 7.5px; }
                            .logs-section { border: 1px solid #999; border-radius: 4px; padding: 4px 6px; margin-bottom: 6px; font-size: 8px; max-height: 80px; overflow-y: auto; }
                            .signatories { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 8px; padding-top: 4px; border-top: 1px solid #999; text-align: center; page-break-inside: avoid; }
                            .sign-line { border-bottom: 1px solid #000; height: 20px; margin-bottom: 2px; font-weight: 700; font-size: 8px; }
                          </style>
                        </head>
                        <body>
                          <div class="header">
                            <div class="title-block"><h1>${leagueBranding.leagueName}</h1><p>${leagueBranding.venueName} • ${gameSettings.courtName}</p></div>
                            <div class="stamp">CERTIFIED FINAL</div>
                          </div>
                          <div class="match-summary">
                            <div><h2 style="margin:0;font-size:12px;">${teamA?.name}</h2><p style="margin:0;font-size:8px;">Coach: ${teamA?.coachName || 'Staff'}</p></div>
                            <div style="text-align:center;"><div class="score-pill">${activeMatch.scoreA} : ${activeMatch.scoreB}</div></div>
                            <div style="text-align:right;"><h2 style="margin:0;font-size:12px;">${teamB?.name}</h2><p style="margin:0;font-size:8px;">Coach: ${teamB?.coachName || 'Staff'}</p></div>
                          </div>
                          <div class="roster-grid">
                            <div class="table-wrap"><div class="table-title">${teamA?.name}</div><table><thead><tr><th>#</th><th>Player</th><th>PTS</th></tr></thead><tbody>${teamA?.players.map((p) => `<tr><td><b>#${p.jersey}</b></td><td>${p.name}</td><td><b>${activeMatch.stats[String(p.id)]?.points || 0}</b></td></tr>`).join('')}</tbody></table></div>
                            <div class="table-wrap"><div class="table-title">${teamB?.name}</div><table><thead><tr><th>#</th><th>Player</th><th>PTS</th></tr></thead><tbody>${teamB?.players.map((p) => `<tr><td><b>#${p.jersey}</b></td><td>${p.name}</td><td><b>${activeMatch.stats[String(p.id)]?.points || 0}</b></td></tr>`).join('')}</tbody></table></div>
                          </div>
                          <div class="logs-section"><b>Play-by-Play Summary:</b><br>${activeMatch.logs?.map(l => `[${l.timestamp}]${l.description}`).join('<br>') || 'No logs recorded.'}</div>
                          <div class="signatories">
                            <div><div class="sign-line">${currentUser.displayName}</div><div style="font-size:7px;">Official Scorer</div></div>
                            <div><div class="sign-line">Certified Official</div><div style="font-size:7px;">Head Referee</div></div>
                            <div><div class="sign-line">Tournament Exec</div><div style="font-size:7px;">Commissioner</div></div>
                          </div>
                        </body>
                      </html>
                    `);
                    printWindow.document.close();
                    printWindow.focus();
                    setTimeout(() => { printWindow.print(); printWindow.close(); }, 400);
                  }} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white font-black px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow cursor-pointer print:hidden">
                    <Printer className="w-4 h-4" /> Print 1-Sheet Report (PDF)
                  </button>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 text-center space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Certified Match Final • {currentSportConfig.name}</span>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8">
                    <div className="text-center sm:text-right flex-1 w-full"><h2 className="text-xl font-black text-white truncate">{teamA?.name}</h2></div>
                    <div className="flex items-center gap-4 bg-slate-900 px-6 py-2.5 rounded-xl border border-slate-800 flex-shrink-0">
                      <span className="text-3xl sm:text-4xl font-black text-amber-400">{activeMatch.scoreA}</span>
                      <span className="text-slate-600 text-xl font-bold">:</span>
                      <span className="text-3xl sm:text-4xl font-black text-cyan-400">{activeMatch.scoreB}</span>
                    </div>
                    <div className="text-center sm:text-left flex-1 w-full"><h2 className="text-xl font-black text-white truncate">{teamB?.name}</h2></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950 py-4 px-4 sm:px-6 mt-auto print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <p className="text-[11px] text-slate-400 italic">"I can do all things through Christ who strengthens me." <span className="text-amber-400/90 font-semibold not-italic">— Philippians 4:13</span></p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Registered Trademark by <span className="text-slate-400">Kezjed Solutions</span></p>
        </div>
      </footer>

      {/* Modals */}
      {selectedPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-150 print:hidden">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl relative">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white flex justify-between items-start">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider bg-black/20 px-2 py-0.5 rounded">Official Tournament Pass</span>
                <h3 className="text-xl font-black mt-1">{selectedPlayer.name}</h3>
                <p className="text-xs font-bold opacity-90">{selectedPlayer.position} • Jersey #{selectedPlayer.jersey}</p>
              </div>
              <button type="button" onClick={() => setSelectedPlayer(null)} className="p-1 rounded-full bg-black/10 hover:bg-black/30 cursor-pointer"><X className="w-5 h-5 text-white" /></button>
            </div>
            <div className="p-6 flex flex-col items-center text-center space-y-4">
              <div className="bg-white p-4 rounded-2xl shadow-xl"><QRCodeSVG value={selectedPlayer.qrPassId} size={150} /></div>
              <div className="w-full space-y-2">
                {!isViewer && <button type="button" onClick={() => { const p = selectedPlayer; setSelectedPlayer(null); setEnrollingPlayer(p); }} className="w-full bg-slate-800 hover:bg-slate-700 text-blue-300 font-bold py-2.5 rounded-xl text-xs border border-slate-700 cursor-pointer flex items-center justify-center gap-1.5 transition"><Camera className="w-4 h-4" /> Enroll / Update Face ID</button>}
                {!isViewer && <button type="button" onClick={() => { verifyPlayerCheckIn(selectedPlayer.id); setSelectedPlayer(null); }} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5"><UserCheck className="w-4 h-4" /> Manual Check-In</button>}
              </div>
            </div>
          </div>
        </div>
      )}

      {enrollingPlayer && <PlayerEnrollModal player={enrollingPlayer} onClose={() => setEnrollingPlayer(null)} onEnrollSuccess={handleEnrollSuccess} />}
      <FaceLivenessScannerModal isOpen={isLivenessModalOpen} onClose={() => setIsLivenessModalOpen(false)} roster={enrolledRoster} onPlayerVerified={verifyPlayerCheckIn} />
      <QrAttendanceScannerModal isOpen={isQrScannerOpen} onClose={() => setIsQrScannerOpen(false)} players={allPlayers} onPlayerVerified={verifyPlayerCheckIn} />
      <CreateTeamModal isOpen={isTeamModalOpen} onClose={() => { setIsTeamModalOpen(false); setEditingTeam(null); }} onSaveTeam={handleSaveTeam} initialTeam={editingTeam} />
      <GameSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} settings={gameSettings} onSaveSettings={handleSaveSettings} />
      {currentUser && <AccountManagerModal isOpen={isAccountModalOpen} onClose={() => setIsAccountModalOpen(false)} currentUser={currentUser} onUserUpdated={(updated) => setCurrentUser(updated)} />}
      <LeagueBrandingModal isOpen={isBrandingModalOpen} onClose={() => setIsBrandingModalOpen(false)} sessionId={activeSession.id} currentBranding={leagueBranding} onSaveBranding={(updated) => setLeagueBranding(updated)} />

      {/* Tier Upgrade / PayMongo Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 print:hidden">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 text-white shadow-2xl">
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-amber-400">Match Limit Reached! 🚨</h3>
              <p className="text-slate-400 text-sm mt-1">
                You have reached the maximum allowed matches for your current plan. Choose a tier to unlock instant access and keep your tournament running.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {/* Basic Tier */}
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-lg text-slate-200">Basic</h4>
                  <div className="text-2xl font-extrabold text-white mt-1">₱199</div>
                  <p className="text-xs text-slate-400 mt-2">Up to 10 matches. Perfect for single-day local games.</p>
                </div>
                <button 
                  onClick={() => handleSelectTier('basic')}
                  className="mt-4 w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 rounded-xl text-sm transition cursor-pointer"
                >
                  Choose Basic
                </button>
              </div>

              {/* Essential Tier */}
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-lg text-blue-400">Essential</h4>
                  <div className="text-2xl font-extrabold text-white mt-1">₱299</div>
                  <p className="text-xs text-slate-400 mt-2">Up to 30 matches. Great for weekend sportsfests.</p>
                </div>
                <button 
                  onClick={() => handleSelectTier('essential')}
                  className="mt-4 w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 rounded-xl text-sm transition cursor-pointer"
                >
                  Choose Essential
                </button>
              </div>

              {/* Pro Tier */}
              <div className="bg-gradient-to-b from-amber-500/20 to-slate-800/60 border border-amber-500/50 rounded-xl p-4 flex flex-col justify-between relative">
                <span className="absolute -top-3 right-4 bg-amber-500 text-slate-950 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Best Value
                </span>
                <div>
                  <h4 className="font-bold text-lg text-amber-400">Pro</h4>
                  <div className="text-2xl font-extrabold text-white mt-1">₱399</div>
                  <p className="text-xs text-slate-400 mt-2">Unlimited matches, cloud sync, and live TV projection mode.</p>
                </div>
                <button 
                  onClick={() => handleSelectTier('pro')}
                  className="mt-4 w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2 rounded-lg text-sm transition shadow-lg shadow-amber-500/20 cursor-pointer"
                >
                  Choose Pro
                </button>
              </div>
            </div>

            <div className="text-center">
              <button 
                onClick={() => setShowUpgradeModal(false)}
                className="text-xs text-slate-400 hover:text-white underline transition cursor-pointer"
              >
                Cancel / Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}