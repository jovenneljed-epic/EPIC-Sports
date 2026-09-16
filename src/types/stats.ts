export interface Player {
  id: string;
  teamId?: string;
  name: string;
  jerseyNumber?: number;
  position?: string;
  avatarUrl?: string;
  createdAt?: string;
}

export interface PlayerStatSummary {
  playerId: string;
  playerName: string;
  teamName?: string;
  totalPoints: number;
  totalAssists: number;
  totalFouls: number;
  mvpCount: number;
  gamesPlayed: number;
}