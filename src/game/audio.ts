import { CarId } from './types';

export interface EngineAudioTelemetry {
  active: boolean;
  carId?: CarId;
  rpm: number;
  redlineRpm: number;
  gear: number;
  throttle: number;
  speedKmh?: number;
  driftIntensity: number;
  isDrifting?: boolean;
  onKerb?: boolean;
  nosActive: boolean;
}

function makeDistortionCurve(amount = 24): Float32Array<ArrayBuffer> {
  const samples = 256;
  const buffer = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buffer);
  const deg = Math.PI / 180;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

export class RaceAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;

  // Engine RPM synthesis nodes
  private oscSub: OscillatorNode | null = null;
  private oscPrimary: OscillatorNode | null = null;
  private oscHarmonic: OscillatorNode | null = null;
  private oscWhine: OscillatorNode | null = null;
  private engineShaper: WaveShaperNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private whineGain: GainNode | null = null;

  // Tire screech & slip-stick modulation nodes
  private tireFilterMain: BiquadFilterNode | null = null;
  private tireFilterHigh: BiquadFilterNode | null = null;
  private tireFilterScrub: BiquadFilterNode | null = null;
  private tireLfo: OscillatorNode | null = null;
  private tireLfoGain: GainNode | null = null;
  private tireGain: GainNode | null = null;

  // NOS sustained jet & turbine nodes
  private nosFilter: BiquadFilterNode | null = null;
  private nosOsc: OscillatorNode | null = null;
  private nosGain: GainNode | null = null;

  // Kerb rumble
  private kerbOsc: OscillatorNode | null = null;
  private kerbGain: GainNode | null = null;

  // Shared noise buffer for dynamic one-shot events
  private noiseBuffer: AudioBuffer | null = null;

  private muted = false;
  private initialized = false;

  // Event edge-detection state
  private lastGear = 1;
  private wasNosActive = false;
  private wasDrifting = false;
  private lastThrottle = 0;
  private lastRpmNorm = 0;
  private lastBackfireTime = 0;
  private revLimiterPhase = 0;

  public unlock(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;

      // Master bus with gentle limiter so layered events never clip on Android speakers
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -10;
      compressor.knee.value = 12;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.12;

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.42;
      compressor.connect(master);
      master.connect(ctx.destination);
      this.compressor = compressor;
      this.masterGain = master;

      // Shared 2-second white noise buffer
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = noiseBuffer;

      // 1. Multi-Oscillator Engine Synth + Saturation + Lowpass Filter
      const engineShaper = ctx.createWaveShaper();
      engineShaper.curve = makeDistortionCurve(18);
      engineShaper.oversample = '2x';

      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 380;
      engineFilter.Q.value = 2.6;

      const engineGain = ctx.createGain();
      engineGain.gain.value = 0;

      const oscSub = ctx.createOscillator();
      oscSub.type = 'triangle';
      oscSub.frequency.value = 32;

      const oscPrimary = ctx.createOscillator();
      oscPrimary.type = 'sawtooth';
      oscPrimary.frequency.value = 64;

      const oscHarmonic = ctx.createOscillator();
      oscHarmonic.type = 'sawtooth';
      oscHarmonic.frequency.value = 96;
      oscHarmonic.detune.value = 8;

      const harmonicMix = ctx.createGain();
      harmonicMix.gain.value = 0.45;

      // Electric motor / supercharger whine oscillator
      const oscWhine = ctx.createOscillator();
      oscWhine.type = 'sine';
      oscWhine.frequency.value = 280;
      const whineGain = ctx.createGain();
      whineGain.gain.value = 0;

      oscSub.connect(engineShaper);
      oscPrimary.connect(engineShaper);
      oscHarmonic.connect(harmonicMix);
      harmonicMix.connect(engineShaper);
      engineShaper.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(compressor);

      oscWhine.connect(whineGain);
      whineGain.connect(compressor);

      oscSub.start();
      oscPrimary.start();
      oscHarmonic.start();
      oscWhine.start();

      // 2. Dual-Resonance Tire Screech + Asphalt Scrub + Slip-Stick LFO
      const tireNoise = ctx.createBufferSource();
      tireNoise.buffer = noiseBuffer;
      tireNoise.loop = true;

      const tireFilterMain = ctx.createBiquadFilter();
      tireFilterMain.type = 'bandpass';
      tireFilterMain.frequency.value = 1380;
      tireFilterMain.Q.value = 7.5;

      const tireFilterHigh = ctx.createBiquadFilter();
      tireFilterHigh.type = 'bandpass';
      tireFilterHigh.frequency.value = 2650;
      tireFilterHigh.Q.value = 9.0;

      const tireHighGain = ctx.createGain();
      tireHighGain.gain.value = 0.45;

      const tireFilterScrub = ctx.createBiquadFilter();
      tireFilterScrub.type = 'bandpass';
      tireFilterScrub.frequency.value = 540;
      tireFilterScrub.Q.value = 2.2;

      const tireScrubGain = ctx.createGain();
      tireScrubGain.gain.value = 0.55;

      const tireGain = ctx.createGain();
      tireGain.gain.value = 0;

      // 22 Hz slip-stick flutter LFO modulates tire screech center frequency
      const tireLfo = ctx.createOscillator();
      tireLfo.type = 'sine';
      tireLfo.frequency.value = 21;
      const tireLfoGain = ctx.createGain();
      tireLfoGain.gain.value = 95;
      tireLfo.connect(tireLfoGain);
      tireLfoGain.connect(tireFilterMain.frequency);
      tireLfo.start();

      tireNoise.connect(tireFilterMain);
      tireNoise.connect(tireFilterHigh);
      tireNoise.connect(tireFilterScrub);
      tireFilterMain.connect(tireGain);
      tireFilterHigh.connect(tireHighGain);
      tireHighGain.connect(tireGain);
      tireFilterScrub.connect(tireScrubGain);
      tireScrubGain.connect(tireGain);
      tireGain.connect(compressor);
      tireNoise.start();

      // 3. NOS Sustained Jet Whoosh & Turbine Spool
      const nosNoise = ctx.createBufferSource();
      nosNoise.buffer = noiseBuffer;
      nosNoise.loop = true;

      const nosFilter = ctx.createBiquadFilter();
      nosFilter.type = 'bandpass';
      nosFilter.frequency.value = 1150;
      nosFilter.Q.value = 1.6;

      const nosOsc = ctx.createOscillator();
      nosOsc.type = 'triangle';
      nosOsc.frequency.value = 420;
      const nosOscGain = ctx.createGain();
      nosOscGain.gain.value = 0.16;

      const nosGain = ctx.createGain();
      nosGain.gain.value = 0;

      nosNoise.connect(nosFilter);
      nosFilter.connect(nosGain);
      nosOsc.connect(nosOscGain);
      nosOscGain.connect(nosGain);
      nosGain.connect(compressor);
      nosNoise.start();
      nosOsc.start();

      // 4. Kerb Rumble Oscillator
      const kerbOsc = ctx.createOscillator();
      kerbOsc.type = 'sawtooth';
      kerbOsc.frequency.value = 34;
      const kerbFilter = ctx.createBiquadFilter();
      kerbFilter.type = 'lowpass';
      kerbFilter.frequency.value = 110;
      const kerbGain = ctx.createGain();
      kerbGain.gain.value = 0;
      kerbOsc.connect(kerbFilter);
      kerbFilter.connect(kerbGain);
      kerbGain.connect(compressor);
      kerbOsc.start();

      this.oscSub = oscSub;
      this.oscPrimary = oscPrimary;
      this.oscHarmonic = oscHarmonic;
      this.oscWhine = oscWhine;
      this.engineShaper = engineShaper;
      this.engineFilter = engineFilter;
      this.engineGain = engineGain;
      this.whineGain = whineGain;

      this.tireFilterMain = tireFilterMain;
      this.tireFilterHigh = tireFilterHigh;
      this.tireFilterScrub = tireFilterScrub;
      this.tireLfo = tireLfo;
      this.tireLfoGain = tireLfoGain;
      this.tireGain = tireGain;

      this.nosFilter = nosFilter;
      this.nosOsc = nosOsc;
      this.nosGain = nosGain;

      this.kerbOsc = kerbOsc;
      this.kerbGain = kerbGain;

      this.initialized = true;
    } catch {
      // Web Audio unavailable
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.42, this.ctx.currentTime, 0.04);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public updateTelemetry(params: EngineAudioTelemetry): void {
    if (
      !this.initialized ||
      !this.ctx ||
      !this.oscSub ||
      !this.oscPrimary ||
      !this.oscHarmonic ||
      !this.oscWhine ||
      !this.engineFilter ||
      !this.engineGain ||
      !this.whineGain ||
      !this.tireGain ||
      !this.tireFilterMain ||
      !this.tireFilterHigh ||
      !this.tireFilterScrub ||
      !this.tireLfo ||
      !this.nosGain ||
      !this.nosFilter ||
      !this.nosOsc ||
      !this.kerbGain ||
      !this.kerbOsc
    ) {
      return;
    }

    const now = this.ctx.currentTime;
    if (!params.active) {
      this.engineGain.gain.setTargetAtTime(0, now, 0.08);
      this.whineGain.gain.setTargetAtTime(0, now, 0.08);
      this.tireGain.gain.setTargetAtTime(0, now, 0.05);
      this.nosGain.gain.setTargetAtTime(0, now, 0.05);
      this.kerbGain.gain.setTargetAtTime(0, now, 0.05);
      this.wasNosActive = false;
      this.wasDrifting = false;
      return;
    }

    const rpmNorm = Math.max(0.08, Math.min(1.06, params.rpm / params.redlineRpm));
    const speedKmh = params.speedKmh ?? 0;
    const carId = params.carId ?? 'valkyrie';

    // --- 1. Engine Revs Mapped to RPM (per-car acoustic profile) ---
    let baseLow = 42;
    let baseSpan = 165;
    let harmonicRatio = 1.5;
    let whineAmt = 0;

    if (carId === 'spectre') {
      // High-revving V10 screamer
      baseLow = 48;
      baseSpan = 195;
      harmonicRatio = 1.667;
      whineAmt = 0.025 * rpmNorm;
    } else if (carId === 'apex_rse') {
      // Electric GT prototype: deep torque hum + futuristic inverter whine
      baseLow = 36;
      baseSpan = 115;
      harmonicRatio = 2.0;
      whineAmt = 0.085 * rpmNorm;
    } else if (carId === 'cobalt_m4') {
      // Euro Track Coupe: crisp inline-6 rasp
      baseLow = 45;
      baseSpan = 174;
      harmonicRatio = 1.5;
      whineAmt = 0.02 * Math.max(0, rpmNorm - 0.45);
    } else if (carId === 'ronin_rx') {
      // Rotary Drift Spec: high-RPM twin-rotor buzz
      baseLow = 54;
      baseSpan = 212;
      harmonicRatio = 1.75;
      whineAmt = 0.03 * Math.max(0, rpmNorm - 0.3);
    } else if (carId === 'titan_gt') {
      // Supercharged V8 Muscle: deep burly rumble + blower whine
      baseLow = 34;
      baseSpan = 134;
      harmonicRatio = 1.33;
      whineAmt = 0.055 * Math.max(0, rpmNorm - 0.25);
    } else {
      // Valkyrie GT-R twin-turbo tuner
      baseLow = 44;
      baseSpan = 168;
      harmonicRatio = 1.5;
      whineAmt = 0.035 * Math.max(0, rpmNorm - 0.35);
    }

    const nosPitchBoost = params.nosActive ? 1.12 : 1.0;
    const primaryFreq = (baseLow + Math.pow(rpmNorm, 1.08) * baseSpan) * nosPitchBoost;

    this.oscPrimary.frequency.setTargetAtTime(primaryFreq, now, 0.025);
    this.oscSub.frequency.setTargetAtTime(primaryFreq * 0.5, now, 0.025);
    this.oscHarmonic.frequency.setTargetAtTime(primaryFreq * harmonicRatio, now, 0.025);
    this.oscWhine.frequency.setTargetAtTime(240 + rpmNorm * 1350 + (params.nosActive ? 320 : 0), now, 0.03);

    // Filter opens wide with RPM + throttle load + NOS
    const filterCutoff =
      260 +
      Math.pow(rpmNorm, 1.15) * 1850 +
      params.throttle * 550 +
      (params.nosActive ? 480 : 0);
    this.engineFilter.frequency.setTargetAtTime(filterCutoff, now, 0.03);

    // Redline rev-limiter bounce flutter above 96% RPM
    let limiterDip = 1.0;
    if (rpmNorm > 0.96 && params.throttle > 0.4) {
      this.revLimiterPhase += 1;
      limiterDip = this.revLimiterPhase % 3 === 0 ? 0.45 : 1.05;
    }

    const targetEngineGain =
      (carId === 'apex_rse' ? 0.11 : 0.15) +
      params.throttle * 0.12 +
      rpmNorm * 0.09;
    this.engineGain.gain.setTargetAtTime(targetEngineGain * limiterDip, now, 0.03);
    this.whineGain.gain.setTargetAtTime(whineAmt, now, 0.035);

    // Gear Shift Events (Upshift blow-off turbo flutter / Downshift rev-match bark)
    if (params.gear !== this.lastGear) {
      if (params.gear > this.lastGear && params.gear > 1) {
        this.triggerGearShift(true, carId);
      } else if (params.gear < this.lastGear && params.gear >= 1 && speedKmh > 35) {
        this.triggerGearShift(false, carId);
      }
      this.lastGear = params.gear;
    }

    // Throttle lift-off exhaust pop / backfire at high RPM
    if (
      carId !== 'apex_rse' &&
      this.lastThrottle > 0.65 &&
      params.throttle < 0.12 &&
      this.lastRpmNorm > 0.68 &&
      now - this.lastBackfireTime > 0.45
    ) {
      this.lastBackfireTime = now;
      this.triggerExhaustPop();
    }
    this.lastThrottle = params.throttle;
    this.lastRpmNorm = rpmNorm;

    // --- 2. Tire Screeching Events During Drift ---
    const driftingNow = Boolean(params.isDrifting || params.driftIntensity > 0.08);
    if (driftingNow && !this.wasDrifting && speedKmh > 35) {
      this.triggerDriftStart(params.driftIntensity);
    }
    this.wasDrifting = driftingNow;

    const slip = Math.max(0, Math.min(1, params.driftIntensity));
    const speedFactor = Math.min(1, speedKmh / 140);
    const screechLevel = slip > 0.04 ? (0.06 + slip * 0.19) * (0.45 + speedFactor * 0.55) : 0;

    this.tireGain.gain.setTargetAtTime(screechLevel, now, 0.035);
    this.tireFilterMain.frequency.setTargetAtTime(1180 + slip * 540 + speedFactor * 220, now, 0.04);
    this.tireFilterHigh.frequency.setTargetAtTime(2420 + slip * 680, now, 0.04);
    this.tireFilterScrub.frequency.setTargetAtTime(460 + speedFactor * 280, now, 0.04);
    this.tireLfo.frequency.setTargetAtTime(17 + slip * 14, now, 0.05);

    // --- 3. NOS Activation, Sustained Roar & Purge Release ---
    if (params.nosActive && !this.wasNosActive) {
      this.triggerNosActivate();
    } else if (!params.nosActive && this.wasNosActive) {
      this.triggerNosDeactivate();
    }
    this.wasNosActive = params.nosActive;

    this.nosGain.gain.setTargetAtTime(params.nosActive ? 0.24 : 0, now, 0.035);
    this.nosFilter.frequency.setTargetAtTime(params.nosActive ? 1050 + speedFactor * 550 : 900, now, 0.05);
    this.nosOsc.frequency.setTargetAtTime(params.nosActive ? 390 + speedFactor * 260 : 320, now, 0.05);

    // --- 4. Kerb Rumble ---
    const kerbActive = Boolean(params.onKerb && speedKmh > 25);
    this.kerbOsc.frequency.setTargetAtTime(26 + speedFactor * 36, now, 0.03);
    this.kerbGain.gain.setTargetAtTime(kerbActive ? 0.09 : 0, now, 0.03);
  }

  public triggerNosActivate(): void {
    if (!this.initialized || !this.ctx || !this.compressor || this.muted) return;
    const now = this.ctx.currentTime;

    // 1. Sub-bass ignition whoomp
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(135, now);
    sub.frequency.exponentialRampToValueAtTime(38, now + 0.26);
    subGain.gain.setValueAtTime(0.38, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    sub.connect(subGain);
    subGain.connect(this.compressor);
    sub.start(now);
    sub.stop(now + 0.3);

    // 2. High-pressure nitrous purge burst
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.setValueAtTime(2600, now);
      hp.frequency.exponentialRampToValueAtTime(1200, now + 0.24);
      hp.Q.value = 1.4;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.28, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      src.connect(hp);
      hp.connect(g);
      g.connect(this.compressor);
      src.start(now);
      src.stop(now + 0.28);
    }
  }

  public triggerNosDeactivate(): void {
    if (!this.initialized || !this.ctx || !this.compressor || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    // Crisp pneumatic solenoid purge tail
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(2200, now);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.compressor);
    src.start(now);
    src.stop(now + 0.18);
  }

  private triggerDriftStart(intensity: number): void {
    if (!this.initialized || !this.ctx || !this.compressor || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1750, now);
    bp.frequency.exponentialRampToValueAtTime(1320, now + 0.14);
    bp.Q.value = 8.5;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.16 * Math.max(0.4, intensity), now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.compressor);
    src.start(now);
    src.stop(now + 0.18);
  }

  private triggerGearShift(isUpshift: boolean, carId: CarId): void {
    if (!this.initialized || !this.ctx || !this.compressor || this.muted) return;
    const now = this.ctx.currentTime;

    if (isUpshift && carId !== 'apex_rse' && this.noiseBuffer) {
      // Turbo blow-off flutter chirp on upshift
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2800, now);
      bp.frequency.exponentialRampToValueAtTime(1100, now + 0.12);
      bp.Q.value = 4.2;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.12, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.compressor);
      src.start(now);
      src.stop(now + 0.15);
    } else if (!isUpshift) {
      // Quick throttle-blip bark on downshift
      this.playTone(175, 0.08, 0.1, 'sawtooth');
    }
  }

  private triggerExhaustPop(): void {
    if (!this.initialized || !this.ctx || !this.compressor || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(620, now);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.compressor);
    src.start(now);
    src.stop(now + 0.11);
  }

  public playTone(freq: number, duration = 0.15, volume = 0.2, type: OscillatorType = 'triangle'): void {
    if (!this.initialized || !this.ctx || !this.compressor || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(volume, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(g);
    g.connect(this.compressor);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playImpact(intensity: number): void {
    if (!this.initialized || !this.ctx || !this.compressor || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(125, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.2);
    g.gain.setValueAtTime(0.35 * Math.min(1, intensity), now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(g);
    g.connect(this.compressor);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  public dispose(): void {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.initialized = false;
  }
}
