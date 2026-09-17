import { type Team, type ScheduledMatch, type SportType } from '../App';

export interface TimeSlotConfig {
  startTime: string; // e.g. "08:00 AM"
  intervalMinutes: number; // e.g. 60 mins per game
  courts: string[]; // e.g. ["Court 1", "Court 2"]
}

/**
 * Automatically generates a conflict-free round-robin match schedule
 */
export function generateSmartSchedule(
  teams: Team[],
  sportType: SportType,
  sessionId: string,
  config: TimeSlotConfig
): ScheduledMatch[] {
  const sportTeams = teams.filter((t) => (t.sportType || 'basketball') === sportType);
  if (sportTeams.length < 2) return [];

  const matchups: { teamAId: string; teamBId: string }[] = [];

  // Generate all unique round-robin pairings
  for (let i = 0; i < sportTeams.length; i++) {
    for (let j = i + 1; j < sportTeams.length; j++) {
      matchups.push({
        teamAId: sportTeams[i].id,
        teamBId: sportTeams[j].id,
      });
    }
  }

  const scheduledMatches: ScheduledMatch[] = [];
  const teamLastGameTime: Record<string, number> = {}; // Track timestamps to prevent double booking

  let currentGameTime = parseTimeToMinutes(config.startTime);
  let courtIndex = 0;

  matchups.forEach((match, index) => {
    let slotFound = false;
    let attempts = 0;

    while (!slotFound && attempts < 20) {
      const timeString = formatMinutesToTime(currentGameTime);
      const currentCourt = config.courts[courtIndex % config.courts.length];
      
      const teamALast = teamLastGameTime[match.teamAId] || -999;
      const teamBLast = teamLastGameTime[match.teamBId] || -999;

      if (teamALast !== currentGameTime && teamBLast !== currentGameTime) {
        scheduledMatches.push({
          id: `auto_sched_${Date.now()}_${index}`,
          sessionId,
          sportType,
          teamAId: match.teamAId,
          teamBId: match.teamBId,
          timeSlot: `${timeString} (${currentCourt})`,
          status: 'Upcoming',
        });

        teamLastGameTime[match.teamAId] = currentGameTime;
        teamLastGameTime[match.teamBId] = currentGameTime;
        slotFound = true;
      }

      courtIndex++;
      if (courtIndex % config.courts.length === 0) {
        currentGameTime += config.intervalMinutes;
      }
      attempts++;
    }
  });

  return scheduledMatches;
}

function parseTimeToMinutes(timeStr: string): number {
  const [time, modifier] = timeStr.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (modifier === 'PM' && hours < 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function formatMinutesToTime(totalMins: number): string {
  const hours24 = Math.floor(totalMins / 60) % 24;
  const minutes = totalMins % 60;
  const modifier = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${modifier}`;
}