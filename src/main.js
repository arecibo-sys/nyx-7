import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { createMaterials, applyPaint, PAINTS } from './materials.js';
import { buildCar } from './car.js';
import { AmbientScore } from './audio.js';

/* ══ device profiling ════════════════════════════════════════════ */
const touch = matchMedia('(hover: none)').matches || navigator.maxTouchPoints > 0;
const cores = navigator.hardwareConcurrency || 4;
const mem = navigator.deviceMemory || 4;
const small = Math.min(innerWidth, innerHeight) < 480;

let QUALITY =
  (!touch && cores >= 8 && mem >= 8) ? 'ultra' :
  (!touch) ? 'high' :
  (cores >= 6 && mem >= 4 && !small) ? 'medium' : 'low';

const DPR_CAP = { ultra: 2, high: 2, medium: 1.5, low: 1.25 }[QUALITY];
const USE_BLOOM = QUALITY !== 'low';
const SHADOW_SIZE = { ultra: 2048, high: 2048, medium: 1024, low: 512 }[QUALITY];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ══ renderer ════════════════════════════════════════════════════ */
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: QUALITY !== 'low', powerPreference: 'high-performance', alpha: false,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, DPR_CAP));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.80;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = QUALITY === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
// The car is static and only the camera orbits, so the shadow map does not need
// re-rendering every frame. It is refreshed explicitly when the spoiler moves.
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x07090c, 9, 34);

const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 220);

/* ══ gradient backdrop ═══════════════════════════════════════════ */
{
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(90, 32, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x11161d) },
        bottom: { value: new THREE.Color(0x040507) },
        horizon: { value: new THREE.Color(0x0b1116) },
      },
      vertexShader: `varying float vY;
        void main(){ vY = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying float vY; uniform vec3 top, bottom, horizon;
        void main(){
          float t = clamp(vY*0.5+0.5, 0.0, 1.0);
          vec3 c = mix(bottom, horizon, smoothstep(0.0,0.5,t));
          c = mix(c, top, smoothstep(0.45,1.0,t));
          gl_FragColor = vec4(c,1.0);
        }`,
    })
  );
  sky.frustumCulled = false;
  scene.add(sky);
}

/* ══ studio environment (PMREM from a synthetic light box) ═══════ */
function studioEnvironment() {
  const env = new THREE.Scene();
  const lit = (i) => {
    const m = new THREE.MeshBasicMaterial();
    m.color.setScalar(i);
    return m;
  };
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(34, 17, 30),
    new THREE.MeshBasicMaterial({ color: 0x090b0e, side: THREE.BackSide })
  );
  env.add(room);

  const add = (w, h, i, pos, rot) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lit(i));
    p.position.set(...pos);
    p.rotation.set(...rot);
    env.add(p);
  };
  // Overhead softbox — the long roof highlight
  add(20, 5.2, 5.0, [0, 8.2, 0], [Math.PI / 2, 0, 0]);
  // Vertical strip keys — define the shoulder line
  add(15, 6.0, 4.5, [0, 3.0, -9.5], [0, 0, 0]);
  add(15, 6.0, 2.6, [0, 3.0, 9.5], [0, Math.PI, 0]);
  // Rim from behind, cool fill from the front
  add(9, 5.0, 6.0, [-12, 3.2, 0], [0, Math.PI / 2, 0]);
  add(9, 5.0, 1.8, [12, 3.0, 0], [0, -Math.PI / 2, 0]);
  // Floor bounce
  add(26, 20, 0.35, [0, -0.2, 0], [-Math.PI / 2, 0, 0]);
  return env;
}

const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
const envRT = pmrem.fromScene(studioEnvironment(), 0.03);
scene.environment = envRT.texture;
scene.environmentIntensity = 0.55;

/* ══ lights ══════════════════════════════════════════════════════ */
const key = new THREE.DirectionalLight(0xdfeaff, 1.25);
key.position.set(5.5, 8.5, 4.5);
key.castShadow = true;
key.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
key.shadow.camera.near = 1;
key.shadow.camera.far = 26;
key.shadow.camera.left = -4.5;
key.shadow.camera.right = 4.5;
key.shadow.camera.top = 4.5;
key.shadow.camera.bottom = -4.5;
key.shadow.bias = -0.0009;
key.shadow.normalBias = 0.02;
scene.add(key);

const rim = new THREE.DirectionalLight(0x5fd8ff, 0.70);
rim.position.set(-6.5, 3.2, -5.0);
scene.add(rim);

const fill = new THREE.DirectionalLight(0xffc48a, 0.30);
fill.position.set(3.0, 1.4, -6.0);
scene.add(fill);

scene.add(new THREE.HemisphereLight(0x2a3a48, 0x05070a, 0.18));

/* ══ floor ═══════════════════════════════════════════════════════ */
function floorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(256, 256, 20, 256, 256, 256);
  g.addColorStop(0, '#2a3037');
  g.addColorStop(0.35, '#161b21');
  g.addColorStop(1, '#05070a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(24, 72),
  new THREE.MeshStandardMaterial({
    map: floorTexture(), color: 0x6c727a,
    metalness: 0.0, roughness: 0.60, envMapIntensity: 0.18,
  })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

/* Soft contact pool under the car */
function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 4, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.42)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
const blob = new THREE.Mesh(
  new THREE.PlaneGeometry(7.4, 3.9),
  new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.92 })
);
blob.rotation.x = -Math.PI / 2;
blob.position.y = 0.006;
scene.add(blob);

/* ══ controls ════════════════════════════════════════════════════ */
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 3.4;
controls.maxDistance = 26;
controls.minPolarAngle = 0.18;
controls.maxPolarAngle = Math.PI / 2 - 0.035;
controls.enablePan = false;
controls.autoRotateSpeed = 0.42;
// Touch wants a more direct response than a mouse: a finger expects the model
// to track it, so less smoothing and close to 1:1 travel.
const BASE_DAMPING = touch ? 0.115 : 0.055;
controls.dampingFactor = BASE_DAMPING;
controls.rotateSpeed = touch ? 0.95 : 0.70;
controls.zoomSpeed = touch ? 1.05 : 0.85;

/* ══ views ═══════════════════════════════════════════════════════ */
// Targets sit low so the car composes in the upper two-thirds, clear of the dock.
const VIEWS = [
  { name: 'Hero',    pos: [ 5.30, 1.92, 4.55], tgt: [ 0.00, 0.56, 0] },
  { name: 'Front',   pos: [ 6.60, 1.20, 1.80], tgt: [ 0.45, 0.56, 0] },
  { name: 'Profile', pos: [ 0.10, 1.32, 7.55], tgt: [ 0.00, 0.58, 0] },
  { name: 'Rear',    pos: [-5.40, 2.02, -4.40], tgt: [-0.25, 0.58, 0] },
  { name: 'Above',   pos: [ 2.60, 6.10, 3.10], tgt: [ 0.00, 0.40, 0] },
];

/* Framing is solved rather than tabulated: on a narrow column the horizontal
   field of view is the binding constraint, and stepped magic numbers let the
   car overflow the sides. Work out the distance at which the vehicle spans the
   frame width, then add a little for the dock on short viewports. */
const FIT_RADIUS = 2.80;      // half-length of the car plus a margin
const REF_DISTANCE = 7.15;    // distance baked into the view presets

function fitScale() {
  const vHalf = THREE.MathUtils.degToRad(camera.fov) / 2;
  const hHalf = Math.atan(Math.tan(vHalf) * (innerWidth / innerHeight));
  let k = Math.max(1, (FIT_RADIUS / Math.tan(hHalf)) / REF_DISTANCE);
  if (innerHeight < 780) k *= 1 + (780 - innerHeight) / 1450;
  return k;
}

const tween = { active: false, t: 0, dur: 1.15, fromP: new THREE.Vector3(), toP: new THREE.Vector3(), fromT: new THREE.Vector3(), toT: new THREE.Vector3() };
let currentView = 0;

function applyView(i, instant = false) {
  currentView = i;
  const v = VIEWS[i], k = fitScale();
  const toP = new THREE.Vector3(v.pos[0] * k, v.pos[1] * (1 + (k - 1) * 0.55), v.pos[2] * k);
  const toT = new THREE.Vector3(...v.tgt);

  // Aim below the car by roughly the share of the viewport the dock covers, so
  // the vehicle composes in the clear area rather than behind the controls.
  const dist = toP.distanceTo(toT);
  const visibleH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const dockH = dock ? dock.getBoundingClientRect().height : 0;
  toT.y -= Math.min(1.20, (dockH / innerHeight) * visibleH * 0.35);

  // A lowered aim point would otherwise let the orbit dip under the floor.
  controls.maxPolarAngle = Math.min(
    Math.PI / 2 - 0.035,
    Math.acos(THREE.MathUtils.clamp((0.30 - toT.y) / dist, -1, 1)));
  if (instant || reduceMotion) {
    camera.position.copy(toP);
    controls.target.copy(toT);
    controls.update();
    return;
  }
  tween.fromP.copy(camera.position);
  tween.fromT.copy(controls.target);
  tween.toP.copy(toP);
  tween.toT.copy(toT);
  tween.t = 0;
  tween.active = true;
}

/* ══ build ═══════════════════════════════════════════════════════ */
// Yield to the browser between build stages. setTimeout rather than rAF so the
// sequence still completes if the tab is backgrounded while loading.
const frame = () => new Promise(r => setTimeout(r, 24));
const bootFill = document.getElementById('bootFill');
const bootStatus = document.getElementById('bootStatus');
const setProgress = (p, label) => {
  bootFill.style.width = `${Math.round(p * 100)}%`;
  if (label) bootStatus.textContent = label;
};

let MATS, CAR, REFS;
const score = new AmbientScore();

async function build() {
  setProgress(0.12, 'Synthesising materials…');
  await frame();
  MATS = createMaterials(QUALITY);

  setProgress(0.42, 'Lofting body surfaces…');
  await frame();
  const built = buildCar(MATS, QUALITY);
  CAR = built.car; REFS = built.refs;

  setProgress(0.74, 'Assembling running gear…');
  await frame();
  scene.add(CAR);

  setProgress(0.9, 'Compiling shaders…');
  await frame();
  applyView(0, true);
  renderer.compile(scene, camera);

  setProgress(1, 'Ready');
  document.getElementById('specTris').textContent = `${REFS.triangles.toLocaleString()} tris`;
  document.getElementById('specQuality').textContent =
    `${QUALITY} · ${renderer.getPixelRatio().toFixed(2)}× DPR`;

  document.getElementById('bootEnter').disabled = false;
  document.getElementById('bootSilent').disabled = false;
}

/* ══ post-processing ═════════════════════════════════════════════ */
let composer = null, bloomPass = null;
if (USE_BLOOM) {
  composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(devicePixelRatio, DPR_CAP));
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(innerWidth, innerHeight),
    QUALITY === 'ultra' ? 0.34 : 0.30,   // strength
    0.40,                                 // radius
    0.85                                  // threshold
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
}

/* ══ UI ══════════════════════════════════════════════════════════ */
const boot = document.getElementById('boot');
const hint = document.getElementById('hint');
const dock = document.getElementById('dock');

// paint swatches
const swatchWrap = document.getElementById('swatches');
const paintName = document.getElementById('paintName');
PAINTS.forEach((p, i) => {
  const b = document.createElement('button');
  b.className = 'swatch' + (i === 0 ? ' is-on' : '');
  b.style.background = p.css;
  b.title = p.name;
  b.setAttribute('aria-label', p.name);
  b.addEventListener('click', () => {
    [...swatchWrap.children].forEach(c => c.classList.remove('is-on'));
    b.classList.add('is-on');
    applyPaint(MATS, i);
    paintName.textContent = p.name;
    score.tick(1 + i * 0.06);
  });
  swatchWrap.appendChild(b);
});

// view segments
const viewWrap = document.getElementById('views');
VIEWS.forEach((v, i) => {
  const b = document.createElement('button');
  b.textContent = v.name;
  if (i === 0) b.classList.add('is-on');
  b.addEventListener('click', () => {
    [...viewWrap.children].forEach(c => c.classList.remove('is-on'));
    b.classList.add('is-on');
    applyView(i);
    score.swoosh();
  });
  viewWrap.appendChild(b);
});

// toggles
const state = { lights: true, spoiler: false, orbit: !reduceMotion, floor: true };
const narrow = matchMedia('(max-width: 620px)');
function applyChipLabels() {
  document.querySelectorAll('[data-toggle][data-short]').forEach(b => {
    if (!b.dataset.long) b.dataset.long = b.textContent.trim();
    b.textContent = narrow.matches ? b.dataset.short : b.dataset.long;
  });
}
applyChipLabels();
narrow.addEventListener('change', applyChipLabels);
document.querySelectorAll('[data-toggle]').forEach(btn => {
  const k = btn.dataset.toggle;
  btn.classList.toggle('is-on', state[k]);
  btn.addEventListener('click', () => {
    state[k] = !state[k];
    btn.classList.toggle('is-on', state[k]);
    score.tick(state[k] ? 1.2 : 0.8);
    if (k === 'floor') { floor.visible = state.floor; blob.visible = state.floor; }
    if (k === 'lights') setLights(state.lights);
    if (k === 'orbit') controls.autoRotate = state.orbit;
  });
});

const HEAD_E = 1.55, TAIL_E = 1.35;

function setLights(on) {
  const h = on ? HEAD_E : 0.06, t = on ? TAIL_E : 0.05;
  MATS.headlight.emissiveIntensity = h;
  MATS.taillight.emissiveIntensity = t;
  MATS.chargeRing.emissiveIntensity = on ? 2.2 : 0.08;
  MATS.screen.emissiveIntensity = on ? 1.1 : 0.15;
}

// audio
const btnSound = document.getElementById('btnSound');
btnSound.addEventListener('click', () => {
  const on = !btnSound.classList.contains('is-on');
  btnSound.classList.toggle('is-on', on);
  btnSound.setAttribute('aria-pressed', String(on));
  if (on && !score.ready) score.start(); else score.setEnabled(on);
});

const vol = document.getElementById('vol');
const volRead = document.getElementById('volRead');
vol.addEventListener('input', () => {
  volRead.textContent = vol.value;
  score.setVolume(vol.value / 100);
});

// specs panel
const specs = document.getElementById('specs');
const btnSpecs = document.getElementById('btnSpecs');
const toggleSpecs = (force) => {
  const open = force !== undefined ? force : !specs.classList.contains('is-open');
  specs.classList.toggle('is-open', open);
  specs.setAttribute('aria-hidden', String(!open));
  btnSpecs.classList.toggle('is-on', open);
  btnSpecs.setAttribute('aria-pressed', String(open));
};
btnSpecs.addEventListener('click', () => { toggleSpecs(); score.tick(); });
document.getElementById('specsClose').addEventListener('click', () => { toggleSpecs(false); score.tick(0.85); });

// fullscreen
document.getElementById('btnFull').addEventListener('click', async () => {
  score.tick();
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch { /* iOS Safari on iPhone disallows this — silently ignore */ }
});

// dock collapse
document.getElementById('dockGrip').addEventListener('click', () => {
  dock.classList.toggle('is-collapsed');
  score.tick(0.9);
});

// entry
function enter(withSound) {
  boot.classList.add('is-gone');
  document.body.classList.add('is-live');
  controls.autoRotate = state.orbit;
  if (withSound) {
    score.start();
    score.setVolume(vol.value / 100);
  } else {
    btnSound.classList.remove('is-on');
    btnSound.setAttribute('aria-pressed', 'false');
  }
  if (innerHeight < 640) dock.classList.add('is-collapsed');
  setTimeout(() => hint.classList.add('is-on'), 900);
  setTimeout(() => hint.classList.remove('is-on'), 6400);
}
document.getElementById('bootEnter').addEventListener('click', () => enter(true));
document.getElementById('bootSilent').addEventListener('click', () => enter(false));

// stop auto-orbit while the user is dragging, resume after a beat
let resumeTimer = null;
controls.addEventListener('start', () => {
  controls.autoRotate = false;
  clearTimeout(resumeTimer);
});
controls.addEventListener('end', () => {
  clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => { controls.autoRotate = state.orbit; }, 3200);
});

/* ══ resize ══════════════════════════════════════════════════════ */
let resizeRaf = null;
function onResize() {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => {
    const w = innerWidth, h = innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    renderer.shadowMap.needsUpdate = true;
    if (composer) { composer.setSize(w, h); bloomPass.resolution.set(w, h); }
    applyView(currentView, true);
  });
}
addEventListener('resize', onResize, { passive: true });
addEventListener('orientationchange', () => setTimeout(onResize, 220), { passive: true });

/* ══ loop ════════════════════════════════════════════════════════ */
const clock = new THREE.Clock();
const fpsEl = document.getElementById('specFps');
let acc = 0, frames = 0, degraded = 0;

const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (tween.active) {
    tween.t += dt / tween.dur;
    const e = easeInOut(Math.min(1, tween.t));
    camera.position.lerpVectors(tween.fromP, tween.toP, e);
    controls.target.lerpVectors(tween.fromT, tween.toT, e);
    if (tween.t >= 1) tween.active = false;
  }

  if (REFS) {
    // spoiler deploy — refresh the shadow map only while it is actually moving
    const target = state.spoiler ? -0.385 : 0;
    if (Math.abs(target - REFS.spoiler.rotation.z) > 1e-4) renderer.shadowMap.needsUpdate = true;
    REFS.spoiler.rotation.z += (target - REFS.spoiler.rotation.z) * Math.min(1, dt * 5.5);
    REFS.spoiler.position.y += (((state.spoiler ? 1.062 : 1.006)) - REFS.spoiler.position.y) * Math.min(1, dt * 5.5);

    // breathing on the light signature
    if (state.lights) {
      const b = 1 + Math.sin(clock.elapsedTime * 0.55) * 0.05;
      MATS.headlight.emissiveIntensity = HEAD_E * b;
      MATS.taillight.emissiveIntensity = TAIL_E * (2 - b);
    }
  }

  // Damping is applied per frame, so a phone running at 40 fps would otherwise
  // feel heavier than a desktop at 120. Rescale it against the real delta.
  controls.dampingFactor = THREE.MathUtils.clamp(
    1 - Math.pow(1 - BASE_DAMPING, dt * 60), 0.02, 0.5);
  controls.update(dt);
  if (composer) composer.render(); else renderer.render(scene, camera);

  // adaptive resolution
  acc += dt; frames++;
  if (acc >= 1) {
    const fps = frames / acc;
    if (fpsEl) fpsEl.textContent = `${Math.round(fps)} fps`;
    if (degraded < 2 && fps < 40) {
      degraded++;
      const pr = Math.max(0.85, renderer.getPixelRatio() * 0.78);
      renderer.setPixelRatio(pr);
      if (composer) composer.setPixelRatio(pr);
      renderer.shadowMap.needsUpdate = true;
      document.getElementById('specQuality').textContent = `${QUALITY} · ${pr.toFixed(2)}× DPR (adaptive)`;
    }
    acc = 0; frames = 0;
  }
}

/* ══ go ══════════════════════════════════════════════════════════ */
window.__nyx = { THREE, scene, camera, renderer, controls, get composer() { return composer; }, get bloomPass() { return bloomPass; }, get MATS() { return MATS; }, get REFS() { return REFS; }, applyView, floor, key, rim, fill, score };
build().then(() => tick()).catch(err => {
  console.error(err);
  bootStatus.textContent = 'Render error — ' + (err && err.message ? err.message : err);
  window.__nyxError = err;
});
