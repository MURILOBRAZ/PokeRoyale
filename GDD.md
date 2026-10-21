# PokéRoyale — Game Design Document

> Versão do documento: 0.6 · Data: 19/10/2026
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
| Modos | Conta com progressão (troféus, arenas, Premier Balls) · Treino contra o bot · Online 1v1 por código de sala |
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

**Coroas:** cada Ginásio lateral derrubado vale 1 coroa. Derrubar o Líder dá 3 coroas e encerra a partida, e os ginásios laterais que ainda estavam de pé desabam junto, como no Clash Royale.

**Fim chegando:** nos últimos 10 s (do tempo normal e da morte súbita), aparece um número grande no meio da tela a cada segundo, o relógio fica vermelho e pulsando, as bordas pulsam em vermelho e toca um "tic" por segundo, mais agudo nos 3 últimos. A música acelera para 190 BPM.

## 5. Arena

- Grade lógica de **18 × 32 tiles**, em retrato. O jogador fica embaixo e o oponente em cima.
- Um **rio** atravessa o meio (linhas 14,7–17,3) com **2 pontes** (colunas 2,35 e 15,65, largura 2,3). Pokémon terrestres só cruzam pelas pontes; voadores passam por cima. As medidas seguem os mapas desenhados das arenas: cada pista sai de um ginásio lateral e passa por uma ponte.
- **Nadar (v0.9.2):** Pokémon terrestres do tipo Água atravessam o rio nadando, fora das pontes, 20% mais rápido que andando (`SWIM_SPEED`). Só nas arenas em que o rio é de água: Rota 1, Cerulean, Celadon e Liga (`river: 'water'` em `ARENAS`). Nas outras, o meio é lava (Cinnabar), pântano venenoso (Fuchsia), abismo, cristais ou cânion, e todos usam a ponte. Nadando, o Pokémon afunda até a cintura e deixa ondas na cor do time e um rastro em V. Entrar e sair da água faz um espirro com som. Não dá para invocar dentro do rio.
- Cada lado tem:
  - 2 **Ginásios laterais** (um por pista)
  - 1 **Ginásio Líder** no centro, que fica *dormindo* até levar dano ou até um ginásio lateral cair
- **Área de invocação:** a sua metade da arena. Quando você derruba um ginásio lateral inimigo, a área se expande para a metade inimiga daquela pista ("bolsão").
- **Golpes** (feitiços) podem ser usados em qualquer lugar.
- **Soltou num lugar proibido** (lado do oponente, rio, em cima de um ginásio): o Pokémon nasce no **ponto permitido mais próximo**. Ao arrastar, a prévia já mostra onde ele vai nascer, com uma linha tracejada do dedo até lá.

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
| Voa sem ser Voador | Gastly, Haunter, Koffing, Weezing, Beedrill, Venomoth | Voadores (`FLOATING`): passam por cima do rio e acertam voadores |
| Ave que anda | Doduo, Dodrio, Farfetch'd | Ficam no chão (`GROUNDED_BIRDS`); o Farfetch'd não tem animação de voo |
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
- **Arrastar cartas:** na Pokédex, dá para arrastar a carta para o deck, como no Clash Royale. No celular, segura-se a carta por um instante antes de arrastar, para a lista continuar rolando. Soltar num espaço vazio coloca a carta no deck; soltar em cima de uma carta troca as duas; arrastar entre espaços do deck muda a ordem; arrastar uma carta do deck para fora tira ela do deck.
- **Vários decks (com conta):** 5 decks salvos no servidor, em abas 1–5 na Pokédex. O deck marcado com ⚔️ é o que vai para a batalha. Tocar num deck salvo passa a usar ele. Num espaço vazio, o deck começa como cópia do atual. **Salvamento automático, sem avisos:** um deck completo é salvo sozinho logo depois de cada mudança, e o deck editado passa a ser o de batalha. Um deck incompleto fica guardado na tela até ser completado. A aba da conta se chama **Pokédex** (antes "Coleção"), com as sub-abas **Pokémon** (antes "Cartas") e **Ginásios**, e não tem os botões Aleatório, Inicial e Salvar. Se o deck estiver incompleto, aparece "Faltam N" ao lado do custo médio. No deck de treino, sem conta, os botões continuam.

## 9. Evolução em batalha

- Pokémon com evolução têm um **contador de abates**: 2 abates para o estágio básico, 3 para o intermediário, 1 para bandos e Magikarp.
- Ao atingir o número, o Pokémon **vira a carta seguinte da linha evolutiva** (stats, tipo, tamanho, se voa). Pode evoluir de novo: Charmander → Charmeleon → Charizard na mesma partida.
- **Eevee** sorteia entre Vaporeon, Jolteon e Flareon.
- Membros de bando evoluem com 60% dos stats da carta cheia.
- A porcentagem de vida atual é mantida, com mínimo de 50% (evoluir dá um fôlego).
- Abates feitos por golpes (feitiços) não contam. Lendários e Voltorb/Electrode não evoluem.

## 10. Comportamento das unidades (IA)

1. **Procura alvo:** o inimigo mais próximo dentro do campo de visão que ela consiga atacar: 4,5 tiles (`MATCH.SIGHT`, era 5,5), ou o alcance dela + 0,5, se for maior. O que já dá para acertar vem antes do que ainda está chegando. Entre os ginásios, conta o da pista (abaixo) ou qualquer um que já esteja ao alcance do ataque. Para não ficar indo e voltando entre inimigos, só troca o alvo atual (Pokémon ou ginásio) por um que dê para acertar já ou que esteja pelo menos 1 tile mais perto: com um ginásio logo à frente, um Pokémon que vem chegando não tira o foco.
2. **Sem alvo por perto:** segue a pista, como no Clash Royale, dos dois lados do rio: vai ao ginásio lateral daquele lado e, se ele já caiu, ao Ginásio Líder, sem atravessar o mapa para a outra pista. A metade da arena em que ele foi invocado decide a pista: na metade do lateral que ainda está de pé, mesmo que pendendo só um pouco para aquele lado, vai a esse lateral; na metade do lateral que caiu, vai ao Líder. No centro exato (meio tile para cada lado, `CENTER_HALF`), vai ao lateral que ainda está de pé. Vale também no lado do adversário (por exemplo, invocado no bolsão depois de derrubar um lateral): perto do Líder, mas na metade do lateral que ainda está de pé, ele vai a esse lateral. O ginásio escolhido fica guardado: no caminho até o Líder ele passa pelo centro sem trocar pelo outro lateral, e depois de enfrentar um Pokémon volta ao mesmo ginásio. Só troca se esse ginásio cair ou se ele for parar bem dentro da outra metade (mais de 1,5 tile do centro, `LANE_SWITCH`), por exemplo perseguindo alguém. Terrestres passam pela ponte mais conveniente, e bandos atravessam lado a lado.
3. **Contorna ginásios** que estejam no caminho (os próprios e os inimigos que não são o alvo).
4. **Trava no alvo:** depois de começar a atacar, só troca de alvo se o atual morrer ou sair do alcance.
5. Unidades se empurram (as mais pesadas empurram mais) e levam **1 s para entrar em campo**. Enquanto surgem, são **invulneráveis**: ninguém mira nelas e nenhum dano as atinge (nem golpes, dano em área ou projéteis já lançados). Inimigos que não podem atacar um ao outro (ex.: dois tanques de ginásio) passam sem se bloquear.

## 11. Bot (modo solo)

Três dificuldades: **Fácil**, **Normal** e **Difícil**. Elas mudam o tempo de reação, a precisão e a recarga de energia do bot (85% / 100% / 120% da do jogador).

- **Deck:** a cada partida o bot recebe um **deck aleatório** (mesmas regras do botão "Aleatório"). Isso também ajuda a testar todas as cartas.
- **Defesa:** quando um Pokémon seu entra no lado dele, o bot escolhe a carta com melhor vantagem de tipo que consiga atacar aquele alvo. Se houver grupos de inimigos, usa golpes em área.
- **Ataque:** com energia acumulada, manda um tanque na pista do ginásio mais fraco e depois coloca suporte atrás. A energia para atacar é sorteada a cada ataque (de 3 a menos que o máximo do nível até o máximo), para não ficar previsível.
- **Abertura:** o bot não espera o jogador. Em parte das partidas (40% no fácil, 55% no normal, 65% no difícil) ele abre sozinho, num momento sorteado. Joga uma carta lá atrás, que vira o começo de um ataque, ou às vezes direto na ponte. Nas outras partidas ele espera, mas ataca sozinho quando junta a energia sorteada.
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

**Tela inicial (com conta, v0.4.2):** inspirada num mockup do autor, adaptada ao que o jogo tem.
- **Barra do topo:** treinador (retrato do inicial), nível e XP, troféus, Pokédólares e sair.
- **Navegação:** Início, Pokédex, Arenas, Amigos e Treino — menu lateral no PC, barra fixa embaixo no celular.
- **Centro:** a arena atual com o mapa como prévia, líder, tipos e o Pokémon símbolo do líder; setas para espiar as outras arenas (bloqueadas mostram os troféus necessários); botão **BATALHAR** como ação principal.
- **Jornada em Kanto** (PC), **Premier Balls**, **deck ativo** com níveis e os modos **Treino** e **Amigos**.
- O fundo é o mapa da arena atual, desfocado. Pokédex, Arenas, Amigos e Treino são **abas**: trocam o conteúdo dentro do início, com a barra e o menu sempre visíveis (volta-se pelo menu). Só a recompensa abre por cima.
- **Ranking global** (clique nos troféus): os 100 treinadores com mais troféus (desempate pelo recorde), com a sua posição mesmo fora do top 100. Não mostra e-mails.
- **Minha conta** (clique no nome): perfil, trocar nome de treinador, trocar senha (pede a atual e desconecta os outros aparelhos) e sair. Ranking e Minha conta abrem como menus suspensos com ✕, por cima da tela em que você está (início ou qualquer aba), e ao fechar você continua nela.
- **Nome de treinador único**, sem diferenciar maiúsculas (índice único no banco). Contas antigas com nome repetido: a mais antiga fica com o nome, as outras ganham `_<número>`.
- **Abrir ball:** animação de ~2,5 s (a ball cai, balança 3 vezes, o botão brilha, a tampa abre num clarão da cor do tipo) antes das cartas; tocar pula.
- Fonte *Pixelify Sans* (Google Fonts) nos títulos e botões. Ficou de fora do mockup o que o jogo ainda não tem (gemas, loja, ranking, mensagens).

**Na partida:**
- **Sair da partida:** botão 🏳️ no canto da arena, com confirmação. Valendo troféus conta como **derrota** (o servidor aceita derrota mesmo em partida curta, então sair cedo não escapa); online, o amigo vence; no treino só encerra.

- **Invocar:** arraste a carta até a arena, ou toque na carta e depois no local. Teclas **1–4** selecionam cartas no PC.
- Com uma carta selecionada, a área proibida fica **vermelha**; a prévia mostra o Pokémon ou o raio do golpe.
- **HUD:** coroas (inimigo / você) e cronômetro no topo (vermelho e pulsando nos últimos 10 s); mão de 4 cartas + "Próxima" embaixo; barra de energia com 10 segmentos.
- **Cores dos times:** azul = você, vermelho = oponente (anel embaixo do Pokémon e barra de vida). Seus Pokémon aparecem de costas, os do oponente de frente.

## 14. Arte e som

- **Sprites:** [SpriteCollab](https://github.com/PMDCollab/SpriteCollab) (estilo *Pokémon Mystery Dungeon*), licença CC BY-NC 4.0, créditos em `CREDITS.md`. Animações de parado, andar e atacar (corpo a corpo ou à distância), em **8 direções**: seus Pokémon andam de costas para você, os do oponente de frente. Também usa as animações de levar golpe, golpe próprio, surgir, desmaiar e comemorar (ver 14.1).
- **Arte das cartas:** retratos do SpriteCollab.
- **Reserva:** enquanto a folha animada carrega, o jogo usa o sprite estático da PokéAPI; sem nenhum dos dois, um círculo da cor do tipo com a inicial.
- **Mapas das arenas** (arte do autor): um para cada uma das 10 arenas — Rota 1, os 8 ginásios de Kanto e a Liga Pokémon. Na partida que vale troféus aparece o mapa da sua arena; no Treino o mapa é sorteado. As miniaturas aparecem no início e no caminho dos troféus.
- **Ginásios** (arte do autor): lateral e Líder, em azul (você) e vermelho (oponente). Enquanto a imagem carrega, o jogo desenha uma Pokébola na cor do time.
- **Voadores:** no ar usam a animação `Hover` do SpriteCollab (Spearow, Fearow, Golbat, Aerodactyl, Moltres...). A linha do Pidgey usa a `Shoot`, que é um bater de asas no lugar (`FLY_FROM` em `tools/build-sprites.mjs`). Os outros usam a animação parada (a do Butterfree e a do Venomoth já batem as asas), em vez da de andar, para não parecer que estão "andando" no ar. `FlapAround` e `Float` não servem: na primeira o Pokémon dá uma volta inteira no ar, e na segunda ele boia deitado na água.
- **Ícones em pixel art (no lugar dos emojis):** 46 ícones de 16 × 16 (troféu, Fichas, Pokédólares, cadeado, espadas, coroa, Pokédex, barra de navegação, botões da partida, atributos...), gerados por `tools/build-icons.py` em `assets/icones/`, no mesmo estilo dos sprites: contorno escuro, brilho em cima e sem suavizar. Os textos continuam escritos com emojis, e `js/icons.js` troca cada emoji pelo ícone sozinho, em qualquer lugar da página, inclusive no que aparece depois, como banners e listas. Dentro de opções de select e campos de texto o emoji fica, porque ali não dá para pôr imagem. Na arena, o `render.js` desenha os ícones (`_icon`). Os símbolos ✕, ✓ e ✔ continuam como texto.
- **Ícone do site:** uma Poké Ball com uma coroa dourada em cima, em pixel art de 32 × 32, também gerada por `tools/build-icons.py`. Os arquivos são `favicon.ico` (16, 32 e 48 px) e `favicon-32.png` para a aba do navegador, `apple-touch-icon.png` para o atalho no iPhone, e `icon-192.png` e `icon-512.png`, usados pelo `site.webmanifest` quando o jogo é adicionado à tela inicial no Android.
- **Tela inteira, sem borda:** o campo ocupa toda a área da batalha. A escala horizontal e a vertical são independentes (o campo estica até 30% para encaixar, por exemplo num celular com as barras do navegador; os sprites mantêm a forma). No celular, a partida ocupa a largura toda. No PC (tela de 700 px ou mais), a coluna do jogo fica com proporção de celular. Se ainda sobrar espaço, aparece a decoração do mapa completo (`<mapa>-full.webp`, posição em `js/arena-art.js`) e, depois dela, o mapa desfocado.
- **Conversão:** `python tools/build-arenas.py` recorta os originais (`assets/originais/`, fora do git) para a grade 18×32, alinhando pontes e rio às regras do jogo, e gera WebP (~130 KB por mapa) + miniaturas; também separa os 4 ginásios da folha. `--debug pasta` salva os mapas com as linhas do jogo por cima para conferir.
- **Som (futuro):** efeitos de ataque, grito do Pokémon ao entrar em campo e trilha de batalha 8-bit.

### 14.1 Backlog visual (para a v0.5)

Decidido em 19/10/2026: primeiro funcionalidade (v0.3 e v0.4), depois um passe de visual cobrindo **todo** o elenco de uma vez. Assim nenhum efeito precisa ser refeito quando entrarem Pokémon novos.

**Como está hoje (v0.2)**
- Ataques à distância: uma bolinha da cor do tipo voa até o alvo (igual para todos).
- Ataques corpo a corpo (Squirtle, Onix, Zubat): sem efeito; o atacante dá um pulinho e o alvo pisca branco.
- Golpes: Choque do Trovão (raio em zigue-zague simples + clarão amarelo) e Explosão de Fogo (bola caindo + círculo laranja).
- ~~Sprites estáticos~~ → resolvido na v0.3 com o SpriteCollab (parado, andar, atacar, 8 direções).

**A fazer**
- [x] **Efeito de golpe por tipo** (v0.7, `render.js`): cada tipo tem um projétil próprio (chama, gota, raio, folha, pedra, cristal, anel psíquico, lâmina de ar, esfera), com rastro; corpo a corpo mostra três garras na direção do golpe. A lista abaixo era a ideia original, por Pokémon:
  - Pikachu: raio em zigue-zague até o alvo
  - Charmander/Charmeleon: rajada de chamas com partículas
  - Squirtle/Wartortle: jato d'água com bolhas
  - Bulbasaur/Ivysaur: chicote de vinha se esticando até o alvo
  - Onix: pancada com poeira e leve tremida de tela
  - Zubat/Golbat: mordida/asa roxa
  - Pokémon novos da v0.3: definir o efeito junto com a carta
- [x] **Efeitos de impacto** (v0.7): partículas do tipo no acerto, tremida de tela em explosões e ginásios caindo, clarão no Choque do Trovão, Poké Ball abrindo ao invocar, ginásio desabando com poeira e pedaços
- [x] **Sprites animados**: SpriteCollab, feito na v0.3
- [x] **Dano no quadro do golpe** (v0.7, `hitDelay` em `js/game.js`): o dano sai no quadro em que o golpe acerta (`hit` em `js/sprites.js`), em média 0,13 s depois do início da animação, no máximo 0,35 s. Nesse meio-tempo o Pokémon fica parado. Se for atordoado, perde o golpe. Se o alvo sumir, procura outro logo.
- [x] **Desmaio** (v0.7): o Pokémon derrotado fica cinza, achata e some (voadores caem). Feito no desenho, sem depender da animação `Faint`, que nem todo Pokémon tem
- [x] **Mais animações do SpriteCollab** (v0.9.2, `tools/build-sprites.mjs`, `_unitFrame` em `js/render.js`):
  - **Golpe próprio:** a cada 3 ataques, o Pokémon usa uma animação só dele, se tiver: corpo a corpo (`strike`: Kick, Punch, Slam, MultiScratch...) ou à distância (`special`: Shock, Emit, SpAttack...). 49 dos 151 têm. As que giram o corpo ficam de fora (`Strike`, o giro de cauda do Kangaskhan e do Charizard, `Twirl`, `Kick`, `Punch`, `Stomp` e alguns casos medidos em `SPINNING`): no meio da partida parecia que o Pokémon trocava de alvo sem atacar. O dano sai no quadro de acerto dessa animação.
  - **Levou golpe:** animação `Hurt` (todos têm), no máximo uma vez por segundo para não travar o andar.
  - **Surgindo em campo:** animação `Charge` (todos têm); os lendários fazem `Pose`.
  - **Comemorar:** `Pose` logo depois de evoluir e, no fim da partida, em loop para quem venceu. Sem `Pose` (só 30 têm), usa `Hop`.
  - **Desmaio:** com a animação `Faint` (28 têm), ela toca inteira e o Pokémon some aos poucos; sem ela, continua o desmaio desenhado.
  - As folhas de um Pokémon começam a baixar quando ele aparece. Se uma ainda não chegou, ele segue com a animação de andar ou parado.
- [x] **Tiro dos ginásios** (v0.9.2, `_drawSwift`): em vez de bala de canhão, os ginásios atiram **Meteoro** (Swift), uma estrela dourada girando com rastro de brilhos. O Líder solta uma estrela maior, com duas estrelinhas em órbita. A cada tiro, o ginásio dá um pequeno recuo e solta um clarão de estrelas.
- [x] **Ruínas** (v0.9.2, `_drawRuins`): o ginásio destruído deixa a base do desenho, quebrada e escurecida, com pedras em volta e fumaça subindo até o fim da partida.
- [x] **Poké Ball arremessada** (v0.9.2): ao invocar, a bola sai do seu Líder em arco, com sombra no chão, quica e abre. O Pokémon só aparece quando ela chega. O tempo para surgir continua o mesmo.
- [x] **Arena com vida** (v0.9.2, `_drawAmbient`): reflexos correndo no rio de água e bolhas estourando na lava e no veneno (`river` em `ARENAS`). Partículas do tema passam pela arena (`AMBIENT`, pelo tipo do ginásio): folhas na Rota 1, poeira em Pewter e Viridian, bolhas em Cerulean, faíscas em Vermilion, pétalas em Celadon, esporos em Fuchsia, brilhos em Saffron, brasas em Cinnabar e neve na Liga.
- [x] **Interface da partida** (v0.9.2): a carta treme e pisca em vermelho ao tentar usar sem energia, e dá um pulinho quando passa a caber na energia. A barra de energia brilha quando está cheia e tem um brilho correndo na energia dupla. Na vitória, as coroas entram uma de cada vez, o título pulsa e cai confete.
- [x] **Golpes à distância redesenhados** (v0.9.2, `_drawProjectile` em `js/render.js`): 60% maiores e com rastro que sai do atacante (o golpe leva `id` e o ponto de saída `sx`/`sy`, também no snapshot):
  - Elétrico: raio em zigue-zague inteiro, do atacante até a ponta, com galhos e clarão
  - Fogo/Dragão: rajada de chamas que esfriam para trás, com fagulhas
  - Água: jato contínuo com brilho e bolhas · Planta: três folhas girando em volta da trajetória
  - Gelo: cristal com rastro de flocos · Pedra/Terra: rocha girando com poeira e pedrinhas
  - Psíquico/Fada: ondas em anel · Voador: lâmina de ar com vento · Veneno: gosma pingando
  - Fantasma/Sombrio: bola sombria com fiapos · Inseto/Aço: ferrão com linhas de velocidade · Normal/Lutador: esfera de energia
- [x] **Animação de evolução** (v0.7): silhueta branca piscando, brilhos subindo, anel e o grito da nova forma
- [x] **Som** (v0.7, `js/audio.js`, tudo pela Web Audio API):
  - Efeitos sintetizados na hora, um timbre por tipo de golpe, mais explosões, desabamento, Poké Ball e evolução. Há um limite de sons por instante para não virar barulheira.
  - Gritos originais ao entrar em campo, carregados do repositório público da PokéAPI (`PokeAPI/cries`), sem guardar no projeto. Se o navegador não tocar .ogg, toca um "piu" sintetizado.
  - Música chiptune original (pulso, triângulo e ruído), que acelera na energia dupla e de novo na morte súbita, e vinheta de vitória, derrota ou empate.
  - Botão 🔊/🔇 na partida e volumes de música e efeitos em "Minha conta", guardados no aparelho.
- [x] **Mapas das arenas e ginásios** (arte do autor): as 10 arenas e os ginásios lateral/Líder, no jogo desde a v0.4.1. Na v0.9.2, o canhão do lateral azul passou a mirar o adversário: `tools/build-arenas.py` troca a boca do canhão pela traseira (o ginásio em si continua de frente para a câmera, nos dois lados, como no Clash Royale).
- [x] **Multiplayer** (v0.7): todo efeito tem um número crescente (`id`) e vai no snapshot; o convidado desenha e toca só os novos

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
| **v0.4** | Contas, decks iniciais, troféus, arenas (ginásios), Premier Balls, níveis (ver [17](#17-contas-e-progressão-v04)) | ✅ Feito |
| **v0.4.1** | Mapas das 10 arenas e design dos ginásios (arte do autor) no jogo | ✅ Feito |
| **v0.4.2** | Novo visual da tela inicial e dos menus | ✅ Feito |
| **v0.5** | Ranking global, Minha conta, nome único, PokéMart e Fichas do Game Corner | ✅ Feito |
| **v0.6** | Cosméticos (avatar, títulos, skins de ginásio, emotes) e Zona Safári | ✅ Feito |
| **v0.7** | Efeitos de golpe por tipo, som (efeitos, gritos, música), campo em tela cheia, invocação no ponto permitido mais próximo, vários decks com salvamento automático, arrastar cartas, várias balls abrindo juntas | ✅ Feito |
| **v0.8** | Cartas de construção: Centro Pokémon, Torre Pokémon, Snorlax Dormindo, Caverna Zubat, Laboratório do Mewtwo (ver [18](#18-cartas-de-construção-v08)) | ✅ Feito |
| **v0.9** | Golpes Surf, Terremoto e Nevasca; lendários raros com entrada especial; histórico de partidas; música do menu; correção de Pokémon parado (ver [19](#19-v09)) | ✅ Feito |
| **v0.9.1** | Amigos: adicionar pelo nome, ver quem está online e desafiar direto para um X1, sem código (ver [20](#20-amigos-e-convite-para-x1-v091)) | ✅ Feito |
| v0.9.2 | Mais animações do SpriteCollab (golpe próprio, levar golpe, surgir, desmaiar e comemorar), golpes à distância redesenhados por tipo, Meteoro dos ginásios, ruínas, Poké Ball arremessada, arena com vida, animações da interface e Pokémon de água nadando no rio (ver [5](#5-arena) e [14.1](#141-backlog-visual-para-a-v05)) | ✅ Feito |
| v0.10 | Rotas entre os ginásios e desafio de ginásio em melhor de 3 contra o Líder (ver [22](#22-rotas-e-desafios-de-ginásio-planejado)) | 🎨 Esperando mapas |

## 17. Contas e progressão (v0.4)

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

> Planejado: rotas entre os ginásios e o ginásio como desafio em melhor de 3 contra o Líder (ver [22](#22-rotas-e-desafios-de-ginásio-planejado)).

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

- **Troféus por partida:** vitória online +30 / derrota −20; vitória contra o bot +25 / derrota −10.
- **Sequência de vitórias:** cada vitória seguida vale +1 troféu a mais que a anterior (bot: 25, 26, 27...). Derrota ou empate zera a sequência.
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

- **4 espaços.** Uma vitória dá uma ball se houver espaço livre. Cada ball tem seu cronômetro, e **várias podem abrir ao mesmo tempo** (desde a v0.7; antes era uma por vez).
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

- Cartas vão até o **nível 10**. Comuns começam no nível 1, raras no 3, épicas no 6 e lendárias no 9 (como no Clash Royale). Os golpes são raros.
- **Bônus de nível:** uma carta recém-obtida joga com os stats base; cada nível soma uma parte igual até **+50% de vida e dano no nível 10**. Assim, com tudo no máximo, qualquer raridade tem o mesmo bônus e o balanceamento das cartas continua valendo. *(Mudou da proposta, que era +8% fixo por nível: com isso as comuns, que têm mais níveis, ficariam mais fortes que as épicas.)*
- Para subir: cópias + Pokédólares. A 1ª cópia libera a carta; as seguintes contam para o próximo nível.

| Para o nível → | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|
| Cópias (comum) | 2 | 4 | 10 | 20 | 50 | 100 | 200 | 400 | 800 |
| Cópias (rara) | — | — | 2 | 4 | 10 | 20 | 50 | 100 | 200 |
| Cópias (épica) | — | — | — | — | — | 2 | 4 | 10 | 20 |
| Cópias (lendária) | — | — | — | — | — | — | — | — | 2 |
| Pokédólares | 5 | 20 | 50 | 150 | 400 | 1000 | 2000 | 4000 | 8000 |

- **Nível de treinador:** sobe com XP (melhorar cartas: 4 a 400 XP conforme o nível; vitória: 5 XP; derrota: 1 XP). Cada nível dá +4% de vida e dano aos **seus ginásios** na partida. Máximo 13.

| Nível de treinador | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| XP total | 0 | 20 | 50 | 100 | 200 | 400 | 800 | 1.500 | 2.500 | 4.000 | 6.000 | 9.000 | 13.000 |

- **Bot por arena:** o nível das cartas do bot acompanha a arena (nível base na Rota 1 até nível 10 na Liga), e a dificuldade vai de Fácil (Rota 1) a Normal e Difícil (a partir de Saffron).

### 17.8 Online e justiça

- Na tela inicial, a sala tem a opção **"Vale troféus"**. Ela só vale se **os dois estiverem logados**; aí cada um registra a própria partida no servidor e as cartas usam os **níveis reais**.
- Sem a opção (ou com alguém sem conta), é **amistoso**: não vale troféus nem balls, e todas as cartas jogam com os stats base.
- Se o amigo sair no meio da partida, quem ficou conta como vencedor (desde que a partida tenha durado o mínimo).

### 17.9 Técnico

- **Servidor:** uma função da Vercel (`api/[action].js`, ações como `/api/login`, `/api/ball-open`) + banco **Neon (Postgres)**, criado pela integração da Vercel. O jogo continua estático; só conta, coleção e recompensas passam pelo servidor. As tabelas são criadas sozinhas na primeira chamada.
- **Mesmas regras no jogo e no servidor:** `js/progression.js` (arenas, raridade, balls, níveis) é carregado pelo navegador e pelo servidor (`api/_lib/rules.js`).
- **Credenciais do banco** ficam só na Vercel (marcadas como *Sensitive*). Para desenvolver, `node tools/dev-server.js` sobe o jogo + API com um Postgres local (PGlite, em `.devdb/`), e `node tools/test-api.js` testa a API inteira num banco em memória (18 testes).
- **Login:** e-mail + senha. A senha é guardada com hash (`scrypt`), e a sessão vai num cookie `httpOnly`. **Recuperar senha** fica para depois (precisa de um serviço de envio de e-mail).
- **O servidor é a fonte da verdade** para coleção, troféus, balls e itens. O conteúdo das balls é sorteado no servidor.
- **Resultado da partida:** o jogo envia o resultado ao fim da partida; o servidor confere se é plausível (duração mínima, limite de partidas por hora, uma recompensa por partida). Num jogo entre amigos isso basta; trapaça "séria" exigiria simular a partida no servidor.
- **Tabelas:** `users` (inclui troféus, arena, XP, Pokédólares, deck e a Poké Ball grátis), `sessions`, `collection` (carta, nível, cópias), `user_items`, `balls` (tipo, arena, abre_em), `matches` (histórico).
- **Segurança:** ações só aceitam POST com JSON (bloqueia formulários de outros sites), limite de 40 partidas por hora, uma recompensa por partida, ball só abre quando o cronômetro termina (checado no servidor).
- **Sem servidor** (ex.: abrir o `index.html` direto), o jogo detecta e oferece só o Treino.

### 17.11 PokéMart (loja) e Fichas do Game Corner (v0.5)

**Regras para não quebrar o jogo**
1. Só moedas ganhas jogando: **Pokédólares** (balls e Poké Ball grátis) e **Fichas do Game Corner 🪙** (só por conquistas). Nada de dinheiro de verdade.
2. Ofertas com **limite** e **preço que sobe** a cada compra no dia.
3. Só cartas das **arenas já liberadas**; **lendários nunca** são vendidos.
4. O **servidor** gera as ofertas (uma vez por dia por jogador, guardadas) e valida preço, saldo e limite numa instrução só.

**Ao comprar ou resgatar:** aparece o mesmo pop-up das balls, por cima da Loja, com "Comprado!" (ou "Resgatado!", no presente grátis) e o que você ganhou, que pode ser a carta (com "Novo!" se for nova), o item ou o visual, com um brilho girando atrás e o botão Coletar. Balls compradas abrem com a animação de sempre. Ao coletar, você continua na Loja.

**Fichas 🪙** (moeda rara): +100 ao chegar numa arena nova, +20 por nível de treinador novo, +10 na primeira vitória do dia (partida que vale troféus). Não vêm em balls.

**Ofertas** — trocam à meia-noite (horário de Brasília); as semanais, na segunda-feira.

| Oferta | Preço | Limite |
|---|---|---|
| Presente do dia: 5 cópias de uma carta comum sua | Grátis | 1 por dia |
| 3 cartas comuns | 💰 10 × n (10, 20, 30…) | 10 cópias cada |
| 1 carta rara | 💰 100 × n | 5 cópias |
| 1 carta rara ou, com 25% de chance, épica | rara 💰 100 × n · épica 💰 1.000 × n | 5 / 2 cópias |
| Great Ball (abre na hora, com a animação) | 💰 250 | 1 por dia |
| Pedra evolutiva do dia | 💰 300 | 1 por dia |
| Ultra Ball | 🪙 60 | 1 por semana |
| Doce Raro | 🪙 80 | 1 por semana |

As cartas oferecidas são, de preferência, as que você já tem (servem para melhorar); se faltar, entram outras das suas arenas.

Cosméticos e Zona Safári: ver 17.12.

### 17.12 Cosméticos e Zona Safári (v0.6)

**Cosméticos** — não mudam nenhum atributo. Equipados em *Minha conta* (toque no nome), comprados na Loja com Fichas 🪙.

| Tipo | Como se consegue | Onde aparece |
|---|---|---|
| **Avatar** | Qualquer Pokémon da sua coleção (grátis) | Barra do topo, ranking, Minha conta |
| **Título** | "Treinador Novato" (grátis); um por arena alcançada (Quebra-Rochas, Surfista de Cerulean… Mestre Pokémon); classes de treinador da 1ª geração com Fichas (Caçador de Insetos, Montanhista, Nadador, Pescador 🪙30 · Cientista, Médium, Faixa-Preta 🪙50 · Recruta da Equipe Rocket 🪙100 · Assistente do Prof. Carvalho 🪙150) | Ranking |
| **Skin de ginásio** | Clássico (grátis); Dourado, Cristal e Sombrio (🪙120 cada); Campeão (ao chegar na Liga). Escolhida na aba **Pokédex → Ginásios**, com prévia grande sobre o mapa da sua arena e as bloqueadas mostrando como conseguir (compra e equipa ali mesmo) | Seus ginásios na partida, para os dois jogadores. Brilho e cor; as cores de time continuam azul/vermelho |
| **Emotes** | Pacote do Pikachu (grátis); Charmander, Squirtle, Bulbasaur (🪙40) · Psyduck, Meowth, Jigglypuff, Eevee (🪙60) · Snorlax (🪙80) · Mewtwo (🪙150) | Botão 💬 na partida: 4 reações (feliz, bravo, chorando, surpreso) com os retratos do SpriteCollab, num balão perto do seu Ginásio Líder. Escolher outro emote substitui o balão na hora. Funciona online e o bot reage quando derruba ou perde ginásio |

**Zona Safári** — na Loja. Entrada 💰100, **1 vez por dia**. 6 Safari Balls e até 3 Pokémon selvagens das suas arenas (sem lendários; comum 65%, rara 28%, épica 7%).

| Ação | Efeito |
|---|---|
| Safari Ball | Tenta capturar: comum 45%, rara 30%, épica 18% |
| Isca 🍓 | Fica comendo por 1–3 turnos: captura ×0,6, fuga ×0,35 |
| Pedra 🪨 | Fica bravo por 1–3 turnos: captura ×1,6, fuga ×2 |
| Fugir | Passa para o próximo Pokémon |

Depois de cada ação o Pokémon pode fugir (comum 10%, rara 18%, épica 28%, com os modificadores). Captura dá cópias da carta: comum 3, rara 2, épica 1. Tudo sorteado e guardado no servidor (uma jogada não conta duas vezes).

### 17.10 Decisões em aberto

- Tempos das balls estão bons para um grupo de amigos, ou melhor encurtar (ex.: 5 min / 20 min / 1 h / 3 h)?
- Os números de troféus por arena (300 a 4000) estão bons, ou mais rápido no começo?
- Nível de treinador deve fortalecer os ginásios, como no Clash Royale, ou ser só visual?

## 18. Cartas de construção (v0.8)

Aprovado em 19/10/2026. Os números abaixo já passaram pela simulação de partidas.

**Regras gerais (como no Clash Royale)**
- **Onde:** só no próprio lado do rio (ou no bolsão), sem andar.
- **Lugares proibidos:** não podem ficar coladas na saída de uma ponte, num ginásio ou em outra construção. Isso evita trancar o caminho.
- **Vida:** a construção perde vida sozinha com o tempo (barra com ⏳) e desaba quando a duração acaba.
- **Alvo:** quem "só ataca ginásios" (Graveler, Onix...) também ataca construções. Assim, elas servem para **puxar** o inimigo para longe dos ginásios.
- **Atiradoras:** a Torre e o Laboratório miram o Pokémon inimigo mais próximo ao alcance, e não os ginásios.
- **Tipo:** cada construção tem um tipo, e a tabela de tipos vale para ela.
- **Visual:** pixel art no estilo dos sprites, gerada por `tools/build-construcoes.py` em `assets/construcoes/*.png` e desenhada sem suavizar, na escala dos Pokémon. Cada construção tem um Pokémon animado do SpriteCollab: Chansey na porta do Centro, Gastly rondando a Torre, Zubat voando na boca da Caverna e Mewtwo dentro da cápsula do Laboratório. O Snorlax é o próprio sprite, dormindo com "z".
- **Código:** `BUILDINGS` em `js/data.js`; `_spawnBuilding` e `_updateBuilding` em `js/game.js`; `_drawBuilding` em `js/render.js`.

**Cartas**

| Carta | Custo | Vida | Dura | O que faz | Tipo | Raridade | Arena |
|---|---|---|---|---|---|---|---|
| 🏥 Centro Pokémon | 4 | 1000 | 40 s | Cura 70 de vida por segundo dos aliados num raio de 3 | Normal | Rara | Rota 1 |
| 👻 Torre Pokémon | 4 | 1000 | 35 s | Bolas Sombrias: dano 110 a cada 1,1 s, alcance 5,5, acerta voadores | Fantasma | Rara | Pewter |
| 😴 Snorlax Dormindo | 3 | 2800 | 30 s | Não ataca: bloqueia o caminho e atrai os inimigos | Normal | Rara | Pewter |
| 🦇 Caverna Zubat | 5 | 800 | 40 s | Solta um Zubat a cada 7 s | Veneno | Épica | Celadon |
| 🧬 Laboratório do Mewtwo | 6 | 1300 | 40 s | Canhão psíquico em área: dano 160 a cada 2 s, alcance 6, só alvos no chão | Psíquico | Lendária | Liga |

**Bot:** usa a Torre, o Laboratório e o Snorlax na defesa, no meio do próprio campo. O Centro Pokémon vai atrás de um ataque, e a Caverna fica no fundo da pista do ataque.

**Filtro:** a Pokédex tem o filtro "Construções".

**Presente para quem já joga:** cada conta recebe **uma construção aleatória**, uma vez só. Pode vir qualquer uma menos a lendária, mesmo que ainda não tenha chegado na arena dela. O presente abre sozinho, com a animação da ball, na primeira vez que o jogador entra depois da atualização. Contas novas recebem depois de escolher o inicial. Os presentes de versão ficam em `GIFTS` (`js/progression.js`), e os já recebidos na coluna `users.gifts`, o que permite dar presentes em versões futuras.

**Novidades da atualização:** ao entrar logado depois de uma atualização, um pop-up "📰 Novidades" lista o que mudou para o jogador. Abre uma vez por aparelho (guardado no navegador); se houver presente de versão, o presente vem primeiro e as novidades na próxima entrada. O texto fica em `NEWS` (`js/hub.js`); trocar o `id` mostra o pop-up de novo para todos.

## 19. v0.9

**Golpes novos** (liberados nas arenas, como os Pokémon)

| Golpe | Custo | Dano | Raio | Efeito | Arena |
|---|---|---|---|---|---|
| 🌊 Surf | 3 | 220 | 2,8 | Empurra 1,8 tile para trás quem está no chão | Cerulean |
| ❄️ Nevasca | 4 | 190 | 3,0 | Deixa 45% mais lento por 4 s (o Pokémon fica azulado) | Fuchsia |
| 🌍 Terremoto | 4 | 340 | 3,3 | Não acerta voadores; dano dobrado em construções; treme a tela | Viridian |

Nos ginásios, os golpes causam 30% a 45% do dano. O bot sabe que o Terremoto não pega voadores.

**Lendários** (Articuno, Zapdos, Moltres, Mew, Mewtwo)
- **Antes:** só saíam garantidos numa Master Ball depois de chegar na Liga, o que na prática era quase impossível.
- **Agora:** aparecem a partir de Saffron (Articuno e Zapdos), Cinnabar (Moltres), Viridian (Mew) e Liga (Mewtwo), em `LEGENDARY_ARENA`.
- **Raridade:** saem nas Ultra Balls (peso 0,6) e nas Master Balls (garantido), e sempre só 1 cópia. Na simulação, cerca de **1,3% das balls de vitória** trazem um lendário a partir de Saffron.
- **Na batalha:** coluna de luz dourada, fanfarra, aviso "✨ lendário entrou na batalha!" e aura dourada embaixo dele.

**Histórico de partidas:** em "Minha conta", "📜 Últimas partidas" mostra as 20 últimas partidas valendo troféus, com resultado, coroas, adversário (o nível do bot ou o nome do amigo), troféus ganhos ou perdidos, arena, quanto tempo faz e o deck usado. O servidor guarda isso na tabela `matches`.

**Música do menu:** tema calmo em Dó maior, mais lento e sem bateria, que toca fora da partida. Começa no primeiro toque, quando o navegador libera o som. Na partida, volta o tema de batalha.

**Correção:** se um Pokémon persegue um alvo por 2,5 s sem chegar mais perto (por exemplo, atrás de um ginásio colado na parede), ele desiste daquele alvo por 5 s e procura outro. Em 1.200 partidas simuladas, nenhum Pokémon ficou parado.

## 20. Amigos e convite para X1 (v0.9.1)

- **Adicionar:** na aba Amigos, pelo nome de treinador (sem diferenciar maiúsculas). A pessoa recebe um pedido, com um número vermelho no botão Amigos, e aceita ou recusa. Se os dois pedirem um ao outro, vira amizade na hora. O limite é de 100 amigos e pedidos.
- **Online:** bolinha verde para quem abriu o jogo nos últimos 45 s. Fora da partida, o jogo avisa o servidor a cada 10 s (`social-poll`), e com isso também chegam os convites e pedidos novos.
- **Desafiar (⚔️ X1):** cria a sala normalmente e, assim que ela existe, manda o convite com o código para o amigo. Ele vê o aviso "Fulano te desafiou para um X1!" com Aceitar ou Recusar. Ao aceitar, entra direto na sala, sem digitar código. Se recusar, quem desafiou vê "recusou o desafio".
- **Regras:** o convite vale por 90 s, só vai para amigos, só existe um pendente por vez (o novo substitui o anterior) e há no máximo 20 a cada 10 min. Cancelar a sala cancela o convite. A opção "Vale troféus" da aba vale para o desafio.
- **Desfazer amizade:** o ✕ pede um segundo toque ("Tirar?") para confirmar.
- **Servidor:** tabelas `friendships` (um pedido por linha, `pending`/`accepted`) e `invites`, mais a coluna `users.last_seen`.

## 21. Questões em aberto

- Os ginásios devem ter tipo (ex.: ginásio de água) para variar as partidas?
- ~~Raridade de cartas e níveis~~ → feito na v0.4 (17.4 e 17.7).
- ~~Ranking entre amigos~~ → feito na v0.5 (ranking global, ao tocar nos troféus).
- **Passo futuro — skin de ginásio "Tecnológico" (Silph Co.):** 6 desenhos em pixel art mecânica, vermelhos e azuis (recebidos em 21/10/2026, em `assets/originais/skin-tecnologico/`). Entram como skin cosmética comprada com Fichas, não como visual padrão: o traço futurista não combina com os mapas de natureza. Líder = `lider-vermelho` / `lider-azul` (os mais detalhados); laterais = `lateral-vermelho` / `lateral-azul` (há uma segunda opção de cada). Falta: vista de costas (ou o canhão separado da base) para os ginásios de baixo apontarem para cima, e versões com fundo transparente.

## 22. Rotas e desafios de ginásio (planejado)

Combinado em 21/10/2026. Ainda não implementado: espera os mapas que faltam (abaixo). Substitui a progressão da [17.3](#173-troféus-e-arenas-ginásios-de-kanto), em que cada ginásio é uma faixa de troféus.

**Ideia:** o jogador sobe troféus andando pelas **rotas** (umas 2 antes de cada ginásio). No fim delas chega ao **ginásio**, que é um desafio contra o Líder, específico do tipo dele, e precisa vencer para seguir viagem.

### 22.1 Regras do desafio

- **Rotas:** partidas normais valendo troféus, como hoje. Cada rota é uma faixa de troféus e libera um grupo de Pokémon nas Premier Balls.
- **Portão:** ao chegar no fim da última rota antes de um ginásio, os troféus **travam** naquele limite e o próximo passo é desafiar o Líder.
- **Desafio:** **melhor de 3** contra o Líder (bot) com um deck só do tipo dele, no mapa do ginásio.
- **Vitória:** dá a **insígnia**, destrava os troféus e abre as próximas rotas.
- **Derrota no desafio:** −15 troféus (metade de uma derrota normal). Como o jogador está no limite, perder 2 desafios (−30) o devolve para dentro da rota, e ele precisa ganhar partidas para voltar ao portão.

### 22.2 Rotas (ordem de Kanto)

✅ = mapa pronto (recebido em 21/10/2026) · 🎨 = falta gerar

| Antes de | 1ª rota | 2ª rota |
|---|---|---|
| Pewter (Brock) | Rota 1 ✅ (já no jogo) | Floresta de Viridian ✅ (floresta com rio) |
| Cerulean (Misty) | Mt. Moon ✅ (caverna com cristais) | Rota 4 ✅ (campo com capim alto) |
| Vermilion (Lt. Surge) | Ponte Pepita ✅ (campo com árvores e água dos lados) | Rota 6 ✅ (parque com laguinhos) |
| Celadon (Erika) | Túnel de Pedra ✅ (cânion) | Rota 8 🎨 |
| Fuchsia (Koga) | Ciclovia ✅ (pista de bicicleta) | Rota 15 🎨 |
| Saffron (Sabrina) | Zona Safári 🎨 | Rota 5 🎨 |
| Cinnabar (Blaine) | Ilhas Seafoam ✅ (praia) | Rota 20 🎨 (mar aberto) |
| Viridian (Giovanni) | Mansão Pokémon 🎨 | Rota 21 🎨 |
| Liga | Rota 22 🎨 | Estrada da Vitória 🎨 (caverna) |

Os mapas novos devem ter o mesmo tamanho dos mapas de ginásio (1086 × 1448), com o rio e as pontes na mesma altura, para usar o mesmo recorte de `tools/build-arenas.py`.

### 22.3 A decidir quando os mapas estiverem prontos

- **Pokémon de cada rota:** cada rota libera um grupo, de preferência os que aparecem nela no jogo original (ex.: insetos na Floresta de Viridian; Clefairy e Jigglypuff no Mt. Moon; Snorlax e Doduo na Ciclovia). Hoje a Rota 1 sozinha libera 42 cartas, então dá para espalhar.
- **Faixas de troféus** de cada rota e quanto a insígnia vale (Fichas, ball, cosmético).
- **Liga:** melhor de 3 contra cada membro da Elite dos Quatro, ou um único desafio final.
- **Contas existentes:** os números das arenas mudam (entram rotas entre os ginásios), então as colunas `users.arena`, `balls.arena` e `matches.arena` precisam ser convertidas uma vez, e quem já passou de um ginásio ganha a insígnia dele.
