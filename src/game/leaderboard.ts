import { CarId, LeaderboardEntry, RaceMode, TrackId, TrackLeaderboard } from './types';

const STORAGE_KEY = 'apex_velocity_leaderboard_v1';
const DRIVER_NAME_KEY = 'apex_velocity_driver_name';
const MAX_ENTRIES_PER_BOARD = 10;

interface StoredLeaderboardMap {
  [trackId: string]: TrackLeaderboard;
}

function readStore(): StoredLeaderboardMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredLeaderboardMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(data: StoredLeaderboardMap): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

export function getSavedDriverName(): string {
  try {
    const name = window.localStorage.getItem(DRIVER_NAME_KEY);
    return name && name.trim().length > 0 ? name.trim().slice(0, 18) : 'Driver';
  } catch {
    return 'Driver';
  }
}

export function saveDriverName(name: string): string {
  const cleaned = name.trim().slice(0, 18) || 'Driver';
  try {
    window.localStorage.setItem(DRIVER_NAME_KEY, cleaned);
  } catch {
    // Ignore
  }
  return cleaned;
}

export function getTrackLeaderboard(trackId: TrackId): TrackLeaderboard {
  const store = readStore();
  const board = store[trackId];
  if (!board) {
    return { topLaps: [], topDrifts: [] };
  }
  return {
    topLaps: Array.isArray(board.topLaps) ? board.topLaps : [],
    topDrifts: Array.isArray(board.topDrifts) ? board.topDrifts : [],
  };
}

export interface SaveScoreResult {
  leaderboard: TrackLeaderboard;
  isNewLapRecord: boolean;
  isNewDriftRecord: boolean;
  lapRank: number | null;
  driftRank: number | null;
}

export function recordSessionScore(params: {
  trackId: TrackId;
  driverName: string;
  carId: CarId;
  carName: string;
  bestLapMs: number | null;
  driftScore: number;
  topSpeedKmh: number;
  mode: RaceMode;
}): SaveScoreResult {
  const store = readStore();
  const current = getTrackLeaderboard(params.trackId);
  const nowIso = new Date().toISOString();
  const driverName = params.driverName.trim().slice(0, 18) || 'Driver';

  let nextLaps = [...current.topLaps];
  let isNewLapRecord = false;
  let lapRank: number | null = null;

  if (params.bestLapMs !== null && Number.isFinite(params.bestLapMs) && params.bestLapMs > 1000) {
    const prevBest = nextLaps[0]?.bestLapMs ?? Infinity;
    const entry: LeaderboardEntry = {
      id: `lap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      trackId: params.trackId,
      driverName,
      carId: params.carId,
      carName: params.carName,
      bestLapMs: Math.round(params.bestLapMs),
      driftScore: Math.round(params.driftScore),
      topSpeedKmh: Math.round(params.topSpeedKmh),
      mode: params.mode,
      recordedAt: nowIso,
    };

    nextLaps.push(entry);
    nextLaps.sort((a, b) => (a.bestLapMs ?? Infinity) - (b.bestLapMs ?? Infinity));
    nextLaps = nextLaps.slice(0, MAX_ENTRIES_PER_BOARD);

    const idx = nextLaps.findIndex((e) => e.id === entry.id);
    if (idx !== -1) {
      lapRank = idx + 1;
      isNewLapRecord = idx === 0 && entry.bestLapMs! < prevBest;
    }
  }

  let nextDrifts = [...current.topDrifts];
  let isNewDriftRecord = false;
  let driftRank: number | null = null;

  if (params.driftScore > 0) {
    const prevHigh = nextDrifts[0]?.driftScore ?? 0;
    const entry: LeaderboardEntry = {
      id: `drift_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      trackId: params.trackId,
      driverName,
      carId: params.carId,
      carName: params.carName,
      bestLapMs: params.bestLapMs !== null ? Math.round(params.bestLapMs) : null,
      driftScore: Math.round(params.driftScore),
      topSpeedKmh: Math.round(params.topSpeedKmh),
      mode: params.mode,
      recordedAt: nowIso,
    };

    nextDrifts.push(entry);
    nextDrifts.sort((a, b) => b.driftScore - a.driftScore);
    nextDrifts = nextDrifts.slice(0, MAX_ENTRIES_PER_BOARD);

    const idx = nextDrifts.findIndex((e) => e.id === entry.id);
    if (idx !== -1) {
      driftRank = idx + 1;
      isNewDriftRecord = idx === 0 && entry.driftScore > prevHigh;
    }
  }

  const updated: TrackLeaderboard = {
    topLaps: nextLaps,
    topDrifts: nextDrifts,
  };

  store[params.trackId] = updated;
  writeStore(store);

  return {
    leaderboard: updated,
    isNewLapRecord,
    isNewDriftRecord,
    lapRank,
    driftRank,
  };
}

export function clearTrackLeaderboard(trackId: TrackId): TrackLeaderboard {
  const store = readStore();
  store[trackId] = { topLaps: [], topDrifts: [] };
  writeStore(store);
  return store[trackId];
}
