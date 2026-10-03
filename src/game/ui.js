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
  el.count.style.setProperty('--p', total ? n / total : 0);
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
function nextToast() {   // one at a time: several can fire on the same step
  if (!toasts.length) return;
  const t = $('#toast'), [title, text, kind] = toasts[0];
  t.querySelector('.t0').textContent = kind;
  t.querySelector('.t1').textContent = title; t.querySelector('.t2').textContent = text;
  flash(t, 4200, 'toast');
  setTimeout(() => { toasts.shift(); nextToast(); }, 5000);
}
export const setTimer = text => { $('#timer').textContent = text; };
export const showTitle = on => el.title.classList.toggle('show', on);
export const loadingText = (t, p) => {   // p: progress 0..1
  const n = $('#loading'); if (!n) return;
  if (p !== undefined) n.style.setProperty('--p', p);
  if (t) n.querySelector('span').textContent = t;
  else { n.style.setProperty('--p', 1); n.classList.add('out'); setTimeout(() => n.remove(), 1000); }
};

// menu: items are { label, act }, { label, val, adj } (‹ value ›) or { label, val, act } (value, no arrows);
// onBack runs on Esc; info = optional lines of text shown under the title
let items = [], sel = 0, back = null, foot = '', tabs = { go: [], active: -1 };
const isSection = it => it?.kind === 'section';   // a heading row in a settings page: never selected
const tabsEl = $('#pause .p-tabs');
// tabs along the top of a settings page: list = [[label, go], ...]; Q / E (or a click) switch
export function setTabs(list, active) {
  tabs = { go: list.map(t => t[1]), active };
  tabsEl.replaceChildren(...list.map(([label, go], i) => Object.assign(document.createElement('button'), { textContent: label, className: i === active ? 'on' : '', onclick: go })));
  refresh();
}
export function openMenu(title, list, footer, onBack, info = [], map = false, section = 'MENU', cs = false) {
  items = list; sel = Math.max(0, list.findIndex(i => !isSection(i))); back = onBack;
  tabs = { go: [], active: -1 }; tabsEl.replaceChildren();
  el.pause.classList.toggle('cs', cs);
  el.pause.classList.toggle('map', map);
  $('#pause .p-title').textContent = title;
  $('#pause .p-kicker').textContent = section;
  const inf = $('#pause .p-info');
  inf.replaceChildren(...info.map(line => Object.assign(document.createElement('div'), { textContent: line })));
  foot = footer;
  el.menu.replaceChildren();
  items.forEach((it, i) => {
    const li = document.createElement('li');
    li.setAttribute('role', isSection(it) ? 'presentation' : 'menuitem');
    li.style.setProperty('--i', Math.min(i, 12));
    if (!isSection(it)) {
      li.onmouseenter = () => { if (sel !== i) { sel = i; refresh(); blip(); } };
      li.onclick = e => { sel = i; const o = e.target.closest('[data-i]'); if (o) return choose(+o.dataset.i); activate(+(e.target.dataset.d || 1)); };
    }
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
  if (el.pause.classList.contains('cs') && (it.opts || it.on)) {   // CS-style segmented choice: every option visible, the current one lit
    const opts = it.opts ?? ['desligado', 'ligado'], cur = it.opts ? it.idx() : +!!it.on();
    const seg = document.createElement('span'); seg.className = 'seg';
    seg.append(...opts.map((o, k) => { const n = Object.assign(document.createElement('s'), { textContent: o, className: k === cur ? 'on' : '' }); n.dataset.i = k; return n; }));
    v.append(seg); return v;
  }
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
  if (tabs.go.length && !p) rows.push([keycap('Q') + keycap('E'), 'aba']);
  rows.push([p ? padcap('A') : keycap('Enter'), 'selecionar'], [p ? padcap('B') : keycap('Esc'), 'voltar']);
  return rows.map(([k, t]) => `<span>${k}${t}</span>`).join('');
}
export function refresh() {
  [...el.menu.children].forEach((li, i) => {
    const it = items[i];
    li.className = `${i === sel ? 'sel ' : ''}${it.kind || (it.label === 'Voltar' ? 'back' : '')}`;
    if (isSection(it)) { li.replaceChildren(Object.assign(document.createElement('span'), { textContent: it.label })); return; }
    li.setAttribute('aria-current', i === sel ? 'true' : 'false');
    const label = document.createElement('span'); label.textContent = it.label;
    li.replaceChildren(label, ...(it.val ? [valueNode(it)] : []));
  });
  $('#pause .p-nav').innerHTML = navHint();
  const real = items.filter(i => !isSection(i));
  $('#pause .p-count').textContent = `${String(real.indexOf(items[sel]) + 1).padStart(2, '0')} / ${String(real.length).padStart(2, '0')}`;
  $('#pause .p-foot').textContent = items[sel]?.hint || foot;
  el.menu.children[sel]?.scrollIntoView({ block: 'nearest' });
}
// pick option k of a segmented row (click)
function choose(k) {
  const it = items[sel];
  if (it.set) it.set(k); else if (it.on && !!it.on() !== !!k) it.adj(1); else return;
  refresh(); tone([520], { dur: 0.15, vol: 0.03 });
}
function activate(d = 1) {
  const it = items[sel];
  if (it.adj) { it.adj(d); refresh(); tone([520], { dur: 0.15, vol: 0.03 }); }
  else it.act?.();
}
export function menuKey(e) {
  const c = e.code;
  if (c === 'ArrowUp' || c === 'KeyW' || c === 'ArrowDown' || c === 'KeyS') {
    const d = c === 'ArrowUp' || c === 'KeyW' ? items.length - 1 : 1;
    do sel = (sel + d) % items.length; while (isSection(items[sel]));
  }
  else if ((c === 'KeyQ' || c === 'KeyE') && tabs.go.length) { tabs.go[(tabs.active + (c === 'KeyE' ? 1 : tabs.go.length - 1)) % tabs.go.length](); return blip(); }
  else if (c === 'ArrowLeft' || c === 'KeyA') { if (items[sel].adj) activate(-1); return; }
  else if (c === 'ArrowRight' || c === 'KeyD') { if (items[sel].adj) activate(1); return; }
  else if (c === 'Enter' || c === 'Space') return activate(1);
  else if (c === 'Escape') return back?.();
  else return;
  refresh(); blip();
}
