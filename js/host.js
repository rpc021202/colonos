// Pantalla de juego (ordenador o tele): configurador, sala con QR y tablero 3D.
import { newGame, act, publicState, boardStatic, genBoard, hexCountFor, DENSITIES, COLORS, actor, pn, esc, vp, total } from './engine.js';
import { Board3D } from './board3d.js';
import { hostRoom, makeCode } from './net.js';

const $ = (s) => document.querySelector(s);
const SAVE = 'colonos-host-v1';
const LOCAL = new URLSearchParams(location.search).has('local');
const board = new Board3D($('#scene'));

let cfg = { players: 4, density: 'normal', fog: false, target: 10, sbp: true, mode: 'classic' };
let screen = 'start'; // start | config | lobby | game
let room = null, code = null, G = null, staticB = null;
let lobby = []; // {token,name,color,online}
const conns = new Map(); // cid -> token
let hudHidden = false, err = '';

/* ---------- utilidades ---------- */
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
const bannerQ = []; let bannerBusy = false;
function banner(m) { bannerQ.push(m); if (!bannerBusy) nextBanner(); }
function nextBanner() {
  const b = $('#banner'); const m = bannerQ.shift();
  if (!b || !m) { bannerBusy = false; return; }
  bannerBusy = true; b.textContent = m; b.classList.add('show');
  setTimeout(() => { b.classList.remove('show'); setTimeout(nextBanner, 350); }, 2300);
}
function joinURL() {
  const u = new URL('jugar.html', location.href);
  u.search = ''; u.hash = '';
  u.searchParams.set('sala', code);
  if (LOCAL) u.searchParams.set('local', '1');
  return u.toString();
}
function qrSVG(text, cell = 6) {
  try { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: cell, margin: 0, scalable: true }); }
  catch (e) { return ''; }
}
function save() {
  try { localStorage.setItem(SAVE, JSON.stringify({ code, cfg, lobby: lobby.map(({ token, name, color }) => ({ token, name, color })), G, t: Date.now() })); } catch (e) {}
}
function loadSave() { try { return JSON.parse(localStorage.getItem(SAVE) || 'null'); } catch (e) { return null; } }
function tokenToPid(token) { return lobby.findIndex((p) => p.token === token); }

/* ---------- vista previa del mapa ---------- */
let previewKey = '';
function preview() {
  const N = hexCountFor(cfg.players, cfg.density);
  const k = N + '-' + cfg.fog;
  if (k === previewKey) return;
  previewKey = k;
  board.setBoard(genBoard(N), { fog: false });
  board.spin(true);
}

/* ---------- render de pantallas ---------- */
function render() {
  const ui = $('#ui');
  if (screen === 'start') {
    const s = loadSave();
    const canResume = s && s.code && s.G && s.G.winner === null && Date.now() - (s.t || 0) < 1000 * 60 * 60 * 24 * 3;
    ui.innerHTML = `<div id="start"><div class="card">
      <h1>⬡ Colonos</h1><div class="sub">Esta pantalla será el tablero. Cada jugador se une con su móvil.</div>
      <button class="primary big" data-a="new">Crear partida</button>
      ${canResume ? `<button class="big ghost" data-a="resume">Reanudar sala ${esc(s.code)} · ${s.G.players.length} jugadores</button>` : ''}
      <button class="big ghost" data-a="joinhere">Unirme como jugador desde este dispositivo</button>
      ${err ? `<div class="err">${esc(err)}</div>` : ''}
    </div></div>`;
    return;
  }
  if (screen === 'config') {
    preview();
    const seg = (key, vals) => `<div class="seg">${vals.map(([v, l, dis]) => `<button class="${cfg[key] === v ? 'sel' : ''}" data-a="cfg" data-k="${key}" data-v="${v}" ${dis ? 'disabled' : ''}>${l}</button>`).join('')}</div>`;
    ui.innerHTML = `<div id="config"><div class="card">
      <h1>Nueva partida</h1><div class="sub">Configura la partida. Después aparecerá el QR para unirse.</div>
      <label class="lbl">¿Cuántos vais a jugar?</label>${seg('players', [2, 3, 4, 5, 6, 7, 8].map((n) => [n, n]))}
      <label class="lbl">Tamaño del mapa</label>
      <div class="sizes">${DENSITIES.map((d) => `<button class="${cfg.density === d.k ? 'sel' : ''}" data-a="cfg" data-k="density" data-v="${d.k}"><span class="n">${hexCountFor(cfg.players, d.k)}</span><b>${d.n}</b><span>${d.note} · ${d.d} por jugador</span></button>`).join('')}</div>
      <div class="note">El original son 19 hexágonos para 4 (4,75 por jugador): por debajo de eso no bajamos. Si al final os unís más o menos, se mantiene el espacio por jugador.</div>
      <label class="lbl">Modo de juego</label>${seg('mode', [['classic', '🏝️ Clásico'], ['ships', '⛵ Barcos · próximamente', true]])}
      <label class="lbl">Mapa</label>${seg('fog', [[false, '🗺️ Visible'], [true, '🌫️ A ciegas']])}
      <div class="note">${cfg.fog ? 'Todo empieza cubierto de niebla: cada poblado o camino despeja los hexágonos que toca.' : 'Se ve todo el mapa desde el principio, como el original.'}</div>
      <label class="lbl">Puntos para ganar</label>${seg('target', [[8, '8'], [10, '10'], [12, '12'], [14, '14']])}
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
      <div class="plist">${lobby.length ? lobby.map((p, i) => `<div class="prow"><span class="chip" style="background:${p.color}"></span>${esc(p.name)}${i === 0 ? ' <small>anfitrión</small>' : ''}${p.online ? '' : ' <small>desconectado</small>'}</div>`).join('') : '<div class="empty">Esperando a que se una alguien…</div>'}</div>
      <div class="note">Mapa: ${hexCountFor(Math.max(2, lobby.length || cfg.players), cfg.density)} hexágonos · ${cfg.fog ? 'a ciegas' : 'visible'} · ${cfg.target} puntos</div>
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
    case 'roadbuild': return `Construye ${G.rbLeft} camino${G.rbLeft > 1 ? 's' : ''} gratis`;
    case 'sbp': return `Construcción extra: ${G.players[a].name}`;
    default: return G.offer ? '🤝 Ofrece un trato' : 'Construye y comercia';
  }
}
function renderHUD() {
  const T = G.players[G.turn], online = new Set([...conns.values()]);
  $('#ui').innerHTML = `<div id="hud" class="layer ${hudHidden ? 'off' : ''}">
    <div id="turn"><span class="chip" style="background:${T.color}"></span><div><div class="who">${pn(G, G.turn)}</div><div class="what">${esc(phaseText())}</div></div></div>
    <div id="room"><div class="qr">${qrSVG(joinURL(), 3)}</div><div><div class="note" style="margin:0">Sala</div><b>${code}</b></div></div>
    <div id="strip">${G.players.map((P, i) => `<div class="pc ${i === G.turn ? 'cur' : ''} ${online.has(lobby[i] && lobby[i].token) ? '' : 'off'}"><span class="chip" style="background:${P.color}"></span><span class="nm">${esc(P.name)}</span><span class="st">🃏${total(G, i)} 📜${P.dev.length}${G.longest === i ? ' 🛣️' : ''}${G.army === i ? ' ⚔️' : ''}</span><span class="vp">${vp(G, i, G.winner !== null)}</span></div>`).join('')}</div>
    <div id="keys">Ratón: girar · Rueda: zoom · C: cámara ${board.followTurn ? 'sigue el turno' : 'libre'} · H: ocultar · F: pantalla completa</div>
  </div>
  ${G.winner !== null && !G._winClosed ? `<div id="win"><div class="card"><h2>🏆 ¡${pn(G, G.winner)} gana!</h2>
    ${G.players.map((_, i) => i).sort((a, b) => vp(G, b, true) - vp(G, a, true)).map((i) => `<div class="score"><span class="chip" style="background:${G.players[i].color}"></span>${pn(G, i)}<span>${vp(G, i, true)}</span></div>`).join('')}
    <div class="seg" style="margin-top:18px"><button class="ghost" data-a="closewin">Ver tablero</button><button class="primary" data-a="again">Otra partida</button></div></div></div>` : ''}`;
}

/* ---------- red ---------- */
async function openRoom(c) {
  code = c;
  room = await hostRoom(code, {
    onConnect: () => {},
    onMessage: onMsg,
    onClose: (cid) => {
      const tok = conns.get(cid); conns.delete(cid);
      const p = lobby.find((x) => x.token === tok);
      if (p && ![...conns.values()].includes(tok)) {
        p.online = false;
        if (screen === 'lobby') { lobby = lobby.filter((x) => x !== p); broadcastLobby(); }
        render();
      }
    },
    onError: (e) => toast('Problema de conexión: ' + (e.type || e.message || e)),
  });
}
function send(cid, m) { room && room.send(cid, m); }
function broadcastLobby() {
  for (const [cid, tok] of conns) send(cid, { t: 'lobby', you: tokenToPid(tok), players: lobby.map((p) => ({ name: p.name, color: p.color })), cfg: { fog: cfg.fog, target: cfg.target, N: hexCountFor(Math.max(2, lobby.length), cfg.density) } });
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
function afterAct() {
  const evs = G.ev; G.ev = [];
  let rolled = false;
  evs.forEach((e) => {
    if (e.t === 'roll') { rolled = true; board.rollDice(e.d[0], e.d[1]); }
    else if (e.t === 'produce') setTimeout(() => board.produce(e.hexes, e.flows), rolled ? 1700 : 0);
    else if (e.t === 'reveal') setTimeout(() => board.revealHexes(e.hexes), 650);
    else if (e.t === 'banner') banner(e.m);
    else if (e.t === 'gain') sendTo(e.to, { t: 'note', m: e.m });
    else if (e.t === 'turn') { board.seatView(e.p, G.players.length); sendTo(e.p, { t: 'yourturn' }); }
    else if (e.t === 'sbp') sendTo(e.p, { t: 'yourturn', sbp: true });
    else if (e.t === 'win') setTimeout(() => banner(`🏆 ¡${G.players[e.p].name} gana!`), 300);
  });
  board.syncPieces(publicState(G, -1), G.players.map((p) => p.color));
  broadcastState();
  renderHUD();
  save();
}

/* ---------- empezar ---------- */
function startGame() {
  const players = lobby.map((p) => ({ name: p.name, color: p.color }));
  G = newGame({ players, density: cfg.density, fog: cfg.fog, target: cfg.target, sbp: cfg.sbp });
  staticB = boardStatic(G);
  screen = 'game';
  board.spin(false);
  board.ready = false;
  board.setBoard(staticB, { fog: cfg.fog, revealed: G.revealed });
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
  staticB = boardStatic(G);
  try { await openRoom(s.code); }
  catch (e) { err = 'No se ha podido reabrir la sala (puede tardar un minuto en liberarse). Prueba de nuevo.'; G = null; render(); return; }
  screen = 'game'; board.spin(false); board.ready = false;
  board.setBoard(staticB, { fog: G.opts.fog, revealed: G.revealed });
  board.syncPieces(publicState(G, -1), G.players.map((p) => p.color));
  board.ready = true; render();
  toast('Sala reabierta: los móviles se reconectan solos');
}

/* ---------- eventos ---------- */
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-a]'); if (!t) return;
  const d = t.dataset;
  switch (d.a) {
    case 'new': err = ''; screen = 'config'; render(); break;
    case 'resume': err = ''; resume(); break;
    case 'joinhere': location.href = 'jugar.html' + (LOCAL ? '?local=1' : ''); break;
    case 'back': screen = 'start'; render(); break;
    case 'cfg': {
      let v = d.v; if (v === 'true') v = true; else if (v === 'false') v = false; else if (!isNaN(+v)) v = +v;
      cfg[d.k] = v; render(); break;
    }
    case 'create': {
      t.disabled = true; t.textContent = 'Creando sala…';
      for (let i = 0; i < 4; i++) {
        try { await openRoom(makeCode()); break; }
        catch (ex) { if (i === 3) { err = 'No se ha podido crear la sala. Revisa la conexión a internet.'; render(); return; } }
      }
      err = ''; screen = 'lobby'; render(); save(); break;
    }
    case 'cfgback': screen = 'config'; render(); break;
    case 'go': if (lobby.length >= 2) startGame(); break;
    case 'copy': try { await navigator.clipboard.writeText(joinURL()); toast('Enlace copiado'); } catch (ex) { toast(joinURL()); } break;
    case 'share': try { await navigator.share({ title: 'Colonos', text: `¡Únete a mi partida! Código ${code}`, url: joinURL() }); } catch (ex) {} break;
    case 'closewin': G._winClosed = true; renderHUD(); break;
    case 'again': {
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
  if (k === 'f') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); }
  if (k === 'r' && screen === 'game') { board.userMoved = 0; board.setView((G.turn / G.players.length) * Math.PI * 2); }
});
addEventListener('beforeunload', () => { if (G) save(); });

// fondo inicial: una isla girando
board.setBoard(genBoard(19), { fog: false }); board.spin(true);
render();
window.__host = { get G() { return G; }, get lobby() { return lobby; }, get code() { return code; }, board };
