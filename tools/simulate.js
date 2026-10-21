// Teste automático: roda partidas bot x bot com decks aleatórios para exercitar todas as cartas.
// Uso: node tools/simulate.js [partidas=300]
// Relata erros, unidades travadas, cartas que nunca causam dano e o desempenho de cada carta.
// SIM_MAPA=rota20 lista só os problemas daquele mapa; SIM_DEBUG=1 detalha quem ficou parado nos mapas de água;
// SIM_COMPORTAMENTO=1 mostra, por mapa, viradas bruscas e foco errado (ginásio com inimigo mais perto).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const files = ['pokedex', 'sprites', 'data', 'progression', 'terrain', 'game', 'bot'];
vm.runInThisContext(files.map((f) => fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8')).join('\n;\n') + `
;globalThis.__api = { CARDS, Game, Bot, randomDeck, MATCH, ARENA, ARENAS };`);
const { CARDS, Game, Bot, randomDeck, MATCH, ARENA, ARENAS } = globalThis.__api;

const MATCHES = Number(process.argv[2]) || 300;
const DT = 1 / 30;
const stats = {};
const stat = (id) => (stats[id] ||= { decks: 0, wins: 0, played: 0, dmg: 0, kills: 0, evolved: 0 });
const problems = [];
// Comportamento por mapa: viradas bruscas (andando, vira mais de 100° de um passo para o outro) e foco errado
// (mirando um ginásio por mais de 1 s com um Pokémon inimigo que dá para atacar 1,5 tile mais perto)
const behavior = {};
const beh = (map) => (behavior[map] ||= { games: 0, spins: 0, wrongFocus: 0 });
let draws = 0;
let totalTime = 0;

for (let m = 0; m < MATCHES; m++) {
  const decks = [randomDeck(), randomDeck()];
  const g = new Game({ decks, arena: m % ARENAS.length }); // passa por todas as arenas (rio de água ou não)
  const map = ARENAS[m % ARENAS.length].map;
  const bots = [new Bot(g, 0, 'normal'), new Bot(g, 1, 'normal')];

  // Instrumentação: dano e abates por carta, e cartas jogadas
  const damage = g._damage.bind(g);
  g._damage = (e, amount, type, source) => {
    const before = e.hp;
    damage(e, amount, type, source);
    // Zubats da Caverna contam para a Caverna
    const card = source && (source.from || (source.card ? source.card.id : null));
    if (card) {
      stat(card).dmg += before - Math.max(0, e.hp);
      if (e.dead && before > 0) stat(card).kills++;
    }
  };
  const deploy = g.deploy.bind(g);
  g.deploy = (side, i, x, y) => {
    const id = g.players[side].hand[i];
    const ok = deploy(side, i, x, y);
    if (ok) {
      stat(id).played++;
      const s = g.spells[g.spells.length - 1];
      if (CARDS[id].kind === 'spell' && s) s.cardId = id;
    }
    return ok;
  };
  const spellResolve = g._resolveSpell.bind(g);
  g._resolveSpell = (s) => {
    const enemies = [...g._enemiesOf(s.side)];
    const hp = enemies.map((e) => e.hp);
    spellResolve(s);
    stat(s.card.id).dmg += enemies.reduce((sum, e, k) => sum + (hp[k] - Math.max(0, e.hp)), 0);
  };
  const credit = g._creditKill.bind(g);
  g._creditKill = (u) => {
    const was = u.def.id;
    credit(u);
    if (u.def.id !== was) stat(u.card.id).evolved++;
  };

  const track = new Map(); // id -> {x, y, since}
  const faces = new Map();
  const focus = new Map(); // id -> desde quando mira um ginásio com inimigo mais perto
  beh(map).games++;
  let steps = 0;
  try {
    while (!g.over && steps < 9000) {
      g.update(DT);
      bots[0].update(DT);
      bots[1].update(DT);
      g.events.length = 0;
      steps++;
      for (const u of g.units) {
        if (u.isBuilding || u.dead) continue;
        const prev = faces.get(u.id);
        if (prev !== undefined && u.moving) {
          let d = Math.abs(u.face - prev) % (2 * Math.PI);
          if (d > Math.PI) d = 2 * Math.PI - d;
          if (d > 1.75) beh(map).spins++;
        }
        faces.set(u.id, u.face);
      }
      if (steps % 6 === 0) {
        for (const u of g.units) {
          if (u.isBuilding || u.dead || u.deploy > 0 || !u.target || !u.target.isTower) {
            focus.delete(u.id);
            continue;
          }
          const dt = Math.hypot(u.x - u.target.x, u.y - u.target.y) - u.radius - u.target.radius;
          const closer = g.units.some((e) => !e.dead && e.side !== u.side && !e.isBuilding && g._canTarget(u, e)
            && !(g._offShore && g._offShore(u, e)) && Math.hypot(u.x - e.x, u.y - e.y) - u.radius - e.radius < Math.min(dt - 1.5, MATCH.SIGHT));
          if (!closer) focus.delete(u.id);
          else if (!focus.has(u.id)) focus.set(u.id, g.time);
          else if (g.time - focus.get(u.id) > 1 && focus.get(u.id) >= 0) {
            beh(map).wrongFocus++;
            focus.set(u.id, -1); // conta uma vez por episódio
          }
        }
      }
      if (steps % 30 !== 0) continue;
      for (const u of g.units) {
        if (!Number.isFinite(u.x) || !Number.isFinite(u.y) || !Number.isFinite(u.hp)) {
          problems.push(`NaN em ${u.def.id} (partida ${m})`);
          u.dead = true;
          continue;
        }
        if (u.isBuilding) continue; // construções ficam paradas de propósito
        const t = track.get(u.id);
        const moved = t && Math.hypot(u.x - t.x, u.y - t.y) > 0.3;
        const attacked = g.time - u.attackT < 3;
        if (!t || moved || attacked || u.stun > 0 || u.deploy > 0) {
          track.set(u.id, { x: u.x, y: u.y, since: g.time });
        } else if (g.time - t.since > 12 && !t.reported) {
          t.reported = true;
          const tg = u.target ? (u.target.isTower ? `ginásio ${u.target.kind}` : u.target.def.id) : 'nenhum';
          const near = g.units.filter((b) => b.isBuilding && Math.hypot(b.x - u.x, b.y - u.y) < 3)
            .map((b) => `${b.card.id}@${b.x.toFixed(1)},${b.y.toFixed(1)}`).join(' ');
          problems.push(`${u.def.id} parado em (${u.x.toFixed(1)}, ${u.y.toFixed(1)}) por 12 s, alvo ${tg}${near ? `, perto de ${near}` : ''} (${map}, partida ${m})`);
          if (process.env.SIM_DEBUG && g.terrain) {
            const w = u.target ? g._waypoint(u, u.target.x, u.target.y).map((v) => v.toFixed(2)) : null;
            const crowd = g.units.filter((o) => o !== u && !o.dead && Math.hypot(o.x - u.x, o.y - u.y) < 1.6).map((o) => `${o.def.id}/${o.side}${o.isBuilding ? 'B' : ''}@${o.x.toFixed(1)},${o.y.toFixed(1)}`);
            console.log('DEBUG', map, u.def.id, 'em', u.x.toFixed(2), u.y.toFixed(2), 'alvo', u.target && (u.target.kind || u.target.def.id), u.target && u.target.x.toFixed(1), u.target && u.target.y.toFixed(1), 'lado', u.side, 'r', u.radius, 'mov', u.moving, 'wp', w, 'chase', JSON.stringify(u.chase), 'ign', JSON.stringify(u.ignore), 'perto', crowd.join(' '));
          }
        }
        // Quem é de água pode nadar; os outros terrestres só cruzam pela ponte (nos mapas de água, só por terra)
        if (g.terrain) {
          if (!u.air && !u.types.includes('water') && g._inWater(u.x, u.y)) problems.push(`${u.def.id} andando na água (${map}, partida ${m})`);
        } else if (u.y > ARENA.RIVER_TOP + 0.2 && u.y < ARENA.RIVER_BOTTOM - 0.2 && !u.air && !(g.swimRiver && u.types.includes('water'))) {
          const onBridge = ARENA.BRIDGES.some((b) => Math.abs(u.x - b) <= ARENA.BRIDGE_HALF + 0.05);
          if (!onBridge) problems.push(`${u.def.id} andando no rio fora da ponte (${map}, partida ${m})`);
        }
      }
    }
  } catch (err) {
    problems.push(`ERRO na partida ${m}: ${err.stack.split('\n').slice(0, 3).join(' | ')}`);
    continue;
  }
  totalTime += g.time;
  if (g.winner === -1) draws++;
  decks.forEach((deck, side) => {
    for (const id of deck) {
      stat(id).decks++;
      if (g.winner === side) stat(id).wins++;
    }
  });
}

// ---------- Relatório ----------
const ids = Object.keys(CARDS);
const never = ids.filter((id) => !stats[id] || stats[id].played === 0);
// Centro Pokémon e Snorlax não causam dano de propósito
const noDamage = ids.filter((id) => stats[id] && stats[id].played >= 5 && stats[id].dmg === 0
  && !(CARDS[id].kind === 'building' && !CARDS[id].dmg && !CARDS[id].spawn));
const rows = ids.filter((id) => stats[id] && stats[id].decks >= 8).map((id) => {
  const s = stats[id];
  return { id, cost: CARDS[id].cost, decks: s.decks, win: s.wins / s.decks, dmgPerPlay: s.played ? s.dmg / s.played : 0, played: s.played, evolved: s.evolved };
});
rows.sort((a, b) => b.win - a.win);

const uniqueProblems = [...new Set(problems.map((p) => p.replace(/ \(partida \d+\)/, '')))];
console.log(`Partidas: ${MATCHES} · duração média ${(totalTime / MATCHES).toFixed(0)} s · empates ${draws}`);
console.log(`Cartas jogadas ao menos uma vez: ${ids.length - never.length}/${ids.length}`);
if (never.length) console.log('Nunca jogadas:', never.join(', '));
if (noDamage.length) console.log('Jogadas mas sem dano nenhum:', noDamage.join(', '));
console.log(`Problemas: ${problems.length} (${uniqueProblems.length} distintos)`);
uniqueProblems.filter((p) => !process.env.SIM_MAPA || p.includes(process.env.SIM_MAPA)).slice(0, 25).forEach((p) => console.log('  -', p));
const perMap = {};
for (const p of problems) {
  const k = (p.match(/\((\w+), partida/) || [])[1] || '?';
  perMap[k] = (perMap[k] || 0) + 1;
}
if (problems.length) console.log('  por mapa:', JSON.stringify(perMap));
if (process.env.SIM_COMPORTAMENTO) {
  console.log('\nComportamento por mapa (por partida): giradas · foco errado');
  for (const [map, b] of Object.entries(behavior)) {
    console.log(`  ${map.padEnd(16)} ${(b.spins / b.games).toFixed(1).padStart(6)} · ${(b.wrongFocus / b.games).toFixed(1).padStart(5)}`);
  }
}
const line = (r) => `  ${r.id.padEnd(12)} custo ${r.cost} · vitória ${(r.win * 100).toFixed(0).padStart(3)}% em ${String(r.decks).padStart(3)} decks · dano/uso ${Math.round(r.dmgPerPlay).toString().padStart(5)} · evoluiu ${r.evolved}`;
console.log('\nMais fortes:');
rows.slice(0, 12).forEach((r) => console.log(line(r)));
console.log('\nMais fracas:');
rows.slice(-12).forEach((r) => console.log(line(r)));
if (process.argv.includes('--json')) fs.writeFileSync(path.join(root, 'tools', 'sim-report.json'), JSON.stringify(rows, null, 1));
const spellRows = rows.filter((r) => CARDS[r.id].kind === 'spell');
if (spellRows.length) {
  console.log('');
  console.log('Golpes:');
  spellRows.forEach((r) => console.log(line(r)));
}
const buildingRows = rows.filter((r) => CARDS[r.id].kind === 'building');
if (buildingRows.length) {
  console.log('');
  console.log('Construções:');
  buildingRows.forEach((r) => console.log(line(r)));
}
