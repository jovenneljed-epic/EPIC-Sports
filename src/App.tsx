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
import { AccountManagerModal } from './components/AccountManagerModal';
import { PlayerLeaderboardView } from './components/PlayerLeaderboardView';
import { SmartScheduleGenerator } from './components/SmartScheduleGenerator';
import { LeagueBrandingModal, type LeagueBranding } from './components/LeagueBrandingModal';
import { PublicTeamRegistration } from './components/PublicTeamRegistration';
import { CommissionerGameGenerator } from './components/CommissionerGameGenerator';
import { GameLoginGate } from './components/GameLoginGate';
import { checkCanFinalizeMatch, TIER_PRICES } from './utils/tierLimits';
import { 
  Play, Pause, X, Clock, Volume2, 
  CheckCircle2, Camera, UserCheck, AlertCircle, 
  BarChart3, Plus, Users, Award, Edit3, 
  Trash2, LogOut, UserCog, FileText, Calendar, 
  Lock, Download, Upload, Monitor, Zap, Palette, QrCode, KeyRound, Printer
} from 'lucide-react';

// --- Domain Models ---
export type SportType = 'basketball' | 'volleyball' | 'badminton';
export type MatchStatus = 'Upcoming' | 'Live' | 'Final';
export type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'OT' | 'Final';
type NavTab = 'desk' | 'roster' | 'stats' | 'schedule' | 'report' | 'leaderboard' | 'register' | 'generator';

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
  offensiveReboundShotClock: 24,
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

// --- Utilities ---
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

// --- Champion Banner Component ---
interface ChampionBannerProps {
  tournamentName: string;
  winner: string;
  loser: string;
  score: string;
}

const ChampionBanner = React.forwardRef<HTMLDivElement, ChampionBannerProps>(
  ({ tournamentName, winner, loser, score }, ref) => (
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
  )
);
ChampionBanner.displayName = 'ChampionBanner';

// --- Header Action Cluster ---
function HeaderActionCluster({ isCommissioner }: { isCommissioner: boolean }) {
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

// --- Main App Component ---
export default function App() {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [authenticatedGameToken, setAuthenticatedGameToken] = useState<any>(null);
  
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

  const [activeMatch, setActiveMatch] = useState<Match>(() => ({
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
  }));

  const [gameSeconds, setGameSeconds] = useState(DEFAULT_SETTINGS.quarterMinutes * 60);
  const [shotClock, setShotClock] = useState(DEFAULT_SETTINGS.shotClockSeconds);
  const [isClockRunning, setIsClockRunning] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Re-hydrate active match state from Supabase if a live session exists for this match ID
  useEffect(() => {
    async function hydrateActiveMatch() {
      if (!activeMatch?.id) return;
      try {
        const { data, error } = await supabase
          .from('live_active_matches')
          .select('match_data')
          .eq('match_id', activeMatch.id)
          .maybeSingle();

        if (data && data.match_data && !error) {
          const saved = data.match_data;
          setActiveMatch(saved);
          if (typeof saved.gameSeconds === 'number') setGameSeconds(saved.gameSeconds);
          if (typeof saved.shotClock === 'number') setShotClock(saved.shotClock);
        }
      } catch (err) {
        console.error('Error hydrating active match:', err);
      }
    }

    hydrateActiveMatch();
  }, [activeMatch.id]);

  const handleTabChange = (newTab: NavTab) => {
    if (activeTab === 'desk' && activeMatch.status === 'Live' && newTab !== 'desk') {
      alert('⚠️ MATCH IS CURRENTLY LIVE!\n\nYou cannot leave the Scorer Desk until the match is declared FINAL.');
      return;
    }
    setActiveTab(newTab);
  };

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

  useEffect(() => {
    async function loadCloudData() {
      try {
        const { data: orgData } = await supabase.from('organizations').select('*').eq('id', activeSession.id).maybeSingle();
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

        const { data: teamData } = await supabase.from('teams').select('*').eq('org_id', activeSession.id);
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

        const { data: matchData } = await supabase.from('scheduled_matches').select('*').eq('org_id', activeSession.id);
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

        const { data: settingsData } = await supabase.from('game_settings').select('*').eq('org_id', activeSession.id).maybeSingle();
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

    if (currentUser || authenticatedGameToken) loadCloudData();
  }, [activeSession.id, currentUser, authenticatedGameToken]);

  useEffect(() => {
    if (!activeMatch?.id || activeMatch.status === 'Final') return;

    const autoSaveTimer = setTimeout(async () => {
      try {
        await supabase.from('live_active_matches').upsert({
          match_id: activeMatch.id,
          org_id: activeSession.id,
          court_name: activeMatch.court,
          match_data: { ...activeMatch, gameSeconds, shotClock },
          updated_at: new Date().toISOString(),
        });
      } catch (err) {
        console.error('Multi-court auto-save error:', err);
      }
    }, 1000);

    return () => clearTimeout(autoSaveTimer);
  }, [activeMatch, gameSeconds, shotClock, activeSession?.id]);

  const completedMatchesCount = useMemo(() => scheduledMatches.filter((m) => m.status === 'Completed').length, [scheduledMatches]);

  const handleSelectTier = async (tierKey: 'basic' | 'essential' | 'pro') => {
    const tierInfo = TIER_PRICES[tierKey];
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: { orgId: activeSession.id, amountInPesos: tierInfo.price, tier: tierKey },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (err) {
      console.error("PayMongo Error:", err);
      alert("Could not initialize payment session.");
    }
  };

  const handleAttemptFinalizeMatch = async () => {
    if (!checkCanFinalizeMatch(currentTier, completedMatchesCount)) {
      setShowUpgradeModal(true);
      return;
    }

    if (window.confirm('Declare match FINAL? This locks scoring and clears active court persistence.')) {
      setIsClockRunning(false);
      setActiveMatch((prev) => ({ ...prev, status: 'Final', quarter: 'Final' }));
      arenaAudio.playArenaBuzzer();
      speakAnnouncement("The match is now final!");
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

  useEffect(() => {
    let isMounted = true;
    async function loadBiometrics() {
      try {
        const { data, status } = await supabase.from('sports_players').select('id, face_descriptor');
        if (status === 401) return;
        if (data && isMounted) {
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
    if (currentUser || authenticatedGameToken) loadBiometrics();
    return () => { isMounted = false; };
  }, [currentUser, authenticatedGameToken]);

  const handleLogout = () => {
    authStore.logout();
    setCurrentUser(null);
    setAuthenticatedGameToken(null);
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

  const enrolledRoster = useMemo(() => teams.flatMap((t) => t.players).filter((p) => p.descriptor).map((p) => ({
    id: String(p.id),
    name: p.name,
    jersey: p.jersey,
    descriptor: p.descriptor!,
  })), [teams]);

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
          return 24; 
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
      return { ...prev, stats: { ...prev.stats, [idKey]: { ...st, isOnCourt: !st.isOnCourt } } };
    });
  }, []);

  const handleEnrollSuccess = useCallback(async (playerId: string, descriptor: number[]) => {
    const idKey = String(playerId).trim();
    setTeams((prev) => prev.map((t) => ({
      ...t,
      players: t.players.map((p) => (String(p.id) === idKey ? { ...p, descriptor } : p)),
    })));
    try {
      await supabase.from('sports_players').update({ face_descriptor: descriptor }).eq('id', idKey);
    } catch (err) {
      console.warn('Supabase offline:', err);
    }
  }, []);

  // Safe Timer Toggle Rule: Check if all "On Court" players are unlocked/checked in
  const handleToggleClock = () => {
    if (!teamA || !teamB) return;

    const allTeamsPlayers = [...teamA.players, ...teamB.players];
    const unverifiedOnCourtPlayer = allTeamsPlayers.some((p) => {
      const st = activeMatch.stats[String(p.id)];
      const isOnCourt = st ? st.isOnCourt : true;
      const isCheckedIn = st ? st.isCheckedIn : false;
      return isOnCourt && !isCheckedIn;
    });

    if (!isClockRunning && unverifiedOnCourtPlayer) {
      alert('⚠️ ATTENDANCE LOCKOUT: Cannot start timers! All players currently assigned "On Court" must be unlocked via Face Scan or QR Pass first.');
      return;
    }

    setIsClockRunning((prev) => !prev);
  };

  const handleScore = useCallback((playerId: string, teamKey: 'A' | 'B', pt: number) => {
    if (currentUser?.role === 'viewer') {
      alert('Viewer accounts have read-only access.');
      return;
    }

    setShotClock(24);

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
  }, [currentUser, teams]);

  // Foul Rule: Automatically stops game time and resets shot clock to 24s
  const handleFoul = useCallback((playerId: string, teamKey: 'A' | 'B') => {
    if (currentUser?.role === 'viewer') return;

    setIsClockRunning(false);
    setShotClock(24);

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
        stats: { ...prev.stats, [idKey]: { ...st, fouls: nextFouls, isFouledOut: fouledOut } },
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

  if (!currentUser && !authenticatedGameToken) {
    return (
      <GameLoginGate 
        onGameAuthenticated={(matchData) => {
          setAuthenticatedGameToken(matchData);
          setActiveMatch((prev) => ({
            ...prev,
            id: matchData.game_id,
            sportType: matchData.sport_type || 'basketball',
            court: matchData.court_name || 'Court 1',
            status: 'Live',
          }));
          setActiveTab('desk');
        }} 
        onAdminAuthenticated={(user) => setCurrentUser(user)}
      />
    );
  }

  const isCommissioner = currentUser ? currentUser.role === 'commissioner' : false;
  const isViewer = currentUser ? currentUser.role === 'viewer' : false;

  if (isSpectatorMode) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col justify-between p-8 font-sans selection:bg-none">
        <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <img src={leagueBranding.logoUrl || '/epic-logo.png'} alt="League Logo" onError={(e) => { (e.target as HTMLImageElement).src = '/epic-logo.png'; }} className="w-12 h-12 rounded-2xl border border-blue-500/30 object-cover bg-zinc-900" />
            <div>
              <h1 className="text-xl font-black uppercase tracking-wider text-amber-400">{leagueBranding.leagueName}</h1>
              <p className="text-xs text-zinc-400">{leagueBranding.venueName} • {gameSettings.courtName}</p>
            </div>
          </div>
          <button onClick={() => setIsSpectatorMode(false)} className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-bold border border-zinc-800 cursor-pointer">Exit TV Mode</button>
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
              <div className="mt-4 font-mono text-3xl font-black text-white tracking-widest bg-zinc-900 px-6 py-2 rounded-xl border border-zinc-800">{formatTime(gameSeconds)}</div>
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

        <div className="text-center text-xs text-zinc-600 border-t border-zinc-900 pt-4">Powered by Kezjed Solutions • Philippians 4:13</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white print:bg-white print:text-black">
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 shadow-xl print:hidden">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center justify-between w-full md:w-auto">
            <div className="flex items-center gap-2.5">
              <img src={leagueBranding.logoUrl || '/epic-logo.png'} alt="League Logo" onError={(e) => { (e.target as HTMLImageElement).src = '/epic-logo.png'; }} className="w-9 h-9 rounded-xl shadow-lg border border-blue-500/30 object-cover bg-slate-900" />
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h1 className="text-base font-black tracking-tight text-white uppercase">{leagueBranding.leagueName}</h1>
                  {leagueBranding.sponsorTagline && (
                    <span className="text-[9px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/30 px-1.5 py-0.2 rounded-full uppercase truncate max-w-[160px]">{leagueBranding.sponsorTagline}</span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 font-semibold">{leagueBranding.venueName}</p>
              </div>
            </div>
          </div>

          <nav className="flex items-center bg-slate-950/90 p-1 rounded-xl border border-slate-800 overflow-x-auto max-w-full w-full md:w-auto scrollbar-none">
            <button type="button" onClick={() => handleTabChange('roster')} className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${activeTab === 'roster' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}><Users className="w-3.5 h-3.5" /> Franchises</button>
            <button type="button" onClick={() => handleTabChange('schedule')} className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${activeTab === 'schedule' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}><Calendar className="w-3.5 h-3.5" /> Schedule ({scheduledMatches.length})</button>
            <button type="button" onClick={() => handleTabChange('desk')} className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${activeTab === 'desk' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}><Clock className="w-3.5 h-3.5" /> Desk</button>
            <button type="button" onClick={() => handleTabChange('stats')} className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${activeTab === 'stats' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}><BarChart3 className="w-3.5 h-3.5" /> Standings</button>
            <button type="button" onClick={() => handleTabChange('leaderboard')} className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${activeTab === 'leaderboard' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}><Award className="w-3.5 h-3.5 text-amber-400" /> Hero Cards</button>
            <button type="button" onClick={() => handleTabChange('report')} className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${activeTab === 'report' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}><FileText className="w-3.5 h-3.5" /> Report {activeMatch.status !== 'Final' && <Lock className="w-3 h-3 text-slate-500" />}</button>
            {isCommissioner && (
              <button type="button" onClick={() => handleTabChange('generator')} className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${activeTab === 'generator' ? 'bg-blue-600 text-white shadow-md' : 'text-amber-400 hover:text-white'}`}><KeyRound className="w-3.5 h-3.5" /> Game Tokens</button>
            )}
          </nav>

          <div className="flex items-center gap-1.5 justify-end w-full md:w-auto flex-wrap">
            <HeaderActionCluster isCommissioner={isCommissioner} />
            <div className={`px-2.5 py-1 text-[11px] font-black uppercase rounded-lg border ${currentTier === 'pro' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : currentTier === 'essential' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : currentTier === 'basic' ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>Plan: {currentTier}</div>
            <button type="button" onClick={() => setShowUpgradeModal(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-2.5 py-1.5 text-[11px] rounded-lg flex items-center gap-1 cursor-pointer shadow transition" title="Upgrade Subscription"><Zap className="w-3.5 h-3.5" /> Upgrade Tiers</button>
            {isCommissioner && (
              <>
                <button type="button" onClick={() => setIsBrandingModalOpen(true)} className="bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 px-2.5 py-1.5 text-[11px] font-bold rounded-lg flex items-center gap-1 cursor-pointer transition shadow" title="Custom League White-Labeling"><Palette className="w-3.5 h-3.5" /> Brand</button>
                <button type="button" onClick={() => handleTabChange('register')} className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg border flex items-center gap-1 transition cursor-pointer shadow ${activeTab === 'register' ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border-slate-700'}`} title="Open Public Team Registration Link"><Users className="w-3.5 h-3.5" /> Registration Link</button>
              </>
            )}
            <button type="button" onClick={() => setIsSpectatorMode(true)} className="bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 px-2.5 py-1.5 text-[11px] font-bold rounded-lg flex items-center gap-1 cursor-pointer" title="Fullscreen Arena Display"><Monitor className="w-3.5 h-3.5" /> TV Mode</button>
            {isCommissioner && (
              <>
                <button type="button" onClick={exportTournamentData} className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-2.5 py-1.5 text-[11px] font-bold rounded-lg flex items-center gap-1 cursor-pointer" title="Export Backup JSON"><Download className="w-3.5 h-3.5" /> Export</button>
                <label className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-2.5 py-1.5 text-[11px] font-bold rounded-lg flex items-center gap-1 cursor-pointer"><Upload className="w-3.5 h-3.5" /> Import<input type="file" accept=".json" onChange={importTournamentData} className="hidden" /></label>
              </>
            )}
            {currentUser && (
              <button type="button" onClick={() => setIsAccountModalOpen(true)} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 cursor-pointer" title="Account Settings & RBAC"><UserCog className="w-4 h-4 text-blue-400" /></button>
            )}
            <button type="button" onClick={handleLogout} className="p-2 bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900/50 rounded-lg cursor-pointer transition" title="Log Out"><LogOut className="w-4 h-4" /></button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 flex-1 w-full print:p-0 print:max-w-none">
        {activeTab === 'generator' && isCommissioner && (
          <div className="space-y-6 print:hidden">
            <CommissionerGameGenerator orgId={activeSession.id} />
          </div>
        )}

        {activeTab === 'register' && (
          <div className="space-y-6 print:hidden">
            <div className="flex justify-between items-center bg-slate-900 p-4 rounded-2xl border border-slate-800">
              <div>
                <h2 className="text-sm font-black text-white uppercase">Public Registration Portal Preview</h2>
                <p className="text-xs text-slate-400">Share this view or URL with team captains to let them self-register.</p>
              </div>
              <button type="button" onClick={() => handleTabChange('roster')} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer">Back to Dashboard</button>
            </div>
            <PublicTeamRegistration sessionId={activeSession.id} leagueName={leagueBranding.leagueName} onTeamRegistered={async (newTeam) => { setTeams((prev) => [...prev, newTeam]); setActiveTab('roster'); alert(`Team "${newTeam.name}" successfully registered!`); }} />
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
                    <button key={sport} type="button" onClick={() => setSelectedSportTab(sport)} className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition cursor-pointer whitespace-nowrap ${selectedSportTab === sport ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>{sport} ({sportCount})</button>
                  );
                })}
              </div>
              {isCommissioner && (
                <button type="button" onClick={() => { setEditingTeam(null); setIsTeamModalOpen(true); }} className="bg-blue-600 hover:bg-blue-500 text-white font-black px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-lg cursor-pointer"><Plus className="w-4 h-4" /> Enter Official Team</button>
              )}
            </div>

            {filteredTeams.length === 0 ? (
              <div className="bg-slate-900/50 border-2 border-dashed border-slate-800 rounded-3xl p-12 text-center space-y-4">
                <div className="w-16 h-16 bg-blue-600/10 border border-blue-500/20 rounded-full flex items-center justify-center mx-auto text-blue-400"><Users className="w-8 h-8" /></div>
                <h3 className="text-base font-bold text-white capitalize">No {selectedSportTab} Teams Registered Yet</h3>
                {isCommissioner && (
                  <button type="button" onClick={() => { setEditingTeam(null); setIsTeamModalOpen(true); }} className="bg-blue-600 hover:bg-blue-500 text-white font-black px-5 py-2.5 rounded-xl text-xs inline-flex items-center gap-2 cursor-pointer shadow-lg capitalize"><Plus className="w-4 h-4" /> Add {selectedSportTab} Team</button>
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
              <SmartScheduleGenerator teams={teams} sessionId={activeSession.id} sportType={selectedSportTab} onScheduleGenerated={async (newMatches) => {
                setScheduledMatches((prev) => [...prev, ...newMatches]);
                for (const m of newMatches) {
                  await supabase.from('scheduled_matches').upsert({
                    id: m.id, org_id: activeSession.id, sport_type: m.sportType, team_a_id: m.teamAId, team_b_id: m.teamBId, time_slot: m.timeSlot, status: m.status, updated_at: new Date().toISOString()
                  });
                }
              }} />
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
                      <button type="button" onClick={() => {
                        setActiveMatch((prev) => ({ ...prev, id: m.id, sessionId: activeSession.id, sportType: m.sportType, teamAId: m.teamAId, teamBId: m.teamBId, scoreA: 0, scoreB: 0, setsA: 0, setsB: 0, currentSet: 1, history: [], logs: [], quarter: 'Q1', status: 'Live', teamAFouls: 0, teamBFouls: 0, stats: {} }));
                        handleTabChange('desk');
                      }} className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-3 py-2 rounded-xl text-xs cursor-pointer shadow whitespace-nowrap">Load to Desk</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

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
                    <button 
                      type="button" 
                      disabled={activeMatch.scoreA > 0 || activeMatch.scoreB > 0 || isClockRunning}
                      onClick={() => handleTabChange('schedule')} 
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-blue-400 border border-slate-700 rounded-lg font-bold text-[11px] cursor-pointer transition flex items-center gap-1"
                      title={activeMatch.scoreA > 0 || activeMatch.scoreB > 0 || isClockRunning ? "Match in progress: Matchup is locked to prevent score resets." : "Change Matchup"}
                    >
                      <Calendar className="w-3 h-3" /> {(activeMatch.scoreA > 0 || activeMatch.scoreB > 0 || isClockRunning) ? 'Match Locked' : 'Change'}
                    </button>
                  </div>
                </div>

                {!isViewer && (
                  <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 p-3 rounded-2xl shadow-md">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Player Verification:</span>
                    <button type="button" onClick={() => setIsLivenessModalOpen(true)} className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow"><Camera className="w-3.5 h-3.5" /> Face Liveness Scanner</button>
                    <button type="button" onClick={() => setIsQrScannerOpen(true)} className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow"><QrCode className="w-3.5 h-3.5" /> QR Pass Scanner</button>
                  </div>
                )}

                {teamA && teamB && (
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative">
                    <div className="flex flex-col lg:flex-row items-center justify-between gap-6 pb-6 border-b border-slate-800">
                      <div className="flex-1 text-center lg:text-left w-full">
                        <span className="text-xs font-bold tracking-widest text-slate-400 uppercase">Home Franchise</span>
                        <h2 className="text-3xl font-black text-white truncate">{teamA.name}</h2>
                        <p className="text-xs text-slate-400 mt-1">Coach: {teamA.coachName || 'Staff'}</p>
                      </div>

                      <div className="flex flex-col items-center bg-slate-950 px-8 sm:px-12 py-6 rounded-3xl border-2 border-slate-800 shadow-2xl w-full lg:w-auto space-y-4">
                        <span className="text-sm text-amber-400 font-black uppercase tracking-widest text-center">
                          {currentSportConfig.name} • {activeMatch.court} • <span className="text-emerald-400">{activeMatch.status}</span>
                        </span>
                        
                        <div className="flex items-center gap-8 sm:gap-12">
                          <div className="text-center">
                            <span className="text-xs text-slate-500 uppercase tracking-widest block font-bold mb-1">Home</span>
                            <span className="text-7xl sm:text-8xl lg:text-9xl font-black text-amber-400 tabular-nums tracking-tighter">{activeMatch.scoreA}</span>
                          </div>
                          <span className="text-slate-600 font-black text-5xl sm:text-6xl">:</span>
                          <div className="text-center">
                            <span className="text-xs text-slate-500 uppercase tracking-widest block font-bold mb-1">Away</span>
                            <span className="text-7xl sm:text-8xl lg:text-9xl font-black text-cyan-400 tabular-nums tracking-tighter">{activeMatch.scoreB}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-6 pt-4 border-t border-slate-800 w-full">
                          <div className="flex items-center gap-3 bg-slate-900 px-5 py-2.5 rounded-2xl border border-slate-800 shadow-inner">
                            <Clock className="w-5 h-5 text-amber-400" />
                            <span className="font-mono text-3xl sm:text-4xl font-black text-white tracking-wider">{formatTime(gameSeconds)}</span>
                            {!isViewer && activeMatch.status !== 'Final' && (() => {
                              const allTeamsPlayers = [...(teamA?.players || []), ...(teamB?.players || [])];
                              const hasUnverifiedOnCourt = allTeamsPlayers.some((p) => {
                                const st = activeMatch.stats[String(p.id)];
                                const isOnCourt = st ? st.isOnCourt : true; 
                                const isCheckedIn = st ? st.isCheckedIn : false;
                                return isOnCourt && !isCheckedIn;
                              });

                              return (
                                <button 
                                  type="button" 
                                  onClick={handleToggleClock} 
                                  disabled={hasUnverifiedOnCourt && !isClockRunning}
                                  className={`p-2 rounded-xl text-slate-950 font-black cursor-pointer transition flex items-center gap-1 shadow ${
                                    hasUnverifiedOnCourt && !isClockRunning 
                                      ? 'bg-slate-700 opacity-40 cursor-not-allowed text-slate-400' 
                                      : isClockRunning ? 'bg-amber-400 hover:bg-amber-300' : 'bg-emerald-400 hover:bg-emerald-300'
                                  }`}
                                  title={hasUnverifiedOnCourt && !isClockRunning ? 'Locked: Unlock all on-court players first' : (isClockRunning ? 'Pause Game Clock' : 'Start Game Clock')}
                                >
                                  {isClockRunning ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                                </button>
                              );
                            })()}
                          </div>

                          <div className="flex items-center gap-3 bg-slate-900 px-5 py-2.5 rounded-2xl border border-slate-800 shadow-inner">
                            <span className="text-xs font-black text-amber-400 uppercase tracking-wider">Shot Clock:</span>
                            <span className={`font-mono text-3xl sm:text-4xl font-black w-14 text-center tracking-wider ${shotClock <= 5 ? 'text-red-400 animate-pulse' : 'text-amber-400'}`}>
                              {shotClock}s
                            </span>
                            {!isViewer && activeMatch.status !== 'Final' && (
                              <div className="flex items-center gap-1.5 pl-3 border-l border-slate-800">
                                <button type="button" onClick={() => setShotClock(24)} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-black rounded-xl text-xs cursor-pointer shadow" title="Reset Shot Clock to 24s">24</button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex-1 text-center lg:text-right w-full">
                        <span className="text-xs font-bold tracking-widest text-slate-400 uppercase">Away Franchise</span>
                        <h2 className="text-3xl font-black text-white truncate">{teamB.name}</h2>
                        <p className="text-xs text-slate-400 mt-1">Coach: {teamB.coachName || 'Staff'}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-lg border border-slate-700 overflow-x-auto max-w-full">
                        <button type="button" disabled={isViewer} onClick={() => arenaAudio.playSubstitutionHorn()} className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-amber-300 rounded font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"><Volume2 className="w-3 h-3" /> Horn</button>
                        <button type="button" disabled={isViewer} onClick={() => arenaAudio.playWhistle()} className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-slate-200 rounded font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"><Volume2 className="w-3 h-3" /> Whistle</button>
                        <button type="button" disabled={isViewer} onClick={() => arenaAudio.playArenaBuzzer()} className="px-2.5 py-1 bg-red-900/60 hover:bg-red-800 disabled:opacity-30 disabled:cursor-not-allowed text-red-200 rounded font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"><Volume2 className="w-3 h-3" /> Buzzer</button>
                      </div>
                      <div>
                        {!isViewer && activeMatch.status !== 'Final' ? (
                          <button type="button" onClick={handleAttemptFinalizeMatch} className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow transition cursor-pointer"><CheckCircle2 className="w-3.5 h-3.5" /> Finalize Match</button>
                        ) : (
                          <button type="button" onClick={() => setActiveTab('report')} className="bg-blue-600 hover:bg-blue-500 text-white font-black px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow transition cursor-pointer"><FileText className="w-3.5 h-3.5" /> View Official Match Document</button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {teamA && teamB && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {[{ t: teamA, key: 'A' as const, color: 'text-amber-400' }, { t: teamB, key: 'B' as const, color: 'text-cyan-400' }].map(({ t, key, color }) => (
                      <div key={t.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                        <div className="bg-slate-800/80 px-4 py-3 border-b border-slate-700 flex justify-between items-center">
                          <h3 className={`font-black text-sm ${color}`}>{t.name}</h3>
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
                                      <button type="button" onClick={() => setSelectedPlayer(p)} className="font-semibold text-white hover:underline cursor-pointer flex items-center gap-1.5">{p.name} {p.descriptor && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />}</button>
                                    </td>
                                    <td className="p-3 text-center">
                                      {st.isCheckedIn ? <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-bold"><CheckCircle2 className="w-3 h-3" /> Ready</span> : <span className="inline-flex items-center gap-1 text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded font-bold"><AlertCircle className="w-3 h-3" /> Locked</span>}
                                    </td>
                                    <td className="p-3 text-center">
                                      <button type="button" disabled={isViewer || !st.isCheckedIn || activeMatch.status === 'Final'} onClick={() => togglePlayerOnCourt(p.id)} className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${st.isOnCourt ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'} disabled:opacity-50`}>{st.isOnCourt ? 'On Court' : 'Bench'}</button>
                                    </td>
                                    <td className="p-3 text-center font-bold text-white text-sm">{st.points}</td>
                                    {!isViewer && (
                                      <td className="p-3 text-right">
                                        <div className="inline-flex gap-1">
                                          <button type="button" disabled={!st.isCheckedIn || st.isFouledOut || activeMatch.status === 'Final'} onClick={() => handleScore(p.id, key, 1)} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-[10px] font-bold rounded cursor-pointer">+1</button>
                                          <button type="button" disabled={!st.isCheckedIn || st.isFouledOut || activeMatch.status === 'Final'} onClick={() => handleScore(p.id, key, 2)} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-[10px] font-bold rounded cursor-pointer">+2</button>
                                          <button type="button" disabled={!st.isCheckedIn || st.isFouledOut || activeMatch.status === 'Final'} onClick={() => handleScore(p.id, key, 3)} className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white text-[10px] font-bold rounded cursor-pointer">+3</button>
                                          <button type="button" disabled={!st.isCheckedIn || st.isFouledOut || activeMatch.status === 'Final'} onClick={() => handleFoul(p.id, key)} className="px-2 py-1 bg-red-900/60 hover:bg-red-800 disabled:opacity-30 text-red-200 text-[10px] font-bold rounded cursor-pointer">FOUL</button>
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

        {/* OFFICIAL MATCH RESULTS DOCUMENT REPORT */}
        {activeTab === 'report' && (
          <div className="space-y-6">
            {activeMatch.status !== 'Final' ? (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 text-center max-w-xl mx-auto space-y-4 shadow-xl print:hidden">
                <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto text-amber-400"><Lock className="w-8 h-8" /></div>
                <div>
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">Official Game Report Locked</h3>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">Certified match documents and official player score sheets are generated exclusively after a match is declared <strong>FINAL</strong>.</p>
                </div>
                <button type="button" onClick={() => handleTabChange('desk')} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow">Return to Scorer Desk</button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex justify-between items-center print:hidden bg-slate-900 p-4 rounded-2xl border border-slate-800">
                  <div>
                    <h2 className="text-sm font-black text-white uppercase">Official Match Results Document</h2>
                    <p className="text-xs text-slate-400">Certified formal match summary and box score.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => window.print()} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow cursor-pointer"><Printer className="w-4 h-4" /> Print / Save PDF</button>
                    <button type="button" onClick={() => handleTabChange('desk')} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer">Back to Desk</button>
                  </div>
                </div>

                {/* PRINTABLE DOCUMENT SHEET */}
                <div className="bg-white text-slate-900 p-8 sm:p-12 rounded-3xl shadow-2xl max-w-4xl mx-auto print:shadow-none print:p-0 print:w-full font-sans border border-slate-300">
                  {/* Document Header */}
                  <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6 mb-6">
                    <div>
                      <h1 className="text-2xl font-black uppercase tracking-wider text-slate-900">{leagueBranding.leagueName}</h1>
                      <p className="text-xs text-slate-600 font-bold uppercase mt-0.5">Official Certified Match Document & Box Score</p>
                    </div>
                    <div className="text-right">
                      <span className="inline-block px-3 py-1 bg-slate-900 text-white font-mono text-xs font-bold uppercase rounded-lg">Match ID: {activeMatch.id}</span>
                      <p className="text-[11px] text-slate-500 font-medium mt-1">Venue: {leagueBranding.venueName} • {activeMatch.court}</p>
                      <p className="text-[11px] text-slate-500 font-medium">Date: {new Date().toLocaleDateString()}</p>
                    </div>
                  </div>

                  {/* Match Summary Scoreboard Box */}
                  <div className="grid grid-cols-3 items-center text-center bg-slate-100 p-6 rounded-2xl border border-slate-200 mb-8">
                    <div className="text-left pl-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">Home Franchise</span>
                      <h3 className="text-xl sm:text-2xl font-black text-slate-900">{teamA?.name}</h3>
                      <p className="text-xs text-slate-600">Coach: {teamA?.coachName || 'Staff'}</p>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1">Final Score</span>
                      <div className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 font-mono">
                        {activeMatch.scoreA} <span className="text-slate-400 font-normal">v</span> {activeMatch.scoreB}
                      </div>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full uppercase mt-1">Status: Certified Final</span>
                    </div>
                    <div className="text-right pr-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">Away Franchise</span>
                      <h3 className="text-xl sm:text-2xl font-black text-slate-900">{teamB?.name}</h3>
                      <p className="text-xs text-slate-600">Coach: {teamB?.coachName || 'Staff'}</p>
                    </div>
                  </div>

                  {/* Team Box Scores Section */}
                  <div className="space-y-8">
                    {[{ t: teamA, score: activeMatch.scoreA, fouls: activeMatch.teamAFouls, label: 'Home Team Roster & Stats' }, { t: teamB, score: activeMatch.scoreB, fouls: activeMatch.teamBFouls, label: 'Away Team Roster & Stats' }].map(({ t, score, fouls, label }, idx) => (
                      <div key={idx} className="space-y-3">
                        <div className="flex justify-between items-center border-b border-slate-300 pb-2">
                          <h4 className="font-black uppercase text-sm text-slate-900">{t?.name} ({label})</h4>
                          <span className="text-xs font-bold text-slate-700 font-mono">Total Points: {score} | Team Fouls: {fouls}</span>
                        </div>
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-200 text-slate-800 uppercase font-bold text-[10px]">
                            <tr>
                              <th className="p-2">#</th>
                              <th className="p-2">Player Name</th>
                              <th className="p-2 text-center">Position</th>
                              <th className="p-2 text-center">Status</th>
                              <th className="p-2 text-center">Personal Fouls</th>
                              <th className="p-2 text-right">Total Points</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {t?.players.map((p) => {
                              const st = activeMatch.stats[String(p.id)] || { points: 0, fouls: 0, isCheckedIn: false };
                              return (
                                <tr key={p.id}>
                                  <td className="p-2 font-mono font-bold">#{p.jersey}</td>
                                  <td className="p-2 font-semibold text-slate-900">{p.name}</td>
                                  <td className="p-2 text-center font-medium text-slate-600">{p.position}</td>
                                  <td className="p-2 text-center font-bold text-slate-700">{st.isCheckedIn ? 'Verified' : 'Unchecked'}</td>
                                  <td className="p-2 text-center font-mono font-bold text-slate-800">{st.fouls}</td>
                                  <td className="p-2 text-right font-black text-slate-900 font-mono text-sm">{st.points}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>

                  {/* Play Log / Audit Trail */}
                  <div className="mt-8 pt-6 border-t border-slate-300 space-y-3">
                    <h4 className="font-black uppercase text-xs text-slate-900 tracking-wider">Official Play-by-Play & Audit Log</h4>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 max-h-48 overflow-y-auto space-y-1.5 font-mono text-[11px] text-slate-700">
                      {activeMatch.logs && activeMatch.logs.length > 0 ? (
                        activeMatch.logs.map((log) => (
                          <div key={log.id} className="flex gap-3">
                            <span className="text-slate-400 font-bold">[{log.timestamp}]</span>
                            <span>{log.description}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-slate-400 italic">No formal play logs recorded.</div>
                      )}
                    </div>
                  </div>

                  {/* Signatures */}
                  <div className="mt-12 pt-8 border-t-2 border-slate-900 grid grid-cols-3 gap-6 text-center text-xs">
                    <div>
                      <div className="border-b border-slate-400 pb-8 mb-1"></div>
                      <p className="font-bold uppercase text-slate-800">Chief Scorer</p>
                    </div>
                    <div>
                      <div className="border-b border-slate-400 pb-8 mb-1"></div>
                      <p className="font-bold uppercase text-slate-800">Referee / Official</p>
                    </div>
                    <div>
                      <div className="border-b border-slate-400 pb-8 mb-1"></div>
                      <p className="font-bold uppercase text-slate-800">Tournament Commissioner</p>
                    </div>
                  </div>
                </div>
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

      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 print:hidden">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 text-white shadow-2xl">
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-amber-400">Match Limit Reached! 🚨</h3>
              <p className="text-slate-400 text-sm mt-1">You have reached the maximum allowed matches for your current plan. Choose a tier to unlock instant access and keep your tournament running.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-lg text-slate-200">Basic</h4>
                  <div className="text-2xl font-extrabold text-white mt-1">₱199</div>
                  <p className="text-xs text-slate-400 mt-2">Up to 10 matches. Perfect for single-day local games.</p>
                </div>
                <button onClick={() => handleSelectTier('basic')} className="mt-4 w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 rounded-xl text-sm transition cursor-pointer">Choose Basic</button>
              </div>

              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-lg text-blue-400">Essential</h4>
                  <div className="text-2xl font-extrabold text-white mt-1">₱299</div>
                  <p className="text-xs text-slate-400 mt-2">Up to 30 matches. Great for weekend sportsfests.</p>
                </div>
                <button onClick={() => handleSelectTier('essential')} className="mt-4 w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 rounded-xl text-sm transition cursor-pointer">Choose Essential</button>
              </div>

              <div className="bg-gradient-to-b from-amber-500/20 to-slate-800/60 border border-amber-500/50 rounded-xl p-4 flex flex-col justify-between relative">
                <span className="absolute -top-3 right-4 bg-amber-500 text-slate-950 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Best Value</span>
                <div>
                  <h4 className="font-bold text-lg text-amber-400">Pro</h4>
                  <div className="text-2xl font-extrabold text-white mt-1">₱399</div>
                  <p className="text-xs text-slate-400 mt-2">Unlimited matches, cloud sync, and live TV projection mode.</p>
                </div>
                <button onClick={() => handleSelectTier('pro')} className="mt-4 w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2 rounded-lg text-sm transition shadow-lg shadow-amber-500/20 cursor-pointer">Choose Pro</button>
              </div>
            </div>
            <div className="text-center">
              <button onClick={() => setShowUpgradeModal(false)} className="text-xs text-slate-400 hover:text-white underline transition cursor-pointer">Cancel / Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}