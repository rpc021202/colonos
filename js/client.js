// Mando del jugador (móvil): una sola pantalla con el mapa 3D, la mano abajo, los rivales arriba
// y los menús de construir / comerciar / partida a un lado. Funciona en horizontal y en vertical.
import { RES, RINFO, COST, DEV, COLORS, esc, fmt, mirror, targets, afford, canPlayDev, rate, actor, vp, canRoadE, canBuildShipE, shipMoves, pirateTargets, upgradableShips } from './engine.js';
import { joinRoom, unpack } from './net.js';
import { startRelay } from './relay.js';
import { Board3D } from './board3d.js';
import { sound } from './audio.js';
sound.useKeys('colonos-phone-', false, true);

const $ = (s) => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const LOCAL = qs.has('local');
// embed: este mando va dentro de la página que lleva la partida (crear y jugar desde el mismo móvil)
const EMBED = qs.has('embed') && window.parent !== window;
const post = (m, extra = {}) => { try { window.parent.postMessage({ colonos: m, ...extra }, location.origin); } catch (e) {} };
function friendURL() { const u = new URL(location.href); u.searchParams.delete('embed'); u.hash = ''; return u.toString(); }
function qrSVG(text) { try { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); } catch (e) { return ''; } }
// en modo prueba (?local=1) cada pestaña es un jugador distinto
const ST = () => (LOCAL ? sessionStorage : localStorage);
const store = { get(k, d) { try { const v = ST().getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { ST().setItem(k, JSON.stringify(v)); } catch (e) {} } };

const U = {
  screen: 'join', code: (qs.get('sala') || store.get('colonos-lastcode', '') || '').toUpperCase(), name: store.get('colonos-name', ''), color: store.get('colonos-color', COLORS[1].c),
  status: 'idle', lobby: null, B: null, S: null, G: null, me: -1, mode: null, sel: null, modal: null,
  panel: null, handOpen: false, tradeTo: null, trade: { give: {}, want: {} }, bank: { give: null, get: null }, seenOffer: 0, autoKey: '', msg: '', stealQ: null,
};
let net = null;

/* ---------- utilidades ---------- */
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
function token() {
  const k = 'colonos-token-' + U.code;
  let t = store.get(k, null);
  if (!t) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); store.set(k, t); }
  return t;
}
function send(a) { if (!net || !net.send({ t: 'act', a })) toast('Sin conexión con la partida'); else if (U.status !== 'open') toast('Se enviará en cuanto vuelva la conexión'); }
const cost = (c) => Object.entries(c).map(([r, n]) => RINFO[r].e.repeat(n)).join('');
// coste con las cartas que te faltan apagadas
const costHave = (c, res) => Object.entries(c).flatMap(([r, n]) => [...Array(n)].map((_, i) => (i < res[r] ? RINFO[r].e : `<i>${RINFO[r].e}</i>`))).join('');
const sumRes = (o) => RES.reduce((s, r) => s + (o[r] || 0), 0);

/* ---------- conexión ---------- */
// el aviso rojo solo sale si la desconexión dura más de 5 s (al desbloquear el móvil se recupera antes)
let lostSince = 0, lostTimer = null;
function lostBanner() {
  const bad = U.status !== 'open' && U.screen !== 'join';
  if (!bad) { lostSince = 0; clearTimeout(lostTimer); lostTimer = null; $('#lost') && $('#lost').remove(); return; }
  if (!lostSince) lostSince = Date.now();
  if (Date.now() - lostSince > 5000) { if (!$('#lost')) document.body.insertAdjacentHTML('beforeend', `<div class="lost" id="lost">Reconectando<span class="dots"></span></div>`); }
  else if (!lostTimer) lostTimer = setTimeout(() => { lostTimer = null; lostBanner(); }, 5200);
}
function connect() {
  if (net) net.close();
  U.status = 'connecting'; render();
  store.set('colonos-name', U.name); store.set('colonos-color', U.color); store.set('colonos-lastcode', U.code);
  net = joinRoom(U.code, {
    onOpen: () => { U.status = 'open'; net.send({ t: 'hello', token: token(), name: U.name, color: U.color }); render(); },
    onStatus: (s) => { U.status = s === 'open' ? 'open' : s; if (s === 'notfound' && U.screen === 'join') U.msg = 'No encuentro esa sala. ¿El código está bien?'; if (U.screen === 'join' && s !== 'open') render(); else lostBanner(); },
    onMessage: onMsg,
    onHost: hostEvent,
  }, token());
}
/* ---------- relevo: si quien lleva la partida desaparece, un móvil la coge ----------
   Cada móvil espera un poco según su puesto (para que no la cojan dos a la vez) y el primero
   que sigue en pie la carga desde la copia del servidor. */
let relay = null, electT = null, wakeLock = null;
async function keepAwake() { try { if (relay && 'wakeLock' in navigator && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {} }
document.addEventListener('visibilitychange', keepAwake);
function hostEvent(m) {
  if (m.alive) { if (U.hostGone) { U.hostGone = false; render(); } clearTimeout(electT); electT = null; return; }
  if (!m.gone || U.screen !== 'game' || !U.S || relay || !net || !net.relay) return;
  const humans = U.S.players.map((_, i) => i).filter((i) => !/ 🤖$/.test(U.S.players[i].name));
  const rank = Math.max(0, humans.indexOf(U.me));
  U.hostGone = true; U.goneAt = Date.now(); render();
  clearTimeout(electT);
  electT = setTimeout(takeOver, 2500 + rank * 4500 + Math.random() * 800);
}
async function takeOver() {
  electT = null;
  if (relay || !U.hostGone || document.hidden) return;
  // si la partida nos sigue contestando, no se había ido (era un corte momentáneo)
  if (net.lastIn() > U.goneAt + 500) { U.hostGone = false; render(); return; }
  const saved = await unpack(await net.saved());
  if (!U.hostGone || relay) return; // otro se ha adelantado
  if (!saved || !saved.G || saved.code !== U.code) { toast('No encuentro la copia de la partida'); return; }
  try {
    relay = await startRelay(U.code, net.url, saved, () => { relay = null; render(); });
    toast('🔁 Tu móvil lleva ahora la partida'); keepAwake();
  } catch (e) { relay = null; }
  render();
}
function onMsg(m) {
  switch (m.t) {
    case 'lobby': U.lobby = m; U.me = m.you; if (U.screen !== 'game') U.screen = 'lobby'; U.msg = ''; render(); break;
    case 'start': { const again = U.screen === 'game' && U.B && U.B.hexes.length === m.b.hexes.length; U.B = m.b; U.me = m.you; if (!again) { U.screen = 'game'; U.mode = null; U.sel = null; U.panel = null; U.needBoard = true; } render(); break; }
    case 'state': {
      U.rolling = 0;
      U.S = m.s; U.G = mirror(U.B, m.s);
      autoState();
      if (U.sel && !optionsFor(U.sel).length) U.sel = null;
      sync3D(); render(); break;
    }
    case 'fx': playFx(m.l || []); if (U.rolling) render(); break;
    case 'note': toast(m.m); break;
    case 'err': toast('⚠️ ' + m.m); break;
    case 'yourturn': try { navigator.vibrate && navigator.vibrate([120, 60, 120]); } catch (e) {} toast(m.sbp ? '🔨 Puedes construir (fase extra)' : '¡Te toca!'); break;
    case 'full': U.screen = 'join'; U.msg = m.m; net && net.close(); net = null; render(); break;
    case 'closed': U.screen = 'join'; U.msg = 'La partida se ha cerrado. ¡Gracias por jugar!'; U.S = null; U.G = null; U.B = null; U.needBoard = true; net && net.close(); net = null; U.status = 'idle'; render(); break;
    case 'reset': U.screen = 'lobby'; U.S = null; U.G = null; U.B = null; U.modal = null; U.needBoard = true; render(); break;
  }
}
function autoState() {
  const G = U.G; if (!G) return;
  const key = G.phase + G.setupIdx + G.turnNum + (G.setupSub || '') + actor(G);
  if (key !== U.autoKey) { U.sel = null; if (G.phase !== 'main' && G.phase !== 'sbp') U.mode = null; }
  U.autoKey = key;
  if (!canBuildNow()) U.mode = null;
  if (G.phase !== 'steal') U.stealQ = null;
}
const canBuildNow = () => { const G = U.G; return G && G.winner === null && ['main', 'sbp'].includes(G.phase) && actor(G) === U.me; };

/* ---------- qué brilla en el mapa ---------- */
// Sin tocar nada se iluminan los sitios que te puedes permitir; desde 🔨 se puede filtrar uno.
function glow() {
  const G = U.G, me = U.me, out = { v: [], e: [], h: [], shipE: [], cityV: [], road: [], ship: [], move: [], sett: [], up: [] };
  if (!G || G.winner !== null) return out;
  const P = G.players[me], add = (arr, list) => list.forEach((x) => { if (!arr.includes(x)) arr.push(x); });
  if (G.phase === 'setup' || G.phase === 'robber') { const T = targets(G, me, null); out.v = T.v; out.e = T.e; out.h = T.h; out.sett = T.v; out.road = T.e; return out; }
  if (G.phase === 'roadbuild') {
    if (actor(G) !== me) return out;
    const T = targets(G, me, null); out.e = T.e;
    out.road = T.e.filter((e) => canRoadE(G, me, e)); out.move = T.e.filter((e) => !out.road.includes(e)); out.shipE = out.move.slice();
    return out;
  }
  if (!canBuildNow()) return out;
  const want = (k) => !U.mode || U.mode === k;
  if (want('settlement') && afford(G, me, COST.settlement) && P.setts > 0) out.sett = targets(G, me, 'settlement').v;
  if (want('city') && afford(G, me, COST.city) && P.cities > 0) out.cityV = targets(G, me, 'city').v;
  if (want('road') && afford(G, me, COST.road) && P.roads > 0) out.road = targets(G, me, 'road').e;
  if (G.opts.ships && want('ship') && afford(G, me, COST.ship) && P.shipsLeft > 0) out.ship = targets(G, me, 'ship').e;
  if (G.opts.ships && want('move') && G.phase === 'main' && G.turn === me) out.move = shipMoves(G, me, false).map((m) => m.to);
  if (U.mode === 'upship' && G.phase === 'main' && afford(G, me, COST.shipUp)) out.up = upgradableShips(G, me).map((x) => x.e);
  add(out.e, out.up);
  add(out.v, out.sett); add(out.v, out.cityV);
  add(out.e, out.road); add(out.e, out.ship); add(out.e, out.move);
  out.shipE = out.e.filter((e) => !out.road.includes(e));
  return out;
}
// opciones que salen en la burbuja al tocar un sitio que brilla
function optionsFor(sel) {
  const G = U.G, me = U.me, O = glow(), o = [];
  if (!G || !sel) return o;
  if (sel.k === 'h' && O.h.includes(sel.id)) o.push({ l: '🦹 Mover el ladrón aquí', a: { t: 'robber', h: sel.id } });
  if (sel.k === 'v' && O.v.includes(sel.id)) {
    if (O.cityV.includes(sel.id)) o.push({ l: '🏰 Ciudad', c: COST.city, a: { t: 'city', v: sel.id } });
    else o.push({ l: '🏠 Poblado', c: G.phase === 'setup' ? null : COST.settlement, a: { t: 'settle', v: sel.id } });
  }
  if (sel.k === 'e' && O.e.includes(sel.id)) {
    const rb = G.phase === 'roadbuild', su = G.phase === 'setup';
    if (O.road.includes(sel.id)) o.push({ l: '🛤️ Camino', c: rb || su ? null : COST.road, a: { t: 'road', e: sel.id }, free: rb });
    if (O.ship.includes(sel.id) && canBuildShipE(G, me, sel.id)) o.push({ l: '⛵ Barco', c: COST.ship, a: { t: 'ship', e: sel.id } });
    if (O.move.includes(sel.id)) o.push({ l: '🧭 Navegar aquí', a: { t: 'moveShip', to: sel.id }, free: true });
    if (O.up.includes(sel.id)) o.push({ l: '⛵ Mejorar barco', c: COST.shipUp, a: { t: 'upgradeShip', e: sel.id } });
  }
  return o;
}
function selPos(sel) {
  const B = U.B; if (!B || !b3) return null;
  if (sel.k === 'v') { const V = B.verts[sel.id]; return b3.worldToScreen(V.x, 0.45, V.y); }
  if (sel.k === 'e') { const E = B.edges[sel.id], a = B.verts[E.v[0]], b = B.verts[E.v[1]]; return b3.worldToScreen((a.x + b.x) / 2, 0.35, (a.y + b.y) / 2); }
  const H = B.hexes[sel.id]; return b3.worldToScreen(H.x, 0.9, H.y);
}
// la burbuja sigue al sitio aunque muevas el mapa
(function follow() {
  const el = $('#bub');
  if (el && U.sel) {
    const p = selPos(U.sel);
    if (p) { const w = el.offsetWidth, x = Math.max(w / 2 + 6, Math.min(innerWidth - w / 2 - 6, p.x)); el.style.left = x + 'px'; el.style.top = Math.max(el.offsetHeight + 30, p.y) + 'px'; }
  }
  requestAnimationFrame(follow);
})();

/* ---------- dados y sonidos en el móvil ---------- */
function playFx(list) {
  let rolled = false;
  list.forEach((e) => {
    if (e.t === 'roll') { rolled = true; U.rolling = Date.now(); sound.play('dice'); if (b3 && b3.ready && U.screen === 'game') b3.rollDice(e.d[0], e.d[1]); }
    else if (e.t === 'produce') setTimeout(() => { if (b3 && b3.ready) b3.produce(e.hexes); if (e.hexes.length) sound.play('produce'); }, rolled ? 1700 : 0);
    else if (e.t === 'build') sound.play(e.k === 'r' ? 'road' : e.k === 'c' ? 'city' : e.k === 'b' ? 'ship' : 'settlement');
    else if (e.t === 'turn') { if (!e.setup && e.p === U.me) sound.play('turn'); }
    else if (['sail', 'pirate', 'robber', 'devbuy', 'trade', 'win'].includes(e.t)) sound.play(e.t === 'devbuy' ? 'devcard' : e.t);
  });
}

/* ---------- mapa 3D persistente ---------- */
const mapHost = document.createElement('div');
mapHost.style.cssText = 'position:absolute;inset:0';
let b3 = null, prevRev = {};
function ensure3D() {
  if (!b3) {
    b3 = new Board3D(mapHost, { mobile: true });
    b3.onPick = (sel) => { U.sel = optionsFor(sel).length ? sel : null; U.panel = null; render(); };
    b3.onMiss = () => { if (U.sel || U.panel) { U.sel = null; U.panel = null; render(); } };
  }
  if (U.needBoard && U.S) {
    U.needBoard = false; b3.ready = false;
    b3.setBoard(U.B, { fog: U.S.opts.fog, revealed: U.S.revealed, robber: U.S.robber });
    b3.syncPieces(U.S, U.S.players.map((p) => p.color));
    prevRev = { ...U.S.revealed }; b3.ready = true;
  }
}
function sync3D() {
  if (!b3 || U.needBoard || !U.S) return;
  const nw = Object.keys(U.S.revealed || {}).filter((k) => !prevRev[k]).map(Number);
  if (nw.length) { b3.revealHexes(nw); prevRev = { ...U.S.revealed }; }
  b3.syncPieces(U.S, U.S.players.map((p) => p.color));
}

/* ---------- render ---------- */
function render() {
  const app = $('#app');
  if (U.screen === 'game' && U.G) {
    if (!$('#mapslot')) { app.className = 'ingame'; app.innerHTML = '<div id="mapslot"></div><div id="ui"></div>'; }
    ensure3D();
    if (mapHost.parentNode !== $('#mapslot')) $('#mapslot').appendChild(mapHost);
    b3.setActive(!qs.has('no3d')); b3.resize(); // no3d: solo para pruebas
    const O = glow();
    b3.setTargets(O, U.sel, U.G.players[U.me].color, 'road', { glow: true, shipE: O.shipE, cityV: O.cityV });
    const sc = $('.panel .scroll'), keep = sc ? sc.scrollTop : 0;
    $('#ui').innerHTML = gameHTML();
    const sc2 = $('.panel .scroll'); if (sc2) sc2.scrollTop = keep;
  } else {
    app.className = '';
    if (b3) b3.setActive(false);
    if (U.screen === 'join') app.innerHTML = joinHTML();
    else if (U.screen === 'lobby') app.innerHTML = lobbyHTML();
    else app.innerHTML = '<div class="wait">Cargando partida<span class="dots"></span></div>';
  }
  $('#modal').innerHTML = modalHTML();
  lostBanner();
}
function swatches(taken) {
  return `<div class="sw">${COLORS.map((c) => `<button style="background:${c.c}" class="${U.color === c.c ? 'sel' : ''}" data-a="color" data-c="${c.c}" title="${c.n}" ${taken.includes(c.c) && U.color !== c.c ? 'disabled' : ''}></button>`).join('')}</div>`;
}
function joinHTML() {
  const busy = U.status === 'connecting' && !U.msg;
  return `<div class="join"><h1>⬡ Catán</h1><div class="note" style="margin-bottom:8px">${EMBED ? 'Partida creada. Pon tu nombre y elige color para jugar desde este móvil.' : 'Únete a la partida con el código que te han pasado.'}</div>
    <label class="lbl">Código de la sala</label><input class="code" id="code" maxlength="4" value="${esc(U.code)}" autocomplete="off" autocapitalize="characters">
    <label class="lbl">Tu nombre</label><input id="name" maxlength="16" value="${esc(U.name)}" placeholder="¿Cómo te llamas?">
    <label class="lbl">Tu color</label>${swatches([])}
    <button class="primary big" data-a="join" ${busy ? 'disabled' : ''}>${busy ? 'Conectando…' : 'Unirme'}</button>
    ${U.msg ? `<div class="note" style="color:#b3261e;font-weight:600">${esc(U.msg)}</div>` : ''}</div>`;
}
function lobbyHTML() {
  const L = U.lobby || { players: [] }, taken = L.players.filter((_, i) => i !== U.me).map((p) => p.color);
  if (EMBED) {
    const url = friendURL();
    return `<div class="join"><h1>Tu partida</h1><div class="note">Pasa el código o el enlace a tus amigos para que se unan desde su móvil.</div>
    <div class="share"><div class="qr">${qrSVG(url)}</div><div><div class="note" style="margin:0">Código</div><div class="bigcode">${esc(U.code)}</div>
      <div class="row" style="margin-top:6px">${navigator.share ? '<button class="primary" data-a="sharelink">📤 Compartir</button>' : ''}<button data-a="copylink">📋 Copiar enlace</button></div></div></div>
    <label class="lbl">Jugadores (${L.players.length}/8)</label>${L.players.map((p, i) => `<div class="lp"><span class="chip" style="background:${p.color}"></span>${esc(p.name)}${i === U.me ? ' <small style="color:var(--muted);margin-left:auto">tú</small>' : / 🤖$/.test(p.name) ? `<button class="ghost" style="margin-left:auto;padding:2px 10px" data-a="rmbot" data-i="${i}">✕</button>` : ''}</div>`).join('')}
    <button class="ghost" style="width:100%" data-a="addbot" ${L.players.length >= 8 ? 'disabled' : ''}>🤖 Añadir un bot</button>
    <label class="lbl">Tu color</label>${swatches(taken)}
    ${L.cfg ? `<div class="note">${L.cfg.ships ? '⛵ Barcos e islas · ' : ''}Mapa de ${L.cfg.N} hexágonos · ${L.cfg.fog ? 'a ciegas' : 'visible'} · ${L.cfg.target} puntos</div>` : ''}
    <button class="primary big" data-a="selfgo" ${L.players.length >= 2 ? '' : 'disabled'}>Empezar partida (${L.players.length})</button>
    <div class="note">Este móvil lleva la partida: si lo bloqueas o cierras la página, el juego se queda en pausa para todos hasta que vuelvas.</div></div>`;
  }
  return `<div class="join"><h1>¡Dentro!</h1><div class="note">Sala <b>${esc(U.code)}</b>. Esperando a que empiece la partida<span class="dots"></span></div>
    <label class="lbl">Jugadores</label>${L.players.map((p, i) => `<div class="lp"><span class="chip" style="background:${p.color}"></span>${esc(p.name)}${i === U.me ? ' <small style="color:var(--muted);margin-left:auto">tú</small>' : ''}</div>`).join('')}
    <label class="lbl">Tu color</label>${swatches(taken)}
    ${L.cfg ? `<div class="note">Mapa de ${L.cfg.N} hexágonos · ${L.cfg.fog ? 'a ciegas' : 'visible'} · ${L.cfg.target} puntos</div>` : ''}
    <button class="ghost big" data-a="leave">Salir de la sala</button></div>`;
}
function phaseLine(G) {
  if (U.hostGone) return '⏳ Recuperando la partida…';
  if (G.winner !== null) return `🏆 ¡${esc(G.players[G.winner].name)} gana!`;
  const me = U.me, a = actor(G), mine = a === me;
  if (U.mode && canBuildNow()) return { road: 'Toca dónde va el camino', settlement: 'Toca dónde va el poblado', city: 'Toca el poblado que mejoras', ship: 'Toca dónde botas el barco', move: 'Toca a dónde navega tu barco', upship: 'Toca el barco que mejoras' }[U.mode];
  switch (G.phase) {
    case 'setup': return mine ? (G.setupSub === 'settlement' ? 'Toca dónde pones tu poblado' : 'Toca dónde va tu camino') : `${esc(G.players[a].name)} está colocando`;
    case 'roll': return mine ? 'Te toca: tira los dados' : `Turno de ${esc(G.players[a].name)}`;
    case 'discard': return G.discardQueue.includes(me) ? 'Tienes que descartar' : 'Esperando descartes';
    case 'robber': return G.turn === me ? 'Toca dónde va el ladrón' : `${esc(G.players[G.turn].name)} mueve el ladrón`;
    case 'steal': return G.turn === me ? 'Elige a quién robas' : `${esc(G.players[G.turn].name)} está robando`;
    case 'roadbuild': return mine ? (G.opts.ships ? `${G.rbLeft} tramo${G.rbLeft > 1 ? 's' : ''} gratis: camino o navegar` : `Coloca ${G.rbLeft} camino${G.rbLeft > 1 ? 's' : ''} gratis`) : `${esc(G.players[a].name)} construye caminos`;
    case 'sbp': return mine ? '🔨 Construcción extra' : `Construcción extra: ${esc(G.players[a].name)}`;
    default: return mine ? '' : `Turno de ${esc(G.players[a].name)}`;
  }
}
function gameHTML() {
  const G = U.G, me = U.me, P = G.players[me];
  const rolls = (G.rolls || []).slice(-5).reverse();
  const O = G.offer, incoming = O && O.from !== me && (O.to == null || O.to === me) && !O.acc[me] && !O.rej[me];
  const canAny = canBuildNow() && [COST.road, COST.settlement, COST.city, COST.dev].concat(G.opts.ships ? [COST.ship] : []).some((c) => afford(G, me, c));
  const line = phaseLine(G);
  let h = `<div id="me" class="${G.turn === me ? 'turn' : ''}"><div class="av" style="background:${P.color}">${esc((P.name || '?')[0])}</div><span>Tú</span><b>⭐ ${vp(G, me, true)}</b><span class="of">/${G.opts.target}</span><span class="net ${U.status === 'open' ? '' : 'bad'}"></span></div>`;
  if (G.dice) h += `<div id="dice"><div class="die">${G.dice[0]}</div><div class="die r">${G.dice[1]}</div><span class="hist">${rolls.slice(1).join(' · ')}</span></div>`;
  h += `<div id="rivals">${G.players.map((Q, i) => {
    if (i === me) return '';
    let st = '';
    if (O && O.from === me && (O.to == null || O.to === i)) st = O.acc[i] ? '<em class="ok">✓</em>' : O.rej[i] ? '<em class="no">✕</em>' : '<em>…</em>';
    return `<button class="rv ${G.turn === i ? 'turn' : ''} ${U.panel === 'trade' && U.tradeTo === i ? 'tap' : ''}" data-a="rival" data-q="${i}"><span class="av" style="background:${Q.color}">${esc((Q.name || '?')[0])}</span><span class="nm">${esc(Q.name)}</span><span class="st">⭐${Q.vp} · 🂠${Q.n}${G.army === i ? ' ⚔️' : ''}${G.longest === i ? ' 🛣️' : ''}</span>${st}</button>`;
  }).join('')}</div>`;
  if (line) h += `<div id="hint">${line}${U.mode && canBuildNow() ? ' <button data-a="cancelmode">✕</button>' : ''}</div>`;
  h += `<div id="rail">
    <button class="ib ${U.panel === 'build' ? 'on' : ''}" data-a="panel" data-k="build">🔨${canAny ? '<span class="dot"></span>' : ''}<small>Construir</small></button>
    <button class="ib ${U.panel === 'trade' ? 'on' : ''}" data-a="panel" data-k="trade">⇄${incoming || (O && O.from === me && Object.keys(O.acc).length) ? '<span class="dot o"></span>' : ''}<small>Comerciar</small></button>
    <button class="ib ${U.panel === 'menu' ? 'on' : ''}" data-a="panel" data-k="menu">☰<small>Partida</small></button></div>`;
  h += actionHTML();
  h += handHTML();
  if (U.panel) h += `<div class="panel">${U.panel === 'build' ? buildPanel() : U.panel === 'trade' ? tradePanel() : menuPanel()}</div>`;
  if (U.sel) {
    const ops = optionsFor(U.sel);
    if (ops.length) h += `<div id="bub">${ops.map((o, i) => `<div class="row">${o.l}${o.c ? ` <span class="c">${cost(o.c)}</span>` : o.free ? ' <span class="c">gratis</span>' : ''}<button class="primary" data-a="do" data-i="${i}">${o.a.t === 'robber' ? '✓' : 'Construir'}</button></div>`).join('')}</div>`;
  }
  if (U.handOpen) h += handOpenHTML();
  return h;
}
function actionHTML() {
  const G = U.G, me = U.me;
  if (G.winner !== null) return '';
  if (U.rolling && Date.now() - U.rolling < 4000) return '';
  if (G.phase === 'roll' && G.turn === me) return `<button id="act" class="roll" data-a="roll">🎲 Tirar dados</button>`;
  if (G.phase === 'main' && G.turn === me) return `<button id="act" data-a="end">Pasar turno ➜</button>`;
  if (G.phase === 'sbp' && actor(G) === me) return `<button id="act" data-a="pass">Terminar ➜</button>`;
  return '';
}
function handHTML() {
  const P = U.G.players[U.me], n = sumRes(P.res);
  const cards = RES.filter((r) => P.res[r]).map((r) => `<div class="cd" style="background:${RINFO[r].c}"><span class="e">${RINFO[r].e}</span><span class="n">${P.res[r]}</span></div>`).join('');
  const devs = P.dev.map((d) => `<div class="cd dev"><span class="e">${DEV[d.t].e}</span></div>`).join('');
  return `<button id="hand" data-a="hand">${cards || (devs ? '' : '<span class="empty">Sin cartas</span>')}${cards && devs ? '<span class="gap"></span>' : ''}${devs}${n ? `<span class="tot">${n}</span>` : ''}</button>`;
}
function handOpenHTML() {
  const G = U.G, P = G.players[U.me];
  return `<div id="veil" data-a="handclose"></div><div id="fantitle">Tu mano · ${sumRes(P.res)} cartas<span>toca fuera para cerrar</span></div>
  <div id="fan">${RES.map((r) => `<div class="bc ${P.res[r] ? '' : 'zero'}" style="background:${RINFO[r].c}"><span class="e">${RINFO[r].e}</span><span class="t">${RINFO[r].n}</span><span class="n">${P.res[r]}</span></div>`).join('')}
  ${P.dev.length ? '<span class="sp"></span>' : ''}${P.dev.map((d, i) => {
    const can = d.t !== 'vp' && canPlayDev(G, U.me, i), fresh = d.bt >= G.turnNum && d.t !== 'vp';
    return `<div class="bc dev"><span class="e">${DEV[d.t].e}</span><span class="t">${DEV[d.t].n}</span><span class="d">${DEV[d.t].d.split('.')[0]}.</span>${d.t === 'vp' ? '<span class="tag">secreta</span>' : can ? `<button class="play" data-a="dev" data-i="${i}">Jugar</button>` : `<span class="tag">${fresh ? 'recién comprada' : 'ahora no'}</span>`}</div>`;
  }).join('')}</div>`;
}
function buildPanel() {
  const G = U.G, me = U.me, P = G.players[me], can = canBuildNow();
  const rows = [['road', '🛤️', 'Camino', COST.road, P.roads > 0 && targets(G, me, 'road').e.length], ['settlement', '🏠', 'Poblado', COST.settlement, P.setts > 0 && targets(G, me, 'settlement').v.length], ['city', '🏰', 'Ciudad', COST.city, P.cities > 0 && targets(G, me, 'city').v.length]];
  if (G.opts.ships) rows.push(['ship', '⛵', 'Barco', COST.ship, P.shipsLeft > 0 && targets(G, me, 'ship').e.length]);
  if (G.opts.ships) rows.push(['upship', '⛵⛵', 'Mejorar barco (2 tramos)', COST.shipUp, G.phase === 'main' && upgradableShips(G, me).length]);
  rows.push(['dev', '🃏', 'Carta de desarrollo', COST.dev, G.deckN > 0]);
  const tag = (ok, room) => (!can ? '' : ok && room ? '<span class="tag y">sí</span>' : ok ? '<span class="tag">sin sitio</span>' : '<span class="tag">falta</span>');
  return `<h3>Construir <button class="x" data-a="panel" data-k="">✕</button></h3><div class="scroll">
    ${rows.map(([k, ic, n, c, room]) => { const ok = afford(G, me, c); return `<button class="br ${can && ok && room ? 'ok' : 'no'}" data-a="brow" data-k="${k}" ${can && ok && room ? '' : 'disabled'}><span class="ic">${ic}</span><span class="nm">${n}</span><span class="cost">${costHave(c, P.res)}</span>${tag(ok, room)}</button>`; }).join('')}
    ${G.opts.ships && can && G.phase === 'main' && targets(G, me, 'move').e.length ? '<div class="note">⛵ Tus barcos navegan gratis: 1 tramo por turno, 2 si están mejorados. Toca uno azul en el mapa. Para mejorar un barco tiene que estar atracado en un poblado o ciudad tuya.</div>' : ''}
    <div class="note">${can ? 'Toca una fila para ver solo esos sitios en el mapa.' : 'Solo puedes construir en tu turno, después de tirar.'}<br>Te quedan ${P.roads} caminos · ${P.setts} poblados · ${P.cities} ciudades${G.opts.ships ? ` · ${P.shipsLeft} barcos` : ''} · ${G.deckN} cartas en el mazo</div>
    <div class="note">Poblado 1 pt · Ciudad 2 pts · Camino más largo (5+) 2 pts · Mayor ejército (3+ ⚔️) 2 pts${G.opts.ships ? ' · Isla nueva +1 pt' : ''}</div></div>`;
}
function counter(obj, key, max) {
  return `<div class="cnt">${RES.map((r) => `<div class="c ${obj[r] ? '' : 'z'}" style="background:${RINFO[r].c}"><button class="up" data-a="cnt" data-k="${key}" data-r="${r}" data-d="1" ${max && (obj[r] || 0) >= max[r] ? 'disabled' : ''}><span>${RINFO[r].e}</span>${obj[r] || 0}</button><button class="dn" data-a="cnt" data-k="${key}" data-r="${r}" data-d="-1" ${(obj[r] || 0) <= 0 ? 'disabled' : ''}>−</button></div>`).join('')}</div>`;
}
function tradePanel() {
  const G = U.G, me = U.me, P = G.players[me], O = G.offer, myTurn = G.turn === me && G.phase === 'main' && G.winner === null;
  const to = U.tradeTo, Q = to !== null ? G.players[to] : null;
  let o = `<h3>${Q ? `<span class="chip" style="background:${Q.color}"></span>Con ${esc(Q.name)}` : 'Comerciar'} <button class="x" data-a="panel" data-k="">✕</button></h3><div class="scroll">`;
  // a quién
  o += `<div class="who">${[null, ...G.players.map((_, i) => i).filter((i) => i !== me)].map((i) => `<button class="${to === i ? 'on' : ''}" data-a="tto" data-q="${i === null ? '' : i}">${i === null ? 'Todos' : `<span class="chip" style="background:${G.players[i].color}"></span>${esc(G.players[i].name)}`}</button>`).join('')}</div>`;
  if (Q && G.opts.openHands) o += `<div class="note">Tiene ${RES.map((r) => RINFO[r].e + Q.res[r]).join(' ')}</div>`;
  else if (Q) o += `<div class="note">Tiene 🂠 ${Q.n} cartas</div>`;
  if (O && O.from !== me) {
    const mineO = O.to == null || O.to === me, can = RES.every((r) => P.res[r] >= O.want[r]);
    o += `<div class="offer"><b>${esc(G.players[O.from].name)}</b> ${O.to != null ? (O.to === me ? 'te' : 'le ofrece a ' + esc(G.players[O.to].name)) : 'ofrece a todos'} ${O.to === me ? 'ofrece' : ''} <b>${fmt(O.give)}</b> por <b>${fmt(O.want)}</b>
      ${mineO ? (O.acc[me] ? '<div class="note">✅ Has aceptado: falta que confirme</div>' : O.rej[me] ? '<div class="note">❌ Has rechazado</div>' : `<div class="row"><button data-a="respond" data-y="0">Rechazar</button><button class="primary" data-a="respond" data-y="1" ${can ? '' : 'disabled'}>${can ? 'Aceptar' : 'No lo tienes'}</button></div>`) : ''}</div>`;
  }
  if (O && O.from === me) {
    o += `<div class="offer"><b>Tu oferta${O.to != null ? ' a ' + esc(G.players[O.to].name) : ''}:</b> das ${fmt(O.give)} por ${fmt(O.want)}`;
    G.players.forEach((R, i) => { if (i === me || (O.to != null && O.to !== i)) return; const s = O.acc[i] ? 'acepta' : O.rej[i] ? 'rechaza' : 'pensando…'; o += `<div class="r"><span class="chip" style="background:${R.color}"></span>${esc(R.name)} <span class="m">${s}</span>${O.acc[i] ? `<button class="primary" data-a="deal" data-q="${i}">Cerrar trato</button>` : ''}</div>`; });
    o += `<button class="ghost" style="width:100%;margin-top:6px" data-a="canceloffer">Retirar oferta</button></div>`;
  }
  if (!myTurn) return o + `<div class="note">Puedes proponer tratos y cambiar con el banco en tu turno, después de tirar. Si alguien te ofrece algo, te saldrá aquí y en el aviso.</div></div>`;
  if (!O) {
    const t = U.trade, ok = sumRes(t.give) && sumRes(t.want);
    o += `<div class="lb">Das</div>${counter(t.give, 'give', P.res)}<div class="lb">Pides</div>${counter(t.want, 'want', null)}
      <button class="primary wide" data-a="offer" ${ok ? '' : 'disabled'}>${Q ? 'Enviar a ' + esc(Q.name) : 'Ofrecer a todos'}</button>`;
  }
  const bk = U.bank;
  o += `<div class="lb">Banco y puertos</div><div class="pick">${RES.map((r) => { const k = rate(G, me, r); return `<button class="${bk.give === r ? 'on' : ''}" data-a="bgive" data-r="${r}" ${P.res[r] >= k ? '' : 'disabled'}><span>${RINFO[r].e}</span>${k}:1</button>`; }).join('')}</div>
    <div class="pick">${RES.map((r) => `<button class="${bk.get === r ? 'on' : ''}" data-a="bget" data-r="${r}" ${G.bank[r] > 0 && r !== bk.give ? '' : 'disabled'}><span>${RINFO[r].e}</span>→1</button>`).join('')}</div>
    <button class="primary wide" data-a="bankdo" ${bk.give && bk.get && bk.give !== bk.get ? '' : 'disabled'}>Cambiar ${bk.give ? rate(G, me, bk.give) + RINFO[bk.give].e : ''} ${bk.get ? '→ 1' + RINFO[bk.get].e : ''}</button></div>`;
  return o;
}
function menuPanel() {
  const G = U.G;
  return `<h3>Partida <button class="x" data-a="panel" data-k="">✕</button></h3><div class="scroll">
    ${G.players.map((Q, i) => `<div class="pl ${i === G.turn ? 'cur' : ''}"><span class="chip" style="background:${Q.color}"></span><span class="nm">${esc(Q.name)}${i === U.me ? ' (tú)' : ''}${G.longest === i ? ' 🛣️' : ''}${G.army === i ? ' ⚔️' : ''}</span><span class="st">${G.opts.openHands && Q.res ? RES.map((r) => RINFO[r].e + Q.res[r]).join(' ') : '🂠' + Q.n} 📜${Q.devN} ⚔️${Q.knights} 🛤️${G.roadLens[i]}${G.opts.ships ? ' 🏝️' + Object.values(G.islandClaim || {}).filter((x) => x === i).length : ''}</span><span class="vp">${i === U.me ? vp(G, i, true) : Q.vp}</span></div>`).join('')}
    <div class="note">Meta: ${G.opts.target} puntos · Banco: ${RES.map((r) => `${RINFO[r].e}${G.bank[r]}`).join(' ')}</div>
    <div class="row" style="margin:8px 0"><button data-a="zfit">⤢ Centrar mapa</button>${EMBED ? (G.winner !== null ? '<button class="primary" data-a="selfagain">Otra partida</button>' : '') : ''}<button data-a="gohome" class="ghost">🏠 Inicio</button></div>
    ${EMBED ? `<div class="note">Sala <b>${esc(U.code)}</b> · ${navigator.share ? '<a href="#" data-a="sharelink">compartir enlace</a>' : '<a href="#" data-a="copylink">copiar enlace</a>'} (por si alguien se reconecta desde otro móvil)</div>` : ''}
    <div class="row" style="margin:0 0 8px"><button data-a="sfx">${sound.sfxOn ? '🔊 Efectos sí' : '🔈 Efectos no'}</button><button data-a="music">${sound.musicOn ? '🎵 Música sí' : '🔇 Música no'}</button></div>
    ${relay ? '<div class="note">🔁 Este móvil lleva ahora la partida: si puedes, no cierres la página.</div>' : ''}
    <div class="lb">Registro</div><div class="log">${G.log.map((l) => `<div>${l}</div>`).join('')}</div>
    ${EMBED ? '' : `<div class="note"><a href="jugar-clasico.html${location.search}">Usar el mando clásico</a></div>`}</div>`;
}
function modalHTML() {
  const G = U.G; if (U.screen !== 'game' || !G) return '';
  const me = U.me, P = G.players[me];
  const box = (inner) => `<div class="modal"><div class="box">${inner}</div></div>`;
  if (G.winner !== null && !U.winSeen) {
    const order = G.players.map((_, i) => i).sort((a, b) => G.players[b].vp - G.players[a].vp);
    return box(`<h2>🏆 ${G.winner === me ? '¡Has ganado!' : '¡' + esc(G.players[G.winner].name) + ' gana!'}</h2>${order.map((i) => `<div class="pl"><span class="chip" style="background:${G.players[i].color}"></span><span class="nm">${esc(G.players[i].name)}</span><span class="vp">${G.players[i].vp}</span></div>`).join('')}${EMBED ? '<button class="primary big" data-a="selfagain">🔁 Otra partida con los mismos</button><div class="note" style="text-align:center">Podrán unirse más con el mismo código antes de empezar.</div>' : ''}
    <div class="row"><button class="ghost" data-a="winok">Ver el mapa</button><button class="${EMBED ? 'ghost' : 'primary'}" data-a="gohome">🏠 Salir al inicio</button></div>`);
  }
  if (G.phase === 'discard' && G.discardQueue.includes(me)) {
    U.disc = U.disc || {};
    const tot = sumRes(P.res), need = Math.floor(tot / 2), sum = sumRes(U.disc);
    return box(`<h2>🦹 Ha salido un 7</h2><p>Tienes ${tot} cartas: toca ${need} para devolverlas.</p>
      <div class="fanm">${RES.map((r) => `<button class="bc ${P.res[r] - (U.disc[r] || 0) ? '' : 'zero'}" style="background:${RINFO[r].c}" data-a="cnt" data-k="disc" data-r="${r}" data-d="1" ${P.res[r] - (U.disc[r] || 0) > 0 && sum < need ? '' : 'disabled'}><span class="e">${RINFO[r].e}</span><span class="t">te quedan</span><span class="n">${P.res[r] - (U.disc[r] || 0)}</span>${U.disc[r] ? `<span class="out">−${U.disc[r]}</span>` : ''}</button>`).join('')}</div>
      <div class="row"><button class="ghost" data-a="discreset" ${sum ? '' : 'disabled'}>Deshacer</button><button class="primary" data-a="discard" ${sum === need ? '' : 'disabled'}>Devolver ${sum}/${need}</button></div>`);
  }
  if (G.phase === 'steal' && G.turn === me) {
    const hands = U.S.stealHands, cands = G.stealCands;
    const q = hands ? (cands.length === 1 ? cands[0] : U.stealQ) : null;
    if (hands && q !== null && q !== undefined && hands[q]) {
      const H = hands[q];
      return box(`<h2>⚔️ Robas a ${esc(G.players[q].name)}</h2><p>Con el caballero ves su mano: toca la carta que te llevas.</p>
        <div class="fanm">${RES.map((r) => `<button class="bc ${H[r] ? '' : 'zero'}" style="background:${RINFO[r].c}" data-a="steal" data-q="${q}" data-r="${r}" ${H[r] ? '' : 'disabled'}><span class="e">${RINFO[r].e}</span><span class="t">${RINFO[r].n}</span><span class="n">${H[r]}</span></button>`).join('')}</div>
        ${cands.length > 1 ? '<button class="ghost wide" data-a="stealback">← Elegir otro jugador</button>' : ''}`);
    }
    return box(`<h2>¿A quién robas?</h2><p>${hands ? 'Con el caballero verás su mano y eliges la carta.' : 'Te llevas una carta al azar.'}</p><div class="row">${cands.map((c) => `<button data-a="${hands ? 'stealq' : 'steal'}" data-q="${c}"><span class="chip" style="background:${G.players[c].color}"></span> ${esc(G.players[c].name)} (${G.players[c].n})</button>`).join('')}</div>`);
  }
  if (U.modal && U.modal.t === 'plenty') {
    const pk = U.modal.pick;
    return box(`<h2>🎁 Año de abundancia</h2><p>Elige 2 recursos: ${pk.map((r) => RINFO[r].e).join(' ') || '—'}</p><div class="pick">${RES.map((r) => `<button data-a="pk" data-r="${r}" ${pk.length < 2 && G.bank[r] > pk.filter((x) => x === r).length ? '' : 'disabled'}><span>${RINFO[r].e}</span>${RINFO[r].n}</button>`).join('')}</div>
      <div class="row"><button class="ghost" data-a="mclose">Cancelar</button><button class="primary" data-a="pkok" ${pk.length === 2 ? '' : 'disabled'}>Coger</button></div>`);
  }
  if (U.modal && U.modal.t === 'pirate') return box(`<h2>🏴‍☠️ Pirata</h2><p>Asalta los barcos de un jugador y róbale 2 recursos.</p><div class="row">${pirateTargets(G, me).map((q) => `<button data-a="pirq" data-q="${q}"><span class="chip" style="background:${G.players[q].color}"></span> ${esc(G.players[q].name)} (${G.players[q].n})</button>`).join('')}</div><button class="ghost wide" data-a="mclose">Cancelar</button>`);
  if (U.modal && U.modal.t === 'mono') return box(`<h2>💰 Monopolio</h2><p>Todos te darán todas las cartas de ese recurso.</p><div class="pick">${RES.map((r) => `<button data-a="mono" data-r="${r}"><span>${RINFO[r].e}</span>${RINFO[r].n}</button>`).join('')}</div><button class="ghost wide" data-a="mclose">Cancelar</button>`);
  const O = G.offer;
  if (O && O.from !== me && (O.to == null || O.to === me) && !O.acc[me] && !O.rej[me] && U.seenOffer !== O.id && U.panel !== 'trade') {
    const can = RES.every((r) => P.res[r] >= O.want[r]);
    return box(`<h2>🤝 ${esc(G.players[O.from].name)} ${O.to === me ? 'te propone' : 'propone a todos'}</h2><p>Te da <b>${fmt(O.give)}</b> a cambio de <b>${fmt(O.want)}</b>.</p><div class="row"><button data-a="respond" data-y="0">Rechazar</button><button class="primary" data-a="respond" data-y="1" ${can ? '' : 'disabled'}>${can ? 'Aceptar' : 'No lo tienes'}</button></div><button class="ghost wide" data-a="later">Decidir luego</button>`);
  }
  return '';
}

/* ---------- eventos ---------- */
document.addEventListener('input', (e) => {
  if (e.target.id === 'name') U.name = e.target.value;
  if (e.target.id === 'code') { U.code = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); e.target.value = U.code; }
});
document.addEventListener('click', (e) => {
  sound.unlock(); // los navegadores solo dejan sonar después de tocar la pantalla
  const t = e.target.closest('[data-a]'); if (!t || t.disabled) return;
  const d = t.dataset, G = U.G;
  switch (d.a) {
    case 'color': U.color = d.c; store.set('colonos-color', U.color); if (U.screen === 'lobby' && net) net.send({ t: 'hello', token: token(), name: U.name, color: U.color }); render(); break;
    case 'join':
      U.name = ($('#name').value || '').trim(); U.code = ($('#code').value || '').toUpperCase();
      if (U.code.length !== 4) { U.msg = 'El código tiene 4 letras'; render(); break; }
      if (!U.name) { U.msg = 'Pon tu nombre'; render(); break; }
      U.msg = ''; connect(); break;
    case 'leave': net && net.send({ t: 'leave' }); net && net.close(); net = null; U.screen = 'join'; U.status = 'idle'; render(); break;
    case 'leavegame': net && net.close(); net = null; U.screen = 'join'; U.status = 'idle'; render(); break;
    case 'panel': U.panel = d.k && U.panel !== d.k ? d.k : null; U.sel = null; U.handOpen = false; if (U.panel === 'trade' && G && G.offer) U.seenOffer = G.offer.id; render(); break;
    case 'rival': U.tradeTo = +d.q; U.panel = 'trade'; U.sel = null; if (G && G.offer) U.seenOffer = G.offer.id; render(); break;
    case 'tto': U.tradeTo = d.q === '' ? null : +d.q; render(); break;
    case 'hand': U.handOpen = true; U.panel = null; U.sel = null; render(); break;
    case 'handclose': U.handOpen = false; render(); break;
    case 'roll': send({ t: 'roll' }); break;
    case 'end': send({ t: 'end' }); U.mode = null; U.sel = null; U.panel = null; break;
    case 'pass': send({ t: 'pass' }); U.mode = null; U.sel = null; break;
    case 'brow':
      if (d.k === 'dev') { send({ t: 'buyDev' }); break; }
      U.mode = d.k; U.panel = null; U.sel = null; render(); break;
    case 'cancelmode': U.mode = null; U.sel = null; render(); break;
    case 'do': {
      const o = optionsFor(U.sel)[+d.i]; U.sel = null;
      if (o) { send(o.a); if (G.phase !== 'roadbuild') U.mode = null; }
      render(); break;
    }
    case 'dev': {
      const card = G.players[U.me].dev[+d.i]; U.handOpen = false;
      if (card.t === 'plenty') U.modal = { t: 'plenty', i: +d.i, pick: [] };
      else if (card.t === 'mono') U.modal = { t: 'mono', i: +d.i };
      else if (card.t === 'pirate') U.modal = { t: 'pirate', i: +d.i };
      else send({ t: 'playDev', i: +d.i });
      render(); break;
    }
    case 'pk': U.modal.pick.push(d.r); render(); break;
    case 'pkok': send({ t: 'playDev', i: U.modal.i, list: U.modal.pick }); U.modal = null; render(); break;
    case 'mono': send({ t: 'playDev', i: U.modal.i, r: d.r }); U.modal = null; render(); break;
    case 'mclose': U.modal = null; render(); break;
    case 'pirq': send({ t: 'playDev', i: U.modal.i, q: +d.q }); U.modal = null; render(); break;
    case 'cnt': {
      const o = d.k === 'disc' ? (U.disc = U.disc || {}) : U.trade[d.k];
      o[d.r] = Math.max(0, (o[d.r] || 0) + +d.d); render(); break;
    }
    case 'discreset': U.disc = {}; render(); break;
    case 'discard': send({ t: 'discard', sel: U.disc || {} }); U.disc = {}; break;
    case 'stealq': U.stealQ = +d.q; render(); break;
    case 'stealback': U.stealQ = null; render(); break;
    case 'steal': send(d.r ? { t: 'steal', q: +d.q, r: d.r } : { t: 'steal', q: +d.q }); break;
    case 'bgive': U.bank.give = d.r; if (U.bank.get === d.r) U.bank.get = null; render(); break;
    case 'bget': U.bank.get = d.r; render(); break;
    case 'bankdo': send({ t: 'bank', give: U.bank.give, get: U.bank.get }); U.bank = { give: null, get: null }; break;
    case 'offer': send(U.tradeTo !== null ? { t: 'offer', give: U.trade.give, want: U.trade.want, to: U.tradeTo } : { t: 'offer', give: U.trade.give, want: U.trade.want }); U.trade = { give: {}, want: {} }; break;
    case 'respond': send({ t: 'respond', yes: d.y === '1', id: G.offer && G.offer.id }); if (G.offer) U.seenOffer = G.offer.id; break;
    case 'later': U.seenOffer = G.offer.id; render(); break;
    case 'deal': send({ t: 'confirm', q: +d.q }); break;
    case 'canceloffer': send({ t: 'cancelOffer' }); break;
    case 'winok': U.winSeen = true; render(); break;
    case 'gohome':
      if (EMBED) { if (U.G && U.G.winner === null && !confirm('¿Cerrar la partida para todos y volver al inicio?')) break; post('home'); }
      else { if (U.G && U.G.winner === null && !confirm('¿Salir de la partida?')) break; net && net.close(); location.href = 'index.html' + (LOCAL ? '?local=1' : ''); }
      break;
    case 'addbot': post('addbot'); break;
    case 'rmbot': post('rmbot', { i: +d.i }); break;
    case 'selfgo': post('go'); break;
    case 'selfagain': U.winSeen = false; post('again'); break;
    case 'sharelink': e.preventDefault(); navigator.share({ title: 'Catán', text: `¡Únete a mi partida de Catán! Código ${U.code}`, url: friendURL() }).catch(() => {}); break;
    case 'copylink': e.preventDefault(); navigator.clipboard.writeText(friendURL()).then(() => toast('Enlace copiado'), () => toast(friendURL())); break;
    case 'sfx': sound.unlock(); sound.setSfx(!sound.sfxOn); render(); break;
    case 'music': sound.unlock(); sound.setMusic(!sound.musicOn); render(); break;
    case 'zfit': b3 && b3.setView(0, true); U.panel = null; render(); break;
  }
});
addEventListener('resize', () => { if (U.screen === 'game') render(); });
addEventListener('message', (e) => {
  const v = e.data && e.data.colonosInsets; if (!v || e.source !== window.parent) return;
  const st = document.documentElement.style; ['t', 'r', 'b', 'l'].forEach((k) => st.setProperty('--sa' + k, (v[k] || 0) + 'px'));
});
if (EMBED) post('insets');

// entrar directamente si ya estábamos en esta sala
if (U.code && U.name && (EMBED || store.get('colonos-token-' + U.code, null))) connect();
render();
window.__client = U; window.__send = send; window.__relayOn = () => !!relay; window.__b3 = () => b3; window.__opts = optionsFor;
