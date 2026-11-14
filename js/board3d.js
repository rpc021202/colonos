// Tablero 3D estilo diorama (Three.js). Solo dibuja: recibe el tablero estático y el estado público.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RINFO } from './engine.js';

const TOP = 0.16; // altura de la superficie de las casillas
const rand = (a, b) => a + Math.random() * (b - a);
const C = (hex) => new THREE.Color(hex);

/* ---------- utilidades de geometría con color por vértice ---------- */
function paint(geo, color, matrix) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  if (matrix) g.applyMatrix4(matrix);
  const col = C(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
function M(x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  return m;
}
function merged(list, mat) {
  const g = mergeGeometries(list, false);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
const G_BOX = new THREE.BoxGeometry(1, 1, 1);
const G_CONE5 = new THREE.ConeGeometry(1, 1, 5);
const G_CONE6 = new THREE.ConeGeometry(1, 1, 6);
const G_CONE7 = new THREE.ConeGeometry(1, 1, 7);
const G_CONE4 = new THREE.ConeGeometry(1, 1, 4);
const G_CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6);
const G_CYL10 = new THREE.CylinderGeometry(1, 1, 1, 10);
const G_ICO = new THREE.IcosahedronGeometry(1, 0);
const G_DOD = new THREE.DodecahedronGeometry(1, 0);
const G_SPH = new THREE.SphereGeometry(1, 8, 6);
const TOKEN_GEO = new THREE.CylinderGeometry(0.27, 0.27, 0.05, 32);
const TOKEN_MAT = new THREE.MeshStandardMaterial({ color: '#efe2c2', roughness: 0.8 });
const TOKEN_FACE = new THREE.CircleGeometry(0.26, 32);
const prism = (() => { // prisma triangular para tejados (base 1x1, alto 1, largo 1 en z)
  const s = new THREE.Shape(); s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.lineTo(-0.5, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5); return g;
})();

// posiciones repartidas en el anillo de una casilla, sin pisar el centro (donde va la ficha del número)
function scatter(n, rMin, rMax, minDist) {
  const pts = [];
  for (let t = 0; t < n * 40 && pts.length < n; t++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(rand(rMin * rMin, rMax * rMax));
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!insideHex(x, z, 0.86)) continue;
    if (pts.some((p) => Math.hypot(p.x - x, p.z - z) < minDist)) continue;
    pts.push({ x, z });
  }
  return pts;
}
function insideHex(x, z, r) { // hexágono con vértices arriba/abajo (pointy-top), radio r
  const ax = Math.abs(x), az = Math.abs(z);
  return ax <= r * 0.866 && az <= r - ax * 0.577;
}

/* ---------- terrenos ---------- */
const TERRAIN = {
  wood: { top: '#4f8a3a', side: '#6b4a2b' },
  sheep: { top: '#8cc25a', side: '#6b4a2b' },
  wheat: { top: '#d7b24a', side: '#7a5a2e' },
  brick: { top: '#b8693f', side: '#6e3c22' },
  ore: { top: '#8a929a', side: '#5d6168' },
  desert: { top: '#e2cf98', side: '#a8925c' },
};
function buildFeatures(res) {
  const L = [];
  if (res === 'wood') {
    scatter(13, 0.36, 0.82, 0.19).forEach((p) => {
      const s = rand(0.8, 1.25), g = ['#2e6b2f', '#3d7d36', '#24592a', '#4a8a3c'][Math.floor(Math.random() * 4)];
      L.push(paint(G_CYL6, '#6b4a2b', M(p.x, TOP + 0.04 * s, p.z, 0.025 * s, 0.08 * s, 0.025 * s)));
      L.push(paint(G_CONE6, g, M(p.x, TOP + 0.14 * s, p.z, 0.12 * s, 0.2 * s, 0.12 * s, Math.random())));
      L.push(paint(G_CONE6, g, M(p.x, TOP + 0.24 * s, p.z, 0.09 * s, 0.17 * s, 0.09 * s, Math.random())));
      L.push(paint(G_CONE6, g, M(p.x, TOP + 0.33 * s, p.z, 0.055 * s, 0.13 * s, 0.055 * s, Math.random())));
    });
    scatter(4, 0.32, 0.8, 0.15).forEach((p) => L.push(paint(G_ICO, '#3f7a35', M(p.x, TOP + 0.03, p.z, 0.06, 0.045, 0.06))));
  } else if (res === 'sheep') {
    scatter(5, 0.38, 0.74, 0.2).forEach((p) => {
      const ry = Math.random() * Math.PI * 2, c = Math.cos(ry), s = Math.sin(ry);
      L.push(paint(G_ICO, '#f6f3ea', M(p.x, TOP + 0.075, p.z, 0.1, 0.075, 0.075, ry)));
      L.push(paint(G_BOX, '#2b2622', M(p.x + c * 0.1, TOP + 0.09, p.z - s * 0.1, 0.05, 0.05, 0.045, ry)));
      [[-0.05, -0.035], [-0.05, 0.035], [0.05, -0.035], [0.05, 0.035]].forEach(([dx, dz]) =>
        L.push(paint(G_BOX, '#2b2622', M(p.x + c * dx + s * dz, TOP + 0.02, p.z - s * dx + c * dz, 0.018, 0.04, 0.018, ry))));
    });
    // valla
    const fa = Math.random() * Math.PI * 2;
    for (let i = 0; i < 5; i++) {
      const a = fa + i * 0.22, r = 0.7, x = Math.cos(a) * r, z = Math.sin(a) * r;
      L.push(paint(G_BOX, '#8a6239', M(x, TOP + 0.05, z, 0.025, 0.1, 0.025)));
      if (i < 4) {
        const a2 = a + 0.11, x2 = Math.cos(a2) * r, z2 = Math.sin(a2) * r;
        L.push(paint(G_BOX, '#a77a4a', M(x2, TOP + 0.07, z2, 0.16, 0.018, 0.015, -a2 + Math.PI / 2)));
        L.push(paint(G_BOX, '#a77a4a', M(x2, TOP + 0.035, z2, 0.16, 0.018, 0.015, -a2 + Math.PI / 2)));
      }
    }
    scatter(10, 0.3, 0.84, 0.08).forEach((p) => L.push(paint(G_ICO, Math.random() < 0.5 ? '#f2e35b' : '#ffffff', M(p.x, TOP + 0.01, p.z, 0.018, 0.018, 0.018))));
  } else if (res === 'wheat') {
    const rot = (Math.random() * Math.PI) / 3;
    for (let i = -5; i <= 5; i++) {
      const off = i * 0.13;
      for (const side of [-1, 1]) {
        // surco de un lado al otro, dejando un hueco en el centro para la ficha
        const pts = [];
        for (let t = 0.0; t <= 0.9; t += 0.03) { const x = side * t, z = off; const rx = x * Math.cos(rot) - z * Math.sin(rot), rz = x * Math.sin(rot) + z * Math.cos(rot); if (insideHex(rx, rz, 0.84) && Math.hypot(rx, rz) > 0.36) pts.push([rx, rz]); }
        if (pts.length < 2) continue;
        const [a, b] = [pts[0], pts[pts.length - 1]], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        L.push(paint(G_BOX, i % 2 ? '#e8c75a' : '#c9a23a', M((a[0] + b[0]) / 2, TOP + 0.035, (a[1] + b[1]) / 2, len, 0.07, 0.06, -rot)));
      }
    }
    scatter(3, 0.45, 0.75, 0.25).forEach((p) => L.push(paint(G_CYL10, '#f0d27a', M(p.x, TOP + 0.13, p.z, 0.075, 0.13, 0.075, Math.random() * 3, 0, Math.PI / 2))));
  } else if (res === 'brick') {
    // cantera: muros escalonados a un lado, barro y pilas de ladrillos
    const a0 = Math.random() * Math.PI * 2;
    for (let k = 0; k < 3; k++) {
      const a = a0 + (k - 1) * 0.55, r = 0.62, x = Math.cos(a) * r, z = Math.sin(a) * r;
      L.push(paint(G_BOX, '#a4532f', M(x, TOP + 0.09, z, 0.3, 0.18, 0.22, -a)));
      L.push(paint(G_BOX, '#c0663b', M(x * 0.85, TOP + 0.04, z * 0.85, 0.26, 0.08, 0.2, -a)));
    }
    scatter(3, 0.4, 0.7, 0.2).forEach((p) => L.push(paint(G_CYL10, '#5b3a25', M(p.x, TOP + 0.005, p.z, rand(0.08, 0.13), 0.012, rand(0.06, 0.1), Math.random() * 3))));
    scatter(2, 0.42, 0.72, 0.26).forEach((p) => {
      const ry = Math.random() * 3;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++)
        L.push(paint(G_BOX, j % 2 ? '#b5482b' : '#c4552f', M(p.x + Math.cos(ry) * (j - (2 - i) / 2) * 0.055, TOP + 0.02 + i * 0.035, p.z - Math.sin(ry) * (j - (2 - i) / 2) * 0.055, 0.05, 0.03, 0.1, ry)));
    });
  } else if (res === 'ore') {
    const a0 = Math.random() * Math.PI * 2;
    [[0, 0.5, 0.72, 0.3], [2.1, 0.52, 0.55, 0.26], [4.2, 0.5, 0.62, 0.28]].forEach(([da, r, h, w], i) => {
      const a = a0 + da + rand(-0.3, 0.3), x = Math.cos(a) * r, z = Math.sin(a) * r, geo = [G_CONE5, G_CONE6, G_CONE7][i];
      const ry = Math.random() * 3;
      L.push(paint(geo, ['#7d858d', '#6f777f', '#8d949b'][i], M(x, TOP + h / 2, z, w, h, w, ry)));
      L.push(paint(geo, '#f4f6f8', M(x, TOP + h * 0.86, z, w * 0.3, h * 0.29, w * 0.3, ry)));
    });
    scatter(5, 0.34, 0.8, 0.13).forEach((p) => L.push(paint(G_DOD, '#7a8189', M(p.x, TOP + 0.02, p.z, 0.05, 0.04, 0.05, Math.random() * 3))));
  } else if (res === 'desert') {
    scatter(4, 0.38, 0.75, 0.3).forEach((p) => L.push(paint(G_SPH, '#d9c184', M(p.x, TOP, p.z, rand(0.16, 0.24), 0.07, rand(0.1, 0.16), Math.random() * 3))));
    scatter(2, 0.45, 0.72, 0.3).forEach((p) => {
      L.push(paint(G_CYL6, '#5c8a3a', M(p.x, TOP + 0.11, p.z, 0.035, 0.22, 0.035)));
      L.push(paint(G_CYL6, '#5c8a3a', M(p.x + 0.05, TOP + 0.13, p.z, 0.022, 0.1, 0.022)));
      L.push(paint(G_CYL6, '#5c8a3a', M(p.x - 0.05, TOP + 0.1, p.z, 0.022, 0.08, 0.022)));
    });
  }
  return L;
}

/* ---------- texturas ---------- */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const numTex = {};
function tokenTex(n) {
  if (numTex[n]) return numTex[n];
  const red = n === 6 || n === 8;
  return (numTex[n] = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f5ead0'; g.fillRect(0, 0, w, h);
    g.fillStyle = red ? '#c62828' : '#2b2118';
    g.font = '700 118px Fredoka, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(n), w / 2, h / 2 - 12);
    const d = 6 - Math.abs(7 - n);
    for (let i = 0; i < d; i++) { g.beginPath(); g.arc(w / 2 + (i - (d - 1) / 2) * 22, h / 2 + 62, 8, 0, Math.PI * 2); g.fill(); }
  }));
}
const cloudTex = canvasTex(128, 128, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
function labelTex(text, sub) {
  return canvasTex(256, 160, (g, w, h) => {
    g.fillStyle = 'rgba(247,237,211,0.96)'; g.strokeStyle = '#8b6b3e'; g.lineWidth = 8;
    const r = 34; g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, r); g.fill(); g.stroke();
    g.fillStyle = '#2b2118'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (sub) { g.font = '72px system-ui, sans-serif'; g.fillText(text, w / 2 - 50, h / 2 + 4); g.font = '700 54px Fredoka, system-ui, sans-serif'; g.fillText(sub, w / 2 + 52, h / 2 + 4); }
    else { g.font = '700 70px Fredoka, system-ui, sans-serif'; g.fillText(text, w / 2, h / 2 + 4); }
  });
}
function textSprite(text, size = 0.5, color = '#fff') {
  const t = canvasTex(512, 160, (g, w, h) => {
    g.font = '700 96px Fredoka, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 14; g.strokeStyle = 'rgba(0,0,0,.55)'; g.strokeText(text, w / 2, h / 2); g.fillStyle = color; g.fillText(text, w / 2, h / 2);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false }));
  s.scale.set(size * 3.2, size, 1); s.renderOrder = 10;
  return s;
}
function dieFaceTex(n) {
  const map = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  return canvasTex(128, 128, (g, w) => {
    g.fillStyle = '#fbf7ee'; g.fillRect(0, 0, w, w);
    g.fillStyle = '#2b2118';
    map[n].forEach((i) => { const cx = 28 + (i % 3) * 36, cy = 28 + Math.floor(i / 3) * 36; g.beginPath(); g.arc(cx, cy, 11, 0, Math.PI * 2); g.fill(); });
  });
}

/* ---------- piezas ---------- */
function shade(hex, k) { const c = C(hex); c.multiplyScalar(k); return '#' + c.getHexString(); }
function settlementMesh(color) {
  const dark = shade(color, 0.62);
  const L = [
    paint(G_BOX, color, M(0, 0.07, 0, 0.17, 0.14, 0.15)),
    paint(prism, dark, M(0, 0.14, 0, 0.21, 0.1, 0.17)),
    paint(G_BOX, '#6b625a', M(0.05, 0.22, -0.03, 0.03, 0.08, 0.03)),
    paint(G_BOX, '#3b2a1e', M(0, 0.045, 0.076, 0.045, 0.08, 0.005)),
    paint(G_BOX, '#fff2b0', M(-0.05, 0.085, 0.076, 0.03, 0.03, 0.004)),
  ];
  return merged(L, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7 }));
}
function cityMesh(color) {
  const dark = shade(color, 0.62);
  const L = [
    paint(G_BOX, color, M(-0.03, 0.07, 0.02, 0.3, 0.14, 0.17)),
    paint(prism, dark, M(-0.06, 0.14, 0.02, 0.22, 0.09, 0.19)),
    paint(G_BOX, color, M(0.1, 0.15, -0.03, 0.12, 0.3, 0.12)),
    paint(G_CONE4, dark, M(0.1, 0.36, -0.03, 0.1, 0.13, 0.1, Math.PI / 4)),
    paint(G_BOX, '#3b2a1e', M(-0.07, 0.045, 0.106, 0.05, 0.09, 0.005)),
    paint(G_BOX, '#fff2b0', M(0.1, 0.2, 0.031, 0.03, 0.04, 0.004)),
    paint(G_BOX, '#fff2b0', M(0.03, 0.08, 0.106, 0.03, 0.03, 0.004)),
  ];
  return merged(L, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7 }));
}
function roadMesh(color, len) {
  const L = [];
  const n = 6, step = len / n;
  for (let i = 0; i < n; i++) L.push(paint(G_BOX, i % 2 ? color : shade(color, 0.85), M(-len / 2 + step * (i + 0.5), 0.035, 0, step * 0.82, 0.04, 0.11, 0, 0, rand(-0.04, 0.04))));
  L.push(paint(G_BOX, '#5a3f2a', M(0, 0.012, -0.045, len, 0.025, 0.02)));
  L.push(paint(G_BOX, '#5a3f2a', M(0, 0.012, 0.045, len, 0.025, 0.02)));
  return merged(L, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 }));
}
function robberMesh() {
  const pts = [[0, 0], [0.12, 0], [0.12, 0.03], [0.08, 0.05], [0.1, 0.18], [0.075, 0.27], [0.05, 0.3], [0, 0.31]].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.LatheGeometry(pts, 10);
  const L = [paint(body, '#3a3633'), paint(G_SPH, '#3a3633', M(0, 0.36, 0, 0.075, 0.08, 0.075)), paint(G_CONE6, '#2a2624', M(0, 0.42, -0.01, 0.085, 0.14, 0.085, 0, -0.2))];
  const g = merged(L, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6 }));
  const eyeM = new THREE.MeshBasicMaterial({ color: '#ff4a3a' });
  [-0.025, 0.025].forEach((x) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), eyeM); e.position.set(x, 0.37, 0.068); g.add(e); });
  return g;
}

/* ---------- clase principal ---------- */
export class Board3D {
  constructor(el) {
    this.el = el;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    el.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = C('#9fd0e6');
    this.scene.fog = new THREE.Fog('#9fd0e6', 18, 48);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minDistance = 3; this.controls.maxDistance = 40;
    this.controls.addEventListener('start', () => { this.userMoved = performance.now(); });
    const hemi = new THREE.HemisphereLight('#fff6e0', '#3b5a6b', 1.1);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
    sun.position.set(-6, 12, 7); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
    this.sun = sun; this.scene.add(sun); this.scene.add(sun.target);
    this.anims = []; this.clock = new THREE.Clock();
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.followTurn = true; this.userMoved = 0;
    this.resize(); addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(() => this.tick());
  }
  resize() {
    const w = this.el.clientWidth || innerWidth, h = this.el.clientHeight || innerHeight;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  tween(dur, fn, done) { this.anims.push({ t: 0, dur, fn, done }); }
  tick() {
    const dt = Math.min(0.05, this.clock.getDelta()), time = this.clock.elapsedTime;
    this.anims = this.anims.filter((a) => { a.t += dt; const k = Math.min(1, a.t / a.dur); a.fn(k, dt); if (k >= 1) { a.done && a.done(); return false; } return true; });
    if (this.ocean) {
      const p = this.ocean.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, Math.sin(x * 0.9 + time * 1.1) * 0.035 + Math.cos(y * 1.1 + time * 0.8) * 0.035); }
      p.needsUpdate = true; this.ocean.geometry.computeVertexNormals();
    }
    if (this.fog) this.fog.forEach((s) => { s.material.rotation += s.userData.spin * dt; s.position.x = s.userData.bx + Math.sin(time * 0.3 + s.userData.ph) * 0.12; s.position.z = s.userData.bz + Math.cos(time * 0.25 + s.userData.ph) * 0.1; });
    if (this.robber) this.robber.rotation.y = Math.sin(time * 0.8) * 0.4;
    if (this.tokens && this.tokens.length) { const az = Math.atan2(this.camera.position.x - this.controls.target.x, this.camera.position.z - this.controls.target.z); this.tokens.forEach((t) => (t.rotation.y = az)); }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
  clear() {
    this.root.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose?.(); });
    this.scene.remove(this.root); this.root = new THREE.Group(); this.scene.add(this.root);
    this.tiles = []; this.pieces = { v: {}, e: {} }; this.fog = []; this.robber = null; this.dice = null; this.ocean = null; this.tokens = []; this.ports = [];
  }
  setBoard(B, opts = {}) {
    this.clear(); this.B = B;
    const ex = B.hexes.reduce((m, h) => Math.max(m, Math.abs(h.x), Math.abs(h.y)), 0) + 1.6;
    this.extent = ex;
    // océano
    const og = new THREE.PlaneGeometry(ex * 6, ex * 6, 70, 70);
    this.ocean = new THREE.Mesh(og, new THREE.MeshStandardMaterial({ color: '#2f86b5', roughness: 0.35, metalness: 0.05, flatShading: true }));
    this.ocean.rotation.x = -Math.PI / 2; this.ocean.position.y = -0.17; this.ocean.receiveShadow = true;
    this.root.add(this.ocean);
    // aguas poco profundas alrededor de la isla
    const shallow = new THREE.MeshStandardMaterial({ color: '#56b3cf', roughness: 0.4, transparent: true, opacity: 0.8 });
    const sg = new THREE.CylinderGeometry(1, 1, 0.04, 6); sg.userData.shared = true;
    B.sea.forEach((s) => { const m = new THREE.Mesh(sg, shallow); m.position.set(s.x, -0.08, s.y); this.root.add(m); });
    // casillas
    const vmat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
    this.vmat = vmat;
    this.tiles = B.hexes.map((h) => {
      const g = new THREE.Group(); g.position.set(h.x, 0, h.y);
      const T = TERRAIN[h.res];
      const base = merged([
        paint(G_CYL6, T.side, M(0, -0.12, 0, 1, 0.5, 1)),
        paint(G_CYL6, T.top, M(0, TOP - 0.02, 0, 0.985, 0.04, 0.985)),
        paint(G_CYL6, shade(T.top, 0.88), M(0, TOP - 0.035, 0, 1, 0.03, 1)),
      ], vmat);
      g.add(base);
      const feat = merged(buildFeatures(h.res), vmat);
      feat.rotation.y = Math.floor(Math.random() * 6) * (Math.PI / 3);
      g.add(feat);
      let token = null;
      if (h.num) {
        // ficha: disco + cara con el número, que gira para mirar siempre a la cámara
        token = new THREE.Group();
        const disc = new THREE.Mesh(TOKEN_GEO, TOKEN_MAT); disc.castShadow = true; disc.receiveShadow = true;
        const face = new THREE.Mesh(TOKEN_FACE, new THREE.MeshStandardMaterial({ map: tokenTex(h.num), roughness: 0.8 }));
        face.rotation.x = -Math.PI / 2; face.position.y = 0.026;
        token.add(disc, face);
        token.position.set(0, TOP + 0.03, 0);
        g.add(token); this.tokens.push(token);
      }
      // brillo al producir
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 0.98, 0.02, 6, 1, true), new THREE.MeshBasicMaterial({ color: '#fff6c2', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      glow.position.y = TOP + 0.05; glow.scale.y = 8; g.add(glow);
      this.root.add(g);
      return { h, g, base, feat, token, glow, hidden: false };
    });
    // puertos
    B.ports.forEach((pt) => {
      const e = B.edges[pt.e], a = B.verts[e.v[0]], b = B.verts[e.v[1]];
      const grp = new THREE.Group();
      const wood = new THREE.MeshStandardMaterial({ color: '#8a6239', roughness: 0.9, flatShading: true });
      [a, b].forEach((v) => {
        const dx = pt.x - v.x, dz = pt.y - v.y, len = Math.hypot(dx, dz);
        const plank = new THREE.Mesh(new THREE.BoxGeometry(len, 0.04, 0.12), wood);
        plank.position.set((v.x + pt.x) / 2, 0.02, (v.y + pt.y) / 2); plank.rotation.y = -Math.atan2(dz, dx); plank.castShadow = true;
        grp.add(plank);
      });
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), wood); post.position.set(pt.x, 0.2, pt.y); grp.add(post);
      const label = pt.type === 'any' ? labelTex('3:1') : labelTex(RINFO[pt.type].e, '2:1');
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: label, transparent: true }));
      sp.position.set(pt.x, 0.62, pt.y); sp.scale.set(0.62, 0.39, 1);
      grp.add(sp); grp.userData.hex = pt.hex;
      this.root.add(grp);
      (this.ports = this.ports || []).push(grp);
    });
    // ladrón
    this.robber = robberMesh(); this.root.add(this.robber);
    this.placeRobber(B.robber !== undefined ? B.robber : (opts.robber || 0), false);
    // dados
    this.dice = [0, 1].map(() => {
      const mats = [1, 6, 2, 5, 3, 4].map((n) => new THREE.MeshStandardMaterial({ map: dieFaceTex(n), roughness: 0.5 }));
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), mats); d.castShadow = true; d.visible = false; this.root.add(d); return d;
    });
    // niebla
    if (opts.fog) this.buildFog(opts.revealed || {});
    // cámara inicial
    this.sun.shadow.camera.left = -ex; this.sun.shadow.camera.right = ex; this.sun.shadow.camera.top = ex; this.sun.shadow.camera.bottom = -ex;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.scene.fog.near = ex * 2.2; this.scene.fog.far = ex * 6;
    this.camDist = ex * 2.05;
    this.controls.maxDistance = ex * 4;
    this.setView(0, false);
  }
  setView(azimuth, animate = true) {
    const pol = 0.82, d = this.camDist;
    const to = new THREE.Vector3(Math.sin(azimuth) * Math.sin(pol) * d, Math.cos(pol) * d, Math.cos(azimuth) * Math.sin(pol) * d);
    if (!animate) { this.camera.position.copy(to); this.controls.target.set(0, 0, 0); return; }
    const from = this.camera.position.clone(), sFrom = new THREE.Spherical().setFromVector3(from), sTo = new THREE.Spherical().setFromVector3(to);
    let dth = sTo.theta - sFrom.theta; while (dth > Math.PI) dth -= 2 * Math.PI; while (dth < -Math.PI) dth += 2 * Math.PI;
    const t0 = this.controls.target.clone();
    this.tween(1.6, (k) => {
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const s = new THREE.Spherical(sFrom.radius + (sTo.radius - sFrom.radius) * e, sFrom.phi + (sTo.phi - sFrom.phi) * e, sFrom.theta + dth * e);
      this.camera.position.setFromSpherical(s);
      this.controls.target.copy(t0).multiplyScalar(1 - e);
    });
  }
  seatView(p, np) { if (!this.followTurn || performance.now() - this.userMoved < 8000) return; this.setView((p / np) * Math.PI * 2); }
  buildFog(revealed) {
    this.fog = [];
    const mat0 = new THREE.SpriteMaterial({ map: cloudTex, color: '#d3dce3', transparent: true, depthWrite: false, opacity: 0.85 });
    this.tiles.forEach((t) => {
      if (revealed[t.h.id]) return;
      t.hidden = true; t.feat.visible = false; if (t.token) t.token.visible = false;
      t.base.visible = false;
      t.clouds = [];
      for (let i = 0; i < 6; i++) {
        const s = new THREE.Sprite(mat0.clone());
        const a = (i / 6) * Math.PI * 2 + rand(-0.3, 0.3), r = i === 0 ? 0 : rand(0.25, 0.45);
        const bx = t.h.x + Math.cos(a) * r, bz = t.h.y + Math.sin(a) * r, sc = rand(1.0, 1.45);
        s.position.set(bx, rand(0.08, 0.38), bz); s.scale.set(sc, sc, 1);
        s.material.rotation = Math.random() * 6; s.material.opacity = rand(0.75, 0.95);
        s.userData = { bx, bz, ph: Math.random() * 6, spin: rand(-0.08, 0.08) };
        this.root.add(s); this.fog.push(s); t.clouds.push(s);
      }
    });
    this.updatePortsVisibility();
  }
  updatePortsVisibility() { (this.ports || []).forEach((p) => (p.visible = !this.tiles[p.userData.hex].hidden)); }
  revealHexes(ids) {
    ids.forEach((id, n) => {
      const t = this.tiles[id];
      if (!t || !t.hidden) return;
      t.hidden = false; t.base.visible = true; t.feat.visible = true; if (t.token) t.token.visible = true;
      t.g.scale.set(1, 0.01, 1);
      this.tween(0.8, (k) => { const e = 1 - Math.pow(1 - k, 3); t.g.scale.set(1, Math.max(0.01, e), 1); });
      const cl = t.clouds || [];
      cl.forEach((s) => { const o0 = s.material.opacity, y0 = s.position.y; this.tween(1.6, (k) => { s.material.opacity = o0 * (1 - k); s.position.y = y0 + k * 1.2; s.scale.multiplyScalar(1 + 0.01); }, () => { this.root.remove(s); this.fog = this.fog.filter((x) => x !== s); }); });
      t.clouds = [];
    });
    this.updatePortsVisibility();
  }
  placeRobber(h, animate = true) {
    const t = this.tiles[h]; if (!t) return;
    const to = new THREE.Vector3(t.h.x + 0.38, TOP, t.h.y + 0.12);
    this.robber.visible = !t.hidden;
    if (!animate) { this.robber.position.copy(to); return; }
    const from = this.robber.position.clone();
    this.tween(0.9, (k) => { const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; this.robber.position.lerpVectors(from, to, e); this.robber.position.y = TOP + Math.sin(k * Math.PI) * 1.2; });
  }
  // sincroniza piezas con el estado público
  syncPieces(s, colors) {
    const B = this.B;
    const seenV = new Set(), seenE = new Set();
    s.buildings.forEach(([v, p, t]) => {
      seenV.add(v);
      const cur = this.pieces.v[v];
      if (cur && cur.userData.t === t && cur.userData.p === p) return;
      if (cur) this.root.remove(cur);
      const m = t === 'c' ? cityMesh(colors[p]) : settlementMesh(colors[p]);
      const V = B.verts[v];
      m.position.set(V.x, TOP, V.y); m.rotation.y = Math.random() * 6; m.userData = { t, p };
      this.root.add(m); this.pieces.v[v] = m; this.drop(m);
    });
    s.roads.forEach(([e, p]) => {
      seenE.add(e);
      if (this.pieces.e[e]) return;
      const E = B.edges[e], a = B.verts[E.v[0]], b = B.verts[E.v[1]];
      const len = Math.hypot(b.x - a.x, b.y - a.y) * 0.66;
      const m = roadMesh(colors[p], len);
      m.position.set((a.x + b.x) / 2, TOP, (a.y + b.y) / 2); m.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
      this.root.add(m); this.pieces.e[e] = m; this.drop(m, true);
    });
    for (const k in this.pieces.v) if (!seenV.has(+k)) { this.root.remove(this.pieces.v[k]); delete this.pieces.v[k]; }
    for (const k in this.pieces.e) if (!seenE.has(+k)) { this.root.remove(this.pieces.e[k]); delete this.pieces.e[k]; }
    const rt = this.tiles[s.robber];
    if (rt && Math.hypot(this.robber.position.x - (rt.h.x + 0.38), this.robber.position.z - (rt.h.y + 0.12)) > 0.01) this.placeRobber(s.robber, !!this.ready);
    this.robber.visible = !(rt && rt.hidden);
  }
  drop(m, road) {
    if (!this.ready) return;
    const y = m.position.y;
    m.scale.setScalar(0.4);
    this.tween(0.7, (k) => {
      const e = k < 0.55 ? (k / 0.55) ** 2 : 1 - Math.abs(Math.sin((k - 0.55) * 7)) * 0.12 * (1 - k);
      m.position.y = y + (1 - Math.min(1, e)) * 1.4; m.scale.setScalar(0.4 + 0.6 * Math.min(1, k * 1.6));
    }, () => { m.position.y = y; m.scale.setScalar(1); this.puff(m.position, road); });
  }
  puff(pos, small) {
    const mat = new THREE.MeshBasicMaterial({ color: '#e9dcc0', transparent: true, opacity: 0.8, depthWrite: false });
    for (let i = 0; i < (small ? 5 : 8); i++) {
      const p = new THREE.Mesh(G_SPH, mat.clone()); const a = (i / 8) * Math.PI * 2;
      p.position.set(pos.x, pos.y + 0.03, pos.z); p.scale.setScalar(0.03); this.root.add(p);
      this.tween(0.6, (k) => { p.position.x = pos.x + Math.cos(a) * k * 0.3; p.position.z = pos.z + Math.sin(a) * k * 0.3; p.position.y = pos.y + 0.03 + k * 0.08; p.scale.setScalar(0.03 + k * 0.06); p.material.opacity = 0.8 * (1 - k); }, () => this.root.remove(p));
    }
  }
  produce(hexes, flows) {
    hexes.forEach((id) => {
      const t = this.tiles[id]; if (!t || t.hidden) return;
      this.tween(1.4, (k) => { t.glow.material.opacity = Math.sin(k * Math.PI) * 0.55; });
      if (t.token) { const y = TOP + 0.03; this.tween(0.6, (k) => { t.token.position.y = y + Math.sin(k * Math.PI) * 0.25; }, () => (t.token.position.y = y)); }
      const sp = textSprite('+' + RINFO[t.h.res].e, 0.42);
      sp.position.set(t.h.x, 0.6, t.h.y); this.root.add(sp);
      this.tween(1.6, (k) => { sp.position.y = 0.6 + k * 0.9; sp.material.opacity = k < 0.7 ? 1 : (1 - k) / 0.3; }, () => this.root.remove(sp));
    });
  }
  // dados que caen junto al tablero, en la zona visible de la cámara
  rollDice(d1, d2) {
    const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.3), hit = new THREE.Vector3();
    ray.setFromCamera(new THREE.Vector2(0.58, -0.45), this.camera);
    if (!ray.ray.intersectPlane(plane, hit)) hit.set(this.extent * 0.6, 0.3, this.extent * 0.4);
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0).normalize();
    const fwd = new THREE.Vector3().subVectors(this.controls.target, this.camera.position).setY(0).normalize();
    const faceQ = { 1: [0, 0, Math.PI / 2], 6: [0, 0, -Math.PI / 2], 2: [0, 0, 0], 5: [Math.PI, 0, 0], 3: [-Math.PI / 2, 0, 0], 4: [Math.PI / 2, 0, 0] };
    [d1, d2].forEach((val, i) => {
      const die = this.dice[i]; die.visible = true;
      const end = hit.clone().add(right.clone().multiplyScalar((i - 0.5) * 0.55)).add(fwd.clone().multiplyScalar(i * 0.12));
      end.y = 0.3 + 0.16;
      const start = end.clone().add(right.clone().multiplyScalar(-2.6)).add(fwd.clone().multiplyScalar(-1.2)); start.y = 2.6;
      const qFace = new THREE.Quaternion().setFromEuler(new THREE.Euler(...faceQ[val]));
      const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28);
      const qEnd = qYaw.multiply(qFace);
      const axis = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(), spins = rand(14, 20);
      this.tween(1.5 + i * 0.12, (k) => {
        const e = 1 - Math.pow(1 - k, 3);
        die.position.lerpVectors(start, end, e);
        const bounce = Math.abs(Math.sin(k * Math.PI * 3.2)) * (1 - k) * 1.3 * (k > 0.25 ? 1 : 0);
        die.position.y = k < 0.25 ? start.y + (end.y - start.y) * (k / 0.25) : end.y + bounce;
        const spin = new THREE.Quaternion().setFromAxisAngle(axis, spins * (1 - e));
        die.quaternion.copy(spin.multiply(qEnd));
      });
    });
    setTimeout(() => {
      const sp = textSprite(String(d1 + d2), 0.9, d1 + d2 === 7 ? '#ff6b5b' : '#fff');
      sp.position.copy(hit).setY(1.1); this.root.add(sp);
      this.tween(2.2, (k) => { sp.position.y = 1.1 + k * 0.4; sp.material.opacity = k < 0.75 ? 1 : (1 - k) / 0.25; }, () => this.root.remove(sp));
    }, 1550);
  }
  // vista previa para la sala de espera: gira despacio
  spin(on) { this.controls.autoRotate = on; this.controls.autoRotateSpeed = 0.6; }
}
