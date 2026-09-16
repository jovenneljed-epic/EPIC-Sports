export type SportType = 'basketball' | 'volleyball' | 'badminton';

export type MatchStatus = 'Upcoming' | 'Live' | 'Paused' | 'Final';

export interface SetHistoryEntry {
  setNumber: number;
  scoreA: number;
  scoreB: number;
  winnerTeamId?: string;
  durationSeconds?: number;
}

export interface MatchState {
  id: string;
  sessionId: string; // Links match to a specific tournament/event edition
  sportType: SportType;
  courtId?: string;  // e.g. "Court 1", "Main Gym"
  status: MatchStatus;
  
  // Teams
  teamAId: string;
  teamBId: string;
  
  // Current Live Scores (Points in current quarter/set)
  scoreA: number;
  scoreB: number;
  
  // In-Game Flow & Ball/Serve Tracking
  possession?: 'A' | 'B'; // Possession arrow in basketball or serving team in volleyball/badminton
  
  // Volleyball / Badminton Specific Tracking
  setsA?: number;
  setsB?: number;
  currentSet?: number;
  history?: SetHistoryEntry[];
  
  // Basketball Specific Tracking
  quarter?: 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'OT' | 'Final';
  teamAFouls?: number;
  teamBFouls?: number;
  
  // Metadata & Timestamps for Syncing
  startedAt?: string;
  completedAt?: string;
  updatedAt?: string;
}