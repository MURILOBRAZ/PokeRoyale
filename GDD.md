# PokéRoyale — Game Design Document

> Versão do documento: 0.3 · Data: 19/10/2026
> Fangame sem fins lucrativos, feito para jogar com amigos. Pokémon é marca da Nintendo / Game Freak / The Pokémon Company; este projeto não é afiliado a elas.

---

## 1. Visão geral

**PokéRoyale** é um jogo de estratégia em tempo real no estilo *Clash Royale*, só que com Pokémon. Cada jogador monta um deck de 8 cartas, escolhidas entre **os 151 Pokémon da 1ª geração** e golpes,, gasta **energia** para invocá-las na arena e tenta derrubar os **ginásios** do adversário.

O que o diferencia de um clone direto é a **tabela de tipos**: cada Pokémon tem tipo, e dano super efetivo / pouco efetivo muda completamente como você responde a cada jogada. Outro diferencial é a **evolução em batalha**: alguns Pokémon evoluem depois de derrotar inimigos.

| Item | Definição |
|---|---|
| Gênero | Estratégia em tempo real / tower defense competitivo (1v1) |
| Plataforma | Navegador (PC e celular), sem instalação · https://pokeroyale.vercel.app |
| Público | O grupo de amigos do autor |
| Duração da partida | 3 minutos + até 1 minuto de prorrogação |
| Modos | Contra o bot · Online 1v1 por código de sala |
| Monetização | Nenhuma. Projeto pessoal |

## 2. Pilares de design

1. **Partidas rápidas e intensas.** 3 minutos, sem menus longos, entra e joga.
2. **Tipos importam.** A carta certa no momento certo vale mais que a carta mais cara.
3. **Fácil de compartilhar.** Um link e um código de sala bastam para jogar com um amigo.
4. **Cara de Pokémon.** Todos os 151 originais, com sprites animados no estilo *Mystery Dungeon*.

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

Usa a **tabela oficial completa (18 tipos)**, com os tipos atuais de cada Pokémon (ex.: Clefairy é Fada, Magnemite é Elétrico/Aço). Com dois tipos, os multiplicadores são combinados.

Regra do jogo: o resultado fica sempre **entre 0,5× e 2×**. Não existe imunidade (o que seria 0× vira 0,5×) nem 4×. Assim nenhuma carta fica inútil contra outra.

- O **tipo do ataque** é o primeiro tipo do Pokémon. Exceção: se o primeiro for Normal e houver um segundo, usa o segundo (Pidgey ataca como Voador).
- Os **ginásios não têm tipo**: todo ataque causa dano normal neles.
- Quando um ataque é super efetivo, aparece "Super efetivo!" na tela.

A tabela completa está em `TYPE_CHART`, em `js/data.js`.

## 8. Cartas: os 151 Pokémon

Todas as 151 cartas são **geradas automaticamente** a partir dos stats oficiais (PokéAPI), por regras fixas em `makePokemonCard()` (`js/data.js`). Para mudar o balanceamento de todos de uma vez, ajuste as regras; para casos especiais, use as listas de exceção.

### Regras de conversão

| Atributo da carta | Vem de |
|---|---|
| **Custo** (1–9) | Total de stats base: `(total − 150) / 62`, arredondado. Bandos custam +1 |
| **Vida** | Custo × proporção de HP/Defesa/Def. Especial no total |
| **Dano** | Custo × proporção do stat de ataque (Ataque ou Ataque Especial) no total |
| **Velocidade de ataque e de movimento** | Speed |
| **Tamanho** (colisão) e **peso** (quem empurra quem) | Altura e peso oficiais |
| **Distância × corpo a corpo** | Tipo do ataque, como na 1ª geração: tipos "especiais" atacam à distância |
| **Voa** | Tipo Voador, mais Gastly, Haunter, Koffing e Weezing (levitam). Doduo/Dodrio não voam |
| **Evolução** | Linha evolutiva oficial (só dentro da 1ª geração) |

Alcance por tipo do ataque: Elétrico 4,5 · Gelo 4 · Psíquico 4 · Água 3,5 · Dragão 3,5 · Fantasma 3,5 · Fada 3,5 · Fogo 3 · Planta 3. Os demais tipos lutam corpo a corpo.

Ajustes gerais: quem ataca à distância tem 85% da vida e 80% do dano; voadores têm 90% da vida. Os extremos são suavizados (expoente 0,7) para canhões de vidro como Abra e tanques puros não dominarem. Ataques de Fogo, Gelo, Terra e Pedra causam dano em área pequena.

**Alvo:** quem ataca à distância ou voa acerta terra e ar; corpo a corpo terrestre só acerta terra.

### Exceções (papéis especiais)

| Papel | Pokémon | Efeito |
|---|---|---|
| Tanque de ginásio | Onix, Graveler, Golem, Rhyhorn, Rhydon, Snorlax | Só ataca ginásios; 2,2× vida |
| Bando | Caterpie, Weedle, Rattata, Spearow, Zubat, Diglett, Exeggcute | Vêm 3 de uma vez (cada um mais fraco); evoluem com 1 abate |
| Explosão | Voltorb, Electrode | Explodem no primeiro ataque: dano em área (raio 2) e saem de campo |
| Piada | Magikarp | Custo 1, quase sem dano… mas evolui em **Gyarados** com 1 abate |

### Exemplos (valores gerados)

| Carta | Tipo | Custo | Vida | Dano | Ataque | Alcance | Velocidade | Alvo |
|---|---|---|---|---|---|---|---|---|
| Pikachu | Elétrico | 3 | 542 | 69 | 1 s | 4,5 | 1,37 | Terra e ar |
| Charmander | Fogo | 3 | 582 | 96 | 1,2 s | 3 | 1,14 | Terra e ar |
| Squirtle | Água | 3 | 680 | 98 | 1,4 s | 3,5 | 0,94 | Terra e ar |
| Zubat ×3 | Veneno/Voador | 3 | 241 cada | 45 | 1,3 s | Corpo a corpo | 1,05 | Terra e ar |
| Onix | Pedra/Terra | 4 | 2401 | 112 | 1,2 s | Corpo a corpo | 0,95 | **Só ginásios** |
| Eevee | Normal | 3 | 801 | 118 | 1,3 s | Corpo a corpo | 1,05 | Só terra |
| Gengar | Fantasma/Veneno | 6 | 1099 | 177 | 0,9 s | 3,5 | 1,55 | Terra e ar |
| Snorlax | Normal | 6 | 4289 | 311 | 1,5 s | Corpo a corpo | 0,66 | **Só ginásios** |
| Dragonite | Dragão/Voador | 7 | 1336 | 185 | 1,1 s | 3,5 | 1,28 | Terra e ar |
| Mewtwo | Psíquico | 9 | 1797 | 187 | 0,7 s | 4 | 1,73 | Terra e ar |

Distribuição de custos: 1 (3 cartas) · 2 (17) · 3 (38) · 4 (23) · 5 (33) · 6 (30) · 7 (6) · 9 (Mewtwo). Velocidade em tiles/s.

### Golpes

| Carta | Tipo | Custo | Dano | Raio | Especial |
|---|---|---|---|---|---|
| Choque do Trovão | Elétrico | 3 | 280 | 2,5 | Atordoa 0,6 s · 35% de dano em ginásios |
| Explosão de Fogo | Fogo | 4 | 420 | 3,0 | Cai após 0,7 s · 35% de dano em ginásios |

### Ginásios

| Ginásio | Vida | Dano | Ataque | Alcance |
|---|---|---|---|---|
| Lateral | 1500 | 55 | 0,8 s | 7,5 |
| Líder | 2600 | 70 | 1,0 s | 7,0 |

### Deck

- 8 cartas diferentes, montadas no **editor de deck** (menu → "Meu deck"), com busca, filtro por tipo e ordenação. O deck fica salvo no navegador.
- Botão **Aleatório** sorteia um deck jogável: 1–2 golpes, custo médio entre 2,8 e 4,6, pelo menos 2 cartas que acertam voadores e no máximo 1 carta de custo 8+.
- Deck **Padrão**: Pikachu, Charmander, Squirtle, Bulbasaur, Onix, Zubat, Choque do Trovão e Explosão de Fogo.
- No online, cada jogador usa o próprio deck salvo.

## 9. Evolução em batalha

- Pokémon com evolução têm um **contador de abates**: 2 abates para o estágio básico, 3 para o intermediário, 1 para bandos e Magikarp.
- Ao atingir o número, o Pokémon **vira a carta seguinte da linha evolutiva** (stats, tipo, tamanho, se voa). Pode evoluir de novo: Charmander → Charmeleon → Charizard na mesma partida.
- **Eevee** sorteia entre Vaporeon, Jolteon e Flareon.
- Membros de bando evoluem com 60% dos stats da carta cheia.
- A porcentagem de vida atual é mantida, com mínimo de 50% (evoluir dá um fôlego).
- Abates feitos por golpes (feitiços) não contam. Lendários e Voltorb/Electrode não evoluem.

## 10. Comportamento das unidades (IA)

1. **Procura alvo:** o inimigo mais próximo dentro do campo de visão (5,5 tiles) que ela consiga atacar.
2. **Sem alvo por perto:** anda até o ginásio inimigo mais próximo. Terrestres passam pela ponte mais conveniente, e bandos atravessam lado a lado.
3. **Contorna ginásios** que estejam no caminho (os próprios e os inimigos que não são o alvo).
4. **Trava no alvo:** depois de começar a atacar, só troca de alvo se o atual morrer ou sair do alcance.
5. Unidades se empurram (as mais pesadas empurram mais) e levam **1 s para entrar em campo**. Inimigos que não podem atacar um ao outro (ex.: dois tanques de ginásio) passam sem se bloquear.

## 11. Bot (modo solo)

Três dificuldades: **Fácil**, **Normal** e **Difícil**. Elas mudam o tempo de reação, a precisão e a recarga de energia do bot (85% / 100% / 120% da do jogador).

- **Deck:** a cada partida o bot recebe um **deck aleatório** (mesmas regras do botão "Aleatório"). Isso também ajuda a testar todas as cartas.
- **Defesa:** quando um Pokémon seu entra no lado dele, o bot escolhe a carta com melhor vantagem de tipo que consiga atacar aquele alvo. Se houver grupos de inimigos, usa golpes em área.
- **Ataque:** com energia acumulada, manda um tanque na pista do ginásio mais fraco e depois coloca suporte atrás.
- **Finalização:** se um ginásio seu estiver com pouca vida, usa um golpe direto nele.

### 11.1 Testes automáticos

`node tools/simulate.js 1500` roda partidas bot × bot com decks aleatórios e relata:

- erros, valores inválidos (NaN), unidades paradas sem motivo por 12 s e unidades andando no rio fora da ponte;
- cartas nunca jogadas ou que nunca causam dano;
- as cartas mais fortes e mais fracas (taxa de vitória dos decks que as contêm).

Resultado na v0.3 (1.500 partidas): todas as 153 cartas jogadas, **0 problemas**, e 122 das 153 cartas com vitória entre 40% e 60%. Extremos: ~68% (Magneton) e ~26% (as mais fracas, como Caterpie).

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
- Os dois precisam abrir o jogo pelo mesmo endereço publicado (https://pokeroyale.vercel.app); `localhost` só funciona no próprio PC.

## 13. Controles e interface

- **Invocar:** arraste a carta até a arena, ou toque na carta e depois no local. Teclas **1–4** selecionam cartas no PC.
- Com uma carta selecionada, a área proibida fica **vermelha**; a prévia mostra o Pokémon ou o raio do golpe.
- **HUD:** coroas (inimigo / você) e cronômetro no topo; mão de 4 cartas + "Próxima" embaixo; barra de energia com 10 segmentos.
- **Cores dos times:** azul = você, vermelho = oponente (anel embaixo do Pokémon e barra de vida). Seus Pokémon aparecem de costas, os do oponente de frente.

## 14. Arte e som

- **Sprites:** [SpriteCollab](https://github.com/PMDCollab/SpriteCollab) (estilo *Pokémon Mystery Dungeon*), licença CC BY-NC 4.0, créditos em `CREDITS.md`. Animações de parado, andar e atacar (corpo a corpo ou à distância), em **8 direções**: seus Pokémon andam de costas para você, os do oponente de frente.
- **Arte das cartas:** retratos do SpriteCollab.
- **Reserva:** enquanto a folha animada carrega, o jogo usa o sprite estático da PokéAPI; sem nenhum dos dois, um círculo da cor do tipo com a inicial.
- **Ginásios:** desenhados como Pokébolas gigantes (azuis ou vermelhas); o Líder tem coroa.
- **Som (futuro):** efeitos de ataque, grito do Pokémon ao entrar em campo e trilha de batalha 8-bit.

### 14.1 Backlog visual (para a v0.5)

Decidido em 19/10/2026: primeiro funcionalidade (v0.3 e v0.4), depois um passe de visual cobrindo **todo** o elenco de uma vez. Assim nenhum efeito precisa ser refeito quando entrarem Pokémon novos.

**Como está hoje (v0.2)**
- Ataques à distância: uma bolinha da cor do tipo voa até o alvo (igual para todos).
- Ataques corpo a corpo (Squirtle, Onix, Zubat): sem efeito; o atacante dá um pulinho e o alvo pisca branco.
- Golpes: Choque do Trovão (raio em zigue-zague simples + clarão amarelo) e Explosão de Fogo (bola caindo + círculo laranja).
- ~~Sprites estáticos~~ → resolvido na v0.3 com o SpriteCollab (parado, andar, atacar, 8 direções).

**A fazer**
- [ ] **Efeito de golpe por Pokémon** (campo `attackFx` em `data.js`, desenhado em `render.js`):
  - Pikachu: raio em zigue-zague até o alvo
  - Charmander/Charmeleon: rajada de chamas com partículas
  - Squirtle/Wartortle: jato d'água com bolhas
  - Bulbasaur/Ivysaur: chicote de vinha se esticando até o alvo
  - Onix: pancada com poeira e leve tremida de tela
  - Zubat/Golbat: mordida/asa roxa
  - Pokémon novos da v0.3: definir o efeito junto com a carta
- [ ] **Efeitos de impacto**: partículas no acerto, tremida de tela em golpes fortes, faíscas em "Super efetivo!"
- [x] **Sprites animados**: SpriteCollab, feito na v0.3
- [ ] **Sincronizar o dano com o quadro do golpe** (`hit` em `js/sprites.js`): hoje o dano sai no início da animação de ataque
- [ ] **Animações extras do SpriteCollab**: `Hurt` ao levar dano, `Faint` ao ser derrotado
- [ ] **Animação de evolução** mais caprichada (brilho branco piscando, como nos jogos)
- [ ] **Som**: efeito por tipo de ataque, grito ao entrar em campo, trilha de batalha
- [ ] **Multiplayer**: os efeitos devem ser gerados no convidado a partir dos eventos de ataque do snapshot (hoje só projéteis e efeitos genéricos são enviados)

## 15. Arquitetura técnica

Sem build: HTML, CSS e JavaScript puro. A única dependência é o PeerJS, carregado por CDN para o multiplayer.

```
PokeRoyale/
├── index.html        # estrutura da página e HUD
├── css/style.css     # visual
├── js/pokedex.js     # 151 Pokémon (gerado da PokéAPI)
├── js/sprites.js     # metadados das animações (gerado do SpriteCollab)
├── js/data.js        # regras que geram as cartas, tipos, constantes
├── js/deck.js        # editor de deck
├── js/game.js        # simulação (regras, unidades, combate) — sem nada de tela
├── js/bot.js         # IA do oponente
├── js/render.js      # desenho no <canvas>
├── js/net.js         # multiplayer (PeerJS, código de sala)
├── js/main.js        # menus, entrada do jogador, loop principal
└── tools/            # geradores de dados e teste automático (Node)
```

- **Separação simulação × tela:** `game.js` não sabe nada de canvas. Isso permite rodar a simulação no host do multiplayer e só desenhar no convidado.
- **Balanceamento centralizado:** todos os números do jogo ficam em `data.js`.
- **Dados gerados:** `node tools/build-pokedex.mjs` e `node tools/build-sprites.mjs` recriam `pokedex.js`, `sprites.js` e `CREDITS.md`. O jogo só acessa a internet para carregar imagens.

- **Publicação:** Vercel (projeto `pokeroyale`), ligado ao repositório do GitHub: cada `git push` na `main` publica sozinho em https://pokeroyale.vercel.app.

## 16. Roadmap

| Fase | Conteúdo | Status |
|---|---|---|
| **v0.1** | Arena, 8 cartas, energia, tipos, evolução, ginásios, bot com 3 dificuldades | ✅ Feito |
| **v0.2** | Multiplayer online por código de sala (PeerJS) | ✅ Feito |
| v0.2.1 | Publicado online (GitHub Pages, depois Vercel na v0.3) | ✅ Feito |
| **v0.3** | Os 151 Pokémon, editor de deck, sprites animados (SpriteCollab), testes automáticos | ✅ Feito |
| v0.4 | Contas, decks iniciais, troféus, arenas (ginásios), Premier Balls, níveis (ver [17](#17-contas-e-progressão-v04--proposta-para-revisão)) | ⏳ Próximo |
| v0.5 | Passe de visual e som (ver [14.1 Backlog visual](#141-backlog-visual-para-a-v05)) + emotes (Pikachu feliz/bravo) | 📝 Anotado |
| v0.6 | Cartas de construção (Pokécentro que cura, Torre de Mewtwo...) | 💡 Ideia |

## 17. Contas e progressão (v0.4 — proposta para revisão)

Inspirado no Clash Royale: o jogador cria uma conta, escolhe um inicial, batalha, ganha troféus e Premier Balls, coleciona e sobe o nível dos Pokémon, e avança pelos ginásios de Kanto até a Liga Pokémon.

### 17.1 Fluxo do jogador

1. **Cria a conta** com e-mail, senha e nome de treinador.
2. **Escolhe o inicial:** Bulbasaur, Charmander ou Squirtle. Cada um vem com um deck inicial diferente (17.2), e essas 8 cartas são a coleção inicial.
3. **Batalha** contra o bot ou contra amigos. Vitória dá **troféus** e uma **Premier Ball** (se houver espaço).
4. **Abre a Premier Ball:** cartas de Pokémon, Pokédólares e, às vezes, itens.
5. **Sobe o nível das cartas** com cópias repetidas + Pokédólares. Cada melhoria dá XP de treinador.
6. **Troféus levam aos próximos ginásios** (arenas), que liberam novos Pokémon nas Premier Balls.
7. **Topo:** a Liga Pokémon.

O modo **Treino** (contra o bot, sem conta, com todas as cartas) continua existindo para testes e para quem só quer jogar.

### 17.2 Decks iniciais

| Inicial | Deck (8 cartas) | Custo médio | Ideia |
|---|---|---|---|
| 🌿 Bulbasaur | Bulbasaur, Oddish, Caterpie ×3, Pidgey, Nidoran♀, Geodude, Ekans, Choque do Trovão | 2,4 | Barato e rápido, muita pressão |
| 🔥 Charmander | Charmander, Growlithe, Spearow ×3, Rattata ×3, Mankey, Sandshrew, Zubat ×3, Choque do Trovão | 2,9 | Agressivo, cheio de bandos |
| 💧 Squirtle | Squirtle, Poliwag, Psyduck, Pidgey, Weedle ×3, Diglett ×3, Nidoran♂, Explosão de Fogo | 2,6 | Equilibrado, bom de defesa |

### 17.3 Troféus e arenas (ginásios de Kanto)

Cada arena tem a cor/tema do ginásio e **libera os Pokémon do seu tipo** nas Premier Balls (além dos das arenas anteriores). A regra de qual Pokémon pertence a qual arena é pelo **primeiro tipo**; lendários ficam na Liga.

| # | Arena | Líder | Troféus | Libera (tipo) | Qtd. de Pokémon |
|---|---|---|---|---|---|
| 0 | Rota 1 | — | 0 | Normal, Inseto, Voador, Fada + iniciais | 36 |
| 1 | Ginásio de Pewter | Brock | 300 | Pedra | 9 |
| 2 | Ginásio de Cerulean | Misty | 600 | Água | 28 |
| 3 | Ginásio de Vermilion | Lt. Surge | 1000 | Elétrico | 8 |
| 4 | Ginásio de Celadon | Erika | 1400 | Planta | 12 |
| 5 | Ginásio de Fuchsia | Koga | 1800 | Veneno | 14 |
| 6 | Ginásio de Saffron | Sabrina | 2300 | Psíquico | 6 |
| 7 | Ginásio de Cinnabar | Blaine | 2800 | Fogo | 11 |
| 8 | Ginásio de Viridian | Giovanni | 3300 | Terra | 8 |
| 9 | Liga Pokémon | Elite dos Quatro + Campeão | 4000 | Gelo, Lutador, Fantasma, Dragão + lendários | 19 |

- **Troféus por partida:** vitória online +30 / derrota −20; vitória contra o bot +20 / derrota −10.
- **Piso da arena:** depois de chegar a uma arena, não se cai abaixo do troféu inicial dela (como no Clash Royale).
- Ao chegar numa arena nova: tela de **insígnia** do ginásio (Insígnia da Rocha, da Cascata...). As 8 insígnias aparecem no perfil.
- **Bot por arena:** o bot usa Pokémon das arenas liberadas e fica mais forte (nível das cartas acompanha a arena). Na Liga, cada "membro da Elite" tem um deck temático.

### 17.4 Raridade

| Raridade | Regra | Qtd. |
|---|---|---|
| Comum | Estágio básico e total de stats < 400 | 58 |
| Rara | 1ª evolução, ou total de stats 400–499 | 54 |
| Épica | 2ª evolução, ou total de stats ≥ 500 | 34 |
| Lendária | Articuno, Zapdos, Moltres, Mewtwo, Mew | 5 |

### 17.5 Premier Balls (baús)

- **4 espaços.** Uma vitória dá uma ball se houver espaço livre. Só uma ball abre por vez (cronômetro).
- **Ball grátis:** uma Poké Ball grátis a cada 4 h (acumula até 2).
- O tipo da ball sai por sorteio na vitória:

| Ball | Chance | Tempo para abrir | Cartas | Pokédólares | Garantido |
|---|---|---|---|---|---|
| Premier Ball | 70% | 15 min | 4 | 20–40 | — |
| Great Ball | 22% | 1 h | 10 | 60–100 | 1 rara |
| Ultra Ball | 7% | 3 h | 25 | 150–250 | 1 épica + chance de item |
| Master Ball | 1% | 8 h | 40 | 400–600 | 1 lendária (se a Liga estiver liberada; senão 2 épicas) |
| Poké Ball (grátis) | — | na hora | 2 | 10–20 | — |

As quantidades crescem com a arena (+10% por arena). O conteúdo é **sorteado no servidor** no momento de abrir.

### 17.6 Itens

| Item | Efeito |
|---|---|
| Pedra do Fogo / Água / Trovão / Folha / Lua | Vale como **cópia curinga** de qualquer carta do tipo correspondente (Lua: Fada, Normal, Psíquico e Fantasma) |
| Doce Raro | Sobe **1 nível** de qualquer carta, sem custo |

### 17.7 Níveis de carta e de treinador

- Cartas vão do **nível 1 ao 10**. Cada nível dá **+8% de vida e dano**.
- Para subir: cópias + Pokédólares.

| Nível → | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|
| Cópias (comum) | 2 | 4 | 10 | 20 | 50 | 100 | 200 | 400 | 800 |
| Cópias (rara) | 2 | 4 | 10 | 20 | 50 | 100 | 200 | 400 | — |
| Cópias (épica) | 2 | 4 | 10 | 20 | 40 | 80 | 150 | — | — |
| Cópias (lendária) | 1 | 2 | 4 | 8 | 15 | — | — | — | — |
| Pokédólares | 5 | 20 | 50 | 150 | 400 | 1000 | 2000 | 4000 | 8000 |

Raras começam no nível 3, épicas no 6 e lendárias no 9, para todas terminarem no 10 (como no Clash Royale).

- **Nível de treinador:** sobe com XP (melhorar cartas e vencer). Cada nível dá +4% de vida e dano aos **seus ginásios** na partida. Máximo 13.

### 17.8 Online e justiça

- Partidas online contra amigos valem troféus e usam os **níveis reais** das cartas.
- Opção **"Amistoso"** na sala: não vale troféus nem balls, e todas as cartas jogam no mesmo nível (para testar decks de igual para igual).

### 17.9 Técnico

- **Servidor:** funções da Vercel (`/api/*`) + banco **Neon (Postgres)**, criado pela integração da Vercel. O jogo continua estático; só conta, coleção e recompensas passam pelo servidor.
- **Login:** e-mail + senha. A senha é guardada com hash (`scrypt`), e a sessão vai num cookie `httpOnly`. **Recuperar senha** fica para depois (precisa de um serviço de envio de e-mail).
- **O servidor é a fonte da verdade** para coleção, troféus, balls e itens. O conteúdo das balls é sorteado no servidor.
- **Resultado da partida:** o jogo envia o resultado ao fim da partida; o servidor confere se é plausível (duração mínima, limite de partidas por hora, uma recompensa por partida). Num jogo entre amigos isso basta; trapaça "séria" exigiria simular a partida no servidor.
- **Tabelas:** `users`, `sessions`, `collection` (carta, nível, cópias), `decks`, `balls` (espaço, tipo, arena, abre_em), `items`, `matches` (histórico).

### 17.10 Decisões em aberto

- Tempos das balls estão bons para um grupo de amigos, ou melhor encurtar (ex.: 5 min / 20 min / 1 h / 3 h)?
- Os números de troféus por arena (300 a 4000) estão bons, ou mais rápido no começo?
- Nível de treinador deve fortalecer os ginásios, como no Clash Royale, ou ser só visual?

## 18. Questões em aberto

- Os ginásios devem ter tipo (ex.: ginásio de água) para variar as partidas?
- Raridade de cartas e níveis, ou todas iguais (mais justo entre amigos)?
- Ranking simples entre amigos (vitórias guardadas num placar compartilhado)?
