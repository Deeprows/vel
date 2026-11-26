import express from 'express';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type {
  CarId,
  DriverStats,
  LeaderboardEntry,
  LobbyPlayer,
  LobbyRoomState,
  LobbyRoomSummary,
  PublicDriverProfile,
  RaceInvite,
  RaceMode,
  RemoteTelemetryPacket,
  RoomScope,
  TrackId,
  TrackLeaderboard,
} from './src/game/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Session signing secret (runtime env or ephemeral cryptographic secret)
const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16
    ? process.env.SESSION_SECRET
    : crypto.randomBytes(32).toString('hex');

const VALID_TRACKS = new Set<TrackId>([
  'midnight_bay',
  'redline_canyon',
  'neon_docks',
  'tokyo_neon',
  'miami_strip',
  'alpine_pass',
]);
const VALID_CARS = new Set<CarId>([
  'diablo_sv',
  'valkyrie',
  'spectre',
  'apex_rse',
  'cobalt_m4',
  'ronin_rx',
  'titan_gt',
  'stratos_lm',
]);
const VALID_SCOPES = new Set<RoomScope>(['online', 'wifi']);
const MAX_PLAYERS_PER_ROOM = 4;

interface StoredUserAccount {
  userId: string;
  handle: string;
  handleLower: string;
  displayName: string;
  bio: string;
  region: string;
  favoriteCarId: CarId;
  paintId: string;
  salt: string;
  passcodeHash: string;
  stats: DriverStats;
  joinedAt: string;
}

interface ServerPlayer {
  id: string;
  userId?: string;
  handle?: string;
  ws: WebSocket;
  name: string;
  carId: CarId;
  paintId: string;
  underglowId: string;
  ready: boolean;
  gridSlot: number;
  lastTelemetry: RemoteTelemetryPacket | null;
}

interface ServerRoom {
  code: string;
  scope: RoomScope;
  wifiGroupKey: string;
  trackId: TrackId;
  totalLaps: number;
  hostId: string;
  status: 'lobby' | 'countdown' | 'racing' | 'finished';
  raceStartServerMs: number;
  createdAtMs: number;
  players: Map<string, ServerPlayer>;
  timers: ReturnType<typeof setTimeout>[];
}

interface ClientConnMeta {
  id: string;
  userId: string | null;
  roomCode: string | null;
  wifiGroupKey: string;
  isAlive: boolean;
}

interface PendingInvite {
  invite: RaceInvite;
  fromWs: WebSocket;
  toUserId: string;
  expiresAtMs: number;
}

function sanitizeDriverName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Street Racer';
  const cleaned = raw.replace(/[^\w\s.\-']/g, '').trim().slice(0, 18);
  return cleaned || 'Street Racer';
}

function sanitizeHandle(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 16);
}

function sanitizeBio(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[<>]/g, '').trim().slice(0, 90);
}

function sanitizeRegion(raw: unknown): string {
  if (typeof raw !== 'string') return 'Global Street';
  const cleaned = raw.replace(/[^\w\s,\-]/g, '').trim().slice(0, 24);
  return cleaned || 'Global Street';
}

function sanitizeId(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  return cleaned || fallback;
}

function sanitizeTrack(raw: unknown): TrackId {
  if (typeof raw === 'string' && VALID_TRACKS.has(raw as TrackId)) {
    return raw as TrackId;
  }
  return 'midnight_bay';
}

function sanitizeCar(raw: unknown): CarId {
  if (typeof raw === 'string' && VALID_CARS.has(raw as CarId)) {
    return raw as CarId;
  }
  return 'valkyrie';
}

function sanitizeScope(raw: unknown): RoomScope {
  if (typeof raw === 'string' && VALID_SCOPES.has(raw as RoomScope)) {
    return raw as RoomScope;
  }
  return 'online';
}

function sanitizeRoomCode(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function clampFinite(raw: unknown, min: number, max: number, fallback = 0): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, raw));
}

function getClientNetworkKey(req: IncomingMessage): string {
  const xff = req.headers['x-forwarded-for'];
  let ip = '';
  if (typeof xff === 'string' && xff.length > 0) {
    ip = xff.split(',')[0].trim();
  } else if (Array.isArray(xff) && xff.length > 0) {
    ip = xff[0].trim();
  } else {
    ip = req.socket.remoteAddress ?? '';
  }

  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }
  if (!ip || ip === '::1' || ip === '127.0.0.1') {
    return 'local';
  }
  if (
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  ) {
    return 'local';
  }
  return ip;
}

function getLanUrls(port: number): string[] {
  const interfaces = os.networkInterfaces();
  const urls: string[] = [];
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const addr of entries) {
      if (
        addr.family === 'IPv4' &&
        !addr.internal &&
        !addr.address.startsWith('169.254.')
      ) {
        urls.push(`http://${addr.address}:${port}`);
      }
    }
  }
  return urls;
}

// --- Security Helpers: Password Hashing & Signed Session Tokens ---
function hashPasscode(passcode: string, salt: string): string {
  return crypto.scryptSync(passcode, salt, 64).toString('hex');
}

function verifyPasscode(passcode: string, salt: string, storedHex: string): boolean {
  const computed = crypto.scryptSync(passcode, salt, 64);
  const stored = Buffer.from(storedHex, 'hex');
  if (computed.length !== stored.length) return false;
  return crypto.timingSafeEqual(computed, stored);
}

function issueSessionToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, iat: Date.now() }),
    'utf8'
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string | undefined): string | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      uid?: string;
    };
    return typeof parsed.uid === 'string' ? parsed.uid : null;
  } catch {
    return null;
  }
}

// --- Persistent Store (.data/apex-store.json) ---
const DATA_DIR = path.resolve(__dirname, '.data');
const STORE_FILE = path.join(DATA_DIR, 'apex-store.json');

const usersById = new Map<string, StoredUserAccount>();
const usersByHandle = new Map<string, StoredUserAccount>();
const globalLeaderboards: Record<TrackId, TrackLeaderboard> = {
  midnight_bay: { topLaps: [], topDrifts: [] },
  redline_canyon: { topLaps: [], topDrifts: [] },
  neon_docks: { topLaps: [], topDrifts: [] },
  tokyo_neon: { topLaps: [], topDrifts: [] },
  miami_strip: { topLaps: [], topDrifts: [] },
  alpine_pass: { topLaps: [], topDrifts: [] },
};

function savePersistentStore(): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const payload = {
      users: Array.from(usersById.values()),
      leaderboards: globalLeaderboards,
    };
    fs.writeFileSync(STORE_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch {
    // Ignore disk write issues in read-only environments
  }
}

function loadPersistentStore(): void {
  try {
    if (!fs.existsSync(STORE_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')) as {
      users?: StoredUserAccount[];
      leaderboards?: Partial<Record<TrackId, TrackLeaderboard>>;
    };
    if (Array.isArray(raw.users)) {
      for (const u of raw.users) {
        if (u && typeof u.userId === 'string' && typeof u.handleLower === 'string') {
          usersById.set(u.userId, u);
          usersByHandle.set(u.handleLower, u);
        }
      }
    }
    if (raw.leaderboards) {
      for (const tid of VALID_TRACKS) {
        const b = raw.leaderboards[tid];
        if (b) {
          globalLeaderboards[tid] = {
            topLaps: Array.isArray(b.topLaps) ? b.topLaps : [],
            topDrifts: Array.isArray(b.topDrifts) ? b.topDrifts : [],
          };
        }
      }
    }
  } catch {
    // Ignore corrupt store file
  }
}

loadPersistentStore();

const rooms = new Map<string, ServerRoom>();
const clientMeta = new WeakMap<WebSocket, ClientConnMeta>();
const activeUserSockets = new Map<string, Set<WebSocket>>();
const pendingInvites = new Map<string, PendingInvite>();

function getSocketActivity(ws: WebSocket): 'garage' | 'lobby' | 'racing' {
  const meta = clientMeta.get(ws);
  if (!meta || !meta.roomCode) return 'garage';
  const room = rooms.get(meta.roomCode);
  if (!room) return 'garage';
  if (room.status === 'racing' || room.status === 'countdown') return 'racing';
  return 'lobby';
}

function toPublicProfile(u: StoredUserAccount): PublicDriverProfile {
  const sockets = activeUserSockets.get(u.userId);
  let activeSocketId: string | null = null;
  let activity: 'garage' | 'lobby' | 'racing' | 'offline' = 'offline';
  let isOnline = false;

  if (sockets && sockets.size > 0) {
    for (const s of sockets) {
      if (s.readyState === WebSocket.OPEN) {
        isOnline = true;
        const m = clientMeta.get(s);
        activeSocketId = m?.id ?? null;
        activity = getSocketActivity(s);
        break;
      }
    }
  }

  return {
    userId: u.userId,
    handle: u.handle,
    displayName: u.displayName,
    bio: u.bio,
    region: u.region,
    favoriteCarId: u.favoriteCarId,
    paintId: u.paintId,
    isOnline,
    activeSocketId,
    activity,
    stats: u.stats,
    joinedAt: u.joinedAt,
  };
}

function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 12; attempt++) {
    const bytes = crypto.randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += alphabet[bytes[i] % alphabet.length];
    }
    if (!rooms.has(code)) return code;
  }
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function toLobbyState(room: ServerRoom): LobbyRoomState {
  const players: LobbyPlayer[] = Array.from(room.players.values())
    .sort((a, b) => a.gridSlot - b.gridSlot)
    .map((p) => ({
      id: p.id,
      userId: p.userId,
      handle: p.handle,
      name: p.name,
      carId: p.carId,
      paintId: p.paintId,
      underglowId: p.underglowId,
      ready: p.ready,
      isHost: p.id === room.hostId,
      gridSlot: p.gridSlot,
    }));

  return {
    code: room.code,
    scope: room.scope,
    trackId: room.trackId,
    totalLaps: room.totalLaps,
    hostId: room.hostId,
    status: room.status,
    players,
    raceStartServerMs: room.raceStartServerMs,
  };
}

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoom(room: ServerRoom, payload: unknown, exceptPlayerId?: string): void {
  const encoded = JSON.stringify(payload);
  for (const p of room.players.values()) {
    if (exceptPlayerId && p.id === exceptPlayerId) continue;
    if (p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(encoded);
    }
  }
}

function reassignGridSlots(room: ServerRoom): void {
  let slot = 0;
  for (const p of room.players.values()) {
    p.gridSlot = slot++;
  }
}

function clearRoomTimers(room: ServerRoom): void {
  for (const t of room.timers) {
    clearTimeout(t);
  }
  room.timers = [];
}

function removePlayerFromRoom(ws: WebSocket): void {
  const meta = clientMeta.get(ws);
  if (!meta || !meta.roomCode) return;

  const room = rooms.get(meta.roomCode);
  meta.roomCode = null;
  if (!room) return;

  room.players.delete(meta.id);

  if (room.players.size === 0) {
    clearRoomTimers(room);
    rooms.delete(room.code);
    return;
  }

  if (room.hostId === meta.id) {
    const nextHost = room.players.values().next().value;
    if (nextHost) {
      room.hostId = nextHost.id;
    }
  }

  if (room.status === 'lobby') {
    reassignGridSlots(room);
  }

  broadcastRoom(room, {
    type: 'room:state',
    room: toLobbyState(room),
  });
}

function bindUserSocket(ws: WebSocket, userId: string): void {
  const meta = clientMeta.get(ws);
  if (!meta) return;

  if (meta.userId && meta.userId !== userId) {
    activeUserSockets.get(meta.userId)?.delete(ws);
  }
  meta.userId = userId;
  let set = activeUserSockets.get(userId);
  if (!set) {
    set = new Set();
    activeUserSockets.set(userId, set);
  }
  set.add(ws);
}

function unbindUserSocket(ws: WebSocket): void {
  const meta = clientMeta.get(ws);
  if (!meta || !meta.userId) return;
  const set = activeUserSockets.get(meta.userId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) {
      activeUserSockets.delete(meta.userId);
    }
  }
  meta.userId = null;
}

function extractBearerUser(req: express.Request): StoredUserAccount | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  const uid = verifySessionToken(token);
  if (!uid) return null;
  return usersById.get(uid) ?? null;
}

async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '48kb' }));

  // --- User Account & Profile Routes (Pluggable Auth Ready) ---
  app.post('/api/auth/register', (req, res) => {
    const handle = sanitizeHandle(req.body?.handle);
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';
    const displayName = sanitizeDriverName(req.body?.displayName || handle);

    if (handle.length < 3) {
      res.status(400).json({ error: 'Handle must be at least 3 letters/numbers.' });
      return;
    }
    if (passcode.length < 4) {
      res.status(400).json({ error: 'Passcode must be at least 4 characters.' });
      return;
    }
    if (usersByHandle.has(handle)) {
      res.status(409).json({ error: `@${handle} is already taken. Sign in or pick another handle.` });
      return;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const user: StoredUserAccount = {
      userId: `usr_${crypto.randomUUID().slice(0, 12)}`,
      handle,
      handleLower: handle,
      displayName,
      bio: sanitizeBio(req.body?.bio),
      region: sanitizeRegion(req.body?.region),
      favoriteCarId: sanitizeCar(req.body?.favoriteCarId),
      paintId: sanitizeId(req.body?.paintId, 'solar_amber'),
      salt,
      passcodeHash: hashPasscode(passcode, salt),
      stats: {
        racesCompleted: 0,
        wins: 0,
        bestDriftScore: 0,
        bestLapMs: null,
        topSpeedKmh: 0,
      },
      joinedAt: new Date().toISOString(),
    };

    usersById.set(user.userId, user);
    usersByHandle.set(user.handleLower, user);
    savePersistentStore();

    const token = issueSessionToken(user.userId);
    res.status(201).json({ token, profile: toPublicProfile(user) });
  });

  app.post('/api/auth/login', (req, res) => {
    const handle = sanitizeHandle(req.body?.handle);
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';

    const user = usersByHandle.get(handle);
    if (!user || !verifyPasscode(passcode, user.salt, user.passcodeHash)) {
      res.status(401).json({ error: 'Invalid driver handle or passcode.' });
      return;
    }

    const token = issueSessionToken(user.userId);
    res.json({ token, profile: toPublicProfile(user) });
  });

  app.get('/api/auth/me', (req, res) => {
    const user = extractBearerUser(req);
    if (!user) {
      res.status(401).json({ error: 'Not signed in.' });
      return;
    }
    res.json({ profile: toPublicProfile(user) });
  });

  app.patch('/api/profile', (req, res) => {
    const user = extractBearerUser(req);
    if (!user) {
      res.status(401).json({ error: 'Sign in to update your profile.' });
      return;
    }
    if (req.body?.displayName !== undefined) {
      user.displayName = sanitizeDriverName(req.body.displayName);
    }
    if (req.body?.bio !== undefined) {
      user.bio = sanitizeBio(req.body.bio);
    }
    if (req.body?.region !== undefined) {
      user.region = sanitizeRegion(req.body.region);
    }
    if (req.body?.favoriteCarId !== undefined) {
      user.favoriteCarId = sanitizeCar(req.body.favoriteCarId);
    }
    if (req.body?.paintId !== undefined) {
      user.paintId = sanitizeId(req.body.paintId, user.paintId);
    }
    savePersistentStore();
    res.json({ profile: toPublicProfile(user) });
  });

  app.get('/api/profiles', (_req, res) => {
    const profiles = Array.from(usersById.values())
      .map(toPublicProfile)
      .sort((a, b) => {
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
        if (b.stats.wins !== a.stats.wins) return b.stats.wins - a.stats.wins;
        return b.stats.bestDriftScore - a.stats.bestDriftScore;
      });
    res.json({ profiles });
  });

  app.get('/api/profiles/:userId', (req, res) => {
    const uid = sanitizeId(req.params.userId, '');
    const user = usersById.get(uid);
    if (!user) {
      res.status(404).json({ error: 'Driver profile not found.' });
      return;
    }
    res.json({ profile: toPublicProfile(user) });
  });

  // --- Global Track Leaderboards ---
  app.get('/api/leaderboards/:trackId', (req, res) => {
    const trackId = sanitizeTrack(req.params.trackId);
    res.json(globalLeaderboards[trackId]);
  });

  app.post('/api/leaderboards', (req, res) => {
    const authUser = extractBearerUser(req);
    const trackId = sanitizeTrack(req.body?.trackId);
    const carId = sanitizeCar(req.body?.carId);
    const carName = sanitizeDriverName(req.body?.carName);
    const mode: RaceMode = req.body?.mode === 'time_attack' ? 'time_attack' : 'circuit';
    const bestLapMs =
      typeof req.body?.bestLapMs === 'number' && Number.isFinite(req.body.bestLapMs) && req.body.bestLapMs > 1000
        ? Math.round(req.body.bestLapMs)
        : null;
    const driftScore = Math.round(clampFinite(req.body?.driftScore, 0, 1_000_000));
    const topSpeedKmh = Math.round(clampFinite(req.body?.topSpeedKmh, 0, 600));
    const position = Math.round(clampFinite(req.body?.position, 1, 8, 1));
    const driverName = authUser ? authUser.displayName : sanitizeDriverName(req.body?.driverName);
    const nowIso = new Date().toISOString();

    const board = globalLeaderboards[trackId];

    if (bestLapMs !== null) {
      board.topLaps.push({
        id: `glap_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
        trackId,
        driverName,
        userId: authUser?.userId,
        handle: authUser?.handle,
        carId,
        carName,
        bestLapMs,
        driftScore,
        topSpeedKmh,
        mode,
        recordedAt: nowIso,
      });
      board.topLaps.sort((a, b) => (a.bestLapMs ?? Infinity) - (b.bestLapMs ?? Infinity));
      board.topLaps = board.topLaps.slice(0, 20);
    }

    if (driftScore > 0) {
      board.topDrifts.push({
        id: `gdrift_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
        trackId,
        driverName,
        userId: authUser?.userId,
        handle: authUser?.handle,
        carId,
        carName,
        bestLapMs,
        driftScore,
        topSpeedKmh,
        mode,
        recordedAt: nowIso,
      });
      board.topDrifts.sort((a, b) => b.driftScore - a.driftScore);
      board.topDrifts = board.topDrifts.slice(0, 20);
    }

    if (authUser) {
      authUser.stats.racesCompleted += 1;
      if (mode === 'circuit' && position === 1) {
        authUser.stats.wins += 1;
      }
      if (driftScore > authUser.stats.bestDriftScore) {
        authUser.stats.bestDriftScore = driftScore;
      }
      if (topSpeedKmh > authUser.stats.topSpeedKmh) {
        authUser.stats.topSpeedKmh = topSpeedKmh;
      }
      if (bestLapMs !== null && (authUser.stats.bestLapMs === null || bestLapMs < authUser.stats.bestLapMs)) {
        authUser.stats.bestLapMs = bestLapMs;
      }
    }

    savePersistentStore();
    res.json({
      leaderboard: board,
      profile: authUser ? toPublicProfile(authUser) : null,
    });
  });

  // Public local Wi-Fi LAN info for same-Wi-Fi mobile pairing
  app.get('/api/network-info', (_req, res) => {
    const lanUrls = getLanUrls(PORT);
    res.json({
      lanUrls,
      port: PORT,
      sameNetworkAvailable: true,
    });
  });

  // Discover active lobby rooms filtered by online vs same-Wi-Fi network group
  app.get('/api/rooms', (req, res) => {
    const scope = sanitizeScope(req.query.scope);
    const callerKey = getClientNetworkKey(req);
    const list: LobbyRoomSummary[] = [];

    for (const room of rooms.values()) {
      if (room.status !== 'lobby') continue;
      if (room.scope !== scope) continue;
      if (scope === 'wifi' && room.wifiGroupKey !== callerKey) continue;

      const host = room.players.get(room.hostId);
      list.push({
        code: room.code,
        scope: room.scope,
        trackId: room.trackId,
        hostName: host?.name ?? 'Host',
        playerCount: room.players.size,
        maxPlayers: MAX_PLAYERS_PER_ROOM,
        status: room.status,
      });
    }

    res.json({ rooms: list });
  });

  // Mount Vite dev middleware in development, or serve static dist/ in production
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found');
      }
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: 16 * 1024,
  });

  const broadcastDirectoryUpdated = () => {
    const msg = JSON.stringify({ type: 'directory:updated' });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  };

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const playerId = crypto.randomUUID().slice(0, 12);
    const wifiGroupKey = getClientNetworkKey(req);

    clientMeta.set(ws, {
      id: playerId,
      userId: null,
      roomCode: null,
      wifiGroupKey,
      isAlive: true,
    });

    sendJson(ws, {
      type: 'welcome',
      playerId,
      serverNow: Date.now(),
    });

    ws.on('pong', () => {
      const m = clientMeta.get(ws);
      if (m) m.isAlive = true;
    });

    ws.on('message', (rawBuf) => {
      const meta = clientMeta.get(ws);
      if (!meta) return;

      let msg: Record<string, unknown>;
      try {
        const parsed = JSON.parse(rawBuf.toString('utf8'));
        if (!parsed || typeof parsed !== 'object') return;
        msg = parsed as Record<string, unknown>;
      } catch {
        return;
      }

      const type = msg.type;
      if (typeof type !== 'string') return;

      if (type === 'ping') {
        sendJson(ws, {
          type: 'pong',
          t: typeof msg.t === 'number' ? msg.t : 0,
          serverNow: Date.now(),
        });
        return;
      }

      // Bind authenticated user account to this WebSocket for online presence & direct race invites
      if (type === 'auth:bind') {
        const token = typeof msg.token === 'string' ? msg.token : undefined;
        const uid = verifySessionToken(token);
        if (uid && usersById.has(uid)) {
          bindUserSocket(ws, uid);
          broadcastDirectoryUpdated();
        } else {
          unbindUserSocket(ws);
          broadcastDirectoryUpdated();
        }
        return;
      }

      // Direct "Request Race" challenge from one user's profile modal to another online user
      if (type === 'race:request') {
        if (!meta.userId) {
          sendJson(ws, {
            type: 'room:error',
            message: 'Sign in to your driver profile first to challenge other players.',
          });
          return;
        }
        const sender = usersById.get(meta.userId);
        const targetUserId = sanitizeId(msg.targetUserId, '');
        if (!sender || !targetUserId || targetUserId === sender.userId) return;

        const targetSockets = activeUserSockets.get(targetUserId);
        let targetWs: WebSocket | null = null;
        if (targetSockets) {
          for (const s of targetSockets) {
            if (s.readyState === WebSocket.OPEN) {
              targetWs = s;
              break;
            }
          }
        }
        if (!targetWs) {
          sendJson(ws, {
            type: 'race:invite_status',
            status: 'offline',
            message: 'That driver is currently offline.',
          });
          return;
        }

        const inviteId = `inv_${crypto.randomBytes(6).toString('hex')}`;
        const invite: RaceInvite = {
          inviteId,
          fromUserId: sender.userId,
          fromSocketId: meta.id,
          fromHandle: sender.handle,
          fromDisplayName: sender.displayName,
          fromCarId: sanitizeCar(msg.carId || sender.favoriteCarId),
          trackId: sanitizeTrack(msg.trackId),
          scope: sanitizeScope(msg.scope),
          createdAtMs: Date.now(),
        };

        pendingInvites.set(inviteId, {
          invite,
          fromWs: ws,
          toUserId: targetUserId,
          expiresAtMs: Date.now() + 60_000,
        });

        sendJson(targetWs, { type: 'race:invite_received', invite });
        sendJson(ws, {
          type: 'race:invite_status',
          status: 'sent',
          inviteId,
          message: `Race request sent to @${usersById.get(targetUserId)?.handle ?? 'racer'}.`,
        });
        return;
      }

      if (type === 'race:invite_respond') {
        const inviteId = sanitizeId(msg.inviteId, '');
        const accept = Boolean(msg.accept);
        const pending = pendingInvites.get(inviteId);
        if (!pending) return;
        pendingInvites.delete(inviteId);

        if (!meta.userId || meta.userId !== pending.toUserId) return;

        if (!accept) {
          sendJson(pending.fromWs, {
            type: 'race:invite_status',
            status: 'declined',
            message: 'Your race request was declined.',
          });
          return;
        }

        if (pending.fromWs.readyState !== WebSocket.OPEN) {
          sendJson(ws, { type: 'room:error', message: 'Challenger disconnected.' });
          return;
        }

        const fromMeta = clientMeta.get(pending.fromWs);
        if (!fromMeta) return;

        removePlayerFromRoom(pending.fromWs);
        removePlayerFromRoom(ws);

        const senderUser = usersById.get(pending.invite.fromUserId);
        const receiverUser = usersById.get(pending.toUserId);
        const code = generateRoomCode();

        const hostPlayer: ServerPlayer = {
          id: fromMeta.id,
          userId: senderUser?.userId,
          handle: senderUser?.handle,
          ws: pending.fromWs,
          name: senderUser?.displayName ?? pending.invite.fromDisplayName,
          carId: sanitizeCar(pending.invite.fromCarId),
          paintId: senderUser?.paintId ?? 'solar_amber',
          underglowId: 'cyan',
          ready: true,
          gridSlot: 0,
          lastTelemetry: null,
        };

        const guestPlayer: ServerPlayer = {
          id: meta.id,
          userId: receiverUser?.userId,
          handle: receiverUser?.handle,
          ws,
          name: sanitizeDriverName(msg.driverName || receiverUser?.displayName),
          carId: sanitizeCar(msg.carId || receiverUser?.favoriteCarId),
          paintId: sanitizeId(msg.paintId, receiverUser?.paintId ?? 'cobalt_night'),
          underglowId: sanitizeId(msg.underglowId, 'cyan'),
          ready: true,
          gridSlot: 1,
          lastTelemetry: null,
        };

        const room: ServerRoom = {
          code,
          scope: pending.invite.scope,
          wifiGroupKey: fromMeta.wifiGroupKey,
          trackId: pending.invite.trackId,
          totalLaps: 3,
          hostId: fromMeta.id,
          status: 'lobby',
          raceStartServerMs: 0,
          createdAtMs: Date.now(),
          players: new Map([
            [fromMeta.id, hostPlayer],
            [meta.id, guestPlayer],
          ]),
          timers: [],
        };

        rooms.set(code, room);
        fromMeta.roomCode = code;
        meta.roomCode = code;

        const roomState = toLobbyState(room);
        sendJson(pending.fromWs, {
          type: 'room:joined',
          playerId: fromMeta.id,
          room: roomState,
        });
        sendJson(ws, {
          type: 'room:joined',
          playerId: meta.id,
          room: roomState,
        });
        broadcastDirectoryUpdated();
        return;
      }

      if (type === 'room:create') {
        removePlayerFromRoom(ws);

        const scope = sanitizeScope(msg.scope);
        const trackId = sanitizeTrack(msg.trackId);
        const code = generateRoomCode();
        const boundUser = meta.userId ? usersById.get(meta.userId) : undefined;

        const player: ServerPlayer = {
          id: meta.id,
          userId: boundUser?.userId,
          handle: boundUser?.handle,
          ws,
          name: boundUser?.displayName ?? sanitizeDriverName(msg.driverName),
          carId: sanitizeCar(msg.carId),
          paintId: sanitizeId(msg.paintId, 'solar_amber'),
          underglowId: sanitizeId(msg.underglowId, 'cyan'),
          ready: true,
          gridSlot: 0,
          lastTelemetry: null,
        };

        const room: ServerRoom = {
          code,
          scope,
          wifiGroupKey: meta.wifiGroupKey,
          trackId,
          totalLaps: 3,
          hostId: meta.id,
          status: 'lobby',
          raceStartServerMs: 0,
          createdAtMs: Date.now(),
          players: new Map([[meta.id, player]]),
          timers: [],
        };

        rooms.set(code, room);
        meta.roomCode = code;

        sendJson(ws, {
          type: 'room:joined',
          playerId: meta.id,
          room: toLobbyState(room),
        });
        broadcastDirectoryUpdated();
        return;
      }

      if (type === 'room:join') {
        const code = sanitizeRoomCode(msg.code);
        if (!code) {
          sendJson(ws, { type: 'room:error', message: 'Enter a valid room code.' });
          return;
        }
        const room = rooms.get(code);
        if (!room) {
          sendJson(ws, { type: 'room:error', message: `Room ${code} was not found.` });
          return;
        }
        if (room.status !== 'lobby') {
          sendJson(ws, { type: 'room:error', message: `Race already in progress in room ${code}.` });
          return;
        }
        if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
          sendJson(ws, { type: 'room:error', message: `Room ${code} is full (4/4 racers).` });
          return;
        }

        removePlayerFromRoom(ws);
        const boundUser = meta.userId ? usersById.get(meta.userId) : undefined;

        const player: ServerPlayer = {
          id: meta.id,
          userId: boundUser?.userId,
          handle: boundUser?.handle,
          ws,
          name: boundUser?.displayName ?? sanitizeDriverName(msg.driverName),
          carId: sanitizeCar(msg.carId),
          paintId: sanitizeId(msg.paintId, 'cobalt_night'),
          underglowId: sanitizeId(msg.underglowId, 'cyan'),
          ready: true,
          gridSlot: room.players.size,
          lastTelemetry: null,
        };

        room.players.set(meta.id, player);
        meta.roomCode = code;

        const roomState = toLobbyState(room);
        sendJson(ws, {
          type: 'room:joined',
          playerId: meta.id,
          room: roomState,
        });
        broadcastRoom(room, { type: 'room:state', room: roomState }, meta.id);
        broadcastDirectoryUpdated();
        return;
      }

      if (type === 'room:leave') {
        removePlayerFromRoom(ws);
        sendJson(ws, { type: 'room:left' });
        broadcastDirectoryUpdated();
        return;
      }

      if (!meta.roomCode) return;
      const room = rooms.get(meta.roomCode);
      if (!room) {
        meta.roomCode = null;
        return;
      }
      const player = room.players.get(meta.id);
      if (!player) return;

      if (type === 'room:update_profile') {
        if (msg.driverName !== undefined) player.name = sanitizeDriverName(msg.driverName);
        if (msg.carId !== undefined) player.carId = sanitizeCar(msg.carId);
        if (msg.paintId !== undefined) player.paintId = sanitizeId(msg.paintId, player.paintId);
        if (msg.underglowId !== undefined) player.underglowId = sanitizeId(msg.underglowId, player.underglowId);
        if (typeof msg.ready === 'boolean') player.ready = msg.ready;

        broadcastRoom(room, { type: 'room:state', room: toLobbyState(room) });
        return;
      }

      if (type === 'room:set_track') {
        if (room.hostId !== meta.id || room.status !== 'lobby') return;
        room.trackId = sanitizeTrack(msg.trackId);
        broadcastRoom(room, { type: 'room:state', room: toLobbyState(room) });
        return;
      }

      if (type === 'room:start') {
        if (room.hostId !== meta.id || room.status !== 'lobby') return;
        if (room.players.size < 2) {
          sendJson(ws, {
            type: 'room:error',
            message: 'Need at least 2 players in the room to start a User vs User race.',
          });
          return;
        }

        clearRoomTimers(room);
        reassignGridSlots(room);
        room.status = 'countdown';
        const countdownMs = 3400;
        room.raceStartServerMs = Date.now() + countdownMs;

        for (const p of room.players.values()) {
          p.lastTelemetry = null;
        }

        const roomState = toLobbyState(room);
        broadcastRoom(room, {
          type: 'race:start',
          room: roomState,
          countdownMs,
          serverNow: Date.now(),
        });
        broadcastDirectoryUpdated();

        const raceTimer = setTimeout(() => {
          if (room.status === 'countdown') {
            room.status = 'racing';
            broadcastRoom(room, { type: 'room:state', room: toLobbyState(room) });
          }
        }, countdownMs);
        room.timers.push(raceTimer);
        return;
      }

      if (type === 'room:rematch') {
        if (room.hostId !== meta.id) return;
        clearRoomTimers(room);
        room.status = 'lobby';
        room.raceStartServerMs = 0;
        for (const p of room.players.values()) {
          p.lastTelemetry = null;
          p.ready = true;
        }
        broadcastRoom(room, { type: 'room:state', room: toLobbyState(room) });
        broadcastDirectoryUpdated();
        return;
      }

      if (type === 'race:telemetry') {
        if (room.status !== 'countdown' && room.status !== 'racing') return;

        const packet: RemoteTelemetryPacket = {
          playerId: meta.id,
          x: clampFinite(msg.x, -5000, 5000),
          y: clampFinite(msg.y, -200, 500),
          z: clampFinite(msg.z, -5000, 5000),
          yaw: clampFinite(msg.yaw, -100, 100),
          steerAngle: clampFinite(msg.steerAngle, -1.2, 1.2),
          pitchRad: clampFinite(msg.pitchRad, -0.6, 0.6),
          rollRad: clampFinite(msg.rollRad, -0.6, 0.6),
          wheelSpinAngle: clampFinite(msg.wheelSpinAngle, -1e6, 1e6),
          speedKmh: clampFinite(msg.speedKmh, 0, 600),
          forwardSpeed: clampFinite(msg.forwardSpeed, -100, 200),
          nosActive: Boolean(msg.nosActive),
          brakeIntensity: clampFinite(msg.brakeIntensity, 0, 1),
          isDrifting: Boolean(msg.isDrifting),
          driftIntensity: clampFinite(msg.driftIntensity, 0, 1),
          lap: Math.floor(clampFinite(msg.lap, 1, 99, 1)),
          trackProgress: clampFinite(msg.trackProgress, 0, 1),
          totalProgress: clampFinite(msg.totalProgress, 0, 200),
          finished: Boolean(msg.finished),
          finishTimeMs: clampFinite(msg.finishTimeMs, 0, 3_600_000),
          seq: Math.floor(clampFinite(msg.seq, 0, 1e9)),
        };

        player.lastTelemetry = packet;
        broadcastRoom(
          room,
          {
            type: 'race:remote_telemetry',
            packet,
          },
          meta.id
        );

        if (packet.finished && room.status === 'racing') {
          const allFinished = Array.from(room.players.values()).every(
            (p) => p.lastTelemetry?.finished
          );
          if (allFinished) {
            room.status = 'finished';
            broadcastRoom(room, { type: 'room:state', room: toLobbyState(room) });
          }
        }
        return;
      }

      if (type === 'webrtc:signal') {
        const targetPlayerId = sanitizeId(msg.targetPlayerId, '');
        const signalType = msg.signalType;
        if (
          !targetPlayerId ||
          (signalType !== 'offer' && signalType !== 'answer' && signalType !== 'ice')
        ) {
          return;
        }
        const target = room.players.get(targetPlayerId);
        if (!target) return;

        sendJson(target.ws, {
          type: 'webrtc:signal',
          fromPlayerId: meta.id,
          signalType,
          payload: msg.payload,
        });
      }
    });

    ws.on('close', () => {
      removePlayerFromRoom(ws);
      unbindUserSocket(ws);
      broadcastDirectoryUpdated();
    });

    ws.on('error', () => {
      removePlayerFromRoom(ws);
      unbindUserSocket(ws);
    });
  });

  const heartbeat = setInterval(() => {
    const nowMs = Date.now();
    for (const [id, inv] of pendingInvites.entries()) {
      if (inv.expiresAtMs < nowMs) pendingInvites.delete(id);
    }

    for (const client of wss.clients) {
      const meta = clientMeta.get(client);
      if (!meta) continue;
      if (!meta.isAlive) {
        removePlayerFromRoom(client);
        unbindUserSocket(client);
        client.terminate();
        continue;
      }
      meta.isAlive = false;
      client.ping();
    }
  }, 25_000);

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Apex Velocity server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Apex Velocity server:', err);
  process.exit(1);
});
