// Dados e balanceamento do PokéRoyale. Todos os números do jogo ficam aqui.

const ARENA = {
  W: 18,
  H: 32,
  RIVER_TOP: 15,
  RIVER_BOTTOM: 17,
  BRIDGES: [3.5, 14.5],
  BRIDGE_HALF: 1.0,
};

const MATCH = {
  DURATION: 180,
  DOUBLE_AT: 120,
  OVERTIME: 60,
  ENERGY_MAX: 10,
  ENERGY_START: 5,
  ENERGY_REGEN: 2.8, // segundos por ponto de energia
  DEPLOY_TIME: 1.0,
  SIGHT: 5.5,
};

const TOWERS = {
  princess: { hp: 1500, dmg: 55, hitSpeed: 0.8, range: 7.5, radius: 1.4 },
  king: { hp: 2600, dmg: 70, hitSpeed: 1.0, range: 7.0, radius: 1.9 },
};

const TYPE_COLORS = {
  normal: '#A8A878',
  fire: '#F08030',
  water: '#6890F0',
  grass: '#78C850',
  electric: '#F8D030',
  rock: '#B8A038',
  flying: '#A890F0',
  poison: '#A040A0',
};

const TYPE_NAMES = {
  normal: 'Normal',
  fire: 'Fogo',
  water: 'Água',
  grass: 'Planta',
  electric: 'Elétrico',
  rock: 'Pedra',
  flying: 'Voador',
  poison: 'Veneno',
};

// Ataque -> tipo do alvo. Ausente = 1x.
const TYPE_CHART = {
  normal: { rock: 0.5 },
  fire: { grass: 2, fire: 0.5, water: 0.5, rock: 0.5 },
  water: { fire: 2, rock: 2, water: 0.5, grass: 0.5 },
  grass: { water: 2, rock: 2, fire: 0.5, grass: 0.5, flying: 0.5, poison: 0.5 },
  electric: { water: 2, flying: 2, grass: 0.5, electric: 0.5 },
  rock: { fire: 2, flying: 2 },
  flying: { grass: 2, electric: 0.5, rock: 0.5 },
  poison: { grass: 2, poison: 0.5, rock: 0.5 },
};

function typeMultiplier(attackType, defenderTypes) {
  let m = 1;
  for (const t of defenderTypes) {
    const row = TYPE_CHART[attackType];
    if (row && row[t] !== undefined) m *= row[t];
  }
  return Math.max(0.5, Math.min(2, m));
}

const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites';
const spriteFront = (dex) => `${SPRITE_BASE}/pokemon/${dex}.png`;
const spriteBack = (dex) => `${SPRITE_BASE}/pokemon/back/${dex}.png`;
const itemIcon = (name) => `${SPRITE_BASE}/items/${name}.png`;

// targets: 'all' (terra e ar), 'ground' (só terra), 'buildings' (só ginásios)
const CARDS = {
  pikachu: {
    id: 'pikachu', name: 'Pikachu', kind: 'unit', dex: 25, cost: 3,
    type: 'electric', types: ['electric'],
    hp: 420, dmg: 95, hitSpeed: 1.1, range: 4.5, speed: 1.5, radius: 0.45,
    targets: 'all', mass: 2,
    desc: 'Atirador rápido. Ótimo contra voadores e água.',
  },
  charmander: {
    id: 'charmander', name: 'Charmander', kind: 'unit', dex: 4, cost: 3,
    type: 'fire', types: ['fire'],
    hp: 560, dmg: 120, hitSpeed: 1.2, range: 2.5, speed: 1.2, radius: 0.45, splash: 1.0,
    targets: 'all', mass: 3,
    evolve: { kills: 2, into: { name: 'Charmeleon', dex: 5, hp: 860, dmg: 170 } },
    desc: 'Brasas em área pequena. Evolui após 2 abates.',
  },
  squirtle: {
    id: 'squirtle', name: 'Squirtle', kind: 'unit', dex: 7, cost: 3,
    type: 'water', types: ['water'],
    hp: 760, dmg: 80, hitSpeed: 1.1, range: 1.0, speed: 1.0, radius: 0.45,
    targets: 'ground', mass: 4,
    evolve: { kills: 2, into: { name: 'Wartortle', dex: 8, hp: 1150, dmg: 120 } },
    desc: 'Lutador resistente. Destrói Onix e Charmander.',
  },
  bulbasaur: {
    id: 'bulbasaur', name: 'Bulbasaur', kind: 'unit', dex: 1, cost: 4,
    type: 'grass', types: ['grass', 'poison'],
    hp: 980, dmg: 105, hitSpeed: 1.3, range: 3.0, speed: 0.9, radius: 0.5,
    targets: 'all', mass: 5,
    evolve: { kills: 2, into: { name: 'Ivysaur', dex: 2, hp: 1450, dmg: 150 } },
    desc: 'Chicote de vinha de média distância. Bom contra pedra e água.',
  },
  onix: {
    id: 'onix', name: 'Onix', kind: 'unit', dex: 95, cost: 6,
    type: 'rock', types: ['rock'],
    hp: 2800, dmg: 180, hitSpeed: 1.5, range: 1.0, speed: 0.75, radius: 0.8,
    targets: 'buildings', mass: 20,
    desc: 'Tanque gigante. Só ataca ginásios.',
  },
  zubat: {
    id: 'zubat', name: 'Zubat', kind: 'unit', dex: 41, cost: 3, count: 3,
    type: 'flying', types: ['poison', 'flying'],
    hp: 200, dmg: 65, hitSpeed: 1.0, range: 1.0, speed: 1.6, radius: 0.35, air: true,
    targets: 'all', mass: 1,
    evolve: { kills: 1, into: { name: 'Golbat', dex: 42, hp: 420, dmg: 110 } },
    desc: 'Bando de 3 voadores. Cada um evolui após 1 abate.',
  },
  thunderbolt: {
    id: 'thunderbolt', name: 'Choque do Trovão', kind: 'spell', icon: itemIcon('thunder-stone'), cost: 3,
    type: 'electric', radius: 2.5, dmg: 280, towerMult: 0.35, stun: 0.6, delay: 0.25,
    desc: 'Raio em área que atordoa por 0,6 s.',
  },
  fireblast: {
    id: 'fireblast', name: 'Explosão de Fogo', kind: 'spell', icon: itemIcon('fire-stone'), cost: 4,
    type: 'fire', radius: 3.0, dmg: 420, towerMult: 0.35, delay: 0.7,
    desc: 'Grande explosão em área, cai depois de um instante.',
  },
};

const DEFAULT_DECK = ['pikachu', 'charmander', 'squirtle', 'bulbasaur', 'onix', 'zubat', 'thunderbolt', 'fireblast'];

function cardImage(card, back = false) {
  if (card.kind === 'spell') return card.icon;
  return back ? spriteBack(card.dex) : spriteFront(card.dex);
}
