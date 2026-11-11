/* Lógica central de la app (sin DOM). Funciona en el navegador (window.Core) y en Node (tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- Constantes ---------- */
  const DIFFICULTIES = [
    { id: 'facil', name: 'Fácil' },
    { id: 'media', name: 'Media' },
    { id: 'dificil', name: 'Difícil' },
  ];
  const DURATIONS = [
    { id: 'corta', name: '< 15 min' },
    { id: 'media', name: '15–60 min' },
    { id: 'larga', name: '> 60 min' },
  ];
  const POINTS_TABLE = {
    facil: { corta: 5, media: 10, larga: 20 },
    media: { corta: 10, media: 20, larga: 40 },
    dificil: { corta: 20, media: 40, larga: 80 },
  };
  const PRIORITIES = [
    { id: 'alta', name: 'Alta', order: 0 },
    { id: 'media', name: 'Media', order: 1 },
    { id: 'baja', name: 'Baja', order: 2 },
  ];
  const CATEGORIES = [
    { id: 'casa', name: 'Casa', color: '#f59e0b' },
    { id: 'universidad', name: 'Universidad', color: '#6366f1' },
    { id: 'salud', name: 'Salud', color: '#10b981' },
    { id: 'proyectos', name: 'Proyectos', color: '#ec4899' },
    { id: 'personal', name: 'Personal', color: '#06b6d4' },
  ];
  const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']; // índice 0 = lunes
  const LEVEL_TITLES = ['Novato', 'Aprendiz', 'Constante', 'Disciplinado', 'Experto', 'Maestro', 'Leyenda'];

  const ACHIEVEMENTS = [
    { id: 'first_task', icon: '🌱', name: 'Primer paso', desc: 'Completa tu primera tarea', test: (s) => s.counters.done >= 1 },
    { id: 'tasks_10', icon: '🚀', name: 'En marcha', desc: 'Completa 10 tareas', test: (s) => s.counters.done >= 10 },
    { id: 'tasks_50', icon: '⚡', name: 'Imparable', desc: 'Completa 50 tareas', test: (s) => s.counters.done >= 50 },
    { id: 'tasks_100', icon: '🏆', name: 'Centenario', desc: 'Completa 100 tareas', test: (s) => s.counters.done >= 100 },
    { id: 'hard_10', icon: '💪', name: 'Sin miedo a lo difícil', desc: 'Completa 10 tareas difíciles', test: (s) => s.counters.hard >= 10 },
    { id: 'early_1', icon: '⏰', name: 'Adelantado', desc: 'Completa una tarea antes de que abra su ventana', test: (s) => s.counters.early >= 1 },
    { id: 'streak_3', icon: '🔥', name: 'Calentando', desc: 'Racha de 3 días', test: (s) => s.bestStreak >= 3 },
    { id: 'streak_7', icon: '🔥', name: 'Semana perfecta', desc: 'Racha de 7 días', test: (s) => s.bestStreak >= 7 },
    { id: 'streak_30', icon: '🌋', name: 'Mes de fuego', desc: 'Racha de 30 días', test: (s) => s.bestStreak >= 30 },
    { id: 'first_reward', icon: '🎁', name: 'Premio merecido', desc: 'Canjea tu primera recompensa', test: (s) => s.counters.redeemed >= 1 },
    { id: 'points_500', icon: '💰', name: 'Ahorrador', desc: 'Gana 500 puntos en total', test: (s) => s.totalEarned >= 500 },
    { id: 'points_2000', icon: '💎', name: 'Millonario', desc: 'Gana 2000 puntos en total', test: (s) => s.totalEarned >= 2000 },
    { id: 'level_5', icon: '⭐', name: 'Nivel 5', desc: 'Llega al nivel 5', test: (s) => levelInfo(s.totalEarned).level >= 5 },
    { id: 'level_10', icon: '🌟', name: 'Nivel 10', desc: 'Llega al nivel 10', test: (s) => levelInfo(s.totalEarned).level >= 10 },
  ];

  /* ---------- Utilidades de fecha (semana empieza el lunes, hora local) ---------- */
  function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function weekStart(ts) {
    const d = new Date(ts); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  }
  function addDays(ts, n) { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); }
  function atTime(dayTs, hhmm, endOfMinute) {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date(dayTs);
    d.setHours(h, m, endOfMinute ? 59 : 0, endOfMinute ? 999 : 0);
    return d.getTime();
  }
  function dayKey(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function uid() { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }

  /* ---------- Puntos y niveles ---------- */
  function calcPoints(difficulty, duration) {
    return (POINTS_TABLE[difficulty] || {})[duration] || 0;
  }
  // El nivel n empieza en 50*(n-1)*n puntos ganados en total: 0, 100, 300, 600, 1000...
  function threshold(n) { return 50 * (n - 1) * n; }
  function levelInfo(total) {
    let n = 1;
    while (threshold(n + 1) <= total) n++;
    const from = threshold(n), to = threshold(n + 1);
    return {
      level: n,
      title: LEVEL_TITLES[Math.min(n - 1, LEVEL_TITLES.length - 1)],
      into: total - from,
      needed: to - from,
      progress: (total - from) / (to - from),
    };
  }

  /* ---------- Estado ---------- */
  function defaultState(now) {
    return {
      v: 1,
      createdAt: now,
      lastTick: now,
      points: 0,
      totalEarned: 0,
      bestStreak: 0,
      templates: [],
      items: [],
      rewards: [],
      history: [],
      achievements: {},
      counters: { done: 0, hard: 0, redeemed: 0, early: 0 },
      settings: { theme: 'color' },
    };
  }
  function migrate(s) {
    const d = defaultState(Date.now());
    const out = Object.assign(d, s || {});
    out.counters = Object.assign(d.counters, (s && s.counters) || {});
    out.settings = Object.assign({ theme: 'color' }, (s && s.settings) || {});
    ['templates', 'items', 'rewards', 'history'].forEach((k) => { if (!Array.isArray(out[k])) out[k] = []; });
    if (!out.achievements || typeof out.achievements !== 'object') out.achievements = {};
    return out;
  }
  function log(s, ts, type, label, delta) {
    s.history.unshift({ ts, type, label, delta });
    if (s.history.length > 400) s.history.length = 400;
  }

  /* ---------- Tareas ---------- */
  function cleanSubtasks(list) {
    return (list || [])
      .map((x) => ({ id: x.id || uid(), t: String(x.t || '').trim(), done: !!x.done }))
      .filter((x) => x.t);
  }
  function baseFields(input) {
    const title = String(input.title || '').trim();
    if (!title) throw new Error('Escribe un título para la tarea.');
    const difficulty = input.difficulty || 'media';
    const duration = input.duration || 'media';
    return {
      title,
      category: input.category || 'personal',
      priority: input.priority || 'media',
      difficulty,
      duration,
      points: calcPoints(difficulty, duration),
      notes: String(input.notes || '').trim(),
      subtasks: cleanSubtasks(input.subtasks),
    };
  }

  function addOneOff(s, input, now) {
    const f = baseFields(input);
    const end = Number(input.deadline);
    if (!end || end <= now) throw new Error('La fecha límite debe estar en el futuro.');
    const item = Object.assign({ id: uid(), tplId: null, start: null, end, status: 'pending', doneAt: null, awarded: 0 }, f);
    s.items.push(item);
    return item;
  }

  function validateWindow(days, startTime, endTime) {
    if (!days || !days.length) throw new Error('Elige al menos un día.');
    if (!startTime || !endTime) throw new Error('Define la hora de inicio y de fin.');
    if (endTime <= startTime) throw new Error('La hora de fin debe ser posterior a la de inicio.');
  }

  function addTemplate(s, input, now) {
    const f = baseFields(input);
    const days = (input.days || []).slice().sort();
    const startTime = input.startTime || '00:00';
    const endTime = input.endTime || '23:59';
    validateWindow(days, startTime, endTime);
    const tpl = Object.assign({ id: uid(), days, startTime, endTime, createdAt: now }, f);
    s.templates.push(tpl);
    tick(s, now);
    return tpl;
  }

  function updateTemplate(s, id, input, now) {
    tick(s, now);
    const tpl = s.templates.find((t) => t.id === id);
    if (!tpl) throw new Error('No existe esa tarea fija.');
    const f = baseFields(input);
    const days = (input.days || []).slice().sort();
    const startTime = input.startTime || '00:00';
    const endTime = input.endTime || '23:59';
    validateWindow(days, startTime, endTime);
    Object.assign(tpl, f, { days, startTime, endTime, createdAt: now });
    // Las ocurrencias pendientes se regeneran con los datos nuevos; las hechas/falladas se conservan.
    s.items = s.items.filter((it) => !(it.tplId === id && it.status === 'pending'));
    tick(s, now);
    return tpl;
  }

  function updateOneOff(s, id, input, now) {
    tick(s, now);
    const it = s.items.find((x) => x.id === id);
    if (!it || it.status !== 'pending' || it.tplId) throw new Error('No se puede editar esa tarea.');
    const f = baseFields(input);
    const end = Number(input.deadline);
    if (!end || end <= now) throw new Error('La fecha límite debe estar en el futuro.');
    Object.assign(it, f, { end });
    return it;
  }

  function deleteItem(s, id) { s.items = s.items.filter((it) => it.id !== id); }
  function deleteTemplate(s, id) {
    s.templates = s.templates.filter((t) => t.id !== id);
    s.items = s.items.filter((it) => !(it.tplId === id && it.status === 'pending'));
  }

  /* ---------- Paso del tiempo: genera ocurrencias recurrentes y cierra las vencidas ---------- */
  function tick(s, now) {
    const missed = [];
    const MAX_WEEKS = 26;

    // 1) Generar ocurrencias de tareas fijas (incluye semanas sin abrir la app, para penalizarlas)
    const nowWeek = weekStart(now);
    s.templates.forEach((tpl) => {
      const from = weekStart(Math.max(s.lastTick || now, tpl.createdAt));
      let w = Math.max(from, addDays(nowWeek, -7 * MAX_WEEKS));
      while (w <= nowWeek) {
        tpl.days.forEach((d) => {
          const date = addDays(w, d);
          const id = tpl.id + '_' + dayKey(date);
          if (s.items.some((it) => it.id === id)) return;
          const start = atTime(date, tpl.startTime, false);
          const end = atTime(date, tpl.endTime, true);
          if (end <= tpl.createdAt) return; // ventana que terminó antes de crear la tarea
          s.items.push({
            id, tplId: tpl.id, start, end, status: 'pending', doneAt: null, awarded: 0,
            title: tpl.title, category: tpl.category, priority: tpl.priority,
            difficulty: tpl.difficulty, duration: tpl.duration, points: tpl.points,
            notes: tpl.notes, subtasks: tpl.subtasks.map((x) => ({ id: uid(), t: x.t, done: false })),
          });
        });
        w = addDays(w, 7);
      }
    });

    // 2) Cerrar vencidas: se pierde la mitad de los puntos (sin bajar de 0)
    s.items
      .filter((it) => it.status === 'pending' && it.end < now)
      .sort((a, b) => a.end - b.end)
      .forEach((it) => {
        it.status = 'missed';
        const penalty = Math.min(Math.floor(it.points / 2), s.points);
        s.points -= penalty;
        log(s, it.end, 'penalty', it.title, -penalty);
        missed.push({ id: it.id, title: it.title, penalty });
      });

    // 3) Limpiar historial antiguo de ocurrencias cerradas
    const cutoff = now - 120 * 86400000;
    s.items = s.items.filter((it) => it.status === 'pending' || it.end > cutoff);

    s.lastTick = now;
    const st = computeStreak(s, now);
    if (st > s.bestStreak) s.bestStreak = st;
    const newAch = checkAchievements(s, now);
    return { missed, newAchievements: newAch };
  }

  /* ---------- Completar / deshacer ---------- */
  function completeItem(s, id, now) {
    tick(s, now);
    const it = s.items.find((x) => x.id === id);
    if (!it) throw new Error('La tarea ya no existe.');
    if (it.status === 'done') throw new Error('Ya estaba completada.');
    if (it.status === 'missed') throw new Error('Esta tarea ya venció.');
    const before = levelInfo(s.totalEarned).level;
    it.status = 'done';
    it.doneAt = now;
    it.awarded = it.points;
    s.points += it.points;
    s.totalEarned += it.points;
    s.counters.done++;
    if (it.difficulty === 'dificil') s.counters.hard++;
    const early = !!(it.start && now < it.start);
    if (early) s.counters.early++;
    it.early = early;
    log(s, now, 'earn', it.title, it.points);
    const st = computeStreak(s, now);
    if (st > s.bestStreak) s.bestStreak = st;
    const after = levelInfo(s.totalEarned);
    return {
      gained: it.points,
      leveledUp: after.level > before ? after : null,
      newAchievements: checkAchievements(s, now),
    };
  }

  function undoComplete(s, id, now) {
    const it = s.items.find((x) => x.id === id);
    if (!it || it.status !== 'done') return;
    if (it.end < now) throw new Error('Ya venció; no se puede deshacer.');
    it.status = 'pending';
    s.points = Math.max(0, s.points - it.awarded);
    s.totalEarned = Math.max(0, s.totalEarned - it.awarded);
    s.counters.done = Math.max(0, s.counters.done - 1);
    if (it.difficulty === 'dificil') s.counters.hard = Math.max(0, s.counters.hard - 1);
    if (it.early) s.counters.early = Math.max(0, s.counters.early - 1);
    it.doneAt = null; it.awarded = 0; it.early = false;
    const idx = s.history.findIndex((h) => h.type === 'earn' && h.label === it.title);
    if (idx >= 0) s.history.splice(idx, 1);
  }

  function toggleSubtask(s, itemId, subId) {
    const it = s.items.find((x) => x.id === itemId);
    if (!it) return;
    const sub = it.subtasks.find((x) => x.id === subId);
    if (sub) sub.done = !sub.done;
  }

  /* ---------- Racha ---------- */
  // Un día cuenta si todas las tareas que vencían ese día se cumplieron. Un día con una vencida rompe la racha.
  // Los días sin tareas no suman ni rompen.
  function dayStatuses(s) {
    const map = {};
    s.items.forEach((it) => {
      const k = dayKey(it.end);
      const m = map[k] || (map[k] = { done: 0, missed: 0, pending: 0 });
      m[it.status === 'done' ? 'done' : it.status === 'missed' ? 'missed' : 'pending']++;
    });
    return map;
  }
  function computeStreak(s, now) {
    const map = dayStatuses(s);
    let count = 0;
    for (let i = 0; i < 400; i++) {
      const m = map[dayKey(addDays(startOfDay(now), -i))];
      if (!m) continue;
      if (m.missed > 0) break;
      if (m.pending === 0 && m.done > 0) count++;
    }
    return count;
  }

  /* ---------- Logros ---------- */
  function checkAchievements(s, now) {
    const unlocked = [];
    ACHIEVEMENTS.forEach((a) => {
      if (!s.achievements[a.id] && a.test(s)) {
        s.achievements[a.id] = now;
        unlocked.push(a);
      }
    });
    return unlocked;
  }

  /* ---------- Recompensas ---------- */
  function rewardFields(input) {
    const name = String(input.name || '').trim();
    const cost = Math.round(Number(input.cost));
    if (!name) throw new Error('Escribe el nombre de la recompensa.');
    if (!(cost > 0)) throw new Error('El costo debe ser mayor que 0.');
    return { name, cost, emoji: String(input.emoji || '🎁').trim().slice(0, 4) || '🎁' };
  }
  function addReward(s, input) {
    const r = Object.assign({ id: uid(), times: 0 }, rewardFields(input));
    s.rewards.push(r);
    return r;
  }
  function updateReward(s, id, input) {
    const r = s.rewards.find((x) => x.id === id);
    if (!r) throw new Error('No existe esa recompensa.');
    Object.assign(r, rewardFields(input));
    return r;
  }
  function deleteReward(s, id) { s.rewards = s.rewards.filter((r) => r.id !== id); }
  function redeemReward(s, id, now) {
    const r = s.rewards.find((x) => x.id === id);
    if (!r) throw new Error('No existe esa recompensa.');
    if (s.points < r.cost) throw new Error('Te faltan ' + (r.cost - s.points) + ' puntos.');
    s.points -= r.cost;
    r.times++;
    s.counters.redeemed++;
    log(s, now, 'redeem', r.name, -r.cost);
    return { reward: r, newAchievements: checkAchievements(s, now) };
  }

  /* ---------- Respaldo ---------- */
  function exportData(s) { return JSON.stringify(s); }
  function importData(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { throw new Error('El archivo no es un respaldo válido.'); }
    if (!obj || obj.v !== 1 || !Array.isArray(obj.items) || !Array.isArray(obj.rewards)) {
      throw new Error('El archivo no es un respaldo válido.');
    }
    return migrate(obj);
  }

  return {
    DIFFICULTIES, DURATIONS, PRIORITIES, CATEGORIES, DAY_NAMES, ACHIEVEMENTS, POINTS_TABLE,
    startOfDay, weekStart, addDays, atTime, dayKey, uid,
    calcPoints, levelInfo, defaultState, migrate,
    addOneOff, addTemplate, updateTemplate, updateOneOff, deleteItem, deleteTemplate,
    tick, completeItem, undoComplete, toggleSubtask, computeStreak,
    addReward, updateReward, deleteReward, redeemReward,
    exportData, importData,
  };
});
