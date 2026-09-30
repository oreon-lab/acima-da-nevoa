// These rules have no renderer or storage dependencies: save loading and live play share them.
export const MEMORIES = [
  { id: 'spark', at: 5, title: 'A primeira centelha', text: 'Alguém acendeu estas lanternas para que ninguém atravessasse a névoa sozinho.', effect: 'As lanternas ganham força. O farol recebe sua primeira centelha.' },
  { id: 'wind', at: 12, title: 'O caminho do vento', text: 'Quando as pontes caíram, aprendemos a confiar no vento. O caminho continuava lá.', effect: 'Os anéis do farol despertam. A névoa começa a ceder.' },
  { id: 'home', at: 24, title: 'Uma luz para voltar', text: 'O farol não marcava o fim da viagem. Guardava uma luz para quem ainda procurava o caminho de casa.', effect: 'O farol reúne sua luz. O horizonte fica mais claro.' },
];

export const lightStage = count => MEMORIES.filter(m => count >= m.at).length;
export const nextMemory = count => MEMORIES.find(m => count < m.at) ?? null;
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
