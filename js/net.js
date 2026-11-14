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
  let peer = null, conn = null, closed = false, tries = 0;
  const state = (s) => h.onStatus && h.onStatus(s);
  function connect() {
    if (closed) return;
    state('connecting');
    if (!peer || peer.destroyed) {
      peer = new window.Peer(PEER_OPTS);
      peer.on('open', open);
      peer.on('error', (err) => {
        if (err.type === 'peer-unavailable') { state('notfound'); retry(3000); }
        else { state('error'); retry(2500); }
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
    } else if (peer.open) open();
  }
  function open() {
    conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'raw' });
    const c = conn;
    c.on('open', () => { tries = 0; state('open'); h.onOpen && h.onOpen(); });
    c.on('data', (d) => { try { h.onMessage(typeof d === 'string' ? JSON.parse(d) : d); } catch (e) { console.warn(e); } });
    c.on('close', () => { if (conn === c) { state('lost'); retry(1500); } });
    c.on('error', () => {});
  }
  let rt = null;
  function retry(ms) {
    if (closed || rt) return;
    tries++;
    rt = setTimeout(() => { rt = null; connect(); }, Math.min(ms * tries, 8000));
  }
  connect();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && (!conn || !conn.open)) connect(); });
  return {
    send: (data) => { if (conn && conn.open) { conn.send(JSON.stringify(data)); return true; } return false; },
    close: () => { closed = true; try { peer && peer.destroy(); } catch (e) {} },
  };
}
