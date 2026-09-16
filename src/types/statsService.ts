import { supabase } from '../supabaseClient';
import { type PlayerStatSummary } from '../types/stats';

export async function fetchPlayerLeaderboard(): Promise<PlayerStatSummary[]> {
  try {
    // 1. Fetch all players
    const { data: players, error: playerError } = await supabase
      .from('players')
      .select('*');

    if (playerError) throw playerError;
    if (!players || players.length === 0) return [];

    // 2. Fetch all player match statistics
    const { data: stats, error: statsError } = await supabase
      .from('player_stats')
      .select('*');

    if (statsError) throw statsError;

    // 3. Aggregate stats per player
    const summaryMap = new Map<string, PlayerStatSummary>();

    players.forEach((p) => {
      summaryMap.set(p.id, {
        playerId: p.id,
        playerName: p.name,
        teamName: p.team_id || 'Free Agent',
        totalPoints: 0,
        totalAssists: 0,
        totalFouls: 0,
        mvpCount: 0,
        gamesPlayed: 0,
      });
    });

    if (stats) {
      stats.forEach((s) => {
        const current = summaryMap.get(s.player_id);
        if (current) {
          current.totalPoints += s.points_scored || 0;
          current.totalAssists += s.assists || 0;
          current.totalFouls += s.fouls || 0;
          if (s.mvp) current.mvpCount += 1;
          current.gamesPlayed += 1;
        }
      });
    }

    // Convert to array and sort by total points descending (top scorers first)
    const leaderboard = Array.from(summaryMap.values()).sort(
      (a, b) => b.totalPoints - a.totalPoints
    );

    return leaderboard;
  } catch (err) {
    console.error('Error fetching player leaderboard:', err);
    return [];
  }
}