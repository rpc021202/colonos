// Sonido generado en el navegador: música medieval y efectos (sin archivos de audio).
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const rnd = (a, b) => a + Math.random() * (b - a);

class Sound {
  constructor() { this.ctx = null; this.kp = 'colonos-'; this.musicOn = store.get('colonos-music', true); this.sfxOn = store.get('colonos-sfx', true); this.pluckCache = {}; this.theme = 'classic'; }
  // el móvil guarda sus preferencias aparte de la tele (por defecto: efectos sí, música no)
  useKeys(kp, music, sfx) { this.kp = kp; this.musicOn = store.get(kp + 'music', music); this.sfxOn = store.get(kp + 'sfx', sfx); }
  // hay que llamarlo desde un clic (los navegadores no dejan sonar sin interacción)
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
      // pequeña reverberación de sala de castillo
      this.verb = this.ctx.createConvolver(); this.verb.buffer = this.impulse(2.2, 2.5);
      this.verbGain = this.ctx.createGain(); this.verbGain.gain.value = 0.28; this.verb.connect(this.verbGain); this.verbGain.connect(this.master);
      this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = this.musicOn ? 0.22 : 0; this.musicBus.connect(this.master); this.musicBus.connect(this.verb);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = this.sfxOn ? 0.8 : 0; this.sfxBus.connect(this.master); this.sfxBus.connect(this.verb);
      this.noiseBuf = this.noise(2);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.playing) this.startMusic();
  }
  impulse(sec, decay) { const r = this.ctx.sampleRate, len = r * sec, b = this.ctx.createBuffer(2, len, r); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); } return b; }
  noise(sec) { const r = this.ctx.sampleRate, b = this.ctx.createBuffer(1, r * sec, r), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
  setMusic(on) { this.musicOn = on; store.set(this.kp + 'music', on); if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.3); }
  setSfx(on) { this.sfxOn = on; store.set(this.kp + 'sfx', on); if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.1); }

  // cambia la música y los efectos según la estética (clásico / barrio)
  setTheme(k) {
    k = k === 'barrio' ? 'barrio' : 'classic'; if (k === this.theme) return; this.theme = k;
    if (this.ctx && this.playing) { this.playing = false; clearTimeout(this.musicTimer); this.verbGain.gain.value = k === 'barrio' ? 0.1 : 0.28; this.startMusic(); }
  }

  /* ---------- instrumentos ---------- */
  // cuerda pulsada (Karplus-Strong) con cuerpo de laúd
  pluckBuffer(freq) {
    const key = Math.round(freq * 10);
    if (this.pluckCache[key]) return this.pluckCache[key];
    const r = this.ctx.sampleRate, len = Math.floor(r * 2.2), b = this.ctx.createBuffer(1, len, r), d = b.getChannelData(0);
    const N = Math.max(2, Math.floor(r / freq)), ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0, prev = 0;
    for (let i = 0; i < len; i++) { const v = ring[idx]; const nv = 0.5 * (v + prev) * 0.996; prev = v; ring[idx] = nv; d[i] = v; idx = (idx + 1) % N; }
    return (this.pluckCache[key] = b);
  }
  pluck(freq, t, vol = 0.5, bus = this.musicBus) {
    const s = this.ctx.createBufferSource(); s.buffer = this.pluckBuffer(freq);
    const f = this.ctx.createBiquadFilter(); f.type = 'peaking'; f.frequency.value = 900; f.gain.value = 4;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 2);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t); s.stop(t + 2.1);
  }
  // bordón tipo zanfona: dos notas sostenidas con un leve vibrato
  drone(t, dur, f1, f2) {
    [f1, f2].forEach((f, i) => {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 4.5 + i; const lg = this.ctx.createGain(); lg.gain.value = f * 0.004; lfo.connect(lg); lg.connect(o.frequency);
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 2;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.6); g.gain.setValueAtTime(0.05, t + dur - 0.6); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(lp); lp.connect(g); g.connect(this.musicBus); o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    });
  }
  // flauta dulce para la melodía
  flute(freq, t, dur, vol = 0.12) {
    const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 5.2; const lg = this.ctx.createGain(); lg.gain.value = freq * 0.006; lfo.connect(lg); lg.connect(o.frequency);
    const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf; const nf = this.ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = freq * 2; nf.Q.value = 3; const ng = this.ctx.createGain(); ng.gain.value = 0.02;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.05); g.gain.setValueAtTime(vol * 0.85, t + dur * 0.7); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); n.connect(nf); nf.connect(ng); ng.connect(g); g.connect(this.musicBus);
    o.start(t); lfo.start(t); n.start(t, Math.random()); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05); n.stop(t + dur + 0.05);
  }
  // tambor de mano (bodhrán)
  drum(t, vol = 0.5, low = true) {
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(low ? 110 : 180, t); o.frequency.exponentialRampToValueAtTime(low ? 50 : 90, t + 0.15);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + 0.32);
    this.noiseHit(t, 0.06, 1200, vol * 0.25, 'lowpass', this.musicBus);
  }
  noiseHit(t, dur, freq, vol, type = 'bandpass', bus = this.sfxBus, q = 1.5) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
  }
  tone(freq, t, dur, vol, type = 'sine', bus = this.sfxBus, endFreq) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
  }

  /* ---------- música: melodía modal en re dórico que va variando ---------- */
  startMusic() {
    if (this.theme === 'barrio') return this.startBoomBap();
    this.playing = true;
    const ctx = this.ctx, beat = 60 / 92 / 2; // corcheas de un 6/8 tranquilo
    const D = 146.83, scale = [0, 2, 3, 5, 7, 9, 10, 12, 14, 15, 17, 19];
    const f = (deg, oct = 0) => D * Math.pow(2, (scale[((deg % 7) + 7) % 7] + 12 * (Math.floor(deg / 7) + oct)) / 12);
    const chords = [[0, 2, 4], [6, 1, 3], [0, 2, 4], [4, 6, 1], [3, 5, 0], [6, 1, 3], [4, 6, 1], [0, 2, 4]]; // i VII i v iv VII v i
    let bar = 0, next = ctx.currentTime + 0.3, deg = 7;
    const phrase = () => { // genera 6 corcheas de melodía con paseo suave por la escala
      const out = [];
      for (let i = 0; i < 6; i++) {
        if (Math.random() < 0.18 && i % 3 !== 0) { out.push(null); continue; }
        deg += [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)];
        deg = Math.max(4, Math.min(12, deg));
        out.push(deg);
      }
      return out;
    };
    const tick = () => {
      if (!this.playing) return;
      while (next < ctx.currentTime + 1.2) {
        const ch = chords[bar % chords.length], t0 = next;
        if (bar % 8 === 0) this.drone(t0, beat * 6 * 8, D / 2, D * 0.75);
        // arpegio de laúd
        [0, 1, 2, 1, 2, 1].forEach((k, i) => this.pluck(f(ch[k], i === 0 ? -1 : 0), t0 + i * beat, i === 0 ? 0.55 : 0.32));
        // melodía de flauta (no siempre, para que respire)
        const section = Math.floor(bar / 8) % 3;
        if (section !== 2) {
          const mel = phrase();
          if (bar % 8 === 7) { mel.fill(null); mel[0] = ch[0] + 7; }
          mel.forEach((d, i) => { if (d !== null) { const len = mel[i + 1] === null ? 2 : 1; this.flute(f(d), t0 + i * beat, beat * len * 0.95, 0.09); } });
        } else {
          // sección de laúd solo con bajos marcados
          this.pluck(f(ch[0] + 7), t0 + beat * 3, 0.3);
        }
        // tambor: 1 y 4 del compás de 6/8
        this.drum(t0, 0.35, true); this.drum(t0 + beat * 3, 0.22, false);
        if (Math.random() < 0.4) this.drum(t0 + beat * 5, 0.12, false);
        next += beat * 6; bar++;
      }
      this.musicTimer = setTimeout(tick, 300);
    };
    tick();
  }

  /* ---------- barrio: base de rap de los 90 (boom bap) ---------- */
  kick(t, vol = 0.9) {
    const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    o.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + 0.45);
    this.noiseHit(t, 0.02, 2500, vol * 0.25, 'lowpass', this.musicBus);
  }
  snare(t, vol = 0.6) {
    this.noiseHit(t, 0.22, 1900, vol, 'bandpass', this.musicBus, 0.7);
    this.noiseHit(t, 0.12, 5000, vol * 0.4, 'highpass', this.musicBus, 0.7);
    this.tone(190, t, 0.1, vol * 0.4, 'triangle', this.musicBus, 150);
  }
  hat(t, vol = 0.12, open = false) { this.noiseHit(t, open ? 0.18 : 0.04, 8000, vol, 'highpass', this.musicBus, 0.8); }
  bassNote(f, t, dur, vol = 0.32) {
    const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + dur + 0.05);
  }
  keys(freqs, t, dur, vol = 0.05) { // piano eléctrico apagado, como sampleado de un vinilo
    freqs.forEach((f) => [0, 1].forEach((d) => {
      const o = this.ctx.createOscillator(); o.type = d ? 'triangle' : 'sine'; o.frequency.value = f * (d ? 1.003 : 1);
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 4.8; const lg = this.ctx.createGain(); lg.gain.value = 0.25; // trémolo
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(vol * 0.3, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      const tg = this.ctx.createGain(); tg.gain.value = 1; lfo.connect(lg); lg.connect(tg.gain);
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500;
      o.connect(lp); lp.connect(g); g.connect(tg); tg.connect(this.musicBus); o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    }));
  }
  scratch(t, vol = 0.18) { // «rasca» del DJ
    [0, 0.12].forEach((d, i) => {
      const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 6; f.frequency.setValueAtTime(i ? 2400 : 500, t + d); f.frequency.exponentialRampToValueAtTime(i ? 500 : 2400, t + d + 0.1);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t + d); g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.11);
      s.connect(f); f.connect(g); g.connect(this.musicBus); s.start(t + d, Math.random()); s.stop(t + d + 0.12);
    });
  }
  crackle(t, dur) { for (let i = 0; i < dur * 6; i++) this.noiseHit(t + Math.random() * dur, 0.004, 3000 + Math.random() * 3000, 0.05 + Math.random() * 0.05, 'bandpass', this.musicBus, 2); }
  startBoomBap() {
    this.playing = true;
    const ctx = this.ctx, bpm = 88, st = 60 / bpm / 4, sw = st * 0.18; // semicorcheas con swing
    const n = (m) => 440 * Math.pow(2, (m - 69) / 12);
    // Dm9 · Gm7 · Bbmaj7 · A7(b9): progresión de jazz menor muy de los 90
    const prog = [{ b: 38, c: [62, 65, 69, 72, 76] }, { b: 43, c: [62, 65, 67, 70] }, { b: 46, c: [62, 65, 69, 70] }, { b: 45, c: [61, 64, 67, 70] }];
    const K = [0, 7, 10], Sn = [4, 12], bassPat = [[0, 3], [7, 1], [10, 2], [14, 2]];
    let bar = 0, next = ctx.currentTime + 0.3;
    const tick = () => {
      if (!this.playing) return;
      while (next < ctx.currentTime + 1.4) {
        const t0 = next, ch = prog[Math.floor(bar / 2) % prog.length], sec = Math.floor(bar / 8) % 4;
        for (let i = 0; i < 16; i++) {
          const t = t0 + i * st + (i % 2 ? sw : 0);
          if (K.includes(i) || (i === 15 && bar % 2)) this.kick(t, i ? 0.7 : 0.9);
          if (Sn.includes(i)) this.snare(t, 0.5);
          if (sec !== 0 || bar % 8 > 3) { if (i % 2 === 0) this.hat(t, i % 4 ? 0.06 : 0.09); else if (Math.random() < 0.25) this.hat(t, 0.04); }
          if (i === 14 && bar % 4 === 3) this.hat(t, 0.08, true);
        }
        if (sec !== 3 || bar % 2) bassPat.forEach(([s0, l], k) => this.bassNote(n(ch.b + (k === 2 && bar % 2 ? 12 : 0)), t0 + s0 * st + (s0 % 2 ? sw : 0), l * st * 1.6));
        if (bar % 2 === 0) { this.keys(ch.c.map(n), t0, st * 7, 0.035); this.keys(ch.c.slice(1).map(n), t0 + st * 10 + sw, st * 5, 0.025); }
        if (bar % 8 === 7) this.scratch(t0 + st * 12, 0.16), this.scratch(t0 + st * 14, 0.12);
        this.crackle(t0, st * 16);
        next += st * 16; bar++;
      }
      this.musicTimer = setTimeout(tick, 300);
    };
    tick();
  }
  spray(t, dur, vol = 0.35) { // «psssst» del bote
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 6500; f.Q.value = 0.9;
    const h = this.ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = 3000;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.03); g.gain.setValueAtTime(vol * 0.9, t + dur - 0.05); g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(f); f.connect(h); h.connect(g); g.connect(this.sfxBus); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  rattle(t, vol = 0.25) { for (let i = 0; i < 5; i++) { this.tone(2600 + Math.random() * 900, t + i * 0.075, 0.03, vol, 'square'); this.noiseHit(t + i * 0.075, 0.02, 4000, vol * 0.6, 'bandpass', this.sfxBus, 3); } } // la bola del bote al agitarlo
  siren(t, dur, vol = 0.13) { const o = this.ctx.createOscillator(); o.type = 'sawtooth'; const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.setValueAtTime(vol, t + dur - 0.2); g.gain.linearRampToValueAtTime(0, t + dur); const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; for (let k = 0; k < dur / 0.5; k++) o.frequency.setValueAtTime(k % 2 ? 660 : 880, t + k * 0.5); o.connect(lp); lp.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + dur); }
  horn(t) { [392, 392, 392, 523.25, 659.25].forEach((f, i) => { const d = [0, 0.14, 0.28, 0.44, 0.74][i]; [1, 1.26].forEach((m) => this.tone(f * m, t + d, i > 2 ? 0.28 : 0.12, 0.07, 'square')); }); } // bocina de lowrider
  engine(t, dur, vol = 0.25) { const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(45, t); o.frequency.linearRampToValueAtTime(90, t + dur * 0.4); o.frequency.linearRampToValueAtTime(55, t + dur); const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.linearRampToValueAtTime(0, t + dur); o.connect(lp); lp.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + dur); }
  playBarrio(name, t) {
    switch (name) {
      case 'road': this.rattle(t, 0.22); this.spray(t + 0.45, 0.5); this.spray(t + 1.05, 0.35); this.spray(t + 1.48, 0.6); return true;
      case 'ship': this.engine(t, 1.3); this.horn(t + 0.5); return true;
      case 'sail': this.engine(t, 1.0, 0.2); this.noiseHit(t + 0.1, 0.5, 900, 0.12, 'bandpass', this.sfxBus, 1); return true;
      case 'robber': this.siren(t, 2.5); return true;
      case 'pirate': this.siren(t, 1.5, 0.1); this.noiseHit(t + 0.2, 0.6, 1200, 0.3, 'bandpass', this.sfxBus, 4); return true;
    }
    return false;
  }

  /* ---------- efectos ---------- */
  plank(t, vol = 0.5) { // tablón de madera golpeando
    const fr = rnd(260, 520);
    this.tone(fr, t, 0.09, vol * 0.6, 'triangle', this.sfxBus, fr * 0.7);
    this.noiseHit(t, 0.07, rnd(700, 1400), vol * 0.7, 'bandpass', this.sfxBus, 4);
    this.tone(fr * 2.7, t, 0.04, vol * 0.15, 'square');
  }
  stone(t, vol = 0.5) { // piedra cayendo
    this.tone(rnd(70, 110), t, 0.18, vol * 0.9, 'sine', this.sfxBus, 45);
    this.noiseHit(t, 0.12, rnd(300, 600), vol * 0.6, 'lowpass');
    for (let i = 0; i < 4; i++) this.noiseHit(t + 0.03 + i * rnd(0.02, 0.05), 0.04, rnd(2000, 4000), vol * 0.12, 'highpass'); // gravilla
  }
  hammer(t, vol = 0.5) { // martillazo sobre madera
    this.tone(rnd(1400, 1800), t, 0.05, vol * 0.25, 'square');
    this.plank(t, vol * 0.9);
  }
  bell(t, vol = 0.3) { [1, 2.76, 5.4].forEach((m, i) => this.tone(587 * m, t, 2.2 / (i + 1), vol / (i + 1), 'sine')); }
  play(name) {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime + 0.01;
    if (this.theme === 'barrio' && this.playBarrio(name, t)) return;
    switch (name) {
      case 'road': for (let i = 0; i < 8; i++) this.plank(t + 0.22 + i * 0.09, rnd(0.4, 0.55)); break; // un tac por tablón (sincronizado con la animación)
      case 'settlement':
        for (let i = 0; i < 3; i++) this.plank(t + 0.45 + i * 0.08, 0.45);
        this.stone(t + 0.62, 0.55); this.stone(t + 0.72, 0.4);
        [0.9, 1.15, 1.4].forEach((d) => this.hammer(t + d, 0.5)); break;
      case 'city':
        this.stone(t + 0.45, 0.7); this.stone(t + 0.55, 0.6); this.stone(t + 0.68, 0.5);
        for (let i = 0; i < 2; i++) this.plank(t + 0.8 + i * 0.09, 0.4);
        [1.0, 1.22, 1.44, 1.66].forEach((d) => this.hammer(t + d, 0.5));
        this.bell(t + 2.0, 0.25); break;
      case 'dice': for (let i = 0; i < 9; i++) this.plank(t + 0.25 + i * (0.06 + i * 0.02), 0.32 - i * 0.025); break;
      case 'robber': this.noiseHit(t, 0.7, 500, 0.35, 'bandpass', this.sfxBus, 0.8); this.tone(220, t + 0.6, 0.4, 0.2, 'sawtooth', this.sfxBus, 110); break;
      case 'produce': [0, 0.08, 0.16].forEach((d, i) => this.tone([1318, 1568, 2093][i], t + d, 0.35, 0.08)); break;
      case 'turn': this.pluck(293.66, t, 0.4, this.sfxBus); this.pluck(440, t + 0.12, 0.35, this.sfxBus); break;
      case 'ship': for (let i = 0; i < 3; i++) this.plank(t + 0.3 + i * 0.1, 0.4); this.noiseHit(t + 0.6, 0.9, 400, 0.4, 'lowpass', this.sfxBus, 0.7); this.noiseHit(t + 0.9, 0.25, 1800, 0.15, 'bandpass'); break;
      case 'sail': this.noiseHit(t, 1.2, 350, 0.35, 'lowpass', this.sfxBus, 0.6); this.noiseHit(t + 0.15, 0.15, 2200, 0.12, 'bandpass', this.sfxBus, 2); this.noiseHit(t + 0.5, 0.15, 2000, 0.1, 'bandpass', this.sfxBus, 2); break;
      case 'pirate': this.tone(90, t, 0.8, 0.6, 'sine', this.sfxBus, 40); this.noiseHit(t, 0.6, 300, 0.6, 'lowpass', this.sfxBus, 0.5); [0.4, 0.6, 0.8].forEach((d, i) => this.tone([293.66, 277.18, 220][i], t + d, 0.25, 0.18, 'sawtooth')); break;
      case 'devcard': this.noiseHit(t, 0.15, 3000, 0.15, 'highpass'); break;
      case 'trade': [0, 0.07].forEach((d) => this.tone(2400, t + d, 0.25, 0.08)); break;
      case 'win': [0, 4, 7, 12].forEach((s, i) => { this.tone(293.66 * Math.pow(2, s / 12), t + i * 0.18, 0.5, 0.16, 'sawtooth'); }); this.bell(t + 0.8, 0.3); break;
    }
  }
}
export const sound = new Sound();
