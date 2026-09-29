# Acima da Névoa

Plataforma 3D atmosférico em Three.js: um pequeno personagem sem corpo pula entre ilhas flutuantes, subindo cada vez mais alto acima da névoa.

## Rodar

```bash
npm install
npm run dev      # servidor de desenvolvimento (Vite)
npm run build    # build de produção em dist/
```

- `showcase.html` (em dev): vitrine com todos os objetos procedurais.
- Controles: WASD mover, Espaço pular, mouse câmera, Esc pausa.
- Configurações e menu de desenvolvedor (voo, teleporte, horário, clima) no menu de pausa.

## Estrutura

- `src/procedural/` mundo gerado por código (ilhas, objetos, temas, nível), um arquivo por objeto em `objects/`
- `src/render/` céu, névoa, luzes, pós-processamento
- `src/fx/` partículas e clima
- `src/game/` jogador, câmera, áudio (tudo sintetizado) e interface
- `assets/` modelo do personagem e sons
