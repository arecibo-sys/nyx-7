import * as THREE from 'three';

/* ══ Procedural textures ═════════════════════════════════════════ */

/** Orange-peel micro-normal for automotive clearcoat. */
function orangePeelNormal(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;

  // Low-frequency value noise, bilinearly upsampled.
  const G = 42;
  const grid = new Float32Array(G * G);
  for (let i = 0; i < grid.length; i++) grid[i] = Math.random();
  const sample = (x, y) => {
    const gx = x * G, gy = y * G;
    const x0 = Math.floor(gx) % G, y0 = Math.floor(gy) % G;
    const x1 = (x0 + 1) % G, y1 = (y0 + 1) % G;
    const fx = gx - Math.floor(gx), fy = gy - Math.floor(gy);
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = grid[y0 * G + x0], b = grid[y0 * G + x1];
    const cc = grid[y1 * G + x0], dd = grid[y1 * G + x1];
    return (a + (b - a) * sx) * (1 - sy) + (cc + (dd - cc) * sx) * sy;
  };

  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      h[y * size + x] = sample(u, v) * 0.6 + sample(u * 2.7, v * 2.7) * 0.3 + Math.random() * 0.1;
    }
  }

  const S = 1.1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)];
      const r = h[y * size + ((x + 1) % size)];
      const u = h[((y - 1 + size) % size) * size + x];
      const dn = h[((y + 1) % size) * size + x];
      let nx = (l - r) * S, ny = (u - dn) * S, nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      d[i]     = (nx * inv * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * inv * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 9);
  return tex;
}

/** 2×2 twill carbon-fibre weave — colour + normal pair. */
function carbonWeave(size = 512) {
  const map = document.createElement('canvas');
  map.width = map.height = size;
  const mctx = map.getContext('2d');
  const nrm = document.createElement('canvas');
  nrm.width = nrm.height = size;
  const nctx = nrm.getContext('2d');

  const cell = size / 16;      // one tow
  mctx.fillStyle = '#0b0c0e';
  mctx.fillRect(0, 0, size, size);

  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      // 2×2 twill: warp on top when ((x + y) mod 4) < 2
      const warp = (((x + y) % 4) < 2);
      const g = mctx.createLinearGradient(
        x * cell, y * cell,
        warp ? x * cell : (x + 1) * cell,
        warp ? (y + 1) * cell : y * cell
      );
      g.addColorStop(0, '#141619');
      g.addColorStop(0.45, '#31363d');
      g.addColorStop(1, '#0d0f11');
      mctx.fillStyle = g;
      mctx.fillRect(x * cell, y * cell, cell, cell);

      const ng = nctx.createLinearGradient(
        x * cell, y * cell,
        warp ? x * cell : (x + 1) * cell,
        warp ? (y + 1) * cell : y * cell
      );
      ng.addColorStop(0, warp ? '#8080ff' : '#3f80ff');
      ng.addColorStop(0.5, '#8080ff');
      ng.addColorStop(1, warp ? '#8080ff' : '#c080ff');
      nctx.fillStyle = ng;
      nctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  const mk = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 4);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: mk(map, true), normalMap: mk(nrm, false) };
}

/** Radial brushed-metal anisotropy for machined bezels and rims. */
function brushedRoughness(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 2600; i++) {
    const a = Math.random() * Math.PI * 2;
    const r0 = Math.random() * size * 0.5;
    const len = 12 + Math.random() * 80;
    const v = 40 + Math.random() * 90;
    ctx.strokeStyle = `rgb(${v},${v},${v})`;
    ctx.lineWidth = 0.4 + Math.random() * 1.1;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r0, a, a + len / (r0 + 40));
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Tyre sidewall: lettering ring + fine mould texture. */
function tyreSidewall(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#121214';
  ctx.fillRect(0, 0, size, size);

  // Fine mould grain
  for (let i = 0; i < 9000; i++) {
    const v = 14 + Math.random() * 16;
    ctx.fillStyle = `rgb(${v},${v},${v + 1})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.4, 1.4);
  }
  // Raised lettering band (U wraps around circumference)
  ctx.save();
  ctx.translate(0, size * 0.5);
  ctx.fillStyle = '#3a3c40';
  ctx.font = `600 ${size * 0.075}px ui-sans-serif, sans-serif`;
  ctx.textBaseline = 'middle';
  const label = 'NYX  ·  295/35 ZR22  ·  AEROGRIP  ·  DOT 4H2X  ·  ';
  for (let i = 0; i < 4; i++) ctx.fillText(label, i * size * 0.25, 0);
  ctx.restore();

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ══ Palette ═════════════════════════════════════════════════════ */

export const PAINTS = [
  { name: 'Obsidian Teal',  color: 0x0d3b3d, flake: 0.86, css: '#123f42' },
  { name: 'Vantablack',     color: 0x08090b, flake: 0.55, css: '#0b0d10' },
  { name: 'Solar Bronze',   color: 0x4a2f14, flake: 0.92, css: '#7a5024' },
  { name: 'Nardo Storm',    color: 0x585d61, flake: 0.42, css: '#6b7075' },
  { name: 'Pearl Frost',    color: 0xd6dade, flake: 0.30, css: '#dfe3e7' },
  { name: 'Ion Magenta',    color: 0x4d0d33, flake: 0.90, css: '#7d1450' },
];

/* ══ Material library ════════════════════════════════════════════ */

export function createMaterials(quality = 'high') {
  const hi = quality !== 'low';
  const peel = hi ? orangePeelNormal(hi && quality === 'ultra' ? 512 : 256) : null;
  const carbon = carbonWeave(hi ? 512 : 256);
  const brushed = brushedRoughness(hi ? 512 : 256);
  const sidewall = tyreSidewall(hi ? 512 : 256);

  const paint = new THREE.MeshPhysicalMaterial({
    color: PAINTS[0].color,
    metalness: 0.70,
    roughness: 0.24,
    clearcoat: 1.0,
    clearcoatRoughness: 0.045,
    envMapIntensity: 2.1,
    side: THREE.DoubleSide,
    normalMap: peel,
    normalScale: peel ? new THREE.Vector2(0.06, 0.06) : undefined,
  });

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0a1418,
    metalness: 0.0,
    roughness: 0.075,
    transparent: true,
    opacity: 0.66,
    transmission: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.055,
    envMapIntensity: 1.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const gloss = new THREE.MeshPhysicalMaterial({
    color: 0x0a0b0d, metalness: 0.35, roughness: 0.055,
    clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.9,
    side: THREE.DoubleSide,
  });

  const carbonMat = new THREE.MeshPhysicalMaterial({
    color: 0x33373c,
    map: carbon.map,
    normalMap: carbon.normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    metalness: 0.26, roughness: 0.52,
    clearcoat: 0.30, clearcoatRoughness: 0.22,
    envMapIntensity: 0.45,
    side: THREE.DoubleSide,
  });

  const machined = new THREE.MeshStandardMaterial({
    color: 0xc8ccd0, metalness: 1.0, roughness: 0.24,
    roughnessMap: brushed, envMapIntensity: 1.7,
  });

  const anodised = new THREE.MeshStandardMaterial({
    color: 0x6d5433, metalness: 1.0, roughness: 0.38,
    roughnessMap: brushed, envMapIntensity: 1.4,
  });

  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x2b2f34, metalness: 0.95, roughness: 0.42, envMapIntensity: 1.1,
  });

  const rimBright = new THREE.MeshStandardMaterial({
    color: 0xd2d6da, metalness: 1.0, roughness: 0.14,
    roughnessMap: brushed, envMapIntensity: 1.9,
  });

  const rimDark = new THREE.MeshStandardMaterial({
    color: 0x1b1e22, metalness: 0.9, roughness: 0.52, envMapIntensity: 0.9,
  });

  const rubber = new THREE.MeshStandardMaterial({
    color: 0x141416, metalness: 0.0, roughness: 0.86,
    map: sidewall, envMapIntensity: 0.35,
  });

  const tread = new THREE.MeshStandardMaterial({
    color: 0x0f0f11, metalness: 0.0, roughness: 0.95, envMapIntensity: 0.2,
  });

  const caliper = new THREE.MeshStandardMaterial({
    color: 0x50565c, metalness: 0.9, roughness: 0.34, envMapIntensity: 1.3,
  });

  const disc = new THREE.MeshStandardMaterial({
    color: 0x39383a, metalness: 0.7, roughness: 0.55, envMapIntensity: 0.9,
  });

  const cabin = new THREE.MeshStandardMaterial({
    color: 0x121417, metalness: 0.1, roughness: 0.78, envMapIntensity: 0.5,
    side: THREE.DoubleSide,
  });

  const leather = new THREE.MeshStandardMaterial({
    color: 0x5b4634, metalness: 0.0, roughness: 0.62, envMapIntensity: 0.6,
  });

  const wood = new THREE.MeshStandardMaterial({
    color: 0x5a4a3a, metalness: 0.0, roughness: 0.48, envMapIntensity: 0.7,
  });

  const screen = new THREE.MeshStandardMaterial({
    color: 0x000000, emissive: 0x0f3f4a, emissiveIntensity: 1.1,
    metalness: 0.4, roughness: 0.12,
  });

  const headlight = new THREE.MeshStandardMaterial({
    color: 0x0a1015, emissive: 0xbfe8ff, emissiveIntensity: 1.55,
    metalness: 0.2, roughness: 0.15, toneMapped: false,
  });

  const taillight = new THREE.MeshStandardMaterial({
    color: 0x120406, emissive: 0xff2436, emissiveIntensity: 1.35,
    metalness: 0.2, roughness: 0.2, toneMapped: false,
  });

  const chargeRing = new THREE.MeshStandardMaterial({
    color: 0x001410, emissive: 0x2ef0c0, emissiveIntensity: 1.5, toneMapped: false,
  });

  const trim = new THREE.MeshStandardMaterial({
    color: 0x9aa0a6, metalness: 1.0, roughness: 0.3, envMapIntensity: 1.6,
  });

  const mesh = new THREE.MeshStandardMaterial({
    color: 0x0d0e10, metalness: 0.6, roughness: 0.65, envMapIntensity: 0.6,
    side: THREE.DoubleSide,
  });

  return {
    paint, glass, gloss, carbon: carbonMat, machined, anodised, darkMetal,
    rimBright, rimDark, rubber, tread, caliper, disc, cabin, leather, wood,
    screen, headlight, taillight, chargeRing, trim, mesh,
    _textures: [peel, carbon.map, carbon.normalMap, brushed, sidewall].filter(Boolean),
  };
}

export function applyPaint(materials, paintIndex) {
  const p = PAINTS[paintIndex];
  materials.paint.color.setHex(p.color);
  materials.paint.metalness = 0.42 + p.flake * 0.34;
  materials.paint.roughness = 0.32 - p.flake * 0.11;
  materials.paint.needsUpdate = true;
  return p;
}
