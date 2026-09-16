export type SportType = 'basketball' | 'volleyball' | 'badminton';

export interface SportConfig {
  id: SportType;
  name: string;
  hasQuarters: boolean;
  hasSets: boolean;
  maxScorePerSet?: number;
  winningSets?: number; // e.g., Best of 3 or Best of 5
  periodsName: string; // "Quarters", "Halves", "Sets"
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
    winningSets: 3, // Best of 5 sets
    periodsName: 'Sets',
  },
  badminton: {
    id: 'badminton',
    name: 'Badminton',
    hasQuarters: false,
    hasSets: true,
    maxScorePerSet: 21,
    winningSets: 2, // Best of 3 sets
    periodsName: 'Sets',
  },
};