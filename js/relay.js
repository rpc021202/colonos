// Relevo automático: si el móvil (o la pantalla) que lleva la partida desaparece, este móvil la coge
// desde la copia guardada en el servidor de mensajes y sigue sirviéndola a todos, bots incluidos.
import { act, publicState, boardStatic } from './engine.js';
import { botAction } from './bots.js';
import { hostRelay, pack } from './net.js';

const san = (t) => (t || '').replace(/[^a-z0-9]/gi, '').slice(0, 24);

export async function startRelay(code, url, saved, onStop) {
  const G = saved.G, lobby = saved.lobby, cfg = saved.cfg;
  G.ev = [];
  const staticB = boardStatic(G), conns = new Map();
  let room = null, stopped = false, botWait = Date.now() + 1500, saveT = null;
  const send = (cid, m) => room && room.send(cid, m);
  const pidOf = (tok) => lobby.findIndex((p) => p.token === tok);
  const sendTo = (pid, m) => { const tok = lobby[pid] && lobby[pid].token; for (const [cid, t] of conns) if (t === tok) send(cid, m); };
  const broadcast = () => { for (const [cid, tok] of conns) { const pid = pidOf(tok); if (pid >= 0) send(cid, { t: 'state', s: publicState(G, pid) }); } };
  const persist = () => {
    clearTimeout(saveT);
    saveT = setTimeout(async () => { if (!stopped && room) room.save(await pack({ v: 1, at: Date.now(), code, cfg, lobby, G })); }, 300);
  };
  const register = (cid, tok) => {
    conns.set(cid, tok);
    send(cid, { t: 'start', b: staticB, you: pidOf(tok), code });
    send(cid, { t: 'state', s: publicState(G, pidOf(tok)) });
  };
  function after() {
    const evs = G.ev; G.ev = [];
    const later = (fn) => (evs.some((e) => e.t === 'roll') ? setTimeout(fn, 1800) : fn()); // se cobra cuando ya se ve el número
    evs.forEach((e) => {
      if (e.t === 'gain') later(() => sendTo(e.to, { t: 'note', m: e.m }));
      else if (e.t === 'turn') sendTo(e.p, { t: 'yourturn' });
      else if (e.t === 'sbp') sendTo(e.p, { t: 'yourturn', sbp: true });
    });
    const fx = evs.filter((e) => ['roll', 'produce', 'build', 'sail', 'pirate', 'robber', 'devbuy', 'turn', 'win'].includes(e.t) || (e.t === 'banner' && e.m.startsWith('🤝')))
      .map((e) => (e.t === 'roll' ? { t: 'roll', d: e.d } : e.t === 'produce' ? { t: 'produce', hexes: e.hexes } : e.t === 'build' ? { t: 'build', k: e.k } : e.t === 'turn' ? { t: 'turn', p: e.p, setup: !!e.setup } : e.t === 'banner' ? { t: 'trade' } : { t: e.t }));
    if (fx.length) for (const [cid] of conns) send(cid, { t: 'fx', l: fx });
    later(broadcast); persist();
  }
  function onMessage(cid, m) {
    if (stopped || !m || typeof m.t !== 'string') return;
    // los móviles ya conectados se reconocen por su canal (sale de su identificador)
    if (!conns.has(cid)) { const p = lobby.find((x) => san(x.token) === cid); if (p) register(cid, p.token); }
    if (m.t === 'ping') { send(cid, { t: 'pong' }); return; }
    if (m.t === 'hello') {
      const tok = String(m.token || '').slice(0, 40);
      if (pidOf(tok) < 0) { send(cid, { t: 'full', m: 'La partida ya ha empezado.' }); return; }
      register(cid, tok); return;
    }
    if (m.t === 'act') {
      const pid = pidOf(conns.get(cid)); if (pid < 0) return;
      const e = act(G, pid, m.a || {});
      if (e) { send(cid, { t: 'err', m: e }); G.ev = []; return; }
      after();
    }
  }
  room = await hostRelay(code, { epoch: Date.now(), onMessage, onReplaced: () => stop() }, url);
  const bots = setInterval(() => {
    if (stopped || G.winner !== null || Date.now() < botWait) return;
    if (G.offer && !G.offer._ts) G.offer._ts = Date.now();
    for (let p = 0; p < lobby.length; p++) {
      if (!lobby[p] || !lobby[p].bot) continue;
      const a = botAction(G, p); if (!a) continue;
      let e = act(G, p, a);
      if (e) { G.ev = []; e = act(G, p, { t: G.phase === 'sbp' ? 'pass' : 'end' }); if (e) { G.ev = []; continue; } }
      const rolled = G.ev.some((x) => x.t === 'roll'), built = G.ev.some((x) => x.t === 'build');
      after();
      botWait = Date.now() + (rolled ? 2600 : built ? 1300 : a.t === 'respond' ? 300 : 800) * 0.8;
      return;
    }
  }, 200);
  persist();
  function stop() { if (stopped) return; stopped = true; clearInterval(bots); clearTimeout(saveT); try { room.close(); } catch (e) {} onStop && onStop(); }
  return { stop };
}
