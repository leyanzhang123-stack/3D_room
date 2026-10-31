import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------------
   Units are metres. x runs left → right along the back wall,
   z runs from the back wall toward the viewer, y is up.
   ------------------------------------------------------------------ */
const W = 5.4, D = 3.6, H = 2.7, T = 0.12;
const WIN = { x0: 2.25, x1: 3.55, y0: 0.14, y1: 2.45 };

const COL = {
  wall: '#EFE3D3', wainscot: '#E4D5C3', trim: '#C9B49C', cap: '#5A3A2D',
  floor: '#8A5D45', slab: '#4D2F24',
  cherry: '#8E4A32', cherryDark: '#5C2F22', walnut: '#5A3426',
  bed: '#6B1E24', bedTop: '#7A242A', frame: '#4A2A20',
  cream: '#F1E6D8', blush: '#E3B9B0', desk: '#EDE3D6', ikea: '#EDE6DA',
  black: '#1F1D1E', brass: '#C9A06A', warm: '#FFB46E',
};

const isMobile = matchMedia('(pointer: coarse)').matches;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- renderer / scene / camera ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.75 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 100);
const HOME_TARGET = new THREE.Vector3(2.55, 0.85, 1.75);
const HOME_DIR = new THREE.Vector3(6.6, 4.1, 8.2).normalize();
const homeDistance = () => 11.6 * Math.max(1, 1.18 / camera.aspect);
camera.position.copy(HOME_TARGET).addScaledVector(HOME_DIR, homeDistance());

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(HOME_TARGET);
controls.enableDamping = true;
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.panSpeed = 0.9;
controls.zoomSpeed = 1.1;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
controls.minDistance = 0.5;
controls.maxDistance = 40;
controls.minPolarAngle = 0.55;
controls.maxPolarAngle = 1.38;
controls.minAzimuthAngle = 0.02;
controls.maxAzimuthAngle = 1.5;
controls.rotateSpeed = 0.9;

/* ---------- helpers ---------- */
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0, ...o });
const glowMat = (color, intensity = 2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 1 });

function rbox(w, h, d, material, r = 0.02) {
  const rad = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.max(rad, 0.001)), material);
  m.castShadow = m.receiveShadow = true;
  return m;
}
function cyl(rTop, rBot, h, material, seg = 24) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), material);
  m.castShadow = m.receiveShadow = true;
  return m;
}
function sphere(r, material, seg = 16) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), material);
  m.castShadow = true;
  return m;
}
// place a mesh by its bottom-centre
function put(obj, x, y, z, parent = scene) {
  const box = new THREE.Box3().setFromObject(obj);
  obj.position.set(x, y + (obj.position.y - box.min.y), z);
  parent.add(obj);
  return obj;
}
function at(obj, x, y, z, parent = scene) { obj.position.set(x, y, z); parent.add(obj); return obj; }

const texLoader = new THREE.TextureLoader();
function loadTex(url) {
  const t = texLoader.load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

/* ---------- hotspots (things she can tap) ---------- */
const hotspots = [];
function hotspot(group, id, title, text, view) {
  group.userData.hotspot = { id, title, text, view };
  hotspots.push(group);
  return group;
}

/* ---------- lights ---------- */
scene.add(new THREE.HemisphereLight('#FFE6CC', '#3A2418', 0.9));
const key = new THREE.DirectionalLight('#FFD9B0', 1.1);
key.position.set(7, 7.5, 8);
key.target.position.set(2.6, 0, 1.6);
key.castShadow = true;
key.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 25 });
key.shadow.bias = -0.0004;
key.shadow.radius = 4;
scene.add(key, key.target);

const flickers = [];
function warmLight(x, y, z, intensity, distance = 3.2, color = COL.warm) {
  const l = new THREE.PointLight(color, intensity, distance, 1.6);
  l.position.set(x, y, z);
  scene.add(l);
  return l;
}

/* ---------- floor + walls ---------- */
const floorTex = canvasTex(1024, 1024, (g, w, h) => {
  g.fillStyle = COL.floor; g.fillRect(0, 0, w, h);
  const rows = 14;
  for (let i = 0; i < rows; i++) {
    const y = i * h / rows;
    for (let x = -((i * 173) % 300); x < w; x += 300) {
      g.fillStyle = `hsl(20, ${30 + (x * i) % 8}%, ${36 + ((x + i * 37) % 7)}%)`;
      g.fillRect(x + 2, y + 2, 296, h / rows - 3);
    }
  }
  g.globalAlpha = 0.06;
  for (let i = 0; i < 900; i++) { g.fillStyle = i % 2 ? '#000' : '#fff'; g.fillRect(Math.random() * w, Math.random() * h, 40 + Math.random() * 80, 1); }
});
put(rbox(W + 0.34, 0.22, D + 0.3, mat(COL.slab), 0.06), W / 2 - 0.14, -0.22, D / 2 - 0.05);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat('#ffffff', { map: floorTex, roughness: 0.6 }));
floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0.001, D / 2); floor.receiveShadow = true; scene.add(floor);

const wallM = mat(COL.wall, { roughness: 0.92 });
function wallBox(x0, x1, y0, y1) { put(rbox(x1 - x0, y1 - y0, T, wallM, 0.004), (x0 + x1) / 2, y0, -T / 2); }
wallBox(-T, WIN.x0, 0, H); wallBox(WIN.x1, W, 0, H); wallBox(WIN.x0, WIN.x1, 0, WIN.y0); wallBox(WIN.x0, WIN.x1, WIN.y1, H);
const leftWall = rbox(T, H, D, wallM, 0.004); put(leftWall, -T / 2, 0, D / 2);
// caps along the top edges and the front edge, like a model kit
put(rbox(W + T + 0.02, 0.05, T + 0.02, mat(COL.cap), 0.01), (W - T) / 2, H, -T / 2);
put(rbox(T + 0.02, 0.05, D + 0.02, mat(COL.cap), 0.01), -T / 2, H, D / 2);
put(rbox(T + 0.02, H + 0.05, 0.04, mat(COL.cap), 0.01), -T / 2, 0, D);
put(rbox(0.04, H + 0.05, T + 0.02, mat(COL.cap), 0.01), W, 0, -T / 2);

// wainscot, chair rail and skirting on both walls
const wainM = mat(COL.wainscot, { roughness: 0.9 }), trimM = mat(COL.trim), skirtM = mat(COL.cherry);
function lowerWall(x0, x1) {
  put(rbox(x1 - x0, 0.95, 0.016, wainM, 0.003), (x0 + x1) / 2, 0, 0.008);
  put(rbox(x1 - x0, 0.045, 0.03, trimM, 0.008), (x0 + x1) / 2, 0.95, 0.015);
  put(rbox(x1 - x0, 0.1, 0.03, skirtM, 0.006), (x0 + x1) / 2, 0, 0.015);
}
lowerWall(0, WIN.x0); lowerWall(WIN.x1, W);
put(rbox(0.016, 0.95, D, wainM, 0.003), 0.008, 0, D / 2);
put(rbox(0.03, 0.045, D, trimM, 0.008), 0.015, 0.95, D / 2);
put(rbox(0.03, 0.1, D, skirtM, 0.006), 0.015, 0, D / 2);

/* ---------- window: night city + falling snow ---------- */
const cityTex = canvasTex(1024, 900, (g, w, h) => {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#161b36'); sky.addColorStop(0.6, '#3d3152'); sky.addColorStop(1, '#8c6274');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.5})`; g.fillRect(Math.random() * w, Math.random() * h * 0.5, 2, 2); }
  const layer = (base, maxH, col, lit) => {
    let x = -10;
    while (x < w) {
      const bw = 40 + Math.random() * 70, bh = base + Math.random() * maxH;
      g.fillStyle = col; g.fillRect(x, h - bh, bw, bh);
      g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(x, h - bh, bw, 4);
      if (lit) for (let yy = h - bh + 14; yy < h - 10; yy += 18) for (let xx = x + 8; xx < x + bw - 8; xx += 14)
        if (Math.random() < lit) { g.fillStyle = Math.random() < 0.8 ? '#f3c58c' : '#fbe6c4'; g.fillRect(xx, yy, 6, 8); }
      x += bw + Math.random() * 10;
    }
  };
  layer(200, 260, '#2b2540', 0.15);
  layer(120, 220, '#211c33', 0.3);
  g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, h - 40, w, 40);
});
const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(WIN.x1 - WIN.x0 + 0.5, H - 0.1), new THREE.MeshBasicMaterial({ map: cityTex }));
backdrop.position.set((WIN.x0 + WIN.x1) / 2, (H - 0.1) / 2, -0.5); scene.add(backdrop);

const SNOW = 260;
const snowPos = new Float32Array(SNOW * 3), snowSpeed = new Float32Array(SNOW);
for (let i = 0; i < SNOW; i++) {
  snowPos[i * 3] = WIN.x0 - 0.2 + Math.random() * (WIN.x1 - WIN.x0 + 0.4);
  snowPos[i * 3 + 1] = Math.random() * (H - 0.15);
  snowPos[i * 3 + 2] = -0.45 + Math.random() * 0.36;
  snowSpeed[i] = 0.18 + Math.random() * 0.3;
}
const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const flake = canvasTex(32, 32, (g) => { const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); });
const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ size: 0.03, map: flake, transparent: true, depthWrite: false, color: '#ffffff' }));
scene.add(snow);

const frameM = mat(COL.walnut, { roughness: 0.6 });
put(rbox(WIN.x1 - WIN.x0 + 0.12, 0.06, 0.2, frameM, 0.01), (WIN.x0 + WIN.x1) / 2, WIN.y1, 0);
put(rbox(WIN.x1 - WIN.x0 + 0.16, 0.05, 0.26, frameM, 0.01), (WIN.x0 + WIN.x1) / 2, WIN.y0 - 0.05, 0.02);
put(rbox(0.06, WIN.y1 - WIN.y0, 0.2, frameM, 0.01), WIN.x0 - 0.03, WIN.y0, 0);
put(rbox(0.06, WIN.y1 - WIN.y0, 0.2, frameM, 0.01), WIN.x1 + 0.03, WIN.y0, 0);
put(rbox(0.04, WIN.y1 - WIN.y0, 0.08, frameM, 0.006), (WIN.x0 + WIN.x1) / 2, WIN.y0, -0.03);
const moon = warmLight((WIN.x0 + WIN.x1) / 2, 1.6, 0.35, 0.8, 3.5, '#9DB0E0');

// sheer white curtains on a rod
put(cyl(0.012, 0.012, WIN.x1 - WIN.x0 + 0.9, mat(COL.walnut, { metalness: 0.2 })).rotateZ(Math.PI / 2), (WIN.x0 + WIN.x1) / 2, 2.55, 0.16);
const sheerM = new THREE.MeshStandardMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.5, side: THREE.DoubleSide, roughness: 1, depthWrite: false });
function curtain(x, width) {
  const g = new THREE.PlaneGeometry(width, 2.48, 40, 12);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), v = p.getY(i);
    p.setZ(i, Math.sin(u * 38) * 0.035 + Math.sin(u * 13 + v) * 0.012);
    p.setX(i, u * (1 + (1.24 - v) * 0.03));
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, sheerM); m.position.set(x, 1.3, 0.17); scene.add(m);
  return m;
}
const curtains = [curtain(WIN.x0 + 0.1, 0.62), curtain(WIN.x1 - 0.1, 0.62)];

/* ---------- photo wall + fairy lights (back wall, left of the window) ---------- */
const photoWall = new THREE.Group(); scene.add(photoWall);
const WALL_PHOTOS = ['4039', '0783', '4447', '4898', '5161', '5565', '0f21d', '7862', '6351', '6576', '6843'];
[[1.06, 2.0], [1.32, 2.06], [1.58, 1.98], [1.84, 2.04], [1.12, 1.68], [1.4, 1.72], [1.68, 1.66], [1.95, 1.72], [1.2, 1.38], [1.5, 1.4], [1.8, 1.36]]
  .forEach(([x, y], i) => {
    const card = new THREE.Group();
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.23, 0.006), mat('#FBF6EF')); f.castShadow = true;
    const ph = new THREE.Mesh(new THREE.PlaneGeometry(0.155, 0.15), mat('#ffffff', { map: loadTex(`./assets/photos/thumb/${WALL_PHOTOS[i]}.jpg`), roughness: 0.5 })); ph.position.set(0, 0.025, 0.0035);
    card.add(f, ph); card.position.set(x, y, 0.01); card.rotation.z = ((i * 37) % 9 - 4) * 0.018;
    photoWall.add(card);
  });
const bulbM = glowMat('#FFE2B0', 3);
function fairyString(from, to, sag, n, parent, axis = 'x') {
  const pts = [];
  for (let k = 0; k <= 30; k++) { const t = k / 30; const p = from.clone().lerp(to, t); p.y -= Math.sin(t * Math.PI) * sag; pts.push(p); }
  const curve = new THREE.CatmullRomCurve3(pts);
  parent.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.0025, 4), mat('#6d5a4a')));
  const bulbs = [];
  for (let k = 1; k < n; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 8), bulbM); b.position.copy(curve.getPoint(k / n)); parent.add(b); bulbs.push(b); }
  return bulbs;
}
fairyString(new THREE.Vector3(0.94, 2.32, 0.03), new THREE.Vector3(2.12, 2.32, 0.03), 0.12, 16, photoWall);
warmLight(1.5, 2.1, 0.35, 0.35, 1.6);
hotspot(photoWall, 'photos', 'Our photo wall', '', { dist: 2.1, dir: [0.15, 0.08, 1] });

/* ---------- bar-height table with the record player, under the photo wall ---------- */
const bar = new THREE.Group(); scene.add(bar);
const barX = 1.52, barZ = 0.42;
at(cyl(0.17, 0.19, 0.03, mat(COL.walnut)), barX, 0.015, barZ, bar);
at(cyl(0.022, 0.022, 1.0, mat(COL.walnut, { metalness: 0.15 })), barX, 0.52, barZ, bar);
at(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.009, 8, 32), mat(COL.brass, { metalness: 0.6, roughness: 0.4 })).rotateX(Math.PI / 2), barX, 0.32, barZ, bar);
at(cyl(0.3, 0.3, 0.035, mat(COL.cherry, { roughness: 0.55 }), 40), barX, 1.03, barZ, bar);
const player = new THREE.Group(); at(player, barX, 1.048, barZ, bar);
put(rbox(0.38, 0.075, 0.3, mat('#EADFD1'), 0.015), 0, 0, 0, player);
const platter = at(cyl(0.125, 0.125, 0.012, mat('#141213', { roughness: 0.35 }), 40), -0.04, 0.081, 0, player);
const labelMat = mat('#8A1F26', { roughness: 0.6 });
at(cyl(0.04, 0.04, 0.002, [mat('#8A1F26'), labelMat, mat('#8A1F26')], 24), 0, 0.007, 0, platter);
const arm = new THREE.Group(); at(arm, 0.13, 0.09, -0.1, player);
at(cyl(0.012, 0.014, 0.02, mat('#cfc6bb', { metalness: 0.7, roughness: 0.3 })), 0, 0, 0, arm);
at(rbox(0.006, 0.006, 0.2, mat('#cfc6bb', { metalness: 0.7, roughness: 0.3 }), 0.002), -0.03, 0.012, 0.09, arm).rotation.y = 0.35;
hotspot(bar, 'music', 'Record player', '', { dist: 1.3, dir: [0.35, 0.7, 1], aim: player });

/* ---------- tall cherry cabinet with a light washing down ---------- */
const cab = new THREE.Group(); scene.add(cab);
const cw = 0.82, cd = 0.42, chh = 2.5, cM = mat(COL.cherry, { roughness: 0.55 }), cIn = mat(COL.cherryDark, { roughness: 0.8 });
put(rbox(cw, chh, 0.02, cIn, 0.004), cw / 2, 0, 0.01, cab);
put(rbox(0.035, chh, cd, cM, 0.008), 0.0175, 0, cd / 2, cab);
put(rbox(0.035, chh, cd, cM, 0.008), cw - 0.0175, 0, cd / 2, cab);
put(rbox(cw, 0.05, cd + 0.02, cM, 0.01), cw / 2, chh - 0.05, cd / 2, cab);
put(rbox(cw, 0.1, cd, cM, 0.01), cw / 2, 0, cd / 2, cab);
[0.56, 1.04, 1.52, 2.0].forEach(y => put(rbox(cw - 0.07, 0.025, cd - 0.03, cM, 0.006), cw / 2, y, cd / 2, cab));
// light strip under the top board + a spotlight that washes the shelves
at(rbox(cw - 0.2, 0.012, 0.03, glowMat('#FFE7C4', 2.5), 0.004), cw / 2, chh - 0.06, cd - 0.08, cab);
const cabSpot = new THREE.SpotLight('#FFD3A0', 4.5, 3.2, 1.05, 0.9, 1.3);
cabSpot.position.set(cw / 2, chh - 0.08, cd - 0.05); cabSpot.target.position.set(cw / 2, 0, cd * 0.4);
scene.add(cabSpot, cabSpot.target);
// shelf: snow globe + Eiffel tower
{ const g = new THREE.Group(); put(cyl(0.06, 0.07, 0.05, mat(COL.walnut)), 0, 0, 0, g);
  at(sphere(0.075, new THREE.MeshStandardMaterial({ color: '#E6F0F7', transparent: true, opacity: 0.35, roughness: 0.05 }), 24), 0, 0.12, 0, g);
  at(cyl(0, 0.03, 0.07, mat('#3e5a45'), 8), 0, 0.09, 0, g);
  at(rbox(0.035, 0.03, 0.03, mat('#C23B2E'), 0.004), 0.03, 0.065, 0.01, g);
  put(g, 0.2, 2.025, 0.22, cab); }
{ const e = new THREE.Group(); const em = mat('#3a2c26', { metalness: 0.4, roughness: 0.5 });
  at(cyl(0.004, 0.05, 0.3, em, 4), 0, 0.15, 0, e); at(cyl(0.02, 0.06, 0.02, em, 4), 0, 0.08, 0, e); at(cyl(0.012, 0.035, 0.015, em, 4), 0, 0.18, 0, e);
  put(e, 0.6, 2.025, 0.22, cab); }
// shelf: music box (lid open) + maple leaf
{ const mb = new THREE.Group(); put(rbox(0.17, 0.08, 0.12, mat('#E9C9C2'), 0.01), 0, 0, 0, mb);
  const lid = rbox(0.17, 0.015, 0.12, mat('#E9C9C2'), 0.006); lid.position.set(0, 0.13, -0.03); lid.rotation.x = -1.1; mb.add(lid);
  at(cyl(0.006, 0.006, 0.05, mat(COL.brass, { metalness: 0.7 })), 0, 0.105, 0.01, mb); at(sphere(0.012, mat('#FBF6EF')), 0, 0.135, 0.01, mb);
  put(mb, 0.24, 1.545, 0.22, cab); }
function mapleLeaf() {
  const s = new THREE.Shape(), pts = [[0, 1], [0.18, 0.58], [0.5, 0.75], [0.4, 0.38], [0.72, 0.42], [0.55, 0.1], [0.6, -0.1], [0.12, 0.02], [0.08, -0.5], [-0.08, -0.5], [-0.12, 0.02], [-0.6, -0.1], [-0.55, 0.1], [-0.72, 0.42], [-0.4, 0.38], [-0.5, 0.75], [-0.18, 0.58]];
  s.moveTo(...pts[0]); pts.slice(1).forEach(p => s.lineTo(...p)); s.closePath();
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false }), mat('#B3332A', { roughness: 0.6 }));
  m.scale.setScalar(0.11); m.castShadow = true; return m;
}
{ const leaf = mapleLeaf(); leaf.rotation.set(-0.15, 0.2, 0.1); put(leaf, 0.6, 1.545, 0.2, cab); }
// shelf: books
{ const cols = ['#7c3b33', '#E9D8C4', '#4b3a35', '#a8604a', '#d9c1a8', '#6a4a3e', '#b88a6e', '#8E4A32', '#3f3530'];
  let x = 0.06; cols.forEach((c, i) => { const h = 0.24 + ((i * 7) % 5) * 0.02, w = 0.045 + (i % 3) * 0.01; put(rbox(w, h, 0.18, mat(c), 0.004), x + w / 2, 1.065, 0.2, cab); x += w + 0.006; });
  const lean = rbox(0.05, 0.24, 0.17, mat('#a35e45'), 0.004); lean.rotation.z = -0.35; put(lean, x + 0.1, 1.065, 0.2, cab); }
// shelf: Québec postcards
const postcard = (label, sky) => canvasTex(300, 200, (g, w, h) => {
  g.fillStyle = '#FBF6EF'; g.fillRect(0, 0, w, h); g.fillStyle = sky; g.fillRect(12, 12, w - 24, h - 60);
  g.fillStyle = '#3b3340'; g.beginPath(); g.moveTo(12, h - 48); [[60, 95], [80, 70], [100, 92], [130, 40], [150, 85], [190, 60], [230, 92], [w - 12, 80], [w - 12, h - 48]].forEach(([x, y]) => g.lineTo(x, y)); g.fill();
  g.fillStyle = '#3B2620'; g.font = 'italic 30px Georgia'; g.fillText(label, 16, h - 16);
});
[['Québec', '#c98f86'], ['Canada', '#8fa3b8']].forEach(([l, s], i) => {
  const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.135, 0.004), [mat('#FBF6EF'), mat('#FBF6EF'), mat('#FBF6EF'), mat('#FBF6EF'), mat('#fff', { map: postcard(l, s) }), mat('#FBF6EF')]);
  p.castShadow = true; p.rotation.x = -0.18; p.rotation.y = i ? -0.2 : 0.15; put(p, 0.22 + i * 0.36, 0.585, 0.18 + i * 0.03, cab);
});
// bottom: storage boxes
put(rbox(0.33, 0.2, 0.3, mat('#E9DDCF'), 0.015), 0.22, 0.1, 0.2, cab); put(rbox(0.33, 0.2, 0.3, mat('#D9C7B3'), 0.015), 0.6, 0.1, 0.2, cab);

/* ---------- desk, chair, poster, wardrobe ---------- */
const DX = 3.68, DW = 1.0, DD = 0.6, DH = 0.74;
const deskM = mat(COL.desk, { roughness: 0.6 });
put(rbox(DW, 0.03, DD, deskM, 0.008), DX + DW / 2, DH - 0.03, DD / 2);
[[0.03, 0.03], [DW - 0.03, 0.03], [0.03, DD - 0.03], [DW - 0.03, DD - 0.03]].forEach(([x, z]) => put(rbox(0.035, DH - 0.03, 0.035, deskM, 0.006), DX + x, 0, z));
// books, scattered
put(rbox(0.22, 0.03, 0.16, mat('#7c3b33'), 0.005), DX + 0.16, DH, 0.3).rotation.y = 0.2;
put(rbox(0.2, 0.025, 0.15, mat('#4b3a35'), 0.005), DX + 0.17, DH + 0.03, 0.31).rotation.y = -0.1;
put(rbox(0.19, 0.028, 0.14, mat('#E9D8C4'), 0.005), DX + 0.15, DH + 0.055, 0.29).rotation.y = 0.35;
put(rbox(0.24, 0.02, 0.17, mat('#a8604a'), 0.005), DX + 0.5, DH, 0.45).rotation.y = -0.5;
// snowdrops in a glass vase
{ const v = new THREE.Group();
  at(cyl(0.035, 0.03, 0.12, new THREE.MeshStandardMaterial({ color: '#dfe9ee', transparent: true, opacity: 0.45, roughness: 0.1 }), 20), 0, 0.06, 0, v);
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2, stem = cyl(0.002, 0.002, 0.2, mat('#5f7d52'), 4);
    stem.position.set(Math.cos(a) * 0.012, 0.18, Math.sin(a) * 0.012); stem.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25); v.add(stem);
    const bud = sphere(0.013, mat('#FFFFFF', { roughness: 0.6 }), 10); bud.scale.set(0.8, 1.3, 0.8);
    bud.position.set(Math.cos(a) * 0.045, 0.27, Math.sin(a) * 0.045); v.add(bud);
  }
  put(v, DX + 0.5, DH, 0.14); }
// photo frame (our photo)
const frame = new THREE.Group(); scene.add(frame);
{ put(rbox(0.17, 0.21, 0.02, mat(COL.walnut, { roughness: 0.5 }), 0.006), 0, 0, 0, frame);
  at(new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.17), mat('#ffffff', { map: loadTex('./assets/photos/frame.jpg'), roughness: 0.5 })), 0, 0.105, 0.011, frame);
  const leg = rbox(0.03, 0.15, 0.01, mat(COL.walnut), 0.003); leg.position.set(0, 0.075, -0.04); leg.rotation.x = 0.4; frame.add(leg);
  frame.rotation.set(-0.12, -0.25, 0); frame.position.set(DX + 0.8, DH, 0.16); }
hotspot(frame, 'frame', 'Us', '', { dist: 1.0, dir: [0.1, 0.35, 1] });
// small snow globe on the desk
{ const g = new THREE.Group(); put(cyl(0.035, 0.04, 0.03, mat(COL.walnut)), 0, 0, 0, g);
  at(sphere(0.045, new THREE.MeshStandardMaterial({ color: '#E6F0F7', transparent: true, opacity: 0.35, roughness: 0.05 }), 20), 0, 0.07, 0, g);
  put(g, DX + 0.92, DH, 0.42); }
// candle on the desk
function candle(x, y, z, h = 0.09, r = 0.025, lightI = 0.5) {
  const g = new THREE.Group();
  put(cyl(r, r, h, mat('#F2E6D8', { roughness: 0.9 })), 0, 0, 0, g);
  const fl = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 8), glowMat('#FFC27A', 4)); fl.scale.set(1, 2, 1); fl.position.y = h + 0.017; g.add(fl);
  put(g, x, y, z);
  const l = warmLight(x, y + h + 0.06, z, lightI, 1.8);
  flickers.push({ l, base: lightI, fl, seed: Math.random() * 100 });
  return g;
}
candle(DX + 0.12, DH, 0.5, 0.08, 0.028, 0.45);

// black swivel chair
{ const ch = new THREE.Group(), bm = mat(COL.black, { roughness: 0.5 });
  for (let k = 0; k < 5; k++) { const leg = rbox(0.26, 0.025, 0.04, bm, 0.008); leg.position.set(Math.cos(k * 1.2566) * 0.13, 0.05, Math.sin(k * 1.2566) * 0.13); leg.rotation.y = -k * 1.2566; ch.add(leg);
    at(sphere(0.022, bm, 8), Math.cos(k * 1.2566) * 0.25, 0.022, Math.sin(k * 1.2566) * 0.25, ch); }
  at(cyl(0.025, 0.025, 0.36, mat('#3a3a3c', { metalness: 0.6, roughness: 0.3 })), 0, 0.24, 0, ch);
  at(rbox(0.46, 0.07, 0.44, bm, 0.03), 0, 0.45, 0, ch);
  const back = rbox(0.44, 0.48, 0.06, bm, 0.03); back.position.set(0, 0.77, 0.22); back.rotation.x = 0.08; ch.add(back);
  ch.position.set(DX + 0.48, 0, 0.98); ch.rotation.y = 0.35; scene.add(ch); }

// Mina poster: TWICE "What is Love?" in a square walnut frame
{ const p = new THREE.Group(); put(rbox(0.6, 0.6, 0.025, mat(COL.walnut, { roughness: 0.5 }), 0.008), 0, 0, 0, p);
  at(new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.54), mat('#fff', { map: loadTex('./assets/mina-poster.jpg'), roughness: 0.6 })), 0, 0.3, 0.014, p);
  p.position.set(DX + DW / 2, 1.42, 0.0125); scene.add(p); }

// built-in IKEA-style wardrobe in the back-right corner
{ const wd = new THREE.Group(), wm = mat(COL.ikea, { roughness: 0.6 }), ww = W - (DX + DW) - 0.06;
  put(rbox(ww, 2.42, 0.6, wm, 0.012), 0, 0, 0, wd);
  put(rbox(0.006, 2.3, 0.004, mat('#cfc4b4'), 0.002), 0, 0.06, 0.301, wd);
  [-0.04, 0.04].forEach(dx => put(rbox(0.016, 0.22, 0.02, mat(COL.cherry, { roughness: 0.4 }), 0.006), dx, 1.05, 0.31, wd));
  wd.position.set(W - ww / 2 - 0.01, 0, 0.3); scene.add(wd); }

/* ---------- bed (oxblood), nightstand with snacks + lamp, star lights ---------- */
const bed = new THREE.Group(); scene.add(bed);
const BZ = 1.0, BW = 1.62, BL = 2.05;
put(rbox(BL, 0.26, BW, mat(COL.frame, { roughness: 0.6 }), 0.02), BL / 2, 0, BZ + BW / 2, bed);
put(rbox(0.09, 1.05, BW + 0.04, mat(COL.frame, { roughness: 0.6 }), 0.03), 0.06, 0, BZ + BW / 2, bed);
put(rbox(BL - 0.12, 0.2, BW - 0.06, mat('#EFE4D6'), 0.06), BL / 2 + 0.04, 0.26, BZ + BW / 2, bed);
const duvetM = mat(COL.bed, { roughness: 0.95 });
put(rbox(BL - 0.42, 0.13, BW + 0.04, duvetM, 0.06), BL / 2 + 0.22, 0.4, BZ + BW / 2, bed);
put(rbox(0.32, 0.135, BW + 0.05, mat(COL.bedTop, { roughness: 0.95 }), 0.06), 0.62, 0.4, BZ + BW / 2, bed); // folded edge
put(rbox(0.42, 0.04, BW + 0.08, mat('#EADBC9', { roughness: 1 }), 0.02), BL - 0.3, 0.52, BZ + BW / 2, bed);   // throw at the foot
const pillow = (c, z, ry) => { const p = rbox(0.34, 0.15, 0.62, mat(c, { roughness: 1 }), 0.07); p.rotation.set(0, ry, 0.25); put(p, 0.3, 0.46, z, bed); };
pillow('#F1E6D8', BZ + 0.42, 0.05); pillow(COL.blush, BZ + BW - 0.42, -0.06);
// Twice album on the bed
const album = new THREE.Group(); scene.add(album);
{ const a = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.022, 0.3), [mat('#F2A7B6'), mat('#F2A7B6'), mat('#fff', { map: loadTex('./assets/covers/this-is-for.jpg') }), mat('#F2A7B6'), mat('#F2A7B6'), mat('#F2A7B6')]);
  a.castShadow = true; album.add(a); album.rotation.y = 0.3; album.position.set(1.08, 0.545, BZ + 0.62); }
hotspot(album, 'twice', 'THIS IS FOR', '', { dist: 1.3, dir: [0.3, 0.9, 0.8] });
// surprise box
const gift = new THREE.Group(), giftLid = new THREE.Group(); scene.add(gift);
{ const gm = mat('#7E1F24', { roughness: 0.55 }), rm = mat('#F1E6D8', { roughness: 0.5 });
  put(rbox(0.3, 0.22, 0.28, gm, 0.012), 0, 0, 0, gift);
  put(rbox(0.05, 0.215, 0.285, rm, 0.006), 0, 0, 0, gift); put(rbox(0.305, 0.215, 0.05, rm, 0.006), 0, 0, 0, gift);
  giftLid.position.y = 0.21; gift.add(giftLid);
  put(rbox(0.32, 0.04, 0.3, gm, 0.012), 0, 0, 0, giftLid);
  put(rbox(0.05, 0.045, 0.305, rm, 0.006), 0, 0, 0, giftLid); put(rbox(0.325, 0.045, 0.05, rm, 0.006), 0, 0, 0, giftLid);
  [-1, 1].forEach(s => { const t = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 8, 20), rm); t.position.set(s * 0.04, 0.08, 0); t.rotation.set(0, 0, s * 0.6); t.scale.set(1, 0.7, 0.6); t.castShadow = true; giftLid.add(t); });
  gift.rotation.y = -0.25; gift.position.set(1.5, 0.535, BZ + 1.12); }
hotspot(gift, 'gift', 'A surprise', '', { dist: 1.3, dir: [0.3, 0.8, 0.9] });

// nightstand, front-left, with a bedside lamp and the snack corner
const NZ = BZ + BW + 0.12;
{ const ns = new THREE.Group(), nm = mat(COL.cherry, { roughness: 0.55 }), km = mat(COL.brass, { metalness: 0.6, roughness: 0.35 });
  put(rbox(0.5, 0.56, 0.48, nm, 0.02), 0, 0, 0, ns);
  put(rbox(0.46, 0.006, 0.004, mat(COL.cherryDark), 0.001), 0, 0.28, 0.241, ns);
  [0.14, 0.42].forEach(y => at(sphere(0.014, km, 10), 0, y, 0.248, ns));
  ns.position.set(0.27, 0, NZ + 0.24); scene.add(ns); }
{ // bedside lamp
  const lp = new THREE.Group();
  put(cyl(0.05, 0.06, 0.03, mat('#E9DDCF')), 0, 0, 0, lp);
  at(cyl(0.008, 0.008, 0.2, mat(COL.brass, { metalness: 0.6, roughness: 0.35 })), 0, 0.13, 0, lp);
  const shade = cyl(0.07, 0.11, 0.14, new THREE.MeshStandardMaterial({ color: '#F6E6D0', emissive: '#FFC98A', emissiveIntensity: 0.9, side: THREE.DoubleSide, roughness: 1 }), 24);
  shade.geometry = new THREE.CylinderGeometry(0.07, 0.11, 0.14, 24, 1, true); shade.position.y = 0.27; lp.add(shade);
  put(lp, 0.13, 0.56, NZ + 0.13);
  const l = warmLight(0.13, 0.86, NZ + 0.13, 1.4, 3.2); flickers.push({ l, base: 1.4, seed: 7, soft: true }); }
// snacks: Want Want milk, rice crackers, beef jerky, beer, mămăligă
const wwTex = canvasTex(256, 128, (g, w, h) => { g.fillStyle = '#D62D24'; g.fillRect(0, 0, w, h); g.fillStyle = '#FFFFFF'; g.fillRect(0, 42, w, 46);
  g.fillStyle = '#D62D24'; g.font = '700 34px "Noto Sans SC", "PingFang SC", sans-serif'; g.textAlign = 'center'; g.fillText('旺仔牛奶', w / 2, 78); });
[[0.36, NZ + 0.08], [0.44, NZ + 0.13]].forEach(([x, z]) => { const c = cyl(0.03, 0.03, 0.1, [mat('#fff', { map: wwTex, roughness: 0.4, metalness: 0.2 }), mat('#d8d8d8', { metalness: 0.7 }), mat('#d8d8d8', { metalness: 0.7 })], 20); put(c, x, 0.56, z).rotation.y = 1.2; });
{ const s = new THREE.Group(); for (let k = 0; k < 3; k++) at(cyl(0.045, 0.045, 0.012, mat('#F2E2C4', { roughness: 0.95 }), 16), 0, 0.006 + k * 0.013, 0, s);
  const bag = rbox(0.13, 0.03, 0.1, mat('#D62D24', { roughness: 0.5 }), 0.01); bag.position.set(0.02, 0.05, 0.01); bag.rotation.z = 0.1; s.add(bag); put(s, 0.12, 0.56, NZ + 0.38); }
{ const b = new THREE.Group(), bm = new THREE.MeshStandardMaterial({ color: '#3f5a2c', roughness: 0.2, transparent: true, opacity: 0.9 });
  at(cyl(0.028, 0.028, 0.14, bm, 16), 0, 0.07, 0, b); at(cyl(0.012, 0.028, 0.05, bm, 16), 0, 0.165, 0, b); at(cyl(0.011, 0.011, 0.04, bm, 12), 0, 0.21, 0, b);
  at(cyl(0.0285, 0.0285, 0.05, mat('#E9DDCF'), 16), 0, 0.07, 0, b); put(b, 0.44, 0.56, NZ + 0.3); }
{ const j = rbox(0.11, 0.025, 0.15, mat('#7a3a28', { roughness: 0.5 }), 0.01); j.rotation.y = 0.5; put(j, 0.3, 0.56, NZ + 0.42); }
{ const bowl = new THREE.Group(); const bp = [[0, 0], [0.05, 0.004], [0.065, 0.03], [0.068, 0.045]].map(([r, y]) => new THREE.Vector2(r, y));
  const bw = new THREE.Mesh(new THREE.LatheGeometry(bp, 24), mat('#FBF6EF', { side: THREE.DoubleSide })); bowl.add(bw);
  const mush = sphere(0.05, mat('#E8D9A8', { roughness: 0.9 }), 16); mush.scale.set(1, 0.45, 1); mush.position.y = 0.04; bowl.add(mush);
  for (let k = 0; k < 6; k++) at(sphere(0.008, mat('#FFFFFF'), 6), Math.cos(k) * 0.025, 0.06, Math.sin(k) * 0.025, bowl);
  put(bowl, 0.27, 0.56, NZ + 0.24); }

const snackSpot = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.95, 0.62), new THREE.MeshBasicMaterial());
snackSpot.visible = false; snackSpot.position.set(0.27, 0.48, NZ + 0.24); scene.add(snackSpot);
hotspot(snackSpot, 'snacks', 'The snack corner', '', { dist: 1.15, dir: [0.6, 0.75, 1], viewOnly: true });
hotspot(cab, 'cabinet', 'Little things from everywhere', '', { dist: 2.1, dir: [0.5, 0.2, 1], viewOnly: true });

// strung star lights on the left wall above the bed
const starBulbs = [];
[[2.0, 0.1], [1.78, 0.12], [1.58, 0.09]].forEach(([y, sag]) =>
  starBulbs.push(...fairyString(new THREE.Vector3(0.025, y, BZ - 0.05), new THREE.Vector3(0.025, y, BZ + BW + 0.05), sag, 22, scene)));
warmLight(0.3, 1.75, BZ + BW / 2, 0.5, 2.2);

/* ---------- rug, coffee table with the birthday cake, TV ---------- */
const rugTex = canvasTex(1024, 768, (g, w, h) => {
  g.fillStyle = '#8f3d2f'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#EADCC9'; g.fillRect(40, 40, w - 80, h - 80);
  g.strokeStyle = '#b2604a'; g.lineWidth = 4; g.setLineDash([18, 16]); g.strokeRect(80, 80, w - 160, h - 160);
  g.globalAlpha = 0.08; for (let i = 0; i < 4000; i++) { g.fillStyle = i % 2 ? '#fff' : '#7a5d52'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
});
put(rbox(2.5, 0.02, 1.85, mat('#fff', { map: rugTex, roughness: 1 }), 0.008), 2.85, 0, 2.55);

const TX = 2.62, TZ = 2.4, TH = 0.46;
put(cyl(0.18, 0.2, 0.025, mat(COL.walnut)), TX, 0, TZ);
put(cyl(0.035, 0.035, TH - 0.06, mat(COL.walnut)), TX, 0.02, TZ);
put(cyl(0.4, 0.4, 0.04, mat(COL.cherry, { roughness: 0.5 }), 48), TX, TH - 0.04, TZ);
const cake = new THREE.Group(), cakeFlames = []; let cakeLight;
{ const cm = mat('#F6EEE4', { roughness: 0.85 });
  put(cyl(0.22, 0.22, 0.012, mat('#FBF6EF', { roughness: 0.3 }), 40), 0, 0, 0, cake);
  put(cyl(0.16, 0.16, 0.13, cm, 40), 0, 0.012, 0, cake);
  for (let k = 0; k < 22; k++) { const a = k / 22 * Math.PI * 2; at(sphere(0.016, cm, 8), Math.cos(a) * 0.16, 0.025, Math.sin(a) * 0.16, cake); at(sphere(0.013, cm, 8), Math.cos(a) * 0.15, 0.142, Math.sin(a) * 0.15, cake); }
  for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2 + 0.3; const s = sphere(0.022, mat('#B8262B', { roughness: 0.35 }), 12); s.scale.set(1, 1.15, 1); at(s, Math.cos(a) * 0.105, 0.162, Math.sin(a) * 0.105, cake); }
  put(cake, TX, TH, TZ);
  [[-0.03, 0.02], [0.035, -0.02]].forEach(([dx, dz]) => { const c = new THREE.Group();
    at(cyl(0.006, 0.006, 0.09, mat('#F2E6D8')), 0, 0.045, 0, c);
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 8), glowMat('#FFC27A', 5)); fl.scale.set(1, 2, 1); fl.position.y = 0.105; c.add(fl);
    c.position.set(TX + dx, TH + 0.142, TZ + dz); scene.add(c); cakeFlames.push(fl); flickers.push({ fl, seed: Math.random() * 50, cake: true }); });
  const l = warmLight(TX, TH + 0.4, TZ, 1.3, 3.4); cakeLight = { l, base: 1.3, seed: 3 }; flickers.push(cakeLight); }
// two pillar candles on the floor, left of the window
candle(2.06, 0, 0.32, 0.16, 0.04, 0.6); candle(1.93, 0, 0.42, 0.1, 0.035, 0);

// floor-standing vintage TV
const tv = new THREE.Group(); scene.add(tv);
{ const tm = mat(COL.cherry, { roughness: 0.5 }), lm = mat(COL.walnut);
  [[-0.3, -0.18], [0.3, -0.18], [-0.3, 0.18], [0.3, 0.18]].forEach(([x, z]) => { const l = cyl(0.016, 0.01, 0.26, lm, 8); l.position.set(x, 0.13, z); l.rotation.set(z > 0 ? 0.12 : -0.12, 0, x > 0 ? -0.12 : 0.12); tv.add(l); });
  put(rbox(0.76, 0.58, 0.5, tm, 0.05), 0, 0.25, 0, tv);
  at(rbox(0.5, 0.42, 0.03, mat('#2a2220'), 0.04), -0.1, 0.54, 0.24, tv);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.36), new THREE.MeshStandardMaterial({ color: '#2e3a40', emissive: '#304650', emissiveIntensity: 0.35, roughness: 0.25, metalness: 0.1 }));
  screen.position.set(-0.1, 0.54, 0.257); tv.add(screen); tv.userData.screen = screen;
  [0.66, 0.54, 0.42].forEach(y => { const k = cyl(0.028, 0.028, 0.025, mat(COL.brass, { metalness: 0.6, roughness: 0.35 }), 16); k.rotation.x = Math.PI / 2; k.position.set(0.27, y, 0.255); tv.add(k); });
  [-0.4, 0.4].forEach(a => { const r = cyl(0.004, 0.004, 0.38, mat('#2a2220', { metalness: 0.5 }), 6); r.position.set(Math.sin(a) * 0.15, 0.98, 0); r.rotation.z = -a; tv.add(r); });
  at(sphere(0.03, tm, 12), 0, 0.84, 0, tv);
  tv.position.set(4.62, 0, 2.95); tv.rotation.y = -0.55; }
hotspot(tv, 'tv', 'Movie night', '', { dist: 1.9, dir: [-0.2, 0.25, 1], local: true });

/* ---------- the guide dog ---------- */
const DOG_HOME = [3.45, 3.2];
const dogPivot = new THREE.Group(); scene.add(dogPivot);
const dogState = { x: DOG_HOME[0], z: DOG_HOME[1], heading: 1.35, path: [], onArrive: null };
dogPivot.position.set(dogState.x, 0.02, dogState.z); dogPivot.rotation.y = dogState.heading;
hotspot(dogPivot, 'dog', 'Your guide', 'Drag to look around, pinch to zoom, double-tap anything to get closer.', { dist: 1.7, dir: [0.4, 0.45, 1] });

let dogModel = null; const dogWaiting = [];
const onDog = (fn) => (dogModel ? fn() : dogWaiting.push(fn));
new GLTFLoader().load('./assets/dog.glb', (gltf) => {
  const dog = gltf.scene;
  dog.traverse(o => {
    if (!o.isMesh) return;
    // weld the faceted low-poly mesh and smooth it so the dog reads softer and rounder
    let g = o.geometry; g.deleteAttribute('normal'); if (g.attributes.uv) g.deleteAttribute('uv');
    g = mergeVertices(g, 1e-4); g.computeVertexNormals(); o.geometry = g;
    o.castShadow = o.receiveShadow = true;
    o.material.roughness = 0.9; o.material.flatShading = false; o.material.needsUpdate = true;
  });
  const size = new THREE.Box3().setFromObject(dog).getSize(new THREE.Vector3());
  const s = 0.74 / size.y;
  dog.scale.set(s * 1.4, s * 1.02, s * 1.05); // wider and a touch fuller than the original
  const b = new THREE.Box3().setFromObject(dog), c = b.getCenter(new THREE.Vector3());
  dog.position.set(-c.x, -b.min.y, -c.z);
  const holder = new THREE.Group(); holder.add(dog);
  dogModel = holder; dogPivot.add(holder.clone());
  dogWaiting.splice(0).forEach(f => f());
});

const HUB = [3.3, 1.85];
function walkDog([x, z], done) {
  const far = Math.hypot(x - dogState.x, z - dogState.z) > 1.3;
  dogState.path = far ? [HUB, [x, z]] : [[x, z]];
  dogState.onArrive = done;
}
const angleLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

/* ---------- sparkles over tappable things ---------- */
const sparkTex = canvasTex(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,240,215,1)'); r.addColorStop(0.25, 'rgba(255,214,160,.7)'); r.addColorStop(1, 'rgba(255,200,140,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.moveTo(32, 6); g.lineTo(35, 29); g.lineTo(58, 32); g.lineTo(35, 35); g.lineTo(32, 58); g.lineTo(29, 35); g.lineTo(6, 32); g.lineTo(29, 29); g.fill();
});
const sparkles = [];
let sparklesOn = false;
function sparkleAbove(group, dy = 0.12) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false }));
  sp.scale.setScalar(0.14); sp.visible = false; scene.add(sp);
  sparkles.push({ sp, group, dy, seed: Math.random() * 10 });
}
hotspots.filter(h => !h.userData.hotspot.view.viewOnly).forEach(h => sparkleAbove(h, h.userData.hotspot.id === 'dog' ? 0.18 : 0.12));

/* ---------- card + bubble ---------- */
const tip = document.getElementById('tip'), bubble = document.getElementById('bubble');
const card = document.getElementById('card'), cardTitle = document.getElementById('cardTitle'), cardText = document.getElementById('cardText');
const cardActions = document.getElementById('cardActions'), meter = document.getElementById('meter');
const cardBody = document.getElementById('cardBody');
function setBody(node) { cardBody.innerHTML = ''; if (node) cardBody.append(node); cardBody.hidden = !node; refreshMedia(); }
function showCard(title, text, actions = [], body = null) {
  cardTitle.textContent = title; cardText.textContent = text || ''; cardText.hidden = !text;
  meter.hidden = true; cardActions.innerHTML = ''; setBody(body);
  actions.forEach(a => { const b = document.createElement('button'); b.type = 'button'; b.textContent = a.label; if (a.primary) b.className = 'primary'; b.addEventListener('click', a.fn); cardActions.append(b); });
  card.classList.add('open');
}
const hideCard = () => card.classList.remove('open');
let bubbleOn = false;
function say(text) { bubble.textContent = text; bubble.classList.remove('hidden'); bubbleOn = true; }
function hush() { bubble.classList.add('hidden'); bubbleOn = false; }

/* ---------- music, movies and the surprise box ---------- */
const SONGS = [
  { id: 'million-dollar-man', title: 'Million Dollar Man', artist: 'Lana Del Rey', cover: 'born-to-die' },
  { id: 'happiness-is-a-butterfly', title: 'Happiness is a butterfly', artist: 'Lana Del Rey', cover: 'happiness-is-a-butterfly' },
  { id: 'le-temps-de-lamour', title: "Le temps de l'amour", artist: 'Françoise Hardy', cover: 'le-temps-de-lamour' },
  { id: 'message-personnel', title: 'Message personnel', artist: 'Françoise Hardy', cover: 'message-personnel' },
];
const TWICE_SONG = { id: 'this-is-for', title: 'THIS IS FOR', artist: 'TWICE', cover: 'this-is-for' };
const CLIPS = [
  { id: 'matilda', title: 'Matilda', note: 'Everyone born…' },
  { id: 'charlie', title: 'Charlie and the Chocolate Factory', note: 'The last golden ticket' },
];
const ARM_PLAY = 0.5;

const audio = new Audio(); audio.preload = 'none';
const media = { track: null, source: null };
const covers = {};
const coverTex = (id) => covers[id] || (covers[id] = loadTex(`./assets/covers/${id}.jpg`));
let refreshers = [];
function refreshMedia() { refreshers.forEach(f => f()); }
function node(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }

function playSong(t, source) {
  resumeAfterClip = false; stopVideo();
  if (media.track !== t) { audio.src = `./assets/music/${t.id}.mp3`; media.track = t; }
  media.source = source;
  audio.loop = source === 'bg'; // THIS IS FOR loops quietly behind everything until she picks something else
  audio.volume = source === 'bg' ? 0.6 : 1;
  audio.play().catch(() => {});
  if (source === 'vinyl') { labelMat.map = coverTex(t.cover); labelMat.color.set('#ffffff'); labelMat.needsUpdate = true; }
  refreshMedia();
}
const pauseSong = () => audio.pause();
audio.addEventListener('play', () => refreshMedia());
audio.addEventListener('pause', () => refreshMedia());
audio.addEventListener('ended', () => {
  if (media.source === 'vinyl') playSong(SONGS[(SONGS.indexOf(media.track) + 1) % SONGS.length], 'vinyl');
  else refreshMedia();
});

function row(img, title, sub, isOn, isPlaying, onTap) {
  const b = node('button', 'track'); b.type = 'button';
  const pic = node('img'); pic.src = img; pic.alt = '';
  const meta = node('span', 'meta'); meta.append(node('b', '', title), node('small', '', sub));
  const st = node('span', 'state');
  b.append(pic, meta, st);
  b.addEventListener('click', onTap);
  refreshers.push(() => { b.classList.toggle('on', isOn()); st.textContent = isPlaying() ? 'Pause' : 'Play'; });
  return b;
}
function songRow(t, source) {
  return row(`./assets/covers/${t.cover}.jpg`, t.title, t.artist,
    () => media.track === t, () => media.track === t && !audio.paused,
    () => (media.track === t && !audio.paused ? pauseSong() : playSong(t, source)));
}
function list(items) { const d = node('div', 'list'); items.forEach(i => d.append(i)); return d; }

// the TV plays the clip onto its screen, cropped from 16:9 to the set's squarer tube
const video = document.createElement('video');
video.playsInline = true; video.setAttribute('playsinline', ''); video.setAttribute('webkit-playsinline', ''); video.preload = 'none';
const videoTex = new THREE.VideoTexture(video); videoTex.colorSpace = THREE.SRGBColorSpace;
videoTex.repeat.set((0.44 / 0.36) / (16 / 9), 1); videoTex.offset.set((1 - videoTex.repeat.x) / 2, 0);
const tvScreen = tv.userData.screen, tvIdle = { color: tvScreen.material.color.clone(), emissive: tvScreen.material.emissive.clone(), ei: tvScreen.material.emissiveIntensity };
let clipOn = null;
function screenOn(on) {
  const m = tvScreen.material;
  m.map = on ? videoTex : null; m.emissiveMap = on ? videoTex : null;
  m.color.copy(on ? new THREE.Color('#ffffff') : tvIdle.color); m.emissive.copy(on ? new THREE.Color('#ffffff') : tvIdle.emissive);
  m.emissiveIntensity = on ? 0.85 : tvIdle.ei; m.needsUpdate = true;
}
let resumeAfterClip = false;
function playClip(c) {
  if (!audio.paused) { resumeAfterClip = true; audio.pause(); }
  if (clipOn !== c) { video.src = `./assets/video/${c.id}.mp4`; clipOn = c; }
  video.play().catch(() => {}); screenOn(true); refreshMedia();
}
function stopVideo() {
  if (!clipOn) return; video.pause(); clipOn = null; screenOn(false);
  if (resumeAfterClip) { resumeAfterClip = false; audio.play().catch(() => {}); }
  refreshMedia();
}
video.addEventListener('play', () => refreshMedia());
video.addEventListener('pause', () => refreshMedia());
video.addEventListener('ended', () => refreshMedia());
function clipRow(c) {
  return row(`./assets/video/${c.id}.jpg`, c.title, c.note,
    () => clipOn === c, () => clipOn === c && !video.paused && !video.ended,
    () => (clipOn === c && !video.paused && !video.ended ? video.pause() : playClip(c)));
}

let giftOpen = false;
function ryanGallery() {
  const wrap = node('div');
  const g = node('div', 'gallery');
  [1, 2, 3, 4].forEach(n => { const im = node('img'); im.src = `./assets/ryan/ryan-${n}.jpg`; im.alt = 'Ryan Gosling'; im.loading = 'lazy'; g.append(im); });
  wrap.append(g, node('p', 'swipe-hint', 'Swipe →'));
  return wrap;
}

// extra content for each tappable thing, used both in the tour and when exploring
const EXTRAS = {
  music: () => { refreshers = []; return { body: list(SONGS.map(t => songRow(t, 'vinyl'))) }; },
  twice: () => { refreshers = []; const body = list([songRow(TWICE_SONG, 'twice')]); playSong(TWICE_SONG, 'twice'); return { body }; },
  gift: () => { refreshers = []; giftOpen = true; return { body: ryanGallery() }; },
  tv: () => { refreshers = []; return { body: list(CLIPS.map(clipRow)) }; },
  bed: () => {
    refreshers = [];
    return { body: list([songRow(TWICE_SONG, 'twice')]),
      actions: [{ label: 'Open the box', fn: () => { giftOpen = true; setBody(ryanGallery()); } }] };
  },
};

/* ---------- our album: every photo with the caption it came with ---------- */
const ALBUM = [
  [['4039'], 'Our first selfie together!!! First ylis!'],
  [['4122'], "First school week omg we were sooo young and 'free'"],
  [['8a1ef'], 'Solvala day~'],
  [['4295'], 'Nasut...!'],
  [['0783'], 'awwww WE CANT EAT THE SKIN!'],
  [['4430'], 'your first wechat post'],
  [['0809'], 'remember we were swinging and having alepa food during breaks'],
  [['4447'], 'flying tiger trip'],
  [['4503'], 'do you remember the date lmao?'],
  [['0885'], 'the second yliiiis'],
  [['af4ff'], 'filmography club!'],
  [['4679'], 'our subway'],
  [['4743'], 'the day to taco bell~~'],
  [['4783'], 'before debate club..'],
  [['1130'], 'third ylis!'],
  [['4898'], 'first sleepover'],
  [['9442'], 'aww i love this'],
  [['5067'], 'remember we were getting lost...'],
  [['5080'], 'debate...!'],
  [['5161'], 'first photo shoot! love this so much!'],
  [['5285'], '6767676767'],
  [['1706', '1708', '1709'], 'mochi mochi'],
  [['5565'], 'thai food! (thank u so much for supporting my piano performance)'],
  [['6057'], 'math club!'],
  [['6419'], 'city walkinggg'],
  [['6642'], "i can't."],
  [['0f21d'], 'HALLOWEEN!! we were eating!'],
  [['7325'], 'music class which i like a lot but you...lmaooo'],
  [['7506'], 'first day after i broke up..hmm!'],
  [['7658'], 'itsenaisyys paiva~'],
  [['7862'], 'Merry Christmas!'],
  [['4035'], 'this was so fun'],
  [['4130', '8061'], 'hotel trip xixixi'],
  [['8787'], 'did i just came back from china?'],
  [['0564'], 'Chinese foooood'],
  [['6316'], 'nope this was the first time after China'],
  [['6351'], 'We are being Japanese kawaiiii'],
  [['0706'], 'in the school library'],
  [['0866'], 'noidea'],
  [['1202'], "Adya's birthday party"],
  [['7289'], 'vapuuuu'],
  [['2668'], "Aishwarya's birthday partyyyy"],
  [['2742'], 'look at our bicepssss'],
  [['4683'], 'mid summer'],
  [['4685'], 'hahahah ur so cute'],
  [['6576'], 'summer beach party!!! hesburger'],
  [['6843'], 'one year anniversary!'],
  [['7022'], 'school started...!'],
  [['7568'], 'school mirror selfie!'],
  [['8024'], 'nordeep!'],
];
// capture dates read from the photos (empty when the photo didn't carry one)
const PHOTO_DATES = {"0706":"2026-03","0866":"2026-03","2742":"2026-05","4683":"2026-06","6316":"2026-03","6351":"2026-03","6576":"2026-07","6843":"2026-08","7022":"2026-08","7289":"2026-04","7568":"2026-09","8787":"2026-02","1130":"2025-08","4130":"2025-12","4743":"2025-08","4783":"2025-08","5080":"2025-09","5565":"2025-09","8061":"2025-12","9442":"2025-09","af4ff":"2025-08","0f21d":"2025-11","8a1ef":"2025-08","0783":"2025-08","0809":"2025-08","0885":"2025-08","4035":"2025-12","4039":"2025-08","4295":"2025-08","6419":"2025-10","7325":"2025-12","7862":"2025-12"};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthOf = (keys) => { const d = keys.map(k => PHOTO_DATES[k]).find(Boolean); if (!d) return ''; const [y, m] = d.split('-'); return `${MONTHS[+m - 1]} ${y}`; };

const albumEl = document.getElementById('album'), albumTrack = document.getElementById('albumTrack'), albumCount = document.getElementById('albumCount');
ALBUM.forEach(([keys, caption], i) => {
  const slide = node('figure', 'slide');
  const pics = node('div', 'pics n' + keys.length);
  keys.forEach(k => { const im = node('img'); im.src = `./assets/photos/full/${k}.jpg`; im.alt = caption; im.loading = i < 2 ? 'eager' : 'lazy'; im.decoding = 'async'; pics.append(im); });
  const cap = node('figcaption');
  const when = monthOf(keys); if (when) cap.append(node('small', '', when));
  cap.append(node('span', '', caption));
  slide.append(pics, cap); albumTrack.append(slide);
});
const albumIndex = () => Math.round(albumTrack.scrollLeft / albumTrack.clientWidth);
const showCount = () => { albumCount.textContent = `${albumIndex() + 1} / ${ALBUM.length}`; };
albumTrack.addEventListener('scroll', showCount, { passive: true });
const albumGo = (d) => albumTrack.scrollTo({ left: (albumIndex() + d) * albumTrack.clientWidth, behavior: 'smooth' });
document.getElementById('albumPrev').addEventListener('click', () => albumGo(-1));
document.getElementById('albumNext').addEventListener('click', () => albumGo(1));
document.getElementById('albumClose').addEventListener('click', () => closeAlbum());
addEventListener('keydown', e => {
  if (albumEl.hidden) return;
  if (e.key === 'ArrowRight') albumGo(1); else if (e.key === 'ArrowLeft') albumGo(-1); else if (e.key === 'Escape') closeAlbum();
});
function openAlbum() { albumEl.hidden = false; albumTrack.scrollLeft = 0; showCount(); document.getElementById('albumClose').focus(); }
function closeAlbum() { albumEl.hidden = true; }
EXTRAS.photos = () => { refreshers = []; return { actions: [{ label: 'Open our album', primary: true, fn: openAlbum }] }; };
EXTRAS.frame = () => {
  refreshers = [];
  const f = node('figure', 'deskphoto'); const im = node('img'); im.src = './assets/photos/full/4039.jpg'; im.alt = 'Our first selfie together';
  f.append(im, node('figcaption', '', 'Our first selfie together!!! First ylis!'));
  return { body: f };
};

/* ---------- camera moves ---------- */
let tween = null;
function flyTo(pos, target, ms = 1100) {
  tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, start: performance.now(), ms };
}
function frameView(obj, view) {
  const c = new THREE.Box3().setFromObject(view.aim || obj).getCenter(new THREE.Vector3());
  const dir = new THREE.Vector3(...view.dir).normalize();
  if (view.local) dir.applyQuaternion(obj.quaternion);
  flyTo(c.clone().addScaledVector(dir, view.dist * Math.max(1, 0.8 / camera.aspect)), c);
}
const flyHome = () => flyTo(HOME_TARGET.clone().addScaledVector(HOME_DIR, homeDistance()), HOME_TARGET.clone());
function focusOn(g) {
  const h = g.userData.hotspot;
  frameView(g, h.view);
  stopVideo();
  const ex = EXTRAS[h.id] ? EXTRAS[h.id]() : {};
  showCard(h.title, h.text, [...(ex.actions || []), { label: 'Back to the room', primary: !ex.actions, fn: goHome }], ex.body);
  tip.classList.remove('on');
}
function goHome() { flyHome(); hideCard(); stopVideo(); }

/* ---------- tapping, double-tapping, hovering ---------- */
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
function aim(ev) { ptr.set(ev.clientX / innerWidth * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ptr, camera); }
function pick(ev) {
  aim(ev);
  const hit = ray.intersectObjects(hotspots, true)[0];
  if (!hit) return null;
  let o = hit.object; while (o && !o.userData.hotspot) o = o.parent;
  return o;
}
function zoomToPoint(ev) {
  aim(ev);
  const hit = ray.intersectObjects(scene.children, true).find(h => h.object.visible && !h.object.isSprite && !h.object.isPoints && h.object !== backdrop);
  if (!hit) return;
  const off = camera.position.clone().sub(controls.target).setLength(1.5 * Math.max(1, 0.8 / camera.aspect));
  flyTo(hit.point.clone().add(off), hit.point.clone(), 800);
}
let down = null, lastTap = { t: 0, x: 0, y: 0 };
renderer.domElement.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; tween = null; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
  const now = performance.now();
  if (now - lastTap.t < 330 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) { lastTap.t = 0; zoomToPoint(e); return; }
  lastTap = { t: now, x: e.clientX, y: e.clientY };
  if (tour.active) return;
  const g = pick(e); if (g) focusOn(g);
});
renderer.domElement.addEventListener('pointermove', e => {
  if (isMobile || tour.active) return;
  const g = pick(e);
  renderer.domElement.style.cursor = g ? 'pointer' : '';
  if (g) { tip.textContent = g.userData.hotspot.title; tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px'; tip.classList.add('on'); }
  else tip.classList.remove('on');
});
addEventListener('keydown', e => { if (e.key === 'Escape' && !tour.active) goHome(); });
// back to the whole-room view; during the tour keep the current step's card open
document.getElementById('zoomOut').addEventListener('click', () => (tour.active ? flyHome() : goHome()));
const soundBtn = document.getElementById('sound');
soundBtn.addEventListener('click', () => {
  audio.muted = !audio.muted;
  soundBtn.setAttribute('aria-pressed', String(audio.muted));
  soundBtn.setAttribute('aria-label', audio.muted ? 'Turn the music on' : 'Turn the music off');
});

/* ---------- blowing out the candles ---------- */
const blow = { level: 0, done: false };
async function listenForBlow() {
  showCard('Make a wish', 'Listening… blow into your phone.', [{ label: 'Tap to blow instead', fn: blowOut }]);
  meter.hidden = false;
  if (!audio.paused) { blow.resume = true; audio.pause(); }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const AC = window.AudioContext || window.webkitAudioContext, ac = new AC(), an = ac.createAnalyser();
    an.fftSize = 1024; ac.createMediaStreamSource(stream).connect(an);
    const buf = new Float32Array(an.fftSize); let over = 0;
    const stop = () => { stream.getTracks().forEach(t => t.stop()); ac.close(); blow.level = 0; };
    const tick = () => {
      if (blow.done) { stop(); return; }
      an.getFloatTimeDomainData(buf);
      let sum = 0; for (let k = 0; k < buf.length; k++) sum += buf[k] * buf[k];
      const rms = Math.sqrt(sum / buf.length);
      blow.level = Math.min(1, rms * 7); meter.firstElementChild.style.width = (blow.level * 100) + '%';
      over = rms > 0.08 ? over + 1 : Math.max(0, over - 2);
      if (over > 14) { stop(); blowOut(); } else requestAnimationFrame(tick);
    };
    tick();
  } catch (err) {
    if (blow.resume) { blow.resume = false; audio.play().catch(() => {}); }
    showCard('Make a wish', "The microphone isn't available here, so tap instead.", [{ label: 'Tap to blow', primary: true, fn: blowOut }]);
  }
}
function blowOut() {
  if (blow.done) return;
  blow.done = true; blow.level = 0;
  if (blow.resume) { blow.resume = false; setTimeout(() => audio.play().catch(() => {}), 600); }
  cakeFlames.forEach(f => { f.visible = false; });
  cakeLight.base = 0.15;
  say('Happy birthday, Aida! Your wish is safe with me.');
  showCard('Wish made', '', [{ label: 'Next', primary: true, fn: () => runStep(tour.i + 1) }]);
}

/* ---------- the guided tour (draft lines, to be replaced) ---------- */
const TOUR = [
  { dog: DOG_HOME, home: true, title: 'Hi Aida!', line: "Woof! I'm your guide today. Let me show you around, then the room is all yours.", next: "Let's go" },
  { dog: [2.95, 1.75], obj: cake, view: { dist: 1.7, dir: [0.35, 0.8, 1] }, title: 'Make a wish', line: 'First, the cake. Make a wish, then blow out the candles. Really blow, right into your phone!', blow: true },
  { dog: [2.45, 1.0], obj: photoWall, title: 'Our photo wall', line: 'Every photo up here is a little piece of the two of you.' },
  { dog: [2.4, 1.05], obj: bar, title: 'The record player', line: 'Pick a song. Any song.' },
  { dog: [3.3, 1.4], obj: frame, view: { dist: 1.5, dir: [0.15, 0.55, 1] }, title: 'Your desk', line: 'Your books, your snowdrops, and a photo of you two.' },
  { dog: [3.95, 2.3], obj: tv, title: 'Movie night', line: 'Your favourite scenes, ready whenever you are.' },
  { dog: [2.45, 1.95], obj: gift, extra: 'bed', view: { dist: 1.7, dir: [0.35, 0.85, 0.9] }, title: 'Something on the bed', line: 'A TWICE album, and a mysterious box. Open the box. Trust me.' },
  { dog: [1.1, 3.25], obj: snackSpot, title: 'The snack corner', line: 'Want Want, beef jerky, mămăligă. Everything you like.' },
  { dog: [2.45, 1.0], obj: cab, title: 'Little things from everywhere', line: 'A snow globe, a music box, Paris and Québec. Look closely.' },
  { dog: DOG_HOME, home: true, title: "That's the tour!", line: 'The room is yours now. Tap anything that sparkles, drag to look around, double-tap to get closer.', next: 'Explore on my own' },
];
const tour = { active: false, i: 0 };
let toured = false; try { toured = localStorage.getItem('room-toured') === '1'; } catch (e) {}
function runStep(i) {
  tour.i = i; const st = TOUR[i];
  hush(); hideCard();
  walkDog(st.dog, () => say(st.line));
  if (st.home) flyHome(); else frameView(st.obj, st.view || st.obj.userData.hotspot.view);
  stopVideo();
  const exId = st.extra || st.obj?.userData.hotspot?.id, ex = EXTRAS[exId] ? EXTRAS[exId]() : {};
  const acts = [...(ex.actions || [])];
  if (st.blow && !blow.done) {
    acts.push({ label: 'Blow with my mic', primary: true, fn: listenForBlow }, { label: 'Tap to blow', fn: blowOut });
  } else {
    if (i > 0) acts.push({ label: 'Back', fn: () => runStep(i - 1) });
    acts.push({ label: st.next || 'Next', primary: true, fn: () => (i < TOUR.length - 1 ? runStep(i + 1) : endTour()) });
  }
  if (i === 0 && toured) acts.push({ label: 'Skip the tour', fn: endTour });
  setTimeout(() => showCard(st.title, '', acts, ex.body), 700);
}
function endTour() {
  tour.active = false; sparklesOn = true; hideCard();
  walkDog(DOG_HOME, () => say('Tap me any time for a hint.'));
  setTimeout(hush, 6000);
  flyHome();
  try { localStorage.setItem('room-toured', '1'); } catch (e) {}
}
function startTour() { onDog(() => { tour.active = true; runStep(0); }); }

/* ---------- the front door ---------- */
const porch = document.getElementById('porch');
let porchR = null, porchScene, porchCam; const porchDogs = [];
{
  porchR = new THREE.WebGLRenderer({ canvas: document.getElementById('porchDogs'), alpha: true, antialias: true });
  porchR.setPixelRatio(Math.min(devicePixelRatio, 2));
  porchR.outputColorSpace = THREE.SRGBColorSpace; porchR.toneMapping = THREE.ACESFilmicToneMapping;
  porchScene = new THREE.Scene();
  porchScene.add(new THREE.HemisphereLight('#FFE6CC', '#3A2418', 1.6));
  const d = new THREE.DirectionalLight('#FFD2A0', 2.4); d.position.set(0.3, 1, 2); porchScene.add(d);
  porchCam = new THREE.OrthographicCamera(0, 1, 0, -1, -2000, 2000);
  onDog(() => {
    ['spotL', 'spotR'].forEach((id, i) => {
      const p = new THREE.Group(); p.add(dogModel.clone());
      p.userData = { el: document.getElementById(id), side: i ? -1 : 1, seed: i * 2 };
      porchScene.add(p); porchDogs.push(p);
    });
    sizePorch();
  });
}
function sizePorch() {
  if (!porchR) return;
  porchR.setSize(innerWidth, innerHeight);
  Object.assign(porchCam, { left: 0, right: innerWidth, top: 0, bottom: -innerHeight }); porchCam.updateProjectionMatrix();
  porchDogs.forEach(p => {
    const r = p.userData.el.getBoundingClientRect();
    p.scale.setScalar(r.height / 0.8);
    p.position.set(r.left + r.width / 2, -r.bottom, 0);
    p.rotation.set(0.28, p.userData.side * 0.75, 0);
  });
}
const snowCv = document.getElementById('porchSnow'), snowCtx = snowCv.getContext('2d');
const flakes = Array.from({ length: 150 }, () => ({ x: Math.random(), y: Math.random(), r: 0.8 + Math.random() * 2.4, v: 0.02 + Math.random() * 0.05, d: Math.random() * 6 }));
function sizeSnow() { snowCv.width = innerWidth * devicePixelRatio; snowCv.height = innerHeight * devicePixelRatio; }
sizeSnow();
function drawSnow(t, dt) {
  const w = snowCv.width, h = snowCv.height, k = devicePixelRatio;
  snowCtx.clearRect(0, 0, w, h);
  flakes.forEach(f => {
    if (!reduceMotion) { f.y += f.v * dt; f.x += Math.sin(t * 0.7 + f.d) * 0.0004; if (f.y > 1.02) { f.y = -0.02; f.x = Math.random(); } }
    snowCtx.globalAlpha = 0.55 + f.r / 6; snowCtx.fillStyle = '#fff';
    snowCtx.beginPath(); snowCtx.arc(f.x * w, f.y * h, f.r * k, 0, Math.PI * 2); snowCtx.fill();
  });
}
let entering = false, roomVisible = false;
document.getElementById('door').addEventListener('click', () => {
  if (entering) return; entering = true; roomVisible = true;
  playSong(TWICE_SONG, 'bg');
  const stage = document.getElementById('stage'), r = document.getElementById('door').getBoundingClientRect();
  stage.style.transformOrigin = `${r.left + r.width / 2}px ${r.top + r.height * 0.55}px`;
  porch.classList.add('opening');
  setTimeout(() => porch.classList.add('zoom'), 1150);
  setTimeout(() => { porch.classList.add('gone'); startTour(); }, 2250);
  setTimeout(() => { porch.remove(); porchR.dispose(); porchR.forceContextLoss(); porchR = null; }, 3300);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (porchR) { sizePorch(); sizeSnow(); }
});
camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
camera.position.copy(HOME_TARGET).addScaledVector(HOME_DIR, homeDistance());

/* ---------- loop ---------- */
const clock = new THREE.Clock(), tmp = new THREE.Vector3(), shift = new THREE.Vector3();
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function frame_() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;

  if (porchR) {
    drawSnow(t, dt);
    porchDogs.forEach(p => { p.children[0].position.y = Math.abs(Math.sin(t * 1.4 + p.userData.seed)) * 0.006; });
    porchR.render(porchScene, porchCam);
  }

  if (!reduceMotion) {
    const p = snowGeo.attributes.position.array;
    for (let i = 0; i < SNOW; i++) {
      p[i * 3 + 1] -= snowSpeed[i] * dt;
      p[i * 3] += Math.sin(t * 0.8 + i) * 0.0009;
      if (p[i * 3 + 1] < 0) p[i * 3 + 1] = H - 0.15;
    }
    snowGeo.attributes.position.needsUpdate = true;
    flickers.forEach(f => {
      const n = Math.sin(t * 9 + f.seed) * 0.5 + Math.sin(t * 23 + f.seed * 2) * 0.3 + Math.sin(t * 3.1 + f.seed) * 0.2;
      if (f.l) f.l.intensity = f.base * (1 + n * (f.soft ? 0.03 : 0.12));
      if (f.fl) {
        const lean = f.cake ? blow.level : 0;
        f.fl.scale.set(1 - n * 0.08, (2 + n * 0.25) * (1 - lean * 0.55), 1 - n * 0.08);
        f.fl.rotation.z = lean * 0.6;
      }
    });
    curtains.forEach((c, i) => { c.rotation.y = Math.sin(t * 0.6 + i) * 0.02; });
  }

  const spinning = media.source === 'vinyl' && media.track && !audio.paused;
  if (spinning) platter.rotation.y -= dt * 3.4;
  arm.rotation.y += ((spinning ? ARM_PLAY : 0) - arm.rotation.y) * Math.min(1, dt * 3);
  giftLid.position.y += ((giftOpen ? 0.42 : 0.21) - giftLid.position.y) * Math.min(1, dt * 4);
  giftLid.rotation.z += ((giftOpen ? 0.55 : 0) - giftLid.rotation.z) * Math.min(1, dt * 4);

  // the dog walks its path, then turns three-quarters toward the camera
  let walking = false;
  if (dogState.path.length) {
    const [tx, tz] = dogState.path[0], dx = tx - dogState.x, dz = tz - dogState.z, d = Math.hypot(dx, dz), step = 1.1 * dt;
    walking = true;
    dogState.heading = angleLerp(dogState.heading, Math.atan2(dx, dz), Math.min(1, dt * 8));
    if (d <= step) {
      dogState.x = tx; dogState.z = tz; dogState.path.shift();
      if (!dogState.path.length && dogState.onArrive) { const f = dogState.onArrive; dogState.onArrive = null; f(); }
    } else { dogState.x += dx / d * step; dogState.z += dz / d * step; }
  } else {
    const face = Math.atan2(camera.position.x - dogState.x, camera.position.z - dogState.z) + 0.8;
    dogState.heading = angleLerp(dogState.heading, face + Math.sin(t * 0.5) * 0.1, Math.min(1, dt * 2));
  }
  const bob = walking ? Math.abs(Math.sin(t * 10)) * 0.022 : Math.abs(Math.sin(t * 1.6)) * 0.007;
  dogPivot.position.set(dogState.x, 0.02 + bob, dogState.z);
  dogPivot.rotation.y = dogState.heading;

  sparkles.forEach(s => {
    s.sp.visible = sparklesOn;
    if (!sparklesOn) return;
    if (!s.anchor || s.group === dogPivot) { const b = new THREE.Box3().setFromObject(s.group); s.anchor = new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2); }
    s.sp.position.set(s.anchor.x, s.anchor.y + s.dy + Math.sin(t * 2 + s.seed) * 0.02, s.anchor.z);
    s.sp.scale.setScalar(0.11 + (Math.sin(t * 3 + s.seed) * 0.5 + 0.5) * 0.06);
    s.sp.material.rotation = t * 0.4 + s.seed;
  });

  if (tween) {
    const k = Math.min((performance.now() - tween.start) / tween.ms, 1), e = ease(k);
    camera.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.t0, tween.t1, e);
    if (k >= 1) tween = null;
  }
  controls.update();
  // keep panning inside the room
  const tg = controls.target;
  shift.set(THREE.MathUtils.clamp(tg.x, -0.2, W + 0.2) - tg.x, THREE.MathUtils.clamp(tg.y, 0, H) - tg.y, THREE.MathUtils.clamp(tg.z, -0.1, D + 0.3) - tg.z);
  if (shift.lengthSq() > 0) { tg.add(shift); camera.position.add(shift); }

  if (bubbleOn) {
    tmp.set(dogPivot.position.x, 0.95, dogPivot.position.z).project(camera);
    const onScreen = Math.abs(tmp.x) < 0.95 && tmp.y < 0.9 && tmp.y > -0.6 && tmp.z < 1;
    bubble.classList.toggle('floating', !onScreen);
    bubble.style.left = (onScreen ? THREE.MathUtils.clamp((tmp.x * 0.5 + 0.5) * innerWidth, 150, innerWidth - 150) : innerWidth / 2) + 'px';
    bubble.style.top = (onScreen ? Math.max(135, (-tmp.y * 0.5 + 0.5) * innerHeight) : 140) + 'px';
  }
  if (roomVisible) renderer.render(scene, camera);
  requestAnimationFrame(frame_);
}
requestAnimationFrame(frame_);
window.__room = { audio, video, playSong, SONGS, playClip, CLIPS, camera, controls, scene, focusOn, hotspots, goHome, runStep, blowOut, tour, enter: () => document.getElementById('door').click() };
