# Ilha-baleia — Baleia das Brumas

Desvio opcional da ilha VI, Travessia Lenta. Um píer marcado por lanterna permite embarcar numa baleia que nada num circuito entre a ilha principal e o Santuário do Horizonte. O mapa identifica o píer depois de visitar a ilha VI.

## Ritmo e exploração

- Cada percurso dura 36 segundos, com aceleração e desaceleração suaves. Há uma parada de 12 segundos em cada píer. O ciclo completo dura 96 segundos.
- O jardim nas costas tem árvores, pedras e três centelhas. A ilha de destino tem uma quarta centelha e decoração própria.
- As dicas mostram o tempo de chegada e avisam quando saltar. É possível voltar na mesma criatura; cair mantém o checkpoint da ilha principal.
- Corpo, cauda, nadadeiras, olhos e sopro têm animação. O convés plano de musgo tem colisão elíptica: seu movimento e sua rotação transportam o jogador.
- A baleia é um marco móvel do álbum. Embarcar concede a conquista Carona nas brumas.

## Integração

O circuito procura espaço livre fora das entradas e saídas da rota principal. Os novos fragmentos e a ilha secreta são acrescentados depois dos existentes, mantendo seus IDs. Saves da versão anterior da mesma jornada preservam checkpoint, centelhas, tempo e recorde.

## Validação

Testes usam a geração real do mundo e o controlador real do personagem: salto da ilha ao píer, embarque, desembarque, acesso ao santuário, retorno e transporte por um ciclo completo sem deriva. Há verificações de continuidade das poses e migração do save. Inspeção visual no navegador verifica a criatura e as dicas.

Playtest humano recomendado: verificar se o píer é descoberto naturalmente e se a espera de até 84 segundos pede um mecanismo de chamada; observar se explorar o jardim ajuda a preencher os 36 segundos de viagem.
