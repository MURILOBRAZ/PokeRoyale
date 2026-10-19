# PokéRoyale

Fangame de estratégia em tempo real no estilo *Clash Royale*, com Pokémon. Feito para jogar com amigos, sem fins lucrativos.

![status](https://img.shields.io/badge/vers%C3%A3o-0.3-blue)

### 🎮 Jogar agora: https://pokeroyale.vercel.app

## Como rodar

Não precisa instalar nada. Abra o `index.html` no navegador ou, de preferência, sirva a pasta:

```bash
python -m http.server 5173
```

Depois acesse http://localhost:5173.

Os sprites são carregados da internet ([SpriteCollab](https://github.com/PMDCollab/SpriteCollab)), então é preciso estar online para vê-los.

## O que já tem (v0.3)

- Arena com rio, pontes, 2 ginásios laterais + Ginásio Líder por lado
- **Os 151 Pokémon da 1ª geração** como cartas (stats gerados a partir dos oficiais) + 2 golpes
- **Editor de deck** com busca, filtro por tipo e deck aleatório
- **Sprites animados** em 8 direções (parado, andando, atacando)
- Energia com recarga dupla no último minuto, prorrogação com morte súbita
- Tabela de tipos completa (18 tipos)
- Evolução em batalha, inclusive em cadeia (Charmander → Charmeleon → Charizard) e Eevee aleatório
- Bot com 3 dificuldades e deck aleatório a cada partida
- **Multiplayer online por código de sala**: crie uma sala, mande o convite e jogue com um amigo (P2P via PeerJS)
- Funciona no PC (mouse / teclas 1–4) e no celular (toque e arrastar)

## Jogar com amigos

1. Clique em **Criar sala** e depois em **Copiar convite**.
2. Mande o convite para o amigo. Ele abre o link ou digita o código em **Entrar**.
3. A partida começa assim que os dois se conectam.

Use sempre o link publicado acima. Em `localhost` só dá para testar com duas abas no mesmo PC.

Veja o [GDD](GDD.md) para o design completo e o roadmap.

## Ferramentas (Node 18+)

```bash
node tools/build-pokedex.mjs   # baixa os 151 Pokémon da PokéAPI -> js/pokedex.js
node tools/build-sprites.mjs   # baixa as animações e créditos do SpriteCollab -> js/sprites.js, CREDITS.md
node tools/simulate.js 1500    # partidas bot x bot: procura erros e mostra o balanceamento
```

## Estrutura

| Arquivo | Função |
|---|---|
| `js/pokedex.js` | Os 151 Pokémon (gerado da PokéAPI) |
| `js/sprites.js` | Animações (gerado do SpriteCollab) |
| `js/data.js` | Regras que geram as cartas, tipos e balanceamento |
| `js/deck.js` | Editor de deck |
| `js/game.js` | Simulação da partida (sem nada de tela) |
| `js/bot.js` | IA do oponente |
| `js/render.js` | Desenho no canvas |
| `js/net.js` | Multiplayer (PeerJS, código de sala) |
| `js/main.js` | Menus, entrada e loop |
| `tools/` | Geradores de dados e teste automático |

---

Pokémon © Nintendo / Game Freak / The Pokémon Company. Projeto de fã, sem afiliação nem fins comerciais.
Sprites do SpriteCollab (CC BY-NC 4.0) — veja os créditos dos artistas em [CREDITS.md](CREDITS.md).
