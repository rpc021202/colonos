// Red entre la pantalla (anfitrión) y los móviles.
// Por defecto: servidor de mensajes MQTT por WebSocket (aguanta muy bien que el móvil se bloquee o cambie de app).
// Si no hay servidor disponible: conexión directa PeerJS (?t=p). Con ?local=1: BroadcastChannel (pruebas).
const QS = new URLSearchParams(location.search);
const LOCAL = QS.has('local');
const PREFIX = 'colonos-v1-';
const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
const PEER_OPTS = { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] } };
const uid = () => Math.random().toString(36).slice(2, 10);

export function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}
// parámetros que el anfitrión añade al enlace para que los móviles usen el mismo canal
export let linkParams = {};

/* ================= ANFITRIÓN ================= */
export async function hostRoom(code, h) {
  if (LOCAL) return hostLocal(code, h);
  const forced = QS.get('broker');
  const list = forced ? [forced] : BROKERS;
  if (QS.get('t') !== 'p' && window.mqtt) {
    for (let i = 0; i < list.length; i++) {
      try { const r = await hostMqtt(code, h, list[i]); linkParams = forced ? { broker: forced } : i ? { b: String(i) } : {}; return r; } catch (e) { console.warn('broker', list[i], e); }
    }
  }
  linkParams = { t: 'p' };
  return hostPeer(code, h);
}
// latido: el anfitrión da por desconectado a quien lleve 25 s sin dar señales
function liveness(h) {
  const seen = new Map();
  setInterval(() => { const now = Date.now(); for (const [cid, t] of seen) if (now - t > 25000) { seen.delete(cid); h.onClose && h.onClose(cid); } }, 3000);
  return (cid) => { if (!seen.has(cid)) h.onConnect && h.onConnect(cid); seen.set(cid, Date.now()); };
}
function hostMqtt(code, h, url) {
  return new Promise((resolve, reject) => {
    const base = 'colonos/v1/' + code;
    const c = window.mqtt.connect(url, { clientId: 'colonos-h-' + code + '-' + uid(), clean: true, reconnectPeriod: 1500, connectTimeout: 7000, keepalive: 20 });
    let ok = false;
    const seen = liveness(h);
    const fail = setTimeout(() => { if (!ok) { try { c.end(true); } catch (e) {} reject(new Error('timeout')); } }, 8000);
    c.on('connect', () => {
      c.subscribe(base + '/u/+', { qos: 1 });
      if (!ok) {
        ok = true; clearTimeout(fail);
        resolve({
          send: (cid, data) => c.publish(base + '/d/' + cid, JSON.stringify(data), { qos: 1 }),
          close: () => c.end(true),
        });
      }
    });
    c.on('message', (topic, payload) => {
      const cid = topic.split('/').pop();
      let m; try { m = JSON.parse(payload.toString()); } catch (e) { return; }
      seen(cid);
      h.onMessage(cid, m);
    });
    c.on('error', (e) => { if (!ok) { clearTimeout(fail); try { c.end(true); } catch (x) {} reject(e); } });
  });
}
function hostLocal(code, h) {
  const ch = new BroadcastChannel(PREFIX + code);
  const clients = new Set();
  ch.onmessage = (ev) => {
    const m = ev.data;
    if (m.to !== 'host') return;
    if (m.kind === 'hello') { clients.add(m.from); ch.postMessage({ to: m.from, kind: 'ack' }); h.onConnect && h.onConnect(m.from); }
    else if (m.kind === 'msg' && clients.has(m.from)) h.onMessage(m.from, m.data);
    else if (m.kind === 'bye') { clients.delete(m.from); h.onClose && h.onClose(m.from); }
  };
  return Promise.resolve({ send: (cid, data) => ch.postMessage({ to: cid, kind: 'msg', data }), close: () => ch.close() });
}
function hostPeer(code, h) {
  return new Promise((resolve, reject) => {
    const peer = new window.Peer(PREFIX + code, PEER_OPTS);
    const conns = new Map();
    let opened = false;
    peer.on('open', () => {
      opened = true;
      resolve({
        send: (cid, data) => { const c = conns.get(cid); if (c && c.open) { try { c.send(JSON.stringify(data)); } catch (e) {} } },
        close: () => peer.destroy(),
      });
    });
    peer.on('connection', (conn) => {
      const cid = conn.connectionId || uid();
      conn.on('open', () => { conns.set(cid, conn); h.onConnect && h.onConnect(cid); });
      conn.on('data', (d) => { try { h.onMessage(cid, typeof d === 'string' ? JSON.parse(d) : d); } catch (e) {} });
      conn.on('close', () => { conns.delete(cid); h.onClose && h.onClose(cid); });
      conn.on('error', () => {});
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
    peer.on('error', (err) => { if (!opened) reject(err); else h.onError && h.onError(err); });
  });
}

/* ================= MÓVIL ================= */
// h: {onOpen, onMessage, onStatus}. token: identificador de este móvil en la sala.
export function joinRoom(code, h, token) {
  if (LOCAL) return joinLocal(code, h);
  if (QS.get('t') === 'p' || !window.mqtt) return joinPeer(code, h);
  const url = QS.get('broker') || BROKERS[+QS.get('b') || 0] || BROKERS[0];
  return joinMqtt(code, h, token, url);
}
function joinMqtt(code, h, token, url) {
  const base = 'colonos/v1/' + code, me = (token || uid()).replace(/[^a-z0-9]/gi, '').slice(0, 24) || uid();
  const state = (s) => h.onStatus && h.onStatus(s);
  let c = null, closed = false, lastIn = Date.now();
  const pending = []; // mensajes enviados sin conexión: se mandan al reconectar
  function start() {
    if (closed) return;
    lastStart = Date.now();
    if (c) { const old = c; c = null; try { old.end(true); } catch (e) {} }
    state('connecting');
    const cl = window.mqtt.connect(url, { clientId: 'colonos-c-' + me.slice(0, 12) + '-' + uid(), clean: true, reconnectPeriod: 1000, connectTimeout: 8000, keepalive: 10 });
    c = cl;
    cl.on('connect', () => {
      if (c !== cl) return;
      cl.subscribe(base + '/d/' + me, { qos: 1 }, () => {
        if (c !== cl) return;
        lastIn = Date.now(); state('open');
        while (pending.length) cl.publish(base + '/u/' + me, pending.shift(), { qos: 1 });
        h.onOpen && h.onOpen();
      });
    });
    cl.on('message', (topic, payload) => { lastIn = Date.now(); try { const m = JSON.parse(payload.toString()); if (m && m.t === 'pong') return; h.onMessage(m); } catch (e) {} });
    cl.on('reconnect', () => { if (c === cl) state('connecting'); });
    cl.on('offline', () => { if (c === cl) state('lost'); });
    cl.on('close', () => { if (c === cl && !closed) state('lost'); });
  }
  const send = (data) => {
    const msg = JSON.stringify(data);
    if (c && c.connected) c.publish(base + '/u/' + me, msg, { qos: 1 });
    else if (data.t !== 'ping') { pending.push(msg); if (pending.length > 20) pending.shift(); }
    return true;
  };
  // latido: la pantalla sabe que seguimos aquí y nosotros sabemos que la conexión vive (responde con pong)
  let lastStart = Date.now();
  setInterval(() => {
    if (closed || document.hidden) return;
    if (c && c.connected) { send({ t: 'ping' }); if (Date.now() - lastIn > 16000) start(); }
    else if (Date.now() - lastStart > 10000) start(); // reintento enérgico si lleva rato sin conectar
  }, 3000);
  // al volver de otra app o desbloquear: si no hay conexión, se rehace al momento; si la hay, pedimos el estado actual
  const wake = () => {
    if (document.hidden || closed) return;
    if (!c || !c.connected) { if (Date.now() - lastStart > 1500) start(); return; }
    // parece conectado: pedimos el estado y comprobamos que de verdad responde
    const t0 = Date.now();
    h.onOpen && h.onOpen(); send({ t: 'ping' });
    setTimeout(() => { if (!closed && lastIn < t0) start(); }, 3500);
  };
  document.addEventListener('visibilitychange', wake);
  addEventListener('pageshow', wake); addEventListener('online', wake); addEventListener('focus', wake);
  start();
  return { send, close: () => { closed = true; try { c && c.end(true); } catch (e) {} } };
}
function joinLocal(code, h) {
  const me = uid(), ch = new BroadcastChannel(PREFIX + code);
  let ok = false;
  ch.onmessage = (ev) => {
    const m = ev.data;
    if (m.to !== me) return;
    if (m.kind === 'ack') { if (!ok) { ok = true; h.onStatus && h.onStatus('open'); h.onOpen && h.onOpen(); } }
    else if (m.kind === 'msg') h.onMessage(m.data);
  };
  const hello = () => ch.postMessage({ to: 'host', from: me, kind: 'hello' });
  hello();
  const t = setInterval(() => { if (ok) clearInterval(t); else hello(); }, 800);
  addEventListener('pagehide', () => ch.postMessage({ to: 'host', from: me, kind: 'bye' }));
  return {
    send: (data) => { ch.postMessage({ to: 'host', from: me, kind: 'msg', data }); return true; },
    close: () => { ch.postMessage({ to: 'host', from: me, kind: 'bye' }); ch.close(); },
  };
}
function joinPeer(code, h) {
  let peer = null, conn = null, closed = false, tries = 0, lastMsg = Date.now(), rt = null;
  const state = (s) => h.onStatus && h.onStatus(s);
  function teardown() { try { conn && conn.close(); } catch (e) {} try { peer && peer.destroy(); } catch (e) {} conn = null; peer = null; }
  function connect() {
    if (closed) return;
    clearTimeout(rt); rt = null; teardown(); state('connecting');
    const p = new window.Peer(PEER_OPTS); peer = p;
    p.on('open', () => {
      if (peer !== p) return;
      const c = p.connect(PREFIX + code, { reliable: true, serialization: 'raw' }); conn = c;
      c.on('open', () => { if (conn !== c) return; tries = 0; lastMsg = Date.now(); state('open'); h.onOpen && h.onOpen(); });
      c.on('data', (d) => { lastMsg = Date.now(); try { const m = typeof d === 'string' ? JSON.parse(d) : d; if (m && m.t === 'pong') return; h.onMessage(m); } catch (e) {} });
      c.on('close', () => { if (conn === c) { state('lost'); retry(800); } });
      c.on('error', () => { if (conn === c) retry(800); });
      setTimeout(() => { if (conn === c && !c.open) retry(0); }, 20000);
    });
    p.on('error', (err) => { if (peer !== p) return; state(err.type === 'peer-unavailable' ? 'notfound' : 'error'); retry(1500); });
    p.on('disconnected', () => { if (peer === p && !(conn && conn.open)) retry(1000); });
  }
  function retry(ms) { if (closed || rt) return; tries++; rt = setTimeout(() => { rt = null; connect(); }, Math.min(ms + 400 * tries, 6000)); }
  setInterval(() => { if (closed || !conn || !conn.open) return; try { conn.send(JSON.stringify({ t: 'ping' })); } catch (e) {} if (Date.now() - lastMsg > 15000) { state('lost'); retry(0); } }, 4000);
  const wake = () => { if (!document.hidden && !closed && (!conn || !conn.open || Date.now() - lastMsg > 6000)) { tries = 0; connect(); } };
  document.addEventListener('visibilitychange', wake); addEventListener('pageshow', wake); addEventListener('online', wake);
  connect();
  return {
    send: (data) => { if (conn && conn.open) { try { conn.send(JSON.stringify(data)); return true; } catch (e) { retry(0); } } return false; },
    close: () => { closed = true; teardown(); },
  };
}
