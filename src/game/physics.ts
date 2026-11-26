import * as THREE from 'three';
import { TrackData } from './track';
import { CarSpec, InputState } from './types';

export interface VehiclePhysicsState {
  id: string;
  name: string;
  isPlayer: boolean;
  isRemote?: boolean;
  color: string;
  spec: CarSpec;

  // World position & orientation (yaw = 0 faces -Z)
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  angularVelocity: number;

  // Local velocity components
  forwardSpeed: number; // m/s
  lateralSpeed: number; // m/s
  speedKmh: number;

  // Suspension & steering
  steerAngle: number;
  pitchRad: number;
  rollRad: number;
  wheelSpinAngle: number;

  // Powertrain & NOS
  rpm: number;
  gear: number; // 0 = Reverse, 1..6 = Forward
  shiftTimer: number;
  nos: number; // 0..100
  nosActive: boolean;

  // Drift & surface
  isDrifting: boolean;
  driftIntensity: number; // 0..1
  onKerb: boolean;
  wallScraping: boolean;
  wallScrapePos: THREE.Vector3;

  // Race progress
  trackT: number;
  lap: number;
  maxCheckpointT: number; // prevents lap cheating
  totalProgress: number;
  finished: boolean;
  finishTimeMs: number;
  wrongWay: boolean;

  // AI parameters
  aiTargetLaneOffset: number;
  aiSkillMultiplier: number;
  aiLaneTimer: number;
}

export function createVehicleState(params: {
  id: string;
  name: string;
  isPlayer: boolean;
  isRemote?: boolean;
  color: string;
  spec: CarSpec;
  track: TrackData;
  startT: number;
  laneOffset: number;
  aiSkillMultiplier?: number;
}): VehiclePhysicsState {
  const sample = params.track.sampleAtProgress(params.startT);
  const pos = sample.point.clone().addScaledVector(sample.right, params.laneOffset);
  // yaw such that car's -Z axis aligns with sample.tangent
  const yaw = Math.atan2(-sample.tangent.x, -sample.tangent.z);

  return {
    id: params.id,
    name: params.name,
    isPlayer: params.isPlayer,
    isRemote: params.isRemote ?? false,
    color: params.color,
    spec: params.spec,
    x: pos.x,
    y: pos.y,
    z: pos.z,
    vx: 0,
    vz: 0,
    yaw,
    angularVelocity: 0,
    forwardSpeed: 0,
    lateralSpeed: 0,
    speedKmh: 0,
    steerAngle: 0,
    pitchRad: 0,
    rollRad: 0,
    wheelSpinAngle: 0,
    rpm: 950,
    gear: 1,
    shiftTimer: 0,
    nos: 100,
    nosActive: false,
    isDrifting: false,
    driftIntensity: 0,
    onKerb: false,
    wallScraping: false,
    wallScrapePos: new THREE.Vector3(),
    trackT: params.startT,
    lap: 1,
    maxCheckpointT: params.startT > 0.8 ? 0 : params.startT,
    totalProgress: params.startT > 0.8 ? params.startT - 1 : params.startT,
    finished: false,
    finishTimeMs: 0,
    wrongWay: false,
    aiTargetLaneOffset: params.laneOffset,
    aiSkillMultiplier: params.aiSkillMultiplier ?? 1.0,
    aiLaneTimer: Math.random() * 3,
  };
}

export function computeAiInput(
  v: VehiclePhysicsState,
  allVehicles: VehiclePhysicsState[],
  track: TrackData,
  dt: number
): InputState {
  v.aiLaneTimer -= dt;
  if (v.aiLaneTimer <= 0) {
    v.aiLaneTimer = 2.0 + Math.random() * 2.5;
    v.aiTargetLaneOffset = (Math.random() - 0.5) * (track.roadHalfWidth * 1.15);
  }

  // Avoid nearby cars ahead
  let laneAdjust = 0;
  for (const other of allVehicles) {
    if (other.id === v.id) continue;
    const dx = other.x - v.x;
    const dz = other.z - v.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < 180) {
      const fwdX = -Math.sin(v.yaw);
      const fwdZ = -Math.cos(v.yaw);
      const ahead = dx * fwdX + dz * fwdZ;
      if (ahead > 0 && ahead < 14) {
        const rightX = Math.cos(v.yaw);
        const rightZ = -Math.sin(v.yaw);
        const lat = dx * rightX + dz * rightZ;
        if (Math.abs(lat) < 3.2) {
          laneAdjust = lat > 0 ? -4.5 : 4.5;
        }
      }
    }
  }

  const lookaheadMeters = THREE.MathUtils.clamp(14 + Math.abs(v.forwardSpeed) * 0.48, 14, 42);
  const lookaheadT = (v.trackT + lookaheadMeters / track.totalLength) % 1;
  const targetSample = track.sampleAtProgress(lookaheadT);

  const farLookaheadT = (v.trackT + (lookaheadMeters * 1.9) / track.totalLength) % 1;
  const farSample = track.sampleAtProgress(farLookaheadT);

  const clampedOffset = THREE.MathUtils.clamp(
    v.aiTargetLaneOffset + laneAdjust,
    -track.roadHalfWidth + 2.4,
    track.roadHalfWidth - 2.4
  );

  const targetX = targetSample.point.x + targetSample.right.x * clampedOffset;
  const targetZ = targetSample.point.z + targetSample.right.z * clampedOffset;

  const toTargetX = targetX - v.x;
  const toTargetZ = targetZ - v.z;
  const desiredYaw = Math.atan2(-toTargetX, -toTargetZ);
  let angleDiff = desiredYaw - v.yaw;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

  const steer = THREE.MathUtils.clamp(angleDiff * 2.2, -1, 1);

  // Corner curvature speed control
  const curveDot = targetSample.tangent.dot(farSample.tangent);
  const cornerSeverity = 1 - THREE.MathUtils.clamp(curveDot, 0, 1);
  const targetCornerSpeedMs = THREE.MathUtils.lerp(82, 29, Math.min(1, cornerSeverity * 5.2)) * v.aiSkillMultiplier;

  let throttle = 1.0;
  let brake = 0;
  if (v.forwardSpeed > targetCornerSpeedMs) {
    throttle = 0.15;
    brake = THREE.MathUtils.clamp((v.forwardSpeed - targetCornerSpeedMs) * 0.08, 0, 0.85);
  }

  const useNos =
    cornerSeverity < 0.03 &&
    v.forwardSpeed > 28 &&
    v.nos > 35 &&
    Math.abs(angleDiff) < 0.15;

  return {
    throttle,
    brake,
    steer,
    handbrake: false,
    nos: useNos,
  };
}

export function stepVehiclePhysics(
  v: VehiclePhysicsState,
  input: InputState,
  track: TrackData,
  dt: number,
  raceTimeMs: number,
  totalLaps: number
): void {
  const spec = v.spec;
  v.wallScraping = false;

  // Forward (-Z local) and Right (+X local) unit vectors in world XZ
  const fwdX = -Math.sin(v.yaw);
  const fwdZ = -Math.cos(v.yaw);
  const rightX = Math.cos(v.yaw);
  const rightZ = -Math.sin(v.yaw);

  // Project current world velocity onto car local frame
  const vLong = v.vx * fwdX + v.vz * fwdZ;
  const vLat = v.vx * rightX + v.vz * rightZ;
  v.forwardSpeed = vLong;
  v.lateralSpeed = vLat;
  const absSpeed = Math.hypot(v.vx, v.vz);
  v.speedKmh = absSpeed * 3.6;

  // Smooth steering angle with speed-sensitive reduction (prevents twitchiness at 300 km/h)
  const speedSteerFactor = 1 / (1 + absSpeed * 0.014);
  const targetSteer = input.steer * spec.maxSteerAngle * THREE.MathUtils.lerp(1.0, 0.58, 1 - speedSteerFactor);
  const steerRate = spec.steerSpeed * (Math.abs(targetSteer) < Math.abs(v.steerAngle) ? 1.55 : 1.0);
  v.steerAngle = THREE.MathUtils.lerp(v.steerAngle, targetSteer, Math.min(1, dt * steerRate));

  // Nitrous boost management
  const canNos = input.nos && v.nos > 1.5 && input.brake < 0.2 && vLong > 5;
  v.nosActive = canNos;
  if (canNos) {
    v.nos = Math.max(0, v.nos - dt * 20);
  } else {
    // Recharge NOS passively + bonus from drifting!
    const driftBonus = v.isDrifting ? 14.0 : 0;
    const speedBonus = absSpeed > 35 ? 2.5 : 1.2;
    v.nos = Math.min(100, v.nos + dt * (speedBonus + driftBonus));
  }

  // Automatic 6-speed gearbox & RPM curve
  const maxSpeedMs = (spec.maxSpeedKmh + (v.nosActive ? spec.nosTopSpeedBonusKmh : 0)) / 3.6;
  if (v.shiftTimer > 0) {
    v.shiftTimer = Math.max(0, v.shiftTimer - dt);
  }

  if (vLong < -0.6 && input.brake > 0.2) {
    v.gear = 0; // Reverse
  } else if (v.gear === 0 && input.throttle > 0.1 && vLong >= -0.5) {
    v.gear = 1;
  }

  if (v.gear >= 1) {
    const numGears = spec.gearRatios.length;
    const gearTopSpeed = (maxSpeedMs * v.gear) / numGears;
    const gearMinSpeed = v.gear === 1 ? 0 : (maxSpeedMs * (v.gear - 1)) / numGears * 0.78;

    if (vLong > gearTopSpeed * 0.94 && v.gear < numGears && v.shiftTimer <= 0) {
      v.gear++;
      v.shiftTimer = 0.14;
    } else if (vLong < gearMinSpeed && v.gear > 1 && v.shiftTimer <= 0) {
      v.gear--;
      v.shiftTimer = 0.12;
    }

    const low = v.gear === 1 ? 0 : (maxSpeedMs * (v.gear - 1)) / numGears * 0.72;
    const high = (maxSpeedMs * v.gear) / numGears;
    const gearProgress = THREE.MathUtils.clamp((Math.max(0, vLong) - low) / Math.max(1, high - low), 0, 1);
    const targetRpm = THREE.MathUtils.lerp(1800, spec.redlineRpm, gearProgress) + (input.throttle * 650);
    v.rpm = THREE.MathUtils.lerp(v.rpm, Math.min(spec.redlineRpm + 250, Math.max(950, targetRpm)), Math.min(1, dt * 12));
  } else {
    v.rpm = THREE.MathUtils.lerp(v.rpm, 1400 + Math.abs(vLong) * 140, Math.min(1, dt * 10));
  }

  // Longitudinal forces: Engine + NOS + Brakes + Reverse + Aero Drag + Rolling Resistance
  let longForce = 0;
  const speedRatio = THREE.MathUtils.clamp(vLong / maxSpeedMs, 0, 1.15);
  const torqueFactor = vLong < 12 ? 1.12 : Math.max(0.2, 1.05 - speedRatio * 0.72);

  if (input.throttle > 0.01) {
    const shiftDip = v.shiftTimer > 0 ? 0.55 : 1.0;
    longForce += input.throttle * spec.maxEngineForce * torqueFactor * shiftDip;
  }

  if (v.nosActive) {
    longForce += spec.nosBoostForce * (vLong < maxSpeedMs ? 1.0 : 0.25);
  }

  if (input.brake > 0.01) {
    if (vLong > 1.2) {
      // Forward braking
      longForce -= input.brake * spec.brakeForce;
    } else {
      // Reverse gear
      longForce -= input.brake * spec.maxEngineForce * 0.52;
    }
  }

  if (input.handbrake && absSpeed > 2) {
    longForce -= Math.sign(vLong) * spec.brakeForce * 0.35;
  }

  // Aerodynamic drag & rolling resistance
  const aeroDrag = -0.5 * 1.225 * spec.dragCoeff * 2.1 * vLong * Math.abs(vLong);
  const rollingResist = -vLong * 22 - Math.sign(vLong) * (Math.abs(vLong) > 0.1 ? 180 : 0);
  const kerbDrag = v.onKerb ? -vLong * 28 : 0;
  longForce += aeroDrag + rollingResist + kerbDrag;

  // Weight transfer & aerodynamic downforce
  const longAccel = longForce / spec.mass;
  const downforce = spec.downforceCoeff * absSpeed * absSpeed * 0.15;
  const staticWeight = spec.mass * 9.81;
  const totalNormalForce = staticWeight + downforce;
  const weightShift = THREE.MathUtils.clamp((longAccel * 0.38) / 9.81, -0.28, 0.28);
  const frontLoadFactor = 0.5 - weightShift;
  const rearLoadFactor = 0.5 + weightShift;

  // Lateral tire & drift physics
  // When handbrake is held or lateral slip is high, rear grip drops for smooth controllable drifts
  const slipAngle = absSpeed > 2.5 ? Math.atan2(vLat, Math.max(2.0, Math.abs(vLong))) : 0;
  const handbrakeDrift = input.handbrake && absSpeed > 10;
  const highSlipDrift = Math.abs(slipAngle) > 0.21 && absSpeed > 14;
  v.isDrifting = handbrakeDrift || highSlipDrift;
  v.driftIntensity = v.isDrifting
    ? THREE.MathUtils.clamp(Math.abs(slipAngle) * 1.6 + (handbrakeDrift ? 0.35 : 0), 0, 1)
    : 0;

  // Lateral grip force opposing sideways velocity + yaw torque from steered front wheels
  const effectiveRearGrip = spec.rearGrip * (handbrakeDrift ? spec.driftGripFactor * 0.72 : v.isDrifting ? spec.driftGripFactor : 1.0);
  const effectiveFrontGrip = spec.frontGrip * (handbrakeDrift ? 0.92 : 1.0);
  const combinedGrip = (frontLoadFactor * effectiveFrontGrip + rearLoadFactor * effectiveRearGrip) * (totalNormalForce / staticWeight);

  // Cornering lateral acceleration & angular yaw response
  const lateralFriction = -vLat * (handbrakeDrift ? 3.1 : v.isDrifting ? 4.3 : 7.8) * combinedGrip;
  const turnCurvature = Math.tan(v.steerAngle) / spec.wheelbase;
  const forwardSign = vLong >= -0.5 ? 1 : -1;
  const targetYawRate = vLong * turnCurvature * (handbrakeDrift ? 1.48 : v.isDrifting ? 1.24 : 1.0) * forwardSign;

  // Responsive yaw damping (snappy turn-in, controllable drift hold)
  const yawResponsiveness = handbrakeDrift ? 7.5 : 10.5;
  v.angularVelocity = THREE.MathUtils.lerp(v.angularVelocity, targetYawRate, Math.min(1, dt * yawResponsiveness));

  // Integrate yaw first for crisp response
  v.yaw += v.angularVelocity * dt;

  // Recompute forward/right after yaw step and apply longitudinal + lateral accelerations
  const nextFwdX = -Math.sin(v.yaw);
  const nextFwdZ = -Math.cos(v.yaw);
  const nextRightX = Math.cos(v.yaw);
  const nextRightZ = -Math.sin(v.yaw);

  const newVLong = THREE.MathUtils.clamp(vLong + longAccel * dt, -26, maxSpeedMs * 1.06);
  // Subtle lateral grip preservation during steering (car turns velocity vector into new heading)
  const lateralDamp = vLat + lateralFriction * dt;
  const newVLat = THREE.MathUtils.clamp(lateralDamp, -32, 32);

  v.vx = nextFwdX * newVLong + nextRightX * newVLat;
  v.vz = nextFwdZ * newVLong + nextRightZ * newVLat;

  // Clamp total speed
  const newSpeed = Math.hypot(v.vx, v.vz);
  if (newSpeed > maxSpeedMs) {
    const scale = maxSpeedMs / newSpeed;
    v.vx *= scale;
    v.vz *= scale;
  }

  // Integrate world position
  v.x += v.vx * dt;
  v.z += v.vz * dt;
  v.wheelSpinAngle += (newVLong / 0.355) * dt;

  // Suspension pitch (squat on accel, dive on brake) & body roll (lateral G lean)
  const targetPitch = THREE.MathUtils.clamp(-longAccel * 0.0028, -0.045, 0.045);
  const lateralG = (v.angularVelocity * vLong) / 9.81;
  const targetRoll = THREE.MathUtils.clamp(lateralG * 0.032, -0.068, 0.068);
  v.pitchRad = THREE.MathUtils.lerp(v.pitchRad, targetPitch, Math.min(1, dt * 10));
  v.rollRad = THREE.MathUtils.lerp(v.rollRad, targetRoll, Math.min(1, dt * 9));

  // Track Surface Grounding, Kerb Detection, Guardrail Collision & Lap Progress
  const prevT = v.trackT;
  const closest = track.findClosestSample(v.x, v.z, prevT);
  const sample = closest.sample;
  v.trackT = sample.t;

  // Snap Y smoothly to banked track surface height at lateral offset
  const targetY = sample.point.y + closest.lateralOffset * Math.sin(sample.bankAngle);
  v.y = THREE.MathUtils.lerp(v.y, targetY, Math.min(1, dt * 24));

  v.onKerb = Math.abs(closest.lateralOffset) > track.roadHalfWidth - 0.35;

  // Wrong-way check
  const headingDot = nextFwdX * sample.tangent.x + nextFwdZ * sample.tangent.z;
  v.wrongWay = vLong > 4 && headingDot < -0.35;

  // Guardrail Wall Containment & Deflection
  const maxLat = track.wallHalfWidth - 1.15;
  if (Math.abs(closest.lateralOffset) > maxLat) {
    const sign = Math.sign(closest.lateralOffset);
    const excess = Math.abs(closest.lateralOffset) - maxLat;
    // Push car cleanly back inside guardrail
    v.x -= sample.right.x * sign * excess;
    v.z -= sample.right.z * sign * excess;

    // Velocity projection along wall normal
    const vn = v.vx * sample.right.x + v.vz * sample.right.z;
    if (vn * sign > 0) {
      // Bounce inward slightly & scrub 12% speed on scrape
      v.vx -= sample.right.x * vn * 1.28;
      v.vz -= sample.right.z * vn * 1.28;
      v.vx *= 0.9;
      v.vz *= 0.9;

      // Align car slightly toward wall tangent so players never get pinned
      const tangentYaw = Math.atan2(-sample.tangent.x, -sample.tangent.z);
      let yawErr = tangentYaw - v.yaw;
      while (yawErr > Math.PI) yawErr -= Math.PI * 2;
      while (yawErr < -Math.PI) yawErr += Math.PI * 2;
      if (Math.abs(yawErr) < Math.PI * 0.5) {
        v.yaw += yawErr * 0.18;
      }

      if (absSpeed > 12) {
        v.wallScraping = true;
        v.wallScrapePos.set(
          v.x + sample.right.x * sign * 0.95,
          v.y + 0.45,
          v.z + sample.right.z * sign * 0.95
        );
      }
    }
  }

  // Lap & Checkpoint Progress
  // Track t runs 0 -> 1. Start grid is around t = 0.98..0.99 or 0.01.
  // Require passing checkpoint sectors (0.3 -> 0.65 -> 0.9) before crossing 0!
  if (v.trackT > v.maxCheckpointT && v.trackT - v.maxCheckpointT < 0.35) {
    v.maxCheckpointT = v.trackT;
  }

  // Wrapped across finish line forward (prevT > 0.85 -> v.trackT < 0.15)
  if (prevT > 0.85 && v.trackT < 0.15 && v.maxCheckpointT > 0.72) {
    v.lap++;
    v.maxCheckpointT = v.trackT;
    if (!v.finished && v.lap > totalLaps) {
      v.finished = true;
      v.finishTimeMs = raceTimeMs;
      v.lap = totalLaps;
    }
  }

  if (v.finished) {
    v.totalProgress = totalLaps + 1 + (1 / Math.max(1, v.finishTimeMs)) * 1000;
  } else {
    // Handle pre-start grid negative offset (e.g. t = 0.985 on lap 1 before crossing line)
    const effectiveT = v.lap === 1 && v.maxCheckpointT < 0.2 && v.trackT > 0.8 ? v.trackT - 1 : v.trackT;
    v.totalProgress = (v.lap - 1) + effectiveT;
  }
}

export function resolveVehicleCollisions(vehicles: VehiclePhysicsState[]): {
  playerHit: boolean;
  hitIntensity: number;
} {
  let playerHit = false;
  let hitIntensity = 0;
  const minDist = 2.45; // effective collision radius sum

  for (let i = 0; i < vehicles.length; i++) {
    for (let j = i + 1; j < vehicles.length; j++) {
      const a = vehicles[i];
      const b = vehicles[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDist * minDist && distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = (minDist - dist) * (a.isRemote || b.isRemote ? 1.0 : 0.52);

        if (!a.isRemote) {
          a.x -= nx * overlap;
          a.z -= nz * overlap;
        }
        if (!b.isRemote) {
          b.x += nx * overlap;
          b.z += nz * overlap;
        }

        const rvx = b.vx - a.vx;
        const rvz = b.vz - a.vz;
        const velAlongNormal = rvx * nx + rvz * nz;

        if (velAlongNormal < 0) {
          const restitution = 0.35;
          const jImpulse = (-(1 + restitution) * velAlongNormal) / (1 / a.spec.mass + 1 / b.spec.mass);
          const impX = jImpulse * nx;
          const impZ = jImpulse * nz;

          if (!a.isRemote) {
            a.vx -= (impX * (b.isRemote ? 1.6 : 1.0)) / a.spec.mass;
            a.vz -= (impZ * (b.isRemote ? 1.6 : 1.0)) / a.spec.mass;
          }
          if (!b.isRemote) {
            b.vx += (impX * (a.isRemote ? 1.6 : 1.0)) / b.spec.mass;
            b.vz += (impZ * (a.isRemote ? 1.6 : 1.0)) / b.spec.mass;
          }

          if (a.isPlayer || b.isPlayer) {
            playerHit = true;
            hitIntensity = Math.max(hitIntensity, Math.min(1, Math.abs(velAlongNormal) / 18));
          }
        }
      }
    }
  }

  return { playerHit, hitIntensity };
}
