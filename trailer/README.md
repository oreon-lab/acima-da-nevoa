# Trailer — quarta montagem

75 segundos, 32 planos e enquadramento em 2,39:1 dentro de vídeo Full HD. A jornada segue descoberta, travessias, ruínas, voo, confronto, baleia, bosque, ponte e chegada ao farol. Três flashes da cutscene somam 1,6 segundo: interferência, suspensão e abertura da fenda. Um corte para preto interrompe o acontecimento antes da resolução.

O que mudou em relação ao v3:

- **Ritmo:** o filme ficou 17 s mais curto. O ato final agora acelera em vez de desacelerar: os planos encurtam de 3 s para 1,2 s até os flashes. Saíram o plano vazio da coroa, metade do passeio na baleia e as pausas longas.
- **Imagem:** os planos usam menos névoa, o grade tem mais contraste e há uma vinheta leve. O voo é filmado de perto, e as perseguições mantêm o personagem acima do letterbox.
- **Duelo:** a revelação mostra o rosto do guarda. O plano aberto fica acima da grama, o plano de ombro mantém o guarda visível, e o golpe final tem um flash branco com impacto grave.
- **Legendas:** texto maior, peso 400 e sombra que lê sobre o céu claro. Cada frase cai sobre a imagem que descreve.
- **Som:** o vento e um sub-boom começam no primeiro quadro. A música corta seco na entrada da ação, a baleia tem canto, e um riser leva a The Long Dark até os flashes. O preto antes do título é silêncio, e o título resolve mais baixo que o clímax. A mixagem usa ganho estático com limitador, sem compressão dinâmica, para preservar a curva.

## Exportar

```powershell
$env:CHROME_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
npm run trailer -- --fps 30
```

Produz `trailer/acima-da-nevoa-trailer-v4.mp4`, H.264 + AAC estéreo 48 kHz, preservando as versões anteriores. A simulação sempre avança a 60 Hz; o padrão de exportação sem opções é 60 fps. Requer Chrome ou Edge instalado.

Opções: `--width 1280 --height 720`, `--fps 30`, `--crf 18`, `--out caminho.mp4`, `--from 64.6 --to 69`, `--no-music`, `--music caminho.mp3`. Ao extrair um trecho, o exportador simula os planos anteriores e mantém a continuidade das animações, combate e baleia.

`--review --width 960 --height 540 --fps 30` salva três imagens por plano em `trailer/review-v4/`. O arquivo `acima-da-nevoa-trailer-v4-plan.json` registra cortes, trilhas e eventos sonoros; `acima-da-nevoa-trailer-v4-score.wav` permite conferir a mixagem separadamente. `--score-only` remixa esse plano salvo sem abrir o navegador.

## Continuidade e câmera

- Os saltos e o voo continuam entre seus cortes, sem reiniciar o movimento. O duelo usa as animações e os golpes reais do jogo.
- Cada região avança o checkpoint correto. A ponte está montada antes da travessia, e a chegada ao farol mantém o personagem na plataforma.
- O embarque usa o cais e a pose real da baleia no pouso. O personagem fica na parte dianteira do convés, à frente das copas; as vistas amplas mostram o corpo da baleia pelo lado externo.
- O bosque tem uma pausa de observação perto da lanterna, com aproximação suave da câmera e o personagem visível. A câmera não atravessa as árvores.
- A luz evolui do entardecer até o farol. As legendas têm tempos locais, e os flashes finais usam a própria cutscene, sem revelar sua conclusão.
- HUD, barras dos inimigos e progresso salvo ficam fora do trailer. A exportação espera os modelos carregarem.

## Música e efeitos

As faixas são de Scott Buckley, sob CC BY 4.0, e os efeitos gravados são de Kenney, sob CC0. Sub-booms, riser, vento, whoosh, impacto e o canto da baleia são sintetizados pelo próprio ffmpeg (`scripts/trailer-audio.mjs`) em `trailer/audio/synth/`, gerados automaticamente na primeira mixagem. As fontes e o texto de atribuição estão em [audio/CREDITS.md](audio/CREDITS.md) e [audio/attribution.txt](audio/attribution.txt).

| Trecho | Música | Sensação |
| --- | --- | --- |
| Abertura e primeiros saltos | Vento + Awakening, a partir do crescendo | Curiosidade que sobe |
| Degraus, ruínas, voo e duelo | Call To Adventure, entrada seca no corte | Aventura e coragem |
| Encontro com a baleia | Horizons, com o pico sobre a baleia, e canto da baleia | Admiração |
| Bosque, ponte e farol | The Long Dark + riser, corte seco no primeiro flash | Tensão crescente |
| Preto | Silêncio | Suspensão |
| Título | Final da Horizons, mais baixo | Resolução |

Passos (grama ou madeira, conforme o chão), saltos, pousos, planadas, desembainhar, cortes e o golpe final seguem eventos capturados durante a simulação.

Para obter novamente os arquivos:

```powershell
node scripts/download-trailer-audio.mjs
Expand-Archive -LiteralPath trailer/audio/kenney-rpg.zip -DestinationPath trailer/audio/kenney-rpg -Force
Expand-Archive -LiteralPath trailer/audio/kenney-impact.zip -DestinationPath trailer/audio/kenney-impact -Force
```

Ao publicar, copie `audio/attribution.txt` para a descrição do vídeo. Os créditos curtos também aparecem no cartão final.
