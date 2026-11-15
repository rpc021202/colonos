// Mando del jugador (móvil): mano, construir, mapa con zoom, comercio.
import { RES, RINFO, COST, DEV, COLORS, esc, fmt, mirror, targets, afford, anyRoadSpot, anySettSpot, anyCitySpot, canPlayDev, rate, actor, vp, isRevealed, canRoadE, pirateTargets } from './engine.js';
import { joinRoom } from './net.js';
import { Board3D } from './board3d.js';

const $ = (s) => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const LOCAL = qs.has('local');
// en modo prueba (?local=1) cada pestaña es un jugador distinto
const ST = () => (LOCAL ? sessionStorage : localStorage);
const store = { get(k, d) { try { const v = ST().getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { ST().setItem(k, JSON.stringify(v)); } catch (e) {} } };

const U = {
  screen: 'join', code: (qs.get('sala') || store.get('colonos-lastcode', '') || '').toUpperCase(), name: store.get('colonos-name', ''), color: store.get('colonos-color', COLORS[1].c),
  status: 'idle', lobby: null, B: null, S: null, G: null, me: -1, tab: 'hand', mode: null, sel: null, vb: null, modal: null,
  trade: { give: {}, want: {} }, bank: { give: null, get: null }, seenOffer: 0, autoKey: '', msg: '',
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
function send(a) { if (!net || !net.send({ t: 'act', a })) toast('Sin conexión con la pantalla'); else if (U.status !== 'open') toast('Se enviará en cuanto vuelva la conexión'); }
const cost = (c) => Object.entries(c).map(([r, n]) => RINFO[r].e.repeat(n)).join('');

/* ---------- conexión ---------- */
// el aviso rojo solo sale si la desconexión dura más de 5 s (al desbloquear el móvil se recupera antes)
let lostSince = 0, lostTimer = null;
function lostBanner() {
  const bad = U.status !== 'open' && U.screen !== 'join';
  if (!bad) { lostSince = 0; clearTimeout(lostTimer); lostTimer = null; $('#lost') && $('#lost').remove(); return; }
  if (!lostSince) lostSince = Date.now();
  if (Date.now() - lostSince > 5000) { if (!$('#lost')) document.body.insertAdjacentHTML('beforeend', `<div class="lost" id="lost">Reconectando con la pantalla<span class="dots"></span></div>`); }
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
  }, token());
}
function onMsg(m) {
  switch (m.t) {
    case 'lobby': U.lobby = m; U.me = m.you; if (U.screen !== 'game') U.screen = 'lobby'; U.msg = ''; render(); break;
    case 'start': { const again = U.screen === 'game' && U.B && U.B.hexes.length === m.b.hexes.length; U.B = m.b; U.me = m.you; if (!again) { U.screen = 'game'; U.mode = null; U.sel = null; U.tab = 'hand'; U.needBoard = true; } render(); break; }
    case 'state': {
      U.S = m.s; U.G = mirror(U.B, m.s);
      if (U.sel && !stillTarget()) U.sel = null;
      sync3D(); autoTab(); render(); break;
    }
    case 'note': toast(m.m); break;
    case 'err': toast('⚠️ ' + m.m); break;
    case 'yourturn': try { navigator.vibrate && navigator.vibrate([120, 60, 120]); } catch (e) {} toast(m.sbp ? '🔨 Puedes construir (fase extra)' : '¡Te toca!'); break;
    case 'full': U.screen = 'join'; U.msg = m.m; net && net.close(); net = null; render(); break;
    case 'reset': U.screen = 'lobby'; U.S = null; U.G = null; U.B = null; U.modal = null; U.needBoard = true; render(); break;
  }
}
function stillTarget() { const T = curTargets(); return U.sel && (T[U.sel.k] || []).includes(U.sel.id); }
function curTargets() { if (!U.G) return { v: [], e: [], h: [] }; return targets(U.G, U.me, U.mode); }
function autoTab() {
  const G = U.G; if (!G) return;
  const mine = (G.phase === 'setup' && actor(G) === U.me) || (G.phase === 'robber' && G.turn === U.me) || (G.phase === 'roadbuild' && G.turn === U.me);
  const key = mine ? G.phase + G.setupIdx + G.turnNum + (G.setupSub || '') : '';
  if (mine && key !== U.autoKey) { U.tab = 'map'; U.sel = null; }
  U.autoKey = key;
  if (U.mode && !(['main', 'sbp'].includes(G.phase) && actor(G) === U.me)) U.mode = null;
  if (U.mode === 'move' && !targets(G, U.me, 'move').e.length) U.mode = null;
}

/* ---------- mapa 3D persistente ---------- */
const mapHost = document.createElement('div');
mapHost.style.cssText = 'position:absolute;inset:0';
let b3 = null, prevRev = {};
function ensure3D() {
  if (!b3) {
    b3 = new Board3D(mapHost, { mobile: true });
    b3.onPick = (sel) => { U.sel = sel; render(); };
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
  const keepScroll = $('.body') ? $('.body').scrollTop : 0;
  if (U.screen === 'join') app.innerHTML = joinHTML();
  else if (U.screen === 'lobby') app.innerHTML = lobbyHTML();
  else if (U.screen === 'game' && U.G) app.innerHTML = gameHTML();
  else app.innerHTML = '<div class="wait">Cargando partida<span class="dots"></span></div>';
  const b = $('.body'); if (b && U.tab !== 'map') b.scrollTop = keepScroll;
  if (U.screen === 'game' && U.tab === 'map' && U.S) {
    ensure3D();
    $('#mapslot').appendChild(mapHost);
    b3.setActive(true); b3.resize();
    b3.setTargets(curTargets(), U.sel, U.G.players[U.me].color, U.mode === 'ship' || U.mode === 'move' ? 'ship' : 'road');
  } else if (b3) b3.setActive(false);
  $('#modal').innerHTML = modalHTML();
  lostBanner();
}
function swatches(taken) {
  return `<div class="sw">${COLORS.map((c) => `<button style="background:${c.c}" class="${U.color === c.c ? 'sel' : ''}" data-a="color" data-c="${c.c}" title="${c.n}" ${taken.includes(c.c) && U.color !== c.c ? 'disabled' : ''}></button>`).join('')}</div>`;
}
function joinHTML() {
  const busy = U.status === 'connecting' && !U.msg;
  return `<div class="join"><h1>⬡ Colonos</h1><div class="note" style="margin-bottom:8px">Únete a la partida que se ve en la pantalla.</div>
    <label class="lbl">Código de la sala</label><input class="code" id="code" maxlength="4" value="${esc(U.code)}" autocomplete="off" autocapitalize="characters">
    <label class="lbl">Tu nombre</label><input id="name" maxlength="16" value="${esc(U.name)}" placeholder="¿Cómo te llamas?">
    <label class="lbl">Tu color</label>${swatches([])}
    <button class="primary big" data-a="join" ${busy ? 'disabled' : ''}>${busy ? 'Conectando…' : 'Unirme'}</button>
    ${U.msg ? `<div class="note" style="color:#b3261e;font-weight:600">${esc(U.msg)}</div>` : ''}</div>`;
}
function lobbyHTML() {
  const L = U.lobby || { players: [] }, taken = L.players.filter((_, i) => i !== U.me).map((p) => p.color);
  return `<div class="join"><h1>¡Dentro!</h1><div class="note">Sala <b>${esc(U.code)}</b>. Esperando a que la pantalla empiece la partida<span class="dots"></span></div>
    <label class="lbl">Jugadores</label>${L.players.map((p, i) => `<div class="lp"><span class="chip" style="background:${p.color}"></span>${esc(p.name)}${i === U.me ? ' <small style="color:var(--muted);margin-left:auto">tú</small>' : ''}</div>`).join('')}
    <label class="lbl">Tu color</label>${swatches(taken)}
    ${L.cfg ? `<div class="note">Mapa de ${L.cfg.N} hexágonos · ${L.cfg.fog ? 'a ciegas' : 'visible'} · ${L.cfg.target} puntos</div>` : ''}
    <button class="ghost big" data-a="leave">Salir de la sala</button></div>`;
}
function phaseLine(G) {
  if (G.winner !== null) return `🏆 ¡${esc(G.players[G.winner].name)} gana!`;
  const me = U.me, a = actor(G), mine = a === me;
  switch (G.phase) {
    case 'setup': return mine ? (G.setupSub === 'settlement' ? 'Coloca un poblado en el mapa' : 'Coloca un camino junto al poblado') : `${esc(G.players[a].name)} está colocando`;
    case 'roll': return mine ? 'Te toca: tira los dados' : 'Tirando los dados';
    case 'discard': return G.discardQueue.includes(me) ? 'Tienes que descartar' : 'Esperando descartes';
    case 'robber': return G.turn === me ? 'Mueve el ladrón en el mapa' : 'Moviendo el ladrón';
    case 'steal': return G.turn === me ? 'Elige a quién robar' : 'Eligiendo a quién robar';
    case 'roadbuild': return mine ? (G.opts.ships ? `${G.rbLeft} tramo${G.rbLeft > 1 ? 's' : ''} gratis: camino o navegar` : `Coloca ${G.rbLeft} camino${G.rbLeft > 1 ? 's' : ''} gratis`) : 'Construyendo caminos';
    case 'sbp': return mine ? '🔨 Construcción extra: puedes construir' : `Construcción extra: ${esc(G.players[a].name)}`;
    default: return mine ? 'Construye, comercia o pasa' : 'Jugando su turno';
  }
}
function gameHTML() {
  const G = U.G, T = G.players[G.turn], me = G.players[U.me];
  const dice = G.dice ? `<div class="mini"><div class="d">${G.dice[0]}</div><div class="d" style="color:#c62828">${G.dice[1]}</div></div>` : '';
  const offerDot = G.offer && G.offer.from !== U.me && !G.offer.acc[U.me] && !G.offer.rej[U.me];
  return `<div class="top"><span class="chip" style="background:${T.color};width:20px;height:20px"></span><div class="grow"><div class="who">${G.turn === U.me ? 'Tu turno' : esc(T.name)}</div><div class="what">${phaseLine(G)}</div></div>${dice}<span class="myvp" title="Tus puntos">⭐${vp(G, U.me, true)}</span><span class="net ${U.status === 'open' ? '' : 'bad'}"></span></div>
    <div class="body ${U.tab === 'map' ? 'mapmode' : ''}">${U.tab === 'hand' ? handTab() : U.tab === 'map' ? mapTab() : U.tab === 'trade' ? tradeTab() : infoTab()}</div>
    <div class="dock">${dockHTML()}</div>
    <div class="tabs">
      ${[['hand', '🃏', 'Mano'], ['map', '🗺️', 'Mapa'], ['trade', '🤝', 'Comercio'], ['info', '📋', 'Partida']].map(([k, i, l]) => `<button class="${U.tab === k ? 'cur' : ''}" data-a="tab" data-k="${k}"><span class="i">${i}</span>${l}${k === 'trade' && offerDot ? '<span class="dot"></span>' : ''}</button>`).join('')}
    </div>`;
}
function dockHTML() {
  const G = U.G, me = U.me;
  if (G.winner !== null) return '';
  if (U.sel) {
    const what = U.sel.k === 'h' ? 'Mover el ladrón aquí' : U.sel.k === 'e' ? (U.mode === 'ship' ? 'Botar barco aquí' : U.mode === 'move' || (G.phase === 'roadbuild' && !canRoadE(G, me, U.sel.id)) ? 'Navegar aquí' : 'Poner camino aquí') : (U.mode === 'city' ? 'Mejorar a ciudad' : 'Poner poblado aquí');
    return `<button class="ghost" data-a="unsel">Cancelar</button><button class="primary" data-a="confirm">✓ ${what}</button>`;
  }
  if (U.mode) return `<button class="ghost" data-a="cancelmode">Cancelar construcción</button>`;
  if (G.phase === 'roll' && G.turn === me) return `<button class="primary" data-a="roll">🎲 Tirar dados</button>`;
  if (G.phase === 'main' && G.turn === me) return `<button class="primary" data-a="end">Pasar turno ➜</button>`;
  if (G.phase === 'sbp' && actor(G) === me) return `<button class="primary" data-a="pass">Terminar construcción extra ➜</button>`;
  return '';
}
function handTab() {
  const G = U.G, P = G.players[U.me], p = U.me;
  const canB = ['main', 'sbp'].includes(G.phase) && actor(G) === p && G.winner === null;
  const b = (k, label, c, ok) => `<button data-a="build" data-k="${k}" ${ok ? '' : 'disabled'}><span>${label}</span><span class="cost">${cost(c)}</span></button>`;
  let o = `<div class="sec"><h3><span>Tus recursos · ${RES.reduce((s, r) => s + P.res[r], 0)}</span></h3><div class="hand">${RES.map((r) => `<div class="rc ${P.res[r] ? '' : 'zero'}" style="background:${RINFO[r].c}"><span class="e">${RINFO[r].e}</span><span class="n">${P.res[r]}</span><span class="t">${RINFO[r].n}</span></div>`).join('')}</div></div>`;
  o += `<div class="sec"><h3>Construir</h3><div class="acts">
    ${b('road', 'Camino', COST.road, canB && afford(G, p, COST.road) && P.roads > 0 && anyRoadSpot(G, p))}
    ${b('settlement', 'Poblado', COST.settlement, canB && afford(G, p, COST.settlement) && P.setts > 0 && anySettSpot(G, p))}
    ${b('city', 'Ciudad', COST.city, canB && afford(G, p, COST.city) && P.cities > 0 && anyCitySpot(G, p))}
    <button data-a="buydev" ${canB && afford(G, p, COST.dev) && G.deckN > 0 ? '' : 'disabled'}><span>Carta de desarrollo</span><span class="cost">${cost(COST.dev)}</span></button>
    ${G.opts.ships ? `${b('ship', '⛵ Barco', COST.ship, canB && afford(G, p, COST.ship) && P.shipsLeft > 0 && targets(G, p, 'ship').e.length)}
    <button data-a="build" data-k="move" ${G.phase === 'main' && G.turn === p && targets(G, p, 'move').e.length ? '' : 'disabled'}><span>🧭 Navegar</span><span class="cost">1 tramo gratis por barco</span></button>` : ''}</div>
    <div class="note">Te quedan ${P.roads} caminos · ${P.setts} poblados · ${P.cities} ciudades${G.opts.ships ? ` · ${P.shipsLeft} barcos` : ''} · ${G.deckN} cartas en el mazo</div></div>`;
  o += `<div class="sec"><h3>Cartas de desarrollo · ${P.dev.length}</h3>${P.dev.length ? P.dev.map((d, i) => `<div class="dev"><span style="font-size:24px">${DEV[d.t].e}</span><span class="t">${DEV[d.t].n}<small>${DEV[d.t].d}${d.bt >= G.turnNum && d.t !== 'vp' ? ' · Recién comprada' : ''}</small></span>${d.t !== 'vp' ? `<button data-a="dev" data-i="${i}" ${canPlayDev(G, p, i) ? '' : 'disabled'}>Jugar</button>` : ''}</div>`).join('') : '<div class="note">Aún no tienes ninguna.</div>'}</div>`;
  o += `<div class="sec"><h3>Costes de construcción</h3><div class="costs">
    <span>🛤️ Camino</span><span>${cost(COST.road)}</span><span class="pts">camino más largo (5+): 2 pts</span>
    <span>🏠 Poblado</span><span>${cost(COST.settlement)}</span><span class="pts">1 pt</span>
    <span>🏰 Ciudad</span><span>${cost(COST.city)}</span><span class="pts">2 pts</span>
    <span>📜 Carta</span><span>${cost(COST.dev)}</span><span class="pts">?</span>
    ${G.opts.ships ? `<span>⛵ Barco</span><span>${cost(COST.ship)}</span><span class="pts">isla nueva: +1 pt</span>` : ''}</div>
    <div class="note">Gana quien llegue a ${G.opts.target} puntos en su turno. Mayor ejército (3+ caballeros): 2 pts.</div></div>`;
  return o;
}
function mapTab() {
  const G = U.G, T = curTargets();
  let hint = '';
  if (U.mode) hint = { road: 'Toca dónde va el camino', settlement: 'Toca dónde va el poblado', city: 'Toca el poblado que quieres mejorar', ship: 'Toca dónde botas el barco (junto a tu poblado de costa)', move: 'Toca a dónde navega tu barco' }[U.mode];
  else if (T.v.length || T.e.length || T.h.length) hint = phaseLine(G);
  if ((U.mode || G.phase === 'setup' || G.phase === 'roadbuild') && !T.v.length && !T.e.length && !T.h.length && actor(G) === U.me) hint = 'No hay sitio disponible';
  return `<div id="mapslot"></div>${hint ? `<div class="maphint">${hint}</div>` : ''}
    <div class="zoom"><button data-a="zin">+</button><button data-a="zout">−</button><button data-a="zfit">⤢</button></div>`;
}
function counter(obj, key, max, have) {
  return `<div class="cnt">${RES.map((r) => `<div class="c"><div class="e">${RINFO[r].e}</div>${have ? `<div class="note" style="margin:0;font-size:12px">tienes ${have[r]}</div>` : ''}<div class="v">${obj[r] || 0}</div><div class="b"><button data-a="cnt" data-k="${key}" data-r="${r}" data-d="-1" ${(obj[r] || 0) <= 0 ? 'disabled' : ''}>−</button><button data-a="cnt" data-k="${key}" data-r="${r}" data-d="1" ${max && (obj[r] || 0) >= max[r] ? 'disabled' : ''}>+</button></div></div>`).join('')}</div>`;
}
function tradeTab() {
  const G = U.G, p = U.me, P = G.players[p], myTurn = G.turn === p && G.phase === 'main' && G.winner === null, O = G.offer;
  let o = '';
  if (O && O.from !== p) {
    const can = RES.every((r) => P.res[r] >= O.want[r]);
    const st = O.acc[p] ? '✅ Has aceptado: falta que confirme' : O.rej[p] ? '❌ Has rechazado' : '';
    o += `<div class="offer"><b>${esc(G.players[O.from].name)}</b> ofrece <b>${fmt(O.give)}</b> y pide <b>${fmt(O.want)}</b>
      ${st ? `<div class="note">${st}</div>` : ''}<div class="row" style="margin-top:10px"><button data-a="respond" data-y="0">Rechazar</button><button class="primary" data-a="respond" data-y="1" ${can ? '' : 'disabled'}>${can ? 'Aceptar' : 'No tienes lo que pide'}</button></div></div>`;
  }
  if (O && O.from === p) {
    o += `<div class="offer"><b>Tu oferta:</b> das ${fmt(O.give)} por ${fmt(O.want)}`;
    G.players.forEach((Q, i) => { if (i === p) return; const s = O.acc[i] ? 'acepta' : O.rej[i] ? 'rechaza' : 'pensando…'; o += `<div class="r"><span class="chip" style="background:${Q.color}"></span>${esc(Q.name)} <span style="color:var(--muted)">${s}</span>${O.acc[i] ? `<button class="primary" style="margin-left:auto" data-a="deal" data-q="${i}">Cerrar trato</button>` : ''}</div>`; });
    o += `<button class="ghost" style="width:100%;margin-top:8px" data-a="canceloffer">Retirar oferta</button></div>`;
  }
  if (G.opts.openHands) o += `<div class="sec"><h3>Qué tiene cada uno</h3>${G.players.map((Q, i) => i === p ? '' : `<div class="pl"><span class="chip" style="background:${Q.color}"></span><span class="nm">${esc(Q.name)}</span><span class="st" style="font-size:14px">${RES.map((r) => RINFO[r].e + (Q.res ? Q.res[r] : '?')).join(' ')}</span></div>`).join('')}</div>`;
  if (!myTurn) return o + `<div class="sec"><div class="note" style="margin:0">Puedes comerciar con el banco y proponer tratos en tu turno, después de tirar. Cuando otro proponga algo, te aparecerá aquí.</div></div>`;
  const bk = U.bank;
  o += `<div class="sec"><h3>Banco y puertos</h3><b>Das</b><div class="picker">${RES.map((r) => { const k = rate(G, p, r); return `<button class="${bk.give === r ? 'on' : ''}" data-a="bgive" data-r="${r}" ${P.res[r] >= k ? '' : 'disabled'}><span class="e">${RINFO[r].e}</span>${k}:1</button>`; }).join('')}</div>
    <b>Recibes 1</b><div class="picker">${RES.map((r) => `<button class="${bk.get === r ? 'on' : ''}" data-a="bget" data-r="${r}" ${G.bank[r] > 0 && r !== bk.give ? '' : 'disabled'}><span class="e">${RINFO[r].e}</span>${G.bank[r]}</button>`).join('')}</div>
    <button class="primary" style="width:100%" data-a="bankdo" ${bk.give && bk.get && bk.give !== bk.get ? '' : 'disabled'}>Cambiar ${bk.give ? rate(G, p, bk.give) + RINFO[bk.give].e : ''} ${bk.get ? '→ 1' + RINFO[bk.get].e : ''}</button></div>`;
  if (!O) {
    const t = U.trade, gs = RES.reduce((s, r) => s + (t.give[r] || 0), 0), ws = RES.reduce((s, r) => s + (t.want[r] || 0), 0);
    o += `<div class="sec"><h3>Proponer un trato a todos</h3><b>Das</b>${counter(t.give, 'give', P.res)}<b>Pides</b>${counter(t.want, 'want', null)}
      <button class="primary" style="width:100%" data-a="offer" ${gs && ws ? '' : 'disabled'}>Ofrecer a todos</button></div>`;
  }
  return o;
}
function infoTab() {
  const G = U.G;
  return `<div class="sec"><h3>Jugadores · meta ${G.opts.target}</h3>${G.players.map((Q, i) => `<div class="pl ${i === G.turn ? 'cur' : ''}"><span class="chip" style="background:${Q.color}"></span><span class="nm">${esc(Q.name)}${i === U.me ? ' (tú)' : ''}${G.longest === i ? ' 🛣️' : ''}${G.army === i ? ' ⚔️' : ''}</span><span class="st">${G.opts.openHands && Q.res ? RES.map((r) => RINFO[r].e + Q.res[r]).join(' ') + ' ·' : '🃏' + Q.n} 📜${Q.devN} ⚔️${Q.knights} 🛤️${G.roadLens[i]}${G.opts.ships ? ' 🏝️' + Object.values(G.islandClaim || {}).filter((x) => x === i).length : ''}</span><span class="vp">${Q.vp}</span></div>`).join('')}</div>
    <div class="sec"><h3>Banco</h3><div class="row" style="font-weight:600">${RES.map((r) => `<span>${RINFO[r].e} ${G.bank[r]}</span>`).join('')}</div></div>
    <div class="sec"><h3>Registro</h3><div class="log">${G.log.map((l) => `<div>${l}</div>`).join('')}</div></div>
    <button class="ghost" style="width:100%" data-a="leavegame">Salir</button>`;
}
function modalHTML() {
  const G = U.G; if (U.screen !== 'game' || !G) return '';
  const me = U.me, P = G.players[me];
  const box = (inner) => `<div class="modal"><div class="box">${inner}</div></div>`;
  if (G.winner !== null && !U.winSeen) {
    const order = G.players.map((_, i) => i).sort((a, b) => G.players[b].vp - G.players[a].vp);
    return box(`<h2>🏆 ${G.winner === me ? '¡Has ganado!' : '¡' + esc(G.players[G.winner].name) + ' gana!'}</h2>${order.map((i) => `<div class="pl"><span class="chip" style="background:${G.players[i].color}"></span><span class="nm">${esc(G.players[i].name)}</span><span class="vp">${G.players[i].vp}</span></div>`).join('')}<button class="primary big" data-a="winok">Cerrar</button>`);
  }
  if (G.phase === 'discard' && G.discardQueue.includes(me)) {
    U.disc = U.disc || {};
    const need = Math.floor(RES.reduce((s, r) => s + P.res[r], 0) / 2), sum = RES.reduce((s, r) => s + (U.disc[r] || 0), 0);
    return box(`<h2>🦹 Ha salido un 7</h2><p>Tienes ${RES.reduce((s, r) => s + P.res[r], 0)} cartas: elige ${need} para devolver.</p>
      <div class="hand" style="margin-bottom:8px">${RES.map((r) => `<div class="rc ${P.res[r] - (U.disc[r] || 0) ? '' : 'zero'}" style="background:${RINFO[r].c}"><span class="e">${RINFO[r].e}</span><span class="n">${P.res[r] - (U.disc[r] || 0)}</span><span class="t">te quedan</span></div>`).join('')}</div>
      <b>Devuelves</b>${counter(U.disc, 'disc', P.res, P.res)}<button class="primary big" data-a="discard" ${sum === need ? '' : 'disabled'}>Descartar ${sum}/${need}</button>`);
  }
  if (G.phase === 'steal' && G.turn === me) return box(`<h2>¿A quién robas?</h2><p>Te llevas una carta al azar.</p><div class="row">${G.stealCands.map((q) => `<button data-a="steal" data-q="${q}"><span class="chip" style="background:${G.players[q].color}"></span> ${esc(G.players[q].name)} (${G.players[q].n})</button>`).join('')}</div>`);
  if (U.modal && U.modal.t === 'plenty') {
    const pk = U.modal.pick;
    return box(`<h2>🎁 Año de abundancia</h2><p>Elige 2 recursos: ${pk.map((r) => RINFO[r].e).join(' ') || '—'}</p><div class="picker">${RES.map((r) => `<button data-a="pk" data-r="${r}" ${pk.length < 2 && G.bank[r] > pk.filter((x) => x === r).length ? '' : 'disabled'}><span class="e">${RINFO[r].e}</span>${RINFO[r].n}</button>`).join('')}</div>
      <div class="row"><button class="ghost" data-a="mclose">Cancelar</button><button class="primary" data-a="pkok" ${pk.length === 2 ? '' : 'disabled'}>Coger</button></div>`);
  }
  if (U.modal && U.modal.t === 'pirate') return box(`<h2>🏴‍☠️ Pirata</h2><p>Asalta los barcos de un jugador y róbale 2 recursos.</p><div class="row">${pirateTargets(G, me).map((q) => `<button data-a="pirq" data-q="${q}"><span class="chip" style="background:${G.players[q].color}"></span> ${esc(G.players[q].name)} (${G.players[q].n})</button>`).join('')}</div><button class="ghost" style="width:100%;margin-top:8px" data-a="mclose">Cancelar</button>`);
  if (U.modal && U.modal.t === 'mono') return box(`<h2>💰 Monopolio</h2><p>Todos te darán todas las cartas de ese recurso.</p><div class="picker">${RES.map((r) => `<button data-a="mono" data-r="${r}"><span class="e">${RINFO[r].e}</span>${RINFO[r].n}</button>`).join('')}</div><button class="ghost" style="width:100%" data-a="mclose">Cancelar</button>`);
  const O = G.offer;
  if (O && O.from !== me && !O.acc[me] && !O.rej[me] && U.seenOffer !== O.id && U.tab !== 'trade') {
    const can = RES.every((r) => P.res[r] >= O.want[r]);
    return box(`<h2>🤝 Oferta de ${esc(G.players[O.from].name)}</h2><p>Te da <b>${fmt(O.give)}</b> a cambio de <b>${fmt(O.want)}</b>.</p><div class="row"><button data-a="respond" data-y="0">Rechazar</button><button class="primary" data-a="respond" data-y="1" ${can ? '' : 'disabled'}>${can ? 'Aceptar' : 'No lo tienes'}</button></div><button class="ghost" style="width:100%;margin-top:8px" data-a="later">Decidir luego</button>`);
  }
  return '';
}

/* ---------- eventos ---------- */
document.addEventListener('input', (e) => {
  if (e.target.id === 'name') U.name = e.target.value;
  if (e.target.id === 'code') { U.code = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); e.target.value = U.code; }
});
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-a]'); if (!t) return;
  const d = t.dataset, G = U.G;
  switch (d.a) {
    case 'color': U.color = d.c; store.set('colonos-color', U.color); if (U.screen === 'lobby' && net) net.send({ t: 'hello', token: token(), name: U.name, color: U.color }); render(); break;
    case 'join':
      U.name = ($('#name').value || '').trim(); U.code = ($('#code').value || '').toUpperCase();
      if (U.code.length !== 4) { U.msg = 'El código tiene 4 letras'; render(); break; }
      if (!U.name) { U.msg = 'Pon tu nombre'; render(); break; }
      U.msg = ''; connect(); break;
    case 'leave': net && net.send({ t: 'leave' }); net && net.close(); net = null; U.screen = 'join'; U.status = 'idle'; render(); break;
    case 'leavegame': if (confirmLeave()) { net && net.close(); net = null; U.screen = 'join'; U.status = 'idle'; render(); } break;
    case 'tab': U.tab = d.k; if (d.k !== 'map') U.sel = null; if (d.k === 'trade' && G && G.offer) U.seenOffer = G.offer.id; render(); break;
    case 'roll': send({ t: 'roll' }); break;
    case 'end': send({ t: 'end' }); U.mode = null; break;
    case 'pass': send({ t: 'pass' }); U.mode = null; break;
    case 'build': U.mode = d.k; U.sel = null; U.tab = 'map'; render(); break;
    case 'cancelmode': U.mode = null; U.sel = null; render(); break;
    case 'unsel': U.sel = null; render(); break;
    case 'confirm': {
      const s = U.sel; U.sel = null;
      if (s.k === 'h') send({ t: 'robber', h: s.id });
      else if (s.k === 'e') {
        if (U.mode === 'ship') send({ t: 'ship', e: s.id });
        else if (U.mode === 'move' || (G.phase === 'roadbuild' && !canRoadE(G, U.me, s.id))) send({ t: 'moveShip', to: s.id });
        else send({ t: 'road', e: s.id });
      }
      else send({ t: U.mode === 'city' ? 'city' : 'settle', v: s.id });
      if (G.phase !== 'roadbuild') U.mode = null;
      render(); break;
    }
    case 'buydev': send({ t: 'buyDev' }); break;
    case 'dev': {
      const card = G.players[U.me].dev[+d.i];
      if (card.t === 'plenty') { U.modal = { t: 'plenty', i: +d.i, pick: [] }; render(); }
      else if (card.t === 'mono') { U.modal = { t: 'mono', i: +d.i }; render(); }
      else if (card.t === 'pirate') { U.modal = { t: 'pirate', i: +d.i }; render(); }
      else send({ t: 'playDev', i: +d.i });
      break;
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
    case 'discard': send({ t: 'discard', sel: U.disc || {} }); U.disc = {}; break;
    case 'steal': send({ t: 'steal', q: +d.q }); break;
    case 'bgive': U.bank.give = d.r; if (U.bank.get === d.r) U.bank.get = null; render(); break;
    case 'bget': U.bank.get = d.r; render(); break;
    case 'bankdo': send({ t: 'bank', give: U.bank.give, get: U.bank.get }); break;
    case 'offer': send({ t: 'offer', give: U.trade.give, want: U.trade.want }); U.trade = { give: {}, want: {} }; break;
    case 'respond': send({ t: 'respond', yes: d.y === '1', id: G.offer && G.offer.id }); if (G.offer) U.seenOffer = G.offer.id; break;
    case 'later': U.seenOffer = G.offer.id; render(); break;
    case 'deal': send({ t: 'confirm', q: +d.q }); break;
    case 'canceloffer': send({ t: 'cancelOffer' }); break;
    case 'winok': U.winSeen = true; render(); break;
    case 'zin': b3 && b3.zoomBy(0.78); break;
    case 'zout': b3 && b3.zoomBy(1.28); break;
    case 'zfit': b3 && b3.setView(0, true); break;
  }
});
function confirmLeave() { return true; }

// entrar directamente si ya estábamos en esta sala
if (U.code && U.name && store.get('colonos-token-' + U.code, null)) connect();
render();
window.__client = U; window.__send = send;
