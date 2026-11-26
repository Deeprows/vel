import { formatTimeMs } from '../utils/format';
import { PAINTS } from './cars';
import {
  ChallengeEvalResult,
  DailyChallengeDefinition,
  DailyChallengeId,
  DailyChallengeProgress,
  DailyChallengeState,
  PaintOption,
  RaceResult,
} from './types';

const CHALLENGES_STORAGE_KEY = 'apex_velocity_daily_challenges_v1';
const UNLOCKED_PAINTS_STORAGE_KEY = 'apex_velocity_unlocked_paints_v1';

export const DAILY_CHALLENGES: Record<DailyChallengeId, DailyChallengeDefinition> = {
  drift_5000: {
    id: 'drift_5000',
    title: 'Drift 5,000 Points',
    description: 'Accumulate 5,000 drift points across sessions today',
    target: 5000,
    unitLabel: 'pts',
    rewardPaintId: 'midnight_amethyst',
  },
  sprint_3_laps_2m: {
    id: 'sprint_3_laps_2m',
    title: 'Complete 3 Laps Under 2:00',
    description: 'Finish 3 laps in a race with total time under 2:00.00',
    target: 3,
    unitLabel: 'laps',
    rewardPaintId: 'rose_gold_chrome',
  },
  speed_300: {
    id: 'speed_300',
    title: 'Break 300 km/h',
    description: 'Hit a top speed of 300 km/h in any event today',
    target: 300,
    unitLabel: 'km/h',
    rewardPaintId: 'hyper_lime',
  },
  win_race: {
    id: 'win_race',
    title: 'Street Race Champion',
    description: 'Take 1st place in a 3-Lap Street Race',
    target: 1,
    unitLabel: 'win',
    rewardPaintId: 'liquid_obsidian',
  },
  hot_lap_40s: {
    id: 'hot_lap_40s',
    title: 'Sub-40s Hot Lap',
    description: 'Complete any single lap in under 0:40.00',
    target: 1,
    unitLabel: 'lap',
    rewardPaintId: 'iridescent_titanium',
  },
};

const DAILY_COMBOS: DailyChallengeId[][] = [
  ['drift_5000', 'sprint_3_laps_2m', 'speed_300'],
  ['drift_5000', 'win_race', 'hot_lap_40s'],
  ['sprint_3_laps_2m', 'win_race', 'speed_300'],
  ['drift_5000', 'sprint_3_laps_2m', 'hot_lap_40s'],
  ['speed_300', 'win_race', 'hot_lap_40s'],
];

export function getTodayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getActiveChallengeIdsForDate(now = new Date()): DailyChallengeId[] {
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const anchorUtc = Date.UTC(2026, 10, 25); // 2026-11-25
  const dayOffset = Math.floor((todayUtc - anchorUtc) / 86_400_000);
  const idx = ((dayOffset % DAILY_COMBOS.length) + DAILY_COMBOS.length) % DAILY_COMBOS.length;
  return DAILY_COMBOS[idx];
}

export function getTimeUntilDailyResetLabel(now = new Date()): string {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const diffMs = Math.max(0, tomorrow.getTime() - now.getTime());
  const hours = Math.floor(diffMs / 3_600_000);
  const mins = Math.floor((diffMs % 3_600_000) / 60_000);
  return `${hours}h ${mins}m`;
}

function buildFreshState(dateKey: string, activeIds: DailyChallengeId[]): DailyChallengeState {
  const items = {} as Record<DailyChallengeId, DailyChallengeProgress>;
  for (const id of Object.keys(DAILY_CHALLENGES) as DailyChallengeId[]) {
    items[id] = {
      id,
      progress: 0,
      completed: false,
      completedAt: null,
    };
  }
  return {
    dateKey,
    activeIds,
    items,
  };
}

export function getUnlockedPaintIds(): string[] {
  try {
    const raw = localStorage.getItem(UNLOCKED_PAINTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((id): id is string => typeof id === 'string');
    }
  } catch {
    // Ignore storage read error
  }
  return [];
}

function saveUnlockedPaintIds(ids: string[]): void {
  try {
    localStorage.setItem(UNLOCKED_PAINTS_STORAGE_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // Ignore quota errors
  }
}

export function isPaintUnlocked(paint: PaintOption, unlockedIds: string[]): boolean {
  if (!paint.unlockChallengeId) return true;
  return unlockedIds.includes(paint.id);
}

export function getDailyChallengeState(now = new Date()): DailyChallengeState {
  const todayKey = getTodayKey(now);
  const activeIds = getActiveChallengeIdsForDate(now);

  try {
    const raw = localStorage.getItem(CHALLENGES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DailyChallengeState;
      if (parsed && parsed.dateKey === todayKey && parsed.items) {
        const fresh = buildFreshState(todayKey, activeIds);
        for (const id of Object.keys(fresh.items) as DailyChallengeId[]) {
          if (parsed.items[id]) {
            fresh.items[id] = parsed.items[id];
          }
        }
        return fresh;
      }
    }
  } catch {
    // Fall back to fresh state
  }

  const fresh = buildFreshState(todayKey, activeIds);
  saveDailyChallengeState(fresh);
  return fresh;
}

function saveDailyChallengeState(state: DailyChallengeState): void {
  try {
    localStorage.setItem(CHALLENGES_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota errors
  }
}

export function evaluateRaceForDailyChallenges(result: RaceResult): ChallengeEvalResult {
  const now = new Date();
  const state = getDailyChallengeState(now);
  const unlockedSet = new Set<string>(getUnlockedPaintIds());
  const newlyCompleted: DailyChallengeDefinition[] = [];
  const newlyUnlockedPaints: PaintOption[] = [];

  for (const challengeId of state.activeIds) {
    const def = DAILY_CHALLENGES[challengeId];
    const entry = state.items[challengeId];
    const wasCompleted = entry.completed;

    if (challengeId === 'drift_5000') {
      const nextDrift = Math.min(def.target, entry.progress + Math.max(0, result.totalDriftScore));
      entry.progress = nextDrift;
      if (nextDrift >= def.target) {
        entry.completed = true;
      }
    } else if (challengeId === 'sprint_3_laps_2m') {
      if (result.lapsCompleted >= 3 && result.totalTimeMs <= 120_000) {
        entry.progress = def.target;
        entry.completed = true;
        entry.bestMetricLabel = `Cleared in ${formatTimeMs(result.totalTimeMs)}`;
      } else if (!entry.completed) {
        if (result.lapsCompleted >= 3) {
          entry.progress = 2;
          entry.bestMetricLabel = `3 laps: ${formatTimeMs(result.totalTimeMs)} (need < 2:00)`;
        } else {
          entry.progress = Math.max(entry.progress, Math.min(2, result.lapsCompleted));
        }
      }
    } else if (challengeId === 'speed_300') {
      const roundedSpeed = Math.round(result.topSpeedKmh);
      entry.progress = Math.max(entry.progress, Math.min(def.target, roundedSpeed));
      if (roundedSpeed >= def.target) {
        entry.completed = true;
      }
      entry.bestMetricLabel = `Top: ${Math.max(entry.progress, roundedSpeed)} km/h`;
    } else if (challengeId === 'win_race') {
      if (result.mode === 'circuit' && result.position === 1) {
        entry.progress = 1;
        entry.completed = true;
        entry.bestMetricLabel = `1st on ${result.trackName}`;
      }
    } else if (challengeId === 'hot_lap_40s') {
      if (result.bestLapMs !== null && result.bestLapMs <= 40_000) {
        entry.progress = 1;
        entry.completed = true;
        entry.bestMetricLabel = `Lap: ${formatTimeMs(result.bestLapMs)}`;
      } else if (!entry.completed && result.bestLapMs !== null) {
        entry.bestMetricLabel = `Best: ${formatTimeMs(result.bestLapMs)}`;
      }
    }

    if (entry.completed && !wasCompleted) {
      entry.completedAt = now.toISOString();
      newlyCompleted.push(def);
    }

    if (entry.completed && !unlockedSet.has(def.rewardPaintId)) {
      unlockedSet.add(def.rewardPaintId);
      const paint = PAINTS.find((p) => p.id === def.rewardPaintId);
      if (paint) newlyUnlockedPaints.push(paint);
    }
  }

  const unlockedPaints = Array.from(unlockedSet);
  saveDailyChallengeState(state);
  saveUnlockedPaintIds(unlockedPaints);

  return {
    state,
    unlockedPaints,
    newlyCompleted,
    newlyUnlockedPaints,
  };
}
