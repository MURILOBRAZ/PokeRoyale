// Som do PokéRoyale, todo gerado no navegador (Web Audio API), exceto os gritos dos Pokémon:
// - Efeitos: sintetizados na hora, um timbre por tipo de golpe.
// - Gritos: os originais dos jogos, carregados do repositório público da PokéAPI (não ficam no projeto).
// - Música: chiptune original tocada por um sequenciador simples (pulso, triângulo e ruído).
//
// O som segue os efeitos da partida (game.effects): cada efeito tem um número crescente (id),
// então os novos tocam uma vez só — também no convidado do multiplayer, que recebe os efeitos no snapshot.

const CRY_URL = (dex) => `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${dex}.ogg`;

const Sound = (() => {
  const PREFS_KEY = 'pokeroyale.sound';
  const prefs = { music: 0.45, sfx: 0.8, muted: false };
  try {
    Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'));
  } catch (e) { /* sem armazenamento: usa o padrão */ }

  let ctx = null;
  let master;
  let musicBus;
  let sfxBus;
  let noiseBuf;
  let pulse25;
  let pulse12;

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch (e) { /* ignora */ }
  }

  function applyVolumes() {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(prefs.muted ? 0 : 1, t, 0.02);
    musicBus.gain.setTargetAtTime(prefs.music * 0.5, t, 0.05);
    sfxBus.gain.setTargetAtTime(prefs.sfx, t, 0.02);
  }

  // Onda de pulso (som de videogame antigo): duty = largura do pulso
  function pulseWave(duty) {
    const n = 32;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let i = 1; i < n; i++) real[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
    return ctx.createPeriodicWave(real, imag);
  }

  // O navegador só libera o áudio depois de um toque/clique
  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    master.connect(comp);
    comp.connect(ctx.destination);
    musicBus = ctx.createGain();
    sfxBus = ctx.createGain();
    musicBus.connect(master);
    sfxBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    pulse25 = pulseWave(0.25);
    pulse12 = pulseWave(0.125);
    applyVolumes();
    return ctx;
  }

  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
  }
  for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlock, { capture: true, passive: true });

  const ready = () => ctx && ctx.state === 'running';

  // ---------- Peças básicas ----------

  // Tom com envelope rápido. wave: 'square' | 'triangle' | 'sine' | 'sawtooth' | 'p25' | 'p12'
  function tone({ wave = 'square', f, f2, t = 0, dur = 0.1, vol = 0.2, bus = sfxBus, attack = 0.004, vib = 0 }) {
    const start = ctx.currentTime + t;
    const o = ctx.createOscillator();
    if (wave === 'p25') o.setPeriodicWave(pulse25);
    else if (wave === 'p12') o.setPeriodicWave(pulse12);
    else o.type = wave;
    o.frequency.setValueAtTime(f, start);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), start + dur);
    if (vib) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 18;
      lg.gain.value = vib;
      lfo.connect(lg);
      lg.connect(o.frequency);
      lfo.start(start);
      lfo.stop(start + dur + 0.05);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g);
    g.connect(bus);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  // Ruído filtrado (explosões, sopros, chiado)
  function noise({ t = 0, dur = 0.2, vol = 0.2, type = 'lowpass', f = 1000, f2, q = 1, bus = sfxBus }) {
    const start = ctx.currentTime + t;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(f, start);
    if (f2) filt.frequency.exponentialRampToValueAtTime(f2, start + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(bus);
    src.start(start, Math.random() * 0.5);
    src.stop(start + dur + 0.02);
  }

  // ---------- Efeitos por tipo ----------

  // Golpe à distância saindo (um timbre por tipo)
  const SHOT = {
    fire: (v) => { noise({ dur: 0.28, vol: 0.35 * v, type: 'bandpass', f: 700, f2: 2200, q: 0.8 }); tone({ wave: 'sawtooth', f: 140, f2: 70, dur: 0.22, vol: 0.08 * v }); },
    water: (v) => { tone({ wave: 'sine', f: 500, f2: 1300, dur: 0.12, vol: 0.25 * v }); tone({ wave: 'sine', f: 700, f2: 1600, t: 0.07, dur: 0.1, vol: 0.18 * v }); noise({ dur: 0.12, vol: 0.08 * v, type: 'highpass', f: 2500 }); },
    electric: (v) => { for (let i = 0; i < 5; i++) tone({ wave: 'square', f: 700 + Math.random() * 1600, t: i * 0.025, dur: 0.03, vol: 0.09 * v }); noise({ dur: 0.15, vol: 0.1 * v, type: 'highpass', f: 4000 }); },
    grass: (v) => { noise({ dur: 0.16, vol: 0.2 * v, type: 'bandpass', f: 3500, f2: 1500, q: 1.5 }); tone({ wave: 'triangle', f: 900, f2: 600, dur: 0.1, vol: 0.12 * v }); },
    ice: (v) => { tone({ wave: 'triangle', f: 1800, f2: 2600, dur: 0.12, vol: 0.16 * v }); tone({ wave: 'sine', f: 3200, t: 0.04, dur: 0.12, vol: 0.08 * v }); },
    poison: (v) => { tone({ wave: 'sine', f: 320, f2: 180, dur: 0.18, vol: 0.2 * v, vib: 30 }); tone({ wave: 'sine', f: 600, f2: 900, t: 0.08, dur: 0.06, vol: 0.1 * v }); },
    psychic: (v) => { tone({ wave: 'sine', f: 520, f2: 1000, dur: 0.25, vol: 0.18 * v, vib: 40 }); tone({ wave: 'triangle', f: 780, f2: 1500, dur: 0.25, vol: 0.08 * v }); },
    ghost: (v) => { tone({ wave: 'triangle', f: 330, f2: 150, dur: 0.3, vol: 0.2 * v, vib: 25 }); },
    dark: (v) => { tone({ wave: 'sawtooth', f: 220, f2: 110, dur: 0.18, vol: 0.1 * v }); noise({ dur: 0.12, vol: 0.12 * v, type: 'lowpass', f: 900 }); },
    rock: (v) => { noise({ dur: 0.14, vol: 0.3 * v, type: 'lowpass', f: 600 }); tone({ wave: 'square', f: 110, f2: 55, dur: 0.12, vol: 0.12 * v }); },
    ground: (v) => { noise({ dur: 0.18, vol: 0.3 * v, type: 'lowpass', f: 450, f2: 150 }); tone({ wave: 'sine', f: 90, f2: 45, dur: 0.15, vol: 0.25 * v }); },
    flying: (v) => { noise({ dur: 0.22, vol: 0.25 * v, type: 'bandpass', f: 1600, f2: 400, q: 2 }); },
    bug: (v) => { tone({ wave: 'square', f: 1300, f2: 1100, dur: 0.1, vol: 0.07 * v, vib: 120 }); },
    dragon: (v) => { tone({ wave: 'sawtooth', f: 160, f2: 90, dur: 0.3, vol: 0.12 * v, vib: 15 }); noise({ dur: 0.25, vol: 0.12 * v, type: 'bandpass', f: 600 }); },
    fairy: (v) => { tone({ wave: 'triangle', f: 1568, dur: 0.12, vol: 0.12 * v }); tone({ wave: 'triangle', f: 2349, t: 0.05, dur: 0.14, vol: 0.1 * v }); },
    steel: (v) => { tone({ wave: 'square', f: 1200, f2: 900, dur: 0.08, vol: 0.08 * v }); tone({ wave: 'triangle', f: 2400, dur: 0.15, vol: 0.06 * v }); },
    fighting: (v) => { noise({ dur: 0.08, vol: 0.25 * v, type: 'lowpass', f: 1500 }); tone({ wave: 'square', f: 260, f2: 130, dur: 0.08, vol: 0.1 * v }); },
    normal: (v) => { noise({ dur: 0.07, vol: 0.2 * v, type: 'bandpass', f: 1800 }); tone({ wave: 'square', f: 520, f2: 300, dur: 0.07, vol: 0.07 * v }); },
  };

  // Corpo a corpo: pancada + um pouco do timbre do tipo
  function strike(type, big) {
    noise({ dur: big ? 0.18 : 0.1, vol: big ? 0.45 : 0.3, type: 'lowpass', f: big ? 900 : 1600, f2: 200 });
    tone({ wave: 'square', f: big ? 160 : 240, f2: 70, dur: big ? 0.16 : 0.09, vol: 0.12 });
    if (type !== 'normal' && type !== 'fighting') (SHOT[type] || SHOT.normal)(0.45);
  }

  function impact() {
    noise({ dur: 0.06, vol: 0.12, type: 'bandpass', f: 1200 + Math.random() * 600, q: 1.2 });
  }

  function blast(type, spell) {
    if (spell === 'thunderbolt') {
      noise({ dur: 0.12, vol: 0.5, type: 'highpass', f: 2500 });
      noise({ t: 0.05, dur: 0.7, vol: 0.4, type: 'lowpass', f: 700, f2: 120 });
      for (let i = 0; i < 6; i++) tone({ wave: 'square', f: 400 + Math.random() * 1400, t: i * 0.03, dur: 0.04, vol: 0.08 });
      return;
    }
    if (spell === 'surf') {
      noise({ dur: 0.8, vol: 0.4, type: 'bandpass', f: 500, f2: 1800, q: 0.6 });
      noise({ t: 0.2, dur: 0.6, vol: 0.25, type: 'highpass', f: 3000 });
      return;
    }
    if (spell === 'earthquake') {
      noise({ dur: 1.2, vol: 0.6, type: 'lowpass', f: 300, f2: 60 });
      tone({ wave: 'sine', f: 55, f2: 35, dur: 1.0, vol: 0.5 });
      for (let i = 0; i < 5; i++) noise({ t: 0.1 + i * 0.15, dur: 0.08, vol: 0.2, type: 'bandpass', f: 400 + Math.random() * 400, q: 2 });
      return;
    }
    if (spell === 'blizzard') {
      noise({ dur: 1.0, vol: 0.3, type: 'highpass', f: 2500, f2: 6000 });
      for (let i = 0; i < 6; i++) tone({ wave: 'triangle', f: 1800 + Math.random() * 1600, t: i * 0.08, dur: 0.1, vol: 0.05 });
      return;
    }
    const big = spell === 'fireblast';
    noise({ dur: big ? 0.9 : 0.5, vol: big ? 0.6 : 0.4, type: 'lowpass', f: big ? 1800 : 1400, f2: 120 });
    tone({ wave: 'sine', f: big ? 110 : 140, f2: 35, dur: big ? 0.6 : 0.35, vol: 0.45 });
    if (type === 'fire') noise({ t: 0.05, dur: 0.6, vol: 0.18, type: 'bandpass', f: 900, f2: 2500, q: 0.7 });
  }

  function crash(king) {
    noise({ dur: king ? 1.6 : 1.2, vol: 0.6, type: 'lowpass', f: 900, f2: 80 });
    tone({ wave: 'sine', f: 90, f2: 30, dur: 0.8, vol: 0.5 });
    for (let i = 0; i < 6; i++) noise({ t: 0.15 + i * 0.12 + Math.random() * 0.05, dur: 0.1, vol: 0.18, type: 'bandpass', f: 500 + Math.random() * 800, q: 2 });
  }

  function pop() {
    tone({ wave: 'square', f: 420, f2: 950, dur: 0.08, vol: 0.12 });
    noise({ t: 0.04, dur: 0.12, vol: 0.12, type: 'highpass', f: 3000 });
  }

  function faint() {
    tone({ wave: 'p25', f: 620, f2: 140, dur: 0.38, vol: 0.12 });
  }

  function evolve() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ wave: 'p25', f, t: i * 0.08, dur: 0.18, vol: 0.13 }));
    tone({ wave: 'triangle', f: 2093, t: 0.42, dur: 0.5, vol: 0.12, vib: 20 });
  }

  // ---------- Gritos (originais, da PokéAPI) ----------

  const cries = new Map(); // dex -> AudioBuffer | 'loading' | 'fail'

  function loadCry(dex) {
    if (!ctx || cries.has(dex)) return;
    cries.set(dex, 'loading');
    fetch(CRY_URL(dex))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then((buf) => new Promise((ok, fail) => ctx.decodeAudioData(buf, ok, fail)))
      .then((audio) => cries.set(dex, audio))
      .catch(() => cries.set(dex, 'fail'));
  }

  // Se o grito não carregar (ex.: navegador sem suporte a .ogg), um "piu" sintetizado no lugar
  function synthCry(dex, vol) {
    const base = 300 + ((dex * 97) % 500);
    tone({ wave: 'p25', f: base, f2: base * 1.6, dur: 0.12, vol: 0.12 * vol });
    tone({ wave: 'p25', f: base * 1.5, f2: base * 0.9, t: 0.1, dur: 0.18, vol: 0.1 * vol });
  }

  function cry(dex, vol = 1, rate = 1) {
    const buf = cries.get(dex);
    if (buf && typeof buf === 'object') {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = 0.32 * vol;
      src.connect(g);
      g.connect(sfxBus);
      src.start();
    } else if (buf === 'fail') {
      synthCry(dex, vol);
    } else {
      loadCry(dex); // primeira vez: só carrega (fica pronto para a próxima)
    }
  }

  function preloadCries(dexes) {
    if (!ensure()) return;
    for (const d of dexes) if (d) loadCry(d);
  }

  // ---------- Controle de volume dos efeitos (evita barulheira) ----------

  const lastPlay = new Map();
  let budgetT = 0;
  let budget = 0;
  function allow(key, gap) {
    const now = ctx.currentTime;
    if (now - budgetT > 0.1) {
      budgetT = now;
      budget = 0;
    }
    if (budget >= 7) return false;
    if (now - (lastPlay.get(key) || -9) < gap) return false;
    lastPlay.set(key, now);
    budget++;
    return true;
  }

  // ---------- Seguir a partida ----------

  let watched = null;
  let lastFx = 0;
  let lastCryAt = 0;
  let wasDouble = false;
  let wasOvertime = false;
  let wasFinal = false;
  let lastTick = 0;

  function watch(game, mySide) {
    if (!ready() || !game) return;
    if (game !== watched) {
      watched = game;
      lastFx = 0;
      wasDouble = false;
      wasOvertime = false;
      wasFinal = false;
      lastTick = 0;
    }
    let maxId = lastFx;
    for (const e of game.effects) {
      if (!(e.id > lastFx)) continue;
      if (e.id > maxId) maxId = e.id;
      play(e, mySide);
    }
    lastFx = maxId;
    if (game.doubleEnergy && !wasDouble) {
      wasDouble = true;
      sting();
      setTempo(BPM_FAST);
    }
    if (game.overtime && !wasOvertime) {
      wasOvertime = true;
      sting();
      setTempo(BPM_OVERTIME);
    }
    // Últimos 10 s: "tic" a cada segundo (mais agudo nos 3 últimos) e música no máximo
    const left = game.timeLeft;
    if (!game.over && left > 0 && left <= 10) {
      const sec = Math.ceil(left);
      if (sec !== lastTick) {
        lastTick = sec;
        tickSound(sec);
      }
      if (!wasFinal) {
        wasFinal = true;
        setTempo(BPM_FINAL);
      }
    } else if (left > 10 && wasFinal) {
      // Começou a morte súbita: volta ao ritmo dela
      wasFinal = false;
      lastTick = 0;
      setTempo(game.overtime ? BPM_OVERTIME : game.doubleEnergy ? BPM_FAST : BPM_NORMAL);
    }
  }

  function play(e, mySide) {
    const type = e.type || 'normal';
    switch (e.kind) {
      case 'spawn': {
        if (e.building) {
          // Construção: batida de martelo, sem grito
          noise({ dur: 0.12, vol: 0.3, type: 'lowpass', f: 700 });
          tone({ wave: 'square', f: 180, f2: 90, t: 0.1, dur: 0.1, vol: 0.12 });
          break;
        }
        if (allow('pop', 0.05)) pop();
        if (e.legendary) {
          // Fanfarra curta do lendário
          [523, 659, 784, 1047].forEach((f, i) => tone({ wave: 'p25', f, t: i * 0.1, dur: 0.3, vol: 0.12 }));
          tone({ wave: 'triangle', f: 1568, t: 0.4, dur: 0.7, vol: 0.12, vib: 15 });
        }
        const now = ctx.currentTime;
        if (now - lastCryAt > 0.25) {
          lastCryAt = now;
          cry(e.dex, e.side === mySide ? 1 : 0.8);
        }
        break;
      }
      case 'cast':
        if (e.spell) {
          if (allow('spell', 0.05)) noise({ dur: 0.35, vol: 0.2, type: 'bandpass', f: 400, f2: 1800, q: 1 });
        } else if (allow('shot-' + type, 0.09)) (SHOT[type] || SHOT.normal)(0.7);
        break;
      case 'strike':
        if (allow('strike', 0.06)) strike(type, e.big);
        break;
      case 'impact':
        if (allow('impact', 0.07)) impact();
        break;
      case 'blast':
        if (allow('blast', 0.08)) blast(type, e.spell);
        break;
      case 'heal':
        if (e.active && allow('heal', 0.5)) {
          tone({ wave: 'triangle', f: 880, dur: 0.12, vol: 0.08 });
          tone({ wave: 'triangle', f: 1175, t: 0.1, dur: 0.18, vol: 0.08 });
        }
        break;
      case 'faint':
        if (allow('faint', 0.12)) faint();
        break;
      case 'crash':
        crash(e.king);
        break;
      case 'evolve':
        evolve();
        setTimeout(() => ready() && cry(e.dex, 1), 550);
        break;
      default:
    }
  }

  // ---------- Música (chiptune original) ----------

  const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  function freq(name) {
    const m = /^([A-G]#?)(\d)$/.exec(name);
    const midi = (Number(m[2]) + 1) * 12 + NOTE[m[1]];
    return 440 * 2 ** ((midi - 69) / 12);
  }
  const midiFreq = (midi) => 440 * 2 ** ((midi - 69) / 12);

  // Acordes: tônica do baixo (MIDI) e notas do arpejo
  const CHORDS = {
    Am: { bass: 45, arp: [57, 60, 64] },
    F: { bass: 41, arp: [53, 57, 60] },
    C: { bass: 48, arp: [60, 64, 67] },
    G: { bass: 43, arp: [55, 59, 62] },
    Dm: { bass: 50, arp: [62, 65, 69] },
    E: { bass: 40, arp: [56, 59, 64] },
  };
  // Cada compasso: acorde + melodia em colcheias ('.' pausa, '-' segura a nota anterior)
  const SECTION_A = [
    ['Am', 'E5 . E5 D5 E5 . A4 .'],
    ['F', 'C5 . C5 B4 C5 . F4 .'],
    ['C', 'G4 . C5 . E5 . G5 -'],
    ['G', 'F5 . E5 . D5 . B4 .'],
  ];
  const SECTION_A2 = [SECTION_A[0], SECTION_A[1], SECTION_A[2], ['E', 'E5 . D5 . C5 . B4 .']];
  const SECTION_B = [
    ['F', 'A5 - G5 - F5 - E5 -'],
    ['C', 'E5 - D5 - C5 - G4 -'],
    ['Dm', 'F5 . F5 . A5 . F5 .'],
    ['E', 'E5 - G#5 - B5 - - -'],
  ];
  const bars = (list) => list.map(([chord, mel]) => ({ chord: CHORDS[chord], mel: mel.split(' ') }));
  const BATTLE = bars([...SECTION_A, ...SECTION_A2, ...SECTION_B, ...SECTION_A2]);
  // Menu: tema calmo em Dó maior (I–vi–IV–V), sem caixa, com melodia em triângulo
  const MENU = bars([
    ['C', 'E5 . G5 . C6 - B5 .'],
    ['Am', 'A5 - G5 . E5 - . .'],
    ['F', 'F5 . A5 . C6 - A5 .'],
    ['G', 'G5 - - - D5 - . .'],
    ['C', 'C5 . E5 . G5 . E5 .'],
    ['Am', 'A4 . C5 . E5 - D5 .'],
    ['F', 'C5 - A4 - F4 - A4 .'],
    ['G', 'B4 - D5 - G5 - - -'],
  ]);
  const SONGS = {
    battle: { bars: BATTLE, bpm: 138, drums: true, lead: 'p25', leadVol: 0.11 },
    menu: { bars: MENU, bpm: 96, drums: false, lead: 'triangle', leadVol: 0.16 },
  };
  let song = SONGS.battle;
  let songName = null;
  const BPM_NORMAL = 138;
  const BPM_FAST = 158;
  const BPM_OVERTIME = 172;
  const BPM_FINAL = 190;

  let bpm = BPM_NORMAL;
  let playing = false;
  let timer = null;
  let step = 0;
  let nextTime = 0;

  function setTempo(v) {
    bpm = v;
  }

  function drum(kind, t) {
    if (kind === 'kick') tone({ wave: 'sine', f: 150, f2: 45, t, dur: 0.14, vol: 0.5, bus: musicBus });
    else if (kind === 'snare') noise({ t, dur: 0.12, vol: 0.25, type: 'highpass', f: 1500, bus: musicBus });
    else noise({ t, dur: 0.03, vol: 0.08, type: 'highpass', f: 7000, bus: musicBus });
  }

  function scheduleStep(i, at) {
    const t = at - ctx.currentTime;
    const sixteenth = 60 / bpm / 4;
    const bar = song.bars[Math.floor(i / 16) % song.bars.length];
    const s = i % 16;
    // Bateria (no menu, só um chimbal bem leve)
    if (song.drums) {
      if (s % 8 === 0) drum('kick', t);
      if (s % 8 === 4) drum('snare', t);
      if (s % 2 === 0) drum('hat', t);
    } else if (s % 4 === 0) drum('hat', t);
    // Baixo em colcheias (tônica e oitava)
    if (s % 2 === 0) {
      const oct = (s / 2) % 2 ? 12 : 0;
      tone({ wave: 'triangle', f: midiFreq(bar.chord.bass + oct), t, dur: sixteenth * 1.8, vol: 0.35, bus: musicBus, attack: 0.002 });
    }
    // Arpejo bem baixinho em semicolcheias
    tone({ wave: 'p12', f: midiFreq(bar.chord.arp[s % 3] + 12), t, dur: sixteenth * 0.9, vol: 0.035, bus: musicBus, attack: 0.002 });
    // Melodia
    if (s % 2 === 0) {
      const k = s / 2;
      const note = bar.mel[k];
      if (note && note !== '.' && note !== '-') {
        let len = 1;
        while (bar.mel[k + len] === '-') len++;
        tone({ wave: song.lead, f: freq(note), t, dur: sixteenth * 2 * len * 0.92, vol: song.leadVol, bus: musicBus, attack: 0.004 });
      }
    }
  }

  function tick() {
    if (!ready()) return;
    if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
    while (nextTime < ctx.currentTime + 0.15) {
      scheduleStep(step, nextTime);
      step++;
      nextTime += 60 / bpm / 4;
    }
  }

  // name: 'battle' (partida) ou 'menu'
  function startMusic(name = 'battle') {
    if (!ensure()) return;
    song = SONGS[name] || SONGS.battle;
    songName = name;
    bpm = song.bpm;
    step = 0;
    nextTime = 0;
    playing = true;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    applyVolumes();
    clearInterval(timer);
    timer = setInterval(tick, 25);
  }

  function stopMusic() {
    playing = false;
    songName = null;
    clearInterval(timer);
    timer = null;
  }

  function tickSound(sec) {
    const high = sec <= 3;
    tone({ wave: 'square', f: high ? 1320 : 880, dur: high ? 0.12 : 0.07, vol: high ? 0.16 : 0.1 });
    if (high) tone({ wave: 'square', f: 1760, t: 0.06, dur: 0.08, vol: 0.08 });
  }

  function sting() {
    if (!ready()) return;
    tone({ wave: 'p25', f: freq('E5'), dur: 0.1, vol: 0.14 });
    tone({ wave: 'p25', f: freq('A5'), t: 0.1, dur: 0.25, vol: 0.14 });
  }

  // Fim de partida: vinheta de vitória, derrota ou empate
  function jingle(result) {
    stopMusic();
    if (!ready()) return;
    const seqs = {
      win: [['C5', 0, 0.12], ['E5', 0.12, 0.12], ['G5', 0.24, 0.12], ['C6', 0.36, 0.5], ['G5', 0.9, 0.12], ['C6', 1.02, 0.7]],
      loss: [['G4', 0, 0.3], ['E4', 0.32, 0.3], ['C4', 0.64, 0.3], ['B3', 0.96, 0.8]],
      draw: [['E5', 0, 0.2], ['D5', 0.22, 0.2], ['E5', 0.44, 0.6]],
    };
    for (const [n, t, d] of seqs[result] || seqs.draw) {
      tone({ wave: 'p25', f: freq(n), t, dur: d, vol: 0.14, bus: sfxBus });
      tone({ wave: 'triangle', f: freq(n) / 2, t, dur: d, vol: 0.2, bus: sfxBus });
    }
  }

  // ---------- Preferências ----------

  function set(key, value) {
    prefs[key] = value;
    savePrefs();
    applyVolumes();
  }

  return {
    prefs,
    set,
    watch,
    startMusic,
    stopMusic,
    jingle,
    preloadCries,
    toggleMute() {
      set('muted', !prefs.muted);
      return prefs.muted;
    },
    get playing() {
      return playing;
    },
    get song() {
      return songName;
    },
    get ready() {
      return ready();
    },
  };
})();
