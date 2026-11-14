// Jugadores automáticos: deciden una acción cada vez que les toca.
import { RES, COST, actor, total, targets, afford, canPlayDev, rate, vp } from './engine.js';

const pips = (n) => (n ? 6 - Math.abs(7 - n) : 0);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function vertexScore(G, v, p) {
  const V = G.board.verts[v];
  let s = 0; const kinds = new Set();
  V.hexes.forEach((h) => { const H = G.board.hexes[h]; if (H.res === 'desert') return; let w = pips(H.num); if (h === G.board.robber) w *= 0.4; s += w; kinds.add(H.res); });
  s += kinds.size * 0.8;
  if (V.port) s += V.port === 'any' ? 1 : 1.5;
  if (p !== undefined) { const have = G.players[p]; ['ore', 'wheat'].forEach((r) => { if (V.hexes.some((h) => G.board.hexes[h].res === r)) s += 0.5; }); }
  return s + Math.random() * 0.3;
}
function bestBy(list, f) { let b = null, bs = -1e9; list.forEach((x) => { const s = f(x); if (s > bs) { bs = s; b = x; } }); return b; }
function free(G, v) { const V = G.board.verts[v]; return !V.b && !V.adj.some((a) => G.board.verts[a].b); }
// valor de un camino: mejor vértice libre al que acerca
function roadScore(G, e, p) {
  const E = G.board.edges[e];
  let best = 0;
  E.v.forEach((v) => {
    if (free(G, v)) best = Math.max(best, vertexScore(G, v) + 2);
    G.board.verts[v].adj.forEach((w) => { if (free(G, w)) best = Math.max(best, vertexScore(G, w) * 0.7); });
  });
  return best + Math.random();
}
function need(G, p) { // recurso que más le falta para su próximo objetivo
  const P = G.players[p], goal = P.setts < 5 && G.board.verts.some((V) => V.b && V.b.p === p && V.b.t === 's') && P.res.ore >= 2 ? COST.city : COST.settlement;
  let worst = null, gap = 0;
  for (const [r, n] of Object.entries(goal)) { const g = n - P.res[r]; if (g > gap) { gap = g; worst = r; } }
  return worst || pick(RES);
}

// Devuelve la acción del bot p, o null si no le toca hacer nada.
export function botAction(G, p) {
  if (G.winner !== null) return null;
  const P = G.players[p];
  if (G.phase === 'discard' && G.discardQueue.includes(p)) {
    let n = Math.floor(total(G, p) / 2); const sel = {};
    while (n > 0) { const r = RES.reduce((a, b) => (P.res[a] - (sel[a] || 0) >= P.res[b] - (sel[b] || 0) ? a : b)); sel[r] = (sel[r] || 0) + 1; n--; }
    return { t: 'discard', sel };
  }
  if (G.offer && G.offer.from !== p && !G.offer.acc[p] && !G.offer.rej[p]) {
    const O = G.offer, can = RES.every((r) => P.res[r] >= O.want[r]);
    const useful = RES.some((r) => O.give[r] && P.res[r] < 2);
    return { t: 'respond', yes: can && useful && Math.random() < 0.6, id: O.id };
  }
  if (G.phase === 'robber' && G.turn === p) {
    const T = targets(G, p, null).h;
    const leader = G.players.map((_, i) => i).filter((i) => i !== p).sort((a, b) => vp(G, b) - vp(G, a))[0];
    const h = bestBy(T, (h) => {
      const H = G.board.hexes[h]; let s = pips(H.num);
      H.verts.forEach((v) => { const b = G.board.verts[v].b; if (!b) return; if (b.p === p) s -= 10; else s += (b.t === 'c' ? 2 : 1) * (b.p === leader ? 2 : 1); });
      return s + Math.random();
    });
    return { t: 'robber', h };
  }
  if (G.phase === 'steal' && G.turn === p) return { t: 'steal', q: bestBy(G.stealCands, (q) => total(G, q)) };
  if (actor(G) !== p) return null;
  if (G.phase === 'setup') {
    const T = targets(G, p, null);
    if (G.setupSub === 'settlement') return { t: 'settle', v: bestBy(T.v, (v) => vertexScore(G, v, p)) };
    return { t: 'road', e: bestBy(T.e, (e) => roadScore(G, e, p)) };
  }
  if (G.phase === 'roll') {
    // caballero si el ladrón le está bloqueando
    const ki = P.dev.findIndex((d, i) => d.t === 'knight' && canPlayDev(G, p, i));
    const blocked = G.board.hexes[G.board.robber].verts.some((v) => G.board.verts[v].b && G.board.verts[v].b.p === p);
    if (ki >= 0 && blocked) return { t: 'playDev', i: ki };
    return { t: 'roll' };
  }
  if (G.phase === 'roadbuild') { const T = targets(G, p, 'road').e; return { t: 'road', e: bestBy(T, (e) => roadScore(G, e, p)) }; }
  if (G.phase === 'main' && G.offer && G.offer.from === p) {
    const q = Object.keys(G.offer.acc)[0];
    if (q !== undefined) return { t: 'confirm', q: +q };
    const all = G.players.every((_, i) => i === p || G.offer.rej[i]);
    if (all || Date.now() - (G.offer._ts || 0) > 9000) return { t: 'cancelOffer' };
    return null;
  }
  if (G.phase === 'main' || G.phase === 'sbp') {
    const city = targets(G, p, 'city').v, sett = targets(G, p, 'settlement').v, road = targets(G, p, 'road').e;
    if (city.length && afford(G, p, COST.city)) return { t: 'city', v: bestBy(city, (v) => vertexScore(G, v)) };
    if (sett.length && afford(G, p, COST.settlement)) return { t: 'settle', v: bestBy(sett, (v) => vertexScore(G, v, p)) };
    if (!sett.length && road.length && afford(G, p, COST.road) && P.setts > 0) return { t: 'road', e: bestBy(road, (e) => roadScore(G, e, p)) };
    if (afford(G, p, COST.dev) && G.deck.length && (P.res.ore >= 2 || Math.random() < 0.4) && !(city.length && P.res.ore < 3)) return { t: 'buyDev' };
    if (G.phase === 'main') {
      const di = P.dev.findIndex((d, i) => canPlayDev(G, p, i) && d.t !== 'knight');
      if (di >= 0) { const d = P.dev[di]; if (d.t !== 'road' || road.length) return { t: 'playDev', i: di, list: [need(G, p), need(G, p)], r: need(G, p) }; }
      const ki = P.dev.findIndex((d, i) => d.t === 'knight' && canPlayDev(G, p, i));
      if (ki >= 0 && Math.random() < 0.5) return { t: 'playDev', i: ki };
      // cambio con el banco si le sobra algo y le falta lo que necesita
      const want = need(G, p), give = RES.find((r) => r !== want && P.res[r] >= rate(G, p, r) + 1);
      if (give && G.bank[want] > 0) return { t: 'bank', give, get: want };
      if (!G._botOffered && Math.random() < 0.25) {
        const extra = RES.find((r) => r !== want && P.res[r] >= 2);
        if (extra) { G._botOffered = true; return { t: 'offer', give: { [extra]: 1 }, want: { [want]: 1 } }; }
      }
      G._botOffered = false;
      return { t: 'end' };
    }
    return { t: 'pass' };
  }
  return null;
}
