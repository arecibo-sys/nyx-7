import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ══════════════════════════════════════════════════════════════════
   NYX-7 — procedural vehicle
   Axes:  +X forward · +Y up · +Z left · ground plane at y = 0
   Units: metres

   The shell is a lofted surface. Each station along X is a superellipse
   with *separate* exponents above and below its widest point: a high
   exponent up top gives the flat deck and tight shoulder radius a car
   needs, a lower one underneath lets the flanks tuck in over the sills.
   ══════════════════════════════════════════════════════════════════ */

const HALF_LEN   = 2.470;   // 4,940 mm overall length
const HALF_WIDTH = 0.9975;  // 1,995 mm overall width
const AXLE_F     =  1.510;  // 3,020 mm wheelbase
const AXLE_R     = -1.510;
const WHEEL_R    = 0.3855;  // 265/40 & 295/35 R22 rolling radius
const TRACK_F    = 0.845;
const TRACK_R    = 0.8525;

/* ── keyframe interpolation (Catmull-Rom, clamped ends) ─────────── */
function curveFn(keys) {
  const n = keys.length;
  return (x) => {
    if (x <= keys[0][0]) return keys[0][1];
    if (x >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0;
    while (i < n - 2 && keys[i + 1][0] < x) i++;
    const [x0, y0] = keys[i], [x1, y1] = keys[i + 1];
    const t = (x - x0) / (x1 - x0);
    const ym1 = keys[Math.max(0, i - 1)][1];
    const y2  = keys[Math.min(n - 1, i + 2)][1];
    const m0 = (y1 - ym1) * 0.5, m1 = (y2 - y0) * 0.5;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0
         + (t3 - 2 * t2 + t) * m0
         + (-2 * t3 + 3 * t2) * y1
         + (t3 - t2) * m1;
  };
}

/* ── body master curves ─────────────────────────────────────────── */

// Beltline / hood crown
const yTop = curveFn([
  [-2.470, 1.006], [-2.320, 1.028], [-2.050, 1.038], [-1.650, 1.042],
  [-1.300, 1.044], [-0.850, 1.036], [ 0.000, 1.026], [ 0.700, 1.014],
  [ 1.150, 0.992], [ 1.600, 0.958], [ 1.980, 0.925], [ 2.260, 0.896],
  [ 2.470, 0.862],
]);

// Rocker / valance line, before the wheel arches are cut in
const yBase = curveFn([
  [-2.470, 0.425], [-2.270, 0.300], [-1.980, 0.188], [-1.680, 0.150],
  [ 0.000, 0.134], [ 1.680, 0.150], [ 1.980, 0.192], [ 2.270, 0.308],
  [ 2.470, 0.432],
]);

// Half-width — note the flare over both axles (shoulders / haunches)
const halfW = curveFn([
  [-2.470, 0.862], [-2.290, 0.920], [-1.980, 0.962], [-1.510, 0.9975],
  [-1.050, 0.962], [ 0.000, 0.948], [ 1.050, 0.958], [ 1.510, 0.988],
  [ 1.980, 0.958], [ 2.290, 0.908], [ 2.470, 0.855],
]);

// Upper squareness — flat deck, tight shoulder
const nTop = curveFn([
  [-2.470, 4.4], [-1.900, 5.6], [0.000, 6.0], [1.200, 5.0], [1.900, 4.4],
  [ 2.470, 3.8],
]);
// Lower squareness — flanks tuck under toward the sills
const nBot = curveFn([
  [-2.470, 2.8], [-1.900, 3.2], [0.000, 3.4], [1.900, 3.1], [2.470, 2.7],
]);

const ARCH_TOP = 0.795, ARCH_R = 0.585;
function archLift(x) {
  let h = 0;
  for (const a of [AXLE_F, AXLE_R]) {
    const d = Math.abs(x - a);
    if (d < ARCH_R) {
      const k = Math.cos((Math.PI * d) / ARCH_R) * 0.5 + 0.5;
      h = Math.max(h, ARCH_TOP * Math.pow(k, 0.5));
    }
  }
  return h;
}

function bodySection(x) {
  const top = yTop(x);
  const bot = Math.max(yBase(x), archLift(x));
  return {
    cy: (top + bot) * 0.5,
    ry: Math.max(0.02, (top - bot) * 0.5),
    rz: halfW(x),
    nTop: nTop(x),
    nBot: nBot(x),
  };
}

/* ── greenhouse master curves ───────────────────────────────────── */
const G_X0 = -1.620, G_X1 = 1.450;

const gTop = curveFn([
  [-1.620, 1.092], [-1.340, 1.284], [-0.980, 1.406], [-0.480, 1.468],
  [ 0.060, 1.480], [ 0.560, 1.450], [ 0.980, 1.340], [ 1.280, 1.170],
  [ 1.450, 1.048],
]);
const gHalfW = curveFn([
  [-1.620, 0.630], [-1.220, 0.752], [-0.600, 0.804], [0.150, 0.812],
  [ 0.750, 0.798], [ 1.150, 0.752], [1.450, 0.686],
]);
const gNTop = curveFn([[-1.620, 3.2], [0.000, 4.2], [1.450, 3.0]]);
const gNBot = curveFn([[-1.620, 2.2], [0.000, 2.6], [1.450, 2.2]]);

function glassSection(x) {
  const top = gTop(x);
  const bot = yTop(x) - 0.060;             // always sunk under the beltline
  return {
    cy: (top + bot) * 0.5,
    ry: Math.max(0.02, (top - bot) * 0.5),
    rz: gHalfW(x),
    nTop: gNTop(x),
    nBot: gNBot(x),
  };
}

/* ── superellipse helpers ───────────────────────────────────────── */
function sePoint(sec, th) {
  const s = Math.sin(th), c = Math.cos(th);
  const n = s >= 0 ? sec.nTop : sec.nBot;
  const p = 2 / n;
  return [
    sec.cy + sec.ry * Math.sign(s) * Math.pow(Math.abs(s), p),
    sec.rz * Math.sign(c) * Math.pow(Math.abs(c), p),
  ];
}

/** Lateral half-width of a section at a given height. */
function seZAtY(sec, y) {
  const n = y >= sec.cy ? sec.nTop : sec.nBot;
  const s = Math.abs(THREE.MathUtils.clamp((y - sec.cy) / sec.ry, -1, 1));
  return sec.rz * Math.pow(Math.max(0, 1 - Math.pow(s, n)), 1 / n);
}

/** Half-width of the body shell at (x, y) — used to seat trim on the surface. */
function bodyZ(x, y) { return seZAtY(bodySection(x), y); }

/** Height of the upper shell at (x, z) — inverse of bodyZ, for hood shut lines. */
function bodyYAtZ(x, zt) {
  const sec = bodySection(x);
  let lo = sec.cy, hi = sec.cy + sec.ry;
  for (let i = 0; i < 22; i++) {
    const m = (lo + hi) * 0.5;
    if (seZAtY(sec, m) > zt) lo = m; else hi = m;
  }
  return (lo + hi) * 0.5;
}

/* ── lofted surface builder ─────────────────────────────────────── */
function buildLoft(sectionAt, x0, x1, NI, NJ) {
  const grid = [];
  for (let i = 0; i < NI; i++) {
    const t = i / (NI - 1);
    const x = x0 + (x1 - x0) * t;
    const sec = sectionAt(x);
    const row = [];
    for (let j = 0; j < NJ; j++) {
      const [y, z] = sePoint(sec, (j / NJ) * Math.PI * 2);
      row.push([x, y, z]);
    }
    row.cy = sec.cy;
    grid.push(row);
  }

  const cols = NJ + 1;
  const pos = [], nor = [], uv = [], idx = [];
  const get = (i, j) => grid[THREE.MathUtils.clamp(i, 0, NI - 1)][(j % NJ + NJ) % NJ];

  for (let i = 0; i < NI; i++) {
    for (let j = 0; j <= NJ; j++) {
      const p = get(i, j);
      const a = get(i - 1, j), b = get(i + 1, j);
      const c = get(i, j - 1), d = get(i, j + 1);
      const du = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const dv = new THREE.Vector3(d[0] - c[0], d[1] - c[1], d[2] - c[2]);
      const n = new THREE.Vector3().crossVectors(dv, du);
      const out = new THREE.Vector3(0, p[1] - grid[i].cy, p[2]);
      if (n.lengthSq() < 1e-12) n.copy(out);
      n.normalize();
      if (out.lengthSq() > 1e-9 && n.dot(out) < 0) n.negate();
      pos.push(p[0], p[1], p[2]);
      nor.push(n.x, n.y, n.z);
      uv.push(j / NJ, i / (NI - 1));
    }
  }

  for (let i = 0; i < NI - 1; i++) {
    for (let j = 0; j < NJ; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }

  // End caps (flat fascia planes)
  const cap = (i, sign) => {
    const base = pos.length / 3;
    const row = grid[i];
    pos.push(row[0][0], row.cy, 0); nor.push(sign, 0, 0); uv.push(0.5, 0.5);
    for (let j = 0; j < NJ; j++) {
      pos.push(row[j][0], row[j][1], row[j][2]);
      nor.push(sign, 0, 0);
      uv.push(0.5 + row[j][2] * 0.4, 0.5 + row[j][1] * 0.4);
    }
    for (let j = 0; j < NJ; j++) {
      const p1 = base + 1 + j, p2 = base + 1 + ((j + 1) % NJ);
      if (sign > 0) idx.push(base, p2, p1); else idx.push(base, p1, p2);
    }
  };
  cap(NI - 1, 1);
  cap(0, -1);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/* ── small geometry helpers ─────────────────────────────────────── */
/** Rounded box whose final outer size is exactly w × h × d. */
function roundedBox(w, h, d, r = 0.02, seg = 2) {
  r = Math.min(r, w / 4, h / 4, d / 4);
  const s = new THREE.Shape();
  const hw = Math.max(0.001, w / 2 - 2 * r), hh = Math.max(0.001, h / 2 - 2 * r);
  s.absarc(hw, hh, r, 0, Math.PI / 2);
  s.absarc(-hw, hh, r, Math.PI / 2, Math.PI);
  s.absarc(-hw, -hh, r, Math.PI, Math.PI * 1.5);
  s.absarc(hw, -hh, r, Math.PI * 1.5, Math.PI * 2);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.001, d - 2 * r), bevelEnabled: true,
    bevelSize: r, bevelThickness: r, bevelSegments: seg, curveSegments: seg + 3,
  });
  g.translate(0, 0, -(d - 2 * r) / 2);
  g.computeVertexNormals();
  return g;
}

function tubeFromPoints(points, radius, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, Math.max(12, points.length * 3), radius, radial, false);
}

/* ── wheel assembly ─────────────────────────────────────────────── */
function buildWheel(M, quality) {
  const hi = quality !== 'low';
  const g = new THREE.Group();          // local axis = Y, radial plane = XZ
  const seg = hi ? 48 : 28;

  /* Tyre — lathed carcass with circumferential grooves */
  const profile = [
    [0.279, -0.142], [0.302, -0.150], [0.344, -0.152], [0.371, -0.142],
    [0.382, -0.112], [0.3855, -0.070], [0.3800, -0.052], [0.3855, -0.034],
    [0.3855,  0.000], [0.3800, 0.018], [0.3855, 0.036], [0.3855, 0.070],
    [0.382, 0.112], [0.371, 0.142], [0.344, 0.152], [0.302, 0.150], [0.279, 0.142],
  ].map(([r, h]) => new THREE.Vector2(r, h));
  const tyre = new THREE.Mesh(new THREE.LatheGeometry(profile, seg), M.rubber);
  g.add(tyre);

  /* Tread sipes */
  const sipes = [];
  const N = hi ? 46 : 26;
  for (let i = 0; i < N; i++) {
    const b = new THREE.BoxGeometry(0.020, 0.118, 0.016);
    b.translate(0, (i % 2 ? 0.037 : -0.037), 0.3815);
    b.rotateY((i / N) * Math.PI * 2);
    sipes.push(b);
  }
  g.add(new THREE.Mesh(mergeGeometries(sipes), M.tread));

  /* Rim barrel + outer lip */
  g.add(new THREE.Mesh(
    new THREE.CylinderGeometry(0.2794, 0.2794, 0.268, seg, 1, true), M.rimDark));
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.2760, 0.0135, 8, seg), M.rimBright);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.132;
  g.add(lip);

  /* Ten twin-spoke turbine blades */
  const bright = [], dark = [];
  for (let i = 0; i < 10; i++) {
    const base = (i / 10) * Math.PI * 2;
    for (const off of [-0.098, 0.098]) {
      const b = new THREE.BoxGeometry(0.034, 0.052, 0.245);
      b.translate(0, 0.038, 0.156);
      b.rotateX(THREE.MathUtils.degToRad(3.2));     // aero twist
      b.rotateY(base + off);
      (i % 2 === 0 ? bright : dark).push(b);
    }
  }
  g.add(new THREE.Mesh(mergeGeometries(bright), M.rimBright));
  g.add(new THREE.Mesh(mergeGeometries(dark), M.rimDark));

  /* Hub, centre cap, lug bolts */
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.092, 0.062, 20), M.rimDark);
  hub.position.y = 0.052;
  g.add(hub);
  const capm = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.052, 0.016, 24), M.machined);
  capm.position.y = 0.088;
  g.add(capm);
  const logo = new THREE.Mesh(new THREE.TorusGeometry(0.030, 0.0045, 6, 20), M.chargeRing);
  logo.rotation.x = Math.PI / 2;
  logo.position.y = 0.0965;
  g.add(logo);

  const lugs = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const c = new THREE.CylinderGeometry(0.0135, 0.0135, 0.022, 6);
    c.translate(Math.cos(a) * 0.070, 0.074, Math.sin(a) * 0.070);
    lugs.push(c);
  }
  g.add(new THREE.Mesh(mergeGeometries(lugs), M.machined));

  /* Carbon-ceramic disc + hat */
  const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.198, 0.198, 0.034, seg, 1, true), M.disc);
  rotor.position.y = -0.010;
  g.add(rotor);
  const face = new THREE.Mesh(new THREE.RingGeometry(0.108, 0.198, seg), M.disc);
  face.rotation.x = -Math.PI / 2;
  face.position.y = 0.007;
  g.add(face);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.108, 0.108, 0.060, 24, 1, true), M.darkMetal);
  hat.position.y = 0.030;
  g.add(hat);

  /* Six-piston monoblock caliper */
  const cal = new THREE.Mesh(roundedBox(0.062, 0.108, 0.185, 0.014), M.caliper);
  cal.rotation.x = Math.PI / 2;
  cal.position.set(-0.176, -0.012, 0.052);
  cal.rotation.z = 0.36;
  g.add(cal);

  return g;
}

/* ══ main build ═════════════════════════════════════════════════ */
export function buildCar(M, quality = 'high') {
  const car = new THREE.Group();
  const refs = { spoiler: null, headlights: [], taillights: [], wheels: [], glass: [] };

  const res = quality === 'ultra' ? [200, 120]
            : quality === 'high' ? [156, 96]
            : quality === 'medium' ? [112, 68] : [78, 48];
  const [NI, NJ] = res;

  /* ── body shell ─────────────────────────────────────────────── */
  const body = new THREE.Mesh(
    buildLoft(bodySection, -HALF_LEN, HALF_LEN, NI, NJ), M.paint);
  body.castShadow = true;
  body.receiveShadow = true;
  car.add(body);

  /* ── greenhouse ─────────────────────────────────────────────── */
  const glass = new THREE.Mesh(
    buildLoft(glassSection, G_X0, G_X1, Math.round(NI * 0.6), Math.round(NJ * 0.75)),
    M.glass);
  glass.renderOrder = 4;
  glass.castShadow = true;
  car.add(glass);
  refs.glass.push(glass);

  /* ── cabin (read through the glass) ─────────────────────────── */
  const cabin = new THREE.Group();
  const tub = new THREE.Mesh(roundedBox(2.24, 0.20, 1.34, 0.07), M.cabin);
  tub.position.set(-0.06, 1.042, 0);
  cabin.add(tub);

  const dash = new THREE.Mesh(roundedBox(1.26, 0.11, 0.26, 0.045), M.wood);
  dash.position.set(0.98, 1.126, 0);
  dash.rotation.y = Math.PI / 2;
  cabin.add(dash);

  const display = new THREE.Mesh(new THREE.PlaneGeometry(0.40, 0.18), M.screen);
  display.position.set(0.865, 1.150, 0.02);
  display.rotation.y = -Math.PI / 2 + 0.05;
  cabin.add(display);

  for (const z of [0.34, -0.34]) {
    const cushion = new THREE.Mesh(roundedBox(0.50, 0.10, 0.46, 0.05), M.leather);
    cushion.position.set(0.12, 1.024, z);
    cabin.add(cushion);
    const back = new THREE.Mesh(roundedBox(0.14, 0.44, 0.44, 0.05), M.leather);
    back.position.set(-0.16, 1.190, z);
    back.rotation.z = 0.22;
    cabin.add(back);
    const shell = new THREE.Mesh(roundedBox(0.06, 0.42, 0.46, 0.04), M.carbon);
    shell.position.set(-0.225, 1.190, z);
    shell.rotation.z = 0.22;
    cabin.add(shell);
  }

  const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.140, 0.019, 8, 26), M.gloss);
  yoke.position.set(0.735, 1.170, 0.34);
  yoke.rotation.set(0, Math.PI / 2, 0.32);
  cabin.add(yoke);
  car.add(cabin);

  /* ── structural battery pack ────────────────────────────────── */
  const pack = new THREE.Mesh(roundedBox(2.34, 0.098, 1.24, 0.03), M.carbon);
  pack.position.set(0, 0.186, 0);
  pack.receiveShadow = true;
  car.add(pack);

  /* ── inner fender liners ────────────────────────────────────── */
  for (const ax of [AXLE_F, AXLE_R]) {
    const liner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.442, 0.442, 1.38, 26, 1, true), M.mesh);
    liner.rotation.x = Math.PI / 2;
    liner.position.set(ax, WHEEL_R, 0);
    car.add(liner);
  }

  /* ── wheels ─────────────────────────────────────────────────── */
  const proto = buildWheel(M, quality);
  for (const [x, z, side, ws] of [
    [AXLE_F,  TRACK_F,  1, 1.00], [AXLE_F, -TRACK_F, -1, 1.00],
    [AXLE_R,  TRACK_R,  1, 1.11], [AXLE_R, -TRACK_R, -1, 1.11],
  ]) {
    const w = proto.clone(true);
    w.scale.set(1, ws, 1);
    w.rotation.x = side * Math.PI / 2;
    w.position.set(x, WHEEL_R, z);
    w.traverse(o => { if (o.isMesh) o.castShadow = true; });
    car.add(w);
    refs.wheels.push(w);
  }

  const noseSec = bodySection(HALF_LEN);
  const tailSec = bodySection(-HALF_LEN);

  /* ── front fascia ───────────────────────────────────────────── */

  // "Smart shield" sensor panel, cut from the fascia outline
  const shieldPts = [];
  for (let i = 0; i <= 48; i++) {
    const [y, z] = sePoint(noseSec, (i / 48) * Math.PI * 2);
    shieldPts.push(new THREE.Vector2(z * 0.74, (y - noseSec.cy) * 0.66 - 0.02));
  }
  const shield = new THREE.Mesh(
    new THREE.ExtrudeGeometry(new THREE.Shape(shieldPts), {
      depth: 0.02, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.006, bevelSegments: 2,
    }), M.gloss);
  shield.rotation.y = Math.PI / 2;
  shield.position.set(HALF_LEN - 0.014, noseSec.cy, 0);
  car.add(shield);

  const lidar = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.046, 0.030, 20), M.darkMetal);
  lidar.rotation.z = Math.PI / 2;
  lidar.position.set(HALF_LEN + 0.008, noseSec.cy + 0.10, 0);
  car.add(lidar);

  // Full-width light blade, bowed to follow the fascia
  const makeBar = (sec, xAt, y, bow, radius, inset = 0.030) => {
    const zMax = Math.max(0.10, seZAtY(sec, y) - inset);
    const pts = [];
    for (let i = 0; i <= 22; i++) {
      const z = -zMax + 2 * zMax * (i / 22);
      pts.push([xAt + bow * (1 - Math.pow(z / zMax, 2)), y, z]);
    }
    return tubeFromPoints(pts, radius, 8);
  };

  const drl = new THREE.Mesh(makeBar(noseSec, HALF_LEN + 0.004, 0.800, 0.024, 0.0135), M.headlight);
  car.add(drl); refs.headlights.push(drl);

  for (const side of [1, -1]) {
    const housing = new THREE.Mesh(roundedBox(0.155, 0.245, 0.085, 0.022), M.gloss);
    housing.rotation.y = Math.PI / 2;
    housing.position.set(HALF_LEN - 0.022, 0.618, side * 0.520);
    car.add(housing);
    for (let i = 0; i < 4; i++) {
      const y = 0.532 + i * 0.058;
      const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.033, 0.012, 18), M.machined);
      bezel.rotation.z = Math.PI / 2;
      bezel.position.set(HALF_LEN + 0.008, y, side * 0.520);
      car.add(bezel);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.010, 18), M.headlight);
      lens.rotation.z = Math.PI / 2;
      lens.position.set(HALF_LEN + 0.015, y, side * 0.520);
      car.add(lens); refs.headlights.push(lens);
    }
    // Active corner intake
    const intake = new THREE.Mesh(roundedBox(0.120, 0.150, 0.070, 0.022), M.mesh);
    intake.rotation.y = Math.PI / 2;
    intake.position.set(HALF_LEN - 0.030, 0.520, side * 0.660);
    car.add(intake);
    for (let v = 0; v < 3; v++) {
      const vane = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.014, 0.105), M.anodised);
      vane.position.set(HALF_LEN - 0.006, 0.474 + v * 0.046, side * 0.660);
      vane.rotation.z = -0.28;
      car.add(vane);
    }
  }

  const splitter = new THREE.Mesh(roundedBox(1.50, 0.026, 0.28, 0.012), M.carbon);
  splitter.rotation.y = Math.PI / 2;
  splitter.position.set(HALF_LEN - 0.055, 0.392, 0);
  car.add(splitter);

  /* ── rear fascia ────────────────────────────────────────────── */
  const tailZ = seZAtY(tailSec, 0.860);
  const recess = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.150, tailZ * 1.84), M.gloss);
  recess.position.set(-HALF_LEN + 0.014, 0.860, 0);
  car.add(recess);

  const tailBar = new THREE.Mesh(makeBar(tailSec, -HALF_LEN - 0.006, 0.860, -0.018, 0.0175), M.taillight);
  car.add(tailBar); refs.taillights.push(tailBar);
  const tailInner = new THREE.Mesh(makeBar(tailSec, -HALF_LEN + 0.030, 0.860, -0.012, 0.0075, 0.075), M.taillight);
  car.add(tailInner); refs.taillights.push(tailInner);

  // Kammback lip
  const lip = new THREE.Mesh(roundedBox(1.30, 0.028, 0.14, 0.012), M.paint);
  lip.rotation.y = Math.PI / 2;
  lip.position.set(-HALF_LEN + 0.058, 1.006, 0);
  car.add(lip);

  // Active spoiler
  const spoiler = new THREE.Group();
  const blade = new THREE.Mesh(roundedBox(1.48, 0.024, 0.190, 0.010), M.carbon);
  blade.rotation.y = Math.PI / 2;
  blade.position.set(-0.078, 0, 0);
  spoiler.add(blade);
  const gurney = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.026, 1.48), M.carbon);
  gurney.position.set(-0.165, 0.021, 0);
  spoiler.add(gurney);
  for (const side of [1, -1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.018, 0.030), M.darkMetal);
    arm.position.set(0.028, -0.004, side * 0.52);
    spoiler.add(arm);
  }
  spoiler.position.set(-2.320, 1.048, 0);
  car.add(spoiler);
  refs.spoiler = spoiler;

  // Diffuser. Built on the car's own axes: with a Y rotation in play a Z
  // rotation would roll the plate about the long axis instead of sweeping it
  // up, so the depth runs along X and the 1.36 m span along Z directly.
  const diff = new THREE.Mesh(roundedBox(0.44, 0.090, 1.36, 0.014), M.carbon);
  diff.rotation.z = -0.200;
  diff.position.set(-2.258, 0.316, 0);
  car.add(diff);
  for (let i = 0; i < 5; i++) {
    const fence = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.100, 0.016), M.carbon);
    fence.rotation.z = -0.200;
    fence.position.set(-2.268, 0.266, -0.52 + i * 0.26);
    car.add(fence);
  }
  for (const side of [1, -1]) {
    const exit = new THREE.Mesh(roundedBox(0.22, 0.075, 0.055, 0.016), M.mesh);
    exit.rotation.y = Math.PI / 2;
    exit.position.set(-HALF_LEN + 0.050, 0.560, side * 0.520);
    car.add(exit);
  }

  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.020, 0.30), M.trim);
  badge.position.set(-HALF_LEN + 0.006, 0.700, 0);
  car.add(badge);

  /* ── side detail ────────────────────────────────────────────── */

  // Light-catcher crease, traced on the real body surface
  for (const side of [1, -1]) {
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const x = -2.10 + (4.20 * i) / 48;
      const f = 0.700 + Math.sin((i / 48) * Math.PI) * 0.045;
      const y = yBase(x) + (yTop(x) - yBase(x)) * f;
      pts.push([x, y, side * (bodyZ(x, y) + 0.006)]);
    }
    car.add(new THREE.Mesh(tubeFromPoints(pts, 0.0060, 6), M.trim));
  }

  // Door shut lines
  for (const side of [1, -1]) {
    for (const xd of [1.250, -0.520]) {
      const pts = [];
      for (let i = 0; i <= 16; i++) {
        const y = 0.290 + (yTop(xd) - 0.310) * (i / 16);
        pts.push([xd, y, side * (bodyZ(xd, y) + 0.004)]);
      }
      car.add(new THREE.Mesh(tubeFromPoints(pts, 0.0038, 5), M.rimDark));
    }
  }

  // Hood shut lines — longitudinal pair plus the transverse cowl cut
  for (const side of [1, -1]) {
    const pts = [];
    for (let i = 0; i <= 26; i++) {
      const x = 1.300 + (1.060 * i) / 26;
      pts.push([x, bodyYAtZ(x, 0.460) + 0.004, side * 0.460]);
    }
    car.add(new THREE.Mesh(tubeFromPoints(pts, 0.0034, 5), M.rimDark));
  }
  {
    const sec = bodySection(1.300);
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const th = Math.PI * (0.20 + 0.60 * (i / 24));
      const [y, z] = sePoint(sec, th);
      pts.push([1.300, y + 0.004, z]);
    }
    car.add(new THREE.Mesh(tubeFromPoints(pts, 0.0034, 5), M.rimDark));
  }

  // Rocker sill blade + aero fins, seated on the flank
  for (const side of [1, -1]) {
    const zSill = bodyZ(0, 0.215);
    const sill = new THREE.Mesh(roundedBox(2.30, 0.058, 0.10, 0.018), M.carbon);
    sill.position.set(-0.02, 0.215, side * (zSill - 0.012));
    car.add(sill);
    for (let i = 0; i < 3; i++) {
      const x = -0.62 + i * 0.62;
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.048, 0.014), M.carbon);
      fin.position.set(x, 0.250, side * (bodyZ(x, 0.250) + 0.016));
      fin.rotation.z = 0.10;
      car.add(fin);
    }
  }

  // Camera mirror pods
  for (const side of [1, -1]) {
    const zM = bodyZ(1.270, 0.960);
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.11, 10), M.gloss);
    stalk.rotation.x = Math.PI / 2;
    stalk.position.set(1.270, 0.968, side * (zM + 0.050));
    car.add(stalk);
    const pod = new THREE.Mesh(roundedBox(0.100, 0.052, 0.052, 0.020), M.gloss);
    pod.position.set(1.270, 0.968, side * (zM + 0.108));
    car.add(pod);
    const lensm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.006, 12), M.screen);
    lensm.rotation.z = Math.PI / 2;
    lensm.position.set(1.222, 0.968, side * (zM + 0.108));
    car.add(lensm);
  }

  // Charge port, left rear quarter
  {
    const y = 0.800, x = -1.930, z = bodyZ(x, y);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.0075, 8, 24), M.chargeRing);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(x, y, z + 0.007);
    car.add(ring); refs.taillights.push(ring);
    const door = new THREE.Mesh(new THREE.CircleGeometry(0.075, 24), M.gloss);
    door.rotation.y = Math.PI / 2;
    door.position.set(x, y, z + 0.003);
    car.add(door);
  }

  /* ── counts ─────────────────────────────────────────────────── */
  let tris = 0;
  car.traverse(o => {
    if (o.isMesh && o.geometry) {
      const g = o.geometry;
      tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    }
  });
  refs.triangles = Math.round(tris);

  return { car, refs };
}

export const CAR_METRICS = { HALF_LEN, HALF_WIDTH, WHEEL_R };
