// Red: conexión directa entre la pantalla (anfitrión) y los móviles.
// Por defecto usa PeerJS (WebRTC). Con ?local=1 usa BroadcastChannel (pruebas en un mismo navegador).
const LOCAL = new URLSearchParams(location.search).has('local');
const PREFIX = 'colonos-v1-';
const PEER_OPTS = { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] } };

export function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}
const uid = () => Math.random().toString(36).slice(2, 10);

/* ---------- anfitrión ---------- */
export function hostRoom(code, h) {
  return LOCAL ? hostLocal(code, h) : hostPeer(code, h);
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
  return Promise.resolve({
    send: (cid, data) => ch.postMessage({ to: cid, kind: 'msg', data }),
    close: () => ch.close(),
  });
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
      conn.on('data', (d) => { try { h.onMessage(cid, typeof d === 'string' ? JSON.parse(d) : d); } catch (e) { console.warn(e); } });
      conn.on('close', () => { conns.delete(cid); h.onClose && h.onClose(cid); });
      conn.on('error', () => {});
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
    peer.on('error', (err) => {
      if (!opened) reject(err);
      else h.onError && h.onError(err);
    });
  });
}

/* ---------- móvil ---------- */
// Devuelve {send, close}. Reintenta solo si se corta.
export function joinRoom(code, h) {
  return LOCAL ? joinLocal(code, h) : joinPeer(code, h);
}
function joinLocal(code, h) {
  const me = uid(), ch = new BroadcastChannel(PREFIX + code);
  let ok = false;
  ch.onmessage = (ev) => {
    const m = ev.data;
    if (m.to !== me) return;
    if (m.kind === 'ack') { if (!ok) { ok = true; h.onOpen && h.onOpen(); } }
    else if (m.kind === 'msg') h.onMessage(m.data);
  };
  const hello = () => ch.postMessage({ to: 'host', from: me, kind: 'hello' });
  hello();
  const t = setInterval(() => { if (ok) clearInterval(t); else hello(); }, 800);
  addEventListener('pagehide', () => ch.postMessage({ to: 'host', from: me, kind: 'bye' }));
  return {
    send: (data) => ch.postMessage({ to: 'host', from: me, kind: 'msg', data }),
    close: () => { ch.postMessage({ to: 'host', from: me, kind: 'bye' }); ch.close(); },
  };
}
function joinPeer(code, h) {
  // Reconexión robusta: si algo falla se descarta todo y se vuelve a empezar desde cero.
  let peer = null, conn = null, closed = false, tries = 0, lastMsg = Date.now(), rt = null;
  const state = (s) => h.onStatus && h.onStatus(s);
  function teardown() {
    try { conn && conn.close(); } catch (e) {}
    try { peer && peer.destroy(); } catch (e) {}
    conn = null; peer = null;
  }
  function connect() {
    if (closed) return;
    clearTimeout(rt); rt = null;
    teardown();
    state('connecting');
    const p = new window.Peer(PEER_OPTS); peer = p;
    p.on('open', () => {
      if (peer !== p) return;
      const c = p.connect(PREFIX + code, { reliable: true, serialization: 'raw' }); conn = c;
      c.on('open', () => { if (conn !== c) return; tries = 0; lastMsg = Date.now(); state('open'); h.onOpen && h.onOpen(); });
      c.on('data', (d) => { lastMsg = Date.now(); try { const m = typeof d === 'string' ? JSON.parse(d) : d; if (m && m.t === 'pong') return; h.onMessage(m); } catch (e) { console.warn(e); } });
      c.on('close', () => { if (conn === c) { state('lost'); retry(800); } });
      c.on('error', () => { if (conn === c) retry(800); });
      // si en 20 s no se abre la conexión, reintentamos
      setTimeout(() => { if (conn === c && !c.open) retry(0); }, 20000);
    });
    p.on('error', (err) => { if (peer !== p) return; state(err.type === 'peer-unavailable' ? 'notfound' : 'error'); retry(1500); });
    p.on('disconnected', () => { if (peer === p && !(conn && conn.open)) retry(1000); });
  }
  function retry(ms) {
    if (closed || rt) return;
    tries++;
    rt = setTimeout(() => { rt = null; connect(); }, Math.min(ms + 400 * tries, 6000));
  }
  // latido: si la pantalla deja de responder, reconectamos
  setInterval(() => {
    if (closed || !conn || !conn.open) return;
    try { conn.send(JSON.stringify({ t: 'ping' })); } catch (e) {}
    if (Date.now() - lastMsg > 15000) { state('lost'); retry(0); }
  }, 4000);
  const wake = () => { if (!document.hidden && !closed && (!conn || !conn.open || Date.now() - lastMsg > 6000)) { tries = 0; connect(); } };
  document.addEventListener('visibilitychange', wake);
  addEventListener('pageshow', wake); addEventListener('online', wake);
  connect();
  return {
    send: (data) => { if (conn && conn.open) { try { conn.send(JSON.stringify(data)); return true; } catch (e) { retry(0); } } return false; },
    close: () => { closed = true; teardown(); },
  };
}
