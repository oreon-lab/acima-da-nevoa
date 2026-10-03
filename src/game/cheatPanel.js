// Floating cheat window: a small draggable panel that stays open while the game keeps running (F2 toggles it).
// Rows are the same item objects the menus use: { label, on, adj } switches, { label, val, adj } numbers and choices,
// { label, act } buttons. Clicking a row re-renders it, so values always show the live state.
const root = document.createElement('div');
root.id = 'cheat'; root.hidden = true;
root.innerHTML = '<div class="ch-head"><span>◆ CHEATS</span><button class="ch-x" aria-label="Fechar">×</button></div><div class="ch-body"></div><div class="ch-foot">F2 abre e fecha · cheats invalidam o recorde</div>';
document.body.append(root);
const body = root.querySelector('.ch-body'), openGroups = new Set(['Geral']);
let groups = [];

function row(it) {
  const r = document.createElement('div'); r.className = 'ch-row'; r.title = it.hint || '';
  const name = document.createElement('span'); name.textContent = it.label; r.append(name);
  const btn = (text, fn, cls = '') => Object.assign(document.createElement('button'), { textContent: text, className: cls, onclick: () => { fn(); render(); } });
  if (it.act) { r.classList.add('act'); r.onclick = () => { it.act(); render(); }; }
  else if (it.on) r.append(btn(it.on() ? 'ligado' : 'desligado', () => it.adj(1), `sw${it.on() ? ' on' : ''}`));
  else { const v = document.createElement('b'); v.textContent = it.val(); r.append(btn('‹', () => it.adj(-1), 'st'), v, btn('›', () => it.adj(1), 'st')); }
  return r;
}
export function render() {
  const top = body.scrollTop;
  body.replaceChildren(...groups.map(([title, rows]) => {
    const d = document.createElement('details'), s = document.createElement('summary');
    s.textContent = title; d.open = openGroups.has(title);
    d.addEventListener('toggle', () => (d.open ? openGroups.add(title) : openGroups.delete(title)));
    d.append(s, ...rows.map(row));
    return d;
  }));
  body.scrollTop = top;
}
export const setCheats = g => { groups = g; };
export const cheatsOpen = () => !root.hidden;
export function toggleCheats(on = root.hidden) {
  root.hidden = !on;
  if (on) { document.exitPointerLock?.(); render(); }
}

// no focus on buttons (Space would "click" them while you play); the header drags the window
root.addEventListener('mousedown', e => { if (e.target.closest('button, summary')) e.preventDefault(); });
root.querySelector('.ch-x').onclick = () => toggleCheats(false);
root.querySelector('.ch-head').addEventListener('mousedown', e => {
  if (e.target.closest('button')) return;
  const r = root.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
  const move = m => { root.style.left = `${Math.max(0, Math.min(innerWidth - 80, m.clientX - dx))}px`; root.style.top = `${Math.max(0, Math.min(innerHeight - 40, m.clientY - dy))}px`; root.style.right = 'auto'; };
  const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); };
  addEventListener('mousemove', move); addEventListener('mouseup', up);
});
