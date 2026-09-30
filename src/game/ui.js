// HUD and the shared navigation panel used by every pause screen.
import { NAMES, ROMAN } from '../config.js';
import { $, clamp } from '../utils.js';
import { tone } from './audio.js';
import { pad, keycap, padcap } from './input.js';

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
export function areaText(num, name, sub) {
  el.area.querySelector('.num').textContent = num;
  el.area.querySelector('.name').textContent = name;
  el.area.querySelector('.sub').textContent = sub;
  flash(el.area, 4200, 'area');
}
export function areaTitle(i, sub) {
  areaText(ROMAN[i], NAMES[i], sub);
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
// plain text only (textContent), so nothing here is ever parsed as HTML
const toasts = [];
export function toast(title, text, kind = 'CONQUISTA') {
  toasts.push([title, text, kind]);
  if (toasts.length === 1) nextToast();
}
function nextToast() {   // one at a time: several achievements can unlock on the same step
  if (!toasts.length) return;
  const t = $('#toast'), [title, text, kind] = toasts[0];
  t.querySelector('.t0').textContent = kind;
  t.querySelector('.t1').textContent = title; t.querySelector('.t2').textContent = text;
  flash(t, 4200, 'toast');
  setTimeout(() => { toasts.shift(); nextToast(); }, 5000);
}
export const setTimer = text => { $('#timer').textContent = text; };
export const showTitle = on => el.title.classList.toggle('show', on);
export const loadingText = t => { const n = $('#loading'); if (!n) return; if (t) n.textContent = t; else n.remove(); };

// menu: items are { label, act }, { label, val, adj } (‹ value ›) or { label, val, act } (value, no arrows);
// onBack runs on Esc; info = optional lines of text shown under the title
let items = [], sel = 0, back = null, foot = '';
export function openMenu(title, list, footer, onBack, info = [], map = false, section = 'MENU') {
  items = list; sel = 0; back = onBack;
  el.pause.classList.toggle('map', map);
  el.pause.classList.toggle('album', items.some(i => i.preview));
  $('#pause .p-title').textContent = title;
  $('#pause .p-kicker').textContent = section;
  const inf = $('#pause .p-info');
  inf.replaceChildren(...info.map(line => Object.assign(document.createElement('div'), { textContent: line })));
  foot = footer;
  el.menu.replaceChildren();
  items.forEach((it, i) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'menuitem');
    li.style.setProperty('--i', Math.min(i, 12));
    li.onmouseenter = () => { if (sel !== i) { sel = i; refresh(); blip(); } };
    li.onclick = e => { sel = i; activate(+(e.target.dataset.d || 1)); };
    el.menu.appendChild(li);
  });
  refresh();
  el.pause.classList.add('show');
  el.pause.setAttribute('aria-hidden', 'false');
}
export const closeMenu = () => { el.pause.classList.remove('show'); el.pause.setAttribute('aria-hidden', 'true'); };
const blip = () => tone([700], { dur: 0.05, vol: 0.012 });
// value widgets: a diamond switch for on/off, a row of pips for numbers with a range, plain text otherwise
function valueNode(it) {
  const v = document.createElement('span'); v.className = 'val';
  const arrow = d => `<i data-d="${d}">${d < 0 ? '‹' : '›'}</i>`;
  if (it.on) { v.innerHTML = '<span class="tog"></span>'; v.firstChild.classList.toggle('on', !!it.on()); v.setAttribute('aria-label', it.val()); return v; }
  if (it.frac) {
    const on = Math.round(clamp(it.frac(), 0, 1) * 10);
    v.innerHTML = `${arrow(-1)}<span class="pips">${Array.from({ length: 10 }, (_, k) => `<u${k < on ? ' class="on"' : ''}></u>`).join('')}</span><b></b>${arrow(1)}`;
  } else v.innerHTML = it.adj ? `${arrow(-1)}<b></b>${arrow(1)}` : '<b></b>';
  v.querySelector('b').textContent = it.val();
  return v;
}
// what the bottom row offers right now, in the glyphs of the device in use
function navHint() {
  const it = items[sel], p = pad.active;
  const rows = [[p ? padcap('◀▶') : keycap('↑') + keycap('↓'), 'navegar']];
  if (it?.adj) rows.push([p ? padcap('◀▶') : keycap('←') + keycap('→'), 'ajustar']);
  rows.push([p ? padcap('A') : keycap('Enter'), 'selecionar'], [p ? padcap('B') : keycap('Esc'), 'voltar']);
  return rows.map(([k, t]) => `<span>${k}${t}</span>`).join('');
}
export function refresh() {
  [...el.menu.children].forEach((li, i) => {
    const it = items[i];
    li.className = `${i === sel ? 'sel ' : ''}${it.kind || (it.label === 'Voltar' ? 'back' : '')}`;
    li.setAttribute('aria-current', i === sel ? 'true' : 'false');
    const label = document.createElement('span'); label.textContent = it.label;
    li.replaceChildren(label, ...(it.val ? [valueNode(it)] : []));
  });
  $('#pause .p-nav').innerHTML = navHint();
  $('#pause .p-count').textContent = `${String(sel + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`;
  $('#pause .p-foot').textContent = items[sel]?.hint || foot;
  el.menu.children[sel]?.scrollIntoView({ block: 'nearest' });
  const preview = items[sel]?.preview, box = $('#album-preview');
  if (el.pause.classList.contains('album')) {
    const img = box.querySelector('img');
    box.classList.toggle('empty', !preview?.src);
    if (preview?.src) { img.src = preview.src; img.style.display = 'block'; }
    else { img.removeAttribute('src'); img.style.display = 'none'; }
    box.querySelector('span').textContent = preview?.title || 'Selecione um marco';
  }
}
function activate(d = 1) {
  const it = items[sel];
  if (it.adj) { it.adj(d); refresh(); tone([520], { dur: 0.15, vol: 0.03 }); }
  else it.act?.();
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
  refresh(); blip();
}
