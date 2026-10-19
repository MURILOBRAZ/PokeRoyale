// Gera js/pokedex.js com os 151 Pokémon da 1ª geração a partir da PokéAPI.
// Uso: node tools/build-pokedex.mjs
// O jogo não acessa a PokéAPI em tempo de execução (só os sprites); os dados ficam no arquivo gerado.

import { writeFile } from 'node:fs/promises';

const API = 'https://pokeapi.co/api/v2';
const LAST_DEX = 151;

const DISPLAY_NAMES = {
  'nidoran-f': 'Nidoran♀',
  'nidoran-m': 'Nidoran♂',
  'mr-mime': 'Mr. Mime',
  farfetchd: "Farfetch'd",
};

async function getJSON(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  throw new Error(`Falha ao baixar ${url}`);
}

const dexFromUrl = (url) => Number(url.match(/\/(\d+)\/?$/)[1]);

function displayName(apiName) {
  return DISPLAY_NAMES[apiName] || apiName.charAt(0).toUpperCase() + apiName.slice(1);
}

// Mapa dex -> evoluções diretas (só dentro da 1ª geração)
function collectEvolutions(node, out) {
  const from = dexFromUrl(node.species.url);
  const next = node.evolves_to.map((n) => dexFromUrl(n.species.url)).filter((d) => d <= LAST_DEX);
  if (from <= LAST_DEX) out[from] = next;
  for (const child of node.evolves_to) collectEvolutions(child, out);
}

async function main() {
  const ids = Array.from({ length: LAST_DEX }, (_, i) => i + 1);
  const entries = [];
  const chainUrls = new Set();
  const species = {};

  // Baixa em lotes para não sobrecarregar a API
  for (let i = 0; i < ids.length; i += 15) {
    const batch = ids.slice(i, i + 15);
    const results = await Promise.all(batch.map(async (id) => {
      const [p, s] = await Promise.all([getJSON(`${API}/pokemon/${id}`), getJSON(`${API}/pokemon-species/${id}`)]);
      return { p, s };
    }));
    for (const { p, s } of results) {
      const stat = (name) => p.stats.find((x) => x.stat.name === name).base_stat;
      species[p.id] = s;
      chainUrls.add(s.evolution_chain.url);
      entries.push({
        dex: p.id,
        id: p.name.replace(/[^a-z0-9]/g, ''),
        name: displayName(p.name),
        types: p.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
        stats: {
          hp: stat('hp'), atk: stat('attack'), def: stat('defense'),
          spa: stat('special-attack'), spd: stat('special-defense'), spe: stat('speed'),
        },
        height: p.height, // decímetros
        weight: p.weight, // hectogramas
        legendary: s.is_legendary || s.is_mythical,
      });
    }
    process.stdout.write(`\r${entries.length}/${LAST_DEX}`);
  }

  const evolutions = {};
  for (const url of chainUrls) collectEvolutions((await getJSON(url)).chain, evolutions);

  // Estágio: 1 = básico, 2 = primeira evolução, 3 = segunda
  const stageOf = (dex) => {
    const from = species[dex].evolves_from_species;
    if (!from) return 1;
    const fromDex = dexFromUrl(from.url);
    return fromDex > LAST_DEX ? 1 : stageOf(fromDex) + 1;
  };

  entries.sort((a, b) => a.dex - b.dex);
  for (const e of entries) {
    e.stage = stageOf(e.dex);
    e.evolvesTo = (evolutions[e.dex] || []).map((d) => entries.find((x) => x.dex === d).id);
  }

  const body = entries.map((e) => '  ' + JSON.stringify(e)).join(',\n');
  const out = `// Gerado por tools/build-pokedex.mjs a partir da PokéAPI. Não edite à mão.\n\nconst POKEDEX = [\n${body},\n];\n`;
  await writeFile(new URL('../js/pokedex.js', import.meta.url), out);
  console.log(`\nOK: ${entries.length} Pokémon salvos em js/pokedex.js`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
