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
  ArrowLeftRight, Lock, Download, Upload, Monitor, Activity, Zap, Palette, Megaphone, QrCode
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

  const [activeSession, _setActiveSession] = useState<TournamentSession>(DEFAULT_SESSION);
  const [teams, setTeams] = useState<Team[]>([]);
  const [scheduledMatches, setScheduledMatches] = useState<ScheduledMatch[]>([]);
  const [gameSettings, setGameSettings] = useState<GameSettings>(DEFAULT_SETTINGS);

  // Active Match State
  const [activeMatch, setActiveMatch] = useState<Match>(() => {
    const defaultState: Match = {
      id: `m_${Date.now()}`,
      sessionId: DEFAULT_SESSION.id,
      sportType: DEFAULT_SESSION.sportType,
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

  // Clock
  const [gameSeconds, setGameSeconds] = useState(DEFAULT_SETTINGS.quarterMinutes * 60);
  const [shotClock, setShotClock] = useState(DEFAULT_SETTINGS.shotClockSeconds);
  const [isClockRunning, setIsClockRunning] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Guarded tab changer
  const handleTabChange = (newTab: NavTab) => {
    if (activeTab === 'desk' && activeMatch.status === 'Live') {
      const confirmLeave = window.confirm(
        '⚠️ MATCH IS CURRENTLY LIVE!\n\nAre you sure you want to leave the Scorer Desk? Your live scores are auto-saved to Supabase per match ID.'
      );
      if (!confirmLeave) return;
    }
    setActiveTab(newTab);
  };

  // Prevent accidental browser tab close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (activeMatch.status === 'Live') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [activeMatch.status]);

  const [currentTier, setCurrentTier] = useState<string>('free');
  const [showUpgradeModal, setShowUpgradeModal] = useState<boolean>(false);
  const [isBrandingModalOpen, setIsBrandingModalOpen] = useState(false);
  const [leagueBranding, setLeagueBranding] = useState<LeagueBranding>({
    leagueName: 'EPIC TOURNAMENT CIRCUIT',
    venueName: 'Main Gymnasium',
    logoUrl: '/epic-logo.png',
    sponsorTagline: 'Powered by Kezjed Solutions',
    accentColor: 'amber',
  });

  // Load cloud data
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
        console.error('Error loading cloud data:', err);
      }
    }

    if (currentUser) {
      loadCloudData();
    }
  }, [activeSession.id, currentUser]);

  // Multi-Court Real-Time Auto-Persistence keyed by match_id
  useEffect(() => {
    if (!activeMatch?.id || activeMatch.status === 'Final') return;

    const autoSaveTimer = setTimeout(async () => {
      try {
        await supabase.from('live_active_matches').upsert({
          match_id: activeMatch.id,
          org_id: activeSession.id,
          court_name: activeMatch.court,
          match_data: {
            ...activeMatch,
            gameSeconds,
            shotClock,
          },
          updated_at: new Date().toISOString(),
        });
      } catch (err) {
        console.error('Multi-court auto-save error:', err);
      }
    }, 1000);

    return () => clearTimeout(autoSaveTimer);
  }, [activeMatch, gameSeconds, shotClock, activeSession?.id]);

  const completedMatchesCount = useMemo(() => {
    return scheduledMatches.filter((m) => m.status === 'Completed').length;
  }, [scheduledMatches]);

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
      if (data?.url) window.location.href = data.url;
    } catch (err) {
      console.error("PayMongo Error:", err);
      alert("Could not initialize payment session.");
    }
  };

  const handleAttemptFinalizeMatch = async () => {
    const canProceed = checkCanFinalizeMatch(currentTier, completedMatchesCount);
    if (!canProceed) {
      setShowUpgradeModal(true);
      return;
    }

    if (window.confirm('Declare match FINAL? This locks scoring and clears active court persistence.')) {
      setIsClockRunning(false);
      setActiveMatch((prev) => ({ ...prev, status: 'Final', quarter: 'Final' }));
      arenaAudio.playArenaBuzzer();
      speakAnnouncement("The match is now final!");

      // Clear specific match row from multi-court persistence
      await supabase.from('live_active_matches').delete().eq('match_id', activeMatch.id);
    }
  };

  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [enrollingPlayer, setEnrollingPlayer] = useState<Player | null>(null);
  const [isLivenessModalOpen, setIsLivenessModalOpen] = useState(false);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

  const [queueSportType, setQueueSportType] = useState<SportType>(activeSession.sportType || 'basketball');
  const [queueTeamA, setQueueTeamA] = useState('');
  const [queueTeamB, setQueueTeamB] = useState('');
  const [queueTime, setQueueTime] = useState('10:00 AM');

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

  const exportTournamentData = () => {
    const backup = { session: activeSession, teams, scheduledMatches, gameSettings, leagueBranding };
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
            <button type="button" onClick={() => handleTabChange('roster')} className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${activeTab === 'roster' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>
              <Users className="w-3.5 h-3.5" /> Franchises
            </button>
            <button type="button" onClick={() => handleTabChange('schedule')} className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${activeTab === 'schedule' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>
              <Calendar className="w-3.5 h-3.5" /> Schedule ({scheduledMatches.length})
            </button>
            <button type="button" onClick={() => handleTabChange('desk')} className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${activeTab === 'desk' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>
              <Clock className="w-3.5 h-3.5" /> Desk
            </button>
            <button type="button" onClick={() => handleTabChange('stats')} className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${activeTab === 'stats' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>
              <BarChart3 className="w-3.5 h-3.5" /> Standings
            </button>
            <button type="button" onClick={() => handleTabChange('leaderboard')} className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${activeTab === 'leaderboard' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>
              <Award className="w-3.5 h-3.5 text-amber-400" /> Hero Cards
            </button>
            <button type="button" onClick={() => handleTabChange('report')} className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${activeTab === 'report' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>
              <FileText className="w-3.5 h-3.5" /> Report {activeMatch.status !== 'Final' && <Lock className="w-3 h-3 text-slate-500" />}
            </button>
          </nav>

          <div className="flex items-center gap-1.5 justify-end w-full md:w-auto flex-wrap">
            <HeaderActionCluster isCommissioner={isCommissioner} />

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
                  onClick={() => handleTabChange('register')}
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
        
        {activeTab === 'register' && (
          <div className="space-y-6 print:hidden">
            <div className="flex justify-between items-center bg-slate-900 p-4 rounded-2xl border border-slate-800">
              <div>
                <h2 className="text-sm font-black text-white uppercase">Public Registration Portal Preview</h2>
                <p className="text-xs text-slate-400">Share this view or URL with team captains to let them self-register.</p>
              </div>
              <button
                type="button"
                onClick={() => handleTabChange('roster')}
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

        {activeTab === 'schedule' && (
          <div className="space-y-6 print:hidden">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div>
                <h2 className="text-xl font-black text-white uppercase tracking-tight">Tournament Match Schedule</h2>
                <p className="text-xs text-slate-400">Auto-generate conflict-free schedules or queue individual matchups</p>
              </div>
            </div>

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
                          setActiveMatch((prev) => ({ ...prev, id: m.id, sessionId: activeSession.id, sportType: m.sportType, teamAId: m.teamAId, teamBId: m.teamBId, scoreA: 0, scoreB: 0, setsA: 0, setsB: 0, currentSet: 1, history: [], logs: [], quarter: 'Q1', status: 'Live', teamAFouls: 0, teamBFouls: 0, stats: {} }));
                          handleTabChange('desk');
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
                <button type="button" onClick={() => handleTabChange('roster')} className="bg-blue-600 text-white font-bold px-4 py-2 rounded-xl text-xs cursor-pointer">Go to Franchises</button>
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
                    <button type="button" onClick={() => handleTabChange('schedule')} className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 rounded-lg font-bold text-[11px] cursor-pointer transition flex items-center gap-1"><Calendar className="w-3 h-3" /> Change</button>
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

                {/* Quick Scanner Action Bar for Table Officials */}
                {!isViewer && (
                  <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 p-3 rounded-2xl shadow-md">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Player Verification:</span>
                    <button
                      type="button"
                      onClick={() => setIsLivenessModalOpen(true)}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow"
                    >
                      <Camera className="w-3.5 h-3.5" /> Face Liveness Scanner
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsQrScannerOpen(true)}
                      className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow"
                    >
                      <QrCode className="w-3.5 h-3.5" /> QR Pass Scanner
                    </button>
                  </div>
                )}

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
                  </div>
                )}
              </>
            )}
          </div>
        )}

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
            </div>
          </div>
        )}

        {activeTab === 'leaderboard' && (
          <div className="space-y-6 print:hidden">
            <PlayerLeaderboardView />
          </div>
        )}

        {activeTab === 'report' && (
          <div className="space-y-6">
            {activeMatch.status !== 'Final' ? (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 text-center max-w-xl mx-auto space-y-4 shadow-xl">
                <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto text-amber-400"><Lock className="w-8 h-8" /></div>
                <div>
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">Official Game Report Locked</h3>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">Certified game reports and play logs are generated exclusively after a match is declared <strong>FINAL</strong>.</p>
                </div>
                <button type="button" onClick={() => handleTabChange('desk')} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow">Return to Scorer Desk</button>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl">
                <h2 className="text-lg font-black text-white">Certified Match Final</h2>
              </div>
            )}
          </div>
        )}
      </main>

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
    </div>
  );
}