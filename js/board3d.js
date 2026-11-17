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
function trophyMesh(kind, color) {
  const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: '#5b3d24', roughness: 0.8 }), gold = new THREE.MeshStandardMaterial({ color: '#d9b44a', metalness: 0.6, roughness: 0.35 });
  const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide });
  const h = kind === 'army' ? 0.5 : 0.42;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, h, 8), wood); pole.position.y = h / 2; g.add(pole);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), gold); knob.position.y = h + 0.01; g.add(knob);
  const flag = new THREE.Group(); flag.position.y = h - 0.02; g.add(flag);
  if (kind === 'longest') { // banderín largo en punta (camino más largo)
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0.2, -0.035); sh.lineTo(0, -0.07); sh.lineTo(0, 0);
    const f = new THREE.Mesh(new THREE.ShapeGeometry(sh), cloth); flag.add(f);
    const road = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.008, 0.004), gold); road.position.set(0.05, -0.035, 0.002); flag.add(road);
  } else { // estandarte cuadrado con espadas cruzadas (mayor ejército)
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.12), cloth); f.position.set(0.075, -0.06, 0); flag.add(f);
    const border = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.13), gold); border.position.set(0.075, -0.06, -0.001); flag.add(border);
    [-1, 1].forEach((d) => { const sw = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.1, 0.003), new THREE.MeshStandardMaterial({ color: '#e8e8ee', metalness: 0.7, roughness: 0.3 })); sw.position.set(0.075, -0.06, 0.003); sw.rotation.z = d * 0.6; flag.add(sw); });
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.flag = flag;
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
// icono de recurso como imagen (tema barrio): devuelve la imagen o null si es un emoji normal
const ICON_IMG = {};
function iconImg(e) { const m = typeof e === 'string' && e.match(/^<img[^>]*src="([^"]+)"/); if (!m) return null; if (!ICON_IMG[m[1]]) { const im = new Image(); im.src = m[1]; ICON_IMG[m[1]] = im; } return ICON_IMG[m[1]]; }
// lienzo que se vuelve a pintar cuando la imagen del icono termina de cargar
function iconCanvasTex(w, h, img, draw) {
  const t = canvasTex(w, h, draw);
  if (img && !img.complete) img.addEventListener('load', () => { const c = t.image, g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); draw(g, c.width, c.height); t.needsUpdate = true; }, { once: true });
  return t;
}
function labelTex(text, sub) {
  const img = iconImg(text);
  if (img) return iconCanvasTex(256, 160, img, (g, w, h) => {
    g.fillStyle = 'rgba(247,237,211,0.97)'; g.strokeStyle = '#8b6b3e'; g.lineWidth = 8;
    g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 34); g.fill(); g.stroke();
    if (img.complete && img.naturalWidth) g.drawImage(img, 22, 26, 108, 108);
    g.fillStyle = '#2b2118'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 54px Fredoka, system-ui, sans-serif'; g.fillText(sub || '', w / 2 + 52, h / 2 + 4);
  });
  return canvasTex(256, 160, (g, w, h) => {
    g.fillStyle = 'rgba(247,237,211,0.97)'; g.strokeStyle = '#8b6b3e'; g.lineWidth = 8;
    g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 34); g.fill(); g.stroke();
    g.fillStyle = '#2b2118'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (sub) { g.font = '72px system-ui, sans-serif'; g.fillText(text, w / 2 - 50, h / 2 + 4); g.font = '700 54px Fredoka, system-ui, sans-serif'; g.fillText(sub, w / 2 + 52, h / 2 + 4); }
    else { g.font = '700 70px Fredoka, system-ui, sans-serif'; g.fillText(text, w / 2, h / 2 + 4); }
  });
}
function textSprite(text, size = 0.5, color = '#fff') {
  const img = iconImg(text.replace(/^\+/, ''));
  if (img) { // «+» y el icono dibujado
    const t2 = iconCanvasTex(512, 160, img, (g, w, h) => { g.font = '700 96px Fredoka, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 14; g.strokeStyle = 'rgba(0,0,0,.55)'; g.strokeText('+', w / 2 - 70, h / 2); g.fillStyle = color; g.fillText('+', w / 2 - 70, h / 2); if (img.complete && img.naturalWidth) g.drawImage(img, w / 2 - 20, 10, 140, 140); });
    const s2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: t2, transparent: true, depthWrite: false, depthTest: false })); s2.scale.set(size * 3.2, size, 1); s2.renderOrder = 10; return s2;
  }
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
// ventanas: se encienden de noche (un solo material para todas, la luz la marca el ciclo de día y noche)
const WIN_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: '#ffb347', emissiveIntensity: 0 });
const WIN_COL = C('#ffd98a');
const LAMP_MAT = new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffd27a', emissiveIntensity: 0.2, roughness: 0.3 });
let GLOW_TEX = null;
function glowTex() { return GLOW_TEX || (GLOW_TEX = canvasTex(128, 128, (c) => { const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,214,140,0.9)'); g.addColorStop(0.5, 'rgba(255,190,100,0.35)'); g.addColorStop(1, 'rgba(255,170,80,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); })); }
const STEAM_MAT = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0, color: '#e8eef2', map: null });
let PUM_TEX = null;
function pumTex() { return PUM_TEX || (PUM_TEX = canvasTex(256, 160, (c, W, H) => { c.fillStyle = '#ffeb3b'; c.strokeStyle = '#111'; c.lineWidth = 8; c.beginPath(); for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, r = i % 2 ? 58 : 76; c.lineTo(W / 2 + Math.cos(a) * r * 1.5, H / 2 + Math.sin(a) * r); } c.closePath(); c.fill(); c.stroke(); c.font = '900 64px Impact, Arial Black'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#e53935'; c.lineWidth = 6; c.strokeText('PUM!', W / 2, H / 2 + 4); c.fillText('PUM!', W / 2, H / 2 + 4); })); }
// punto de la acera de una manzana (local a la casilla) en la dirección del ángulo
function sideRing(a) {
  let d = ((a % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3); if (d > Math.PI / 6) d -= Math.PI / 3;
  const r = 0.69 / Math.cos(d) - 0.02; return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}
function pigeonMesh() {
  const g = new THREE.Group(), grey = new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.9 }), dark = new THREE.MeshStandardMaterial({ color: '#4b5157', roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), grey); body.scale.set(1, 0.8, 1.5); body.position.y = 0.012; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 6), dark); head.position.set(0, 0.024, 0.014); g.add(head);
  const neck = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 5), new THREE.MeshStandardMaterial({ color: '#3d7a5f', metalness: 0.5, roughness: 0.3 })); neck.position.set(0, 0.018, 0.011); g.add(neck);
  const wg = new THREE.BoxGeometry(0.022, 0.002, 0.014); wg.translate(0.011, 0, 0);
  const wl = new THREE.Mesh(wg, grey), wr = new THREE.Mesh(wg, grey); wl.position.set(0.006, 0.016, -0.002); wr.position.set(-0.006, 0.016, -0.002); wr.rotation.y = Math.PI; g.add(wl, wr);
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.003, 0.008), dark); tip.position.set(0, 0.013, -0.02); g.add(tip);
  g.userData.wings = [wl, wr]; g.userData.head = head; return g;
}
const GLOW_MAT = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending });
function withWindows(L) {
  const win = [], rest = [];
  L.forEach((g) => { const c = g.attributes.color; (c && Math.abs(c.getX(0) - WIN_COL.r) < 1e-4 && Math.abs(c.getY(0) - WIN_COL.g) < 1e-4 && Math.abs(c.getZ(0) - WIN_COL.b) < 1e-4 ? win : rest).push(g); });
  const grp = new THREE.Group(); grp.add(merged(rest, pieceMat()));
  if (win.length) { const w = merged(win, WIN_MAT); w.castShadow = false; grp.add(w); }
  return grp;
}
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
  if (THEME === 'barrio') return garitoMesh(color);
  const L = [];
  house(L, -0.055, -0.03, 0.1, 0.085, 0.065, color, 0.35);
  house(L, 0.06, -0.025, 0.095, 0.08, 0.06, color, -0.4);
  house(L, 0.0, 0.065, 0.11, 0.085, 0.07, color, 0.05);
  T_(L, G_ICO0, '#4f7f30', 0.075, 0.018, 0.075, 0.022, 0.018, 0.022);   // arbusto
  T_(L, G_CYL8, '#8a8378', -0.085, 0.02, 0.06, 0.018, 0.04, 0.018);     // pozo
  T_(L, G_CYL8, '#2c4a66', -0.085, 0.041, 0.06, 0.013, 0.003, 0.013);
  return withWindows(L);
}
// Ciudad: casas grandes de dos alturas y una iglesia con campanario
function cityMesh(color) {
  if (THEME === 'barrio') return mansionMesh(color);
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
  return withWindows(L);
}
// Camino: vigas + tablones sueltos (cada tablón cae por separado)
function roadMesh(color, len, p) {
  if (THEME === 'barrio') return streetClaimMesh(color, len, NAMES[p]);
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
  if (THEME === 'barrio') return carBody(color, lv);
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
  if (THEME === 'barrio') return policeMesh();
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
    // (las animaciones que se crean al terminar otra se guardan aparte para no perderlas)
    const list = this.anims; this.anims = [];
    const keep = list.filter((a) => { a.t += dt; const k = Math.min(1, a.t / a.dur); a.fn(k, dt); if (k >= 1) { a.done && a.done(); return false; } return true; });
    this.anims = keep.concat(this.anims);
    if (this.water && this.water.material.normalMap) { this.water.material.normalMap.offset.set(time * 0.012, time * 0.008); }
    if (this.water2) { this.water2.material.normalMap.offset.set(-time * 0.01, time * 0.014); }
    if (this.fog) this.fog.forEach((s) => { if (s.userData.leaving) return; s.position.y = s.userData.by + Math.sin(time * 0.6 + s.userData.ph) * 0.03; s.position.x = s.userData.bx + Math.sin(time * 0.25 + s.userData.ph) * 0.04; });
    if (this.robber && this.theme !== 'barrio') this.robber.rotation.y = Math.sin(time * 0.8) * 0.4;
    this.animateLife(dt, time);
    if (this.ships) for (const k in this.ships) { const m = this.ships[k];
      if (this.theme === 'barrio') { const hop = Math.pow(Math.abs(Math.sin(time * 2.4 + +k)), 10); m.children[0].position.y = hop * 0.05; m.children[0].rotation.z = Math.sin(time * 1.2 + +k) * 0.12 * hop; m.children[0].rotation.x = Math.sin(time * 2.4 + +k) * 0.08 * hop; }
      else { m.children[0].position.y = Math.sin(time * 1.6 + +k) * 0.012; m.children[0].rotation.x = Math.sin(time * 1.2 + +k * 2) * 0.05; } }
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
    if (this.traffic) this.animateTraffic(dt);
    if (this.pigeons) this.pigeons.forEach((g) => {
      const u = g.userData;
      if (u.st === 'ground') {
        g.children.forEach((p) => { p.userData.head.position.y = 0.024 - Math.max(0, Math.sin(time * 4 + p.userData.ph)) * 0.008; p.userData.wings.forEach((w) => (w.rotation.z = 0)); });
        const near = (this.traffic || []).some((c) => c.road && c.m.position.distanceToSquared(g.position) < 0.04);
        if (near) { u.st = 'fly'; u.t = 0; u.dir = Math.random() * 6; }
      } else {
        u.t += dt; const up = u.t < 3 ? u.t : 6 - u.t;
        g.children.forEach((p, i) => { const h = p.userData.home; p.position.set(h.x + Math.cos(u.dir + i) * up * 0.25, Math.max(0, up) * 0.35 + (u.t < 3 ? 0 : 0), h.z + Math.sin(u.dir + i) * up * 0.25); const w = Math.sin(time * 30 + i) * 0.9; p.userData.wings[0].rotation.z = w; p.userData.wings[1].rotation.z = -w; p.rotation.y = -u.dir - i + Math.PI / 2 + (u.t < 3 ? 0 : Math.PI); });
        if (u.t >= 6) { u.st = 'ground'; g.children.forEach((p) => { p.position.copy(p.userData.home); }); }
      }
    });
    if (this.steam) this.steam.forEach((st) => { const u = st.userData; u.t = (u.t + dt * 0.35) % 1; st.position.set(u.x + Math.sin(u.t * 5) * 0.015, TOP + 0.01 + u.t * 0.22, u.z); st.scale.setScalar(0.5 + u.t * 1.2); st.material.opacity = Math.sin(u.t * Math.PI) * 0.35; st.quaternion.copy(this.camera.quaternion); });
    if (this.pino) this.pino.forEach((w, i) => { w.rotation.x = Math.sin(time * 2 + i) * 0.08; w.children[3].rotation.x = Math.sin(time * 3 + i) * 0.4; w.children[4].rotation.x = -Math.sin(time * 3 + i) * 0.4; });
    if (this.neons) { const nk = GLOW_MAT.opacity / 0.85; this.neons.forEach((m, i) => { const f = Math.sin(time * 37 + i * 11) > 0.97 || (Math.sin(time * 0.7 + i) > 0.92 && Math.sin(time * 23) > 0); const v = f ? 0.35 : 0.75 + nk * 0.25; m.material.color.setRGB(v, v, v); }); }
    if (this.courts) this.courts.forEach((c) => { // partido: se mueven, el balón va de uno a otro botando
      c.kids.forEach((k, i) => { k.position.x += Math.sin(time * 1.3 + i * 2) * dt * 0.06; k.position.z = (i % 2 ? 0.1 : -0.1) + Math.sin(time * 0.9 + i) * 0.08; k.rotation.y = Math.sin(time + i) * 0.8; });
      const ph = (time * 0.6) % 4, i0 = Math.floor(ph), f = ph - i0, A = c.kids[i0], Bk = c.kids[(i0 + 1) % 4];
      c.ball.position.set(A.position.x + (Bk.position.x - A.position.x) * f, c.y + 0.02 + Math.abs(Math.sin(f * Math.PI * 3)) * 0.07, A.position.z + (Bk.position.z - A.position.z) * f);
      c.fire.scale.set(1 + Math.sin(time * 17) * 0.15, 1 + Math.sin(time * 23) * 0.25, 1 + Math.cos(time * 19) * 0.15); c.fire.material.color.setHSL(0.09 + Math.sin(time * 11) * 0.02, 1, 0.55);
    });
    if (this.props) this.props.forEach((p) => { if (p.userData.spin) p.rotation.y += dt * 0.8; if (p.userData.face) p.rotation.y = Math.atan2(this.camera.position.x - p.getWorldPosition(new THREE.Vector3()).x, this.camera.position.z - p.getWorldPosition(new THREE.Vector3()).z) - p.parent.parent.parent.rotation.y; });
    if (this.robber && this.robber.userData.lights) { const li = this.robber.userData.lights, fast = this.robber.userData.chasing ? 9 : 3.5, on = Math.sin(time * fast) > 0; li.red.visible = on; li.blue.visible = !on; li.glowR.intensity = on ? 1.4 : 0; li.glowB.intensity = on ? 0 : 1.4; }
    if (this.victoryOn && this.victoryOn.verts.length) { const vo = this.victoryOn; vo.t -= dt; if (vo.t <= 0) { const V = vo.verts[Math.floor(Math.random() * vo.verts.length)]; this.firework(V.x + rand(-0.1, 0.1), V.y + rand(-0.1, 0.1), vo.color); vo.t = 0.35 + Math.random() * 0.5; } }
    if (this.aura && !this.aura.userData.fading) { const [veil, ring] = this.aura.userData.mats; if (veil.opacity > 0.05) { veil.opacity = 0.38 + 0.06 * Math.sin(time * 1.6); ring.opacity = 0.4 + 0.2 * Math.sin(time * 2.3); } }
    if (this.trophies) Object.values(this.trophies).forEach((tr) => { if (tr && tr.userData.flag) tr.userData.flag.rotation.y = Math.sin(time * 2.2 + tr.userData.ph) * 0.25; });
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
    if (this.pieces && this.theme !== 'barrio' && L.smoke.length < 160) for (const k in this.pieces.v) {
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
    // en todas las pantallas a la vez (va por la hora real), así todos ven el mismo momento del día
    {
      if (this.sunI0 === undefined) { this.sunI0 = this.sun.intensity; this.exp0 = this.renderer.toneMappingExposure; }
      const ph = (Date.now() / 1000 / 480) % 1, l = 0.7 + 0.3 * Math.cos(ph * Math.PI * 2);
      this.sun.intensity = this.sunI0 * l; this.sun.color.setRGB(0.85 + 0.15 * l, 0.8 + 0.16 * l, 0.75 + 0.25 * l);
      this.sun.position.set(-6 * Math.cos(ph * Math.PI * 2), 11 * (0.6 + 0.4 * l), 6);
      this.renderer.toneMappingExposure = this.exp0 * (0.78 + 0.22 * l);
      WIN_MAT.emissiveIntensity = Math.max(0, Math.min(1.6, (0.74 - l) * 6)); // de noche las ventanas se encienden
      const nk = Math.max(0, Math.min(1, (0.8 - l) * 4)); LAMP_MAT.emissiveIntensity = 0.2 + nk * 2.2; GLOW_MAT.opacity = nk * 0.85; if (!GLOW_MAT.map) GLOW_MAT.map = glowTex();
    }
  }
  worldToScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera), r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
  }
  clear() {
    this.scene.remove(this.root); this.root = new THREE.Group(); this.scene.add(this.root);
    this.tiles = []; this.pieces = { v: {}, e: {} }; this.fog = []; this.robber = null; this.dice = null; this.water = null; this.water2 = null; this.tokens = []; this.ports = []; this.markers = null; this.hits = []; this.life = { sheep: [], birds: [], foam: [], smoke: [], walkers: {} }; this.ships = {}; this.trophies = null; this.aura = null; this.tape = null; this.victoryOn = null; this.traffic = null; this.props = null; this.courts = null; this.pigeons = null; this.steam = null; this.pino = null; this.neons = null; this.cops = null; this.heli = null; this.fights = []; this.rings = null; this.highway = null; this.streetAdj = null; if (this.controls) this.controls.autoRotate = false;
  }
  /* ---------- barrio: casillas, calles, autovía y tráfico ---------- */
  // la casa va en la esquina de una de las manzanas del cruce (la que mejor se ve) y en las otras dos esquinas, colegas de la banda
  cornerize(m, vId, color, big) {
    const B = this.B, V = B.verts[vId], lands = V.hexes.map((h) => B.hexes[h]).filter((H) => H && H.res !== 'sea');
    if (!lands.length) return;
    m.rotation.y = 0;
    const main = lands.slice().sort((a, b) => b.y - a.y)[0];
    const bld = m.children[0]; if (!bld) return;
    const k = big ? 0.31 : 0.29;
    bld.position.set((main.x - V.x) * k, WALL_H, (main.y - V.y) * k);
    bld.rotation.y = Math.atan2(V.x - main.x, V.y - main.y); // la fachada mira al cruce
    lands.filter((H) => H !== main).forEach((H) => {
      const dx = H.x - V.x, dz = H.y - V.y, l = Math.hypot(dx, dz), px = -dz / l, pz = dx / l;
      [-1, 1].concat(big ? [0] : []).forEach((sd) => {
        const w = walkerMesh(color, null); w.scale.setScalar(1.8);
        w.position.set(dx * 0.11 + px * sd * 0.05, 0.005, dz * 0.11 + pz * sd * 0.05); w.rotation.y = Math.atan2(-dx, -dz) + sd * 0.4; m.add(w);
      });
    });
  }
  barrioTile(h, g) {
    const T = { h: () => TOP + 0.02 };
    const land = new THREE.Group();
    const side = new THREE.Mesh(G_SIDE, new THREE.MeshStandardMaterial({ color: '#77736c', roughness: 0.9 })); side.scale.set(1, TOP + 0.36, 1); side.position.y = (TOP - 0.36) / 2;
    const top = barrioGround(h.res); land.add(side, top); g.add(land);
    const walls = barrioWalls(h.res); if (walls) land.add(walls);
    const feat = new THREE.Group(); const blk = barrioBlock(h.res); if (h.res !== 'desert') blk.scale.set(1.2, 1.35, 1.2); feat.add(blk); g.add(feat);
    if (blk.userData.prop) (this.props = this.props || []).push(blk.userData.prop);
    if (blk.userData.court) (this.courts = this.courts || []).push(blk.userData.court);
    if (blk.userData.neons) (this.neons = this.neons || []).push(...blk.userData.neons);
    let token = null;
    if (h.num) {
      token = new THREE.Group();
      const disc = new THREE.Mesh(TOKEN_GEO, TOKEN_MAT); disc.castShadow = true;
      const face = new THREE.Mesh(TOKEN_FACE, new THREE.MeshStandardMaterial({ map: tokenTex(h.num), roughness: 0.7 })); face.rotation.x = -Math.PI / 2; face.position.y = 0.026;
      token.add(disc, face); token.scale.setScalar(0.8); token.userData.y0 = TOP + WALL_H + 0.03; token.position.set(0, token.userData.y0, 0.44);
      g.add(token); this.tokens.push(token);
    }
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 0.98, 0.3, 6, 1, true), new THREE.MeshBasicMaterial({ color: '#fff6c2', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    glow.position.y = TOP + 0.12; g.add(glow);
    this.root.add(g);
    return { h, g, base: land, top, feat, token, glow, hidden: false, T };
  }
  barrioStreets() {
    const B = this.B, landH = (id) => B.hexes[id] && B.hexes[id].res !== 'sea';
    // líneas amarillas discontinuas por el centro de cada calle
    const L = [];
    B.edges.forEach((E) => {
      const a = B.verts[E.v[0]], b = B.verts[E.v[1]], ang = -Math.atan2(b.y - a.y, b.x - a.x);
      for (let k = 1; k <= 3; k++) { const t = k / 4; L.push(paint(G_BOX, '#f5d142', M(a.x + (b.x - a.x) * t, TOP + 0.002, a.y + (b.y - a.y) * t, 0.12, 0.004, 0.012, ang))); }
    });
    if (L.length) { const m = merged(L, new THREE.MeshBasicMaterial({ vertexColors: true })); m.castShadow = false; this.root.add(m); }
    // grafo de calles (cruces y tramos) para el tráfico y la pasma
    const ok = (v) => B.verts[v].hexes.some(landH);
    this.streetAdj = B.verts.map((V) => (ok(V.id) ? V.adj.filter(ok) : []));
    this.streetProps(landH);
    this.barrioOuter();
    // tráfico: coches normales por las calles
    const palette = ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#ffffff', '#212121', '#8e24aa', '#ff7043', '#90a4ae'];
    this.traffic = [];
    const nodes = this.streetAdj.map((a, i) => (a.length ? i : -1)).filter((i) => i >= 0);
    const nStreet = Math.min(this.mobile ? 8 : 14, Math.round(nodes.length / 5));
    for (let i = 0; i < nStreet; i++) {
      const c = carBody(palette[i % palette.length], 1); c.scale.setScalar(0.62); this.root.add(c);
      const a = nodes[Math.floor(Math.random() * nodes.length)], b = this.streetAdj[a][0];
      this.traffic.push({ m: c, a, b, t: Math.random(), sp: rand(0.35, 0.6), road: true });
    }
  }
  // la ciudad amurallada: un anillo de edificios alrededor del tablero (sin pistas de dónde hay negocios)
  barrioOuter() {
    const B = this.B, L = [], G = [];
    const ring = B.sea || [];
    ring.forEach((h, i) => {
      G.push(barrioGroundGeo(h.x, h.y, '#9a968e'));
      const hh = 0.3 + ((i * 37) % 7) * 0.035, sc = WAP / 0.866, col = ['#8d8478', '#9b8f80', '#7f7a74', '#a3978a', '#86807a'][i % 5];
      L.push(paint(G_CYL6, col, M(h.x, TOP + hh / 2, h.y, sc, hh, sc)));
      L.push(paint(G_CYL6, shade(col, 0.8), M(h.x, TOP + hh + 0.01, h.y, sc * 0.94, 0.02, sc * 0.94)));
      for (let f = 0; f < 6; f++) { // ventanas por plantas en cada fachada (se encienden de noche)
        const a = (Math.PI / 3) * f, nx = Math.cos(a), nz = Math.sin(a);
        for (let fl = 0; WALL_H + 0.05 + fl * 0.085 < hh - 0.03; fl++) for (let w = -2; w <= 2; w++) {
          if (((i + f + fl + w) * 7) % 5 === 0) continue;
          const yy = TOP + WALL_H + 0.05 + fl * 0.085, tx = -nz, tz = nx;
          L.push(paint(G_BOX, (i + f + fl * 3 + w) % 3 ? '#ffd98a' : '#3a4048', M(h.x + nx * (WAP + 0.003) + tx * w * 0.13, yy, h.y + nz * (WAP + 0.003) + tz * w * 0.13, 0.008, 0.045, 0.07, -a)));
        }
      }
      L.push(paint(G_BOX, '#b0b0b0', M(h.x + 0.15, TOP + hh + 0.04, h.y - 0.1, 0.12, 0.06, 0.09))); // aire acondicionado / depósito en el tejado
    });
    if (G.length) { const g = merged(G, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true })); g.receiveShadow = true; this.root.add(g); }
    if (L.length) { const m = withWindows(L); m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); this.root.add(m); }
  }
  // modo coches: las casillas vacías son descampados con muro, tierra, tiendas de campaña y algún coche abandonado
  barrioLot(h, g) {
    const land = new THREE.Group(), L = [], id = h.id, rr = (k) => ((id * 9301 + k * 49297) % 233280) / 233280;
    land.add(merged([barrioGroundGeo(0, 0, '#8a7a62')], new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true })));
    const gate = id % 6;
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i, x = Math.cos(a) * WAP, z = Math.sin(a) * WAP, len = WAP * 1.1547 + 0.012;
      if (i === gate) { const tx = -Math.sin(a), tz = Math.cos(a), part = (len - 0.24) / 2; [-1, 1].forEach((sd) => L.push(paint(G_BOX, '#7f7b75', M(x + tx * sd * (0.12 + part / 2), TOP + WALL_H / 2, z + tz * sd * (0.12 + part / 2), 0.024, WALL_H, part, -a)))); }
      else L.push(paint(G_BOX, i % 2 ? '#86827c' : '#7f7b75', M(x, TOP + WALL_H / 2, z, 0.024, WALL_H, len, -a)));
    }
    for (let k = 0; k < 14; k++) L.push(paint(G_CONE4, '#6b7d3a', M((rr(k) - 0.5) * 0.9, TOP + 0.015, (rr(k + 50) - 0.5) * 0.8, 0.012, 0.03, 0.012, rr(k + 9) * 6))); // hierbajos
    const kind = id % 3;
    if (kind === 0 || kind === 2) [[-0.18, -0.1, '#1e88e5'], [0.05, -0.22, '#ef6c00']].slice(0, kind === 0 ? 2 : 1).forEach(([x, z, c]) => { L.push(paint(G_CONE4, c, M(x, TOP + 0.05, z, 0.11, 0.1, 0.09, 0.3))); L.push(paint(G_BOX, '#222', M(x + 0.06, TOP + 0.02, z, 0.004, 0.03, 0.02, 0.3))); }); // tiendas de campaña
    if (kind !== 2) { L.push(paint(G_CYL8, '#6d4c41', M(0.22, TOP + 0.035, 0.15, 0.025, 0.07, 0.025))); L.push(paint(G_CONE4, '#ff9800', M(0.22, TOP + 0.085, 0.15, 0.018, 0.04, 0.018))); } // bidón
    for (let k = 0; k < 3; k++) L.push(paint(new THREE.TorusGeometry(1, 0.4, 6, 12), '#1b1b1b', M(-0.25, TOP + 0.012 + k * 0.022, 0.22, 0.03, 0.03, 0.03, 0, Math.PI / 2))); // ruedas apiladas
    land.add(merged(L, MAT_()));
    if (kind !== 0) { const car = carBody('#8d6e63', 1); car.scale.setScalar(0.8); car.position.set(0.1, TOP, 0.05); car.rotation.set(0, rr(3) * 6, 0.08); car.traverse((o) => { if (o.isMesh && o.material && o.material.color) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.7); } }); land.add(car); } // coche abandonado
    land.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.add(land); this.root.add(g);
    return { h, g, base: land, feat: new THREE.Group(), token: null, glow: new THREE.Mesh(), hidden: false, sea: true, T: { h: () => TOP } };
  }
  streetProps(landH) {
    const B = this.B, P = [], glows = [], lampHeads = [];
    let n = 0; this.coastIn = {}; this.pigeons = []; this.steam = [];
    const puddleM = new THREE.MeshStandardMaterial({ color: '#23262c', roughness: 0.04, metalness: 0.85, transparent: true, opacity: 0.85 });
    B.edges.forEach((E) => {
      const hs = E.hexes.filter(landH); if (!hs.length) return;
      const a = B.verts[E.v[0]], b = B.verts[E.v[1]], mx = (a.x + b.x) / 2, mz = (a.y + b.y) / 2;
      let ex = b.x - a.x, ez = b.y - a.y; const el = Math.hypot(ex, ez); ex /= el; ez /= el;
      if (false) { const H = B.hexes[hs[0]]; let ix = H.x - mx, iz = H.y - mz; const il = Math.hypot(ix, iz); this.coastIn[Math.min(E.v[0], E.v[1]) + '-' + Math.max(E.v[0], E.v[1])] = [ix / il, iz / il]; }
      const kk = (E.id * 13) % 11;
      if (kk === 3) { const pd = new THREE.Mesh(new THREE.CircleGeometry(0.06, 14), puddleM); pd.rotation.x = -Math.PI / 2; pd.scale.set(1.5, 0.8, 1); pd.position.set(mx + ex * 0.15, TOP + 0.003, mz + ez * 0.15); this.root.add(pd); }
      if (kk === 6 && hs.length === 2) { // alcantarilla con vapor
        P.push(paint(G_CYL12, '#2b2b2b', M(mx - ex * 0.18, TOP + 0.002, mz - ez * 0.18, 0.035, 0.004, 0.035)));
        for (let i = 0; i < 3; i++) { const st = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.08), STEAM_MAT.clone()); st.userData = { x: mx - ex * 0.18, z: mz - ez * 0.18, t: i / 3 }; this.root.add(st); this.steam.push(st); }
      }
      hs.forEach((hid) => {
        const H = B.hexes[hid]; let nx = H.x - mx, nz = H.y - mz; const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
        const sx = mx + nx * 0.185, sz = mz + nz * 0.185, k = (n++ * 7 + hid * 3) % 9, ang = Math.atan2(nx, nz);
        if (k === 0 || k === 5) { // farola con el brazo sobre la calzada
          const fx = sx + ex * 0.3, fz = sz + ez * 0.3;
          P.push(paint(G_CYL8, '#3d4045', M(fx, TOP + 0.16, fz, 0.008, 0.32, 0.008)));
          P.push(paint(G_BOX, '#3d4045', M(fx - nx * 0.05, TOP + 0.315, fz - nz * 0.05, 0.012, 0.01, 0.1, -ang + Math.PI)));
          lampHeads.push(paint(G_BOX, '#fff3c4', M(fx - nx * 0.1, TOP + 0.305, fz - nz * 0.1, 0.02, 0.012, 0.03, -ang + Math.PI)));
          glows.push([fx - nx * 0.1, fz - nz * 0.1]);
        } else if (k === 2) { // contenedor de basura verde con bolsas
          const cx = sx - ex * 0.28 + nx * 0.005, cz = sz - ez * 0.28 + nz * 0.005;
          P.push(paint(G_BOX, '#2e6b3a', M(cx, TOP + 0.03, cz, 0.1, 0.06, 0.05, -ang + Math.PI / 2)));
          P.push(paint(G_BOX, '#244f2c', M(cx, TOP + 0.064, cz, 0.104, 0.008, 0.054, -ang + Math.PI / 2)));
          P.push(paint(G_ICO0, '#1b1b1b', M(cx + ex * 0.07, TOP + 0.015, cz + ez * 0.07, 0.022, 0.018, 0.022)));
          P.push(paint(G_ICO0, '#2a2a2a', M(cx + ex * 0.085 - nx * 0.02, TOP + 0.012, cz + ez * 0.085 - nz * 0.02, 0.016, 0.014, 0.016)));
        } else if (k === 4) { // banco pegado al muro con alguien sentado
          const cx = sx + nx * 0.035 - ex * 0.05, cz = sz + nz * 0.035 - ez * 0.05, ry = -ang + Math.PI / 2;
          P.push(paint(G_BOX, '#8d6e63', M(cx, TOP + 0.03, cz, 0.12, 0.008, 0.03, ry)));
          P.push(paint(G_BOX, '#8d6e63', M(cx + nx * 0.014, TOP + 0.05, cz + nz * 0.014, 0.12, 0.03, 0.006, ry)));
          [-1, 1].forEach((sd) => P.push(paint(G_BOX, '#333', M(cx + ex * sd * 0.05, TOP + 0.015, cz + ez * sd * 0.05, 0.006, 0.03, 0.025, ry))));
          const w = walkerMesh(['#795548', '#607d8b', '#9e9e9e'][hid % 3], null); w.scale.setScalar(1.6); w.position.set(cx - ex * 0.02, TOP - 0.008, cz - ez * 0.02); w.rotation.y = Math.atan2(-nx, -nz); w.children[3].rotation.x = w.children[4].rotation.x = -1.3; this.root.add(w);
          const pg = this.pigeonGroup(sx - ex * 0.2 - nx * 0.05, sz - ez * 0.2 - nz * 0.05); if (pg) this.pigeons.push(pg);
        } else if (k === 8) { // uno haciendo el pino en la acera y su colega mirando
          const w = walkerMesh('#ef6c00', null); w.scale.setScalar(1.7); w.rotation.z = Math.PI; w.position.set(sx + ex * 0.1, TOP + 0.2, sz + ez * 0.1); w.userData.pino = true; this.root.add(w); (this.pino = this.pino || []).push(w);
          const w2 = walkerMesh('#5d4037', null); w2.scale.setScalar(1.7); w2.position.set(sx + ex * 0.2, TOP, sz + ez * 0.2); w2.rotation.y = Math.atan2(-ex, -ez); this.root.add(w2);
        } else if (k === 1 || k === 6) { const pg = this.pigeonGroup(sx - ex * 0.1, sz - ez * 0.1); if (pg) this.pigeons.push(pg);
        } else if (k === 7) { // boca de riego roja
          const cx = sx - ex * 0.15, cz = sz - ez * 0.15;
          P.push(paint(G_CYL8, '#d32f2f', M(cx, TOP + 0.02, cz, 0.012, 0.04, 0.012)));
          P.push(paint(G_BOX, '#d32f2f', M(cx, TOP + 0.025, cz, 0.032, 0.008, 0.008, -ang)));
        }
      });
    });
    if (P.length) { const m = merged(P, MAT_()); m.castShadow = true; this.root.add(m); }
    if (lampHeads.length) this.root.add(merged(lampHeads, LAMP_MAT));
    glows.forEach(([x, z]) => { const g = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), GLOW_MAT); g.rotation.x = -Math.PI / 2; g.position.set(x, TOP + 0.004, z); g.renderOrder = 2; this.root.add(g); });
  }
  pigeonGroup(x, z) {
    const g = new THREE.Group(); g.position.set(x, TOP, z); this.root.add(g);
    for (let i = 0; i < 3; i++) { const p = pigeonMesh(); p.position.set(rand(-0.04, 0.04), 0, rand(-0.03, 0.03)); p.rotation.y = Math.random() * 6; p.userData.home = p.position.clone(); p.userData.ph = Math.random() * 6; g.add(p); }
    g.userData = { st: 'ground', t: 0 }; return g;
  }
  ringAt(R, s) {
    s = ((s % R.tot) + R.tot) % R.tot; let i = 0; while (i < R.length - 1 && R.cum[i + 1] <= s) i++;
    const p = R[i], q = R[(i + 1) % R.length], l = Math.hypot(q.x - p.x, q.z - p.z) || 1, t = (s - R.cum[i]) / l;
    return { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t, ang: -Math.atan2(q.z - p.z, q.x - p.x) };
  }
  animateTraffic(dt) {
    const B = this.B;
    (this.traffic || []).forEach((c) => {
      if (c.road) {
        const a = B.verts[c.a], b = B.verts[c.b], len = Math.hypot(b.x - a.x, b.y - a.y);
        // si hay otro coche delante en el mismo carril, se pone a su velocidad (no lo atraviesa)
        let sp = c.sp; for (const o of this.traffic) if (o !== c && o.road && o.a === c.a && o.b === c.b && o.t > c.t && (o.t - c.t) * len < 0.2) sp = Math.min(sp, o.cur !== undefined ? o.cur : o.sp) * ((o.t - c.t) * len < 0.12 ? 0.3 : 1);
        c.cur = sp; c.t += (sp * dt) / len;
        if (c.t >= 1) { // siguiente tramo sin dar media vuelta si puede
          const opts = this.streetAdj[c.b].filter((v) => v !== c.a); const nx = opts.length ? opts[Math.floor(Math.random() * opts.length)] : c.a;
          c.a = c.b; c.b = nx; c.t = 0; return;
        }
        const dx = (b.x - a.x) / len, dz = (b.y - a.y) / len, ci = (this.coastIn || {})[Math.min(c.a, c.b) + '-' + Math.max(c.a, c.b)];
        let ox = -dz * 0.055, oz = dx * 0.055;
        if (ci) { const r = -dz * ci[0] + dx * ci[1] > 0 ? 0.035 : 0.092; ox = ci[0] * r; oz = ci[1] * r; }
        c.m.position.set(a.x + (b.x - a.x) * c.t + ox, TOP + 0.005, a.y + (b.y - a.y) * c.t + oz);
        c.m.rotation.y = -Math.atan2(dz, dx);
      } else if (c.train) {
        if (c.wait > 0) c.wait -= dt;
        else {
          const prev = c.s; c.s += c.sp * dt;
          const hit = c.stops.find((st) => { const a = ((prev - st) % c.ring.tot + c.ring.tot) % c.ring.tot, b2 = ((c.s - st) % c.ring.tot + c.ring.tot) % c.ring.tot; return a > b2; });
          if (hit !== undefined) { c.s = hit + 0.001; c.wait = 2.2; }
        }
        c.cars.forEach((m, k) => { const P = this.ringAt(c.ring, c.s - k * 0.27); m.position.set(P.x, 0.75 + 0.037, P.z); m.rotation.y = P.ang; });
      } else {
        const R = c.ring, n = R.length;
        c.t += c.sp * dt * 0.9;
        while (c.t >= 1) { c.t -= 1; c.i = (c.i + 1) % n; } while (c.t < 0) { c.t += 1; c.i = (c.i - 1 + n) % n; }
        const p = R[c.i], q = R[(c.i + 1) % n], dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1;
        c.m.position.set(p.x + dx * c.t - (dz / l) * c.lane, 0.85 + 0.03, p.z + dz * c.t + (dx / l) * c.lane);
        c.m.rotation.y = -Math.atan2(dz, dx) + (c.sp < 0 ? Math.PI : 0);
      }
    });
  }
  setBoard(B, opts = {}) {
    this.clear(); this.B = B; SEED = (opts.seed || B.hexes.length * 7919 + Math.round(B.hexes[0].x * 1000)) | 0;
    THEME = this.theme = opts.theme === 'barrio' ? 'barrio' : 'classic';
    const BARRIO = THEME === 'barrio';
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
    if (BARRIO) { // descampado de asfalto viejo en vez de mar
      this.water.position.y = TOP - 0.02;
      this.water.material = new THREE.MeshStandardMaterial({ color: '#2c2b31', roughness: 0.95, normalMap: this.detailTex, normalScale: new THREE.Vector2(0.4, 0.4) });
      this.water.material.normalMap.repeat && this.water.material.normalMap.repeat.set(ex * 2, ex * 2);
    }
    // aguas someras turquesa alrededor de la isla
    const sg = [], beach = [];
    const isSeaH = (h) => h.res === 'sea';
    const nearLand = (x, y) => B.hexes.some((h) => !isSeaH(h) && Math.hypot(h.x - x, h.y - y) < 1.9);
    if (!BARRIO) B.sea.forEach((s) => { if (nearLand(s.x, s.y)) sg.push(paint(G_CYL6, '#5cc4d2', M(s.x, -0.115, s.y, 1.0, 0.03, 1.0))); });

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
      if (BARRIO && h.res !== 'sea') return this.barrioTile(h, g);
      if (BARRIO) return this.barrioLot(h, g);
      if (h.res === 'sea') { // casilla de mar navegable: sin tierra, solo agua (más clara junto a la costa)
        const base = new THREE.Group();
        if (!BARRIO && h.nb.some((id) => B.hexes[id].res !== 'sea')) { const sh = new THREE.Mesh(G_CYL6, shallowMat); sh.position.y = -0.075; sh.scale.set(1, 0.03, 1); base.add(sh); }
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
      return { h, g, base: land, top, feat, token, glow, hidden: false, T };
    });
    if (BARRIO) this.barrioStreets();
    // puertos: muelle de madera con cartel
    const wood = new THREE.MeshStandardMaterial({ color: '#7d5833', roughness: 0.9, flatShading: true });
    B.ports.forEach((pt) => {
      const e = B.edges[pt.e], a = B.verts[e.v[0]], b = B.verts[e.v[1]];
      const grp = new THREE.Group();
      if (this.theme === 'barrio') { // almacén del traficante al otro lado de la calle, con su logo en grafiti, y un tío en cada esquina del trato
        const hx = B.hexes[pt.hex], mx = (a.x + b.x) / 2, mz = (a.y + b.y) / 2; let nx = mx - hx.x, nz = mz - hx.y; const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
        const ang = Math.atan2(nx, nz), d0 = 0.17, L = [];
        const wh = new THREE.Group(); wh.position.set(mx + nx * (d0 + 0.1), 0, mz + nz * (d0 + 0.1)); wh.rotation.y = ang; grp.add(wh);
        B_(L, '#4f6d7a', 0, TOP + 0.13, 0, 0.62, 0.26, 0.2); B_(L, '#3b525c', 0, TOP + 0.265, 0, 0.64, 0.012, 0.21); for (let k = 0; k < 12; k++) B_(L, '#5d7d8a', -0.29 + k * 0.053, TOP + 0.13, -0.101, 0.012, 0.25, 0.003); // nave de chapa
        B_(L, '#8a9097', 0.13, TOP + 0.085, -0.103, 0.22, 0.17, 0.004); for (let k = 0; k < 8; k++) B_(L, '#6d737a', 0.13, TOP + 0.01 + k * 0.021, -0.106, 0.22, 0.004, 0.003); // persiana
        wh.add(merged(L, MAT_()));
        if (pt.type !== 'any') { const lg = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), new THREE.MeshStandardMaterial({ map: logoTex(pt.type), transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 })); lg.position.set(-0.15, TOP + 0.135, -0.106); lg.rotation.y = Math.PI; wh.add(lg); }
        [a, b].forEach((V) => { // el traficante, un pelín hacia fuera de la esquina
          const dl = dealerMesh(pt.type); dl.position.set(V.x + nx * 0.13, TOP, V.y + nz * 0.13); dl.rotation.y = ang + Math.PI; grp.add(dl);
        });
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: pt.type === 'any' ? labelTex('3:1') : labelTex(RINFO[pt.type].e, '2:1'), transparent: true, depthTest: false, depthWrite: false }));
        sp.renderOrder = 12; sp.position.set(mx + nx * 0.4, 0.62, mz + nz * 0.4); sp.scale.set(0.48, 0.3, 1); grp.add(sp);
        grp.userData.hex = pt.hex; this.root.add(grp); this.ports.push(grp); return;
      }
      if (this.theme !== 'barrio') [a, b].forEach((v) => {
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
    for (let f = 0; f < (BARRIO ? 0 : 2); f++) {
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
    const old = this.robberHex; this.robberHex = h;
    const to = new THREE.Vector3(t.h.x + 0.38, t.T.h(0.38, 0.12), t.h.y + 0.12);
    this.robber.visible = !t.hidden;
    if (this.theme === 'barrio') { this.driveRobber(h, animate); return; }
    this.setAura(h, animate, old);
    if (!animate) { this.robber.position.copy(to); return; }
    // el ladrón cruza el mapa andando, a saltitos, hasta su nueva casilla (intriga: ¿dónde se parará?)
    const from = this.robber.position.clone(), dist = from.distanceTo(to), dur = Math.min(4, Math.max(1.4, dist * 0.55)), steps = Math.max(4, Math.round(dist * 4));
    const ry0 = this.robber.rotation.y, face = Math.atan2(to.x - from.x, to.z - from.z);
    this.tween(dur, (k) => {
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.robber.position.lerpVectors(from, to, e);
      this.robber.position.y += Math.sin(k * Math.PI) * Math.min(0.9, 0.25 + dist * 0.08) + Math.abs(Math.sin(k * steps * Math.PI)) * 0.07;
      this.robber.rotation.y = k < 0.9 ? face : face + (ry0 - face) * ((k - 0.9) / 0.1) * 0;
      this.robber.rotation.z = Math.sin(k * steps * Math.PI) * 0.12;
    }, () => { this.robber.rotation.z = 0; });
  }
  // barrio: el coche patrulla va por las calles con las sirenas hasta la manzana y la precinta
  driveRobber(h, animate) {
    const B = this.B, t = this.tiles[h], car = this.robber; if (!t) return;
    const H = B.hexes[h];
    // de los cruces de la manzana, el más cercano al coche
    const cur = car.userData.v, from = car.position.clone();
    const target = H.verts.slice().sort((a, b) => Math.hypot(B.verts[a].x - from.x, B.verts[a].y - from.z) - Math.hypot(B.verts[b].x - from.x, B.verts[b].y - from.z))[0];
    const park = (v) => { const V = B.verts[v]; return new THREE.Vector3(V.x + (H.x - V.x) * 0.13, TOP + 0.005, V.y + (H.y - V.y) * 0.13); };
    const cops = () => { // bajan dos agentes y se quedan vigilando junto al coche
      const P = car.position, dx = H.x - P.x, dz = H.y - P.z, l = Math.hypot(dx, dz) || 1, px = -dz / l, pz = dx / l;
      this.cops = [-1, 1].map((sd) => { const c = walkerMesh('#1a237e', null); c.scale.setScalar(1.8); c.position.set(P.x + px * sd * 0.09 + (dx / l) * 0.03, TOP, P.z + pz * sd * 0.09 + (dz / l) * 0.03); c.rotation.y = Math.atan2(-dx, -dz) + sd * 0.6; this.root.add(c); if (animate) { c.scale.setScalar(0.01); this.tween(0.5, (k) => c.scale.setScalar(Math.max(0.01, 1.8 * k))); } return c; });
    };
    if (this.cops) { const old = this.cops; this.cops = null; if (animate) this.tween(0.4, (k) => old.forEach((c) => c.scale.setScalar(Math.max(0.01, 1.8 * (1 - k)))), () => old.forEach((c) => this.root.remove(c))); else old.forEach((c) => this.root.remove(c)); }
    const fadeTape = () => {
      cops();
      if (this.tape) { const old = this.tape; this.tape = null; old.parent && old.parent.remove(old); }
      const tp = tapeMesh(); t.g.add(tp); this.tape = tp; tp.visible = !t.hidden;
      if (animate) { tp.scale.setScalar(0.01); this.tween(0.7, (k) => tp.scale.setScalar(Math.max(0.01, k))); }
    };
    if (!animate || cur === undefined || !this.streetAdj) { car.position.copy(park(target)); car.userData.v = target; car.rotation.y = Math.atan2(H.x - B.verts[target].x, H.y - B.verts[target].y) - Math.PI / 2; fadeTape(); return; }
    if (this.tape) { const old = this.tape; this.tape = null; this.tween(0.4, (k) => old.scale.setScalar(Math.max(0.01, 1 - k)), () => old.parent && old.parent.remove(old)); }
    // camino más corto por las calles (cruces)
    const prev = new Map([[cur, -1]]), q = [cur];
    while (q.length) { const v = q.shift(); if (v === target) break; (this.streetAdj[v] || []).forEach((n) => { if (!prev.has(n)) { prev.set(n, v); q.push(n); } }); }
    const path = []; for (let v = target; v !== -1 && v !== undefined; v = prev.get(v)) path.unshift(v);
    if (path[0] !== cur) path.unshift(cur);
    const pts = [from, ...path.slice(1).map((v) => new THREE.Vector3(B.verts[v].x, TOP + 0.005, B.verts[v].y)), park(target)];
    const segs = []; let total = 0;
    for (let i = 1; i < pts.length; i++) { const l = pts[i].distanceTo(pts[i - 1]); segs.push(l); total += l; }
    car.userData.chasing = true; car.userData.v = target;
    const dur = Math.min(5, Math.max(1.2, total / 2.2));
    this.heliTo(H, dur + 0.5);
    this.tween(dur, (k) => {
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; let d = e * total, i = 0;
      while (i < segs.length - 1 && d > segs[i]) { d -= segs[i]; i++; }
      const a = pts[i], b = pts[i + 1], f = segs[i] ? Math.min(1, d / segs[i]) : 1;
      car.position.lerpVectors(a, b, f); car.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    }, () => { car.userData.chasing = false; fadeTape(); });
  }
  // helicóptero de la pasma: cruza el mapa con el foco y se queda un rato sobre la manzana
  heliTo(H, dur) {
    if (this.heli) { this.root.remove(this.heli); this.heli = null; }
    const g = new THREE.Group(), L = [];
    B_(L, '#1a237e', 0, 0, 0, 0.2, 0.08, 0.09); B_(L, '#9fc8e6', 0.08, 0.01, 0, 0.05, 0.05, 0.08); B_(L, '#1a237e', -0.17, 0.015, 0, 0.18, 0.025, 0.025); B_(L, '#ffffff', 0, -0.02, 0, 0.2, 0.012, 0.092);
    B_(L, '#333', 0, -0.055, 0.04, 0.2, 0.008, 0.008); B_(L, '#333', 0, -0.055, -0.04, 0.2, 0.008, 0.008);
    g.add(merged(L, MAT_()));
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.004, 0.02), new THREE.MeshStandardMaterial({ color: '#222' })); rotor.position.y = 0.055; g.add(rotor);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.07, 0.012), new THREE.MeshStandardMaterial({ color: '#222' })); tail.position.set(-0.26, 0.02, 0.015); g.add(tail);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.45, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#fff6c8', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); beam.position.y = -0.74; g.add(beam);
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), new THREE.MeshBasicMaterial({ color: '#fff6c8', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending })); spot.rotation.x = -Math.PI / 2; this.root.add(spot);
    this.root.add(g); this.heli = g;
    const ex = this.extent || 6, a0 = Math.random() * Math.PI * 2, from = new THREE.Vector3(Math.cos(a0) * ex * 1.6, 1.6, Math.sin(a0) * ex * 1.6), over = new THREE.Vector3(H.x, 1.6, H.y), away = new THREE.Vector3(-from.x, 1.8, -from.z), total = dur + 4.5;
    this.tween(total, (k, dtt) => {
      const tt = k * total; let P;
      if (tt < dur) { const e = tt / dur; P = from.clone().lerp(over, 1 - Math.pow(1 - e, 2)); }
      else if (tt < dur + 2.5) P = over.clone().add(new THREE.Vector3(Math.cos(tt * 1.5) * 0.08, Math.sin(tt * 2) * 0.03, Math.sin(tt * 1.5) * 0.08));
      else { const e = (tt - dur - 2.5) / 2; P = over.clone().lerp(away, e * e); }
      const prev = g.position.clone(); g.position.copy(P); const v = P.clone().sub(prev); if (v.lengthSq() > 1e-7) g.rotation.y = Math.atan2(-v.z, v.x);
      g.rotation.z = -Math.min(0.25, v.length() * 8); rotor.rotation.y += 0.9; tail.rotation.z += 0.7;
      spot.position.set(P.x, TOP + 0.03, P.z); const on = tt < dur + 2.5 ? 1 : Math.max(0, 1 - (tt - dur - 2.5)); beam.material.opacity = 0.16 * on; spot.material.opacity = 0.35 * on;
    }, () => { this.root.remove(g); this.root.remove(spot); if (this.heli === g) this.heli = null; });
  }
  // aura oscura sobre la casilla del ladrón: esa casilla no produce
  setAura(h, animate, old) {
    const t = this.tiles[h]; if (!t) return;
    const prev = this.aura; this.aura = null;
    if (prev) { const ms = prev.userData.mats; if (animate) this.tween(0.8, (k) => ms.forEach((m) => (m.opacity = m.userData.o * (1 - k))), () => this.root.remove(prev)); else this.root.remove(prev); }
    const g = new THREE.Group(); g.position.set(t.h.x, 0, t.h.y);
    const veil = new THREE.MeshBasicMaterial({ color: '#12071c', transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    // sombra sobre el propio relieve de la casilla (encaja exactamente con el hexágono)
    if (t.top) { const sh = new THREE.Mesh(t.top.geometry, veil); sh.position.y = 0.004; sh.renderOrder = 3; g.add(sh); }
    const ringM = new THREE.MeshBasicMaterial({ color: '#7a3cff', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.985, 0.985, 0.12, 6, 1, true), ringM); ring.position.y = TOP + 0.03; // misma orientación que la casilla
    veil.userData.o = 0.42; ringM.userData.o = 0.55;
    g.add(ring); g.userData = { mats: [veil, ringM], hex: h }; g.visible = !t.hidden;
    this.root.add(g); this.aura = g;
    if (animate) { [veil, ringM].forEach((m) => (m.opacity = 0)); setTimeout(() => this.tween(0.9, (k) => [veil, ringM].forEach((m) => (m.opacity = m.userData.o * k))), Math.min(3800, 1200)); }
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
        m = shipMesh(colors[sh.p], sh.lv || 1); m.userData = { e: sh.e, base: P, lv: sh.lv || 1 }; m.position.set(P.x, this.theme === 'barrio' ? TOP : -0.06, P.z); m.rotation.y = P.ry;
        this.root.add(m); this.ships[sh.id] = m;
        if (this.ready) { const y0 = m.position.y; m.position.y = 0.8; this.tween(0.8, (k) => { m.position.y = y0 + (1 - k) * (1 - k) * (0.8 - y0); }); }
      } else if (m.userData.e !== sh.e) {
        const from = m.userData.base, ry0 = m.rotation.y; let dr = P.ry - ry0; while (dr > Math.PI / 2) dr -= Math.PI; while (dr < -Math.PI / 2) dr += Math.PI;
        m.userData.e = sh.e; m.userData.base = P;
        this.tween(1.1, (k) => { const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; m.position.x = from.x + (P.x - from.x) * e; m.position.z = from.z + (P.z - from.z) * e; m.rotation.y = ry0 + dr * e; });
      }
    });
    for (const k in this.ships) if (!seen.has(+k)) { this.root.remove(this.ships[k]); delete this.ships[k]; }
  }
  syncPieces(s, colors) {
    NAMES = (s.players || []).map((q) => q.name);
    if (s.ships) this.syncShips(s.ships, colors);
    const B = this.B, seenV = new Set(), seenE = new Set();
    s.buildings.forEach(([v, p, t]) => {
      seenV.add(v);
      const cur = this.pieces.v[v];
      if (cur && cur.userData.t === t && cur.userData.p === p) return;
      if (cur) this.root.remove(cur);
      const m = t === 'c' ? cityMesh(colors[p]) : settlementMesh(colors[p]), V = B.verts[v];
      m.position.set(V.x, TOP, V.y); m.rotation.y = Math.atan2(V.x, V.y) + (Math.floor(Math.random() * 3) * Math.PI) / 3; m.userData = { t, p };
      if (this.theme === 'barrio') this.cornerize(m, v, colors[p], t === 'c');
      this.root.add(m); this.pieces.v[v] = m; this.drop(m);
    });
    s.roads.forEach(([e, p]) => {
      seenE.add(e);
      if (this.pieces.e[e]) return;
      const E = B.edges[e], a = B.verts[E.v[0]], b = B.verts[E.v[1]];
      const m = roadMesh(colors[p], Math.hypot(b.x - a.x, b.y - a.y) * 0.64, p);
      m.position.set((a.x + b.x) / 2, TOP, (a.y + b.y) / 2); m.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
      this.root.add(m); this.pieces.e[e] = m; this.drop(m, true);
    });
    for (const k in this.pieces.v) if (!seenV.has(+k)) { this.root.remove(this.pieces.v[k]); delete this.pieces.v[k]; }
    for (const k in this.pieces.e) if (!seenE.has(+k)) { this.root.remove(this.pieces.e[k]); delete this.pieces.e[k]; }
    this.syncWalkers(s, colors);
    this.syncTrophies(s, colors);
    if (s.robber !== this.robberHex) this.placeRobber(s.robber, !!this.ready);
    const rt = this.tiles[s.robber]; this.robber.visible = !(rt && rt.hidden);
  }
  // trofeos en el tablero: estandarte del camino más largo y bandera del mayor ejército
  syncTrophies(s, colors) {
    this.trophies = this.trophies || { longest: null, army: null };
    const B = this.B;
    const spot = (kind, p) => {
      if (kind === 'longest') {
        const mine = (s.roads || []).filter(([, q]) => q === p).map(([e]) => B.edges[e]);
        if (!mine.length) return null;
        const cx = mine.reduce((a, E) => a + (B.verts[E.v[0]].x + B.verts[E.v[1]].x) / 2, 0) / mine.length, cz = mine.reduce((a, E) => a + (B.verts[E.v[0]].y + B.verts[E.v[1]].y) / 2, 0) / mine.length;
        const E = mine.sort((x, y) => { const d = (E2) => Math.hypot((B.verts[E2.v[0]].x + B.verts[E2.v[1]].x) / 2 - cx, (B.verts[E2.v[0]].y + B.verts[E2.v[1]].y) / 2 - cz); return d(x) - d(y); })[0];
        const a = B.verts[E.v[0]], b = B.verts[E.v[1]];
        return { x: (a.x + b.x) / 2, z: (a.y + b.y) / 2, key: E.id };
      }
      const bs = (s.buildings || []).filter(([, q]) => q === p).sort((x, y) => (y[2] === 'c') - (x[2] === 'c'));
      if (!bs.length) return null;
      const V = B.verts[bs[0][0]]; return { x: V.x + 0.13, z: V.y + 0.1, key: bs[0][0] };
    };
    for (const kind of ['longest', 'army']) {
      const p = kind === 'longest' ? s.longest : s.army, cur = this.trophies[kind];
      const sp = p !== null && p !== undefined ? spot(kind, p) : null;
      if (cur && sp && cur.userData.p === p && cur.userData.key === sp.key) continue;
      if (cur) { this.trophies[kind] = null; if (this.ready) this.tween(0.5, (k) => cur.scale.setScalar(Math.max(0.01, 1 - k)), () => this.root.remove(cur)); else this.root.remove(cur); }
      if (!sp) continue;
      const m = trophyMesh(kind, colors[p]); m.position.set(sp.x, TOP, sp.z); m.userData.p = p; m.userData.key = sp.key; m.userData.ph = Math.random() * 6;
      this.root.add(m); this.trophies[kind] = m;
      if (this.ready) { m.scale.setScalar(0.01); setTimeout(() => this.tween(0.7, (k) => m.scale.setScalar(Math.max(0.01, k < 0.7 ? (k / 0.7) * 1.15 : 1.15 - (k - 0.7) * 0.5))), 600); }
    }
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
          if (this.theme === 'barrio') { // en la acera de la manzana, cerca de su garito
            const a0 = base + (k ? 0.35 : -0.35); w.scale.setScalar(1.7); const P0 = sideRing(a0); w.position.set(P0.x, TOP, P0.z);
            const fl = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 5), new THREE.MeshBasicMaterial({ color: '#ffeb3b' })); fl.position.set(0.012, 0.07, 0.03); fl.visible = false; w.add(fl);
            w.userData = { p, tile, home: a0, ang: a0, st: 'idle', t: Math.random() * 3, ph: Math.random() * 6, cool: 6 + Math.random() * 10, flash: fl };
            w.visible = !tile.hidden; tile.g.add(w); W[key] = w; continue;
          }
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
    if (this.theme === 'barrio') return this.animateBarrioWalkers(dt, time);
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
  // barrio: la banda pasea por la acera; si coinciden dos bandas, tiroteo de dibujos; si llega la pasma, se esconden
  animateBarrioWalkers(dt, time) {
    const W = this.life.walkers, list = Object.values(W), police = this.tiles[this.robberHex];
    const place = (w) => { const P = sideRing(w.userData.ang); w.position.set(P.x, TOP, P.z); };
    for (const w of list) {
      const u = w.userData; u.t -= dt; u.cool -= dt;
      if (u.tile.hidden) { w.visible = false; continue; }
      if (u.tile === police && !['hide', 'hidden', 'down'].includes(u.st)) { u.st = 'hide'; u.tgt = u.home; u.flash.visible = false; w.rotation.x = 0; }
      if (u.st === 'hidden') { if (u.tile !== police) { u.st = 'respawn'; u.t = 0.6; w.visible = true; } continue; }
      if (u.st === 'respawn') { w.scale.setScalar(1.7 * Math.min(1, 1 - u.t / 0.6)); if (u.t <= 0) { w.scale.setScalar(1.7); u.st = 'idle'; u.t = 1 + Math.random() * 2; } continue; }
      if (u.st === 'down') { if (u.t <= 0) { w.rotation.x = 0; u.ang = u.home; place(w); u.st = 'respawn'; u.t = 0.6; u.cool = 12; } continue; }
      if (u.st === 'fight') {
        u.flash.visible = Math.sin(time * 40 + u.ph) > 0.3;
        if (u.t <= 0) { u.flash.visible = false; if (u.lose) { u.st = 'down'; u.t = 3; w.rotation.x = -Math.PI / 2; w.position.y = TOP + 0.02; } else { u.st = 'idle'; u.t = 1.5; u.cool = 10 + Math.random() * 8; } }
        continue;
      }
      if (u.st === 'idle') { if (u.t <= 0) { u.st = 'walk'; u.tgt = u.home + (Math.random() - 0.5) * 1.4; } }
      if (u.st === 'walk' || u.st === 'hide') {
        const d = u.tgt - u.ang, step = (0.075 / 0.7) * dt;
        if (Math.abs(d) <= step) { u.ang = u.tgt; if (u.st === 'hide') { u.st = 'hidden'; w.visible = false; } else { u.st = 'idle'; u.t = 2 + Math.random() * 4; } }
        else u.ang += Math.sign(d) * step;
        const P = sideRing(u.ang), Q = sideRing(u.ang + Math.sign(d) * 0.05); w.position.set(P.x, TOP, P.z); w.rotation.y = Math.atan2(Q.x - P.x, Q.z - P.z);
      }
    }
    // tiroteos: dos de bandas distintas en la misma acera y cerca
    for (let i = 0; i < list.length; i++) {
      const a = list[i], ua = a.userData; if (!['idle', 'walk'].includes(ua.st) || ua.cool > 0 || !a.visible) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j], ub = b.userData;
        if (ub.tile !== ua.tile || ub.p === ua.p || !['idle', 'walk'].includes(ub.st) || ub.cool > 0 || !b.visible) continue;
        if (a.position.distanceTo(b.position) > 0.32 || Math.random() > dt * 0.6) continue;
        const lose = Math.random() < 0.5;
        [[a, b, lose], [b, a, !lose]].forEach(([x, y2, l]) => { const u = x.userData; u.st = 'fight'; u.t = 1.6; u.lose = l; x.rotation.y = Math.atan2(y2.position.x - x.position.x, y2.position.z - x.position.z); });
        const pum = new THREE.Sprite(new THREE.SpriteMaterial({ map: pumTex(), transparent: true, depthTest: false, depthWrite: false })); pum.renderOrder = 11;
        pum.position.set((a.position.x + b.position.x) / 2, TOP + 0.3, (a.position.z + b.position.z) / 2); ua.tile.g.add(pum);
        this.tween(1.6, (k) => { const sc = 0.22 * (1 + Math.sin(k * 30) * 0.12) * (k < 0.15 ? k / 0.15 : 1); pum.scale.set(sc * 1.6, sc, 1); pum.material.opacity = k > 0.8 ? (1 - k) * 5 : 1; }, () => pum.parent && pum.parent.remove(pum));
        break;
      }
    }
    for (const w of list) {
      const u = w.userData, walking = u.st === 'walk' || u.st === 'hide', sw = walking ? Math.sin(time * 12 + u.ph) * 0.6 : 0, kids = w.children;
      kids[3].rotation.x = sw; kids[4].rotation.x = -sw; kids[5].visible = false;
      kids[0].position.y = 0.05 + (walking ? Math.abs(Math.sin(time * 12 + u.ph)) * 0.006 : 0);
    }
  }
  drop(m, road) {
    if (!this.ready) return;
    if (road && this.theme === 'barrio') { // la pared se va pintando a la vez que suena el spray
      m.children.forEach((c) => {
        const s0 = c.scale.x;
        if (c.userData.paint) { c.scale.x = 0.001; this.tween(2.1, (k) => { c.scale.x = Math.max(0.001, Math.min(1, (k * 2.1 - 0.45) / 1.6)); }); }
        else { c.scale.setScalar(0.01); this.tween(0.4, (k) => c.scale.setScalar(Math.max(0.01, s0 * k))); }
      });
      return;
    }
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
  /* ---------- final: la cámara vuela a la casa principal del ganador y hay fuegos artificiales ---------- */
  victory(mainV, verts, color) {
    const B = this.B; if (!B || this.victoryOn) return;
    const V = B.verts[mainV]; if (!V) return;
    this.victoryOn = { verts: verts.map((v) => B.verts[v]).filter(Boolean), color, t: 0.6 };
    this.followTurn = false; this.userMoved = performance.now();
    const T = new THREE.Vector3(V.x, 0.25, V.y), t0 = this.controls.target.clone(), p0 = this.camera.position.clone();
    const dir = p0.clone().sub(t0).setY(0); if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1); dir.normalize();
    const dist = this.mobile ? 4.4 : 4.0, p1 = T.clone().add(dir.multiplyScalar(dist * 0.62)).setY(T.y + dist * 0.82); // vista de dron
    this.controls.autoRotate = false;
    this.tween(2.6, (k) => { const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; this.controls.target.lerpVectors(t0, T, e); this.camera.position.lerpVectors(p0, p1, e); },
      () => { this.controls.autoRotate = true; this.controls.autoRotateSpeed = 0.9; });
  }
  stopVictory() { this.victoryOn = null; this.controls.autoRotate = false; }
  firework(x, z, color) {
    const y0 = TOP + 0.2, top = 1.0 + Math.random() * 0.7;
    const rk = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), new THREE.MeshBasicMaterial({ color: '#fff3c4' }));
    rk.position.set(x, y0, z); this.root.add(rk);
    this.tween(0.75, (k) => { rk.position.y = y0 + (top - y0) * (1 - (1 - k) * (1 - k)); }, () => {
      this.root.remove(rk);
      const n = this.mobile ? 50 : 80, pos = new Float32Array(n * 3), vel = [], cols = new Float32Array(n * 3), c1 = new THREE.Color(color), c2 = new THREE.Color(Math.random() < 0.5 ? '#ffd54a' : '#ffffff');
      for (let i = 0; i < n; i++) {
        const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), sp = 0.7 + Math.random() * 0.5;
        vel.push(new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)).multiplyScalar(sp));
        const c = i % 3 ? c1 : c2; cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      const mat = new THREE.PointsMaterial({ size: this.mobile ? 0.09 : 0.07, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const pts = new THREE.Points(geo, mat); pts.position.set(x, top, z); this.root.add(pts);
      this.tween(1.8, (k) => {
        const t = k * 1.8;
        for (let i = 0; i < n; i++) { const v = vel[i]; pos[i * 3] = v.x * t * 0.9; pos[i * 3 + 1] = v.y * t * 0.9 - 0.35 * t * t; pos[i * 3 + 2] = v.z * t * 0.9; }
        geo.attributes.position.needsUpdate = true; mat.opacity = k < 0.6 ? 1 : (1 - k) / 0.4;
      }, () => { this.root.remove(pts); geo.dispose(); mat.dispose(); });
    });
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
      if (s) { const ghost = cityV.has(id) ? cityMesh(color) : settlementMesh(color); ghost.position.set(V.x, TOP, V.y); if (this.theme === 'barrio') this.cornerize(ghost, id, color, cityV.has(id)); ghost.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.75; } }); this.markers.add(ghost); }
      this.markers.add(ring, dot, hit); this.hits.push(hit);
    });
    T.e.forEach((id) => {
      const E = B.edges[id], a = B.verts[E.v[0]], b = B.verts[E.v[1]], s = on('e', id);
      const len = Math.hypot(b.x - a.x, b.y - a.y) * 0.62, ang = -Math.atan2(b.y - a.y, b.x - a.x);
      const isShip = kind === 'ship' || shipE.has(id);
      const seaEdge = E.hexes.every((h) => B.hexes[h].res === 'sea'), ey = (isShip || seaEdge) && this.theme !== 'barrio' ? 0.0 : TOP + 0.05;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, s ? 0.09 : 0.06), mk(isShip ? '#bfe9ff' : '#ffffff', s));
      if (opt.glow && !s) for (const k of [0.3, 0.5, 0.7]) this.markers.add(this.halo(a.x + (b.x - a.x) * k, ey + 0.08, a.y + (b.y - a.y) * k, isShip ? '#7fd3ff' : '#ffffff', 0.55)); bar.position.set((a.x + b.x) / 2, ey, (a.y + b.y) / 2); bar.rotation.y = ang; bar.renderOrder = 5;
      if (!s) bar.userData.pulse = true;
      const hit = new THREE.Mesh(new THREE.BoxGeometry(len, 0.2, 0.32), hitMat); hit.position.copy(bar.position); hit.rotation.y = ang; hit.userData = { k: 'e', id };
      if (s) { const ghost = isShip ? shipMesh(color) : roadMesh(color, len * 1.03); ghost.position.set((a.x + b.x) / 2, isShip && this.theme !== 'barrio' ? -0.06 : TOP, (a.y + b.y) / 2); ghost.rotation.y = ang; this.markers.add(ghost); }
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

/* ===================== TEMA «EL BARRIO» ===================== */
let THEME = 'classic';
const B_ = (L, col, x, y, z, sx, sy, sz, ry = 0) => L.push(paint(G_BOX, col, M(x, y, z, sx, sy, sz, ry)));
function signMesh(text, bg, fg, w, h, neon) {
  const tex = canvasTex(512, Math.round(512 * h / w), (g, W, H) => {
    g.fillStyle = bg; g.fillRect(0, 0, W, H); g.strokeStyle = '#111'; g.lineWidth = 10; g.strokeRect(5, 5, W - 10, H - 10);
    g.font = `900 ${Math.round(H * 0.5)}px Arial Black, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (neon) { g.shadowColor = fg; g.shadowBlur = 24; }
    g.fillStyle = fg; let fs = Math.round(H * 0.5); while (g.measureText(text).width > W * 0.9 && fs > 10) { fs -= 2; g.font = `900 ${fs}px Arial Black, Arial, sans-serif`; } g.fillText(text, W / 2, H / 2 + 2);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), neon ? new THREE.MeshBasicMaterial({ map: tex }) : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  return m;
}
const MAT_ = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, flatShading: true });
// una manzana del barrio según el recurso que da (local a la casilla; el suelo está a TOP)
function barrioBlock(res) {
  const g = new THREE.Group(), L = [], y = TOP + 0.012;
  const building = (x, z, w, d, h, wall, roof, ry = 0) => { B_(L, wall, x, y + h / 2, z, w, h, d, ry); B_(L, roof, x, y + h + 0.008, z, w - 0.02, 0.016, d - 0.02, ry); };
  const sign = (txt, bg, fg, x, yy, z, w, h, ry, neon) => { const m = signMesh(txt, bg, fg, w, h, neon); m.position.set(x, yy, z); m.rotation.y = ry; g.add(m); if (neon) (g.userData.neons = g.userData.neons || []).push(m); return m; };
  let hTop = 0.2;
  if (res === 'wood') { // tienda de pintura: botes de spray en el tejado y manchas en el suelo
    building(0, -0.18, 0.62, 0.34, 0.2, '#efe7d6', '#d9d0bf');
    ['#ff4f8b', '#ffd23f', '#3ec1d3', '#7bd389', '#a26bff'].forEach((c, i) => { L.push(paint(G_CYL8, c, M(-0.22 + i * 0.11, y + 0.26, -0.18, 0.035, 0.1, 0.035))); L.push(paint(G_CYL8, '#bbb', M(-0.22 + i * 0.11, y + 0.32, -0.18, 0.018, 0.025, 0.018))); });
    sign('SPRAY & CO', '#ff4f8b', '#ffffff', 0, y + 0.12, 0.002, 0.42, 0.09, 0);
    hTop = 0.34;
  }
  if (res === 'brick') { // armería: nave gris con escaparate de pipas y rejas
    building(0, -0.1, 0.66, 0.4, 0.22, '#5d6470', '#4b515c');
    const vit = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.11), new THREE.MeshStandardMaterial({ roughness: 0.3, map: canvasTex(512, 128, (c, W, H) => {
      c.fillStyle = '#1d2329'; c.fillRect(0, 0, W, H); c.fillStyle = '#c62828'; c.fillRect(0, 0, W, 10);
      for (let i = 0; i < 4; i++) drawGun(c, 40 + i * 120, 38, 0.95, ['#b0b6be', '#8d939b', '#d4af37', '#b0b6be'][i]);
      c.strokeStyle = '#9aa0a6'; c.lineWidth = 4; for (let x = 0; x < W; x += 26) { c.beginPath(); c.moveTo(x, 10); c.lineTo(x, H); c.stroke(); }
    }) }));
    vit.position.set(0, y + 0.08, 0.101); g.add(vit);
    sign('PUM-PUM · ARMERÍA', '#2b2b2b', '#ff5252', 0, y + 0.18, 0.101, 0.5, 0.06, 0, true);
    hTop = 0.24;
  }
  if (res === 'sheep') { // plantación: recinto de hormigón sin techo, puertas metálicas, filas de plantas y luces de cultivo
    const zc = -0.08, w = 0.74, d = 0.5, hh = 0.13;
    B_(L, '#8a867f', 0, y + hh / 2, zc - d / 2, w, hh, 0.025); B_(L, '#8a867f', -w / 2, y + hh / 2, zc, 0.025, hh, d); B_(L, '#8a867f', w / 2, y + hh / 2, zc, 0.025, hh, d);
    B_(L, '#8a867f', -w / 4 - 0.07, y + hh / 2, zc + d / 2, w / 2 - 0.14, hh, 0.025); B_(L, '#8a867f', w / 4 + 0.07, y + hh / 2, zc + d / 2, w / 2 - 0.14, hh, 0.025);
    B_(L, '#7d8a94', 0, y + hh / 2, zc + d / 2, 0.14, hh * 0.95, 0.018); for (let k = 0; k < 5; k++) B_(L, '#5f6b74', -0.06 + k * 0.03, y + hh / 2, zc + d / 2 + 0.01, 0.006, hh * 0.9, 0.004); // persiana metálica
    B_(L, '#7d8a94', w / 2 + 0.002, y + hh / 2, zc, 0.018, hh * 0.95, 0.12);
    B_(L, '#5b4a3a', 0, y + 0.004, zc, w - 0.04, 0.006, d - 0.04); // tierra
    for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) { // matas con la hoja de siete puntas
      const px = -0.28 + k * 0.112, pz = zc - 0.16 + r * 0.16, sc = 0.85 + ((r * 7 + k * 3) % 5) * 0.06;
      L.push(paint(G_CYL8, '#4a7a2a', M(px, y + 0.04 * sc, pz, 0.005, 0.08 * sc, 0.005)));
      for (let lv = 0; lv < 2; lv++) for (let b = -3; b <= 3; b++) {
        const ang = b * 0.42, ln = (0.055 - Math.abs(b) * 0.008) * sc * (lv ? 0.75 : 1), yy = y + (0.06 + lv * 0.03) * sc;
        L.push(paint(G_CONE4, lv ? '#4caf50' : '#2e7d32', M(px + Math.sin(ang) * ln * 0.5, yy + Math.cos(ang) * ln * 0.5, pz, 0.012, ln, 0.003, (r + k) * 0.7, 0, -ang)));
      }
    }
    const lamp = new THREE.MeshBasicMaterial({ color: '#d58bff' });
    for (let r = 0; r < 3; r++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(w - 0.08, 0.008, 0.018), lamp); bar.position.set(0, y + 0.2, zc - 0.16 + r * 0.16); g.add(bar); }
    B_(L, '#555', -w / 2 + 0.03, y + 0.1, zc, 0.008, 0.2, 0.008); B_(L, '#555', w / 2 - 0.03, y + 0.1, zc, 0.008, 0.2, 0.008); B_(L, '#555', 0, y + 0.205, zc, w - 0.06, 0.006, 0.006);
    const gardener = walkerMesh('#2e7d32', null); gardener.scale.setScalar(1.8); gardener.position.set(0.18, y, zc + 0.08); g.add(gardener);
    hTop = 0.22;
  }
  if (res === 'wheat') { // lavandería 24 h con lavadoras y sacos de dinero en la puerta de atrás
    building(0, -0.16, 0.64, 0.34, 0.2, '#e3f2fd', '#bbdefb');
    for (let i = 0; i < 4; i++) { const w = new THREE.Mesh(new THREE.CircleGeometry(0.042, 20), new THREE.MeshStandardMaterial({ color: '#90caf9', roughness: 0.2, metalness: 0.3 })); w.position.set(-0.22 + i * 0.145, y + 0.09, 0.011); g.add(w); }
    sign('LAVA-RÁPIDO 24H', '#1565c0', '#ffffff', 0, y + 0.18, 0.011, 0.44, 0.06, 0, true);
    for (let i = 0; i < 3; i++) { L.push(paint(G_ICO1, '#c8a24a', M(0.2 + i * 0.08, y + 0.04, 0.3, 0.035, 0.045, 0.035))); }
    hTop = 0.28;
  }
  if (res === 'ore') { // casa de empeños: oro y neón
    building(0, -0.14, 0.62, 0.36, 0.22, '#3b2b47', '#2a1f33');
    sign('EMPEÑOS · ORO', '#111111', '#ffd23f', 0, y + 0.17, 0.042, 0.5, 0.08, 0, true);
    sign('COMPRAMOS TODO $$$', '#ffd23f', '#111111', 0, y + 0.07, 0.042, 0.4, 0.05, 0);
    const gold = new THREE.MeshStandardMaterial({ color: '#ffd23f', metalness: 0.9, roughness: 0.25 });
    void gold;
    hTop = 0.3;
  }
  if (res === 'desert') { // cancha de baloncesto
    const court = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.6), new THREE.MeshStandardMaterial({ map: canvasTex(512, 320, (c, W, H) => {
      c.fillStyle = '#d9773a'; c.fillRect(0, 0, W, H); c.strokeStyle = '#fff'; c.lineWidth = 6; c.strokeRect(8, 8, W - 16, H - 16);
      c.beginPath(); c.moveTo(W / 2, 8); c.lineTo(W / 2, H - 8); c.stroke(); c.beginPath(); c.arc(W / 2, H / 2, 40, 0, 7); c.stroke();
      c.beginPath(); c.arc(8, H / 2, 90, -1.57, 1.57); c.stroke(); c.beginPath(); c.arc(W - 8, H / 2, 90, 1.57, 4.71); c.stroke();
    }), roughness: 0.8 }));
    court.rotation.x = -Math.PI / 2; court.position.y = y + 0.003; g.add(court);
    [-1, 1].forEach((sd) => { B_(L, '#555', sd * 0.47, y + 0.09, 0, 0.012, 0.18, 0.012); B_(L, '#fff', sd * 0.45, y + 0.17, 0, 0.004, 0.06, 0.09); L.push(paint(new THREE.TorusGeometry(1, 0.15, 6, 14), '#ff5722', M(sd * 0.43, y + 0.15, 0, 0.022, 0.022, 0.022, 0, Math.PI / 2))); });
    // cuatro chavales jugando, un balón y un bidón con fuego en la esquina
    const kids = ['#f5f5f5', '#f5f5f5', '#212121', '#212121'].map((col, i) => { const w = walkerMesh(col, null); w.scale.setScalar(1.8); w.position.set((i < 2 ? -1 : 1) * (0.12 + (i % 2) * 0.12), y, (i % 2 ? 0.1 : -0.1)); g.add(w); return w; });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), new THREE.MeshStandardMaterial({ color: '#e65100', roughness: 0.7 })); g.add(ball);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 12), new THREE.MeshStandardMaterial({ color: '#6d4c41', roughness: 0.9, metalness: 0.3 })); barrel.position.set(0.42, y + 0.04, 0.32); g.add(barrel);
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.07, 8), new THREE.MeshBasicMaterial({ color: '#ffb300' })); fire.position.set(0.42, y + 0.11, 0.32); g.add(fire);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), GLOW_MAT); glow.rotation.x = -Math.PI / 2; glow.position.set(0.42, y + 0.006, 0.32); g.add(glow);
    g.userData.court = { kids, ball, fire, y };
    hTop = 0.12;
  }
  g.add(merged(L, MAT_()));
  // cartel gigante en el tejado para reconocer la manzana desde lejos
  const prop = new THREE.Group(); let py = y + hTop;
  if (res === 'wood' && false) { const can = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.17, 16), new THREE.MeshStandardMaterial({ color: '#ff4f8b', roughness: 0.3, metalness: 0.4 })); can.position.y = 0.085; const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.05, 12), new THREE.MeshStandardMaterial({ color: '#dddddd', metalness: 0.8, roughness: 0.2 })); cap.position.y = 0.195; const nz = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.03), new THREE.MeshStandardMaterial({ color: '#222' })); nz.position.set(0, 0.225, 0.02); prop.add(can, cap, nz); }
  if (res === 'brick') { const sg = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.16), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, map: canvasTex(256, 160, (c) => drawGun(c, 18, 40, 1.9, '#cfd5dc')) })); sg.position.y = 0.13; const pole2 = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 6), new THREE.MeshStandardMaterial({ color: '#555' })); pole2.position.y = 0.03; prop.add(sg, pole2); prop.userData.face = true; }
  if (res === 'brick' && false) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 24), [new THREE.MeshStandardMaterial({ color: '#ddd' }), new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (c) => { ['#fff', '#e53935', '#fff', '#e53935', '#fff'].forEach((col, k) => { c.fillStyle = col; c.beginPath(); c.arc(64, 64, 62 - k * 12, 0, 7); c.fill(); }); }) }), new THREE.MeshStandardMaterial({ color: '#ddd' })]); t.rotation.x = Math.PI / 2; t.position.y = 0.13; const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.04, 6), new THREE.MeshStandardMaterial({ color: '#555' })); pole.position.y = 0.01; prop.add(t, pole); }
  if (res === 'ore') { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 12, 28), new THREE.MeshStandardMaterial({ color: '#ffd23f', metalness: 0.95, roughness: 0.2 })); ring.position.y = 0.09; const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), new THREE.MeshStandardMaterial({ color: '#7fe3ff', metalness: 0.3, roughness: 0.05, emissive: '#2a8fb0', emissiveIntensity: 0.4 })); gem.position.y = 0.2; gem.scale.set(1, 1.3, 1); prop.add(ring, gem); prop.userData.spin = true; }
  if (res === 'wheat') { const bag = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), new THREE.MeshStandardMaterial({ color: '#c8a24a', roughness: 0.9 })); bag.position.y = 0.08; bag.scale.set(1, 1.05, 1); const knot = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.04, 10), new THREE.MeshStandardMaterial({ color: '#a8842f' })); knot.position.y = 0.165; const dol = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.09), new THREE.MeshBasicMaterial({ transparent: true, map: canvasTex(128, 128, (c) => { c.font = '900 110px Arial Black, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#1b5e20'; c.fillText('$', 64, 70); }) })); dol.position.set(0, 0.08, 0.076); prop.add(bag, knot, dol); }
  if (res === 'sheep') { const lf = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, map: canvasTex(256, 256, (c) => drawLeaf(c, 128, 150, 110, '#3fae49', '#1b5e20')) })); lf.position.y = 0.16; const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 6), new THREE.MeshStandardMaterial({ color: '#555' })); pole.position.y = 0.03; prop.add(lf, pole); prop.userData.face = true; py = y + 0.13; prop.position.set(0.3, 0, -0.3); }
  if (res !== 'desert' && prop.children.length) { prop.position.y = py; if (res !== 'sheep') prop.position.z = -0.12; g.add(prop); g.userData.prop = prop; }
  g.traverse((o) => { if (o.isMesh && !o.material.isMeshBasicMaterial) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.hTop = hTop;
  return g;
}
// pistola de perfil (escaparate y cartel de la armería)
function drawGun(c, x, y, s, col) {
  c.save(); c.translate(x, y); c.scale(s, s); c.fillStyle = col; c.strokeStyle = '#111'; c.lineWidth = 3 / s;
  c.beginPath(); c.moveTo(0, 0); c.lineTo(90, 0); c.lineTo(92, 4); c.lineTo(92, 16); c.lineTo(44, 16); c.lineTo(40, 22); c.lineTo(34, 22); c.lineTo(40, 52); c.lineTo(22, 56); c.lineTo(10, 22); c.lineTo(4, 18); c.lineTo(0, 14); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.arc(36, 22, 7, 0, Math.PI); c.stroke(); c.restore();
}
// hoja de maría de siete puntas (para el cartel y las cartas)
function drawLeaf(c, x, y, s, col, vein) {
  c.save(); c.translate(x, y);
  [[-1.45, 0.45], [-0.95, 0.7], [-0.45, 0.92], [0, 1], [0.45, 0.92], [0.95, 0.7], [1.45, 0.45]].forEach(([a, l]) => {
    c.save(); c.rotate(a); const L = s * l; c.beginPath(); c.moveTo(0, 0);
    for (let i = 0; i <= 10; i++) { const t = i / 10, w = Math.sin(t * Math.PI) * L * 0.16; c.lineTo(w + (i % 2 ? 2 : -1), -t * L); }
    for (let i = 10; i >= 0; i--) { const t = i / 10, w = Math.sin(t * Math.PI) * L * 0.16; c.lineTo(-w - (i % 2 ? 2 : -1), -t * L); }
    c.closePath(); c.fillStyle = col; c.fill(); c.strokeStyle = vein; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -L * 0.95); c.stroke(); c.restore();
  });
  c.strokeStyle = vein; c.lineWidth = 5; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, s * 0.35); c.stroke(); c.restore();
}
// suelo de la manzana: asfalto en el borde (las calles), acera y solar
// muro bajo de hormigón en cada lado de la manzana (donde se pintan los grafitis); las esquinas quedan libres
const WALL_H = 0.17, WAP = 0.62; // altura y apotema de los muros (deja acera ancha)
function barrioWalls(res) {
  if (res === 'desert') return null;
  const L = [], ap = WAP, len = WAP * 1.1547 + 0.012;
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i, x = Math.cos(a) * ap, z = Math.sin(a) * ap; // centro del lado (orientación de las casillas)
    L.push(paint(G_BOX, i % 2 ? '#8d8a84' : '#85827c', M(x, TOP + WALL_H / 2, z, 0.024, WALL_H, len, -a)));
    L.push(paint(G_BOX, '#6f6c67', M(x, TOP + WALL_H + 0.005, z, 0.034, 0.01, len, -a)));
  }
  const m = merged(L, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true })); m.castShadow = true; return m;
}
function barrioGroundGeo(x, z, lot) {
  const L = [paint(G_CYL6, '#3a3a40', M(x, TOP - 0.01, z, 1.0, 0.02, 1.0)), paint(G_CYL6, '#b9b6ad', M(x, TOP + 0.002, z, 0.86, 0.016, 0.86)), paint(G_CYL6, lot, M(x, TOP + 0.006, z, WAP / 0.866, 0.016, WAP / 0.866))];
  return mergeGeometries(L);
}
function barrioGround(res) {
  const L = [];
  L.push(paint(G_CYL6, '#3a3a40', M(0, TOP - 0.01, 0, 1.0, 0.02, 1.0)));
  L.push(paint(G_CYL6, '#b9b6ad', M(0, TOP + 0.002, 0, 0.86, 0.016, 0.86)));
  L.push(paint(G_CYL6, res === 'sheep' ? '#7f9b5c' : res === 'desert' ? '#9a8f80' : '#a19d94', M(0, TOP + 0.006, 0, WAP / 0.866, 0.016, WAP / 0.866)));
  const m = merged(L, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true }));
  m.receiveShadow = true; return m;
}
function garitoMesh(color) {
  const L = [], g = new THREE.Group();
  B_(L, '#f2e6cf', 0, 0.06, 0, 0.17, 0.12, 0.13);                     // casa
  L.push(paint(prism, color, M(0, 0.12, 0, 0.19, 0.07, 0.15)));        // tejado del color de la banda
  B_(L, '#5d4037', 0.03, 0.045, 0.066, 0.04, 0.08, 0.004);              // puerta
  B_(L, '#ffd98a', -0.045, 0.07, 0.066, 0.035, 0.03, 0.004);            // ventana
  B_(L, '#8d6e63', -0.05, 0.02, 0.1, 0.07, 0.025, 0.03);                // sofá en el porche
  B_(L, color, 0, 0.003, 0.1, 0.2, 0.006, 0.07);                        // porche pintado
  B_(L, '#9e9e9e', 0.1, 0.03, -0.02, 0.006, 0.06, 0.006); B_(L, '#ffffff', 0.1, 0.07, -0.02, 0.03, 0.02, 0.003); // buzón
  g.add(withWindows(L)); return g;
}
function mansionMesh(color) {
  const L = [], g = new THREE.Group();
  B_(L, '#fafafa', 0, 0.075, -0.02, 0.32, 0.15, 0.2);
  B_(L, color, 0, 0.158, -0.02, 0.33, 0.018, 0.21);
  B_(L, '#fafafa', -0.08, 0.2, -0.04, 0.14, 0.08, 0.12); B_(L, color, -0.08, 0.243, -0.04, 0.15, 0.012, 0.13);
  for (let i = 0; i < 4; i++) B_(L, '#ffd98a', -0.12 + i * 0.08, 0.08, 0.081, 0.04, 0.05, 0.004);
  B_(L, '#0288d1', 0.03, 0.006, 0.16, 0.2, 0.012, 0.1); B_(L, '#4fc3f7', 0.03, 0.008, 0.16, 0.18, 0.012, 0.085); // piscina
  B_(L, '#d4af37', 0.16, 0.05, 0.13, 0.01, 0.1, 0.1);   // portón dorado
  [[-0.2, 0.14], [0.2, -0.12]].forEach(([x, z]) => { B_(L, '#8d6e4a', x, 0.1, z, 0.012, 0.2, 0.012); for (let k = 0; k < 6; k++) L.push(paint(G_BOX, '#3f9a3a', M(x + Math.cos(k) * 0.035, 0.2, z + Math.sin(k) * 0.035, 0.08, 0.008, 0.02, k))); });
  g.add(withWindows(L)); return g;
}
// calle conquistada: grafiti en el suelo y en un muro + dos colegas de la banda en la esquina
function streetClaimMesh(color, len, name) {
  const g = new THREE.Group();
  const tagTex = canvasTex(256, 64, (c, W, H) => {
    c.fillStyle = 'rgba(0,0,0,0)'; c.clearRect(0, 0, W, H); c.lineWidth = 9; c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = color; c.beginPath(); for (let i = 0; i <= 8; i++) c.lineTo(10 + i * 29, i % 2 ? 14 : 50); c.stroke();
    c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); for (let i = 0; i <= 8; i++) c.lineTo(10 + i * 29, i % 2 ? 14 : 50); c.stroke();
  });
  void tagTex;
  const wallTex = canvasTex(256, 64, (c, W, H) => {
    c.fillStyle = '#8f8f8f'; c.fillRect(0, 0, W, H); c.fillStyle = color; c.globalAlpha = 0.9;
    c.font = '900 42px Arial Black, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 6; c.strokeStyle = '#111'; c.strokeText('CREW', W / 2, H / 2 + 2); c.fillText('CREW', W / 2, H / 2 + 2);
    c.globalAlpha = 1; c.fillStyle = '#ffffff'; for (let i = 0; i < 18; i++) c.fillRect(Math.random() * W, Math.random() * H, 3, 3);
  });
  void wallTex;
  // grafiti pintado sobre los muros de las dos manzanas que dan a esta calle (mirando a la calle)
  const seed = Math.floor(Math.random() * 99), capM = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  [1, -1].forEach((sd, k) => {
    const tex = wallTagTex(color, name, seed + k);
    const pnl = new THREE.Mesh(new THREE.PlaneGeometry((WAP + 0.012) * 1.1547, WALL_H), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
    pnl.position.set(0, WALL_H / 2, sd * (0.866 - WAP - 0.014)); pnl.rotation.y = sd > 0 ? Math.PI : 0; pnl.userData.paint = true; g.add(pnl);
    const cap = new THREE.Mesh(new THREE.BoxGeometry((WAP + 0.012) * 1.1547, 0.012, 0.038), capM); cap.position.set(0, WALL_H + 0.012, sd * (0.866 - WAP)); cap.userData.paint = true; g.add(cap);
  });
  [-0.32, 0.32].forEach((x, i) => { const w = walkerMesh(color, null); w.scale.setScalar(1.7); w.position.set(x * len, 0.0, (i ? 1 : -1) * 0.18); w.rotation.y = i ? Math.PI - 0.5 : 0.5; w.userData.crew = true; g.add(w); });
  return g;
}
// letras de grafiti: tipografía Sedgwick Ave Display (OFL), en blanco con borde negro sobre la pared pintada del color de la banda
const GRAFF = ['CREW', 'BARRIO', 'KINGZ'];
let NAMES = [];
try { const ff = new FontFace('Graff', 'url(fonts/graff.woff2)'); ff.load().then((f) => document.fonts.add(f)).catch(() => {}); } catch (e) { /* sin FontFace */ }
function wallTagTex(color, name, seed) {
  return canvasTex(512, 112, (c, W, H) => {
    c.fillStyle = color; c.fillRect(0, 0, W, H);
    // textura de spray: manchas más claras y oscuras
    for (let i = 0; i < 40; i++) { c.globalAlpha = 0.08; c.fillStyle = i % 2 ? '#000' : '#fff'; c.beginPath(); c.arc(Math.random() * W, Math.random() * H, 8 + Math.random() * 26, 0, 7); c.fill(); }
    c.globalAlpha = 1; c.fillStyle = color; for (let i = 0; i < 9; i++) { const x = Math.random() * W; c.fillRect(x, H - 6, 4, -(4 + Math.random() * 3)); c.fillRect(x, H - 2, 4, 2); }
    const word = (name || 'CREW').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 14) || 'CREW';
    let fs = 92; c.font = `${fs}px Graff, Impact, Arial Black, sans-serif`;
    while (c.measureText(word).width > W * 0.82 && fs > 30) { fs -= 4; c.font = `${fs}px Graff, Impact, Arial Black, sans-serif`; }
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.save(); c.translate(W / 2, H / 2 + 4); c.rotate(((seed % 3) - 1) * 0.04);
    c.lineWidth = 18; c.strokeStyle = '#000'; c.strokeText(word, 4, 5); // sombra
    c.lineWidth = 12; c.strokeStyle = '#111'; c.strokeText(word, 0, 0);
    c.fillStyle = '#fff'; c.fillText(word, 0, 0);
    c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.arc(c.measureText(word).width / 2 + 10, -fs * 0.32, 5, 0, 7); c.fill(); // brillo
    c.restore();
  });
}
function graffitiTex(color, style) {
  return canvasTex(512, 80, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    const word = GRAFF[style], fs = 62;
    c.font = `900 ${fs}px Impact, Arial Black, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.save(); c.translate(W / 2, H / 2 + 3); c.rotate(style === 1 ? -0.05 : style === 2 ? 0.04 : 0); c.scale(1.25, 1);
    c.lineJoin = 'round'; c.lineWidth = 16; c.strokeStyle = '#111'; c.strokeText(word, 0, 0);
    c.lineWidth = 8; c.strokeStyle = '#ffffff'; c.strokeText(word, 0, 0);
    const gr = c.createLinearGradient(0, -fs / 2, 0, fs / 2); gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, color); gr.addColorStop(1, color);
    c.fillStyle = gr; c.fillText(word, 0, 0);
    c.restore();
    c.fillStyle = color; for (let i = 0; i < 6; i++) { const x = 30 + Math.random() * (W - 60); c.fillRect(x, H - 14, 3, 4 + Math.random() * 10); } // gotas
    c.globalAlpha = 0.9; c.fillStyle = '#fff'; c.beginPath(); c.arc(W - 40, 18, 5, 0, 7); c.fill(); // brillo
  });
}
// logo del traficante pintado con spray en la pared del almacén
function logoTex(r) {
  const img = iconImg(RINFO[r].e), col = RINFO[r].c;
  return iconCanvasTex(256, 256, img, (c, W, H) => {
    c.clearRect(0, 0, W, H); c.fillStyle = col; c.globalAlpha = 0.95; c.beginPath();
    for (let i = 0; i <= 28; i++) { const a = (i / 28) * Math.PI * 2, rr = 100 + Math.sin(i * 2.7) * 10 + (i % 3 ? 0 : 12); c.lineTo(W / 2 + Math.cos(a) * rr, H / 2 + Math.sin(a) * rr * 0.92); } c.fill();
    for (let i = 0; i < 6; i++) { const x = 70 + i * 24 + Math.sin(i) * 6; c.fillRect(x, 200, 7, 20 + (i % 3) * 14); c.beginPath(); c.arc(x + 3.5, 222 + (i % 3) * 14, 5, 0, 7); c.fill(); } // gotas
    c.globalAlpha = 1; c.lineWidth = 10; c.strokeStyle = '#111'; c.beginPath(); c.arc(W / 2, H / 2, 82, 0, 7); c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(W / 2, H / 2, 77, 0, 7); c.fill();
    if (img && img.complete && img.naturalWidth) c.drawImage(img, W / 2 - 64, H / 2 - 64, 128, 128);
  });
}
// traficante: encapuchado con lo suyo bien a la vista
function dealerMesh(type) {
  const g = new THREE.Group(), s = 2.1, w = walkerMesh('#1d1d22', null); w.scale.setScalar(s); g.add(w);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), new THREE.MeshStandardMaterial({ color: '#1d1d22' })); hood.scale.setScalar(s); hood.position.y = 0.095 * s; g.add(hood);
  const std = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.6 }, o));
  if (type === 'brick') { // AK-47 cruzada
    const ak = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.022, 0.016), std('#2a2a2a')); ak.add(body);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.016), std('#7a4a22')); stock.position.x = -0.12; ak.add(stock);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.014), std('#2a2a2a')); mag.position.set(0.02, -0.03, 0); mag.rotation.z = 0.35; ak.add(mag);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.02, 0.016), std('#7a4a22')); grip.position.x = 0.07; ak.add(grip);
    ak.position.set(0, 0.13, 0.045); ak.rotation.set(0, 0, 0.6); g.add(ak);
  } else if (type === 'sheep') { // bolsitas verdes
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.012), std('#4caf50', { roughness: 0.3 })); b.position.set(i < 2 ? 0.05 : -0.05, 0.09 + (i % 2) * 0.035, 0.03); g.add(b); }
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), std('#2e7d32')); bag.position.set(0.07, 0.03, 0.03); g.add(bag);
  } else if (type === 'wheat') { // saco a la espalda con el dólar
    const sack = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), std('#c8a24a', { roughness: 0.9 })); sack.position.set(0, 0.17, -0.05); g.add(sack);
    const dol = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.07), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, map: canvasTex(128, 128, (c) => { c.font = '900 110px Arial Black, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#1b5e20'; c.fillText('$', 64, 70); }) })); dol.position.set(0, 0.17, -0.112); dol.rotation.y = Math.PI; g.add(dol);
  } else if (type === 'ore') { // cadenón de oro y un pedrusco en la mano
    const ch = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.009, 8, 20), std('#ffd23f', { metalness: 0.95, roughness: 0.2 })); ch.position.set(0, 0.15, 0.03); ch.rotation.x = 1.2; g.add(ch);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.032, 0), std('#7fe3ff', { metalness: 0.3, roughness: 0.05, emissive: '#2a8fb0', emissiveIntensity: 0.6 })); gem.position.set(0.07, 0.16, 0.03); gem.scale.y = 1.3; g.add(gem);
  } else if (type === 'wood') { // un bote de spray en cada mano
    ['#ff4f8b', '#3ec1d3'].forEach((c, i) => { const can = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.06, 10), std(c, { metalness: 0.4, roughness: 0.3 })); can.position.set(i ? -0.06 : 0.06, 0.1, 0.03); g.add(can); });
  } else { // trato general: bolsa de deporte
    const duf = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 12), std('#333')); duf.rotation.z = Math.PI / 2; duf.position.set(0.08, 0.04, 0.02); g.add(duf);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
// vagón del tren elevado
function trainCar(head) {
  const g = new THREE.Group(), L = [];
  B_(L, '#d9dde2', 0, 0.045, 0, 0.25, 0.08, 0.1); B_(L, '#e0b322', 0, 0.02, 0, 0.252, 0.014, 0.102);
  for (let k = 0; k < 5; k++) B_(L, '#ffd98a', -0.084 + k * 0.042, 0.06, 0, 0.03, 0.026, 0.103);
  B_(L, '#2b3440', 0, 0.06, 0, 0.21, 0.03, 0.1);
  if (head) B_(L, '#2b3440', 0.124, 0.055, 0, 0.006, 0.04, 0.08);
  g.add(withWindows(L)); g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
// furgoneta del traficante: blanca, portón trasero abierto y cajas del color del recurso
function dealerVan(col) {
  const g = new THREE.Group(), L = [];
  B_(L, '#e8e8e8', 0, -0.1 + 0.075, 0, 0.3, 0.11, 0.15); B_(L, '#e8e8e8', 0.17, -0.1 + 0.055, 0, 0.07, 0.07, 0.15);
  B_(L, '#9fc8e6', 0.2, -0.1 + 0.08, 0, 0.012, 0.035, 0.13);
  B_(L, '#1a1a1a', -0.151, -0.1 + 0.075, 0, 0.004, 0.1, 0.13); // hueco trasero
  for (let i = 0; i < 3; i++) B_(L, i % 2 ? col : shade(col, 0.8), -0.12 + i * 0.012, -0.1 + 0.035 + i * 0.03, (i - 1) * 0.04, 0.05, 0.03, 0.04);
  const door = new THREE.Group(); const d = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.1, 0.075), new THREE.MeshStandardMaterial({ color: '#dcdcdc' })); d.position.set(0, 0, 0.0375); door.add(d); door.position.set(-0.152, -0.1 + 0.075, 0.075); door.rotation.y = -1.1; g.add(door);
  [[-0.09, -1], [-0.09, 1], [0.12, -1], [0.12, 1]].forEach(([x, z]) => L.push(paint(G_CYL12, '#151515', M(x, -0.1 + 0.025, z * 0.076, 0.025, 0.02, 0.025, 0, Math.PI / 2))));
  g.add(merged(L, MAT_())); g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function carBody(color, lv) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const paintM = new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.55 }), dark = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.6 }), chrome = new THREE.MeshStandardMaterial({ color: '#e8e8e8', metalness: 1, roughness: 0.15 }), glass = new THREE.MeshStandardMaterial({ color: '#9fc8e6', roughness: 0.1, metalness: 0.4 });
  if (lv >= 2) { // superdeportivo en cuña
    const s = new THREE.Shape(); s.moveTo(-0.2, 0); s.lineTo(0.22, 0); s.lineTo(0.2, 0.035); s.lineTo(0.03, 0.075); s.lineTo(-0.12, 0.07); s.lineTo(-0.2, 0.045); s.lineTo(-0.2, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.13, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 1 }); geo.translate(0, 0.02, -0.065);
    body.add(new THREE.Mesh(geo, paintM));
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.1), glass); cab.position.set(-0.04, 0.095, 0); body.add(cab);
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.008, 0.14), dark); sp.position.set(-0.19, 0.11, 0); body.add(sp);
    [-1, 1].forEach((z) => { const st = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.04, 0.008), dark); st.position.set(-0.18, 0.09, z * 0.05); body.add(st); });
  } else { // lowrider: largo, bajito y con cromados
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.15), paintM); b1.position.y = 0.045; body.add(b1);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.045, 0.13), glass); b2.position.set(-0.03, 0.09, 0); body.add(b2);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.01, 0.135), paintM); roof.position.set(-0.03, 0.115, 0); body.add(roof);
    const bump = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.02, 0.15), chrome); bump.position.set(0.215, 0.035, 0); body.add(bump);
    const bump2 = bump.clone(); bump2.position.x = -0.215; body.add(bump2);
  }
  [[-0.13, -1], [-0.13, 1], [0.13, -1], [0.13, 1]].forEach(([x, z]) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.025, 12), dark); w.rotation.x = Math.PI / 2; w.position.set(x, 0.032, z * 0.075); body.add(w); const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.027, 10), chrome); hub.rotation.x = Math.PI / 2; hub.position.copy(w.position); body.add(hub); });
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  body.scale.setScalar(1.25);
  return g;
}
function policeMesh() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const white = new THREE.MeshStandardMaterial({ color: '#f5f5f5', roughness: 0.3, metalness: 0.3 }), black = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.4, metalness: 0.3 });
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.16), black); b1.position.y = 0.05; body.add(b1);
  const doors = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.061, 0.162), white); doors.position.y = 0.05; body.add(doors);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.05, 0.14), new THREE.MeshStandardMaterial({ color: '#9fc8e6', roughness: 0.1 })); cab.position.set(-0.02, 0.105, 0); body.add(cab);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.01, 0.142), white); roof.position.set(-0.02, 0.135, 0); body.add(roof);
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.05), new THREE.MeshBasicMaterial({ color: '#ff1744' })); red.position.set(-0.02, 0.15, -0.035); body.add(red);
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.05), new THREE.MeshBasicMaterial({ color: '#2979ff' })); blue.position.set(-0.02, 0.15, 0.035); body.add(blue);
  const glowR = new THREE.PointLight('#ff1744', 0, 1.2), glowB = new THREE.PointLight('#2979ff', 0, 1.2); glowR.position.set(0, 0.3, -0.1); glowB.position.set(0, 0.3, 0.1); g.add(glowR, glowB);
  [[-0.11, -1], [-0.11, 1], [0.11, -1], [0.11, 1]].forEach(([x, z]) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.025, 12), black); w.rotation.x = Math.PI / 2; w.position.set(x, 0.03, z * 0.08); body.add(w); });
  body.scale.setScalar(1.35);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.lights = { red, blue, glowR, glowB };
  return g;
}
function tapeMesh() { // cinta policial alrededor de la manzana
  const g = new THREE.Group();
  const tex = canvasTex(256, 32, (c, W, H) => { c.fillStyle = '#ffd400'; c.fillRect(0, 0, W, H); c.fillStyle = '#111'; c.font = '900 20px Arial'; c.textBaseline = 'middle'; for (let x = 0; x < W; x += 128) c.fillText('POLICÍA · NO PASAR', x + 4, H / 2 + 1); });
  tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(1.2, 1);
  const r = 0.83;
  for (let i = 0; i < 6; i++) {
    const a1 = (Math.PI / 3) * i + Math.PI / 6, a2 = a1 + Math.PI / 3; // misma orientación que las casillas (vértices arriba y abajo)
    const p1 = new THREE.Vector3(Math.cos(a1) * r, 0, Math.sin(a1) * r), p2 = new THREE.Vector3(Math.cos(a2) * r, 0, Math.sin(a2) * r);
    const mid = p1.clone().add(p2).multiplyScalar(0.5), L = p1.distanceTo(p2);
    const t = new THREE.Mesh(new THREE.PlaneGeometry(L, 0.035), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true }));
    t.position.set(mid.x, TOP + 0.09, mid.z); t.rotation.y = -Math.atan2(p2.z - p1.z, p2.x - p1.x); g.add(t);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.11, 6), new THREE.MeshStandardMaterial({ color: '#ff6f00' })); post.position.set(p1.x, TOP + 0.055, p1.z); g.add(post);
  }
  return g;
}
export { settlementMesh, cityMesh, roadMesh, robberMesh, shipMesh };
