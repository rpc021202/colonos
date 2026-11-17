// Pantalla de juego (ordenador o tele): configurador, sala con QR y tablero 3D.
import { newGame, act, publicState, boardStatic, genBoard, hexCountFor, DENSITIES, COLORS, actor, pn, esc, vp, total, stats, winnerSpots } from './engine.js';
import { summaryHTML, SUMMARY_CSS } from './summary.js';
import { THEMES, applyTheme, richText } from './themes.js';
import { RINFO } from './engine.js';
document.head.insertAdjacentHTML('beforeend', `<style>${SUMMARY_CSS}#win .card{max-height:92vh;overflow-y:auto}</style>`);
import { Board3D } from './board3d.js';
import { hostRoom, makeCode, linkParams, pack, unpack } from './net.js';
import { botAction } from './bots.js';
import { sound } from './audio.js';

const $ = (s) => document.querySelector(s);
const SAVE = 'colonos-host-v1';
const LOCAL = new URLSearchParams(location.search).has('local');
const board = new Board3D($('#scene'));

const PHONE = matchMedia('(pointer:coarse)').matches && Math.min(window.screen.width, window.screen.height) < 700;
let cfg = { self: false, theme: 'classic', players: 4, density: 'normal', fog: false, target: 10, sbp: true, mode: 'classic', islands: 'small', openHands: false };
let screen = 'start'; // start | config | lobby | game
let room = null, code = null, G = null, staticB = null;
let lobby = []; // {token,name,color,online}
const conns = new Map(); // cid -> token
let hudHidden = false, err = '';

/* ---------- utilidades ---------- */
let toastT;
function toast(m) { const t = $('#toast'); t.innerHTML = richText(m); t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
const bannerQ = []; let bannerBusy = false;
function banner(m) { bannerQ.push(m); if (!bannerBusy) nextBanner(); }
function nextBanner() {
  const b = $('#banner'); const m = bannerQ.shift();
  if (!b || !m) { bannerBusy = false; return; }
  bannerBusy = true; b.innerHTML = richText(m); b.classList.add('show');
  setTimeout(() => { b.classList.remove('show'); setTimeout(nextBanner, 350); }, 2300);
}
function joinURL() {
  const u = new URL('jugar.html', location.href);
  u.search = ''; u.hash = '';
  u.searchParams.set('sala', code);
  if (LOCAL) u.searchParams.set('local', '1');
  for (const k in linkParams) u.searchParams.set(k, linkParams[k]);
  return u.toString();
}
function qrSVG(text, cell = 6) {
  try { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: cell, margin: 0, scalable: true }); }
  catch (e) { return ''; }
}
let remoteT = null, retired = false;
function save() {
  if (retired) return;
  try { localStorage.setItem(SAVE, JSON.stringify({ code, cfg, lobby: lobby.map(({ token, name, color, bot }) => ({ token, name, color, bot })), G, t: Date.now() })); } catch (e) {}
  // copia en el servidor de mensajes para el relevo automático
  if (G && room && room.save && !retired) {
    clearTimeout(remoteT);
    remoteT = setTimeout(async () => { if (G && room && !retired) room.save(await pack({ v: 1, at: Date.now(), code, cfg, lobby: lobby.map(({ token, name, color, bot }) => ({ token, name, color, bot })), G })); }, 300);
  }
}
function loadSave() { try { return JSON.parse(localStorage.getItem(SAVE) || 'null'); } catch (e) { return null; } }
function tokenToPid(token) { return lobby.findIndex((p) => p.token === token); }

/* ---------- vista previa del mapa ---------- */
let previewKey = '';
function preview() {
  const N = hexCountFor(cfg.players, cfg.density);
  const k = N + '-' + cfg.mode + '-' + cfg.islands + '-' + cfg.theme;
  if (k === previewKey) return;
  previewKey = k;
  const mainN = hexCountFor(cfg.players, 'war');
  board.setBoard(genBoard(cfg.mode === 'ships' ? Math.max(N, mainN + 6) : N, { ships: cfg.mode === 'ships', mainN, islands: cfg.islands }), { fog: false, theme: cfg.theme });
  board.spin(true);
}

/* ---------- render de pantallas ---------- */
function render() {
  const ui = $('#ui');
  if (screen === 'start') {
    const s = loadSave();
    const canResume = s && s.code && s.G && s.G.winner === null && Date.now() - (s.t || 0) < 1000 * 60 * 60 * 24 * 3;
    ui.innerHTML = `<div id="start"><div class="card">
      <h1>⬡ Catán</h1><div class="sub">${PHONE ? 'Crea la partida y juega desde este móvil, o únete a la de otro.' : 'Esta pantalla será el tablero. Cada jugador se une con su móvil.'}</div>
      <button class="primary big" data-a="newself">📱 Crear y jugar desde este ${PHONE ? 'móvil' : 'dispositivo'}</button>
      <button class="big ${PHONE ? 'ghost' : 'primary'}" data-a="new">📺 Crear con esta pantalla como tablero</button>
      <button class="big ghost" data-a="demo">👀 Ver una partida de demostración</button>
      ${canResume ? `<button class="big ghost" data-a="resume">Reanudar sala ${esc(s.code)} · ${s.G.players.length} jugadores</button>` : ''}
      <button class="big ghost" data-a="joinhere">🙋 Unirme a la partida de otro</button>
      ${err ? `<div class="err">${esc(err)}</div>` : ''}
    </div></div>`;
    return;
  }
  if (screen === 'config') {
    preview();
    const seg = (key, vals) => `<div class="seg">${vals.map(([v, l, dis]) => `<button class="${cfg[key] === v ? 'sel' : ''}" data-a="cfg" data-k="${key}" data-v="${v}" ${dis ? 'disabled' : ''}>${l}</button>`).join('')}</div>`;
    ui.innerHTML = `<div id="config"><div class="card">
      <h1>Nueva partida</h1><div class="sub">${cfg.self ? 'Juegas desde este dispositivo, que además lleva la partida. Después podrás pasar el código a los demás.' : 'Configura la partida. Después aparecerá el QR para unirse.'}</div>
      <label class="lbl">Estética</label>${seg('theme', Object.entries(THEMES).map(([k, T]) => [k, T.icon + ' ' + T.name]))}
      <div class="note">${THEMES[cfg.theme].note} Las reglas son las mismas.</div>
      <label class="lbl">¿Cuántos vais a jugar?</label>${seg('players', [2, 3, 4, 5, 6, 7, 8].map((n) => [n, n]))}
      <label class="lbl">Tamaño del mapa</label>
      <div class="sizes">${DENSITIES.map((d) => `<button class="${cfg.density === d.k ? 'sel' : ''}" data-a="cfg" data-k="density" data-v="${d.k}"><span class="n">${hexCountFor(cfg.players, d.k)}</span><b>${d.n}</b><span>${d.note} · ${d.d} por jugador</span></button>`).join('')}</div>
      <div class="note">El original son 19 hexágonos para 4 (4,75 por jugador): por debajo de eso no bajamos. Si al final os unís más o menos, se mantiene el espacio por jugador.</div>
      <label class="lbl">Modo de juego</label>${seg('mode', [['classic', '🏝️ Clásico'], ['ships', '⛵ Barcos e islas']])}
      ${cfg.mode === 'ships' ? `<div class="note">La isla principal tiene el tamaño del tablero original y todo el espacio extra se reparte en islas. Los barcos (🌲+🐑) salen de tus poblados de costa y avanzan 1 tramo gratis por turno. Descubrir tierra da un recurso y la primera colonia en cada isla nueva, +1 punto. Hay cartas de Pirata.</div>
      <label class="lbl">Islas</label>${seg('islands', [['small', '🏝️ Muchas y pequeñas'], ['big', '🏔️ Pocas y grandes']])}` : ''}
      <label class="lbl">Mapa</label>${seg('fog', [[false, '🗺️ Visible'], [true, '🌫️ A ciegas']])}
      <div class="note">${cfg.fog ? (cfg.mode === 'ships' ? 'Solo se ve la isla principal: el resto del mar está bajo las nubes y hay que explorarlo.' : 'Todo empieza cubierto de niebla: cada poblado o camino despeja los hexágonos que toca.') : 'Se ve todo el mapa desde el principio.'}</div>
      <label class="lbl">Recursos de los jugadores</label>${seg('openHands', [[false, '🙈 Ocultos'], [true, '👀 A la vista']])}
      <div class="note">${cfg.openHands ? 'Todos ven qué recursos tiene cada uno (en la tele y en los móviles). Las cartas de desarrollo siguen siendo secretas.' : 'Cada uno solo ve sus cartas, como en el juego de mesa.'}</div>
      <label class="lbl">Puntos para ganar</label>${seg('target', [[8, '8'], [10, '10'], [12, '12'], [13, '13'], [14, '14']])}
      ${cfg.players > 4 ? `<label class="lbl">Con más de 4</label>${seg('sbp', [[true, '🔨 Construcción extra'], [false, 'Sin ella']])}<div class="note">Al acabar cada turno, el resto puede construir (sin comerciar) para no esperar tanto.</div>` : ''}
      <button class="primary big" data-a="create" style="margin-top:20px">Crear sala</button>
      <button class="ghost" data-a="back" style="width:100%;margin-top:8px">Volver</button>
      ${err ? `<div class="err">${esc(err)}</div>` : ''}
    </div></div>`;
    return;
  }
  if (screen === 'lobby') {
    const url = joinURL();
    ui.innerHTML = `<div id="lobby" class="card">
      <h2>Escanead para jugar</h2><div class="sub" style="margin:0">Cada uno con su móvil. También podéis entrar con el código.</div>
      <div class="qrbox"><div class="qr">${qrSVG(url)}</div><div><div class="note" style="margin:0">Código</div><div class="code">${code}</div><div class="url">${esc(url.replace(/^https?:\/\//, ''))}</div></div></div>
      <div class="seg"><button data-a="copy">📋 Copiar enlace</button>${navigator.share ? '<button data-a="share">📤 Compartir</button>' : ''}</div>
      <label class="lbl">Jugadores (${lobby.length}/8)</label>
      <div class="plist">${lobby.length ? lobby.map((p, i) => `<div class="prow"><span class="chip" style="background:${p.color}"></span>${esc(p.name)}${p.bot ? ` <small>🤖 bot</small><button class="ghost" style="margin-left:6px;padding:2px 9px" data-a="rmbot" data-t="${p.token}">✕</button>` : i === 0 ? ' <small>anfitrión</small>' : ''}${p.online || p.bot ? '' : ' <small>desconectado</small>'}</div>`).join('') : '<div class="empty">Esperando a que se una alguien…</div>'}</div>
      <button class="ghost" data-a="addbot" ${lobby.length >= 8 ? 'disabled' : ''}>🤖 Añadir un bot</button>
      <div class="note">${cfg.mode === 'ships' ? '⛵ Barcos e islas · ' : ''}Tierra: ${hexCountFor(Math.max(2, lobby.length || cfg.players), cfg.density)} hexágonos · ${cfg.fog ? 'a ciegas' : 'visible'} · ${cfg.target} puntos${cfg.openHands ? ' · recursos a la vista' : ''}</div>
      <button class="primary big" data-a="go" ${lobby.length >= 2 ? '' : 'disabled'}>Empezar partida${lobby.length ? ` (${lobby.length})` : ''}</button>
      <button class="ghost" data-a="cfgback" style="margin-top:8px">Cambiar ajustes</button>
    </div>`;
    return;
  }
  if (screen === 'game') renderHUD();
}
function phaseText() {
  if (G.winner !== null) return '¡Ha ganado!';
  const a = actor(G);
  switch (G.phase) {
    case 'setup': return G.setupSub === 'settlement' ? (G.setupIdx >= G.players.length ? 'Coloca su segundo poblado' : 'Coloca su primer poblado') : 'Coloca un camino';
    case 'roll': return 'Tira los dados';
    case 'discard': return `${G.players[a].name} descarta la mitad`;
    case 'robber': return 'Mueve el ladrón';
    case 'steal': return 'Elige a quién robar';
    case 'roadbuild': return G.opts.ships ? `${G.rbLeft} tramo${G.rbLeft > 1 ? 's' : ''} gratis (camino o barco)` : `Construye ${G.rbLeft} camino${G.rbLeft > 1 ? 's' : ''} gratis`;
    case 'sbp': return `Construcción extra: ${G.players[a].name}`;
    default: return G.offer ? '🤝 Ofrece un trato' : 'Construye y comercia';
  }
}
function renderHUD() {
  const T = G.players[G.turn], online = new Set([...conns.values()]);
  $('#ui').innerHTML = `<div id="hud" class="layer ${hudHidden ? 'off' : ''}">
    <div id="turn"><span class="chip" style="background:${T.color}"></span><div><div class="who">${pn(G, G.turn)}</div><div class="what">${esc(phaseText())}</div></div></div>
    ${code ? `<div id="room"><div class="qr">${qrSVG(joinURL(), 3)}</div><div><div class="note" style="margin:0">Sala</div><b>${code}</b></div></div>` : '<div id="room"><b style="font-size:16px;letter-spacing:0">👀 Demostración</b><button class="ghost" style="padding:4px 10px" data-a="exitdemo">Salir</button></div>'}
    <div id="strip">${G.players.map((P, i) => `<div data-p="${i}" class="pc ${i === G.turn ? 'cur' : ''} ${(lobby[i] && lobby[i].bot) || online.has(lobby[i] && lobby[i].token) ? '' : 'off'}"><span class="chip" style="background:${P.color}"></span><span class="nm">${esc(P.name)}</span><span class="st">${G.opts.openHands ? ['wood', 'brick', 'sheep', 'wheat', 'ore'].map((r) => `${RINFO[r].e}${P.res[r]}`).join(' ') + ' ·' : '🃏' + total(G, i)} 📜${P.dev.length}${G.longest === i ? ' 🛣️' : ''}${G.army === i ? ' ⚔️' : ''}${Object.values(G.islandClaim || {}).filter((x) => x === i).length ? ' 🏝️' + Object.values(G.islandClaim).filter((x) => x === i).length : ''}</span><span class="vp">${vp(G, i, G.winner !== null)}</span></div>`).join('')}</div>
    <div id="audio"><button data-a="music" title="Música (M)">${sound.musicOn ? '🎵' : '🔇'} Música</button><button data-a="sfx" title="Efectos (S)">${sound.sfxOn ? '🔊' : '🔈'} Efectos</button></div>
    ${diceHistHTML()}
    <div id="keys">Ratón: girar · Rueda: zoom · C: cámara ${board.followTurn ? 'sigue el turno' : 'libre'} · H: ocultar · M: música · S: efectos · F: pantalla completa</div>
  </div>
  ${G.winner !== null && !G._cineDone ? `<div id="wincine"><div class="crown">🏆</div><h1>¡${pn(G, G.winner)} gana!</h1><div class="pts">${vp(G, G.winner, true)} puntos</div><button class="primary" data-a="cinenext">Siguiente →</button></div>` : ''}
  ${G.winner !== null && G._cineDone && !G._winClosed ? `<div id="win"><div class="card"><h2>🏆 ¡${pn(G, G.winner)} gana!</h2>
    ${G.players.map((_, i) => i).sort((a, b) => vp(G, b, true) - vp(G, a, true)).map((i) => `<div class="score"><span class="chip" style="background:${G.players[i].color}"></span>${pn(G, i)}<span>${vp(G, i, true)}</span></div>`).join('')}
    ${summaryHTML(G.players, { ...stats(G), rolls: G.rolls || [] }, G.board.hexes)}
    <div class="seg" style="margin-top:18px"><button class="ghost" data-a="closewin">Ver tablero</button><button class="primary" data-a="again">Otra partida</button></div></div></div>` : ''}`;
}

/* ---------- recursos volando y dados ---------- */
const EMO = new Proxy({}, { get: (_, r) => (RINFO[r] || {}).e || '' }); // iconos del tema actual
function flyResources(fx) {
  if (hudHidden) return;
  fx.forEach((f, i) => {
    const hx = staticB.hexes[f.h], V = staticB.verts[f.v];
    const s0 = board.worldToScreen(hx.x, 0.5, hx.y), s1 = V ? board.worldToScreen(V.x, 0.4, V.y) : s0;
    const chip = document.querySelector(`.pc[data-p="${f.p}"]`); if (!chip) return;
    const r = chip.getBoundingClientRect(), ex = r.left + r.width / 2, ey = r.top + r.height / 2;
    for (let k = 0; k < f.n; k++) {
      const el = document.createElement('div'); el.className = 'fly'; el.innerHTML = EMO[f.r]; document.body.appendChild(el);
      const mx = (s1.x + ex) / 2, my = Math.min(s1.y, ey) - 140;
      const a = el.animate([
        { transform: `translate(${s0.x}px,${s0.y}px) scale(.4)`, opacity: 0 },
        { transform: `translate(${s1.x}px,${s1.y - 30}px) scale(1.25)`, opacity: 1, offset: 0.25 },
        { transform: `translate(${mx}px,${my}px) scale(1.1)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${ex}px,${ey}px) scale(.7)`, opacity: 0.9 },
      ], { duration: 1300, delay: i * 110 + k * 140, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'both' });
      a.onfinish = () => { el.remove(); const c = document.querySelector(`.pc[data-p="${f.p}"]`); c && c.animate([{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-6px) scale(1.08)' }, { transform: 'translateY(0) scale(1)' }], { duration: 260 }); };
    }
  });
}
function diceHistHTML() {
  const rolls = (G && G.rolls) || []; if (!rolls.length) return '';
  const cnt = {}; for (let n = 2; n <= 12; n++) cnt[n] = 0; rolls.forEach((r) => cnt[r]++);
  const max = Math.max(1, ...Object.values(cnt));
  return `<div id="dhist"><div class="last">${rolls.slice(-10).map((r, i, a) => `<span class="${r === 7 ? 'seven' : ''} ${i === a.length - 1 ? 'now' : ''}">${r}</span>`).join('')}</div>
    <div class="bars">${Object.entries(cnt).map(([n, c]) => `<div class="b"><i style="height:${(c / max) * 100}%" class="${+n === 7 ? 'seven' : +n === 6 || +n === 8 ? 'hot' : ''}"></i><small>${n}</small></div>`).join('')}</div>
    <div class="note" style="margin:2px 0 0;font-size:11px">${rolls.length} tiradas</div></div>`;
}

/* ---------- red ---------- */
async function openRoom(c) {
  code = c;
  room = await hostRoom(code, {
    epoch: Date.now(),
    onReplaced,
    onConnect: () => {},
    onMessage: onMsg,
    onClose: (cid) => {
      const tok = conns.get(cid); conns.delete(cid);
      const p = lobby.find((x) => x.token === tok);
      if (p && ![...conns.values()].includes(tok)) {
        p.online = false;
        if (screen === 'lobby') broadcastLobby(); else render();
      }
    },
    onError: (e) => toast('Problema de conexión: ' + (e.type || e.message || e)),
  });
}
// otro móvil ha cogido la partida mientras esta página dormía
async function onReplaced() {
  if (!G) return;
  if (cfg.self) { // desde el móvil: este sigue jugando como uno más y el otro lleva la partida
    retired = true; const r = room; room = null; try { r.close(); } catch (e) {}
    try { localStorage.removeItem(SAVE); } catch (e) {}
    return;
  }
  // la tele o el ordenador vuelven a coger la partida, con lo último que se jugó
  const saved = await unpack(await room.saved());
  try { room.close(); } catch (e) {}
  room = null; conns.clear();
  if (saved && saved.G) { G = saved.G; G.ev = []; applyTheme(G.opts.theme || 'classic'); lobby = saved.lobby.map((p) => ({ ...p, online: false })); cfg = { ...cfg, ...saved.cfg }; staticB = boardStatic(G); }
  try { await openRoom(code); } catch (e) { toast('No se ha podido recuperar la partida'); return; }
  board.syncPieces(publicState(G, -1), G.players.map((p) => p.color));
  render(); save();
  toast('Partida recuperada');
}
function send(cid, m) { room && room.send(cid, m); }
function broadcastLobby() {
  for (const [cid, tok] of conns) send(cid, { t: 'lobby', you: tokenToPid(tok), players: lobby.map((p) => ({ name: p.name, color: p.color })), cfg: { fog: cfg.fog, ships: cfg.mode === 'ships', target: cfg.target, N: hexCountFor(Math.max(2, lobby.length), cfg.density) } });
  render();
}
function broadcastState() {
  for (const [cid, tok] of conns) { const pid = tokenToPid(tok); if (pid >= 0) send(cid, { t: 'state', s: publicState(G, pid) }); }
}
function freeColor(want, except) {
  const used = new Set(lobby.filter((p) => p !== except).map((p) => p.color));
  if (want && !used.has(want) && COLORS.some((c) => c.c === want)) return want;
  return (COLORS.find((c) => !used.has(c.c)) || COLORS[0]).c;
}
function onMsg(cid, m) {
  if (!m || typeof m.t !== 'string') return;
  if (m.t === 'ping') { send(cid, { t: 'pong' }); return; }
  if (m.t === 'hello') {
    const token = String(m.token || '').slice(0, 40);
    const name = String(m.name || '').trim().slice(0, 16) || 'Jugador';
    if (!token) return;
    let p = lobby.find((x) => x.token === token);
    if (G) {
      if (!p) { send(cid, { t: 'full', m: 'La partida ya ha empezado. Pide al anfitrión que cree otra.' }); return; }
      conns.set(cid, token); p.online = true;
      send(cid, { t: 'start', b: staticB, you: tokenToPid(token), code });
      send(cid, { t: 'state', s: publicState(G, tokenToPid(token)) });
      renderHUD(); return;
    }
    if (!p) {
      if (lobby.length >= 8) { send(cid, { t: 'full', m: 'La sala está llena (8 jugadores).' }); return; }
      p = { token, name, color: freeColor(m.color), online: true };
      lobby.push(p);
      toast(`${name} se ha unido`);
    } else { p.name = name; p.color = freeColor(m.color, p); p.online = true; }
    for (const [c2, t2] of conns) if (t2 === token && c2 !== cid) conns.delete(c2);
    conns.set(cid, token);
    broadcastLobby(); save();
    return;
  }
  const tok = conns.get(cid);
  if (!tok) return;
  if (m.t === 'leave' && !G) { lobby = lobby.filter((x) => x.token !== tok); conns.delete(cid); broadcastLobby(); return; }
  if (m.t === 'act' && G) {
    const pid = tokenToPid(tok);
    if (pid < 0) return;
    const e = act(G, pid, m.a || {});
    if (e) { send(cid, { t: 'err', m: e }); G.ev = []; return; }
    afterAct();
  }
}
function sendTo(pid, m) { const tok = lobby[pid] && lobby[pid].token; for (const [cid, t] of conns) if (t === tok) send(cid, m); }
const ROLL_WAIT = 1800; // lo que tardan los dados en caer y enseñar el número
function afterAct() {
  const evs = G.ev; G.ev = [];
  const rolled = evs.some((e) => e.t === 'roll');
  // al tirar: primero caen los dados en todas las pantallas y, cuando sale el número, se cobra
  const later = (fn) => (rolled ? setTimeout(fn, ROLL_WAIT) : fn());
  evs.forEach((e) => {
    if (e.t === 'roll') { board.rollDice(e.d[0], e.d[1]); sound.play('dice'); }
    else if (e.t === 'produce') setTimeout(() => { board.produce(e.hexes, e.flows); if (e.hexes.length) sound.play('produce'); flyResources(e.fx || []); }, rolled ? 1700 : 0);
    else if (e.t === 'build') sound.play(e.k === 'r' ? 'road' : e.k === 'c' ? 'city' : e.k === 'b' ? 'ship' : 'settlement');
    else if (e.t === 'sail') sound.play('sail');
    else if (e.t === 'pirate') { sound.play('pirate'); banner(`🏴‍☠️ ${G.players[e.p].name} asalta los barcos de ${G.players[e.q].name}`); }
    else if (e.t === 'robber') sound.play('robber');
    else if (e.t === 'devbuy') sound.play('devcard');
    else if (e.t === 'reveal') setTimeout(() => board.revealHexes(e.hexes), 650);
    else if (e.t === 'banner') { banner(e.m); if (e.m.startsWith('🤝')) sound.play('trade'); }
    else if (e.t === 'gain') later(() => sendTo(e.to, { t: 'note', m: e.m }));
    else if (e.t === 'turn') { board.seatView(e.p, G.players.length); sendTo(e.p, { t: 'yourturn' }); if (!e.setup) sound.play('turn'); }
    else if (e.t === 'sbp') sendTo(e.p, { t: 'yourturn', sbp: true });
    else if (e.t === 'win') {
      sound.play('win');
      // escena del ganador: la cámara vuela a la casa que más ha producido y hay fuegos artificiales en todas las suyas
      const w = winnerSpots(G, stats(G)); if (w) setTimeout(() => board.victory(w.main, w.verts, G.players[e.p].color), 900);
    }
  });
  // lo que ha pasado, para que cada móvil anime los dados y ponga los sonidos
  const fx = evs.filter((e) => ['roll', 'produce', 'build', 'sail', 'pirate', 'robber', 'devbuy', 'turn', 'win'].includes(e.t) || (e.t === 'banner' && e.m.startsWith('🤝')))
    .map((e) => (e.t === 'roll' ? { t: 'roll', d: e.d } : e.t === 'produce' ? { t: 'produce', hexes: e.hexes } : e.t === 'build' ? { t: 'build', k: e.k } : e.t === 'turn' ? { t: 'turn', p: e.p, setup: !!e.setup } : e.t === 'banner' ? { t: 'trade' } : { t: e.t }));
  if (fx.length) for (const [cid] of conns) send(cid, { t: 'fx', l: fx });
  later(() => { if (!G) return; board.syncPieces(publicState(G, -1), G.players.map((p) => p.color)); broadcastState(); renderHUD(); });
  save();
}

/* ---------- bots ---------- */
const BOT_NAMES = ['Ada', 'Bruno', 'Carla', 'Dani', 'Elena', 'Fran', 'Gala', 'Hugo'];
let demo = false, botWait = 0;
function addBot() {
  if (lobby.length >= 8) return;
  const used = new Set(lobby.map((p) => p.name));
  const name = (BOT_NAMES.find((n) => !used.has(n + ' 🤖')) || 'Bot') + ' 🤖';
  lobby.push({ token: 'bot-' + Math.random().toString(36).slice(2, 8), name, color: freeColor(null), bot: true, online: true });
}
setInterval(() => {
  if (!G || retired || screen !== 'game' || G.winner !== null || Date.now() < botWait) return;
  if (G.offer && !G.offer._ts) G.offer._ts = Date.now();
  for (let p = 0; p < lobby.length; p++) {
    if (!lobby[p] || !lobby[p].bot) continue;
    const a = botAction(G, p);
    if (!a) continue;
    let e = act(G, p, a);
    if (e) { G.ev = []; e = act(G, p, { t: G.phase === 'sbp' ? 'pass' : 'end' }); if (e) { G.ev = []; continue; } }
    const rolled = G.ev.some((x) => x.t === 'roll'), built = G.ev.some((x) => x.t === 'build');
    afterAct();
    botWait = Date.now() + (rolled ? 2600 : built ? 1300 : a.t === 'respond' ? 300 : 800) * (demo ? 1 : 0.8);
    return;
  }
}, 200);

/* ---------- empezar ---------- */
function startGame() {
  const players = lobby.map((p) => ({ name: p.name, color: p.color }));
  applyTheme(cfg.theme);
  G = newGame({ players, density: cfg.density, fog: cfg.fog, target: cfg.target, sbp: cfg.sbp, ships: cfg.mode === 'ships', islands: cfg.islands, openHands: cfg.openHands, theme: cfg.theme });
  staticB = boardStatic(G);
  screen = 'game';
  board.stopVictory(); board.followTurn = !board.mobile;
  board.spin(false);
  board.ready = false;
  board.setBoard(staticB, { fog: G.opts.fog, revealed: G.revealed, theme: G.opts.theme });
  board.syncPieces(publicState(G, -1), G.players.map((p) => p.color));
  board.ready = true;
  for (const [cid, tok] of conns) send(cid, { t: 'start', b: staticB, you: tokenToPid(tok), code });
  G.ev = [];
  broadcastState(); render(); save();
  banner(`¡Empieza ${G.players[G.turn].name}!`);
  setTimeout(() => board.seatView(G.turn, G.players.length), 600);
}
async function resume() {
  const s = loadSave();
  cfg = s.cfg; lobby = s.lobby.map((p) => ({ ...p, online: false })); G = s.G; G.ev = [];
  applyTheme((G.opts && G.opts.theme) || 'classic');
  staticB = boardStatic(G);
  try { await openRoom(s.code); }
  catch (e) { err = 'No se ha podido reabrir la sala (puede tardar un minuto en liberarse). Prueba de nuevo.'; G = null; render(); return; }
  if (room.saved) { // si mientras tanto otro móvil siguió la partida, se continúa desde ahí
    const sv = await unpack(await room.saved());
    if (sv && sv.G && sv.at > (s.t || 0)) { G = sv.G; G.ev = []; applyTheme(G.opts.theme || 'classic'); lobby = sv.lobby.map((p) => ({ ...p, online: false })); staticB = boardStatic(G); }
  }
  screen = 'game'; board.spin(false); board.ready = false;
  board.setBoard(staticB, { fog: G.opts.fog, revealed: G.revealed, theme: G.opts.theme });
  board.syncPieces(publicState(G, -1), G.players.map((p) => p.color));
  board.ready = true; render();
  toast('Sala reabierta: los móviles se reconectan solos');
  if (cfg.self) mountSelf();
}

/* ---------- crear y jugar desde el mismo móvil ----------
   Esta página lleva la partida (sin dibujar el tablero, para ahorrar batería) y encima
   se abre el mando del jugador, que se conecta a la sala como uno más. */
let selfFrame = null, wakeLock = null;
async function keepAwake() { try { if ('wakeLock' in navigator && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {} }
function mountSelf() {
  if (selfFrame) return;
  board.setActive(false); $('#scene').style.display = 'none';
  sound.musicOn = false; sound.sfxOn = false; if (sound.musicBus) { sound.musicBus.gain.value = 0; sound.sfxBus.gain.value = 0; } // el sonido lo pone el mando
  const u = new URL(joinURL()); u.searchParams.set('embed', '1');
  selfFrame = document.createElement('iframe');
  selfFrame.src = u.toString(); selfFrame.id = 'selfplay'; selfFrame.allow = 'fullscreen; web-share; clipboard-write';
  document.body.appendChild(selfFrame);
  selfFrame.addEventListener('load', sendInsets);
  keepAwake();
}
// el mando va a pantalla completa: le decimos cuánto ocupan la isla de la cámara y las esquinas
function sendInsets() {
  if (!selfFrame) return;
  let pr = $('#saprobe'); if (!pr) { pr = document.createElement('div'); pr.id = 'saprobe'; document.body.appendChild(pr); }
  const cs = getComputedStyle(pr), v = (k) => parseFloat(cs[k]) || 0;
  selfFrame.contentWindow && selfFrame.contentWindow.postMessage({ colonosInsets: { t: v('paddingTop'), r: v('paddingRight'), b: v('paddingBottom'), l: v('paddingLeft') } }, location.origin);
}
addEventListener('resize', () => setTimeout(sendInsets, 150));
addEventListener('orientationchange', () => setTimeout(sendInsets, 400));
function goHome() { // cierra la sala y vuelve a la pantalla de inicio
  for (const [cid] of conns) send(cid, { t: 'closed' });
  try { localStorage.removeItem(SAVE); } catch (e) {}
  setTimeout(() => { try { room && room.close(); } catch (e) {} location.href = location.pathname + location.search; }, 500);
}
document.addEventListener('visibilitychange', () => { if (selfFrame && document.visibilityState === 'visible') keepAwake(); if (G) save(); });
addEventListener('message', (e) => {
  if (!selfFrame || e.source !== selfFrame.contentWindow || !e.data || !e.data.colonos) return;
  const m = e.data.colonos;
  if (m === 'addbot' && !G && lobby.length < 8) { addBot(); broadcastLobby(); save(); }
  if (m === 'rmbot' && !G) { const p = lobby[e.data.i]; if (p && p.bot) { lobby.splice(e.data.i, 1); broadcastLobby(); save(); } }
  if (m === 'go' && !G && lobby.length >= 2) startGame();
  if (m === 'again' && G && G.winner !== null) { G = null; staticB = null; screen = 'lobby'; for (const [cid] of conns) send(cid, { t: 'reset' }); broadcastLobby(); save(); }
  if (m === 'home') goHome();
  if (m === 'insets') sendInsets();
  if (m === 'share') navigator.share && navigator.share({ title: 'Catán', text: `¡Únete a mi partida de Catán! Código ${code}`, url: joinURL() }).catch(() => {});
});

/* ---------- eventos ---------- */
document.addEventListener('click', async (e) => {
  sound.unlock();
  const t = e.target.closest('[data-a]'); if (!t) return;
  const d = t.dataset;
  switch (d.a) {
    case 'new': err = ''; cfg.self = false; screen = 'config'; render(); break;
    case 'newself': err = ''; cfg.self = true; screen = 'config'; render(); break;
    case 'resume': err = ''; resume(); break;
    case 'joinhere': location.href = 'jugar.html' + (LOCAL ? '?local=1' : ''); break;
    case 'back': screen = 'start'; render(); break;
    case 'cfg': {
      let v = d.v; if (v === 'true') v = true; else if (v === 'false') v = false; else if (!isNaN(+v)) v = +v;
      cfg[d.k] = v; if (d.k === 'mode') { cfg.target = v === 'ships' ? 13 : 10; cfg.fog = v === 'ships'; } render(); break;
    }
    case 'create': {
      t.disabled = true; t.textContent = 'Creando sala…';
      for (let i = 0; i < 4; i++) {
        try { await openRoom(makeCode()); break; }
        catch (ex) { if (i === 3) { err = 'No se ha podido crear la sala. Revisa la conexión a internet.'; render(); return; } }
      }
      err = ''; screen = 'lobby'; render(); save();
      if (cfg.self) mountSelf();
      break;
    }
    case 'cfgback': screen = 'config'; render(); break;
    case 'go': if (lobby.length >= 2) startGame(); break;
    case 'music': sound.setMusic(!sound.musicOn); renderHUD(); break;
    case 'sfx': sound.setSfx(!sound.sfxOn); renderHUD(); break;
    case 'addbot': addBot(); broadcastLobby(); save(); break;
    case 'rmbot': lobby = lobby.filter((p) => p.token !== d.t); broadcastLobby(); save(); break;
    case 'demo': {
      demo = true; code = null; lobby = []; cfg = { ...cfg, players: 4, fog: false, target: 10 };
      for (let i = 0; i < 4; i++) addBot();
      startGame(); break;
    }
    case 'exitdemo': demo = false; G = null; screen = 'start'; previewKey = ''; board.setBoard(genBoard(19), { fog: false }); board.spin(true); render(); break;
    case 'copy': try { await navigator.clipboard.writeText(joinURL()); toast('Enlace copiado'); } catch (ex) { toast(joinURL()); } break;
    case 'share': try { await navigator.share({ title: 'Catán', text: `¡Únete a mi partida! Código ${code}`, url: joinURL() }); } catch (ex) {} break;
    case 'closewin': G._winClosed = true; renderHUD(); break;
    case 'cinenext': G._cineDone = true; renderHUD(); break;
    case 'again': {
      if (demo) { G = null; lobby = []; for (let i = 0; i < 4; i++) addBot(); startGame(); break; }
      G = null; staticB = null; screen = 'lobby'; previewKey = ''; preview();
      for (const [cid] of conns) send(cid, { t: 'reset' });
      broadcastLobby(); break;
    }
  }
});
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'h' && screen === 'game') { hudHidden = !hudHidden; renderHUD(); }
  if (k === 'c' && screen === 'game') { board.followTurn = !board.followTurn; board.userMoved = 0; toast(board.followTurn ? 'La cámara sigue el turno' : 'Cámara libre'); if (board.followTurn) board.seatView(G.turn, G.players.length); renderHUD(); }
  if (k === 'm') { sound.unlock(); sound.setMusic(!sound.musicOn); if (screen === 'game') renderHUD(); }
  if (k === 's' && screen === 'game') { sound.unlock(); sound.setSfx(!sound.sfxOn); renderHUD(); }
  if (k === 'f') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); }
  if (k === 'r' && screen === 'game') { board.userMoved = 0; board.setView((G.turn / G.players.length) * Math.PI * 2); }
});
addEventListener('beforeunload', () => { if (G) save(); });

// fondo inicial: una isla girando
board.setBoard(genBoard(19), { fog: false }); board.spin(true);
if (new URLSearchParams(location.search).has('no3d')) { board.setActive(false); board.setActive = () => {}; } // solo para pruebas
render();
window.__host = { get G() { return G; }, get lobby() { return lobby; }, get code() { return code; }, board, push: () => broadcastState() };
