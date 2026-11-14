// Mapa 2D para el móvil: claro, táctil y con zoom. Coordenadas del tablero (radio de casilla = 1).
import { RINFO, isRevealed } from './engine.js';

const FILL = { wood: '#3f7f3a', brick: '#c0663b', sheep: '#8cc25a', wheat: '#e0b43e', ore: '#8a929a', desert: '#e2cf98' };
const ICON = { wood: '🌲', brick: '🧱', sheep: '🐑', wheat: '🌾', ore: '⛰️', desert: '🏜️' };
function hexPts(x, y, r) { let s = ''; for (let k = 0; k < 6; k++) { const a = (Math.PI / 180) * (60 * k - 30); s += (x + r * Math.cos(a)).toFixed(3) + ',' + (y + r * Math.sin(a)).toFixed(3) + ' '; } return s; }
export function mapBounds(B) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  B.hexes.forEach((h) => { x0 = Math.min(x0, h.x); x1 = Math.max(x1, h.x); y0 = Math.min(y0, h.y); y1 = Math.max(y1, h.y); });
  const pad = 1.6;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}
function house(x, y, k, c, cls) { return `<path class="${cls}" d="M${x - k} ${y + k * 0.8}V${y - k * 0.1}L${x} ${y - k}L${x + k} ${y - k * 0.1}V${y + k * 0.8}Z" fill="${c}" stroke="#2b2118" stroke-width=".045" stroke-linejoin="round"/>`; }
function castle(x, y, k, c, cls) {
  const p = [[-1.35, 0.9], [-1.35, -0.15], [-0.55, -0.15], [-0.55, -0.75], [0, -1.25], [0.55, -0.75], [0.55, -0.15], [1.35, -0.15], [1.35, 0.9]].map(([a, b]) => `${(x + a * k).toFixed(3)} ${(y + b * k).toFixed(3)}`).join('L');
  return `<path class="${cls}" d="M${p}Z" fill="${c}" stroke="#2b2118" stroke-width=".045" stroke-linejoin="round"/>`;
}
// G: estado reflejado (mirror). T: objetivos {v,e,h}. sel: {k:'v'|'e'|'h', id}
export function mapSVG(G, T, sel, vb) {
  const B = G.board;
  let o = `<svg id="map" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" xmlns="http://www.w3.org/2000/svg">
  <defs><filter id="mist" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation=".18"/></filter>
  <filter id="sh"><feDropShadow dx="0" dy=".05" stdDeviation=".05" flood-opacity=".35"/></filter></defs>`;
  o += `<rect x="${vb.x - 50}" y="${vb.y - 50}" width="${vb.w + 100}" height="${vb.h + 100}" fill="#2f86b5"/>`;
  B.sea.forEach((s) => (o += `<polygon points="${hexPts(s.x, s.y, 1)}" fill="#4aa3c9" stroke="#5ab2d6" stroke-width=".03"/>`));
  B.hexes.forEach((h) => {
    if (!isRevealed(G, h.id)) return;
    o += `<polygon points="${hexPts(h.x, h.y, 1)}" fill="${FILL[h.res]}" stroke="#f3e6c4" stroke-width=".06"/>`;
    o += `<text x="${h.x}" y="${h.y - 0.42}" text-anchor="middle" font-size=".42">${ICON[h.res]}</text>`;
    if (h.num) {
      const red = h.num === 6 || h.num === 8;
      o += `<circle cx="${h.x}" cy="${h.y + 0.12}" r=".32" fill="#f7edd3" stroke="#c9b78f" stroke-width=".03"/>`;
      o += `<text x="${h.x}" y="${h.y + 0.23}" text-anchor="middle" font-size=".32" font-weight="700" fill="${red ? '#c62828' : '#2b2118'}" font-family="Fredoka,sans-serif">${h.num}</text>`;
      const d = 6 - Math.abs(7 - h.num);
      for (let i = 0; i < d; i++) o += `<circle cx="${h.x + (i - (d - 1) / 2) * 0.075}" cy="${h.y + 0.33}" r=".028" fill="${red ? '#c62828' : '#2b2118'}"/>`;
    }
  });
  // niebla: manto difuminado sobre lo oculto
  if (G.opts.fog) {
    o += '<g filter="url(#mist)" opacity=".96">';
    B.hexes.forEach((h) => { if (!isRevealed(G, h.id)) o += `<polygon points="${hexPts(h.x, h.y, 1.12)}" fill="#c9d3da"/>`; });
    o += '</g>';
  }
  // puertos
  B.ports.forEach((pt) => {
    if (!isRevealed(G, pt.hex)) return;
    const e = B.edges[pt.e];
    e.v.forEach((v) => { const V = B.verts[v]; o += `<line x1="${V.x}" y1="${V.y}" x2="${pt.x}" y2="${pt.y}" stroke="#f3e6c4" stroke-width=".07" stroke-dasharray=".06 .09" stroke-linecap="round"/>`; });
    o += `<circle cx="${pt.x}" cy="${pt.y}" r=".3" fill="#f7edd3" stroke="#8b6b3e" stroke-width=".035"/>`;
    if (pt.type === 'any') o += `<text x="${pt.x}" y="${pt.y + 0.1}" text-anchor="middle" font-size=".26" font-weight="700" font-family="Fredoka,sans-serif">3:1</text>`;
    else o += `<text x="${pt.x}" y="${pt.y}" text-anchor="middle" font-size=".22">${ICON[pt.type]}</text><text x="${pt.x}" y="${pt.y + 0.2}" text-anchor="middle" font-size=".17" font-weight="700" font-family="Fredoka,sans-serif">2:1</text>`;
  });
  // caminos
  B.edges.forEach((E) => {
    if (E.road === null) return;
    const a = B.verts[E.v[0]], b = B.verts[E.v[1]], c = G.players[E.road].color;
    const sx = a.x + (b.x - a.x) * 0.15, sy = a.y + (b.y - a.y) * 0.15, ex = b.x - (b.x - a.x) * 0.15, ey = b.y - (b.y - a.y) * 0.15;
    o += `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="#2b2118" stroke-width=".2" stroke-linecap="round"/><line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="${c}" stroke-width=".12" stroke-linecap="round"/>`;
  });
  T.e.forEach((id) => {
    const E = B.edges[id], a = B.verts[E.v[0]], b = B.verts[E.v[1]], on = sel && sel.k === 'e' && sel.id === id;
    o += `<line class="tgte ${on ? 'on' : ''}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/><line class="hit" data-e="${id}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
  });
  // edificios
  B.verts.forEach((V) => {
    if (!V.b) return;
    const c = G.players[V.b.p].color;
    o += V.b.t === 'c' ? castle(V.x, V.y, 0.2, c, '') : house(V.x, V.y, 0.21, c, '');
  });
  T.v.forEach((id) => { const V = B.verts[id], on = sel && sel.k === 'v' && sel.id === id; o += `<circle class="tgtv ${on ? 'on' : ''}" cx="${V.x}" cy="${V.y}" r="${on ? 0.2 : 0.14}"/><circle class="hitv" data-v="${id}" cx="${V.x}" cy="${V.y}" r=".34"/>`; });
  // ladrón
  const rh = B.hexes[B.robber];
  if (rh && isRevealed(G, rh.id)) {
    const rx = rh.x + 0.45, ry = rh.y + 0.1;
    o += `<g filter="url(#sh)"><path d="M${rx - 0.15} ${ry + 0.2}Q${rx - 0.14} ${ry - 0.06} ${rx} ${ry - 0.09}Q${rx + 0.14} ${ry - 0.06} ${rx + 0.15} ${ry + 0.2}Z" fill="#2b2b2b"/><circle cx="${rx}" cy="${ry - 0.18}" r=".1" fill="#2b2b2b"/></g>`;
  }
  T.h.forEach((id) => { const h = B.hexes[id], on = sel && sel.k === 'h' && sel.id === id; o += `<polygon class="tgth ${on ? 'on' : ''}" data-h="${id}" points="${hexPts(h.x, h.y, 0.9)}"/>`; });
  return o + '</svg>';
}
