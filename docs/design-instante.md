# O Instante — a segunda dimensão

## Intenção

Do outro lado do buraco negro está **o momento em que o mundo foi arrancado, parado**. Os pedaços da jornada ficam suspensos onde o puxão os deixou:
- ilhas partidas e árvores arrancadas pela raiz;
- uma ponte explodida em tábuas;
- uma cachoeira pega no meio da queda;
- pedras caindo em direção ao buraco;
- raios que nunca terminaram de cair;
- a chuva que nunca chegou ao chão;
- pequenos buracos negros por onde a corrente de pedras escoa.

Tudo é cinza. Só em volta do personagem o tempo ainda anda, e só ali há cor: uma **bolha de tempo**.

## As duas habilidades

**Rebobinar** (segurar interagir: R / B)
- O tempo dentro da bolha anda ao contrário, rápido: o que o puxão levou volta voando para o lugar.
- Um pedaço cujo lugar de origem fica perto de você conta como perto, então dá para chamar de volta o que foi lançado longe.
- Tique-taque de relógio ao contrário e a bolha azulada enquanto dura.

**Parar o tempo** (segurar atacar: J / X / clique esquerdo; liberado em **A Cachoeira Parada**)
- O tempo dentro da bolha para. **O que está parado é sólido.**
- A cachoeira vira vidro e chão; a corrente de pedras congela no lugar; a chuva fica suspensa.
- A bolha fica prateada, com um baque grave ao entrar e um toque suave ao soltar.

## As regras

- Cada pedaço solto tem o seu instante τ: 0 é onde ele estava, 1 é até onde o puxão o levou.
- Fora da bolha, nada se move.
- Dentro da bolha, o tempo anda devagar. O que você consertou volta a se desfazer, a chuva volta a cair, a corrente volta a correr. Por isso não dá para ficar parado em cima de uma ponte remendada.
- A pedra-balsa tem tempo próprio: só anda enquanto você está em cima dela, e continua a queda levando você junto. Rebobinar a traz de volta.
- Cair no vazio volta ao checkpoint.

## Sequência

| Ilha | Desafio |
| --- | --- |
| I · O Instante | a ponte explodida: rebobine as tábuas e atravesse antes que se soltem de novo |
| II · A Ilha Partida | pedras que caíram muito: traga-as de volta em escada e suba segurando o tempo |
| III · O Jardim Suspenso | deixe o tempo andar: uma pedra que cai leva você pelo vazio |
| IV · A Cachoeira Parada | **nova habilidade:** pare o tempo e atravesse a cachoeira, agora um caminho de vidro |
| V · A Corrente | três faixas de pedras correndo para dentro do buraco: pule, congele ou rebobine |
| VI · O Farol Parado | rebobine as pedras da torre: o cristal e a casca se fecham, a luz volta, a cor inunda o mundo e o tempo volta a andar |

**Fragmentos:** sete. Dois nas primeiras ilhas, um sobre a ponte, um acima da escada, um numa pedra desgarrada que precisa ser rebobinada, um no caminho da balsa e um no meio da cachoeira.

**Relógios parados (a história):** três relógios de bolso parados. Cada um conta um pedaço do que aconteceu quando a névoa se partiu. O segundo fica numa ilhota no fim de um braço da cachoeira; o terceiro, numa saliência a montante da última faixa da corrente — só se chega rebobinando a corrente e andando em cima da pedra que volta.

## Dicas e leitura da cena

- O objetivo no canto superior esquerdo muda por ilha, e a dica aparece ao chegar em cada checkpoint e volta a aparecer quando você está em cima de algo que se move (pedaço, água, pedra da corrente).
- O aviso embaixo do personagem mostra a ação certa para o lugar: **parar o tempo** perto da água e da corrente, **rebobinar** perto de algo passível de volta.
- As teclas mostradas nas dicas são as que o jogador configurou.

## A travessia (sem cortes)

A cena do buraco negro segue a câmera para dentro do horizonte, e `crossing.js` continua a partir do mesmo quadro:
1. **Horizonte (preto):** o mundo antigo é desmontado e o Instante é montado no lugar. Ninguém vê.
2. **Túnel de luz:** ainda colorido.
3. **Clarão:** o buraco cospe o personagem.
4. **Queda:** a câmera passa sobre o mundo parado, já cinza, com cor só em volta dele.
5. **Pouso e controle:** o controle é devolvido sem salto de imagem.

`/?instante` entra direto no Instante.

## Como funciona (código)

- `src/mode.js`: `world.instante` diz qual mundo está ativo. A travessia o liga na mesma página. O Instante tem save próprio: `nevoa-instante-save` (`useInstanteSave`).
- `src/procedural/instante.js`: o nível e a mecânica.
  - Monta o nível com os geradores do primeiro mundo, porque são os pedaços dele.
  - Os destroços usam `airborne()`, que inclina e suspende qualquer coisa construída e a deixa só como cenário.
  - As peças (`piece`) têm τ, posição de origem e posição final. As que são pisáveis usam colisores com `mover.delta`, então carregam o personagem.
  - A água (`waterPath`) é uma fita visual mais uma fila de colisores curtos que só são chão enquanto o tempo está parado (`ground`/`gone`).
  - A corrente (`lane`) tem relógio próprio (`instante.stream`), que anda perto de você, volta ao rebobinar e para quando você para o tempo.
  - O farol usa o `beacon` do primeiro mundo, com `game.restoration` ligado ao quanto a torre foi remontada.
- `src/render/post.js`: `uBubble` deixa o mundo cinza fora de um disco de tela em volta do personagem.
- `src/game/guide.js`: aceita `hint` e `near` do mundo, para as dicas próprias.
- `main.js`:
  - Segura o relógio do mundo (`U.time`) enquanto o Instante está parado.
  - Chama `updatePieces` antes do jogador; o atacar vira "parar o tempo" nesse mundo, e o HUD de combate some.
  - Mostra o aviso de ação embaixo do personagem.
  - `enterInstante()` troca de mundo durante a travessia.

## Painéis do farol (primeiro mundo)

As placas da casca em volta do cristal são pequenos buracos negros presos num aro de obsidiana: horizonte preto, anel de fótons e um disco em espiral violeta e ouro que gira mais rápido e mais quente conforme o farol é restaurado.

## Validação executada

No navegador, com os controles reais (teclas seguradas, pulos de verdade, R e J):
- A travessia completa, da cena ao controle, já no Instante cinza com a bolha colorida.
- A ponte rebobinada e atravessada; a escada trazida de volta e escalada; a viagem na pedra-balsa; a pedra desgarrada rebobinada para pegar o fragmento.
- A cachoeira: sem parar o tempo, você cai; segurando, atravessa. O braço lateral até a ilhota do segundo relógio.
- A corrente: travessia nas três faixas alinhando as pedras com o tempo parado, e o terceiro relógio rebobinando a última faixa.
- O farol montado, a luz de volta, a cor inundando e o cartão final.
- Os três relógios coletados, gravados no save e recolocados ao carregar.
