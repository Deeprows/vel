import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CARS, PAINTS, UNDERGLOWS } from './cars';
import { createCarModel, CarModelRig } from './carModel';
import { createProceduralTextures, createSkyReflectionTexture, ProceduralTextureSet } from './textures';
import { createStreetTrack, TrackData } from './track';
import {
  computeAiInput,
  createVehicleState,
  resolveVehicleCollisions,
  stepVehiclePhysics,
  VehiclePhysicsState,
} from './physics';
import { RaceAudioEngine } from './audio';
import {
  CameraMode,
  CarId,
  HudTelemetry,
  InputState,
  LobbyPlayer,
  RaceMode,
  RaceResult,
  RemoteTelemetryPacket,
  ReplayFrame,
  TrackId,
} from './types';

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

// Pre-allocated math helpers for zero GC in render loop
const _camDesiredPos = new THREE.Vector3();
const _camDesiredLook = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _dummy = new THREE.Object3D();

interface SmokeParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
}

interface SparkParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

export interface EngineCallbacks {
  onTelemetry: (telemetry: HudTelemetry) => void;
  onRaceFinish: (result: RaceResult) => void;
  onContextLost: (lost: boolean) => void;
  onMultiplayerTelemetry?: (packet: Omit<RemoteTelemetryPacket, 'playerId' | 'seq'>) => void;
}

export class RacingGameEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private keyLight: THREE.DirectionalLight;
  private textures: ProceduralTextureSet;
  private track: TrackData;
  private isSoftwareGl: boolean;
  private audio = new RaceAudioEngine();

  private frameId = 0;
  private disposed = false;
  private lastTime = performance.now();
  private hudEmitAccum = 0;

  // Game Config
  private selectedCarId: CarId = 'diablo_sv';
  private selectedTrackId: TrackId = 'midnight_bay';
  private selectedPaintId = PAINTS[0].id;
  private selectedUnderglowId = UNDERGLOWS[0].id;
  private raceMode: RaceMode = 'circuit';
  private cameraMode: CameraMode = 'chase';
  private totalLaps = 3;

  // Race Runtime State
  private phase: 'garage' | 'countdown' | 'racing' | 'paused' | 'finished' | 'replay' = 'garage';
  private countdownTimer = 3.4;
  private lastCountdownInt = 4;
  private raceTimeMs = 0;
  private lapStartMs = 0;
  private bestLapMs: number | null = null;
  private lastTrackedLap = 1;
  private topSpeedKmh = 0;
  private totalDriftScore = 0;
  private activeDriftPoints = 0;
  private driftBankTimer = 0;

  // Replay Recording & Playback
  private replayFrames: ReplayFrame[] = [];
  private replayRecordAccum = 0;
  private replayPlaybackMs = 0;
  private replayPaused = false;
  private replaySpeed: 0.5 | 1 | 2 = 1;

  // Vehicles
  private vehicles: VehiclePhysicsState[] = [];
  private carRigs = new Map<string, CarModelRig>();
  private isMultiplayer = false;
  private multiplayerSendAccum = 0;
  private remoteTargets = new Map<
    string,
    { packet: RemoteTelemetryPacket; receivedAtMs: number; underglowHex: string }
  >();
  private inputState: InputState = {
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: false,
    nos: false,
  };

  // Camera tracking
  private garageOrbitAngle = 0.65;
  private camPos = new THREE.Vector3(0, 4, 12);
  private camLook = new THREE.Vector3(0, 1, 0);
  private camShake = 0;

  // Pooled Particle Meshes
  private smokeInst: THREE.InstancedMesh;
  private smokePool: SmokeParticle[] = [];
  private smokeCursor = 0;

  private sparkInst: THREE.InstancedMesh;
  private sparkPool: SparkParticle[] = [];
  private sparkCursor = 0;

  // Pooled Tire Skidmarks
  private skidInst: THREE.InstancedMesh;
  private skidCursor = 0;
  private skidAccum = 0;

  // Procedural Sky Dome & PMREM Environment
  private skyBgTex: THREE.Texture | null = null;
  private envRT: THREE.WebGLRenderTarget | null = null;

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    // Detect software WebGL once via GPU renderer string
    this.isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // WebGL Context Safety
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);

    // Scene & Fog (sky dome + PMREM reflections populated in applyTrackAtmosphere)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080b12);
    this.scene.fog = new THREE.FogExp2(0x080b12, 0.0022);

    // Camera
    this.camera = new THREE.PerspectiveCamera(62, width / height, 0.25, 950);

    // Warm/Cool Lighting Rig (<= 3 shadow casters)
    const hemiLight = new THREE.HemisphereLight(0x64748b, 0x1e1b4b, 0.95);
    this.scene.add(hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfef3c7, 2.2);
    this.keyLight.position.set(45, 75, 30);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.width = 1024;
    this.keyLight.shadow.mapSize.height = 1024;
    const d = 48;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 190;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.15);
    rimLight.position.set(-40, 28, -55);
    this.scene.add(rimLight);

    // Textures & Track
    this.textures = createProceduralTextures(this.renderer.capabilities.getMaxAnisotropy());
    this.track = createStreetTrack(this.selectedTrackId, this.textures, this.isSoftwareGl);
    this.applyTrackAtmosphere();
    this.scene.add(this.track.group);

    // Pooled Smoke Particles
    const smokeCount = 90;
    const smokeGeo = new THREE.PlaneGeometry(1, 1);
    const smokeMat = new THREE.MeshBasicMaterial({
      map: this.textures.smokeMap,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.smokeInst = new THREE.InstancedMesh(smokeGeo, smokeMat, smokeCount);
    this.smokeInst.frustumCulled = false;
    for (let i = 0; i < smokeCount; i++) {
      this.smokePool.push({ active: false, x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, scale: 1 });
      _dummy.position.set(0, -50, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.smokeInst.setMatrixAt(i, _dummy.matrix);
    }
    this.smokeInst.instanceMatrix.needsUpdate = true;
    this.scene.add(this.smokeInst);

    // Pooled Wall Sparks
    const sparkCount = 48;
    const sparkGeo = new THREE.BoxGeometry(0.12, 0.08, 0.42);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    this.sparkInst = new THREE.InstancedMesh(sparkGeo, sparkMat, sparkCount);
    this.sparkInst.frustumCulled = false;
    for (let i = 0; i < sparkCount; i++) {
      this.sparkPool.push({ active: false, x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0.4 });
      _dummy.position.set(0, -50, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.sparkInst.setMatrixAt(i, _dummy.matrix);
    }
    this.sparkInst.instanceMatrix.needsUpdate = true;
    this.scene.add(this.sparkInst);

    // Pooled Tire Drift & Braking Skidmarks
    const skidCount = 420;
    const skidGeo = new THREE.PlaneGeometry(0.32, 0.92);
    skidGeo.rotateX(-Math.PI / 2);
    const skidMat = new THREE.MeshBasicMaterial({
      color: 0x05070a,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.skidInst = new THREE.InstancedMesh(skidGeo, skidMat, skidCount);
    this.skidInst.frustumCulled = false;
    this.resetSkidmarks();
    this.scene.add(this.skidInst);

    // Post-processing Bloom on GPU devices (skipped on software WebGL)
    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.42, 0.38, 0.82);
      this.composer.addPass(this.bloomPass);
    }

    // Spawn initial garage showcase car
    this.setupVehiclesForPhase('garage');

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    window.addEventListener('resize', this.handleResize);
    this.lastTime = performance.now();
    this.tick();
  }

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    this.callbacks.onContextLost(true);
  };

  private handleContextRestored = () => {
    this.callbacks.onContextLost(false);
  };

  private handleResize = () => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setSize(w, h);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(w, h);
    }
  };

  private clearCars(): void {
    for (const rig of this.carRigs.values()) {
      this.scene.remove(rig.root);
      rig.dispose();
    }
    this.carRigs.clear();
    this.vehicles = [];
  }

  private setupVehiclesForPhase(targetPhase: 'garage' | 'countdown'): void {
    this.clearCars();

    const playerSpec = CARS.find((c) => c.id === this.selectedCarId) ?? CARS[0];
    const paint = PAINTS.find((p) => p.id === this.selectedPaintId) ?? PAINTS[0];
    const underglow = UNDERGLOWS.find((u) => u.id === this.selectedUnderglowId) ?? UNDERGLOWS[0];

    const playerStartT = targetPhase === 'garage' ? 0.008 : 0.985;
    const playerLane = targetPhase === 'garage' ? 0 : -3.4;

    const player = createVehicleState({
      id: 'player',
      name: 'You',
      isPlayer: true,
      color: paint.hex,
      spec: playerSpec,
      track: this.track,
      startT: playerStartT,
      laneOffset: playerLane,
    });
    const playerRig = createCarModel(
      playerSpec,
      paint,
      underglow.hex,
      this.textures.contactShadowMap,
      true,
      this.isSoftwareGl,
      this.textures.headlightProjectionMap
    );
    this.scene.add(playerRig.root);
    this.carRigs.set(player.id, playerRig);
    this.vehicles.push(player);

    // Spawn 3 AI Rivals in Circuit mode
    if (targetPhase === 'countdown' && this.raceMode === 'circuit') {
      const rivalConfigs = [
        { id: 'rival_1', name: 'K. Takahashi', car: CARS[2], paint: PAINTS[1], startT: 0.991, lane: 3.4, skill: 0.93 },
        { id: 'rival_2', name: 'M. Vance', car: CARS[7], paint: PAINTS[2], startT: 0.988, lane: 3.4, skill: 0.97 },
        { id: 'rival_3', name: 'S. Kira', car: CARS[6], paint: PAINTS[3], startT: 0.982, lane: -3.4, skill: 0.90 },
      ];

      for (const rc of rivalConfigs) {
        const rival = createVehicleState({
          id: rc.id,
          name: rc.name,
          isPlayer: false,
          color: rc.paint.hex,
          spec: rc.car,
          track: this.track,
          startT: rc.startT,
          laneOffset: rc.lane,
          aiSkillMultiplier: rc.skill,
        });
        const rig = createCarModel(
          rc.car,
          rc.paint,
          '#000000',
          this.textures.contactShadowMap,
          false,
          this.isSoftwareGl
        );
        this.scene.add(rig.root);
        this.carRigs.set(rival.id, rig);
        this.vehicles.push(rival);
      }
    }

    // Sync initial visual transforms
    for (const v of this.vehicles) {
      const rig = this.carRigs.get(v.id);
      if (rig) {
        rig.root.position.set(v.x, v.y, v.z);
        rig.root.rotation.set(0, v.yaw, 0);
      }
    }

    if (targetPhase === 'countdown') {
      // Snap camera behind player cleanly at race start
      const fwdX = -Math.sin(player.yaw);
      const fwdZ = -Math.cos(player.yaw);
      this.camPos.set(player.x - fwdX * 8.2, player.y + 3.1, player.z - fwdZ * 8.2);
      this.camLook.set(player.x + fwdX * 6, player.y + 1.1, player.z + fwdZ * 6);
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
    }
  }

  private applyTrackAtmosphere(): void {
    const def = this.track.definition;
    this.skyBgTex?.dispose();
    this.envRT?.dispose();

    const skyTex = createSkyReflectionTexture(def.skyHex, def.accentHex);
    this.skyBgTex = skyTex;
    this.scene.background = skyTex;
    this.scene.backgroundBlurriness = 0.04;
    this.scene.fog = new THREE.FogExp2(def.fogHex, def.fogDensity);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    this.envRT = pmremGenerator.fromEquirectangular(skyTex);
    this.scene.environment = this.envRT.texture;
    pmremGenerator.dispose();
  }

  private resetSkidmarks(): void {
    this.skidCursor = 0;
    this.skidAccum = 0;
    const count = this.skidInst.count;
    _dummy.position.set(0, -50, 0);
    _dummy.rotation.set(0, 0, 0);
    _dummy.scale.setScalar(0.001);
    _dummy.updateMatrix();
    for (let i = 0; i < count; i++) {
      this.skidInst.setMatrixAt(i, _dummy.matrix);
    }
    this.skidInst.instanceMatrix.needsUpdate = true;
  }

  private spawnSkidmark(x: number, y: number, z: number, yaw: number, widthScale = 1): void {
    const idx = this.skidCursor;
    this.skidCursor = (this.skidCursor + 1) % this.skidInst.count;
    _dummy.position.set(x, y + 0.032, z);
    _dummy.rotation.set(0, yaw, 0);
    _dummy.scale.set(widthScale, 1, 1);
    _dummy.updateMatrix();
    this.skidInst.setMatrixAt(idx, _dummy.matrix);
    this.skidInst.instanceMatrix.needsUpdate = true;
  }

  public setTrack(trackId: TrackId): { minimapPoints: { x: number; y: number }[] } {
    if (trackId !== this.selectedTrackId) {
      this.selectedTrackId = trackId;
      this.scene.remove(this.track.group);
      this.track.dispose();
      this.track = createStreetTrack(trackId, this.textures, this.isSoftwareGl);
      this.applyTrackAtmosphere();
      this.scene.add(this.track.group);
      if (this.phase === 'garage') {
        this.setupVehiclesForPhase('garage');
      }
    }
    return { minimapPoints: this.track.minimapPoints };
  }

  private recordReplaySnapshot(timeMs: number): void {
    this.replayFrames.push({
      timeMs,
      vehicles: this.vehicles.map((v) => ({
        id: v.id,
        x: v.x,
        y: v.y,
        z: v.z,
        yaw: v.yaw,
        steerAngle: v.steerAngle,
        pitchRad: v.pitchRad,
        rollRad: v.rollRad,
        wheelSpinAngle: v.wheelSpinAngle,
        speedKmh: v.speedKmh,
        forwardSpeed: v.forwardSpeed,
        lateralSpeed: v.lateralSpeed,
        rpm: v.rpm,
        gear: v.gear,
        nos: v.nos,
        nosActive: v.nosActive,
        brakeIntensity: v.isPlayer ? Math.max(this.inputState.brake, this.inputState.handbrake ? 0.9 : 0) : 0,
        isDrifting: v.isDrifting,
        driftIntensity: v.driftIntensity,
      })),
    });
  }

  public hasReplay(): boolean {
    return this.replayFrames.length >= 2;
  }

  public startReplay(): void {
    if (!this.hasReplay()) return;
    this.audio.unlock();
    this.phase = 'replay';
    this.replayPlaybackMs = 0;
    this.replayPaused = false;
    this.replaySpeed = 1;
    this.cameraMode = 'cinematic';
    this.resetSkidmarks();
    this.lastTime = performance.now();
    this.applyReplayAtTime(0, 0.016);
    this.emitHud();
  }

  public toggleReplayPause(): void {
    if (this.phase !== 'replay') return;
    const duration = this.getReplayDurationMs();
    if (this.replayPaused && this.replayPlaybackMs >= duration - 10) {
      this.replayPlaybackMs = 0;
    }
    this.replayPaused = !this.replayPaused;
    if (this.replayPaused) {
      this.audio.updateTelemetry({
        active: false,
        rpm: 950,
        redlineRpm: 8000,
        gear: 1,
        throttle: 0,
        driftIntensity: 0,
        nosActive: false,
      });
    }
    this.emitHud();
  }

  public setReplaySpeed(speed: 0.5 | 1 | 2): void {
    this.replaySpeed = speed;
    this.emitHud();
  }

  public seekReplay(timeMs: number): void {
    if (this.phase !== 'replay') return;
    const duration = this.getReplayDurationMs();
    this.replayPlaybackMs = THREE.MathUtils.clamp(timeMs, 0, duration);
    this.applyReplayAtTime(this.replayPlaybackMs, 0.016);
    this.emitHud();
  }

  public exitReplayToResults(): void {
    if (this.phase !== 'replay') return;
    this.phase = 'finished';
    this.cameraMode = 'chase';
    this.audio.updateTelemetry({
      active: false,
      rpm: 950,
      redlineRpm: 8000,
      gear: 1,
      throttle: 0,
      driftIntensity: 0,
      nosActive: false,
    });
    this.emitHud();
  }

  private getReplayDurationMs(): number {
    if (this.replayFrames.length === 0) return 0;
    return this.replayFrames[this.replayFrames.length - 1].timeMs;
  }

  private applyReplayAtTime(timeMs: number, dt: number): void {
    const frames = this.replayFrames;
    if (frames.length === 0) return;

    // Binary search for frame bracket [lo, hi]
    let lo = 0;
    let hi = frames.length - 1;
    if (timeMs <= frames[0].timeMs) {
      lo = hi = 0;
    } else if (timeMs >= frames[hi].timeMs) {
      lo = hi = frames.length - 1;
    } else {
      while (lo + 1 < hi) {
        const mid = (lo + hi) >> 1;
        if (frames[mid].timeMs <= timeMs) lo = mid;
        else hi = mid;
      }
    }

    const f0 = frames[lo];
    const f1 = frames[hi];
    const span = f1.timeMs - f0.timeMs;
    const alpha = span > 0.001 ? THREE.MathUtils.clamp((timeMs - f0.timeMs) / span, 0, 1) : 0;
    const underglowHex = UNDERGLOWS.find((u) => u.id === this.selectedUnderglowId)?.hex ?? '#06B6D4';

    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      const s0 = f0.vehicles[i];
      const s1 = f1.vehicles[i] ?? s0;
      if (!s0) continue;

      v.x = THREE.MathUtils.lerp(s0.x, s1.x, alpha);
      v.y = THREE.MathUtils.lerp(s0.y, s1.y, alpha);
      v.z = THREE.MathUtils.lerp(s0.z, s1.z, alpha);
      v.yaw = lerpAngle(s0.yaw, s1.yaw, alpha);
      v.steerAngle = THREE.MathUtils.lerp(s0.steerAngle, s1.steerAngle, alpha);
      v.pitchRad = THREE.MathUtils.lerp(s0.pitchRad, s1.pitchRad, alpha);
      v.rollRad = THREE.MathUtils.lerp(s0.rollRad, s1.rollRad, alpha);
      v.wheelSpinAngle = THREE.MathUtils.lerp(s0.wheelSpinAngle, s1.wheelSpinAngle, alpha);
      v.speedKmh = THREE.MathUtils.lerp(s0.speedKmh, s1.speedKmh, alpha);
      v.forwardSpeed = THREE.MathUtils.lerp(s0.forwardSpeed, s1.forwardSpeed, alpha);
      v.lateralSpeed = THREE.MathUtils.lerp(s0.lateralSpeed, s1.lateralSpeed, alpha);
      v.rpm = THREE.MathUtils.lerp(s0.rpm, s1.rpm, alpha);
      v.gear = alpha < 0.5 ? s0.gear : s1.gear;
      v.nos = THREE.MathUtils.lerp(s0.nos, s1.nos, alpha);
      v.nosActive = alpha < 0.5 ? s0.nosActive : s1.nosActive;
      v.isDrifting = alpha < 0.5 ? s0.isDrifting : s1.isDrifting;
      v.driftIntensity = THREE.MathUtils.lerp(s0.driftIntensity, s1.driftIntensity, alpha);

      const rig = this.carRigs.get(v.id);
      if (rig) {
        rig.root.position.set(v.x, v.y, v.z);
        rig.root.rotation.set(0, v.yaw, 0);
        rig.updateVisuals({
          speedMs: v.forwardSpeed,
          steerAngle: v.steerAngle,
          pitchRad: v.pitchRad,
          rollRad: v.rollRad,
          brakeIntensity: THREE.MathUtils.lerp(s0.brakeIntensity, s1.brakeIntensity, alpha),
          nosActive: v.nosActive,
          underglowHex: v.isPlayer ? underglowHex : '#000000',
          dt,
          wheelSpinAngle: v.wheelSpinAngle,
        });
      }

      if (!this.replayPaused && v.isDrifting) {
        const rearOffset = v.spec.wheelbase * 0.5;
        const fwdX = -Math.sin(v.yaw);
        const fwdZ = -Math.cos(v.yaw);
        const rightX = Math.cos(v.yaw);
        const rightZ = -Math.sin(v.yaw);
        if (v.speedKmh > 25) {
          this.spawnSkidmark(
            v.x - fwdX * rearOffset - rightX * 0.82,
            v.y,
            v.z - fwdZ * rearOffset - rightZ * 0.82,
            v.yaw,
            0.9 + v.driftIntensity * 0.45
          );
          this.spawnSkidmark(
            v.x - fwdX * rearOffset + rightX * 0.82,
            v.y,
            v.z - fwdZ * rearOffset + rightZ * 0.82,
            v.yaw,
            0.9 + v.driftIntensity * 0.45
          );
        }
        if (Math.random() < 0.65) {
          const side = Math.random() > 0.5 ? 0.85 : -0.85;
          this.spawnSmoke(
            v.x - fwdX * rearOffset + rightX * side,
            v.y,
            v.z - fwdZ * rearOffset + rightZ * side,
            fwdX * v.forwardSpeed,
            fwdZ * v.forwardSpeed,
            0.9 + v.driftIntensity * 0.8
          );
        }
      }
    }

    const player = this.vehicles[0];
    if (player) {
      this.updateCamera(player, dt);
      this.keyLight.position.set(player.x + 42, player.y + 68, player.z + 28);
      this.keyLight.target.position.set(player.x, player.y, player.z);
      this.audio.updateTelemetry({
        active: !this.replayPaused,
        carId: player.spec.id,
        rpm: player.rpm,
        redlineRpm: player.spec.redlineRpm,
        gear: player.gear,
        throttle: player.speedKmh > 15 ? 0.75 : 0.2,
        speedKmh: player.speedKmh,
        driftIntensity: player.driftIntensity,
        isDrifting: player.isDrifting,
        onKerb: false,
        nosActive: player.nosActive,
      });
    }
  }

  public finishSessionAndSave(): void {
    const player = this.vehicles[0];
    if (!player) return;
    this.recordReplaySnapshot(this.raceTimeMs);
    this.totalDriftScore += Math.round(this.activeDriftPoints);
    this.activeDriftPoints = 0;
    this.phase = 'finished';
    this.audio.updateTelemetry({
      active: false,
      rpm: 950,
      redlineRpm: player.spec.redlineRpm,
      gear: 1,
      throttle: 0,
      driftIntensity: 0,
      nosActive: false,
    });
    this.callbacks.onRaceFinish({
      trackId: this.selectedTrackId,
      trackName: this.track.definition.name,
      position: 1,
      totalRacers: this.vehicles.length,
      totalTimeMs: this.raceTimeMs,
      bestLapMs: this.bestLapMs,
      lapsCompleted: Math.max(0, player.lap - 1),
      topSpeedKmh: this.topSpeedKmh,
      totalDriftScore: this.totalDriftScore,
      carName: player.spec.name,
      mode: this.raceMode,
    });
    this.emitHud();
  }

  public setGarageSelection(carId: CarId, paintId: string, underglowId: string): void {
    const carChanged = carId !== this.selectedCarId;
    this.selectedCarId = carId;
    this.selectedPaintId = paintId;
    this.selectedUnderglowId = underglowId;

    if (this.phase === 'garage') {
      if (carChanged) {
        this.setupVehiclesForPhase('garage');
      } else {
        const rig = this.carRigs.get('player');
        const paint = PAINTS.find((p) => p.id === paintId) ?? PAINTS[0];
        const underglow = UNDERGLOWS.find((u) => u.id === underglowId) ?? UNDERGLOWS[0];
        if (rig) {
          rig.setPaint(paint);
          rig.setUnderglow(underglow.hex);
        }
      }
    }
  }

  public startRace(mode: RaceMode): void {
    this.audio.unlock();
    this.isMultiplayer = false;
    this.remoteTargets.clear();
    this.raceMode = mode;
    this.totalLaps = mode === 'circuit' ? 3 : 99;
    this.phase = 'countdown';
    this.countdownTimer = 3.3;
    this.lastCountdownInt = 4;
    this.raceTimeMs = 0;
    this.lapStartMs = 0;
    this.bestLapMs = null;
    this.lastTrackedLap = 1;
    this.topSpeedKmh = 0;
    this.totalDriftScore = 0;
    this.activeDriftPoints = 0;
    this.driftBankTimer = 0;
    this.replayFrames = [];
    this.replayRecordAccum = 0;
    this.cameraMode = 'chase';
    this.resetSkidmarks();
    this.setupVehiclesForPhase('countdown');
    this.emitHud();
  }

  public startMultiplayerRace(
    roster: LobbyPlayer[],
    localPlayerId: string,
    trackId: TrackId,
    countdownMs: number
  ): void {
    this.audio.unlock();
    this.setTrack(trackId);
    this.isMultiplayer = true;
    this.remoteTargets.clear();
    this.multiplayerSendAccum = 0;
    this.raceMode = 'circuit';
    this.totalLaps = 3;
    this.phase = 'countdown';
    this.countdownTimer = Math.max(0.8, countdownMs / 1000);
    this.lastCountdownInt = Math.ceil(this.countdownTimer) + 1;
    this.raceTimeMs = 0;
    this.lapStartMs = 0;
    this.bestLapMs = null;
    this.lastTrackedLap = 1;
    this.topSpeedKmh = 0;
    this.totalDriftScore = 0;
    this.activeDriftPoints = 0;
    this.driftBankTimer = 0;
    this.replayFrames = [];
    this.replayRecordAccum = 0;
    this.cameraMode = 'chase';
    this.resetSkidmarks();

    this.clearCars();

    const gridPositions = [
      { startT: 0.991, lane: -3.4 },
      { startT: 0.988, lane: 3.4 },
      { startT: 0.985, lane: -3.4 },
      { startT: 0.982, lane: 3.4 },
    ];

    const localEntry = roster.find((p) => p.id === localPlayerId) ?? roster[0];
    const orderedRoster = [
      localEntry,
      ...roster.filter((p) => p.id !== localEntry.id),
    ];

    for (const entry of orderedRoster) {
      const isLocal = entry.id === localPlayerId;
      const spec = CARS.find((c) => c.id === entry.carId) ?? CARS[0];
      const paint = PAINTS.find((p) => p.id === entry.paintId) ?? PAINTS[0];
      const underglow = UNDERGLOWS.find((u) => u.id === entry.underglowId) ?? UNDERGLOWS[0];
      const grid = gridPositions[entry.gridSlot % gridPositions.length];

      const v = createVehicleState({
        id: entry.id,
        name: isLocal ? 'You' : entry.name,
        isPlayer: isLocal,
        isRemote: !isLocal,
        color: paint.hex,
        spec,
        track: this.track,
        startT: grid.startT,
        laneOffset: grid.lane,
      });

      const rig = createCarModel(
        spec,
        paint,
        underglow.hex,
        this.textures.contactShadowMap,
        isLocal,
        this.isSoftwareGl,
        isLocal ? this.textures.headlightProjectionMap : undefined
      );
      this.scene.add(rig.root);
      this.carRigs.set(v.id, rig);
      this.vehicles.push(v);

      if (!isLocal) {
        this.remoteTargets.set(v.id, {
          packet: {
            playerId: v.id,
            x: v.x,
            y: v.y,
            z: v.z,
            yaw: v.yaw,
            steerAngle: 0,
            pitchRad: 0,
            rollRad: 0,
            wheelSpinAngle: 0,
            speedKmh: 0,
            forwardSpeed: 0,
            nosActive: false,
            brakeIntensity: 0,
            isDrifting: false,
            driftIntensity: 0,
            lap: 1,
            trackProgress: grid.startT,
            totalProgress: grid.startT - 1,
            finished: false,
            finishTimeMs: 0,
            seq: 0,
          },
          receivedAtMs: performance.now(),
          underglowHex: underglow.hex,
        });
      }
    }

    for (const v of this.vehicles) {
      const rig = this.carRigs.get(v.id);
      if (rig) {
        rig.root.position.set(v.x, v.y, v.z);
        rig.root.rotation.set(0, v.yaw, 0);
      }
    }

    const player = this.vehicles[0];
    if (player) {
      const fwdX = -Math.sin(player.yaw);
      const fwdZ = -Math.cos(player.yaw);
      this.camPos.set(player.x - fwdX * 8.2, player.y + 3.1, player.z - fwdZ * 8.2);
      this.camLook.set(player.x + fwdX * 6, player.y + 1.1, player.z + fwdZ * 6);
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
    }

    this.emitHud();
  }

  public applyRemoteTelemetry(packet: RemoteTelemetryPacket): void {
    const existing = this.remoteTargets.get(packet.playerId);
    if (!existing) return;
    existing.packet = packet;
    existing.receivedAtMs = performance.now();

    const v = this.vehicles.find((veh) => veh.id === packet.playerId);
    if (v) {
      const fwdX = -Math.sin(packet.yaw);
      const fwdZ = -Math.cos(packet.yaw);
      v.vx = fwdX * packet.forwardSpeed;
      v.vz = fwdZ * packet.forwardSpeed;
    }
  }

  public isMultiplayerSession(): boolean {
    return this.isMultiplayer;
  }

  public returnToGarage(): void {
    this.isMultiplayer = false;
    this.remoteTargets.clear();
    this.phase = 'garage';
    this.resetSkidmarks();
    this.audio.updateTelemetry({
      active: false,
      rpm: 950,
      redlineRpm: 8000,
      gear: 1,
      throttle: 0,
      driftIntensity: 0,
      nosActive: false,
    });
    this.setupVehiclesForPhase('garage');
    this.emitHud();
  }

  public togglePause(): void {
    if (this.isMultiplayer) {
      // In live multiplayer, do not freeze physics/network clock
      return;
    }
    if (this.phase === 'racing') {
      this.phase = 'paused';
      this.audio.updateTelemetry({
        active: false,
        rpm: 950,
        redlineRpm: 8000,
        gear: 1,
        throttle: 0,
        driftIntensity: 0,
        nosActive: false,
      });
      this.emitHud();
    } else if (this.phase === 'paused') {
      this.phase = 'racing';
      this.lastTime = performance.now();
      this.emitHud();
    }
  }

  public resetCarToTrack(): void {
    const player = this.vehicles[0];
    if (!player || (this.phase !== 'racing' && this.phase !== 'countdown')) return;
    const sample = this.track.sampleAtProgress(player.trackT);
    player.x = sample.point.x;
    player.y = sample.point.y;
    player.z = sample.point.z;
    player.vx = 0;
    player.vz = 0;
    player.angularVelocity = 0;
    player.yaw = Math.atan2(-sample.tangent.x, -sample.tangent.z);
  }

  public cycleCamera(): CameraMode {
    const modes: CameraMode[] = ['chase', 'hood', 'cinematic'];
    const next = modes[(modes.indexOf(this.cameraMode) + 1) % modes.length];
    this.cameraMode = next;
    return next;
  }

  public getCameraMode(): CameraMode {
    return this.cameraMode;
  }

  public setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
  }

  public unlockAudio(): void {
    this.audio.unlock();
  }

  public setInput(partial: Partial<InputState>): void {
    Object.assign(this.inputState, partial);
  }

  public getMinimapPoints(): { x: number; y: number }[] {
    return this.track.minimapPoints;
  }

  private spawnSmoke(x: number, y: number, z: number, vx: number, vz: number, scale: number): void {
    const p = this.smokePool[this.smokeCursor];
    this.smokeCursor = (this.smokeCursor + 1) % this.smokePool.length;
    p.active = true;
    p.x = x + (Math.random() - 0.5) * 0.4;
    p.y = y + 0.2;
    p.z = z + (Math.random() - 0.5) * 0.4;
    p.vx = vx * 0.15 + (Math.random() - 0.5) * 1.4;
    p.vy = 0.8 + Math.random() * 1.1;
    p.vz = vz * 0.15 + (Math.random() - 0.5) * 1.4;
    p.life = 0;
    p.maxLife = 0.48 + Math.random() * 0.25;
    p.scale = scale;
  }

  private spawnSparks(pos: THREE.Vector3, vx: number, vz: number): void {
    for (let i = 0; i < 3; i++) {
      const s = this.sparkPool[this.sparkCursor];
      this.sparkCursor = (this.sparkCursor + 1) % this.sparkPool.length;
      s.active = true;
      s.x = pos.x;
      s.y = pos.y;
      s.z = pos.z;
      s.vx = -vx * 0.25 + (Math.random() - 0.5) * 9;
      s.vy = 2.5 + Math.random() * 5.5;
      s.vz = -vz * 0.25 + (Math.random() - 0.5) * 9;
      s.life = 0;
      s.maxLife = 0.22 + Math.random() * 0.2;
    }
  }

  private updateParticles(dt: number): void {
    let smokeDirty = false;
    for (let i = 0; i < this.smokePool.length; i++) {
      const p = this.smokePool[i];
      if (!p.active) continue;
      smokeDirty = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        _dummy.position.set(0, -50, 0);
        _dummy.scale.setScalar(0.001);
        _dummy.updateMatrix();
        this.smokeInst.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const t = p.life / p.maxLife;
      const sz = p.scale * (0.7 + t * 2.2) * (1 - t * 0.4);
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.quaternion.copy(this.camera.quaternion);
      _dummy.scale.setScalar(sz);
      _dummy.updateMatrix();
      this.smokeInst.setMatrixAt(i, _dummy.matrix);
    }
    if (smokeDirty) this.smokeInst.instanceMatrix.needsUpdate = true;

    let sparkDirty = false;
    for (let i = 0; i < this.sparkPool.length; i++) {
      const s = this.sparkPool[i];
      if (!s.active) continue;
      sparkDirty = true;
      s.life += dt;
      if (s.life >= s.maxLife) {
        s.active = false;
        _dummy.position.set(0, -50, 0);
        _dummy.scale.setScalar(0.001);
        _dummy.updateMatrix();
        this.sparkInst.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      s.vy -= 18 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      _dummy.position.set(s.x, s.y, s.z);
      _dummy.lookAt(s.x + s.vx, s.y + s.vy, s.z + s.vz);
      _dummy.scale.setScalar(1 - s.life / s.maxLife);
      _dummy.updateMatrix();
      this.sparkInst.setMatrixAt(i, _dummy.matrix);
    }
    if (sparkDirty) this.sparkInst.instanceMatrix.needsUpdate = true;
  }

  private tick = (): void => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(0.05, Math.max(0.001, rawDt));

    const player = this.vehicles[0];

    if (this.phase === 'garage') {
      this.garageOrbitAngle += dt * 0.28;
      if (player) {
        const radius = 6.4;
        const cx = player.x + Math.sin(this.garageOrbitAngle) * radius;
        const cz = player.z + Math.cos(this.garageOrbitAngle) * radius;
        this.camera.position.set(cx, player.y + 1.85, cz);
        this.camera.lookAt(player.x, player.y + 0.72, player.z);
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 50, 6, dt);
        this.camera.updateProjectionMatrix();

        const rig = this.carRigs.get(player.id);
        if (rig) {
          rig.updateVisuals({
            speedMs: 0,
            steerAngle: 0.24,
            pitchRad: 0,
            rollRad: 0,
            brakeIntensity: 0,
            nosActive: false,
            underglowHex: UNDERGLOWS.find((u) => u.id === this.selectedUnderglowId)?.hex ?? '#06B6D4',
            dt,
            wheelSpinAngle: 0,
          });
        }
        // Keep shadow key light centered on car
        this.keyLight.position.set(player.x + 30, player.y + 50, player.z + 25);
        this.keyLight.target.position.set(player.x, player.y, player.z);
      }
    } else if (this.phase === 'countdown') {
      this.countdownTimer -= dt;
      const countInt = Math.ceil(this.countdownTimer);
      if (countInt !== this.lastCountdownInt && countInt >= 1 && countInt <= 3) {
        this.lastCountdownInt = countInt;
        this.audio.playTone(440, 0.14, 0.2, 'triangle');
      }

      if (this.countdownTimer <= 0) {
        this.phase = 'racing';
        this.recordReplaySnapshot(0);
        this.audio.playTone(880, 0.26, 0.26, 'sawtooth');
      }

      if (player) {
        // Allow revving engine on the start line!
        const revTarget = 1100 + this.inputState.throttle * (player.spec.redlineRpm * 0.72);
        player.rpm = THREE.MathUtils.lerp(player.rpm, revTarget, dt * 10);
        this.audio.updateTelemetry({
          active: true,
          carId: player.spec.id,
          rpm: player.rpm,
          redlineRpm: player.spec.redlineRpm,
          gear: 1,
          throttle: this.inputState.throttle,
          speedKmh: 0,
          driftIntensity: 0,
          isDrifting: false,
          onKerb: false,
          nosActive: false,
        });
        this.updateCamera(player, dt);
      }
    } else if (this.phase === 'racing') {
      this.raceTimeMs += dt * 1000;

      // 2x physics sub-stepping for crisp high-speed stability
      const subSteps = 2;
      const subDt = dt / subSteps;

      for (let s = 0; s < subSteps; s++) {
        for (const v of this.vehicles) {
          if (v.isRemote) continue;
          const inp = v.isPlayer
            ? this.inputState
            : computeAiInput(v, this.vehicles, this.track, subDt);
          stepVehiclePhysics(v, inp, this.track, subDt, this.raceTimeMs, this.totalLaps);
        }
        const col = resolveVehicleCollisions(this.vehicles);
        if (col.playerHit && col.hitIntensity > 0.12) {
          this.camShake = Math.max(this.camShake, col.hitIntensity * 0.45);
          this.audio.playImpact(col.hitIntensity);
        }
      }

      // Smoothly interpolate & dead-reckon remote multiplayer vehicles
      if (this.isMultiplayer) {
        const nowMs = performance.now();
        for (const v of this.vehicles) {
          if (!v.isRemote) continue;
          const entry = this.remoteTargets.get(v.id);
          if (!entry) continue;
          const p = entry.packet;
          const ageSec = Math.min(0.12, Math.max(0, (nowMs - entry.receivedAtMs) / 1000));
          const fwdX = -Math.sin(p.yaw);
          const fwdZ = -Math.cos(p.yaw);
          const targetX = p.x + fwdX * p.forwardSpeed * ageSec;
          const targetZ = p.z + fwdZ * p.forwardSpeed * ageSec;

          const blend = Math.min(1, dt * 16);
          v.x = THREE.MathUtils.lerp(v.x, targetX, blend);
          v.y = THREE.MathUtils.lerp(v.y, p.y, blend);
          v.z = THREE.MathUtils.lerp(v.z, targetZ, blend);
          v.yaw = lerpAngle(v.yaw, p.yaw, blend);
          v.steerAngle = THREE.MathUtils.lerp(v.steerAngle, p.steerAngle, blend);
          v.pitchRad = THREE.MathUtils.lerp(v.pitchRad, p.pitchRad, blend);
          v.rollRad = THREE.MathUtils.lerp(v.rollRad, p.rollRad, blend);
          v.wheelSpinAngle = p.wheelSpinAngle;
          v.speedKmh = p.speedKmh;
          v.forwardSpeed = p.forwardSpeed;
          v.nosActive = p.nosActive;
          v.isDrifting = p.isDrifting;
          v.driftIntensity = p.driftIntensity;
          v.lap = p.lap;
          v.trackT = p.trackProgress;
          v.totalProgress = p.totalProgress;
          v.finished = p.finished;
          v.finishTimeMs = p.finishTimeMs;
        }
      }

      // Sync visual car rigs & spawn particles
      this.skidAccum += dt;
      const emitSkids = this.skidAccum >= 0.028;
      if (emitSkids) this.skidAccum = 0;

      for (const v of this.vehicles) {
        const rig = this.carRigs.get(v.id);
        if (!rig) continue;

        rig.root.position.set(v.x, v.y, v.z);
        rig.root.rotation.set(0, v.yaw, 0);

        const remoteInfo = v.isRemote ? this.remoteTargets.get(v.id) : undefined;
        const brakeAmt = v.isPlayer
          ? Math.max(this.inputState.brake, this.inputState.handbrake ? 0.9 : 0)
          : (remoteInfo?.packet.brakeIntensity ?? 0);
        rig.updateVisuals({
          speedMs: v.forwardSpeed,
          steerAngle: v.steerAngle,
          pitchRad: v.pitchRad,
          rollRad: v.rollRad,
          brakeIntensity: brakeAmt,
          nosActive: v.nosActive,
          underglowHex: v.isPlayer
            ? (UNDERGLOWS.find((u) => u.id === this.selectedUnderglowId)?.hex ?? '#06B6D4')
            : (remoteInfo?.underglowHex ?? '#000000'),
          dt,
          wheelSpinAngle: v.wheelSpinAngle,
        });

        // Twin rear tire skidmarks during drift or hard braking
        if (emitSkids && ((v.isDrifting && v.speedKmh > 25) || (brakeAmt > 0.65 && v.speedKmh > 45))) {
          const rearOffset = v.spec.wheelbase * 0.5;
          const fwdX = -Math.sin(v.yaw);
          const fwdZ = -Math.cos(v.yaw);
          const rightX = Math.cos(v.yaw);
          const rightZ = -Math.sin(v.yaw);
          const widthScale = v.isDrifting ? 0.95 + v.driftIntensity * 0.45 : 0.85;
          this.spawnSkidmark(
            v.x - fwdX * rearOffset - rightX * 0.82,
            v.y,
            v.z - fwdZ * rearOffset - rightZ * 0.82,
            v.yaw,
            widthScale
          );
          this.spawnSkidmark(
            v.x - fwdX * rearOffset + rightX * 0.82,
            v.y,
            v.z - fwdZ * rearOffset + rightZ * 0.82,
            v.yaw,
            widthScale
          );
        }

        // Tire drift smoke
        if (v.isDrifting && Math.random() < 0.72) {
          const rearOffset = v.spec.wheelbase * 0.5;
          const fwdX = -Math.sin(v.yaw);
          const fwdZ = -Math.cos(v.yaw);
          const rightX = Math.cos(v.yaw);
          const rightZ = -Math.sin(v.yaw);
          const side = Math.random() > 0.5 ? 0.85 : -0.85;
          this.spawnSmoke(
            v.x - fwdX * rearOffset + rightX * side,
            v.y,
            v.z - fwdZ * rearOffset + rightZ * side,
            v.vx,
            v.vz,
            0.9 + v.driftIntensity * 0.9
          );
        }

        if (v.wallScraping && Math.random() < 0.85) {
          this.spawnSparks(v.wallScrapePos, v.vx, v.vz);
          if (v.isPlayer) this.camShake = Math.max(this.camShake, 0.22);
        }
      }

      if (player) {
        // Track top speed, lap times, and drift score
        if (player.speedKmh > this.topSpeedKmh) {
          this.topSpeedKmh = Math.round(player.speedKmh);
        }

        if (player.lap > this.lastTrackedLap) {
          const completedLapTime = this.raceTimeMs - this.lapStartMs;
          if (this.bestLapMs === null || completedLapTime < this.bestLapMs) {
            this.bestLapMs = completedLapTime;
          }
          this.lapStartMs = this.raceTimeMs;
          this.lastTrackedLap = player.lap;
          this.audio.playTone(660, 0.22, 0.22, 'sine');
        }

        if (player.isDrifting && player.speedKmh > 40) {
          this.activeDriftPoints += dt * player.speedKmh * 2.2 * (0.5 + player.driftIntensity);
          this.driftBankTimer = 0.85;
        } else if (this.activeDriftPoints > 0) {
          this.driftBankTimer -= dt;
          if (this.driftBankTimer <= 0) {
            this.totalDriftScore += Math.round(this.activeDriftPoints);
            this.activeDriftPoints = 0;
          }
        }

        if (player.onKerb && player.speedKmh > 60) {
          this.camShake = Math.max(this.camShake, 0.06);
        }

        this.audio.updateTelemetry({
          active: true,
          carId: player.spec.id,
          rpm: player.rpm,
          redlineRpm: player.spec.redlineRpm,
          gear: player.gear,
          throttle: this.inputState.throttle,
          speedKmh: player.speedKmh,
          driftIntensity: player.driftIntensity,
          isDrifting: player.isDrifting,
          onKerb: player.onKerb,
          nosActive: player.nosActive,
        });

        this.updateCamera(player, dt);

        // Keep directional shadow frustum centered near player
        this.keyLight.position.set(player.x + 42, player.y + 68, player.z + 28);
        this.keyLight.target.position.set(player.x, player.y, player.z);

        // Record replay frame at 20 Hz (every 50ms)
        this.replayRecordAccum += dt;
        if (this.replayRecordAccum >= 0.05) {
          this.replayRecordAccum -= 0.05;
          this.recordReplaySnapshot(this.raceTimeMs);
        }

        // Emit multiplayer local telemetry at ~22 Hz
        if (this.isMultiplayer && this.callbacks.onMultiplayerTelemetry) {
          this.multiplayerSendAccum += dt;
          if (this.multiplayerSendAccum >= 0.045 || player.finished) {
            this.multiplayerSendAccum = 0;
            this.callbacks.onMultiplayerTelemetry({
              x: player.x,
              y: player.y,
              z: player.z,
              yaw: player.yaw,
              steerAngle: player.steerAngle,
              pitchRad: player.pitchRad,
              rollRad: player.rollRad,
              wheelSpinAngle: player.wheelSpinAngle,
              speedKmh: player.speedKmh,
              forwardSpeed: player.forwardSpeed,
              nosActive: player.nosActive,
              brakeIntensity: Math.max(this.inputState.brake, this.inputState.handbrake ? 0.9 : 0),
              isDrifting: player.isDrifting,
              driftIntensity: player.driftIntensity,
              lap: player.lap,
              trackProgress: player.trackT,
              totalProgress: player.totalProgress,
              finished: player.finished,
              finishTimeMs: player.finishTimeMs,
            });
          }
        }

        // Check race finish
        if (player.finished) {
          this.recordReplaySnapshot(this.raceTimeMs);
          this.totalDriftScore += Math.round(this.activeDriftPoints);
          this.activeDriftPoints = 0;
          this.phase = 'finished';
          this.audio.updateTelemetry({
            active: false,
            rpm: 950,
            redlineRpm: player.spec.redlineRpm,
            gear: 1,
            throttle: 0,
            driftIntensity: 0,
            nosActive: false,
          });
          this.audio.playTone(880, 0.35, 0.28, 'triangle');

          const sorted = [...this.vehicles].sort((a, b) => b.totalProgress - a.totalProgress);
          const pos = sorted.findIndex((r) => r.isPlayer) + 1;

          this.callbacks.onRaceFinish({
            trackId: this.selectedTrackId,
            trackName: this.track.definition.name,
            position: pos,
            totalRacers: this.vehicles.length,
            totalTimeMs: player.finishTimeMs,
            bestLapMs: this.bestLapMs ?? player.finishTimeMs,
            lapsCompleted: this.totalLaps,
            topSpeedKmh: this.topSpeedKmh,
            totalDriftScore: this.totalDriftScore,
            carName: player.spec.name,
            mode: this.raceMode,
          });
        }
      }

      this.updateParticles(dt);
    } else if (this.phase === 'replay') {
      const duration = this.getReplayDurationMs();
      if (!this.replayPaused && duration > 0) {
        this.replayPlaybackMs += dt * 1000 * this.replaySpeed;
        if (this.replayPlaybackMs >= duration) {
          this.replayPlaybackMs = duration;
          this.replayPaused = true;
        }
      }
      this.applyReplayAtTime(this.replayPlaybackMs, dt);
      this.updateParticles(dt);
    }

    // Render frame
    if (this.composer && !this.isSoftwareGl) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    // Throttle React HUD updates to ~25Hz for buttery Android performance
    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.04) {
      this.hudEmitAccum = 0;
      this.emitHud();
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private updateCamera(player: VehiclePhysicsState, dt: number): void {
    _fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    _right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));

    const speedNorm = THREE.MathUtils.clamp(player.speedKmh / 320, 0, 1.1);
    const nosBoost = player.nosActive ? 1 : 0;

    if (this.cameraMode === 'hood') {
      _camDesiredPos
        .set(player.x, player.y + 1.15, player.z)
        .addScaledVector(_fwd, 0.35);
      _camDesiredLook
        .set(player.x, player.y + 1.0, player.z)
        .addScaledVector(_fwd, 28);
      this.camPos.lerp(_camDesiredPos, Math.min(1, dt * 28));
      this.camLook.lerp(_camDesiredLook, Math.min(1, dt * 24));
      const targetFov = 68 + speedNorm * 14 + nosBoost * 8;
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 7, dt);
    } else if (this.cameraMode === 'cinematic') {
      const driftSwing = THREE.MathUtils.clamp(player.lateralSpeed * 0.16, -2.6, 2.6);
      _camDesiredPos
        .set(player.x, player.y + 1.65, player.z)
        .addScaledVector(_fwd, -(6.4 + speedNorm * 0.9))
        .addScaledVector(_right, driftSwing + 1.1);
      _camDesiredLook
        .set(player.x, player.y + 0.85, player.z)
        .addScaledVector(_fwd, 9);
      this.camPos.lerp(_camDesiredPos, Math.min(1, dt * 11));
      this.camLook.lerp(_camDesiredLook, Math.min(1, dt * 14));
      const targetFov = 60 + speedNorm * 16 + nosBoost * 9;
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 6, dt);
    } else {
      // Dynamic NFS Chase Camera: widens FOV + swings laterally during drifts
      const driftSwing = THREE.MathUtils.clamp(player.lateralSpeed * 0.14, -2.4, 2.4);
      const chaseDist = 7.4 + speedNorm * 0.85 + nosBoost * 0.7;
      const chaseHeight = 2.75 - speedNorm * 0.25;

      _camDesiredPos
        .set(player.x, player.y + chaseHeight, player.z)
        .addScaledVector(_fwd, -chaseDist)
        .addScaledVector(_right, driftSwing);
      _camDesiredLook
        .set(player.x, player.y + 1.05, player.z)
        .addScaledVector(_fwd, 8.5);

      this.camPos.lerp(_camDesiredPos, Math.min(1, dt * 14));
      this.camLook.lerp(_camDesiredLook, Math.min(1, dt * 18));

      const targetFov = 62 + speedNorm * 15 + nosBoost * 9;
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 6, dt);
    }

    // Apply decaying camera shake from kerbs / impacts / NOS
    this.camShake = Math.max(0, this.camShake - dt * 1.8);
    const totalShake = this.camShake + (player.nosActive ? 0.035 : 0);

    this.camera.position.copy(this.camPos);
    if (totalShake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * totalShake;
      this.camera.position.y += (Math.random() - 0.5) * totalShake * 0.8;
    }

    this.camera.lookAt(this.camLook);
    // Subtle roll tilt into turns for sense of velocity
    this.camera.rotation.z += -player.rollRad * 0.45;
    this.camera.updateProjectionMatrix();
  }

  private emitHud(): void {
    const player = this.vehicles[0];
    if (!player) return;

    const sorted = [...this.vehicles].sort((a, b) => b.totalProgress - a.totalProgress);
    const position = sorted.findIndex((r) => r.isPlayer) + 1;

    this.callbacks.onTelemetry({
      speedKmh: Math.round(player.speedKmh),
      rpm: Math.round(player.rpm),
      redlineRpm: player.spec.redlineRpm,
      gear: player.gear,
      nos: Math.round(player.nos),
      isNosActive: player.nosActive,
      isDrifting: player.isDrifting,
      driftScore: this.totalDriftScore,
      activeDriftPoints: Math.round(this.activeDriftPoints),
      position,
      totalRacers: this.vehicles.length,
      lap: Math.min(player.lap, this.totalLaps),
      totalLaps: this.totalLaps,
      raceTimeMs: this.raceTimeMs,
      currentLapTimeMs: Math.max(0, this.raceTimeMs - this.lapStartMs),
      bestLapTimeMs: this.bestLapMs,
      topSpeedKmh: this.topSpeedKmh,
      countdownValue: this.phase === 'countdown' ? Math.max(1, Math.ceil(this.countdownTimer)) : -1,
      racePhase: this.phase,
      wrongWay: player.wrongWay,
      replayCurrentMs: this.replayPlaybackMs,
      replayDurationMs: this.getReplayDurationMs(),
      replayPaused: this.replayPaused,
      replaySpeed: this.replaySpeed,
      racers: this.vehicles.map((v) => ({
        id: v.id,
        name: v.name,
        isPlayer: v.isPlayer,
        color: v.color,
        x: v.x,
        z: v.z,
        yaw: v.yaw,
        trackProgress: v.trackT,
        lap: v.lap,
        totalProgress: v.totalProgress,
        speedKmh: Math.round(v.speedKmh),
        finished: v.finished,
        finishTimeMs: v.finishTimeMs,
      })),
    });
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);

    this.clearCars();
    this.track.dispose();
    this.textures.dispose();
    this.skyBgTex?.dispose();
    this.envRT?.dispose();
    this.smokeInst.geometry.dispose();
    (this.smokeInst.material as THREE.Material).dispose();
    this.sparkInst.geometry.dispose();
    (this.sparkInst.material as THREE.Material).dispose();
    this.skidInst.geometry.dispose();
    (this.skidInst.material as THREE.Material).dispose();
    this.audio.dispose();

    if (this.composer) {
      this.composer.dispose();
    }
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
