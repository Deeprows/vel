export type CarId =
  | 'diablo_sv'
  | 'valkyrie'
  | 'spectre'
  | 'apex_rse'
  | 'cobalt_m4'
  | 'ronin_rx'
  | 'titan_gt'
  | 'stratos_lm';

export type TrackId =
  | 'midnight_bay'
  | 'redline_canyon'
  | 'neon_docks'
  | 'tokyo_neon'
  | 'miami_strip'
  | 'alpine_pass'
  | 'london_underground'
  | 'chicago_loop';

export type RaceMode = 'circuit' | 'time_attack';

export type OpponentMode = 'computer' | 'online' | 'wifi';

export type CameraMode = 'chase' | 'hood' | 'cinematic';

export type ControlScheme = 'buttons' | 'tilt';

export type WeatherType = 'clear' | 'light_rain' | 'fog';

export interface TrackDefinition {
  id: TrackId;
  name: string;
  location: string;
  lengthLabel: string;
  difficulty: 'Technical' | 'High Speed' | 'Drift Heavy' | 'Straight Highway';
  skyHex: string;
  fogHex: string;
  fogDensity: number;
  accentHex: string;
  groundHex: string;
  roadTintHex: string;
}

export interface PaintOption {
  id: string;
  name: string;
  hex: string;
  metalness: number;
  roughness: number;
  clearcoat: number;
  iridescence?: number;
  unlockChallengeId?: DailyChallengeId;
}

export interface UnderglowOption {
  id: string;
  name: string;
  hex: string;
}

export interface CarSpec {
  id: CarId;
  name: string;
  category: string;
  description: string;
  // Visual proportions
  length: number;
  width: number;
  height: number;
  wingStyle: 'gt' | 'ducktail' | 'twin' | 'muscle';
  bodyStyle:
    | 'wedge_exotic'
    | 'tuner'
    | 'hypercar'
    | 'ev_gt'
    | 'coupe'
    | 'rotary'
    | 'muscle'
    | 'le_mans';
  exhaustStyle: 'quad' | 'center_hex' | 'cannon' | 'dual_wide';
  // Display stats (0-100)
  stats: {
    topSpeed: number;
    acceleration: number;
    handling: number;
    nitrous: number;
  };
  // Physics tuning
  mass: number; // kg
  wheelbase: number; // m
  maxEngineForce: number; // N
  maxSpeedKmh: number;
  nosBoostForce: number; // N
  nosTopSpeedBonusKmh: number;
  brakeForce: number; // N
  dragCoeff: number;
  downforceCoeff: number;
  frontGrip: number;
  rearGrip: number;
  driftGripFactor: number;
  steerSpeed: number;
  maxSteerAngle: number; // rad
  gearRatios: number[];
  redlineRpm: number;
}

export interface InputState {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (right) .. +1 (left)
  handbrake: boolean;
  nos: boolean;
}

export interface RacerTelemetry {
  id: string;
  name: string;
  isPlayer: boolean;
  color: string;
  x: number;
  z: number;
  yaw: number;
  trackProgress: number; // 0..1
  lap: number;
  totalProgress: number; // lap + trackProgress
  speedKmh: number;
  finished: boolean;
  finishTimeMs: number;
}

export interface HudTelemetry {
  speedKmh: number;
  rpm: number;
  redlineRpm: number;
  gear: number; // 0 = R, 1..6 = forward
  nos: number; // 0..100
  isNosActive: boolean;
  isDrifting: boolean;
  driftScore: number;
  activeDriftPoints: number;
  position: number;
  totalRacers: number;
  lap: number;
  totalLaps: number;
  raceTimeMs: number;
  currentLapTimeMs: number;
  bestLapTimeMs: number | null;
  topSpeedKmh: number;
  countdownValue: number; // 3, 2, 1, -1 (active)
  racePhase: 'garage' | 'countdown' | 'racing' | 'paused' | 'finished' | 'replay';
  racers: RacerTelemetry[];
  wrongWay: boolean;
  weather: WeatherType;
  gripMultiplier: number;
  replayCurrentMs: number;
  replayDurationMs: number;
  replayPaused: boolean;
  replaySpeed: 0.5 | 1 | 2;
}

export interface ReplayVehicleSample {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  steerAngle: number;
  pitchRad: number;
  rollRad: number;
  wheelSpinAngle: number;
  speedKmh: number;
  forwardSpeed: number;
  lateralSpeed: number;
  rpm: number;
  gear: number;
  nos: number;
  nosActive: boolean;
  brakeIntensity: number;
  isDrifting: boolean;
  driftIntensity: number;
}

export interface ReplayFrame {
  timeMs: number;
  vehicles: ReplayVehicleSample[];
}

export interface RaceResult {
  trackId: TrackId;
  trackName: string;
  position: number;
  totalRacers: number;
  totalTimeMs: number;
  bestLapMs: number | null;
  lapsCompleted: number;
  topSpeedKmh: number;
  totalDriftScore: number;
  carName: string;
  mode: RaceMode;
}

export interface LeaderboardEntry {
  id: string;
  trackId: TrackId;
  driverName: string;
  userId?: string;
  handle?: string;
  carId: CarId;
  carName: string;
  bestLapMs: number | null;
  driftScore: number;
  topSpeedKmh: number;
  mode: RaceMode;
  recordedAt: string;
}

export interface TrackLeaderboard {
  topLaps: LeaderboardEntry[];
  topDrifts: LeaderboardEntry[];
}

export type DailyChallengeId =
  | 'drift_5000'
  | 'sprint_3_laps_2m'
  | 'speed_300'
  | 'win_race'
  | 'hot_lap_40s';

export interface DailyChallengeDefinition {
  id: DailyChallengeId;
  title: string;
  description: string;
  target: number;
  unitLabel: string;
  rewardPaintId: string;
}

export interface DailyChallengeProgress {
  id: DailyChallengeId;
  progress: number;
  completed: boolean;
  completedAt: string | null;
  bestMetricLabel?: string;
}

export interface DailyChallengeState {
  dateKey: string;
  activeIds: DailyChallengeId[];
  items: Record<DailyChallengeId, DailyChallengeProgress>;
}

export interface ChallengeEvalResult {
  state: DailyChallengeState;
  unlockedPaints: string[];
  newlyCompleted: DailyChallengeDefinition[];
  newlyUnlockedPaints: PaintOption[];
}

export type RoomScope = 'online' | 'wifi';

export interface LobbyPlayer {
  id: string;
  userId?: string;
  handle?: string;
  name: string;
  carId: CarId;
  paintId: string;
  underglowId: string;
  ready: boolean;
  isHost: boolean;
  gridSlot: number;
}

export interface LobbyRoomSummary {
  code: string;
  scope: RoomScope;
  trackId: TrackId;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  status: 'lobby' | 'countdown' | 'racing' | 'finished';
}

export interface LobbyRoomState {
  code: string;
  scope: RoomScope;
  trackId: TrackId;
  totalLaps: number;
  hostId: string;
  status: 'lobby' | 'countdown' | 'racing' | 'finished';
  players: LobbyPlayer[];
  raceStartServerMs: number;
}

export interface RemoteTelemetryPacket {
  playerId: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  steerAngle: number;
  pitchRad: number;
  rollRad: number;
  wheelSpinAngle: number;
  speedKmh: number;
  forwardSpeed: number;
  nosActive: boolean;
  brakeIntensity: number;
  isDrifting: boolean;
  driftIntensity: number;
  lap: number;
  trackProgress: number;
  totalProgress: number;
  finished: boolean;
  finishTimeMs: number;
  seq: number;
}

export interface NetworkInfo {
  lanUrls: string[];
  port: number;
  sameNetworkAvailable: boolean;
}

export interface DriverStats {
  racesCompleted: number;
  wins: number;
  bestDriftScore: number;
  bestLapMs: number | null;
  topSpeedKmh: number;
}

export interface PublicDriverProfile {
  userId: string;
  handle: string;
  displayName: string;
  bio: string;
  region: string;
  favoriteCarId: CarId;
  paintId: string;
  isOnline: boolean;
  activeSocketId: string | null;
  activity: 'garage' | 'lobby' | 'racing' | 'offline';
  stats: DriverStats;
  joinedAt: string;
}

export interface AuthSession {
  token: string;
  profile: PublicDriverProfile;
}

export interface RaceInvite {
  inviteId: string;
  fromUserId: string;
  fromSocketId: string;
  fromHandle: string;
  fromDisplayName: string;
  fromCarId: CarId;
  trackId: TrackId;
  scope: RoomScope;
  createdAtMs: number;
}



