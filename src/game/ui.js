// HUD (a small counter, the current checkpoint and a height gauge) and the plain-text menu used for pause / settings.
import { NAMES, ROMAN } from '../config.js';
import { $, clamp } from '../utils.js';
import { tone } from './audio.js';

const el = { count: $('#count'), area: $('#area'), msg: $('#msg'), title: $('#title'), pause: $('#pause'), menu: $('#menu'), alt: $('#alt') };
const timers = {};

function flash(node, ms, key) {
  node.classList.remove('show'); void node.offsetWidth; node.classList.add('show');
  clearTimeout(timers[key]); timers[key] = setTimeout(() => node.classList.remove('show'), ms);
}
export function setCount(n, total, pulse) {
  el.count.querySelector('.n').textContent = n;
  el.count.querySelector('.tot').textContent = ` / ${total}`;
  if (pulse) { el.count.classList.remove('pulse'); void el.count.offsetWidth; el.count.classList.add('pulse'); }
}
export const flashCount = (ms = 3500) => flash(el.count, ms, 'count');
export const showCount = on => { clearTimeout(timers.count); el.count.classList.toggle('show', on); };
export function areaTitle(i, sub) {
  el.area.querySelector('.num').textContent = ROMAN[i];
  el.area.querySelector('.name').textContent = NAMES[i];
  el.area.querySelector('.sub').textContent = sub;
  flash(el.area, 4200, 'area');
  if (sub === 'checkpoint') el.count.querySelector('.cpl').textContent = `Checkpoint · ${ROMAN[i]}`;
}

// height gauge on the right edge: a tick per island (lit once reached) and a marker that follows the player
const gauge = { ticks: [], top: 1, cp: -1, m: -1, me: el.alt.querySelector('.me'), txt: el.alt.querySelector('.m') };
export function initGauge(heights) {
  gauge.top = Math.max(heights[heights.length - 1], 1);
  const line = el.alt.querySelector('.line');
  heights.forEach(y => { const t = document.createElement('i'); t.style.bottom = `${y / gauge.top * 100}%`; line.appendChild(t); gauge.ticks.push(t); });
}
export function setGauge(y, cp) {
  const m = Math.max(0, Math.round(y));
  if (m !== gauge.m) { gauge.m = m; gauge.txt.textContent = `${m} m`; gauge.me.style.bottom = `${clamp(y / gauge.top, 0, 1) * 100}%`; }
  if (cp !== gauge.cp) { gauge.cp = cp; gauge.ticks.forEach((t, i) => t.classList.toggle('on', i <= cp)); }
}
export const message = (html, ms = 4000) => { el.msg.innerHTML = html; flash(el.msg, ms, 'msg'); };
export const showTitle = on => el.title.classList.toggle('show', on);
export const loadingText = t => { const n = $('#loading'); if (!n) return; if (t) n.textContent = t; else n.remove(); };

// menu: items are { label, act } or { label, val, adj } ; onBack runs on Esc
let items = [], sel = 0, back = null, foot = '';
export function openMenu(title, list, footer, onBack) {
  items = list; sel = 0; back = onBack;
  $('#pause .p-title').textContent = title;
  foot = footer;
  el.menu.classList.toggle('cols', items.some(i => i.val));   // settings rows: label left, value right
  el.menu.innerHTML = '';
  items.forEach((it, i) => {
    const li = document.createElement('li');
    li.onmouseenter = () => { sel = i; refresh(); };
    li.onclick = e => { sel = i; activate(+(e.target.dataset.d || 1)); };
    el.menu.appendChild(li);
  });
  refresh();
  el.pause.classList.add('show');
}
export const closeMenu = () => el.pause.classList.remove('show');
function refresh() {
  [...el.menu.children].forEach((li, i) => {
    const it = items[i];
    li.className = i === sel ? 'sel' : '';
    li.innerHTML = it.val ? `${it.label}<span class="val"><i data-d="-1">‹</i>${it.val()}<i data-d="1">›</i></span>` : it.label;
  });
  $('#pause .p-foot').textContent = items[sel]?.hint || foot;
}
function activate(d = 1) {
  const it = items[sel];
  if (it.adj) { it.adj(d); refresh(); tone([520], { dur: 0.15, vol: 0.03 }); }
  else it.act();
}
export function menuKey(e) {
  const c = e.code;
  if (c === 'ArrowUp' || c === 'KeyW') sel = (sel + items.length - 1) % items.length;
  else if (c === 'ArrowDown' || c === 'KeyS') sel = (sel + 1) % items.length;
  else if (c === 'ArrowLeft' || c === 'KeyA') { if (items[sel].adj) activate(-1); return; }
  else if (c === 'ArrowRight' || c === 'KeyD') { if (items[sel].adj) activate(1); return; }
  else if (c === 'Enter' || c === 'Space') return activate(1);
  else if (c === 'Escape') return back?.();
  else return;
  refresh();
}
