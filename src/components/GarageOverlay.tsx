import React, { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Cpu,
  Download,
  Globe,
  Lock,
  Maximize2,
  Sparkles,
  Target,
  Trophy,
  User,
  Users,
  Volume2,
  VolumeX,
  Wifi,
} from 'lucide-react';
import { CARS, PAINTS, UNDERGLOWS } from '../game/cars';
import {
  DAILY_CHALLENGES,
  getTimeUntilDailyResetLabel,
  isPaintUnlocked,
} from '../game/challenges';
import { getTrackLeaderboard } from '../game/leaderboard';
import { TRACKS } from '../game/track';
import {
  AuthSession,
  CarId,
  ControlScheme,
  DailyChallengeState,
  OpponentMode,
  RaceMode,
  RoomScope,
  TrackId,
} from '../game/types';
import { formatTimeMs } from '../utils/format';

interface GarageOverlayProps {
  selectedCarId: CarId;
  selectedTrackId: TrackId;
  selectedPaintId: string;
  selectedUnderglowId: string;
  raceMode: RaceMode;
  opponentMode: OpponentMode;
  controlScheme: ControlScheme;
  muted: boolean;
  dailyState: DailyChallengeState;
  unlockedPaintIds: string[];
  authSession: AuthSession | null;
  onlineDriversCount: number;
  onSelectCar: (id: CarId) => void;
  onSelectTrack: (id: TrackId) => void;
  onSelectPaint: (id: string) => void;
  onSelectUnderglow: (id: string) => void;
  onSelectMode: (mode: RaceMode) => void;
  onSelectOpponentMode: (mode: OpponentMode) => void;
  onSelectControlScheme: (scheme: ControlScheme) => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onOpenLeaderboard: () => void;
  onOpenMultiplayerLobby: (scope: RoomScope) => void;
  onOpenAuthProfile: (tab: 'account' | 'directory') => void;
  onStartRace: () => void;
}

type GarageTab = 'vehicle' | 'track' | 'style' | 'challenges' | 'setup';

export const GarageOverlay: React.FC<GarageOverlayProps> = ({
  selectedCarId,
  selectedTrackId,
  selectedPaintId,
  selectedUnderglowId,
  raceMode,
  opponentMode,
  controlScheme,
  muted,
  dailyState,
  unlockedPaintIds,
  authSession,
  onlineDriversCount,
  onSelectCar,
  onSelectTrack,
  onSelectPaint,
  onSelectUnderglow,
  onSelectMode,
  onSelectOpponentMode,
  onSelectControlScheme,
  onToggleMute,
  onToggleFullscreen,
  onOpenLeaderboard,
  onOpenMultiplayerLobby,
  onOpenAuthProfile,
  onStartRace,
}) => {
  const [tab, setTab] = useState<GarageTab>('vehicle');
  const [collapsed, setCollapsed] = useState(false);
  const [lockedHint, setLockedHint] = useState<string | null>(null);

  const activeCar = CARS.find((c) => c.id === selectedCarId) ?? CARS[0];
  const activeTrack = TRACKS.find((t) => t.id === selectedTrackId) ?? TRACKS[0];

  const standardPaints = PAINTS.filter((p) => !p.unlockChallengeId);
  const exclusivePaints = PAINTS.filter((p) => Boolean(p.unlockChallengeId));

  const completedTodayCount = dailyState.activeIds.filter(
    (id) => dailyState.items[id]?.completed
  ).length;
  const resetLabel = getTimeUntilDailyResetLabel();

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-3 sm:p-6">
      {/* Minimal Top Bar */}
      <header className="pointer-events-auto flex items-center justify-between gap-2 sm:gap-3">
        <div className="bg-[#0B0F19]/88 border border-white/10 rounded-xl px-3.5 sm:px-4 py-2.5 flex items-center gap-3 sm:gap-4 min-w-0">
          <h1 className="font-display text-base sm:text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0">
            Apex Velocity
          </h1>
          <span className="hidden md:inline text-xs text-slate-400 whitespace-nowrap truncate">
            {activeTrack.name} · {activeCar.name}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onOpenAuthProfile('account')}
            className={`min-h-[44px] px-3 sm:px-3.5 rounded-xl bg-[#0B0F19]/88 border flex items-center gap-1.5 sm:gap-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              authSession
                ? 'border-emerald-400/45 text-emerald-300 hover:text-emerald-200'
                : 'border-amber-500/45 text-amber-300 hover:text-amber-200'
            }`}
          >
            <User className="w-4 h-4 shrink-0" />
            <span className="max-w-[92px] truncate">
              {authSession ? `@${authSession.profile.handle}` : 'Sign In'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onOpenAuthProfile('directory')}
            className="min-h-[44px] px-3 sm:px-3.5 rounded-xl bg-[#0B0F19]/88 border border-cyan-500/35 text-cyan-300 hover:text-cyan-200 flex items-center gap-1.5 sm:gap-2 text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <Users className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Drivers</span>
            <span className="font-telemetry text-[11px] text-white bg-cyan-500/20 px-1.5 py-0.5 rounded">
              {onlineDriversCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('challenges');
              setCollapsed(false);
            }}
            className="min-h-[44px] px-3 sm:px-3.5 rounded-xl bg-[#0B0F19]/88 border border-white/10 text-cyan-300 hover:text-cyan-200 flex items-center gap-1.5 sm:gap-2 text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <Target className="w-4 h-4 shrink-0" />
            <span className="hidden md:inline">Daily</span>
            <span className="font-telemetry text-[11px] text-white bg-cyan-500/20 px-1.5 py-0.5 rounded">
              {completedTodayCount}/{dailyState.activeIds.length}
            </span>
          </button>
          <button
            type="button"
            onClick={onOpenLeaderboard}
            className="min-h-[44px] px-3 sm:px-3.5 rounded-xl bg-[#0B0F19]/88 border border-white/10 text-amber-400 hover:text-amber-300 flex items-center gap-1.5 sm:gap-2 text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <Trophy className="w-4 h-4 shrink-0" />
            <span className="hidden md:inline">Records</span>
          </button>
          <a
            href="/apex-velocity-source.zip"
            download="apex-velocity-source.zip"
            aria-label="Download zipped source files"
            title="Download Source ZIP"
            className="min-h-[44px] px-3 rounded-xl bg-[#0B0F19]/88 border border-white/10 text-slate-200 hover:text-white flex items-center gap-2 text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span className="hidden lg:inline">ZIP</span>
          </a>
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            className="min-h-[44px] min-w-[44px] rounded-xl bg-[#0B0F19]/88 border border-white/10 text-slate-200 hover:text-white flex items-center justify-center transition-colors"
          >
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <button
            type="button"
            onClick={onToggleFullscreen}
            aria-label="Toggle fullscreen"
            className="min-h-[44px] min-w-[44px] rounded-xl bg-[#0B0F19]/88 border border-white/10 text-slate-200 hover:text-white flex items-center justify-center transition-colors"
          >
            <Maximize2 className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Collapsible Bottom Garage Dock */}
      <div className="pointer-events-auto mx-auto w-full max-w-[960px] flex flex-col items-center">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="mb-1.5 min-h-[36px] px-4 py-1.5 rounded-t-xl bg-[#0B0F19]/90 border border-b-0 border-white/12 text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1.5 whitespace-nowrap"
        >
          {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          <span>{collapsed ? 'Show Garage' : 'Hide Garage'}</span>
        </button>

        {!collapsed && (
          <div className="w-full max-h-[68vh] overflow-y-auto bg-[#0B0F19]/92 border border-white/12 rounded-2xl p-3 sm:p-4 shadow-2xl">
            {/* Race Type Bar: User vs Computer | User vs User Online | Same Wi-Fi */}
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2 pb-2.5 mb-2.5 border-b border-white/10">
              <button
                type="button"
                onClick={() => onSelectOpponentMode('computer')}
                className={`min-h-[44px] px-2.5 sm:px-3 py-1.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors ${
                  opponentMode === 'computer'
                    ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                    : 'bg-slate-900/70 border-white/8 text-slate-300 hover:border-white/20'
                }`}
              >
                <Cpu className="w-4 h-4 shrink-0" />
                <span className="truncate">VS Computer</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectOpponentMode('online');
                  onOpenMultiplayerLobby('online');
                }}
                className={`min-h-[44px] px-2.5 sm:px-3 py-1.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors ${
                  opponentMode === 'online'
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                    : 'bg-slate-900/70 border-white/8 text-slate-300 hover:border-white/20'
                }`}
              >
                <Globe className="w-4 h-4 shrink-0" />
                <span className="truncate">User vs User Online</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectOpponentMode('wifi');
                  onOpenMultiplayerLobby('wifi');
                }}
                className={`min-h-[44px] px-2.5 sm:px-3 py-1.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors ${
                  opponentMode === 'wifi'
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                    : 'bg-slate-900/70 border-white/8 text-slate-300 hover:border-white/20'
                }`}
              >
                <Wifi className="w-4 h-4 shrink-0" />
                <span className="truncate">Same Wi-Fi</span>
              </button>
            </div>

            {/* Top Row: Segmented Tabs + Primary CTA */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-white/10">
              <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-white/5 overflow-x-auto max-w-full">
                {(['vehicle', 'track', 'style', 'challenges', 'setup'] as GarageTab[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setTab(t);
                      setLockedHint(null);
                    }}
                    className={`min-h-[40px] px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                      tab === t
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <span>
                      {t === 'vehicle'
                        ? 'Vehicle'
                        : t === 'track'
                          ? 'Track'
                          : t === 'style'
                            ? 'Style'
                            : t === 'challenges'
                              ? 'Daily'
                              : 'Setup'}
                    </span>
                    {t === 'challenges' && (
                      <span
                        className={`font-telemetry text-[10px] px-1.5 py-0.2 rounded ${
                          tab === 'challenges'
                            ? 'bg-slate-950/20 text-slate-950'
                            : 'bg-cyan-500/20 text-cyan-300'
                        }`}
                      >
                        {completedTodayCount}/{dailyState.activeIds.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (opponentMode === 'computer') {
                    onStartRace();
                  } else {
                    onOpenMultiplayerLobby(opponentMode);
                  }
                }}
                className={`min-h-[46px] px-6 py-2.5 rounded-xl font-display font-bold text-sm tracking-wide transition-all whitespace-nowrap shrink-0 active:scale-[0.98] ${
                  opponentMode === 'online'
                    ? 'bg-cyan-400 hover:bg-cyan-300 text-slate-950'
                    : opponentMode === 'wifi'
                      ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                }`}
              >
                {opponentMode === 'online'
                  ? 'Open Online Lobby'
                  : opponentMode === 'wifi'
                    ? 'Open Wi-Fi Lobby'
                    : 'Start Race'}
              </button>
            </div>

            {/* Tab Content */}
            <div className="pt-3">
              {tab === 'vehicle' && (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 max-h-[240px] sm:max-h-[250px] overflow-y-auto pr-1">
                    {CARS.map((car) => {
                      const selected = car.id === selectedCarId;
                      return (
                        <button
                          key={car.id}
                          type="button"
                          onClick={() => onSelectCar(car.id)}
                          className={`text-left p-2.5 sm:p-3 rounded-xl border transition-colors min-h-[82px] ${
                            selected
                              ? 'bg-slate-800/95 border-amber-500/80'
                              : 'bg-slate-900/60 border-white/8 hover:border-white/20'
                          }`}
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-display font-bold text-sm text-white truncate">
                              {car.name}
                            </span>
                            <span className="font-telemetry text-xs text-amber-400 shrink-0">
                              {car.maxSpeedKmh} km/h
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                            {car.category}
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-x-2 text-[10px] text-slate-300">
                            <div>
                              <div className="flex justify-between mb-0.5">
                                <span>Spd</span>
                                <span className="font-telemetry">{car.stats.topSpeed}</span>
                              </div>
                              <div className="h-1 bg-slate-700 rounded-sm overflow-hidden">
                                <div className="h-full bg-amber-400" style={{ width: `${car.stats.topSpeed}%` }} />
                              </div>
                            </div>
                            <div>
                              <div className="flex justify-between mb-0.5">
                                <span>Acc</span>
                                <span className="font-telemetry">{car.stats.acceleration}</span>
                              </div>
                              <div className="h-1 bg-slate-700 rounded-sm overflow-hidden">
                                <div className="h-full bg-emerald-400" style={{ width: `${car.stats.acceleration}%` }} />
                              </div>
                            </div>
                            <div>
                              <div className="flex justify-between mb-0.5">
                                <span>Hnd</span>
                                <span className="font-telemetry">{car.stats.handling}</span>
                              </div>
                              <div className="h-1 bg-slate-700 rounded-sm overflow-hidden">
                                <div className="h-full bg-cyan-400" style={{ width: `${car.stats.handling}%` }} />
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="bg-slate-950/60 border border-white/8 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="text-slate-300 truncate">{activeCar.description}</span>
                    <span className="font-telemetry text-cyan-300 shrink-0">
                      Redline {activeCar.redlineRpm.toLocaleString()} RPM · {activeCar.mass} kg
                    </span>
                  </div>
                </div>
              )}

              {tab === 'track' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[250px] overflow-y-auto pr-1">
                  {TRACKS.map((trk) => {
                    const selected = trk.id === selectedTrackId;
                    const board = getTrackLeaderboard(trk.id);
                    const topLap = board.topLaps[0]?.bestLapMs ?? null;
                    const topDrift = board.topDrifts[0]?.driftScore ?? 0;

                    return (
                      <button
                        key={trk.id}
                        type="button"
                        onClick={() => onSelectTrack(trk.id)}
                        className={`text-left p-3 rounded-xl border transition-colors min-h-[88px] ${
                          selected
                            ? 'bg-slate-800/90 border-amber-500/80'
                            : 'bg-slate-900/60 border-white/8 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-display font-bold text-sm text-white truncate">
                            {trk.name}
                          </span>
                          <span className="font-telemetry text-xs text-slate-300 shrink-0">
                            {trk.lengthLabel}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                          {trk.location} · {trk.difficulty}
                        </div>
                        <div className="mt-2.5 pt-2 border-t border-white/8 flex items-center justify-between text-[11px] font-telemetry">
                          <span className="text-cyan-400">
                            Lap {formatTimeMs(topLap)}
                          </span>
                          <span className="text-amber-400">
                            Drift {topDrift > 0 ? topDrift.toLocaleString() : '--'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {tab === 'style' && (
                <div className="space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-semibold text-slate-300 mb-2">
                        Factory Finishes
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {standardPaints.map((p) => {
                          const active = p.id === selectedPaintId;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setLockedHint(null);
                                onSelectPaint(p.id);
                              }}
                              title={p.name}
                              className={`min-h-[44px] px-3 rounded-xl border flex items-center gap-2 text-xs font-medium transition-colors ${
                                active
                                  ? 'bg-slate-800 border-amber-400 text-white'
                                  : 'bg-slate-900/60 border-white/10 text-slate-300 hover:border-white/25'
                              }`}
                            >
                              <span
                                className="w-4 h-4 rounded-sm border border-white/25 shrink-0"
                                style={{ backgroundColor: p.hex }}
                              />
                              <span className="whitespace-nowrap">{p.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-slate-300 mb-2">
                        Underglow Accent
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {UNDERGLOWS.map((u) => {
                          const active = u.id === selectedUnderglowId;
                          return (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => onSelectUnderglow(u.id)}
                              className={`min-h-[44px] px-3 rounded-xl border flex items-center gap-2 text-xs font-medium transition-colors ${
                                active
                                  ? 'bg-slate-800 border-cyan-400 text-white'
                                  : 'bg-slate-900/60 border-white/10 text-slate-300 hover:border-white/25'
                              }`}
                            >
                              <span
                                className="w-3.5 h-3.5 rounded-sm border border-white/25 shrink-0"
                                style={{
                                  backgroundColor: u.hex === '#000000' ? '#1E293B' : u.hex,
                                }}
                              />
                              <span className="whitespace-nowrap">{u.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Exclusive Challenge Reward Finishes */}
                  <div className="pt-2.5 border-t border-white/10">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Exclusive Challenge Finishes</span>
                      </div>
                      {lockedHint && (
                        <span className="text-[11px] text-amber-300 truncate">{lockedHint}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {exclusivePaints.map((p) => {
                        const unlocked = isPaintUnlocked(p, unlockedPaintIds);
                        const active = p.id === selectedPaintId && unlocked;
                        const challenge = p.unlockChallengeId
                          ? DAILY_CHALLENGES[p.unlockChallengeId]
                          : null;
                        const activeToday = p.unlockChallengeId
                          ? dailyState.activeIds.includes(p.unlockChallengeId)
                          : false;

                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              if (unlocked) {
                                setLockedHint(null);
                                onSelectPaint(p.id);
                              } else if (challenge) {
                                setLockedHint(
                                  activeToday
                                    ? `Complete today's goal: ${challenge.title}`
                                    : `Rotating Daily Challenge: ${challenge.title}`
                                );
                              }
                            }}
                            title={
                              unlocked
                                ? p.name
                                : `Locked — ${challenge?.title ?? 'Daily Challenge'}`
                            }
                            className={`min-h-[44px] px-3 rounded-xl border flex items-center gap-2 text-xs font-medium transition-colors ${
                              active
                                ? 'bg-slate-800 border-cyan-400 text-white'
                                : unlocked
                                  ? 'bg-slate-900/70 border-cyan-500/35 text-slate-200 hover:border-cyan-400/70'
                                  : 'bg-slate-950/70 border-white/8 text-slate-400 hover:border-white/20'
                            }`}
                          >
                            <span
                              className={`w-4 h-4 rounded-sm border shrink-0 relative ${
                                unlocked ? 'border-white/40' : 'border-white/15 opacity-55'
                              }`}
                              style={{
                                background: p.iridescence
                                  ? `linear-gradient(135deg, ${p.hex}, #E0F2FE)`
                                  : p.hex,
                              }}
                            />
                            <span className="whitespace-nowrap">{p.name}</span>
                            {!unlocked && <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {tab === 'challenges' && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Complete daily goals to permanently unlock exclusive metallic &amp; iridescent garage colors.</span>
                    <span className="font-telemetry text-slate-300 shrink-0 ml-2">
                      Resets in {resetLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                    {dailyState.activeIds.map((challengeId) => {
                      const def = DAILY_CHALLENGES[challengeId];
                      const prog = dailyState.items[challengeId];
                      const rewardPaint = PAINTS.find((p) => p.id === def.rewardPaintId);
                      const unlocked = rewardPaint
                        ? isPaintUnlocked(rewardPaint, unlockedPaintIds)
                        : Boolean(prog?.completed);
                      const isEquipped = rewardPaint?.id === selectedPaintId;
                      const pct = prog?.completed
                        ? 100
                        : Math.min(100, Math.round(((prog?.progress ?? 0) / def.target) * 100));

                      return (
                        <div
                          key={def.id}
                          className={`p-3 rounded-xl border flex flex-col justify-between gap-2.5 ${
                            prog?.completed
                              ? 'bg-emerald-950/25 border-emerald-500/45'
                              : 'bg-slate-900/70 border-white/10'
                          }`}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-display font-bold text-sm text-white leading-snug">
                                {def.title}
                              </span>
                              {prog?.completed ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 shrink-0">
                                  <Check className="w-3.5 h-3.5" />
                                  Done
                                </span>
                              ) : (
                                <span className="font-telemetry text-[11px] text-amber-400 shrink-0">
                                  {pct}%
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                              {def.description}
                            </p>

                            {/* Progress bar */}
                            <div className="mt-2.5">
                              <div className="flex items-center justify-between text-[10px] font-telemetry text-slate-300 mb-1">
                                <span>
                                  {def.id === 'drift_5000'
                                    ? `${(prog?.progress ?? 0).toLocaleString()} / ${def.target.toLocaleString()} pts`
                                    : def.id === 'speed_300'
                                      ? `${prog?.progress ?? 0} / ${def.target} km/h`
                                      : prog?.completed
                                        ? 'Completed'
                                        : `${prog?.progress ?? 0} / ${def.target} ${def.unitLabel}`}
                                </span>
                                {prog?.bestMetricLabel && (
                                  <span className="text-cyan-300 truncate ml-2">
                                    {prog.bestMetricLabel}
                                  </span>
                                )}
                              </div>
                              <div className="h-1.5 bg-slate-800 rounded-sm overflow-hidden">
                                <div
                                  className={`h-full transition-all ${
                                    prog?.completed ? 'bg-emerald-400' : 'bg-amber-400'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Reward Paint Footer */}
                          {rewardPaint && (
                            <div className="pt-2 border-t border-white/8 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="w-4 h-4 rounded-sm border border-white/30 shrink-0"
                                  style={{
                                    background: rewardPaint.iridescence
                                      ? `linear-gradient(135deg, ${rewardPaint.hex}, #E0F2FE)`
                                      : rewardPaint.hex,
                                  }}
                                />
                                <span className="text-xs font-medium text-slate-200 truncate">
                                  {rewardPaint.name}
                                </span>
                              </div>
                              {unlocked ? (
                                <button
                                  type="button"
                                  onClick={() => onSelectPaint(rewardPaint.id)}
                                  className={`min-h-[32px] px-2.5 rounded-lg text-[11px] font-semibold transition-colors shrink-0 ${
                                    isEquipped
                                      ? 'bg-cyan-500/25 border border-cyan-400/50 text-cyan-200'
                                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                                  }`}
                                >
                                  {isEquipped ? 'Equipped' : 'Equip'}
                                </button>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 shrink-0">
                                  <Lock className="w-3 h-3" />
                                  Reward
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {tab === 'setup' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-semibold text-slate-300 mb-2">
                      Solo Event Format (VS Computer)
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectOpponentMode('computer');
                          onSelectMode('circuit');
                        }}
                        className={`flex-1 min-h-[48px] px-3 py-2 rounded-xl border text-left transition-colors ${
                          opponentMode === 'computer' && raceMode === 'circuit'
                            ? 'bg-slate-800 border-amber-400 text-white'
                            : 'bg-slate-900/60 border-white/10 text-slate-300'
                        }`}
                      >
                        <div className="text-xs font-bold">3-Lap Street Race</div>
                        <div className="text-[11px] text-slate-400">Battle 3 computer rivals</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectOpponentMode('computer');
                          onSelectMode('time_attack');
                        }}
                        className={`flex-1 min-h-[48px] px-3 py-2 rounded-xl border text-left transition-colors ${
                          opponentMode === 'computer' && raceMode === 'time_attack'
                            ? 'bg-slate-800 border-amber-400 text-white'
                            : 'bg-slate-900/60 border-white/10 text-slate-300'
                        }`}
                      >
                        <div className="text-xs font-bold">Free Run &amp; Drift</div>
                        <div className="text-[11px] text-slate-400">Solo time attack</div>
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-slate-300 mb-2">
                      Android Steering Input
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectControlScheme('buttons')}
                        className={`flex-1 min-h-[48px] px-3 py-2 rounded-xl border text-left transition-colors ${
                          controlScheme === 'buttons'
                            ? 'bg-slate-800 border-cyan-400 text-white'
                            : 'bg-slate-900/60 border-white/10 text-slate-300'
                        }`}
                      >
                        <div className="text-xs font-bold">Touch Paddles</div>
                        <div className="text-[11px] text-slate-400">Left / Right thumb buttons</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectControlScheme('tilt')}
                        className={`flex-1 min-h-[48px] px-3 py-2 rounded-xl border text-left transition-colors ${
                          controlScheme === 'tilt'
                            ? 'bg-slate-800 border-cyan-400 text-white'
                            : 'bg-slate-900/60 border-white/10 text-slate-300'
                        }`}
                      >
                        <div className="text-xs font-bold">Tilt Gyroscope</div>
                        <div className="text-[11px] text-slate-400">Steer by tilting phone</div>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
