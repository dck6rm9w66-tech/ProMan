/* ══════════════════════════════════════════════════════════════
   shell.js — Neue Wegführung als Schicht über der bestehenden App

   Ändert KEINE Zeichenlogik. Die Datei baut nur die Schiene, die
   Tableiste und die Linsenschiene und leitet Klicks an das
   vorhandene switchView() weiter. Alle 30 Render-Funktionen,
   Workflows, Benachrichtigungen, Drag & Drop usw. bleiben,
   wie sie sind.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Orte und ihre Linsen ─────────────────────────────────────
     Kanban, Liste, Stacks, Kalender und Gantt sind keine fünf
     Bereiche, sondern fünf Formen derselben Aufgaben. Deshalb
     liegen sie als Linsen unter einem Ort.                      */
  const PLACES = [
    { k: 'today', label: 'Heute', icon: 'fa-sun', lenses: [
        { v: 'today', l: 'Heute', i: 'fa-sun' }
    ]},
    { k: 'arbeit', label: 'Arbeit', icon: 'fa-columns', lenses: [
        { v: 'kanban',   l: 'Board',    i: 'fa-columns' },
        { v: 'list',     l: 'Liste',    i: 'fa-list' },
        { v: 'stacks',   l: 'Stapel',   i: 'fa-folder-open' },
        { v: 'schedule', l: 'Kalender', i: 'fa-calendar-alt' },
        { v: 'timeline', l: 'Gantt',    i: 'fa-stream' }
    ]},
    { k: 'wissen', label: 'Wissen', icon: 'fa-sticky-note', lenses: [
        { v: 'notes',      l: 'Notizen',     i: 'fa-sticky-note' },
        { v: 'checklists', l: 'Checklisten', i: 'fa-check-square' }
    ]},
    { k: 'verwaltung', label: 'Verwaltung', icon: 'fa-sliders-h', lenses: [
        { v: 'stakeholder',  l: 'Stakeholder',    i: 'fa-users' },
        { v: 'buckets',      l: 'Buckets',        i: 'fa-box-open' },
        { v: 'dependencies', l: 'Abhängigkeiten', i: 'fa-project-diagram' }
    ]},
    { k: 'zeit', label: 'Zeit', icon: 'fa-clock', lenses: [
        { v: 'time', l: 'Zeitkonto', i: 'fa-clock' }
    ]}
  ];

  /* Rückweg: welche Ansicht gehört zu welchem Ort */
  const VIEW2PLACE = {};
  PLACES.forEach(p => p.lenses.forEach(l => { VIEW2PLACE[l.v] = p.k; }));
  VIEW2PLACE.planner = 'arbeit';

  const state = { place: 'today', lastLens: {} };
  PLACES.forEach(p => { state.lastLens[p.k] = p.lenses[0].v; });

  const $ = s => document.querySelector(s);

  /* Beschriftung: eigene Namen aus den Einstellungen haben Vorrang,
     sonst die Übersetzung, sonst der Rückfallwert aus dieser Datei. */
  function lensLabel(l) {
    try {
      const v = (appData.settings.views || []).find(x => x.id === l.v);
      const def = (typeof defaultViews !== 'undefined') ? defaultViews.find(d => d.id === l.v) : null;
      if (v && def && v.name !== def.name) return v.name;
      const tr = t('view_' + l.v);
      if (tr && tr !== 'view_' + l.v) return tr;
    } catch (e) {}
    return l.l;
  }
  function placeLabel(p) {
    try { const tr = t('wk_place_' + p.k); if (tr && tr !== 'wk_place_' + p.k) return tr; } catch (e) {}
    return p.label;
  }

  /* ── Aufbau ─────────────────────────────────────────────────── */
  function build() {
    if ($('.wk-rail')) return;

    /* Schiene links (Tablet, Desktop) */
    const rail = document.createElement('nav');
    rail.className = 'wk-rail';
    rail.setAttribute('aria-label', 'Bereiche');
    rail.innerHTML =
      `<span class="wk-logo" aria-hidden="true">pm</span>` +
      PLACES.map(p => `<button class="wk-rail-item" data-wkplace="${p.k}">
          <i class="fas ${p.icon}"></i><small>${placeLabel(p)}</small></button>`).join('') +
      `<span class="wk-spacer"></span>
       <button class="wk-rail-new" id="wkRailNew" title="Neu anlegen" aria-label="Neu anlegen"><i class="fas fa-plus"></i></button>
       <button class="wk-rail-export" id="wkRailExport" title="Export & Backup" aria-label="Export & Backup"><i class="fas fa-file-export"></i></button>`;
    document.body.insertBefore(rail, document.body.firstChild);

    /* Linsenschiene unter der Kopfzeile */
    const lensrail = document.createElement('div');
    lensrail.className = 'wk-lensrail';
    lensrail.id = 'wkLensrail';
    lensrail.setAttribute('role', 'tablist');
    lensrail.setAttribute('aria-label', 'Darstellung');
    const container = $('#mainContainer');
    container.parentNode.insertBefore(lensrail, container);

    /* Tableiste unten (Telefon) */
    const tabbar = document.createElement('nav');
    tabbar.className = 'wk-tabbar';
    tabbar.setAttribute('aria-label', 'Bereiche');
    tabbar.innerHTML = PLACES.map(p => `<button class="wk-tab" data-wkplace="${p.k}">
        <span class="wk-tab-ind"></span><i class="fas ${p.icon}"></i><small>${placeLabel(p)}</small></button>`).join('');
    document.body.appendChild(tabbar);

    /* Namenskürzel in der Kopfzeile — öffnet die Einstellungen.
       Auf dem Telefon der einzige Weg dorthin, deshalb immer sichtbar. */
    const bar = document.querySelector('.topbar-actions');
    if (bar && !document.getElementById('wkUserChip')) {
      const chip = document.createElement('button');
      chip.className = 'wk-userchip';
      chip.id = 'wkUserChip';
      chip.title = 'Profil & Einstellungen';
      chip.setAttribute('aria-label', 'Profil & Einstellungen');
      chip.onclick = function () { openSettings(); };
      bar.appendChild(chip);
    }

    /* Aktionsknopf: eine kurze Auswahl zwischen Aufgabe und Stapel */
    const fabMenu = document.createElement('div');
    fabMenu.className = 'wk-fab-menu';
    fabMenu.id = 'wkFabMenu';
    fabMenu.innerHTML =
      `<button class="wk-fab-opt" data-wknew="task"><i class="fas fa-tasks"></i><span>${labelNewTask()}</span></button>
       <button class="wk-fab-opt" data-wknew="stack"><i class="fas fa-folder-plus"></i><span>${labelNewStack()}</span></button>`;
    document.body.appendChild(fabMenu);

    const fabScrim = document.createElement('div');
    fabScrim.className = 'wk-fab-scrim';
    fabScrim.id = 'wkFabScrim';
    document.body.appendChild(fabScrim);

    /* Klicks auf Orte, Linsen und den Aktionsknopf */
    document.addEventListener('click', ev => {
      const b = ev.target.closest('[data-wkplace]');
      if (b) { closeFab(); goPlace(b.dataset.wkplace); return; }
      const l = ev.target.closest('[data-wklens]');
      if (l) { switchView(l.dataset.wklens); return; }

      const fab = ev.target.closest('#wkFab, .mobile-fab, #wkRailNew');
      if (fab) { ev.preventDefault(); ev.stopPropagation(); toggleFab(); return; }
      const opt = ev.target.closest('[data-wknew]');
      if (opt) {
        closeFab();
        if (opt.dataset.wknew === 'task') openModal(); else openStackModal();
        return;
      }
      if (!ev.target.closest('#wkFabMenu')) closeFab();
    });

    /* Zieh-Rückmeldung: hebt die gezogene Karte sichtbar ab,
       ohne in die vorhandenen Drag-Handler einzugreifen. */
    document.addEventListener('dragstart', ev => {
      const card = ev.target.closest && ev.target.closest('.task-card, .draggable-item');
      if (card) card.classList.add('dragging');
    }, true);
    document.addEventListener('dragend', ev => {
      document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    }, true);

    /* Export-Menü aus der Kopfzeile ans untere Ende der Schiene versetzen */
    const exp = document.getElementById('exportDropdown');
    const railExport = document.getElementById('wkRailExport');
    if (exp && railExport) {
      const menu = exp.querySelector('.dropdown-content');
      if (menu) {
        menu.classList.add('wk-rail-menu');
        document.body.appendChild(menu);           /* aus dem Kopf lösen */
        exp.style.display = 'none';                 /* alten Auslöser verbergen */
        railExport.addEventListener('click', ev => {
          ev.stopPropagation();
          const open = menu.classList.toggle('wk-open');
          if (open) {
            const r = railExport.getBoundingClientRect();
            menu.style.left = (r.right + 8) + 'px';
            menu.style.bottom = (window.innerHeight - r.bottom) + 'px';
            menu.style.top = 'auto'; menu.style.right = 'auto';
          }
        });
        document.addEventListener('click', ev => {
          if (!ev.target.closest('.wk-rail-menu') && !ev.target.closest('#wkRailExport'))
            menu.classList.remove('wk-open');
        });
        /* nach Auswahl schliessen */
        menu.addEventListener('click', () => setTimeout(() => menu.classList.remove('wk-open'), 50));
      }
    }

    window.addEventListener('resize', moveMagnet);
  }

  function goPlace(key) {
    state.place = key;
    switchView(state.lastLens[key]);
  }

  /* ── Abgleich nach jedem Ansichtswechsel ────────────────────── */
  function sync() {
    let view = (typeof currentView !== 'undefined') ? currentView : 'kanban';
    if (view === 'planner') view = (typeof plannerSubView !== 'undefined' ? plannerSubView : 'schedule');

    const place = VIEW2PLACE[view] || state.place;
    state.place = place;
    state.lastLens[place] = view;

    document.querySelectorAll('[data-wkplace]').forEach(b => {
      const on = b.dataset.wkplace === place;
      on ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current');
    });

    const p = PLACES.find(x => x.k === place);
    const rail = $('#wkLensrail');
    if (rail && p) {
      /* Eine einzelne Linse braucht keine Schiene */
      if (p.lenses.length < 2) { rail.hidden = true; rail.innerHTML = ''; }
      else {
        rail.hidden = false;
        rail.innerHTML = `<span class="wk-magnet" id="wkMagnet"></span>` + p.lenses.map(l =>
          `<button class="wk-lens" role="tab" data-wklens="${l.v}" aria-selected="${l.v === view}">
             <i class="fas ${l.i}"></i>${lensLabel(l)}</button>`).join('');
        requestAnimationFrame(moveMagnet);
      }
    }

    /* Benutzerzeichen in Schiene und Kopfzeile spiegeln */
    const src = $('#active_user_icon');
    const initials = (() => {
      try {
        const u = (appData.users || []).find(u => u.id === appData.settings.currentUserId);
        if (u && u.name) return u.name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
      } catch (e) {}
      const txt = src ? (src.textContent || '').trim() : '';
      return txt ? txt.slice(0, 2).toUpperCase() : 'PM';
    })();
    const railU = $('#wkRailUser'); if (railU) railU.textContent = initials;
    const chipU = $('#wkUserChip'); if (chipU) chipU.textContent = initials;
  }

  function moveMagnet() {
    const rail = $('#wkLensrail'); if (!rail || rail.hidden) return;
    const act = rail.querySelector('[aria-selected="true"]'), mag = $('#wkMagnet');
    if (!act || !mag) return;
    mag.style.width = act.offsetWidth + 'px';
    mag.style.transform = 'translateX(' + (act.offsetLeft - 5) + 'px)';
  }

  /* ── Magnetstreifen einfärben ────────────────────────────────
     Die Karten selbst werden weiterhin von createTaskCard()
     gebaut. Hier wird nur nachträglich die Streifenfarbe nach
     Status gesetzt — kein Eingriff in die Zeichenlogik.       */
  const STRIP = { todo:'#B9BFB6', inProgress:'#0F5FDC', review:'#E8A317', done:'#1F9463' };

  function paintCards() {
    if (typeof appData === 'undefined' || !appData.tasks) return;
    document.querySelectorAll('.task-card[data-id]').forEach(el => {
      const task = appData.tasks.find(x => x.id === el.dataset.id);
      if (!task) return;
      const c = STRIP[task.status] || (el.classList.contains('is-completed') ? STRIP.done : STRIP.todo);
      el.style.setProperty('--card-strip', task.isPaused ? '#8A939E' : c);
    });
  }

  /* Nach jedem Neuzeichnen der Fläche nachfärben */
  function watch() {
    const c = document.getElementById('mainContainer');
    if (!c || !window.MutationObserver) return;
    let pending = null;
    new MutationObserver(() => {
      clearTimeout(pending);
      pending = setTimeout(paintCards, 30);
    }).observe(c, { childList: true, subtree: true });
  }

  /* Beschriftungen nach einem Sprachwechsel auffrischen */
  function relabel() {
    document.querySelectorAll('[data-wkplace] small').forEach(el => {
      const p = PLACES.find(x => x.k === el.closest('[data-wkplace]').dataset.wkplace);
      if (p) el.textContent = placeLabel(p);
    });
    sync();
  }

  /* ── switchView umhüllen, ohne es zu ersetzen ───────────────── */
  function hook() {
    if (typeof window.switchView !== 'function' || window.switchView.__wk) return false;
    const inner = window.switchView;
    const wrapped = function () {
      const r = inner.apply(this, arguments);
      try { sync(); } catch (e) { console.warn('[shell] sync', e); }
      return r;
    };
    wrapped.__wk = true;
    window.switchView = wrapped;

    /* Sprachwechsel: applyTranslations() zeichnet die alte Sidebar neu,
       die neue Schiene muss mitziehen. */
    if (typeof window.applyTranslations === 'function' && !window.applyTranslations.__wk) {
      const innerT = window.applyTranslations;
      const wrappedT = function () {
        const r = innerT.apply(this, arguments);
        try { relabel(); } catch (e) { console.warn('[shell] relabel', e); }
        return r;
      };
      wrappedT.__wk = true;
      window.applyTranslations = wrappedT;
    }
    return true;
  }

  function start() {
    if (!document.getElementById('mainContainer')) { setTimeout(start, 60); return; }
    build();
    hook();
    watch();
    /* Heute ist die Startseite */
    try { switchView('today'); } catch (e) {}
    sync();
    paintCards();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0));
  else setTimeout(start, 0);

  function labelNewTask() { try { const v = t('new_task'); if (v && v !== 'new_task') return v; } catch(e){} return 'Neue Aufgabe'; }
  function labelNewStack() { try { const v = t('new_stack'); if (v && v !== 'new_stack') return v; } catch(e){} return 'Neuer Stapel'; }

  function toggleFab() {
    const m = document.getElementById('wkFabMenu');
    if (!m) return;
    m.classList.contains('on') ? closeFab() : openFab();
  }
  function openFab() {
    document.getElementById('wkFabMenu').classList.add('on');
    document.getElementById('wkFabScrim').classList.add('on');
    const fab = document.querySelector('#wkFab, .mobile-fab');
    if (fab) fab.classList.add('wk-fab-open');
  }
  function closeFab() {
    const m = document.getElementById('wkFabMenu'); if (m) m.classList.remove('on');
    const sc = document.getElementById('wkFabScrim'); if (sc) sc.classList.remove('on');
    const fab = document.querySelector('#wkFab, .mobile-fab');
    if (fab) fab.classList.remove('wk-fab-open');
  }

  window.Shell = { sync, relabel, paintCards, goPlace, moveMagnet, PLACES };
})();
