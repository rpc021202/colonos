// Tablero 3D (Three.js) para la pantalla y para el mapa del móvil.
// Terreno con relieve real por casilla, iluminación con entorno, agua con reflejos, piezas detalladas.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';
import { Water } from 'three/addons/objects/Water.js';
import { RINFO } from './engine.js';

const TOP = 0.16; // altura del borde de las casillas (donde van caminos y poblados)
const rand = (a, b) => a + Math.random() * (b - a);
const rnd2 = (n) => Math.floor(Math.random() * n);
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
const FOAM_GEO = new THREE.RingGeometry(1.02, 1.16, 6, 1);
function sheepMesh() {
  const g = new THREE.Group(), wool = new THREE.MeshStandardMaterial({ color: '#f6f3ea', roughness: 0.95, flatShading: true }), dark = new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), wool); body.scale.set(0.075, 0.058, 0.058); body.position.y = 0.07; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.035), dark); head.position.set(0.075, 0.08, 0); g.add(head); g.userData.head = head;
  [[-0.04, -0.025], [-0.04, 0.025], [0.04, -0.025], [0.04, 0.025]].forEach(([x, z]) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.04, 0.012), dark); l.position.set(x, 0.02, z); g.add(l); });
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.children[1].userData.isHead = true;
  return g;
}
// aldeanos: muñequitos del color del jugador que van a trabajar a las casillas junto a sus poblados
const SKIN = new THREE.MeshStandardMaterial({ color: '#f1c9a0', roughness: 0.8 }), DARK = new THREE.MeshStandardMaterial({ color: '#3a2c22', roughness: 0.9 });
const G_BODY = new THREE.CylinderGeometry(0.016, 0.026, 0.05, 8), G_HEAD = new THREE.SphereGeometry(0.017, 10, 8), G_LEG = new THREE.BoxGeometry(0.01, 0.026, 0.01), G_HAT = new THREE.ConeGeometry(0.02, 0.022, 8), G_LOAD = new THREE.BoxGeometry(0.03, 0.022, 0.022);
const LOAD_COL = { wood: '#7a4b28', brick: '#b5532c', sheep: '#f3efe4', wheat: '#e2b53b', ore: '#8d939a' };
const walkerMats = {};
function walkerMesh(color, res) {
  const m = walkerMats[color] || (walkerMats[color] = new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
  const g = new THREE.Group();
  const body = new THREE.Mesh(G_BODY, m); body.position.y = 0.05; g.add(body);
  const head = new THREE.Mesh(G_HEAD, SKIN); head.position.y = 0.09; g.add(head);
  const hat = new THREE.Mesh(G_HAT, m); hat.position.y = 0.108; g.add(hat);
  const l1 = new THREE.Mesh(G_LEG, DARK), l2 = new THREE.Mesh(G_LEG, DARK); l1.position.set(0.008, 0.013, 0); l2.position.set(-0.008, 0.013, 0); g.add(l1, l2);
  const load = new THREE.Mesh(G_LOAD, new THREE.MeshStandardMaterial({ color: LOAD_COL[res] || '#9a8a70', roughness: 0.9 })); load.position.set(0, 0.075, -0.026); load.visible = false; g.add(load);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(1.9);
  return g;
}
function birdMesh() {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: '#f2f2f2', side: THREE.DoubleSide, roughness: 0.9 });
  const wing = new THREE.BufferGeometry(); wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.03, 0, 0.09, 0.03, 0, 0.02], 3)); wing.computeVertexNormals();
  const l = new THREE.Mesh(wing, m), r = new THREE.Mesh(wing, m); r.scale.z = -1; g.add(l, r); g.userData.wings = [l, r];
  const b = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.06, 5), m); b.rotation.z = -Math.PI / 2; g.add(b);
  return g;
}
const SMOKE_GEO = new THREE.IcosahedronGeometry(1, 1);
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
        const strata = 0.5 + 0.5 * Math.sin(dy * 60 + n * 6);
        const rock = C('#575d63').lerp(C('#7e848a'), n * 0.7 + strata * 0.3);
        if (dy < 0.05) return C('#6f7f5c').lerp(rock, smooth(0, 0.05, dy));
        return rock.lerp(C('#f3f5f7'), smooth(0.5 + n * 0.12, 0.6 + n * 0.12, dy));
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
  const uv = []; for (let i = 0; i < P.length; i += 3) uv.push(P[i] * 1.5, P[i + 2] * 1.5);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
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
function pine(L, x, y, z, s) { (L.trees || (L.trees = [])).push({ t: 'p', x, y, z, s }); }
function broadleaf(L, x, y, z, s) { (L.trees || (L.trees = [])).push({ t: 'b', x, y, z, s }); }

/* ---------- árboles orgánicos (variantes suaves, instanciadas) ---------- */
function colorize(geo, fn) {
  const p = geo.attributes.position, arr = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), c); arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return geo;
}
function wobble(geo, amt, f = 9, seed = 0) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = vnoise(x * f + seed, z * f + y * f * 0.7 + seed * 2) - 0.5;
    const r = Math.hypot(x, z) || 1;
    p.setXYZ(i, x + (x / r) * n * amt, y + n * amt * 0.4, z + (z / r) * n * amt);
  }
  return geo;
}
function prep(g) { g.deleteAttribute('uv'); if (g.index) g = g.toNonIndexed(); g.deleteAttribute('normal'); return g; }
function makePine(seed) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.012, 0.022, 0.12, 7); trunk.translate(0, 0.06, 0);
  parts.push(colorize(prep(trunk), (x, y, z, c) => c.set('#4e3422').lerp(C('#6b4a30'), y * 6)));
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const k = i / (tiers - 1), r = 0.13 - k * 0.085, h = 0.13 - k * 0.03, y0 = 0.07 + k * 0.2;
    const cone = new THREE.ConeGeometry(r, h, 11, 2); cone.translate(0, y0 + h / 2, 0);
    // falda caída: los bordes bajan un poco
    const p = cone.attributes.position;
    for (let j = 0; j < p.count; j++) { const rr = Math.hypot(p.getX(j), p.getZ(j)); if (rr > r * 0.8) p.setY(j, p.getY(j) - 0.015); }
    wobble(cone, 0.02, 14, seed + i);
    parts.push(colorize(prep(cone), (x, y, z, c) => { const t = Math.hypot(x, z) / r; c.set('#1d4423').lerp(C('#3f7a3a'), Math.min(1, t * 0.8 + (y - y0) * 1.5)).multiplyScalar(0.9 + k * 0.15); }));
  }
  const g = mergeGeometries(parts); g.computeVertexNormals(); return g;
}
function makeBroad(seed) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.014, 0.026, 0.16, 7); trunk.translate(0, 0.08, 0);
  parts.push(colorize(prep(trunk), (x, y, z, c) => c.set('#5a3d28')));
  const blobs = [[0, 0.2, 0, 0.1], [0.06, 0.17, 0.02, 0.075], [-0.05, 0.18, -0.03, 0.08], [0.01, 0.26, -0.01, 0.075], [-0.02, 0.16, 0.06, 0.065]];
  blobs.forEach(([x, y, z, r], i) => {
    const b = new THREE.IcosahedronGeometry(r, 2); wobble(b, r * 0.45, 22, seed * 3 + i); b.translate(x, y, z);
    parts.push(colorize(prep(b), (px, py, pz, c) => c.set('#3d6b26').lerp(C('#7aa846'), Math.min(1, Math.max(0, (py - 0.12) * 5 + (vnoise(px * 40, pz * 40) - 0.5) * 0.6)))));
  });
  const g = mergeGeometries(parts); g.computeVertexNormals(); return g;
}
let TREES = null;
function treeVariants() { if (!TREES) TREES = { p: [0, 1, 2].map((i) => makePine(i * 7.3)), b: [0, 1, 2].map((i) => makeBroad(i * 5.1)) }; return TREES; }
const TREE_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
function treeMeshes(list) {
  if (!list || !list.length) return [];
  const V = treeVariants(), groups = {};
  list.forEach((t) => { const k = t.t + Math.floor(Math.random() * 3); (groups[k] = groups[k] || []).push(t); });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  return Object.entries(groups).map(([k, arr]) => {
    const im = new THREE.InstancedMesh(V[k[0]][+k[1]], TREE_MAT, arr.length);
    arr.forEach((t, i) => {
      q.setFromEuler(new THREE.Euler(rand(-0.06, 0.06), Math.random() * 6.28, rand(-0.06, 0.06)));
      m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s, t.s * rand(0.9, 1.15), t.s));
      im.setMatrixAt(i, m); im.setColorAt(i, c.setHSL(rand(-0.02, 0.03), rand(0, 0.15), rand(0.85, 1.0)).lerp(C('#ffffff'), 0.6));
    });
    im.castShadow = true; im.receiveShadow = true; return im;
  });
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

/* ---------- vegetación instanciada (hierba, trigo) ---------- */
const G_BLADE = (() => { const g = new THREE.ConeGeometry(0.011, 0.06, 3); g.translate(0, 0.03, 0); return g; })();
const G_STALK = (() => { const g = new THREE.CylinderGeometry(0.0025, 0.0035, 0.09, 4); g.translate(0, 0.045, 0); const e = new THREE.CapsuleGeometry(0.0065, 0.03, 2, 6); e.translate(0, 0.105, 0); [g, e].forEach((x) => { x.deleteAttribute('uv'); }); return mergeGeometries([g.toNonIndexed(), e.toNonIndexed()]); })();
const VEG_MAT = new THREE.MeshStandardMaterial({ roughness: 0.85 });
function vegetation(res, T, dense) {
  const out = [], q = new THREE.Quaternion(), m = new THREE.Matrix4(), col = new THREE.Color();
  const make = (geo, list, colorFn, shadow) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, VEG_MAT, list.length);
    list.forEach((p, i) => {
      q.setFromEuler(new THREE.Euler(rand(-0.25, 0.25), Math.random() * 6.28, rand(-0.25, 0.25)));
      const s = p.s || rand(0.7, 1.3);
      m.compose(new THREE.Vector3(p.x, T.h(p.x, p.z) - 0.004, p.z), q, new THREE.Vector3(s, s * rand(0.8, 1.4), s));
      im.setMatrixAt(i, m); im.setColorAt(i, colorFn(p, col));
    });
    im.receiveShadow = true; im.castShadow = !!shadow; out.push(im);
  };
  const k = dense ? 1 : 0.35;
  const pts = (n, rMin = 0.3) => { const a = []; for (let i = 0; i < n * k; i++) { const ang = Math.random() * 6.28, r = Math.sqrt(rand(rMin * rMin, 0.81)); const x = Math.cos(ang) * r, z = Math.sin(ang) * r; if (hexD(x, z) < 0.93) a.push({ x, z }); } return a; };
  if (res === 'sheep') make(G_BLADE, pts(650), (p, c) => c.setHSL(0.24 + rand(-0.03, 0.03), 0.55, 0.3 + rand(0, 0.15)));
  if (res === 'wood') make(G_BLADE, pts(260), (p, c) => c.setHSL(0.27 + rand(-0.03, 0.03), 0.5, 0.2 + rand(0, 0.1)));
  if (res === 'ore') make(G_BLADE, pts(120, 0.6).filter((p) => T.h(p.x, p.z) - TOP < 0.06), (p, c) => c.setHSL(0.22, 0.3, 0.3 + rand(0, 0.1)));
  if (res === 'desert') make(G_BLADE, pts(40, 0.4), (p, c) => c.setHSL(0.15, 0.35, 0.45));
  if (res === 'wheat') {
    // espigas plantadas en hileras siguiendo la dirección del campo
    const list = [], dir = T.rot, cs = Math.cos(dir), sn = Math.sin(dir), step = dense ? 0.035 : 0.06;
    for (let a = -0.95; a <= 0.95; a += 0.07) for (let b = -0.95; b <= 0.95; b += step) {
      const x = a * cs - b * sn + rand(-0.008, 0.008), z = a * sn + b * cs + rand(-0.008, 0.008);
      if (hexD(x, z) > 0.9 || Math.hypot(x, z) < 0.34) continue;
      list.push({ x, z, s: rand(0.8, 1.15) });
    }
    make(G_STALK, list, (p, c) => c.setHSL(0.12 + rand(-0.015, 0.015), 0.6 + rand(0, 0.15), 0.5 + rand(-0.06, 0.06)), dense);
  }
  return out;
}
function detailNormalTex() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S), h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) h[y * S + x] = vnoise(x / 8, y / 8) * 0.6 + vnoise(x / 3, y / 3) * 0.4;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)], dy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
    const nx = -dx * 3, ny = -dy * 3, l = Math.hypot(nx, ny, 1), i = (y * S + x) * 4;
    img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
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
const pieceMat = () => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6, metalness: 0.02 });
// tejado a dos aguas hecho de hileras de tejas
function gableRoof(L, cx, cy, cz, w, d, h, color, rot = 0) {
  const half = w / 2, slope = Math.hypot(half, h), ang = Math.atan2(h, half), rows = 4;
  for (const side of [-1, 1]) for (let i = 0; i < rows; i++) {
    const t = (i + 0.5) / rows, along = slope * t;
    const x = side * (half - Math.cos(ang) * along), y = Math.sin(ang) * along;
    const k = 0.78 + (i % 2) * 0.1 + rand(-0.03, 0.03);
    const m = new THREE.Matrix4().makeRotationY(rot).multiply(M(x * 1.06, y + 0.004 * i, 0, slope / rows * 1.25, 0.011, d * 1.12, 0, 0, -side * ang));
    m.premultiply(new THREE.Matrix4().makeTranslation(cx, cy, cz));
    L.push(paint(G_BOX, shade(color, k), m));
  }
  const ridge = new THREE.Matrix4().makeRotationY(rot).multiply(M(0, h + 0.006, 0, 0.018, 0.016, d * 1.14));
  ridge.premultiply(new THREE.Matrix4().makeTranslation(cx, cy, cz)); L.push(paint(G_BOX, shade(color, 0.55), ridge));
}
const T_ = (L, geo, color, x, y, z, sx, sy, sz, ry = 0, rot = 0) => { const m = new THREE.Matrix4().makeRotationY(rot).multiply(M(x, y, z, sx, sy, sz, ry)); L.push(paint(geo, color, m)); };
function house(L, x, z, w, d, hw, color, rot = 0, wall = '#efe4cc') {
  const R = (geo, col, px, py, pz, sx, sy, sz) => { const m = new THREE.Matrix4().makeTranslation(x, 0, z).multiply(new THREE.Matrix4().makeRotationY(rot)).multiply(M(px, py, pz, sx, sy, sz)); L.push(paint(geo, col, m)); };
  R(G_BOX, '#8d867a', 0, 0.012, 0, w + 0.02, 0.024, d + 0.02);              // zócalo de piedra
  R(G_BOX, wall, 0, 0.024 + hw / 2, 0, w, hw, d);                            // muros
  const beam = '#4a3424';
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => R(G_BOX, beam, sx * (w / 2 - 0.006), 0.024 + hw / 2, sz * (d / 2 - 0.006), 0.014, hw, 0.014));
  R(G_BOX, beam, 0, 0.024 + hw * 0.55, d / 2 + 0.002, w, 0.01, 0.004); R(G_BOX, beam, 0, 0.024 + hw * 0.55, -d / 2 - 0.002, w, 0.01, 0.004);
  R(prism, wall, 0, 0.024 + hw, 0, w * 0.999, hw * 0.75, d * 0.999);       // hastiales
  R(G_BOX, '#3b2a1e', w * 0.18, 0.024 + 0.035, d / 2 + 0.003, 0.034, 0.07, 0.006); // puerta
  R(G_BOX, '#ffd98a', -w * 0.22, 0.024 + hw * 0.55, d / 2 + 0.003, 0.026, 0.026, 0.005); // ventana con luz
  R(G_BOX, shade(color, 0.7), -w * 0.22 - 0.02, 0.024 + hw * 0.55, d / 2 + 0.004, 0.009, 0.03, 0.004);
  R(G_BOX, shade(color, 0.7), -w * 0.22 + 0.02, 0.024 + hw * 0.55, d / 2 + 0.004, 0.009, 0.03, 0.004);
  R(G_BOX, '#ffd98a', w / 2 + 0.003, 0.024 + hw * 0.55, 0, 0.005, 0.026, 0.026);
  const roofL = [];
  gableRoof(roofL, 0, 0.024 + hw, 0, w + 0.03, d, hw * 0.75, color);
  roofL.forEach((g) => { g.applyMatrix4(new THREE.Matrix4().makeRotationY(rot)); g.applyMatrix4(new THREE.Matrix4().makeTranslation(x, 0, z)); L.push(g); });
  R(G_BOX, '#7b746b', w * 0.25, 0.024 + hw + hw * 0.6, -d * 0.2, 0.026, hw * 0.7, 0.026); // chimenea
}
// Poblado: grupito de casitas alrededor del cruce
function settlementMesh(color) {
  const L = [];
  house(L, -0.055, -0.03, 0.1, 0.085, 0.065, color, 0.35);
  house(L, 0.06, -0.025, 0.095, 0.08, 0.06, color, -0.4);
  house(L, 0.0, 0.065, 0.11, 0.085, 0.07, color, 0.05);
  T_(L, G_ICO0, '#4f7f30', 0.075, 0.018, 0.075, 0.022, 0.018, 0.022);   // arbusto
  T_(L, G_CYL8, '#8a8378', -0.085, 0.02, 0.06, 0.018, 0.04, 0.018);     // pozo
  T_(L, G_CYL8, '#2c4a66', -0.085, 0.041, 0.06, 0.013, 0.003, 0.013);
  return merged(L, pieceMat());
}
// Ciudad: casas grandes de dos alturas y una iglesia con campanario
function cityMesh(color) {
  const L = [], stone = '#cfc6b4', stoneD = '#a59d8e';
  T_(L, G_BOX, '#8d867a', 0, 0.01, 0, 0.36, 0.02, 0.3);              // plaza empedrada
  // iglesia: nave + ábside + campanario
  const cx = 0.05, cz = -0.04;
  T_(L, G_BOX, stone, cx, 0.02 + 0.055, cz, 0.17, 0.11, 0.095);
  T_(L, prism, stone, cx, 0.02 + 0.11, cz, 0.094, 0.06, 0.169, Math.PI / 2);
  const roof = []; gableRoof(roof, 0, 0.02 + 0.11, 0, 0.1, 0.17, 0.06, color);
  roof.forEach((g) => { g.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2)); g.applyMatrix4(new THREE.Matrix4().makeTranslation(cx, 0, cz)); L.push(g); });
  T_(L, G_CYL8, stone, cx + 0.095, 0.02 + 0.045, cz, 0.04, 0.09, 0.04);
  T_(L, G_CONE6, shade(color, 0.85), cx + 0.095, 0.02 + 0.115, cz, 0.046, 0.05, 0.046);
  const tx = cx - 0.1;
  T_(L, G_BOX, stone, tx, 0.02 + 0.14, cz, 0.06, 0.28, 0.06);         // campanario
  T_(L, G_BOX, stoneD, tx, 0.02 + 0.285, cz, 0.068, 0.012, 0.068);
  T_(L, G_BOX, '#2a221c', tx, 0.02 + 0.235, cz + 0.031, 0.026, 0.04, 0.003); // hueco de la campana
  T_(L, G_BOX, '#2a221c', tx + 0.031, 0.02 + 0.235, cz, 0.003, 0.04, 0.026);
  T_(L, G_SPH, '#c9a44a', tx, 0.02 + 0.228, cz, 0.012, 0.014, 0.012);
  T_(L, G_CONE4, color, tx, 0.02 + 0.35, cz, 0.05, 0.12, 0.05, Math.PI / 4);
  T_(L, G_BOX, '#c9a44a', tx, 0.02 + 0.43, cz, 0.004, 0.04, 0.004);
  T_(L, G_BOX, '#c9a44a', tx, 0.02 + 0.44, cz, 0.022, 0.004, 0.004);
  T_(L, G_BOX, '#3b2a1e', tx, 0.02 + 0.04, cz + 0.031, 0.026, 0.05, 0.004); // puerta
  T_(L, G_BOX, '#ffd98a', cx, 0.02 + 0.07, cz + 0.049, 0.02, 0.04, 0.003); // vidriera
  T_(L, G_BOX, '#ffd98a', cx + 0.045, 0.02 + 0.07, cz + 0.049, 0.02, 0.04, 0.003);
  // casas grandes de dos alturas
  house(L, -0.08, 0.09, 0.13, 0.1, 0.11, color, 0.2);
  house(L, 0.09, 0.08, 0.12, 0.095, 0.1, color, -0.25);
  T_(L, G_ICO0, '#4f7f30', 0.0, 0.03, 0.12, 0.028, 0.024, 0.028);
  return merged(L, pieceMat());
}
// Camino: vigas + tablones sueltos (cada tablón cae por separado)
function roadMesh(color, len) {
  const g = new THREE.Group(), base = [];
  base.push(paint(G_BOX, '#4e3726', M(0, 0.014, -0.048, len, 0.02, 0.016)));
  base.push(paint(G_BOX, '#4e3726', M(0, 0.014, 0.048, len, 0.02, 0.016)));
  for (let i = 0; i < 5; i++) base.push(jitterColor(paint(G_DOD, '#8d877d', M(rand(-len / 2, len / 2), 0.008, (Math.random() < 0.5 ? -1 : 1) * rand(0.065, 0.085), 0.012, 0.01, 0.012, Math.random() * 3)), 0.15));
  [-1, 1].forEach((sd) => { base.push(paint(G_BOX, '#4e3726', M(sd * len / 2, 0.045, sd * 0.062, 0.016, 0.09, 0.016))); base.push(paint(G_BOX, '#ffd98a', M(sd * len / 2, 0.095, sd * 0.062, 0.018, 0.02, 0.018))); });
  const bm = merged(base, pieceMat()); bm.userData.base = true; g.add(bm);
  const n = ROAD_PLANKS, step = len / n, mat = pieceMat();
  for (let i = 0; i < n; i++) {
    const pl = merged([jitterColor(paint(G_BOX, color, M(0, 0, 0, step * 0.82, 0.022, 0.11, 0, 0, 0)), 0.14)], mat);
    pl.position.set(-len / 2 + step * (i + 0.5), 0.032, 0); pl.rotation.set(0, rand(-0.05, 0.05), rand(-0.03, 0.03));
    pl.userData.plank = i; g.add(pl);
  }
  return g;
}
export const ROAD_PLANKS = 8, PLANK_GAP = 0.09, PLANK_FALL = 0.22;
// barco: casco de madera, cubierta, mástil y vela del color del jugador
function shipMesh(color, lv = 1) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const s = new THREE.Shape(); s.moveTo(-0.17, 0); s.quadraticCurveTo(-0.15, 0.06, 0, 0.065); s.quadraticCurveTo(0.17, 0.06, 0.2, 0); s.quadraticCurveTo(0.17, -0.06, 0, -0.065); s.quadraticCurveTo(-0.15, -0.06, -0.17, 0);
  const hull = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.01, bevelSegments: 2 });
  hull.rotateX(Math.PI / 2); hull.translate(0, 0.08, 0);
  const wood = new THREE.MeshStandardMaterial({ color: '#7a5130', roughness: 0.75 }), dark = new THREE.MeshStandardMaterial({ color: '#4e3420', roughness: 0.8 });
  const hm = new THREE.Mesh(hull, wood); body.add(hm);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.008, 0.1), dark); deck.position.y = 0.085; body.add(deck);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.32, 8), dark); mast.position.set(0.0, 0.24, 0); body.add(mast);
  const sailGeo = new THREE.PlaneGeometry(0.19, 0.17, 6, 4); const sp = sailGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), y = sp.getY(i); sp.setZ(i, 0.035 * Math.cos((x / 0.19) * Math.PI) * (0.6 + 0.4 * Math.cos((y / 0.17) * Math.PI))); }
  sailGeo.computeVertexNormals();
  const sail = new THREE.Mesh(sailGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide })); sail.rotation.y = Math.PI / 2; sail.position.set(0.012, 0.25, 0); body.add(sail);
  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.21, 6), dark); yard.rotation.x = Math.PI / 2; yard.position.set(0.012, 0.34, 0); body.add(yard);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.03), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide })); flag.position.set(0.025, 0.39, 0); body.add(flag);
  [-0.05, 0.05].forEach((z) => { const sh = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), new THREE.MeshStandardMaterial({ color: '#c9a44a', metalness: 0.6, roughness: 0.4 })); sh.scale.set(1, 1, 0.4); sh.position.set(-0.05, 0.075, z * 1.32); body.add(sh); });
  if (lv >= 2) { // barco mejorado: segundo mástil con vela y franja dorada
    const m2 = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.24, 8), dark); m2.position.set(-0.11, 0.2, 0); body.add(m2);
    const s2 = new THREE.Mesh(sailGeo, sail.material); s2.rotation.y = Math.PI / 2; s2.scale.set(0.75, 0.7, 0.75); s2.position.set(-0.1, 0.22, 0); body.add(s2);
    const gold = new THREE.MeshStandardMaterial({ color: '#d9b44a', metalness: 0.6, roughness: 0.35 });
    [-1, 1].forEach((z) => { const st = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.006), gold); st.position.set(0.01, 0.07, z * 0.072); body.add(st); });
  }
  body.scale.setScalar(1.6);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
function robberMesh() {
  const g = new THREE.Group();
  // capa larga con pliegues (perfil de torno + ondulación)
  const prof = [[0, 0], [0.13, 0], [0.135, 0.02], [0.115, 0.08], [0.1, 0.17], [0.085, 0.24], [0.07, 0.28], [0.05, 0.3], [0, 0.31]].map(([x, y]) => new THREE.Vector2(x, y));
  const cloak = new THREE.LatheGeometry(prof, 36);
  const p = cloak.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), r = Math.hypot(x, z); const f = 1 + Math.sin(a * 9) * 0.06 * (1 - y / 0.31); p.setXYZ(i, Math.cos(a) * r * f, y, Math.sin(a) * r * f); }
  cloak.computeVertexNormals();
  const cloakMat = new THREE.MeshStandardMaterial({ color: '#2c2a2e', roughness: 0.9 });
  g.add(new THREE.Mesh(cloak, cloakMat));
  // capucha
  const hood = new THREE.SphereGeometry(0.085, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62); hood.scale(1, 1.15, 1.05);
  const hm = new THREE.Mesh(hood, cloakMat); hm.position.set(0, 0.36, -0.005); hm.rotation.x = -0.25; g.add(hm);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.09, 16), cloakMat); tip.position.set(0, 0.45, -0.04); tip.rotation.x = -0.6; g.add(tip);
  // cara en sombra y ojos que brillan
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshStandardMaterial({ color: '#0b0a0c', roughness: 1 })); face.position.set(0, 0.35, 0.02); g.add(face);
  const eyeM = new THREE.MeshBasicMaterial({ color: '#ff5a3a' });
  [-0.022, 0.022].forEach((x) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), eyeM); e.position.set(x, 0.36, 0.072); g.add(e); });
  // cinturón y saco del botín al hombro
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.009, 8, 32), new THREE.MeshStandardMaterial({ color: '#5b4128', roughness: 0.7 })); belt.rotation.x = Math.PI / 2; belt.position.y = 0.17; g.add(belt);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.022, 0.008), new THREE.MeshStandardMaterial({ color: '#c9a44a', metalness: 0.8, roughness: 0.3 })); buckle.position.set(0, 0.17, 0.1); g.add(buckle);
  const sackGeo = new THREE.SphereGeometry(0.07, 20, 14); sackGeo.scale(1, 1.1, 0.9);
  const sackMat = new THREE.MeshStandardMaterial({ color: '#a8875a', roughness: 0.95 });
  const sack = new THREE.Mesh(sackGeo, sackMat); sack.position.set(0.09, 0.3, -0.07); g.add(sack);
  const knot = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.025, 0.04, 10), sackMat); knot.position.set(0.075, 0.385, -0.06); knot.rotation.z = 0.4; g.add(knot);
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.004, 16), new THREE.MeshStandardMaterial({ color: '#e0b94a', metalness: 0.9, roughness: 0.25 }));
  coin.position.set(0.06, 0.41, -0.05); coin.rotation.set(0.6, 0, 0.9); g.add(coin);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
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
    this.detailTex = detailNormalTex();
    this.hq = !this.mobile;
    if (this.hq) {
      // posproceso: desenfoque de miniatura (tilt-shift) en los bordes de la imagen
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.tsH = new ShaderPass(HorizontalTiltShiftShader); this.tsV = new ShaderPass(VerticalTiltShiftShader);
      this.tsH.uniforms.r.value = this.tsV.uniforms.r.value = 0.52;
      this.composer.addPass(this.tsH); this.composer.addPass(this.tsV);
      this.composer.addPass(new OutputPass());
    }
    this.resize(); addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(() => this.tick());
    if (this.mobile) this.bindPicking();
  }
  setActive(on) { if (on === this.active) return; this.active = on; this.renderer.setAnimationLoop(on ? () => this.tick() : null); if (on) { this.clock.getDelta(); this.resize(); } }
  resize() {
    const w = this.el.clientWidth || innerWidth, h = this.el.clientHeight || innerHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h);
      const k = 1.6; this.tsH.uniforms.h.value = k / w; this.tsV.uniforms.v.value = k / h;
    }
  }
  tween(dur, fn, done) { this.anims.push({ t: 0, dur, fn, done }); }
  tick() {
    const dt = Math.min(0.05, this.clock.getDelta()), time = this.clock.elapsedTime;
    this.anims = this.anims.filter((a) => { a.t += dt; const k = Math.min(1, a.t / a.dur); a.fn(k, dt); if (k >= 1) { a.done && a.done(); return false; } return true; });
    if (this.water && this.water.material.normalMap) { this.water.material.normalMap.offset.set(time * 0.012, time * 0.008); }
    if (this.water2) { this.water2.material.normalMap.offset.set(-time * 0.01, time * 0.014); }
    if (this.fog) this.fog.forEach((s) => { if (s.userData.leaving) return; s.position.y = s.userData.by + Math.sin(time * 0.6 + s.userData.ph) * 0.03; s.position.x = s.userData.bx + Math.sin(time * 0.25 + s.userData.ph) * 0.04; });
    if (this.robber) this.robber.rotation.y = Math.sin(time * 0.8) * 0.4;
    this.animateLife(dt, time);
    if (this.ships) for (const k in this.ships) { const m = this.ships[k]; m.children[0].position.y = Math.sin(time * 1.6 + +k) * 0.012; m.children[0].rotation.x = Math.sin(time * 1.2 + +k * 2) * 0.05; }
    if (this.tokens && this.tokens.length) { const az = Math.atan2(this.camera.position.x - this.controls.target.x, this.camera.position.z - this.controls.target.z); this.tokens.forEach((t) => (t.rotation.y = az)); }
    if (this.markers) this.markers.children.forEach((m) => { if (m.userData.glow) { m.material.opacity = 0.55 + Math.sin(time * 3 + m.userData.glow) * 0.3; return; } if (m.userData.pulse) { const s = 1 + Math.sin(time * 5) * 0.18; m.scale.setScalar(s * (m.userData.base || 1)); } });
    if (this.water && this.water.material.uniforms && this.water.material.uniforms.time) this.water.material.uniforms.time.value += dt * 0.35;
    this.controls.update();
    if (this.composer) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
  }
  // vida en el tablero: ovejas, pájaros, espuma, humo de chimeneas y ciclo de día y noche
  animateLife(dt, time) {
    const L = this.life; if (!L) return;
    if (L.walkers) this.animateWalkers(dt, time);
    L.foam.forEach((f) => { f.material.opacity = 0.22 + 0.2 * Math.sin(time * 1.3 + f.userData.ph); const k = 1 + 0.025 * Math.sin(time * 1.3 + f.userData.ph); f.scale.set(k, k, 1); });
    L.sheep.forEach((sh) => {
      const u = sh.userData; u.graze += dt;
      const walking = Math.sin(u.graze * 0.35) > 0.2;
      if (walking) { u.a += u.sp * dt * 3; const x = Math.cos(u.a) * u.r, z = Math.sin(u.a) * u.r; sh.position.set(x, u.T.h(x, z), z); sh.rotation.y = -u.a - (u.sp > 0 ? Math.PI / 2 : -Math.PI / 2); }
      const head = sh.children[1]; head.position.y = walking ? 0.08 : 0.05 + Math.abs(Math.sin(u.graze * 3)) * 0.01;
    });
    L.birds.forEach((fl) => {
      const u = fl.userData; u.a += u.sp * dt * 2;
      fl.position.set(Math.cos(u.a) * u.r, u.h + Math.sin(time * 0.5) * 0.15, Math.sin(u.a) * u.r);
      fl.rotation.y = -u.a + (u.sp > 0 ? Math.PI : 0);
      fl.children.forEach((b) => { const w = Math.sin(time * 9 + b.userData.ph) * 0.7; b.userData.wings[0].rotation.x = w; b.userData.wings[1].rotation.x = -w; });
    });
    // humo: cada edificio suelta bocanadas de vez en cuando
    if (this.pieces && L.smoke.length < 160) for (const k in this.pieces.v) {
      const m = this.pieces.v[k]; if (Math.random() > dt * (m.userData.t === 'c' ? 1.6 : 0.9)) continue;
      const p = new THREE.Mesh(SMOKE_GEO, new THREE.MeshStandardMaterial({ color: '#d8d4cc', transparent: true, opacity: 0.55, roughness: 1, depthWrite: false }));
      const off = new THREE.Vector3(rand(-0.08, 0.08), m.userData.t === 'c' ? 0.3 : 0.24, rand(-0.06, 0.06));
      p.position.copy(m.position).add(off); p.scale.setScalar(0.015); p.userData = { life: 0, vx: rand(-0.02, 0.05), vz: rand(-0.02, 0.03) };
      this.root.add(p); L.smoke.push(p);
    }
    L.smoke = L.smoke.filter((p) => {
      const u = p.userData; u.life += dt;
      p.position.y += dt * 0.12; p.position.x += u.vx * dt; p.position.z += u.vz * dt;
      p.scale.setScalar(0.015 + u.life * 0.022); p.material.opacity = Math.max(0, 0.55 * (1 - u.life / 3));
      if (u.life > 3) { this.root.remove(p); p.material.dispose(); return false; }
      return true;
    });
    // día y noche: un ciclo suave de 8 minutos (nunca llega a oscuro del todo)
    if (this.hq) {
      const ph = (time / 480) % 1, l = 0.78 + 0.22 * Math.cos(ph * Math.PI * 2);
      this.sun.intensity = 2.2 * l; this.sun.color.setRGB(1, 0.86 + 0.1 * l, 0.7 + 0.25 * l);
      this.sun.position.set(-6 * Math.cos(ph * Math.PI * 2), 11 * (0.6 + 0.4 * l), 6);
      this.renderer.toneMappingExposure = 0.95 * (0.8 + 0.2 * l);
    }
  }
  worldToScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera), r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
  }
  clear() {
    this.scene.remove(this.root); this.root = new THREE.Group(); this.scene.add(this.root);
    this.tiles = []; this.pieces = { v: {}, e: {} }; this.fog = []; this.robber = null; this.dice = null; this.water = null; this.water2 = null; this.tokens = []; this.ports = []; this.markers = null; this.hits = []; this.life = { sheep: [], birds: [], foam: [], smoke: [], walkers: {} }; this.ships = {};
  }
  setBoard(B, opts = {}) {
    this.clear(); this.B = B; SEED = (opts.seed || B.hexes.length * 7919 + Math.round(B.hexes[0].x * 1000)) | 0;
    const ex = B.hexes.reduce((m, h) => Math.max(m, Math.abs(h.x), Math.abs(h.y)), 0) + 1.6;
    this.extent = ex;
    // agua profunda + capa de reflejos
    const wm = new THREE.MeshStandardMaterial({ color: '#1a6d99', roughness: 0.22, metalness: 0.0, normalMap: this.waterTex, normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 0.9 });
    wm.normalMap.repeat.set(ex * 1.2, ex * 1.2);
    if (false) {
      this.water = new Water(new THREE.PlaneGeometry(ex * 8, ex * 8), { textureWidth: 1024, textureHeight: 1024, waterNormals: this.waterTex, sunDirection: this.sun.position.clone().normalize(), sunColor: 0xfff0d2, waterColor: 0x0d4f6e, distortionScale: 1.6, fog: true, alpha: 1 });
      this.water.material.uniforms.size.value = 3.5;
    } else this.water = new THREE.Mesh(new THREE.PlaneGeometry(ex * 8, ex * 8), wm);
    this.water.rotation.x = -Math.PI / 2; this.water.position.y = -0.1; this.water.receiveShadow = true; this.root.add(this.water);
    // aguas someras turquesa alrededor de la isla
    const sg = [], beach = [];
    const isSeaH = (h) => h.res === 'sea';
    const nearLand = (x, y) => B.hexes.some((h) => !isSeaH(h) && Math.hypot(h.x - x, h.y - y) < 1.9);
    B.sea.forEach((s) => { if (nearLand(s.x, s.y)) sg.push(paint(G_CYL6, '#5cc4d2', M(s.x, -0.115, s.y, 1.0, 0.03, 1.0))); });

    if (sg.length) {
      const sgm = mergeGeometries(sg); sgm.computeVertexNormals();
      const shallow = new THREE.Mesh(sgm, new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.75, roughness: 0.55, envMapIntensity: 0.3 }));
      shallow.position.y = 0.04; this.root.add(shallow);
    }
    // playa: un reborde de arena bajo las casillas de costa
    const beachMat = new THREE.MeshStandardMaterial({ color: '#e4d3a3', roughness: 0.95 }), shallowMat = new THREE.MeshStandardMaterial({ color: '#5cc4d2', transparent: true, opacity: 0.75, roughness: 0.55, envMapIntensity: 0.3 });
    // casillas
    const sideMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    const topMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, normalMap: this.detailTex, normalScale: new THREE.Vector2(0.7, 0.7) });
    const featMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
    const sideCol = { wood: '#5d4430', sheep: '#5d4430', wheat: '#6e5634', brick: '#6a3a24', ore: '#55595e', desert: '#a8925c' };
    this.tiles = B.hexes.map((h) => {
      const g = new THREE.Group(); g.position.set(h.x, 0, h.y);
      if (h.res === 'sea') { // casilla de mar navegable: sin tierra, solo agua (más clara junto a la costa)
        const base = new THREE.Group();
        if (h.nb.some((id) => B.hexes[id].res !== 'sea')) { const sh = new THREE.Mesh(G_CYL6, shallowMat); sh.position.y = -0.075; sh.scale.set(1, 0.03, 1); base.add(sh); }
        g.add(base); this.root.add(g);
        return { h, g, base, feat: new THREE.Group(), token: null, glow: new THREE.Mesh(), hidden: false, sea: true, T: { h: () => -0.1 } };
      }
      const T = makeTerrain(h.res, h.x, h.y);
      const land = new THREE.Group();
      const side = merged([paint(G_SIDE, sideCol[h.res], M(0, (TOP - 0.36) / 2, 0, 1, TOP + 0.36, 1))], sideMat);
      const top = new THREE.Mesh(hexTopGeo(h.res === 'ore' ? 16 : 10, T), topMat); top.receiveShadow = true; top.castShadow = true;
      const beach = new THREE.Mesh(G_CYL6, beachMat); beach.position.y = -0.06; beach.scale.set(1.07, 0.12, 1.07); beach.receiveShadow = true;
      land.add(side, top, beach); g.add(land);
      // espuma de las olas en la orilla
      const coastal = h.nb.length < 6 || h.nb.some((id) => B.hexes[id].res === 'sea');
      if (coastal) { const foam = new THREE.Mesh(FOAM_GEO, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.4, depthWrite: false })); foam.rotation.x = -Math.PI / 2; foam.rotation.z = Math.PI / 2; foam.position.y = -0.085; foam.userData.ph = Math.random() * 6; land.add(foam); this.life.foam.push(foam); }
      // ovejas que pastan y se mueven
      if (h.res === 'sheep') for (let k = 0; k < 2; k++) { const sh = sheepMesh(); const a = Math.random() * 6.28, r = 0.5; sh.position.set(Math.cos(a) * r, T.h(Math.cos(a) * r, Math.sin(a) * r), Math.sin(a) * r); sh.userData = { a, r, sp: rand(0.05, 0.12) * (Math.random() < 0.5 ? -1 : 1), T, graze: Math.random() * 6 }; land.add(sh); this.life.sheep.push(sh); }
      const FL = buildFeatures(h.res, T);
      const feat = new THREE.Group(); feat.add(merged(FL, featMat)); treeMeshes(FL.trees).forEach((im) => feat.add(im));
      vegetation(h.res, T, this.hq).forEach((im) => feat.add(im));
      g.add(feat);
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
      const mats = [1, 6, 2, 5, 3, 4].map((n) => new THREE.MeshStandardMaterial({ map: dieFaceTex(n), roughness: 0.35, transparent: true }));
      const ds = this.mobile ? 0.48 : 0.3, d = new THREE.Mesh(new THREE.BoxGeometry(ds, ds, ds), mats); d.castShadow = true; d.visible = false; this.root.add(d); return d;
    });
    if (opts.fog) this.buildFog(opts.revealed || {});
    const sc = this.sun.shadow.camera; sc.left = -ex; sc.right = ex; sc.top = ex; sc.bottom = -ex; sc.far = 60; sc.updateProjectionMatrix();
    this.camDist = this.fitDist();
    this.scene.fog.near = this.camDist * 1.4; this.scene.fog.far = this.camDist * 4;
    this.controls.maxDistance = Math.max(ex * 4, this.camDist * 1.6);
    // dos bandadas de pájaros dando vueltas sobre la isla
    for (let f = 0; f < 2; f++) {
      const flock = new THREE.Group(), n = 4 + rnd2(3);
      for (let i = 0; i < n; i++) { const b = birdMesh(); b.position.set(rand(-0.3, 0.3), rand(-0.1, 0.1), rand(-0.3, 0.3)); b.userData.ph = Math.random() * 6; flock.add(b); }
      flock.userData = { r: ex * rand(0.35, 0.7), h: rand(1.6, 2.4), sp: rand(0.05, 0.09) * (f ? -1 : 1), a: Math.random() * 6 };
      this.root.add(flock); this.life.birds.push(flock);
    }
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
      const nC = 6; // igual en mar y en tierra: las nubes no delatan dónde hay isla
      for (let i = 0; i < nC; i++) {
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
  syncShips(list, colors) {
    this.ships = this.ships || {};
    const seen = new Set(), B = this.B;
    const pose = (e) => { const E = B.edges[e], a = B.verts[E.v[0]], b = B.verts[E.v[1]]; return { x: (a.x + b.x) / 2, z: (a.y + b.y) / 2, ry: -Math.atan2(b.y - a.y, b.x - a.x) }; };
    (list || []).forEach((sh) => {
      seen.add(sh.id);
      let m = this.ships[sh.id];
      const P = pose(sh.e);
      if (m && (m.userData.lv || 1) !== (sh.lv || 1)) { this.root.remove(m); delete this.ships[sh.id]; m = null; } // mejorado: se cambia el modelo
      if (!m) {
        m = shipMesh(colors[sh.p], sh.lv || 1); m.userData = { e: sh.e, base: P, lv: sh.lv || 1 }; m.position.set(P.x, -0.06, P.z); m.rotation.y = P.ry;
        this.root.add(m); this.ships[sh.id] = m;
        if (this.ready) { m.position.y = 0.8; this.tween(0.8, (k) => { m.position.y = -0.06 + (1 - k) * (1 - k) * 0.86; }); }
      } else if (m.userData.e !== sh.e) {
        const from = m.userData.base, ry0 = m.rotation.y; let dr = P.ry - ry0; while (dr > Math.PI / 2) dr -= Math.PI; while (dr < -Math.PI / 2) dr += Math.PI;
        m.userData.e = sh.e; m.userData.base = P;
        this.tween(1.1, (k) => { const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; m.position.x = from.x + (P.x - from.x) * e; m.position.z = from.z + (P.z - from.z) * e; m.rotation.y = ry0 + dr * e; });
      }
    });
    for (const k in this.ships) if (!seen.has(+k)) { this.root.remove(this.ships[k]); delete this.ships[k]; }
  }
  syncPieces(s, colors) {
    if (s.ships) this.syncShips(s.ships, colors);
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
    this.syncWalkers(s, colors);
    if (s.robber !== this.robberHex) this.placeRobber(s.robber, !!this.ready);
    const rt = this.tiles[s.robber]; this.robber.visible = !(rt && rt.hidden);
  }
  syncWalkers(s, colors) {
    const B = this.B, W = this.life.walkers, want = new Set(), cap = this.mobile ? 40 : 70;
    let n = 0;
    s.buildings.forEach(([v, p, t]) => {
      const V = B.verts[v];
      V.hexes.forEach((hid) => {
        const tile = this.tiles[hid], H = B.hexes[hid];
        if (!tile || tile.sea || H.res === 'desert' || H.res === 'sea') return;
        for (let k = 0; k < (t === 'c' ? 2 : 1); k++) {
          if (n >= cap) return;
          const key = v + '-' + hid + '-' + k; want.add(key); n++;
          if (W[key]) { if (W[key].userData.p === p) continue; tile.g.remove(W[key]); }
          const w = walkerMesh(colors[p], H.res);
          const hx = V.x - H.x, hz = V.y - H.y, base = Math.atan2(hz, hx);
          const home = { x: hx * 0.8, z: hz * 0.8 };
          w.position.set(home.x, tile.T.h(home.x, home.z), home.z);
          w.userData = { p, tile, home, base, st: 'rest', t: Math.random() * 3 + k * 2, to: null, ph: Math.random() * 6 };
          w.visible = !tile.hidden;
          tile.g.add(w); W[key] = w;
        }
      });
    });
    for (const k in W) if (!want.has(k)) { W[k].userData.tile.g.remove(W[k]); delete W[k]; }
  }
  animateWalkers(dt, time) {
    const W = this.life.walkers;
    for (const k in W) {
      const w = W[k], u = w.userData; if (!w.visible && !u.tile.hidden) w.visible = true;
      u.t -= dt;
      if (u.st === 'rest' || u.st === 'work') {
        if (u.st === 'work') { w.rotation.z = Math.sin(time * 7 + u.ph) * 0.12; }
        if (u.t <= 0) {
          w.rotation.z = 0;
          if (u.st === 'rest') { const a = u.base + Math.PI + (Math.random() - 0.5) * 1.6, r = 0.25 + Math.random() * 0.3; u.to = { x: u.home.x + Math.cos(a) * r, z: u.home.z + Math.sin(a) * r }; u.st = 'go'; }
          else { u.to = { ...u.home }; u.st = 'back'; }
        }
        continue;
      }
      const dx = u.to.x - w.position.x, dz = u.to.z - w.position.z, d = Math.hypot(dx, dz), sp = 0.07 * dt;
      if (d < sp) { w.position.x = u.to.x; w.position.z = u.to.z; if (u.st === 'go') { u.st = 'work'; u.t = 2 + Math.random() * 3; } else { u.st = 'rest'; u.t = 1.5 + Math.random() * 3; } }
      else { w.position.x += (dx / d) * sp; w.position.z += (dz / d) * sp; w.rotation.y = Math.atan2(dx, dz); }
      w.position.y = u.tile.T.h(w.position.x, w.position.z);
    }
    for (const k in W) {
      const w = W[k], u = w.userData, walking = u.st === 'go' || u.st === 'back', sw = walking ? Math.sin(time * 12 + u.ph) * 0.6 : 0;
      const kids = w.children; kids[3].rotation.x = sw; kids[4].rotation.x = -sw; kids[5].visible = u.st === 'back' || u.st === 'rest' && u.t > 0 && u.carry;
      kids[0].position.y = 0.05 + (walking ? Math.abs(Math.sin(time * 12 + u.ph)) * 0.006 : 0);
      if (u.st === 'back') u.carry = true; else if (u.st === 'go') u.carry = false;
    }
  }
  drop(m, road) {
    if (!this.ready) return;
    if (road) { // tablón a tablón
      m.children.forEach((c) => {
        if (c.userData.plank === undefined) { c.scale.setScalar(0.01); this.tween(0.25, (k) => c.scale.setScalar(Math.max(0.01, k))); return; }
        const y0 = c.position.y, delay = c.userData.plank * PLANK_GAP; c.visible = false;
        this.tween(delay + PLANK_FALL, (k, dt) => {
          const tt = k * (delay + PLANK_FALL) - delay; if (tt < 0) return; c.visible = true;
          const e = Math.min(1, tt / PLANK_FALL); c.position.y = y0 + (1 - e * e) * 0.6;
        }, () => { c.position.y = y0; c.visible = true; });
      });
      return;
    }
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
    ray.setFromCamera(this.mobile ? new THREE.Vector2(0.05, 0.05) : new THREE.Vector2(0.58, -0.45), this.camera);
    if (!ray.ray.intersectPlane(plane, hit)) hit.set(this.extent * 0.6, 0.4, this.extent * 0.4);
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0).normalize();
    const fwd = new THREE.Vector3().subVectors(this.controls.target, this.camera.position).setY(0).normalize();
    const faceQ = { 1: [0, 0, Math.PI / 2], 6: [0, 0, -Math.PI / 2], 2: [0, 0, 0], 5: [Math.PI, 0, 0], 3: [-Math.PI / 2, 0, 0], 4: [Math.PI / 2, 0, 0] };
    // se ven bien al caer y, 2,5 s después de parar, se quedan semitransparentes para no tapar el mapa
    const rid = (this.rollId = (this.rollId || 0) + 1);
    this.dice.forEach((d) => d.material.forEach((m) => (m.opacity = 1)));
    setTimeout(() => { if (this.rollId === rid) this.tween(0.8, (k) => this.dice.forEach((d) => d.material.forEach((m) => (m.opacity = 1 - 0.55 * k)))); }, 1650 + 2500);
    [d1, d2].forEach((val, i) => {
      const die = this.dice[i]; die.visible = true;
      const big = this.mobile ? 1.6 : 1, end = hit.clone().add(right.clone().multiplyScalar((i - 0.5) * 0.5 * big)).add(fwd.clone().multiplyScalar(i * 0.12)); end.y = 0.4 + 0.15 * big;
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
  setTargets(T, sel, color = '#ffffff', kind = 'road', opt = {}) {
    if (this.markers) this.root.remove(this.markers);
    const shipE = new Set(opt.shipE || []), cityV = new Set(opt.cityV || []);
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
      if (opt.glow && !s) this.markers.add(this.halo(V.x, TOP + 0.1, V.y, cityV.has(id) ? '#ffb347' : '#ffd54a', 1.0));
      if (s) { const ghost = cityV.has(id) ? cityMesh(color) : settlementMesh(color); ghost.position.set(V.x, TOP, V.y); ghost.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.75; } }); this.markers.add(ghost); }
      this.markers.add(ring, dot, hit); this.hits.push(hit);
    });
    T.e.forEach((id) => {
      const E = B.edges[id], a = B.verts[E.v[0]], b = B.verts[E.v[1]], s = on('e', id);
      const len = Math.hypot(b.x - a.x, b.y - a.y) * 0.62, ang = -Math.atan2(b.y - a.y, b.x - a.x);
      const isShip = kind === 'ship' || shipE.has(id);
      const seaEdge = E.hexes.every((h) => B.hexes[h].res === 'sea'), ey = isShip || seaEdge ? 0.0 : TOP + 0.05;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, s ? 0.09 : 0.06), mk(isShip ? '#bfe9ff' : '#ffffff', s));
      if (opt.glow && !s) for (const k of [0.3, 0.5, 0.7]) this.markers.add(this.halo(a.x + (b.x - a.x) * k, ey + 0.08, a.y + (b.y - a.y) * k, isShip ? '#7fd3ff' : '#ffffff', 0.55)); bar.position.set((a.x + b.x) / 2, ey, (a.y + b.y) / 2); bar.rotation.y = ang; bar.renderOrder = 5;
      if (!s) bar.userData.pulse = true;
      const hit = new THREE.Mesh(new THREE.BoxGeometry(len, 0.2, 0.32), hitMat); hit.position.copy(bar.position); hit.rotation.y = ang; hit.userData = { k: 'e', id };
      if (s) { const ghost = isShip ? shipMesh(color) : roadMesh(color, len * 1.03); ghost.position.set((a.x + b.x) / 2, isShip ? -0.06 : TOP, (a.y + b.y) / 2); ghost.rotation.y = ang; this.markers.add(ghost); }
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
  halo(x, y, z, col, sc) {
    if (!this.glowTex) {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      this.glowTex = new THREE.CanvasTexture(c);
    }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: col, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.set(x, y, z); sp.scale.setScalar(sc); sp.renderOrder = 4; sp.userData.glow = Math.random() * 6; return sp;
  }
  bindPicking() {
    const el = this.renderer.domElement; let start = null, multi = false;
    el.addEventListener('pointerdown', (e) => { if (!e.isPrimary) { multi = true; return; } multi = false; start = { x: e.clientX, y: e.clientY, t: Date.now() }; });
    el.addEventListener('pointerup', (e) => {
      if (!e.isPrimary || !start || multi) return;
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y), dt = Date.now() - start.t; start = null;
      if (moved > 10 || dt > 600) return;
      if (!this.hits.length) { if (this.onMiss) this.onMiss(); return; }
      const r = el.getBoundingClientRect(), ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
      const hit = ray.intersectObjects(this.hits, false)[0];
      if (hit && this.onPick) this.onPick({ k: hit.object.userData.k, id: hit.object.userData.id });
      else if (!hit && this.onMiss) this.onMiss();
    });
  }
}
export { settlementMesh, cityMesh, roadMesh, robberMesh, shipMesh };
