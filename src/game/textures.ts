import * as THREE from 'three';

export interface ProceduralTextureSet {
  asphaltMap: THREE.CanvasTexture;
  asphaltNormalMap: THREE.CanvasTexture;
  asphaltRoughnessMap: THREE.CanvasTexture;
  kerbMap: THREE.CanvasTexture;
  buildingFacadeMap: THREE.CanvasTexture;
  gantryBannerMap: THREE.CanvasTexture;
  smokeMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  headlightProjectionMap: THREE.CanvasTexture;
  dispose: () => void;
}

export function createSkyReflectionTexture(
  skyHex: string,
  accentHex: string
): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Rich twilight/night atmospheric gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
  skyGrad.addColorStop(0.0, '#02040a');
  skyGrad.addColorStop(0.32, skyHex);
  skyGrad.addColorStop(0.49, accentHex);
  skyGrad.addColorStop(0.515, '#1e293b');
  skyGrad.addColorStop(0.75, '#090d16');
  skyGrad.addColorStop(1.0, '#04060c');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h);

  // Subtle horizon atmospheric bloom band
  const glowGrad = ctx.createRadialGradient(w * 0.52, h * 0.48, 12, w * 0.52, h * 0.48, w * 0.38);
  glowGrad.addColorStop(0, 'rgba(255, 225, 175, 0.42)');
  glowGrad.addColorStop(0.45, 'rgba(56, 189, 248, 0.14)');
  glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, w, h);

  // Distant stars in upper sky dome
  for (let i = 0; i < 240; i++) {
    const sx = ((i * 7919) % w);
    const sy = ((i * 3571) % Math.floor(h * 0.42));
    const alpha = 0.2 + ((i * 17) % 10) * 0.07;
    ctx.fillStyle = `rgba(226, 232, 240, ${alpha.toFixed(2)})`;
    ctx.fillRect(sx, sy, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
  }

  // Soft overhead studio/highway reflection streaks for crisp car clearcoat highlights
  ctx.fillStyle = 'rgba(248, 250, 252, 0.65)';
  for (let i = 0; i < 6; i++) {
    const rx = (i / 6) * w + 32;
    ctx.fillRect(rx, h * 0.16, 78, 6);
  }
  ctx.fillStyle = 'rgba(251, 191, 36, 0.45)';
  for (let i = 0; i < 12; i++) {
    const rx = (i / 12) * w + 16;
    ctx.fillRect(rx, h * 0.455, 28, 4);
  }

  // Distant mountain / skyline silhouette along horizon
  ctx.fillStyle = '#070a12';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.51);
  for (let x = 0; x <= w; x += 24) {
    const ridge = Math.sin(x * 0.018) * 10 + Math.cos(x * 0.043) * 6;
    ctx.lineTo(x, h * 0.495 - Math.abs(ridge));
  }
  ctx.lineTo(w, h * 0.54);
  ctx.lineTo(0, h * 0.54);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const aniso = Math.min(maxAnisotropy || 4, 8);

  // 1. Damp 4-lane Night Asphalt Albedo Map
  const roadCanvas = document.createElement('canvas');
  roadCanvas.width = 512;
  roadCanvas.height = 512;
  const rctx = roadCanvas.getContext('2d')!;

  rctx.fillStyle = '#151922';
  rctx.fillRect(0, 0, 512, 512);

  // Subtle asphalt aggregate grain
  for (let i = 0; i < 20000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = 16 + Math.floor(Math.random() * 24);
    rctx.fillStyle = `rgb(${v},${v + 3},${v + 8})`;
    rctx.fillRect(x, y, 2, 2);
  }

  // Subtle tire wear tracks in the 4 lanes
  const laneCenters = [84, 198, 314, 428];
  for (const cx of laneCenters) {
    const grad = rctx.createLinearGradient(cx - 28, 0, cx + 28, 0);
    grad.addColorStop(0, 'rgba(8,10,15,0)');
    grad.addColorStop(0.3, 'rgba(8,10,15,0.35)');
    grad.addColorStop(0.5, 'rgba(28,34,46,0.12)');
    grad.addColorStop(0.7, 'rgba(8,10,15,0.35)');
    grad.addColorStop(1, 'rgba(8,10,15,0)');
    rctx.fillStyle = grad;
    rctx.fillRect(cx - 28, 0, 56, 512);
  }

  // Outer solid shoulder lines (amber left/right edge)
  rctx.fillStyle = '#d97706';
  rctx.fillRect(14, 0, 7, 512);
  rctx.fillRect(491, 0, 7, 512);

  // Center double yellow-amber line
  rctx.fillStyle = '#f59e0b';
  rctx.fillRect(250, 0, 4, 512);
  rctx.fillRect(258, 0, 4, 512);

  // Dashed white lane dividers
  rctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
  for (let y = 24; y < 512; y += 128) {
    rctx.fillRect(136, y, 5, 64);
    rctx.fillRect(371, y, 5, 64);
  }

  const asphaltMap = new THREE.CanvasTexture(roadCanvas);
  asphaltMap.colorSpace = THREE.SRGBColorSpace;
  asphaltMap.wrapS = THREE.RepeatWrapping;
  asphaltMap.wrapT = THREE.RepeatWrapping;
  asphaltMap.anisotropy = aniso;

  // 1b. Tactile Asphalt Normal Map (micro aggregate grain for specular highlights)
  const normCanvas = document.createElement('canvas');
  normCanvas.width = 256;
  normCanvas.height = 256;
  const nctx = normCanvas.getContext('2d')!;
  const imgData = nctx.createImageData(256, 256);
  const d = imgData.data;
  for (let i = 0; i < 256 * 256; i++) {
    const idx = i * 4;
    const nx = Math.floor(128 + (Math.random() - 0.5) * 38);
    const ny = Math.floor(128 + (Math.random() - 0.5) * 38);
    d[idx] = nx;
    d[idx + 1] = ny;
    d[idx + 2] = 248;
    d[idx + 3] = 255;
  }
  nctx.putImageData(imgData, 0, 0);
  const asphaltNormalMap = new THREE.CanvasTexture(normCanvas);
  asphaltNormalMap.wrapS = THREE.RepeatWrapping;
  asphaltNormalMap.wrapT = THREE.RepeatWrapping;
  asphaltNormalMap.anisotropy = aniso;

  // 2. Damp Asphalt Roughness Map (glossy wet patches + rougher aggregate)
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = 256;
  roughCanvas.height = 256;
  const rgCtx = roughCanvas.getContext('2d')!;
  rgCtx.fillStyle = '#6c6c6c';
  rgCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 75; i++) {
    const px = Math.random() * 256;
    const py = Math.random() * 256;
    const rad = 18 + Math.random() * 44;
    const g = rgCtx.createRadialGradient(px, py, 2, px, py, rad);
    const wet = Math.random() > 0.32;
    g.addColorStop(0, wet ? 'rgba(20,20,20,0.72)' : 'rgba(165,165,165,0.45)');
    g.addColorStop(1, 'rgba(110,110,110,0)');
    rgCtx.fillStyle = g;
    rgCtx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
  const asphaltRoughnessMap = new THREE.CanvasTexture(roughCanvas);
  asphaltRoughnessMap.wrapS = THREE.RepeatWrapping;
  asphaltRoughnessMap.wrapT = THREE.RepeatWrapping;
  asphaltRoughnessMap.anisotropy = aniso;

  // 3. Red & White Racing Kerb Texture
  const kerbCanvas = document.createElement('canvas');
  kerbCanvas.width = 128;
  kerbCanvas.height = 256;
  const kctx = kerbCanvas.getContext('2d')!;
  kctx.fillStyle = '#dc2626';
  kctx.fillRect(0, 0, 128, 128);
  kctx.fillStyle = '#e2e8f0';
  kctx.fillRect(0, 128, 128, 128);
  kctx.fillStyle = 'rgba(0,0,0,0.2)';
  kctx.fillRect(0, 0, 16, 256);
  const kerbMap = new THREE.CanvasTexture(kerbCanvas);
  kerbMap.colorSpace = THREE.SRGBColorSpace;
  kerbMap.wrapS = THREE.RepeatWrapping;
  kerbMap.wrapT = THREE.RepeatWrapping;
  kerbMap.anisotropy = aniso;

  // 4. City Building Lit Window Facade
  const bCanvas = document.createElement('canvas');
  bCanvas.width = 256;
  bCanvas.height = 512;
  const bctx = bCanvas.getContext('2d')!;
  bctx.fillStyle = '#0c111d';
  bctx.fillRect(0, 0, 256, 512);
  const cols = 8;
  const rows = 24;
  const cw = 256 / cols;
  const rh = 512 / rows;
  for (let r = 0; r < rows; r++) {
    const floorLitBias = Math.random();
    for (let c = 0; c < cols; c++) {
      const rnd = Math.random();
      if (rnd < 0.38 + floorLitBias * 0.2) {
        const warm = Math.random() > 0.35;
        bctx.fillStyle = warm
          ? `rgba(251, 191, 36, ${0.35 + Math.random() * 0.5})`
          : `rgba(56, 189, 248, ${0.3 + Math.random() * 0.5})`;
      } else {
        bctx.fillStyle = '#141c2e';
      }
      bctx.fillRect(c * cw + 5, r * rh + 4, cw - 10, rh - 8);
    }
  }
  const buildingFacadeMap = new THREE.CanvasTexture(bCanvas);
  buildingFacadeMap.colorSpace = THREE.SRGBColorSpace;
  buildingFacadeMap.wrapS = THREE.RepeatWrapping;
  buildingFacadeMap.wrapT = THREE.RepeatWrapping;
  buildingFacadeMap.anisotropy = aniso;

  // 5. Start/Finish Gantry Banner
  const gCanvas = document.createElement('canvas');
  gCanvas.width = 1024;
  gCanvas.height = 256;
  const gctx = gCanvas.getContext('2d')!;
  gctx.fillStyle = '#0b0f19';
  gctx.fillRect(0, 0, 1024, 256);
  const sq = 32;
  for (let x = 0; x < 1024; x += sq) {
    for (let y = 0; y < 64; y += sq) {
      const white = ((x / sq) + (y / sq)) % 2 === 0;
      gctx.fillStyle = white ? '#f8fafc' : '#0f172a';
      gctx.fillRect(x, y, sq, sq);
      gctx.fillRect(x, 192 + y, sq, sq);
    }
  }
  gctx.fillStyle = '#f59e0b';
  gctx.fillRect(0, 64, 1024, 6);
  gctx.fillRect(0, 186, 1024, 6);
  gctx.fillStyle = '#f8fafc';
  gctx.font = 'bold 74px sans-serif';
  gctx.textAlign = 'center';
  gctx.textBaseline = 'middle';
  gctx.fillText('APEX VELOCITY // START', 512, 128);
  const gantryBannerMap = new THREE.CanvasTexture(gCanvas);
  gantryBannerMap.colorSpace = THREE.SRGBColorSpace;
  gantryBannerMap.anisotropy = aniso;

  // 6. Soft Smoke Puff Texture
  const sCanvas = document.createElement('canvas');
  sCanvas.width = 128;
  sCanvas.height = 128;
  const sctx = sCanvas.getContext('2d')!;
  const sGrad = sctx.createRadialGradient(64, 64, 4, 64, 64, 60);
  sGrad.addColorStop(0, 'rgba(226, 232, 240, 0.78)');
  sGrad.addColorStop(0.45, 'rgba(148, 163, 184, 0.35)');
  sGrad.addColorStop(1, 'rgba(148, 163, 184, 0)');
  sctx.fillStyle = sGrad;
  sctx.fillRect(0, 0, 128, 128);
  const smokeMap = new THREE.CanvasTexture(sCanvas);
  smokeMap.colorSpace = THREE.SRGBColorSpace;

  // 7. Radial Contact Shadow Texture for Cars
  const cCanvas = document.createElement('canvas');
  cCanvas.width = 256;
  cCanvas.height = 256;
  const cctx = cCanvas.getContext('2d')!;
  const cGrad = cctx.createRadialGradient(128, 128, 18, 128, 128, 122);
  cGrad.addColorStop(0, 'rgba(0, 0, 0, 0.88)');
  cGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.48)');
  cGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  cctx.fillStyle = cGrad;
  cctx.fillRect(0, 0, 256, 256);
  const contactShadowMap = new THREE.CanvasTexture(cCanvas);

  // 8. Dual-Beam Headlight Ground Projection Map
  const hCanvas = document.createElement('canvas');
  hCanvas.width = 256;
  hCanvas.height = 256;
  const hctx = hCanvas.getContext('2d')!;
  hctx.clearRect(0, 0, 256, 256);
  for (const bx of [86, 170]) {
    const grad = hctx.createRadialGradient(bx, 245, 6, bx, 120, 130);
    grad.addColorStop(0, 'rgba(240, 249, 255, 0.92)');
    grad.addColorStop(0.45, 'rgba(186, 230, 253, 0.42)');
    grad.addColorStop(1, 'rgba(186, 230, 253, 0)');
    hctx.fillStyle = grad;
    hctx.beginPath();
    hctx.moveTo(bx - 12, 256);
    hctx.lineTo(bx + 12, 256);
    hctx.lineTo(bx + 64, 0);
    hctx.lineTo(bx - 64, 0);
    hctx.closePath();
    hctx.fill();
  }
  const headlightProjectionMap = new THREE.CanvasTexture(hCanvas);
  headlightProjectionMap.colorSpace = THREE.SRGBColorSpace;

  return {
    asphaltMap,
    asphaltNormalMap,
    asphaltRoughnessMap,
    kerbMap,
    buildingFacadeMap,
    gantryBannerMap,
    smokeMap,
    contactShadowMap,
    headlightProjectionMap,
    dispose: () => {
      asphaltMap.dispose();
      asphaltNormalMap.dispose();
      asphaltRoughnessMap.dispose();
      kerbMap.dispose();
      buildingFacadeMap.dispose();
      gantryBannerMap.dispose();
      smokeMap.dispose();
      contactShadowMap.dispose();
      headlightProjectionMap.dispose();
    },
  };
}

