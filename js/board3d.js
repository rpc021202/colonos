// Tablero 3D (Three.js) para la pantalla y para el mapa del móvil.
// Terreno con relieve real por casilla, iluminación con entorno, agua con reflejos, piezas detalladas.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RINFO } from './engine.js';

const TOP = 0.16; // altura del borde de las casillas (donde van caminos y poblados)
const rand = (a, b) => a + Math.random() * (b - a);
const C = (hex) => new THREE.Color(hex);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ---------- ruido ---------- */
let SEED = 1;
function hash(x, y) { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(SEED, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, o = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s / 0.9375; }
const hexD = (x, z) => Math.max(Math.abs(x) / 0.866, Math.abs(z) + Math.abs(x) * 0.577);

/* ---------- geometría ---------- */
function paint(geo, color, matrix) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  if (matrix) g.applyMatrix4(matrix);
  const col = C(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
function jitterColor(geo, amt) { // variación de color por pieza para que nada sea plano
  const c = geo.attributes.color, k = 1 + rand(-amt, amt);
  for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  return geo;
}
function M(x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}
function merged(list, mat) {
  if (!list.length) return new THREE.Group();
  const g = mergeGeometries(list, false); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mat); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}
const G_BOX = new THREE.BoxGeometry(1, 1, 1);
const G_CONE6 = new THREE.ConeGeometry(1, 1, 7);
const G_CONE4 = new THREE.ConeGeometry(1, 1, 4);
const G_CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6);
const G_SIDE = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
const G_CYL8 = new THREE.CylinderGeometry(1, 1, 1, 8);
const G_CYL12 = new THREE.CylinderGeometry(1, 1, 1, 12);
const G_ICO1 = new THREE.IcosahedronGeometry(1, 1);
const G_ICO0 = new THREE.IcosahedronGeometry(1, 0);
const G_DOD = new THREE.DodecahedronGeometry(1, 0);
const G_SPH = new THREE.SphereGeometry(1, 10, 8);
const prism = (() => { const s = new THREE.Shape(); s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.lineTo(-0.5, 0); const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5); return g; })();
const TOKEN_GEO = new THREE.CylinderGeometry(0.26, 0.27, 0.05, 40);
const TOKEN_MAT = new THREE.MeshStandardMaterial({ color: '#efe2c2', roughness: 0.75 });
const TOKEN_FACE = new THREE.CircleGeometry(0.25, 40);

/* ---------- terreno con relieve ---------- */
// Cada casilla tiene una función de altura; el borde siempre vuelve a TOP para encajar con las vecinas.
function makeTerrain(res, wx, wz) {
  const rot = Math.random() * Math.PI * 2;
  const pit = { x: Math.cos(rot) * 0.42, z: Math.sin(rot) * 0.42 };
  const peaks = [0, 1, 2].map((i) => { const a = rot + (i * Math.PI * 2) / 3 + rand(-0.35, 0.35), r = rand(0.46, 0.56); return { x: Math.cos(a) * r, z: Math.sin(a) * r, h: [0.78, 0.6, 0.66][i] * rand(0.9, 1.1), s: rand(0.07, 0.1) }; });
  const N = (x, z, f = 1.6, o = 4) => fbm((wx + x) * f + 31.7, (wz + z) * f + 17.3, o);
  const fieldDir = rot;
  const h = (x, z) => {
    const e = 1 - smooth(0.7, 0.97, hexD(x, z)), r = Math.hypot(x, z), c = smooth(0.2, 0.4, r);
    switch (res) {
      case 'sheep': return TOP + e * c * (N(x, z, 1.4) - 0.5) * 0.2 + e * 0.015;
      case 'wood': return TOP + e * c * (N(x, z, 2) - 0.45) * 0.12;
      case 'wheat': return TOP + e * (N(x, z, 1) - 0.5) * 0.03;
      case 'brick': { const pr = Math.hypot(x - pit.x, z - pit.z); return TOP + e * (-0.11 * (1 - smooth(0.05, 0.42, pr)) + (N(x, z, 3) - 0.5) * 0.04 + 0.02); }
      case 'ore': {
        let y = 0;
        peaks.forEach((p) => { const d2 = (x - p.x) ** 2 + (z - p.z) ** 2; y += p.h * Math.exp(-d2 / p.s); });
        const ridge = 1 - Math.abs(N(x, z, 4, 3) - 0.5) * 2;
        y *= 0.75 + 0.45 * ridge;
        return TOP + e * smooth(0.24, 0.44, r) * y + e * (N(x, z, 5) - 0.5) * 0.04;
      }
      case 'desert': { const u = x * Math.cos(rot) + z * Math.sin(rot); return TOP + e * c * (Math.sin(u * 9 + N(x, z, 2) * 4) * 0.035 + 0.035); }
    }
    return TOP;
  };
  const col = (x, z, y) => {
    const n = N(x, z, 4, 3), dy = y - TOP;
    switch (res) {
      case 'sheep': return C('#6fa543').lerp(C('#a7cf62'), n).lerp(C('#5d8f38'), Math.max(0, -dy * 4));
      case 'wood': return C('#3b6328').lerp(C('#5a7f35'), n);
      case 'wheat': {
        const u = x * Math.cos(fieldDir) + z * Math.sin(fieldDir), band = Math.floor(u * 3.2 + 10) % 3;
        const base = [C('#dcb54c'), C('#c99a33'), C('#b9b04a')][band];
        const row = 0.92 + 0.08 * Math.sin((x * Math.sin(fieldDir) - z * Math.cos(fieldDir)) * 70);
        return base.multiplyScalar(row).lerp(C('#8c7a3a'), n * 0.15);
      }
      case 'brick': return C('#c4744a').lerp(C('#a85a35'), n).lerp(C('#5b2f1c'), smooth(0, 0.08, -dy + 0.02));
      case 'ore': {
        const rock = C('#6e747a').lerp(C('#8b9096'), n);
        if (dy < 0.04) return C('#7b8a68').lerp(rock, smooth(0, 0.04, dy));
        return rock.lerp(C('#f3f5f7'), smooth(0.36 + n * 0.12, 0.46 + n * 0.12, dy));
      }
      case 'desert': return C('#e6d39c').lerp(C('#cdb377'), n);
    }
    return C('#888');
  };
  return { h, col, rot, pit, peaks };
}
function hexTopGeo(n, T) {
  const P = [], Cc = [];
  const K = [...Array(6)].map((_, k) => { const a = (Math.PI / 180) * (60 * k - 30); return [Math.cos(a), Math.sin(a)]; });
  const pt = (B, D, i, j) => [B[0] * (i / n) + D[0] * (j / n), B[1] * (i / n) + D[1] * (j / n)];
  const push = ([x, z]) => { const y = T.h(x, z); P.push(x, y, z); const c = T.col(x, z, y); Cc.push(c.r, c.g, c.b); };
  for (let k = 0; k < 6; k++) {
    const B = K[k], D = K[(k + 1) % 6];
    for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
      push(pt(B, D, i, j)); push(pt(B, D, i, j + 1)); push(pt(B, D, i + 1, j));
      if (i + j < n - 1) { push(pt(B, D, i + 1, j)); push(pt(B, D, i, j + 1)); push(pt(B, D, i + 1, j + 1)); }
    }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
  g = mergeVertices(g, 1e-4); g.computeVertexNormals();
  return g;
}
function scatter(n, rMin, rMax, minDist, avoid) {
  const pts = [];
  for (let t = 0; t < n * 60 && pts.length < n; t++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(rand(rMin * rMin, rMax * rMax));
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (hexD(x, z) > 0.86) continue;
    if (avoid && avoid(x, z)) continue;
    if (pts.some((p) => Math.hypot(p.x - x, p.z - z) < minDist)) continue;
    pts.push({ x, z });
  }
  return pts;
}
function pine(L, x, y, z, s) {
  const g = ['#24502a', '#2e5f2f', '#1f4626', '#356b34'][Math.floor(Math.random() * 4)];
  L.push(paint(G_CYL6, '#5b3d27', M(x, y + 0.04 * s, z, 0.02 * s, 0.09 * s, 0.02 * s)));
  [[0.13, 0.16, 0.12], [0.1, 0.24, 0.13], [0.065, 0.32, 0.12]].forEach(([r, yy, hh]) => L.push(jitterColor(paint(G_CONE6, g, M(x, y + yy * s, z, r * s, hh * s * 1.6, r * s, Math.random() * 3, rand(-0.05, 0.05))), 0.08)));
}
function broadleaf(L, x, y, z, s) {
  const g = ['#4f7f30', '#5e8f36', '#46752b'][Math.floor(Math.random() * 3)];
  L.push(paint(G_CYL6, '#6b4a2b', M(x, y + 0.06 * s, z, 0.022 * s, 0.13 * s, 0.022 * s)));
  L.push(jitterColor(paint(G_ICO1, g, M(x, y + 0.17 * s, z, 0.1 * s, 0.085 * s, 0.1 * s, Math.random() * 3)), 0.1));
  L.push(jitterColor(paint(G_ICO1, g, M(x + 0.04 * s, y + 0.22 * s, z - 0.02 * s, 0.07 * s, 0.06 * s, 0.07 * s)), 0.1));
}
function buildFeatures(res, T) {
  const L = [], hy = (x, z) => T.h(x, z);
  if (res === 'wood') {
    scatter(22, 0.34, 0.86, 0.13).forEach((p) => { const s = rand(0.75, 1.2); (Math.random() < 0.7 ? pine : broadleaf)(L, p.x, hy(p.x, p.z) - 0.01, p.z, s); });
    scatter(6, 0.3, 0.8, 0.1).forEach((p) => L.push(jitterColor(paint(G_ICO1, '#3f6b2c', M(p.x, hy(p.x, p.z) + 0.015, p.z, 0.045, 0.03, 0.045)), 0.15)));
  } else if (res === 'sheep') {
    scatter(6, 0.36, 0.76, 0.16).forEach((p) => {
      const ry = Math.random() * Math.PI * 2, c = Math.cos(ry), s = Math.sin(ry), y = hy(p.x, p.z);
      L.push(jitterColor(paint(G_ICO1, '#f4f1e6', M(p.x, y + 0.065, p.z, 0.075, 0.055, 0.055, ry)), 0.04));
      L.push(paint(G_BOX, '#2b2622', M(p.x + c * 0.075, y + 0.075, p.z - s * 0.075, 0.04, 0.04, 0.035, ry)));
      [[-0.04, -0.025], [-0.04, 0.025], [0.04, -0.025], [0.04, 0.025]].forEach(([dx, dz]) => L.push(paint(G_BOX, '#2b2622', M(p.x + c * dx + s * dz, y + 0.018, p.z - s * dx + c * dz, 0.012, 0.036, 0.012, ry))));
    });
    const fa = Math.random() * Math.PI * 2;
    for (let i = 0; i < 7; i++) {
      const a = fa + i * 0.17, r = 0.74, x = Math.cos(a) * r, z = Math.sin(a) * r, y = hy(x, z);
      L.push(paint(G_BOX, '#7a5634', M(x, y + 0.04, z, 0.018, 0.08, 0.018)));
      if (i < 6) { const a2 = a + 0.085, x2 = Math.cos(a2) * r, z2 = Math.sin(a2) * r, y2 = hy(x2, z2); [0.055, 0.028].forEach((yy) => L.push(paint(G_BOX, '#9b7348', M(x2, y2 + yy, z2, 0.13, 0.012, 0.01, -a2 + Math.PI / 2)))); }
    }
    scatter(16, 0.3, 0.86, 0.06).forEach((p) => L.push(paint(G_ICO0, ['#f2e35b', '#ffffff', '#e98bc4'][Math.floor(Math.random() * 3)], M(p.x, hy(p.x, p.z) + 0.008, p.z, 0.012, 0.012, 0.012))));
    scatter(10, 0.3, 0.86, 0.08).forEach((p) => L.push(jitterColor(paint(G_CONE6, '#5f9a3a', M(p.x, hy(p.x, p.z) + 0.015, p.z, 0.02, 0.04, 0.02)), 0.15)));
  } else if (res === 'wheat') {
    scatter(4, 0.42, 0.78, 0.22).forEach((p) => {
      const y = hy(p.x, p.z), ry = Math.random() * 3;
      L.push(paint(G_CYL12, '#e9c76a', M(p.x, y + 0.055, p.z, 0.055, 0.1, 0.055, ry, 0, Math.PI / 2)));
    });
    // haces de trigo en pie
    scatter(28, 0.34, 0.86, 0.07).forEach((p) => L.push(jitterColor(paint(G_CONE6, '#e3bd4f', M(p.x, hy(p.x, p.z) + 0.03, p.z, 0.022, 0.07, 0.022)), 0.1)));
    // espantapájaros
    const sp = scatter(1, 0.5, 0.7, 0.2)[0];
    if (sp) { const y = hy(sp.x, sp.z); L.push(paint(G_BOX, '#6b4a2b', M(sp.x, y + 0.09, sp.z, 0.014, 0.18, 0.014))); L.push(paint(G_BOX, '#6b4a2b', M(sp.x, y + 0.13, sp.z, 0.12, 0.012, 0.012))); L.push(paint(G_SPH, '#c79a52', M(sp.x, y + 0.19, sp.z, 0.03, 0.03, 0.03))); L.push(paint(G_BOX, '#a33b2b', M(sp.x, y + 0.12, sp.z, 0.05, 0.06, 0.03))); }
  } else if (res === 'brick') {
    // barro encharcado en el fondo de la cantera
    L.push(paint(G_CYL12, '#4a2a1a', M(T.pit.x, T.h(T.pit.x, T.pit.z) + 0.004, T.pit.z, 0.17, 0.006, 0.13, Math.random() * 3)));
    // pilas de ladrillos y un horno
    scatter(3, 0.4, 0.75, 0.22, (x, z) => Math.hypot(x - T.pit.x, z - T.pit.z) < 0.32).forEach((p, k) => {
      const y = hy(p.x, p.z), ry = Math.random() * 3;
      if (k === 0) { L.push(paint(G_CYL8, '#9c5a3c', M(p.x, y + 0.07, p.z, 0.07, 0.14, 0.07))); L.push(paint(G_CYL8, '#3a2a22', M(p.x, y + 0.16, p.z, 0.035, 0.05, 0.035))); return; }
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) {
        const o = (j - (2 - i) / 2) * 0.045;
        L.push(jitterColor(paint(G_BOX, '#b54a2c', M(p.x + Math.cos(ry) * o, y + 0.014 + i * 0.026, p.z - Math.sin(ry) * o, 0.04, 0.024, 0.085, ry)), 0.12));
      }
    });
    scatter(5, 0.3, 0.85, 0.1).forEach((p) => L.push(jitterColor(paint(G_DOD, '#8d5236', M(p.x, hy(p.x, p.z) + 0.01, p.z, 0.03, 0.022, 0.03, Math.random() * 3)), 0.15)));
  } else if (res === 'ore') {
    scatter(9, 0.3, 0.86, 0.09, (x, z) => T.h(x, z) - TOP > 0.12).forEach((p) => L.push(jitterColor(paint(G_DOD, '#7a8087', M(p.x, hy(p.x, p.z) + 0.015, p.z, 0.04, 0.03, 0.04, Math.random() * 3)), 0.15)));
    scatter(4, 0.6, 0.86, 0.12, (x, z) => T.h(x, z) - TOP > 0.08).forEach((p) => pine(L, p.x, hy(p.x, p.z) - 0.01, p.z, 0.6));
    // entrada de mina
    const m = scatter(1, 0.35, 0.5, 0.2, (x, z) => T.h(x, z) - TOP > 0.1)[0];
    if (m) { const y = hy(m.x, m.z), ry = -Math.atan2(m.z, m.x) - Math.PI / 2; L.push(paint(G_BOX, '#5c4030', M(m.x, y + 0.05, m.z, 0.1, 0.1, 0.03, ry))); L.push(paint(G_BOX, '#1d1712', M(m.x, y + 0.04, m.z, 0.065, 0.075, 0.035, ry))); }
  } else if (res === 'desert') {
    scatter(3, 0.42, 0.75, 0.25).forEach((p) => {
      const y = hy(p.x, p.z);
      L.push(paint(G_CYL8, '#5d8a3b', M(p.x, y + 0.1, p.z, 0.028, 0.2, 0.028)));
      L.push(paint(G_CYL8, '#5d8a3b', M(p.x + 0.045, y + 0.13, p.z, 0.018, 0.09, 0.018)));
      L.push(paint(G_CYL8, '#5d8a3b', M(p.x - 0.045, y + 0.1, p.z, 0.018, 0.07, 0.018)));
    });
    scatter(6, 0.3, 0.85, 0.12).forEach((p) => L.push(jitterColor(paint(G_DOD, '#c9a86a', M(p.x, hy(p.x, p.z) + 0.01, p.z, 0.035, 0.025, 0.035, Math.random() * 3)), 0.12)));
  }
  return L;
}

/* ---------- texturas ---------- */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const numTex = {};
function tokenTex(n) {
  if (numTex[n]) return numTex[n];
  const red = n === 6 || n === 8;
  return (numTex[n] = canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); gr.addColorStop(0, '#fbf1d8'); gr.addColorStop(1, '#e8d8b0');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = red ? '#c62828' : '#2b2118';
    g.font = '700 120px Fredoka, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(n), w / 2, h / 2 - 12);
    const d = 6 - Math.abs(7 - n);
    for (let i = 0; i < d; i++) { g.beginPath(); g.arc(w / 2 + (i - (d - 1) / 2) * 22, h / 2 + 64, 8, 0, Math.PI * 2); g.fill(); }
  }));
}
function waterNormalTex() {
  // mapa de normales de oleaje generado con ruido
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S), hgt = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x / S) * 8, v = (y / S) * 8;
    // ruido periódico (tileable) combinando senos y ruido
    hgt[y * S + x] = Math.sin(u * Math.PI * 2 / 8 * 3 + Math.sin(v * 0.8) * 1.5) * 0.4 + Math.sin(v * Math.PI * 2 / 8 * 5 + Math.cos(u * 0.9) * 1.2) * 0.3 + Math.sin((u + v) * Math.PI * 2 / 8 * 7) * 0.15;
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const hx = hgt[y * S + ((x + 1) % S)] - hgt[y * S + ((x - 1 + S) % S)], hy = hgt[((y + 1) % S) * S + x] - hgt[((y - 1 + S) % S) * S + x];
    const nx = -hx * 2, ny = -hy * 2, nz = 1, l = Math.hypot(nx, ny, nz), i = (y * S + x) * 4;
    img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function skyTex() {
  return canvasTex(16, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#6fb3dc'); gr.addColorStop(0.55, '#bfe0ef'); gr.addColorStop(1, '#e9f3f2'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
}
function labelTex(text, sub) {
  return canvasTex(256, 160, (g, w, h) => {
    g.fillStyle = 'rgba(247,237,211,0.97)'; g.strokeStyle = '#8b6b3e'; g.lineWidth = 8;
    g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 34); g.fill(); g.stroke();
    g.fillStyle = '#2b2118'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (sub) { g.font = '72px system-ui, sans-serif'; g.fillText(text, w / 2 - 50, h / 2 + 4); g.font = '700 54px Fredoka, system-ui, sans-serif'; g.fillText(sub, w / 2 + 52, h / 2 + 4); }
    else { g.font = '700 70px Fredoka, system-ui, sans-serif'; g.fillText(text, w / 2, h / 2 + 4); }
  });
}
function textSprite(text, size = 0.5, color = '#fff') {
  const t = canvasTex(512, 160, (g, w, h) => { g.font = '700 96px Fredoka, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 14; g.strokeStyle = 'rgba(0,0,0,.55)'; g.strokeText(text, w / 2, h / 2); g.fillStyle = color; g.fillText(text, w / 2, h / 2); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false }));
  s.scale.set(size * 3.2, size, 1); s.renderOrder = 10; return s;
}
function dieFaceTex(n) {
  const map = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  return canvasTex(128, 128, (g, w) => { g.fillStyle = '#fbf7ee'; g.fillRect(0, 0, w, w); g.fillStyle = n === 1 ? '#c62828' : '#2b2118'; map[n].forEach((i) => { const cx = 28 + (i % 3) * 36, cy = 28 + Math.floor(i / 3) * 36; g.beginPath(); g.arc(cx, cy, n === 1 ? 15 : 11, 0, Math.PI * 2); g.fill(); }); });
}

/* ---------- piezas ---------- */
function shade(hex, k) { const c = C(hex); c.multiplyScalar(k); return '#' + c.getHexString(); }
const pieceMat = () => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55, metalness: 0.02 });
function settlementMesh(color) {
  const roof = shade(color, 0.6);
  return merged([
    paint(G_BOX, '#8a7a66', M(0, 0.012, 0, 0.2, 0.024, 0.18)), // zócalo de piedra
    paint(G_BOX, color, M(0, 0.08, 0, 0.17, 0.12, 0.15)),
    paint(prism, roof, M(0, 0.14, 0, 0.21, 0.1, 0.18)),
    paint(G_BOX, '#6b625a', M(0.05, 0.22, -0.03, 0.03, 0.08, 0.03)),
    paint(G_BOX, '#3b2a1e', M(0, 0.055, 0.076, 0.042, 0.075, 0.005)),
    paint(G_BOX, '#ffe9a0', M(-0.05, 0.09, 0.076, 0.03, 0.03, 0.004)),
    paint(G_BOX, '#ffe9a0', M(0.086, 0.09, 0, 0.004, 0.03, 0.03)),
  ], pieceMat());
}
function cityMesh(color) {
  const roof = shade(color, 0.6);
  return merged([
    paint(G_BOX, '#8a7a66', M(0, 0.014, 0, 0.36, 0.028, 0.22)),
    paint(G_BOX, color, M(-0.05, 0.08, 0.02, 0.26, 0.13, 0.17)),
    paint(prism, roof, M(-0.08, 0.145, 0.02, 0.2, 0.09, 0.19)),
    paint(G_BOX, color, M(0.1, 0.16, -0.03, 0.12, 0.3, 0.12)),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => paint(G_BOX, color, M(0.1 + sx * 0.045, 0.325, -0.03 + sz * 0.045, 0.03, 0.03, 0.03)))),
    paint(G_CONE4, roof, M(0.1, 0.39, -0.03, 0.08, 0.12, 0.08, Math.PI / 4)),
    paint(G_BOX, '#3b2a1e', M(-0.09, 0.055, 0.106, 0.05, 0.085, 0.005)),
    paint(G_BOX, '#ffe9a0', M(0.1, 0.22, 0.031, 0.03, 0.045, 0.004)),
    paint(G_BOX, '#ffe9a0', M(0.0, 0.09, 0.106, 0.03, 0.03, 0.004)),
    paint(G_BOX, '#ffe9a0', M(-0.15, 0.09, 0.106, 0.03, 0.03, 0.004)),
  ], pieceMat());
}
function roadMesh(color, len) {
  const L = [], n = 7, step = len / n;
  for (let i = 0; i < n; i++) L.push(jitterColor(paint(G_BOX, color, M(-len / 2 + step * (i + 0.5), 0.034, 0, step * 0.84, 0.026, 0.12, rand(-0.04, 0.04), 0, rand(-0.03, 0.03))), 0.12));
  L.push(paint(G_BOX, '#4e3726', M(0, 0.014, -0.05, len, 0.022, 0.018)));
  L.push(paint(G_BOX, '#4e3726', M(0, 0.014, 0.05, len, 0.022, 0.018)));
  L.push(paint(G_BOX, '#4e3726', M(-len / 2, 0.035, -0.06, 0.02, 0.07, 0.02)), paint(G_BOX, '#4e3726', M(len / 2, 0.035, 0.06, 0.02, 0.07, 0.02)));
  return merged(L, pieceMat());
}
function robberMesh() {
  const pts = [[0, 0], [0.12, 0], [0.12, 0.025], [0.085, 0.045], [0.105, 0.18], [0.08, 0.27], [0.05, 0.3], [0, 0.31]].map(([x, y]) => new THREE.Vector2(x, y));
  const L = [paint(new THREE.LatheGeometry(pts, 14), '#3a3633'), paint(G_SPH, '#3a3633', M(0, 0.36, 0, 0.075, 0.08, 0.075)), paint(G_CONE6, '#2a2624', M(0, 0.42, -0.01, 0.085, 0.14, 0.085, 0, -0.2)), paint(G_BOX, '#5b4630', M(0.07, 0.2, 0.05, 0.12, 0.012, 0.02, 0.6, 0, 0.9))];
  const g = merged(L, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.1 }));
  const eyeM = new THREE.MeshBasicMaterial({ color: '#ff4a3a' });
  [-0.025, 0.025].forEach((x) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), eyeM); e.position.set(x, 0.37, 0.068); g.add(e); });
  return g;
}

/* ---------- clase principal ---------- */
export class Board3D {
  constructor(el, opts = {}) {
    this.el = el; this.mobile = !!opts.mobile;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 2 : 2));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 0.95;
    el.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block'; this.renderer.domElement.style.touchAction = 'none';
    this.scene = new THREE.Scene();
    this.scene.background = skyTex();
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.3;
    this.scene.fog = new THREE.Fog('#cfe6ef', 18, 48);
    this.camera = new THREE.PerspectiveCamera(this.mobile ? 45 : 38, 1, 0.05, 200);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.44;
    this.controls.minDistance = 1.5; this.controls.maxDistance = 40;
    if (this.mobile) { this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }; this.controls.screenSpacePanning = false; }
    this.controls.addEventListener('start', () => { this.userMoved = performance.now(); });
    this.scene.add(new THREE.HemisphereLight('#fff7e6', '#4a6a5a', 0.7));
    const sun = new THREE.DirectionalLight('#fff0d2', 2.2);
    sun.position.set(-6, 11, 6); sun.castShadow = true;
    const sm = this.mobile ? 1024 : 2048; sun.shadow.mapSize.set(sm, sm); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
    this.sun = sun; this.scene.add(sun, sun.target);
    this.anims = []; this.clock = new THREE.Clock();
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.followTurn = !this.mobile; this.userMoved = 0; this.active = true;
    this.waterTex = waterNormalTex();
    this.resize(); addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(() => this.tick());
    if (this.mobile) this.bindPicking();
  }
  setActive(on) { if (on === this.active) return; this.active = on; this.renderer.setAnimationLoop(on ? () => this.tick() : null); if (on) { this.clock.getDelta(); this.resize(); } }
  resize() {
    const w = this.el.clientWidth || innerWidth, h = this.el.clientHeight || innerHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  tween(dur, fn, done) { this.anims.push({ t: 0, dur, fn, done }); }
  tick() {
    const dt = Math.min(0.05, this.clock.getDelta()), time = this.clock.elapsedTime;
    this.anims = this.anims.filter((a) => { a.t += dt; const k = Math.min(1, a.t / a.dur); a.fn(k, dt); if (k >= 1) { a.done && a.done(); return false; } return true; });
    if (this.water) { this.water.material.normalMap.offset.set(time * 0.012, time * 0.008); }
    if (this.water2) { this.water2.material.normalMap.offset.set(-time * 0.01, time * 0.014); }
    if (this.fog) this.fog.forEach((s) => { if (s.userData.leaving) return; s.position.y = s.userData.by + Math.sin(time * 0.6 + s.userData.ph) * 0.03; s.position.x = s.userData.bx + Math.sin(time * 0.25 + s.userData.ph) * 0.04; });
    if (this.robber) this.robber.rotation.y = Math.sin(time * 0.8) * 0.4;
    if (this.tokens && this.tokens.length) { const az = Math.atan2(this.camera.position.x - this.controls.target.x, this.camera.position.z - this.controls.target.z); this.tokens.forEach((t) => (t.rotation.y = az)); }
    if (this.markers) this.markers.children.forEach((m) => { if (m.userData.pulse) { const s = 1 + Math.sin(time * 5) * 0.18; m.scale.setScalar(s * (m.userData.base || 1)); } });
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
  clear() {
    this.scene.remove(this.root); this.root = new THREE.Group(); this.scene.add(this.root);
    this.tiles = []; this.pieces = { v: {}, e: {} }; this.fog = []; this.robber = null; this.dice = null; this.water = null; this.water2 = null; this.tokens = []; this.ports = []; this.markers = null; this.hits = [];
  }
  setBoard(B, opts = {}) {
    this.clear(); this.B = B; SEED = (opts.seed || B.hexes.length * 7919 + Math.round(B.hexes[0].x * 1000)) | 0;
    const ex = B.hexes.reduce((m, h) => Math.max(m, Math.abs(h.x), Math.abs(h.y)), 0) + 1.6;
    this.extent = ex;
    // agua profunda + capa de reflejos
    const wm = new THREE.MeshStandardMaterial({ color: '#17628c', roughness: 0.28, metalness: 0.0, normalMap: this.waterTex, normalScale: new THREE.Vector2(0.18, 0.18), envMapIntensity: 0.8 });
    wm.normalMap.repeat.set(ex * 1.2, ex * 1.2);
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(ex * 8, ex * 8), wm);
    this.water.rotation.x = -Math.PI / 2; this.water.position.y = -0.1; this.water.receiveShadow = true; this.root.add(this.water);
    // aguas someras turquesa alrededor de la isla
    const sg = [], beach = [];
    B.sea.forEach((s) => sg.push(paint(G_CYL6, '#5cc4d2', M(s.x, -0.115, s.y, 1.0, 0.03, 1.0))));
    const sgm = mergeGeometries(sg); sgm.computeVertexNormals();
    const shallow = new THREE.Mesh(sgm, new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.75, roughness: 0.55, envMapIntensity: 0.3 }));
    shallow.position.y = 0.04; this.root.add(shallow);
    // playa: un reborde de arena bajo las casillas de costa
    B.hexes.forEach((h) => beach.push(paint(G_CYL6, '#e4d3a3', M(h.x, -0.06, h.y, 1.07, 0.12, 1.07))));
    const bm = merged(beach, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })); bm.castShadow = false; this.root.add(bm);
    // casillas
    const sideMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    const topMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    const featMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
    const sideCol = { wood: '#5d4430', sheep: '#5d4430', wheat: '#6e5634', brick: '#6a3a24', ore: '#55595e', desert: '#a8925c' };
    this.tiles = B.hexes.map((h) => {
      const g = new THREE.Group(); g.position.set(h.x, 0, h.y);
      const T = makeTerrain(h.res, h.x, h.y);
      const land = new THREE.Group();
      const side = merged([paint(G_SIDE, sideCol[h.res], M(0, (TOP - 0.36) / 2, 0, 1, TOP + 0.36, 1))], sideMat);
      const top = new THREE.Mesh(hexTopGeo(h.res === 'ore' ? 16 : 10, T), topMat); top.receiveShadow = true; top.castShadow = true;
      land.add(side, top); g.add(land);
      const feat = merged(buildFeatures(h.res, T), featMat); g.add(feat);
      let token = null;
      if (h.num) {
        token = new THREE.Group();
        const disc = new THREE.Mesh(TOKEN_GEO, TOKEN_MAT); disc.castShadow = true; disc.receiveShadow = true;
        const face = new THREE.Mesh(TOKEN_FACE, new THREE.MeshStandardMaterial({ map: tokenTex(h.num), roughness: 0.7 }));
        face.rotation.x = -Math.PI / 2; face.position.y = 0.026;
        token.add(disc, face); token.userData.y0 = T.h(0, 0) + 0.035; token.position.set(0, token.userData.y0, 0);
        g.add(token); this.tokens.push(token);
      }
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 0.98, 0.3, 6, 1, true), new THREE.MeshBasicMaterial({ color: '#fff6c2', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      glow.position.y = TOP + 0.12; g.add(glow);
      this.root.add(g);
      return { h, g, base: land, feat, token, glow, hidden: false, T };
    });
    // puertos: muelle de madera con cartel
    const wood = new THREE.MeshStandardMaterial({ color: '#7d5833', roughness: 0.9, flatShading: true });
    B.ports.forEach((pt) => {
      const e = B.edges[pt.e], a = B.verts[e.v[0]], b = B.verts[e.v[1]];
      const grp = new THREE.Group();
      [a, b].forEach((v) => {
        const dx = pt.x - v.x, dz = pt.y - v.y, len = Math.hypot(dx, dz);
        const pl = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, 0.12), wood);
        pl.position.set((v.x + pt.x) / 2, 0.03, (v.y + pt.y) / 2); pl.rotation.y = -Math.atan2(dz, dx); pl.castShadow = true; grp.add(pl);
      });
      [[-0.08, -0.08], [0.08, 0.08], [0.08, -0.08], [-0.08, 0.08]].forEach(([dx, dz]) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6), wood); p.position.set(pt.x + dx, -0.04, pt.y + dz); grp.add(p); });
      const deck = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.26), wood); deck.position.set(pt.x, 0.05, pt.y); deck.castShadow = true; grp.add(deck);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.45, 6), wood); post.position.set(pt.x, 0.27, pt.y); grp.add(post);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: pt.type === 'any' ? labelTex('3:1') : labelTex(RINFO[pt.type].e, '2:1'), transparent: true }));
      sp.position.set(pt.x, 0.62, pt.y); sp.scale.set(0.6, 0.375, 1); grp.add(sp);
      grp.userData.hex = pt.hex; this.root.add(grp); this.ports.push(grp);
    });
    this.robber = robberMesh(); this.root.add(this.robber);
    this.placeRobber(B.robber !== undefined ? B.robber : (opts.robber || 0), false);
    this.dice = [0, 1].map(() => {
      const mats = [1, 6, 2, 5, 3, 4].map((n) => new THREE.MeshStandardMaterial({ map: dieFaceTex(n), roughness: 0.35 }));
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), mats); d.castShadow = true; d.visible = false; this.root.add(d); return d;
    });
    if (opts.fog) this.buildFog(opts.revealed || {});
    const sc = this.sun.shadow.camera; sc.left = -ex; sc.right = ex; sc.top = ex; sc.bottom = -ex; sc.far = 60; sc.updateProjectionMatrix();
    this.scene.fog.near = ex * 2.6; this.scene.fog.far = ex * 7;
    this.camDist = this.fitDist();
    this.controls.maxDistance = ex * 4;
    this.setView(0, false);
  }
  fitDist() {
    const v = THREE.MathUtils.degToRad(this.camera.fov) / 2, h = Math.atan(Math.tan(v) * this.camera.aspect);
    const half = Math.min(v, h) * (this.mobile ? 1 : 1.1);
    return (this.extent * (this.mobile ? 0.92 : 0.8)) / Math.tan(half);
  }
  setView(azimuth, animate = true) {
    this.camDist = this.fitDist();
    const pol = this.mobile ? 0.5 : 0.82, d = this.camDist;
    const to = new THREE.Vector3(Math.sin(azimuth) * Math.sin(pol) * d, Math.cos(pol) * d, Math.cos(azimuth) * Math.sin(pol) * d);
    if (!animate) { this.camera.position.copy(to); this.controls.target.set(0, 0, 0); return; }
    const from = this.camera.position.clone().sub(this.controls.target), sFrom = new THREE.Spherical().setFromVector3(from), sTo = new THREE.Spherical().setFromVector3(to);
    let dth = sTo.theta - sFrom.theta; while (dth > Math.PI) dth -= 2 * Math.PI; while (dth < -Math.PI) dth += 2 * Math.PI;
    const t0 = this.controls.target.clone();
    this.tween(1.6, (k) => {
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const tgt = t0.clone().multiplyScalar(1 - e);
      this.camera.position.setFromSpherical(new THREE.Spherical(sFrom.radius + (sTo.radius - sFrom.radius) * e, sFrom.phi + (sTo.phi - sFrom.phi) * e, sFrom.theta + dth * e)).add(tgt);
      this.controls.target.copy(tgt);
    });
  }
  zoomBy(f) { const off = this.camera.position.clone().sub(this.controls.target); off.multiplyScalar(f); if (off.length() < this.controls.minDistance || off.length() > this.controls.maxDistance) return; this.camera.position.copy(this.controls.target).add(off); }
  seatView(p, np) { if (!this.followTurn || performance.now() - this.userMoved < 8000) return; this.setView((p / np) * Math.PI * 2); }
  buildFog(revealed) {
    this.fog = [];
    const geo = new THREE.IcosahedronGeometry(1, 3);
    this.tiles.forEach((t) => {
      if (revealed[t.h.id]) return;
      t.hidden = true; t.feat.visible = false; if (t.token) t.token.visible = false; t.base.visible = false;
      t.clouds = [];
      for (let i = 0; i < 7; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: i % 3 ? '#f1f4f7' : '#dfe6ec', roughness: 1, transparent: true, opacity: 0.97 }));
        const a = (i / 6) * Math.PI * 2 + rand(-0.3, 0.3), r = i === 0 ? 0 : rand(0.38, 0.62);
        const bx = t.h.x + Math.cos(a) * r, bz = t.h.y + Math.sin(a) * r, sc = i === 0 ? rand(0.5, 0.58) : rand(0.3, 0.44);
        m.position.set(bx, i === 0 ? 0.32 : rand(0.12, 0.3), bz); m.scale.set(sc, sc * 0.72, sc); m.castShadow = true;
        m.userData = { bx, bz, by: m.position.y, ph: Math.random() * 6 };
        this.root.add(m); this.fog.push(m); t.clouds.push(m);
      }
    });
    this.updatePortsVisibility();
  }
  updatePortsVisibility() { (this.ports || []).forEach((p) => (p.visible = !this.tiles[p.userData.hex].hidden)); }
  revealHexes(ids) {
    ids.forEach((id) => {
      const t = this.tiles[id];
      if (!t || !t.hidden) return;
      t.hidden = false; t.base.visible = true; t.feat.visible = true; if (t.token) t.token.visible = true;
      t.g.scale.set(1, 0.01, 1);
      this.tween(0.8, (k) => { t.g.scale.set(1, Math.max(0.01, 1 - Math.pow(1 - k, 3)), 1); });
      (t.clouds || []).forEach((s) => {
        s.userData.leaving = true;
        const o0 = s.material.opacity, p0 = s.position.clone(), sc0 = s.scale.clone();
        const dir = new THREE.Vector3(s.position.x - t.h.x, 0, s.position.z - t.h.y).normalize();
        this.tween(1.5, (k) => { const e = 1 - Math.pow(1 - k, 2); s.material.opacity = o0 * (1 - e); s.position.copy(p0).addScaledVector(dir, e * 0.6); s.position.y = p0.y + e * 0.9; s.scale.copy(sc0).multiplyScalar(1 + e * 0.8); }, () => { this.root.remove(s); this.fog = this.fog.filter((x) => x !== s); });
      });
      t.clouds = [];
      if (this.robber && this.robberHex === id) this.robber.visible = true;
    });
    this.updatePortsVisibility();
  }
  hexTopAt(id) { const t = this.tiles[id]; return t ? t.T.h(0.38, 0.12) : TOP; }
  placeRobber(h, animate = true) {
    const t = this.tiles[h]; if (!t) return;
    this.robberHex = h;
    const to = new THREE.Vector3(t.h.x + 0.38, t.T.h(0.38, 0.12), t.h.y + 0.12);
    this.robber.visible = !t.hidden;
    if (!animate) { this.robber.position.copy(to); return; }
    const from = this.robber.position.clone();
    this.tween(0.9, (k) => { const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; this.robber.position.lerpVectors(from, to, e); this.robber.position.y += Math.sin(k * Math.PI) * 1.2; });
  }
  syncPieces(s, colors) {
    const B = this.B, seenV = new Set(), seenE = new Set();
    s.buildings.forEach(([v, p, t]) => {
      seenV.add(v);
      const cur = this.pieces.v[v];
      if (cur && cur.userData.t === t && cur.userData.p === p) return;
      if (cur) this.root.remove(cur);
      const m = t === 'c' ? cityMesh(colors[p]) : settlementMesh(colors[p]), V = B.verts[v];
      m.position.set(V.x, TOP, V.y); m.rotation.y = Math.atan2(V.x, V.y) + (Math.floor(Math.random() * 3) * Math.PI) / 3; m.userData = { t, p };
      this.root.add(m); this.pieces.v[v] = m; this.drop(m);
    });
    s.roads.forEach(([e, p]) => {
      seenE.add(e);
      if (this.pieces.e[e]) return;
      const E = B.edges[e], a = B.verts[E.v[0]], b = B.verts[E.v[1]];
      const m = roadMesh(colors[p], Math.hypot(b.x - a.x, b.y - a.y) * 0.64);
      m.position.set((a.x + b.x) / 2, TOP, (a.y + b.y) / 2); m.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
      this.root.add(m); this.pieces.e[e] = m; this.drop(m, true);
    });
    for (const k in this.pieces.v) if (!seenV.has(+k)) { this.root.remove(this.pieces.v[k]); delete this.pieces.v[k]; }
    for (const k in this.pieces.e) if (!seenE.has(+k)) { this.root.remove(this.pieces.e[k]); delete this.pieces.e[k]; }
    if (s.robber !== this.robberHex) this.placeRobber(s.robber, !!this.ready);
    const rt = this.tiles[s.robber]; this.robber.visible = !(rt && rt.hidden);
  }
  drop(m, road) {
    if (!this.ready) return;
    const y = m.position.y; m.scale.setScalar(0.4);
    this.tween(0.7, (k) => {
      const e = k < 0.55 ? (k / 0.55) ** 2 : 1 - Math.abs(Math.sin((k - 0.55) * 7)) * 0.12 * (1 - k);
      m.position.y = y + (1 - Math.min(1, e)) * 1.4; m.scale.setScalar(0.4 + 0.6 * Math.min(1, k * 1.6));
    }, () => { m.position.y = y; m.scale.setScalar(1); this.puff(m.position, road); });
  }
  puff(pos, small) {
    const mat = new THREE.MeshBasicMaterial({ color: '#e9dcc0', transparent: true, opacity: 0.8, depthWrite: false });
    for (let i = 0; i < (small ? 5 : 8); i++) {
      const p = new THREE.Mesh(G_SPH, mat.clone()), a = (i / 8) * Math.PI * 2;
      p.position.set(pos.x, pos.y + 0.03, pos.z); p.scale.setScalar(0.03); this.root.add(p);
      this.tween(0.6, (k) => { p.position.x = pos.x + Math.cos(a) * k * 0.3; p.position.z = pos.z + Math.sin(a) * k * 0.3; p.position.y = pos.y + 0.03 + k * 0.08; p.scale.setScalar(0.03 + k * 0.06); p.material.opacity = 0.8 * (1 - k); }, () => this.root.remove(p));
    }
  }
  produce(hexes) {
    hexes.forEach((id) => {
      const t = this.tiles[id]; if (!t || t.hidden) return;
      this.tween(1.4, (k) => { t.glow.material.opacity = Math.sin(k * Math.PI) * 0.35; });
      if (t.token) { const y = t.token.userData.y0; this.tween(0.6, (k) => { t.token.position.y = y + Math.sin(k * Math.PI) * 0.25; }, () => (t.token.position.y = y)); }
      const sp = textSprite('+' + RINFO[t.h.res].e, 0.42); sp.position.set(t.h.x, 0.7, t.h.y); this.root.add(sp);
      this.tween(1.6, (k) => { sp.position.y = 0.7 + k * 0.9; sp.material.opacity = k < 0.7 ? 1 : (1 - k) / 0.3; }, () => this.root.remove(sp));
    });
  }
  rollDice(d1, d2) {
    const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.4), hit = new THREE.Vector3();
    ray.setFromCamera(new THREE.Vector2(0.58, -0.45), this.camera);
    if (!ray.ray.intersectPlane(plane, hit)) hit.set(this.extent * 0.6, 0.4, this.extent * 0.4);
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0).normalize();
    const fwd = new THREE.Vector3().subVectors(this.controls.target, this.camera.position).setY(0).normalize();
    const faceQ = { 1: [0, 0, Math.PI / 2], 6: [0, 0, -Math.PI / 2], 2: [0, 0, 0], 5: [Math.PI, 0, 0], 3: [-Math.PI / 2, 0, 0], 4: [Math.PI / 2, 0, 0] };
    [d1, d2].forEach((val, i) => {
      const die = this.dice[i]; die.visible = true;
      const end = hit.clone().add(right.clone().multiplyScalar((i - 0.5) * 0.5)).add(fwd.clone().multiplyScalar(i * 0.12)); end.y = 0.4 + 0.15;
      const start = end.clone().add(right.clone().multiplyScalar(-2.6)).add(fwd.clone().multiplyScalar(-1.2)); start.y = 2.6;
      const qEnd = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...faceQ[val])));
      const axis = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(), spins = rand(14, 20);
      this.tween(1.5 + i * 0.12, (k) => {
        const e = 1 - Math.pow(1 - k, 3);
        die.position.lerpVectors(start, end, e);
        die.position.y = k < 0.25 ? start.y + (end.y - start.y) * (k / 0.25) : end.y + Math.abs(Math.sin(k * Math.PI * 3.2)) * (1 - k) * 1.3;
        die.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(axis, spins * (1 - e)).multiply(qEnd));
      });
    });
    setTimeout(() => {
      const sp = textSprite(String(d1 + d2), 0.9, d1 + d2 === 7 ? '#ff6b5b' : '#fff'); sp.position.copy(hit).setY(1.2); this.root.add(sp);
      this.tween(2.2, (k) => { sp.position.y = 1.2 + k * 0.4; sp.material.opacity = k < 0.75 ? 1 : (1 - k) / 0.25; }, () => this.root.remove(sp));
    }, 1550);
  }
  spin(on) { this.controls.autoRotate = on; this.controls.autoRotateSpeed = 0.6; }

  /* ---------- interacción (móvil): marcadores donde se puede construir y tocar para elegir ---------- */
  setTargets(T, sel, color = '#ffffff') {
    if (this.markers) this.root.remove(this.markers);
    this.markers = new THREE.Group(); this.hits = [];
    const B = this.B; if (!B) return;
    const on = (k, id) => sel && sel.k === k && sel.id === id;
    const mk = (hex, sel2) => new THREE.MeshBasicMaterial({ color: sel2 ? '#c1592b' : hex, transparent: true, opacity: sel2 ? 1 : 0.9, depthTest: false });
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    T.v.forEach((id) => {
      const V = B.verts[id], s = on('v', id);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 8, 24), mk('#ffffff', s)); ring.rotation.x = -Math.PI / 2; ring.position.set(V.x, TOP + 0.05, V.y); ring.renderOrder = 5;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), mk(s ? '#c1592b' : color, s)); dot.position.set(V.x, TOP + 0.06, V.y); dot.renderOrder = 6;
      if (!s) { ring.userData.pulse = true; } else { ring.scale.setScalar(1.4); }
      const hit = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), hitMat); hit.position.set(V.x, TOP + 0.05, V.y); hit.userData = { k: 'v', id };
      if (s) { const ghost = settlementMesh(color); ghost.position.set(V.x, TOP, V.y); ghost.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.75; } }); this.markers.add(ghost); }
      this.markers.add(ring, dot, hit); this.hits.push(hit);
    });
    T.e.forEach((id) => {
      const E = B.edges[id], a = B.verts[E.v[0]], b = B.verts[E.v[1]], s = on('e', id);
      const len = Math.hypot(b.x - a.x, b.y - a.y) * 0.62, ang = -Math.atan2(b.y - a.y, b.x - a.x);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, s ? 0.09 : 0.06), mk('#ffffff', s)); bar.position.set((a.x + b.x) / 2, TOP + 0.05, (a.y + b.y) / 2); bar.rotation.y = ang; bar.renderOrder = 5;
      if (!s) bar.userData.pulse = true;
      const hit = new THREE.Mesh(new THREE.BoxGeometry(len, 0.2, 0.32), hitMat); hit.position.copy(bar.position); hit.rotation.y = ang; hit.userData = { k: 'e', id };
      if (s) { const ghost = roadMesh(color, len * 1.03); ghost.position.set((a.x + b.x) / 2, TOP, (a.y + b.y) / 2); ghost.rotation.y = ang; this.markers.add(ghost); }
      this.markers.add(bar, hit); this.hits.push(hit);
    });
    T.h.forEach((id) => {
      const h = B.hexes[id], s = on('h', id);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.9, 6, 1), mk('#ffffff', s)); ring.rotation.x = -Math.PI / 2; ring.rotation.z = Math.PI / 2; ring.position.set(h.x, TOP + 0.25, h.y); ring.renderOrder = 5;
      if (!s) { ring.userData.pulse = true; ring.userData.base = 1; }
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.8, 6), hitMat); hit.position.set(h.x, 0.3, h.y); hit.userData = { k: 'h', id };
      this.markers.add(ring, hit); this.hits.push(hit);
    });
    this.root.add(this.markers);
  }
  bindPicking() {
    const el = this.renderer.domElement; let start = null, multi = false;
    el.addEventListener('pointerdown', (e) => { if (!e.isPrimary) { multi = true; return; } multi = false; start = { x: e.clientX, y: e.clientY, t: Date.now() }; });
    el.addEventListener('pointerup', (e) => {
      if (!e.isPrimary || !start || multi) return;
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y), dt = Date.now() - start.t; start = null;
      if (moved > 10 || dt > 600 || !this.hits.length) return;
      const r = el.getBoundingClientRect(), ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
      const hit = ray.intersectObjects(this.hits, false)[0];
      if (hit && this.onPick) this.onPick({ k: hit.object.userData.k, id: hit.object.userData.id });
    });
  }
}
