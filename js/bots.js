// Jugadores automáticos: deciden una acción cada vez que les toca.
import { RES, COST, actor, total, targets, afford, canPlayDev, rate, vp, shipMoves, canBuildShipE, pirateTargets, vertLand, edgeSea, shipAt } from './engine.js';

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
// ¿es un buen destino para colonizar? (vértice libre que toca una isla nueva)
function goalVertex(G, v) { const V = G.board.verts[v]; return free(G, v) && vertLand(G, v) && V.hexes.some((h) => G.board.hexes[h].island > 0); }
// siguiente tramo de un barco hacia el destino más cercano (búsqueda en anchura por el mar)
function shipStep(G, p) {
  const moves = shipMoves(G, p, G.phase === 'roadbuild');
  if (!moves.length) return null;
  let best = null, bestD = 1e9;
  moves.forEach((m) => {
    const seen = new Set([m.to]); let frontier = [m.to], d = 0;
    while (frontier.length && d < 14) {
      if (frontier.some((e) => G.board.edges[e].v.some((v) => goalVertex(G, v)))) break;
      const nxt = [];
      frontier.forEach((e) => G.board.edges[e].v.forEach((v) => G.board.verts[v].edges.forEach((e2) => { if (!seen.has(e2) && edgeSea(G, e2) && !shipAt(G, e2)) { seen.add(e2); nxt.push(e2); } })));
      frontier = nxt; d++;
    }
    if (!frontier.length) d = 99;
    if (d < bestD || (d === bestD && Math.random() < 0.5)) { bestD = d; best = m; }
  });
  // si el barco ya está junto a un destino, no lo movemos
  const docked = (G.ships || []).some((sh) => sh.id === best.id && G.board.edges[sh.e].v.some((v) => goalVertex(G, v)));
  if (docked) return null;
  return bestD < 99 ? { t: 'moveShip', to: best.to, id: best.id } : null;
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
  if (G.offer && G.offer.from !== p && (G.offer.to == null || G.offer.to === p) && !G.offer.acc[p] && !G.offer.rej[p]) {
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
  if (G.phase === 'steal' && G.turn === p) {
    const q = bestBy(G.stealCands, (q) => total(G, q));
    const r = RES.filter((r) => G.players[q].res[r] > 0).sort((x, y) => P.res[x] - P.res[y])[0]; // con caballero elige la que menos tiene
    return { t: 'steal', q, r };
  }
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
  if (G.phase === 'roadbuild') {
    if (G.opts.ships) { const st = shipStep(G, p); if (st && Math.random() < 0.6) return st; }
    const T = targets(G, p, 'road').e.filter((e) => G.board.edges[e].road === null && !shipAt(G, e) && (!G.opts.ships || G.board.edges[e].hexes.some((h) => G.board.hexes[h].res !== 'sea')));
    const ok = T.filter((e) => G.board.edges[e].v.some((v) => { const V = G.board.verts[v]; return (V.b && V.b.p === p) || V.edges.some((x) => G.board.edges[x].road === p); }));
    if (ok.length && G.players[p].roads > 0) return { t: 'road', e: bestBy(ok, (e) => roadScore(G, e, p)) };
    const st = G.opts.ships && shipStep(G, p); if (st) return st;
    const any = targets(G, p, null).e; if (!any.length) return { t: 'end' };
    const mv = G.opts.ships ? shipMoves(G, p, true)[0] : null; return mv ? { t: 'moveShip', to: mv.to, id: mv.id } : { t: 'road', e: any[0] };
  }
  if (G.phase === 'main' && G.offer && G.offer.from === p) {
    const q = Object.keys(G.offer.acc)[0];
    if (q !== undefined) return { t: 'confirm', q: +q };
    const all = G.offer.to != null ? !!G.offer.rej[G.offer.to] : G.players.every((_, i) => i === p || G.offer.rej[i]);
    if (all || Date.now() - (G.offer._ts || 0) > 9000) return { t: 'cancelOffer' };
    return null;
  }
  if (G.phase === 'main' || G.phase === 'sbp') {
    const city = targets(G, p, 'city').v, sett = targets(G, p, 'settlement').v, road = targets(G, p, 'road').e;
    if (G.opts.ships) {
      const islandSpot = sett.find((v) => goalVertex(G, v));
      if (islandSpot !== undefined && afford(G, p, COST.settlement)) return { t: 'settle', v: islandSpot };
      if (G.phase === 'main') { const st = shipStep(G, p); if (st) return st; }
      const myShips = (G.ships || []).filter((x) => x.p === p).length;
      const shipSpots = targets(G, p, 'ship').e;
      const unclaimed = G.board.hexes.some((h) => h.island > 0 && G.islandClaim[h.island] === undefined);
      if (unclaimed && myShips < 2 && shipSpots.length && afford(G, p, COST.ship) && (sett.length < 2 || Math.random() < 0.35)) return { t: 'ship', e: pick(shipSpots) };
      const pi = P.dev.findIndex((d, i) => d.t === 'pirate' && canPlayDev(G, p, i));
      if (pi >= 0 && G.phase === 'main') { const ts = pirateTargets(G, p); return { t: 'playDev', i: pi, q: bestBy(ts, (q) => vp(G, q) + total(G, q) * 0.1) }; }
    }
    if (city.length && afford(G, p, COST.city)) return { t: 'city', v: bestBy(city, (v) => vertexScore(G, v)) };
    if (sett.length && afford(G, p, COST.settlement)) return { t: 'settle', v: bestBy(sett, (v) => vertexScore(G, v, p)) };
    if (!sett.length && road.length && afford(G, p, COST.road) && P.setts > 0) return { t: 'road', e: bestBy(road, (e) => roadScore(G, e, p)) };
    if (afford(G, p, COST.dev) && G.deck.length && (P.res.ore >= 2 || Math.random() < 0.4) && !(city.length && P.res.ore < 3)) return { t: 'buyDev' };
    if (G.phase === 'main') {
      const di = P.dev.findIndex((d, i) => canPlayDev(G, p, i) && d.t !== 'knight' && d.t !== 'pirate');
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
