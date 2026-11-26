import * as THREE from 'three';
import { CarSpec, PaintOption } from './types';

export interface CarModelRig {
  root: THREE.Group;
  chassisGroup: THREE.Group;
  frontLeftPivot: THREE.Group;
  frontRightPivot: THREE.Group;
  wheelMeshes: THREE.Group[];
  brakeDiscMaterials: THREE.MeshStandardMaterial[];
  tailLightMaterial: THREE.MeshStandardMaterial;
  headlightSpot?: THREE.SpotLight;
  headlightCone?: THREE.Mesh;
  nosFlames: THREE.Mesh[];
  underglowMesh: THREE.Mesh;
  underglowMaterial: THREE.MeshBasicMaterial;
  bodyPaintMaterial: THREE.MeshPhysicalMaterial;
  updateVisuals: (params: {
    speedMs: number;
    steerAngle: number;
    pitchRad: number;
    rollRad: number;
    brakeIntensity: number;
    nosActive: boolean;
    underglowHex: string;
    dt: number;
    wheelSpinAngle: number;
  }) => void;
  setPaint: (paint: PaintOption) => void;
  setUnderglow: (hex: string) => void;
  dispose: () => void;
}

type WheelStyle = 'phone_dial' | 'split_y' | 'deep_5' | 'aero_turbine';

interface BodyStation {
  z: number;
  halfW: number;
  topW: number;
  botW: number;
  botY: number;
  midY: number;
  shoulderY: number;
  crownY: number;
}

function createLoftedBodyGeometry(stations: BodyStation[]): THREE.BufferGeometry {
  const ringPts = 10;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const minZ = stations[0].z;
  const spanZ = Math.max(0.001, stations[stations.length - 1].z - minZ);

  // Build vertices for each longitudinal station (clockwise in XY when looking from +Z)
  for (let i = 0; i < stations.length; i++) {
    const s = stations[i];
    const vCoord = (s.z - minZ) / spanZ;
    const pts: [number, number][] = [
      [0, s.crownY], // 0: center hood/deck crown
      [s.topW * 0.56, s.shoulderY + (s.crownY - s.shoulderY) * 0.55], // 1: inner fender crest R
      [s.topW, s.shoulderY], // 2: upper fender edge R
      [s.halfW, s.midY], // 3: wide hip/haunch beltline R
      [s.botW, s.botY], // 4: tucked rocker/sill R
      [0, s.botY - 0.01], // 5: center undertray
      [-s.botW, s.botY], // 6: tucked rocker/sill L
      [-s.halfW, s.midY], // 7: wide hip/haunch beltline L
      [-s.topW, s.shoulderY], // 8: upper fender edge L
      [-s.topW * 0.56, s.shoulderY + (s.crownY - s.shoulderY) * 0.55], // 9: inner fender crest L
    ];

    for (let j = 0; j < ringPts; j++) {
      positions.push(pts[j][0], pts[j][1], s.z);
      uvs.push(j / ringPts, vCoord);
    }
  }

  // Side quads along stations
  for (let i = 0; i < stations.length - 1; i++) {
    const rowA = i * ringPts;
    const rowB = (i + 1) * ringPts;
    for (let j = 0; j < ringPts; j++) {
      const nextJ = (j + 1) % ringPts;
      const a = rowA + j;
      const b = rowB + j;
      const c = rowA + nextJ;
      const d = rowB + nextJ;
      indices.push(a, b, c);
      indices.push(c, b, d);
    }
  }

  // Front cap (outward normal -Z)
  const frontCenterIdx = positions.length / 3;
  const s0 = stations[0];
  positions.push(0, (s0.botY + s0.crownY) * 0.5, s0.z);
  uvs.push(0.5, 0);
  for (let j = 0; j < ringPts; j++) {
    const nextJ = (j + 1) % ringPts;
    indices.push(frontCenterIdx, j, nextJ);
  }

  // Rear cap (outward normal +Z)
  const rearCenterIdx = positions.length / 3;
  const sN = stations[stations.length - 1];
  const lastRow = (stations.length - 1) * ringPts;
  positions.push(0, (sN.botY + sN.crownY) * 0.5, sN.z);
  uvs.push(0.5, 1);
  for (let j = 0; j < ringPts; j++) {
    const nextJ = (j + 1) % ringPts;
    indices.push(rearCenterIdx, lastRow + nextJ, lastRow + j);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createSideLiveryTexture(bodyStyle: CarSpec['bodyStyle'], isLeft: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 192);

  if (isLeft) {
    ctx.translate(512, 0);
    ctx.scale(-1, 1);
  }

  // Subtle door cut lines & handle indentation common to realistic bodywork
  ctx.strokeStyle = 'rgba(8, 11, 18, 0.72)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(155, 22);
  ctx.lineTo(148, 166);
  ctx.lineTo(318, 168);
  ctx.lineTo(342, 34);
  ctx.stroke();

  // Flush door handle accent
  ctx.fillStyle = 'rgba(12, 16, 24, 0.78)';
  ctx.fillRect(286, 56, 30, 8);

  if (bodyStyle === 'wedge_exotic') {
    // Iconic Diablo SV bold sweeping side decal + silver fuel filler cap
    ctx.save();
    ctx.fillStyle = '#090b10';
    ctx.beginPath();
    ctx.moveTo(126, 152);
    ctx.bezierCurveTo(210, 146, 275, 118, 336, 72);
    ctx.lineTo(372, 72);
    ctx.bezierCurveTo(315, 128, 228, 156, 134, 162);
    ctx.closePath();
    ctx.fill();

    // Stylized slanted SV lettering matching classic wedge supercar graphic
    ctx.translate(274, 108);
    ctx.transform(1, 0, -0.42, 1, 0, 0);
    ctx.font = '900 84px sans-serif';
    ctx.fillStyle = '#090b10';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SV', 0, 0);
    ctx.restore();

    // Brushed alloy fuel filler cap on rear quarter panel
    ctx.beginPath();
    ctx.arc(386, 56, 15, 0, Math.PI * 2);
    ctx.fillStyle = '#94a3b8';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#1e293b';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(386, 56, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#475569';
    ctx.fill();
  } else if (bodyStyle === 'tuner') {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
    ctx.fillRect(92, 140, 290, 9);
    ctx.fillStyle = 'rgba(220, 38, 38, 0.9)';
    ctx.fillRect(92, 151, 210, 4);
    ctx.font = '900 22px sans-serif';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('GT-R', 102, 72);
  } else if (bodyStyle === 'hypercar') {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.beginPath();
    ctx.moveTo(315, 24);
    ctx.lineTo(395, 24);
    ctx.lineTo(366, 168);
    ctx.lineTo(295, 168);
    ctx.closePath();
    ctx.fill();
    ctx.font = '900 26px sans-serif';
    ctx.fillStyle = '#f59e0b';
    ctx.fillText('V10', 324, 146);
  } else if (bodyStyle === 'rotary') {
    ctx.fillStyle = 'rgba(10, 14, 22, 0.84)';
    ctx.beginPath();
    ctx.moveTo(118, 156);
    ctx.lineTo(365, 92);
    ctx.lineTo(372, 118);
    ctx.lineTo(132, 170);
    ctx.closePath();
    ctx.fill();
    ctx.font = '900 32px sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('RX7', 165, 134);
  } else if (bodyStyle === 'muscle') {
    ctx.fillStyle = 'rgba(9, 11, 16, 0.88)';
    ctx.fillRect(88, 136, 310, 16);
    ctx.font = '900 28px sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('V8 SC', 105, 128);
  } else if (bodyStyle === 'le_mans') {
    // Racing roundel 09 + endurance aero stripe
    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
    ctx.fillRect(72, 138, 345, 14);
    ctx.beginPath();
    ctx.arc(236, 98, 38, 0, Math.PI * 2);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();
    ctx.font = '900 40px sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('09', 236, 100);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createWheelAssembly(
  radius: number,
  width: number,
  wheelStyle: WheelStyle,
  brakeMat: THREE.MeshStandardMaterial,
  tireMat: THREE.MeshStandardMaterial,
  rimMat: THREE.MeshStandardMaterial,
  darkRimMat: THREE.MeshStandardMaterial,
  caliperMat: THREE.MeshStandardMaterial,
  isLeft: boolean
): { mount: THREE.Group; spinGroup: THREE.Group } {
  const mount = new THREE.Group();
  const spinGroup = new THREE.Group();
  mount.add(spinGroup);

  const dir = isLeft ? -1 : 1;

  // 1. Thick sculpted tire tread + beveled sidewalls
  const tireGeo = new THREE.CylinderGeometry(radius, radius, width * 0.86, 30);
  tireGeo.rotateZ(Math.PI / 2);
  const tire = new THREE.Mesh(tireGeo, tireMat);
  tire.castShadow = true;
  spinGroup.add(tire);

  const shoulderGeo = new THREE.CylinderGeometry(radius * 0.93, radius, width * 0.09, 30);
  shoulderGeo.rotateZ(Math.PI / 2);
  for (const side of [-1, 1]) {
    const sh = new THREE.Mesh(shoulderGeo, tireMat);
    sh.position.x = side * (width * 0.455);
    if (side === -1) sh.rotation.y = Math.PI;
    spinGroup.add(sh);
  }

  // 2. Deep-dish dark inner barrel & stepped polished rim lip
  const innerBarrelGeo = new THREE.CylinderGeometry(radius * 0.70, radius * 0.70, width * 0.95, 26);
  innerBarrelGeo.rotateZ(Math.PI / 2);
  const innerBarrel = new THREE.Mesh(innerBarrelGeo, darkRimMat);
  spinGroup.add(innerBarrel);

  const lipGeo = new THREE.TorusGeometry(radius * 0.68, 0.019, 10, 30);
  lipGeo.rotateY(Math.PI / 2);
  const lip = new THREE.Mesh(lipGeo, rimMat);
  lip.position.x = dir * (width * 0.45);
  spinGroup.add(lip);

  // 3. Rim face tailored to car archetype
  if (wheelStyle === 'phone_dial') {
    // Classic Diablo SV 5-hole concave "phone dial" forged alloy face
    const faceGeo = new THREE.CylinderGeometry(radius * 0.66, radius * 0.62, 0.036, 28);
    faceGeo.rotateZ(Math.PI / 2);
    const face = new THREE.Mesh(faceGeo, rimMat);
    face.position.x = dir * (width * 0.36);
    spinGroup.add(face);

    const holeGeo = new THREE.CylinderGeometry(radius * 0.145, radius * 0.145, 0.044, 16);
    holeGeo.rotateZ(Math.PI / 2);
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      const hole = new THREE.Mesh(holeGeo, darkRimMat);
      hole.position.set(
        dir * (width * 0.368),
        Math.cos(a) * radius * 0.39,
        Math.sin(a) * radius * 0.39
      );
      spinGroup.add(hole);
    }
  } else if (wheelStyle === 'aero_turbine') {
    const bladeGeo = new THREE.BoxGeometry(0.025, radius * 0.64, 0.068);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8;
      const blade = new THREE.Mesh(bladeGeo, rimMat);
      blade.position.set(
        dir * (width * 0.39),
        Math.cos(a) * radius * 0.35,
        Math.sin(a) * radius * 0.35
      );
      blade.rotation.x = a + 0.32;
      spinGroup.add(blade);
    }
  } else if (wheelStyle === 'deep_5') {
    const spokeGeo = new THREE.BoxGeometry(0.034, radius * 0.65, 0.056);
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      const spoke = new THREE.Mesh(spokeGeo, rimMat);
      spoke.position.set(
        dir * (width * 0.38),
        Math.cos(a) * radius * 0.36,
        Math.sin(a) * radius * 0.36
      );
      spoke.rotation.x = a;
      spinGroup.add(spoke);
    }
  } else {
    // Split 5-Y forged alloy design (10 angled spokes)
    const spokeGeo = new THREE.BoxGeometry(0.028, radius * 0.64, 0.032);
    for (let i = 0; i < 5; i++) {
      const baseAngle = (i * Math.PI * 2) / 5;
      for (const splay of [-0.17, 0.17]) {
        const spoke = new THREE.Mesh(spokeGeo, rimMat);
        const angle = baseAngle + splay;
        const midR = radius * 0.36;
        spoke.position.set(
          dir * (width * 0.40),
          Math.cos(angle) * midR,
          Math.sin(angle) * midR
        );
        spoke.rotation.x = angle - splay * 0.55;
        spinGroup.add(spoke);
      }
    }
  }

  // Center lock / hub + lug cap
  const hubGeo = new THREE.CylinderGeometry(radius * 0.17, radius * 0.19, width * 0.96, 16);
  hubGeo.rotateZ(Math.PI / 2);
  const hub = new THREE.Mesh(hubGeo, darkRimMat);
  spinGroup.add(hub);

  const capGeo = new THREE.CylinderGeometry(radius * 0.095, radius * 0.095, width * 1.0, 12);
  capGeo.rotateZ(Math.PI / 2);
  const cap = new THREE.Mesh(capGeo, caliperMat);
  spinGroup.add(cap);

  // Slotted brake rotor disc (spins with wheel)
  const discGeo = new THREE.CylinderGeometry(radius * 0.54, radius * 0.54, 0.032, 22);
  discGeo.rotateZ(Math.PI / 2);
  const disc = new THREE.Mesh(discGeo, brakeMat);
  disc.position.x = dir * (width * 0.12);
  spinGroup.add(disc);

  // Stationary Brembo brake caliper mounted inboard behind spokes
  const caliperGeo = new THREE.BoxGeometry(0.085, radius * 0.38, radius * 0.22);
  const caliper = new THREE.Mesh(caliperGeo, caliperMat);
  caliper.position.set(dir * (width * 0.16), radius * 0.24, radius * 0.28);
  caliper.rotation.x = -0.35;
  mount.add(caliper);

  return { mount, spinGroup };
}

function createArchFlare(
  archRadius: number,
  archWidth: number,
  material: THREE.Material
): THREE.Mesh {
  const shape = new THREE.Shape();
  const outerR = archRadius + 0.115;
  const innerR = archRadius + 0.015;
  shape.absarc(0, 0, outerR, 0, Math.PI, false);
  shape.absarc(0, 0, innerR, Math.PI, 0, true);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: archWidth,
    bevelEnabled: true,
    bevelThickness: 0.028,
    bevelSize: 0.022,
    bevelSegments: 2,
    curveSegments: 20,
  });
  geo.translate(0, 0, -archWidth * 0.5);
  geo.rotateY(Math.PI / 2);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createCarModel(
  spec: CarSpec,
  paint: PaintOption,
  underglowHex: string,
  contactShadowMap: THREE.Texture,
  isPlayer: boolean,
  isSoftwareGl: boolean,
  headlightProjectionMap?: THREE.Texture
): CarModelRig {
  const root = new THREE.Group();
  const chassisGroup = new THREE.Group();
  root.add(chassisGroup);

  const halfL = spec.length * 0.5;
  const halfW = spec.width * 0.5;
  const wheelRadius = 0.355;
  const wheelWidth = 0.29;
  const frontAxleZ = -spec.wheelbase * 0.48;
  const rearAxleZ = spec.wheelbase * 0.52;
  const createdTextures: THREE.Texture[] = [];

  // Materials
  const bodyPaintMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(paint.hex),
    metalness: paint.metalness,
    roughness: paint.roughness,
    clearcoat: paint.clearcoat,
    clearcoatRoughness: 0.06,
    iridescence: paint.iridescence ?? 0,
    iridescenceIOR: 1.45,
    envMapIntensity: 1.55,
  });

  const carbonMat = new THREE.MeshPhysicalMaterial({
    color: 0x11151e,
    metalness: 0.32,
    roughness: 0.38,
    clearcoat: 0.58,
    clearcoatRoughness: 0.16,
  });

  const darkTrimMat = new THREE.MeshStandardMaterial({
    color: 0x090c12,
    metalness: 0.22,
    roughness: 0.82,
  });

  const interiorMat = new THREE.MeshStandardMaterial({
    color: 0x171b24,
    metalness: 0.08,
    roughness: 0.9,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x070c16,
    metalness: 0.12,
    roughness: 0.04,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    transparent: true,
    opacity: 0.62,
    envMapIntensity: 1.95,
  });

  const headlightLensMat = new THREE.MeshPhysicalMaterial({
    color: 0xdbeafe,
    metalness: 0.1,
    roughness: 0.05,
    clearcoat: 1.0,
    transparent: true,
    opacity: 0.44,
  });

  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x12141a,
    roughness: 0.88,
    metalness: 0.04,
  });

  const rimMat = new THREE.MeshStandardMaterial({
    color:
      spec.bodyStyle === 'wedge_exotic'
        ? 0xd6d3d1
        : spec.bodyStyle === 'rotary'
          ? 0xe2e8f0
          : 0xd1d5db,
    metalness: 0.93,
    roughness: 0.17,
  });

  const darkRimMat = new THREE.MeshStandardMaterial({
    color: 0x181f2c,
    metalness: 0.78,
    roughness: 0.32,
  });

  const caliperMat = new THREE.MeshStandardMaterial({
    color:
      spec.bodyStyle === 'ev_gt'
        ? 0x06b6d4
        : spec.bodyStyle === 'muscle' || spec.bodyStyle === 'wedge_exotic'
          ? 0xf59e0b
          : 0xef4444,
    metalness: 0.55,
    roughness: 0.32,
  });

  const brakeDiscMaterial = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    metalness: 0.88,
    roughness: 0.28,
    emissive: new THREE.Color(0xff4500),
    emissiveIntensity: 0,
  });

  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xe0f2fe,
    emissive: new THREE.Color(0xbae6fd),
    emissiveIntensity: 2.7,
    roughness: 0.1,
  });

  const amberMarkerMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: new THREE.Color(0xf59e0b),
    emissiveIntensity: 1.5,
    roughness: 0.2,
  });

  const tailLightMaterial = new THREE.MeshStandardMaterial({
    color: 0x991b1b,
    emissive: new THREE.Color(0xef4444),
    emissiveIntensity: 1.45,
    roughness: 0.18,
  });

  // 1. Compound-Tapered Sculpted Lower Body Shell (unique per car archetype)
  const isWedge = spec.bodyStyle === 'wedge_exotic' || spec.bodyStyle === 'le_mans';
  const isMuscle = spec.bodyStyle === 'muscle';
  const noseH = isWedge ? 0.36 : spec.bodyStyle === 'hypercar' ? 0.42 : isMuscle ? 0.56 : 0.47;
  const hoodPeakH = isWedge ? 0.64 : isMuscle ? 0.78 : spec.bodyStyle === 'hypercar' ? 0.65 : 0.71;
  const deckH = isWedge ? 0.83 : isMuscle ? 0.88 : 0.84;

  const stations: BodyStation[] = [
    { z: -halfL - 0.04, halfW: halfW * 0.72, topW: halfW * 0.58, botW: halfW * 0.68, botY: 0.21, midY: 0.30, shoulderY: noseH - 0.04, crownY: noseH - 0.01 },
    { z: -halfL + 0.34, halfW: halfW * 0.91, topW: halfW * 0.74, botW: halfW * 0.84, botY: 0.20, midY: 0.42, shoulderY: noseH + 0.10, crownY: noseH + 0.12 },
    { z: frontAxleZ, halfW: halfW * 0.99, topW: halfW * 0.80, botW: halfW * 0.88, botY: 0.20, midY: 0.48, shoulderY: hoodPeakH - 0.04, crownY: hoodPeakH - 0.01 },
    { z: -0.78, halfW: halfW * 0.94, topW: halfW * 0.78, botW: halfW * 0.86, botY: 0.20, midY: 0.50, shoulderY: hoodPeakH, crownY: hoodPeakH + 0.03 },
    { z: 0.05, halfW: halfW * 0.91, topW: halfW * 0.76, botW: halfW * 0.85, botY: 0.20, midY: 0.51, shoulderY: 0.74, crownY: 0.76 },
    { z: 0.75, halfW: halfW * 0.99, topW: halfW * 0.82, botW: halfW * 0.89, botY: 0.21, midY: 0.54, shoulderY: deckH - 0.03, crownY: deckH },
    { z: rearAxleZ, halfW: halfW * 1.01, topW: halfW * 0.84, botW: halfW * 0.91, botY: 0.22, midY: 0.56, shoulderY: deckH, crownY: deckH + 0.03 },
    { z: halfL - 0.24, halfW: halfW * 0.95, topW: halfW * 0.80, botW: halfW * 0.86, botY: 0.25, midY: 0.56, shoulderY: deckH - 0.01, crownY: deckH + 0.01 },
    { z: halfL + 0.02, halfW: halfW * 0.88, topW: halfW * 0.76, botW: halfW * 0.80, botY: 0.28, midY: 0.55, shoulderY: deckH - 0.04, crownY: deckH - 0.02 },
  ];

  const mainBodyGeo = createLoftedBodyGeometry(stations);
  const mainBody = new THREE.Mesh(mainBodyGeo, bodyPaintMaterial);
  mainBody.castShadow = true;
  mainBody.receiveShadow = true;
  chassisGroup.add(mainBody);

  // Dark inner floorpan / undertray
  const floorGeo = new THREE.BoxGeometry(spec.width * 0.76, 0.14, spec.length * 0.88);
  const floorMesh = new THREE.Mesh(floorGeo, darkTrimMat);
  floorMesh.position.set(0, 0.24, 0);
  chassisGroup.add(floorMesh);

  // 2. Sculpted Wheel Arch Overfenders + Deep Dark Wheel Wells
  const wellGeo = new THREE.CylinderGeometry(wheelRadius + 0.075, wheelRadius + 0.075, 0.36, 18, 1, false, 0, Math.PI);
  wellGeo.rotateZ(Math.PI / 2);
  for (const axleZ of [frontAxleZ, rearAxleZ]) {
    for (const side of [-1, 1]) {
      const well = new THREE.Mesh(wellGeo, darkTrimMat);
      well.position.set(side * (halfW - 0.21), wheelRadius - 0.01, axleZ);
      chassisGroup.add(well);

      const arch = createArchFlare(wheelRadius, 0.21, bodyPaintMaterial);
      arch.position.set(side * (halfW - 0.065), wheelRadius - 0.02, axleZ);
      chassisGroup.add(arch);
    }
  }

  // 3. Bespoke Side Livery Decal & Panel Cut-Line Flanks
  const sideDecalWidth = spec.wheelbase * 0.72;
  const sideDecalGeo = new THREE.PlaneGeometry(sideDecalWidth, 0.46);
  for (const side of [-1, 1]) {
    const decalTex = createSideLiveryTexture(spec.bodyStyle, side === -1);
    createdTextures.push(decalTex);
    const decalMat = new THREE.MeshPhysicalMaterial({
      map: decalTex,
      transparent: true,
      roughness: 0.22,
      metalness: 0.15,
      clearcoat: 0.9,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const flank = new THREE.Mesh(sideDecalGeo, decalMat);
    flank.position.set(side * (halfW * 0.935), 0.48, 0.06);
    flank.rotation.y = side === 1 ? Math.PI / 2 : -Math.PI / 2;
    chassisGroup.add(flank);
  }

  // 4. Sculpted Greenhouse + Visible Interior Cockpit + Flying C-Pillar Buttresses
  const cabFront = isWedge || spec.bodyStyle === 'hypercar' ? -1.14 : -0.82;
  const cabPeakFront = isWedge ? -0.32 : -0.18;
  const cabPeakRear = isWedge ? 0.56 : 0.62;
  const cabRear = isMuscle ? 1.24 : 1.38;
  const cabinWidth = spec.width * 0.65;

  // Interior bucket seats, center tunnel, dashboard & steering wheel visible through tinted glass
  const interiorTub = new THREE.Mesh(
    new THREE.BoxGeometry(cabinWidth * 0.88, 0.22, 1.42),
    interiorMat
  );
  interiorTub.position.set(0, 0.66, 0.12);
  chassisGroup.add(interiorTub);

  const dashMesh = new THREE.Mesh(
    new THREE.BoxGeometry(cabinWidth * 0.84, 0.14, 0.36),
    darkTrimMat
  );
  dashMesh.position.set(0, 0.80, cabFront + 0.56);
  chassisGroup.add(dashMesh);

  const wheelRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.14, 0.022, 8, 18),
    darkTrimMat
  );
  wheelRing.position.set(-cabinWidth * 0.24, 0.84, cabFront + 0.72);
  wheelRing.rotation.x = 0.32;
  chassisGroup.add(wheelRing);

  const seatGeo = new THREE.BoxGeometry(0.36, 0.42, 0.34);
  for (const sx of [-cabinWidth * 0.24, cabinWidth * 0.24]) {
    const seat = new THREE.Mesh(seatGeo, interiorMat);
    seat.position.set(sx, 0.84, 0.24);
    seat.rotation.x = -0.22;
    chassisGroup.add(seat);
  }

  // Tinted Glass Canopy
  const cabinShape = new THREE.Shape();
  cabinShape.moveTo(cabFront, 0.66);
  cabinShape.lineTo(cabPeakFront, spec.height);
  cabinShape.lineTo(cabPeakRear, spec.height - 0.02);
  cabinShape.lineTo(cabRear, 0.76);
  cabinShape.closePath();

  const cabinGeo = new THREE.ExtrudeGeometry(cabinShape, {
    depth: cabinWidth,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.055,
    bevelSegments: 3,
  });
  cabinGeo.translate(0, 0, -cabinWidth * 0.5);
  cabinGeo.rotateY(Math.PI / 2);
  cabinGeo.computeVertexNormals();

  const cabin = new THREE.Mesh(cabinGeo, glassMat);
  cabin.castShadow = true;
  chassisGroup.add(cabin);

  // Painted Roof Panel (or panoramic tinted glass on EV GT)
  const roofGeo = new THREE.BoxGeometry(cabinWidth * 0.92, 0.055, cabPeakRear - cabPeakFront + 0.12);
  const roofCap = new THREE.Mesh(
    roofGeo,
    spec.bodyStyle === 'ev_gt' ? glassMat : bodyPaintMaterial
  );
  roofCap.position.set(0, spec.height + 0.025, (cabPeakFront + cabPeakRear) * 0.5);
  roofCap.castShadow = true;
  chassisGroup.add(roofCap);

  // Black A-Pillars framing the front windshield
  const aPillarLen = Math.hypot(cabPeakFront - cabFront, spec.height - 0.68);
  const aPillarAngle = Math.atan2(spec.height - 0.68, cabPeakFront - cabFront);
  const aPillarGeo = new THREE.BoxGeometry(0.055, 0.045, aPillarLen);
  for (const side of [-1, 1]) {
    const ap = new THREE.Mesh(aPillarGeo, darkTrimMat);
    ap.position.set(
      side * (cabinWidth * 0.5 + 0.015),
      (0.68 + spec.height) * 0.5 + 0.01,
      (cabFront + cabPeakFront) * 0.5
    );
    ap.rotation.x = aPillarAngle - Math.PI / 2;
    chassisGroup.add(ap);
  }

  // Painted C-Pillar Flying Buttresses / Sail Panels (signature Diablo SV & exotic look)
  const buttressShape = new THREE.Shape();
  buttressShape.moveTo(cabPeakRear - 0.06, spec.height + 0.02);
  buttressShape.lineTo(cabRear + 0.24, deckH + 0.01);
  buttressShape.lineTo(cabRear + 0.24, deckH - 0.08);
  buttressShape.lineTo(cabPeakRear - 0.06, spec.height - 0.14);
  buttressShape.closePath();

  const buttressGeo = new THREE.ExtrudeGeometry(buttressShape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  buttressGeo.translate(0, 0, -0.07);
  buttressGeo.rotateY(Math.PI / 2);
  buttressGeo.computeVertexNormals();

  for (const side of [-1, 1]) {
    const bt = new THREE.Mesh(buttressGeo, bodyPaintMaterial);
    bt.position.x = side * (cabinWidth * 0.48);
    bt.castShadow = true;
    chassisGroup.add(bt);
  }

  // Twin Roof/Quarter NACA Intake Scoops (Diablo SV / Hypercar) + Dorsal Fin (Le Mans)
  if (spec.bodyStyle === 'wedge_exotic') {
    const scoopPodGeo = new THREE.BoxGeometry(0.24, 0.085, 0.44);
    const scoopMouthGeo = new THREE.BoxGeometry(0.18, 0.055, 0.06);
    for (const sx of [-0.34, 0.34]) {
      const pod = new THREE.Mesh(scoopPodGeo, bodyPaintMaterial);
      pod.position.set(sx, spec.height - 0.04, 0.72);
      pod.rotation.x = 0.18;
      chassisGroup.add(pod);

      const mouth = new THREE.Mesh(scoopMouthGeo, darkTrimMat);
      mouth.position.set(sx, spec.height - 0.03, 0.50);
      chassisGroup.add(mouth);
    }
  } else if (spec.bodyStyle === 'le_mans') {
    const finShape = new THREE.Shape();
    finShape.moveTo(0.25, spec.height + 0.03);
    finShape.lineTo(halfL - 0.28, 1.06);
    finShape.lineTo(halfL - 0.28, deckH);
    finShape.lineTo(0.25, spec.height - 0.06);
    finShape.closePath();
    const sharkFinGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.04, bevelEnabled: false });
    sharkFinGeo.translate(0, 0, -0.02);
    sharkFinGeo.rotateY(Math.PI / 2);
    const sharkFin = new THREE.Mesh(sharkFinGeo, carbonMat);
    chassisGroup.add(sharkFin);
  }

  // Recessed side air intake pockets (mid-engine cars)
  if (isWedge || spec.bodyStyle === 'hypercar' || spec.bodyStyle === 'rotary') {
    const pocketGeo = new THREE.BoxGeometry(0.12, 0.25, 0.68);
    const slatGeo = new THREE.BoxGeometry(0.13, 0.03, 0.64);
    for (const side of [-1, 1]) {
      const pocket = new THREE.Mesh(pocketGeo, darkTrimMat);
      pocket.position.set(side * (halfW * 0.94), 0.54, 0.54);
      chassisGroup.add(pocket);

      const slat = new THREE.Mesh(slatGeo, bodyPaintMaterial);
      slat.position.set(side * (halfW * 0.945), 0.54, 0.54);
      chassisGroup.add(slat);
    }
  }

  // Windshield wiper
  const wiperGeo = new THREE.BoxGeometry(0.54, 0.02, 0.025);
  const wiper = new THREE.Mesh(wiperGeo, darkTrimMat);
  wiper.position.set(-0.08, 0.72, cabFront + 0.06);
  wiper.rotation.y = 0.14;
  chassisGroup.add(wiper);

  // 5. Hood & Rear Engine-Bay Louvers / Supercharger Scoop / Racing Stripes
  if (spec.bodyStyle === 'wedge_exotic' || spec.bodyStyle === 'hypercar' || spec.bodyStyle === 'le_mans') {
    // Black slatted rear V12/V10 engine louver deck between flying buttresses
    const bayFloor = new THREE.Mesh(
      new THREE.BoxGeometry(cabinWidth * 0.72, 0.04, 0.95),
      darkTrimMat
    );
    bayFloor.position.set(0, deckH + 0.01, 1.24);
    chassisGroup.add(bayFloor);

    const louverGeo = new THREE.BoxGeometry(cabinWidth * 0.68, 0.026, 0.10);
    for (let li = 0; li < 5; li++) {
      const lv = new THREE.Mesh(louverGeo, carbonMat);
      lv.position.set(0, deckH + 0.035, 0.88 + li * 0.18);
      lv.rotation.x = -0.22;
      chassisGroup.add(lv);
    }
  }

  if (spec.bodyStyle === 'wedge_exotic' || spec.bodyStyle === 'rotary') {
    // Crisp pop-up headlight panel seam lines on sloped hood (just like Diablo SV!)
    const podBorderGeo = new THREE.BoxGeometry(0.38, 0.016, 0.34);
    const podCapGeo = new THREE.BoxGeometry(0.35, 0.02, 0.31);
    for (const side of [-1, 1]) {
      const px = side * (halfW * 0.56);
      const py = noseH + 0.145;
      const pz = -halfL + 0.58;
      const border = new THREE.Mesh(podBorderGeo, darkTrimMat);
      border.position.set(px, py, pz);
      border.rotation.x = 0.18;
      chassisGroup.add(border);

      const cap = new THREE.Mesh(podCapGeo, bodyPaintMaterial);
      cap.position.set(px, py + 0.004, pz);
      cap.rotation.x = 0.18;
      chassisGroup.add(cap);
    }
  } else if (isMuscle) {
    // Twin racing stripes + tall supercharger blower scoop
    const stripeGeo = new THREE.BoxGeometry(0.18, 0.015, 1.38);
    for (const sx of [-0.15, 0.15]) {
      const st = new THREE.Mesh(stripeGeo, carbonMat);
      st.position.set(sx, hoodPeakH + 0.02, -1.32);
      st.rotation.x = 0.12;
      chassisGroup.add(st);
    }
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.15, 0.72), carbonMat);
    scoop.position.set(0, hoodPeakH + 0.08, -1.25);
    chassisGroup.add(scoop);

    const intakeMouth = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.08), amberMarkerMat);
    intakeMouth.position.set(0, hoodPeakH + 0.09, -1.61);
    chassisGroup.add(intakeMouth);
  } else if (spec.bodyStyle === 'tuner') {
    const ventGeo = new THREE.BoxGeometry(0.28, 0.028, 0.36);
    for (const vx of [-0.30, 0.30]) {
      const vent = new THREE.Mesh(ventGeo, carbonMat);
      vent.position.set(vx, hoodPeakH + 0.005, -1.32);
      vent.rotation.x = 0.14;
      chassisGroup.add(vent);
    }
  }

  // 6. Front Fascia, Recessed Intercooler Grille, Carbon Splitter & Canards
  const grilleGeo = new THREE.BoxGeometry(spec.width * 0.62, 0.16, 0.12);
  const grille = new THREE.Mesh(grilleGeo, darkTrimMat);
  grille.position.set(0, 0.31, -halfL + 0.02);
  chassisGroup.add(grille);

  if (spec.bodyStyle === 'tuner') {
    const intercooler = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width * 0.46, 0.12, 0.06),
      rimMat
    );
    intercooler.position.set(0, 0.30, -halfL - 0.02);
    chassisGroup.add(intercooler);
  } else if (spec.bodyStyle === 'coupe') {
    const trimGeo = new THREE.BoxGeometry(0.22, 0.16, 0.05);
    for (const gx of [-0.18, 0.18]) {
      const frame = new THREE.Mesh(trimGeo, rimMat);
      frame.position.set(gx, 0.38, -halfL - 0.02);
      chassisGroup.add(frame);
    }
  }

  const splitter = new THREE.Mesh(
    new THREE.BoxGeometry(spec.width + 0.06, 0.04, 0.50),
    carbonMat
  );
  splitter.position.set(0, 0.19, -halfL + 0.14);
  chassisGroup.add(splitter);

  const canardGeo = new THREE.BoxGeometry(0.14, 0.028, 0.22);
  for (const side of [-1, 1]) {
    const canard = new THREE.Mesh(canardGeo, carbonMat);
    canard.position.set(side * (halfW - 0.04), 0.30, -halfL + 0.24);
    canard.rotation.z = side * -0.24;
    chassisGroup.add(canard);
  }

  // Side Skirts & Multi-Fin Rear Diffuser
  const skirts = new THREE.Mesh(
    new THREE.BoxGeometry(spec.width * 0.98, 0.05, spec.wheelbase * 0.72),
    carbonMat
  );
  skirts.position.set(0, 0.20, 0.02);
  chassisGroup.add(skirts);

  const diffuser = new THREE.Mesh(
    new THREE.BoxGeometry(spec.width * 0.84, 0.18, 0.36),
    carbonMat
  );
  diffuser.position.set(0, 0.26, halfL - 0.04);
  chassisGroup.add(diffuser);

  const finGeo = new THREE.BoxGeometry(0.03, 0.16, 0.34);
  for (const fx of [-0.46, -0.16, 0.16, 0.46]) {
    const fin = new THREE.Mesh(finGeo, carbonMat);
    fin.position.set(fx, 0.24, halfL + 0.04);
    chassisGroup.add(fin);
  }

  // 7. Rear Spoiler / Wing Architecture
  if (spec.wingStyle === 'gt' || spec.wingStyle === 'twin') {
    const wingBlade = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width * 0.94, 0.042, 0.32),
      carbonMat
    );
    wingBlade.position.set(0, 1.09, halfL - 0.16);
    wingBlade.rotation.x = 0.09;
    wingBlade.castShadow = true;
    chassisGroup.add(wingBlade);

    if (spec.wingStyle === 'twin') {
      const upperBlade = new THREE.Mesh(
        new THREE.BoxGeometry(spec.width * 0.82, 0.028, 0.20),
        bodyPaintMaterial
      );
      upperBlade.position.set(0, 1.18, halfL - 0.12);
      upperBlade.rotation.x = 0.14;
      chassisGroup.add(upperBlade);
    }

    const endplateGeo = new THREE.BoxGeometry(0.035, 0.20, 0.42);
    for (const side of [-1, 1]) {
      const ep = new THREE.Mesh(endplateGeo, spec.bodyStyle === 'wedge_exotic' ? carbonMat : bodyPaintMaterial);
      ep.position.set(side * (spec.width * 0.47), 1.09, halfL - 0.16);
      chassisGroup.add(ep);
    }

    const strutGeo = new THREE.BoxGeometry(0.04, 0.28, 0.14);
    for (const side of [-0.42, 0.42]) {
      const strut = new THREE.Mesh(strutGeo, carbonMat);
      strut.position.set(side, 0.94, halfL - 0.18);
      chassisGroup.add(strut);
    }
  } else if (spec.wingStyle === 'muscle') {
    const lip = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width * 0.88, 0.11, 0.22),
      carbonMat
    );
    lip.position.set(0, deckH + 0.05, halfL - 0.14);
    lip.rotation.x = -0.32;
    chassisGroup.add(lip);
  } else {
    const duck = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width * 0.86, 0.13, 0.24),
      bodyPaintMaterial
    );
    duck.position.set(0, deckH + 0.05, halfL - 0.12);
    duck.rotation.x = -0.38;
    chassisGroup.add(duck);
  }

  // 8. Sculpted Aerodynamic Side Mirrors (Painted Housing + Dark Stalk)
  const stalkGeo = new THREE.BoxGeometry(0.11, 0.032, 0.055);
  const mirrorCapGeo = new THREE.BoxGeometry(0.17, 0.072, 0.12);
  for (const side of [-1, 1]) {
    const stalk = new THREE.Mesh(stalkGeo, darkTrimMat);
    stalk.position.set(side * (halfW * 0.86), 0.77, cabFront + 0.22);
    chassisGroup.add(stalk);

    const mirror = new THREE.Mesh(mirrorCapGeo, bodyPaintMaterial);
    mirror.position.set(side * (halfW * 0.94), 0.81, cabFront + 0.23);
    mirror.rotation.y = side * -0.15;
    chassisGroup.add(mirror);
  }

  // 9. Headlights, Corner Signals & Rear Tail Clusters
  if (spec.bodyStyle === 'ev_gt') {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width * 0.80, 0.042, 0.10),
      headlightMat
    );
    blade.position.set(0, noseH - 0.03, -halfL + 0.02);
    chassisGroup.add(blade);
  } else if (spec.bodyStyle === 'wedge_exotic') {
    // Sleek lower bumper fog/DRL housings + amber corner markers matching Diablo SV nose
    const lowerPodGeo = new THREE.BoxGeometry(0.32, 0.075, 0.12);
    const drlBarGeo = new THREE.BoxGeometry(0.24, 0.034, 0.06);
    const amberCornerGeo = new THREE.BoxGeometry(0.11, 0.065, 0.10);
    for (const side of [-1, 1]) {
      const hx = side * (halfW * 0.48);
      const pod = new THREE.Mesh(lowerPodGeo, darkTrimMat);
      pod.position.set(hx, 0.34, -halfL + 0.03);
      pod.rotation.y = side * -0.16;
      chassisGroup.add(pod);

      const drl = new THREE.Mesh(drlBarGeo, headlightMat);
      drl.position.set(hx, 0.34, -halfL - 0.01);
      drl.rotation.y = side * -0.16;
      chassisGroup.add(drl);

      const corner = new THREE.Mesh(amberCornerGeo, amberMarkerMat);
      corner.position.set(side * (halfW * 0.68), 0.35, -halfL + 0.06);
      corner.rotation.y = side * -0.24;
      chassisGroup.add(corner);
    }
  } else {
    const housingGeo = new THREE.BoxGeometry(0.38, 0.095, 0.16);
    const drlGeo = new THREE.BoxGeometry(0.32, 0.032, 0.08);
    const lensGeo = new THREE.BoxGeometry(0.39, 0.105, 0.18);
    for (const side of [-1, 1]) {
      const hx = side * (halfW * 0.56);
      const hy = noseH + 0.02;
      const hz = -halfL + 0.10;

      const housing = new THREE.Mesh(housingGeo, darkTrimMat);
      housing.position.set(hx, hy, hz);
      housing.rotation.y = side * -0.20;
      chassisGroup.add(housing);

      const drl = new THREE.Mesh(drlGeo, headlightMat);
      drl.position.set(hx, hy + 0.01, hz - 0.04);
      drl.rotation.y = side * -0.20;
      chassisGroup.add(drl);

      const lens = new THREE.Mesh(lensGeo, headlightLensMat);
      lens.position.set(hx, hy, hz - 0.02);
      lens.rotation.y = side * -0.20;
      chassisGroup.add(lens);
    }
  }

  // Side amber indicator markers
  const markerGeo = new THREE.BoxGeometry(0.03, 0.038, 0.11);
  for (const side of [-1, 1]) {
    const marker = new THREE.Mesh(markerGeo, amberMarkerMat);
    marker.position.set(side * (halfW * 0.94), 0.42, frontAxleZ - 0.42);
    chassisGroup.add(marker);
  }

  // Rear Taillights (quad circular afterburners on wedge_exotic/tuner/rotary, OLED bar on others)
  const rearGrille = new THREE.Mesh(
    new THREE.BoxGeometry(spec.width * 0.80, 0.16, 0.06),
    darkTrimMat
  );
  rearGrille.position.set(0, 0.64, halfL + 0.01);
  chassisGroup.add(rearGrille);

  if (spec.bodyStyle === 'wedge_exotic' || spec.bodyStyle === 'tuner' || spec.bodyStyle === 'rotary') {
    const ringGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.05, 16);
    ringGeo.rotateX(Math.PI / 2);
    for (const tx of [-halfW * 0.62, -halfW * 0.42, halfW * 0.42, halfW * 0.62]) {
      const lamp = new THREE.Mesh(ringGeo, tailLightMaterial);
      lamp.position.set(tx, 0.65, halfL + 0.03);
      chassisGroup.add(lamp);
    }
  } else {
    const tailBar = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width * 0.78, 0.052, 0.07),
      tailLightMaterial
    );
    tailBar.position.set(0, 0.66, halfL + 0.02);
    chassisGroup.add(tailBar);

    const clusterGeo = new THREE.BoxGeometry(0.28, 0.088, 0.08);
    for (const side of [-1, 1]) {
      const cluster = new THREE.Mesh(clusterGeo, tailLightMaterial);
      cluster.position.set(side * (halfW * 0.62), 0.66, halfL + 0.02);
      chassisGroup.add(cluster);
    }
  }

  // 10. Exhaust Tips + NOS Flame Cones
  const exhaustMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    metalness: 0.96,
    roughness: 0.18,
  });

  const coreFlameGeo = new THREE.ConeGeometry(0.065, 0.9, 12);
  coreFlameGeo.rotateX(Math.PI / 2);
  coreFlameGeo.translate(0, 0, 0.45);
  const coreFlameMat = new THREE.MeshBasicMaterial({
    color: 0x93c5fd,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const coronaFlameGeo = new THREE.ConeGeometry(0.115, 1.35, 12);
  coronaFlameGeo.rotateX(Math.PI / 2);
  coronaFlameGeo.translate(0, 0, 0.65);
  const coronaFlameMat = new THREE.MeshBasicMaterial({
    color: 0x0284c7,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const nosFlames: THREE.Mesh[] = [];
  const exhaustPositions: number[] =
    spec.exhaustStyle === 'center_hex'
      ? [-0.11, 0.11]
      : spec.exhaustStyle === 'cannon'
        ? [0.44]
        : spec.exhaustStyle === 'dual_wide'
          ? [-0.52, 0.52]
          : [-0.56, -0.40, 0.40, 0.56];

  const pipeRadius = spec.exhaustStyle === 'cannon' ? 0.085 : 0.052;
  const exhaustGeo = new THREE.CylinderGeometry(pipeRadius, pipeRadius * 1.1, 0.24, 14);
  exhaustGeo.rotateX(Math.PI / 2);

  for (const ex of exhaustPositions) {
    const pipe = new THREE.Mesh(exhaustGeo, exhaustMat);
    pipe.position.set(ex, 0.27, halfL + 0.04);
    chassisGroup.add(pipe);

    const coronaFlame = new THREE.Mesh(coronaFlameGeo, coronaFlameMat);
    coronaFlame.position.set(ex, 0.27, halfL + 0.11);
    coronaFlame.visible = false;
    chassisGroup.add(coronaFlame);
    nosFlames.push(coronaFlame);

    const coreFlame = new THREE.Mesh(coreFlameGeo, coreFlameMat);
    coreFlame.position.set(ex, 0.27, halfL + 0.11);
    coreFlame.visible = false;
    chassisGroup.add(coreFlame);
    nosFlames.push(coreFlame);
  }

  // 11. Wheels tailored to car archetype
  const wheelStyle: WheelStyle =
    spec.bodyStyle === 'wedge_exotic' || spec.bodyStyle === 'le_mans'
      ? 'phone_dial'
      : spec.bodyStyle === 'ev_gt'
        ? 'aero_turbine'
        : spec.bodyStyle === 'muscle' || spec.bodyStyle === 'rotary'
          ? 'deep_5'
          : 'split_y';

  const frontLeftPivot = new THREE.Group();
  frontLeftPivot.position.set(-halfW + 0.06, wheelRadius, frontAxleZ);
  const frontRightPivot = new THREE.Group();
  frontRightPivot.position.set(halfW - 0.06, wheelRadius, frontAxleZ);

  const fl = createWheelAssembly(wheelRadius, wheelWidth, wheelStyle, brakeDiscMaterial, tireMat, rimMat, darkRimMat, caliperMat, true);
  const fr = createWheelAssembly(wheelRadius, wheelWidth, wheelStyle, brakeDiscMaterial, tireMat, rimMat, darkRimMat, caliperMat, false);
  frontLeftPivot.add(fl.mount);
  frontRightPivot.add(fr.mount);

  const rl = createWheelAssembly(wheelRadius, wheelWidth * 1.14, wheelStyle, brakeDiscMaterial, tireMat, rimMat, darkRimMat, caliperMat, true);
  rl.mount.position.set(-halfW + 0.045, wheelRadius, rearAxleZ);
  const rr = createWheelAssembly(wheelRadius, wheelWidth * 1.14, wheelStyle, brakeDiscMaterial, tireMat, rimMat, darkRimMat, caliperMat, false);
  rr.mount.position.set(halfW - 0.045, wheelRadius, rearAxleZ);

  root.add(frontLeftPivot, frontRightPivot, rl.mount, rr.mount);
  const wheelMeshes = [fl.spinGroup, fr.spinGroup, rl.spinGroup, rr.spinGroup];

  // 12. Ground Contact Shadow Plane
  const shadowGeo = new THREE.PlaneGeometry(spec.width * 1.44, spec.length * 1.24);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowMap,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.y = 0.025;
  root.add(contactShadow);

  // 13. Underglow Neon Ground Wash
  const glowGeo = new THREE.PlaneGeometry(spec.width * 1.32, spec.length * 1.08);
  glowGeo.rotateX(-Math.PI / 2);
  const underglowMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(underglowHex),
    map: contactShadowMap,
    transparent: true,
    opacity: underglowHex === '#000000' ? 0 : 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const underglowMesh = new THREE.Mesh(glowGeo, underglowMaterial);
  underglowMesh.position.y = 0.032;
  root.add(underglowMesh);

  // 14. Player Forward Headlight Beam & Dual Ground Projection
  let headlightSpot: THREE.SpotLight | undefined;
  let headlightCone: THREE.Mesh | undefined;
  if (isPlayer) {
    if (!isSoftwareGl) {
      headlightSpot = new THREE.SpotLight(0xe0f2fe, 56, 88, Math.PI / 4.0, 0.52, 1.45);
      headlightSpot.position.set(0, 0.65, -halfL + 0.1);
      headlightSpot.target.position.set(0, 0, -32);
      root.add(headlightSpot);
      root.add(headlightSpot.target);
    }

    const splashGeo = new THREE.PlaneGeometry(8.6, 26);
    splashGeo.rotateX(-Math.PI / 2);
    const splashMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      map: headlightProjectionMap ?? contactShadowMap,
      transparent: true,
      opacity: headlightProjectionMap ? 0.34 : 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    headlightCone = new THREE.Mesh(splashGeo, splashMat);
    headlightCone.position.set(0, 0.042, -halfL - 12.6);
    root.add(headlightCone);
  }

  // 15. Dynamic Rear Brake Light Ground Wash
  const tailWashGeo = new THREE.PlaneGeometry(spec.width * 1.35, 3.2);
  tailWashGeo.rotateX(-Math.PI / 2);
  const tailWashMat = new THREE.MeshBasicMaterial({
    color: 0xff2222,
    map: contactShadowMap,
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const tailWash = new THREE.Mesh(tailWashGeo, tailWashMat);
  tailWash.position.set(0, 0.036, halfL + 1.15);
  root.add(tailWash);

  let nosFlicker = 0;

  return {
    root,
    chassisGroup,
    frontLeftPivot,
    frontRightPivot,
    wheelMeshes,
    brakeDiscMaterials: [brakeDiscMaterial],
    tailLightMaterial,
    headlightSpot,
    headlightCone,
    nosFlames,
    underglowMesh,
    underglowMaterial,
    bodyPaintMaterial,
    updateVisuals: ({
      speedMs,
      steerAngle,
      pitchRad,
      rollRad,
      brakeIntensity,
      nosActive,
      dt,
      wheelSpinAngle,
    }) => {
      chassisGroup.rotation.x = pitchRad;
      chassisGroup.rotation.z = rollRad;

      frontLeftPivot.rotation.y = steerAngle;
      frontRightPivot.rotation.y = steerAngle;

      for (const w of wheelMeshes) {
        w.rotation.x = -wheelSpinAngle;
      }

      tailLightMaterial.emissiveIntensity = 1.35 + brakeIntensity * 4.2;
      tailWashMat.opacity = 0.12 + brakeIntensity * 0.36;
      const heat = brakeIntensity > 0.25 && speedMs > 12 ? brakeIntensity * 1.9 : 0;
      brakeDiscMaterial.emissiveIntensity = THREE.MathUtils.lerp(
        brakeDiscMaterial.emissiveIntensity,
        heat,
        Math.min(1, dt * 8)
      );

      nosFlicker += dt * 55;
      for (let i = 0; i < nosFlames.length; i++) {
        const f = nosFlames[i];
        f.visible = nosActive;
        if (nosActive) {
          const isCore = i % 2 === 1;
          const jitter = Math.sin(nosFlicker * (isCore ? 1.8 : 1.3) + i * 1.7) * 0.32 + (Math.random() - 0.5) * 0.24;
          const baseLength = isCore ? 1.35 : 1.65;
          const scaleZ = Math.max(0.65, baseLength + jitter);
          const scaleRadial = isCore
            ? 0.92 + Math.sin(nosFlicker * 1.5 + i) * 0.16
            : 1.1 + Math.cos(nosFlicker * 1.1 + i) * 0.22;
          f.scale.set(scaleRadial, scaleRadial, scaleZ);
        }
      }
    },
    setPaint: (nextPaint) => {
      bodyPaintMaterial.color.set(nextPaint.hex);
      bodyPaintMaterial.metalness = nextPaint.metalness;
      bodyPaintMaterial.roughness = nextPaint.roughness;
      bodyPaintMaterial.clearcoat = nextPaint.clearcoat;
      bodyPaintMaterial.iridescence = nextPaint.iridescence ?? 0;
    },
    setUnderglow: (hex) => {
      underglowMaterial.color.set(hex);
      underglowMaterial.opacity = hex === '#000000' ? 0 : 0.48;
    },
    dispose: () => {
      createdTextures.forEach((t) => t.dispose());
      root.traverse((obj) => {
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
