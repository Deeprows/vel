import * as THREE from 'three';
import { ProceduralTextureSet } from './textures';
import { TrackDefinition, TrackId } from './types';

export const TRACKS: TrackDefinition[] = [
  {
    id: 'midnight_bay',
    name: 'Midnight Bay Circuit',
    location: 'Coastal Highway',
    lengthLabel: '1.85 km',
    difficulty: 'High Speed',
    skyHex: '#080B12',
    fogHex: '#080B12',
    fogDensity: 0.0022,
    accentHex: '#F59E0B',
    groundHex: '#070A12',
    roadTintHex: '#FFFFFF',
  },
  {
    id: 'redline_canyon',
    name: 'Redline Canyon Pass',
    location: 'Dusk Ridge',
    lengthLabel: '2.15 km',
    difficulty: 'Drift Heavy',
    skyHex: '#160D16',
    fogHex: '#180E16',
    fogDensity: 0.0024,
    accentHex: '#EF4444',
    groundHex: '#120A10',
    roadTintHex: '#FDE68A',
  },
  {
    id: 'neon_docks',
    name: 'Neon Docks Expressway',
    location: 'Industrial Port',
    lengthLabel: '1.68 km',
    difficulty: 'Technical',
    skyHex: '#061019',
    fogHex: '#061019',
    fogDensity: 0.0023,
    accentHex: '#06B6D4',
    groundHex: '#050C14',
    roadTintHex: '#E0F2FE',
  },
  {
    id: 'tokyo_neon',
    name: 'Tokyo Cyber-District',
    location: 'Shinjuku Loop',
    lengthLabel: '2.40 km',
    difficulty: 'High Speed',
    skyHex: '#040812',
    fogHex: '#040812',
    fogDensity: 0.0020,
    accentHex: '#EC4899',
    groundHex: '#03060E',
    roadTintHex: '#F43F5E',
  },
  {
    id: 'miami_strip',
    name: 'Miami Neon Strip',
    location: 'South Beach',
    lengthLabel: '1.95 km',
    difficulty: 'Drift Heavy',
    skyHex: '#110818',
    fogHex: '#12091A',
    fogDensity: 0.0022,
    accentHex: '#06B6D4',
    groundHex: '#0A0510',
    roadTintHex: '#38BDF8',
  },
  {
    id: 'alpine_pass',
    name: 'Alpine Snow Pass',
    location: 'Zurich Highlands',
    lengthLabel: '2.50 km',
    difficulty: 'Technical',
    skyHex: '#0B132B',
    fogHex: '#0B132B',
    fogDensity: 0.0025,
    accentHex: '#38BDF8',
    groundHex: '#070A17',
    roadTintHex: '#E2E8F0',
  },
  {
    id: 'london_underground',
    name: 'London Metropolis',
    location: 'Thames & City Loop',
    lengthLabel: '2.35 km',
    difficulty: 'Technical',
    skyHex: '#0B101D',
    fogHex: '#0B101D',
    fogDensity: 0.0022,
    accentHex: '#6366F1',
    groundHex: '#070A14',
    roadTintHex: '#E0E7FF',
  },
  {
    id: 'chicago_loop',
    name: 'Chicago Elevated',
    location: 'Windy City Skyline',
    lengthLabel: '2.10 km',
    difficulty: 'High Speed',
    skyHex: '#08121A',
    fogHex: '#08121A',
    fogDensity: 0.0021,
    accentHex: '#10B981',
    groundHex: '#040B10',
    roadTintHex: '#D1FAE5',
  },
];

export function getTrackDefinition(trackId: TrackId): TrackDefinition {
  return TRACKS.find((t) => t.id === trackId) ?? TRACKS[0];
}

function getControlPointsForTrack(trackId: TrackId): THREE.Vector3[] {
  if (trackId === 'london_underground') {
    return [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(50, 1.0, -160),
      new THREE.Vector3(170, 4.0, -260),
      new THREE.Vector3(290, 2.5, -190),
      new THREE.Vector3(340, 1.0, -80),
      new THREE.Vector3(260, 3.5, 20),
      new THREE.Vector3(330, 6.0, 130),
      new THREE.Vector3(280, 4.0, 250),
      new THREE.Vector3(140, 2.0, 220),
      new THREE.Vector3(-30, 0.5, 140),
    ];
  }

  if (trackId === 'chicago_loop') {
    return [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.5, -180),
      new THREE.Vector3(130, 3.0, -270),
      new THREE.Vector3(270, 5.5, -210),
      new THREE.Vector3(320, 3.5, -90),
      new THREE.Vector3(210, 1.5, -10),
      new THREE.Vector3(290, 4.0, 100),
      new THREE.Vector3(350, 7.0, 220),
      new THREE.Vector3(200, 4.5, 300),
      new THREE.Vector3(80, 2.0, 220),
      new THREE.Vector3(-50, 0.5, 130),
    ];
  }

  if (trackId === 'tokyo_neon') {
    return [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 1.2, -180),
      new THREE.Vector3(120, 4.5, -280),
      new THREE.Vector3(260, 8.0, -220),
      new THREE.Vector3(310, 6.0, -100),
      new THREE.Vector3(220, 3.5, 0),
      new THREE.Vector3(340, 5.0, 110),
      new THREE.Vector3(380, 8.5, 240),
      new THREE.Vector3(230, 6.0, 310),
      new THREE.Vector3(90, 2.0, 240),
      new THREE.Vector3(-60, 0.5, 160),
    ];
  }

  if (trackId === 'miami_strip') {
    return [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(50, 0.5, -140),
      new THREE.Vector3(180, 1.0, -210),
      new THREE.Vector3(300, 0.5, -160),
      new THREE.Vector3(340, 0, -40),
      new THREE.Vector3(270, 0.5, 80),
      new THREE.Vector3(150, 1.0, 190),
      new THREE.Vector3(260, 0.5, 270),
      new THREE.Vector3(100, 0, 240),
      new THREE.Vector3(-40, 0, 120),
    ];
  }

  if (trackId === 'alpine_pass') {
    return [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 2.5, -130),
      new THREE.Vector3(110, 9.0, -220),
      new THREE.Vector3(240, 16.0, -190),
      new THREE.Vector3(310, 12.0, -70),
      new THREE.Vector3(200, 6.0, 10),
      new THREE.Vector3(330, 11.0, 120),
      new THREE.Vector3(370, 18.0, 250),
      new THREE.Vector3(220, 13.0, 310),
      new THREE.Vector3(80, 6.0, 230),
      new THREE.Vector3(-50, 2.0, 140),
    ];
  }

  if (trackId === 'redline_canyon') {
    // High-elevation switchback canyon circuit built for long drifts
    return [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 1.0, -150),
      new THREE.Vector3(90, 6.5, -245),
      new THREE.Vector3(210, 12.0, -205),
      new THREE.Vector3(270, 9.0, -90),
      new THREE.Vector3(190, 4.5, -20),
      new THREE.Vector3(310, 6.0, 85),
      new THREE.Vector3(365, 10.5, 200),
      new THREE.Vector3(245, 8.0, 290),
      new THREE.Vector3(120, 3.0, 210),
      new THREE.Vector3(45, 0.5, 275),
      new THREE.Vector3(-45, 0, 155),
    ];
  }

  if (trackId === 'neon_docks') {
    // Technical industrial harbor circuit with fast 90-degree bends and chicanes
    return [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -195),
      new THREE.Vector3(75, 0.5, -255),
      new THREE.Vector3(215, 0.5, -255),
      new THREE.Vector3(275, 0, -180),
      new THREE.Vector3(275, 0, -55),
      new THREE.Vector3(175, 0, -10),
      new THREE.Vector3(175, 0, 95),
      new THREE.Vector3(270, 0.5, 165),
      new THREE.Vector3(220, 0.5, 250),
      new THREE.Vector3(65, 0, 235),
      new THREE.Vector3(0, 0, 150),
    ];
  }

  // Default: Midnight Bay Circuit
  return [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -170),
    new THREE.Vector3(45, 2.5, -290),
    new THREE.Vector3(165, 5.0, -340),
    new THREE.Vector3(285, 3.0, -295),
    new THREE.Vector3(320, 0.5, -175),
    new THREE.Vector3(245, 0, -85),
    new THREE.Vector3(315, 0, 40),
    new THREE.Vector3(370, 1.5, 165),
    new THREE.Vector3(260, 2.0, 260),
    new THREE.Vector3(110, 0.5, 235),
    new THREE.Vector3(20, 0, 160),
  ];
}

export interface TrackSample {
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  normal: THREE.Vector3;
  t: number;
  bankAngle: number;
}

export interface TrackData {
  definition: TrackDefinition;
  group: THREE.Group;
  curve: THREE.CatmullRomCurve3;
  totalLength: number;
  roadHalfWidth: number;
  wallHalfWidth: number;
  samples: TrackSample[];
  minimapPoints: { x: number; y: number }[];
  sampleAtProgress: (t: number, out?: TrackSample) => TrackSample;
  findClosestSample: (x: number, z: number, hintT?: number) => {
    sample: TrackSample;
    lateralOffset: number;
    distanceSq: number;
  };
  setWeatherWetness: (rainIntensity: number) => void;
  dispose: () => void;
}

const SAMPLE_COUNT = 600;
const ROAD_HALF_WIDTH = 11.5;
const WALL_HALF_WIDTH = 13.0;

export function createStreetTrack(
  trackId: TrackId,
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean
): TrackData {
  const definition = getTrackDefinition(trackId);
  const group = new THREE.Group();

  const controlPoints = getControlPointsForTrack(trackId);
  const curve = new THREE.CatmullRomCurve3(controlPoints, true, 'catmullrom', 0.45);
  const totalLength = curve.getLength();

  const samples: TrackSample[] = [];
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const t = i / SAMPLE_COUNT;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const right = new THREE.Vector3().crossVectors(tangent, up).normalize();

    const tNext = ((i + 3) / SAMPLE_COUNT) % 1;
    const nextTan = curve.getTangentAt(tNext).normalize();
    const turnCrossY = tangent.x * nextTan.z - tangent.z * nextTan.x;
    const bankAngle = THREE.MathUtils.clamp(turnCrossY * 1.4, -0.09, 0.09);

    const bankQuat = new THREE.Quaternion().setFromAxisAngle(tangent, bankAngle);
    right.applyQuaternion(bankQuat).normalize();
    const normal = new THREE.Vector3().crossVectors(right, tangent).normalize();

    samples.push({ point, tangent, right, normal, t, bankAngle });
  }

  const roadPositions: number[] = [];
  const roadNormals: number[] = [];
  const roadUvs: number[] = [];
  const roadIndices: number[] = [];

  const kerbPositions: number[] = [];
  const kerbNormals: number[] = [];
  const kerbUvs: number[] = [];
  const kerbIndices: number[] = [];

  const wallPositions: number[] = [];
  const wallNormals: number[] = [];
  const wallUvs: number[] = [];
  const wallIndices: number[] = [];

  const uvRepeatLength = 34;

  for (let i = 0; i <= SAMPLE_COUNT; i++) {
    const s = samples[i % SAMPLE_COUNT];
    const distAlong = (i / SAMPLE_COUNT) * totalLength;
    const vCoord = distAlong / uvRepeatLength;

    const leftEdge = s.point.clone().addScaledVector(s.right, -ROAD_HALF_WIDTH);
    const rightEdge = s.point.clone().addScaledVector(s.right, ROAD_HALF_WIDTH);

    roadPositions.push(leftEdge.x, leftEdge.y, leftEdge.z);
    roadPositions.push(rightEdge.x, rightEdge.y, rightEdge.z);
    roadNormals.push(s.normal.x, s.normal.y, s.normal.z);
    roadNormals.push(s.normal.x, s.normal.y, s.normal.z);
    roadUvs.push(0, vCoord, 1, vCoord);

    const kl0 = s.point.clone().addScaledVector(s.right, -ROAD_HALF_WIDTH - 1.25).addScaledVector(s.normal, 0.04);
    const kl1 = s.point.clone().addScaledVector(s.right, -ROAD_HALF_WIDTH + 0.1).addScaledVector(s.normal, 0.02);
    const kr0 = s.point.clone().addScaledVector(s.right, ROAD_HALF_WIDTH - 0.1).addScaledVector(s.normal, 0.02);
    const kr1 = s.point.clone().addScaledVector(s.right, ROAD_HALF_WIDTH + 1.25).addScaledVector(s.normal, 0.04);

    kerbPositions.push(kl0.x, kl0.y, kl0.z, kl1.x, kl1.y, kl1.z, kr0.x, kr0.y, kr0.z, kr1.x, kr1.y, kr1.z);
    for (let k = 0; k < 4; k++) {
      kerbNormals.push(s.normal.x, s.normal.y, s.normal.z);
    }
    const kv = distAlong / 6;
    kerbUvs.push(0, kv, 1, kv, 0, kv, 1, kv);

    const wlBot = s.point.clone().addScaledVector(s.right, -WALL_HALF_WIDTH);
    const wlTop = wlBot.clone().addScaledVector(s.normal, 1.05);
    const wrBot = s.point.clone().addScaledVector(s.right, WALL_HALF_WIDTH);
    const wrTop = wrBot.clone().addScaledVector(s.normal, 1.05);

    wallPositions.push(wlBot.x, wlBot.y, wlBot.z, wlTop.x, wlTop.y, wlTop.z, wrBot.x, wrBot.y, wrBot.z, wrTop.x, wrTop.y, wrTop.z);
    wallNormals.push(s.right.x, s.right.y, s.right.z, s.right.x, s.right.y, s.right.z);
    wallNormals.push(-s.right.x, -s.right.y, -s.right.z, -s.right.x, -s.right.y, -s.right.z);
    const wv = distAlong / 10;
    wallUvs.push(0, wv, 1, wv, 0, wv, 1, wv);

    if (i < SAMPLE_COUNT) {
      const rIdx = i * 2;
      roadIndices.push(rIdx, rIdx + 1, rIdx + 2, rIdx + 1, rIdx + 3, rIdx + 2);

      const kIdx = i * 4;
      kerbIndices.push(kIdx, kIdx + 1, kIdx + 4, kIdx + 1, kIdx + 5, kIdx + 4);
      kerbIndices.push(kIdx + 2, kIdx + 3, kIdx + 6, kIdx + 3, kIdx + 7, kIdx + 6);

      wallIndices.push(kIdx, kIdx + 4, kIdx + 1, kIdx + 1, kIdx + 4, kIdx + 5);
      wallIndices.push(kIdx + 2, kIdx + 3, kIdx + 6, kIdx + 3, kIdx + 7, kIdx + 6);
    }
  }

  // Asphalt Mesh
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3));
  roadGeo.setAttribute('normal', new THREE.Float32BufferAttribute(roadNormals, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUvs, 2));
  roadGeo.setIndex(roadIndices);

  const roadMat = isSoftwareGl
    ? new THREE.MeshStandardMaterial({
        color: new THREE.Color(definition.roadTintHex),
        map: textures.asphaltMap,
        normalMap: textures.asphaltNormalMap,
        normalScale: new THREE.Vector2(0.45, 0.45),
        roughnessMap: textures.asphaltRoughnessMap,
        roughness: 0.68,
        metalness: 0.25,
        envMapIntensity: 1.35,
      })
    : new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(definition.roadTintHex),
        map: textures.asphaltMap,
        normalMap: textures.asphaltNormalMap,
        normalScale: new THREE.Vector2(0.55, 0.55),
        roughnessMap: textures.asphaltRoughnessMap,
        roughness: 0.65,
        metalness: 0.22,
        clearcoat: 0.34,
        clearcoatRoughness: 0.38,
        clearcoatRoughnessMap: textures.asphaltRoughnessMap,
        envMapIntensity: 1.55,
      });
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  // Kerb Mesh
  const kerbGeo = new THREE.BufferGeometry();
  kerbGeo.setAttribute('position', new THREE.Float32BufferAttribute(kerbPositions, 3));
  kerbGeo.setAttribute('normal', new THREE.Float32BufferAttribute(kerbNormals, 3));
  kerbGeo.setAttribute('uv', new THREE.Float32BufferAttribute(kerbUvs, 2));
  kerbGeo.setIndex(kerbIndices);

  const kerbMat = new THREE.MeshStandardMaterial({
    map: textures.kerbMap,
    roughness: 0.65,
    metalness: 0.08,
  });
  const kerbMesh = new THREE.Mesh(kerbGeo, kerbMat);
  kerbMesh.receiveShadow = true;
  group.add(kerbMesh);

  // Guardrail Wall Mesh
  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallPositions, 3));
  wallGeo.setAttribute('normal', new THREE.Float32BufferAttribute(wallNormals, 3));
  wallGeo.setAttribute('uv', new THREE.Float32BufferAttribute(wallUvs, 2));
  wallGeo.setIndex(wallIndices);

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.72,
    roughness: 0.35,
    side: THREE.DoubleSide,
  });
  const wallMesh = new THREE.Mesh(wallGeo, wallMat);
  wallMesh.receiveShadow = true;
  group.add(wallMesh);

  // Guardrail Top Accent Strip (themed per track)
  const railStripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(definition.accentHex) });
  const railPostGeo = new THREE.BoxGeometry(0.18, 0.08, 2.2);
  const railCount = 150;
  const railInst = new THREE.InstancedMesh(railPostGeo, railStripMat, railCount * 2);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < railCount; i++) {
    const s = samples[Math.floor((i / railCount) * SAMPLE_COUNT)];
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? -1 : 1;
      const pos = s.point.clone().addScaledVector(s.right, sign * WALL_HALF_WIDTH).addScaledVector(s.normal, 1.07);
      dummy.position.copy(pos);
      dummy.lookAt(pos.clone().add(s.tangent));
      dummy.updateMatrix();
      railInst.setMatrixAt(i * 2 + side, dummy.matrix);
    }
  }
  railInst.instanceMatrix.needsUpdate = true;
  railInst.computeBoundingSphere();
  group.add(railInst);

  // Start / Finish Overhead Gantry
  const startSample = samples[0];
  const gantryGroup = new THREE.Group();
  gantryGroup.position.copy(startSample.point);
  const gantryTarget = startSample.point.clone().add(startSample.tangent);
  gantryGroup.lookAt(gantryTarget);

  const pillarGeo = new THREE.BoxGeometry(0.9, 8.2, 0.9);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 });
  const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
  leftPillar.position.set(-WALL_HALF_WIDTH - 0.5, 4.1, 0);
  const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
  rightPillar.position.set(WALL_HALF_WIDTH + 0.5, 4.1, 0);
  gantryGroup.add(leftPillar, rightPillar);

  const bannerGeo = new THREE.BoxGeometry(WALL_HALF_WIDTH * 2 + 1.8, 2.4, 0.7);
  const bannerMat = new THREE.MeshStandardMaterial({
    map: textures.gantryBannerMap,
    emissiveMap: textures.gantryBannerMap,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.75,
    roughness: 0.4,
  });
  const banner = new THREE.Mesh(bannerGeo, bannerMat);
  banner.position.set(0, 7.6, 0);
  gantryGroup.add(banner);
  group.add(gantryGroup);

  // Ground Plane
  const groundGeo = new THREE.PlaneGeometry(3400, 3400);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(definition.groundHex),
    roughness: 0.48,
    metalness: 0.5,
  });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.position.set(160, -1.6, -40);
  groundMesh.receiveShadow = true;
  group.add(groundMesh);

  // Instanced Highway Streetlights
  const lampCount = 72;
  const poleGeo = new THREE.CylinderGeometry(0.11, 0.16, 7.8, 8);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.3 });
  const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, lampCount);

  const bulbGeo = new THREE.BoxGeometry(1.5, 0.18, 0.45);
  const bulbColor = trackId === 'neon_docks' ? 0x67e8f9 : trackId === 'redline_canyon' ? 0xfca5a5 : 0xfef08a;
  const bulbMat = new THREE.MeshBasicMaterial({ color: bulbColor });
  const bulbInst = new THREE.InstancedMesh(bulbGeo, bulbMat, lampCount);

  for (let i = 0; i < lampCount; i++) {
    const s = samples[Math.floor((i / lampCount) * SAMPLE_COUNT)];
    const side = i % 2 === 0 ? -1 : 1;
    const basePos = s.point.clone().addScaledVector(s.right, side * (WALL_HALF_WIDTH + 0.9));

    dummy.position.set(basePos.x, basePos.y + 3.9, basePos.z);
    dummy.rotation.set(0, 0, 0);
    dummy.lookAt(basePos.x + s.tangent.x, basePos.y + 3.9, basePos.z + s.tangent.z);
    dummy.updateMatrix();
    poleInst.setMatrixAt(i, dummy.matrix);

    const headPos = s.point.clone().addScaledVector(s.right, side * (WALL_HALF_WIDTH - 0.3));
    dummy.position.set(headPos.x, headPos.y + 7.75, headPos.z);
    dummy.lookAt(headPos.x - s.right.x * side, headPos.y + 7.75, headPos.z - s.right.z * side);
    dummy.updateMatrix();
    bulbInst.setMatrixAt(i, dummy.matrix);
  }
  poleInst.instanceMatrix.needsUpdate = true;
  poleInst.computeBoundingSphere();
  bulbInst.instanceMatrix.needsUpdate = true;
  bulbInst.computeBoundingSphere();
  group.add(poleInst, bulbInst);

  // Scenery Props: City Towers (Midnight/Neon Docks) or Canyon Monoliths (Redline Canyon)
  const propCount = isSoftwareGl ? 90 : 140;
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  const isCanyon = trackId === 'redline_canyon';
  const bMat = isCanyon
    ? new THREE.MeshStandardMaterial({
        color: 0x3b1f2b,
        roughness: 0.88,
        metalness: 0.08,
      })
    : new THREE.MeshStandardMaterial({
        map: textures.buildingFacadeMap,
        emissiveMap: textures.buildingFacadeMap,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.85,
        roughness: 0.5,
        metalness: 0.4,
      });
  const propInst = new THREE.InstancedMesh(bGeo, bMat, propCount);

  let seed = trackId === 'redline_canyon' ? 109 : trackId === 'neon_docks' ? 277 : 42;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  let placed = 0;
  let attempts = 0;
  while (placed < propCount && attempts < 1400) {
    attempts++;
    const bx = -220 + rand() * 820;
    const bz = -540 + rand() * 980;

    let minDistSq = Infinity;
    for (let k = 0; k < SAMPLE_COUNT; k += 5) {
      const sp = samples[k].point;
      const dx = bx - sp.x;
      const dz = bz - sp.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < minDistSq) minDistSq = dSq;
    }

    if (minDistSq > 34 * 34) {
      const bw = isCanyon ? 24 + rand() * 36 : 18 + rand() * 28;
      const bd = isCanyon ? 24 + rand() * 36 : 18 + rand() * 28;
      const bh = isCanyon ? 28 + rand() * 95 : 38 + rand() * 145;
      dummy.position.set(bx, bh * 0.5 - 1.6, bz);
      dummy.rotation.set(0, rand() * Math.PI * 0.5, 0);
      dummy.scale.set(bw, bh, bd);
      dummy.updateMatrix();
      propInst.setMatrixAt(placed, dummy.matrix);

      const tint = isCanyon
        ? new THREE.Color().setHSL(0.95 + (rand() - 0.5) * 0.08, 0.32, 0.48 + rand() * 0.25)
        : new THREE.Color().setHSL(0.58 + (rand() - 0.5) * 0.12, 0.22, 0.72 + rand() * 0.28);
      propInst.setColorAt(placed, tint);
      placed++;
    }
  }
  propInst.count = placed;
  propInst.instanceMatrix.needsUpdate = true;
  if (propInst.instanceColor) propInst.instanceColor.needsUpdate = true;
  propInst.computeBoundingSphere();
  group.add(propInst);

  // Normalized 2D minimap points (0..100 SVG space)
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < SAMPLE_COUNT; i += 4) {
    const p = samples[i].point;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const span = Math.max(maxX - minX, maxZ - minZ) || 1;
  const padX = (span - (maxX - minX)) * 0.5;
  const padZ = (span - (maxZ - minZ)) * 0.5;
  const minimapPoints: { x: number; y: number }[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i += 4) {
    const p = samples[i].point;
    minimapPoints.push({
      x: 10 + ((p.x - minX + padX) / span) * 80,
      y: 10 + ((p.z - minZ + padZ) / span) * 80,
    });
  }

  function sampleAtProgress(t: number, out?: TrackSample): TrackSample {
    const normT = ((t % 1) + 1) % 1;
    const exact = normT * SAMPLE_COUNT;
    const i0 = Math.floor(exact) % SAMPLE_COUNT;
    const i1 = (i0 + 1) % SAMPLE_COUNT;
    const alpha = exact - Math.floor(exact);
    const s0 = samples[i0];
    const s1 = samples[i1];

    const res = out ?? {
      point: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      right: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      t: normT,
      bankAngle: 0,
    };

    res.point.lerpVectors(s0.point, s1.point, alpha);
    res.tangent.lerpVectors(s0.tangent, s1.tangent, alpha).normalize();
    res.right.lerpVectors(s0.right, s1.right, alpha).normalize();
    res.normal.lerpVectors(s0.normal, s1.normal, alpha).normalize();
    res.t = normT;
    res.bankAngle = THREE.MathUtils.lerp(s0.bankAngle, s1.bankAngle, alpha);
    return res;
  }

  function findClosestSample(x: number, z: number, hintT?: number) {
    let bestIdx = 0;
    let bestDistSq = Infinity;

    if (hintT !== undefined) {
      const centerIdx = Math.floor((((hintT % 1) + 1) % 1) * SAMPLE_COUNT);
      const windowRadius = 35;
      for (let offset = -windowRadius; offset <= windowRadius; offset++) {
        const idx = (centerIdx + offset + SAMPLE_COUNT) % SAMPLE_COUNT;
        const p = samples[idx].point;
        const dx = x - p.x;
        const dz = z - p.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = idx;
        }
      }
    }

    if (hintT === undefined || bestDistSq > 900) {
      bestDistSq = Infinity;
      for (let i = 0; i < SAMPLE_COUNT; i++) {
        const p = samples[i].point;
        const dx = x - p.x;
        const dz = z - p.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = i;
        }
      }
    }

    const base = samples[bestIdx];
    const relX = x - base.point.x;
    const relZ = z - base.point.z;
    const along = relX * base.tangent.x + relZ * base.tangent.z;
    const segLen = totalLength / SAMPLE_COUNT;
    const refinedT = ((bestIdx + along / segLen) / SAMPLE_COUNT + 1) % 1;
    const sample = sampleAtProgress(refinedT);

    const dx = x - sample.point.x;
    const dz = z - sample.point.z;
    const lateralOffset = dx * sample.right.x + dz * sample.right.z;

    return {
      sample,
      lateralOffset,
      distanceSq: dx * dx + dz * dz,
    };
  }

  const setWeatherWetness = (rainIntensity: number) => {
    const wet = THREE.MathUtils.clamp(rainIntensity, 0, 1);
    roadMat.roughness = THREE.MathUtils.lerp(0.65, 0.32, wet);
    roadMat.metalness = THREE.MathUtils.lerp(0.22, 0.38, wet);
    roadMat.envMapIntensity = THREE.MathUtils.lerp(1.55, 2.35, wet);
    if (!isSoftwareGl && roadMat instanceof THREE.MeshPhysicalMaterial) {
      roadMat.clearcoat = THREE.MathUtils.lerp(0.34, 0.92, wet);
      roadMat.clearcoatRoughness = THREE.MathUtils.lerp(0.38, 0.12, wet);
    }
    roadMat.needsUpdate = true;
  };

  return {
    definition,
    group,
    curve,
    totalLength,
    roadHalfWidth: ROAD_HALF_WIDTH,
    wallHalfWidth: WALL_HALF_WIDTH,
    samples,
    minimapPoints,
    sampleAtProgress,
    findClosestSample,
    setWeatherWetness,
    dispose: () => {
      group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry.dispose();
          if (Array.isArray(m.material)) {
            m.material.forEach((mat) => mat.dispose());
          } else {
            m.material.dispose();
          }
        }
      });
    },
  };
}
