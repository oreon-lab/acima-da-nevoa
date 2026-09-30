# Acima da Névoa — revisão da jornada

## Intenção

Uma subida contemplativa com pequenos desafios de domínio. Cada ilha oferece uma descoberta; cada travessia desenvolve uma habilidade. O caminho principal deve ser compreensível sem abrir o mapa, enquanto fragmentos, fotografias e desvios convidam a explorar.

## Sequência implementada

| Saída | Travessia | Papel na experiência |
| --- | --- | --- |
| Ninho da Névoa | Pedras fixas | Aprender movimento, altura variável do salto e leitura da sombra |
| Ilha do Orvalho | Pedras oscilantes | Observar o ritmo e confiar no pouso |
| Degraus de Musgo | Pedras que desabam | Primeiro exemplo largo, pausa segura, depois sequência; a primeira pedra espera 1,2 s |
| Ruínas do Vento | Prática de planar | Habilidade liberada imediatamente; corrente larga, vão curto e pouso generoso |
| Espiral Antiga | Vento simples | Aprender a ganhar altura com a corrente |
| Travessia Lenta | Parede de musgo | Aprender a escalar antes do cume |
| Bosque Pálido | Três correntes | Combinar voo planado e sustentação |
| Pedra Suspensa | Trilhas de dia e noite | Escolher a trilha sólida; sua fase permanece durante a travessia |
| Jardim das Brumas | Ponte restaurada | Uma pausa antes da cidade e do último desafio |
| Coroa de Pedra | Últimos voos | Reunir saltos, correntes e planar, sem apresentar um comando novo |

As ilhas grandes continuam oferecendo caminhos, pontos de descanso e segredos. O alvo principal aparece no HUD, com a próxima ilha e o progresso até a próxima memória. As dicas usam os controles configurados e reaparecem perto do começo da travessia. É possível desativá-las em Jogabilidade.

## Luz e memórias

- **5 fragmentos:** primeira centelha; lanternas e farol ficam mais fortes.
- **12 fragmentos:** anéis do farol despertam e a névoa começa a ceder.
- **24 fragmentos:** terceira memória e horizonte mais aberto.
- **Chegada ao altar:** restauração completa, onda de luz e câmera panorâmica de oito segundos. Enter/Esc ou A/B/Start permitem continuar antes.

As memórias podem ser relidas em Pausa → Explorar → Memórias do farol e permanecem nas próximas jornadas. Fragmentos são opcionais para concluir: recompensam exploração sem bloquear o caminho principal. A última ilha continua acessível mesmo para quem não completou a coleção.

## Leitura e justiça

Os alvos próximos recebem menos névoa, preservando o horizonte atmosférico. Pequenas marcas na borda indicam as superfícies da rota principal; elas acompanham plataformas móveis e desaparecem quando uma plataforma perde sua colisão. A recompensa dos espelhos tem um bloqueio explícito e só fica coletável após resolver o puzzle, inclusive ao carregar uma partida.

## Partidas salvas

O novo trajeto usa uma revisão própria. Uma partida de um trajeto antigo recomeça no início, pois seus fragmentos e posições já não correspondem ao mundo novo. Habilidades, conquistas, álbum e memórias são preservados. O recorde anterior é arquivado por versão e não compete com os tempos do novo trajeto.

## Validação executada

`npm test` verifica regras de coleta e restauração e usa o gerador e o controlador reais, sem GPU, para testar entradas/saídas, saltos comuns, plataformas oscilantes em diferentes fases, trilhas de dia/noite, correntes em cadeia, voos de prática e finais, parede de escalada, ponte e migração de progresso. Esses testes usam uma trajetória automatizada com boa precisão; não substituem a avaliação de jogadores iniciantes.

A apresentação é revisada no navegador. Para reproduzir a revisão visual sem alterar a partida principal, use `http://localhost:5173/?qa=1` em desenvolvimento. Os saves e fantasmas dessa sessão são separados. Em Pausa → Configurações → Desenvolvedor → Mundo e progresso, a prévia do encerramento leva ao altar e invalida o recorde da sessão.

## Próximo teste com três jogadores

Ainda pendente: convidar três pessoas que não conhecem o jogo, idealmente uma com pouca experiência em plataformas 3D, uma habituada ao gênero e uma usando controle. Não explicar os comandos antecipadamente; deixe as dicas ensinar.

1. Observe os primeiros dois minutos: a pessoa sabe o objetivo, identifica a saída e entende como pousar?
2. Nas Ruínas, registre se ela aprende a planar sozinha e quantas tentativas precisa para atravessar.
3. Registre quedas e tempo por travessia; pergunte se a causa foi erro de execução, comando confuso ou alvo difícil de enxergar.
4. Observe se ela entra em um desvio espontaneamente e se entende a consequência de reunir fragmentos.
5. No farol, pergunte o que mudou e se o último voo pareceu usar o que ela já havia aprendido.

| Jogador / dispositivo | Primeiro salto | Voo de prática | Trecho com mais quedas | Causa percebida | Descoberta favorita | Vontade de continuar |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |

Metas iniciais para avaliar, não resultados medidos: reconhecer a saída em até 30 segundos, aprender o primeiro voo em até três tentativas e conseguir explicar por que caiu. Corrigir primeiro os pontos em que mais de uma pessoa fica perdida. Só depois decidir se o jogo precisa de mais ilhas ou habilidades.
