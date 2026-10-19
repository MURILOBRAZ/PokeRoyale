# PokéRoyale — Game Design Document

> Versão do documento: 0.2 · Data: 19/10/2026
> Fangame sem fins lucrativos, feito para jogar com amigos. Pokémon é marca da Nintendo / Game Freak / The Pokémon Company; este projeto não é afiliado a elas.

---

## 1. Visão geral

**PokéRoyale** é um jogo de estratégia em tempo real no estilo *Clash Royale*, só que com Pokémon. Cada jogador monta um deck de 8 cartas (Pokémon e golpes), gasta **energia** para invocá-las na arena e tenta derrubar os **ginásios** do adversário.

O que o diferencia de um clone direto é a **tabela de tipos**: cada Pokémon tem tipo, e dano super efetivo / pouco efetivo muda completamente como você responde a cada jogada. Outro diferencial é a **evolução em batalha**: alguns Pokémon evoluem depois de derrotar inimigos.

| Item | Definição |
|---|---|
| Gênero | Estratégia em tempo real / tower defense competitivo (1v1) |
| Plataforma | Navegador (PC e celular), sem instalação |
| Público | O grupo de amigos do autor |
| Duração da partida | 3 minutos + até 1 minuto de prorrogação |
| Modos | Contra o bot · Online 1v1 por código de sala |
| Monetização | Nenhuma. Projeto pessoal |

## 2. Pilares de design

1. **Partidas rápidas e intensas.** 3 minutos, sem menus longos, entra e joga.
2. **Tipos importam.** A carta certa no momento certo vale mais que a carta mais cara.
3. **Fácil de compartilhar.** Um link e um código de sala bastam para jogar com um amigo.
4. **Cara de Pokémon.** Sprites clássicos, nomes e golpes conhecidos.

## 3. Loop de gameplay

```
Energia enche ──► Escolhe carta da mão (4 de 8) ──► Posiciona na arena
       ▲                                                  │
       │                                                  ▼
 Carta volta ao fim da fila ◄── Pokémon luta sozinho (IA da unidade)
                                                          │
                                                          ▼
                                      Derruba ginásios ──► Coroas ──► Vitória
```

- O jogador **não controla** os Pokémon depois de invocados. A decisão está em *qual* carta, *onde* e *quando*.
- A mão tem 4 cartas. Ao usar uma, ela vai para o fim da fila e a próxima entra. A carta seguinte aparece em "Próxima".

## 4. Regras da partida

| Regra | Valor |
|---|---|
| Tempo regular | 3:00 |
| Energia dupla | Último minuto (a partir de 1:00 restante) e prorrogação |
| Prorrogação | +1:00 se as coroas estiverem empatadas, morte súbita: quem derrubar o próximo ginásio vence |
| Desempate final | Vence quem tiver o ginásio mais fraco com mais vida; se ainda empatar, empate |
| Vitória imediata | Derrubar o Ginásio Líder (vale 3 coroas) |

**Coroas:** cada Ginásio lateral derrubado vale 1 coroa. Derrubar o Líder dá 3 coroas e encerra a partida.

## 5. Arena

- Grade lógica de **18 × 32 tiles**, em retrato. O jogador fica embaixo e o oponente em cima.
- Um **rio** atravessa o meio (linhas 15–17) com **2 pontes** (colunas ~3,5 e ~14,5). Pokémon terrestres só cruzam pelas pontes; voadores passam por cima.
- Cada lado tem:
  - 2 **Ginásios laterais** (um por pista)
  - 1 **Ginásio Líder** no centro, que fica *dormindo* até levar dano ou até um ginásio lateral cair
- **Área de invocação:** a sua metade da arena. Quando você derruba um ginásio lateral inimigo, a área se expande para a metade inimiga daquela pista ("bolsão").
- **Golpes** (feitiços) podem ser usados em qualquer lugar.

## 6. Energia

| Parâmetro | Valor |
|---|---|
| Máximo | 10 |
| Inicial | 5 |
| Regeneração | 1 a cada 2,8 s (dobra na energia dupla) |

## 7. Tabela de tipos

Multiplicador de dano do **ataque** (linha) contra o **tipo do alvo** (coluna). Com dois tipos, os multiplicadores são combinados, limitados entre **0,5× e 2×** para manter o jogo equilibrado. Não existe imunidade (0×).

| Ataque ↓ / Alvo → | Normal | Fogo | Água | Planta | Elétrico | Pedra | Voador | Veneno |
|---|---|---|---|---|---|---|---|---|
| **Normal** | 1 | 1 | 1 | 1 | 1 | ½ | 1 | 1 |
| **Fogo** | 1 | ½ | ½ | **2** | 1 | ½ | 1 | 1 |
| **Água** | 1 | **2** | ½ | ½ | 1 | **2** | 1 | 1 |
| **Planta** | 1 | ½ | **2** | ½ | 1 | **2** | ½ | ½ |
| **Elétrico** | 1 | 1 | **2** | ½ | ½ | 1 | **2** | 1 |
| **Pedra** | 1 | **2** | 1 | 1 | 1 | 1 | **2** | 1 |
| **Voador** | 1 | 1 | 1 | **2** | ½ | ½ | 1 | 1 |
| **Veneno** | 1 | 1 | 1 | **2** | 1 | ½ | 1 | ½ |

Os ginásios são do tipo **Normal**. Quando um golpe é super efetivo, aparece "Super efetivo!" na tela.

## 8. Cartas (deck inicial)

Unidades de medida: vida e dano em pontos; velocidade de ataque em segundos; alcance e velocidade de movimento em tiles (velocidade em tiles/s).

| Carta | Tipo | Custo | Vida | Dano | Ataque | Alcance | Velocidade | Alvo | Especial |
|---|---|---|---|---|---|---|---|---|---|
| Pikachu | Elétrico | 3 | 420 | 95 | 1,1 s | 4,5 | Rápido (1,5) | Terra e ar | — |
| Charmander | Fogo | 3 | 560 | 120 | 1,2 s | 2,5 | Médio (1,2) | Terra e ar | Dano em área pequena · Evolui em **Charmeleon** após 2 abates |
| Squirtle | Água | 3 | 760 | 80 | 1,1 s | Corpo a corpo | Médio (1,0) | Só terra | Evolui em **Wartortle** após 2 abates |
| Bulbasaur | Planta/Veneno | 4 | 980 | 105 | 1,3 s | 3,0 | Lento (0,9) | Terra e ar | Evolui em **Ivysaur** após 2 abates |
| Onix | Pedra | 6 | 2800 | 180 | 1,5 s | Corpo a corpo | Muito lento (0,75) | **Só ginásios** | Tanque |
| Zubat ×3 | Veneno/Voador | 3 | 200 cada | 65 | 1,0 s | Corpo a corpo | Muito rápido (1,6) | Terra e ar | Voa · Cada um evolui em **Golbat** após 1 abate |
| Choque do Trovão | Elétrico (golpe) | 3 | — | 280 | — | Raio 2,5 | — | Área | Atordoa 0,6 s · 35% de dano em ginásios |
| Explosão de Fogo | Fogo (golpe) | 4 | — | 420 | — | Raio 3,0 | — | Área | Cai após 0,7 s · 35% de dano em ginásios |

### Ginásios

| Ginásio | Vida | Dano | Ataque | Alcance |
|---|---|---|---|---|
| Lateral | 1500 | 55 | 0,8 s | 7,5 |
| Líder | 2600 | 70 | 1,0 s | 7,0 |

## 9. Evolução em batalha

- Algumas cartas têm um **contador de abates**. Ao atingir o número indicado, o Pokémon evolui na hora: troca de sprite, ganha vida máxima e dano, e fica um pouco maior.
- A porcentagem de vida atual é mantida, com mínimo de 50% (evoluir dá um fôlego).
- Abates feitos por golpes (feitiços) não contam.
- Ideia futura: cartas com pedras evolutivas (por exemplo, Pikachu + Pedra do Trovão = Raichu).

## 10. Comportamento das unidades (IA)

1. **Procura alvo:** o inimigo mais próximo dentro do campo de visão (5,5 tiles) que ela consiga atacar. Por exemplo, o Squirtle não ataca voadores e o Onix só ataca ginásios.
2. **Sem alvo por perto:** anda até o ginásio inimigo mais próximo. Terrestres passam pela ponte mais conveniente.
3. **Trava no alvo:** depois de começar a atacar, só troca de alvo se o atual morrer ou sair do alcance.
4. Unidades se empurram (as mais pesadas empurram mais) e levam **1 s para entrar em campo** depois de invocadas.

## 11. Bot (modo solo)

Três dificuldades: **Fácil**, **Normal** e **Difícil**. Elas mudam o tempo de reação, a precisão e a recarga de energia do bot (85% / 100% / 120% da do jogador).

- **Defesa:** quando um Pokémon seu entra no lado dele, o bot escolhe a carta com melhor vantagem de tipo que consiga atacar aquele alvo. Se houver grupos de inimigos, usa golpes em área.
- **Ataque:** com energia acumulada, manda um tanque (Onix) na pista do ginásio mais fraco e depois coloca suporte atrás.
- **Finalização:** se um ginásio seu estiver com pouca vida, usa um golpe direto nele.

## 12. Multiplayer (v0.2)

**Fluxo para o jogador**
1. Um jogador clica em **Criar sala** e recebe um código (ex.: `SNOR-17`).
2. Clica em **Copiar convite** e manda no grupo. O convite traz o código e um link `?sala=SNOR17`; quem abre o link entra direto.
3. O outro jogador digita o código em **Entrar** (ou abre o link). A partida começa sozinha quando os dois se conectam.
4. No fim, o anfitrião pode pedir **Revanche**; o convidado entra automaticamente na nova partida.

**Técnico**
- **Conexão P2P via WebRTC** usando PeerJS 1.5.4 (CDN). O servidor público gratuito do PeerJS (`0.peerjs.com`) só faz a apresentação; os dados da partida vão direto entre os navegadores.
- O código da sala vira o ID do anfitrião no PeerJS (`pokeroyale-v1-SNOR17`). Se o ID já estiver em uso, um novo código é sorteado.
- **Anfitrião autoritativo:** quem cria a sala é o lado 0 e roda a simulação. O convidado (lado 1) envia só `{t:'deploy', i, x, y}`; o anfitrião valida e aplica.
- O anfitrião envia **snapshots** do estado completo 20×/s (`Game.toSnapshot()`); o convidado aplica (`applySnapshot()`) e interpola as posições entre um snapshot e outro.
- O convidado vê a arena **invertida**: a base dele fica embaixo, igual ao anfitrião.
- A simulação roda num `setInterval` com passo fixo de 1/60 s, então o anfitrião continua simulando mesmo com a aba em segundo plano (o navegador reduz a frequência, mas o tempo da partida não atrasa).
- **Sala cheia:** um terceiro jogador recebe "Essa sala já está cheia".
- **Desconexão:** se alguém sai no meio da partida, o outro vê "Seu amigo saiu" / "Conexão perdida".

**Limitações conhecidas**
- Algumas redes (4G de certas operadoras, redes corporativas) bloqueiam conexão P2P direta. Nesses casos seria preciso um servidor TURN. Fica para depois, se der problema.
- O convidado tem um pequeno atraso (latência da rede + até 50 ms) entre jogar a carta e vê-la aparecer.
- Os dois precisam abrir o jogo pelo mesmo endereço publicado (ex.: GitHub Pages); `localhost` só funciona no próprio PC.

## 13. Controles e interface

- **Invocar:** arraste a carta até a arena, ou toque na carta e depois no local. Teclas **1–4** selecionam cartas no PC.
- Com uma carta selecionada, a área proibida fica **vermelha**; a prévia mostra o Pokémon ou o raio do golpe.
- **HUD:** coroas (inimigo / você) e cronômetro no topo; mão de 4 cartas + "Próxima" embaixo; barra de energia com 10 segmentos.
- **Cores dos times:** azul = você, vermelho = oponente (anel embaixo do Pokémon e barra de vida). Seus Pokémon aparecem de costas, os do oponente de frente.

## 14. Arte e som

- **Sprites:** PokéAPI (`github.com/PokeAPI/sprites`), carregados da internet. Se a imagem não carregar, o jogo desenha um círculo da cor do tipo com a inicial do Pokémon.
- **Ginásios:** desenhados como Pokébolas gigantes (azuis ou vermelhas); o Líder tem coroa.
- **Som (futuro):** efeitos de ataque, grito do Pokémon ao entrar em campo e trilha de batalha 8-bit.

## 15. Arquitetura técnica

Sem build: HTML, CSS e JavaScript puro. A única dependência é o PeerJS, carregado por CDN para o multiplayer.

```
PokeRoyale/
├── index.html        # estrutura da página e HUD
├── css/style.css     # visual
├── js/data.js        # cartas, tipos, constantes de balanceamento
├── js/game.js        # simulação (regras, unidades, combate) — sem nada de tela
├── js/bot.js         # IA do oponente
├── js/render.js      # desenho no <canvas>
├── js/net.js         # multiplayer (PeerJS, código de sala)
└── js/main.js        # menus, entrada do jogador, loop principal
```

- **Separação simulação × tela:** `game.js` não sabe nada de canvas. Isso permite rodar a simulação no host do multiplayer e só desenhar no convidado.
- **Balanceamento centralizado:** todos os números do jogo ficam em `data.js`.

## 16. Roadmap

| Fase | Conteúdo | Status |
|---|---|---|
| **v0.1** | Arena, 8 cartas, energia, tipos, evolução, ginásios, bot com 3 dificuldades | ✅ Feito |
| **v0.2** | Multiplayer online por código de sala (PeerJS) | ✅ Feito |
| v0.2.1 | Publicar no GitHub Pages para jogar com os amigos | ⏳ Próximo |
| v0.3 | Editor de deck + mais Pokémon (Geodude, Gastly, Snorlax, Machop, Eevee...) | 💡 Ideia |
| v0.4 | Sons, animações de ataque, emotes (Pikachu feliz/bravo) | 💡 Ideia |
| v0.5 | Cartas de construção (Pokécentro que cura, Torre de Mewtwo...) e pedras evolutivas | 💡 Ideia |

## 17. Questões em aberto

- Os ginásios devem ter tipo (ex.: ginásio de água) para variar as partidas?
- Raridade de cartas e níveis, ou todas iguais (mais justo entre amigos)?
- Ranking simples entre amigos (vitórias guardadas num placar compartilhado)?
