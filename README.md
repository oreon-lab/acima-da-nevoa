# Acima da Névoa

Plataforma 3D atmosférico em Three.js: um pequeno personagem sem corpo pula entre ilhas flutuantes, subindo cada vez mais alto acima da névoa.

## Rodar

```bash
npm install
npm run dev      # servidor de desenvolvimento (Vite)
npm run build    # build de produção em dist/
```

- `showcase.html` (em dev): vitrine com todos os objetos procedurais.
- `npm test`: testes rápidos (grade espacial de colisão, bordas das ilhas e das pedras, validação das configurações salvas).
- Controles (reconfiguráveis em Pausa → Controles): WASD/setas mover, Espaço pular (no ar, de novo e segurando: planar, liberado nas Ruínas do Vento), R interagir, mouse câmera, Q/E girar, F modo foto, P ou Esc pausa.
- Gamepad: analógico esquerdo move, direito câmera, A pular/planar, B interagir, LB/RB girar, Start pausa, Select modo foto; o direcional e A/B navegam nos menus.
- Ninja integrado de `ninja_idle_attack.blend` em `assets/ninja.glb`, com guarda e ataque duplo. Clique esquerdo ou J ataca; C saca/guarda as espadas. No controle, X ataca e Y saca/guarda. As teclas podem ser reconfiguradas.
- Combate: cinco guardas nas ilhas, três pontos de vida e dois impactos por ataque, sincronizados com as espadas. Aproximar-se em guarda ativa os inimigos; guardar as espadas permite explorar livremente. Guardas avisam o ataque ficando vermelhos, podem ser interrompidos e exigem três acertos. Sem vida, o ninja retorna ao checkpoint. Vida e guardas reiniciam em uma nova jornada; o combate não bloqueia a subida ao farol.
- Sem equipar, as espadas ficam cruzadas nas costas como no FBX de referência, inclusive ao andar e saltar. C/Y anima o saque ou o retorno às costas; atacar com as espadas guardadas primeiro executa o saque e depois o golpe. O movimento contorna a cabeça sem precisar de braços. Equipadas, as espadas continuam em guarda durante a movimentação.
- O ataque duplo dura cerca de 0,7 s: cada espada faz um corte diagonal de fora para dentro, passando pelo centro à frente do ninja. Dano e rastros acompanham os dois contatos.
- Modo foto: câmera livre (WASD, Espaço/Shift, mouse), roda = zoom, `[` `]` mudam o horário, Enter salva um PNG, H esconde a dica.
- Álbum de descobertas: enquadre um dos oito marcos no modo foto e salve a imagem. A miniatura fica no menu de pausa e a descoberta permanece entre jornadas.
- Enigma das Ruínas do Vento: gire os três espelhos com R/B para apontar os feixes ao cristal central e revelar um fragmento de luz.
- Progresso salvo automaticamente (checkpoint, fragmentos, tempo). Recorde com fantasma, conquistas e álbum ficam entre jornadas. Usar o menu de desenvolvedor invalida o recorde da jornada.
- Jornada revisada: dicas contextuais, prática de planar nas Ruínas, vento simples antes das correntes em cadeia, escalada antes do cume e travessia final que combina salto, vento e voo.
- Reúna 5, 12 e 24 fragmentos para restaurar a luz do farol e descobrir memórias (Pausa → Explorar → Memórias do farol). A coleção é opcional; chegar ao altar restaura a luz por completo e mostra uma cena panorâmica que pode ser pulada.
- Revisões do trajeto reiniciam a partida incompatível e preservam conquistas, álbum, habilidades e memórias. Os recordes anteriores ficam arquivados por versão do mundo.
- Revisão de design, validação e roteiro de playtest: `docs/design-jornada.md`. Para revisão visual local com save separado: `/?qa=1` (somente em desenvolvimento).
- Configurações e menu de desenvolvedor (voo, teleporte, horário, clima) no menu de pausa.
- Pausa → Mapa: vista de cima com ilhas visitadas, checkpoint e "?" nos lugares secretos ainda não achados.
- Lagos têm água de verdade: nos rasos você vadeia, no lago fundo você nada (mais devagar, pulo fraco).
- Tempestades trazem vento lateral que empurra no ar (bem mais ao planar).
- Modelos 3D de props: Poly Pizza, todos CC0 (`assets/models/CREDITS.md`).
- Névoa pesada: só se enxerga o que está perto (cerca de 60 m); o feixe do farol continua visível de longe. O nível "Névoa" nas configurações ajusta a densidade.

## Estrutura

- `src/procedural/` mundo gerado por código (ilhas, objetos, temas, nível), um arquivo por objeto em `objects/`
- `src/render/` céu, névoa, luzes, pós-processamento
- `src/fx/` partículas e clima
- `src/game/` jogador, câmera, áudio (tudo sintetizado) e interface
- `assets/` modelo do personagem e sons

Modo Deus: F2 abre os cheats, também disponíveis no menu de pausa. Inclui invencibilidade, voo livre, vida, combate, física, teleporte e mundo. Cheats desativam o recorde da jornada atual.
