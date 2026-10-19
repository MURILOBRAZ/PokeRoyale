# PokéRoyale

Fangame de estratégia em tempo real no estilo *Clash Royale*, com Pokémon. Feito para jogar com amigos, sem fins lucrativos.

![status](https://img.shields.io/badge/vers%C3%A3o-0.4.1-blue)

### 🎮 Jogar agora: https://pokeroyale.vercel.app

## Como rodar localmente

Precisa do Node 20+. Instale as dependências e suba o servidor de desenvolvimento (jogo + API de contas com um banco local):

```bash
npm install
```

```bash
node tools/dev-server.js
```

Depois acesse http://localhost:5173. Abrindo o `index.html` direto (sem servidor), só o modo Treino funciona.

Os sprites são carregados da internet ([SpriteCollab](https://github.com/PMDCollab/SpriteCollab)), então é preciso estar online para vê-los.

## O que já tem (v0.4)

- Arena com rio, pontes, 2 ginásios laterais + Ginásio Líder por lado
- **Conta com progressão**: escolha Bulbasaur, Charmander ou Squirtle, ganhe troféus, abra Premier Balls, suba o nível das cartas e avance pelos 8 ginásios de Kanto até a Liga
- **Os 151 Pokémon da 1ª geração** como cartas (stats gerados a partir dos oficiais) + 2 golpes
- **Editor de deck** com busca, filtro por tipo e deck aleatório
- **Sprites animados** em 8 direções (parado, andando, atacando)
- **Mapas desenhados** para as 10 arenas (Rota 1, os 8 ginásios de Kanto e a Liga) e ginásios com design próprio
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
node tools/test-api.js         # testa a API de contas num banco em memória
python tools/build-arenas.py   # converte a arte das arenas e ginásios (assets/originais -> assets/)
```

## Estrutura

| Arquivo | Função |
|---|---|
| `js/pokedex.js` | Os 151 Pokémon (gerado da PokéAPI) |
| `js/sprites.js` | Animações (gerado do SpriteCollab) |
| `js/data.js` | Regras que geram as cartas, tipos e balanceamento |
| `js/progression.js` | Regras de progressão (arenas, raridade, balls, níveis), usadas também pelo servidor |
| `js/account.js` | Comunicação com a API de contas |
| `js/hub.js` | Telas da conta: entrar, inicial, início, caminho dos troféus, recompensas |
| `js/deck.js` | Coleção e editor de deck |
| `js/game.js` | Simulação da partida (sem nada de tela) |
| `js/bot.js` | IA do oponente |
| `js/render.js` | Desenho no canvas |
| `js/net.js` | Multiplayer (PeerJS, código de sala) |
| `js/main.js` | Menus, entrada e loop |
| `api/` | Servidor (função da Vercel): contas, partidas, balls, melhorias |
| `tools/` | Geradores de dados, servidor de desenvolvimento e testes |

---

Pokémon © Nintendo / Game Freak / The Pokémon Company. Projeto de fã, sem afiliação nem fins comerciais.
Sprites do SpriteCollab (CC BY-NC 4.0) — veja os créditos dos artistas em [CREDITS.md](CREDITS.md).
