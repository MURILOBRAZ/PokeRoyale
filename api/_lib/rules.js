// Carrega no servidor as mesmas regras do jogo (cartas, raridade, Premier Balls...) que o navegador usa,
// direto dos arquivos em js/, para nunca haver duas versões dos números.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILES = ['pokedex', 'sprites', 'data', 'progression'];
const EXPORTS = [
  'CARDS', 'DECK_SIZE', 'isValidDeck', 'randomDeck', 'ARENAS', 'arenaForTrophies', 'arenaOfCard',
  'RARITIES', 'MAX_CARD_LEVEL', 'rarityOf', 'startLevel', 'upgradeCost', 'trainerLevel', 'MAX_TRAINER_LEVEL',
  'STARTERS', 'TROPHIES', 'MATCH_MIN_SECONDS', 'MATCHES_PER_HOUR', 'BALL_SLOTS', 'FREE_BALL_SECONDS',
  'FREE_BALL_MAX', 'BALLS', 'ITEMS', 'itemFitsCard', 'rollBallTier', 'rollBallContents', 'botProfile',
  'TRAINER_NAME_RE', 'FICHAS', 'SHOP', 'shopDayKey', 'shopWeekRange', 'shopNextRefresh', 'shopPrice',
  'generateShopOffers',
];

const ctx = vm.createContext({});
for (const f of FILES) {
  const file = path.join(__dirname, '..', '..', 'js', `${f}.js`);
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
}
vm.runInContext(`globalThis.__rules = { ${EXPORTS.join(', ')} };`, ctx);

module.exports = ctx.__rules;
