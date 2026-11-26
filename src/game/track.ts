import * as THREE from 'three';
import { ProceduralTextureSet } from './textures';
import { TrackDefinition, TrackId } from './types';

export const TRACKS: TrackDefinition[] = [
  {
    id: 'midnight_bay',
    name: 'Midnight Bay Expressway',
    location: 'Coastal Highway',
    lengthLabel: '2.2 km',
    difficulty: 'Straight Highway',
    skyHex: '#080B12',
    fogHex: '#080B12',
    fogDensity: 0.0022,
    accentHex: '#F59E0B',
    groundHex: '#070A12',
    roadTintHex: '#FFFFFF',
  },
  {
    id: 'redline_canyon',
    name: 'Redline Canyon Freeway',
    location: 'Dusk Ridge Interstate',
    lengthLabel: '2.5 km',
    difficulty: 'Straight Highway',
    skyHex: '#160D16',
    fogHex: '#180E16',
    fogDensity: 0.0024,
    accentHex: '#EF4444',
    groundHex: '#120A10',
    roadTintHex: '#FDE68A',
  },
  {
    id: 'neon_docks',
    name: 'Neon Docks Highway',
    location: 'Industrial Port Causeway',
    lengthLabel: '2.0 km',
    difficulty: 'Straight Highway',
    skyHex: '#061019',
    fogHex: '#061019',
    fogDensity: 0.0023,
    accentHex: '#06B6D4',
    groundHex: '#050C14',
    roadTintHex: '#E0F2FE',
  },
  {
    id: 'tokyo_neon',
    name: 'Tokyo Shuto Expressway',
    location: 'Shinjuku Straight',
    lengthLabel: '2.5 km',
    difficulty: 'Straight Highway',
    skyHex: '#040812',
    fogHex: '#040812',
    fogDensity: 0.0020,
    accentHex: '#EC4899',
    groundHex: '#03060E',
    roadTintHex: '#F43F5E',
  },
  {
    id: 'miami_strip',
    name: 'Miami Sunshine Interstate',
    location: 'South Beach Ocean Way',
    lengthLabel: '2.2 km',
    difficulty: 'Straight Highway',
    skyHex: '#38BDF8',
    fogHex: '#BAE6FD',
    fogDensity: 0.0018,
    accentHex: '#06B6D4',
    groundHex: '#0284C7',
    roadTintHex: '#E0F2FE',
  },
  {
    id: 'alpine_pass',
    name: 'Alpine Sun Highway',
    location: 'Zurich Highland Autobahn',
    lengthLabel: '2.5 km',
    difficulty: 'Straight Highway',
    skyHex: '#0EA5E9',
    fogHex: '#E0F2FE',
    fogDensity: 0.0020,
    accentHex: '#38BDF8',
    groundHex: '#38BDF8',
    roadTintHex: '#F8FAFC',
  },
  {
    id: 'london_underground',
    name: 'London City Expressway',
    location: 'Thames Corridor',
    lengthLabel: '2.4 km',
    difficulty: 'Straight Highway',
    skyHex: '#0B101D',
    fogHex: '#0B101D',
    fogDensity: 0.0022,
    accentHex: '#6366F1',
    groundHex: '#070A14',
    roadTintHex: '#E0E7FF',
  },
  {
    id: 'chicago_loop',
    name: 'Chicago Skyway Daylight',
    location: 'Lake Shore Straight',
    lengthLabel: '2.2 km',
    difficulty: 'Straight Highway',
    skyHex: '#2563EB',
    fogHex: '#BFDBFE',
    fogDensity: 0.0019,
    accentHex: '#10B981',
    groundHex: '#1D4ED8',
    roadTintHex: '#F0FDF4',
  },
];

export function getTrackDefinition(trackId: TrackId): TrackDefinition {
  return TRACKS.find((t) => t.id === trackId) ?? TRACKS[0];
}

export function getTrackLength(trackId: TrackId): number {
  switch (trackId) {
    case 'neon_docks':
      return 2048;
    case 'chicago_loop':
    case 'miami_strip':
    case 'midnight_bay':
      return 2240;
    case 'london_underground':
      return 2400;
    case 'redline_canyon':
    case 'tokyo_neon':
    case 'alpine_pass':
    default:
      return 2560;
  }
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
  const totalLength = getTrackLength(trackId);
  const group = new THREE.Group();

  // Straight CatmullRomCurve3 along negative Z
  const curvePoints = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -totalLength * 0.5),
    new THREE.Vector3(0, 0, -totalLength),
  ];
  const curve = new THREE.CatmullRomCurve3(curvePoints, false);

  // Generate 600 equidistant straight samples along negative Z
  const samples: TrackSample[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const t = i / SAMPLE_COUNT;
    samples.push({
      point: new THREE.Vector3(0, 0, -t * totalLength),
      tangent: new THREE.Vector3(0, 0, -1),
      right: new THREE.Vector3(1, 0, 0),
      normal: new THREE.Vector3(0, 1, 0),
      t,
      bankAngle: 0,
    });
  }

  // Build straight highway road surface, kerbs, and guardrails
  // The highway geometry extends from z = 160 (behind start line) to z = -totalLength - 480 (far ahead)
  // so the straight road horizon is fully continuous and seamless!
  const startZ = 160;
  const endZ = -totalLength - 480;
  const segStep = 4.0;
  const numSteps = Math.ceil((startZ - endZ) / segStep);

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

  const uvRepeatLength = 32.0;

  for (let step = 0; step <= numSteps; step++) {
    const z = Math.max(endZ, startZ - step * segStep);
    const distAlong = -z;
    const vCoord = distAlong / uvRepeatLength;

    // Road Quad (4 lanes)
    roadPositions.push(-ROAD_HALF_WIDTH, 0, z);
    roadPositions.push(ROAD_HALF_WIDTH, 0, z);
    roadNormals.push(0, 1, 0, 0, 1, 0);
    roadUvs.push(0, vCoord, 1, vCoord);

    // Kerbs
    kerbPositions.push(-ROAD_HALF_WIDTH - 1.25, 0.04, z);
    kerbPositions.push(-ROAD_HALF_WIDTH + 0.1, 0.02, z);
    kerbPositions.push(ROAD_HALF_WIDTH - 0.1, 0.02, z);
    kerbPositions.push(ROAD_HALF_WIDTH + 1.25, 0.04, z);
    for (let k = 0; k < 4; k++) kerbNormals.push(0, 1, 0);
    const kv = distAlong / 6.0;
    kerbUvs.push(0, kv, 1, kv, 0, kv, 1, kv);

    // Guardrail Walls (Double Beam Highway Silver Guardrail)
    wallPositions.push(-WALL_HALF_WIDTH, 0, z);
    wallPositions.push(-WALL_HALF_WIDTH, 1.15, z);
    wallPositions.push(WALL_HALF_WIDTH, 0, z);
    wallPositions.push(WALL_HALF_WIDTH, 1.15, z);
    wallNormals.push(1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0);
    const wv = distAlong / 8.0;
    wallUvs.push(0, wv, 1, wv, 0, wv, 1, wv);

    if (step < numSteps) {
      const rIdx = step * 2;
      roadIndices.push(rIdx, rIdx + 1, rIdx + 2, rIdx + 1, rIdx + 3, rIdx + 2);

      const kIdx = step * 4;
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
    color: 0x94a3b8, // silver galvanized steel highway guardrail
    metalness: 0.85,
    roughness: 0.28,
    side: THREE.DoubleSide,
  });
  const wallMesh = new THREE.Mesh(wallGeo, wallMat);
  wallMesh.receiveShadow = true;
  group.add(wallMesh);

  // Guardrail Top Accent Strip & Reflectors
  const railStripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(definition.accentHex) });
  const railPostGeo = new THREE.BoxGeometry(0.18, 0.08, 3.8);
  const railStep = 16.0;
  const railCount = Math.floor((startZ - endZ) / railStep);
  const railInst = new THREE.InstancedMesh(railPostGeo, railStripMat, railCount * 2);
  const dummy = new THREE.Object3D();

  for (let i = 0; i < railCount; i++) {
    const z = startZ - i * railStep;
    // Left side rail
    dummy.position.set(-WALL_HALF_WIDTH, 1.18, z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    railInst.setMatrixAt(i * 2, dummy.matrix);

    // Right side rail
    dummy.position.set(WALL_HALF_WIDTH, 1.18, z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    railInst.setMatrixAt(i * 2 + 1, dummy.matrix);
  }
  railInst.instanceMatrix.needsUpdate = true;
  railInst.computeBoundingSphere();
  group.add(railInst);

  // Start / Finish Overhead Gantry at z = 0
  const gantryGroup = new THREE.Group();
  gantryGroup.position.set(0, 0, 0);

  const pillarGeo = new THREE.BoxGeometry(1.0, 8.4, 1.0);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.25 });
  const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
  leftPillar.position.set(-WALL_HALF_WIDTH - 0.7, 4.2, 0);
  const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
  rightPillar.position.set(WALL_HALF_WIDTH + 0.7, 4.2, 0);
  gantryGroup.add(leftPillar, rightPillar);

  const bannerGeo = new THREE.BoxGeometry(WALL_HALF_WIDTH * 2 + 2.4, 2.5, 0.8);
  const bannerMat = new THREE.MeshStandardMaterial({
    map: textures.gantryBannerMap,
    emissiveMap: textures.gantryBannerMap,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.8,
    roughness: 0.4,
  });
  const banner = new THREE.Mesh(bannerGeo, bannerMat);
  banner.position.set(0, 7.6, 0);
  gantryGroup.add(banner);
  group.add(gantryGroup);

  // Highway Directional Sign Gantries along the straight corridor (matching reference image)
  const signPositions = [-totalLength * 0.33, -totalLength * 0.67];
  const signMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.4, metalness: 0.2 }); // highway green
  const signTextMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const sz of signPositions) {
    const sGroup = new THREE.Group();
    sGroup.position.set(0, 0, sz);

    const sLeftPillar = new THREE.Mesh(pillarGeo, pillarMat);
    sLeftPillar.position.set(-WALL_HALF_WIDTH - 0.7, 4.2, 0);
    const sRightPillar = new THREE.Mesh(pillarGeo, pillarMat);
    sRightPillar.position.set(WALL_HALF_WIDTH + 0.7, 4.2, 0);
    sGroup.add(sLeftPillar, sRightPillar);

    const signBoard = new THREE.Mesh(new THREE.BoxGeometry(WALL_HALF_WIDTH * 1.8, 2.2, 0.4), signMat);
    signBoard.position.set(0, 7.5, 0);
    sGroup.add(signBoard);

    // White border strip on sign
    const signBorder = new THREE.Mesh(new THREE.BoxGeometry(WALL_HALF_WIDTH * 1.76, 0.08, 0.42), signTextMat);
    signBorder.position.set(0, 6.55, 0);
    sGroup.add(signBorder);

    group.add(sGroup);
  }

  // Ground Plane (Lush grass/terrain outside highway)
  const groundGeo = new THREE.PlaneGeometry(3600, 3600);
  groundGeo.rotateX(-Math.PI / 2);
  const isDaylight = trackId === 'miami_strip' || trackId === 'alpine_pass' || trackId === 'chicago_loop';
  const groundMat = new THREE.MeshStandardMaterial({
    color: isDaylight ? 0x2e6f40 : new THREE.Color(definition.groundHex),
    roughness: 0.75,
    metalness: 0.15,
  });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.position.set(0, -0.05, -totalLength * 0.5);
  groundMesh.receiveShadow = true;
  group.add(groundMesh);

  // Instanced Highway Streetlights (matching reference screenshot with curved heads)
  const lampStep = 32.0;
  const lampZCount = Math.floor((startZ - endZ) / lampStep);
  const totalLamps = lampZCount * 2;

  const poleGeo = new THREE.CylinderGeometry(0.12, 0.18, 7.8, 8);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.3 });
  const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, totalLamps);

  const bulbGeo = new THREE.BoxGeometry(1.6, 0.2, 0.5);
  const bulbColor = isDaylight
    ? 0xfffbeb
    : trackId === 'neon_docks'
      ? 0x67e8f9
      : trackId === 'redline_canyon'
        ? 0xfca5a5
        : 0xfef08a;
  const bulbMat = new THREE.MeshBasicMaterial({ color: bulbColor });
  const bulbInst = new THREE.InstancedMesh(bulbGeo, bulbMat, totalLamps);

  for (let i = 0; i < lampZCount; i++) {
    const z = startZ - i * lampStep;
    // Left lamp
    const lIdx = i * 2;
    dummy.position.set(-WALL_HALF_WIDTH - 0.9, 3.9, z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    poleInst.setMatrixAt(lIdx, dummy.matrix);

    dummy.position.set(-WALL_HALF_WIDTH + 0.4, 7.75, z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    bulbInst.setMatrixAt(lIdx, dummy.matrix);

    // Right lamp
    const rIdx = i * 2 + 1;
    dummy.position.set(WALL_HALF_WIDTH + 0.9, 3.9, z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    poleInst.setMatrixAt(rIdx, dummy.matrix);

    dummy.position.set(WALL_HALF_WIDTH - 0.4, 7.75, z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    bulbInst.setMatrixAt(rIdx, dummy.matrix);
  }
  poleInst.instanceMatrix.needsUpdate = true;
  poleInst.computeBoundingSphere();
  bulbInst.instanceMatrix.needsUpdate = true;
  bulbInst.computeBoundingSphere();
  group.add(poleInst, bulbInst);

  // Highway Flank Scenery:
  // 1. Trees lining the highway (matching reference image)
  const treeCount = isSoftwareGl ? 80 : 160;
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.38, 3.6, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d271d, roughness: 0.9 });
  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);

  const foliageGeo = new THREE.ConeGeometry(2.4, 6.2, 7);
  const foliageMat = new THREE.MeshStandardMaterial({
    color: isDaylight ? 0x2d6a4f : 0x1b4332,
    roughness: 0.72,
    metalness: 0.05,
  });
  const foliageInst = new THREE.InstancedMesh(foliageGeo, foliageMat, treeCount);

  let seed = trackId === 'redline_canyon' ? 109 : trackId === 'neon_docks' ? 277 : 42;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < treeCount; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const treeX = side * (WALL_HALF_WIDTH + 3.5 + rand() * 16.0);
    const treeZ = startZ - rand() * (startZ - endZ);
    const scale = 0.85 + rand() * 0.45;

    dummy.position.set(treeX, 1.8 * scale, treeZ);
    dummy.scale.set(scale, scale, scale);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(treeX, (3.6 + 2.8) * scale, treeZ);
    dummy.scale.set(scale, scale, scale);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.updateMatrix();
    foliageInst.setMatrixAt(i, dummy.matrix);
  }
  trunkInst.instanceMatrix.needsUpdate = true;
  trunkInst.computeBoundingSphere();
  foliageInst.instanceMatrix.needsUpdate = true;
  foliageInst.computeBoundingSphere();
  group.add(trunkInst, foliageInst);

  // 2. City Skylines / Canyon Monoliths further back along highway flanks
  const propCount = isSoftwareGl ? 70 : 120;
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
        emissive: new THREE.Color(isDaylight ? 0x222222 : 0xffffff),
        emissiveIntensity: isDaylight ? 0.2 : 0.85,
        roughness: 0.5,
        metalness: 0.4,
      });
  const propInst = new THREE.InstancedMesh(bGeo, bMat, propCount);

  for (let i = 0; i < propCount; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const bx = side * (WALL_HALF_WIDTH + 38 + rand() * 140);
    const bz = startZ - rand() * (startZ - endZ);
    const bw = isCanyon ? 32 + rand() * 45 : 24 + rand() * 34;
    const bd = isCanyon ? 32 + rand() * 45 : 24 + rand() * 34;
    const bh = isCanyon ? 35 + rand() * 110 : 45 + rand() * 160;

    dummy.position.set(bx, bh * 0.5 - 0.5, bz);
    dummy.rotation.set(0, rand() * Math.PI * 0.5, 0);
    dummy.scale.set(bw, bh, bd);
    dummy.updateMatrix();
    propInst.setMatrixAt(i, dummy.matrix);

    const tint = isCanyon
      ? new THREE.Color().setHSL(0.95 + (rand() - 0.5) * 0.08, 0.32, 0.48 + rand() * 0.25)
      : new THREE.Color().setHSL(0.58 + (rand() - 0.5) * 0.12, 0.22, 0.72 + rand() * 0.28);
    propInst.setColorAt(i, tint);
  }
  propInst.instanceMatrix.needsUpdate = true;
  if (propInst.instanceColor) propInst.instanceColor.needsUpdate = true;
  propInst.computeBoundingSphere();
  group.add(propInst);

  // Normalized 2D minimap points (Straight highway progress bar from bottom to top)
  const minimapPoints: { x: number; y: number }[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i += 4) {
    minimapPoints.push({
      x: 50,
      y: 90 - (i / SAMPLE_COUNT) * 80,
    });
  }

  function sampleAtProgress(t: number, out?: TrackSample): TrackSample {
    const normT = ((t % 1) + 1) % 1;
    const res = out ?? {
      point: new THREE.Vector3(),
      tangent: new THREE.Vector3(0, 0, -1),
      right: new THREE.Vector3(1, 0, 0),
      normal: new THREE.Vector3(0, 1, 0),
      t: normT,
      bankAngle: 0,
    };
    res.point.set(0, 0, -normT * totalLength);
    res.tangent.set(0, 0, -1);
    res.right.set(1, 0, 0);
    res.normal.set(0, 1, 0);
    res.t = normT;
    res.bankAngle = 0;
    return res;
  }

  function findClosestSample(x: number, z: number, _hintT?: number) {
    let normT = -z / totalLength;
    normT = ((normT % 1) + 1) % 1;
    const sample = sampleAtProgress(normT);
    return {
      sample,
      lateralOffset: x,
      distanceSq: x * x,
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
