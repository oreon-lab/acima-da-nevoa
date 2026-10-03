// These rules have no renderer or storage dependencies: save loading and live play share them.
// light gathered restores the lighthouse in stages: the count each stage needs
export const LIGHT_STAGES = [5, 12, 24];

export const lightStage = count => LIGHT_STAGES.filter(at => count >= at).length;
export const nextStage = count => LIGHT_STAGES.find(at => count < at) ?? null;
export const restorationTarget = (count, done) => done ? 1 : lightStage(count) * 0.2;
export const canCollect = k => !k.got && k.available !== false && k.g.visible;

export function journeyHint(id, jump, forward) {
  const hints = {
    jump: `${forward} mover · segure ${jump} para saltar mais alto. Gire a câmera para ver o pouso; sua sombra ajuda a medir a distância.`,
    moving: 'Observe uma oscilação. Salte quando a pedra seguinte estiver ao seu alcance; você acompanha a plataforma ao pousar.',
    crumble: 'Pedras âmbar tremem antes de cair. Continue saltando; as pedras claras são lugares para respirar.',
    glide: `Entre na corrente de ar. Perto do alto do salto, solte ${jump}, aperte de novo e segure para planar até a pedra larga.`,
    wind: 'As folhas que sobem mostram a corrente. Entre no centro e deixe o vento elevar você antes de seguir.',
    climb: 'Aproxime-se da parede coberta de musgo e continue andando contra ela para escalar. No topo, você sobe na pedra.',
    vents: `Planando, passe pelo centro de cada corrente. Segure ${jump} e mire nas folhas que sobem.`,
    phase: 'Siga as pedras opacas: douradas de dia, azuis à noite. A trilha permanece firme durante sua travessia.',
    bridge: 'A lanterna acesa levanta a ponte. Atravesse com calma; a próxima ilha guarda o último voo.',
    finale: `Salte pelas pedras, suba com o vento e plane pelo vão. Solte e aperte ${jump} novamente para abrir o voo.`,
  };
  return hints[id] ?? '';
}
