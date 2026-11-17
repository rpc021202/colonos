// Temas (estéticas): las reglas no cambian; cambian nombres, iconos, cartas y la jerga de los avisos.
import { RINFO, DEV, W } from './engine.js';

const snap = (o) => JSON.parse(JSON.stringify(o));
const BASE = { RINFO: snap(RINFO), DEV: snap(DEV), W: snap(W) };

export const THEMES = {
  classic: {
    name: 'Clásico', icon: '🏝️', note: 'Islas, ovejas y trigo, como el de la caja.',
    UI: {},
  },
  barrio: {
    name: 'El Barrio', icon: '🏀', note: 'Bandas por colores, calles con grafitis y la pasma rondando. Parodia, todo de mentira.',
    RINFO: {
      wood: { n: 'Sprays', e: '🎨', c: '#e8467f' },
      brick: { n: 'Pipas', e: '🔫', c: '#5b5f6b' },
      sheep: { n: 'María', e: '🌿', c: '#4e9a3a' },
      wheat: { n: 'Pasta', e: '💸', c: '#2e8b57' },
      ore: { n: 'Bling', e: '💎', c: '#c9a227' },
      desert: { n: 'Cancha', e: '🏀', c: '#d9773a' },
    },
    DEV: {
      knight: { n: 'Chivato', e: '🐀', d: 'Das un soplo: la pasma va donde digas y le levantas una carta a alguien. Se puede jugar antes de tirar.' },
      road: { n: 'Atajo', e: '🛹', d: 'Conquistas 2 calles gratis (con lowriders: o 2 tramos de autovía).' },
      plenty: { n: 'Rebajas', e: '🛍️', d: 'Pillas 2 recursos que quieras del banco.' },
      mono: { n: 'Te lo pillo todo', e: '😎', d: 'Elige un recurso: todos te dan los suyos.' },
      vp: { n: 'Cadena de oro', e: '📿', d: '+1 punto. Secreto hasta el final.' },
      pirate: { n: 'Atraco en la autovía', e: '🚨', d: 'Le levantas 2 recursos a alguien que tenga algún coche en la autovía.' },
    },
    W: {
      settlement: 'garito', city: 'mansión', road: 'calle', ship: 'lowrider', robber: 'la pasma', robberE: '🚓',
      buildSett: 'monta un garito', buildCity: 'se pilla una mansión', buildRoad: 'conquista una calle', buildShip: 'saca un lowrider a la autovía',
      upShip: 'tunea su coche: superdeportivo, 2 tramos por turno', robberMoves: 'entra con sirenas en', steals: 'le levanta una carta a',
      longest: 'la Calle más larga', army: 'la Banda más grande', noRobberSpot: 'no tiene a quién trincar',
    },
    UI: {
      build: { road: ['🎨', 'Calle (grafiti)'], settlement: ['🏠', 'Garito'], city: ['🏡', 'Mansión'], ship: ['🚗', 'Lowrider'], upship: ['🏎️', 'Superdeportivo (2 tramos)'], dev: ['🃏', 'Contacto (carta)'] },
      seven: '🚨 ¡Soplo! Entra la pasma',
      discardTitle: '🚨 ¡Redada!', discardText: 'Llevas demasiado encima: suelta la mitad antes de que te pillen.',
      robberHint: 'Toca la manzana donde entra la pasma', robberOther: (n) => `${n} manda a la pasma`,
      stealTitle: (n) => `🐀 Le levantas una carta a ${n}`, stolenTitle: (n) => `🚨 ¡${n} te está levantando una carta!`,
      turn: '¡Te toca, colega!', yourTurnRoll: 'Te toca: tira los dados, tronco',
    },
  },
};

// aplica el tema a los objetos compartidos del motor (nombres de recursos, cartas y palabras de los avisos)
export let theme = THEMES.classic, themeKey = 'classic';
export function applyTheme(key) {
  const T = THEMES[key] || THEMES.classic;
  if (T === theme) return T;
  theme = T; themeKey = THEMES[key] ? key : 'classic';
  for (const k in BASE.RINFO) Object.assign(RINFO[k], BASE.RINFO[k], (T.RINFO || {})[k] || {});
  for (const k in BASE.DEV) Object.assign(DEV[k], BASE.DEV[k], (T.DEV || {})[k] || {});
  Object.assign(W, BASE.W, T.W || {});
  return T;
}
export const ui = (k, ...a) => { const v = (theme.UI || {})[k]; return typeof v === 'function' ? v(...a) : v; };
