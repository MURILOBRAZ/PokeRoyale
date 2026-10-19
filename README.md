# PokéRoyale

Fangame de estratégia em tempo real no estilo *Clash Royale*, com Pokémon. Feito para jogar com amigos, sem fins lucrativos.

![status](https://img.shields.io/badge/vers%C3%A3o-0.2-blue)

## Como rodar

Não precisa instalar nada. Abra o `index.html` no navegador ou, de preferência, sirva a pasta:

```bash
python -m http.server 5173
```

Depois acesse http://localhost:5173.

Os sprites vêm da [PokéAPI](https://github.com/PokeAPI/sprites), então é preciso estar online para vê-los. Sem internet, os Pokémon aparecem como círculos coloridos.

## O que já tem (v0.2)

- Arena com rio, pontes, 2 ginásios laterais + Ginásio Líder por lado
- 8 cartas: Pikachu, Charmander, Squirtle, Bulbasaur, Onix, Zubat ×3, Choque do Trovão e Explosão de Fogo
- Energia com recarga dupla no último minuto, prorrogação com morte súbita
- Tabela de tipos (super efetivo / pouco efetivo)
- Evolução em batalha (Charmander → Charmeleon etc.)
- Bot com 3 dificuldades
- **Multiplayer online por código de sala**: crie uma sala, mande o convite e jogue com um amigo (P2P via PeerJS)
- Funciona no PC (mouse / teclas 1–4) e no celular (toque e arrastar)

## Jogar com amigos

1. Clique em **Criar sala** e depois em **Copiar convite**.
2. Mande o convite para o amigo. Ele abre o link ou digita o código em **Entrar**.
3. A partida começa assim que os dois se conectam.

Para isso funcionar entre computadores diferentes, o jogo precisa estar publicado (ex.: GitHub Pages). Em `localhost` só dá para testar com duas abas no mesmo PC.

Veja o [GDD](GDD.md) para o design completo e o roadmap.

## Estrutura

| Arquivo | Função |
|---|---|
| `js/data.js` | Cartas, tipos e números de balanceamento |
| `js/game.js` | Simulação da partida (sem nada de tela) |
| `js/bot.js` | IA do oponente |
| `js/render.js` | Desenho no canvas |
| `js/net.js` | Multiplayer (PeerJS, código de sala) |
| `js/main.js` | Menus, entrada e loop |

---

Pokémon © Nintendo / Game Freak / The Pokémon Company. Projeto de fã, sem afiliação nem fins comerciais.
