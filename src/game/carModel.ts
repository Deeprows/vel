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

function createWheelAssembly(
  radius: number,
  width: number,
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

  // Main tire tread cylinder
  const tireGeo = new THREE.CylinderGeometry(radius, radius, width * 0.88, 28);
  tireGeo.rotateZ(Math.PI / 2);
  const tire = new THREE.Mesh(tireGeo, tireMat);
  tire.castShadow = true;
  spinGroup.add(tire);

  // Tapered tire sidewalls for realistic rounded profile
  const shoulderGeo = new THREE.CylinderGeometry(radius * 0.94, radius, width * 0.08, 28);
  shoulderGeo.rotateZ(Math.PI / 2);
  for (const side of [-1, 1]) {
    const sh = new THREE.Mesh(shoulderGeo, tireMat);
    sh.position.x = side * (width * 0.46);
    if (side === -1) sh.rotation.y = Math.PI;
    spinGroup.add(sh);
  }

  // Deep-dish inner dark barrel & bright outer rim lip
  const innerBarrelGeo = new THREE.CylinderGeometry(radius * 0.69, radius * 0.69, width * 0.96, 24);
  innerBarrelGeo.rotateZ(Math.PI / 2);
  const innerBarrel = new THREE.Mesh(innerBarrelGeo, darkRimMat);
  spinGroup.add(innerBarrel);

  const lipGeo = new THREE.TorusGeometry(radius * 0.67, 0.016, 10, 28);
  lipGeo.rotateY(Math.PI / 2);
  const lip = new THREE.Mesh(lipGeo, rimMat);
  lip.position.x = dir * (width * 0.46);
  spinGroup.add(lip);

  // Split 5-Y spoke forged alloy design (10 angled spokes)
  const spokeGeo = new THREE.BoxGeometry(0.028, radius * 0.64, 0.032);
  for (let i = 0; i < 5; i++) {
    const baseAngle = (i * Math.PI * 2) / 5;
    for (const splay of [-0.17, 0.17]) {
      const spoke = new THREE.Mesh(spokeGeo, rimMat);
      const angle = baseAngle + splay;
      const midR = radius * 0.36;
      spoke.position.set(
        dir * (width * 0.41),
        Math.cos(angle) * midR,
        Math.sin(angle) * midR
      );
      spoke.rotation.x = angle - splay * 0.55;
      spinGroup.add(spoke);
    }
  }

  // Hub center lock + lug bolts
  const hubGeo = new THREE.CylinderGeometry(radius * 0.17, radius * 0.19, width * 0.98, 16);
  hubGeo.rotateZ(Math.PI / 2);
  const hub = new THREE.Mesh(hubGeo, darkRimMat);
  spinGroup.add(hub);

  const capGeo = new THREE.CylinderGeometry(radius * 0.09, radius * 0.09, width * 1.02, 12);
  capGeo.rotateZ(Math.PI / 2);
  const cap = new THREE.Mesh(capGeo, caliperMat);
  spinGroup.add(cap);

  // Slotted brake rotor disc (spins with wheel)
  const discGeo = new THREE.CylinderGeometry(radius * 0.53, radius * 0.53, 0.032, 22);
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
  const outerR = archRadius + 0.11;
  const innerR = archRadius + 0.015;
  shape.absarc(0, 0, outerR, 0, Math.PI, false);
  shape.absarc(0, 0, innerR, Math.PI, 0, true);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: archWidth,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 2,
    curveSegments: 18,
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
  const wheelWidth = 0.285;
  const frontAxleZ = -spec.wheelbase * 0.48;
  const rearAxleZ = spec.wheelbase * 0.52;

  // Materials
  const bodyPaintMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(paint.hex),
    metalness: paint.metalness,
    roughness: paint.roughness,
    clearcoat: paint.clearcoat,
    clearcoatRoughness: 0.07,
    iridescence: paint.iridescence ?? 0,
    iridescenceIOR: 1.45,
    envMapIntensity: 1.45,
  });

  const carbonMat = new THREE.MeshPhysicalMaterial({
    color: 0x13161f,
    metalness: 0.35,
    roughness: 0.42,
    clearcoat: 0.6,
    clearcoatRoughness: 0.18,
  });

  const darkTrimMat = new THREE.MeshStandardMaterial({
    color: 0x0b0e14,
    metalness: 0.25,
    roughness: 0.8,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x080c16,
    metalness: 0.12,
    roughness: 0.04,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.75,
  });

  const headlightLensMat = new THREE.MeshPhysicalMaterial({
    color: 0xdbeafe,
    metalness: 0.1,
    roughness: 0.05,
    clearcoat: 1.0,
    transparent: true,
    opacity: 0.42,
  });

  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x13151a,
    roughness: 0.88,
    metalness: 0.04,
  });

  const rimMat = new THREE.MeshStandardMaterial({
    color: spec.bodyStyle === 'rotary' ? 0xe2e8f0 : 0xd1d5db,
    metalness: 0.94,
    roughness: 0.16,
  });

  const darkRimMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.82,
    roughness: 0.28,
  });

  const caliperMat = new THREE.MeshStandardMaterial({
    color:
      spec.bodyStyle === 'ev_gt'
        ? 0x06b6d4
        : spec.bodyStyle === 'muscle'
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
    emissiveIntensity: 2.6,
    roughness: 0.1,
  });

  const amberMarkerMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: new THREE.Color(0xf59e0b),
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });

  const tailLightMaterial = new THREE.MeshStandardMaterial({
    color: 0x991b1b,
    emissive: new THREE.Color(0xef4444),
    emissiveIntensity: 1.4,
    roughness: 0.18,
  });

  // 1. Primary Lower Chassis Profile tailored per bodyStyle
  const noseH = spec.bodyStyle === 'hypercar' ? 0.44 : spec.bodyStyle === 'muscle' ? 0.62 : 0.51;
  const hoodPeakH = spec.bodyStyle === 'muscle' ? 0.78 : spec.bodyStyle === 'hypercar' ? 0.64 : 0.72;
  const deckH = spec.bodyStyle === 'muscle' ? 0.90 : 0.84;

  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-halfL + 0.1, 0.22);
  bodyShape.lineTo(halfL - 0.1, 0.26);
  bodyShape.lineTo(halfL + 0.03, 0.64);
  bodyShape.lineTo(halfL - 0.16, deckH);
  bodyShape.lineTo(0.7, deckH + 0.03);
  bodyShape.lineTo(0.12, 0.82);
  bodyShape.lineTo(-0.92, hoodPeakH);
  bodyShape.lineTo(-halfL + 0.18, noseH);
  bodyShape.lineTo(-halfL - 0.02, 0.30);
  bodyShape.closePath();

  const bodyExtrudeWidth = spec.width - 0.28;
  const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
    depth: bodyExtrudeWidth,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.075,
    bevelSegments: 4,
    steps: 1,
  });
  bodyGeo.translate(0, 0, -bodyExtrudeWidth * 0.5);
  bodyGeo.rotateY(Math.PI / 2);
  bodyGeo.computeVertexNormals();

  const mainBody = new THREE.Mesh(bodyGeo, bodyPaintMaterial);
  mainBody.castShadow = true;
  mainBody.receiveShadow = true;
  chassisGroup.add(mainBody);

  // Dark inner floorpan / undertray so underneath wheel arches is dark & grounded
  const floorGeo = new THREE.BoxGeometry(spec.width * 0.78, 0.14, spec.length * 0.88);
  const floorMesh = new THREE.Mesh(floorGeo, darkTrimMat);
  floorMesh.position.set(0, 0.25, 0);
  chassisGroup.add(floorMesh);

  // 2. Sculpted Wheel Arch Overfenders + Dark Recessed Wheel Wells
  const wellGeo = new THREE.CylinderGeometry(wheelRadius + 0.07, wheelRadius + 0.07, 0.34, 18, 1, false, 0, Math.PI);
  wellGeo.rotateZ(Math.PI / 2);
  for (const axleZ of [frontAxleZ, rearAxleZ]) {
    for (const side of [-1, 1]) {
      const well = new THREE.Mesh(wellGeo, darkTrimMat);
      well.position.set(side * (halfW - 0.2), wheelRadius - 0.01, axleZ);
      chassisGroup.add(well);

      const arch = createArchFlare(wheelRadius, 0.2, bodyPaintMaterial);
      arch.position.set(side * (halfW - 0.06), wheelRadius - 0.02, axleZ);
      chassisGroup.add(arch);
    }
  }

  // Shoulder haunches bridging front-to-rear wheel arches
  const shoulderBarGeo = new THREE.BoxGeometry(spec.width * 0.96, 0.22, spec.wheelbase * 0.62);
  const shoulderBar = new THREE.Mesh(shoulderBarGeo, bodyPaintMaterial);
  shoulderBar.position.set(0, 0.64, 0.05);
  shoulderBar.castShadow = true;
  chassisGroup.add(shoulderBar);

  // Recessed side air-intakes or door accent channels
  const intakeWidth = spec.bodyStyle === 'hypercar' || spec.bodyStyle === 'rotary' ? 0.14 : 0.06;
  const sideIntakeGeo = new THREE.BoxGeometry(intakeWidth, 0.24, 0.78);
  for (const side of [-1, 1]) {
    const intake = new THREE.Mesh(sideIntakeGeo, carbonMat);
    intake.position.set(side * (halfW - 0.04), 0.58, 0.45);
    chassisGroup.add(intake);
  }

  // 3. Sculpted Greenhouse / Canopy Cabin + Pillars + Roof
  const cabinShape = new THREE.Shape();
  const cabFront = spec.bodyStyle === 'hypercar' ? -1.06 : -0.84;
  const cabRear = spec.bodyStyle === 'muscle' ? 1.24 : 1.42;
  cabinShape.moveTo(cabFront, 0.66);
  cabinShape.lineTo(-0.22, spec.height);
  cabinShape.lineTo(0.64, spec.height - 0.03);
  cabinShape.lineTo(cabRear, 0.74);
  cabinShape.closePath();

  const cabinWidth = spec.width * 0.66;
  const cabinGeo = new THREE.ExtrudeGeometry(cabinShape, {
    depth: cabinWidth,
    bevelEnabled: true,
    bevelThickness: 0.09,
    bevelSize: 0.06,
    bevelSegments: 3,
  });
  cabinGeo.translate(0, 0, -cabinWidth * 0.5);
  cabinGeo.rotateY(Math.PI / 2);
  cabinGeo.computeVertexNormals();

  const cabin = new THREE.Mesh(cabinGeo, glassMat);
  cabin.castShadow = true;
  chassisGroup.add(cabin);

  // Roof cap (panoramic dark glass on EV GT, painted roof with subtle ribs on others)
  const roofGeo = new THREE.BoxGeometry(cabinWidth * 0.84, 0.055, 0.88);
  const roofCap = new THREE.Mesh(
    roofGeo,
    spec.bodyStyle === 'ev_gt' ? glassMat : bodyPaintMaterial
  );
  roofCap.position.set(0, spec.height + 0.03, 0.22);
  chassisGroup.add(roofCap);

  // Windshield wipers & B-pillar trim
  const wiperGeo = new THREE.BoxGeometry(0.48, 0.02, 0.025);
  for (const wx of [-0.26, 0.24]) {
    const wiper = new THREE.Mesh(wiperGeo, darkTrimMat);
    wiper.position.set(wx, 0.77, cabFront + 0.08);
    wiper.rotation.y = 0.14;
    chassisGroup.add(wiper);
  }

  // 4. Hood Details (Power Dome, Vents, or Supercharger Scoop)
  if (spec.bodyStyle === 'muscle') {
    const scoopGeo = new THREE.BoxGeometry(0.44, 0.14, 0.74);
    const scoop = new THREE.Mesh(scoopGeo, carbonMat);
    scoop.position.set(0, hoodPeakH + 0.07, -1.25);
    chassisGroup.add(scoop);

    const intakeMouthGeo = new THREE.BoxGeometry(0.36, 0.08, 0.08);
    const intakeMouth = new THREE.Mesh(intakeMouthGeo, amberMarkerMat);
    intakeMouth.position.set(0, hoodPeakH + 0.08, -1.61);
    chassisGroup.add(intakeMouth);
  } else if (spec.bodyStyle === 'tuner' || spec.bodyStyle === 'rotary') {
    const ventGeo = new THREE.BoxGeometry(0.28, 0.03, 0.36);
    for (const vx of [-0.28, 0.28]) {
      const vent = new THREE.Mesh(ventGeo, carbonMat);
      vent.position.set(vx, hoodPeakH - 0.02, -1.35);
      vent.rotation.x = 0.14;
      chassisGroup.add(vent);
    }
  } else if (spec.bodyStyle === 'hypercar') {
    // Rear mid-engine bay glass louvers
    const louverGeo = new THREE.BoxGeometry(spec.width * 0.5, 0.025, 0.12);
    for (let li = 0; li < 4; li++) {
      const lv = new THREE.Mesh(louverGeo, carbonMat);
      lv.position.set(0, deckH + 0.04, 1.05 + li * 0.18);
      lv.rotation.x = -0.22;
      chassisGroup.add(lv);
    }
  }

  // 5. Recessed Front Bumper Grille, Carbon Splitter & Side Canards
  const grilleGeo = new THREE.BoxGeometry(spec.width * 0.62, 0.18, 0.12);
  const grille = new THREE.Mesh(grilleGeo, darkTrimMat);
  grille.position.set(0, 0.34, -halfL + 0.02);
  chassisGroup.add(grille);

  if (spec.bodyStyle === 'coupe') {
    // Twin kidney-style vertical frame accents
    const trimGeo = new THREE.BoxGeometry(0.22, 0.16, 0.04);
    for (const gx of [-0.18, 0.18]) {
      const frame = new THREE.Mesh(trimGeo, rimMat);
      frame.position.set(gx, 0.38, -halfL - 0.02);
      chassisGroup.add(frame);
    }
  }

  const splitterGeo = new THREE.BoxGeometry(spec.width + 0.08, 0.045, 0.56);
  const splitter = new THREE.Mesh(splitterGeo, carbonMat);
  splitter.position.set(0, 0.2, -halfL + 0.16);
  chassisGroup.add(splitter);

  // Front aero canard winglets
  const canardGeo = new THREE.BoxGeometry(0.14, 0.03, 0.24);
  for (const side of [-1, 1]) {
    const canard = new THREE.Mesh(canardGeo, carbonMat);
    canard.position.set(side * (halfW + 0.01), 0.33, -halfL + 0.24);
    canard.rotation.z = side * -0.22;
    chassisGroup.add(canard);
  }

  // Side Skirts & Rear Diffuser
  const skirtGeo = new THREE.BoxGeometry(spec.width + 0.08, 0.055, spec.wheelbase * 0.72);
  const skirts = new THREE.Mesh(skirtGeo, carbonMat);
  skirts.position.set(0, 0.21, 0.02);
  chassisGroup.add(skirts);

  const diffuserGeo = new THREE.BoxGeometry(spec.width * 0.88, 0.18, 0.38);
  const diffuser = new THREE.Mesh(diffuserGeo, carbonMat);
  diffuser.position.set(0, 0.26, halfL - 0.04);
  chassisGroup.add(diffuser);

  const finGeo = new THREE.BoxGeometry(0.03, 0.16, 0.34);
  for (const fx of [-0.46, -0.16, 0.16, 0.46]) {
    const fin = new THREE.Mesh(finGeo, carbonMat);
    fin.position.set(fx, 0.24, halfL + 0.04);
    chassisGroup.add(fin);
  }

  // 6. Rear Spoiler / Wing Architecture
  if (spec.wingStyle === 'gt' || spec.wingStyle === 'twin') {
    const wingBladeGeo = new THREE.BoxGeometry(spec.width * 0.98, 0.045, 0.34);
    const wingBlade = new THREE.Mesh(wingBladeGeo, carbonMat);
    wingBlade.position.set(0, 1.13, halfL - 0.16);
    wingBlade.rotation.x = 0.09;
    wingBlade.castShadow = true;
    chassisGroup.add(wingBlade);

    if (spec.wingStyle === 'twin') {
      const upperBladeGeo = new THREE.BoxGeometry(spec.width * 0.86, 0.03, 0.2);
      const upperBlade = new THREE.Mesh(upperBladeGeo, bodyPaintMaterial);
      upperBlade.position.set(0, 1.22, halfL - 0.12);
      upperBlade.rotation.x = 0.14;
      chassisGroup.add(upperBlade);
    }

    const endplateGeo = new THREE.BoxGeometry(0.035, 0.22, 0.44);
    for (const side of [-1, 1]) {
      const ep = new THREE.Mesh(endplateGeo, bodyPaintMaterial);
      ep.position.set(side * (spec.width * 0.49), 1.13, halfL - 0.16);
      chassisGroup.add(ep);
    }

    const strutGeo = new THREE.BoxGeometry(0.04, 0.3, 0.14);
    for (const side of [-0.4, 0.4]) {
      const strut = new THREE.Mesh(strutGeo, carbonMat);
      strut.position.set(side, 0.96, halfL - 0.18);
      chassisGroup.add(strut);
    }
  } else if (spec.wingStyle === 'muscle') {
    const lipGeo = new THREE.BoxGeometry(spec.width * 0.92, 0.11, 0.22);
    const lip = new THREE.Mesh(lipGeo, carbonMat);
    lip.position.set(0, deckH + 0.06, halfL - 0.14);
    lip.rotation.x = -0.32;
    chassisGroup.add(lip);
  } else {
    const duckGeo = new THREE.BoxGeometry(spec.width * 0.9, 0.13, 0.24);
    const duck = new THREE.Mesh(duckGeo, bodyPaintMaterial);
    duck.position.set(0, deckH + 0.05, halfL - 0.12);
    duck.rotation.x = -0.38;
    chassisGroup.add(duck);
  }

  // 7. Aerodynamic Side Mirrors (Stalk + Painted Cap)
  const stalkGeo = new THREE.BoxGeometry(0.11, 0.035, 0.06);
  const mirrorCapGeo = new THREE.BoxGeometry(0.18, 0.075, 0.12);
  for (const side of [-1, 1]) {
    const stalk = new THREE.Mesh(stalkGeo, darkTrimMat);
    stalk.position.set(side * (halfW - 0.04), 0.78, -0.45);
    chassisGroup.add(stalk);

    const mirror = new THREE.Mesh(mirrorCapGeo, bodyPaintMaterial);
    mirror.position.set(side * (halfW + 0.06), 0.82, -0.44);
    mirror.rotation.y = side * -0.15;
    chassisGroup.add(mirror);
  }

  // 8. Multi-Layer LED Headlights, DRLs, Amber Markers & Glass Covers
  if (spec.bodyStyle === 'ev_gt') {
    const bladeGeo = new THREE.BoxGeometry(spec.width * 0.86, 0.045, 0.1);
    const blade = new THREE.Mesh(bladeGeo, headlightMat);
    blade.position.set(0, noseH - 0.02, -halfL + 0.04);
    chassisGroup.add(blade);
  } else {
    const housingGeo = new THREE.BoxGeometry(0.42, 0.1, 0.16);
    const drlGeo = new THREE.BoxGeometry(0.36, 0.032, 0.08);
    const lensGeo = new THREE.BoxGeometry(0.43, 0.11, 0.18);
    for (const side of [-1, 1]) {
      const hx = side * (halfW - 0.34);
      const hy = noseH - 0.03;
      const hz = -halfL + 0.07;

      const housing = new THREE.Mesh(housingGeo, darkTrimMat);
      housing.position.set(hx, hy, hz);
      housing.rotation.y = side * -0.18;
      chassisGroup.add(housing);

      const drl = new THREE.Mesh(drlGeo, headlightMat);
      drl.position.set(hx, hy + 0.01, hz - 0.04);
      drl.rotation.y = side * -0.18;
      chassisGroup.add(drl);

      const lens = new THREE.Mesh(lensGeo, headlightLensMat);
      lens.position.set(hx, hy, hz - 0.02);
      lens.rotation.y = side * -0.18;
      chassisGroup.add(lens);
    }
  }

  // Side amber indicator markers
  const markerGeo = new THREE.BoxGeometry(0.03, 0.04, 0.12);
  for (const side of [-1, 1]) {
    const marker = new THREE.Mesh(markerGeo, amberMarkerMat);
    marker.position.set(side * (halfW + 0.01), 0.44, frontAxleZ - 0.42);
    chassisGroup.add(marker);
  }

  // Rear OLED Tail-Light Bar + Outer Brake Clusters
  const tailBarGeo = new THREE.BoxGeometry(spec.width * 0.86, 0.055, 0.08);
  const tailBar = new THREE.Mesh(tailBarGeo, tailLightMaterial);
  tailBar.position.set(0, 0.68, halfL + 0.02);
  chassisGroup.add(tailBar);

  const clusterGeo = new THREE.BoxGeometry(0.32, 0.09, 0.09);
  for (const side of [-1, 1]) {
    const cluster = new THREE.Mesh(clusterGeo, tailLightMaterial);
    cluster.position.set(side * (halfW - 0.3), 0.68, halfL + 0.015);
    chassisGroup.add(cluster);
  }

  // 9. Exhaust Tips per exhaustStyle + Dynamic NOS Flame Cones
  const exhaustMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    metalness: 0.96,
    roughness: 0.18,
  });

  const flameGeo = new THREE.ConeGeometry(0.08, 0.95, 10);
  flameGeo.rotateX(Math.PI / 2);
  flameGeo.translate(0, 0, 0.48);
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.92,
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
          : [-0.58, -0.41, 0.41, 0.58];

  const pipeRadius = spec.exhaustStyle === 'cannon' ? 0.085 : 0.052;
  const exhaustGeo = new THREE.CylinderGeometry(pipeRadius, pipeRadius * 1.1, 0.24, 14);
  exhaustGeo.rotateX(Math.PI / 2);

  for (const ex of exhaustPositions) {
    const pipe = new THREE.Mesh(exhaustGeo, exhaustMat);
    pipe.position.set(ex, 0.27, halfL + 0.05);
    chassisGroup.add(pipe);

    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(ex, 0.27, halfL + 0.12);
    flame.visible = false;
    chassisGroup.add(flame);
    nosFlames.push(flame);
  }

  // 10. Wheels (4 independent assemblies with stationary calipers & spinning split-Y alloys)
  const frontLeftPivot = new THREE.Group();
  frontLeftPivot.position.set(-halfW + 0.05, wheelRadius, frontAxleZ);
  const frontRightPivot = new THREE.Group();
  frontRightPivot.position.set(halfW - 0.05, wheelRadius, frontAxleZ);

  const fl = createWheelAssembly(wheelRadius, wheelWidth, brakeDiscMaterial, tireMat, rimMat, darkRimMat, caliperMat, true);
  const fr = createWheelAssembly(wheelRadius, wheelWidth, brakeDiscMaterial, tireMat, rimMat, darkRimMat, caliperMat, false);
  frontLeftPivot.add(fl.mount);
  frontRightPivot.add(fr.mount);

  const rl = createWheelAssembly(wheelRadius, wheelWidth * 1.12, brakeDiscMaterial, tireMat, rimMat, darkRimMat, caliperMat, true);
  rl.mount.position.set(-halfW + 0.04, wheelRadius, rearAxleZ);
  const rr = createWheelAssembly(wheelRadius, wheelWidth * 1.12, brakeDiscMaterial, tireMat, rimMat, darkRimMat, caliperMat, false);
  rr.mount.position.set(halfW - 0.04, wheelRadius, rearAxleZ);

  root.add(frontLeftPivot, frontRightPivot, rl.mount, rr.mount);
  const wheelMeshes = [fl.spinGroup, fr.spinGroup, rl.spinGroup, rr.spinGroup];

  // 11. Ground Contact Shadow Plane
  const shadowGeo = new THREE.PlaneGeometry(spec.width * 1.44, spec.length * 1.24);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowMap,
    transparent: true,
    opacity: 0.74,
    depthWrite: false,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.y = 0.025;
  root.add(contactShadow);

  // 12. Underglow Neon Ground Wash
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

  // 13. Player Forward Headlight Beam & Dual Ground Projection
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

  // 14. Dynamic Rear Brake Light Ground Wash
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

      nosFlicker += dt * 42;
      for (let i = 0; i < nosFlames.length; i++) {
        const f = nosFlames[i];
        f.visible = nosActive;
        if (nosActive) {
          const s = 0.85 + Math.sin(nosFlicker + i * 1.7) * 0.28;
          f.scale.set(0.95, 0.95, s * 1.4);
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
