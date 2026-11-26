import {
  AuthSession,
  CarId,
  PublicDriverProfile,
  RaceMode,
  TrackId,
  TrackLeaderboard,
} from './types';

/**
 * Pluggable Auth & Profile Connector.
 * Defaults to the local Express driver profile API (/api/auth/*, /api/profiles/*).
 * Replace or wrap these methods with your own OAuth / Firebase / external auth
 * provider when connecting custom sign-in later.
 */
export interface AuthConnector {
  register(params: {
    handle: string;
    passcode: string;
    displayName: string;
    bio?: string;
    region?: string;
    favoriteCarId?: CarId;
    paintId?: string;
  }): Promise<AuthSession>;
  login(params: { handle: string; passcode: string }): Promise<AuthSession>;
  fetchMe(token: string): Promise<PublicDriverProfile | null>;
  updateProfile(
    token: string,
    patch: {
      displayName?: string;
      bio?: string;
      region?: string;
      favoriteCarId?: CarId;
      paintId?: string;
    }
  ): Promise<PublicDriverProfile>;
  fetchProfiles(): Promise<PublicDriverProfile[]>;
  fetchProfileById(userId: string): Promise<PublicDriverProfile | null>;
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const defaultAuthConnector: AuthConnector = {
  async register(params) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return parseJsonOrThrow<AuthSession>(res);
  },

  async login(params) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return parseJsonOrThrow<AuthSession>(res);
  },

  async fetchMe(token) {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { profile?: PublicDriverProfile };
    return data.profile ?? null;
  },

  async updateProfile(token, patch) {
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(patch),
    });
    const data = await parseJsonOrThrow<{ profile: PublicDriverProfile }>(res);
    return data.profile;
  },

  async fetchProfiles() {
    try {
      const res = await fetch('/api/profiles');
      if (!res.ok) return [];
      const data = (await res.json()) as { profiles?: PublicDriverProfile[] };
      return Array.isArray(data.profiles) ? data.profiles : [];
    } catch {
      return [];
    }
  },

  async fetchProfileById(userId) {
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(userId)}`);
      if (!res.ok) return null;
      const data = (await res.json()) as { profile?: PublicDriverProfile };
      return data.profile ?? null;
    } catch {
      return null;
    }
  },
};

export async function fetchGlobalLeaderboard(trackId: TrackId): Promise<TrackLeaderboard> {
  try {
    const res = await fetch(`/api/leaderboards/${encodeURIComponent(trackId)}`);
    if (!res.ok) return { topLaps: [], topDrifts: [] };
    const data = (await res.json()) as Partial<TrackLeaderboard>;
    return {
      topLaps: Array.isArray(data.topLaps) ? data.topLaps : [],
      topDrifts: Array.isArray(data.topDrifts) ? data.topDrifts : [],
    };
  } catch {
    return { topLaps: [], topDrifts: [] };
  }
}

export async function submitGlobalLeaderboard(
  params: {
    trackId: TrackId;
    driverName: string;
    carId: CarId;
    carName: string;
    bestLapMs: number | null;
    driftScore: number;
    topSpeedKmh: number;
    position: number;
    mode: RaceMode;
  },
  token?: string | null
): Promise<{ leaderboard: TrackLeaderboard; profile: PublicDriverProfile | null } | null> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch('/api/leaderboards', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;
    return (await res.json()) as {
      leaderboard: TrackLeaderboard;
      profile: PublicDriverProfile | null;
    };
  } catch {
    return null;
  }
}
