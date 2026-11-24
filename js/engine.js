// Motor de reglas compartido (pantalla anfitriona y móviles).
// El anfitrión es la autoridad: aplica acciones con act(); los móviles usan las mismas
// funciones de consulta para saber dónde se puede construir.

export const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
export const RINFO = {
  wood: { n: 'Madera', e: '🪵', c: '#2f7d3a' },
  brick: { n: 'Arcilla', e: '<img class="ri" src="icons/res/clay.svg" alt="🧱">', c: '#c1592b' },
  sheep: { n: 'Lana', e: '🐑', c: '#7fb446' },
  wheat: { n: 'Trigo', e: '🌾', c: '#d9a21b' },
  ore: { n: 'Piedra', e: '🪨', c: '#6f7c8a' },
  desert: { n: 'Desierto', e: '🏜️', c: '#d8c48f' },
  // reglas ampliadas: materiales fabricados (solo con una ciudad; no cuentan para el 7 y no se pueden robar ni descartar)
  cloth: { n: 'Tela', e: '🧵', c: '#8e6bb8' },
  tools: { n: 'Herramientas', e: '🔨', c: '#5d6d7e' },
  cement: { n: 'Cemento', e: '<img class="ri" src="icons/res/cement.svg" alt="Cemento">', c: '#9e9a92' },
};
export const GOODS = ['cloth', 'tools', 'cement'];
export const RECIPE = { cloth: { sheep: 2, wheat: 1 }, tools: { wood: 2, ore: 2 }, cement: { brick: 2, ore: 1 } };
// palabras que cambian con el tema (estética) de la partida; ver themes.js
export const W = {
  settlement: 'poblado', city: 'ciudad', road: 'camino', ship: 'barco', robber: 'el ladrón', robberE: '🦹',
  buildSett: 'construye un poblado', buildCity: 'mejora a ciudad', buildRoad: 'construye un camino', buildShip: 'bota un barco',
  upShip: 'mejora un barco: ahora navega 2 tramos por turno', robberMoves: 'se mueve a', steals: 'roba una carta a',
  longest: 'el Camino más largo', army: 'el Mayor ejército', noRobberSpot: 'no tiene adónde ir',
};
export const COST = {
  road: { wood: 1, brick: 1 },
  ship: { wood: 1, sheep: 1 },
  shipUp: { wood: 3, sheep: 2 }, // barco mejorado: navega 2 tramos por turno (atracado en un poblado o ciudad tuya)
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  dev: { sheep: 1, wheat: 1, ore: 1 },
  // reglas ampliadas
  shipUpX: { wood: 2, cloth: 1 },
  metro: { tools: 2, cloth: 1, cement: 1, wheat: 1 },
  pave: { cement: 1 },
  moveRoad: { tools: 1 },
};
export const DEV = {
  knight: { n: 'Caballero', e: '⚔️', d: 'Mueve el ladrón y roba una carta. Se puede jugar antes de tirar.' },
  road: { n: 'Construcción de caminos', e: '🛤️', d: 'Construye 2 caminos gratis (con barcos: también puedes navegar 2 tramos).' },
  plenty: { n: 'Año de abundancia', e: '🎁', d: 'Coge 2 recursos cualesquiera del banco.' },
  mono: { n: 'Monopolio', e: '💰', d: 'Elige un recurso: todos te dan los suyos.' },
  vp: { n: 'Punto de victoria', e: '⭐', d: '+1 punto. Secreto hasta el final.' },
  pirate: { n: 'Pirata', e: '🏴‍☠️', d: 'Roba 2 recursos a un jugador que tenga algún barco en el mar.' },
  demolish: { n: 'Derribo', e: '🧨', d: 'Derribas un camino de otro (sin dejar caminos sueltos ni calzadas) y pones uno tuyo pagándolo.' },
};
export const COLORS = [
  { k: 'red', n: 'Rojo', c: '#e53935' }, { k: 'blue', n: 'Azul', c: '#1e88e5' },
  { k: 'white', n: 'Blanco', c: '#f4f1e8' }, { k: 'orange', n: 'Naranja', c: '#fb8c00' },
  { k: 'green', n: 'Verde', c: '#2fa84f' }, { k: 'purple', n: 'Morado', c: '#8e44ad' },
  { k: 'brown', n: 'Marrón', c: '#8d5a3b' }, { k: 'teal', n: 'Turquesa', c: '#00acc1' },
];
// Espacio por jugador. "Guerra" = proporción del tablero original (19 hexágonos / 4 jugadores).
// min: tamaño mínimo aunque seáis pocos (así con 2 o 3 también se puede elegir tablero más grande)
// isl: tierra extra en islas (modo barcos), en proporción a la isla principal
export const DENSITIES = [
  { k: 'war', n: 'Guerra', d: 4.75, min: 19, isl: 0.4, note: 'Como el original: poco sitio, mucha pelea' },
  { k: 'normal', n: 'Normal', d: 6, min: 23, isl: 0.65, note: 'Recomendado' },
  { k: 'roomy', n: 'Holgado', d: 7.5, min: 28, isl: 0.95, note: 'Partida relajada' },
  { k: 'huge', n: 'Enorme', d: 9.5, min: 34, isl: 1.35, note: 'Partida larga, mucho por explorar' },
];
export function hexCountFor(players, densKey) {
  const D = DENSITIES.find((x) => x.k === densKey) || DENSITIES[1];
  return Math.max(D.min, Math.ceil(players * D.d));
}
// reparto de tierra: en modo barcos la isla principal es como el tablero original y el tamaño elegido decide cuántas islas hay
export function landPlan(players, densKey, ships) {
  if (!ships) return { N: hexCountFor(players, densKey), mainN: null, isl: 0 };
  const D = DENSITIES.find((x) => x.k === densKey) || DENSITIES[1];
  const mainN = Math.max(19, Math.ceil(players * 4.75)), isl = Math.max(6, Math.round(mainN * D.isl));
  return { N: mainN + isl, mainN, isl };
}

export const rnd = (n) => Math.floor(Math.random() * n);
export function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- Generación de mapa ---------------- */
const D6 = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const W3 = Math.sqrt(3);
const ck = (q, r) => q + ',' + r;
const hexDist = (q, r) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
// isla compacta de N casillas alrededor del origen (algo más ancha que alta)
function blob(N, jitter = 0.3) {
  const R = Math.ceil(Math.sqrt(N)) + 3, cand = [];
  for (let q = -R; q <= R; q++) for (let r = -R; r <= R; r++) {
    const x = W3 * (q + r / 2), y = 1.5 * r;
    cand.push({ q, r, x, y, d: Math.hypot(x / 1.22, y) + Math.random() * jitter });
  }
  cand.sort((a, b) => a.d - b.d);
  // sin lagunas interiores: si una casilla vacía queda rodeada, la rellenamos y quitamos la más exterior
  const sel = new Map(cand.slice(0, N).map((c) => [ck(c.q, c.r), c]));
  const nbCount = (c) => D6.filter(([a, b]) => sel.has(ck(c.q + a, c.r + b))).length;
  for (let it = 0; it < 50; it++) {
    const hole = cand.find((c) => !sel.has(ck(c.q, c.r)) && nbCount(c) >= 4);
    if (!hole) break;
    sel.set(ck(hole.q, hole.r), hole);
    const worst = [...sel.values()].filter((c) => c !== hole).sort((a, b) => nbCount(a) - nbCount(b) || b.d - a.d)[0];
    sel.delete(ck(worst.q, worst.r));
  }
  return [...sel.values()].map((c) => ({ q: c.q, r: c.r, island: 0 }));
}
// archipiélago: isla principal + islas pequeñas separadas por mar, todo rodeado de casillas de mar jugables
function archipelago(N, mainN, style) {
  const M = Math.max(12, Math.min(N - 4, mainN || Math.round(N * 0.58)));
  const land = new Map(blob(M, 0.5).map((c) => [ck(c.q, c.r), c]));
  const rMain = Math.max(...[...land.values()].map((c) => hexDist(c.q, c.r)));
  let remaining = N - M, id = 1, tries = 0;
  const touchesOther = (q, r, isl) => D6.some(([a, b]) => { const o = land.get(ck(q + a, r + b)); return o && o.island !== isl; });
  while (remaining > 0 && tries++ < 800) {
    const big = style === 'big';
    let size = Math.min(remaining, big ? 4 + rnd(3) : 2 + rnd(2)); if (remaining - size === 1) size++;
    const ang = Math.random() * Math.PI * 2, dist = rMain + 2 + Math.random() * (big ? 3.2 : 2.6) + (tries > 300 ? 2 : 0);
    const fx = Math.cos(ang) * dist * 1.2, fy = Math.sin(ang) * dist;
    const r0 = Math.round(fy / 1.5 * 1.5 / 1.5), q0 = Math.round(fx / W3 - r0 / 2);
    if (land.has(ck(q0, r0)) || touchesOther(q0, r0, id)) continue;
    const cells = [{ q: q0, r: r0, island: id }]; land.set(ck(q0, r0), cells[0]);
    for (let g = 0; g < 40 && cells.length < size; g++) {
      const base = cells[rnd(cells.length)], [a, b] = D6[rnd(6)], q = base.q + a, r = base.r + b;
      if (land.has(ck(q, r)) || touchesOther(q, r, id)) continue;
      const c = { q, r, island: id }; cells.push(c); land.set(ck(q, r), c);
    }
    remaining -= cells.length; id++;
  }
  // mar navegable en forma de gran hexágono regular: así la silueta no delata dónde están las islas
  const Rmax = Math.max(...[...land.values()].map((c) => hexDist(c.q, c.r))) + 1;
  const out = [...land.values()];
  for (let q = -Rmax; q <= Rmax; q++) for (let r = -Rmax; r <= Rmax; r++) {
    if (hexDist(q, r) > Rmax || land.has(ck(q, r))) continue;
    out.push({ q, r, island: -1, sea: true });
  }
  return out;
}
export function genBoard(N, opts = {}) {
  const S = 1, W = W3;
  const cells = opts.ships ? archipelago(N, opts.mainN, opts.islands) : blob(N);
  const hexes = cells.map((c, i) => ({ id: i, q: c.q, r: c.r, x: W * (c.q + c.r / 2), y: 1.5 * c.r, island: c.island, sea: !!c.sea }));
  const key = ck, byKey = {};
  hexes.forEach((h) => (byKey[key(h.q, h.r)] = h));
  const DIRS = D6;
  hexes.forEach((h) => (h.nb = DIRS.map(([dq, dr]) => byKey[key(h.q + dq, h.r + dr)]).filter(Boolean).map((o) => o.id)));
  const landH = hexes.filter((h) => !h.sea);
  N = landH.length;

  // tipos de terreno en la proporción del original
  const deserts = 1, L = N - deserts; // un solo desierto (la casa del ladrón), sea cual sea el tamaño
  const weights = { wood: 4, sheep: 4, wheat: 4, brick: 3, ore: 3 };
  const counts = {}, rem = [];
  let used = 0;
  for (const k in weights) { const ex = (L * weights[k]) / 18; counts[k] = Math.floor(ex); used += counts[k]; rem.push([ex - counts[k], k]); }
  rem.sort((a, b) => b[0] - a[0]);
  for (let i = 0; used < L; i++, used++) counts[rem[i % rem.length][1]]++;
  const types = [];
  for (const k in counts) for (let i = 0; i < counts[k]; i++) types.push(k);
  shuffle(types);
  // los desiertos van en la isla principal
  const mainIdx = landH.map((h, i) => (h.island === 0 ? i : -1)).filter((i) => i >= 0);
  const desertIdx = new Set(shuffle(mainIdx).slice(0, deserts));
  let ti = 0;
  landH.forEach((h, i) => { h.res = desertIdx.has(i) ? 'desert' : types[ti++] || 'sheep'; h.num = null; });
  hexes.forEach((h) => { if (h.sea) { h.res = 'sea'; h.num = null; } });

  // números: el 6 y el 8 nunca juntos; si se puede, tampoco dos iguales juntos
  const land = landH.filter((h) => h.res !== 'desert');
  const base = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 3, 4, 5, 6, 8, 9, 10, 11];
  const pool = [];
  for (let i = 0; pool.length < land.length; i++) pool.push(base[i % base.length]);
  const hot = (x) => x === 6 || x === 8;
  const strict = () => land.every((h) => !h.nb.some((id) => { const o = hexes[id].num; return o === h.num || (hot(h.num) && hot(o)); }));
  const loose = () => land.every((h) => !(hot(h.num) && h.nb.some((id) => hot(hexes[id].num))));
  let ok = false;
  for (let t = 0; t < 3000 && !ok; t++) { shuffle(pool); land.forEach((h, i) => (h.num = pool[i])); ok = strict(); }
  for (let t = 0; t < 20000 && !ok; t++) { shuffle(pool); land.forEach((h, i) => (h.num = pool[i])); ok = loose(); }
  if (!ok) {
    for (let t = 0; t < 5000; t++) {
      const bad = land.find((h) => hot(h.num) && h.nb.some((id) => hot(hexes[id].num)));
      if (!bad) break;
      const cold = land.filter((h) => !hot(h.num) && !h.nb.some((id) => hot(hexes[id].num)));
      const c = cold[rnd(cold.length)];
      if (!c) break;
      [bad.num, c.num] = [c.num, bad.num];
    }
  }

  // vértices y aristas
  const verts = [], vmap = {}, edges = [], emap = {};
  hexes.forEach((h) => {
    h.verts = [];
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 180) * (60 * k - 30), x = h.x + S * Math.cos(a), y = h.y + S * Math.sin(a);
      const kk = Math.round(x * 100) + ',' + Math.round(y * 100);
      let v = vmap[kk];
      if (v === undefined) { v = verts.length; vmap[kk] = v; verts.push({ id: v, x, y, hexes: [], adj: [], edges: [], b: null, port: null }); }
      verts[v].hexes.push(h.id); h.verts.push(v);
    }
    for (let k = 0; k < 6; k++) {
      const a = h.verts[k], b = h.verts[(k + 1) % 6], kk = Math.min(a, b) + '-' + Math.max(a, b);
      let e = emap[kk];
      if (e === undefined) {
        e = edges.length; emap[kk] = e;
        edges.push({ id: e, v: [a, b], hexes: [], road: null });
        verts[a].edges.push(e); verts[b].edges.push(e); verts[a].adj.push(b); verts[b].adj.push(a);
      }
      edges[e].hexes.push(h.id);
    }
  });

  const cx = landH.reduce((s, h) => s + h.x, 0) / landH.length, cy = landH.reduce((s, h) => s + h.y, 0) / landH.length;
  hexes.forEach((h) => { h.x -= cx; h.y -= cy; });
  verts.forEach((v) => { v.x -= cx; v.y -= cy; });

  // puertos repartidos por la costa (recorrido ordenado alrededor del perímetro)
  const coast = edges.filter((e) => { const lh = e.hexes.filter((id) => !hexes[id].sea); return lh.length === 1 && hexes[lh[0]].island === 0; });
  const ordered = orderCoast(coast, verts);
  const P = Math.max(9, Math.round(ordered.length / 3.4));
  const generic = Math.round((P * 4) / 9);
  const ptypes = [...RES];
  for (let i = 0; i < generic; i++) ptypes.push('any');
  while (ptypes.length < P) ptypes.push(RES[rnd(5)]);
  shuffle(ptypes);
  const ports = [], off = rnd(ordered.length), usedV = new Set();
  for (let i = 0; i < P; i++) {
    let idx = (off + Math.floor((i * ordered.length) / P)) % ordered.length;
    let e = ordered[idx];
    for (let s = 0; s < 3 && e.v.some((v) => usedV.has(v)); s++) e = ordered[(idx + s + 1) % ordered.length];
    if (e.v.some((v) => usedV.has(v))) continue;
    e.v.forEach((v) => usedV.add(v));
    const h = hexes[e.hexes.find((id) => !hexes[id].sea)], a = verts[e.v[0]], b = verts[e.v[1]];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = mx - h.x, dy = my - h.y, d = Math.hypot(dx, dy);
    ports.push({ type: ptypes[i], e: e.id, hex: h.id, x: mx + (dx / d) * 0.6, y: my + (dy / d) * 0.6 });
    e.v.forEach((v) => (verts[v].port = ptypes[i]));
  }

  // anillo de mar
  const sea = [], seen = new Set(hexes.map((h) => key(h.q, h.r)));
  hexes.forEach((h) => DIRS.forEach(([dq, dr]) => {
    const q = h.q + dq, r = h.r + dr, k = key(q, r);
    if (seen.has(k)) return; seen.add(k);
    sea.push({ x: W * (q + r / 2) - cx, y: 1.5 * r - cy });
  }));
  const robber = hexes.find((h) => h.res === 'desert').id;
  return { S, W, hexes, verts, edges, ports, sea, robber };
}
function orderCoast(coast, verts) {
  // recorre el perímetro siguiendo aristas costeras conectadas
  if (!coast.length) return [];
  const byV = {};
  coast.forEach((e) => e.v.forEach((v) => (byV[v] = byV[v] || []).push(e)));
  const out = [], seen = new Set();
  let e = coast[0], v = e.v[0];
  while (e && !seen.has(e.id)) {
    seen.add(e.id); out.push(e);
    const nv = e.v[0] === v ? e.v[1] : e.v[0];
    v = nv;
    e = (byV[v] || []).find((x) => !seen.has(x.id));
  }
  // nos quedamos con el contorno exterior (el recorrido más largo)
  if (out.length < coast.length / 2) {
    let best = out;
    coast.forEach((c) => {
      if (seen.has(c.id)) return;
      const loop = []; let e2 = c, v2 = c.v[0];
      while (e2 && !seen.has(e2.id)) { seen.add(e2.id); loop.push(e2); v2 = e2.v[0] === v2 ? e2.v[1] : e2.v[0]; e2 = (byV[v2] || []).find((x) => !seen.has(x.id)); }
      if (loop.length > best.length) best = loop;
    });
    return best;
  }
  return out;
}

/* ---------------- Partida ---------------- */
export function newGame(opts) {
  // opts: {players:[{name,color}], density, fog, target, sbp}
  const np = opts.players.length;
  const { N, mainN } = landPlan(np, opts.density, !!opts.ships); // en barcos: isla principal como el original + islas según el tamaño
  const board = genBoard(N, { ships: !!opts.ships, mainN, islands: opts.islands || 'small' });
  const f = Math.max(1, np / 4);
  const devCounts = { knight: Math.round(14 * f), vp: 5 + Math.max(0, np - 6), road: Math.round(2 * f), plenty: Math.round(2 * f), mono: Math.round(2 * f) };
  if (opts.ships) devCounts.pirate = Math.round(2 * f);
  if (opts.ext) devCounts.demolish = Math.round(2 * f);
  const deck = [];
  for (const k in devCounts) for (let i = 0; i < devCounts[k]; i++) deck.push(k);
  shuffle(deck);
  const bankN = Math.max(19, Math.round(N * 0.8));
  const bank = {}; RES.forEach((r) => (bank[r] = bankN));
  const start = rnd(np);
  const order = [...Array(np)].map((_, i) => (start + i) % np);
  const G = {
    v: 2, opts, N, bankN, board, bank, deck,
    players: opts.players.map((p) => ({ name: p.name, color: p.color, res: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0, cloth: 0, tools: 0, cement: 0 }, dev: [], knights: 0, roads: 15, setts: 5, cities: 4, metros: 3, shipsLeft: 3 })),
    ships: [], shipSeq: 0, islandClaim: {}, fleet: null, explorer: null,
    turn: start, first: start, turnNum: 0, phase: 'setup', setupIdx: 0, setupOrder: [...order, ...order.slice().reverse()], setupSub: 'settlement', lastSett: null,
    dice: null, rollId: 0, playedDev: false, longest: null, army: null, roadLens: Array(np).fill(0), log: [], winner: null,
    sbpQueue: [], discardQueue: [], afterRobber: null, rbLeft: 0, revealed: {}, stealCands: [], offer: null, ev: [],
  };
  if (opts.ships && opts.fog) { // se ve la isla principal y el mar que la rodea
    board.hexes.forEach((h) => { if (h.island === 0 || (h.sea && h.nb.some((id) => board.hexes[id].island === 0))) G.revealed[h.id] = true; });
  }
  log(G, `Empieza <b>${pn(G, start)}</b>. Colocad los primeros poblados${opts.ships ? ' en la isla principal' : ''}.`);
  return G;
}
// estadísticas para el resumen final (se crean al vuelo, también en partidas guardadas de antes)
export function stats(G) {
  const n = G.players.length;
  if (!G.stats) G.stats = { got: Array(n).fill(0), stole: Array(n).fill(0), lost: Array(n).fill(0), disc: Array(n).fill(0), hex: {}, vtx: {} };
  if (!G.stats.vtx) G.stats.vtx = {};
  return G.stats;
}
// para la escena final: la casa que más ha producido del ganador (su "capital") y todas sus casas
export function winnerSpots(G, st) {
  const p = G.winner; if (p === null || p === undefined) return null;
  const mine = G.board.verts.filter((v) => v.b && v.b.p === p);
  if (!mine.length) return null;
  const vt = (st && st.vtx) || {};
  const main = mine.slice().sort((a, b) => (vt[b.id] || 0) - (vt[a.id] || 0) || (b.b.t === 'c') - (a.b.t === 'c'))[0];
  return { main: main.id, verts: mine.map((v) => v.id) };
}
export function log(G, m) { G.log.unshift(m); if (G.log.length > 60) G.log.length = 60; }
export function pn(G, i) { return esc(G.players[i].name); }
export function total(G, p) { return RES.reduce((s, r) => s + G.players[p].res[r], 0); }
export function handCount(G, p) { const R = G.players[p].res; return total(G, p) + GOODS.reduce((s, k) => s + (R[k] || 0), 0); }
export function actor(G) {
  if (G.phase === 'sbp') return G.sbpQueue[0];
  if (G.phase === 'discard') return G.discardQueue[0];
  return G.turn;
}
export const isRevealed = (G, h) => !G.opts.fog || !!G.revealed[h];
export const isSea = (G, h) => G.board.hexes[h].res === 'sea';
export const vertLand = (G, v) => G.board.verts[v].hexes.some((h) => !isSea(G, h));
export const edgeLand = (G, e) => G.board.edges[e].hexes.some((h) => !isSea(G, h));
export const edgeSea = (G, e) => !!G.opts.ships && G.board.edges[e].hexes.some((h) => isSea(G, h));
export const shipAt = (G, e) => (G.ships || []).find((s) => s.e === e);
const shipTouches = (G, p, v) => (G.ships || []).some((s) => s.p === p && G.board.edges[s.e].v.includes(v));
// barcos que se pueden mejorar: los tuyos, sin mejorar y atracados junto a un poblado o ciudad tuya
export function upgradableShips(G, p) {
  return (G.ships || []).filter((x) => x.p === p && (x.lv || 1) < 2 && G.board.edges[x.e].v.some((v) => { const b = G.board.verts[v].b; return b && b.p === p; }));
}
export function canBuildShipE(G, p, e) {
  if (!G.opts.ships || !edgeSea(G, e) || shipAt(G, e)) return false;
  return G.board.edges[e].v.some((v) => { const b = G.board.verts[v].b; return b && b.p === p; });
}
// barcos que se pueden mover y a dónde (1 tramo por barco y turno; free = carta de caminos/millas)
export function shipMoves(G, p, free) {
  const out = [];
  (G.ships || []).forEach((s) => {
    if (s.p !== p) return;
    if (!free && (s.bt >= G.turnNum || (s.mv >= G.turnNum && (s.mvn || 1) >= (s.lv || 1)))) return;
    G.board.edges[s.e].v.forEach((v) => G.board.verts[v].edges.forEach((e) => { if (e !== s.e && edgeSea(G, e) && !shipAt(G, e)) out.push({ id: s.id, to: e }); }));
  });
  return out;
}
export function afford(G, p, c) { return Object.entries(c).every(([r, n]) => (G.players[p].res[r] || 0) >= n); }
function pay(G, p, c) { for (const [r, n] of Object.entries(c)) { G.players[p].res[r] -= n; if (RES.includes(r)) G.bank[r] += n; } }
export function canSettleV(G, p, v, setup) {
  const V = G.board.verts[v];
  if (V.b || V.adj.some((a) => G.board.verts[a].b)) return false;
  if (G.opts.ships && !vertLand(G, v)) return false;
  if (setup) return !G.opts.ships || V.hexes.some((h) => G.board.hexes[h].island === 0);
  return V.edges.some((e) => G.board.edges[e].road === p) || shipTouches(G, p, v);
}
export function canRoadE(G, p, e, fromV) {
  const E = G.board.edges[e];
  if (E.road !== null) return false;
  if (G.opts.ships && !edgeLand(G, e)) return false;
  if (fromV !== undefined && fromV !== null) return E.v.includes(fromV);
  return E.v.some((v) => {
    const V = G.board.verts[v];
    if (V.b && V.b.p === p) return true;
    if (V.b && !G.opts.ext) return false; // clásico: un poblado ajeno corta el paso; en V2 se puede seguir el camino por detrás
    return V.edges.some((x) => x !== e && G.board.edges[x].road === p);
  });
}
export function canCityV(G, p, v) { const b = G.board.verts[v].b; return !!b && b.p === p && b.t === 's'; }
export const anyRoadSpot = (G, p) => G.board.edges.some((E) => canRoadE(G, p, E.id));
export const anySettSpot = (G, p) => G.board.verts.some((V) => canSettleV(G, p, V.id, false));
export const anyCitySpot = (G, p) => G.board.verts.some((V) => canCityV(G, p, V.id));
export function vp(G, p, hidden) {
  let s = 0;
  G.board.verts.forEach((V) => { if (V.b && V.b.p === p) s += V.b.t === 'm' ? 3 : V.b.t === 'c' ? 2 : 1; });
  if (G.longest === p) s += 2;
  if (G.army === p) s += 2;
  if (G.fleet === p) s += 2;
  if (hidden) s += G.players[p].dev.filter((d) => d.t === 'vp').length;
  if (G.opts.ext) { // ampliadas: 1 punto por tener alguna isla y el Mayor descubridor (2) con 3 islas o más
    if (islandsOf(G, p) > 0) s += 1;
    if (G.explorer === p) s += 2;
  } else for (const k in G.islandClaim || {}) if (G.islandClaim[k] === p) s += 1;
  return s;
}
export function rate(G, p, r) {
  let best = 4;
  G.board.verts.forEach((V) => { if (V.b && V.b.p === p && V.port) { if (V.port === r) best = 2; else if (V.port === 'any') best = Math.min(best, 3); } });
  return best;
}
export function robberTargets(G) { return G.board.hexes.filter((h) => h.id !== G.board.robber && h.res !== 'sea' && isRevealed(G, h.id)).map((h) => h.id); }
// Qué puede tocar el jugador p en el mapa ahora mismo. mode: 'road'|'settlement'|'city'|null
export function targets(G, p, mode) {
  const T = { v: [], e: [], h: [] };
  if (G.winner !== null) return T;
  const B = G.board;
  if (G.phase === 'setup') {
    if (actor(G) !== p) return T;
    if (G.setupSub === 'settlement') B.verts.forEach((V) => { if (canSettleV(G, p, V.id, true)) T.v.push(V.id); });
    else B.edges.forEach((E) => { if (canRoadE(G, p, E.id, G.lastSett)) T.e.push(E.id); });
    return T;
  }
  if (G.phase === 'robber') { if (G.turn === p) T.h = robberTargets(G); return T; }
  if (actor(G) !== p) return T;
  if (!['main', 'sbp', 'roadbuild'].includes(G.phase)) return T;
  const P = G.players[p];
  if (G.phase === 'roadbuild') {
    if (P.roads > 0) B.edges.forEach((E) => { if (canRoadE(G, p, E.id)) T.e.push(E.id); });
    if (G.opts.ships) shipMoves(G, p, true).forEach((m) => { if (!T.e.includes(m.to)) T.e.push(m.to); });
    return T;
  }
  if (mode === 'ship' && P.shipsLeft > 0) B.edges.forEach((E) => { if (canBuildShipE(G, p, E.id)) T.e.push(E.id); });
  if (mode === 'move') shipMoves(G, p, false).forEach((m) => { if (!T.e.includes(m.to)) T.e.push(m.to); });
  if (mode === 'road' && P.roads > 0) B.edges.forEach((E) => { if (canRoadE(G, p, E.id)) T.e.push(E.id); });
  if (mode === 'settlement' && P.setts > 0) B.verts.forEach((V) => { if (canSettleV(G, p, V.id, false)) T.v.push(V.id); });
  if (mode === 'city' && P.cities > 0) B.verts.forEach((V) => { if (canCityV(G, p, V.id)) T.v.push(V.id); });
  return T;
}
// en el móvil no se ven las cartas de los demás, solo cuántas tienen (n)
const handSize = (G, q) => (typeof G.players[q].n === 'number' ? G.players[q].n : total(G, q));
export function pirateTargets(G, p) { return G.players.map((_, q) => q).filter((q) => q !== p && handSize(G, q) > 0 && (G.ships || []).some((s) => s.p === q)); }
export function canPlayDev(G, p, i) {
  const d = G.players[p].dev[i];
  if (d && d.t === 'pirate' && !pirateTargets(G, p).length) return false;
  if (d && d.t === 'demolish' && !demolishTargets(G, p).length) return false;
  return p === G.turn && !!d && d.t !== 'vp' && !G.playedDev && d.bt < G.turnNum && G.winner === null &&
    (G.phase === 'main' || (G.phase === 'roll' && d.t === 'knight'));
}

/* ---- efectos internos ---- */
function reveal(G, by) {
  if (!G.opts.fog) return;
  const V = G.board.verts, nw = [];
  const mark = (v) => V[v].hexes.forEach((h) => { if (!G.revealed[h]) { G.revealed[h] = true; nw.push(h); } });
  V.forEach((v) => { if (v.b) mark(v.id); });
  G.board.edges.forEach((e) => { if (e.road !== null) e.v.forEach(mark); });
  (G.ships || []).forEach((s) => G.board.edges[s.e].v.forEach((v) => { mark(v); V[v].adj.forEach(mark); }));
  if (nw.length) G.ev.push({ t: 'reveal', hexes: nw });
  // al explorar con barcos, descubrir tierra da un recurso de ese tipo
  if (G.opts.ships && by !== undefined && G.phase !== 'setup') {
    const got = [];
    nw.forEach((h) => { const r = G.board.hexes[h].res; if (RES.includes(r) && G.bank[r] > 0) { G.bank[r]--; G.players[by].res[r]++; got.push(RINFO[r].e); } });
    if (got.length) { log(G, `🧭 <b>${pn(G, by)}</b> descubre tierra y recibe ${got.join(' ')}`); G.ev.push({ t: 'gain', to: by, m: `¡Tierra a la vista! Recibes ${got.join(' ')}` }); }
  }
}
export function roadLen(G, p) {
  const E = G.board.edges, V = G.board.verts, used = new Set();
  let best = 0;
  function dfs(v, len) {
    best = Math.max(best, len);
    const b = V[v].b;
    if (len > 0 && b && b.p !== p) return;
    for (const e of V[v].edges) {
      if (E[e].road !== p || used.has(e)) continue;
      used.add(e);
      dfs(E[e].v[0] === v ? E[e].v[1] : E[e].v[0], len + 1);
      used.delete(e);
    }
  }
  E.forEach((e) => { if (e.road === p) { dfs(e.v[0], 0); dfs(e.v[1], 0); } });
  return best;
}
function updateLongest(G) {
  const lens = G.players.map((_, i) => roadLen(G, i));
  G.roadLens = lens;
  const max = Math.max(...lens), cur = G.longest;
  if (cur !== null && lens[cur] === max && max >= 5) return;
  const top = lens.map((l, i) => (l === max ? i : -1)).filter((i) => i >= 0);
  const nw = max >= 5 && top.length === 1 ? top[0] : null;
  if (nw !== cur) {
    G.longest = nw;
    log(G, nw !== null ? `🛣️ <b>${pn(G, nw)}</b> consigue ${W.longest} (${max})` : `Nadie tiene ahora ${W.longest}`);
    if (nw !== null) G.ev.push({ t: 'banner', m: `🛣️ ${G.players[nw].name}: Camino más largo` });
  }
}
function updateArmy(G) {
  const p = G.turn, k = G.players[p].knights;
  if (k >= 3 && G.army !== p && (G.army === null || k > G.players[G.army].knights)) {
    G.army = p; log(G, `⚔️ <b>${pn(G, p)}</b> consigue ${W.army} (${k})`);
    G.ev.push({ t: 'banner', m: `⚔️ ${G.players[p].name}: Mayor ejército` });
  }
}
function checkWin(G) {
  if (G.winner !== null || G.phase === 'setup') return;
  const p = G.turn;
  if (vp(G, p, true) >= G.opts.target) {
    G.winner = p; G.phase = 'over'; G.offer = null;
    log(G, `🏆 <b>¡${pn(G, p)} gana la partida!</b>`);
    G.ev.push({ t: 'win', p });
  }
}
function placeSettlement(G, p, v) {
  G.board.verts[v].b = { p, t: 's' }; G.players[p].setts--; G.ev.push({ t: 'build', k: 's', id: v, p }); reveal(G, p); updateLongest(G);
  if (G.opts.ships && G.opts.ext && G.phase !== 'setup') updateExplorer(G, p);
  else if (G.opts.ships && G.phase !== 'setup') { // primera colonia en una isla nueva: +1 punto
    const isl = [...new Set(G.board.verts[v].hexes.map((h) => G.board.hexes[h].island).filter((i) => i > 0))];
    isl.forEach((k) => { if (G.islandClaim[k] === undefined) { G.islandClaim[k] = p; log(G, `⛵ <b>${pn(G, p)}</b> coloniza una isla nueva (+1 punto)`); G.ev.push({ t: 'banner', m: `⛵ ${G.players[p].name} coloniza una isla nueva (+1)` }); } });
  }
}
// --- reglas ampliadas ---
export function islandsOf(G, p) {
  const s = new Set();
  G.board.verts.forEach((V) => { if (V.b && V.b.p === p) V.hexes.forEach((h) => { const i = G.board.hexes[h].island; if (i > 0) s.add(i); }); });
  return s.size;
}
function updateExplorer(G, p) {
  const n = islandsOf(G, p), cur = G.explorer;
  if (n < 3 || cur === p || (cur !== null && islandsOf(G, cur) >= n)) return;
  G.explorer = p; log(G, `🧭 <b>${pn(G, p)}</b> es el Mayor descubridor (${n} islas)`); G.ev.push({ t: 'banner', m: `🧭 ${G.players[p].name}: Mayor descubridor (+2)` });
}
function updateFleet(G, p) {
  const n = (q) => (G.ships || []).filter((s) => s.p === q && (s.lv || 1) >= 2).length, cur = G.fleet;
  if (n(p) < 3 || cur === p || (cur !== null && n(cur) >= n(p))) return;
  G.fleet = p; log(G, `⚓ <b>${pn(G, p)}</b> consigue la Mayor flota (${n(p)} barcos mejorados)`); G.ev.push({ t: 'banner', m: `⚓ ${G.players[p].name}: Mayor flota (+2)` });
}
export const hasCity = (G, p) => G.board.verts.some((V) => V.b && V.b.p === p && (V.b.t === 'c' || V.b.t === 'm'));
export function canMetroV(G, p, v) { const b = G.board.verts[v].b; return !!G.opts.ext && !!b && b.p === p && b.t === 'c'; }
// ¿todos los caminos de q siguen unidos (aunque sea a través de otros caminos) a algún edificio suyo?
export function roadsOK(G, q) {
  const E = G.board.edges, V = G.board.verts, seen = new Set(), stack = [];
  V.forEach((v) => { if (v.b && v.b.p === q) stack.push(v.id); });
  const visited = new Set(stack);
  while (stack.length) {
    const v = stack.pop();
    for (const e of V[v].edges) {
      if (E[e].road !== q || seen.has(e)) continue;
      seen.add(e);
      const o = E[e].v[0] === v ? E[e].v[1] : E[e].v[0], b = V[o].b;
      if (!visited.has(o) && !(b && b.p !== q && !G.opts.ext)) { visited.add(o); stack.push(o); }
    }
  }
  return E.every((e) => e.road !== q || seen.has(e.id));
}
const without = (G, e, fn) => { const E = G.board.edges[e], r = E.road; E.road = null; try { return fn(); } finally { E.road = r; } };
export function demolishTargets(G, p) {
  if (!G.opts.ext || G.players[p].roads <= 0 || !afford(G, p, COST.road)) return [];
  // solo caminos ajenos sin empedrar, que al quitarlos no dejen sueltos otros caminos de su dueño, y donde tú puedas poner el tuyo
  return G.board.edges.filter((E) => E.road !== null && E.road !== p && !E.paved).map((E) => E.id)
    .filter((e) => { const q = G.board.edges[e].road; return without(G, e, () => roadsOK(G, q) && canRoadE(G, p, e)); });
}
export function moveRoadFrom(G, p) {
  if (!G.opts.ext || G.players[p].roads > 0) return [];
  return G.board.edges.filter((E) => E.road === p && without(G, E.id, () => roadsOK(G, p))).map((E) => E.id);
}
export function moveRoadTo(G, p, from) { return without(G, from, () => G.board.edges.filter((E) => E.id !== from && canRoadE(G, p, E.id)).map((E) => E.id)); }
function placeCity(G, p, v) { G.board.verts[v].b.t = 'c'; G.players[p].setts++; G.players[p].cities--; G.ev.push({ t: 'build', k: 'c', id: v, p }); }
function placeRoad(G, p, e) { G.board.edges[e].road = p; G.players[p].roads--; G.ev.push({ t: 'build', k: 'r', id: e, p }); reveal(G, p); updateLongest(G); }
function produce(G, n) {
  const B = G.board, gains = G.players.map(() => ({})), hexes = [], fx = [];
  B.hexes.forEach((h) => {
    if (h.num !== n || h.id === B.robber) return;
    hexes.push(h.id);
    h.verts.forEach((v) => { const b = B.verts[v].b; if (b) { const k = b.t === 'm' ? 3 : b.t === 'c' ? 2 : 1; gains[b.p][h.res] = (gains[b.p][h.res] || 0) + k; fx.push({ h: h.id, v, p: b.p, r: h.res, n: k }); } });
  });
  RES.forEach((r) => {
    const tot = gains.reduce((s, g) => s + (g[r] || 0), 0);
    if (!tot || tot <= G.bank[r]) return;
    const recv = gains.filter((g) => g[r]).length;
    if (recv > 1) { gains.forEach((g) => delete g[r]); log(G, `El banco no tiene suficiente ${RINFO[r].n.toLowerCase()}: nadie la recibe`); }
    else gains.forEach((g) => { if (g[r]) g[r] = G.bank[r]; });
  });
  let any = false;
  const flows = [];
  gains.forEach((g, i) => {
    const parts = [];
    for (const r in g) { if (!g[r]) continue; G.players[i].res[r] += g[r]; G.bank[r] -= g[r]; parts.push(g[r] + RINFO[r].e); flows.push({ p: i, r, n: g[r] }); stats(G).got[i] += g[r]; }
    if (parts.length) { any = true; log(G, `<b>${pn(G, i)}</b> recibe ${parts.join(' ')}`); G.ev.push({ t: 'gain', to: i, m: `Recibes ${parts.join(' ')}` }); }
  });
  if (!any) log(G, 'Nadie recibe nada');
  fx.forEach((f) => { if (gains[f.p][f.r]) { const S = stats(G); S.hex[f.h] = (S.hex[f.h] || 0) + f.n; S.vtx[f.v] = (S.vtx[f.v] || 0) + f.n; } });
  G.ev.push({ t: 'produce', hexes, flows, fx: fx.filter((f) => gains[f.p][f.r] > 0) });
}
function startSeven(G) {
  const n = G.players.length;
  G.discardQueue = [];
  for (let i = 0; i < n; i++) { const p = (G.turn + i) % n; if (total(G, p) > 7) G.discardQueue.push(p); /* lo fabricado (V2) no cuenta para el 7 */ }
  G.afterRobber = 'main';
  G.phase = G.discardQueue.length ? 'discard' : 'robber';
  if (G.phase === 'robber') skipRobberIfNoTarget(G);
}
function skipRobberIfNoTarget(G) { if (!robberTargets(G).length) { log(G, `${W.robberE} ${W.robber} ${W.noRobberSpot}`); finishRobber(G); } }
function finishRobber(G) { G.phase = G.afterRobber || 'main'; G.afterRobber = null; G.stealCands = []; G.knightSteal = false; G.stealQ = null; G.stealDeck = null; G.stealSel = null; }
// robo a ciegas con el 7: se barajan las cartas de la víctima y el ladrón elige una sin verla
function prepSteal(G, q) {
  const deck = []; RES.forEach((r) => { for (let i = 0; i < G.players[q].res[r]; i++) deck.push(r); });
  G.stealQ = q; G.stealDeck = shuffle(deck); G.stealSel = null;
}
// con caballero se elige la carta viendo la mano del rival; con un 7, al azar
function doSteal(G, q, pick, chosen) {
  const pool = [];
  RES.forEach((r) => { for (let i = 0; i < G.players[q].res[r]; i++) pool.push(r); });
  const r = (G.knightSteal || chosen) && RES.includes(pick) && G.players[q].res[pick] > 0 ? pick : pool[rnd(pool.length)];
  stats(G).stole[G.turn]++; stats(G).lost[q]++;
  G.players[q].res[r]--; G.players[G.turn].res[r]++;
  log(G, `<b>${pn(G, G.turn)}</b> ${W.steals} <b>${pn(G, q)}</b>`);
  G.ev.push({ t: 'gain', to: G.turn, m: `Robas ${RINFO[r].e} ${RINFO[r].n} a ${G.players[q].name}` });
  G.ev.push({ t: 'gain', to: q, m: `${G.players[G.turn].name} te roba ${RINFO[r].e}` });
  finishRobber(G);
}
function nextTurn(G) {
  G.turn = (G.turn + 1) % G.players.length; G.turnNum++; G.phase = 'roll'; G.dice = null; G.playedDev = false; G.offer = null;
  log(G, `— Turno de <b>${pn(G, G.turn)}</b> —`);
  G.ev.push({ t: 'turn', p: G.turn });
  checkWin(G);
}

/* ---------------- Acciones ----------------
   act(G, p, a) -> null si todo bien, o un texto de error */
export function act(G, p, a) {
  if (!a || typeof a.t !== 'string') return 'Acción no válida';
  if (G.winner !== null) return 'La partida ha terminado';
  const me = G.players[p];
  if (!me) return 'Jugador desconocido';
  const isActor = actor(G) === p;
  switch (a.t) {
    case 'settle': {
      const v = a.v | 0;
      if (!G.board.verts[v]) return 'Vértice no válido';
      if (G.phase === 'setup') {
        if (!isActor || G.setupSub !== 'settlement' || !canSettleV(G, p, v, true)) return 'No puedes poner un poblado ahí';
        placeSettlement(G, p, v);
        if (G.setupIdx >= G.players.length) {
          const got = [];
          G.board.verts[v].hexes.forEach((h) => { const r = G.board.hexes[h].res; if (r !== 'desert' && G.bank[r] > 0) { G.bank[r]--; me.res[r]++; got.push(RINFO[r].e); } });
          if (got.length) log(G, `<b>${pn(G, p)}</b> recibe ${got.join(' ')}`);
        }
        G.lastSett = v; G.setupSub = 'road';
        return null;
      }
      if (!isActor || !['main', 'sbp'].includes(G.phase)) return 'Ahora no puedes construir';
      if (me.setts <= 0) return 'No te quedan poblados';
      if (!afford(G, p, COST.settlement)) return 'No tienes recursos suficientes';
      if (!canSettleV(G, p, v, false)) return 'No puedes poner un poblado ahí';
      pay(G, p, COST.settlement); placeSettlement(G, p, v);
      log(G, `<b>${pn(G, p)}</b> ${W.buildSett}`); checkWin(G);
      return null;
    }
    case 'city': {
      const v = a.v | 0;
      if (!isActor || !['main', 'sbp'].includes(G.phase)) return 'Ahora no puedes construir';
      if (me.cities <= 0) return 'No te quedan ciudades';
      if (!afford(G, p, COST.city)) return 'No tienes recursos suficientes';
      if (!G.board.verts[v] || !canCityV(G, p, v)) return 'Ahí no hay un poblado tuyo';
      pay(G, p, COST.city); placeCity(G, p, v);
      log(G, `<b>${pn(G, p)}</b> ${W.buildCity}`); checkWin(G);
      return null;
    }
    case 'road': {
      const e = a.e | 0;
      if (!G.board.edges[e]) return 'Arista no válida';
      if (G.phase === 'setup') {
        if (!isActor || G.setupSub !== 'road' || !canRoadE(G, p, e, G.lastSett)) return 'El camino tiene que salir de tu poblado';
        placeRoad(G, p, e); G.setupIdx++;
        if (G.setupIdx >= G.setupOrder.length) {
          G.phase = 'roll'; G.turn = G.first; G.turnNum = 1; G.lastSett = null;
          log(G, `¡Empieza la partida! Turno de <b>${pn(G, G.turn)}</b>`);
          G.ev.push({ t: 'turn', p: G.turn });
        } else { G.turn = G.setupOrder[G.setupIdx]; G.setupSub = 'settlement'; G.ev.push({ t: 'turn', p: G.turn, setup: true }); }
        return null;
      }
      if (!isActor) return 'No es tu turno';
      if (me.roads <= 0) return 'No te quedan caminos';
      if (!canRoadE(G, p, e)) return 'El camino tiene que conectar con lo tuyo';
      if (G.phase === 'roadbuild') {
        placeRoad(G, p, e); G.rbLeft--;
        if (G.rbLeft <= 0 || !targets(G, p, null).e.length) G.phase = 'main';
        checkWin(G); return null;
      }
      if (!['main', 'sbp'].includes(G.phase)) return 'Ahora no puedes construir';
      if (!afford(G, p, COST.road)) return 'No tienes recursos suficientes';
      pay(G, p, COST.road); placeRoad(G, p, e);
      log(G, `<b>${pn(G, p)}</b> ${W.buildRoad}`); checkWin(G);
      return null;
    }
    case 'ship': {
      const e = a.e | 0;
      if (!G.opts.ships) return 'No hay barcos en este modo';
      if (!isActor || !['main', 'sbp'].includes(G.phase)) return 'Ahora no puedes construir';
      if (me.shipsLeft <= 0) return 'No te quedan barcos';
      if (!afford(G, p, COST.ship)) return 'No tienes recursos suficientes';
      if (!G.board.edges[e] || !canBuildShipE(G, p, e)) return 'El barco tiene que salir de un poblado tuyo en la costa';
      pay(G, p, COST.ship); me.shipsLeft--;
      const sh = { id: ++G.shipSeq, p, e, bt: G.turnNum, mv: -1 }; G.ships.push(sh);
      G.ev.push({ t: 'build', k: 'b', id: e, p, ship: sh.id });
      log(G, `⛵ <b>${pn(G, p)}</b> ${W.buildShip}`); reveal(G, p);
      return null;
    }
    case 'moveShip': {
      const to = a.to | 0;
      if (!G.opts.ships || !isActor) return 'Ahora no puedes mover barcos';
      const free = G.phase === 'roadbuild';
      if (!free && G.phase !== 'main') return 'Solo en tu turno';
      const mv = shipMoves(G, p, free).filter((m) => m.to === to && (a.id === undefined || m.id === a.id))[0];
      if (!mv) return 'El barco no puede ir ahí';
      const sh = G.ships.find((x) => x.id === mv.id), from = sh.e;
      sh.e = to;
      if (!free) { sh.mvn = sh.mv >= G.turnNum ? (sh.mvn || 1) + 1 : 1; sh.mv = G.turnNum; }
      G.ev.push({ t: 'sail', id: sh.id, from, to, p });
      reveal(G, p);
      if (free) { G.rbLeft--; if (G.rbLeft <= 0 || !targets(G, p, null).e.length) G.phase = 'main'; }
      return null;
    }
    case 'upgradeShip': {
      if (!G.opts.ships || !isActor || G.phase !== 'main') return 'Solo en tu turno';
      const sh = (G.ships || []).find((x) => x.p === p && (a.id !== undefined ? x.id === a.id : x.e === (a.e | 0)));
      if (!sh) return 'Ese barco no es tuyo';
      if ((sh.lv || 1) >= 2) return 'Ese barco ya está mejorado';
      if (!upgradableShips(G, p).includes(sh)) return 'El barco tiene que estar atracado en un poblado o ciudad tuya';
      const cU = G.opts.ext ? COST.shipUpX : COST.shipUp;
      if (!afford(G, p, cU)) return 'No tienes recursos suficientes';
      pay(G, p, cU); sh.lv = 2;
      if (G.opts.ext) { updateFleet(G, p); checkWin(G); }
      G.ev.push({ t: 'build', k: 'b', id: sh.e, p, ship: sh.id });
      log(G, `⛵ <b>${pn(G, p)}</b> ${W.upShip}`);
      return null;
    }
    case 'craft': {
      const k = a.k;
      if (!G.opts.ext || !GOODS.includes(k)) return 'No se puede fabricar eso';
      if (!isActor || !['main', 'sbp'].includes(G.phase)) return 'Solo en tu turno';
      if (!hasCity(G, p)) return 'Necesitas al menos una ciudad para fabricar';
      if (!afford(G, p, RECIPE[k])) return 'No tienes recursos suficientes';
      pay(G, p, RECIPE[k]); me.res[k]++;
      log(G, `<b>${pn(G, p)}</b> fabrica ${RINFO[k].e} ${RINFO[k].n.toLowerCase()}`);
      return null;
    }
    case 'sell': {
      const k = a.k, get = a.get;
      if (!G.opts.ext || !GOODS.includes(k) || !RES.includes(get)) return 'Cambio no válido';
      if (!isActor || G.phase !== 'main') return 'Solo en tu turno';
      if (!me.res[k]) return 'No tienes eso';
      if (G.bank[get] < 1) return 'El banco no tiene ese recurso';
      me.res[k]--; me.res[get]++; G.bank[get]--;
      log(G, `<b>${pn(G, p)}</b> cambia 1${RINFO[k].e} por 1${RINFO[get].e} con el banco`);
      return null;
    }
    case 'metro': {
      const v = a.v | 0;
      if (!isActor || !['main', 'sbp'].includes(G.phase)) return 'Ahora no puedes construir';
      if (!G.board.verts[v] || !canMetroV(G, p, v)) return 'Ahí no hay una ciudad tuya';
      if ((me.metros ?? 3) <= 0) return 'Ya tienes 3 metrópolis';
      if (!afford(G, p, COST.metro)) return 'No tienes recursos suficientes';
      pay(G, p, COST.metro); G.board.verts[v].b.t = 'm'; me.cities++; me.metros = (me.metros ?? 3) - 1;
      G.ev.push({ t: 'build', k: 'm', id: v, p });
      log(G, `🏙️ <b>${pn(G, p)}</b> convierte una ciudad en metrópolis`); G.ev.push({ t: 'banner', m: `🏙️ ${G.players[p].name} levanta una metrópolis` });
      checkWin(G); return null;
    }
    case 'pave': {
      const e = a.e | 0, E = G.board.edges[e];
      if (!G.opts.ext || !E) return 'No válido';
      if (!isActor || !['main', 'sbp'].includes(G.phase)) return 'Ahora no puedes construir';
      if (E.road !== p || E.paved) return 'Tiene que ser un camino tuyo sin empedrar';
      if (!afford(G, p, COST.pave)) return 'Necesitas cemento';
      pay(G, p, COST.pave); E.paved = true;
      G.ev.push({ t: 'build', k: 'pave', id: e, p });
      log(G, `<b>${pn(G, p)}</b> empiedra un camino (ya no se puede derribar)`);
      return null;
    }
    case 'moveRoad': {
      const from = a.from | 0, to = a.to | 0;
      if (!G.opts.ext || !isActor || G.phase !== 'main') return 'Solo en tu turno';
      if (me.roads > 0) return 'Solo cuando ya has puesto todos tus caminos';
      if (!afford(G, p, COST.moveRoad)) return 'Necesitas herramientas';
      if (!moveRoadFrom(G, p).includes(from)) return 'Ese camino no se puede mover sin dejar otros sueltos';
      if (!moveRoadTo(G, p, from).includes(to)) return 'El camino tiene que conectar con lo tuyo';
      const E1 = G.board.edges[from], E2 = G.board.edges[to], pv = !!E1.paved;
      E1.road = null; E1.paved = false; E2.road = p; E2.paved = pv;
      if (!roadsOK(G, p)) { E2.road = null; E2.paved = false; E1.road = p; E1.paved = pv; return 'Dejarías caminos sueltos'; }
      pay(G, p, COST.moveRoad);
      G.ev.push({ t: 'build', k: 'r', id: to, p, from });
      log(G, `<b>${pn(G, p)}</b> mueve un camino`); reveal(G, p); updateLongest(G); checkWin(G);
      return null;
    }
    case 'roll': {
      if (!isActor || G.phase !== 'roll') return 'Ahora no toca tirar';
      const d1 = 1 + rnd(6), d2 = 1 + rnd(6), s = d1 + d2;
      G.dice = [d1, d2]; G.rollId++; G.rolls = (G.rolls || []).concat(d1 + d2).slice(-200);
      G.ev.push({ t: 'roll', d: [d1, d2], p });
      log(G, `🎲 <b>${pn(G, p)}</b> saca un <b>${s}</b>`);
      if (s === 7) startSeven(G); else { produce(G, s); G.phase = 'main'; }
      return null;
    }
    case 'discard': {
      if (G.phase !== 'discard' || !G.discardQueue.includes(p)) return 'No tienes que descartar';
      const need = Math.floor(total(G, p) / 2), sel = a.sel || {};
      let sum = 0;
      for (const r of RES) { const n = sel[r] | 0; if (n < 0 || n > me.res[r]) return 'Selección no válida'; sum += n; }
      if (sum !== need) return `Tienes que descartar ${need}`;
      for (const r of RES) { me.res[r] -= sel[r] | 0; G.bank[r] += sel[r] | 0; }
      stats(G).disc[p] += need;
      log(G, `<b>${pn(G, p)}</b> descarta ${need} cartas`);
      G.discardQueue.splice(G.discardQueue.indexOf(p), 1);
      if (!G.discardQueue.length) { G.phase = 'robber'; skipRobberIfNoTarget(G); }
      return null;
    }
    case 'robber': {
      const h = a.h | 0;
      if (G.phase !== 'robber' || G.turn !== p) return 'Ahora no mueves el ladrón';
      if (!robberTargets(G).includes(h)) return 'El ladrón no puede ir ahí';
      G.board.robber = h;
      const hx = G.board.hexes[h];
      G.ev.push({ t: 'robber', h });
      log(G, `${W.robberE} ${W.robber[0].toUpperCase() + W.robber.slice(1)} ${W.robberMoves} ${RINFO[hx.res].e}${hx.num ? ' ' + hx.num : ''}`);
      const cands = [...new Set(hx.verts.map((v) => G.board.verts[v].b).filter((b) => b && b.p !== p).map((b) => b.p))].filter((q) => total(G, q) > 0);
      if (!cands.length) finishRobber(G);
      else { G.phase = 'steal'; G.stealCands = cands; if (cands.length === 1 && !G.knightSteal) prepSteal(G, cands[0]); }
      return null;
    }
    case 'stealPick': { // con el 7: elegir a quién se roba (luego se elige carta sin verla)
      if (G.phase !== 'steal' || G.turn !== p || G.knightSteal || !G.stealCands.includes(a.q)) return 'No puedes robar a ese jugador';
      prepSteal(G, a.q); return null;
    }
    case 'stealHover': { // el ladrón señala una carta: la víctima lo ve en su móvil
      if (G.phase !== 'steal' || G.turn !== p || !G.stealDeck) return 'Ahora no';
      const i = a.i | 0; if (i < 0 || i >= G.stealDeck.length) return 'Esa carta no existe';
      G.stealSel = i; return null;
    }
    case 'steal': {
      if (G.phase !== 'steal' || G.turn !== p || !G.stealCands.includes(a.q)) return 'No puedes robar a ese jugador';
      if (!G.knightSteal && G.stealDeck && G.stealQ === a.q && Number.isInteger(a.i) && a.i >= 0 && a.i < G.stealDeck.length) { doSteal(G, a.q, G.stealDeck[a.i], true); return null; }
      doSteal(G, a.q, a.r); return null;
    }
    case 'buyDev': {
      if (!isActor || !['main', 'sbp'].includes(G.phase)) return 'Ahora no puedes comprar';
      if (!G.deck.length) return 'No quedan cartas de desarrollo';
      if (!afford(G, p, COST.dev)) return 'No tienes recursos suficientes';
      pay(G, p, COST.dev);
      const t = G.deck.pop();
      me.dev.push({ t, bt: G.turnNum });
      log(G, `<b>${pn(G, p)}</b> compra una carta de desarrollo`);
      G.ev.push({ t: 'gain', to: p, m: `Has sacado: ${DEV[t].e} ${DEV[t].n}` });
      G.ev.push({ t: 'devbuy', p });
      checkWin(G); return null;
    }
    case 'playDev': {
      const i = a.i | 0;
      if (!canPlayDev(G, p, i)) return 'No puedes jugar esa carta ahora';
      const d = me.dev[i];
      if (d.t === 'plenty') {
        const l = Array.isArray(a.list) ? a.list.slice(0, 2) : [];
        if (!l.length || !l.every((r) => RES.includes(r))) return 'Elige 2 recursos';
        const need = {}; l.forEach((r) => (need[r] = (need[r] || 0) + 1));
        if (!Object.entries(need).every(([r, n]) => G.bank[r] >= n)) return 'El banco no tiene esos recursos';
      }
      if (d.t === 'mono' && !RES.includes(a.r)) return 'Elige un recurso';
      if (d.t === 'pirate' && !pirateTargets(G, p).includes(a.q)) return 'Elige un jugador con barcos';
      if (d.t === 'demolish' && !demolishTargets(G, p).includes(a.e | 0)) return 'Ese camino no se puede derribar';
      me.dev.splice(i, 1); G.playedDev = true;
      log(G, `<b>${pn(G, p)}</b> juega ${DEV[d.t].e} ${DEV[d.t].n}`);
      G.ev.push({ t: 'banner', m: `${DEV[d.t].e} ${G.players[p].name} juega ${DEV[d.t].n}` });
      if (d.t === 'knight') { G.knightSteal = true; me.knights++; updateArmy(G); checkWin(G); if (G.winner !== null) return null; G.afterRobber = G.phase; G.phase = 'robber'; skipRobberIfNoTarget(G); }
      else if (d.t === 'road') { G.rbLeft = G.opts.ships ? 2 : Math.min(2, me.roads); if (G.rbLeft > 0 && (anyRoadSpot(G, p) || (G.opts.ships && shipMoves(G, p, true).length))) G.phase = 'roadbuild'; }
      else if (d.t === 'pirate') {
        const q = a.q, P2 = G.players[q], got = [];
        for (let k = 0; k < 2; k++) { const pool = []; RES.forEach((r) => { for (let i = 0; i < P2.res[r]; i++) pool.push(r); }); if (!pool.length) break; const r = pool[rnd(pool.length)]; P2.res[r]--; me.res[r]++; got.push(r); }
        log(G, `🏴‍☠️ <b>${pn(G, p)}</b> asalta los barcos de <b>${pn(G, q)}</b> y le roba ${got.length} cartas`);
        stats(G).stole[p] += got.length; stats(G).lost[q] += got.length;
        G.ev.push({ t: 'gain', to: p, m: `Botín pirata: ${got.map((r) => RINFO[r].e).join(' ')}` }, { t: 'gain', to: q, m: `¡Piratas! Te roban ${got.map((r) => RINFO[r].e).join(' ')}` }, { t: 'pirate', p, q });
      }
      else if (d.t === 'demolish') {
        const e = a.e | 0, E = G.board.edges[e], q = E.road;
        G.players[q].roads++; pay(G, p, COST.road); E.road = p; me.roads--;
        G.ev.push({ t: 'build', k: 'r', id: e, p, demolish: q });
        log(G, `🧨 <b>${pn(G, p)}</b> derriba un camino de <b>${pn(G, q)}</b> y pone uno suyo`);
        G.ev.push({ t: 'gain', to: q, m: `🧨 ${G.players[p].name} te ha derribado un camino` });
        updateLongest(G); checkWin(G);
      }
      else if (d.t === 'plenty') { a.list.slice(0, 2).forEach((r) => { G.bank[r]--; me.res[r]++; }); log(G, `<b>${pn(G, p)}</b> coge ${a.list.slice(0, 2).map((r) => RINFO[r].e).join(' ')} del banco`); }
      else if (d.t === 'mono') {
        let n = 0;
        G.players.forEach((P, j) => { if (j === p) return; n += P.res[a.r]; if (P.res[a.r]) G.ev.push({ t: 'gain', to: j, m: `Monopolio: pierdes ${P.res[a.r]} ${RINFO[a.r].e}` }); P.res[a.r] = 0; });
        me.res[a.r] += n; log(G, `💰 <b>${pn(G, p)}</b> se lleva ${n} ${RINFO[a.r].e}`);
        stats(G).stole[p] += n;
      }
      return null;
    }
    case 'bank': {
      if (!isActor || G.phase !== 'main') return 'Solo en tu turno';
      const give = a.give, get = a.get;
      if (!RES.includes(give) || !RES.includes(get) || give === get) return 'Cambio no válido';
      const k = rate(G, p, give);
      if (me.res[give] < k) return `Necesitas ${k} ${RINFO[give].e}`;
      if (G.bank[get] < 1) return 'El banco no tiene ese recurso';
      me.res[give] -= k; G.bank[give] += k; me.res[get]++; G.bank[get]--;
      log(G, `<b>${pn(G, p)}</b> cambia ${k}${RINFO[give].e} por 1${RINFO[get].e} con el banco`);
      return null;
    }
    case 'offer': {
      if (!isActor || G.phase !== 'main') return 'Solo en tu turno';
      const give = clean(a.give), want = clean(a.want);
      if (!sumOf(give) || !sumOf(want)) return 'Pon algo que dar y algo que pedir';
      if (!RES.every((r) => me.res[r] >= give[r])) return 'No tienes lo que ofreces';
      const to = Number.isInteger(a.to) && a.to !== p && G.players[a.to] ? a.to : null;
      G.offer = { id: (G.offer ? G.offer.id : 0) + 1, from: p, to, give, want, acc: {}, rej: {} };
      log(G, `🤝 <b>${pn(G, p)}</b> ofrece ${fmt(give)} por ${fmt(want)}${to !== null ? ' a <b>' + pn(G, to) + '</b>' : ''}`);
      G.ev.push({ t: 'offer' });
      return null;
    }
    case 'respond': {
      const O = G.offer;
      if (!O || O.from === p || (a.id && a.id !== O.id)) return 'Esa oferta ya no existe';
      if (O.to != null && O.to !== p) return 'Esa oferta no es para ti';
      if (a.yes) {
        if (!RES.every((r) => me.res[r] >= O.want[r])) return 'No tienes lo que te piden';
        if (O.to === p) { // oferta directa: al aceptar se cierra el trato
          const F = G.players[O.from];
          if (!RES.every((r) => F.res[r] >= O.give[r])) { G.offer = null; return 'Ya no tiene esos recursos'; }
          RES.forEach((r) => { F.res[r] += O.want[r] - O.give[r]; me.res[r] += O.give[r] - O.want[r]; });
          log(G, `🤝 <b>${pn(G, O.from)}</b> cambia ${fmt(O.give)} con <b>${pn(G, p)}</b> por ${fmt(O.want)}`);
          G.ev.push({ t: 'banner', m: `🤝 Trato entre ${F.name} y ${me.name}` });
          G.ev.push({ t: 'gain', to: O.from, m: `✅ ${me.name} acepta el trato` });
          G.offer = null; return null;
        }
        O.acc[p] = true; delete O.rej[p];
      }
      else { O.rej[p] = true; delete O.acc[p]; }
      return null;
    }
    case 'confirm': {
      const O = G.offer, q = a.q;
      if (!O || O.from !== p || !O.acc[q]) return 'Ese jugador no ha aceptado';
      const P2 = G.players[q];
      if (!RES.every((r) => me.res[r] >= O.give[r] && P2.res[r] >= O.want[r])) { delete O.acc[q]; return 'Ya no tenéis esos recursos'; }
      RES.forEach((r) => { me.res[r] += O.want[r] - O.give[r]; P2.res[r] += O.give[r] - O.want[r]; });
      log(G, `🤝 <b>${pn(G, p)}</b> cambia ${fmt(O.give)} con <b>${pn(G, q)}</b> por ${fmt(O.want)}`);
      G.ev.push({ t: 'banner', m: `🤝 Trato entre ${me.name} y ${P2.name}` });
      G.offer = null; return null;
    }
    case 'cancelOffer': {
      if (!G.offer || G.offer.from !== p) return null;
      G.offer = null; return null;
    }
    case 'end': {
      if (!isActor || G.phase !== 'main') return 'Ahora no puedes pasar turno';
      G.offer = null;
      const n = G.players.length;
      if (n > 4 && G.opts.sbp) {
        G.sbpQueue = [];
        for (let i = 1; i < n; i++) G.sbpQueue.push((G.turn + i) % n);
        G.phase = 'sbp'; log(G, '🔨 Fase de construcción extra');
        G.ev.push({ t: 'sbp', p: G.sbpQueue[0] });
      } else nextTurn(G);
      return null;
    }
    case 'pass': {
      if (G.phase !== 'sbp' || !isActor) return 'No es tu fase de construcción';
      G.sbpQueue.shift();
      if (!G.sbpQueue.length) nextTurn(G); else G.ev.push({ t: 'sbp', p: G.sbpQueue[0] });
      return null;
    }
  }
  return 'Acción desconocida';
}
function clean(o) { const r = {}; RES.forEach((k) => (r[k] = Math.max(0, Math.min(19, (o && o[k]) | 0)))); return r; }
const sumOf = (o) => RES.reduce((s, r) => s + o[r], 0);
export const fmt = (o) => RES.filter((r) => o[r]).map((r) => o[r] + RINFO[r].e).join(' ') || 'nada';

/* ---------------- Vistas para la red ---------------- */
export function boardStatic(G) {
  const B = G.board;
  return {
    S: B.S, W: B.W,
    hexes: B.hexes.map((h) => ({ id: h.id, x: h.x, y: h.y, res: h.res, num: h.num, verts: h.verts, nb: h.nb, island: h.island })),
    verts: B.verts.map((v) => ({ id: v.id, x: v.x, y: v.y, hexes: v.hexes, adj: v.adj, edges: v.edges, port: v.port })),
    edges: B.edges.map((e) => ({ id: e.id, v: e.v, hexes: e.hexes })),
    ports: B.ports, sea: B.sea,
  };
}
export function publicState(G, forP) {
  const B = G.board;
  return {
    phase: G.phase, turn: G.turn, turnNum: G.turnNum, dice: G.dice, rolls: G.rolls || [], rollId: G.rollId, setupSub: G.setupSub, lastSett: G.lastSett, setupIdx: G.setupIdx,
    robber: B.robber, revealed: G.revealed, longest: G.longest, army: G.army, roadLens: G.roadLens, winner: G.winner,
    playedDev: G.playedDev, rbLeft: G.rbLeft, sbpQueue: G.sbpQueue, discardQueue: G.discardQueue, stealCands: G.stealCands, offer: G.offer,
    deckN: G.deck.length, knightSteal: !!G.knightSteal, stealQ: G.stealQ ?? null, stealSel: G.stealSel ?? null, stealN: G.stealDeck ? G.stealDeck.length : 0,
    stealMine: G.stealDeck && forP === G.stealQ ? G.stealDeck : null, // la víctima ve sus cartas de cara
    stats: G.winner !== null ? { ...stats(G), rolls: G.rolls || [] } : null,
    stealHands: G.phase === 'steal' && G.knightSteal && forP === G.turn ? Object.fromEntries(G.stealCands.map((q) => [q, { ...G.players[q].res }])) : null, bank: G.bank, log: G.log.slice(0, 30), opts: { ext: !!G.opts.ext, fog: G.opts.fog, target: G.opts.target, sbp: G.opts.sbp, ships: !!G.opts.ships, openHands: !!G.opts.openHands, theme: G.opts.theme || 'classic' },
    ships: G.ships || [], islandClaim: G.islandClaim || {}, fleet: G.fleet ?? null, explorer: G.explorer ?? null,
    buildings: B.verts.filter((v) => v.b).map((v) => [v.id, v.b.p, v.b.t]),
    roads: B.edges.filter((e) => e.road !== null).map((e) => (e.paved ? [e.id, e.road, 1] : [e.id, e.road])),
    players: G.players.map((P, i) => ({
      name: P.name, color: P.color, n: handCount(G, i), metros: P.metros ?? 3, devN: P.dev.length, knights: P.knights, roads: P.roads, setts: P.setts, cities: P.cities, shipsLeft: P.shipsLeft,
      vp: vp(G, i, G.winner !== null || i === forP),
      res: i === forP || G.opts.openHands ? P.res : null, dev: i === forP ? P.dev : null,
    })),
  };
}
// Reconstruye en un móvil un objeto G compatible con las funciones de consulta
export function mirror(staticBoard, s) {
  const board = JSON.parse(JSON.stringify(staticBoard));
  board.verts.forEach((v) => (v.b = null));
  board.edges.forEach((e) => (e.road = null));
  s.buildings.forEach(([v, p, t]) => (board.verts[v].b = { p, t }));
  s.roads.forEach(([e, p, pv]) => { board.edges[e].road = p; board.edges[e].paved = !!pv; });
  board.robber = s.robber;
  const players = s.players.map((P) => ({ ...P, res: P.res || { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0, cloth: 0, tools: 0, cement: 0 }, dev: P.dev || [] }));
  return { ...s, board, players, revealed: s.revealed, opts: s.opts, longest: s.longest, army: s.army };
}
