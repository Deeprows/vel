import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Gamepad2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Trophy,
  Flag,
  Film,
  Sparkles,
  Globe,
  Wifi,
  Check,
  X,
  Swords,
  CloudRain,
  CloudFog,
} from 'lucide-react';
import { RacingGameEngine } from './game/engine';
import { CARS, PAINTS, UNDERGLOWS } from './game/cars';
import { TRACKS } from './game/track';
import {
  defaultAuthConnector,
  submitGlobalLeaderboard,
} from './game/auth';
import {
  evaluateRaceForDailyChallenges,
  getDailyChallengeState,
  getUnlockedPaintIds,
} from './game/challenges';
import {
  getSavedDriverName,
  recordSessionScore,
  saveDriverName,
  SaveScoreResult,
} from './game/leaderboard';
import { ConnectionStatus, MultiplayerClient } from './game/multiplayer';
import {
  AuthSession,
  CameraMode,
  CarId,
  ChallengeEvalResult,
  ControlScheme,
  DailyChallengeState,
  HudTelemetry,
  LobbyRoomState,
  LobbyRoomSummary,
  NetworkInfo,
  OpponentMode,
  PublicDriverProfile,
  RaceInvite,
  RaceMode,
  RaceResult,
  RoomScope,
  TrackId,
} from './game/types';
import { AuthProfileModal } from './components/AuthProfileModal';
import { GarageOverlay } from './components/GarageOverlay';
import { LeaderboardModal } from './components/LeaderboardModal';
import { MultiplayerLobbyModal } from './components/MultiplayerLobbyModal';
import { ReplayControls } from './components/ReplayControls';
import { Tachometer } from './components/Tachometer';
import { Minimap } from './components/Minimap';
import { TouchControls, TouchInputValues } from './components/TouchControls';
import { UserProfileModal } from './components/UserProfileModal';
import { formatTimeMs, ordinal } from './utils/format';

const INITIAL_HUD: HudTelemetry = {
  speedKmh: 0,
  rpm: 950,
  redlineRpm: 8200,
  gear: 1,
  nos: 100,
  isNosActive: false,
  isDrifting: false,
  driftScore: 0,
  activeDriftPoints: 0,
  position: 1,
  totalRacers: 1,
  lap: 1,
  totalLaps: 3,
  raceTimeMs: 0,
  currentLapTimeMs: 0,
  bestLapTimeMs: null,
  topSpeedKmh: 0,
  countdownValue: -1,
  racePhase: 'garage',
  racers: [],
  wrongWay: false,
  weather: 'clear',
  gripMultiplier: 1,
  replayCurrentMs: 0,
  replayDurationMs: 0,
  replayPaused: false,
  replaySpeed: 1,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<RacingGameEngine | null>(null);

  const [selectedCarId, setSelectedCarId] = useState<CarId>('diablo_sv');
  const [selectedTrackId, setSelectedTrackId] = useState<TrackId>('midnight_bay');
  const [selectedPaintId, setSelectedPaintId] = useState<string>(PAINTS[0].id);
  const [selectedUnderglowId, setSelectedUnderglowId] = useState<string>(UNDERGLOWS[0].id);
  const [raceMode, setRaceMode] = useState<RaceMode>('circuit');
  const [opponentMode, setOpponentMode] = useState<OpponentMode>('computer');
  const [lobbyScope, setLobbyScope] = useState<RoomScope>('online');
  const [showLobby, setShowLobby] = useState(false);
  const [mpMenuOpen, setMpMenuOpen] = useState(false);
  const [controlScheme, setControlScheme] = useState<ControlScheme>('buttons');
  const [driverName, setDriverName] = useState<string>(() => getSavedDriverName());
  const [muted, setMuted] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>('chase');
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showTouchPad, setShowTouchPad] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth < 1024;
  });

  const [hud, setHud] = useState<HudTelemetry>(INITIAL_HUD);
  const [minimapPoints, setMinimapPoints] = useState<{ x: number; y: number }[]>([]);
  const [raceResult, setRaceResult] = useState<RaceResult | null>(null);
  const [savedScoreInfo, setSavedScoreInfo] = useState<SaveScoreResult | null>(null);
  const [dailyState, setDailyState] = useState<DailyChallengeState>(() => getDailyChallengeState());
  const [unlockedPaintIds, setUnlockedPaintIds] = useState<string[]>(() => getUnlockedPaintIds());
  const [challengeRewardInfo, setChallengeRewardInfo] = useState<ChallengeEvalResult | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [tiltDeg, setTiltDeg] = useState(0);

  // Landscape Orientation Enforcement & Portrait Detection
  const [isPortrait, setIsPortrait] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerHeight > window.innerWidth;
  });
  const [dismissPortraitWarning, setDismissPortraitWarning] = useState(false);

  // Real-time multiplayer & Same Wi-Fi state
  const mpClientRef = useRef<MultiplayerClient | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [directPeerCount, setDirectPeerCount] = useState(0);
  const [lobbyRoom, setLobbyRoom] = useState<LobbyRoomState | null>(null);
  const [localPlayerId, setLocalPlayerId] = useState('');
  const [availableRooms, setAvailableRooms] = useState<LobbyRoomSummary[]>([]);
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [lobbyError, setLobbyError] = useState<string | null>(null);

  // Driver Profiles, Auth & Head-to-Head Race Invites
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [driverProfiles, setDriverProfiles] = useState<PublicDriverProfile[]>([]);
  const [authModalTab, setAuthModalTab] = useState<'account' | 'directory' | null>(null);
  const [inspectedProfile, setInspectedProfile] = useState<PublicDriverProfile | null>(null);
  const [incomingInvite, setIncomingInvite] = useState<RaceInvite | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);

  // Refs so callbacks inside WebGL loop always access latest driver/car IDs
  const selectedCarIdRef = useRef<CarId>(selectedCarId);
  selectedCarIdRef.current = selectedCarId;
  const driverNameRef = useRef<string>(driverName);
  driverNameRef.current = driverName;
  const authTokenRef = useRef<string | null>(null);
  authTokenRef.current = authSession?.token ?? null;
  const prevRoomCodeRef = useRef<string | null>(null);

  // Combined input state refs (Keyboard + Multi-touch + Android Gyro)
  const keysRef = useRef<Record<string, boolean>>({});
  const touchRef = useRef<TouchInputValues>({
    left: false,
    right: false,
    gas: false,
    brake: false,
    handbrake: false,
    nos: false,
  });
  const tiltSteerRef = useRef(0);
  const controlSchemeRef = useRef<ControlScheme>(controlScheme);
  controlSchemeRef.current = controlScheme;

  const pushMergedInput = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const keys = keysRef.current;
    const t = touchRef.current;

    const kGas = keys['KeyW'] || keys['ArrowUp'];
    const kBrake = keys['KeyS'] || keys['ArrowDown'];
    const kLeft = keys['KeyA'] || keys['ArrowLeft'];
    const kRight = keys['KeyD'] || keys['ArrowRight'];
    const kHandbrake = keys['Space'];
    const kNos = keys['ShiftLeft'] || keys['ShiftRight'] || keys['KeyN'];

    const throttle = kGas || t.gas ? 1 : 0;
    const brake = kBrake || t.brake ? 1 : 0;

    let steer = 0;
    if (t.steer !== undefined && Math.abs(t.steer) > 0.001) {
      steer = t.steer;
    } else {
      if (kLeft || t.left) steer += 0.75;
      if (kRight || t.right) steer -= 0.75;
    }

    if (steer === 0 && controlSchemeRef.current === 'tilt') {
      steer = tiltSteerRef.current;
    }

    engine.setInput({
      throttle,
      brake,
      steer,
      handbrake: Boolean(kHandbrake || t.handbrake),
      nos: Boolean(kNos || t.nos),
    });
  }, []);

  // Initialize Three.js WebGL engine + Real-Time Multiplayer Client once
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const mp = new MultiplayerClient();
    mpClientRef.current = mp;

    const engine = new RacingGameEngine(container, {
      onTelemetry: (t) => setHud(t),
      onRaceFinish: (res) => {
        const saved = recordSessionScore({
          trackId: res.trackId,
          driverName: driverNameRef.current,
          carId: selectedCarIdRef.current,
          carName: res.carName,
          bestLapMs: res.bestLapMs,
          driftScore: res.totalDriftScore,
          topSpeedKmh: res.topSpeedKmh,
          mode: res.mode,
        });
        submitGlobalLeaderboard(
          {
            trackId: res.trackId,
            driverName: driverNameRef.current,
            carId: selectedCarIdRef.current,
            carName: res.carName,
            bestLapMs: res.bestLapMs,
            driftScore: res.totalDriftScore,
            topSpeedKmh: res.topSpeedKmh,
            position: res.position,
            mode: res.mode,
          },
          authTokenRef.current
        ).then((globalRes) => {
          if (globalRes?.profile) {
            setAuthSession((prev) =>
              prev ? { ...prev, profile: globalRes.profile! } : prev
            );
          }
        });
        const challengeEval = evaluateRaceForDailyChallenges(res);
        setDailyState(challengeEval.state);
        setUnlockedPaintIds(challengeEval.unlockedPaints);
        setChallengeRewardInfo(challengeEval);
        setSavedScoreInfo(saved);
        setRaceResult(res);
        setMpMenuOpen(false);
      },
      onContextLost: (lost) => setContextLost(lost),
      onMultiplayerTelemetry: (packet) => {
        mp.sendTelemetry(packet);
      },
    });
    engineRef.current = engine;
    setMinimapPoints(engine.getMinimapPoints());

    const refreshDirectory = () => {
      defaultAuthConnector.fetchProfiles().then(setDriverProfiles);
    };

    mp.setCallbacks({
      onConnectionChange: (status, ping) => {
        setConnectionStatus(status);
        setPingMs(ping);
      },
      onWelcome: (playerId) => {
        setLocalPlayerId(playerId);
      },
      onRoomUpdate: (room) => {
        const prevCode = prevRoomCodeRef.current;
        prevRoomCodeRef.current = room?.code ?? null;
        setLobbyRoom(room);
        setLobbyError(null);
        if (room) {
          setSelectedTrackId(room.trackId);
          const trackRes = engine.setTrack(room.trackId);
          setMinimapPoints(trackRes.minimapPoints);

          // Automatically open multiplayer lobby when matched via accepted 1v1 challenge
          if (!prevCode && room.players.length >= 2) {
            setOpponentMode(room.scope);
            setLobbyScope(room.scope);
            setInspectedProfile(null);
            setAuthModalTab(null);
            setShowLeaderboard(false);
            setShowLobby(true);
            if (room.scope === 'wifi') {
              mp.fetchNetworkInfo().then((info) => {
                if (info) setNetworkInfo(info);
              });
            }
          }
        }
      },
      onRoomError: (message) => {
        setLobbyError(message);
        setInviteFeedback(message);
      },
      onDirectoryUpdated: () => {
        refreshDirectory();
      },
      onInviteReceived: (invite) => {
        setIncomingInvite(invite);
      },
      onInviteStatus: (update) => {
        setInviteFeedback(update.message);
        setInviteNotice(update.message);
        window.setTimeout(() => setInviteNotice(null), 4000);
      },
      onRaceStart: (room, countdownMs) => {
        setShowLobby(false);
        setLobbyError(null);
        setRaceResult(null);
        setSavedScoreInfo(null);
        setChallengeRewardInfo(null);
        setMpMenuOpen(false);
        setRaceMode('circuit');
        setSelectedTrackId(room.trackId);
        const trackRes = engine.setTrack(room.trackId);
        setMinimapPoints(trackRes.minimapPoints);
        engine.startMultiplayerRace(room.players, mp.getLocalPlayerId(), room.trackId, countdownMs);
      },
      onRemoteTelemetry: (packet) => {
        engine.applyRemoteTelemetry(packet);
      },
      onP2PStatusChange: (count) => {
        setDirectPeerCount(count);
      },
    });

    mp.connect();
    refreshDirectory();

    // Auto-handle deep-link invites (?room=XXXXXX&mode=wifi|online)
    const params = new URLSearchParams(window.location.search);
    const inviteRoom = params.get('room');
    const inviteMode = params.get('mode');
    if (inviteRoom && inviteRoom.trim().length >= 4) {
      const scope: RoomScope = inviteMode === 'wifi' ? 'wifi' : 'online';
      setOpponentMode(scope);
      setLobbyScope(scope);
      setShowLobby(true);
      mp.fetchNetworkInfo().then((info) => {
        if (info) setNetworkInfo(info);
      });
      mp.joinRoom({
        code: inviteRoom.trim().toUpperCase(),
        driverName: driverNameRef.current,
        carId: selectedCarIdRef.current,
        paintId: selectedPaintId,
        underglowId: selectedUnderglowId,
      });
    }

    return () => {
      mp.disconnect();
      mpClientRef.current = null;
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Sync garage car & paint selection + lobby profile
  useEffect(() => {
    engineRef.current?.setGarageSelection(selectedCarId, selectedPaintId, selectedUnderglowId);
    if (lobbyRoom) {
      mpClientRef.current?.updateProfile({
        carId: selectedCarId,
        paintId: selectedPaintId,
        underglowId: selectedUnderglowId,
      });
    }
  }, [selectedCarId, selectedPaintId, selectedUnderglowId]);

  const handleSelectTrack = (trackId: TrackId) => {
    setSelectedTrackId(trackId);
    const res = engineRef.current?.setTrack(trackId);
    if (res) {
      setMinimapPoints(res.minimapPoints);
    }
  };

  const handleDriverNameChange = (name: string) => {
    setDriverName(name);
    saveDriverName(name);
    if (lobbyRoom) {
      mpClientRef.current?.updateProfile({ driverName: name });
    }
  };

  const handleSessionChange = useCallback((nextSession: AuthSession | null) => {
    setAuthSession(nextSession);
    mpClientRef.current?.bindAuth(nextSession?.token ?? null);
    if (nextSession) {
      setDriverName(nextSession.profile.displayName);
      saveDriverName(nextSession.profile.displayName);
      if (mpClientRef.current?.getCurrentRoom()) {
        mpClientRef.current.updateProfile({ driverName: nextSession.profile.displayName });
      }
    }
  }, []);

  const refreshDriverProfiles = useCallback(() => {
    defaultAuthConnector.fetchProfiles().then(setDriverProfiles);
  }, []);

  const handleInspectUserById = useCallback(
    async (userId: string) => {
      setInviteFeedback(null);
      const cached = driverProfiles.find((p) => p.userId === userId) ?? null;
      if (cached) setInspectedProfile(cached);
      const fresh = await defaultAuthConnector.fetchProfileById(userId);
      if (fresh) {
        setInspectedProfile(fresh);
      }
    },
    [driverProfiles]
  );

  const handleRequestRace = useCallback(
    (targetUserId: string, trackId: TrackId, scope: RoomScope) => {
      setInviteFeedback(null);
      mpClientRef.current?.requestRace({
        targetUserId,
        trackId,
        scope,
        carId: selectedCarIdRef.current,
      });
    },
    []
  );

  const handleRespondToInvite = useCallback(
    (accept: boolean) => {
      if (!incomingInvite) return;
      mpClientRef.current?.respondToInvite({
        inviteId: incomingInvite.inviteId,
        accept,
        driverName: driverNameRef.current,
        carId: selectedCarIdRef.current,
        paintId: selectedPaintId,
        underglowId: selectedUnderglowId,
      });
      setIncomingInvite(null);
    },
    [incomingInvite, selectedPaintId, selectedUnderglowId]
  );

  const handleRefreshRooms = useCallback(async () => {
    const mp = mpClientRef.current;
    if (!mp) return;
    const list = await mp.fetchRooms(lobbyScope);
    setAvailableRooms(list);
  }, [lobbyScope]);

  const handleOpenMultiplayerLobby = useCallback((scope: RoomScope) => {
    setLobbyScope(scope);
    setLobbyError(null);
    setShowLobby(true);
    const mp = mpClientRef.current;
    if (!mp) return;
    mp.connect();
    mp.fetchRooms(scope).then(setAvailableRooms);
    if (scope === 'wifi') {
      mp.fetchNetworkInfo().then((info) => {
        if (info) setNetworkInfo(info);
      });
    }
  }, []);

  // Keyboard Listeners (Desktop & Android external keyboard support)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      keysRef.current[e.code] = true;
      pushMergedInput();

      if (e.code === 'KeyC') {
        const next = engineRef.current?.cycleCamera();
        if (next) setCameraMode(next);
      } else if (e.code === 'KeyR') {
        engineRef.current?.resetCarToTrack();
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        engineRef.current?.togglePause();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
      pushMergedInput();
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [pushMergedInput]);

  // Android DeviceOrientation (Tilt Steering) Listener
  useEffect(() => {
    if (controlScheme !== 'tilt') {
      tiltSteerRef.current = 0;
      setTiltDeg(0);
      pushMergedInput();
      return;
    }

    const handleOrientation = (e: DeviceOrientationEvent) => {
      const isLandscape = window.innerWidth > window.innerHeight;
      let rawAngle = 0;
      if (isLandscape) {
        const angle = window.screen?.orientation?.angle ?? 0;
        const beta = e.beta ?? 0;
        rawAngle = angle === 270 ? -beta : beta;
      } else {
        rawAngle = e.gamma ?? 0;
      }

      const clamped = Math.max(-35, Math.min(35, rawAngle));
      setTiltDeg(clamped);

      const deadzone = 4;
      if (Math.abs(clamped) < deadzone) {
        tiltSteerRef.current = 0;
      } else {
        const norm = (Math.abs(clamped) - deadzone) / (32 - deadzone);
        tiltSteerRef.current = -Math.sign(clamped) * Math.min(1, norm);
      }
      pushMergedInput();
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [controlScheme, pushMergedInput]);

  // Monitor orientation changes and attempt landscape lock
  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    const tryLockLandscape = async () => {
      try {
        const orient = window.screen?.orientation as any;
        if (orient && typeof orient.lock === 'function') {
          await orient.lock('landscape');
        }
      } catch {}
    };
    tryLockLandscape();

    const onUserInteraction = () => {
      tryLockLandscape();
      window.removeEventListener('click', onUserInteraction);
      window.removeEventListener('touchstart', onUserInteraction);
    };
    window.addEventListener('click', onUserInteraction);
    window.addEventListener('touchstart', onUserInteraction);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
      window.removeEventListener('click', onUserInteraction);
      window.removeEventListener('touchstart', onUserInteraction);
    };
  }, []);

  const handleEnterLandscapeFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      }
      const orient = window.screen?.orientation as any;
      if (orient && typeof orient.lock === 'function') {
        await orient.lock('landscape');
      }
    } catch {}
    setIsPortrait(false);
  };

  const handleSelectControlScheme = async (scheme: ControlScheme) => {
    if (scheme === 'tilt') {
      const devOrient = DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      if (typeof devOrient?.requestPermission === 'function') {
        try {
          await devOrient.requestPermission();
        } catch {
          // Ignore denied permission
        }
      }
    }
    setControlScheme(scheme);
  };

  const handleToggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (!next) {
      engineRef.current?.unlockAudio();
    }
    engineRef.current?.setMuted(next);
  };

  const handleToggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen?.();
        const orient = window.screen?.orientation as any;
        if (orient && typeof orient.lock === 'function') {
          await orient.lock('landscape');
        }
      } catch {}
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const handleStartRace = () => {
    setRaceResult(null);
    setSavedScoreInfo(null);
    setChallengeRewardInfo(null);
    try {
      const orient = window.screen?.orientation as any;
      if (orient && typeof orient.lock === 'function') {
        orient.lock('landscape').catch(() => {});
      }
    } catch {}
    engineRef.current?.startRace(raceMode);
  };

  const handleTouchChange = (values: TouchInputValues) => {
    touchRef.current = values;
    pushMergedInput();
  };

  const handleFirstTouch = () => {
    engineRef.current?.unlockAudio();
  };

  const isInRace =
    hud.racePhase === 'countdown' ||
    hud.racePhase === 'racing' ||
    hud.racePhase === 'paused';

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#080B12]">
      {/* Isolated WebGL Viewport Container */}
      <div ref={canvasMountRef} className="absolute inset-0 w-full h-full" />

      {/* WebGL Context Lost Safety Banner */}
      {contextLost && (
        <div className="fixed inset-0 z-50 bg-[#080B12]/95 flex flex-col items-center justify-center p-6 text-center">
          <h2 className="font-display text-2xl font-bold text-white">Graphics Context Paused</h2>
          <p className="text-sm text-slate-400 mt-2 max-w-sm">
            The device GPU reset the WebGL viewport. Tap reload if rendering does not resume automatically.
          </p>
        </div>
      )}

      {/* Garage Hangar Overlay */}
      {hud.racePhase === 'garage' && (
        <GarageOverlay
          selectedCarId={selectedCarId}
          selectedTrackId={selectedTrackId}
          selectedPaintId={selectedPaintId}
          selectedUnderglowId={selectedUnderglowId}
          raceMode={raceMode}
          opponentMode={opponentMode}
          controlScheme={controlScheme}
          muted={muted}
          dailyState={dailyState}
          unlockedPaintIds={unlockedPaintIds}
          authSession={authSession}
          onlineDriversCount={driverProfiles.filter((p) => p.isOnline).length}
          onSelectCar={setSelectedCarId}
          onSelectTrack={handleSelectTrack}
          onSelectPaint={setSelectedPaintId}
          onSelectUnderglow={setSelectedUnderglowId}
          onSelectMode={setRaceMode}
          onSelectOpponentMode={setOpponentMode}
          onSelectControlScheme={handleSelectControlScheme}
          onToggleMute={handleToggleMute}
          onToggleFullscreen={handleToggleFullscreen}
          onOpenLeaderboard={() => setShowLeaderboard(true)}
          onOpenMultiplayerLobby={handleOpenMultiplayerLobby}
          onOpenAuthProfile={(t) => {
            refreshDriverProfiles();
            setAuthModalTab(t);
          }}
          onStartRace={handleStartRace}
        />
      )}

      {/* Incoming 1v1 Race Challenge Banner */}
      {incomingInvite && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-1.5rem)] max-w-md bg-slate-900 border border-amber-400/70 rounded-2xl p-3.5 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0">
                <Swords className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">
                  {incomingInvite.fromDisplayName} (@{incomingInvite.fromHandle}) challenged you!
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  {TRACKS.find((t) => t.id === incomingInvite.trackId)?.name ?? incomingInvite.trackId} ·{' '}
                  {incomingInvite.scope === 'wifi' ? 'Same Wi-Fi' : 'Online PvP'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleRespondToInvite(false)}
              aria-label="Decline race challenge"
              className="min-h-[34px] min-w-[34px] rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2.5">
            <button
              type="button"
              onClick={() => handleRespondToInvite(false)}
              className="min-h-[40px] rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-semibold text-slate-200"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => handleRespondToInvite(true)}
              className="min-h-[40px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Accept &amp; Enter Lobby</span>
            </button>
          </div>
        </div>
      )}

      {/* Race Invite Status Notice */}
      {inviteNotice && !incomingInvite && (
        <div className="pointer-events-none fixed top-20 left-1/2 -translate-x-1/2 z-[55] bg-slate-900 border border-cyan-400/50 rounded-xl px-4 py-2 text-xs font-semibold text-cyan-200 shadow-lg">
          {inviteNotice}
        </div>
      )}

      {/* Active Race HUD */}
      {isInRace && (
        <>
          {/* Top-Left: Position, Lap, Timers */}
          <div className="pointer-events-none fixed top-3 left-3 sm:top-5 sm:left-5 z-20 flex flex-col gap-2">
            <div className="bg-[#080B12]/85 border border-white/12 rounded-xl px-3.5 py-2 flex items-center gap-4">
              {raceMode === 'circuit' && (
                <div>
                  <div className="text-[10px] font-medium text-slate-400">Position</div>
                  <div className="font-display text-xl sm:text-2xl font-bold text-amber-400 leading-tight">
                    {ordinal(hud.position)}
                    <span className="text-xs text-slate-400 font-normal"> / {hud.totalRacers}</span>
                  </div>
                </div>
              )}

              <div>
                <div className="text-[10px] font-medium text-slate-400">
                  {raceMode === 'circuit' ? 'Lap' : 'Laps'}
                </div>
                <div className="font-telemetry text-lg sm:text-xl font-bold text-white leading-tight">
                  {hud.lap}
                  {raceMode === 'circuit' && (
                    <span className="text-xs text-slate-400 font-normal">/{hud.totalLaps}</span>
                  )}
                </div>
              </div>

              <div className="border-l border-white/10 pl-3">
                <div className="text-[10px] font-medium text-slate-400">Lap Time</div>
                <div className="font-telemetry text-sm sm:text-base font-bold text-white leading-tight">
                  {formatTimeMs(hud.currentLapTimeMs)}
                </div>
                {hud.bestLapTimeMs !== null && (
                  <div className="font-telemetry text-[10px] text-cyan-400">
                    Best {formatTimeMs(hud.bestLapTimeMs)}
                  </div>
                )}
              </div>
            </div>

            {/* Active Drift Score Toast */}
            {(hud.isDrifting || hud.activeDriftPoints > 0 || hud.driftScore > 0) && (
              <div className="bg-[#080B12]/82 border border-amber-500/35 rounded-lg px-3 py-1.5 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-amber-300">
                  {hud.activeDriftPoints > 0 ? 'Drift' : 'Drift Score'}
                </span>
                <span className="font-telemetry text-sm font-bold text-white">
                  {hud.activeDriftPoints > 0
                    ? `+${hud.activeDriftPoints}`
                    : hud.driftScore.toLocaleString()}
                </span>
              </div>
            )}
            {/* Dynamic Weather & Grip Telemetry */}
            {hud.weather !== 'clear' && (
              <div className="bg-[#080B12]/82 border border-white/12 rounded-lg px-3 py-1 flex items-center gap-2 text-[11px] font-semibold">
                {hud.weather === 'light_rain' ? (
                  <CloudRain className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                ) : (
                  <CloudFog className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                )}
                <span className="text-slate-100">
                  {hud.weather === 'light_rain' ? 'Light Rain' : 'Dense Fog'}
                </span>
                <span className="font-telemetry text-sky-300">
                  {Math.round(hud.gripMultiplier * 100)}% Grip
                </span>
              </div>
            )}
            {/* Multiplayer Live Connection Indicator */}
            {engineRef.current?.isMultiplayerSession() && lobbyRoom && (
              <div className="bg-[#080B12]/82 border border-cyan-500/35 rounded-lg px-3 py-1 flex items-center gap-2 text-[11px] font-semibold">
                {lobbyRoom.scope === 'wifi' ? (
                  <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                )}
                <span className="text-slate-200">
                  {lobbyRoom.scope === 'wifi'
                    ? directPeerCount > 0
                      ? 'Wi-Fi Direct P2P'
                      : 'Same Wi-Fi'
                    : 'Online PvP'}
                </span>
                {pingMs !== null && (
                  <span className="font-telemetry text-cyan-300">{pingMs}ms</span>
                )}
              </div>
            )}
          </div>

          {/* Top-Right: Mini-map + Tachometer + Quick Action Buttons */}
          <div className="fixed top-3 right-3 sm:top-5 sm:right-5 z-20 flex items-start gap-2">
            <div className="scale-[0.82] sm:scale-95 origin-top-right">
              <Tachometer
                speedKmh={hud.speedKmh}
                rpm={hud.rpm}
                redlineRpm={hud.redlineRpm}
                gear={hud.gear}
                nos={hud.nos}
                isNosActive={hud.isNosActive}
              />
            </div>
            <div>
              <Minimap trackPoints={minimapPoints} racers={hud.racers} />
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  if (engineRef.current?.isMultiplayerSession()) {
                    setMpMenuOpen((v) => !v);
                  } else {
                    engineRef.current?.togglePause();
                  }
                }}
                aria-label="Pause or race menu"
                className="min-h-[44px] min-w-[44px] rounded-xl bg-[#080B12]/85 border border-white/12 text-white flex items-center justify-center hover:bg-slate-800 transition-colors"
              >
                <Pause className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = engineRef.current?.cycleCamera();
                  if (next) setCameraMode(next);
                }}
                aria-label={`Switch camera (${cameraMode})`}
                title={`Camera: ${cameraMode}`}
                className="min-h-[44px] min-w-[44px] rounded-xl bg-[#080B12]/85 border border-white/12 text-slate-200 flex items-center justify-center hover:bg-slate-800 transition-colors"
              >
                <Camera className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setShowTouchPad((v) => !v)}
                aria-label="Toggle touch controls"
                title="Toggle Android Touch Pedals"
                className={`min-h-[44px] min-w-[44px] rounded-xl border flex items-center justify-center transition-colors ${
                  showTouchPad
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    : 'bg-[#080B12]/85 border-white/12 text-slate-300'
                }`}
              >
                <Gamepad2 className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Wrong Way Alert */}
          {hud.wrongWay && (
            <div className="pointer-events-none fixed top-24 left-1/2 -translate-x-1/2 z-30 bg-red-600/90 border border-red-300/40 rounded-xl px-5 py-2 flex items-center gap-3">
              <span className="font-display font-bold text-sm sm:text-base text-white tracking-wide">
                Wrong Way — Turn Around
              </span>
            </div>
          )}

          {/* Countdown Overlay */}
          {hud.racePhase === 'countdown' && (
            <div className="pointer-events-none fixed inset-0 z-20 flex flex-col items-center justify-center">
              <div className="font-display text-7xl sm:text-8xl font-bold text-amber-400 drop-shadow-[0_4px_24px_rgba(245,158,11,0.45)]">
                {hud.countdownValue}
              </div>
              <div className="text-xs sm:text-sm font-medium text-slate-200 mt-2 bg-[#080B12]/80 px-3 py-1 rounded-lg border border-white/10">
                Hold Gas to Rev · {CARS.find((c) => c.id === selectedCarId)?.name}
              </div>
            </div>
          )}



          {/* Desktop subtle keyboard hint when touch pedals are hidden */}
          {!showTouchPad && (
            <div className="pointer-events-none fixed bottom-4 left-5 z-10 hidden md:block text-xs text-slate-400 bg-[#080B12]/80 border border-white/10 rounded-lg px-3 py-1.5">
              WASD / Arrows Steer · Space Drift · Shift Nitrous · C Camera · R Reset
            </div>
          )}

          {/* Android Multi-Touch Pedals & Steering Overlay */}
          {showTouchPad && (
            <TouchControls
              controlScheme={controlScheme}
              nosAmount={hud.nos}
              tiltAngleDeg={tiltDeg}
              onChange={handleTouchChange}
              onFirstTouch={handleFirstTouch}
            />
          )}
        </>
      )}

      {/* Pause Modal */}
      {hud.racePhase === 'paused' && (
        <div className="fixed inset-0 z-40 bg-[#080B12]/85 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-white/12 rounded-2xl p-5 flex flex-col gap-3">
            <h2 className="font-display text-2xl font-bold text-white">Race Paused</h2>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={handleToggleMute}
                className="min-h-[44px] px-3 rounded-xl bg-slate-800 border border-white/10 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2"
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                <span>{muted ? 'Unmute' : 'Audio On'}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSelectControlScheme(controlScheme === 'buttons' ? 'tilt' : 'buttons')
                }
                className="min-h-[44px] px-3 rounded-xl bg-slate-800 border border-white/10 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2"
              >
                <span>{controlScheme === 'buttons' ? 'Steer: Touch' : 'Steer: Tilt'}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => engineRef.current?.togglePause()}
              className="min-h-[48px] w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" />
              <span>Resume Race</span>
            </button>

            {raceMode === 'time_attack' && (hud.bestLapTimeMs !== null || hud.driftScore > 0) && (
              <button
                type="button"
                onClick={() => engineRef.current?.finishSessionAndSave()}
                className="min-h-[46px] w-full rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/45 text-cyan-200 font-semibold text-sm flex items-center justify-center gap-2"
              >
                <Flag className="w-4 h-4" />
                <span>Finish & Save Records</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                engineRef.current?.resetCarToTrack();
                engineRef.current?.togglePause();
              }}
              className="min-h-[46px] w-full rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 font-semibold text-sm flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset Car to Track</span>
            </button>

            <button
              type="button"
              onClick={handleStartRace}
              className="min-h-[46px] w-full rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 font-semibold text-sm"
            >
              Restart Race
            </button>

            <button
              type="button"
              onClick={() => engineRef.current?.returnToGarage()}
              className="min-h-[46px] w-full rounded-xl bg-transparent border border-white/12 text-slate-300 hover:text-white font-semibold text-sm"
            >
              Return to Garage
            </button>
          </div>
        </div>
      )}

      {/* Post-Race Results Modal */}
      {hud.racePhase === 'finished' && raceResult && (
        <div className="fixed inset-0 z-40 bg-[#080B12]/88 flex items-center justify-center p-4">
          <div className="w-full max-w-md max-h-[92vh] overflow-y-auto bg-slate-900 border border-white/12 rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="min-w-0">
                <div className="text-xs font-medium text-amber-400 truncate">
                  {raceResult.trackName} · {raceResult.carName}
                </div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-white mt-0.5">
                  {raceResult.mode === 'circuit'
                    ? raceResult.position === 1
                      ? '1st Place Finish'
                      : `${ordinal(raceResult.position)} Place Finish`
                    : 'Session Saved'}
                </h2>
                {(savedScoreInfo?.isNewLapRecord || savedScoreInfo?.isNewDriftRecord) && (
                  <div className="text-xs font-semibold text-cyan-400 mt-1">
                    {savedScoreInfo.isNewLapRecord && savedScoreInfo.isNewDriftRecord
                      ? 'New Track Lap & Drift Records'
                      : savedScoreInfo.isNewLapRecord
                        ? 'New Track Lap Record'
                        : 'New Track Drift Record'}
                  </div>
                )}
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <Trophy className="w-6 h-6" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 py-4">
              <div className="bg-slate-950/70 border border-white/8 rounded-xl p-3">
                <div className="text-[11px] text-slate-400">Session Time</div>
                <div className="font-telemetry text-lg font-bold text-white mt-0.5">
                  {formatTimeMs(raceResult.totalTimeMs)}
                </div>
              </div>
              <div className="bg-slate-950/70 border border-white/8 rounded-xl p-3">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Best Lap</span>
                  {savedScoreInfo?.lapRank && (
                    <span className="font-telemetry text-cyan-400">#{savedScoreInfo.lapRank}</span>
                  )}
                </div>
                <div className="font-telemetry text-lg font-bold text-cyan-400 mt-0.5">
                  {formatTimeMs(raceResult.bestLapMs)}
                </div>
              </div>
              <div className="bg-slate-950/70 border border-white/8 rounded-xl p-3">
                <div className="text-[11px] text-slate-400">Top Speed</div>
                <div className="font-telemetry text-lg font-bold text-white mt-0.5">
                  {raceResult.topSpeedKmh} km/h
                </div>
              </div>
              <div className="bg-slate-950/70 border border-white/8 rounded-xl p-3">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Drift Score</span>
                  {savedScoreInfo?.driftRank && (
                    <span className="font-telemetry text-amber-400">#{savedScoreInfo.driftRank}</span>
                  )}
                </div>
                <div className="font-telemetry text-lg font-bold text-amber-400 mt-0.5">
                  {raceResult.totalDriftScore.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Compact Track Top-3 Preview */}
            {savedScoreInfo && (savedScoreInfo.leaderboard.topLaps.length > 0 || savedScoreInfo.leaderboard.topDrifts.length > 0) && (
              <div className="mb-4 pt-3 border-t border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-300">
                    Track Leaderboard Top 3
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowLeaderboard(true)}
                    className="text-xs font-semibold text-amber-400 hover:text-amber-300"
                  >
                    View All
                  </button>
                </div>
                <div className="space-y-1.5 text-xs">
                  {savedScoreInfo.leaderboard.topLaps.slice(0, 3).map((entry, idx) => (
                    <div key={entry.id} className="flex items-center justify-between text-slate-300">
                      <span className="truncate">
                        <span className="font-telemetry text-slate-500 mr-2">#{idx + 1}</span>
                        {entry.driverName} · {entry.carName}
                      </span>
                      <span className="font-telemetry text-cyan-400 shrink-0 ml-2">
                        {formatTimeMs(entry.bestLapMs)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Newly Completed Daily Challenges & Unlocked Exclusive Paints */}
            {challengeRewardInfo && challengeRewardInfo.newlyCompleted.length > 0 && (
              <div className="mb-4 pt-3 border-t border-white/10">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Daily Challenge Completed</span>
                </div>
                <div className="space-y-2">
                  {challengeRewardInfo.newlyCompleted.map((ch) => {
                    const unlockedPaint = PAINTS.find((p) => p.id === ch.rewardPaintId);
                    const equipped = unlockedPaint?.id === selectedPaintId;
                    return (
                      <div
                        key={ch.id}
                        className="bg-emerald-950/35 border border-emerald-500/35 rounded-xl px-3 py-2 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">{ch.title}</div>
                          {unlockedPaint && (
                            <div className="flex items-center gap-1.5 text-[11px] text-emerald-300 mt-0.5">
                              <span
                                className="w-3 h-3 rounded-sm border border-white/30 shrink-0"
                                style={{ backgroundColor: unlockedPaint.hex }}
                              />
                              <span className="truncate">Unlocked: {unlockedPaint.name}</span>
                            </div>
                          )}
                        </div>
                        {unlockedPaint && (
                          <button
                            type="button"
                            onClick={() => setSelectedPaintId(unlockedPaint.id)}
                            className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
                              equipped
                                ? 'bg-cyan-500/25 border border-cyan-400/50 text-cyan-200'
                                : 'bg-emerald-400 hover:bg-emerald-300 text-slate-950'
                            }`}
                          >
                            {equipped ? 'Equipped' : 'Equip'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2.5 pt-1">
              {engineRef.current?.hasReplay() && (
                <button
                  type="button"
                  onClick={() => {
                    engineRef.current?.startReplay();
                    setCameraMode('cinematic');
                  }}
                  className="min-h-[48px] w-full rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-cyan-200 font-display font-bold text-sm flex items-center justify-center gap-2"
                >
                  <Film className="w-4 h-4" />
                  <span>Watch Replay</span>
                </button>
              )}

              <div className="flex items-center gap-2.5">
                {engineRef.current?.isMultiplayerSession() && lobbyRoom ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRaceResult(null);
                      setSavedScoreInfo(null);
                      setChallengeRewardInfo(null);
                      engineRef.current?.returnToGarage();
                      if (lobbyRoom.hostId === localPlayerId) {
                        mpClientRef.current?.requestRematch();
                      }
                      setShowLobby(true);
                    }}
                    className="flex-1 min-h-[48px] rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-display font-bold text-sm"
                  >
                    Room Lobby
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartRace}
                    className="flex-1 min-h-[48px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm"
                  >
                    Race Again
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowLeaderboard(true)}
                  className="min-h-[48px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-amber-400 font-semibold text-sm flex items-center justify-center"
                  aria-label="Open track leaderboard"
                >
                  <Trophy className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRaceResult(null);
                    setSavedScoreInfo(null);
                    setChallengeRewardInfo(null);
                    if (engineRef.current?.isMultiplayerSession()) {
                      mpClientRef.current?.leaveRoom();
                    }
                    engineRef.current?.returnToGarage();
                  }}
                  className="flex-1 min-h-[48px] rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-white font-semibold text-sm"
                >
                  Garage
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Live Multiplayer In-Race Menu Overlay (does not freeze remote cars) */}
      {isInRace && mpMenuOpen && engineRef.current?.isMultiplayerSession() && (
        <div className="fixed inset-0 z-40 bg-[#080B12]/75 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-white/12 rounded-2xl p-5 flex flex-col gap-3">
            <h2 className="font-display text-xl font-bold text-white">Live Race Menu</h2>
            <p className="text-xs text-slate-400">
              Online race stays active in real time while this menu is open.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleToggleMute}
                className="min-h-[44px] px-3 rounded-xl bg-slate-800 border border-white/10 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2"
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                <span>{muted ? 'Unmute' : 'Audio On'}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSelectControlScheme(controlScheme === 'buttons' ? 'tilt' : 'buttons')
                }
                className="min-h-[44px] px-3 rounded-xl bg-slate-800 border border-white/10 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2"
              >
                <span>{controlScheme === 'buttons' ? 'Steer: Touch' : 'Steer: Tilt'}</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setMpMenuOpen(false)}
              className="min-h-[48px] w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm"
            >
              Back to Race
            </button>
            <button
              type="button"
              onClick={() => {
                engineRef.current?.resetCarToTrack();
                setMpMenuOpen(false);
              }}
              className="min-h-[46px] w-full rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 font-semibold text-sm flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset Car to Track</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMpMenuOpen(false);
                mpClientRef.current?.leaveRoom();
                engineRef.current?.returnToGarage();
              }}
              className="min-h-[46px] w-full rounded-xl bg-transparent border border-red-400/35 text-red-300 hover:bg-red-500/15 font-semibold text-sm"
            >
              Leave Multiplayer Race
            </button>
          </div>
        </div>
      )}

      {/* Race Replay Playback Overlay */}
      {hud.racePhase === 'replay' && raceResult && (
        <ReplayControls
          currentMs={hud.replayCurrentMs}
          durationMs={hud.replayDurationMs}
          paused={hud.replayPaused}
          speed={hud.replaySpeed}
          cameraMode={cameraMode}
          muted={muted}
          trackName={raceResult.trackName}
          carName={raceResult.carName}
          speedKmh={hud.speedKmh}
          gear={hud.gear}
          onTogglePause={() => engineRef.current?.toggleReplayPause()}
          onSeek={(t) => engineRef.current?.seekReplay(t)}
          onChangeSpeed={(s) => engineRef.current?.setReplaySpeed(s)}
          onCycleCamera={() => {
            const next = engineRef.current?.cycleCamera();
            if (next) setCameraMode(next);
          }}
          onToggleMute={handleToggleMute}
          onRestartFromStart={() => engineRef.current?.seekReplay(0)}
          onExit={() => {
            engineRef.current?.exitReplayToResults();
            setCameraMode('chase');
          }}
        />
      )}

      {/* Online & Same Wi-Fi Multiplayer Lobby Modal */}
      {showLobby && (
        <MultiplayerLobbyModal
          scope={lobbyScope}
          driverName={driverName}
          selectedTrackId={selectedTrackId}
          connectionStatus={connectionStatus}
          pingMs={pingMs}
          directPeerCount={directPeerCount}
          room={lobbyRoom}
          localPlayerId={localPlayerId}
          availableRooms={availableRooms}
          networkInfo={networkInfo}
          errorMessage={lobbyError}
          onDriverNameChange={handleDriverNameChange}
          onRefreshRooms={handleRefreshRooms}
          onCreateRoom={() => {
            setLobbyError(null);
            mpClientRef.current?.createRoom({
              scope: lobbyScope,
              trackId: selectedTrackId,
              driverName,
              carId: selectedCarId,
              paintId: selectedPaintId,
              underglowId: selectedUnderglowId,
            });
          }}
          onJoinRoom={(code) => {
            setLobbyError(null);
            mpClientRef.current?.joinRoom({
              code,
              driverName,
              carId: selectedCarId,
              paintId: selectedPaintId,
              underglowId: selectedUnderglowId,
            });
          }}
          onLeaveRoom={() => {
            mpClientRef.current?.leaveRoom();
            setLobbyError(null);
          }}
          onSelectRoomTrack={(trk) => mpClientRef.current?.setRoomTrack(trk)}
          onStartRace={() => mpClientRef.current?.startRoomRace()}
          onInspectUser={handleInspectUserById}
          onClose={() => {
            setShowLobby(false);
            setLobbyError(null);
          }}
        />
      )}

      {/* Global Online & Local Storage Leaderboard Modal */}
      {showLeaderboard && (
        <LeaderboardModal
          initialTrackId={raceResult?.trackId ?? selectedTrackId}
          driverName={driverName}
          onDriverNameChange={handleDriverNameChange}
          onInspectUser={handleInspectUserById}
          onClose={() => setShowLeaderboard(false)}
        />
      )}

      {/* Driver Sign In / My Profile / Drivers Directory Modal */}
      {authModalTab && (
        <AuthProfileModal
          initialTab={authModalTab}
          session={authSession}
          selectedCarId={selectedCarId}
          selectedPaintId={selectedPaintId}
          profiles={driverProfiles}
          onRefreshProfiles={refreshDriverProfiles}
          onSessionChange={handleSessionChange}
          onInspectDriver={(p) => {
            setInviteFeedback(null);
            setInspectedProfile(p);
          }}
          onClose={() => setAuthModalTab(null)}
        />
      )}

      {/* Public Driver Profile Card + Request Race Modal */}
      {inspectedProfile && (
        <UserProfileModal
          profile={inspectedProfile}
          session={authSession}
          defaultTrackId={selectedTrackId}
          inviteFeedback={inviteFeedback}
          onRequestRace={handleRequestRace}
          onOpenSignIn={() => {
            setInspectedProfile(null);
            setAuthModalTab('account');
          }}
          onClose={() => {
            setInspectedProfile(null);
            setInviteFeedback(null);
          }}
        />
      )}

      {/* Landscape Orientation Requirement / Rotate Device Overlay */}
      {isPortrait && !dismissPortraitWarning && (
        <div className="fixed inset-0 z-[100] bg-[#04060a]/94 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="relative w-28 h-28 mb-5 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-cyan-500/30 animate-ping opacity-25" />
            <div className="w-24 h-24 rounded-2xl bg-cyan-950/40 border border-cyan-400/40 flex items-center justify-center shadow-[0_0_35px_rgba(6,182,212,0.25)]">
              <svg
                className="w-14 h-14 text-cyan-400 animate-[spin_4s_ease-in-out_infinite]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="14" height="20" x="5" y="2" rx="2" />
                <path d="M12 18h.01" />
                <path d="M17 6c2 2 3 5 2 8" strokeDasharray="2 2" />
                <path d="m20 12 2 2-3 2" />
              </svg>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-semibold tracking-wider uppercase mb-2">
            Landscape View Recommended
          </div>

          <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-wide uppercase">
            Rotate To Landscape
          </h2>
          <p className="text-sm text-slate-300 mt-2 max-w-sm leading-relaxed">
            Apex Velocity is built for high-speed cockpit racing in widescreen landscape. Turn your device sideways for the optimal field of view and steering controls.
          </p>

          <div className="mt-6 flex flex-col sm:flex-row gap-3 w-full max-w-xs">
            <button
              type="button"
              onClick={handleEnterLandscapeFullscreen}
              className="w-full py-3 px-4 rounded-xl font-display font-bold uppercase tracking-wider text-sm bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-lg shadow-cyan-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCw className="w-4 h-4" />
              Lock Landscape
            </button>
            <button
              type="button"
              onClick={() => setDismissPortraitWarning(true)}
              className="w-full py-2.5 px-4 rounded-xl font-display font-semibold uppercase tracking-wider text-xs bg-slate-800/80 hover:bg-slate-700/80 text-slate-400 hover:text-slate-200 border border-slate-700/60 active:scale-[0.98] transition-all cursor-pointer"
            >
              Continue In Portrait
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
