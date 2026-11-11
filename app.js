/* Interfaz de la app. Toda la lógica de negocio vive en core.js */
(function () {
  'use strict';
  const C = window.Core;
  const KEY = 'tareas_puntos_v1';

  /* ---------- Estado y persistencia ---------- */
  let S = load();
  let tab = 'hoy';
  let catFilter = 'all';
  let form = null;          // estado del formulario abierto
  let lastHTML = '';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return C.migrate(JSON.parse(raw));
    } catch (e) { /* datos corruptos: se empieza de cero */ }
    return C.defaultState(Date.now());
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { toast('No se pudo guardar. ¿Almacenamiento lleno?', 'bad'); }
  }

  /* ---------- Utilidades ---------- */
  const $ = (s) => document.querySelector(s);
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const catOf = (id) => C.CATEGORIES.find((c) => c.id === id) || C.CATEGORIES[C.CATEGORIES.length - 1];
  const prioOrder = (id) => (C.PRIORITIES.find((p) => p.id === id) || { order: 1 }).order;
  const hm = (ts) => new Date(ts).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dshort = (ts) => new Date(ts).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/[.,]/g, '');
  function relDay(ts, now) {
    const k = C.dayKey(ts);
    if (k === C.dayKey(now)) return 'hoy';
    if (k === C.dayKey(C.addDays(now, 1))) return 'mañana';
    return dshort(ts);
  }
  function toLocalInput(ts) {
    const d = new Date(ts);
    return C.dayKey(ts) + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function dueInfo(it, now) {
    if (it.status === 'done') return { text: 'Hecha ' + relDay(it.doneAt, now) + ' ' + hm(it.doneAt), urgent: false };
    if (it.status === 'missed') return { text: 'Venció ' + relDay(it.end, now), urgent: true };
    if (it.start && now < it.start) {
      return { text: 'Abre ' + relDay(it.start, now) + ' ' + hm(it.start) + ' · vence ' + hm(it.end), urgent: false };
    }
    const left = it.end - now;
    if (left < 3600000) return { text: 'Vence en ' + Math.max(1, Math.ceil(left / 60000)) + ' min', urgent: true };
    if (left < 3 * 3600000) return { text: 'Vence hoy ' + hm(it.end), urgent: true };
    return { text: 'Vence ' + relDay(it.end, now) + ' ' + hm(it.end), urgent: false };
  }
  function windowText(t) {
    const days = t.days.map((d) => C.DAY_NAMES[d]).join(' · ');
    const w = t.startTime === '00:00' && t.endTime === '23:59' ? 'todo el día' : t.startTime + '–' + t.endTime;
    return days + ' · ' + w;
  }

  /* ---------- Toasts ---------- */
  function toast(msg, kind, action) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.innerHTML = '<span>' + esc(msg) + '</span>';
    if (action) {
      const b = document.createElement('button');
      b.textContent = action.label;
      b.onclick = () => { action.fn(); el.remove(); };
      el.appendChild(b);
    }
    const box = $('#toasts');
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove(); // máximo 3 avisos a la vez
    setTimeout(() => el.remove(), action ? 5000 : 2800);
  }
  function celebrate(r) {
    if (r.leveledUp) toast('🎉 ¡Nivel ' + r.leveledUp.level + ' · ' + r.leveledUp.title + '!', 'level');
    (r.newAchievements || []).forEach((a) => toast(a.icon + ' Logro: ' + a.name, 'level'));
  }

  /* ---------- Tema ---------- */
  function applyTheme() {
    const t = S.settings.theme === 'dark' ? 'dark' : 'color';
    document.documentElement.dataset.theme = t;
    $('#theme-color').setAttribute('content', t === 'dark' ? '#0e0f14' : '#f6f5fb');
    $('#theme-btn').textContent = t === 'dark' ? '☀️' : '🌙';
  }
  function setTheme(t) { S.settings.theme = t; save(); applyTheme(); render(true); }

  /* ---------- Tarjetas ---------- */
  function taskCard(it, now) {
    const c = catOf(it.category);
    const d = dueInfo(it, now);
    const done = it.status === 'done';
    const subs = it.subtasks.length ? '<span>☑ ' + it.subtasks.filter((x) => x.done).length + '/' + it.subtasks.length + '</span>' : '';
    return '<div class="task ' + (done ? 'done' : '') + '" style="--cat:' + c.color + '">' +
      '<button class="check" data-act="' + (done ? 'undo' : 'complete') + '" data-id="' + it.id + '" aria-label="Completar">' + (done ? '✓' : '') + '</button>' +
      '<div class="body" data-act="open" data-id="' + it.id + '">' +
      '<div class="title">' + esc(it.title) + '</div>' +
      '<div class="meta"><span><i class="prio ' + it.priority + '"></i>' + esc(c.name) + '</span>' +
      '<span class="' + (d.urgent ? 'urgent' : '') + '">' + esc(d.text) + '</span>' +
      (it.tplId ? '<span>🔁</span>' : '') + subs + '</div></div>' +
      '<div class="pts">+' + it.points + '</div></div>';
  }
  function sortPending(a, b) { return a.end - b.end || prioOrder(a.priority) - prioOrder(b.priority); }

  /* ---------- Vistas ---------- */
  function viewHoy(now) {
    const info = C.levelInfo(S.totalEarned);
    const streak = C.computeStreak(S, now);
    const tk = C.dayKey(now);
    const pending = S.items.filter((i) => i.status === 'pending').sort(sortPending);
    const today = pending.filter((i) => C.dayKey(i.end) === tk);
    const next = pending.filter((i) => C.dayKey(i.end) !== tk);
    const doneToday = S.items.filter((i) => i.status === 'done' && i.doneAt && C.dayKey(i.doneAt) === tk).sort((a, b) => b.doneAt - a.doneAt);

    let h = '<div class="hero"><div class="row"><div><div class="lbl">Puntos disponibles</div><div class="pts">' + S.points + '</div></div>' +
      '<div style="text-align:right"><div class="lvl">Nivel ' + info.level + ' · ' + esc(info.title) + '</div><div class="lbl">🔥 Racha: ' + streak + (streak === 1 ? ' día' : ' días') + '</div></div></div>' +
      '<div class="bar"><i style="width:' + Math.round(info.progress * 100) + '%"></i></div>' +
      '<div class="foot"><span>' + info.into + ' / ' + info.needed + ' para el nivel ' + (info.level + 1) + '</span><span>Total ganado: ' + S.totalEarned + '</span></div></div>';

    h += '<h2 class="sec"><span>Para hoy</span><span>' + today.length + '</span></h2>';
    h += today.length ? today.map((i) => taskCard(i, now)).join('') :
      '<div class="empty"><b>🎉</b>' + (S.items.length || S.templates.length ? 'Nada pendiente para hoy.' : 'Toca el + para crear tu primera tarea.') + '</div>';
    if (next.length) {
      h += '<h2 class="sec"><span>Próximas</span><span>' + next.length + '</span></h2>' + next.map((i) => taskCard(i, now)).join('');
    }
    if (doneToday.length) {
      h += '<h2 class="sec"><span>Hechas hoy</span><span>' + doneToday.length + '</span></h2>' + doneToday.map((i) => taskCard(i, now)).join('');
    }
    return h;
  }

  function viewTareas(now) {
    let h = '<div class="chips scroll"><button class="chip ' + (catFilter === 'all' ? 'on' : '') + '" data-act="filter" data-v="all">Todas</button>' +
      C.CATEGORIES.map((c) => '<button class="chip cat ' + (catFilter === c.id ? 'on' : '') + '" style="--c:' + c.color + '" data-act="filter" data-v="' + c.id + '">' + esc(c.name) + '</button>').join('') + '</div>';
    const pending = S.items.filter((i) => i.status === 'pending' && (catFilter === 'all' || i.category === catFilter)).sort(sortPending);
    h += '<h2 class="sec"><span>Pendientes</span><span>' + pending.length + '</span></h2>';
    h += pending.length ? pending.map((i) => taskCard(i, now)).join('') : '<div class="empty"><b>✨</b>No hay tareas pendientes aquí.</div>';

    const tpls = S.templates.filter((t) => catFilter === 'all' || t.category === catFilter);
    h += '<h2 class="sec"><span>Tareas fijas (se repiten cada semana)</span><span>' + tpls.length + '</span></h2>';
    h += tpls.length ? tpls.map((t) => {
      const c = catOf(t.category);
      return '<div class="task" style="--cat:' + c.color + '"><div class="body" data-act="edit-tpl" data-id="' + t.id + '">' +
        '<div class="title">🔁 ' + esc(t.title) + '</div><div class="meta"><span>' + esc(c.name) + '</span><span>' + esc(windowText(t)) + '</span></div></div>' +
        '<div class="pts">+' + t.points + '</div></div>';
    }).join('') : '<div class="empty">Aún no tienes tareas fijas.<br>Al crear una tarea activa “Recurrente”.</div>';
    return h;
  }

  function viewPremios() {
    let h = '<div class="hero"><div class="lbl">Puntos disponibles</div><div class="pts">' + S.points + '</div></div>';
    h += '<h2 class="sec"><span>Mis recompensas</span><span>' + S.rewards.length + '</span></h2>';
    if (!S.rewards.length) {
      h += '<div class="empty"><b>🎁</b>Crea tus recompensas con el botón +<br>(un helado, ir al cine…).</div>';
    } else {
      h += S.rewards.slice().sort((a, b) => a.cost - b.cost).map((r) => {
        const can = S.points >= r.cost;
        return '<div class="reward"><div class="em">' + esc(r.emoji) + '</div><div class="info"><div class="name">' + esc(r.name) + '</div>' +
          '<div class="sub">' + r.cost + ' pts · canjeada ' + r.times + (r.times === 1 ? ' vez' : ' veces') + (can ? '' : ' · te faltan ' + (r.cost - S.points)) + '</div></div>' +
          '<button class="mini" data-act="edit-reward" data-id="' + r.id + '" aria-label="Editar">✎</button>' +
          '<button class="btn" data-act="redeem" data-id="' + r.id + '" ' + (can ? '' : 'disabled') + '>Canjear</button></div>';
      }).join('');
    }
    return h;
  }

  function viewPerfil(now) {
    const info = C.levelInfo(S.totalEarned);
    const streak = C.computeStreak(S, now);
    let h = '<div class="stats"><div class="stat"><b>' + S.counters.done + '</b><span>Tareas hechas</span></div>' +
      '<div class="stat"><b>🔥 ' + streak + '</b><span>Racha actual</span></div>' +
      '<div class="stat"><b>' + S.bestStreak + '</b><span>Mejor racha</span></div></div>';
    h += '<div class="card" style="margin-top:8px"><b>Nivel ' + info.level + ' · ' + esc(info.title) + '</b>' +
      '<div class="bar" style="background:var(--border)"><i style="background:var(--accent);width:' + Math.round(info.progress * 100) + '%"></i></div>' +
      '<span class="note">' + info.into + ' / ' + info.needed + ' puntos para el nivel ' + (info.level + 1) + '</span></div>';

    const got = Object.keys(S.achievements).length;
    h += '<h2 class="sec"><span>Logros</span><span>' + got + '/' + C.ACHIEVEMENTS.length + '</span></h2><div class="ach-grid">' +
      C.ACHIEVEMENTS.map((a) => '<div class="ach ' + (S.achievements[a.id] ? '' : 'locked') + '"><div class="ic">' + a.icon + '</div><div><b>' + esc(a.name) + '</b><span>' + esc(a.desc) + '</span></div></div>').join('') + '</div>';

    h += '<h2 class="sec"><span>Historial</span></h2>';
    h += S.history.length ? '<div class="hist">' + S.history.slice(0, 30).map((x) =>
      '<div><span>' + esc(x.label) + '<small>' + (x.type === 'earn' ? 'Tarea completada' : x.type === 'penalty' ? 'Tarea vencida' : 'Canje') + ' · ' + esc(dshort(x.ts) + ' ' + hm(x.ts)) + '</small></span>' +
      '<span class="d ' + (x.delta >= 0 ? 'pos' : 'neg') + '">' + (x.delta >= 0 ? '+' : '') + x.delta + '</span></div>').join('') + '</div>'
      : '<div class="empty">Todavía no hay movimientos.</div>';

    h += '<h2 class="sec"><span>Ajustes</span></h2><div class="card"><div class="lab">Tema</div><div class="row2">' +
      '<button class="chip ' + (S.settings.theme !== 'dark' ? 'on' : '') + '" data-act="theme" data-v="color">🎨 Colorido</button>' +
      '<button class="chip ' + (S.settings.theme === 'dark' ? 'on' : '') + '" data-act="theme" data-v="dark">🌙 Oscuro</button></div></div>' +
      '<div class="card"><div class="lab">Respaldo de datos</div><p class="note">Tus datos viven solo en este iPhone. Guarda un respaldo de vez en cuando (por ejemplo en Archivos o iCloud Drive).</p>' +
      '<div class="row2"><button class="btn ghost" data-act="export">⬆ Exportar</button><button class="btn ghost" data-act="import">⬇ Importar</button></div>' +
      '<input type="file" id="import-file" accept="application/json,.json" class="hidden"></div>' +
      '<div class="card"><button class="btn danger" data-act="reset">Borrar todos los datos</button></div>';
    return h;
  }

  const TITLES = { hoy: 'Hoy', tareas: 'Tareas', premios: 'Recompensas', perfil: 'Perfil' };
  function render(force) {
    const now = Date.now();
    let h = '';
    if (tab === 'hoy') h = viewHoy(now);
    else if (tab === 'tareas') h = viewTareas(now);
    else if (tab === 'premios') h = viewPremios();
    else h = viewPerfil(now);
    $('#title').textContent = TITLES[tab];
    $('#pts-pill').textContent = S.points + ' pts';
    document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $('#fab').classList.toggle('hidden', tab === 'perfil');
    if (force || h !== lastHTML) { $('#view').innerHTML = h; lastHTML = h; }
  }

  /* ---------- Hoja (sheet) ---------- */
  function openSheet(html) {
    const sh = $('#sheet'), bd = $('#backdrop');
    sh.innerHTML = '<div class="grab"></div>' + html;
    sh.classList.remove('hidden'); bd.classList.remove('hidden');
    requestAnimationFrame(() => { sh.classList.add('show'); bd.classList.add('show'); });
    sh.scrollTop = 0;
  }
  function closeSheet() {
    const sh = $('#sheet'), bd = $('#backdrop');
    sh.classList.remove('show'); bd.classList.remove('show');
    form = null;
    setTimeout(() => { if (!sh.classList.contains('show')) { sh.classList.add('hidden'); bd.classList.add('hidden'); sh.innerHTML = ''; } }, 260);
  }
  function confirmSheet(msg, yesLabel, fn) {
    openSheet('<h3>' + esc(msg) + '</h3><div class="btns"><button class="btn ghost" data-act="close">Cancelar</button><button class="btn" style="background:var(--bad)" data-act="confirm-yes">' + esc(yesLabel) + '</button></div>');
    $('#sheet')._yes = fn;
  }

  /* ---------- Formulario de tarea ---------- */
  function chipGroup(group, items, current, extra) {
    return '<div class="chips">' + items.map((i) =>
      '<button type="button" class="chip ' + (extra || '') + ' ' + (current === i.id ? 'on' : '') + '" ' + (i.color ? 'style="--c:' + i.color + '"' : '') + ' data-act="pick" data-g="' + group + '" data-v="' + i.id + '">' + esc(i.name) + '</button>').join('') + '</div>';
  }
  function subRow(sub) {
    return '<div class="sub-row" data-sid="' + esc(sub.id || '') + '" data-done="' + (sub.done ? 1 : 0) + '"><input class="inp sub-in" placeholder="Subtarea" value="' + esc(sub.t || '') + '"><button type="button" class="mini" data-act="sub-del" aria-label="Quitar">✕</button></div>';
  }
  function openTaskForm(opts) {
    opts = opts || {};
    const src = opts.tpl || opts.item || null;
    const now = Date.now();
    const defDeadline = (function () { const d = new Date(now); d.setHours(23, 59, 0, 0); if (d.getTime() <= now + 600000) d.setDate(d.getDate() + 1); return d.getTime(); })();
    form = {
      editTpl: opts.tpl ? opts.tpl.id : null,
      editItem: opts.item ? opts.item.id : null,
      recurring: !!opts.tpl,
      category: src ? src.category : 'personal',
      priority: src ? src.priority : 'media',
      difficulty: src ? src.difficulty : 'media',
      duration: src ? src.duration : 'media',
      days: opts.tpl ? opts.tpl.days.slice() : [],
    };
    const editing = !!src;
    openSheet(
      '<h3>' + (editing ? 'Editar tarea' : 'Nueva tarea') + '</h3>' +
      '<div class="field"><label>Título</label><input class="inp" id="f-title" maxlength="80" placeholder="Ej: Limpiar la casa" value="' + esc(src ? src.title : '') + '"></div>' +
      '<div class="field"><div class="switch"><span><b>🔁 Recurrente</b><div class="note" style="margin:0">Se repite cada semana</div></span><input type="checkbox" id="f-rec" ' + (form.recurring ? 'checked' : '') + ' ' + (editing ? 'disabled' : '') + '></div></div>' +
      '<div id="f-rec-box" class="' + (form.recurring ? '' : 'hidden') + '">' +
      '<div class="field"><label>Días de la semana</label><div class="chips">' + C.DAY_NAMES.map((n, i) => '<button type="button" class="chip day ' + (form.days.includes(i) ? 'on' : '') + '" data-act="day" data-v="' + i + '">' + n + '</button>').join('') + '</div></div>' +
      '<div class="field two"><div><label class="lab">Abre</label><input class="inp" type="time" id="f-start" value="' + (opts.tpl ? opts.tpl.startTime : '00:00') + '"></div><div><label class="lab">Cierra</label><input class="inp" type="time" id="f-end" value="' + (opts.tpl ? opts.tpl.endTime : '23:59') + '"></div></div>' +
      '<p class="note">Puedes completarla antes de que abra. Si no la cumples dentro de la ventana, pierdes la mitad de los puntos.</p></div>' +
      '<div id="f-one-box" class="field ' + (form.recurring ? 'hidden' : '') + '"><label>Fecha límite</label><input class="inp" type="datetime-local" id="f-deadline" value="' + toLocalInput(opts.item ? opts.item.end : defDeadline) + '"></div>' +
      '<div class="field"><label>Categoría</label>' + chipGroup('category', C.CATEGORIES, form.category, 'cat') + '</div>' +
      '<div class="field"><label>Dificultad</label>' + chipGroup('difficulty', C.DIFFICULTIES, form.difficulty) + '</div>' +
      '<div class="field"><label>Tiempo que toma</label>' + chipGroup('duration', C.DURATIONS, form.duration) + '</div>' +
      '<div class="field"><span class="pts-preview" id="f-pts">+' + C.calcPoints(form.difficulty, form.duration) + ' puntos</span></div>' +
      '<div class="field"><label>Prioridad</label>' + chipGroup('priority', C.PRIORITIES, form.priority) + '</div>' +
      '<div class="field"><label>Subtareas</label><div id="f-subs">' + (src ? src.subtasks.map(subRow).join('') : '') + '</div><button type="button" class="btn ghost" data-act="sub-add">+ Añadir subtarea</button></div>' +
      '<div class="field"><label>Notas</label><textarea class="inp" id="f-notes" placeholder="Opcional">' + esc(src ? src.notes : '') + '</textarea></div>' +
      '<div class="err hidden" id="f-err"></div>' +
      '<div class="btns"><button class="btn ghost" data-act="close">Cancelar</button><button class="btn" data-act="save-task">Guardar</button></div>' +
      (editing ? '<div class="btns"><button class="btn danger" data-act="' + (opts.tpl ? 'del-tpl' : 'del-item') + '" data-id="' + src.id + '">Eliminar' + (opts.tpl ? ' tarea fija' : '') + '</button></div>' : '')
    );
  }
  function readSubtasks() {
    return Array.from(document.querySelectorAll('#f-subs .sub-row')).map((r) => ({
      id: r.dataset.sid || undefined, t: r.querySelector('input').value, done: r.dataset.done === '1',
    }));
  }
  function saveTask() {
    const err = $('#f-err');
    const input = {
      title: $('#f-title').value, category: form.category, priority: form.priority,
      difficulty: form.difficulty, duration: form.duration, notes: $('#f-notes').value, subtasks: readSubtasks(),
    };
    const now = Date.now();
    try {
      if (form.recurring) {
        input.days = form.days; input.startTime = $('#f-start').value; input.endTime = $('#f-end').value;
        if (form.editTpl) C.updateTemplate(S, form.editTpl, input, now); else C.addTemplate(S, input, now);
      } else {
        input.deadline = new Date($('#f-deadline').value).getTime();
        if (form.editItem) C.updateOneOff(S, form.editItem, input, now); else C.addOneOff(S, input, now);
      }
    } catch (e) { err.textContent = e.message; err.classList.remove('hidden'); return; }
    save(); closeSheet(); render(true);
    toast('Tarea guardada ✓', 'good');
  }

  /* ---------- Detalle de tarea ---------- */
  function openDetail(id) {
    const it = S.items.find((x) => x.id === id);
    if (!it) return;
    const now = Date.now();
    const c = catOf(it.category);
    const d = dueInfo(it, now);
    const pr = C.PRIORITIES.find((p) => p.id === it.priority);
    openSheet(
      '<h3>' + esc(it.title) + '</h3>' +
      '<div class="chips" style="margin-bottom:10px"><span class="chip on" style="background:' + c.color + ';border-color:' + c.color + '">' + esc(c.name) + '</span><span class="chip">+' + it.points + ' pts</span><span class="chip">Prioridad ' + esc(pr.name.toLowerCase()) + '</span>' + (it.tplId ? '<span class="chip">🔁 Recurrente</span>' : '') + '</div>' +
      '<p class="note" style="font-size:14px">' + esc(d.text) + (it.status === 'pending' ? ' · si no la cumples pierdes ' + Math.floor(it.points / 2) + ' pts' : '') + '</p>' +
      (it.notes ? '<div class="card">' + esc(it.notes).replace(/\n/g, '<br>') + '</div>' : '') +
      (it.subtasks.length ? '<div class="card">' + it.subtasks.map((s) => '<label class="sub-check ' + (s.done ? 'done' : '') + '"><input type="checkbox" data-act="sub" data-id="' + it.id + '" data-sid="' + s.id + '" ' + (s.done ? 'checked' : '') + '><span>' + esc(s.t) + '</span></label>').join('') + '</div>' : '') +
      '<div class="btns">' +
      (it.status === 'pending' ? '<button class="btn" data-act="complete" data-id="' + it.id + '" data-close="1">Completar +' + it.points + '</button>' : '') +
      (it.status === 'pending' ? '<button class="btn ghost" data-act="edit-from-detail" data-id="' + it.id + '">Editar</button>' : '<button class="btn ghost" data-act="close">Cerrar</button>') +
      '</div>'
    );
  }

  /* ---------- Recompensas ---------- */
  function openRewardForm(r) {
    openSheet(
      '<h3>' + (r ? 'Editar recompensa' : 'Nueva recompensa') + '</h3>' +
      '<div class="field two"><div><label class="lab">Emoji</label><input class="inp" id="r-emoji" maxlength="4" value="' + esc(r ? r.emoji : '🍦') + '"></div>' +
      '<div><label class="lab">Costo (pts)</label><input class="inp" id="r-cost" type="number" inputmode="numeric" min="1" value="' + (r ? r.cost : '') + '" placeholder="50"></div></div>' +
      '<div class="field"><label>Nombre</label><input class="inp" id="r-name" maxlength="60" placeholder="Ej: Comprar un helado" value="' + esc(r ? r.name : '') + '"></div>' +
      '<div class="err hidden" id="r-err"></div>' +
      '<div class="btns"><button class="btn ghost" data-act="close">Cancelar</button><button class="btn" data-act="save-reward" data-id="' + (r ? r.id : '') + '">Guardar</button></div>' +
      (r ? '<div class="btns"><button class="btn danger" data-act="del-reward" data-id="' + r.id + '">Eliminar recompensa</button></div>' : '')
    );
  }

  /* ---------- Respaldo ---------- */
  function exportBackup() {
    const name = 'respaldo-tareas-' + C.dayKey(Date.now()) + '.json';
    const file = new File([C.exportData(S)], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Respaldo de Mis Tareas' }).catch(() => {});
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
  }
  function importBackup(file) {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const data = C.importData(String(rd.result));
        confirmSheet('Esto reemplaza tus datos actuales con el respaldo. ¿Continuar?', 'Importar', () => {
          S = data; save(); applyTheme(); closeSheet(); render(true); toast('Respaldo importado ✓', 'good');
        });
      } catch (e) { toast(e.message, 'bad'); }
    };
    rd.readAsText(file);
  }

  /* ---------- Acciones ---------- */
  function doComplete(id, closeAfter) {
    try {
      const r = C.completeItem(S, id, Date.now());
      save(); if (closeAfter) closeSheet(); render(true);
      toast('+' + r.gained + ' pts 🎉', 'good', { label: 'Deshacer', fn: () => {
        try { C.undoComplete(S, id, Date.now()); save(); render(true); } catch (e) { toast(e.message, 'bad'); }
      } });
      celebrate(r);
    } catch (e) { toast(e.message, 'bad'); runTick(); }
  }

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act, id = el.dataset.id, v = el.dataset.v;
    switch (act) {
      case 'complete': doComplete(id, el.dataset.close === '1'); break;
      case 'undo':
        try { C.undoComplete(S, id, Date.now()); save(); render(true); } catch (e) { toast(e.message, 'bad'); }
        break;
      case 'open': openDetail(id); break;
      case 'filter': catFilter = v; render(true); break;
      case 'theme': setTheme(v); break;
      case 'close': closeSheet(); break;
      case 'confirm-yes': { const fn = $('#sheet')._yes; if (fn) fn(); break; }
      case 'pick': {
        form[el.dataset.g] = v;
        el.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === el));
        $('#f-pts').textContent = '+' + C.calcPoints(form.difficulty, form.duration) + ' puntos';
        break;
      }
      case 'day': {
        const n = Number(v), i = form.days.indexOf(n);
        if (i >= 0) form.days.splice(i, 1); else form.days.push(n);
        el.classList.toggle('on');
        break;
      }
      case 'sub-add': { $('#f-subs').insertAdjacentHTML('beforeend', subRow({})); const ins = document.querySelectorAll('#f-subs .sub-in'); ins[ins.length - 1].focus(); break; }
      case 'sub-del': el.closest('.sub-row').remove(); break;
      case 'save-task': saveTask(); break;
      case 'edit-tpl': openTaskForm({ tpl: S.templates.find((t) => t.id === id) }); break;
      case 'edit-from-detail': {
        const it = S.items.find((x) => x.id === id);
        if (!it) break;
        if (it.tplId) openTaskForm({ tpl: S.templates.find((t) => t.id === it.tplId) });
        else openTaskForm({ item: it });
        break;
      }
      case 'del-item': confirmSheet('¿Eliminar esta tarea?', 'Eliminar', () => { C.deleteItem(S, id); save(); closeSheet(); render(true); }); break;
      case 'del-tpl': confirmSheet('¿Eliminar esta tarea fija y sus ocurrencias pendientes?', 'Eliminar', () => { C.deleteTemplate(S, id); save(); closeSheet(); render(true); }); break;
      case 'redeem':
        try {
          const r = C.redeemReward(S, id, Date.now());
          save(); render(true); toast(r.reward.emoji + ' ¡Disfruta: ' + r.reward.name + '!', 'good'); celebrate(r);
        } catch (e) { toast(e.message, 'bad'); }
        break;
      case 'edit-reward': openRewardForm(S.rewards.find((r) => r.id === id)); break;
      case 'save-reward': {
        const input = { name: $('#r-name').value, cost: $('#r-cost').value, emoji: $('#r-emoji').value };
        try { if (id) C.updateReward(S, id, input); else C.addReward(S, input); }
        catch (e) { const er = $('#r-err'); er.textContent = e.message; er.classList.remove('hidden'); break; }
        save(); closeSheet(); render(true); break;
      }
      case 'del-reward': confirmSheet('¿Eliminar esta recompensa?', 'Eliminar', () => { C.deleteReward(S, id); save(); closeSheet(); render(true); }); break;
      case 'export': exportBackup(); break;
      case 'import': $('#import-file').click(); break;
      case 'reset': confirmSheet('Se borrarán TODAS tus tareas, puntos y recompensas. ¿Seguro?', 'Borrar todo', () => {
        S = C.defaultState(Date.now()); save(); applyTheme(); closeSheet(); render(true); toast('Datos borrados', 'bad');
      }); break;
    }
  });

  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.id === 'f-rec') {
      form.recurring = t.checked;
      $('#f-rec-box').classList.toggle('hidden', !t.checked);
      $('#f-one-box').classList.toggle('hidden', t.checked);
    } else if (t.id === 'import-file' && t.files[0]) {
      importBackup(t.files[0]); t.value = '';
    } else if (t.dataset && t.dataset.act === 'sub') {
      C.toggleSubtask(S, t.dataset.id, t.dataset.sid); save();
      t.closest('.sub-check').classList.toggle('done', t.checked); render();
    }
  });

  $('#tabbar').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-tab]');
    if (b) { tab = b.dataset.tab; window.scrollTo(0, 0); render(true); }
  });
  $('#fab').addEventListener('click', () => { if (tab === 'premios') openRewardForm(null); else openTaskForm(); });
  $('#backdrop').addEventListener('click', closeSheet);
  $('#theme-btn').addEventListener('click', () => setTheme(S.settings.theme === 'dark' ? 'color' : 'dark'));

  /* ---------- Reloj ---------- */
  function runTick() {
    const r = C.tick(S, Date.now());
    if (r.missed.length) {
      const total = r.missed.reduce((a, m) => a + m.penalty, 0);
      toast(r.missed.length + (r.missed.length === 1 ? ' tarea venció' : ' tareas vencieron') + ': −' + total + ' pts', 'bad');
    }
    r.newAchievements.forEach((a) => toast(a.icon + ' Logro: ' + a.name, 'level'));
    save(); render();
  }
  setInterval(runTick, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) runTick(); });

  /* ---------- Inicio ---------- */
  applyTheme();
  runTick();
  render(true);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
