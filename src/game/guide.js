import { game } from '../core.js';
import { settings, NAMES, ROMAN } from '../config.js';
import { crossings } from '../procedural/world.js';
import { pad, keyName } from './input.js';
import { journeyHint, nextMemory } from './journeyRules.js';
import { whale } from '../procedural/objects/whale.js';

function whaleHint(player, jump) {
  if (!whale.pose) return null;
  const near = p => Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < 10 && Math.abs(player.pos.y - p.y) < 6;
  if (player.ground?.whaleDeck) return {
    title: 'Nas costas da Baleia das Brumas',
    text: whale.pose.dock === 'destination' ? `Chegamos! Use ${jump} para saltar ao píer iluminado e explorar o Santuário do Horizonte.` : 'Explore o jardim e reúna as três centelhas. A baleia faz uma pausa nos píeres para você saltar com segurança.',
  };
  const destination = near(whale.destination) || near(whale.sanctuary);
  if (!destination && !near(whale.source)) return null;
  const dock = destination ? 'destination' : 'source', seconds = destination ? whale.pose.destinationIn : whale.pose.sourceIn;
  return { title: destination ? 'Santuário do Horizonte' : 'Embarque · Baleia das Brumas',
    text: whale.pose.dock === dock ? `A baleia está no píer por mais ${Math.ceil(whale.pose.waiting)} s. Use ${jump} para embarcar nas costas cobertas de musgo.` : `A baleia chega em ${Math.ceil(seconds)} s. Espere junto à lanterna do píer; ela também faz a viagem de volta.` };
}

const goal = document.querySelector('#objective'), guide = document.querySelector('#guide');
let previous = -1, age = 0, goalText = '', guideText = '';
export function resetGuide() { previous = -1; age = 0; }

// over: { title, next, light, hint?: { title, text }, near? } replaces the lighthouse goal (O Instante has its own);
// its hint shows for a while after each checkpoint, and again whenever `near` (the player is at the next challenge)
export function updateGuide(dt, player, save, over = null) {
  if (previous !== player.cp) { previous = player.cp; age = 0; }
  if (game.state === 'play') age += dt;
  const cp = player.cp, memory = nextMemory(player.collected);
  const jump = pad.active ? 'A' : keyName(settings.binds.jump);
  let excursion = whaleHint(player, jump);
  const title = over?.title ?? (save.done ? 'O farol voltou a brilhar' : 'Alcance o farol e restaure sua luz');
  const destination = over?.next ?? (save.done ? 'Explore os caminhos que ficaram para trás' : cp < NAMES.length - 1 ? `Próxima ilha · ${NAMES[cp + 1]}` : 'Suba ao altar sob o cristal do farol');
  const light = over?.light ?? (memory ? `Luz reunida · ${player.collected} / ${memory.at}` : 'Todas as centelhas do farol despertaram');
  const text = `${title}|${destination}|${light}|${cp}`;
  if (text !== goalText) {
    goalText = text;
    goal.querySelector('.o-title').textContent = title;
    goal.querySelector('.o-next').textContent = destination;
    goal.querySelector('.o-light').textContent = light;
    goal.querySelector('.o-step').textContent = `${ROMAN[cp]} / ${ROMAN[NAMES.length - 1]}`;
  }
  const crossing = crossings[player.ground?.course ?? cp];
  const nearStart = crossing && Math.hypot(player.pos.x - crossing.start.x, player.pos.z - crossing.start.z) < 8;
  const onRoute = player.ground?.course !== undefined || (player.ground === null && crossing?.steps.some(c => Math.hypot(c.x - player.pos.x, c.z - player.pos.z) < 6 && Math.abs(c.y - player.pos.y) < 9));
  const own = over?.hint && !save.done && (age < 12 || over.near);
  const show = settings.tips && game.state === 'play' && (over ? own : (excursion || (!save.done && crossing && (age < 9 || nearStart || onRoute))));
  guide.classList.toggle('show', !!show);
  if (show) {
    const forward = pad.active ? 'Analógico esquerdo' : `${keyName(settings.binds.forward)}${keyName(settings.binds.left)}${keyName(settings.binds.back)}${keyName(settings.binds.right)}`;
    const hint = over ? over.hint.text : excursion?.text ?? journeyHint(crossing.hint, jump, forward);
    const heading = over ? over.hint.title : excursion?.title ?? crossing.title;
    const next = `${heading}|${hint}`;
    if (next !== guideText) {
      guideText = next;
      guide.querySelector('.g-title').textContent = heading;
      guide.querySelector('.g-text').textContent = hint;
    }
  }
}
