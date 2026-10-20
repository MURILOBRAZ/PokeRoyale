// Gera js/sprites.js (metadados das animações) e CREDITS.md a partir do SpriteCollab.
// Uso: node tools/build-sprites.mjs
// Sprites e retratos: PMDCollab/SpriteCollab, licença CC BY-NC 4.0 (uso não comercial, com crédito).

import { writeFile } from 'node:fs/promises';

const RAW = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master';
const LAST_DEX = 151;
// Animações usadas no jogo (nome no jogo -> nomes no SpriteCollab, em ordem de preferência)
// fly: voo (só alguns voadores têm); sem ela, o voador usa a animação parada no ar em vez de "andar"
const WANTED = { idle: ['Idle', 'Walk'], walk: ['Walk'], attack: ['Attack'], shoot: ['Shoot', 'Charge', 'Attack'], fly: ['Hover', 'FlapAround', 'Float'] };

async function get(url, as = 'text') {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url);
    if (res.ok) return as === 'json' ? res.json() : res.text();
    if (res.status === 404) return null;
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  throw new Error(`Falha ao baixar ${url}`);
}

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? m[1] : null;
};

function parseAnimData(xml) {
  const anims = {};
  for (const block of xml.match(/<Anim>[\s\S]*?<\/Anim>/g) || []) {
    const name = tag(block, 'Name');
    anims[name] = {
      copyOf: tag(block, 'CopyOf'),
      w: Number(tag(block, 'FrameWidth')),
      h: Number(tag(block, 'FrameHeight')),
      hit: tag(block, 'HitFrame') !== null ? Number(tag(block, 'HitFrame')) : undefined,
      d: (block.match(/<Duration>(\d+)<\/Duration>/g) || []).map((x) => Number(x.replace(/\D/g, ''))),
    };
  }
  // CopyOf: usa a folha e os quadros da animação original
  const resolve = (name, depth = 0) => {
    const a = anims[name];
    if (!a) return null;
    if (a.copyOf && depth < 5) {
      const src = resolve(a.copyOf, depth + 1);
      return src && { ...src };
    }
    return { file: name, w: a.w, h: a.h, d: a.d, ...(a.hit !== undefined ? { hit: a.hit } : {}) };
  };
  const out = {};
  for (const [key, names] of Object.entries(WANTED)) {
    for (const n of names) {
      // Voo só vale se for uma animação própria (no Zubat, "Hover" é cópia da de atirar)
      if (key === 'fly' && anims[n] && anims[n].copyOf) continue;
      const r = resolve(n);
      if (r && r.d.length) {
        out[key] = r;
        break;
      }
    }
  }
  return out;
}

async function main() {
  const dexes = Array.from({ length: LAST_DEX }, (_, i) => i + 1);
  const pad = (n) => String(n).padStart(4, '0');

  console.log('Baixando tracker e nomes de créditos...');
  const tracker = await get(`${RAW}/tracker.json`, 'json');
  const creditTxt = await get(`${RAW}/credit_names.txt`);
  const creditNames = {};
  for (const line of creditTxt.split('\n').slice(1)) {
    const [name, discord, contact] = line.split('\t');
    if (discord) creditNames[discord.trim()] = { name: name.trim(), contact: (contact || '').trim() };
  }
  const who = (id) => (creditNames[id] && creditNames[id].name ? creditNames[id].name : id);

  const sprites = {};
  const credits = [];
  for (let i = 0; i < dexes.length; i += 20) {
    const batch = dexes.slice(i, i + 20);
    await Promise.all(batch.map(async (dex) => {
      const xml = await get(`${RAW}/sprite/${pad(dex)}/AnimData.xml`);
      const portraitOk = (await fetch(`${RAW}/portrait/${pad(dex)}/Normal.png`, { method: 'HEAD' })).ok;
      if (!xml) return;
      const anims = parseAnimData(xml);
      if (!anims.walk) return;
      sprites[dex] = { ...anims, shadow: Number(tag(xml, 'ShadowSize') || 1), portrait: portraitOk };
      const t = tracker[pad(dex)] || {};
      const list = (c) => (c ? [c.primary, ...(c.secondary || [])].filter(Boolean).map(who) : []);
      credits.push({ dex, name: t.name || `#${dex}`, sprite: list(t.sprite_credit), portrait: list(t.portrait_credit) });
    }));
    process.stdout.write(`\r${Object.keys(sprites).length}/${LAST_DEX}`);
  }

  const lines = Object.keys(sprites).sort((a, b) => a - b).map((dex) => `  ${dex}: ${JSON.stringify(sprites[dex])}`);
  const js = `// Gerado por tools/build-sprites.mjs a partir do SpriteCollab (CC BY-NC 4.0). Não edite à mão.\n// Créditos dos artistas em CREDITS.md.\n\nconst SPRITE_COLLAB = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master';\n\nconst SPRITES = {\n${lines.join(',\n')},\n};\n`;
  await writeFile(new URL('../js/sprites.js', import.meta.url), js);

  credits.sort((a, b) => a.dex - b.dex);
  const md = [
    '# Créditos',
    '',
    'PokéRoyale é um projeto de fã, sem fins comerciais. Pokémon © Nintendo / Game Freak / The Pokémon Company.',
    '',
    '## Sprites e retratos',
    '',
    'Sprites animados e retratos do [PMD Sprite Repository (SpriteCollab)](https://github.com/PMDCollab/SpriteCollab),',
    'sob a licença [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). "CHUNSOFT" indica arte original dos jogos *Pokémon Mystery Dungeon*.',
    '',
    '| Nº | Pokémon | Sprite | Retrato |',
    '|---|---|---|---|',
    ...credits.map((c) => `| ${c.dex} | ${c.name} | ${c.sprite.join(', ') || '—'} | ${c.portrait.join(', ') || '—'} |`),
    '',
    '## Dados',
    '',
    'Stats, tipos e linhas evolutivas da [PokéAPI](https://pokeapi.co/).',
    '',
  ].join('\n');
  await writeFile(new URL('../CREDITS.md', import.meta.url), md);
  console.log(`\nOK: ${Object.keys(sprites).length} Pokémon em js/sprites.js e CREDITS.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
