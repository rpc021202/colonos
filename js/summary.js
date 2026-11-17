// Resumen al acabar la partida (se usa en la tele y en los móviles)
import { RINFO, esc } from './engine.js';

const WAYS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

// players: [{name,color}], st: {got,stole,lost,disc,hex,rolls}, hexes: tablero (res, num)
export function summaryHTML(players, st, hexes) {
  if (!st) return '';
  const rolls = st.rolls || [], cnt = {};
  for (let n = 2; n <= 12; n++) cnt[n] = 0;
  rolls.forEach((r) => cnt[r]++);
  const max = Math.max(1, ...Object.values(cnt), ...Object.keys(WAYS).map((n) => (rolls.length * WAYS[n]) / 36));
  const bars = Object.keys(cnt).map((n) => {
    const exp = (rolls.length * WAYS[n]) / 36;
    return `<div class="sb"><div class="sbar"><i style="height:${(cnt[n] / max) * 100}%" class="${+n === 7 ? 's' : ''}"></i><u style="bottom:${(exp / max) * 100}%"></u></div><b>${cnt[n]}</b><span>${n}</span></div>`;
  }).join('');
  const top = (arr) => { let b = -1, bi = -1; arr.forEach((v, i) => { if (v > b) { b = v; bi = i; } }); return b > 0 ? bi : -1; };
  const hx = Object.entries(st.hex || {}).sort((a, b) => b[1] - a[1])[0];
  const lucky = top(st.got), thief = top(st.stole), victim = top(st.lost);
  const facts = [];
  if (hx && hexes[hx[0]]) { const H = hexes[hx[0]]; facts.push(`⭐ Casilla estrella: <b>${RINFO[H.res].e} ${H.num || ''}</b>, dio ${hx[1]} recursos`); }
  if (lucky >= 0) facts.push(`🍀 Más cobró: <b>${esc(players[lucky].name)}</b> (${st.got[lucky]} cartas)`);
  if (thief >= 0) facts.push(`🦹 Más ladrón: <b>${esc(players[thief].name)}</b> (${st.stole[thief]} cartas)`);
  if (victim >= 0) facts.push(`😩 Más robado: <b>${esc(players[victim].name)}</b> (${st.lost[victim]} cartas)`);
  const sevens = cnt[7];
  if (rolls.length) facts.push(`🎲 ${rolls.length} tiradas · el 7 salió ${sevens} ${sevens === 1 ? 'vez' : 'veces'}`);
  return `<div class="summary">
    <div class="lbl" style="margin-top:14px">Dados de la partida <small>(la raya es lo esperado)</small></div><div class="sbars">${bars}</div>
    <div class="facts">${facts.map((f) => `<div>${f}</div>`).join('')}</div>
    <table class="stab"><tr><th></th><th title="Recursos cobrados con los dados">🌾 cobró</th><th title="Cartas que robó">🦹 robó</th><th title="Cartas que le robaron">💸 perdió</th><th title="Cartas descartadas con el 7">🗑️ tiró</th></tr>
    ${players.map((P, i) => `<tr><td><span class="chip" style="background:${P.color}"></span> ${esc(P.name)}</td><td>${st.got[i] || 0}</td><td>${st.stole[i] || 0}</td><td>${st.lost[i] || 0}</td><td>${st.disc[i] || 0}</td></tr>`).join('')}</table>
  </div>`;
}
export const SUMMARY_CSS = `.summary{text-align:left}.sbars{display:flex;gap:4px;align-items:flex-end;height:96px;margin:6px 0 4px}
.sb{flex:1;display:flex;flex-direction:column;align-items:center;font-size:11px;color:var(--muted)}.sb b{font-size:11px;color:var(--ink)}
.sbar{position:relative;width:100%;height:64px;background:#efe5cf;border-radius:5px;overflow:hidden}.sbar i{position:absolute;left:0;right:0;bottom:0;background:var(--accent);border-radius:5px 5px 0 0}.sbar i.s{background:#2b2118}
.sbar u{position:absolute;left:-2px;right:-2px;height:2px;background:#2f8f4e;text-decoration:none}
.facts{font-size:13.5px;margin:8px 0;display:grid;gap:3px}.stab{width:100%;border-collapse:collapse;font-size:13px}.stab th{font-size:11px;color:var(--muted);font-weight:600;text-align:center;padding:3px}
.stab td{padding:4px 3px;border-top:1px dashed var(--line);text-align:center}.stab td:first-child{text-align:left;font-weight:600;white-space:nowrap}.stab .chip{width:11px;height:11px}`;
