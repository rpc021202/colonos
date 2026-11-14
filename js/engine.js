// Motor de reglas compartido (pantalla anfitriona y móviles).
// El anfitrión es la autoridad: aplica acciones con act(); los móviles usan las mismas
// funciones de consulta para saber dónde se puede construir.

export const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
export const RINFO = {
  wood: { n: 'Madera', e: '🌲', c: '#2f7d3a' },
  brick: { n: 'Arcilla', e: '🧱', c: '#c1592b' },
  sheep: { n: 'Lana', e: '🐑', c: '#7fb446' },
  wheat: { n: 'Trigo', e: '🌾', c: '#d9a21b' },
  ore: { n: 'Piedra', e: '⛰️', c: '#6f7c8a' },
  desert: { n: 'Desierto', e: '🏜️', c: '#d8c48f' },
};
export const COST = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  dev: { sheep: 1, wheat: 1, ore: 1 },
};
export const DEV = {
  knight: { n: 'Caballero', e: '⚔️', d: 'Mueve el ladrón y roba una carta. Se puede jugar antes de tirar.' },
  road: { n: 'Construcción de caminos', e: '🛤️', d: 'Construye 2 caminos gratis.' },
  plenty: { n: 'Año de abundancia', e: '🎁', d: 'Coge 2 recursos cualesquiera del banco.' },
  mono: { n: 'Monopolio', e: '💰', d: 'Elige un recurso: todos te dan los suyos.' },
  vp: { n: 'Punto de victoria', e: '⭐', d: '+1 punto. Secreto hasta el final.' },
};
export const COLORS = [
  { k: 'red', n: 'Rojo', c: '#e53935' }, { k: 'blue', n: 'Azul', c: '#1e88e5' },
  { k: 'white', n: 'Blanco', c: '#f4f1e8' }, { k: 'orange', n: 'Naranja', c: '#fb8c00' },
  { k: 'green', n: 'Verde', c: '#2fa84f' }, { k: 'purple', n: 'Morado', c: '#8e44ad' },
  { k: 'brown', n: 'Marrón', c: '#8d5a3b' }, { k: 'teal', n: 'Turquesa', c: '#00acc1' },
];
// Espacio por jugador. "Guerra" = proporción del tablero original (19 hexágonos / 4 jugadores).
export const DENSITIES = [
  { k: 'war', n: 'Guerra', d: 4.75, note: 'Como el original: poco sitio, mucha pelea' },
  { k: 'normal', n: 'Normal', d: 6, note: 'Recomendado' },
  { k: 'roomy', n: 'Holgado', d: 7.5, note: 'Partida relajada' },
  { k: 'huge', n: 'Enorme', d: 9.5, note: 'Partida larga, mucho por explorar' },
];
export function hexCountFor(players, densKey) {
  const d = (DENSITIES.find((x) => x.k === densKey) || DENSITIES[1]).d;
  return Math.max(19, Math.ceil(players * d));
}

export const rnd = (n) => Math.floor(Math.random() * n);
export function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- Generación de mapa ---------------- */
export function genBoard(N) {
  const S = 1, W = Math.sqrt(3) * S;
  // candidatos en coordenadas axiales, elegimos los N más cercanos al centro (algo más ancho que alto para pantallas 16:9)
  const R = Math.ceil(Math.sqrt(N)) + 3, cand = [];
  for (let q = -R; q <= R; q++) for (let r = -R; r <= R; r++) {
    const x = W * (q + r / 2), y = 1.5 * S * r;
    const d = Math.hypot(x / 1.22, y) + Math.random() * 0.3;
    cand.push({ q, r, x, y, d });
  }
  cand.sort((a, b) => a.d - b.d);
  // sin lagunas interiores: si una casilla vacía queda rodeada, la rellenamos y quitamos la más exterior
  const ck = (q, r) => q + ',' + r;
  const D6 = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const sel = new Map(cand.slice(0, N).map((c) => [ck(c.q, c.r), c]));
  const nbCount = (c) => D6.filter(([a, b]) => sel.has(ck(c.q + a, c.r + b))).length;
  for (let it = 0; it < 50; it++) {
    const hole = cand.find((c) => !sel.has(ck(c.q, c.r)) && nbCount(c) >= 4);
    if (!hole) break;
    sel.set(ck(hole.q, hole.r), hole);
    const worst = [...sel.values()].filter((c) => c !== hole).sort((a, b) => nbCount(a) - nbCount(b) || b.d - a.d)[0];
    sel.delete(ck(worst.q, worst.r));
  }
  const hexes = [...sel.values()].map((c, i) => ({ id: i, q: c.q, r: c.r, x: c.x, y: c.y }));
  // centrar
  // los vértices se calculan en coordenadas exactas de rejilla; el centrado se aplica después
  const key = (q, r) => q + ',' + r, byKey = {};
  hexes.forEach((h) => (byKey[key(h.q, h.r)] = h));
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  hexes.forEach((h) => (h.nb = DIRS.map(([dq, dr]) => byKey[key(h.q + dq, h.r + dr)]).filter(Boolean).map((o) => o.id)));

  // tipos de terreno en la proporción del original
  const deserts = Math.max(1, Math.round(N / 19)), L = N - deserts;
  const weights = { wood: 4, sheep: 4, wheat: 4, brick: 3, ore: 3 };
  const counts = {}, rem = [];
  let used = 0;
  for (const k in weights) { const ex = (L * weights[k]) / 18; counts[k] = Math.floor(ex); used += counts[k]; rem.push([ex - counts[k], k]); }
  rem.sort((a, b) => b[0] - a[0]);
  for (let i = 0; used < L; i++, used++) counts[rem[i % rem.length][1]]++;
  const types = [];
  for (const k in counts) for (let i = 0; i < counts[k]; i++) types.push(k);
  for (let i = 0; i < deserts; i++) types.push('desert');
  // los desiertos mejor hacia el interior o repartidos; barajamos y punto
  shuffle(types);
  hexes.forEach((h, i) => { h.res = types[i]; h.num = null; });

  // números: el 6 y el 8 nunca juntos; si se puede, tampoco dos iguales juntos
  const land = hexes.filter((h) => h.res !== 'desert');
  const base = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 3, 4, 5, 6, 8, 9, 10, 11];
  const pool = [];
  for (let i = 0; pool.length < land.length; i++) pool.push(base[i % base.length]);
  const hot = (x) => x === 6 || x === 8;
  const strict = () => land.every((h) => !h.nb.some((id) => { const o = hexes[id].num; return o === h.num || (hot(h.num) && hot(o)); }));
  const loose = () => land.every((h) => !(hot(h.num) && h.nb.some((id) => hot(hexes[id].num))));
  let ok = false;
  for (let t = 0; t < 3000 && !ok; t++) { shuffle(pool); land.forEach((h, i) => (h.num = pool[i])); ok = strict(); }
  for (let t = 0; t < 20000 && !ok; t++) { shuffle(pool); land.forEach((h, i) => (h.num = pool[i])); ok = loose(); }
  if (!ok) { // reparación: intercambiar números calientes con fríos hasta que no se toquen
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

  const cx = hexes.reduce((s, h) => s + h.x, 0) / N, cy = hexes.reduce((s, h) => s + h.y, 0) / N;
  hexes.forEach((h) => { h.x -= cx; h.y -= cy; });
  verts.forEach((v) => { v.x -= cx; v.y -= cy; });

  // puertos repartidos por la costa (recorrido ordenado alrededor del perímetro)
  const coast = edges.filter((e) => e.hexes.length === 1);
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
    const h = hexes[e.hexes[0]], a = verts[e.v[0]], b = verts[e.v[1]];
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
  const N = hexCountFor(np, opts.density);
  const board = genBoard(N);
  const f = Math.max(1, np / 4);
  const devCounts = { knight: Math.round(14 * f), vp: 5 + Math.max(0, np - 6), road: Math.round(2 * f), plenty: Math.round(2 * f), mono: Math.round(2 * f) };
  const deck = [];
  for (const k in devCounts) for (let i = 0; i < devCounts[k]; i++) deck.push(k);
  shuffle(deck);
  const bankN = Math.max(19, Math.round(N * 0.8));
  const bank = {}; RES.forEach((r) => (bank[r] = bankN));
  const start = rnd(np);
  const order = [...Array(np)].map((_, i) => (start + i) % np);
  const G = {
    v: 2, opts, N, bankN, board, bank, deck,
    players: opts.players.map((p) => ({ name: p.name, color: p.color, res: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 }, dev: [], knights: 0, roads: 15, setts: 5, cities: 4 })),
    turn: start, first: start, turnNum: 0, phase: 'setup', setupIdx: 0, setupOrder: [...order, ...order.slice().reverse()], setupSub: 'settlement', lastSett: null,
    dice: null, rollId: 0, playedDev: false, longest: null, army: null, roadLens: Array(np).fill(0), log: [], winner: null,
    sbpQueue: [], discardQueue: [], afterRobber: null, rbLeft: 0, revealed: {}, stealCands: [], offer: null, ev: [],
  };
  log(G, `Empieza <b>${pn(G, start)}</b>. Colocad los primeros poblados.`);
  return G;
}
export function log(G, m) { G.log.unshift(m); if (G.log.length > 60) G.log.length = 60; }
export function pn(G, i) { return esc(G.players[i].name); }
export function total(G, p) { return RES.reduce((s, r) => s + G.players[p].res[r], 0); }
export function actor(G) {
  if (G.phase === 'sbp') return G.sbpQueue[0];
  if (G.phase === 'discard') return G.discardQueue[0];
  return G.turn;
}
export const isRevealed = (G, h) => !G.opts.fog || !!G.revealed[h];
export function afford(G, p, c) { return Object.entries(c).every(([r, n]) => G.players[p].res[r] >= n); }
function pay(G, p, c) { for (const [r, n] of Object.entries(c)) { G.players[p].res[r] -= n; G.bank[r] += n; } }
export function canSettleV(G, p, v, setup) {
  const V = G.board.verts[v];
  if (V.b || V.adj.some((a) => G.board.verts[a].b)) return false;
  if (setup) return true;
  return V.edges.some((e) => G.board.edges[e].road === p);
}
export function canRoadE(G, p, e, fromV) {
  const E = G.board.edges[e];
  if (E.road !== null) return false;
  if (fromV !== undefined && fromV !== null) return E.v.includes(fromV);
  return E.v.some((v) => {
    const V = G.board.verts[v];
    if (V.b) return V.b.p === p;
    return V.edges.some((x) => x !== e && G.board.edges[x].road === p);
  });
}
export function canCityV(G, p, v) { const b = G.board.verts[v].b; return !!b && b.p === p && b.t === 's'; }
export const anyRoadSpot = (G, p) => G.board.edges.some((E) => canRoadE(G, p, E.id));
export const anySettSpot = (G, p) => G.board.verts.some((V) => canSettleV(G, p, V.id, false));
export const anyCitySpot = (G, p) => G.board.verts.some((V) => canCityV(G, p, V.id));
export function vp(G, p, hidden) {
  let s = 0;
  G.board.verts.forEach((V) => { if (V.b && V.b.p === p) s += V.b.t === 'c' ? 2 : 1; });
  if (G.longest === p) s += 2;
  if (G.army === p) s += 2;
  if (hidden) s += G.players[p].dev.filter((d) => d.t === 'vp').length;
  return s;
}
export function rate(G, p, r) {
  let best = 4;
  G.board.verts.forEach((V) => { if (V.b && V.b.p === p && V.port) { if (V.port === r) best = 2; else if (V.port === 'any') best = Math.min(best, 3); } });
  return best;
}
export function robberTargets(G) { return G.board.hexes.filter((h) => h.id !== G.board.robber && isRevealed(G, h.id)).map((h) => h.id); }
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
  if (G.phase === 'roadbuild') mode = 'road';
  if (!['main', 'sbp', 'roadbuild'].includes(G.phase)) return T;
  const P = G.players[p];
  if (mode === 'road' && P.roads > 0) B.edges.forEach((E) => { if (canRoadE(G, p, E.id)) T.e.push(E.id); });
  if (mode === 'settlement' && P.setts > 0) B.verts.forEach((V) => { if (canSettleV(G, p, V.id, false)) T.v.push(V.id); });
  if (mode === 'city' && P.cities > 0) B.verts.forEach((V) => { if (canCityV(G, p, V.id)) T.v.push(V.id); });
  return T;
}
export function canPlayDev(G, p, i) {
  const d = G.players[p].dev[i];
  return p === G.turn && !!d && d.t !== 'vp' && !G.playedDev && d.bt < G.turnNum && G.winner === null &&
    (G.phase === 'main' || (G.phase === 'roll' && d.t === 'knight'));
}

/* ---- efectos internos ---- */
function reveal(G) {
  if (!G.opts.fog) return;
  const V = G.board.verts, nw = [];
  const mark = (v) => V[v].hexes.forEach((h) => { if (!G.revealed[h]) { G.revealed[h] = true; nw.push(h); } });
  V.forEach((v) => { if (v.b) mark(v.id); });
  G.board.edges.forEach((e) => { if (e.road !== null) e.v.forEach(mark); });
  if (nw.length) G.ev.push({ t: 'reveal', hexes: nw });
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
    log(G, nw !== null ? `🛣️ <b>${pn(G, nw)}</b> consigue el Camino más largo (${max})` : 'Nadie tiene ahora el Camino más largo');
    if (nw !== null) G.ev.push({ t: 'banner', m: `🛣️ ${G.players[nw].name}: Camino más largo` });
  }
}
function updateArmy(G) {
  const p = G.turn, k = G.players[p].knights;
  if (k >= 3 && G.army !== p && (G.army === null || k > G.players[G.army].knights)) {
    G.army = p; log(G, `⚔️ <b>${pn(G, p)}</b> consigue el Mayor ejército (${k})`);
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
function placeSettlement(G, p, v) { G.board.verts[v].b = { p, t: 's' }; G.players[p].setts--; G.ev.push({ t: 'build', k: 's', id: v, p }); reveal(G); updateLongest(G); }
function placeCity(G, p, v) { G.board.verts[v].b.t = 'c'; G.players[p].setts++; G.players[p].cities--; G.ev.push({ t: 'build', k: 'c', id: v, p }); }
function placeRoad(G, p, e) { G.board.edges[e].road = p; G.players[p].roads--; G.ev.push({ t: 'build', k: 'r', id: e, p }); reveal(G); updateLongest(G); }
function produce(G, n) {
  const B = G.board, gains = G.players.map(() => ({})), hexes = [];
  B.hexes.forEach((h) => {
    if (h.num !== n || h.id === B.robber) return;
    hexes.push(h.id);
    h.verts.forEach((v) => { const b = B.verts[v].b; if (b) gains[b.p][h.res] = (gains[b.p][h.res] || 0) + (b.t === 'c' ? 2 : 1); });
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
    for (const r in g) { if (!g[r]) continue; G.players[i].res[r] += g[r]; G.bank[r] -= g[r]; parts.push(g[r] + RINFO[r].e); flows.push({ p: i, r, n: g[r] }); }
    if (parts.length) { any = true; log(G, `<b>${pn(G, i)}</b> recibe ${parts.join(' ')}`); G.ev.push({ t: 'gain', to: i, m: `Recibes ${parts.join(' ')}` }); }
  });
  if (!any) log(G, 'Nadie recibe nada');
  G.ev.push({ t: 'produce', hexes, flows });
}
function startSeven(G) {
  const n = G.players.length;
  G.discardQueue = [];
  for (let i = 0; i < n; i++) { const p = (G.turn + i) % n; if (total(G, p) > 7) G.discardQueue.push(p); }
  G.afterRobber = 'main';
  G.phase = G.discardQueue.length ? 'discard' : 'robber';
  if (G.phase === 'robber') skipRobberIfNoTarget(G);
}
function skipRobberIfNoTarget(G) { if (!robberTargets(G).length) { log(G, 'El ladrón no tiene adónde ir'); finishRobber(G); } }
function finishRobber(G) { G.phase = G.afterRobber || 'main'; G.afterRobber = null; G.stealCands = []; }
function doSteal(G, q) {
  const pool = [];
  RES.forEach((r) => { for (let i = 0; i < G.players[q].res[r]; i++) pool.push(r); });
  const r = pool[rnd(pool.length)];
  G.players[q].res[r]--; G.players[G.turn].res[r]++;
  log(G, `<b>${pn(G, G.turn)}</b> roba una carta a <b>${pn(G, q)}</b>`);
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
      log(G, `<b>${pn(G, p)}</b> construye un poblado`); checkWin(G);
      return null;
    }
    case 'city': {
      const v = a.v | 0;
      if (!isActor || !['main', 'sbp'].includes(G.phase)) return 'Ahora no puedes construir';
      if (me.cities <= 0) return 'No te quedan ciudades';
      if (!afford(G, p, COST.city)) return 'No tienes recursos suficientes';
      if (!G.board.verts[v] || !canCityV(G, p, v)) return 'Ahí no hay un poblado tuyo';
      pay(G, p, COST.city); placeCity(G, p, v);
      log(G, `<b>${pn(G, p)}</b> mejora a ciudad`); checkWin(G);
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
        if (G.rbLeft <= 0 || me.roads <= 0 || !anyRoadSpot(G, p)) G.phase = 'main';
        checkWin(G); return null;
      }
      if (!['main', 'sbp'].includes(G.phase)) return 'Ahora no puedes construir';
      if (!afford(G, p, COST.road)) return 'No tienes recursos suficientes';
      pay(G, p, COST.road); placeRoad(G, p, e);
      log(G, `<b>${pn(G, p)}</b> construye un camino`); checkWin(G);
      return null;
    }
    case 'roll': {
      if (!isActor || G.phase !== 'roll') return 'Ahora no toca tirar';
      const d1 = 1 + rnd(6), d2 = 1 + rnd(6), s = d1 + d2;
      G.dice = [d1, d2]; G.rollId++;
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
      log(G, `🦹 El ladrón se mueve a ${RINFO[hx.res].e}${hx.num ? ' ' + hx.num : ''}`);
      const cands = [...new Set(hx.verts.map((v) => G.board.verts[v].b).filter((b) => b && b.p !== p).map((b) => b.p))].filter((q) => total(G, q) > 0);
      if (!cands.length) finishRobber(G);
      else if (cands.length === 1) doSteal(G, cands[0]);
      else { G.phase = 'steal'; G.stealCands = cands; }
      return null;
    }
    case 'steal': {
      if (G.phase !== 'steal' || G.turn !== p || !G.stealCands.includes(a.q)) return 'No puedes robar a ese jugador';
      doSteal(G, a.q); return null;
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
      me.dev.splice(i, 1); G.playedDev = true;
      log(G, `<b>${pn(G, p)}</b> juega ${DEV[d.t].e} ${DEV[d.t].n}`);
      G.ev.push({ t: 'banner', m: `${DEV[d.t].e} ${G.players[p].name} juega ${DEV[d.t].n}` });
      if (d.t === 'knight') { me.knights++; updateArmy(G); checkWin(G); if (G.winner !== null) return null; G.afterRobber = G.phase; G.phase = 'robber'; skipRobberIfNoTarget(G); }
      else if (d.t === 'road') { G.rbLeft = Math.min(2, me.roads); if (G.rbLeft > 0 && anyRoadSpot(G, p)) G.phase = 'roadbuild'; }
      else if (d.t === 'plenty') { a.list.slice(0, 2).forEach((r) => { G.bank[r]--; me.res[r]++; }); log(G, `<b>${pn(G, p)}</b> coge ${a.list.slice(0, 2).map((r) => RINFO[r].e).join(' ')} del banco`); }
      else if (d.t === 'mono') {
        let n = 0;
        G.players.forEach((P, j) => { if (j === p) return; n += P.res[a.r]; if (P.res[a.r]) G.ev.push({ t: 'gain', to: j, m: `Monopolio: pierdes ${P.res[a.r]} ${RINFO[a.r].e}` }); P.res[a.r] = 0; });
        me.res[a.r] += n; log(G, `💰 <b>${pn(G, p)}</b> se lleva ${n} ${RINFO[a.r].e}`);
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
      G.offer = { id: (G.offer ? G.offer.id : 0) + 1, from: p, give, want, acc: {}, rej: {} };
      log(G, `🤝 <b>${pn(G, p)}</b> ofrece ${fmt(give)} por ${fmt(want)}`);
      G.ev.push({ t: 'offer' });
      return null;
    }
    case 'respond': {
      const O = G.offer;
      if (!O || O.from === p || (a.id && a.id !== O.id)) return 'Esa oferta ya no existe';
      if (a.yes) { if (!RES.every((r) => me.res[r] >= O.want[r])) return 'No tienes lo que te piden'; O.acc[p] = true; delete O.rej[p]; }
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
    hexes: B.hexes.map((h) => ({ id: h.id, x: h.x, y: h.y, res: h.res, num: h.num, verts: h.verts, nb: h.nb })),
    verts: B.verts.map((v) => ({ id: v.id, x: v.x, y: v.y, hexes: v.hexes, adj: v.adj, edges: v.edges, port: v.port })),
    edges: B.edges.map((e) => ({ id: e.id, v: e.v, hexes: e.hexes })),
    ports: B.ports, sea: B.sea,
  };
}
export function publicState(G, forP) {
  const B = G.board;
  return {
    phase: G.phase, turn: G.turn, turnNum: G.turnNum, dice: G.dice, rollId: G.rollId, setupSub: G.setupSub, lastSett: G.lastSett, setupIdx: G.setupIdx,
    robber: B.robber, revealed: G.revealed, longest: G.longest, army: G.army, roadLens: G.roadLens, winner: G.winner,
    playedDev: G.playedDev, rbLeft: G.rbLeft, sbpQueue: G.sbpQueue, discardQueue: G.discardQueue, stealCands: G.stealCands, offer: G.offer,
    deckN: G.deck.length, bank: G.bank, log: G.log.slice(0, 30), opts: { fog: G.opts.fog, target: G.opts.target, sbp: G.opts.sbp },
    buildings: B.verts.filter((v) => v.b).map((v) => [v.id, v.b.p, v.b.t]),
    roads: B.edges.filter((e) => e.road !== null).map((e) => [e.id, e.road]),
    players: G.players.map((P, i) => ({
      name: P.name, color: P.color, n: total(G, i), devN: P.dev.length, knights: P.knights, roads: P.roads, setts: P.setts, cities: P.cities,
      vp: vp(G, i, G.winner !== null || i === forP),
      res: i === forP ? P.res : null, dev: i === forP ? P.dev : null,
    })),
  };
}
// Reconstruye en un móvil un objeto G compatible con las funciones de consulta
export function mirror(staticBoard, s) {
  const board = JSON.parse(JSON.stringify(staticBoard));
  board.verts.forEach((v) => (v.b = null));
  board.edges.forEach((e) => (e.road = null));
  s.buildings.forEach(([v, p, t]) => (board.verts[v].b = { p, t }));
  s.roads.forEach(([e, p]) => (board.edges[e].road = p));
  board.robber = s.robber;
  const players = s.players.map((P) => ({ ...P, res: P.res || { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 }, dev: P.dev || [] }));
  return { ...s, board, players, revealed: s.revealed, opts: s.opts, longest: s.longest, army: s.army };
}
