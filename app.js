// --- PUSH NOTIFICATION API ---
function requestPushPermission(cb) {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
        if(cb) cb();
    } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                if(cb) cb();
            }
        });
    }
}

// --- MAIN DIALOG & GENERAL HELPER ---
function getCombinedDateTime(dateId, timeId) {
    const dVal = document.getElementById(dateId) ? document.getElementById(dateId).value : '';
    const tVal = document.getElementById(timeId) ? document.getElementById(timeId).value : '';
    let finalDate = dVal;
    if(tVal && !finalDate) finalDate = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    if(finalDate && tVal) return finalDate + 'T' + tVal;
    return finalDate || '';
}

function sendPushNotification(title, options) {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
        new Notification(title, options);
    }
}

function testPushNotification() {
    requestPushPermission(() => {
        sendPushNotification('ProMan Test', { body: 'Die Push-Benachrichtigungen funktionieren einwandfrei!' });
        showToast('Test-Benachrichtigung gesendet.', 'success');
    });
}

// --- MOBILE SWIPE-TO-DELETE GESTURES ---
let _clTouchStartX = 0;
let _clTouchCurrentX = 0;
let _activeSwipeItem = null;

document.addEventListener('touchstart', function(e) {
    if(window.innerWidth > 1089) return;
    /* Nur die kleinen Bedien-Icons vom Swipe ausnehmen (Info, Checkbox, Griff, Löschen).
       Das Titel-Textfeld NICHT ausnehmen — es füllt fast die ganze Zeile, sonst liesse sich
       gar nicht mehr wischen. Ein reiner Tap löst dank Bewegungsschwelle ohnehin kein Löschen aus. */
    if(e.target.closest('.cl-info-btn, .cl-done, .cl-drag, .cl-delete-btn, button, a, select')) {
        _activeSwipeItem = null;
        return;
    }
    const swipeTarget = e.target.closest('.cl-swipe-container');
    if(swipeTarget) {
        _clTouchStartX = e.touches[0].clientX;
        _clTouchCurrentX = _clTouchStartX;   /* WICHTIG: sonst „erbt" ein Tap den alten Wert und löst versehentlich Löschen aus */
        _activeSwipeItem = swipeTarget;
        _activeSwipeItem.style.transition = 'none';
    } else {
        document.querySelectorAll('.cl-swipe-container').forEach(el => {
            if(el.style.transform && el.style.transform !== 'translateX(0px)') {
                el.style.transition = 'transform 0.2s';
                el.style.transform = 'translateX(0px)';
            }
        });
    }
}, {passive: true});

document.addEventListener('touchmove', function(e) {
    if(!_activeSwipeItem) return;
    _clTouchCurrentX = e.touches[0].clientX;
    const diff = _clTouchCurrentX - _clTouchStartX;
    if(diff < 0) {
        _activeSwipeItem.style.transform = `translateX(${Math.max(diff, -100)}px)`;
    }
}, {passive: true});

document.addEventListener('touchend', function(e) {
    if(!_activeSwipeItem) return;
    _activeSwipeItem.style.transition = 'transform 0.2s';
    const diff = _clTouchCurrentX - _clTouchStartX;
    
    if(diff < -50) {
        _activeSwipeItem.style.transform = `translateX(-100%)`;
        const swipeEl = _activeSwipeItem;                 /* Referenz festhalten, da _activeSwipeItem gleich genullt wird */
        const item = swipeEl.closest('.checklist-item');
        setTimeout(() => {
            const delBtn = swipeEl.querySelector('.cl-delete-btn');
            if(delBtn) delBtn.click();
            else if(item) item.remove();
        }, 200);
    } else {
        _activeSwipeItem.style.transform = 'translateX(0px)';
    }
    _activeSwipeItem = null;
});

function handleModalClCheckbox(cb) {
    if(cb.checked) {
        const item = cb.closest('.checklist-item');
        const id = item.getAttribute('data-id');
        if(id && isEntityLocked(id)) {
            showToast("Punkt ist durch Abhängigkeiten gesperrt!", "warning");
            cb.checked = false;
        }
    }
}


// --- 1. STATE, DATA MODEL & INIT ---
const colors16 = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722'];

const defaultViews = [
    { id: 'today',        name: 'Heute',            icon: 'fa-sun',              hidden: true  },
    { id: 'kanban',       name: 'Kanban Board',     icon: 'fa-columns',          hidden: false },
    { id: 'stacks',       name: 'Projekt-Stacks',   icon: 'fa-folder-open',      hidden: false },
    { id: 'list',         name: 'Liste',             icon: 'fa-list',             hidden: false },
    { id: 'planner',      name: 'Planung',          icon: 'fa-calendar-alt',     hidden: false },
    { id: 'schedule',     name: 'Kalender',          icon: 'fa-calendar-alt',     hidden: true  },
    { id: 'timeline',     name: 'Gantt-Diagramm',   icon: 'fa-stream',           hidden: true  },
    { id: 'notes',        name: 'Notizen',           icon: 'fa-sticky-note',      hidden: false },
    { id: 'checklists',   name: 'Checklisten',       icon: 'fa-check-square',     hidden: false },
    { id: 'milestones',   name: 'Milestones',        icon: 'fa-flag',             hidden: false },
    { id: 'time',         name: 'Zeiterfassung',     icon: 'fa-clock',            hidden: false },
    { id: 'stakeholder',  name: 'Stakeholder',       icon: 'fa-users',            hidden: false },
    { id: 'buckets',      name: 'Buckets',           icon: 'fa-box-open',         hidden: false },
    { id: 'dependencies', name: 'Abhängigkeiten',   icon: 'fa-project-diagram',  hidden: false }
];

const sidebarGroups = [
    { id: 'main', label: 'Arbeit', collapsible: false, views: ['kanban', 'list', 'stacks', 'planner'] },
    { id: 'wissen', label: 'Ressourcen', collapsible: false, views: ['notes', 'checklists', 'time'] },
    { id: 'verwaltung', label: 'Verwaltung', collapsible: true, defaultOpen: false, views: ['stakeholder', 'buckets', 'dependencies'] }
];

let defaultData = {
    tasks: [], 
    stakeholders: [ { id: 'sh1', name: 'Design Team', color: '#ff4081' } ], 
    buckets: ['Allgemein', 'Konzept', 'Produktion', 'Marketing'],
    statuses: [ { id: 'todo', title: 'Zu erledigen' }, { id: 'inProgress', title: 'In Bearbeitung' }, { id: 'review', title: 'Prüfung' }, { id: 'done', title: 'Abgeschlossen' } ],
    defaultChecklist: ['Briefing', 'Entwurf', 'Freigabe'], 
    projectStacks: [], 
    deletedItems: [],
    customColor: '#cca300', 
    timeLogs: [],
    absences: [],
    users: [ { id: 'u1', name: 'Max Mustermann', avatar: '' } ],
    timelineMarkers: [],
    taskPresets: [],
    activityLog: [],
    stackPresets: [],
    settings: { 
        views: [...defaultViews],
        noteOrder: [],
        notifyOverdue: true, notifyDueToday: true, 
        reminders: [ { active: true, value: 2, unit: 'days' }, { active: false, value: 4, unit: 'hours' } ],
        shortcuts: { newTask: 'n', newStack: 'p', search: 'k' },
        autoDelete: { unit: 'days', value: 30 },
        trashAutoDelete: { unit: 'days', value: 30 },
        globalHideCompleted: true,
        monthlyBudget: null,
        defaultHourlyRate: null,
        currency: 'EUR',
        globalHidePaused: false,
        currentUserId: 'u1',
        companyLogo: null,
        attachmentFolder: 'C:\\ProMan_Dateien\\',
        language: 'de',
        workflows: [],
        dismissedNotifs: [],
        pushNotifications: false,
        pushSystemMessages: false,
        pushedNotifs: [],
        aiEnabled: false,
        workDays: [1, 2, 3, 4, 5],
        targetHoursPerDay: 8,
        timeTrackFrom: '',
        tlPixelsPerDay: 30,
        workDayStart: '08:00',
        workDayEnd: '17:00',
        notificationChannels: {
            overdue:   { bell: true,  toast: false, modal: false, push: false, email: false },
            dueToday:  { bell: true,  toast: false, modal: false, push: false, email: false },
            reminder1: { bell: true,  toast: false, modal: false, push: false, email: false },
            reminder2: { bell: true,  toast: false, modal: false, push: false, email: false },
            system:    { bell: false, toast: true,  modal: false, push: false, email: false }
        },
        notificationEmail: '',
        firedNotifChannels: [],
        customTheme: null
    }
};

let loadedData = JSON.parse(localStorage.getItem('proman_v2_data'));
let appData;

if(loadedData) {
    appData = loadedData;
    if(!appData.tasks) appData.tasks = [];
    if(!appData.projectStacks) appData.projectStacks = [];
    if(!appData.deletedItems) appData.deletedItems = [];
    if(!appData.stakeholders) appData.stakeholders = defaultData.stakeholders;
    if(!appData.buckets) appData.buckets = defaultData.buckets;
    if(!appData.statuses) appData.statuses = defaultData.statuses;
    if(!appData.defaultChecklist) appData.defaultChecklist = defaultData.defaultChecklist;
    if(!appData.timeLogs) appData.timeLogs = [];
    if(!appData.absences) appData.absences = [];
    if(!appData.timelineMarkers) appData.timelineMarkers = [];
    if(!appData.customColor) appData.customColor = defaultData.customColor;
    /* Einmalige Umstellung: altes Standard-Blau → Werkstatt-Gold */
    if(appData.customColor === '#0070f2') appData.customColor = '#cca300';
    if(!appData.taskPresets) appData.taskPresets = [];
    if(!appData.stackPresets) appData.stackPresets = [];
    if(!appData.activityLog) appData.activityLog = [];
    if(!appData.users || appData.users.length === 0) appData.users = defaultData.users;
    if(!appData.customBellNotifs) appData.customBellNotifs = [];
    
    if(!appData.settings) appData.settings = defaultData.settings;
    if(appData.settings.companyLogo === undefined) appData.settings.companyLogo = null;
    if(appData.settings.attachmentFolder === undefined) appData.settings.attachmentFolder = 'C:\\ProMan_Dateien\\';
    if(appData.settings.language === undefined) appData.settings.language = 'de';
    if(!appData.settings.workflows) appData.settings.workflows = [];
    if(!appData.settings.dismissedNotifs) appData.settings.dismissedNotifs = [];
    
    if(appData.settings.pushNotifications === undefined) appData.settings.pushNotifications = false;
    if(appData.settings.pushSystemMessages === undefined) appData.settings.pushSystemMessages = false;
    if(!appData.settings.pushedNotifs) appData.settings.pushedNotifs = [];
    if(appData.settings.aiEnabled === undefined) appData.settings.aiEnabled = false;
    if(!appData.settings.workDays || appData.settings.workDays.length === 0) appData.settings.workDays = [1, 2, 3, 4, 5];
    if(appData.settings.tlPixelsPerDay === undefined) appData.settings.tlPixelsPerDay = 30;
    if(appData.settings.targetHoursPerDay === undefined) appData.settings.targetHoursPerDay = 8;
    if(appData.settings.timeTrackFrom === undefined) appData.settings.timeTrackFrom = '';
    if(!appData.settings.workDayStart) appData.settings.workDayStart = '08:00';
    if(!appData.settings.workDayEnd) appData.settings.workDayEnd = '17:00';

    if(!appData.settings.notificationChannels) {
        appData.settings.notificationChannels = JSON.parse(JSON.stringify(defaultData.settings.notificationChannels));
        if(appData.settings.pushNotifications) {
            ['overdue','dueToday','reminder1','reminder2'].forEach(k => { appData.settings.notificationChannels[k].push = true; });
        }
        if(appData.settings.pushSystemMessages) { appData.settings.notificationChannels.system.push = true; }
    }
    const _defCh = defaultData.settings.notificationChannels;
    Object.keys(_defCh).forEach(evKey => {
        if(!appData.settings.notificationChannels[evKey]) appData.settings.notificationChannels[evKey] = { ..._defCh[evKey] };
        Object.keys(_defCh[evKey]).forEach(chKey => {
            if(appData.settings.notificationChannels[evKey][chKey] === undefined) appData.settings.notificationChannels[evKey][chKey] = _defCh[evKey][chKey];
        });
    });
    if(appData.settings.notificationEmail === undefined) appData.settings.notificationEmail = '';
    if(!appData.settings.firedNotifChannels) appData.settings.firedNotifChannels = [];
    if(appData.settings.customTheme === undefined) appData.settings.customTheme = null;
    
    if(!appData.settings.views || appData.settings.views.length < defaultViews.length) {
        let currentViews = appData.settings.views || [];
        defaultViews.forEach(dv => { if(!currentViews.find(cv => cv.id === dv.id)) currentViews.push(dv); });
        appData.settings.views = currentViews;
    }
    appData.settings.views.forEach(v => { if(v.hidden === undefined) v.hidden = false; });

    if(!appData.statuses.find(s => s.id === 'done')) {
        if(appData.statuses.length > 0 && appData.statuses[appData.statuses.length-1].title.toLowerCase().includes('abgeschlossen')) {
            const oldId = appData.statuses[appData.statuses.length-1].id;
            appData.statuses[appData.statuses.length-1].id = 'done';
            appData.tasks.forEach(t_obj => { if(t_obj.status === oldId) t_obj.status = 'done'; });
        } else {
            appData.statuses.push({ id: 'done', title: 'Abgeschlossen' });
        }
    }

    if(!appData.settings.noteOrder) appData.settings.noteOrder = [];
    if(!appData.settings.reminders || appData.settings.reminders.length < 2) appData.settings.reminders = defaultData.settings.reminders;
    if(!appData.settings.shortcuts) appData.settings.shortcuts = defaultData.settings.shortcuts;
    if(!appData.settings.autoDelete) appData.settings.autoDelete = defaultData.settings.autoDelete;
    if(!appData.settings.trashAutoDelete) appData.settings.trashAutoDelete = defaultData.settings.trashAutoDelete;
    if(appData.settings.globalHideCompleted === undefined) appData.settings.globalHideCompleted = defaultData.settings.globalHideCompleted;
    if(appData.settings.globalHidePaused === undefined) appData.settings.globalHidePaused = false;
    if(!appData.settings.currentUserId) appData.settings.currentUserId = appData.users[0].id;
    
    if(!appData.settings.listColumns) {
        appData.settings.listColumns = { assignee: true, stakeholder: true, bucket: false, status: true, priority: true, startDate: false, dueDate: true, recurrence: false, timeSpent: false, description: false, checklist: false, files: false, notes: false, progress: true };
    } else {
        const newCols = ['bucket', 'startDate', 'recurrence', 'timeSpent', 'description', 'checklist', 'files', 'notes'];
        newCols.forEach(col => { if(appData.settings.listColumns[col] === undefined) appData.settings.listColumns[col] = false; });
    }
} else {
    appData = defaultData;
}

// --- DEPENDENCIES (ABHÄNGIGKEITEN) TEMP STORE ---
let tempPredecessors = {};
function initTempPredecessors() {
    let modified = false;
    tempPredecessors = {};
    appData.tasks.forEach(t => {
        if(!t.predecessors) { t.predecessors = []; modified = true; }
        tempPredecessors[t.id] = [...t.predecessors];
        if(t.checklist) t.checklist.forEach(c => {
            if(!c.id) { c.id = generateId(); modified = true; }
            if(!c.predecessors) { c.predecessors = []; modified = true; }
            tempPredecessors[c.id] = [...c.predecessors];
        });
    });
    appData.projectStacks.forEach(s => {
        if(!s.predecessors) { s.predecessors = []; modified = true; }
        tempPredecessors[s.id] = [...s.predecessors];
        if(s.checklist) s.checklist.forEach(c => {
            if(!c.id) { c.id = generateId(); modified = true; }
            if(!c.predecessors) { c.predecessors = []; modified = true; }
            tempPredecessors[c.id] = [...c.predecessors];
        });
    });
    if(modified) saveToLocal(true); 
}
initTempPredecessors();

function isEntityCompleted(id) {
    let isComp = true; 
    const check = (item) => { 
        if(item.id === id) {
            if(item.projectName !== undefined) isComp = isTaskDone(item);
            else if(item.status !== undefined) isComp = item.status === 'completed';
            else isComp = item.done;
        }
    };
    appData.tasks.forEach(t => { check(t); if(t.checklist) t.checklist.forEach(check); });
    appData.projectStacks.forEach(s => { check(s); if(s.checklist) s.checklist.forEach(check); });
    return isComp;
}

function isEntityLocked(id) {
    const preds = tempPredecessors[id] || [];
    return preds.some(pId => !isEntityCompleted(pId));
}

let currentDepTargetId = null;
function openDependencyModal(targetId, targetName) {
    currentDepTargetId = targetId;
    document.getElementById('depModalTitleText').innerText = `Abhängigkeiten für: ${targetName}`;
    document.getElementById('depSearchInput').value = '';
    document.getElementById('dependencyModal').classList.add('active');
    renderDependencyList();
}

function openDependencyModalForCl(btn) {
    const item = btn.closest('.checklist-item');
    let id = item.getAttribute('data-id');
    if(!id) {
        id = generateId();
        item.setAttribute('data-id', id);
    }
    const title = item.querySelector('.cl-title').value || 'Unbenannt';
    openDependencyModal(id, title);
}

function closeDependencyModal() {
    document.getElementById('dependencyModal').classList.remove('active');
    updateDepDisplay();
    renderView(); 
}

function renderDependencyList() {
    const q = document.getElementById('depSearchInput').value.toLowerCase();
    const container = document.getElementById('depListContainer');
    let html = '';
    
    const activePreds = tempPredecessors[currentDepTargetId] || [];
    
    const renderRow = (item, type, level, flatName = '') => {
        if(item.id === currentDepTargetId) return '';
        const name = flatName || (item.name || item.projectName || item.title || 'Unbenannt');
        if(q && !name.toLowerCase().includes(q)) return ''; 
        
        let icon = type === 'stack' ? 'fa-folder' : (type === 'task' ? 'fa-tasks' : (type==='milestone' ? 'fa-flag' : 'fa-check-square'));
        const checked = activePreds.includes(item.id) ? 'checked' : '';
        const isstack = type === 'stack';
        const bg = isstack && !q ? 'var(--primary-lightest)' : 'transparent';
        const paddingLeft = q ? 10 : 10 + (level * 20);
        
        return `<label style="display:flex; align-items:center; gap:10px; padding:8px 10px 8px ${paddingLeft}px; background:${bg}; border-bottom:1px solid var(--border-color); cursor:pointer; font-size:13px;">
            <input type="checkbox" style="margin:0; width:auto; cursor:pointer;" ${checked} onchange="toggleDependency('${currentDepTargetId}', '${item.id}', this.checked)">
            <i class="fas ${icon}" style="color:var(--primary-color); width:15px; text-align:center;"></i>
            <span style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; ${isstack&&!q?'font-weight:bold;':''}">${name}</span>
        </label>`;
    };

    const fStacks = getFilteredStacks();
    const fTasks = getFilteredTasks();

    if(q) {
        fStacks.forEach(s => {
            html += renderRow(s, 'stack', 0, s.name);
            if(s.checklist) {
                let cl = s.checklist;
                if(appData.settings.globalHideCompleted) cl = cl.filter(c => !c.done);
                cl.forEach(m => html += renderRow(m, 'milestone', 0, `${s.name} > ${m.title}`));
            }
        });
        fTasks.forEach(t => {
            html += renderRow(t, 'task', 0, t.projectName);
            if(t.checklist) {
                let cl = t.checklist;
                if(appData.settings.globalHideCompleted) cl = cl.filter(c => !c.done);
                cl.forEach(c => html += renderRow(c, 'task-checklist', 0, `${t.projectName} > ${c.title}`));
            }
        });
    } else {
        fStacks.forEach(s => {
            html += renderRow(s, 'stack', 0);
            if(s.checklist) {
                let cl = s.checklist;
                if(appData.settings.globalHideCompleted) cl = cl.filter(c => !c.done);
                cl.forEach(m => html += renderRow(m, 'milestone', 1));
            }
            
            const sTasks = fTasks.filter(t => t.projectStackId === s.id);
            sTasks.forEach(t => {
                html += renderRow(t, 'task', 1);
                if(t.checklist) {
                    let cl = t.checklist;
                    if(appData.settings.globalHideCompleted) cl = cl.filter(c => !c.done);
                    cl.forEach(c => html += renderRow(c, 'task-checklist', 2));
                }
            });
        });

        const standaloneTasks = fTasks.filter(t => !t.projectStackId);
        if(standaloneTasks.length > 0) html += `<div style="padding: 10px; font-weight:bold; font-size: 11px; color:var(--text-muted); background:var(--bg-color);">EINZELAUFGABEN</div>`;
        standaloneTasks.forEach(t => {
            html += renderRow(t, 'task', 0);
            if(t.checklist) {
                let cl = t.checklist;
                if(appData.settings.globalHideCompleted) cl = cl.filter(c => !c.done);
                cl.forEach(c => html += renderRow(c, 'task-checklist', 1));
            }
        });
    }

    if(!html && q) html = '<p style="font-size:12px; color:var(--text-muted); padding:10px;">Keine passenden Elemente gefunden.</p>';
    container.innerHTML = html;
}

function toggleDependency(targetId, predId, checked) {
    if(!tempPredecessors[targetId]) tempPredecessors[targetId] = [];
    if(checked) {
        if(!tempPredecessors[targetId].includes(predId)) tempPredecessors[targetId].push(predId);
    } else {
        tempPredecessors[targetId] = tempPredecessors[targetId].filter(id => id !== predId);
    }
    
    let found = false;
    const sync = (item) => { if(item.id === targetId) { item.predecessors = [...tempPredecessors[targetId]]; found = true; } };
    appData.tasks.forEach(t => { sync(t); if(t.checklist) t.checklist.forEach(sync); });
    appData.projectStacks.forEach(s => { sync(s); if(s.checklist) s.checklist.forEach(sync); });
    
    if(found) saveToLocal(true);
    updateDepDisplay();
    
    if(document.getElementById('dependencyModal').classList.contains('active') && currentDepTargetId === targetId) {
        renderDependencyList();
    }
    
    if(currentView === 'dependencies') renderDependenciesView(document.getElementById('mainContainer'));
}

function getEntityName(id) {
    let name = 'Unbekannt';
    const check = (item, parentName) => { if(item.id === id) name = parentName ? `${parentName} > ${item.name||item.projectName||item.title}` : (item.name||item.projectName||item.title); };
    appData.tasks.forEach(t => { check(t); if(t.checklist) t.checklist.forEach(c => check(c, t.projectName)); });
    appData.projectStacks.forEach(s => { check(s); if(s.checklist) s.checklist.forEach(c => check(c, s.name)); });
    return name;
}

function updateDepDisplay() {
    const tId = document.getElementById('taskId') ? document.getElementById('taskId').value : null;
    const sId = document.getElementById('s_id') ? document.getElementById('s_id').value : null;
    
    const renderPill = (id, parentId) => `<span class="dep-badge" style="white-space:nowrap; display:inline-flex; align-items:center; max-width:100%;"><i class="fas fa-link"></i> <span style="overflow:hidden; text-overflow:ellipsis;">${getEntityName(id)}</span> <span class="del-btn" style="flex-shrink:0;" onclick="toggleDependency('${parentId}', '${id}', false); event.stopPropagation();" title="Entfernen"><i class="fas fa-times"></i></span></span>`;
    const renderClPill = (id, parentId) => `<span class="dep-badge dep-badge-cl" style="white-space:nowrap; display:inline-flex; align-items:center; max-width:100%;" title="Hängt ab von ${getEntityName(id)}"><i class="fas fa-arrow-left" style="font-size:9px; margin-right:4px; opacity:.7;"></i><span style="overflow:hidden; text-overflow:ellipsis;">${getEntityName(id)}</span> <span class="del-btn" style="flex-shrink:0;" onclick="toggleDependency('${parentId}', '${id}', false); event.stopPropagation();" title="Entfernen"><i class="fas fa-times"></i></span></span>`;
    /* Nachfolger-Pille (Anzeige am Endpunkt): „Voraussetzung für …", nicht hier löschbar */
    const renderClSuccPill = (id) => `<span class="dep-badge dep-badge-cl dep-badge-succ" style="white-space:nowrap; display:inline-flex; align-items:center; max-width:100%; opacity:.85;" title="Voraussetzung für ${getEntityName(id)}"><i class="fas fa-arrow-right" style="font-size:9px; margin-right:4px; opacity:.7;"></i><span style="overflow:hidden; text-overflow:ellipsis;">${getEntityName(id)}</span></span>`;

    if(tId && document.getElementById('t_deps_display')) {
        const preds = tempPredecessors[tId] || [];
        document.getElementById('t_deps_display').innerHTML = preds.length > 0 ? preds.map(id => renderPill(id, tId)).join('') : 'Keine Abhängigkeiten definiert.';
    }
    if(sId && document.getElementById('s_deps_display')) {
        const preds = tempPredecessors[sId] || [];
        document.getElementById('s_deps_display').innerHTML = preds.length > 0 ? preds.map(id => renderPill(id, sId)).join('') : 'Keine Abhängigkeiten definiert.';
    }

    document.querySelectorAll('.checklist-item').forEach(item => {
        const id = item.getAttribute('data-id');
        const depContainer = item.querySelector('.cl-deps-display');
        if(id && depContainer) {
            const preds = tempPredecessors[id] || [];
            /* Nachfolger: alle Punkte/Entitäten, die diesen Punkt als Vorgänger führen.
               So ist die Abhängigkeit auch am Endpunkt sichtbar, nicht nur am Ausgangspunkt. */
            const succs = Object.keys(tempPredecessors).filter(k => (tempPredecessors[k] || []).includes(id));
            let html = '';
            if (preds.length > 0) html += preds.map(pId => renderClPill(pId, id)).join('');
            if (succs.length > 0) html += succs.map(sId => renderClSuccPill(sId)).join('');
            depContainer.innerHTML = html;
        }
    });
}

let currentView = appData.settings.views.find(v => !v.hidden && v.id !== 'schedule' && v.id !== 'timeline')?.id || appData.settings.views[0].id;
let plannerSubView = 'schedule';
let timeSubView = 'tracking';
let sidebarMgmtOpen = false;
let currentTempFiles = []; 

let listSort = { key: 'dueDate', desc: false };
let clSortKey = 'none'; 
let notessortKey = 'manual'; 
let stakeholderSortKey = 'none';
let bucketSortKey = 'none';
let timelineSortKey = 'none';
let stackssortKey = 'none';

let notesListScrollPos = 0; 
let activeNoteId = null; 
let mobileNotesDetailActive = false;

let activeFilters = { stack: [], sh: [], bucket: [], status: [], users: [] };

let scheduleMode = 'week'; 
let scheduleCurrentDate = new Date();
let isCompactMode = false;

let activeTimers = JSON.parse(localStorage.getItem('proman_timers')) || {};
let lastPushCheck = 0;
setInterval(updateTimerDisplays, 1000); 

let currentRatingEntity = null; 
let currentRatings = { comm: null, time: null, qual: null, team: null, crea: null, satis: null };
let currentModalRating = { comm: null, time: null, qual: null, team: null, crea: null, satis: null };
let modalRatingChanged = false;

function getHistoryTimestamp() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: 'numeric'});
    const timeStr = now.toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'});
    return `[Note | ${dateStr}, ${timeStr}] `;
}
function handleHistoryFocus(el) { if(el.value.trim() === '') { el.value = getHistoryTimestamp(); } }
function handleHistoryKeydown(e, el) {
    if(e.key === 'Enter') {
        e.preventDefault(); const start = el.selectionStart; const end = el.selectionEnd; const ts = '\n' + getHistoryTimestamp();
        el.value = el.value.substring(0, start) + ts + el.value.substring(end); el.selectionStart = el.selectionEnd = start + ts.length;
    }
}

function formatTimeDiff(minutes) {
    if(minutes < 60) return `${minutes} Min.`;
    if(minutes < 1440) { const h = Math.floor(minutes/60); const m = minutes % 60; return `${h} Std. ${m > 0 ? m+' Min.' : ''}`; }
    return `${Math.floor(minutes/1440)} Tag(e)`;
}
function getAvatarHtml(userId, sizeCls = 'avatar-md', titleStr = '') {
    if(!userId) return ''; const u = appData.users.find(x => x.id === userId); if(!u) return '';
    const finalTitle = titleStr ? `${titleStr} (${u.name})` : u.name;
    if(u.avatar) return `<div class="avatar-wrap ${sizeCls}" title="${finalTitle}"><img src="${u.avatar}"></div>`;
    const init = u.name.substring(0,2).toUpperCase(); return `<div class="avatar-wrap ${sizeCls}" title="${finalTitle}">${init}</div>`;
}

function handleRTEBlur(el) { }

/* Erkennt eine gelbe Markierung unabhaengig von der Schreibweise des Browsers. */
function rteIsHighlightColor(v) {
    if (!v) return false;
    const c = String(v).replace(/\s+/g, '').toLowerCase();
    return c === 'yellow' || c === '#ffff00' || c === '#ff0' || c.startsWith('rgb(255,255,0') || c.startsWith('rgba(255,255,0');
}
function rteHasHighlight(el) {
    if (!el || el.nodeType !== 1) return false;
    return rteIsHighlightColor(el.style && el.style.backgroundColor) ||
           rteIsHighlightColor(el.getAttribute && el.getAttribute('bgcolor'));
}
/* Liegt das Element vollstaendig innerhalb der Auswahl? */
function rteIsFullySelected(el, range) {
    try {
        const r = document.createRange();
        r.selectNodeContents(el);
        return range.compareBoundaryPoints(Range.START_TO_START, r) <= 0 &&
               range.compareBoundaryPoints(Range.END_TO_END, r) >= 0;
    } catch (e) { return false; }
}

/*
 * Markierung an/aus.
 * queryCommandValue('backColor') liefert nur die Farbe am Anfang der Auswahl – bei einem
 * komplett markierten Absatz beginnt die Auswahl beim Block-Element ohne Hintergrund.
 * Deshalb wird der Inhalt der Auswahl im DOM geprueft. Entfernt wird primaer ueber
 * execCommand (das beherrscht Teil-Auswahlen sauber); zusaetzlich werden nur solche
 * Elemente bereinigt, die VOLLSTAENDIG in der Auswahl liegen.
 */
function toggleRTEHighlight() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;   /* ohne Auswahl nichts faerben */

    const startEl = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentNode;
    /* Achtung: isContentEditable wird vererbt und waere auch fuer innere <span> true.
       Deshalb gezielt ueber das Attribut suchen. */
    const editor = startEl && startEl.closest ? startEl.closest('[contenteditable="true"],[contenteditable=""]') : null;

    let highlighted = false;
    const toClear = [];

    /* 1) Vorfahren innerhalb des Editors (deckt "ganzer Absatz markiert" ab) */
    let n = startEl;
    while (n && n.nodeType === 1 && n !== document.body) {
        if (rteHasHighlight(n)) { highlighted = true; if (rteIsFullySelected(n, range)) toClear.push(n); }
        if (editor && n === editor) break;
        n = n.parentNode;
    }

    /* 2) Elemente innerhalb der Auswahl */
    const scope = editor || document.body;
    if (scope.querySelectorAll) {
        scope.querySelectorAll('*').forEach(el => {
            if (!rteHasHighlight(el)) return;
            let hit = false;
            try { hit = range.intersectsNode ? range.intersectsNode(el) : false; } catch (e) { hit = false; }
            if (!hit) return;
            highlighted = true;
            if (rteIsFullySelected(el, range)) toClear.push(el);
        });
    }

    /* Ohne styleWithCSS faerben Browser bei backColor ganze Block-Elemente ein
       (bgcolor-Attribut am <p>/<div>) – dadurch wurden mehrere Absaetze markiert
       statt nur der Auswahl. Mit styleWithCSS entsteht ein <span> um die Auswahl. */
    let prevStyleWithCSS = null;
    try { prevStyleWithCSS = document.queryCommandState('styleWithCSS'); } catch (e) {}
    try { document.execCommand('styleWithCSS', false, true); } catch (e) {}

    if (highlighted) {
        document.execCommand('backColor', false, 'transparent');
        /* Von frueheren Markierungen koennen ganze Bloecke eingefaerbt sein
           (bgcolor bzw. background am <p>/<div>) – die hier mit aufraeumen. */
        const blockScope = editor || document.body;
        if (blockScope.querySelectorAll) {
            blockScope.querySelectorAll('p,div,li,td,th,h1,h2,h3,h4,h5,h6').forEach(el => {
                if (!rteHasHighlight(el)) return;
                let hit = false;
                try { hit = range.intersectsNode ? range.intersectsNode(el) : false; } catch (e) { hit = false; }
                if (!hit) return;
                if (el.style) el.style.backgroundColor = '';
                if (el.getAttribute && el.getAttribute('bgcolor')) el.removeAttribute('bgcolor');
            });
        }
        toClear.forEach(el => {
            if (!el || !el.parentNode) return;
            if (el.style) el.style.backgroundColor = '';
            if (el.getAttribute && el.getAttribute('bgcolor')) el.removeAttribute('bgcolor');
            const styleAttr = el.getAttribute ? (el.getAttribute('style') || '').trim() : 'x';
            if (el.tagName === 'SPAN' && !el.getAttribute('class') && styleAttr === '') {
                const parent = el.parentNode;
                while (el.firstChild) parent.insertBefore(el.firstChild, el);
                parent.removeChild(el);
            }
        });
    } else {
        document.execCommand('backColor', false, 'yellow');
    }

    if (prevStyleWithCSS !== null) { try { document.execCommand('styleWithCSS', false, prevStyleWithCSS); } catch (e) {} }
}

function rtfTableAction(action) {
    const sel = window.getSelection(); if (!sel.rangeCount) return;
    if (action === 'create') {
        const rows = prompt("Anzahl der Zeilen:", "3"); if (!rows || isNaN(rows)) return;
        const cols = prompt("Anzahl der Spalten:", "3"); if (!cols || isNaN(cols)) return;
        let tableHtml = '<table style="width:100%; border-collapse:collapse; margin-bottom:10px;">';
        for (let r = 0; r < parseInt(rows); r++) {
            tableHtml += '<tr>';
            for (let c = 0; c < parseInt(cols); c++) {
                if (r === 0) tableHtml += '<th style="border:1px solid var(--border-color); padding:5px; background:rgba(0,0,0,0.05);">Kopfzeile</th>';
                else tableHtml += '<td style="border:1px solid var(--border-color); padding:5px;">Zelle</td>';
            }
            tableHtml += '</tr>';
        }
        tableHtml += '</table><p><br></p>'; document.execCommand('insertHTML', false, tableHtml); return;
    }

    let node = sel.anchorNode; let td = null; let tr = null; let table = null;
    while (node && node.nodeType === 1 || node && node.nodeType === 3) {
        if (node.nodeType === 1) {
            if (node.tagName === 'TD' || node.tagName === 'TH') td = node;
            if (node.tagName === 'TR') tr = node;
            if (node.tagName === 'TABLE') { table = node; break; }
        }
        node = node.parentNode;
    }

    if (!table || !tr || !td) { showToast(t('toast_error'), "error"); return; }
    const cellIndex = td.cellIndex; const rowIndex = tr.rowIndex;

    if (action === 'addRowAbove') {
        const newRow = table.insertRow(rowIndex);
        for (let i = 0; i < tr.cells.length; i++) { let newCell = newRow.insertCell(i); newCell.innerHTML = 'Zelle'; newCell.style.cssText = 'border:1px solid var(--border-color); padding:5px;'; }
    } else if (action === 'addRowBelow') {
        const newRow = table.insertRow(rowIndex + 1);
        for (let i = 0; i < tr.cells.length; i++) { let newCell = newRow.insertCell(i); newCell.innerHTML = 'Zelle'; newCell.style.cssText = 'border:1px solid var(--border-color); padding:5px;'; }
    } else if (action === 'delRow') {
        table.deleteRow(rowIndex); if (table.rows.length === 0) table.remove();
    } else if (action === 'addColLeft') {
        for (let i = 0; i < table.rows.length; i++) { let newCell = table.rows[i].insertCell(cellIndex); newCell.innerHTML = 'Zelle'; newCell.style.cssText = 'border:1px solid var(--border-color); padding:5px;'; }
    } else if (action === 'addColRight') {
        for (let i = 0; i < table.rows.length; i++) { let newCell = table.rows[i].insertCell(cellIndex + 1); newCell.innerHTML = 'Zelle'; newCell.style.cssText = 'border:1px solid var(--border-color); padding:5px;'; }
    } else if (action === 'delCol') {
        for (let i = 0; i < table.rows.length; i++) { table.rows[i].deleteCell(cellIndex); }
        if (table.rows[0].cells.length === 0) table.remove();
    } else if (action === 'toggleHeader') {
        const firstRow = table.rows[0]; const isHeader = firstRow.cells[0].tagName === 'TH';
        for (let i = 0; i < firstRow.cells.length; i++) {
            const newCell = document.createElement(isHeader ? 'td' : 'th');
            newCell.innerHTML = firstRow.cells[i].innerHTML; newCell.style.cssText = firstRow.cells[i].style.cssText;
            if(!isHeader) newCell.style.background = 'rgba(0,0,0,0.05)'; else newCell.style.background = 'transparent';
            firstRow.replaceChild(newCell, firstRow.cells[i]);
        }
    }
}

// --- MOBILE SPECIFIC MENUS & SEARCH LOGIC ---
function toggleNotifMenu(e) {
    if(window.innerWidth <= 1089) {
        e.preventDefault(); e.stopPropagation();
        const dd = document.getElementById('notifContainer');
        if(dd.style.display === 'block') { dd.style.display = 'none'; }
        else { dd.style.display = 'block'; renderNotificationDropdown(); }
    }
}

function openMobileAddMenu() { document.getElementById('mobileAddMenu').classList.add('active'); }
function closeMobileAddMenu() { document.getElementById('mobileAddMenu').classList.remove('active'); }

function openMobileMoreMenu() { document.getElementById('mobileMoreMenu').classList.add('active'); }
function closeMobileMoreMenu() { document.getElementById('mobileMoreMenu').classList.remove('active'); }

function openMobileFilterMenu() {
    const deskContent = document.getElementById('filterMenu').innerHTML;
    document.getElementById('mobileFilterContainer').innerHTML = deskContent;
    document.getElementById('mobileFilterMenu').classList.add('active');
}

/* …-Menue der Kopfzeile (Telefon/Tablet) */
function openTopMoreMenu() { const m = document.getElementById('topMoreMenu'); if (m) m.classList.add('active'); }
function closeTopMoreMenu() { const m = document.getElementById('topMoreMenu'); if (m) m.classList.remove('active'); }

function openMobileExportMenu() {
    /* Robust: über die stabile ID statt über das (durch i18n veränderbare) title-Attribut */
    const src = document.getElementById('desktopExportContent')
              || document.querySelector('.topbar .dropdown[title="Export & Backup"] .dropdown-content')
              || document.querySelector('#exportDropdown .dropdown-content');
    const container = document.getElementById('mobileExportContainer');
    if (!src || !container) { showToast('Export-Menü nicht verfügbar.', 'error'); return; }
    container.innerHTML = src.innerHTML;
    document.getElementById('mobileExportMenu').classList.add('active');
}

// --- 2. CORE, THEME & TOASTS ---
function hexToRgb(hex) {
    let c;
    if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){ c= hex.substring(1).split(''); if(c.length== 3) c= [c[0], c[0], c[1], c[1], c[2], c[2]]; c= '0x'+c.join(''); return [(c>>16)&255, (c>>8)&255, c&255].join(','); }
    return '0, 112, 242'; 
}

function toggleTheme() { 
    document.documentElement.setAttribute('data-theme', document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); 
    applyStoredThemeOnInit();
}

function changePrimaryColor(color) { 
    document.documentElement.style.setProperty('--primary-color', color); 
    /* Werkstatt-Gold nutzt den exakt gewünschten Hover-Ton */
    const hover = (color.toLowerCase() === '#cca300') ? '#856a23' : adjustColor(color, -20);
    document.documentElement.style.setProperty('--primary-hover', hover); 
    let rgb = hexToRgb(color);
    document.documentElement.style.setProperty('--primary-light', `rgba(${rgb}, 0.1)`);
    document.documentElement.style.setProperty('--primary-lightest', `rgba(${rgb}, 0.05)`);
    appData.customColor = color; 
}

function resetPrimaryColor() { const _scp = document.getElementById('settingsColorPicker'); if(_scp) _scp.value = '#cca300'; changePrimaryColor('#cca300'); saveToLocal(); }
function adjustColor(color, amount) { return '#' + color.replace(/^#/, '').replace(/../g, color => ('0'+Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)).substr(-2)); }
function generateId() { return '_' + Math.random().toString(36).substr(2, 9); }
function saveToLocal(skipRender = false) { localStorage.setItem('proman_v2_data', JSON.stringify(appData)); if(!skipRender){ renderFilterChips(); renderView(); updateNotificationsBadge(); updateActiveUserIcon(); syncMobileFilterMenu(); } }
function toggleSidebar() { document.getElementById('app-sidebar').classList.toggle('collapsed'); }

function _rawToast(msg, type='success') {
    let icon = type === 'success' ? '<i class="fas fa-check-circle" style="color:var(--success)"></i>' : (type === 'error' ? '<i class="fas fa-exclamation-circle" style="color:var(--danger)"></i>' : (type === 'warning' ? '<i class="fas fa-exclamation-triangle" style="color:var(--warning)"></i>' : '<i class="fas fa-info-circle" style="color:var(--primary-color)"></i>'));
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.innerHTML = `${icon} <span>${msg}</span>`;
    container.appendChild(toast);
    if(type === 'success') { setTimeout(() => toast.classList.add('success-flash'), 50); }
    setTimeout(() => { toast.style.animation = 'slideOut 0.35s ease-in forwards'; setTimeout(() => toast.remove(), 350); }, 3800);
}

function logActivity(icon, text) {
    if (!appData.activityLog) appData.activityLog = [];
    appData.activityLog.unshift({ icon: icon, text: text, ts: Date.now() });
    if (appData.activityLog.length > 40) appData.activityLog.length = 40;
}

function showToast(msg, type='success') {
    const sysChannels = (appData && appData.settings && appData.settings.notificationChannels && appData.settings.notificationChannels.system) || { toast: true };

    if(sysChannels.toast !== false) { _rawToast(msg, type); }
    if(sysChannels.push) { sendPushNotification('ProMan System', { body: msg }); }
    if(sysChannels.modal) { showNotifModal('ProMan', msg, type === 'error' ? 'danger' : type); }
    if(sysChannels.email && appData && appData.settings && appData.settings.notificationEmail) {
        triggerEmailNotif('ProMan Systemmeldung', msg);
    }
}

function spawnCompletionConfetti(anchorEl) {
    if(!anchorEl) return;
    const colors = ['#cca300','#10b981','#f59e0b','#a78bfa','#06b6d4','#f97316'];
    const rect = anchorEl.getBoundingClientRect();
    const count = 14;
    for(let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'confetti-particle';
        p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        p.style.width  = (6 + Math.random() * 6) + 'px';
        p.style.height = (6 + Math.random() * 6) + 'px';
        if(Math.random() > 0.5) { p.style.borderRadius = '2px'; } 
        p.style.left = (rect.left + Math.random() * rect.width) + 'px';
        p.style.top  = (rect.top  + Math.random() * (rect.height * 0.6)) + 'px';
        p.style.animationDelay    = (Math.random() * 0.18) + 's';
        p.style.animationDuration = (0.45 + Math.random() * 0.35) + 's';
        document.body.appendChild(p);
        p.addEventListener('animationend', () => p.remove());
    }
}

function moveItemInArray(arr, draggedId, targetId, insertAfter) {
    if (draggedId === targetId) return false;
    const draggedIdx = arr.findIndex(x => x.id === draggedId); if (draggedIdx === -1) return false;
    const item = arr.splice(draggedIdx, 1)[0];
    const targetIdx = arr.findIndex(x => x.id === targetId);
    if (targetIdx === -1) { arr.push(item); } else { arr.splice(targetIdx + (insertAfter ? 1 : 0), 0, item); }
    return true;
}

// --- ARBEITSTAGE & WARNUNGEN ---
function isWorkDay(dateString) {
    if(!dateString) return true; 
    const d = new Date(dateString);
    if(isNaN(d)) return true;
    const workDays = appData.settings.workDays || [1,2,3,4,5];
    return workDays.includes(d.getDay());
}

function checkWorkdayWarning(dateString, entityName) {
    if(!isWorkDay(dateString)) {
        showToast(`Warnung: "${entityName}" ist an einem arbeitsfreien Tag geplant!`, 'warning');
    }
}

// --- KEYBOARD SHORTCUTS ---
document.addEventListener('keydown', function(e) {
    const sc = appData.settings.shortcuts || { newTask: 'n', newStack: 'p', search: 'k' };
    const key = e.key.toLowerCase(); const activeEl = document.activeElement ? document.activeElement.tagName : '';
    const isContentEditable = document.activeElement.hasAttribute('contenteditable');
    const isInput = activeEl === 'INPUT' || activeEl === 'TEXTAREA' || activeEl === 'SELECT' || isContentEditable;

    if((e.ctrlKey || e.metaKey) && key === sc.search.toLowerCase()) { 
        e.preventDefault(); openSearchModal(); 
    }
    if(!isInput && !e.ctrlKey && !e.metaKey) {
        if(key === sc.newTask.toLowerCase()) { e.preventDefault(); openModal(); }
        if(key === sc.newStack.toLowerCase()) { e.preventDefault(); openStackModal(); }
    }
});

function updateShortcutUI() {
    const sc = appData.settings.shortcuts || { newTask: 'n', newStack: 'p', search: 'k' };
    const searchHint = `Strg+${sc.search.toUpperCase()}`;
    const searchInput = document.getElementById('globalSearchInput');
    if(searchInput) searchInput.placeholder = t('search') + ` (${searchHint})`;
    const taskHintEl = document.getElementById('dd_hint_newTask'); if (taskHintEl) taskHintEl.innerText = `(${sc.newTask.toUpperCase()})`;
    const stackHintEl = document.getElementById('dd_hint_newStack'); if (stackHintEl) stackHintEl.innerText = `(${sc.newStack.toUpperCase()})`;
}

// --- SIDEBAR RENDERING ---
function renderSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    let html = `<div class="logo"><button class="secondary icon-btn sidebar-toggle-btn" onclick="toggleSidebar()" style="border:none; padding:0;"><i class="fas fa-bars"></i></button><span class="logo-text">ProMan</span></div>`;

    const effectiveActive = (id) => {
        if(id === 'planner') return currentView === 'planner' || currentView === 'schedule' || currentView === 'timeline';
        return currentView === id;
    };

    const getLabel = (v) => {
        const defaultMatch = defaultViews.find(dv => dv.id === v.id);
        if(defaultMatch && v.name === defaultMatch.name) { try { return t('view_' + v.id); } catch(e) {} }
        return v.name;
    };

    sidebarGroups.forEach((group, gi) => {
        if(group.collapsible) {
            html += `<hr class="nav-divider">
            <div class="nav-section-label" onclick="toggleNavGroup('${group.id}')">
                <span class="nav-text">${group.label}</span>
                <i class="fas fa-chevron-right nav-section-arrow ${sidebarMgmtOpen ? 'open' : ''}" id="navArrow_${group.id}"></i>
            </div>`;
        } else {
            if(gi > 0) html += `<hr class="nav-divider">`;
            html += `<div class="nav-section-label"><span class="nav-text">${group.label}</span></div>`;
        }

        const itemsstyle = group.collapsible
            ? `max-height:${sidebarMgmtOpen ? '400px' : '0'}px`
            : `max-height:400px`;
        html += `<div class="nav-group-items ${group.collapsible && !sidebarMgmtOpen ? 'collapsed' : ''}" id="navGroup_${group.id}" style="${itemsstyle}">`;

        group.views.forEach(vid => {
            const v = appData.settings.views.find(sv => sv.id === vid);
            if(!v) return;
            const isActive = effectiveActive(vid) ? 'active' : '';
            const label = getLabel(v);
            html += `<div class="nav-item ${isActive}" onclick="switchView('${v.id}', this)"><i class="fas ${v.icon}"></i> <span class="nav-text">${label}</span></div>`;
        });

        html += `</div>`;
    });

    html += `<div class="nav-spacer" style="flex:1"></div><div class="nav-item" onclick="openSettings()"><i class="fas fa-cog"></i> <span class="nav-text">${t('settings')}</span></div>`;
    sidebar.innerHTML = html;
}

function toggleNavGroup(groupId) {
    if(groupId === 'verwaltung') {
        sidebarMgmtOpen = !sidebarMgmtOpen;
        const group = document.getElementById('navGroup_verwaltung');
        const arrow = document.getElementById('navArrow_verwaltung');
        if(group) {
            group.classList.toggle('collapsed', !sidebarMgmtOpen);
            group.style.maxHeight = sidebarMgmtOpen ? '400px' : '0';
        }
        if(arrow) arrow.classList.toggle('open', sidebarMgmtOpen);
    }
}

// --- NOTIFICATIONS & TRASH LOGIC ---
function getNotifications() {
    let notifs = []; const now = new Date(); const settings = appData.settings;
    if(!settings.dismissedNotifs) settings.dismissedNotifs = [];
    if(!settings.pushedNotifs) settings.pushedNotifs = [];
    if(!settings.snoozedNotifs) settings.snoozedNotifs = {};
    
    const addNotif = (nObj) => {
        if(!settings.dismissedNotifs.includes(nObj.notifId)) {
            const snoozedUntil = settings.snoozedNotifs[nObj.notifId];
            if(snoozedUntil && Date.now() < snoozedUntil) return; /* Erinnerung wurde per "In 30 Minuten erinnern" verschoben */

            const ch = (settings.notificationChannels || {})[nObj.eventKey] || { bell: true };

            if(ch.bell !== false) { notifs.push(nObj); }

            if(!settings.firedNotifChannels) settings.firedNotifChannels = [];
            if(!settings.firedNotifChannels.includes(nObj.notifId)) {
                settings.firedNotifChannels.push(nObj.notifId);

                if(ch.push) { sendPushNotification(nObj.title, { body: nObj.desc }); }
                if(ch.toast) {
                    const tType = nObj.type === 'danger' ? 'error' : (nObj.type === 'warning' ? 'warning' : 'info');
                    _rawToast(`${nObj.title}: ${nObj.desc}`, tType);
                }
                if(ch.modal) {
                    showNotifModal(nObj.title, nObj.desc, nObj.type, nObj.notifId);
                }
                if(ch.email && settings.notificationEmail) { triggerEmailNotif(nObj.title, nObj.desc); }

                saveToLocal(true);
            }
        }
    };

    const checkEntity = (item, typeName, parentName = '', parentId = null) => {
        const _nch = settings.notificationChannels || {};
        const _overdueOn  = _nch.overdue   ? Object.values(_nch.overdue).some(Boolean)  : settings.notifyOverdue;
        const _todayOn    = _nch.dueToday  ? Object.values(_nch.dueToday).some(Boolean)  : settings.notifyDueToday;
        const _rem1On     = _nch.reminder1 ? Object.values(_nch.reminder1).some(Boolean) : true;
        const _rem2On     = _nch.reminder2 ? Object.values(_nch.reminder2).some(Boolean) : true;

        if(item.dueDate) {
            let isCompleted = false;
            if(typeName === 'task') isCompleted = isTaskDone(item);
            else if(typeName === 'stack') isCompleted = (item.status === 'completed');
            else isCompleted = item.done || (item.status === 'completed');

            if(!isCompleted) {
                let dStr = item.dueDate; if(dStr.length === 10) dStr += 'T23:59:59'; 
                const d = new Date(dStr); const diffMs = d - now; const diffMins = Math.floor(diffMs / 60000);
                const itemName = item.projectName || item.name || item.title || 'Unbenannt';
                const displayTitle = parentName ? `${parentName} > ${itemName}` : itemName;
                const targetId = parentId || item.id; 

                if(_overdueOn && diffMins < 0) {
                    const nid = `overdue_${item.id}`;
                    addNotif({ type: 'danger', icon: 'fa-exclamation-triangle', title: `Überfällig: ${displayTitle}`, desc: `War fällig am ${d.toLocaleDateString('de-DE')}`, id: targetId, entity: (typeName === 'stack' || typeName === 'milestone' ? 'stack' : 'task'), notifId: nid, eventKey: 'overdue' });
                } else {
                    const issameDay = d.toDateString() === now.toDateString();
                    if(_todayOn && issameDay && diffMins >= 0) {
                        const nid = `today_${item.id}`;
                        addNotif({ type: 'warning', icon: 'fa-clock', title: `Heute fällig: ${displayTitle}`, desc: `Wird heute fällig!`, id: targetId, entity: (typeName === 'stack' || typeName === 'milestone' ? 'stack' : 'task'), notifId: nid, eventKey: 'dueToday' });
                    } 
                    
                    settings.reminders.forEach((r, idx) => {
                        if(!r.active) return;
                        const remEnabled = idx === 0 ? _rem1On : _rem2On; if(!remEnabled) return;
                        let rMins = parseInt(r.value); if(r.unit === 'hours') rMins *= 60; if(r.unit === 'days') rMins *= 1440;
                        if(diffMins >= 0 && diffMins <= rMins) {
                            const nid = `rem_${item.id}_${idx}`; const existing = notifs.find(n => n.id === targetId && n.type === 'info' && n.notifId === nid);
                            if(!existing && !(issameDay && _todayOn)) {
                                addNotif({ type: 'info', icon: 'fa-bell', title: `Erinnerung: ${displayTitle}`, desc: `Fällig in ${formatTimeDiff(diffMins)}`, id: targetId, entity: (typeName === 'stack' || typeName === 'milestone' ? 'stack' : 'task'), notifId: nid, eventKey: idx === 0 ? 'reminder1' : 'reminder2' });
                            }
                        }
                    });
                }
            }
        }

        if(item.checklist && Array.isArray(item.checklist)) {
            item.checklist.forEach(cl => {
                let clTypeName = typeName === 'task' ? 'task-checklist' : 'milestone';
                let clParentName = item.projectName || item.name || 'Unbenannt';
                let mockItem = {
                    id: cl.id,
                    dueDate: cl.dueDate,
                    title: cl.title,
                    done: cl.done
                };
                checkEntity(mockItem, clTypeName, clParentName, item.id);
            });
        }
    };

    appData.tasks.forEach(t_obj => checkEntity(t_obj, 'task'));
    appData.projectStacks.forEach(s => checkEntity(s, 'stack'));
    if(appData.timelineMarkers) { appData.timelineMarkers.forEach(m => { let fakeItem = { id: m.id, dueDate: m.date, name: m.name || 'Marker', status: 'active' }; checkEntity(fakeItem, 'marker'); }); }

    if(appData.deletedItems) {
        appData.deletedItems.forEach(item => {
            if(item.isChild) return; 
            const ad = appData.settings.trashAutoDelete; let timeLeftStr = "Bald";
            if(ad.unit !== 'never') {
                let multiplier = 1; if(ad.unit === 'hours') multiplier = 3600000; if(ad.unit === 'days') multiplier = 86400000;
                const expiresAt = item.deletedAt + (ad.value * multiplier); const msLeft = expiresAt - now.getTime();
                if(msLeft > 86400000) timeLeftStr = `Noch ${Math.ceil(msLeft/86400000)} Tag(e)`;
                else if(msLeft > 0) timeLeftStr = `Noch ${Math.ceil(msLeft/3600000)} Std.`; else timeLeftStr = "Wird gelöscht...";
            } else { timeLeftStr = "Dauerhaft im Papierkorb"; }
            const nid = `trash_${item.data.id}`;
            addNotif({ type: 'trash', icon: 'fa-trash-restore', title: `Papierkorb: ${item.type === 'stack' ? item.data.name : item.data.projectName}`, desc: `Löschen in: ${timeLeftStr}`, id: item.data.id, entity: item.type, notifId: nid, eventKey: 'trash' });
        });
    }

    if(appData.customBellNotifs) {
        appData.customBellNotifs.forEach(cn => {
            const nid = `custom_bell_${cn.id}`;
            addNotif({ type: 'info', icon: 'fa-robot', title: cn.title, desc: cn.desc, id: cn.id, entity: 'custom', notifId: nid, eventKey: 'system' });
        });
    }

    return notifs;
}

function dismissNotification(e, notifId) {
    e.stopPropagation();
    if(!appData.settings.dismissedNotifs) appData.settings.dismissedNotifs = [];
    appData.settings.dismissedNotifs.push(notifId); saveToLocal(true); renderNotificationDropdown(); updateNotificationsBadge();
}

function updateNotificationsBadge() {
    const notifs = getNotifications(); const badge = document.getElementById('notifBadge');
    if(notifs.length > 0) { badge.style.display = 'block'; badge.innerText = notifs.length > 9 ? '9+' : notifs.length; } else { badge.style.display = 'none'; }
}

function renderNotificationDropdown() {
    const notifs = getNotifications(); const container = document.getElementById('notifContainer');
    if(notifs.length > 0) {
        let html = '';
        notifs.forEach(n => {
            let color = n.type === 'danger' ? 'var(--danger)' : (n.type === 'warning' ? 'var(--warning)' : 'var(--primary-color)');
            let dismissBtn = `<button class="secondary icon-btn" style="color:var(--text-muted); padding:2px 6px; font-size:12px; margin-left:auto;" onclick="dismissNotification(event, '${n.notifId}')" title="Ausblenden"><i class="fas fa-times"></i></button>`;

            if(n.type === 'trash') {
                html += `<div class="notif-item" style="cursor:default; align-items:center;">
                    <div class="notif-icon" style="color:var(--text-muted)"><i class="fas ${n.icon}"></i></div>
                    <div class="notif-content" style="flex:1;"><h4>${n.title}</h4><p>${n.desc}</p></div>
                    <div style="display:flex; gap:5px; margin-left:10px; align-items:center;">
                        <button class="secondary icon-btn" onclick="restoreDeletedItem(event, '${n.id}')" title="Wiederherstellen"><i class="fas fa-undo"></i></button>
                        <button class="secondary icon-btn" style="color:var(--danger);" onclick="hardDeleteDeletedItem(event, '${n.id}')" title="Endgültig löschen"><i class="fas fa-trash"></i></button>
                        ${dismissBtn}
                    </div>
                </div>`;
            } else {
                let fnAttr = '';
                // NEU: Schließt das Notification-Menü bei Klick auf dem Handy
                let closeAction = "if(window.innerWidth <= 1089) document.getElementById('notifContainer').style.display='none';";
                
                if(n.entity === 'task') fnAttr = `onclick="${closeAction} openModal('${n.id}')"`;
                else if(n.entity === 'stack') fnAttr = `onclick="${closeAction} openStackModal('${n.id}')"`;
                else if(n.entity === 'custom') fnAttr = ''; 
                else fnAttr = `onclick="${closeAction} switchView('timeline')"`;

                html += `<div class="notif-item" ${fnAttr}><div class="notif-icon" style="color:${color}"><i class="fas ${n.icon}"></i></div><div class="notif-content" style="flex:1;"><h4>${n.title}</h4><p>${n.desc}</p></div>${dismissBtn}</div>`;
            }
        });
        container.innerHTML = html;
    } else {
        container.innerHTML = `<div style="padding:20px; text-align:center; font-size:13px; color:var(--text-muted);"><i class="fas fa-check-circle" style="font-size:24px; color:var(--success); margin-bottom:10px; display:block;"></i> Alles im grünen Bereich!<br>Keine anstehenden Deadlines oder Papierkorb-Elemente.</div>`;
    }
}

function restoreDeletedItem(e, id) {
    if(e) e.stopPropagation(); const index = appData.deletedItems.findIndex(i => i.data.id === id);
    if(index > -1) {
        const item = appData.deletedItems.splice(index, 1)[0];
        if(item.type === 'task') appData.tasks.push(item.data);
        if(item.type === 'stack') {
            appData.projectStacks.push(item.data);
            for(let i = appData.deletedItems.length - 1; i >= 0; i--) {
                if(appData.deletedItems[i].type === 'task' && appData.deletedItems[i].data.projectStackId === id) { appData.tasks.push(appData.deletedItems.splice(i, 1)[0].data); }
            }
        }
        saveToLocal(true); renderNotificationDropdown(); showToast('Element wiederhergestellt.'); renderView();
    }
}

function hardDeleteDeletedItem(e, id) {
    if(e) e.stopPropagation();
    appData.deletedItems = appData.deletedItems.filter(i => { if(i.data.id === id) return false; if(i.type === 'task' && i.data.projectStackId === id) return false; return true; });
    saveToLocal(true); renderNotificationDropdown(); showToast('Element endgültig gelöscht.');
}

function updateActiveUserIcon() {
    const container = document.getElementById('active_user_icon');
    if(container && appData.settings.currentUserId) { container.innerHTML = getAvatarHtml(appData.settings.currentUserId, 'avatar-md', 'Mein Profil'); }
}

// --- 3. FILTER & GLOBALE SUCHE ---
function openSearchModal() {
    document.getElementById('searchModal').classList.add('active');
    setTimeout(() => {
        document.getElementById('globalSearchInput').focus();
    }, 100);
}

function closeSearchModal() {
    document.getElementById('searchModal').classList.remove('active');
    document.getElementById('globalSearchInput').value = '';
    document.getElementById('globalSearchResults').innerHTML = '<div style="padding:40px 20px; text-align:center; color:var(--text-muted); font-size:14px;"><i class="fas fa-search" style="font-size:32px; opacity:0.3; margin-bottom:15px; display:block;"></i> Tippe, um die Suche zu starten...<br><span style="font-size:11px; opacity:0.7;">(Aufgaben, Checklisten, Notizen, Historie)</span></div>';
    if (typeof resetAISearchState === 'function') resetAISearchState();
}

function performGlobalSearch(q) {
    const container = document.getElementById('globalSearchResults');
    if (!q || q.trim().length < 2) {
        container.innerHTML = '<div style="padding:40px 20px; text-align:center; color:var(--text-muted); font-size:14px;"><i class="fas fa-search" style="font-size:32px; opacity:0.3; margin-bottom:15px; display:block;"></i> Tippe, um die Suche zu starten...<br><span style="font-size:11px; opacity:0.7;">(Aufgaben, Checklisten, Notizen, Historie)</span></div>';
        return;
    }
    
    q = q.toLowerCase().trim();
    let results = [];
    
    const highlight = (text, query) => {
        if(!text) return '';
        let plain = String(text).replace(/<[^>]*>?/gm, '');
        const idx = plain.toLowerCase().indexOf(query);
        if(idx === -1) return plain.substring(0, 80) + (plain.length > 80 ? '...' : '');
        
        const start = Math.max(0, idx - 30);
        const end = Math.min(plain.length, idx + query.length + 30);
        let excerpt = plain.substring(start, end);
        if(start > 0) excerpt = '...' + excerpt;
        if(end < plain.length) excerpt = excerpt + '...';
        
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return excerpt.replace(regex, '<mark style="background:var(--primary-color); color:white; padding:0 2px; border-radius:2px;">$1</mark>');
    };

    appData.tasks.forEach(t => {
        if ((t.projectName || '').toLowerCase().includes(q)) {
            results.push({ type: 'task', id: t.id, title: t.projectName, matchType: 'Aufgabenname', excerpt: highlight(t.projectName, q), icon: 'fa-tasks' });
        }
        if ((t.description || '').toLowerCase().includes(q)) {
            results.push({ type: 'task', id: t.id, title: t.projectName, matchType: 'Notiz', excerpt: highlight(t.description, q), icon: 'fa-sticky-note' });
        }
        if ((t.notes || '').toLowerCase().includes(q)) {
            results.push({ type: 'task', id: t.id, title: t.projectName, matchType: 'Historie', excerpt: highlight(t.notes, q), icon: 'fa-history' });
        }
        if (t.checklist) {
            t.checklist.forEach(c => {
                if ((c.title || '').toLowerCase().includes(q)) {
                    results.push({ type: 'task', id: t.id, title: t.projectName, matchType: 'Checkliste', excerpt: highlight(c.title, q), icon: 'fa-check-square' });
                }
            });
        }
    });

    appData.projectStacks.forEach(s => {
        if ((s.name || '').toLowerCase().includes(q)) {
            results.push({ type: 'stack', id: s.id, title: s.name, matchType: 'Stack-Name', excerpt: highlight(s.name, q), icon: 'fa-folder' });
        }
        if ((s.notes || '').toLowerCase().includes(q)) {
            results.push({ type: 'stack', id: s.id, title: s.name, matchType: 'Notiz', excerpt: highlight(s.notes, q), icon: 'fa-sticky-note' });
        }
        if ((s.history || '').toLowerCase().includes(q)) {
            results.push({ type: 'stack', id: s.id, title: s.name, matchType: 'Historie', excerpt: highlight(s.history, q), icon: 'fa-history' });
        }
        if (s.checklist) {
            s.checklist.forEach(c => {
                if ((c.title || '').toLowerCase().includes(q)) {
                    results.push({ type: 'stack', id: s.id, title: s.name, matchType: 'Milestone', excerpt: highlight(c.title, q), icon: 'fa-flag' });
                }
            });
        }
    });

    if (results.length === 0) {
        container.innerHTML = '<div style="padding:40px 20px; text-align:center; color:var(--text-muted); font-size:14px;">Keine Ergebnisse gefunden.</div>';
        return;
    }

    let html = '<div style="display:flex; flex-direction:column;">';
    results.forEach(r => {
        const clickFn = r.type === 'task' ? `closeSearchModal(); openModal('${r.id}')` : `closeSearchModal(); openStackModal('${r.id}')`;
        html += `<div style="padding: 12px 15px; border-bottom: 1px solid var(--border-color); cursor: pointer; transition: 0.2s;" onmouseover="this.style.backgroundColor='var(--primary-lightest)'" onmouseout="this.style.backgroundColor='transparent'" onclick="${clickFn}">
            <div style="display:flex; justify-content:space-between; margin-bottom: 6px; align-items:center;">
                <b style="font-size:14px; color:var(--text-main);"><i class="fas ${r.icon}" style="color:var(--primary-color); margin-right:6px;"></i> ${r.title}</b>
                <span style="font-size:10px; background:var(--bg-color); border:1px solid var(--border-color); padding: 2px 6px; border-radius:10px; color:var(--text-muted);">${r.matchType}</span>
            </div>
            <div style="font-size:12px; color:var(--text-muted);">${r.excerpt}</div>
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

function toggleFilterMenu(e) {
    e.stopPropagation(); const el = document.getElementById('filterMenu'); const btn = document.getElementById('mainFilterDropdown');
    if (el.style.display === 'none' || el.style.display === '') { el.style.display = 'flex'; btn.classList.add('open'); } 
    else { el.style.display = 'none'; btn.classList.remove('open'); }
}

/* …-Menue (Export & Backup) per Klick oeffnen – auf Touchgeraeten gibt es kein Hover. */
function toggleExportMenu(e) {
    e.stopPropagation();
    const dd = document.getElementById('exportDropdown');
    if (dd) dd.classList.toggle('open');
}

function closeAllMultiSelects(e) { 
    if(!e.target.closest('.ms-wrapper')) { document.querySelectorAll('.ms-dropdown').forEach(d => d.classList.remove('open')); } 
    if(!e.target.closest('#exportDropdown')) { const _ed = document.getElementById('exportDropdown'); if(_ed) _ed.classList.remove('open'); }
    if(!e.target.closest('.filter-dropdown-container') && !e.target.closest('#mobileFilterMenu')) {
        const fm = document.getElementById('filterMenu'); const btn = document.getElementById('mainFilterDropdown');
        if(fm) { fm.style.display = 'none'; } if(btn) { btn.classList.remove('open'); }
    }
    
    // BUGFIX für Mobile-Benachrichtigungen (Klicks auf Items schliessen das Menü nicht mehr vorzeitig ab)
    if(window.innerWidth <= 1089) {
        const nd = document.getElementById('notifContainer');
        if(nd && nd.style.display === 'block') {
            if(!e.target.closest('#notifContainer') && !e.target.closest('.dropdown')) {
                nd.style.display = 'none';
            }
        }
    }
}

function toggleMS(id, e) { 
    e.stopPropagation(); const el = document.getElementById(id); const isOpen = el.classList.contains('open'); 
    document.querySelectorAll('.ms-dropdown').forEach(d => d.classList.remove('open')); 
    if(!isOpen) el.classList.add('open'); 
}

function buildMSHTML(filterKey, items, valField, nameField) {
    let h = `<div class="ms-actions"><span onclick="mssetAll('${filterKey}', true, event)">Alle</span><span onclick="mssetAll('${filterKey}', false, event)">Keine</span></div>`;
    items.forEach(i => {
        let val = valField ? i[valField] : i; let name = nameField ? i[nameField] : i;
        if (filterKey === 'status' && val === 'done') name = t('col_completed');
        const checked = activeFilters[filterKey].includes(val) ? 'checked' : '';
        h += `<label class="ms-option" onclick="event.stopPropagation()"><input type="checkbox" value="${val}" ${checked} onchange="msToggleItem('${filterKey}', this.value, this.checked)"> ${name}</label>`;
    });
    return h;
}

function initFilters() {
    const baseHtml = `
        <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:bold; cursor:pointer; padding-bottom:5px;">
            <input type="checkbox" id="global_hide_comp_gen" ${appData.settings.globalHideCompleted ? 'checked' : ''} onchange="updateGlobalHideComp(this.checked)"> <span data-i18n="filter_hide_comp">${t('filter_hide_comp')}</span>
        </label>
        <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:bold; cursor:pointer; padding-bottom:10px; border-bottom:1px solid var(--border-color);">
            <input type="checkbox" id="global_hide_paused_gen" ${appData.settings.globalHidePaused ? 'checked' : ''} onchange="updateGlobalHidePaused(this.checked)"> <span data-i18n="filter_hide_paused">${t('filter_hide_paused')}</span>
        </label>
        <div style="font-size:12px; font-weight:bold; color:var(--text-muted); margin-top:5px; margin-bottom:5px;" data-i18n="filter_by">${t('filter_by')}</div>
        <div class="ms-wrapper"><div class="ms-btn" id="btn_ms_users" onclick="toggleMS('ms_users', event)"><span data-i18n="btn_users">${t('btn_users')}</span> <i class="fas fa-chevron-down"></i></div><div class="ms-dropdown" id="ms_users">${buildMSHTML('users', appData.users, 'id', 'name')}</div></div>
        <div class="ms-wrapper"><div class="ms-btn" id="btn_ms_stack" onclick="toggleMS('ms_stack', event)"><span data-i18n="btn_stacks">${t('btn_stacks')}</span> <i class="fas fa-chevron-down"></i></div><div class="ms-dropdown" id="ms_stack">${buildMSHTML('stack', appData.projectStacks, 'id', 'name')}</div></div>
        <div class="ms-wrapper"><div class="ms-btn" id="btn_ms_sh" onclick="toggleMS('ms_sh', event)"><span data-i18n="btn_sh">${t('btn_sh')}</span> <i class="fas fa-chevron-down"></i></div><div class="ms-dropdown" id="ms_sh">${buildMSHTML('sh', appData.stakeholders, 'id', 'name')}</div></div>
        <div class="ms-wrapper"><div class="ms-btn" id="btn_ms_bucket" onclick="toggleMS('ms_bucket', event)"><span data-i18n="btn_buckets">${t('btn_buckets')}</span> <i class="fas fa-chevron-down"></i></div><div class="ms-dropdown" id="ms_bucket">${buildMSHTML('bucket', appData.buckets, null, null)}</div></div>
        <div class="ms-wrapper"><div class="ms-btn" id="btn_ms_status" onclick="toggleMS('ms_status', event)"><span data-i18n="btn_status">${t('btn_status')}</span> <i class="fas fa-chevron-down"></i></div><div class="ms-dropdown" id="ms_status">${buildMSHTML('status', [...appData.statuses, { id: 'paused_state', title: t('status_paused') }], 'id', 'title')}</div></div>
    `;

    document.getElementById('desktopFilterContent').innerHTML = baseHtml;
    if(document.getElementById('mobileFilterContainer')) { document.getElementById('mobileFilterContainer').innerHTML = baseHtml.replace(/_gen/g, '_mobile_gen'); }
    
    ['users', 'stack', 'sh', 'bucket', 'status'].forEach(key => {
        document.querySelectorAll(`#btn_ms_${key}`).forEach(btn => {
            if (activeFilters[key] && activeFilters[key].length > 0) btn.classList.add('active-filter'); else btn.classList.remove('active-filter');
        });
    });
    renderFilterChips();
}

function syncMobileFilterMenu() { if(document.getElementById('mobileFilterContainer') && document.getElementById('mobileFilterContainer').innerHTML !== '') { initFilters(); } }

function updateFilterBadge() {
    const totalFilters = activeFilters.users.length + activeFilters.stack.length + activeFilters.sh.length + activeFilters.bucket.length + activeFilters.status.length;
    const _anyFilter = (totalFilters > 0 || appData.settings.globalHideCompleted || appData.settings.globalHidePaused);
    const _fb = document.getElementById('filterBadge'); if(_fb) _fb.style.display = 'none';
    const _fbtn = document.getElementById('mainFilterDropdown'); if(_fbtn) _fbtn.classList.toggle('has-active-filter', _anyFilter);
    const _fdot = document.getElementById('filterActiveDot'); if(_fdot) _fdot.style.display = _anyFilter ? 'block' : 'none';
}

function updateGlobalHideComp(isChecked) { appData.settings.globalHideCompleted = isChecked; saveToLocal(); updateFilterBadge(); }
function updateGlobalHidePaused(isChecked) { appData.settings.globalHidePaused = isChecked; saveToLocal(); updateFilterBadge(); }

function mssetAll(filterKey, checkAll, e) {
    e.stopPropagation(); let items = [];
    if(filterKey==='users') items = appData.users.map(x=>x.id);
    if(filterKey==='stack') items = appData.projectStacks.map(x=>x.id); 
    if(filterKey==='sh') items = appData.stakeholders.map(x=>x.id);
    if(filterKey==='bucket') items = appData.buckets; 
    if(filterKey==='status') items = [...appData.statuses.map(x=>x.id), 'paused_state'];
    activeFilters[filterKey] = checkAll ? items : []; saveToLocal(); initFilters(); 
}
function msToggleItem(filterKey, val, isChecked) {
    if(isChecked && !activeFilters[filterKey].includes(val)) activeFilters[filterKey].push(val);
    else if(!isChecked) activeFilters[filterKey] = activeFilters[filterKey].filter(v => v !== val);
    saveToLocal(); initFilters();
}
function removeFilter(filterKey, val) { activeFilters[filterKey] = activeFilters[filterKey].filter(v => v !== val); saveToLocal(); initFilters(); }

function renderFilterChips() {
    const container = document.getElementById('activeFilterChips'); let html = '';
    activeFilters.users.forEach(v => { const o = appData.users.find(x=>x.id===v); if(o) html+=`<div class="chip">Nutzer: ${o.name} <i class="fas fa-times" onclick="removeFilter('users', '${v}')"></i></div>`; });
    activeFilters.stack.forEach(v => { const o = appData.projectStacks.find(x=>x.id===v); if(o) html+=`<div class="chip">Stack: ${o.name} <i class="fas fa-times" onclick="removeFilter('stack', '${v}')"></i></div>`; });
    activeFilters.sh.forEach(v => { const o = appData.stakeholders.find(x=>x.id===v); if(o) html+=`<div class="chip">Stakeholder: ${o.name} <i class="fas fa-times" onclick="removeFilter('sh', '${v}')"></i></div>`; });
    activeFilters.bucket.forEach(v => { html+=`<div class="chip">Bucket: ${v} <i class="fas fa-times" onclick="removeFilter('bucket', '${v}')"></i></div>`; });
    
    activeFilters.status.forEach(v => { 
        if (v === 'paused_state') { html+=`<div class="chip">Status: ${t('status_paused')} <i class="fas fa-times" onclick="removeFilter('status', '${v}')"></i></div>`; } 
        else { const o = appData.statuses.find(x=>x.id===v); if(o) html+=`<div class="chip">Status: ${v === 'done' ? t('col_completed') : o.title} <i class="fas fa-times" onclick="removeFilter('status', '${v}')"></i></div>`; }
    });
    container.innerHTML = html;
    updateFilterBadge();
}

function getFilteredTasks() {
    const hideDone = appData.settings.globalHideCompleted; const hidePaused = appData.settings.globalHidePaused;
    return appData.tasks.filter(t_obj => {
        if(hideDone && isTaskDone(t_obj)) return false;
        if(hidePaused && t_obj.isPaused && !isTaskDone(t_obj)) return false;
        
        if(activeFilters.users.length > 0) { const matchUser = activeFilters.users.includes(t_obj.assigneeId || '') || (t_obj.checklist || []).some(c => activeFilters.users.includes(c.assigneeId || '')); if(!matchUser) return false; }
        if(activeFilters.stack.length > 0 && !activeFilters.stack.includes(t_obj.projectStackId || '')) return false;
        if(activeFilters.sh.length > 0 && !activeFilters.sh.includes(t_obj.stakeholderId || '')) return false;
        if(activeFilters.bucket.length > 0 && !activeFilters.bucket.includes(t_obj.bucket || '')) return false;
        
        if(activeFilters.status.length > 0) {
            const wantsPaused = activeFilters.status.includes('paused_state'); const normalStatuses = activeFilters.status.filter(id => id !== 'paused_state'); let match = false;
            if (wantsPaused && t_obj.isPaused) match = true;
            if (normalStatuses.includes(t_obj.status)) match = true;
            if (!match) return false;
        }

        return true;
    });
}

function kanbanPassesUserFilters(t_obj) {
    /* wie getFilteredTasks, aber OHNE den „Abgeschlossene ausblenden"-Filter,
       damit die Spalte Abgeschlossen immer gefüllt ist. */
    if(activeFilters.users.length > 0) { const matchUser = activeFilters.users.includes(t_obj.assigneeId || '') || (Array.isArray(t_obj.assigneeIds) && t_obj.assigneeIds.some(id => activeFilters.users.includes(id))); if(!matchUser) return false; }
    if(activeFilters.stack.length > 0 && !activeFilters.stack.includes(t_obj.projectStackId || '')) return false;
    if(activeFilters.sh.length > 0 && !activeFilters.sh.includes(t_obj.stakeholderId || '')) return false;
    if(activeFilters.bucket.length > 0 && !activeFilters.bucket.includes(t_obj.bucket || '')) return false;
    return true;
}

function getFilteredStacks() { 
    const hideDone = appData.settings.globalHideCompleted; const hidePaused = appData.settings.globalHidePaused;
    
    return appData.projectStacks.filter(s => { 
        if(hideDone && s.status === 'completed') return false;
        if(hidePaused && s.status === 'paused') return false;
        
        if(activeFilters.users.length > 0) { const matchUser = activeFilters.users.includes(s.assigneeId || '') || (s.checklist || []).some(c => activeFilters.users.includes(c.assigneeId || '')); if(!matchUser) return false; }
        if(activeFilters.stack.length > 0 && !activeFilters.stack.includes(s.id)) return false; 
        if(activeFilters.sh.length > 0 && !activeFilters.sh.includes(s.stakeholderId || '')) return false;
        if(activeFilters.bucket.length > 0 && !activeFilters.bucket.includes(s.bucket || '')) return false;
        
        if(activeFilters.status.length > 0) {
            const wantsPaused = activeFilters.status.includes('paused_state');
            if (wantsPaused && s.status === 'paused') { } else if (activeFilters.status.length === 1 && wantsPaused) { return false; }
        }

        return true; 
    }); 
}

// --- GLOBAL SORT HELPER ---
function applySort(arr, sortKey) {
    if(sortKey === 'none') return arr;
    return arr.sort((a,b) => {
        let objA = a.d || a; let objB = b.d || b;
        let nameA = objA.projectName || objA.name || objA.title || ''; let nameB = objB.projectName || objB.name || objB.title || '';
        
        if (sortKey === 'name') { return nameA.localeCompare(nameB); } 
        else if (sortKey === 'dueDate') {
            if(!objA.dueDate && !objB.dueDate) return 0; if(!objA.dueDate) return 1; if(!objB.dueDate) return -1;
            return new Date(objA.dueDate) - new Date(objB.dueDate);
        } else if (sortKey === 'priority') {
            const pMap = { high: 3, medium: 2, low: 1 };
            let pA = objA.priority || 'medium'; let pB = objB.priority || 'medium';
            return (pMap[pB] || 0) - (pMap[pA] || 0); 
        }
        return 0;
    });
}

function getSortButtonsHTML(currentKey, jsVarName) {
    return `<div style="display:flex; justify-content:flex-start; margin-bottom:20px; flex-wrap:wrap; gap:10px;">
        <button class="secondary ${currentKey==='none'?'active':''}" onclick="${jsVarName}='none'; renderView()"><i class="fas fa-list"></i> ${t('default')}</button>
        <button class="secondary ${currentKey==='name'?'active':''}" onclick="${jsVarName}='name'; renderView()"><i class="fas fa-sort-alpha-down"></i> ${t('name')}</button>
        <button class="secondary ${currentKey==='dueDate'?'active':''}" onclick="${jsVarName}='dueDate'; renderView()"><i class="far fa-calendar-alt"></i> ${t('due')}</button>
        <button class="secondary ${currentKey==='priority'?'active':''}" onclick="${jsVarName}='priority'; renderView()"><i class="fas fa-exclamation"></i> ${t('priority')}</button>
    </div>`;
}

// --- 4. PROGREss & RATING HELPERS ---
function isTaskDone(task) { return task.status === 'done'; }

function setTaskState(id, action) {
    if(action !== 'reopen' && isEntityLocked(id)) { showToast("Aufgabe ist durch Abhängigkeiten gesperrt!", "warning"); return; }
    const task = appData.tasks.find(t => t.id === id); if(!task) return;
    let oldStatus = task.status;

    if(action === 'pause') { task.isPaused = true; triggerWorkflows('task_paused', { task }); }
    if(action === 'resume') { task.isPaused = false; triggerWorkflows('task_resumed', { task }); }
    if(action === 'complete') {
        task.status = 'done'; task.isPaused = false;
        if(!task.completedAt) task.completedAt = Date.now();
        triggerWorkflows('task_completed', { task }); showToast(t('toast_saved')); openRatingModal('task', id);
    }
    if(action === 'reopen') { task.status = appData.statuses[0].id; delete task.completedAt; }
    if(oldStatus !== task.status) { triggerWorkflows('task_status_changed', { task, oldStatus, newStatus: task.status }); }
    { const _actMap = { complete: ['fa-check', t('act_task_done')], reopen: ['fa-rotate-left', t('act_task_reopened')], pause: ['fa-pause', t('act_task_paused')], resume: ['fa-play', t('act_task_resumed')] };
      if(_actMap[action]) logActivity(_actMap[action][0], _actMap[action][1].replace('{n}', task.projectName || '')); }

    saveToLocal();
    if(document.getElementById('taskModal').classList.contains('active')) { openModal(id); }
    renderView(); 
}

function getTaskProgress(task) {
    if(isTaskDone(task)) return 100;
    const cTotal = task.checklist && task.checklist.length > 0 ? task.checklist.length : 1;
    const cDone = task.checklist ? task.checklist.filter(c => c.done).length : 0;
    return Math.round((cDone/cTotal)*100);
}

function generateProgressBarHTML(percent, issecondary = false) {
    /* Inline-Stile, damit der Balken unabhaengig von einer evtl. veralteten Stylesheet-Version
       sichtbar ist. Fortschritt wird gruen dargestellt; bewusst OHNE color-mix,
       da nicht jede Browser-Version das unterstuetzt und der Balken sonst unsichtbar bleibt. */
    const pct = Math.max(0, Math.min(100, Math.round(parseFloat(percent) || 0)));
    const cssClass = issecondary ? 'pb-fill secondary' : 'pb-fill';
    const fillOpacity = issecondary ? '0.7' : '1';
    return `<div class="pb-container" style="width:100%; height:6px; background:var(--border-color); border-radius:4px; overflow:hidden; display:block;">`
         + `<div class="${cssClass}" style="width:${pct}%; height:100%; background:var(--success); opacity:${fillOpacity}; border-radius:4px; display:block;"></div></div>`;
}

function getStackProgress(stackId) {
    const stack = appData.projectStacks.find(s => s.id === stackId); const tasks = appData.tasks.filter(t_obj => t_obj.projectStackId === stackId);
    const mTotal = stack.checklist ? stack.checklist.length : 0; const mDone = stack.checklist ? stack.checklist.filter(c => c.done).length : 0;
    const mPct = mTotal === 0 ? 0 : Math.round((mDone / mTotal) * 100);
    let tProgressSum = 0; tasks.forEach(t_obj => tProgressSum += getTaskProgress(t_obj));
    const tPct = tasks.length === 0 ? 0 : Math.round(tProgressSum / tasks.length);
    return { mPct, tPct, tasksCount: tasks.length };
}

/* --- BUDGET-VERRECHNUNG ---
   Stundensatz-Kaskade: Checkpunkt-Satz > Aufgaben-Satz > Stack-Satz (Standard) > 0.
   Verbrauchtes Budget einer Aufgabe: Summe (Checkpunkt-Dauer in Std × wirksamer Satz) über alle Checkpunkte;
   hat die Aufgabe keine Checkliste, wird stattdessen der bisherige Aufwand (spentTime) × wirksamer Satz verwendet.
   Verbrauchtes Budget eines Stacks: Summe der verbrauchten Budgets aller zugehörigen Aufgaben. */
/* Stundensatz einer Person (aus Einstellungen → Team & Profil). */
/* Arbeitszeiten (Tagesansicht) aus den Einstellungen */
function getWorkDayStart() { return (appData.settings && appData.settings.workDayStart) ? appData.settings.workDayStart : '08:00'; }
function getWorkDayEnd()   { return (appData.settings && appData.settings.workDayEnd)   ? appData.settings.workDayEnd   : '17:00'; }
function _hhmmToMin(s) { const p = String(s || '').split(':'); return ((parseInt(p[0], 10) || 0) * 60) + (parseInt(p[1], 10) || 0); }

/*
 * Ermittelt Start/Ende eines Checklistenpunkts bzw. Milestones.
 * - Mit Uhrzeit: Start wie eingegeben, Ende = Start + Dauer.
 * - Ohne Uhrzeit: ganztägiger Termin auf Basis der Arbeitszeiten aus den Einstellungen
 *   (früher wurde hier fest 09:00 gesetzt). Ohne Dauer läuft er von Arbeitsbeginn bis Arbeitsende.
 */
function computeChecklistSchedule(sDateVal, sTimeVal, durationMin) {
    if (!sDateVal) return { startDate: '', dueDate: '', duration: durationMin || 0, allDay: false };

    const pad = n => String(n).padStart(2, '0');
    const isAllDay = !sTimeVal;
    const startTime = sTimeVal || getWorkDayStart();

    let dur = parseInt(durationMin, 10) || 0;
    if (isAllDay && dur <= 0) {
        /* Ganztägig: von Arbeitsbeginn bis Arbeitsende laut Einstellungen */
        dur = Math.max(0, _hhmmToMin(getWorkDayEnd()) - _hhmmToMin(getWorkDayStart()));
    }

    const base = new Date(sDateVal + 'T' + startTime);
    if (isNaN(base.getTime())) return { startDate: sDateVal, dueDate: '', duration: dur, allDay: isAllDay };

    const end = new Date(base.getTime() + dur * 60000);
    const fmt = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    return { startDate: sDateVal + 'T' + startTime, dueDate: fmt(end), duration: dur, allDay: isAllDay };
}

function getUserHourlyRate(userId) {
    if (!userId) return null;
    const u = appData.users.find(x => x.id === userId);
    if (!u) return null;
    if (u.hourlyRate === null || u.hourlyRate === undefined || u.hourlyRate === '') return null;
    const v = parseFloat(u.hourlyRate);
    return isNaN(v) ? null : v;
}
function getGlobalCurrency() {
    const c = appData.settings ? appData.settings.currency : null;
    return (c === 'CHF' || c === 'EUR' || c === 'USD') ? c : 'EUR';
}
function updateGlobalCurrency(val) {
    appData.settings.currency = (val === 'CHF' || val === 'EUR' || val === 'USD') ? val : 'EUR';
    saveToLocal(true);
    const tl = document.getElementById('t_currency_label'); if (tl) tl.textContent = getGlobalCurrency();
    const sl = document.getElementById('s_currency_label'); if (sl) sl.textContent = getGlobalCurrency();
    renderView();
}
function getDefaultHourlyRate() {
    const v = parseFloat(appData.settings ? appData.settings.defaultHourlyRate : null);
    return isNaN(v) ? 0 : v;
}
/*
 * Der Stundensatz richtet sich immer nach der zuständigen Person.
 * Reihenfolge: Zuständiger des Checkpunkts/Milestones → der Aufgabe → des Stacks.
 * Ist niemand zuständig (oder für die Person kein Satz hinterlegt), gilt der Standard-Lohn/h.
 */
function getEffectiveHourlyRate(checkpoint, task, stack) {
    const candidates = [
        checkpoint && checkpoint.assigneeId,
        task && task.assigneeId,
        stack && stack.assigneeId
    ];
    for (const uid of candidates) {
        const r = getUserHourlyRate(uid);
        if (r !== null) return r;
    }
    return getDefaultHourlyRate();
}
/* Tatsächlich erfasste Stunden einer Aufgabe (Zeitbuchungen; ersatzweise der Ist-Aufwand). */
function getTaskTrackedHours(task) {
    if (!task) return 0;
    const logged = (appData.timeLogs || []).filter(l => l.taskId === task.id)
        .reduce((sum, l) => sum + (parseFloat(l.hours) || 0), 0);
    if (logged > 0) return logged;
    return parseFloat(task.spentTime) || 0;
}
/*
 * Verbrauchtes Budget einer Aufgabe = tatsächlich erfasste Zeit × Stundensatz.
 * (Früher wurden bei vorhandener Checkliste die GEPLANTEN Dauern gerechnet – das
 *  hat den Verbrauch massiv überschätzt und passte nicht zur Verlaufsgrafik.)
 */
function getTaskConsumedBudget(task) {
    if (!task) return 0;
    const stack = task.projectStackId ? appData.projectStacks.find(s => s.id === task.projectStackId) : null;
    return getTaskTrackedHours(task) * getEffectiveHourlyRate(null, task, stack);
}
function getStackConsumedBudget(stack) {
    if (!stack) return 0;
    return appData.tasks.filter(t => t.projectStackId === stack.id).reduce((sum, t) => sum + getTaskConsumedBudget(t), 0);
}
/* Baut eine kleine Statuszeile mit Fortschrittsbalken für die Budget-Anzeige (Modal & Übersicht) */
function buildBudgetSummaryHtml(targetBudget, currency, consumed) {
    const target = parseFloat(targetBudget) || 0;
    if (target <= 0) return '';
    const pct = Math.round((consumed / target) * 100);
    const barColor = pct > 100 ? 'var(--danger)' : (pct >= 80 ? 'var(--warning)' : 'var(--success)');
    const remaining = target - consumed;
    return `<div style="background:var(--bg-color); border:1px solid var(--border-color); border-radius:var(--radius); padding:12px;">
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:6px;">
            <span><b>${consumed.toFixed(2)} ${currency}</b> ${t('budget_consumed')}</span>
            <span style="color:var(--text-muted);">${t('budget_target')}: ${target.toFixed(2)} ${currency}</span>
        </div>
        <div class="pb-container"><div class="pb-fill" style="width:${Math.min(pct,100)}%; background:${barColor};"></div></div>
        <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); margin-top:4px;">
            <span>${pct}% ${t('budget_used_pct')}</span>
            <span>${remaining >= 0 ? t('budget_remaining') + ': ' + remaining.toFixed(2) + ' ' + currency : t('budget_over') + ': ' + Math.abs(remaining).toFixed(2) + ' ' + currency}</span>
        </div>
    </div>`;
}

function getAvgRating(rating) {
    if(!rating) return 0; const vals = Object.values(rating).filter(v => v !== null && v !== undefined && v >= 0);
    if(vals.length === 0) return 0; return (vals.reduce((a,b)=>a+b,0) / vals.length).toFixed(1);
}

function getStaticStars(val) {
    let h = ''; if(val === null || val === undefined || val < 0) return '-';
    for(let i=1; i<=5; i++) {
        if(val >= i) h += `<i class="fas fa-star" style="color:var(--warning); font-size:12px; margin-right:2px;"></i>`;
        else if(val >= i - 0.5) h += `<i class="fas fa-star-half-alt" style="color:var(--warning); font-size:12px; margin-right:2px;"></i>`;
        else h += `<i class="far fa-star" style="color:var(--warning); font-size:12px; margin-right:2px;"></i>`;
    } 
    return h;
}

function buildRatingDisplay(rating, count = 0, skipWrapper = false) {
    if(!rating || Object.keys(rating).length === 0) return '';
    const labels = { comm: t('rate_comm'), time: t('rate_time'), qual: t('rate_qual'), team: t('rate_team'), crea: t('rate_crea'), satis: t('rate_satis') };
    let countText = count > 0 ? ` (${count} Bewertung${count>1?'en':''})` : '';
    let h = skipWrapper ? `<div class="rating-grid">` : `<div class="rating-display"><div style="font-weight:bold; margin-bottom:10px;"><i class="fas fa-star" style="color:var(--warning)"></i> Bewertung (Ø ${getAvgRating(rating)})${countText}</div><div class="rating-grid">`;
    for(let k in labels) { 
        if(rating[k] !== undefined && rating[k] !== null && rating[k] >= 0) {
            h += `<div>${labels[k]}</div><div>${getStaticStars(rating[k])}</div>`; 
        }
    }
    return h + `</div>${skipWrapper ? '' : '</div>'}`;
}

function renderInteractiveRating(containerId, entityRating) {
    const container = document.getElementById(containerId);
    if(!container) return;
    
    currentModalRating = { comm: null, time: null, qual: null, team: null, crea: null, satis: null };
    modalRatingChanged = false;

    const existingContainer = document.getElementById(containerId + '_existing');
    if (existingContainer) {
        let entity = null;
        const taskId = document.getElementById('taskId') ? document.getElementById('taskId').value : null;
        const stackId = document.getElementById('s_id') ? document.getElementById('s_id').value : null;
        
        if (containerId.startsWith('t_') && taskId) entity = appData.tasks.find(x => x.id === taskId);
        if (containerId.startsWith('s_') && stackId) entity = appData.projectStacks.find(x => x.id === stackId);

        let existingHtml = '';
        if (entity && entity.ratingCount > 0 && entity.rating) {
            let avg = getAvgRating(entity.rating);
            
            let historyHtml = '';
            if (entity.ratingHistory && entity.ratingHistory.length > 0) {
                historyHtml += `<div style="margin-top: 20px; text-align: left; border-top:1px solid var(--border-color); padding-top:15px;">
                    <div style="font-weight:bold; font-size:11px; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">Bewertungsverlauf:</div>`;
                
                entity.ratingHistory.sort((a,b) => b.date - a.date).forEach(rh => {
                    const dateStr = new Date(rh.date).toLocaleString('de-DE', {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'});
                    const avgSingle = getAvgRating(rh.values);
                    historyHtml += `<div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-color); padding:8px 12px; border-radius:4px; margin-bottom:5px; border:1px solid var(--border-color); font-size:12px;">
                        <div>
                            <span style="font-weight:bold; color:var(--text-main); margin-right:10px; min-width:45px; display:inline-block;">Ø ${avgSingle} <i class="fas fa-star" style="color:var(--warning); font-size:12px;"></i></span>
                            <span style="color:var(--text-muted);"><i class="far fa-clock"></i> ${dateStr}</span>
                        </div>
                        <button class="secondary icon-btn" style="color:var(--danger); padding:4px 6px; font-size:11px;" onclick="deleteRating('${entity.id}', '${rh.id}', '${containerId}')" title="Diese Bewertung löschen"><i class="fas fa-trash"></i></button>
                    </div>`;
                });
                historyHtml += `</div>`;
            }

            existingHtml = `<div style="margin-bottom:20px; padding-bottom:15px; border-bottom:1px dashed var(--border-color); text-align:center;">
                <div style="font-weight:bold; margin-bottom:10px; color:var(--text-muted); text-transform:uppercase; font-size:11px; letter-spacing:0.5px;">Bisherige Durchschnittsbewertung:</div>
                <div style="font-size: 42px; font-weight: bold; color: var(--warning); display:flex; align-items:center; justify-content:center; gap:10px; line-height:1;">
                    ${avg} <i class="fas fa-star" style="font-size:36px;"></i>
                </div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top:8px; margin-bottom: 20px;">Basierend auf ${entity.ratingCount} Bewertung${entity.ratingCount>1?'en':''}</div>
                <div style="text-align:left; background:var(--surface-color); padding:15px; border-radius:var(--radius); border:1px solid var(--border-color);">${buildRatingDisplay(entity.rating, 0, true)}</div>
                ${historyHtml}
            </div>`;
        }
        existingContainer.innerHTML = existingHtml;
    }

    let newHtml = `<div><div style="font-weight:bold; margin-bottom:10px;">Neue Bewertung abgeben:</div><div style="display:grid; grid-template-columns: 1fr auto; gap: 8px; align-items:center;">`;
    const labels = { comm: t('rate_comm'), time: t('rate_time'), qual: t('rate_qual'), team: t('rate_team'), crea: t('rate_crea'), satis: t('rate_satis') };
    
    for(let k in labels) {
        newHtml += `<div><label style="font-size:13px;">${labels[k]}</label></div><div style="display:flex; gap:5px; align-items:center;" id="ir_stars_${k}">`;
        newHtml += generateInteractiveStarRow(k, null, containerId);
        newHtml += `</div>`;
    }
    newHtml += `</div></div>`;

    container.innerHTML = newHtml;
}

function generateInteractiveStarRow(cat, val, containerId) {
    let html = `<i class="fas fa-ban" style="color:var(--danger); cursor:pointer; font-size:14px; margin-right:8px;" onclick="setModalRating('${containerId}', '${cat}', 0)" title="0 Sterne"></i>`;
    for(let i=1; i<=5; i++) {
        let cls = 'far fa-star';
        if(val !== null && val >= i) cls = 'fas fa-star';
        else if(val !== null && val >= i - 0.5) cls = 'fas fa-star-half-alt';
        html += `<i class="${cls}" style="cursor:pointer; color:var(--warning); font-size:18px; transition:0.2s;" onclick="setModalRating('${containerId}', '${cat}', ${i})"></i>`;
    }
    return html;
}

function setModalRating(containerId, cat, val) {
    currentModalRating[cat] = val; modalRatingChanged = true;
    document.getElementById(`ir_stars_${cat}`).innerHTML = generateInteractiveStarRow(cat, val, containerId);
}

function recalculateEntityRating(entity) {
    if(!entity.ratingHistory || entity.ratingHistory.length === 0) {
        entity.rating = {}; entity.ratingCount = 0; return;
    }
    let sums = { comm:0, time:0, qual:0, team:0, crea:0, satis:0 };
    let counts = { comm:0, time:0, qual:0, team:0, crea:0, satis:0 };

    entity.ratingHistory.forEach(rh => {
        for(let k in rh.values) {
            if(rh.values[k] !== null && rh.values[k] !== undefined && rh.values[k] >= 0) {
                sums[k] += rh.values[k]; counts[k]++;
            }
        }
    });

    let newAvg = {};
    for(let k in sums) { if(counts[k] > 0) newAvg[k] = parseFloat((sums[k] / counts[k]).toFixed(1)); }
    entity.rating = newAvg; entity.ratingCount = entity.ratingHistory.length;
}

function deleteRating(entityId, ratingId, containerId) {
    if(!confirm("Möchtest du diese Bewertung wirklich löschen?")) return;
    let entity = appData.tasks.find(t => t.id === entityId) || appData.projectStacks.find(s => s.id === entityId);
    if(!entity || !entity.ratingHistory) return;

    entity.ratingHistory = entity.ratingHistory.filter(rh => rh.id !== ratingId);
    recalculateEntityRating(entity); saveToLocal();
    renderInteractiveRating(containerId, entity.rating); renderView(); showToast("Bewertung gelöscht.");
}

function addRatingToEntity(entity, newRatingsObj) {
    if(!entity.ratingHistory) entity.ratingHistory = [];
    const cats = ['comm', 'time', 'qual', 'team', 'crea', 'satis']; let hasValues = false;
    cats.forEach(c => { if(newRatingsObj[c] !== null && newRatingsObj[c] !== undefined && newRatingsObj[c] >= 0) hasValues = true; });
    if(!hasValues) return;

    entity.ratingHistory.push({ id: generateId(), date: Date.now(), values: { ...newRatingsObj } });
    recalculateEntityRating(entity);
}

// --- 5. SETTINGS & INLINE EDITING LOGIC ---
function switchSettingsTab(tabId, btn) {
    if(!btn) btn = document.querySelector(`button[onclick*="${tabId}"]`);
    document.querySelectorAll('#settingsModal .modal-tab-btn').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('#settingsModal .modal-tab-content').forEach(el => { el.style.display = 'none'; el.classList.remove('active'); });
    if(btn) btn.classList.add('active'); 
    const target = document.getElementById(tabId);
    if(target) { 
        target.classList.add('active'); 
        target.style.display = (tabId === 'set-workflows' || tabId === 'set-theme') ? 'flex' : 'block'; 
    }
    if(tabId === 'set-theme') openThemeEditorTab();
    /* Workflow-Tab: immer in der Listenansicht betreten und neu zeichnen */
    if(tabId === 'set-workflows' && typeof renderWorkflows === 'function') { window.wfEditorActive = false; renderWorkflows(); }
}

/*
 * Normalisiert ein hochgeladenes Logo: skaliert es auf eine sinnvolle Groesse herunter
 * und wandelt es einheitlich in PNG um. Das ist noetig, weil
 *  - grosse JPGs als Base64 den localStorage sprengen (Speichern schlaegt fehl, Logo verschwindet),
 *  - die PDF-Einbettung ein einheitliches Format erwartet.
 * Transparenz bleibt erhalten, JPG-Fotos werden auf weissem Grund gerendert.
 */
function normalizeLogoDataUrl(dataUrl, isJpeg) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = function () {
            try {
                const maxW = 600, maxH = 300;
                let w = img.naturalWidth || img.width || 1;
                let h = img.naturalHeight || img.height || 1;
                const sc = Math.min(1, maxW / w, maxH / h);
                const cv = document.createElement('canvas');
                cv.width = Math.max(1, Math.round(w * sc));
                cv.height = Math.max(1, Math.round(h * sc));
                const ctx = cv.getContext('2d');
                if (isJpeg) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height); }
                ctx.drawImage(img, 0, 0, cv.width, cv.height);
                resolve(cv.toDataURL('image/png'));
            } catch (err) { resolve(dataUrl); }
        };
        img.onerror = () => reject(new Error('image decode failed'));
        img.src = dataUrl;
    });
}

function handleLogoUpload(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
        const isJpeg = /jpe?g/i.test(file.type || '') || /\.jpe?g$/i.test(file.name || '');
        normalizeLogoDataUrl(ev.target.result, isJpeg).then(function (clean) {
            appData.settings.companyLogo = clean;
            renderLogoPreview();
            if (typeof renderLogoPreviewTE === 'function') renderLogoPreviewTE();
            try { saveToLocal(); showToast(t('logo_saved')); }
            catch (err) { showToast(t('logo_too_large'), 'error'); }
        }).catch(function () { showToast(t('logo_invalid'), 'error'); });
    };
    reader.readAsDataURL(file);
    e.target.value = '';   /* gleiche Datei erneut waehlbar */
}

function renderLogoPreview() {
    const container = document.getElementById('logo_preview_container');
    if (!container) return;                     /* Bereich (noch) nicht im DOM */
    if (appData.settings.companyLogo) {
        container.innerHTML = `<img src="${appData.settings.companyLogo}" style="max-height:60px; max-width:200px; border:1px solid var(--border-color); border-radius:4px; display:block;"><button class="secondary icon-btn" style="color:var(--danger); margin-top:5px;" onclick="appData.settings.companyLogo=null; renderLogoPreview(); saveToLocal();"><i class="fas fa-trash"></i> ${t('delete')}</button>`;
    } else {
        container.innerHTML = `<span style="font-size:11px; color:var(--text-muted);">${t('no_file_chosen')}</span>`;
    }
}

function openSettings() { 
    document.getElementById('settingsModal').classList.add('active'); 
    const _scp = document.getElementById('settingsColorPicker'); 
    if(_scp) _scp.value = appData.customColor; 
    
    renderLogoPreview();
    document.getElementById('set_attachment_folder').value = appData.settings.attachmentFolder || 'C:\\ProMan_Dateien\\';
    document.getElementById('set_language').value = appData.settings.language || 'de';

    const _ch = appData.settings.notificationChannels || {};
    ['overdue','dueToday','reminder1','reminder2','system'].forEach(ev => {
        ['bell','toast','modal','push','email'].forEach(ch => {
            const el = document.getElementById(`nc_${ev}_${ch}`);
            if(el) el.checked = (_ch[ev] && _ch[ev][ch]) === true;
        });
    });
    document.getElementById('set_notif_email').value = appData.settings.notificationEmail || '';
    
    const _rem = appData.settings.reminders || [{active:false,value:1,unit:'days'},{active:false,value:1,unit:'days'}];
    if(_rem[0]){ document.getElementById('set_r1_active').checked = _rem[0].active; document.getElementById('set_r1_val').value = _rem[0].value; document.getElementById('set_r1_unit').value = _rem[0].unit; }
    if(_rem[1]){ document.getElementById('set_r2_active').checked = _rem[1].active; document.getElementById('set_r2_val').value = _rem[1].value; document.getElementById('set_r2_unit').value = _rem[1].unit; }

    const _sc = appData.settings.shortcuts || { newTask:'t', newStack:'s', search:'k' };
    document.getElementById('set_sc_newTask').value = (_sc.newTask || 't').toUpperCase();
    document.getElementById('set_sc_newStack').value = (_sc.newStack || 's').toUpperCase();
    document.getElementById('set_sc_search').value = (_sc.search || 'k').toUpperCase();

    const adComp = appData.settings.autoDelete || { unit:'never', value:30 };
    document.getElementById('set_ad_comp_unit').value = adComp.unit;
    document.getElementById('set_ad_comp_val').value = adComp.value;
    document.getElementById('set_ad_comp_val').style.display = adComp.unit === 'never' ? 'none' : 'block';

    const adTrash = appData.settings.trashAutoDelete || { unit:'never', value:30 };
    document.getElementById('set_ad_trash_unit').value = adTrash.unit;
    document.getElementById('set_ad_trash_val').value = adTrash.value;
    document.getElementById('set_ad_trash_val').style.display = adTrash.unit === 'never' ? 'none' : 'block';
    
    const wDays = appData.settings.workDays || [1, 2, 3, 4, 5];
    document.querySelectorAll('.workday-cb').forEach(cb => { cb.checked = wDays.includes(parseInt(cb.value)); });
    
    document.getElementById('set_wd_start').value = appData.settings.workDayStart || '08:00';
    document.getElementById('set_wd_end').value = appData.settings.workDayEnd || '17:00';

    const _thEl = document.getElementById('set_target_hours');
    if(_thEl) _thEl.value = appData.settings.targetHoursPerDay !== undefined ? appData.settings.targetHoursPerDay : 8;
    const _tfEl = document.getElementById('set_track_from');
    if(_tfEl) _tfEl.value = appData.settings.timeTrackFrom || '';

    const activeTabBtn = document.querySelector('#settingsModal .modal-tab-btn.active') || document.querySelector('#settingsModal .modal-tab-btn');
    if(activeTabBtn){ const oc = activeTabBtn.getAttribute('onclick') || ''; const tabIdMatch = oc.match(/'([^']+)'/); if(tabIdMatch) switchSettingsTab(tabIdMatch[1], activeTabBtn); }
    
    /* Workflow-Bereich immer frisch in der Listenansicht öffnen */
    window.wfEditorActive = false;
    renderSettings(); renderWorkflows();
}

function closeSettings() { 
    document.getElementById('settingsModal').classList.remove('active'); 
    
    appData.settings.attachmentFolder = document.getElementById('set_attachment_folder').value.trim();
    const newLang = document.getElementById('set_language').value;
    let langChanged = false;
    if(appData.settings.language !== newLang) { appData.settings.language = newLang; langChanged = true; }

    if(!appData.settings.notificationChannels) appData.settings.notificationChannels = {};
    ['overdue','dueToday','reminder1','reminder2','system'].forEach(ev => {
        if(!appData.settings.notificationChannels[ev]) appData.settings.notificationChannels[ev] = {};
        ['bell','toast','modal','push','email'].forEach(ch => {
            const el = document.getElementById(`nc_${ev}_${ch}`);
            appData.settings.notificationChannels[ev][ch] = el ? el.checked : false;
        });
    });
    appData.settings.notificationEmail = (document.getElementById('set_notif_email').value || '').trim();

    const anyPushEnabled = ['overdue','dueToday','reminder1','reminder2','system'].some(ev => appData.settings.notificationChannels[ev] && appData.settings.notificationChannels[ev].push);
    if(anyPushEnabled) requestPushPermission();

    appData.settings.notifyOverdue   = appData.settings.notificationChannels.overdue.bell;
    appData.settings.notifyDueToday  = appData.settings.notificationChannels.dueToday.bell;
    appData.settings.pushNotifications  = ['overdue','dueToday','reminder1','reminder2'].some(ev => appData.settings.notificationChannels[ev].push);
    appData.settings.pushSystemMessages = appData.settings.notificationChannels.system.push;
    
    let wDays = [];
    document.querySelectorAll('.workday-cb').forEach(cb => { if(cb.checked) wDays.push(parseInt(cb.value)); });
    if(wDays.length === 0) wDays = [1, 2, 3, 4, 5]; 
    appData.settings.workDays = wDays;
    
    appData.settings.workDayStart = document.getElementById('set_wd_start').value || '08:00';
    appData.settings.workDayEnd = document.getElementById('set_wd_end').value || '17:00';

    const _thSave = document.getElementById('set_target_hours');
    if(_thSave) { const _thVal = parseFloat(_thSave.value); appData.settings.targetHoursPerDay = (isNaN(_thVal) || _thVal <= 0) ? 8 : _thVal; }
    const _tfSave = document.getElementById('set_track_from');
    if(_tfSave) appData.settings.timeTrackFrom = _tfSave.value || '';
    
    appData.settings.reminders[0] = { active: document.getElementById('set_r1_active').checked, value: document.getElementById('set_r1_val').value, unit: document.getElementById('set_r1_unit').value };
    appData.settings.reminders[1] = { active: document.getElementById('set_r2_active').checked, value: document.getElementById('set_r2_val').value, unit: document.getElementById('set_r2_unit').value };

    appData.settings.shortcuts.newTask = document.getElementById('set_sc_newTask').value.toLowerCase() || 'n';
    appData.settings.shortcuts.newStack = document.getElementById('set_sc_newStack').value.toLowerCase() || 'p';
    appData.settings.shortcuts.search = document.getElementById('set_sc_search').value.toLowerCase() || 'k';

    appData.settings.autoDelete = { unit: document.getElementById('set_ad_comp_unit').value, value: parseInt(document.getElementById('set_ad_comp_val').value) || 30 };
    appData.settings.trashAutoDelete = { unit: document.getElementById('set_ad_trash_unit').value, value: parseInt(document.getElementById('set_ad_trash_val').value) || 30 };

    saveToLocal(); updateShortcutUI(); renderSidebar(); 
    if(langChanged) { applyTranslations(); renderView(); showToast(t('toast_saved')); } else { renderView(); showToast(t('toast_saved')); }
}

function moveViewConfig(index, dir) {
    const arr = appData.settings.views;
    if (index + dir >= 0 && index + dir < arr.length) {
        const temp = arr[index]; arr[index] = arr[index + dir]; arr[index + dir] = temp; renderSettings();
    }
}
function toggleViewVisibility(id, isHidden) { const v = appData.settings.views.find(x => x.id === id); if(v) { v.hidden = isHidden; saveToLocal(); renderSettings(); } }

function editSetting(el, type, idOrOldName) {
    if(el.querySelector('input')) return; const oldText = el.innerText;
    el.innerHTML = `<input type="text" value="${oldText}" style="width:100%; padding:4px; margin:0; height:auto;" onblur="saveInlineSetting(this, '${type}', '${idOrOldName}', '${oldText}')" onkeypress="if(event.key==='Enter') this.blur()">`;
    el.querySelector('input').focus();
}
function saveInlineSetting(input, type, id, oldText) {
    const newVal = input.value.trim();
    if(!newVal || newVal === oldText) { renderSettings(); return; }
    if(type === 'status') { appData.statuses.find(s=>s.id===id).title = newVal; }
    if(type === 'sh') { appData.stakeholders.find(s=>s.id===id).name = newVal; }
    if(type === 'user') { appData.users.find(s=>s.id===id).name = newVal; }
    if(type === 'view') { appData.settings.views.find(v=>v.id===id).name = newVal; }
    if(type === 'bucket') {
        const idx = appData.buckets.indexOf(oldText); if(idx > -1) appData.buckets[idx] = newVal;
        appData.tasks.forEach(t_obj => { if(t_obj.bucket === oldText) t_obj.bucket = newVal; });
        appData.projectStacks.forEach(s => { if(s.bucket === oldText) s.bucket = newVal; });
        if(activeFilters.bucket.includes(oldText)) { activeFilters.bucket = activeFilters.bucket.filter(v => v !== oldText); activeFilters.bucket.push(newVal); }
    }
    if(type === 'defcl') { appData.defaultChecklist[id] = newVal; }
    saveToLocal(); renderSettings(); showToast(t('toast_saved'));
}
function updateShColor(id, color) { const sh = appData.stakeholders.find(s => s.id === id); if(sh) { sh.color = color; saveToLocal(); } }
function updateUserAvatar(id, val) { const u = appData.users.find(s => s.id === id); if(u) { u.avatar = val; saveToLocal(); renderSettings(); } }
function changeCurrentUser(id) { appData.settings.currentUserId = id; saveToLocal(); showToast(t('toast_saved')); }

function renderSettings() {
    let vHtml = `<tr><th width="40">Anzeigen</th><th>Name in Sidebar</th><th width="100">Anordnung</th></tr>`;
    const settingsViews = appData.settings.views.filter(v => v.id !== 'schedule' && v.id !== 'timeline');
    settingsViews.forEach((v, i) => {
        const isChecked = !v.hidden ? 'checked' : '';
        let viewName = v.name; const defaultMatch = defaultViews.find(dv => dv.id === v.id);
        if (defaultMatch && v.name === defaultMatch.name) viewName = t('view_' + v.id);
        
        vHtml += `<tr>
            <td style="text-align:center;"><input type="checkbox" ${isChecked} onchange="toggleViewVisibility('${v.id}', !this.checked)" style="margin:0; cursor:pointer;"></td>
            <td style="${v.hidden ? 'opacity:0.5;' : ''}" data-label="Sidebar-Name"><i class="fas ${v.icon}" style="margin-right:8px; color:var(--text-muted)"></i> <span class="editable-cell" ondblclick="editSetting(this, 'view', '${v.id}')" title="Doppelklick zum Umbenennen">${viewName}</span></td>
            <td data-label="Reihenfolge">
                <button class="secondary icon-btn" onclick="moveViewConfig(${i}, -1)"><i class="fas fa-arrow-up"></i></button>
                <button class="secondary icon-btn" onclick="moveViewConfig(${i}, 1)"><i class="fas fa-arrow-down"></i></button>
            </td>
        </tr>`;
    });
    document.getElementById('settings_views_table').innerHTML = vHtml;

    // drag-and-drop Version der Status Spalten-Tabelle
    let stHtml = `<tr><th width="30"></th><th>${t('title')}</th><th width="50">${t('color')}</th><th width="60">${t('action')}</th></tr>`;
    appData.statuses.forEach((s, i) => { 
        const isDoneCol = s.id === 'done';
        const titleStr = isDoneCol ? t('col_completed') + ' (System)' : s.title;
        const editStr = isDoneCol ? `<span style="opacity:0.6">${titleStr}</span>` : `<span class="editable-cell" ondblclick="editSetting(this, 'status', '${s.id}')" title="Doppelklick zum Bearbeiten">${s.title}</span>`;
        const delBtn = isDoneCol ? '' : `<button class="secondary icon-btn" style="color:var(--danger); margin-left:auto;" onclick="deleteStatus('${s.id}')"><i class="fas fa-trash"></i></button>`;
        const colorCell = `<input type="color" value="${getStatusColor(s)}" onchange="updateStatusColor('${s.id}', this.value)" style="width:40px; height:30px; padding:0; cursor:pointer;" title="Farbe der Spalte">`;
        
        stHtml += `<tr class="draggable-item" draggable="true" ondragstart="event.dataTransfer.setData('text/plain', '${i}'); event.dataTransfer.setData('type', 'settings-status');" ondragover="handleCardDragOver(event, this, false)" ondragleave="handleCardDragLeave(this)" ondrop="handleSettingsStatusDrop(event, this, ${i})">
            <td data-label="Drag" style="vertical-align: middle; padding-left:10px;"><i class="fas fa-grip-vertical" style="color:var(--text-muted); cursor:grab;"></i></td>
            <td data-label="Titel" style="vertical-align: middle;">${editStr}</td>
            <td data-label="Farbe" style="vertical-align: middle;">${colorCell}</td>
            <td data-label="Aktion" style="flex-direction:row; vertical-align: middle;">${delBtn}</td>
        </tr>`; 
    });
    document.getElementById('settings_status_table').innerHTML = stHtml;
    
    let shHtml = `<tr><th>${t('name')}</th><th width="60">${t('color')}</th><th width="60">${t('action')}</th></tr>`;
    appData.stakeholders.forEach(sh => {
        shHtml += `<tr><td data-label="Name"><span class="editable-cell" ondblclick="editSetting(this, 'sh', '${sh.id}')">${sh.name}</span></td><td data-label="Farbe"><input type="color" value="${sh.color}" onchange="updateShColor('${sh.id}', this.value)" style="width:40px; height:30px; padding:0; cursor:pointer;"></td><td data-label="Aktion" style="flex-direction:row;"><button class="secondary icon-btn" style="color:var(--danger); margin-left:auto;" onclick="deleteStakeholder('${sh.id}')"><i class="fas fa-trash"></i></button></td></tr>`;
    });
    document.getElementById('settings_sh_table').innerHTML = shHtml;

    let paletteHtml = ''; colors16.forEach(c => { paletteHtml += `<div class="color-swatch" style="background:${c}" onclick="selectShColor(this, '${c}')"></div>`; });
    document.getElementById('sh_color_palette').innerHTML = paletteHtml;
    
    let bHtml = ''; appData.buckets.forEach((b, _bi) => { const _bc = getBucketColor(b); bHtml += `<span class="badge" style="display:inline-flex; align-items:center; gap:8px; background:var(--border-color); color:var(--text-main); font-size:13px; font-weight:normal; padding:6px 10px;"><input type="color" value="${_bc}" title="Farbe für ${b}" onchange="setBucketColor('${b.replace(/'/g,"\\'")}', this.value)" style="width:22px; height:22px; padding:0; border:1px solid var(--border-color); border-radius:5px; cursor:pointer; background:transparent;"><span class="editable-cell" ondblclick="editSetting(this, 'bucket', '${b}')">${b}</span> <i class="fas fa-times" style="margin-left:4px; cursor:pointer; color:var(--danger);" onclick="deleteBucket('${b}')"></i></span>`; });
    document.getElementById('settings_bucket_list').innerHTML = bHtml;

    const clContainer = document.getElementById('settings_def_cl_table');
    if(clContainer) {
        let clHtml = `<tr><th width="30"></th><th>Name</th><th width="60">Aktion</th></tr>`;
        appData.defaultChecklist.forEach((item, i) => {
            const editStr = `<span class="editable-cell" ondblclick="editSetting(this, 'defcl', '${i}')" title="Doppelklick zum Bearbeiten">${item}</span>`;
            const delBtn = `<button class="secondary icon-btn" style="color:var(--danger); margin-left:auto;" onclick="deleteDefCl(${i})"><i class="fas fa-trash"></i></button>`;
            
            clHtml += `<tr class="draggable-item" draggable="true" ondragstart="event.dataTransfer.setData('text/plain', '${i}'); event.dataTransfer.setData('type', 'settings-defcl');" ondragover="handleCardDragOver(event, this, false)" ondragleave="handleCardDragLeave(this)" ondrop="handleSettingsDefClDrop(event, this, ${i})">
                <td data-label="Drag" style="vertical-align: middle; padding-left:10px;"><i class="fas fa-grip-vertical" style="color:var(--text-muted); cursor:grab;"></i></td>
                <td data-label="Name" style="vertical-align: middle;">${editStr}</td>
                <td data-label="Aktion" style="flex-direction:row; vertical-align: middle;">${delBtn}</td>
            </tr>`;
        });
        clContainer.innerHTML = clHtml;
    }

    let usrHtml = `<tr><th width="40">${t('image')}</th><th>${t('name')}</th><th>${t('avatar_url')}</th><th width="110">${t('hourly_rate_short')}</th><th width="60">${t('action')}</th></tr>`;
    appData.users.forEach(u => {
        const rate = (u.hourlyRate !== undefined && u.hourlyRate !== null && u.hourlyRate !== '') ? u.hourlyRate : '';
        usrHtml += `<tr><td data-label="Bild">${getAvatarHtml(u.id)}</td><td data-label="Name"><span class="editable-cell" ondblclick="editSetting(this, 'user', '${u.id}')">${u.name}</span></td>
            <td data-label="URL"><input type="text" value="${u.avatar}" onchange="updateUserAvatar('${u.id}', this.value)" style="margin:0; padding:4px; font-size:11px; width:100%;"></td>
            <td data-label="${t('hourly_rate_short')}"><input type="number" min="0" step="0.5" value="${rate}" placeholder="0.00" onchange="updateUserHourlyRate('${u.id}', this.value)" style="margin:0; padding:4px; font-size:11px; width:100%; text-align:right;"></td>
            <td data-label="Aktion" style="flex-direction:row;">${u.id !== appData.settings.currentUserId ? `<button class="secondary icon-btn" style="color:var(--danger); margin-left:auto;" onclick="deleteUser('${u.id}')"><i class="fas fa-trash"></i></button>` : ''}</td></tr>`;
    });
    document.getElementById('settings_users_table').innerHTML = usrHtml;

    const dhr = document.getElementById('set_default_hourly_rate');
    if (dhr) dhr.value = (appData.settings.defaultHourlyRate !== undefined && appData.settings.defaultHourlyRate !== null) ? appData.settings.defaultHourlyRate : '';

    const curSel = document.getElementById('set_currency');
    if (curSel) curSel.value = getGlobalCurrency();

    let curOpts = ''; appData.users.forEach(u => { curOpts += `<option value="${u.id}" ${u.id===appData.settings.currentUserId?'selected':''}>${u.name}</option>`; });
    document.getElementById('set_current_user').innerHTML = curOpts;
}

function getStatusColor(s) {
    if (s && s.color) return s.color;
    if (s && s.id === 'done') return '#1F9463';
    return '#333B44';
}
function updateStatusColor(id, color) {
    const s = appData.statuses.find(x => x.id === id);
    if (s) { s.color = color; saveToLocal(true); renderView(); }
}

function addStatus() { const n = document.getElementById('new_status_name').value.trim(); if(n) { appData.statuses.push({ id: generateId(), title: n }); document.getElementById('new_status_name').value = ''; renderSettings(); } }
function moveStatus(i, dir) { if(i+dir>=0 && i+dir<appData.statuses.length) { const t_obj = appData.statuses[i]; appData.statuses[i] = appData.statuses[i+dir]; appData.statuses[i+dir] = t_obj; renderSettings(); } }
function deleteStatus(id) { if(id === 'done') return showToast('Diese Systemspalte kann nicht gelöscht werden.', 'error'); appData.statuses = appData.statuses.filter(s => s.id !== id); renderSettings(); }
function selectShColor(el, color) { document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected')); el.classList.add('selected'); document.getElementById('new_sh_color').value = color; }
function addStakeholder() { const n = document.getElementById('new_sh_name').value.trim(); const c = document.getElementById('new_sh_color').value; if(n) { appData.stakeholders.push({ id: generateId(), name: n, color: c }); document.getElementById('new_sh_name').value = ''; renderSettings(); } }
function deleteStakeholder(id) { appData.stakeholders = appData.stakeholders.filter(s => s.id !== id); renderSettings(); }
/* Bucket-Farben: benutzerdefiniert in appData.settings.bucketColors, sonst stabile Palette */
const BUCKET_PALETTE = ['#cca300', '#0F5FDC', '#1F9463', '#E8A317', '#7C6CE0', '#0E9BAA', '#D9342B', '#B96A2B', '#C2185B', '#5E7CE2'];
function getBucketColor(name) {
    if (!appData.settings) appData.settings = {};
    const map = appData.settings.bucketColors || {};
    if (map[name]) return map[name];
    const idx = (appData.buckets || []).indexOf(name);
    if (idx >= 0) return BUCKET_PALETTE[idx % BUCKET_PALETTE.length];
    let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
    return BUCKET_PALETTE[Math.abs(h) % BUCKET_PALETTE.length];
}
function setBucketColor(name, color) {
    if (!appData.settings.bucketColors) appData.settings.bucketColors = {};
    appData.settings.bucketColors[name] = color;
    saveToLocal();
    showToast(t('toast_saved'));
}

function addBucket() { const n = document.getElementById('new_bucket_name').value.trim(); if(n && !appData.buckets.includes(n)) { appData.buckets.push(n); document.getElementById('new_bucket_name').value = ''; renderSettings(); } }
function deleteBucket(name) { appData.buckets = appData.buckets.filter(b => b !== name); renderSettings(); }
function addDefClItem() { const n = document.getElementById('new_def_cl_name').value.trim(); if(n) { appData.defaultChecklist.push(n); document.getElementById('new_def_cl_name').value = ''; renderSettings(); } }
function deleteDefCl(i) { appData.defaultChecklist.splice(i, 1); renderSettings(); }
function moveDefCl(i, dir) { if(i+dir>=0 && i+dir<appData.defaultChecklist.length) { const t_obj = appData.defaultChecklist[i]; appData.defaultChecklist[i] = appData.defaultChecklist[i+dir]; appData.defaultChecklist[i+dir] = t_obj; renderSettings(); } }
function addUser() { const n = document.getElementById('new_user_name').value.trim(); const a = document.getElementById('new_user_avatar').value.trim(); const r = document.getElementById('new_user_rate') ? document.getElementById('new_user_rate').value : ''; if(n) { appData.users.push({ id: generateId(), name: n, avatar: a, hourlyRate: (r !== '' ? parseFloat(r) : null) }); document.getElementById('new_user_name').value = ''; document.getElementById('new_user_avatar').value = ''; if(document.getElementById('new_user_rate')) document.getElementById('new_user_rate').value = ''; renderSettings(); } }
function updateUserHourlyRate(id, val) { const u = appData.users.find(x => x.id === id); if(u) { u.hourlyRate = (val !== '' && !isNaN(parseFloat(val))) ? parseFloat(val) : null; saveToLocal(true); } }
function updateDefaultHourlyRate(val) { appData.settings.defaultHourlyRate = (val !== '' && !isNaN(parseFloat(val))) ? parseFloat(val) : null; saveToLocal(true); }
function deleteUser(id) { 
    if(id === appData.settings.currentUserId) return showToast('Eigenes Profil kann nicht gelöscht werden', 'error');
    appData.users = appData.users.filter(u => u.id !== id); 
    appData.tasks.forEach(t_obj => { if(t_obj.assigneeId === id) t_obj.assigneeId = ''; if(t_obj.checklist) t_obj.checklist.forEach(c => { if(c.assigneeId === id) c.assigneeId = ''; }); });
    appData.projectStacks.forEach(ps => { if(ps.assigneeId === id) ps.assigneeId = ''; if(ps.checklist) ps.checklist.forEach(c => { if(c.assigneeId === id) c.assigneeId = ''; }); });
    renderSettings(); 
}

// --- 5.1 WORKFLOW LOGIC ---
/* Bringt einen gespeicherten Workflow in eine vollständige, sichere Form.
   Unvollständige Einträge (ältere Versionen, Teil-Importe) haben bisher das
   Rendern der GANZEN Liste abstürzen lassen – dadurch war kein Workflow sichtbar. */
function wfNormalize(wf) {
    const w = (wf && typeof wf === 'object') ? wf : {};
    if (!w.id) w.id = generateId();
    if (typeof w.name !== 'string') w.name = String(w.name || 'Workflow');
    if (typeof w.trigger !== 'string') w.trigger = '';
    if (w.triggerValue === undefined || w.triggerValue === null) w.triggerValue = '';
    w.conditionLogic = (w.conditionLogic === 'OR') ? 'OR' : 'AND';
    if (!Array.isArray(w.conditions)) w.conditions = [];
    if (!Array.isArray(w.actions)) w.actions = [];
    w.conditions = w.conditions.filter(c => c && typeof c === 'object').map(c => ({
        field: String(c.field || ''), operator: String(c.operator || '='), value: (c.value === undefined || c.value === null) ? '' : c.value
    }));
    w.actions = w.actions.filter(a => a && typeof a === 'object').map(a => ({
        type: String(a.type || ''), value: (a.value === undefined || a.value === null) ? '' : a.value
    }));
    w.active = (w.active === undefined) ? true : !!w.active;
    return w;
}
/* Alle gespeicherten Workflows einmalig säubern und zurückgeben */
function wfAll() {
    if (!appData.settings) appData.settings = {};
    if (!Array.isArray(appData.settings.workflows)) appData.settings.workflows = [];
    appData.settings.workflows = appData.settings.workflows.map(wfNormalize);
    return appData.settings.workflows;
}
function renderWorkflows() {
    const list = document.getElementById('wf_list');
    if (!list) return;                       /* Ansicht (noch) nicht im DOM */
    if (!appData.settings) appData.settings = {};
    if (!Array.isArray(appData.settings.workflows)) appData.settings.workflows = [];
    /* Solange der Editor nicht aktiv bearbeitet wird, ist die LISTE die Ansicht.
       Das wird hier hart erzwungen, damit ein zuvor offen gelassener Editor die
       gespeicherten Workflows nicht dauerhaft verdeckt. */
    if (!window.wfEditorActive) {
        const ed = document.getElementById('wf_editor');
        if (ed) ed.style.display = 'none';
        list.style.display = 'flex';
    }
    const _wfs = wfAll();
    let html = '';
    if(_wfs.length === 0) { html = `<p style="font-size:12px; color:var(--text-muted);">Keine Workflows vorhanden. Erstelle deinen ersten, um Abläufe zu automatisieren!</p>`; } 
    else {
        _wfs.forEach(wf => {
          try {
            const statusClass = wf.active ? '' : 'inactive'; let triggerLabel = '';
            if(wf.trigger === 'task_created') triggerLabel = t('wf_t_t_created');
            if(wf.trigger === 'task_updated') triggerLabel = t('wf_t_t_updated');
            if(wf.trigger === 'task_status_changed') { const st = appData.statuses.find(s=>s.id===wf.triggerValue); triggerLabel = `${t('wf_t_t_status')} ${st ? (st.id==='done'?t('col_completed'):st.title) : wf.triggerValue}`; }
            if(wf.trigger === 'task_paused') triggerLabel = t('wf_t_t_paused');
            if(wf.trigger === 'task_resumed') triggerLabel = t('wf_t_t_resumed');
            if(wf.trigger === 'task_completed') triggerLabel = t('wf_t_t_comp');
            if(wf.trigger === 'stack_created') triggerLabel = t('wf_t_s_created');
            if(wf.trigger === 'stack_updated') triggerLabel = t('wf_t_s_updated');
            if(wf.trigger === 'stack_paused') triggerLabel = t('wf_t_s_paused');
            if(wf.trigger === 'stack_resumed') triggerLabel = t('wf_t_s_resumed');
            if(wf.trigger === 'stack_completed') triggerLabel = t('wf_t_s_comp');
            if(wf.trigger === 'entity_exists') triggerLabel = 'Aufgabe/Stack existiert (Wird bei Änderung geprüft)';

            html += `<div class="wf-card ${statusClass}">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h4 style="margin:0; font-size:14px;">${wf.name}</h4>
                    <div style="display:flex; gap:5px;">
                        <button class="secondary icon-btn" onclick="toggleWorkflow('${wf.id}')" title="${wf.active ? 'Deaktivieren' : 'Aktivieren'}"><i class="fas ${wf.active ? 'fa-toggle-on' : 'fa-toggle-off'}"></i></button>
                        <button class="secondary icon-btn" onclick="openWfEditor('${wf.id}')" title="Bearbeiten"><i class="fas fa-pen"></i></button>
                        <button class="secondary icon-btn" style="color:var(--danger);" onclick="deleteWorkflow('${wf.id}')" title="Löschen"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <div class="wf-row"><span class="wf-badge">${t('wf_if')}</span> <span style="font-size:13px;">${triggerLabel}</span></div>
                ${wf.conditions && wf.conditions.length > 0 ? `<div class="wf-row"><span class="wf-badge" style="background:var(--warning); color:white;">${wf.conditionLogic === 'AND' ? t('wf_and') : t('wf_or')}</span> <span style="font-size:12px; color:var(--text-muted);">${wf.conditions.length} ${t('wf_conditions_n')}</span></div>` : ''}
                <div class="wf-row"><span class="wf-badge" style="background:var(--success); color:white;">${t('wf_then')}</span> <span style="font-size:12px; color:var(--text-muted);">${wf.actions.length} ${t('wf_actions_n')}</span></div>
            </div>`;
          } catch(err) {
            console.error('Workflow konnte nicht dargestellt werden', wf, err);
            html += `<div class="wf-card inactive"><h4 style="margin:0; font-size:14px;">${escapeHtmlToday(wf && wf.name ? wf.name : 'Workflow')}</h4><p style="font-size:12px; color:var(--danger); margin:4px 0 0;">Dieser Workflow ist beschädigt und kann nicht angezeigt werden.</p><div style="display:flex; gap:5px; margin-top:6px;"><button class="secondary icon-btn" style="color:var(--danger);" onclick="deleteWorkflow('${wf && wf.id ? wf.id : ''}')" title="Löschen"><i class="fas fa-trash"></i></button></div></div>`;
          }
        });
    }
    list.innerHTML = html;
}

function openWfEditor(id = null) {
    window.wfEditorActive = true;
    document.getElementById('wf_list').style.display = 'none'; document.getElementById('wf_editor').style.display = 'block';
    if(id) {
        const _found = wfAll().find(x => x.id === id);
        if(!_found) { showToast('Workflow nicht gefunden.', 'error'); closeWfEditor(); return; }
        const wf = wfNormalize(_found);
        document.getElementById('wf_edit_id').value = wf.id; document.getElementById('wf_edit_name').value = wf.name; document.getElementById('wf_edit_trigger').value = wf.trigger;
        renderWfTriggerValueOptions(wf.triggerValue); document.getElementById('wf_edit_cond_logic').value = wf.conditionLogic || 'AND';
        document.getElementById('wf_edit_conditions_list').innerHTML = ''; if(wf.conditions) wf.conditions.forEach(c => addWfConditionRow(c.field, c.operator, c.value));
        document.getElementById('wf_edit_actions_list').innerHTML = ''; if(wf.actions) wf.actions.forEach(a => addWfActionRow(a.type, a.value));
    } else {
        document.getElementById('wf_edit_id').value = ''; document.getElementById('wf_edit_name').value = ''; document.getElementById('wf_edit_trigger').value = ''; document.getElementById('wf_edit_trigger_val').style.display = 'none'; document.getElementById('wf_edit_cond_logic').value = 'AND'; document.getElementById('wf_edit_conditions_list').innerHTML = ''; document.getElementById('wf_edit_actions_list').innerHTML = '';
        addWfActionRow(); 
    }
}
function closeWfEditor() {
    window.wfEditorActive = false;
    const ed = document.getElementById('wf_editor'); if (ed) ed.style.display = 'none';
    const li = document.getElementById('wf_list'); if (li) li.style.display = 'flex';
}

function renderWfTriggerValueOptions(preselect = '') {
    const trigger = document.getElementById('wf_edit_trigger').value; const valSelect = document.getElementById('wf_edit_trigger_val');
    if(trigger === 'task_status_changed') {
        valSelect.style.display = 'block';
        /* Erste Option: JEDER Status. Ohne sie war immer der erste Status vorausgewählt,
           wodurch der Workflow nur bei genau diesem Status feuerte und sonst wirkungslos blieb. */
        valSelect.innerHTML = `<option value="" ${!preselect ? 'selected' : ''}>${t('wf_any_status')}</option>`
            + appData.statuses.map(s => `<option value="${s.id}" ${s.id===preselect?'selected':''}>${s.id === 'done' ? t('col_completed') : s.title}</option>`).join('');
    }
    else { valSelect.style.display = 'none'; valSelect.innerHTML = ''; }
}

function getWfFieldOptionsHtml(selected = '') {
    const fields = [
        { v: 'projectName',    l: t('wf_f_name'),        grp: 'Text' },
        { v: 'description',    l: t('wf_f_notes'),        grp: 'Text' },
        { v: 'priority',       l: t('wf_f_prio'),         grp: 'Auswahl' },
        { v: 'status',         l: 'Status',               grp: 'Auswahl' },
        { v: 'bucket',         l: t('wf_f_bucket'),       grp: 'Auswahl' },
        { v: 'assigneeId',     l: t('wf_f_assignee'),     grp: 'Auswahl' },
        { v: 'stakeholderId',  l: t('wf_f_sh'),           grp: 'Auswahl' },
        { v: 'projectStackId', l: t('wf_f_stack'),        grp: 'Auswahl' },
        { v: 'recurrence',     l: t('wf_f_rec'),          grp: 'Auswahl' },
        { v: 'isPaused',       l: t('wf_f_paused'),        grp: 'Status' },
        { v: 'hasChecklist',   l: t('wf_f_has_cl'),        grp: 'Status' },
        { v: 'hasAttachment',  l: t('wf_f_has_att'),       grp: 'Status' },
        { v: 'isOverdue',      l: t('wf_f_overdue'),       grp: 'Status' },
        { v: 'dueDate',        l: t('wf_f_due'),          grp: 'Datum' },
        { v: 'startDate',      l: t('wf_f_start'),        grp: 'Datum' },
        { v: 'estimatedTime',  l: t('wf_f_est'),          grp: 'Zahl' },
        { v: 'spentTime',      l: t('wf_f_spent'),        grp: 'Zahl' },
        { v: 'spentTime_thisWeek', l: t('wf_f_spent_week'), grp: 'Zahl' }, // NEU FÜR DIE KALENDERWOCHE
        { v: 'duration_days',  l: t('wf_f_duration'),     grp: 'Zahl' },
        { v: 'effort_remaining', l: t('wf_f_effort_rem'), grp: 'Zahl' },
        { v: 'checklistDone',  l: t('wf_f_cl_done_pct'),   grp: 'Zahl' },
        { v: 'checklistOpenCount', l: t('wf_f_cl_open_n'), grp: 'Zahl' },
        { v: 'checklistDoneCount', l: t('wf_f_cl_done_n'), grp: 'Zahl' },
        { v: 'taskCount',      l: t('wf_f_task_count'),    grp: 'Zahl' },
        { v: 'budgetRemainingPct', l: t('wf_f_bud_rem_pct'), grp: 'Zahl' },
        { v: 'budgetConsumedPct', l: t('wf_f_bud_used_pct'), grp: 'Zahl' },
        { v: 'budgetRemainingAmount', l: t('wf_f_bud_rem_amt'), grp: 'Zahl' },
        { v: 'budgetConsumedAmount', l: t('wf_f_bud_used_amt'), grp: 'Zahl' },
        { v: 'checklistOpenText', l: t('wf_f_cl_open_txt'), grp: 'Text' },
        { v: 'checklistDoneText', l: t('wf_f_cl_done_txt'), grp: 'Text' },
    ];
    const groups = ['Text', 'Auswahl', 'Status', 'Datum', 'Zahl'];
    let html = '';
    groups.forEach(grp => {
        const gFields = fields.filter(f => f.grp === grp);
        if(gFields.length) {
            html += `<optgroup label="— ${grp} —">`;
            gFields.forEach(f => { html += `<option value="${f.v}" ${selected===f.v?'selected':''}>${f.l}</option>`; });
            html += `</optgroup>`;
        }
    });
    return html;
}

function getWfFieldType(field) {
    if(['dueDate','startDate'].includes(field)) return 'date';
    if(['estimatedTime','spentTime','spentTime_thisWeek','duration_days','effort_remaining','checklistDone','taskCount','checklistOpenCount','checklistDoneCount','budgetRemainingPct','budgetConsumedPct','budgetRemainingAmount','budgetConsumedAmount'].includes(field)) return 'number';
    if(['isPaused','hasChecklist','hasAttachment','isOverdue'].includes(field)) return 'boolean';
    if(['priority','status','bucket','assigneeId','stakeholderId','projectStackId','recurrence'].includes(field)) return 'select';
    return 'text'; 
}

function getWfOpOptionsHtml(selected = '', fieldType = 'text') {
    const ops = {
        text:    [['equals',t('wfo_eq')],['not_equals',t('wfo_neq')],['contains',t('wfo_contains')],['not_contains',t('wfo_ncontains')],['is_empty',t('wfo_empty')],['not_empty',t('wfo_nempty')]],
        select:  [['equals',t('wfo_is')],['not_equals',t('wfo_is_not')],['is_empty',t('wfo_unset')],['not_empty',t('wfo_set')]],
        boolean: [['is_true',t('wfo_true')],['is_false',t('wfo_false')]],
        date:    [['date_past',t('wfo_past')],['date_future',t('wfo_future')],['date_less',t('wfo_less_days')],['date_more',t('wfo_more_days')],['date_equals',t('wfo_exact_date')],['is_empty',t('wfo_unset')],['not_empty',t('wfo_set')]],
        number:  [['equals',t('wfo_eq')],['not_equals',t('wfo_neq')],['greater_than',t('wfo_gt')],['less_than',t('wfo_lt')],['is_empty',t('wfo_empty_zero')]],
    };
    return (ops[fieldType] || ops.text).map(([v,l]) => `<option value="${v}" ${selected===v?'selected':''}>${l}</option>`).join('');
}

function renderWfConditionValueInput(rowEl) {
    const field = rowEl.querySelector('.wf-cond-field').value;
    const op    = rowEl.querySelector('.wf-cond-op').value;
    const container = rowEl.querySelector('.wf-cond-val-container');
    const preselect = rowEl.dataset.val || '';
    const fieldType = getWfFieldType(field);
    let html = '';

    if(['date_past','date_future','is_empty','not_empty','is_true','is_false'].includes(op)) {
        html = `<input type="hidden" class="wf-cond-val" value="1"><span style="font-size:12px; color:var(--text-muted); display:flex; align-items:center; height:100%; padding:0 8px;">${t('wfo_no_value')}</span>`;
        container.innerHTML = html; return;
    }
    if(op === 'date_less' || op === 'date_more') {
        html = `<div style="display:flex; align-items:center; gap:5px; width:100%;"><input type="number" class="wf-cond-val" value="${preselect}" placeholder="X" style="width:60px; min-width:60px; flex:none;"> <span style="font-size:12px; white-space:nowrap;">${t('wf_days')}</span></div>`;
        container.innerHTML = html; return;
    }
    if(op === 'date_equals') {
        html = `<input type="date" class="wf-cond-val" value="${preselect}">`;
        container.innerHTML = html; return;
    }
    if(fieldType === 'number') {
        html = `<input type="number" class="wf-cond-val" value="${preselect}" placeholder="..." step="0.25">`;
        container.innerHTML = html; return;
    }
    if(field === 'priority') {
        html = `<select class="wf-cond-val"><option value="low" ${preselect==='low'?'selected':''}>${t('prio_low')}</option><option value="medium" ${preselect==='medium'?'selected':''}>${t('prio_med')}</option><option value="high" ${preselect==='high'?'selected':''}>${t('prio_high')}</option></select>`;
    } else if(field === 'status') {
        html = `<select class="wf-cond-val"><option value="">-- Auswählen --</option>` + appData.statuses.map(s => `<option value="${s.id}" ${s.id===preselect?'selected':''}>${s.id==='done'?t('col_completed'):s.title}</option>`).join('') + `</select>`;
    } else if(field === 'bucket') {
        html = `<select class="wf-cond-val"><option value="">-- Leer --</option>` + appData.buckets.map(b => `<option value="${b}" ${b===preselect?'selected':''}>${b}</option>`).join('') + `</select>`;
    } else if(field === 'stakeholderId') {
        html = `<select class="wf-cond-val"><option value="">-- Leer --</option>` + appData.stakeholders.map(s => `<option value="${s.id}" ${s.id===preselect?'selected':''}>${s.name}</option>`).join('') + `</select>`;
    } else if(field === 'assigneeId') {
        html = `<select class="wf-cond-val"><option value="">-- Leer --</option>` + appData.users.map(u => `<option value="${u.id}" ${u.id===preselect?'selected':''}>${u.name}</option>`).join('') + `</select>`;
    } else if(field === 'projectStackId') {
        html = `<select class="wf-cond-val"><option value="">-- Leer --</option>` + appData.projectStacks.map(s => `<option value="${s.id}" ${s.id===preselect?'selected':''}>${s.name}</option>`).join('') + `</select>`;
    } else if(field === 'recurrence') {
        html = `<select class="wf-cond-val"><option value="none" ${preselect==='none'?'selected':''}>-</option><option value="daily" ${preselect==='daily'?'selected':''}>Täglich</option><option value="weekly" ${preselect==='weekly'?'selected':''}>Wöchentlich</option><option value="monthly" ${preselect==='monthly'?'selected':''}>Monatlich</option><option value="yearly" ${preselect==='yearly'?'selected':''}>Jährlich</option></select>`;
    } else {
        html = `<input type="text" class="wf-cond-val" value="${preselect}" placeholder="...">`;
    }
    container.innerHTML = html;
}

function triggerWfCondUpdate(el) {
    const row = el.closest('.wf-rule-row');
    if(el.classList.contains('wf-cond-val')) { row.dataset.val = el.value; return; }
    if(el.classList.contains('wf-cond-field')) {
        const fieldType = getWfFieldType(el.value);
        const opSel = row.querySelector('.wf-cond-op');
        opSel.innerHTML = getWfOpOptionsHtml('', fieldType);
    }
    renderWfConditionValueInput(row);
}

function addWfConditionRow(field='projectName', operator='equals', value='') {
    const list = document.getElementById('wf_edit_conditions_list');
    const div = document.createElement('div'); div.className = 'wf-rule-row'; div.dataset.val = value;
    const fieldType = getWfFieldType(field);
    div.innerHTML = `<div style="flex:1;"><select class="wf-cond-field" onchange="triggerWfCondUpdate(this)">${getWfFieldOptionsHtml(field)}</select></div><div style="flex:1;"><select class="wf-cond-op" onchange="triggerWfCondUpdate(this)">${getWfOpOptionsHtml(operator, fieldType)}</select></div><div class="wf-cond-val-container"></div><button class="secondary icon-btn" style="color:var(--danger); flex-shrink:0;" onclick="this.parentElement.remove()" title="Löschen"><i class="fas fa-trash"></i></button>`;
    list.appendChild(div); renderWfConditionValueInput(div);
}

function getWfActionOptionsHtml(selected = '') {
    return `<option value="set_status" ${selected==='set_status'?'selected':''}>${t('wf_act_set_stat')}</option>
    <option value="set_priority" ${selected==='set_priority'?'selected':''}>${t('wf_act_set_prio')}</option>
    <option value="set_assignee" ${selected==='set_assignee'?'selected':''}>${t('wf_act_set_ass')}</option>
    <option value="set_bucket" ${selected==='set_bucket'?'selected':''}>${t('wf_act_set_buck')}</option>
    <option value="set_stakeholder" ${selected==='set_stakeholder'?'selected':''}>${t('wf_act_set_sh')}</option>
    <option value="set_due_rel" ${selected==='set_due_rel'?'selected':''}>${t('wf_act_set_due_rel')}</option>
    <option value="set_start_tdy" ${selected==='set_start_tdy'?'selected':''}>${t('wf_act_set_start_tdy')}</option>
    <option value="clear_due" ${selected==='clear_due'?'selected':''}>${t('wf_act_clear_due')}</option>
    <option value="add_est" ${selected==='add_est'?'selected':''}>${t('wf_act_add_est')}</option>
    <option value="set_est" ${selected==='set_est'?'selected':''}>${t('wf_act_set_est')}</option>
    <option value="add_note" ${selected==='add_note'?'selected':''}>${t('wf_act_add_note')}</option>
    <option value="notif_bell" ${selected==='notif_bell'?'selected':''}>${t('wf_act_notif_bell')}</option>
    <option value="notif_toast" ${selected==='notif_toast'?'selected':''}>${t('wf_act_notif_toast')}</option>
    <option value="notif_modal" ${selected==='notif_modal'?'selected':''}>${t('wf_act_notif_modal')}</option>
    <option value="notif_push" ${selected==='notif_push'?'selected':''}>${t('wf_act_notif_push')}</option>
    <option value="create_task" ${selected==='create_task'?'selected':''}>${t('wf_a_create_task')}</option>
    <option value="create_stack" ${selected==='create_stack'?'selected':''}>${t('wf_a_create_stack')}</option>
    <option value="create_cl" ${selected==='create_cl'?'selected':''}>${t('wf_a_create_cl')}</option>
    <option value="create_ms" ${selected==='create_ms'?'selected':''}>${t('wf_a_create_ms')}</option>
    <option value="send_email" ${selected==='send_email'?'selected':''}>${t('wf_act_send_email')}</option>
    `;
}

function renderWfActionValueInput(actionSelectEl, preselect = '') {
    const action = actionSelectEl.value; const container = actionSelectEl.parentElement.querySelector('.wf-act-val-container'); let html = '';
    if(action === 'set_status') { html = `<select class="wf-act-val">` + appData.statuses.map(s => `<option value="${s.id}" ${s.id===preselect?'selected':''}>${s.id === 'done' ? t('col_completed') : s.title}</option>`).join('') + `</select>`; } 
    else if(action === 'set_priority') { html = `<select class="wf-act-val"><option value="low" ${preselect==='low'?'selected':''}>${t('prio_low')}</option><option value="medium" ${preselect==='medium'?'selected':''}>${t('prio_med')}</option><option value="high" ${preselect==='high'?'selected':''}>${t('prio_high')}</option></select>`; } 
    else if(action === 'set_assignee') { html = `<select class="wf-act-val"><option value="">-- Leer --</option>` + appData.users.map(u => `<option value="${u.id}" ${u.id===preselect?'selected':''}>${u.name}</option>`).join('') + `</select>`; } 
    else if(action === 'set_bucket') { html = `<select class="wf-act-val"><option value="">-- Leer --</option>` + appData.buckets.map(b => `<option value="${b}" ${b===preselect?'selected':''}>${b}</option>`).join('') + `</select>`; } 
    else if(action === 'set_stakeholder') { html = `<select class="wf-act-val"><option value="">-- Leer --</option>` + appData.stakeholders.map(s => `<option value="${s.id}" ${s.id===preselect?'selected':''}>${s.name}</option>`).join('') + `</select>`; } 
    else if(action === 'set_due_rel') { html = `<div style="display:flex; align-items:center; gap:5px; width:100%;"><input type="number" class="wf-act-val" value="${preselect}" placeholder="X" style="width:60px; min-width:60px; flex:none;"> <span style="font-size:12px; white-space:nowrap;">${t('wf_days_from_now')}</span></div>`; } 
    else if(action === 'set_start_tdy' || action === 'clear_due') { html = `<input type="hidden" class="wf-act-val" value="0"><span style="font-size:12px; color:var(--text-muted); display:flex; align-items:center; height:100%;">${t('wf_no_val_needed')}</span>`; } 
    else if(action === 'add_est' || action === 'set_est') { html = `<div style="display:flex; align-items:center; gap:5px; width:100%;"><input type="number" class="wf-act-val" value="${preselect}" placeholder="X" step="0.25" style="width:70px; min-width:70px; flex:none;"> <span style="font-size:12px; white-space:nowrap;">${t('wf_hours')}</span></div>`; } 
    else if(['create_task', 'create_stack', 'create_cl', 'create_ms', 'notif_bell', 'notif_toast', 'notif_modal', 'notif_push'].includes(action)) { html = `<input type="text" class="wf-act-val" placeholder="Text / Name..." value="${preselect}">`; }
    else if(action === 'send_email') { 
        let pEmail = '', pMsg = '';
        if(preselect && preselect.includes('|||')) { [pEmail, pMsg] = preselect.split('|||'); } else { pMsg = preselect; }
        html = `<div style="display:flex; gap:5px; width:100%;">
            <input type="email" placeholder="E-Mail (leer=global)" value="${pEmail}" style="width:140px; min-width:140px; flex:none;" onchange="this.parentElement.querySelector('.wf-act-val').value = this.value + '|||' + this.nextElementSibling.value">
            <input type="text" placeholder="${t('wf_msg_ph')}" value="${pMsg}" style="flex:1;" onchange="this.parentElement.querySelector('.wf-act-val').value = this.previousElementSibling.value + '|||' + this.value">
            <input type="hidden" class="wf-act-val" value="${preselect}">
        </div>`;
    }
    else { html = `<input type="text" class="wf-act-val" placeholder="..." value="${preselect}">`; }
    container.innerHTML = html;
}

function addWfActionRow(type='set_status', value='') {
    const list = document.getElementById('wf_edit_actions_list'); const div = document.createElement('div'); div.className = 'wf-rule-row';
    div.innerHTML = `<select class="wf-act-type" onchange="renderWfActionValueInput(this)" style="flex:1;">${getWfActionOptionsHtml(type)}</select><div class="wf-act-val-container"></div><button class="secondary icon-btn" style="color:var(--danger); flex-shrink:0;" onclick="this.parentElement.remove()" title="Löschen"><i class="fas fa-trash"></i></button>`;
    list.appendChild(div); renderWfActionValueInput(div.querySelector('.wf-act-type'), value);
}

// Liest den Editor aus für Speichern & Testen
function getWorkflowStateFromEditor() {
    const id = document.getElementById('wf_edit_id').value || generateId();
    const name = document.getElementById('wf_edit_name').value.trim(); 
    const trigger = document.getElementById('wf_edit_trigger').value; 
    const triggerValue = document.getElementById('wf_edit_trigger_val').value; 
    const logic = document.getElementById('wf_edit_cond_logic').value;
    
    const conditions = []; 
    document.getElementById('wf_edit_conditions_list').querySelectorAll('.wf-rule-row').forEach(row => { 
        const f = row.querySelector('.wf-cond-field'); const o = row.querySelector('.wf-cond-op'); const v = row.querySelector('.wf-cond-val'); 
        if(f && o && v) conditions.push({ field: f.value, operator: o.value, value: v.value }); 
    });
    
    const actions = []; 
    document.getElementById('wf_edit_actions_list').querySelectorAll('.wf-rule-row').forEach(row => { 
        const t = row.querySelector('.wf-act-type'); const v = row.querySelector('.wf-act-val'); 
        if(t && v && v.value !== undefined) actions.push({ type: t.value, value: v.value }); 
    });

    return { id, name, trigger, triggerValue, conditionLogic: logic, conditions, actions, active: true };
}

function saveWorkflow() {
    const wfData = getWorkflowStateFromEditor();
    if(!wfData.name || !wfData.trigger) return showToast('Bitte Name und Auslöser wählen.', 'error');
    if(wfData.actions.length === 0) return showToast('Mindestens eine Aktion wird benötigt.', 'error');
    
    if(!appData.settings.workflows) appData.settings.workflows = [];
    const idx = appData.settings.workflows.findIndex(x => x.id === wfData.id);
    if(idx > -1) { 
        wfData.active = appData.settings.workflows[idx].active; 
        appData.settings.workflows[idx] = wfData; 
    } else { 
        appData.settings.workflows.push(wfData); 
    }
    saveToLocal(); closeWfEditor(); renderWorkflows(); showToast('Workflow gespeichert.');
}

function deleteWorkflow(id) { if(confirm('Workflow wirklich löschen?')) { appData.settings.workflows = appData.settings.workflows.filter(w => w.id !== id); saveToLocal(); renderWorkflows(); showToast('Workflow gelöscht.'); } }
function toggleWorkflow(id) { const wf = appData.settings.workflows.find(w => w.id === id); if(wf) { wf.active = !wf.active; saveToLocal(); renderWorkflows(); } }

// TEST WORKFLOW (Simuliert Bedingungsprüfung ohne Aktionen auszuführen)
function testCurrentWorkflow() {
    const box = document.getElementById('wf_test_result');
    const show = (html, kind) => {
        if (box) {
            box.style.display = 'block';
            box.className = 'wf-test-result ' + (kind || 'info');
            box.innerHTML = html;
        }
    };
    let wfData;
    try { wfData = wfNormalize(getWorkflowStateFromEditor()); }
    catch (err) { show('<b>Test fehlgeschlagen.</b><br>Die Regeln konnten nicht gelesen werden.', 'bad'); return; }

    if (!wfData.trigger) { show('<b>Kein Auslöser gewählt.</b><br>Bitte zuerst unter „WENN" einen Auslöser wählen.', 'bad'); return; }

    let hitTasks = [], hitStacks = [];
    try {
        if (wfData.trigger.indexOf('task_') === 0 || wfData.trigger === 'entity_exists') {
            (appData.tasks || []).forEach(x => { if (evaluateConditions(x, wfData.conditions, wfData.conditionLogic)) hitTasks.push(x.projectName || 'Aufgabe'); });
        }
        if (wfData.trigger.indexOf('stack_') === 0 || wfData.trigger === 'entity_exists') {
            (appData.projectStacks || []).forEach(x => { if (evaluateConditions(x, wfData.conditions, wfData.conditionLogic)) hitStacks.push(x.name || 'Stack'); });
        }
    } catch (err) {
        show('<b>Test fehlgeschlagen.</b><br>Eine Bedingung ist ungültig: ' + escapeHtmlToday(String(err.message || err)), 'bad');
        return;
    }

    const total = hitTasks.length + hitStacks.length;
    const condTxt = wfData.conditions.length === 0
        ? 'Ohne Bedingungen trifft der Workflow auf <b>alle</b> passenden Elemente zu.'
        : `${wfData.conditions.length} ${t('wf_conditions_n')}, ${t('wf_linked_with')} <b>${wfData.conditionLogic === 'OR' ? t('wf_or') : t('wf_and')}</b>.`;
    const actTxt = wfData.actions.length === 0
        ? '<span style="color:var(--danger);">Achtung: Es ist noch keine Aktion definiert – der Workflow würde nichts bewirken.</span>'
        : `${wfData.actions.length} ${t('wf_actions_n')} ${t('wf_would_run')}`;

    let list = '';
    if (total > 0) {
        const names = hitTasks.concat(hitStacks).slice(0, 8).map(n => escapeHtmlToday(n));
        list = `<div style="margin-top:6px; font-size:11px; color:var(--text-muted);">${names.join(', ')}${total > 8 ? ' … (+' + (total - 8) + ')' : ''}</div>`;
    }

    /* Es wird IMMER ein Ergebnis angezeigt – auch wenn nichts zutrifft. */
    if (total > 0) {
        show(`<b>Test durchgeführt – ${total} Treffer.</b><br>${hitTasks.length} Aufgabe(n), ${hitStacks.length} Stack(s).<br>${condTxt}<br>${actTxt}${list}`, 'good');
    } else {
        show(`<b>Test durchgeführt – keine Treffer.</b><br>Aktuell trifft kein bestehendes Element auf die Bedingungen zu.<br>${condTxt}<br>${actTxt}`, 'warn');
    }
}

// --- WORKFLOW ENGINE ---
let _wfExecutionLock = false; 

function evaluateConditions(entity, conditions, logic = 'AND') {
    if(!conditions || conditions.length === 0) return true;

    const results = conditions.map(cond => {
        let eVal = entity[cond.field];

        if(cond.field === 'duration_days') {
            eVal = (entity.startDate && entity.dueDate) ? (new Date(entity.dueDate.split('T')[0]) - new Date(entity.startDate.split('T')[0])) / 86400000 : null;
        }
        if(cond.field === 'effort_remaining') {
            eVal = parseFloat(entity.estimatedTime || 0) - parseFloat(entity.spentTime || 0);
        }
        if(cond.field === 'isPaused') {
            eVal = !!(entity.isPaused || entity.status === 'paused');
        }
        if(cond.field === 'hasChecklist') {
            eVal = Array.isArray(entity.checklist) && entity.checklist.length > 0;
        }
        if(cond.field === 'hasAttachment') {
            eVal = Array.isArray(entity.files) && entity.files.length > 0;
        }
        if(cond.field === 'isOverdue') {
            const due = entity.dueDate;
            eVal = due ? new Date(due) < new Date() && !isTaskDone(entity) && entity.status !== 'completed' : false;
        }
        if(cond.field === 'checklistDone') {
            const cl = entity.checklist || [];
            eVal = cl.length > 0 ? Math.round((cl.filter(c => c.done).length / cl.length) * 100) : 0;
        }
        if(cond.field === 'checklistOpenCount') {
            eVal = (entity.checklist || []).filter(c => !c.done).length;
        }
        if(cond.field === 'checklistDoneCount') {
            eVal = (entity.checklist || []).filter(c => c.done).length;
        }
        if(cond.field === 'checklistOpenText') {
            eVal = (entity.checklist || []).filter(c => !c.done).map(c => c.title || '').join(' | ');
        }
        if(cond.field === 'checklistDoneText') {
            eVal = (entity.checklist || []).filter(c => c.done).map(c => c.title || '').join(' | ');
        }
        if(cond.field === 'taskCount') {
            eVal = appData.tasks.filter(t => t.projectStackId === entity.id).length;
        }
        if(['budgetRemainingPct','budgetConsumedPct','budgetRemainingAmount','budgetConsumedAmount'].includes(cond.field)) {
            const isTaskEntity = ('projectName' in entity);
            const target = parseFloat(entity.targetBudget) || 0;
            const consumed = isTaskEntity ? getTaskConsumedBudget(entity) : getStackConsumedBudget(entity);
            const consumedPct = target > 0 ? (consumed / target) * 100 : 0;
            if(cond.field === 'budgetConsumedPct') eVal = Math.round(consumedPct * 100) / 100;
            if(cond.field === 'budgetRemainingPct') eVal = Math.round((100 - consumedPct) * 100) / 100;
            if(cond.field === 'budgetConsumedAmount') eVal = Math.round(consumed * 100) / 100;
            if(cond.field === 'budgetRemainingAmount') eVal = Math.round((target - consumed) * 100) / 100;
        }
        if(cond.field === 'status') {
            eVal = entity.status || (entity.isPaused ? 'paused' : '');
        }
        // NEU: Berechnung Aufwand diese Woche
        if(cond.field === 'spentTime_thisWeek') {
            const now = new Date(); const currentKw = getISOWeek(now); const currentYear = now.getFullYear();
            const logs = appData.timeLogs.filter(l => l.taskId === entity.id);
            let sum = 0;
            logs.forEach(l => {
                const lDate = new Date(l.date);
                if(getISOWeek(lDate) === currentKw && lDate.getFullYear() === currentYear) sum += parseFloat(l.hours);
            });
            eVal = sum;
        }

        if(eVal === undefined || eVal === null) eVal = '';

        if(cond.operator === 'is_true')  return eVal === true || eVal === 'true' || eVal === 1;
        if(cond.operator === 'is_false') return eVal === false || eVal === 'false' || eVal === 0 || eVal === '';

        if(cond.operator === 'is_empty')  return eVal === '' || eVal === null || eVal === undefined || eVal === 0 || eVal === 'none';
        if(cond.operator === 'not_empty') return eVal !== '' && eVal !== null && eVal !== undefined && eVal !== 0 && eVal !== 'none';

        if(cond.operator === 'equals')       return String(eVal) === String(cond.value);
        if(cond.operator === 'not_equals')   return String(eVal) !== String(cond.value);
        if(cond.operator === 'contains')     return String(eVal).toLowerCase().includes(String(cond.value).toLowerCase());
        if(cond.operator === 'not_contains') return !String(eVal).toLowerCase().includes(String(cond.value).toLowerCase());

        if(cond.operator === 'greater_than') return parseFloat(eVal) > parseFloat(cond.value);
        if(cond.operator === 'less_than')    return parseFloat(eVal) < parseFloat(cond.value);

        const dateStr = String(eVal);
        if(cond.operator === 'date_equals')  return dateStr.startsWith(cond.value);
        if(cond.operator === 'date_past')    { if(!eVal) return false; return new Date(dateStr) < new Date(); }
        if(cond.operator === 'date_future')  { if(!eVal) return false; return new Date(dateStr) > new Date(); }
        if(cond.operator === 'date_less' || cond.operator === 'date_more') {
            if(!eVal) return false;
            const diffDays = (new Date(dateStr) - new Date()) / 86400000;
            if(cond.operator === 'date_less') return diffDays >= 0 && diffDays < parseFloat(cond.value);
            if(cond.operator === 'date_more') return diffDays > parseFloat(cond.value);
        }
        return false;
    });

    if(logic === 'OR') return results.some(r => r); 
    return results.every(r => r);
}

function executeWorkflowActions(actions, entity, typeStr, triggerNameStr) {
    let viewNeedsUpdate = false;
    let structureChanged = false;

    actions.forEach(action => {
        if(action.type === 'set_status') {
            if(entity.status !== action.value) {
                entity.status = action.value;
                if(action.value === 'done') { entity.isPaused = false; if(!entity.completedAt) entity.completedAt = Date.now(); }
                else { delete entity.completedAt; }
                viewNeedsUpdate = true;
            }
        }
        if(action.type === 'set_priority') { entity.priority = action.value; viewNeedsUpdate = true; }
        if(action.type === 'set_assignee') { entity.assigneeId = action.value; viewNeedsUpdate = true; }
        if(action.type === 'set_bucket') { entity.bucket = action.value; viewNeedsUpdate = true; }
        if(action.type === 'set_stakeholder') { entity.stakeholderId = action.value; viewNeedsUpdate = true; }
        if(action.type === 'set_due_rel') { const days = parseInt(action.value) || 0; const d = new Date(); d.setDate(d.getDate() + days); entity.dueDate = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0]; viewNeedsUpdate = true; }
        if(action.type === 'set_start_tdy') { entity.startDate = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0]; viewNeedsUpdate = true; }
        if(action.type === 'clear_due') { entity.dueDate = ''; viewNeedsUpdate = true; }
        if(action.type === 'add_est') { let curEst = parseFloat(entity.estimatedTime) || 0; entity.estimatedTime = (curEst + parseFloat(action.value || 0)).toFixed(2); viewNeedsUpdate = true; }
        if(action.type === 'set_est') { entity.estimatedTime = parseFloat(action.value || 0).toFixed(2); viewNeedsUpdate = true; }
        
        if(action.type === 'add_note') { let msg = getHistoryTimestamp() + action.value; entity.history = entity.history ? entity.history + '\n' + msg : msg; viewNeedsUpdate = true; }
        
        if(action.type === 'notif_bell') {
            if(!appData.customBellNotifs) appData.customBellNotifs = [];
            appData.customBellNotifs.push({ id: generateId(), title: 'Automatisierung', desc: action.value, date: Date.now() });
            viewNeedsUpdate = true; 
        }
        if(action.type === 'notif_toast') { _rawToast(`🤖 Automatisierung: ${action.value}`, 'info'); }
        if(action.type === 'notif_modal') { showNotifModal('Automatisierung', action.value, 'info'); }
        if(action.type === 'notif_push') { sendPushNotification('ProMan Automatisierung', { body: action.value }); }

        if(action.type === 'create_task') {
            const newTask = {
                id: generateId(), projectStackId: '', projectName: action.value || 'Neue Aufgabe',
                stakeholderId: '', bucket: '', status: appData.statuses.length ? appData.statuses[0].id : 'todo',
                priority: 'medium', recurrence: 'none', customRecurrence: null, startDate: '', dueDate: '',
                estimatedTime: '', spentTime: '', description: '', notes: '', checklist: [], files: [], assigneeId: '', predecessors: []
            };
            appData.tasks.push(newTask);
            if(!appData.settings.noteOrder) appData.settings.noteOrder = [];
            appData.settings.noteOrder.push(newTask.id);
            structureChanged = true;
        }
        if(action.type === 'create_stack') {
            const newStack = {
                id: generateId(), name: action.value || 'Neues Stack', status: 'active',
                startDate: '', dueDate: '', notes: '', history: '', assigneeId: '',
                stakeholderId: '', bucket: '', checklist: [], predecessors: []
            };
            appData.projectStacks.push(newStack);
            structureChanged = true;
        }
        if(action.type === 'create_cl' && typeStr === 'task') {
            if(!entity.checklist) entity.checklist = [];
            entity.checklist.push({ id: generateId(), done: false, title: action.value || 'Neuer Punkt', dueDate: '', assigneeId: '', predecessors: [] });
            structureChanged = true;
        }
        if(action.type === 'create_ms' && typeStr === 'stack') {
            if(!entity.checklist) entity.checklist = [];
            entity.checklist.push({ id: generateId(), done: false, title: action.value || 'Neuer Milestone', dueDate: '', assigneeId: '', predecessors: [] });
            structureChanged = true;
        }
        if(action.type === 'send_email') {
            let targetEmail = '', customMsg = '';
            if(action.value && action.value.includes('|||')) { [targetEmail, customMsg] = action.value.split('|||'); } else { customMsg = action.value || ''; }
            
            const eName = entity.projectName || entity.name || entity.title || 'Unbenannt';
            const ePrio = entity.priority || '-';
            const eDue = entity.dueDate || '-';
            const eStatusObj = appData.statuses.find(s => s.id === entity.status);
            const eStatus = eStatusObj ? (eStatusObj.id === 'done' ? 'Abgeschlossen' : eStatusObj.title) : (entity.status || '-');
            const eUserObj = appData.users.find(u => u.id === entity.assigneeId);
            const eUser = eUserObj ? eUserObj.name : 'Nicht zugewiesen';
            
            const subject = `Workflow-Aktion: ${eName}`;
            const body = `Hallo,\n\nein ProMan-Workflow wurde ausgelöst!\n\nAuslöser: ${triggerNameStr}\n\nEigene Nachricht:\n${customMsg}\n\n---\nElement-Details:\nTyp: ${typeStr}\nName: ${eName}\nStatus: ${eStatus}\nPriorität: ${ePrio}\nFälligkeit: ${eDue}\nZuständig: ${eUser}\n---\n\nViele Grüsse,\nProMan Automatisierung`;
            
            triggerEmailNotif(subject, body, targetEmail);
        }
    });

    return { viewNeedsUpdate, structureChanged };
}

function triggerWorkflows(eventName, context) {
    if(_wfExecutionLock) return;
    /* Fehler in einem Workflow dürfen NIE die auslösende Aktion (z. B. eine
       Statusänderung im Kanban oder im Modal) abbrechen. Daher ist der gesamte
       Ablauf abgesichert. */
    let activeWfs;
    try {
        activeWfs = wfAll().filter(w => w.active && (w.trigger === eventName || w.trigger === 'entity_exists'));
    } catch(err) { console.error('Workflows konnten nicht gelesen werden', err); return; }
    
    if(activeWfs.length === 0) return;

    let globalViewNeedsUpdate = false;
    let globalStructureChanged = false;

    activeWfs.forEach(wf => {
        if(eventName === 'task_status_changed' && wf.triggerValue && wf.triggerValue !== context.newStatus) return;
        let entity = context.task || context.stack || null; if(!entity) return;
        let typeStr = context.task ? 'task' : 'stack';

        let matches = false;
        try { matches = evaluateConditions(entity, wf.conditions, wf.conditionLogic); }
        catch(err) { console.error('Workflow-Bedingung fehlerhaft', wf && wf.name, err); return; }
        if(matches) {
            _wfExecutionLock = true;
            try {
                const res = executeWorkflowActions(wf.actions, entity, typeStr, eventName) || {};
                if(res.viewNeedsUpdate) globalViewNeedsUpdate = true;
                if(res.structureChanged) globalStructureChanged = true;
            } catch(err) { console.error('Workflow-Aktion fehlerhaft', wf && wf.name, err); }
            _wfExecutionLock = false;
        }
    });

    if (globalStructureChanged || globalViewNeedsUpdate) {
        setTimeout(() => { 
            saveToLocal(true); 
            if(globalStructureChanged) renderView();
        }, 50);
    }
}

// --- 6. RATING LOGIC ---
function checkTaskCompletion(taskId, newStatusId) {
    if(!appData.statuses.length) return; const lastStatusId = appData.statuses[appData.statuses.length-1].id;
    const task = appData.tasks.find(t_obj => t_obj.id === taskId); const oldStatus = task ? task.status : null;
    if(newStatusId === lastStatusId && oldStatus !== lastStatusId) { setTimeout(() => { openRatingModal('task', taskId); }, 500); }
}
function openRatingModal(type, id) { currentRatingEntity = { type, id }; currentRatings = { comm: null, time: null, qual: null, team: null, crea: null, satis: null }; document.getElementById('ratingModal').classList.add('active'); drawCompletionStars(); }
function closeRatingModal() { document.getElementById('ratingModal').classList.remove('active'); currentRatingEntity = null; renderView(); }
function setStar(cat, val) { currentRatings[cat] = val; drawCompletionStars(); }

function drawCompletionStars() {
    const cats = ['comm', 'time', 'qual', 'team', 'crea', 'satis'];
    cats.forEach(c => {
        const container = document.getElementById(`stars_${c}`);
        if(container) {
            let val = currentRatings[c]; let html = `<i class="fas fa-ban" style="color:var(--danger); cursor:pointer; font-size:14px; margin-right:8px;" onclick="setStar('${c}', 0)" title="0 Sterne"></i>`;
            for(let i=1; i<=5; i++) {
                let cls = 'far fa-star';
                if(val !== null && val >= i) cls = 'fas fa-star';
                else if(val !== null && val >= i - 0.5) cls = 'fas fa-star-half-alt';
                html += `<i class="${cls}" style="cursor:pointer; color:var(--warning); margin-right:2px; font-size:16px;" onclick="setStar('${c}', ${i})"></i>`;
            }
            container.innerHTML = html;
        }
    });
}

function saveRating() {
    if(!currentRatingEntity) return; const { type, id } = currentRatingEntity; let entity = type === 'task' ? appData.tasks.find(t => t.id === id) : appData.projectStacks.find(s => s.id === id);
    if(entity) { addRatingToEntity(entity, currentRatings); saveToLocal(); showToast(t('toast_saved')); }
    closeRatingModal();
}

// --- 7. MERGE MODAL LOGIC ---
function openMergeModal(id1, id2) {
    document.getElementById('mergeModal').classList.add('active'); document.getElementById('merge_t1').value = id1; document.getElementById('merge_t2').value = id2;
    document.getElementById('merge_existing_stack').innerHTML = `<option value="">-- Auswählen --</option>` + appData.projectStacks.map(ps => `<option value="${ps.id}">${ps.name}</option>`).join('');
    document.getElementById('merge_new_stack').value = '';
}
function closeMergeModal() { document.getElementById('mergeModal').classList.remove('active'); }
function executeMerge() {
    const id1 = document.getElementById('merge_t1').value; const id2 = document.getElementById('merge_t2').value;
    const exId = document.getElementById('merge_existing_stack').value; const newName = document.getElementById('merge_new_stack').value.trim();
    let targetStackId = null;
    if(newName) {
        targetStackId = generateId(); appData.projectStacks.push({ id: targetStackId, name: newName, status: 'active', checklist: [], startDate: '', dueDate: '', notes: '', history: '', assigneeId: '', stakeholderId: '', bucket: '', predecessors: [] });
        if(activeFilters.stack.length > 0) activeFilters.stack.push(targetStackId); 
    } else if (exId) { targetStackId = exId; } else { showToast("Bitte Stack wählen oder neu erstellen.", "error"); return; }
    const t1 = appData.tasks.find(t_obj => t_obj.id === id1); if(t1) t1.projectStackId = targetStackId;
    const t2 = appData.tasks.find(t_obj => t_obj.id === id2); if(t2) t2.projectStackId = targetStackId;
    saveToLocal(); closeMergeModal(); showToast("Aufgaben erfolgreich gruppiert.");
}

// --- DRAG & DROP HELPERS ---
function handleCardDragOver(e, el, allowMerge) {
    e.preventDefault(); e.stopPropagation(); const rect = el.getBoundingClientRect(); const y = e.clientY - rect.top;
    if (allowMerge && y > rect.height * 0.25 && y < rect.height * 0.75) {
        if (!el.classList.contains('drag-over-merge')) el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over');
        el.classList.remove('drag-over-top', 'drag-over-bottom'); el.classList.add('drag-over-merge');
        return;
    }
    /* Hysterese: erst umschalten, wenn der Cursor deutlich über die Mitte hinaus ist.
       Verhindert das Flackern zwischen oben/unten direkt an der Mittellinie. */
    const isTop = el.classList.contains('drag-over-top');
    const isBottom = el.classList.contains('drag-over-bottom');
    const upperTrip = rect.height * 0.42;
    const lowerTrip = rect.height * 0.58;
    let target;
    if (isTop && y < lowerTrip) target = 'drag-over-top';
    else if (isBottom && y > upperTrip) target = 'drag-over-bottom';
    else target = (y < rect.height / 2) ? 'drag-over-top' : 'drag-over-bottom';
    if ((target === 'drag-over-top' && isTop) || (target === 'drag-over-bottom' && isBottom)) return; /* keine Änderung */
    el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-merge', 'drag-over');
    el.classList.add(target);
}
function handleCardDragLeave(el) { el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-merge', 'drag-over'); }

// --- 8. MODALS & CHECKLISTS LOGIC ---
function switchTaskTab(tabId, btn) {
    document.querySelectorAll('.modal-tab-btn').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.modal-tab-content').forEach(el => { el.style.display = 'none'; el.classList.remove('active'); });
    if(btn) btn.classList.add('active'); const target = document.getElementById(tabId);
    target.classList.add('active'); target.style.display = tabId === 'tab-general' ? 'block' : 'flex';
}

function switchStackTab(tabId, btn) {
    const modal = document.getElementById('stackModal');
    modal.querySelectorAll('.stack-tab-btn').forEach(el => el.classList.remove('active'));
    modal.querySelectorAll('.modal-tab-content').forEach(el => { el.style.display = 'none'; el.classList.remove('active'); });
    if(btn) btn.classList.add('active');
    const target = document.getElementById(tabId);
    if(target) { target.classList.add('active'); target.style.display = 'flex'; }
}

function handleSettingsStatusDrop(e, el, targetIdx) {
    e.preventDefault(); 
    handleCardDragLeave(el);
    const sourceIdx = parseInt(e.dataTransfer.getData('text/plain'));
    const type = e.dataTransfer.getData('type');
    if (type === 'settings-status' && !isNaN(sourceIdx) && sourceIdx !== targetIdx) {
        const item = appData.statuses.splice(sourceIdx, 1)[0];
        appData.statuses.splice(targetIdx, 0, item);
        saveToLocal(true); 
        renderSettings();
    }
}

function handleSettingsDefClDrop(e, el, targetIdx) {
    e.preventDefault(); 
    handleCardDragLeave(el);
    const sourceIdx = parseInt(e.dataTransfer.getData('text/plain'));
    const type = e.dataTransfer.getData('type');
    if (type === 'settings-defcl' && !isNaN(sourceIdx) && sourceIdx !== targetIdx) {
        const item = appData.defaultChecklist.splice(sourceIdx, 1)[0];
        appData.defaultChecklist.splice(targetIdx, 0, item);
        saveToLocal(true); 
        renderSettings();
    }
}

function addModalClDragHandlers(div) {
    /* Natives HTML5-Drag deaktiviert – Sortierung läuft über das zeigerbasierte
       Sortable (siehe IIFE am Dateiende). Nur der Griff .cl-drag startet das Ziehen. */
    div.classList.add('draggable-item');
    div.draggable = false;
}

function buildChecklistItemHTML(title, done, dueDate, assigneeId = '', id = '', startDate = '', duration = null) {
    let sd = '', stime = ''; if (startDate) { if (startDate.includes('T')) [sd, stime] = startDate.split('T'); else sd = startDate; }
    /* Dauer in Minuten → Dezimalstunden (Standard 60 Min = 1 Stunde) */
    let durMin = (duration === null || duration === undefined || duration === '') ? 0 : parseInt(duration, 10);
    if (isNaN(durMin) || durMin < 0) durMin = 60;
    const durHours = Math.round((durMin / 60) * 100) / 100;   /* z. B. 1.5 */

    /* Schmale Avatar-Auswahl: Button zeigt aktuelles Kürzel/Bild, Popup listet alle Benutzer */
    const curUser = appData.users.find(u => u.id === assigneeId);
    const curAvatar = assigneeId && curUser ? getAvatarHtml(assigneeId, 'avatar-sm', '') : '<span class="cl-assignee-empty"><i class="fas fa-user"></i></span>';
    const userMenuItems = `<button type="button" class="cl-assignee-opt" data-uid="" onclick="clPickAssignee(this,'')"><span class="cl-assignee-empty"><i class="fas fa-user-slash"></i></span><span>—</span></button>`
        + appData.users.map(u => `<button type="button" class="cl-assignee-opt" data-uid="${u.id}" onclick="clPickAssignee(this,'${u.id}')">${getAvatarHtml(u.id, 'avatar-sm', '')}<span>${escapeHtmlToday ? escapeHtmlToday(u.name) : u.name}</span></button>`).join('');
    const startHasTime = !!stime;

    return `
    <div class="cl-swipe-bg"><i class="fas fa-trash"></i></div>
    <div class="cl-swipe-container" tabindex="-1">
        <div class="cl-main-row">
            <i class="fas fa-grip-vertical cl-drag"></i>
            <input type="checkbox" class="cl-done" ${done ? 'checked' : ''} onchange="handleModalClCheckbox(this)" title="Erledigt">
            <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; justify-content: center;">
                <div style="display: flex; align-items: center; width: 100%;">
                    <input type="text" class="cl-title" value="${title}" placeholder="...">
                    <i class="fas fa-info-circle cl-info-btn" onclick="this.closest('.checklist-item').classList.toggle('show-details')"></i>
                </div>
            </div>
        </div>
        <div class="cl-controls">
            <input type="hidden" class="cl-assignee" value="${assigneeId}">
            <div class="cl-assignee-pick">
                <button type="button" class="cl-assignee-btn" title="Zuständig" onclick="event.stopPropagation(); this.parentNode.classList.toggle('open')">${curAvatar}</button>
                <div class="cl-assignee-menu">${userMenuItems}</div>
            </div>
            <span class="cl-datespan cl-startspan">
                <input type="date" class="cl-start-date" value="${sd}" title="Startdatum" onchange="clStartChanged(this)">
                <input type="time" class="cl-start-time ${sd ? '' : 'cl-hidden'}" value="${stime}" title="Startzeit (optional)" onchange="clStartChanged(this)">
            </span>
            <span class="cl-datespan cl-durspan"><span class="cl-datelbl">Zeit</span><input type="number" class="cl-dur-hours" value="${durHours}" min="0" max="999" step="0.25" title="Dauer in Stunden" onchange="clSumDuration()"><span class="cl-durunit">Std</span></span>
            <button class="secondary icon-btn" style="padding:4px; font-size:11px; margin-left:4px; color:var(--text-muted);" onclick="openDependencyModalForCl(this)" title="Abhängigkeiten für diesen Punkt"><i class="fas fa-link"></i></button>
            <button class="secondary icon-btn cl-delete-btn" style="color:var(--danger); margin-left:10px;" onclick="this.closest('.checklist-item').remove()" tabindex="-1" title="Löschen"><i class="fas fa-trash"></i></button>
        </div>
    </div>
    <div class="cl-deps-display" style="padding: 0 35px 4px 35px; width: 100%; display: flex; flex-wrap: wrap; gap: 4px;"></div>`;
}

/* Summe der Checkpunkt-Zeiten (in Stunden) für die Anzeige des geschätzten Gesamtaufwands */
function clDurationTotalHours(containerId) {
    const cont = document.getElementById(containerId); if (!cont) return 0;
    let total = 0;
    cont.querySelectorAll('.checklist-item').forEach(item => {
        const hrs = parseFloat(item.querySelector('.cl-dur-hours')?.value || '0') || 0;
        total += hrs;
    });
    return total;
}

/* Zuständigen aus der Avatar-Auswahl übernehmen */
function clPickAssignee(btn, uid) {
    const row = btn.closest('.checklist-item'); if (!row) return;
    const hidden = row.querySelector('.cl-assignee'); if (hidden) hidden.value = uid || '';
    const showBtn = row.querySelector('.cl-assignee-btn');
    if (showBtn) showBtn.innerHTML = uid ? getAvatarHtml(uid, 'avatar-sm', '') : '<span class="cl-assignee-empty"><i class="fas fa-user"></i></span>';
    const pick = btn.closest('.cl-assignee-pick'); if (pick) pick.classList.remove('open');
}

/* Start-Datum-Picker öffnen (nativer Datepicker) */
function clOpenStart(btn) {
    /* Nicht mehr benötigt: Start-Datum/-Zeit sind jetzt direkt sichtbare Felder,
       deren native Picker an der richtigen Stelle erscheinen. */
    const row = btn && btn.closest ? btn.closest('.checklist-item') : null;
    const d = row ? row.querySelector('.cl-start-date') : null;
    if (d && typeof d.showPicker === 'function') { try { d.showPicker(); } catch (e) {} }
}

/* Start-Datum/-Zeit geändert → Label aktualisieren, Zeitfeld einblenden sobald Datum da ist */
function clStartChanged(input) {
    const row = input.closest('.checklist-item'); if (!row) return;
    const d = row.querySelector('.cl-start-date'); const tm = row.querySelector('.cl-start-time');
    /* Zeitfeld erscheint erst, sobald ein Datum gesetzt ist (sonst ausgeblendet). */
    if (tm) tm.classList.toggle('cl-hidden', !(d && d.value));
    if (d && !d.value && tm) tm.value = '';
}

/* Aktualisiert das geschätzte-Aufwand-Feld (Summe der Checkpunkt-Zeiten) im gerade offenen Modal */
function clSumDuration() {
    /* Aufgaben-Modal */
    if (document.getElementById('taskModal') && document.getElementById('taskModal').classList.contains('active')) {
        const hrs = clDurationTotalHours('t_checklist_container');
        const el = document.getElementById('t_cl_duration_sum');
        if (el) el.textContent = ttNum(hrs);
    }
    /* Stack-Modal */
    if (document.getElementById('stackModal') && document.getElementById('stackModal').classList.contains('active')) {
        const hrs = clDurationTotalHours('s_checklist_container');
        const el = document.getElementById('s_cl_duration_sum');
        if (el) el.textContent = ttNum(hrs);
    }
}

function openStackModal(id = null) {
    document.getElementById('stackModal').classList.add('active');
    // Reset to first tab
    switchStackTab('stab-general', document.querySelector('#stackModal .stack-tab-btn'));
    const container = document.getElementById('s_checklist_container'); container.innerHTML = '';
    const tasksContainer = document.getElementById('s_tasks_container'); tasksContainer.innerHTML = '';
    
    ['s_id','s_name','s_start_date','s_start_time','s_due_date','s_due_time', 's_history', 's_assignee', 's_stakeholder', 's_bucket', 's_target_budget'].forEach(elId => { const el = document.getElementById(elId); if(el) el.value = ''; });
    { const _sl = document.getElementById('s_currency_label'); if(_sl) _sl.textContent = getGlobalCurrency(); }
    { const _sbs = document.getElementById('s_budget_summary'); if(_sbs) { _sbs.style.display = 'none'; _sbs.innerHTML = ''; } }
    document.getElementById('s_notes_rte').innerHTML = '';
    document.getElementById('s_assignee').innerHTML = `<option value="" data-i18n="nobody">${t('nobody')}</option>` + appData.users.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
    document.getElementById('s_stakeholder').innerHTML = `<option value="" data-i18n="no_stakeholder">${t('no_stakeholder')}</option>` + appData.stakeholders.map(sh => `<option value="${sh.id}">${sh.name}</option>`).join('');
    document.getElementById('s_bucket').innerHTML = `<option value="" data-i18n="no_bucket">${t('no_bucket')}</option>` + appData.buckets.map(b => `<option value="${b}">${b}</option>`).join('');

    const actionsContainer = document.getElementById('stack_header_actions'); let actionsHtml = '';

    if (id) {
        document.getElementById('stackModalTitle').innerText = t('s_edit');   /* wird unten durch den Stack-Namen ersetzt */ { const _pr = document.getElementById('s_preset_row'); if(_pr) _pr.style.display='none'; }
        document.getElementById('btnDeleteStack').style.display = 'block'; document.getElementById('dropdownShareStack').style.display = 'block';
        { const _bat = document.getElementById('btnAddExistingTaskToStack'); if(_bat) _bat.style.display = 'inline-flex'; }
        const s = appData.projectStacks.find(x => x.id === id);
        
        let sStartDate = '', sStartTime = '';
        if(s.startDate) { if(s.startDate.includes('T')) [sStartDate, sStartTime] = s.startDate.split('T'); else sStartDate = s.startDate; }

        let sDueDate = '', sDueTime = '';
        if(s.dueDate) { if(s.dueDate.includes('T')) [sDueDate, sDueTime] = s.dueDate.split('T'); else sDueDate = s.dueDate; }

        document.getElementById('s_id').value = s.id; document.getElementById('s_name').value = s.name || ''; document.getElementById('stackModalTitle').innerText = s.name || t('s_edit'); 
        document.getElementById('s_start_date').value = sStartDate; document.getElementById('s_start_time').value = sStartTime;
        document.getElementById('s_due_date').value = sDueDate; document.getElementById('s_due_time').value = sDueTime;
        document.getElementById('s_notes_rte').innerHTML = s.notes || ''; document.getElementById('s_history').value = s.history || ''; document.getElementById('s_assignee').value = s.assigneeId || ''; document.getElementById('s_stakeholder').value = s.stakeholderId || ''; document.getElementById('s_bucket').value = s.bucket || '';
        document.getElementById('s_target_budget').value = s.targetBudget || ''; { const _sl = document.getElementById('s_currency_label'); if(_sl) _sl.textContent = getGlobalCurrency(); }
        { const _sbs = document.getElementById('s_budget_summary'); if(_sbs) { const _bh = buildBudgetSummaryHtml(s.targetBudget, getGlobalCurrency(), getStackConsumedBudget(s)); _sbs.innerHTML = _bh; _sbs.style.display = _bh ? 'block' : 'none'; } }
        
        const isCompleted = s.status === 'completed'; const isPaused = s.status === 'paused';
        if(!isCompleted) {
            if(isPaused) actionsHtml += `<button class="secondary icon-btn" onclick="setStackStatus('${s.id}', 'active')" title="${t('btn_resume')}"><i class="fas fa-play"></i></button>`;
            else actionsHtml += `<button class="secondary icon-btn" onclick="setStackStatus('${s.id}', 'paused')" title="${t('btn_pause')}"><i class="fas fa-pause"></i></button>`;
            actionsHtml += `<button class="secondary icon-btn" onclick="setStackStatus('${s.id}', 'completed')" title="${t('btn_complete')}"><i class="fas fa-check"></i></button>`;
        } else { actionsHtml += `<button class="secondary icon-btn" onclick="setStackStatus('${s.id}', 'active')" title="${t('btn_reopen')}"><i class="fas fa-undo"></i></button>`; }

        renderInteractiveRating('s_interactive_rating', s.rating);
        if(s.checklist) s.checklist.forEach(c => { 
            const div = document.createElement('div'); div.className = 'checklist-item'; 
            div.setAttribute('data-id', c.id);
            div.innerHTML = buildChecklistItemHTML(c.title, c.done, c.dueDate, c.assigneeId, c.id, c.startDate || '', (c.duration !== undefined ? c.duration : null)); 
            addModalClDragHandlers(div); container.appendChild(div); 
        });
        
        renderStackTasksContainer(id);
        updateDepDisplay();
    } else {
        document.getElementById('stackModalTitle').innerText = t('s_new'); document.getElementById('btnDeleteStack').style.display = 'none'; document.getElementById('dropdownShareStack').style.display = 'none';
        { const _bat = document.getElementById('btnAddExistingTaskToStack'); if(_bat) _bat.style.display = 'none'; }
        renderInteractiveRating('s_interactive_rating', null); tasksContainer.innerHTML = '<span style="font-size:12px; color:var(--text-muted)">Noch keine Aufgaben.</span>';
        document.getElementById('s_deps_display').innerHTML = 'Keine Abhängigkeiten definiert.';
        populatePresetPicker('stack');
        /* Standard-Voreinstellung (Preset) für neue Stacks anwenden */
        const _sp = (appData.stackPresets || []).find(p => p.isDefault);
        if (_sp) {
            const _ssh = document.getElementById('s_stakeholder'); if (_ssh && _sp.stakeholderId) _ssh.value = _sp.stakeholderId;
            const _sbk = document.getElementById('s_bucket'); if (_sbk && _sp.bucket) _sbk.value = _sp.bucket;
            if (_sp.note) { const _srte = document.getElementById('s_notes_rte'); if (_srte) _srte.innerHTML = _sp.note.replace(/\n/g, '<br>'); }
            if (_sp.checklist && _sp.checklist.length) {
                const _scont = document.getElementById('s_checklist_container');
                _presetClNorm(_sp.checklist).forEach(ci => {
                    const div = document.createElement('div'); div.className = 'checklist-item';
                    const nid = generateId(); div.setAttribute('data-id', nid);
                    div.innerHTML = buildChecklistItemHTML(ci.title, false, '', '', nid, '', ci.duration || null);
                    addModalClDragHandlers(div); _scont.appendChild(div);
                });
            }
        }
    }
    actionsContainer.innerHTML = actionsHtml;
}
/* Haelt den Modal-Titel mit dem eingegebenen Namen synchron, damit in jedem Tab
   sichtbar bleibt, welche Aufgabe bzw. welcher Stack bearbeitet wird. */
function syncModalTitle(titleElId, value, fallbackKey) {
    const el = document.getElementById(titleElId);
    if (!el) return;
    const v = (value || '').trim();
    el.innerText = v || t(fallbackKey);
}

function renderStackTasksContainer(stackId) {
    const tasksContainer = document.getElementById('s_tasks_container');
    if(!tasksContainer) return;
    tasksContainer.innerHTML = '';
    const sTasks = appData.tasks.filter(t_obj => t_obj.projectStackId === stackId);
    if(sTasks.length === 0) { tasksContainer.innerHTML = '<span style="font-size:12px; color:var(--text-muted)">Keine Aufgaben zugeordnet.</span>'; return; }
    sTasks.forEach(t_obj => {
        const st = appData.statuses.find(x => x.id === t_obj.status); const progress = getTaskProgress(t_obj);
        const div = document.createElement('div'); div.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:var(--bg-color); padding:8px 12px; border-radius:4px; font-size:13px; border:1px solid var(--border-color);";
        let tPausedIcon = t_obj.isPaused && !isTaskDone(t_obj) ? '<i class="fas fa-pause" style="color:var(--warning); margin-right:4px;"></i>' : '';
        if(isTaskDone(t_obj)) div.classList.add('is-completed');
        div.innerHTML = `<div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:10px;"><b>${tPausedIcon}${t_obj.projectName}</b> <span style="color:var(--text-muted); font-size:11px;">(${st? (st.id==='done'?t('col_completed'):st.title) :''})</span></div><div style="width:100px; margin:0 15px; flex-shrink:0;">${generateProgressBarHTML(progress)}</div><div style="display:flex; gap:6px; flex-shrink:0;"><button class="secondary icon-btn" onclick="closeStackModal(); openModal('${t_obj.id}')"><i class="fas fa-external-link-alt"></i> Öffnen</button><button class="secondary icon-btn" style="color:var(--danger);" onclick="removeTaskFromStack('${t_obj.id}')" title="${t('s_remove_from_stack')}"><i class="fas fa-unlink"></i></button></div>`;
        tasksContainer.appendChild(div);
    });
}
function closeStackModal() { document.getElementById('stackModal').classList.remove('active'); }
function removeTaskFromStack(taskId) {
    const task = appData.tasks.find(t_obj => t_obj.id === taskId);
    if(!task) return;
    const stackId = task.projectStackId;
    task.projectStackId = '';
    saveToLocal();
    renderStackTasksContainer(stackId);
    showToast(t('s_task_removed_from_stack').replace('{n}', task.projectName || ''));
}

/* Bestehende aktive Aufgabe zu einem Stack hinzufügen (Tab "Aufgaben" im Stack-Modal) */
let addTaskToStackId = null;
function openAddTaskToStackModal() {
    const stackId = document.getElementById('s_id').value;
    if(!stackId) return;
    addTaskToStackId = stackId;
    const search = document.getElementById('addTaskToStackSearchInput'); if(search) search.value = '';
    document.getElementById('addTaskToStackModal').classList.add('active');
    renderAddTaskToStackList();
}
function closeAddTaskToStackModal() {
    document.getElementById('addTaskToStackModal').classList.remove('active');
}
function renderAddTaskToStackList() {
    const q = (document.getElementById('addTaskToStackSearchInput').value || '').toLowerCase();
    const container = document.getElementById('addTaskToStackListContainer');
    const candidates = appData.tasks.filter(t_obj => !isTaskDone(t_obj) && t_obj.projectStackId !== addTaskToStackId && (!q || (t_obj.projectName || '').toLowerCase().includes(q)));

    if(candidates.length === 0) { container.innerHTML = `<p style="font-size:12px; color:var(--text-muted); padding:10px;">${t('s_no_active_tasks')}</p>`; return; }

    let html = '';
    candidates.forEach(t_obj => {
        const stack = appData.projectStacks.find(x => x.id === t_obj.projectStackId);
        const pausedIcon = t_obj.isPaused ? '<i class="fas fa-pause" style="color:var(--warning); margin-right:4px;"></i>' : '';
        const contextLabel = stack ? `<i class="fas fa-folder"></i> ${escapeHtmlToday(stack.name)}` : t('standalone_tasks');
        html += `<div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 10px; border-bottom:1px solid var(--border-color);">
            <div style="flex:1; overflow:hidden; min-width:0;">
                <div style="font-weight:bold; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><i class="fas fa-tasks" style="color:var(--primary-color); margin-right:6px;"></i>${pausedIcon}${escapeHtmlToday(t_obj.projectName)}</div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${contextLabel}</div>
            </div>
            <button class="secondary icon-btn" style="flex-shrink:0;" onclick="addExistingTaskToStack('${t_obj.id}')" title="${t('add')}"><i class="fas fa-plus"></i></button>
        </div>`;
    });
    container.innerHTML = html;
}
function addExistingTaskToStack(taskId) {
    const task = appData.tasks.find(t_obj => t_obj.id === taskId);
    const stackId = addTaskToStackId;
    if(!task || !stackId) return;
    task.projectStackId = stackId;
    saveToLocal();
    renderAddTaskToStackList();
    renderStackTasksContainer(stackId);
    showToast(t('s_task_added_to_stack').replace('{n}', task.projectName || ''));
}
function addStackChecklistItem() { 
    const div = document.createElement('div'); div.className = 'checklist-item'; 
    const newId = generateId(); div.setAttribute('data-id', newId);
    div.innerHTML = buildChecklistItemHTML('Neuer Milestone', false, '', '', newId); 
    addModalClDragHandlers(div); document.getElementById('s_checklist_container').appendChild(div); 
}
function saveStack() {
    try {
        const id = document.getElementById('s_id').value || generateId(); if(!document.getElementById('s_name').value.trim()) return showToast("Bitte einen Projektnamen eingeben", "error");
        
        const existingStack = appData.projectStacks.find(x => x.id === id);
        
        const clItems = document.querySelectorAll('#s_checklist_container .checklist-item');
        const checklist = Array.from(clItems).map((item, index) => {
            const sDateVal = item.querySelector('.cl-start-date')?.value || ''; const sTimeVal = item.querySelector('.cl-start-time')?.value || '';
            const durHours = parseFloat(item.querySelector('.cl-dur-hours')?.value || '0') || 0;
            const durationMin = Math.round(durHours * 60);
            /* Ohne Uhrzeit -> ganztaegig gemaess Arbeitszeiten aus den Einstellungen */
            const _sched = computeChecklistSchedule(sDateVal, sTimeVal, durationMin);
            const finalStart = _sched.startDate;
            const finalDue = _sched.dueDate;
            const _finalDuration = _sched.duration;
            const _isAllDay = _sched.allDay;
            
            let cId = item.getAttribute('data-id');
            if(!cId) cId = generateId();
            const cPreds = tempPredecessors[cId] || [];
            return { id: cId, done: item.querySelector('.cl-done')?.checked || false, title: item.querySelector('.cl-title')?.value || '', assigneeId: item.querySelector('.cl-assignee')?.value || '', startDate: finalStart, duration: _finalDuration, allDay: _isAllDay, dueDate: finalDue, predecessors: cPreds }
        });

        // Diff Checklist für Historie
        let finalHistory = document.getElementById('s_history').value;
        if (existingStack && existingStack.checklist) {
            checklist.forEach(newItem => {
                if (newItem.done) {
                    const oldItem = existingStack.checklist.find(c => c.id === newItem.id);
                    if (oldItem && !oldItem.done) {
                        const msg = getHistoryTimestamp() + `Milestone "${newItem.title}" erledigt.`;
                        finalHistory = finalHistory ? finalHistory + '\n' + msg : msg;
                    }
                }
            });
        }

        const sData = { 
            id, name: document.getElementById('s_name').value, 
            startDate: getCombinedDateTime('s_start_date', 's_start_time'), 
            dueDate: getCombinedDateTime('s_due_date', 's_due_time'), 
            notes: document.getElementById('s_notes_rte').innerHTML, history: finalHistory, assigneeId: document.getElementById('s_assignee').value, stakeholderId: document.getElementById('s_stakeholder').value, bucket: document.getElementById('s_bucket').value, checklist: checklist, predecessors: tempPredecessors[id] || [],
            targetBudget: document.getElementById('s_target_budget').value !== '' ? parseFloat(document.getElementById('s_target_budget').value) : null
        };
        
        if(sData.startDate) checkWorkdayWarning(sData.startDate, sData.name);
        if(sData.dueDate) checkWorkdayWarning(sData.dueDate, sData.name);
        
        const idx = appData.projectStacks.findIndex(x => x.id === id);
        if (idx > -1) { 
            sData.status = appData.projectStacks[idx].status; sData.completedAt = appData.projectStacks[idx].completedAt; sData.ratingCount = appData.projectStacks[idx].ratingCount || 0; sData.rating = appData.projectStacks[idx].rating; sData.ratingHistory = appData.projectStacks[idx].ratingHistory || []; appData.projectStacks[idx] = sData; triggerWorkflows('stack_updated', { stack: sData });
        } else { 
            sData.status = 'active'; sData.ratingCount = 0; sData.ratingHistory = []; appData.projectStacks.push(sData); if(activeFilters.stack.length > 0) activeFilters.stack.push(id); triggerWorkflows('stack_created', { stack: sData });
        }
        if(modalRatingChanged) { let targetEntity = appData.projectStacks.find(x => x.id === id); if(targetEntity) addRatingToEntity(targetEntity, currentModalRating); }
        if(sData.status === 'completed' && !sData.completedAt) { sData.completedAt = Date.now(); triggerWorkflows('stack_completed', { stack: sData }); }
        if(sData.status !== 'completed') { delete sData.completedAt; }
        logActivity('fa-folder', (existingStack ? t('act_stack_edited') : t('act_stack_created')).replace('{n}', sData.name || ''));
        saveToLocal(); closeStackModal(); showToast(t('toast_saved'));
    } catch(e) {
        console.error(e); showToast("Fehler beim Speichern des Stacks: " + e.message, "error");
    }
}
function deleteCurrentStack() {
    if(!confirm("Möchtest du dieses Stack wirklich in den Papierkorb verschieben? (Zugehörige Aufgaben werden ebenfalls verschoben)")) return;
    const id = document.getElementById('s_id').value; const sIdx = appData.projectStacks.findIndex(s => s.id === id);
    if(sIdx > -1) {
        const stack = appData.projectStacks.splice(sIdx, 1)[0]; appData.deletedItems.push({ type: 'stack', data: stack, deletedAt: Date.now() });
        const tasksToMove = appData.tasks.filter(t_obj => t_obj.projectStackId === id); appData.tasks = appData.tasks.filter(t_obj => t_obj.projectStackId !== id);
        tasksToMove.forEach(t_obj => { appData.deletedItems.push({ type: 'task', data: t_obj, deletedAt: Date.now(), isChild: true }); });
    }
    saveToLocal(); closeStackModal(); showToast("Stack in den Papierkorb verschoben.");
}
function setStackStatus(id, newStatus) {
    if(newStatus !== 'active' && isEntityLocked(id)) { showToast("Stack ist durch Abhängigkeiten gesperrt!", "warning"); return; }
    const stack = appData.projectStacks.find(s => s.id === id);
    if(stack) { 
        stack.status = newStatus; 
        if(newStatus === 'paused') triggerWorkflows('stack_paused', { stack });
        if(newStatus === 'active') triggerWorkflows('stack_resumed', { stack });
        if(newStatus === 'completed') { if(!stack.completedAt) { stack.completedAt = Date.now(); triggerWorkflows('stack_completed', { stack }); } } else { delete stack.completedAt; }
        { const _sm = { paused: ['fa-pause', t('act_stack_paused')], active: ['fa-play', t('act_stack_resumed')], completed: ['fa-check', t('act_stack_done')] };
          if(_sm[newStatus]) logActivity(_sm[newStatus][0], _sm[newStatus][1].replace('{n}', stack.name || '')); }
        saveToLocal(); if(document.getElementById('stackModal').classList.contains('active')) { openStackModal(id); } renderView();
        if(newStatus === 'completed') { showToast("Stack abgeschlossen!"); openRatingModal('stack', id); } 
    }
}

// TASK MODAL
function populateTaskDropdowns() {
    document.getElementById('t_stakeholder').innerHTML = `<option value="" data-i18n="no_stakeholder">${t('no_stakeholder')}</option>` + appData.stakeholders.map(sh => `<option value="${sh.id}">${sh.name}</option>`).join('');
    document.getElementById('t_bucket').innerHTML = `<option value="" data-i18n="no_bucket">${t('no_bucket')}</option>` + appData.buckets.map(b => `<option value="${b}">${b}</option>`).join('');
    document.getElementById('t_status').innerHTML = appData.statuses.map(s => `<option value="${s.id}">${s.id === 'done' ? t('col_completed') : s.title}</option>`).join('');
    document.getElementById('t_projectStack').innerHTML = `<option value="">-- ${t('no_project')} --</option>` + appData.projectStacks.map(ps => `<option value="${ps.id}">${ps.name}</option>`).join('');
    document.getElementById('t_assignee').innerHTML = `<option value="" data-i18n="nobody">${t('nobody')}</option>` + appData.users.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
}
function toggleCustomRecurrence() { document.getElementById('custom_recurrence_div').style.display = (document.getElementById('t_recurrence').value === 'custom') ? 'flex' : 'none'; }

function renderTaskChecklistItem(container, title, done, dueDate='', assigneeId='', id='', startDate='', duration=null) {
    const div = document.createElement('div'); div.className = 'checklist-item'; 
    if(id) div.setAttribute('data-id', id);
    div.innerHTML = buildChecklistItemHTML(title, done, dueDate, assigneeId, id, startDate, duration); addModalClDragHandlers(div); container.appendChild(div);
}

function openTaskToCheckpoint(taskId, checkpointId) { openModal(taskId, checkpointId); }

function openModal(taskId = null, _scrollToCpId = null) {
    populateTaskDropdowns(); document.getElementById('taskModal').classList.add('active'); switchTaskTab('tab-general', document.querySelector('#taskModal .modal-tab-btn')); 
    const container = document.getElementById('t_checklist_container'); container.innerHTML = '';
    document.getElementById('t_file_list').innerHTML = ''; document.getElementById('t_files').value = ''; document.getElementById('t_filepath').value = ''; currentTempFiles = [];
    ['t_projectStack','t_project','t_start_date','t_start_time','t_due_date','t_due_time','t_estTime','t_spentTime','t_notes','t_filepath', 't_assignee', 't_target_budget'].forEach(elId => { const el = document.getElementById(elId); if(el) el.value = ''; });
    document.getElementById('t_desc_rte').innerHTML = '';
    const baseFolderDisplay = appData.settings.attachmentFolder || 'C:\\ProMan_Dateien\\'; document.getElementById('t_base_folder_display').innerText = baseFolderDisplay;

    const actionsContainer = document.getElementById('task_header_actions'); let actionsHtml = '';

    if (taskId) {
        document.getElementById('modalTitle').innerText = t('task_edit');   /* wird unten durch den Aufgaben-Namen ersetzt */ { const _pr = document.getElementById('t_preset_row'); if(_pr) _pr.style.display='none'; } const t_obj = appData.tasks.find(x => x.id === taskId);
        document.getElementById('taskId').value = t_obj.id; document.getElementById('btnDeleteTask').style.display = 'block'; document.getElementById('dropdownShareTask').style.display = 'block';
        
        const isCompleted = isTaskDone(t_obj);
        if(!isCompleted) {
            if(t_obj.isPaused) actionsHtml += `<button class="secondary icon-btn" onclick="setTaskState('${taskId}', 'resume')" title="${t('btn_resume')}"><i class="fas fa-play"></i></button>`;
            else actionsHtml += `<button class="secondary icon-btn" onclick="setTaskState('${taskId}', 'pause')" title="${t('btn_pause')}"><i class="fas fa-pause"></i></button>`;
            actionsHtml += `<button class="secondary icon-btn" onclick="setTaskState('${taskId}', 'complete')" title="${t('btn_complete')}"><i class="fas fa-check"></i></button>`;
        } else { actionsHtml += `<button class="secondary icon-btn" onclick="setTaskState('${taskId}', 'reopen')" title="${t('btn_reopen')}"><i class="fas fa-undo"></i></button>`; }

        renderInteractiveRating('t_interactive_rating', t_obj.rating);

        let tStartDate = '', tStartTime = '';
        if(t_obj.startDate) { if(t_obj.startDate.includes('T')) [tStartDate, tStartTime] = t_obj.startDate.split('T'); else tStartDate = t_obj.startDate; }

        let tDueDate = '', tDueTime = '';
        if(t_obj.dueDate) { if(t_obj.dueDate.includes('T')) [tDueDate, tDueTime] = t_obj.dueDate.split('T'); else tDueDate = t_obj.dueDate; }

        document.getElementById('t_projectStack').value = t_obj.projectStackId || ''; document.getElementById('t_project').value = t_obj.projectName || ''; document.getElementById('modalTitle').innerText = t_obj.projectName || t('task_edit'); document.getElementById('t_stakeholder').value = t_obj.stakeholderId || ''; document.getElementById('t_bucket').value = t_obj.bucket || ''; document.getElementById('t_status').value = t_obj.status || (appData.statuses.length ? appData.statuses[0].id : ''); document.getElementById('t_priority').value = t_obj.priority || 'medium'; document.getElementById('t_assignee').value = t_obj.assigneeId || ''; document.getElementById('t_recurrence').value = t_obj.recurrence || 'none'; toggleCustomRecurrence();
        if(t_obj.recurrence === 'custom' && t_obj.customRecurrence) { document.getElementById('t_rec_num').value = t_obj.customRecurrence.num; document.getElementById('t_rec_type').value = t_obj.customRecurrence.type; }
        
        document.getElementById('t_start_date').value = tStartDate; document.getElementById('t_start_time').value = tStartTime;
        document.getElementById('t_due_date').value = tDueDate; document.getElementById('t_due_time').value = tDueTime;
        
        document.getElementById('t_estTime').value = (t_obj.estimatedTimeBase !== undefined ? t_obj.estimatedTimeBase : (t_obj.estimatedTime || '')); document.getElementById('t_spentTime').value = t_obj.spentTime || ''; document.getElementById('t_desc_rte').innerHTML = t_obj.description || ''; document.getElementById('t_notes').value = t_obj.notes || '';
        document.getElementById('t_target_budget').value = t_obj.targetBudget || ''; { const _tl = document.getElementById('t_currency_label'); if(_tl) _tl.textContent = getGlobalCurrency(); }
        
        if(t_obj.checklist) t_obj.checklist.forEach(c => renderTaskChecklistItem(container, c.title, c.done, c.dueDate, c.assigneeId, c.id, c.startDate || '', (c.duration !== undefined ? c.duration : null))); 
        if(t_obj.files) { currentTempFiles = [...t_obj.files]; renderFileList(); }
        updateDepDisplay();
        clSumDuration();
    } else {
        document.getElementById('modalTitle').innerText = t('task_new'); document.getElementById('taskId').value = ''; document.getElementById('btnDeleteTask').style.display = 'none'; document.getElementById('dropdownShareTask').style.display = 'none';
        renderInteractiveRating('t_interactive_rating', null);
        document.getElementById('t_priority').value = 'medium'; document.getElementById('t_recurrence').value = 'none'; toggleCustomRecurrence(); { const _tl = document.getElementById('t_currency_label'); if(_tl) _tl.textContent = getGlobalCurrency(); }
        if(appData.statuses.length > 0) document.getElementById('t_status').value = appData.statuses[0].id;
        document.getElementById('t_assignee').value = appData.settings.currentUserId || '';
        populatePresetPicker('task');
        /* Standard-Voreinstellung (Preset) für neue Aufgaben anwenden */
        const _tp = (appData.taskPresets || []).find(p => p.isDefault);
        if (_tp) {
            if (_tp.priority) document.getElementById('t_priority').value = _tp.priority;
            const _sh = document.getElementById('t_stakeholder'); if (_sh && _tp.stakeholderId) _sh.value = _tp.stakeholderId;
            const _bk = document.getElementById('t_bucket'); if (_bk && _tp.bucket) _bk.value = _tp.bucket;
        }
        const _presetCl = (_tp && _tp.checklist && _tp.checklist.length) ? _presetClNorm(_tp.checklist) : _presetClNorm(appData.defaultChecklist);
        _presetCl.forEach(ci => {
            const newId = generateId();
            renderTaskChecklistItem(container, ci.title, false, '', '', newId, '', ci.duration || null);
        });
        if (_tp && _tp.note) { const _rte = document.getElementById('t_desc_rte'); if (_rte) _rte.innerHTML = _tp.note.replace(/\n/g, '<br>'); }
        document.getElementById('t_deps_display').innerHTML = 'Keine Abhängigkeiten definiert.';
        setTimeout(() => document.getElementById('t_project').focus(), 100);
    }
    actionsContainer.innerHTML = actionsHtml;

    /* Wenn ein bestimmter Checklistenpunkt angesteuert wurde: Tab "Checkliste & Dateien" öffnen und dorthin scrollen */
    if (_scrollToCpId) {
        setTimeout(() => {
            const detailBtn = document.querySelector('#taskModal .modal-tab-btn[onclick*="tab-detail"]');
            switchTaskTab('tab-detail', detailBtn);
            const container = document.getElementById('t_checklist_container');
            if (container) {
                const target = container.querySelector('.checklist-item[data-id="' + _scrollToCpId + '"]');
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.classList.add('cl-highlight');
                    setTimeout(() => target.classList.remove('cl-highlight'), 2200);
                }
            }
        }, 150);
    }
}

function closeModal() { document.getElementById('taskModal').classList.remove('active'); }
function addTaskChecklistItem() { 
    const newId = generateId();
    renderTaskChecklistItem(document.getElementById('t_checklist_container'), 'Neuer Punkt', false, '', '', newId); 
}
function deleteTask() {
    if(!confirm("Möchtest du diese Aufgabe wirklich in den Papierkorb verschieben?")) return;
    const id = document.getElementById('taskId').value; const tIdx = appData.tasks.findIndex(t_obj => t_obj.id === id);
    if(tIdx > -1) { const t_obj = appData.tasks.splice(tIdx, 1)[0]; appData.deletedItems.push({ type: 'task', data: t_obj, deletedAt: Date.now() }); }
    saveToLocal(); closeModal(); showToast('Aufgabe in den Papierkorb verschoben.');
}

/* ═══════════════════════════════════════════════════════════
   DATEIEN & ANHÄNGE (LOKAL)
   Die eigentlichen Dateiinhalte leben NUR in dieser Sitzung
   (im Arbeitsspeicher). In appData landet ausschliesslich der
   Pfad – daher enthalten Backup/JSON-Export niemals Binärdaten.
   ═══════════════════════════════════════════════════════════ */
const fileBlobCache = new Map();   /* pfad → { file, url } — bewusst NICHT Teil von appData */

function fileCacheKey(f) { return (f && (f.path || f.name)) ? String(f.path || f.name) : ''; }

function cacheFileBlob(key, file) {
    if (!key || !file) return;
    const old = fileBlobCache.get(key);
    if (old && old.url) { try { URL.revokeObjectURL(old.url); } catch (e) {} }
    fileBlobCache.set(key, { file, url: URL.createObjectURL(file) });
}
function getCachedFile(key) { return key ? fileBlobCache.get(key) : null; }
function isFileAvailable(f) { return !!getCachedFile(fileCacheKey(f)); }

function guessFileKind(nameOrPath, mime) {
    const m = (mime || '').toLowerCase();
    const ext = String(nameOrPath || '').split('.').pop().toLowerCase();
    if (m.startsWith('image/') || ['png','jpg','jpeg','gif','webp','bmp','svg','avif'].includes(ext)) return 'image';
    if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
    if (m.startsWith('video/') || ['mp4','webm','ogv','mov'].includes(ext)) return 'video';
    if (m.startsWith('audio/') || ['mp3','wav','ogg','m4a'].includes(ext)) return 'audio';
    if (m.startsWith('text/') || ['txt','md','csv','json','log','xml','html','js','css'].includes(ext)) return 'text';
    return 'other';
}

/* ── In-App-Betrachter ───────────────────────────────────── */
let _fileViewerKey = null;

function openFileViewer(key, displayName) {
    _fileViewerKey = key;
    const modal = document.getElementById('fileViewerModal');
    const titleEl = document.getElementById('fileViewerTitle');
    const body = document.getElementById('fileViewerBody');
    if (!modal || !body) return;
    titleEl.innerText = displayName || key;
    body.innerHTML = '';
    modal.classList.add('active');

    const cached = getCachedFile(key);
    if (!cached) {
        /* Nach einem Neuladen sind die Inhalte weg (sie werden absichtlich nicht gespeichert). */
        body.style.display = 'block';
        body.innerHTML = `<div style="text-align:center; padding:40px 20px; color:var(--text-muted);">
            <i class="fas fa-link" style="font-size:38px; opacity:0.35; margin-bottom:14px;"></i>
            <p style="font-size:14px; color:var(--text-main); margin-bottom:6px;">${t('fv_not_loaded')}</p>
            <p style="font-size:12px; margin-bottom:18px;">${t('fv_not_loaded_hint')}</p>
            <p style="font-size:11px; word-break:break-all; margin-bottom:18px;"><code>${escapeHtmlToday(key)}</code></p>
            <button class="secondary" onclick="document.getElementById('fileViewerPick').click()"><i class="fas fa-folder-open"></i> ${t('fv_relink')}</button>
            <input type="file" id="fileViewerPick" style="display:none;" onchange="relinkViewerFile(this)">
        </div>`;
        return;
    }

    body.style.display = 'flex';
    const kind = guessFileKind(key, cached.file.type);
    if (kind === 'image') {
        body.innerHTML = `<img src="${cached.url}" style="max-width:100%; max-height:100%; object-fit:contain; border-radius:6px;">`;
    } else if (kind === 'pdf') {
        body.style.display = 'block';
        body.innerHTML = `<iframe src="${cached.url}" style="width:100%; height:100%; border:none; background:#fff;"></iframe>`;
    } else if (kind === 'video') {
        body.innerHTML = `<video src="${cached.url}" controls style="max-width:100%; max-height:100%;"></video>`;
    } else if (kind === 'audio') {
        body.innerHTML = `<audio src="${cached.url}" controls style="width:90%;"></audio>`;
    } else if (kind === 'text') {
        cached.file.text().then(txt => {
            body.style.display = 'block';
            body.innerHTML = `<pre style="white-space:pre-wrap; word-break:break-word; font-family:var(--ff-data); font-size:12px; background:var(--surface-color); padding:15px; border-radius:6px; margin:0;">${escapeHtmlToday(txt.slice(0, 200000))}</pre>`;
        }).catch(() => { body.innerHTML = `<p style="color:var(--text-muted);">${t('fv_cannot_display')}</p>`; });
    } else {
        body.innerHTML = `<div style="text-align:center; color:var(--text-muted);">
            <i class="fas fa-file" style="font-size:38px; opacity:0.35; margin-bottom:14px;"></i>
            <p style="font-size:13px; margin-bottom:14px;">${t('fv_cannot_display')}</p>
            <a class="secondary" style="display:inline-block; padding:8px 14px; border-radius:12px; border:1px solid var(--border-color); text-decoration:none; color:var(--text-main);" href="${cached.url}" download="${escapeHtmlToday(cached.file.name)}"><i class="fas fa-download"></i> ${t('fv_download')}</a>
        </div>`;
    }
}

function relinkViewerFile(input) {
    if (!input.files || !input.files.length || !_fileViewerKey) return;
    cacheFileBlob(_fileViewerKey, input.files[0]);
    const key = _fileViewerKey;
    input.value = '';
    openFileViewer(key);
    if (typeof renderFileList === 'function' && document.getElementById('t_file_list')) renderFileList();
}

function closeFileViewer() {
    const modal = document.getElementById('fileViewerModal');
    if (modal) modal.classList.remove('active');
    const body = document.getElementById('fileViewerBody');
    if (body) body.innerHTML = '';   /* stoppt laufende Medien */
    _fileViewerKey = null;
}

/* ── Aufnahme für Export (Screenshots) ───────────────────── */
/* Liefert ein Array von DataURLs. PDFs werden seitenweise gerendert (alle Seiten). */
async function captureFileAsImages(key, maxPages = 50) {
    const cached = getCachedFile(key);
    if (!cached) return [];
    return captureFileObjectAsImages(cached.file, maxPages, cached.url);
}

/* Rendert eine Datei (Bild/PDF/Text) in ein oder mehrere PNG-DataURLs. PDFs seitenweise (alle Seiten). */
async function captureFileObjectAsImages(file, maxPages = 50, existingUrl = null) {
    if (!file) return [];
    const kind = guessFileKind(file.name, file.type);
    let tempUrl = null;
    try {
        const url = existingUrl || (tempUrl = URL.createObjectURL(file));
        if (kind === 'image') {
            const dataUrl = await new Promise((res, rej) => {
                const img = new Image();
                img.onload = () => {
                    const cv = document.createElement('canvas');
                    const maxDim = 1600;
                    let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
                    const sc = Math.min(1, maxDim / Math.max(w, h));
                    cv.width = Math.max(1, Math.round(w * sc)); cv.height = Math.max(1, Math.round(h * sc));
                    const ctx = cv.getContext('2d');
                    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
                    ctx.drawImage(img, 0, 0, cv.width, cv.height);
                    res(cv.toDataURL('image/png'));
                };
                img.onerror = rej;
                img.src = url;
            });
            return [dataUrl];
        }
        if (kind === 'pdf') {
            if (!window.pdfjsLib) return [];
            const buf = await file.arrayBuffer();
            const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
            const out = [];
            const pages = Math.min(pdf.numPages, maxPages);
            for (let p = 1; p <= pages; p++) {
                const page = await pdf.getPage(p);
                const viewport = page.getViewport({ scale: 1.6 });
                const cv = document.createElement('canvas');
                cv.width = Math.ceil(viewport.width); cv.height = Math.ceil(viewport.height);
                const ctx = cv.getContext('2d');
                ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
                await page.render({ canvasContext: ctx, viewport }).promise;
                out.push(cv.toDataURL('image/png'));
            }
            return out;
        }
        if (kind === 'text' && typeof html2canvas !== 'undefined') {
            const txt = (await file.text()).slice(0, 8000);
            const div = document.createElement('div');
            div.style.cssText = 'position:absolute; left:-9999px; top:0; width:760px; background:#fff; color:#000; padding:16px; font-family:monospace; font-size:12px; white-space:pre-wrap; word-break:break-word;';
            div.textContent = txt;
            document.body.appendChild(div);
            const cv = await html2canvas(div, { scale: 2, backgroundColor: '#ffffff' });
            document.body.removeChild(div);
            return [cv.toDataURL('image/png')];
        }
    } catch (e) { console.warn('captureFileObjectAsImages failed', e); }
    finally { if (tempUrl) { try { URL.revokeObjectURL(tempUrl); } catch (e) {} } }
    return [];
}

/* Sammelt Screenshots aller verfügbaren Anhänge einer Aufgabe. */
async function captureTaskAttachments(task) {
    const out = [];
    for (const f of (task.files || [])) {
        const key = fileCacheKey(f);
        if (!key || !getCachedFile(key)) continue;
        const imgs = await captureFileAsImages(key);
        imgs.forEach((dataUrl, i) => out.push({ label: (f.name || f.path) + (imgs.length > 1 ? ` (${t('fv_page')} ${i + 1}/${imgs.length})` : ''), dataUrl }));
    }
    return out;
}

function addFilesAsPaths() { 
    const input = document.getElementById('t_files'); if(input.files.length === 0) return; 
    const baseDir = appData.settings.attachmentFolder || 'C:\\ProMan_Dateien\\'; const folder = baseDir.endsWith('\\') || baseDir.endsWith('/') ? baseDir : baseDir + '\\';
    Array.from(input.files).forEach(file => {
        const fullPath = folder + file.name;
        currentTempFiles.push({ type: 'path', name: file.name, path: fullPath });
        /* Inhalt nur für diese Sitzung im Speicher halten (kommt nicht ins Backup) */
        cacheFileBlob(fullPath, file);
    }); 
    input.value = ''; document.getElementById('t_files_fname').innerText = t('no_file_chosen'); renderFileList(); showToast('Dateipfade generiert.');
}
function addFilePath() { const path = document.getElementById('t_filepath').value.trim(); if(path) { currentTempFiles.push({ type: 'path', path: path }); document.getElementById('t_filepath').value = ''; renderFileList(); } }
function removeFile(index) { currentTempFiles.splice(index, 1); renderFileList(); }

function renderFileList() {
    const container = document.getElementById('t_file_list'); let html = '';
    currentTempFiles.forEach((f, i) => { 
        if(f.type === 'blob' || f.type === 'missing-blob') { 
            html += `<div class="file-item" style="color:var(--danger); border:1px solid var(--danger); padding:5px 10px; margin-bottom:5px; border-radius:4px; display:flex; justify-content:space-between; align-items:center;"><span style="font-size:12px;"><i class="fas fa-exclamation-triangle"></i> ${f.name} (Veraltete Datei)</span><div><button class="secondary icon-btn" onclick="removeFile(${i})"><i class="fas fa-times"></i></button></div></div>`; 
        } else if(f.type === 'path') { 
            let safePath = f.path.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const available = isFileAvailable(f);
            const dotColor = available ? 'var(--success)' : 'var(--text-muted)';
            const dotTitle = available ? t('fv_available') : t('fv_not_loaded_short');
            html += `<div class="file-item" style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-color); padding:8px 10px; margin-bottom:5px; border-radius:4px; border: 1px solid var(--border-color);">
                <span style="font-size:13px; display:flex; align-items:center; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    <i class="fas fa-circle" style="font-size:7px; margin-right:8px; color:${dotColor};" title="${dotTitle}"></i>
                    <i class="fas fa-eye" style="margin-right:10px; color:var(--primary-color);"></i>
                    <a href="javascript:void(0)" onclick="openFileViewer('${safePath}')" style="color:var(--text-main); text-decoration:none; outline:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${t('fv_open_in_app')}" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${f.path}</a>
                </span>
                <div style="display:flex; gap:5px; margin-left:10px; flex-shrink:0;">
                    <button class="secondary icon-btn" onclick="copyRawPath('${safePath}')" title="Pfad in Zwischenablage kopieren"><i class="fas fa-copy"></i></button>
                    <button class="secondary icon-btn" style="color:var(--danger);" onclick="removeFile(${i})" title="${t('delete')}"><i class="fas fa-times"></i></button>
                </div>
            </div>`; 
        } 
    });
    container.innerHTML = html;
}

function copyRawPath(path) { 
    if (navigator.clipboard && window.issecureContext) { navigator.clipboard.writeText(path).then(() => { showToast('Pfad kopiert!'); });
    } else { const tempInput = document.createElement("input"); tempInput.value = path; document.body.appendChild(tempInput); tempInput.select(); document.execCommand("copy"); document.body.removeChild(tempInput); showToast('Pfad kopiert!'); }
}

function saveTask() {
    try {
        const id = document.getElementById('taskId').value || generateId(); const titleInput = document.getElementById('t_project').value.trim();
        if(!titleInput) { switchTaskTab('tab-general', document.querySelectorAll('#taskModal .modal-tab-btn')[0]); return showToast("Bitte Aufgabenname eingeben.", "error"); }
        
        const existingTask = appData.tasks.find(x => x.id === id);

        const clItems = document.querySelectorAll('#t_checklist_container .checklist-item');
        const checklist = Array.from(clItems).map((item, index) => {
            const sDateVal = item.querySelector('.cl-start-date')?.value || ''; const sTimeVal = item.querySelector('.cl-start-time')?.value || '';
            const durHours = parseFloat(item.querySelector('.cl-dur-hours')?.value || '0') || 0;
            const durationMin = Math.round(durHours * 60);
            /* Ohne Uhrzeit -> ganztaegig gemaess Arbeitszeiten aus den Einstellungen */
            const _sched = computeChecklistSchedule(sDateVal, sTimeVal, durationMin);
            const finalStart = _sched.startDate;
            const finalDue = _sched.dueDate;
            const _finalDuration = _sched.duration;
            const _isAllDay = _sched.allDay;
            
            let cId = item.getAttribute('data-id');
            if(!cId) cId = generateId();
            const cPreds = tempPredecessors[cId] || [];
            return { id: cId, done: item.querySelector('.cl-done')?.checked || false, title: item.querySelector('.cl-title')?.value || '', assigneeId: item.querySelector('.cl-assignee')?.value || '', startDate: finalStart, duration: _finalDuration, allDay: _isAllDay, dueDate: finalDue, predecessors: cPreds };
        });

        // Diff Checklist für Historie
        let finalNotes = document.getElementById('t_notes').value;
        if (existingTask && existingTask.checklist) {
            checklist.forEach(newItem => {
                if (newItem.done) {
                    const oldItem = existingTask.checklist.find(c => c.id === newItem.id);
                    if (oldItem && !oldItem.done) {
                        const msg = getHistoryTimestamp() + `Checklistenpunkt "${newItem.title}" erledigt.`;
                        finalNotes = finalNotes ? finalNotes + '\n' + msg : msg;
                    }
                }
            });
        }

        const newStatus = document.getElementById('t_status').value; checkTaskCompletion(id, newStatus);
        const getVal = (elementId) => { const el = document.getElementById(elementId); return el ? el.value : ''; };
        const t_rec = getVal('t_recurrence');

        const taskData = { 
            id, projectStackId: getVal('t_projectStack'), projectName: titleInput, stakeholderId: getVal('t_stakeholder'), bucket: getVal('t_bucket'), status: newStatus, priority: getVal('t_priority'), assigneeId: getVal('t_assignee'),
            recurrence: t_rec, customRecurrence: t_rec === 'custom' ? { num: getVal('t_rec_num'), type: getVal('t_rec_type') } : null, 
            startDate: getCombinedDateTime('t_start_date', 't_start_time'), 
            dueDate: getCombinedDateTime('t_due_date', 't_due_time'), 
            estimatedTimeBase: getVal('t_estTime'), estimatedTime: (function(){ const base = parseFloat(getVal('t_estTime')) || 0; const cpMin = (checklist||[]).reduce((s,c)=> s + (parseInt(c.duration,10)||0), 0); const total = base + cpMin/60; return (base || cpMin) ? String(Number(total.toFixed(2))) : ''; })(), spentTime: getVal('t_spentTime'), description: document.getElementById('t_desc_rte').innerHTML, notes: finalNotes, checklist: checklist, files: currentTempFiles,
            targetBudget: getVal('t_target_budget') !== '' ? parseFloat(getVal('t_target_budget')) : null,
            predecessors: tempPredecessors[id] || []
        };
        
        if(taskData.startDate) checkWorkdayWarning(taskData.startDate, taskData.projectName);
        if(taskData.dueDate) checkWorkdayWarning(taskData.dueDate, taskData.projectName);
        
        const index = appData.tasks.findIndex(t_obj => t_obj.id === id); let oldStatus = null;

        if (index > -1) { 
            oldStatus = appData.tasks[index].status; taskData.completedAt = appData.tasks[index].completedAt; taskData.isPaused = appData.tasks[index].isPaused; taskData.ratingCount = appData.tasks[index].ratingCount || 0; taskData.rating = appData.tasks[index].rating; taskData.ratingHistory = appData.tasks[index].ratingHistory || []; appData.tasks[index] = taskData; triggerWorkflows('task_updated', { task: taskData });
        } else {
            taskData.isPaused = false; taskData.ratingCount = 0; taskData.ratingHistory = []; appData.tasks.push(taskData); 
            if(!appData.settings.noteOrder) appData.settings.noteOrder = [];
            appData.settings.noteOrder.push(id); 
            triggerWorkflows('task_created', { task: taskData });
        }

        if(modalRatingChanged) { let targetEntity = appData.tasks.find(x => x.id === id); if(targetEntity) addRatingToEntity(targetEntity, currentModalRating); }
        if (newStatus === 'done' && !taskData.completedAt) { taskData.completedAt = Date.now(); triggerWorkflows('task_completed', { task: taskData }); } else if (newStatus !== 'done') { delete taskData.completedAt; }
        if(oldStatus && oldStatus !== newStatus) { triggerWorkflows('task_status_changed', { task: taskData, oldStatus, newStatus }); }
        
        logActivity(existingTask ? 'fa-pen' : 'fa-plus', (existingTask ? t('act_task_edited') : t('act_task_created')).replace('{n}', taskData.projectName || ''));
        saveToLocal(); closeModal(); showToast(t('toast_saved'));
    } catch(e) { console.error(e); showToast("Fehler beim Speichern: " + e.message, "error"); }
}

// --- 9. VIEWS & RENDERING ---
function switchView(view, elTarget = null) {
    if (currentView === 'notes') {
        saveCurrentNoteState();
    }

    if(view === 'schedule' || view === 'timeline') { plannerSubView = view; }

    currentView = view; 
    document.querySelectorAll('.sidebar .nav-item').forEach(el => el.classList.remove('active')); 
    document.querySelectorAll('.bottom-nav-item').forEach(el => el.classList.remove('active'));
    
    if(elTarget) {
        elTarget.classList.add('active');
    } else {
        const links = document.querySelectorAll('.sidebar .nav-item, .bottom-nav-item');
        links.forEach(l => { if(l.getAttribute('onclick') && l.getAttribute('onclick').includes(`'${view}'`)) l.classList.add('active'); });
        if(!['kanban','list','planner','notes'].includes(view)) { const mb = document.getElementById('bn_more'); if(mb) mb.classList.add('active'); }
    }

    const mgmtViews = ['stakeholder','buckets','dependencies'];
    if(mgmtViews.includes(view) && !sidebarMgmtOpen) {
        sidebarMgmtOpen = true;
        renderSidebar();
        document.querySelectorAll('.sidebar .nav-item').forEach(l => {
            if(l.getAttribute('onclick') && l.getAttribute('onclick').includes(`'${view}'`)) l.classList.add('active');
        });
    }
    
    const viewObj = appData.settings.views.find(v => v.id === view); let vTitle = viewObj ? viewObj.name : 'ProMan';
    const defaultMatch = defaultViews.find(dv => dv.id === view); if (defaultMatch && vTitle === defaultMatch.name) { vTitle = t('view_' + view); }
    
    document.getElementById('viewTitle').innerText = vTitle; 
    { const _bc = document.getElementById('btnCompactToggle'); if(_bc) _bc.style.display = view === 'kanban' ? 'block' : 'none'; }
    
    renderView(); 
    if(currentView === 'time') updateTimerDisplays();
}
function toggleCompactMode() { isCompactMode = !isCompactMode; renderView(); }

function renderView() {
    const c = document.getElementById('mainContainer'); c.innerHTML = '';
    if (currentView === 'today') renderToday(c);
    else if (currentView === 'kanban') renderKanban(c);
    else if (currentView === 'list') renderList(c);
    else if (currentView === 'notes') renderNotesView(c);
    else if (currentView === 'stakeholder') renderStakeholder(c);
    else if (currentView === 'buckets') renderBuckets(c);
    else if (currentView === 'planner') renderPlanner(c);
    else if (currentView === 'schedule') renderSchedule(c);
    else if (currentView === 'timeline') renderTimeline(c);
    else if (currentView === 'stacks') renderStacks(c);
    else if (currentView === 'checklists') renderChecklists(c, 'checklists');
    else if (currentView === 'milestones') renderChecklists(c, 'milestones');
    else if (currentView === 'time') renderTimeTracking(c);
    else if (currentView === 'dependencies') renderDependenciesView(c);
    applyTranslations();
}

function renderPlanner(c) {
    const tabs = [
        { id: 'schedule', label: '<i class="fas fa-calendar-alt"></i> Kalender' },
        { id: 'timeline', label: '<i class="fas fa-stream"></i> Gantt' }
    ];
    let tabHtml = `<div style="display:flex; gap:0; background:var(--surface-color); border:1px solid var(--border-color); border-radius:var(--radius); overflow:hidden; width:fit-content; margin-bottom:20px; flex-shrink:0;">`;
    tabs.forEach((tab, idx) => {
        const active = plannerSubView === tab.id;
        tabHtml += `<button onclick="switchPlannerTab('${tab.id}')" style="
            border:none; border-radius:0; padding:9px 22px; font-size:13px; font-weight:${active?'700':'500'};
            background:${active ? 'var(--primary-color)' : 'transparent'};
            color:${active ? '#fff' : 'var(--text-muted)'};
            cursor:pointer; display:flex; align-items:center; gap:7px; transition:all 0.18s;
            border-right:${idx < tabs.length - 1 ? '1px solid var(--border-color)' : 'none'};
        ">${tab.label}</button>`;
    });
    tabHtml += `</div>`;

    c.innerHTML = tabHtml;
    const subContainer = document.createElement('div');
    subContainer.id = 'plannerSubContainer';
    subContainer.style.cssText = 'flex:1; display:flex; flex-direction:column; min-height:0;';
    c.appendChild(subContainer);
    if(plannerSubView === 'timeline') renderTimeline(subContainer);
    else renderSchedule(subContainer);

    c.style.display = 'flex';
    c.style.flexDirection = 'column';
}

function switchPlannerTab(subView) {
    plannerSubView = subView;
    renderPlanner(document.getElementById('mainContainer'));
}

/* Ermittelt den effektiven Stundensatz einer einzelnen Zeitbuchung (Checkpunkt > Aufgabe > Stack). */
function getLogHourlyRate(log) {
    const task = appData.tasks.find(x => x.id === log.taskId);
    if (!task) return 0;
    const stack = task.projectStackId ? appData.projectStacks.find(s => s.id === task.projectStackId) : null;
    return getEffectiveHourlyRate(null, task, stack);
}

/* Währung einer Aufgabe: eigene > Stack-Währung > Standard */
function getTaskCurrency(task) {
    /* Die Währung ist global (Einstellungen) - frühere Einzelwährungen werden ignoriert. */
    return getGlobalCurrency();
}

/* Aggregiert die verbrauchten Budgetkosten (Stunden × effektiver Satz) je Kalendermonat, gruppiert nach Währung. */
function getBudgetConsumptionByMonth() {
    const byCurrencyMonth = {}; /* { currency: { 'YYYY-MM': amount } } */
    (appData.timeLogs || []).forEach(log => {
        if (!log || !log.date) return;
        const task = appData.tasks.find(x => x.id === log.taskId);
        if (!task) return;
        const rate = getLogHourlyRate(log);
        if (rate <= 0) return;
        const cur = getTaskCurrency(task);
        const month = String(log.date).slice(0, 7);
        const cost = (parseFloat(log.hours) || 0) * rate;
        if (!byCurrencyMonth[cur]) byCurrencyMonth[cur] = {};
        byCurrencyMonth[cur][month] = (byCurrencyMonth[cur][month] || 0) + cost;
    });
    return byCurrencyMonth;
}

/* Aggregiert alle erfassten Stunden je Kalendermonat (unabhängig von Sätzen/Budgets). */
function getHoursByMonth() {
    const byMonth = {};
    (appData.timeLogs || []).forEach(log => {
        if (!log || !log.date) return;
        const month = String(log.date).slice(0, 7);
        byMonth[month] = (byMonth[month] || 0) + (parseFloat(log.hours) || 0);
    });
    return byMonth;
}

/* Baut ein kleines Balken-Trenddiagramm im Hub-Stil. rows: [{label, value, title}] */
function buildBudgetTrendBars(rows, color) {
    if (!rows.length) return `<div class="wk-tr-empty">${t('today_no_bookings')}</div>`;
    const max = Math.max(0.0001, ...rows.map(r => r.value));
    return rows.map(r => `<div class="wk-tr-col" title="${escapeHtmlToday(r.title)}"><div class="wk-tr-bar"><span class="wk-tr-fill" style="height:${Math.max(2, Math.round(r.value / max * 100))}%;background:${color}"></span></div><u>${escapeHtmlToday(r.label)}</u></div>`).join('');
}

/* Speichert das globale Monatsbudget aus der Budget-Ansicht */
function saveMonthlyBudget() {
    const amtEl = document.getElementById('mb_amount');
    if (!amtEl) return;
    const raw = amtEl.value;
    appData.settings.monthlyBudget = (raw !== '' && parseFloat(raw) > 0) ? parseFloat(raw) : null;
    saveToLocal(true);
    renderTimeTracking(document.getElementById('mainContainer'));
    showToast(appData.settings.monthlyBudget ? t('mb_saved') : t('mb_cleared'));
}

/*
 * Berechnet Trend-Kennzahlen für das globale Monatsbudget in einer Währung.
 * Liefert u. a. Verbrauch des laufenden Monats, Veränderung zum Vormonat,
 * 3-Monats-Durchschnitt, Tagesdurchschnitt (Burn Rate) und Hochrechnung zum Monatsende.
 */
function getMonthlyBudgetTrends(currency) {
    const byCur = getBudgetConsumptionByMonth();
    const monthMap = byCur[currency] || {};
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const curKey = now.getFullYear() + '-' + pad(now.getMonth() + 1);
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevKey = prevDate.getFullYear() + '-' + pad(prevDate.getMonth() + 1);

    const current = monthMap[curKey] || 0;
    const previous = monthMap[prevKey] || 0;

    /* Veränderung zum Vormonat in Prozent */
    let deltaPct = null;
    if (previous > 0) deltaPct = ((current - previous) / previous) * 100;
    else if (current > 0) deltaPct = 100;

    /* Durchschnitt der letzten 3 abgeschlossenen Monate */
    const past = [];
    for (let i = 1; i <= 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const k = d.getFullYear() + '-' + pad(d.getMonth() + 1);
        past.push(monthMap[k] || 0);
    }
    const avg3 = past.reduce((a, b) => a + b, 0) / 3;

    /* Burn Rate und Hochrechnung – auf Basis der ARBEITSTAGE aus den Einstellungen,
       damit Wochenenden den Tagesschnitt nicht verfälschen. */
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const wd = (appData.settings && appData.settings.workDays && appData.settings.workDays.length)
        ? appData.settings.workDays : [1, 2, 3, 4, 5];
    let workDaysElapsed = 0, workDaysTotal = 0;
    for (let d = 1; d <= daysInMonth; d++) {
        const dow = new Date(now.getFullYear(), now.getMonth(), d).getDay();
        if (!wd.includes(dow)) continue;
        workDaysTotal++;
        if (d <= dayOfMonth) workDaysElapsed++;
    }
    const workDaysLeft = Math.max(0, workDaysTotal - workDaysElapsed);

    /*
     * Tagesverbrauch über ein gleitendes 30-Tage-Fenster statt nur über den laufenden Monat.
     * Sonst ergibt eine einzelne Buchung am Monatsanfang einen absurd hohen Tageswert
     * (z. B. 1.000 statt ~45) und damit eine völlig überzogene Hochrechnung.
     */
    const windowDays = 30;
    const winStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (windowDays - 1));
    let windowSpend = 0, windowWorkDays = 0;
    for (let i = 0; i < windowDays; i++) {
        const d = new Date(winStart.getFullYear(), winStart.getMonth(), winStart.getDate() + i);
        const key = d.getFullYear() + '-' + pad(d.getMonth() + 1);
        const dayKey = key + '-' + pad(d.getDate());
        if (wd.includes(d.getDay())) windowWorkDays++;
        /* Tageswerte aus den Buchungen dieses Tages */
        (appData.timeLogs || []).forEach(log => {
            if (!log || log.date !== dayKey) return;
            const task = appData.tasks.find(x => x.id === log.taskId);
            if (!task || getTaskCurrency(task) !== currency) return;
            const rate = getLogHourlyRate(log);
            if (rate > 0) windowSpend += (parseFloat(log.hours) || 0) * rate;
        });
    }
    const perDay = windowWorkDays > 0 ? windowSpend / windowWorkDays : 0;
    /* Hochrechnung = bereits verbraucht + erwarteter Verbrauch der verbleibenden Arbeitstage */
    const projection = current + (perDay * workDaysLeft);

    /* Alle Monate aufsteigend – für die Verlaufsgrafik */
    const allMonths = Object.keys(monthMap).sort();

    return { monthMap, allMonths, curKey, prevKey, current, previous, deltaPct, avg3, perDay, projection, dayOfMonth, daysInMonth, workDaysElapsed, workDaysTotal, workDaysLeft };
}

/*
 * Budget-Übersicht (Zeit → Budget).
 * Zeigt IMMER Kennzahlen und Grafiken – auch wenn noch gar kein Zielbudget hinterlegt ist:
 * dann werden ersatzweise die erfassten Stunden bzw. die bereits angefallenen Kosten dargestellt.
 */
function renderBudgetsOverview(c) {
    if (!c) return;

    /* ── Datenbasis ── */
    const stacksWithBudget = (appData.projectStacks || []).filter(s => parseFloat(s.targetBudget) > 0);
    const standaloneTasksWithBudget = (appData.tasks || []).filter(t_obj => !t_obj.projectStackId && parseFloat(t_obj.targetBudget) > 0);

    const items = [];
    stacksWithBudget.forEach(s => items.push({
        type: 'stack', id: s.id, name: s.name || t('unnamed'),
        target: parseFloat(s.targetBudget) || 0, currency: getGlobalCurrency(),
        consumed: getStackCostInRange(s), status: s.status
    }));
    standaloneTasksWithBudget.forEach(t_obj => items.push({
        type: 'task', id: t_obj.id, name: t_obj.projectName || t('unnamed'),
        target: parseFloat(t_obj.targetBudget) || 0, currency: getGlobalCurrency(),
        consumed: getTaskCostInRange(t_obj), status: t_obj.status
    }));
    const hasBudgets = items.length > 0;

    /* Kosten aller Aufgaben (auch ohne Zielbudget) – nach Währung */
    const costByCurrency = {};
    let totalCostAll = 0;
    (appData.tasks || []).forEach(t_obj => {
        const cost = getTaskCostInRange(t_obj);
        if (cost <= 0) return;
        const cur = getTaskCurrency(t_obj);
        costByCurrency[cur] = (costByCurrency[cur] || 0) + cost;
        totalCostAll += cost;
    });

    const rangeOn = ttRangeActive();
    const totalHours = ttRangeLogs().reduce((s, l) => s + (parseFloat(l.hours) || 0), 0);
    const consumptionByMonth = getBudgetConsumptionByMonth();
    const hoursByMonth = getHoursByMonth();
    /* Monate, die den gewählten Zeitraum berühren (Monatswerte selbst bleiben vollständig) */
    const rb = ttRangeBounds();
    const monthInRange = (m) => (!rb.from || m >= rb.from.slice(0, 7)) && (!rb.to || m <= rb.to.slice(0, 7));
    const monthsLimit = rangeOn ? 12 : 6;
    const hasCostData = Object.keys(consumptionByMonth).length > 0;

    /* Summen je Währung für budgetierte Posten */
    const byCurrency = {};
    items.forEach(it => {
        if (!byCurrency[it.currency]) byCurrency[it.currency] = { target: 0, consumed: 0, count: 0, over: 0 };
        byCurrency[it.currency].target += it.target;
        byCurrency[it.currency].consumed += it.consumed;
        byCurrency[it.currency].count++;
        if (it.consumed > it.target) byCurrency[it.currency].over++;
    });

    let html = '';

    /* ══ GLOBALES MONATSBUDGET – Eingabe + Trendauswertung ══ */
    const mbCur = getGlobalCurrency();
    const mbAmount = parseFloat(appData.settings.monthlyBudget) || 0;

    html += `<div style="background:var(--surface-color); border:1px solid var(--border-color); border-radius:var(--radius); padding:16px 20px; margin-bottom:14px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap;">
            <div style="min-width:0;">
                <div style="font-size:13px; font-weight:700;"><i class="fas fa-wallet" style="color:var(--primary-color); margin-right:8px;"></i>${t('mb_title')}</div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:3px;">${t('mb_hint')}</div>
            </div>
            <div style="display:flex; gap:6px; align-items:center; flex-shrink:0;">
                <input type="number" id="mb_amount" min="0" step="1" placeholder="0.00" value="${mbAmount > 0 ? mbAmount : ''}" style="width:120px; text-align:right;">
                <span style="display:inline-flex; align-items:center; padding:0 10px; font-size:12px; color:var(--text-muted); border:1px solid var(--border-color); border-radius:var(--radius);">${mbCur}</span>
                <button class="secondary" onclick="saveMonthlyBudget()"><i class="fas fa-check"></i> ${t('save')}</button>
            </div>
        </div>
    </div>`;

    if (mbAmount > 0) {
        const tr = getMonthlyBudgetTrends(mbCur);
        const usedPct = Math.round((tr.current / mbAmount) * 100);
        const projPct = Math.round((tr.projection / mbAmount) * 100);
        const remaining = mbAmount - tr.current;
        const usedColor = usedPct > 100 ? 'var(--danger)' : (usedPct >= 80 ? 'var(--warning)' : 'var(--success)');
        const projColor = projPct > 100 ? 'var(--danger)' : (projPct >= 80 ? 'var(--warning)' : 'var(--success)');
        const daysLeft = Math.max(0, tr.workDaysLeft || 0);
        const dailyAllowance = daysLeft > 0 ? Math.max(0, remaining) / daysLeft : 0;

        const arrow = (v) => v === null ? '' : (v > 0 ? '<i class="fas fa-arrow-up"></i>' : (v < 0 ? '<i class="fas fa-arrow-down"></i>' : '<i class="fas fa-minus"></i>'));
        const deltaColor = tr.deltaPct === null ? 'var(--text-muted)' : (tr.deltaPct > 0 ? 'var(--danger)' : (tr.deltaPct < 0 ? 'var(--success)' : 'var(--text-muted)'));
        const deltaTxt = tr.deltaPct === null ? '–' : (tr.deltaPct > 0 ? '+' : '') + ttNum(Math.round(tr.deltaPct * 10) / 10) + '%';
        const avgDelta = tr.avg3 > 0 ? ((tr.current - tr.avg3) / tr.avg3) * 100 : null;
        const avgDeltaTxt = avgDelta === null ? '–' : (avgDelta > 0 ? '+' : '') + ttNum(Math.round(avgDelta * 10) / 10) + '%';
        const avgDeltaColor = avgDelta === null ? 'var(--text-muted)' : (avgDelta > 0 ? 'var(--danger)' : 'var(--success)');

        /* Verlaufsbalken der letzten 6 Monate – eingefärbt gegen das Monatsbudget, mit Ziellinie */
        const monthsShown = (() => {
            const keys = [];
            const now = new Date(); const pad = n => String(n).padStart(2, '0');
            for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); keys.push(d.getFullYear() + '-' + pad(d.getMonth() + 1)); }
            return keys;
        })();
        const maxVal = Math.max(mbAmount, ...monthsShown.map(m => tr.monthMap[m] || 0));
        const targetPct = maxVal > 0 ? (mbAmount / maxVal) * 100 : 0;
        const histBars = monthsShown.map(m => {
            const val = tr.monthMap[m] || 0;
            const h = maxVal > 0 ? Math.max(2, Math.round(val / maxVal * 100)) : 2;
            const col = val > mbAmount ? 'var(--danger)' : (val >= mbAmount * 0.8 ? 'var(--warning)' : 'var(--success)');
            const isCur = m === tr.curKey;
            return `<div class="wk-tr-col" title="${m}: ${ttNum(val)} ${mbCur}${val > mbAmount ? ' — ' + t('mb_over_budget') : ''}"><div class="wk-tr-bar"><span class="wk-tr-fill" style="height:${h}%;background:${col};${isCur ? 'opacity:.75;' : ''}"></span></div><u>${m.slice(5)}.${m.slice(2, 4)}</u></div>`;
        }).join('');

        html += `<section class="wk-graphs">
            <div class="wk-graph-card">
                <div class="wk-graph-h"><b>${t('mb_current_month')}</b><u>${t('mb_day_of')} ${tr.dayOfMonth}/${tr.daysInMonth}</u></div>
                <div style="display:flex; align-items:baseline; gap:8px; margin:6px 0 10px;">
                    <span style="font-size:24px; font-weight:700; color:${usedColor};">${usedPct}%</span>
                    <span style="font-size:12px; color:var(--text-muted);">${t('budget_used_pct')}</span>
                </div>
                <div class="pb-container" style="height:10px;"><div class="pb-fill" style="width:${Math.min(usedPct, 100)}%; background:${usedColor};"></div></div>
                <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); margin-top:8px;">
                    <span><b style="color:var(--text-main);">${ttNum(tr.current)}</b> / ${ttNum(mbAmount)} ${mbCur}</span>
                    <span>${remaining >= 0 ? t('budget_remaining') + ': ' + ttNum(remaining) : t('budget_over') + ': ' + ttNum(Math.abs(remaining))} ${mbCur}</span>
                </div>
            </div>

            <div class="wk-graph-card">
                <div class="wk-graph-h"><b>${t('mb_history')} (${mbCur})</b><u>${t('mb_vs_budget')}</u></div>
                <div class="wk-trend" style="position:relative;">
                    ${targetPct > 0 && targetPct <= 100 ? `<div title="${t('mb_title')}: ${ttNum(mbAmount)} ${mbCur}" style="position:absolute; left:0; right:0; bottom:calc(${Math.min(targetPct, 100)}% * 0.72 + 18px); border-top:2px dashed var(--primary-color); opacity:.7; z-index:2; pointer-events:none;"></div>` : ''}
                    ${histBars}
                </div>
                <div style="font-size:10.5px; color:var(--text-muted); margin-top:6px;"><span style="display:inline-block; width:14px; border-top:2px dashed var(--primary-color); vertical-align:middle;"></span> ${t('mb_target_line')}</div>
            </div>

            <div class="wk-graph-card">
                <div class="wk-graph-h"><b>${t('mb_trends')}</b><u>${t('mb_forecast')}</u></div>
                <div style="display:flex; flex-direction:column; gap:9px; margin-top:4px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px;">
                        <span style="color:var(--text-muted);">${t('mb_vs_prev')}</span>
                        <b style="color:${deltaColor};">${arrow(tr.deltaPct)} ${deltaTxt}</b>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px;">
                        <span style="color:var(--text-muted);">${t('mb_vs_avg3')}</span>
                        <b style="color:${avgDeltaColor};">${arrow(avgDelta)} ${avgDeltaTxt}</b>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px;">
                        <span style="color:var(--text-muted);">${t('mb_burn_rate')}</span>
                        <b>${ttNum(tr.perDay)} ${mbCur}</b>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px;">
                        <span style="color:var(--text-muted);">${t('mb_daily_left')}</span>
                        <b>${ttNum(dailyAllowance)} ${mbCur}</b>
                    </div>
                    <div style="border-top:1px solid var(--border-color); padding-top:9px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; margin-bottom:5px;">
                            <span style="color:var(--text-muted);">${t('mb_projection')}</span>
                            <b style="color:${projColor};">${ttNum(tr.projection)} ${mbCur} · ${projPct}%</b>
                        </div>
                        <div class="pb-container" style="height:6px;"><div class="pb-fill" style="width:${Math.min(projPct, 100)}%; background:${projColor};"></div></div>
                        <div style="font-size:10.5px; color:${projColor}; margin-top:5px;">
                            ${projPct > 100 ? '<i class="fas fa-exclamation-triangle"></i> ' + t('mb_will_exceed') : '<i class="fas fa-check-circle"></i> ' + t('mb_on_track')}
                        </div>
                    </div>
                </div>
            </div>
        </section>`;
    }

    /* ══ GRAFIKEN OBEN (Hub-Stil) – immer sichtbar ══ */
    let graphsHtml = '';

    /* Karte 1: Trend – Kosten je Monat, sonst ersatzweise Stunden je Monat */
    if (hasCostData) {
        const primaryCur = Object.keys(consumptionByMonth).sort((a, b) => {
            const sa = Object.values(consumptionByMonth[a]).reduce((x, y) => x + y, 0);
            const sb = Object.values(consumptionByMonth[b]).reduce((x, y) => x + y, 0);
            return sb - sa;
        })[0];
        const monthMap = consumptionByMonth[primaryCur] || {};
        const shown = Object.keys(monthMap).filter(monthInRange).sort().slice(-monthsLimit);
        const rows = shown.map(m => ({ label: m.slice(5) + '.' + m.slice(2, 4), value: monthMap[m], title: m + ': ' + ttNum(monthMap[m]) + ' ' + primaryCur }));
        graphsHtml += `<div class="wk-graph-card">
            <div class="wk-graph-h"><b>${t('budgets_trend')} (${primaryCur})</b><u>${t('budgets_last_months')}</u></div>
            <div class="wk-trend">${buildBudgetTrendBars(rows, '#cca300')}</div>
        </div>`;
    } else {
        const shown = Object.keys(hoursByMonth).filter(monthInRange).sort().slice(-monthsLimit);
        const rows = shown.map(m => ({ label: m.slice(5) + '.' + m.slice(2, 4), value: hoursByMonth[m], title: m + ': ' + ttNum(hoursByMonth[m]) + ' h' }));
        graphsHtml += `<div class="wk-graph-card">
            <div class="wk-graph-h"><b>${t('budgets_hours_trend')}</b><u>${t('budgets_last_months')}</u></div>
            <div class="wk-trend">${buildBudgetTrendBars(rows, 'var(--primary-color)')}</div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:8px;"><i class="fas fa-info-circle"></i> ${t('budgets_no_rates_hint')}</div>
        </div>`;
    }

    /* Karte 2: Bisher angefallene Kosten / erfasste Stunden */
    const costLines = Object.keys(costByCurrency).sort().map(cur =>
        `<div style="display:flex; justify-content:space-between; font-size:12px; margin-top:4px;"><span style="color:var(--text-muted);">${cur}</span><b>${ttNum(costByCurrency[cur])}</b></div>`
    ).join('');
    graphsHtml += `<div class="wk-graph-card">
        <div class="wk-graph-h"><b>${rangeOn ? t('tr_costs_in_range') : t('budgets_costs_so_far')}</b><u>${ttNum(totalHours)} h</u></div>
        <div style="display:flex; align-items:baseline; gap:8px; margin:6px 0 4px;">
            <span style="font-size:24px; font-weight:700; color:var(--primary-color);">${totalCostAll > 0 ? ttNum(totalCostAll) : ttNum(totalHours)}</span>
            <span style="font-size:12px; color:var(--text-muted);">${totalCostAll > 0 ? t('budgets_total_costs') : t('budgets_total_hours')}</span>
        </div>
        ${costLines || `<div style="font-size:11px; color:var(--text-muted); margin-top:6px;">${t('budgets_no_costs_yet')}</div>`}
    </div>`;

    /* Karte 3: Budget-Auslastung, sonst Hinweis-Karte */
    if (hasBudgets) {
        /* Eine Karte je Währung – so bleiben Überschreitungen in JEDER Währung sichtbar. */
        Object.keys(byCurrency).sort((a, b) => byCurrency[b].target - byCurrency[a].target).forEach(cur => {
            const sums = byCurrency[cur];
            const pct = sums.target > 0 ? Math.round((sums.consumed / sums.target) * 100) : 0;
            const remaining = sums.target - sums.consumed;
            const barColor = pct > 100 ? 'var(--danger)' : (pct >= 80 ? 'var(--warning)' : 'var(--success)');
            graphsHtml += `<div class="wk-graph-card">
                <div class="wk-graph-h"><b>${t('budgets_overview')} (${cur})</b><u>${sums.count} ${sums.count === 1 ? t('budgets_item') : t('budgets_items')}</u></div>
                <div style="display:flex; align-items:baseline; gap:8px; margin:6px 0 10px;">
                    <span style="font-size:24px; font-weight:700; color:${barColor};">${pct}%</span>
                    <span style="font-size:12px; color:var(--text-muted);">${t('budget_used_pct')}</span>
                </div>
                <div class="pb-container" style="height:10px;"><div class="pb-fill" style="width:${Math.min(pct, 100)}%; background:${barColor};"></div></div>
                <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); margin-top:8px;">
                    <span><b style="color:var(--text-main);">${ttNum(sums.consumed)}</b> / ${ttNum(sums.target)} ${cur}</span>
                    <span>${remaining >= 0 ? t('budget_remaining') + ': ' + ttNum(remaining) : t('budget_over') + ': ' + ttNum(Math.abs(remaining))} ${cur}</span>
                </div>
                ${sums.over > 0 ? `<div style="font-size:11px; color:var(--danger); margin-top:6px;"><i class="fas fa-exclamation-triangle"></i> ${sums.over} ${sums.over === 1 ? t('budgets_over_one') : t('budgets_over_many')}</div>` : ''}
            </div>`;
        });
    } else {
        const openStacks = (appData.projectStacks || []).filter(s => s.status !== 'completed').length;
        const openTasks = (appData.tasks || []).filter(t_obj => !isTaskDone(t_obj)).length;
        graphsHtml += `<div class="wk-graph-card">
            <div class="wk-graph-h"><b>${t('budgets_overview')}</b><u>${t('budgets_not_configured')}</u></div>
            <div style="display:flex; align-items:baseline; gap:8px; margin:6px 0 10px;">
                <span style="font-size:24px; font-weight:700; color:var(--text-muted);">–</span>
                <span style="font-size:12px; color:var(--text-muted);">${t('budgets_no_target')}</span>
            </div>
            <div style="font-size:11px; color:var(--text-muted); line-height:1.6;">
                <div><i class="fas fa-folder" style="width:14px;"></i> ${openStacks} ${t('budgets_open_stacks')}</div>
                <div><i class="fas fa-tasks" style="width:14px;"></i> ${openTasks} ${t('budgets_open_tasks')}</div>
            </div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:10px; padding-top:8px; border-top:1px solid var(--border-color);">
                <i class="fas fa-lightbulb"></i> ${t('budgets_empty_hint')}
            </div>
        </div>`;
    }

    html += `<section class="wk-graphs">${graphsHtml}</section>`;

    /* ══ DETAILLISTE ══ */
    if (hasBudgets) {
        const sortedItems = items.slice().sort((a, b) => {
            const pa = a.target > 0 ? a.consumed / a.target : 0;
            const pb = b.target > 0 ? b.consumed / b.target : 0;
            return pb - pa;
        });
        html += `<div style="background:var(--surface-color); border:1px solid var(--border-color); border-radius:var(--radius); padding:20px; margin-top:6px;">
            <h3 style="font-size:15px; margin-bottom:${rangeOn ? '4px' : '16px'};"><i class="fas fa-list-ul" style="color:var(--primary-color); margin-right:8px;"></i>${t('budgets_details')}</h3>
            ${rangeOn ? `<div style="font-size:11.5px; color:var(--text-muted); margin-bottom:14px;"><i class="fas fa-calendar-days"></i> ${t('tr_consumed_in_range')}: ${ttRangeLabel()}</div>` : ''}
            <div style="display:flex; flex-direction:column; gap:14px;">`;
        sortedItems.forEach(it => {
            const pct = it.target > 0 ? Math.round((it.consumed / it.target) * 100) : 0;
            const barColor = pct > 100 ? 'var(--danger)' : (pct >= 80 ? 'var(--warning)' : 'var(--success)');
            const remaining = it.target - it.consumed;
            const icon = it.type === 'stack' ? 'fa-folder' : 'fa-tasks';
            const openFn = it.type === 'stack' ? `openStackModal('${it.id}')` : `openModal('${it.id}')`;
            const isDone = it.status === 'completed' || it.status === 'done';
            html += `<div style="cursor:pointer; ${isDone ? 'opacity:0.6;' : ''}" onclick="${openFn}">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; gap:10px;">
                    <span style="font-size:13px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><i class="fas ${icon}" style="color:var(--primary-color); margin-right:7px;"></i>${escapeHtmlToday(it.name)}</span>
                    <span style="font-size:12px; color:${barColor}; font-weight:600; white-space:nowrap; flex-shrink:0;">${pct}%</span>
                </div>
                <div class="pb-container" style="height:8px;"><div class="pb-fill" style="width:${Math.min(pct, 100)}%; background:${barColor};"></div></div>
                <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); margin-top:4px;">
                    <span>${ttNum(it.consumed)} / ${ttNum(it.target)} ${it.currency}</span>
                    <span>${remaining >= 0 ? t('budget_remaining') + ': ' + ttNum(remaining) : t('budget_over') + ': ' + ttNum(Math.abs(remaining))} ${it.currency}</span>
                </div>
            </div>`;
        });
        html += `</div></div>`;
    }

    /* Kostentreiber – immer, sofern Kosten oder Stunden vorhanden sind */
    const drivers = (appData.tasks || []).map(t_obj => {
        const cost = getTaskCostInRange(t_obj);
        const hours = ttRangeLogs().filter(l => l.taskId === t_obj.id).reduce((s, l) => s + (parseFloat(l.hours) || 0), 0);
        const st = t_obj.projectStackId ? (appData.projectStacks || []).find(x => x.id === t_obj.projectStackId) : null;
        return { id: t_obj.id, name: t_obj.projectName || t('unnamed'), stackName: st ? st.name : '', cost, hours, currency: getTaskCurrency(t_obj), done: isTaskDone(t_obj) };
    }).filter(d => d.cost > 0 || d.hours > 0).sort((a, b) => (b.cost - a.cost) || (b.hours - a.hours)).slice(0, 10);

    if (drivers.length > 0) {
        const maxDriver = Math.max(...drivers.map(d => d.cost > 0 ? d.cost : d.hours));
        html += `<div style="background:var(--surface-color); border:1px solid var(--border-color); border-radius:var(--radius); padding:20px; margin-top:16px;">
            <h3 style="font-size:15px; margin-bottom:16px;"><i class="fas fa-chart-bar" style="color:var(--primary-color); margin-right:8px;"></i>${t('budgets_cost_drivers')}${rangeOn ? ` <span style="font-weight:normal; font-size:12px; color:var(--text-muted);">· ${ttRangeLabel()}</span>` : ''}</h3>
            <div style="display:flex; flex-direction:column; gap:12px;">`;
        drivers.forEach(d => {
            const val = d.cost > 0 ? d.cost : d.hours;
            const unit = d.cost > 0 ? d.currency : 'h';
            const w = maxDriver > 0 ? Math.max(2, Math.round(val / maxDriver * 100)) : 0;
            html += `<div style="cursor:pointer; ${d.done ? 'opacity:0.6;' : ''}" onclick="openModal('${d.id}')">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; gap:10px;">
                    <span style="font-size:12.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><i class="fas fa-tasks" style="color:var(--primary-color); margin-right:6px;"></i>${escapeHtmlToday(d.name)}${d.stackName ? `<span style="color:var(--text-muted); font-size:11px;"> · ${escapeHtmlToday(d.stackName)}</span>` : ''}</span>
                    <span style="font-size:11.5px; color:var(--text-muted); white-space:nowrap; flex-shrink:0;"><b style="color:var(--text-main);">${ttNum(val)}</b> ${unit}${d.cost > 0 ? ' · ' + ttNum(d.hours) + ' h' : ''}</span>
                </div>
                <div class="pb-container" style="height:6px;"><div class="pb-fill" style="width:${w}%; background:#cca300;"></div></div>
            </div>`;
        });
        html += `</div></div>`;
    } else if (rangeOn) {
        html += `<div style="text-align:center; padding:28px 20px; color:var(--text-muted); background:var(--surface-color); border:1px solid var(--border-color); border-radius:var(--radius); margin-top:16px;">
            <p style="font-size:14px;"><i class="fas fa-circle-info"></i> ${t('tr_empty')}</p>
            <p style="font-size:12px; margin-top:6px;">${t('tr_empty_hint_budget')}</p>
        </div>`;
    } else if (!hasBudgets) {
        html += `<div style="text-align:center; padding:40px 20px; color:var(--text-muted); background:var(--surface-color); border:1px solid var(--border-color); border-radius:var(--radius); margin-top:6px;">
            <i class="fas fa-coins" style="font-size:34px; opacity:0.3; margin-bottom:12px;"></i>
            <p style="font-size:14px;">${t('budgets_empty')}</p>
            <p style="font-size:12px; margin-top:6px;">${t('budgets_empty_hint')}</p>
        </div>`;
    }

    c.innerHTML = html;
    c.style.overflowY = 'auto';
}

// DEPENDENCIES VIEW (NEW)
function renderDependenciesView(c) {
    if (typeof window.depLevels === 'undefined') window.depLevels = { stack: true, task: true, checklist: true };
    const L = window.depLevels;
    const hideDone = appData.settings && appData.settings.globalHideCompleted;

    /* ---- Alle Elemente als Knoten einsammeln (einheitliches .id / .predecessors Modell) ---- */
    const nodes = [];      /* {id, type, name, done, stackId, preds[]} */
    const byId = {};
    const addNode = (n) => { nodes.push(n); byId[n.id] = n; };

    appData.projectStacks.forEach(sk => {
        if (!L.stack) return;
        addNode({ id: sk.id, type: 'stack', name: sk.name || 'Stack', done: sk.status === 'completed', obj: sk,
                  color: sk.color || 'var(--text-muted)', stackId: sk.id, preds: (sk.predecessors || []).slice() });
    });
    appData.tasks.forEach(tk => {
        if (!L.task) return;
        if (hideDone && isTaskDone(tk)) return;
        addNode({ id: tk.id, type: 'task', name: tk.projectName || 'Aufgabe', done: isTaskDone(tk), obj: tk,
                  stackId: tk.projectStackId || '', preds: (tk.predecessors || []).slice() });
        if (L.checklist && tk.checklist) {
            tk.checklist.forEach(ci => {
                if (!ci.id) return;
                if (hideDone && ci.done) return;
                addNode({ id: ci.id, type: 'checklist', name: ci.title || 'Punkt', done: !!ci.done, obj: ci,
                          stackId: tk.projectStackId || '', parentTask: tk.id, preds: (ci.predecessors || []).slice() });
            });
        }
    });
    /* Stack-Checklisten (Milestones) */
    appData.projectStacks.forEach(sk => {
        if (!L.stack || !L.checklist || !sk.checklist) return;
        sk.checklist.forEach(ci => {
            if (!ci.id) return;
            if (hideDone && ci.done) return;
            addNode({ id: ci.id, type: 'milestone', name: ci.title || 'Meilenstein', done: !!ci.done, obj: ci,
                      stackId: sk.id, parentStack: sk.id, preds: (ci.predecessors || []).slice() });
        });
    });

    /* ---- Kopfzeile mit Ebenen-Schaltern ---- */
    let html = `<div class="dep-wrap">
        <div class="dep-toolbar">
            <div class="dep-title"><i class="fas fa-diagram-project"></i> ${t('view_dependencies')}</div>
            <div class="dep-legend">
                <span><i class="dep-lg-start">&gt;</i> ${t('dep_start')}</span>
                <span><i class="fas fa-lock dep-lg-lock"></i> ${t('dep_end')}</span>
                <span class="dep-hint"><i class="fas fa-hand-pointer"></i> ${t('dep_drag_hint2')}</span>
            </div>
            <div class="dep-levels">
                <button class="dep-lvl dep-connect-btn ${window.depConnectMode ? 'on' : ''}" onclick="depToggleConnectMode()"><i class="fas fa-link"></i> ${t('dep_connect_mode')}</button>
                <label class="dep-sort"><i class="fas fa-sort"></i>
                    <select onchange="depSetSort(this.value)">
                        <option value="manual" ${(window.depSortKey||'manual')==='manual'?'selected':''}>${t('sort_manual')}</option>
                        <option value="name" ${window.depSortKey==='name'?'selected':''}>${t('sort_name')}</option>
                        <option value="due" ${window.depSortKey==='due'?'selected':''}>${t('sort_due')}</option>
                        <option value="priority" ${window.depSortKey==='priority'?'selected':''}>${t('sort_priority')}</option>
                    </select>
                </label>
            </div>
        </div>`;

    if (!nodes.length) {
        html += `<div class="dep-empty"><i class="fas fa-diagram-project"></i><b>${t('dep_empty_title')}</b><span>${t('dep_empty_sub')}</span></div></div>`;
        c.innerHTML = html;
        return;
    }

    /* ---- Layout auf freier Fläche: Spalten nach Abhängigkeitstiefe (Längengrad), Zeilen frei ---- */
    const depthCache = {};
    const calcDepth = (id, seen) => {
        if (depthCache[id] !== undefined) return depthCache[id];
        seen = seen || new Set();
        if (seen.has(id)) return 0;
        seen.add(id);
        const n = byId[id];
        if (!n || !n.preds.length) return (depthCache[id] = 0);
        let mx = 0;
        n.preds.forEach(p => { if (byId[p]) mx = Math.max(mx, calcDepth(p, seen) + 1); });
        return (depthCache[id] = mx);
    };
    nodes.forEach(n => n.depth = calcDepth(n.id));

    /* Gruppen-Schlüssel je Knoten: Stack (Rahmen) und Aufgabe (Checkpunkte) */
    const groupKey = (n) => n.stackId || '_none';
    const subKey = (n) => (n.type === 'checklist' && n.parentTask) ? n.parentTask : (n.type === 'task' ? n.id : (n.type === 'milestone' && n.parentStack ? n.parentStack : '~'));
    const groupOrder = [];
    nodes.forEach(n => { const g = groupKey(n); if (!groupOrder.includes(g)) groupOrder.push(g); });
    const groupRank = {}; groupOrder.forEach((g, i) => groupRank[g] = i);

    /* nach Tiefe gruppieren */
    const cols = {};
    let maxDepth = 0;
    nodes.forEach(n => { (cols[n.depth] = cols[n.depth] || []).push(n); maxDepth = Math.max(maxDepth, n.depth); });

    /* Innerhalb jeder Spalte nach Stack-Gruppe, dann Aufgabe sortieren → optische Cluster */
    const typeRank = { stack: 0, milestone: 1, task: 2, checklist: 3 };
    const _sortKey = window.depSortKey || 'manual';
    const _prioRank = { high: 0, medium: 1, low: 2 };
    const sortCompare = (a, b) => {
        if (_sortKey === 'name') return String(a.name||'').localeCompare(String(b.name||''));
        if (_sortKey === 'due') { const ad = (a.obj && a.obj.dueDate) || '\uffff'; const bd = (b.obj && b.obj.dueDate) || '\uffff'; return String(ad).localeCompare(String(bd)); }
        if (_sortKey === 'priority') { const ap = _prioRank[a.obj && a.obj.priority] ?? 1; const bp = _prioRank[b.obj && b.obj.priority] ?? 1; return ap - bp; }
        return 0;   /* manual: Reihenfolge unverändert */
    };
    Object.keys(cols).forEach(d => {
        cols[d].sort((a, b) => {
            if (groupRank[groupKey(a)] !== groupRank[groupKey(b)]) return groupRank[groupKey(a)] - groupRank[groupKey(b)];
            /* Bei aktiver Sortierung innerhalb der Gruppe direkt danach sortieren (Checkpunkte bleiben durch subKey bei ihrer Aufgabe) */
            if (_sortKey !== 'manual') {
                const sa = subKey(a), sb = subKey(b);
                if (sa !== sb) { const c = sortCompare(a, b); if (c !== 0) return c; return String(sa).localeCompare(String(sb)); }
                if ((typeRank[a.type] || 9) !== (typeRank[b.type] || 9)) return (typeRank[a.type] || 9) - (typeRank[b.type] || 9);
                return sortCompare(a, b);
            }
            const sa = subKey(a), sb = subKey(b);
            if (sa !== sb) return String(sa).localeCompare(String(sb));
            return (typeRank[a.type] || 9) - (typeRank[b.type] || 9);
        });
    });

    const NODE_W = 200, NODE_H = 72, CP_H = 46, V_GAP_IN = 8, H_PAD = 40, V_PAD = 42;
    const COL_W_IN = 224;                 /* Spaltenbreite innerhalb einer Gruppe (nach Tiefe) */
    const GROUP_GAP_X = 90, GROUP_GAP_Y = 90;   /* große Abstände zwischen den Gruppen */
    const MAX_GROUP_COLS = 3;             /* höchstens 3 Gruppen nebeneinander */
    const nodeHeight = (n) => (n.type === 'checklist' ? CP_H : NODE_H);

    /* 1) Knoten in Blöcke einteilen.
          Regel: Ein Checklistenpunkt gehört IMMER in den Block seiner Elternaufgabe.
          Eine Aufgabe gehört in ihren Stack-Block, sonst in einen eigenen Block. */
    const nodeById = {};
    nodes.forEach(n => { nodeById[n.id] = n; });

    const blockKeyOf = (n) => {
        if (n.type === 'checklist' && n.parentTask) {
            const parent = nodeById[n.parentTask];
            if (parent) return blockKeyOf(parent);          /* Punkt folgt seiner Aufgabe */
            return '_orphan_' + n.id;
        }
        const g = groupKey(n);
        if (g && g !== '_none') return 'grp_' + g;          /* Stack-Gruppe */
        return '_solo_' + n.id;                             /* alleinstehend */
    };

    const blocksMap = {};
    const blockOrder = [];
    nodes.forEach(n => {
        const bk = blockKeyOf(n);
        if (!blocksMap[bk]) { blocksMap[bk] = []; blockOrder.push(bk); }
        blocksMap[bk].push(n);
    });

    /* Reihenfolge: erst die Stack-Gruppen in ihrer bekannten Ordnung, dann der Rest */
    const groupBlocks = [];
    const seen = new Set();
    groupOrder.forEach(g => {
        if (g === '_none') return;
        const bk = 'grp_' + g;
        if (blocksMap[bk] && !seen.has(bk)) { seen.add(bk); groupBlocks.push({ key: g, members: blocksMap[bk], standalone: false }); }
    });
    blockOrder.forEach(bk => {
        if (seen.has(bk)) return;
        seen.add(bk);
        groupBlocks.push({ key: bk, members: blocksMap[bk], standalone: bk.indexOf('grp_') !== 0 });
    });

    /* 2) Interne Anordnung je Block: EINE Spalte, eng untereinander in der Reihenfolge
          1. Stack (falls vorhanden), 2. Aufgabe, 3. alle zugehörigen Checklistenpunkte. */
    groupBlocks.forEach(blk => {
        const mem = blk.members;
        const stacksIn = mem.filter(n => n.type === 'stack');
        const milestonesIn = mem.filter(n => n.type === 'milestone');
        const tasksIn = mem.filter(n => n.type === 'task');
        const cpsIn = mem.filter(n => n.type === 'checklist');
        /* verwaiste Checkpunkte (Elternaufgabe nicht in dieser Gruppe) hinten anhängen */
        const taskIds = new Set(tasksIn.map(t => t.id));
        const orphanCps = cpsIn.filter(c => !c.parentTask || !taskIds.has(c.parentTask));

        const cmp = (a, b) => (_sortKey !== 'manual' ? sortCompare(a, b) : 0);
        stacksIn.sort(cmp); milestonesIn.sort(cmp); tasksIn.sort(cmp);

        const ordered = [];
        stacksIn.forEach(s => ordered.push(s));
        milestonesIn.forEach(m => ordered.push(m));
        tasksIn.forEach(tk => {
            ordered.push(tk);
            cpsIn.filter(c => c.parentTask === tk.id).sort(cmp).forEach(c => ordered.push(c));
        });
        orphanCps.sort(cmp).forEach(c => ordered.push(c));

        let yy = 0;
        ordered.forEach((n, i) => {
            /* etwas Luft vor einer Aufgabe mit Checkpunkten (Platz für Hülle + Label) */
            const hasCps = n.type === 'task' && cpsIn.some(c => c.parentTask === n.id);
            if (i > 0 && hasCps) yy += 20;
            n._lx = 0; n._ly = yy;
            yy += nodeHeight(n) + V_GAP_IN;
        });
        blk.w = NODE_W; blk.h = yy + 22;   /* etwas Platz für die Gruppen-Beschriftung */
    });

    /* 3) Blöcke im Raster anordnen: max. 3 Spalten, Zeilenhöhe = höchster Block der Zeile */
    let gx = 0, gy = 0, colIdx = 0, rowMaxH = 0;
    const LABEL_SP = 22;
    groupBlocks.forEach(blk => {
        if (colIdx >= MAX_GROUP_COLS) { colIdx = 0; gx = 0; gy += rowMaxH + GROUP_GAP_Y; rowMaxH = 0; }
        const ox = H_PAD + gx, oy = V_PAD + gy + LABEL_SP;
        blk.members.forEach(n => { n.x = ox + n._lx; n.y = oy + n._ly; });
        blk.ox = ox; blk.oy = V_PAD + gy;   /* für die Hülle inkl. Label */
        rowMaxH = Math.max(rowMaxH, blk.h + LABEL_SP);
        gx += blk.w + GROUP_GAP_X;
        colIdx += 1;
    });

    /* ---- Gruppen-Rahmen berechnen ---- */
    const HULL_PAD = 12;
    const hulls = [];
    const boundsOf = (list) => {
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        list.forEach(n => { x1 = Math.min(x1, n.x); y1 = Math.min(y1, n.y); x2 = Math.max(x2, n.x + NODE_W); y2 = Math.max(y2, n.y + nodeHeight(n)); });
        return { x1, y1, x2, y2 };
    };
    groupOrder.forEach(g => {
        if (g === '_none') return;
        const members = nodes.filter(n => groupKey(n) === g);
        if (members.length < 2) return;
        const bk = appData.projectStacks.find(x => x.id === g);
        const b = boundsOf(members);
        hulls.push({ kind: 'stack', x: b.x1 - HULL_PAD, y: b.y1 - HULL_PAD - 16, w: (b.x2 - b.x1) + HULL_PAD * 2, h: (b.y2 - b.y1) + HULL_PAD * 2 + 16, name: bk ? bk.name : 'Stack', color: (bk && bk.color) ? bk.color : 'var(--primary-color)' });
    });
    const tasksWithCp = {};
    nodes.forEach(n => { if (n.type === 'checklist' && n.parentTask) (tasksWithCp[n.parentTask] = tasksWithCp[n.parentTask] || []).push(n); });
    Object.keys(tasksWithCp).forEach(tid => {
        const taskNode = byId[tid];
        if (!taskNode) return;
        const members = [taskNode].concat(tasksWithCp[tid]);
        const b = boundsOf(members);
        hulls.push({ kind: 'task', x: b.x1 - 8, y: b.y1 - 8, w: (b.x2 - b.x1) + 16, h: (b.y2 - b.y1) + 16, name: taskNode.name || '', color: 'var(--wk-graphite)' });
    });

    let canvasW = 0, canvasH = 0;
    nodes.forEach(n => { canvasW = Math.max(canvasW, n.x + NODE_W); canvasH = Math.max(canvasH, n.y + nodeHeight(n)); });
    hulls.forEach(hz => { canvasW = Math.max(canvasW, hz.x + hz.w); canvasH = Math.max(canvasH, hz.y + hz.h); });
    canvasW += H_PAD; canvasH += V_PAD;
    /* ---- Kanten (SVG) zeichnen: von Vorgänger (rechts) zu Abhängigem (links) ---- */
    let edges = '';
    nodes.forEach(n => {
        n.preds.forEach(pid => {
            const p = byId[pid];
            if (!p) return;
            const x1 = p.x + NODE_W, y1 = p.y + nodeHeight(p) / 2;
            const x2 = n.x, y2 = n.y + nodeHeight(n) / 2;
            const dx = x2 - x1;
            const dy = Math.abs(y2 - y1);
            let d;
            if (dx < 60) {
                /* Vorgänger und Abhängiger liegen (nahezu) übereinander – z. B. zwei
                   Checklistenpunkte derselben Aufgabe. Die Linie holt weit nach rechts aus,
                   damit sie neben der Punkte-Liste sichtbar ist und nicht dahinter verschwindet. */
                const bow = Math.max(70, dy * 0.9);
                d = `M ${x1} ${y1} C ${x1 + bow} ${y1}, ${x2 + bow} ${y2}, ${x2} ${y2}`;
            } else {
                const mx = (x1 + x2) / 2;
                d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
            }
            edges += `<path class="dep-edge dep-edge-${n.type}" d="${d}" marker-end="url(#depArrow)"></path>`;
        });
    });

    const typeIcon = { stack: 'fa-folder', task: 'fa-tasks', checklist: 'fa-check-square', milestone: 'fa-flag' };

    /* ---- Knoten-Karten ---- */
    let nodeHtml = '';
    nodes.forEach(n => {
        const hasPreds = n.preds.filter(p => byId[p]).length > 0;
        const isDependedOn = nodes.some(o => o.preds.includes(n.id));
        const locked = (n.type === 'task' || n.type === 'stack') ? isEntityLocked(n.id) : false;
        const cls = ['dep-gnode', 'type-' + n.type, n.done ? 'done' : '', locked ? 'locked' : '',
                     !hasPreds ? 'is-start' : '', !isDependedOn ? 'is-end' : ''].filter(Boolean).join(' ');
        const click = n.type === 'stack' ? `openStackModal('${n.id}')` : (n.type === 'task' ? `openModal('${n.id}')` : '');
        nodeHtml += `<div class="${cls} ${window.depConnectMode && window.depTapSource === n.id ? 'dep-tap-src' : ''}" style="left:${n.x}px; top:${n.y}px; width:${NODE_W}px; height:${nodeHeight(n)}px"
            data-depid="${n.id}" data-deptype="${n.type}" draggable="true"
            ondragstart="depDragStart(event,'${n.id}','${n.type}')" ondragend="depDragEnd(event)"
            ondragover="depDragOver(event)" ondragleave="depDragLeave(event)" ondrop="depDrop(event,'${n.id}','${n.type}')"
            onclick="depNodeClick(event,'${n.id}','${n.type}')">
            ${!hasPreds
                ? ``
                : `<span class="dep-gport in linked ${locked ? 'locked' : ''}" title="${t('dep_unlink_hint')}" onclick="event.stopPropagation(); depClearPreds('${n.id}')"><i class="fas fa-lock"></i></span>`}
            <span class="dep-gport out ${isDependedOn ? '' : 'end'}" title="${!isDependedOn ? t('dep_end') : ''}"></span>
            <div class="dep-gnode-ic"><i class="fas ${typeIcon[n.type]}"></i></div>
            <div class="dep-gnode-body">
                <span class="dep-gnode-name">${escapeHtmlToday(n.name)}</span>
                <span class="dep-gnode-type">${n.type === 'stack' ? 'Stack' : (n.type === 'task' ? t('task_title') : t('view_checklists'))}</span>
            </div>
            ${n.done ? '<i class="fas fa-check-circle dep-gnode-done"></i>' : ''}
        </div>`;
    });

    html += `<div class="dep-canvas-wrap"><div class="dep-canvas" style="width:${canvasW}px; height:${canvasH}px">
        <svg class="dep-edges" width="${canvasW}" height="${canvasH}">
            <defs><marker id="depArrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L8,3 L0,6 Z" fill="#ffc93c"></path></marker></defs>
            ${edges}
        </svg>
        ${hulls.map(hz => `<div class="dep-hull dep-hull-${hz.kind}" style="left:${hz.x}px; top:${hz.y}px; width:${hz.w}px; height:${hz.h}px; --hc:${hz.color}">${hz.name ? `<span class="dep-hull-label" title="${escapeHtmlToday(hz.name)}"><i class='fas ${hz.kind === 'task' ? 'fa-tasks' : 'fa-folder'}'></i><span class="dep-hull-labeltxt">${escapeHtmlToday(hz.name)}</span></span>` : ''}</div>`).join('')}
        ${nodeHtml}
    </div></div>`;

    html += `</div>`;
    c.innerHTML = html;
}

let depDragSource = null;
window.depConnectMode = window.depConnectMode || false;
window.depTapSource = null;

/* Verbinden-Modus umschalten (v.a. für Touch-Geräte, wo Drag&Drop nicht greift) */
function depToggleConnectMode() {
    window.depConnectMode = !window.depConnectMode;
    window.depTapSource = null;
    document.body.classList.toggle('dep-connect-active', window.depConnectMode);
    if (window.depConnectMode) showToast(t('dep_connect_on'), 'info');
    renderView();
}

/* Klick/Tap auf einen Knoten: im Verbinden-Modus zwei-Schritt-Verknüpfung, sonst Modal öffnen */
function depNodeClick(ev, id, type) {
    if (window.depConnectMode) {
        ev.stopPropagation();
        ev.preventDefault();
        if (!window.depTapSource) {
            /* erster Tap = Quelle wählen */
            window.depTapSource = id;
            const el = ev.currentTarget;
            document.querySelectorAll('.dep-gnode.dep-tap-src').forEach(x => x.classList.remove('dep-tap-src'));
            if (el && el.classList) el.classList.add('dep-tap-src');
            showToast(t('dep_tap_target'), 'info');
            return;
        }
        if (window.depTapSource === id) {
            /* nochmal auf Quelle getippt = Auswahl aufheben */
            window.depTapSource = null;
            renderView();
            return;
        }
        /* zweiter Tap = Ziel → Verknüpfung anlegen (Ziel hängt von Quelle ab) */
        const srcId = window.depTapSource;
        window.depTapSource = null;
        depConnect(srcId, id);
        return;
    }
    /* Normaler Modus: Stack/Aufgabe öffnen; Checkpunkt → Elternaufgabe an der Stelle */
    if (type === 'stack') openStackModal(id);
    else if (type === 'task') openModal(id);
    else if (type === 'checklist') {
        /* Elternaufgabe des Checkpunkts finden */
        const parent = appData.tasks.find(tk => (tk.checklist || []).some(ci => ci.id === id));
        if (parent) openTaskToCheckpoint(parent.id, id);
    }
}

/* Verknüpfung zwischen zwei beliebigen Elementen herstellen (gemeinsame Logik für Drag & Tap) */
function depConnect(srcId, targetId) {
    if (!srcId || srcId === targetId) return;
    const target = depFindEntity(targetId);
    const source = depFindEntity(srcId);
    if (!target || !source) return;
    if (!target.obj.predecessors) target.obj.predecessors = [];
    if (target.obj.predecessors.includes(srcId)) { showToast(t('dep_exists'), 'info'); return; }
    if (depWouldCycle(targetId, srcId)) { showToast(t('dep_cycle'), 'warning'); return; }
    target.obj.predecessors.push(srcId);
    if (typeof tempPredecessors === 'object') tempPredecessors[targetId] = [...target.obj.predecessors];
    saveToLocal(true);
    showToast(t('dep_linked').replace('{a}', source.name || '').replace('{b}', target.name || ''), 'success');
    renderView();
}

function depDragStart(ev, id, type) {
    depDragSource = { id, type };
    ev.dataTransfer.effectAllowed = 'link';
    try { ev.dataTransfer.setData('text/plain', id); } catch(e) {}
    if (ev.currentTarget && ev.currentTarget.classList) ev.currentTarget.classList.add('dep-dragging');
    document.body.classList.add('dep-linking');
    ev.stopPropagation();
}

function depDragEnd(ev) {
    if (ev.currentTarget && ev.currentTarget.classList) ev.currentTarget.classList.remove('dep-dragging');
    document.body.classList.remove('dep-linking');
    document.querySelectorAll('.dep-drop-ok, .dep-drop-bad').forEach(e => e.classList.remove('dep-drop-ok','dep-drop-bad'));
    depDragSource = null;
}

function depDragOver(ev) {
    if (!depDragSource) return;
    const tgt = ev.currentTarget;
    const tId = tgt.getAttribute('data-depid');
    if (tId === depDragSource.id) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'link';
    if (!tgt.classList.contains('dep-drop-ok') && !tgt.classList.contains('dep-drop-bad'))
        tgt.classList.add('dep-drop-ok');
}

function depDragLeave(ev) {
    ev.currentTarget.classList.remove('dep-drop-ok','dep-drop-bad');
}

/* Element (Aufgabe, Stack, Checkliste, Meilenstein) anhand id finden */
function depFindEntity(id) {
    let tk = appData.tasks.find(x => x.id === id);
    if (tk) return { obj: tk, name: tk.projectName, kind: 'task' };
    let sk = appData.projectStacks.find(x => x.id === id);
    if (sk) return { obj: sk, name: sk.name, kind: 'stack' };
    for (const parent of appData.tasks) {
        if (parent.checklist) { const ci = parent.checklist.find(x => x.id === id); if (ci) return { obj: ci, name: ci.title, kind: 'checklist' }; }
    }
    for (const parent of appData.projectStacks) {
        if (parent.checklist) { const ci = parent.checklist.find(x => x.id === id); if (ci) return { obj: ci, name: ci.title, kind: 'milestone' }; }
    }
    return null;
}

/* Zyklusprüfung über das einheitliche predecessors-Modell */
function depWouldCycle(targetId, predId) {
    const visited = new Set();
    const walk = (cur) => {
        if (cur === targetId) return true;
        if (visited.has(cur)) return false;
        visited.add(cur);
        const e = depFindEntity(cur);
        if (!e || !e.obj.predecessors) return false;
        return e.obj.predecessors.some(walk);
    };
    return walk(predId);
}

function depDrop(ev, targetId, targetType) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.currentTarget.classList.remove('dep-drop-ok','dep-drop-bad');
    document.body.classList.remove('dep-linking');
    const src = depDragSource;
    depDragSource = null;
    if (!src || src.id === targetId) return;
    depConnect(src.id, targetId);
}

function depRemovePred(id, predId) {
    const e = depFindEntity(id);
    if (!e || !e.obj.predecessors) return;
    const i = e.obj.predecessors.indexOf(predId);
    if (i > -1) {
        e.obj.predecessors.splice(i, 1);
        if (typeof tempPredecessors === 'object') tempPredecessors[id] = [...e.obj.predecessors];
        saveToLocal(true);
        renderView();
    }
}

function depClearPreds(id) {
    const e = depFindEntity(id);
    if (!e || !e.obj.predecessors || !e.obj.predecessors.length) return;
    if (!confirm(t('dep_unlink_confirm'))) return;
    e.obj.predecessors = [];
    if (typeof tempPredecessors === 'object') tempPredecessors[id] = [];
    saveToLocal(true);
    showToast(t('dep_unlinked'), 'success');
    renderView();
}

function depSetSort(key) {
    window.depSortKey = key || 'manual';
    renderView();
}

function depToggleLevel(key) {
    if (typeof window.depLevels === 'undefined') window.depLevels = { stack: true, task: true, checklist: true };
    const next = !window.depLevels[key];
    const others = Object.keys(window.depLevels).filter(k => k !== key).some(k => window.depLevels[k]);
    if (!next && !others) return;
    window.depLevels[key] = next;
    renderView();
}


// NOTIZEN VIEW

// --- NOTIZEN SPEICHERN ---
function saveCurrentNoteState() {
    const activeRte = document.getElementById('active_note_rte');
    if (activeRte && activeNoteId) {
        const activeItem = [...appData.tasks, ...appData.projectStacks].find(x => x.id === activeNoteId);
        if (activeItem) {
             if (activeItem.projectName !== undefined) {
                 activeItem.description = activeRte.innerHTML;
             } else {
                 activeItem.notes = activeRte.innerHTML;
             }
             // Speichern ohne Neuladen (verhindert, dass der Cursor beim Tippen springt)
             localStorage.setItem('proman_v2_data', JSON.stringify(appData));
        }
    }
}

// Wird aufgerufen, wenn der Texteditor den Fokus verliert (onblur)
function saveInlineNote(type, id, el) {
    saveCurrentNoteState();
}

function selectNoteItem(id) {
    saveCurrentNoteState();
    
    activeNoteId = id; 
    mobileNotesDetailActive = true; 
    renderView();
}

function closeNotesDetailMobile() { mobileNotesDetailActive = false; renderView(); }

function renderNotesView(c) {
    let items = [];
    getFilteredTasks().forEach(t_obj => items.push({ type: 'task', id: t_obj.id, name: t_obj.projectName, dueDate: t_obj.dueDate, priority: t_obj.priority||'medium', obj: t_obj }));
    getFilteredStacks().forEach(s => items.push({ type: 'stack', id: s.id, name: s.name, dueDate: s.dueDate, priority: 'medium', obj: s }));

    if (notessortKey === 'name') { items.sort((a,b) => a.name.localeCompare(b.name)); } 
    else if (notessortKey === 'dueDate') { items.sort((a,b) => { if(!a.dueDate && !b.dueDate) return 0; if(!a.dueDate) return 1; if(!b.dueDate) return -1; return new Date(a.dueDate) - new Date(b.dueDate); }); } 
    else if (notessortKey === 'priority') { const pMap = { high: 3, medium: 2, low: 1 }; items.sort((a,b) => (pMap[b.priority] || 0) - (pMap[a.priority] || 0)); } 
    else if (notessortKey === 'manual') { const order = appData.settings.noteOrder || []; items.sort((a,b) => { let idxA = order.indexOf(a.id); let idxB = order.indexOf(b.id); if(idxA === -1) idxA = 99999; if(idxB === -1) idxB = 99999; return idxA - idxB; }); }

    if(!activeNoteId && items.length > 0) activeNoteId = items[0].id; const activeItem = items.find(i => i.id === activeNoteId);

    let layoutClass = mobileNotesDetailActive ? 'notes-layout show-detail' : 'notes-layout';
    
    let html = `<div class="${layoutClass}">`;
    html += `<div id="notesLeftPane" class="notes-left-pane" onscroll="notesListScrollPos = this.scrollTop">
        <div style="display:flex; justify-content:flex-start; margin-bottom:15px; flex-wrap:wrap; gap:10px;">
            <button class="secondary ${notessortKey==='manual'?'active':''}" onclick="notessortKey='manual'; notesListScrollPos=0; renderView()"><i class="fas fa-hand-paper"></i> ${appData.settings.language === 'de' ? 'Manuell' : 'Manual'}</button>
            <button class="secondary ${notessortKey==='name'?'active':''}" onclick="notessortKey='name'; notesListScrollPos=0; renderView()"><i class="fas fa-sort-alpha-down"></i> ${t('name')}</button>
            <button class="secondary ${notessortKey==='dueDate'?'active':''}" onclick="notessortKey='dueDate'; notesListScrollPos=0; renderView()"><i class="far fa-calendar-alt"></i> ${t('due')}</button>
            <button class="secondary ${notessortKey==='priority'?'active':''}" onclick="notessortKey='priority'; notesListScrollPos=0; renderView()"><i class="fas fa-exclamation"></i> ${t('priority')}</button>
        </div>`;

    if(items.length === 0) { html += `<p style="color:var(--text-muted); text-align:center; font-size:12px; margin-top:20px;">Keine Einträge gefunden.</p>`; } 
    else {
        items.forEach(item => {
            const isTask = item.type === 'task'; const icon = isTask ? 'fa-tasks' : 'fa-folder'; const isActive = item.id === activeNoteId;
            const color = isTask ? 'var(--primary-color)' : 'var(--primary-color)'; const bg = isActive ? 'var(--primary-lightest)' : 'var(--surface-color)';
            const border = isActive ? `border-left: 4px solid ${color};` : 'border-left: 4px solid transparent;';
            const isCompleted = isTask ? isTaskDone(item.obj) : (item.obj.status === 'completed'); const isPaused = isTask ? (item.obj.isPaused && !isCompleted) : (item.obj.status === 'paused');
            const compOpacity = isCompleted ? 'opacity:0.6;' : ''; const pausedIcon = isPaused ? '<i class="fas fa-pause" style="color:var(--warning); margin-right:4px;" title="Pausiert"></i>' : '';
            
            html += `<div class="draggable-item" draggable="${notessortKey === 'manual'}" ondragstart="event.dataTransfer.setData('text/plain', '${item.id}'); event.dataTransfer.setData('type', 'note-card');" ondrop="handleNoteCardDrop(event, this, '${item.id}')" ondragover="handleCardDragOver(event, this, false)" ondragleave="handleCardDragLeave(this)" onclick="selectNoteItem('${item.id}')" style="padding:10px; margin-bottom:6px; background:${bg}; ${border} border-radius:var(--radius); border-top:1px solid var(--border-color); border-right:1px solid var(--border-color); border-bottom:1px solid var(--border-color); cursor:pointer; display:flex; justify-content:space-between; align-items:center; ${compOpacity}">
                        <div style="font-weight:${isActive?'bold':'normal'}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;" title="${item.name}"><i class="fas ${icon}" style="color:${color}; margin-right:8px;"></i>${pausedIcon}${item.name}</div>
                     </div>`;
        });
    }
    html += `</div><div class="notes-right-pane">`;
    
    if(!activeItem) { html += `<div style="margin:auto; color:var(--text-muted); display:flex; flex-direction:column; align-items:center;"><i class="fas fa-file-alt" style="font-size:48px; color:var(--border-color); margin-bottom:15px;"></i> Bitte wähle links einen Eintrag aus.</div>`; } 
    else {
        const isTask = activeItem.type === 'task'; const content = isTask ? (activeItem.obj.description || '') : (activeItem.obj.notes || '');
        const icon = isTask ? 'fa-tasks' : 'fa-folder'; const isCompleted = isTask ? isTaskDone(activeItem.obj) : (activeItem.obj.status === 'completed');
        const isPaused = isTask ? (activeItem.obj.isPaused && !isCompleted) : (activeItem.obj.status === 'paused'); const pausedIcon = isPaused ? '<i class="fas fa-pause" style="color:var(--warning); margin-right:8px;" title="Pausiert"></i>' : '';
        
        html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--border-color); padding-bottom:15px; flex-wrap:wrap; gap:10px;">
                    <h2 style="margin:0; display:flex; align-items:center;">
                        <button class="secondary icon-btn notes-mobile-back" onclick="closeNotesDetailMobile()"><i class="fas fa-arrow-left"></i></button>
                        <i class="fas ${icon}" style="color:var(--primary-color); margin-right:10px;"></i> ${pausedIcon}${activeItem.name}
                    </h2>
                    <div style="display:flex; align-items:center; gap:15px;">
                        <span style="font-size:12px; color:var(--text-muted);"><i class="far fa-calendar-alt"></i> ${t('due')}: ${activeItem.dueDate||'-'}</span>
                        <button class="secondary icon-btn" onclick="${isTask?`openModal('${activeItem.id}')`:`openStackModal('${activeItem.id}')`}" title="Gesamte Aufgabe/Stack öffnen"><i class="fas fa-external-link-alt"></i> ${t('open_details')}</button>
                    </div>
                 </div>`;
        
        html += `
        <div style="display:flex; flex-direction:column; flex:1; min-height: 400px;">
            <div class="rte-toolbar" style="margin-top:0; border-radius:var(--radius) var(--radius) 0 0;">
                <button class="secondary icon-btn" onmousedown="event.preventDefault();" onclick="document.execCommand('bold', false, null);"><i class="fas fa-bold"></i></button>
                <button class="secondary icon-btn" onmousedown="event.preventDefault();" onclick="document.execCommand('italic', false, null);"><i class="fas fa-italic"></i></button>
                <button class="secondary icon-btn" onmousedown="event.preventDefault();" onclick="document.execCommand('underline', false, null);"><i class="fas fa-underline"></i></button>
                <button class="secondary icon-btn" onmousedown="event.preventDefault();" onclick="document.execCommand('strikeThrough', false, null);" title="Durchgestrichen"><i class="fas fa-strikethrough"></i></button>
                <button class="secondary icon-btn" onmousedown="event.preventDefault();" onclick="toggleRTEHighlight()"><i class="fas fa-highlighter"></i></button>
                <div style="min-width:1px; height:15px; background:var(--border-color); margin:0 5px;"></div>
                <button class="secondary icon-btn" onmousedown="event.preventDefault();" onclick="document.execCommand('insertUnorderedList', false, null);"><i class="fas fa-list-ul"></i></button>
                <button class="secondary icon-btn" onmousedown="event.preventDefault();" onclick="document.execCommand('insertOrderedList', false, null);"><i class="fas fa-list-ol"></i></button>
                
                <div class="dropdown click-only" style="margin:0;">
                    <button class="secondary icon-btn" onmousedown="event.preventDefault();" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'block' ? 'none' : 'block'" title="Tabelle einfügen & bearbeiten"><i class="fas fa-table"></i> <i class="fas fa-caret-down" style="font-size:10px;"></i></button>
                    <div class="dropdown-content" style="width: 180px; padding:5px; z-index: 10001;" onclick="event.stopPropagation()">
                        <a onmousedown="event.preventDefault();" onclick="rtfTableAction('create'); this.parentNode.style.display='none';"><i class="fas fa-plus"></i> Neue Tabelle</a>
                        <hr style="margin:5px 0; border-top:1px solid var(--border-color);">
                        <div style="font-size:10px; color:var(--text-muted); padding:2px 10px;">Zeilen</div>
                        <a onmousedown="event.preventDefault();" onclick="rtfTableAction('addRowAbove');"><i class="fas fa-arrow-up"></i> Davor einfügen</a>
                        <a onmousedown="event.preventDefault();" onclick="rtfTableAction('addRowBelow');"><i class="fas fa-arrow-down"></i> Danach einfügen</a>
                        <a onmousedown="event.preventDefault();" onclick="rtfTableAction('delRow');" style="color:var(--danger);"><i class="fas fa-trash"></i> Zeile löschen</a>
                        <hr style="margin:5px 0; border-top:1px solid var(--border-color);">
                        <div style="font-size:10px; color:var(--text-muted); padding:2px 10px;">Spalten</div>
                        <a onmousedown="event.preventDefault();" onclick="rtfTableAction('addColLeft');"><i class="fas fa-arrow-left"></i> Davor einfügen</a>
                        <a onmousedown="event.preventDefault();" onclick="rtfTableAction('addColRight');"><i class="fas fa-arrow-right"></i> Danach einfügen</a>
                        <a onmousedown="event.preventDefault();" onclick="rtfTableAction('delCol');" style="color:var(--danger);"><i class="fas fa-trash"></i> Spalte löschen</a>
                        <hr style="margin:5px 0; border-top:1px solid var(--border-color);">
                        <a onmousedown="event.preventDefault();" onclick="rtfTableAction('toggleHeader');"><i class="fas fa-heading"></i> Kopfzeile an/aus</a>
                    </div>
                </div>

                <div style="min-width:1px; height:15px; background:var(--border-color); margin:0 5px;"></div>
                
                <div class="dropdown click-only" style="margin:0;">
                    <button class="secondary icon-btn" onmousedown="event.preventDefault();" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'block' ? 'none' : 'block'" title="Formatierung"><i class="fas fa-paragraph"></i> <i class="fas fa-caret-down" style="font-size:10px;"></i></button>
                    <div class="dropdown-content" style="width: 150px; padding:5px; z-index: 10001;" onclick="event.stopPropagation()">
                        <a onmousedown="event.preventDefault();" onclick="document.execCommand('formatBlock', false, 'H3'); this.parentNode.style.display='none';"><span style="font-size:16px; font-weight:bold;">Titel</span></a>
                        <a onmousedown="event.preventDefault();" onclick="document.execCommand('formatBlock', false, 'H4'); this.parentNode.style.display='none';"><span style="font-size:14px; font-weight:bold;">Überschrift</span></a>
                        <a onmousedown="event.preventDefault();" onclick="document.execCommand('formatBlock', false, 'P'); this.parentNode.style.display='none';"><span style="font-size:12px;">Standard-Text</span></a>
                    </div>
                </div>
                <button class="secondary icon-btn" onmousedown="event.preventDefault();" onclick="let url = prompt('Link URL:'); if(url) document.execCommand('createLink', false, url);"><i class="fas fa-link"></i></button>
            </div>
            <div id="active_note_rte" class="rte-content" contenteditable="true" onblur="saveInlineNote('${activeItem.type}', '${activeItem.id}', this)" style="border-top:none; border-radius:0 0 var(--radius) var(--radius); flex:1; min-height:300px; max-height:none; padding:20px;">${content}</div>
        </div>`;

        /* Checklistenpunkte in der Notizen-Ansicht entfernt — hier nur die Notiz anzeigen */
    }
    
    html += `</div></div>`; c.innerHTML = html;
    const leftPane = document.getElementById('notesLeftPane'); if (leftPane) leftPane.scrollTop = notesListScrollPos;
    updateDepDisplay();
}

// CHECKLISTEN VIEW
function renderChecklists(c, mode = 'checklists') {
    const _onlyStacks = (mode === 'milestones');
    let html = `<div style="max-width: 900px; margin: 0 auto;">`;
    html += `<div style="display:flex; justify-content:flex-start; margin-bottom:20px; flex-wrap:wrap; gap:10px;">
        <button class="secondary ${clSortKey==='none'?'active':''}" onclick="clSortKey='none'; renderView()"><i class="fas fa-list"></i> ${t('default')}</button>
        <button class="secondary ${clSortKey==='today'?'active':''}" onclick="clSortKey='today'; renderView()"><i class="fas fa-calendar-day"></i> ${t('today')}</button>
        <button class="secondary ${clSortKey==='dueDate'?'active':''}" onclick="clSortKey='dueDate'; renderView()"><i class="far fa-calendar-alt"></i> ${t('due_date')}</button>
        <button class="secondary ${clSortKey==='priority'?'active':''}" onclick="clSortKey='priority'; renderView()"><i class="fas fa-exclamation"></i> ${t('priority')}</button>
    </div>`;

    let hasItems = false;

    const renderGroup = (parentName, parentType, parentId, checklist, isCompleted, isPaused, stackName = null, priority = null, dueDate = null, assigneeId = null) => {
        const list = checklist || [];
        if(list.length === 0) return '';

        hasItems = true; let opacity = isCompleted ? '0.6' : '1'; let stackBadge = stackName ? `<span class="stack-badge" style="margin-left: 10px; font-size: 11px; margin-bottom:0;"><i class="fas fa-folder"></i> ${stackName}</span>` : '';
        const pausedIcon = isPaused ? '<i class="fas fa-pause" style="color:var(--warning); margin-right:6px;" title="Pausiert"></i>' : '';
        const lockedIcon = isEntityLocked(parentId) ? '<i class="fas fa-lock" style="color:var(--text-muted); font-size:12px; margin-right:6px;" title="Gesperrt durch Abhängigkeit"></i>' : '';

        let metaBadges = '';
        if (clSortKey === 'dueDate') {
            let dateStr = dueDate ? new Date(dueDate).toLocaleDateString('de-DE') : '-';
            if (dateStr === 'Invalid Date') dateStr = dueDate;
            metaBadges += `<span class="badge" style="background:var(--border-color); color:var(--text-main); margin-left: 10px; margin-bottom:0;"><i class="far fa-calendar-alt"></i> ${t('due_date')}: ${dateStr}</span>`;
        } else if (clSortKey === 'priority' && priority) {
            const pLabels = { low: t('prio_low'), medium: t('prio_med'), high: t('prio_high') };
            metaBadges += `<span class="badge ${priority}" style="margin-left: 10px; margin-bottom:0;">Prio: ${pLabels[priority] || t('prio_med')}</span>`;
        }

        let avatarHtml = getAvatarHtml(assigneeId, 'avatar-sm'); if(avatarHtml) avatarHtml = `<span style="margin-left:10px;">${avatarHtml}</span>`;

        let h = `<div style="background:var(--surface-color); padding:15px; border-radius:var(--radius); border:1px solid var(--border-color); margin-bottom:15px; opacity:${opacity};">
            <h4 style="margin-bottom:10px; display:flex; align-items:center; gap:8px; cursor:pointer; flex-wrap:wrap;" onclick="${parentType==='stack' ? `openStackModal('${parentId}')` : `openModal('${parentId}')`}" title="${t('task_edit')}">
                <i class="fas ${parentType === 'stack' ? 'fa-folder' : 'fa-tasks'}" style="color:var(--primary-color)"></i>
                ${lockedIcon}${pausedIcon}${parentName} ${isCompleted ? '(Abgeschlossen)' : ''}
                ${stackBadge} ${metaBadges} ${avatarHtml}
            </h4><div style="display:flex; flex-direction:column; gap:5px;">`;
        
        if(list.length === 0) { h += `<span style="font-size:12px; color:var(--text-muted); padding-left:25px;">${t('no_cl_points')}</span>`; } 
        else {
            list.forEach((item) => {
                const originalIdx = item._origIdx; let d = '', time = '';
                /* Wie im Modal: Datum/Uhrzeit beziehen sich auf den START; ältere Punkte ohne Start nutzen das Fälligkeitsdatum */
                const _src = item.startDate || item.dueDate || '';
                if(_src) { if(_src.includes('T')) [d, time] = _src.split('T'); else d = _src; }
                const _durH = (parseInt(item.duration, 10) || 0) / 60;
                const _durVal = _durH > 0 ? (Math.round(_durH * 100) / 100) : '';
                let userOpts = `<option value="">-- Benutzer --</option>` + appData.users.map(u => `<option value="${u.id}" ${u.id===item.assigneeId?'selected':''}>${u.name}</option>`).join('');
                let lineThrough = item.done ? 'text-decoration:line-through; opacity:0.6;' : '';
                let clLocked = isEntityLocked(item.id) ? '<i class="fas fa-lock" style="color:var(--text-muted); font-size:10px; margin-right:4px;" title="Gesperrt durch Abhängigkeit"></i>' : '';

                h += `
                <div class="checklist-item draggable-item" draggable="false" data-parent-type="${parentType}" data-parent-id="${parentId}" style="margin-left:25px;" data-id="${item.id}">
                    <div class="cl-swipe-bg"><i class="fas fa-trash"></i></div>
                    <div class="cl-swipe-container" tabindex="-1">
                        <div class="cl-main-row" style="${lineThrough}">
                            <i class="fas fa-grip-vertical cl-drag"></i>
                            <input type="checkbox" class="cl-done" ${item.done ? 'checked' : ''} onchange="updateGlobalCl('${parentType}', '${parentId}', ${originalIdx}, 'done', this.checked)">
                            <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; justify-content: center;">
                                <div style="display: flex; align-items: center; width: 100%;">
                                    ${clLocked}<input type="text" class="cl-title" value="${item.title}" placeholder="..." onblur="updateGlobalCl('${parentType}', '${parentId}', ${originalIdx}, 'title', this.value)" onkeypress="if(event.key==='Enter') this.blur()">
                                    <i class="fas fa-info-circle cl-info-btn" onclick="this.closest('.checklist-item').classList.toggle('show-details')"></i>
                                </div>
                            </div>
                        </div>
                        <div class="cl-controls">
                            ${getAvatarHtml(item.assigneeId, 'avatar-sm')}
                            <select class="cl-assignee" onchange="updateGlobalCl('${parentType}', '${parentId}', ${originalIdx}, 'assigneeId', this.value)">${userOpts}</select>
                            <span class="cl-datespan cl-startspan"><input type="date" class="cl-g-date cl-start-date" value="${d}" onchange="updateGlobalClSchedule('${parentType}', '${parentId}', ${originalIdx}, this)"><input type="time" class="cl-g-time cl-start-time" value="${time}" onchange="updateGlobalClSchedule('${parentType}', '${parentId}', ${originalIdx}, this)"></span>
                            <span class="cl-datespan cl-durspan"><span class="cl-datelbl">Zeit</span><input type="number" class="cl-g-dur cl-dur-hours" value="${_durVal}" min="0" max="999" step="0.25" title="Dauer in Stunden" onchange="updateGlobalClSchedule('${parentType}', '${parentId}', ${originalIdx}, this)"><span class="cl-durunit">Std</span></span>
                            <button class="secondary icon-btn" style="padding:4px; font-size:11px; margin-left:4px; color:var(--text-muted);" onclick="openDependencyModalForCl(this)" title="Abhängigkeiten für diesen Punkt"><i class="fas fa-link"></i></button>
                            <button class="secondary icon-btn cl-delete-btn" style="color:var(--danger); margin-left:10px;" onclick="deleteGlobalCl('${parentType}', '${parentId}', ${originalIdx})" title="Löschen"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                    <div class="cl-deps-display" style="padding: 0 35px 4px 35px; width: 100%; display: flex; flex-wrap: wrap; gap: 4px;"></div>
                </div>`;
            });
        }
        return h + `</div><button class="secondary" style="margin-top:10px; font-size:12px; margin-left:25px;" onclick="addGlobalCl('${parentType}', '${parentId}')"><i class="fas fa-plus"></i> ${t('add_point')}</button></div>`;
    };

    const fStacks = _onlyStacks ? getFilteredStacks() : []; const fTasks = _onlyStacks ? [] : getFilteredTasks(); let renderItems = [];
    fStacks.forEach(s => { let clMapped = (s.checklist || []).map((c, i) => { let copy = {...c}; copy._origIdx = i; return copy; }); const isDone = s.status === 'completed'; renderItems.push({ type: 'stack', obj: s, name: s.name, id: s.id, dueDate: s.dueDate||'', priority: 'medium', cl: clMapped, isDone: isDone, isPaused: s.status === 'paused', stackName: null, assigneeId: s.assigneeId }); });
    fTasks.forEach(t_obj => {
        let sName = null; if(t_obj.projectStackId) { const stack = appData.projectStacks.find(x => x.id === t_obj.projectStackId); if(stack) sName = stack.name; }
        let clMapped = (t_obj.checklist || []).map((c, i) => { let copy = {...c}; copy._origIdx = i; return copy; }); const isDone = isTaskDone(t_obj);
        renderItems.push({ type: 'task', obj: t_obj, name: t_obj.projectName, id: t_obj.id, dueDate: t_obj.dueDate||'', priority: t_obj.priority||'medium', cl: clMapped, isDone: isDone, isPaused: t_obj.isPaused && !isDone, stackName: sName, assigneeId: t_obj.assigneeId });
    });

    if (appData.settings.globalHideCompleted) { renderItems = renderItems.filter(item => !item.isDone); renderItems.forEach(item => { item.cl = item.cl.filter(subItem => !subItem.done); }); }
    if (activeFilters.users.length > 0) { renderItems.forEach(item => { const taskMatches = activeFilters.users.includes(item.assigneeId || ''); if (!taskMatches) { item.cl = (item.cl || []).filter(subItem => activeFilters.users.includes(subItem.assigneeId || '')); } }); }

    if (clSortKey === 'today') {
        const todayStr = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        renderItems = renderItems.filter(item => {
            const itemDue = item.dueDate ? item.dueDate.split('T')[0] : null; const hasDueToday = itemDue === todayStr; const clDueToday = item.cl.some(c => c.dueDate && c.dueDate.split('T')[0] === todayStr);
            if(!hasDueToday && clDueToday) { item.cl = item.cl.filter(c => c.dueDate && c.dueDate.split('T')[0] === todayStr); return true; }
            return hasDueToday || clDueToday;
        });
    }

    if (clSortKey === 'dueDate' || clSortKey === 'today') { renderItems.sort((a,b) => { if(!a.dueDate && !b.dueDate) return 0; if(!a.dueDate) return 1; if(!b.dueDate) return -1; return new Date(a.dueDate) - new Date(b.dueDate); }); } 
    else if (clSortKey === 'priority') { const pMap = { high: 3, medium: 2, low: 1 }; renderItems.sort((a,b) => (pMap[b.priority] || 0) - (pMap[a.priority] || 0)); }

    renderItems.forEach(item => { html += renderGroup(item.name, item.type, item.id, item.cl, item.isDone, item.isPaused, item.stackName, item.priority, item.dueDate, item.assigneeId); });
    if(renderItems.length === 0 && !hasItems) { html += `<p style="color:var(--text-muted); margin-top:20px; text-align:center;">${_onlyStacks ? t('milestones_empty') : t('checklists_empty')}</p>`; }
    c.innerHTML = html + `</div>`;
    updateDepDisplay();
}

function updateGlobalCl(type, parentId, idx, field, val) {
    let parent = type === 'stack' ? appData.projectStacks.find(x => x.id === parentId) : appData.tasks.find(x => x.id === parentId);
    if(parent && parent.checklist && parent.checklist[idx]) { 
        if(field === 'done' && val === true && isEntityLocked(parent.checklist[idx].id)) {
            showToast("Punkt ist durch Abhängigkeiten gesperrt!", "warning");
            if(currentView === 'notes') renderNotesView(document.getElementById('mainContainer')); else renderChecklists(document.getElementById('mainContainer'));
            return;
        }
        const oldVal = parent.checklist[idx][field];
        parent.checklist[idx][field] = val; 
        { const _cpTitle = parent.checklist[idx].title || ''; const _kind = type === 'stack' ? t('act_ms') : t('act_cp');
          if (field === 'done') logActivity(val ? 'fa-check' : 'fa-rotate-left', (val ? t('act_cp_done') : t('act_cp_reopened')).replace('{k}', _kind).replace('{n}', _cpTitle));
          else if (field === 'title') logActivity('fa-pen', t('act_cp_edited').replace('{k}', _kind).replace('{n}', val || _cpTitle));
          else logActivity('fa-pen', t('act_cp_edited').replace('{k}', _kind).replace('{n}', _cpTitle)); }

        if (field === 'done' && val === true && oldVal !== true) {
            const title = parent.checklist[idx].title;
            const msgType = type === 'stack' ? 'Milestone' : 'Checklistenpunkt';
            const msg = getHistoryTimestamp() + `${msgType} "${title}" erledigt.`;
            if (type === 'task') {
                parent.notes = parent.notes ? parent.notes + '\n' + msg : msg;
            } else {
                parent.history = parent.history ? parent.history + '\n' + msg : msg;
            }
        }

        saveToLocal(true); if(field === 'done' && val === true) showToast('Abgehakt!'); 
        if(currentView === 'notes') renderNotesView(document.getElementById('mainContainer')); else renderChecklists(document.getElementById('mainContainer'));
    }
}
/*
 * Übernimmt Datum, Uhrzeit und Dauer aus der Wissen-Ansicht – identisch zur Logik im Modal
 * (ohne Uhrzeit entsteht ein ganztägiger Termin gemäss der eingestellten Arbeitszeiten).
 */
function updateGlobalClSchedule(type, parentId, idx, srcEl) {
    const row = srcEl && srcEl.closest ? srcEl.closest('.cl-controls') : null;
    if (!row) return;
    const dateVal = (row.querySelector('.cl-g-date') || {}).value || '';
    const timeVal = (row.querySelector('.cl-g-time') || {}).value || '';
    const durHours = parseFloat((row.querySelector('.cl-g-dur') || {}).value || '0') || 0;

    const parent = type === 'stack' ? appData.projectStacks.find(x => x.id === parentId) : appData.tasks.find(x => x.id === parentId);
    if (!(parent && parent.checklist && parent.checklist[idx])) return;

    const sched = computeChecklistSchedule(dateVal, timeVal, Math.round(durHours * 60));
    const cl = parent.checklist[idx];
    cl.startDate = sched.startDate;
    cl.dueDate = sched.dueDate;
    cl.duration = sched.duration;
    cl.allDay = sched.allDay;

    checkWorkdayWarning(sched.dueDate, 'Checklistenpunkt');
    saveToLocal(true);
}

function updateGlobalClDate(type, parentId, idx, dateVal, timeVal) {
    let parent = type === 'stack' ? appData.projectStacks.find(x => x.id === parentId) : appData.tasks.find(x => x.id === parentId);
    if(parent && parent.checklist && parent.checklist[idx]) {
        let finalDate = dateVal; if(timeVal && !finalDate) finalDate = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        let finalDue = finalDate; if(finalDue && timeVal) finalDue += 'T' + timeVal;
        parent.checklist[idx].dueDate = finalDue; 
        checkWorkdayWarning(finalDue, 'Checklistenpunkt');
        saveToLocal(true);
    }
}
function addGlobalCl(type, parentId) {
    let parent = type === 'stack' ? appData.projectStacks.find(x => x.id === parentId) : appData.tasks.find(x => x.id === parentId);
    if(parent) {
        if(!parent.checklist) parent.checklist = []; parent.checklist.push({ id: generateId(), done: false, title: 'Neuer Punkt', dueDate: '', assigneeId: '', predecessors: [] }); logActivity('fa-plus', t('act_cp_added').replace('{k}', type === 'stack' ? t('act_ms') : t('act_cp')).replace('{n}', parent.name || parent.projectName || '')); saveToLocal(true); 
        if(currentView === 'notes') renderNotesView(document.getElementById('mainContainer')); else renderChecklists(document.getElementById('mainContainer'));
    }
}
function deleteGlobalCl(type, parentId, idx) {
    if(!confirm(t('delete') + '?')) return;
    let parent = type === 'stack' ? appData.projectStacks.find(x => x.id === parentId) : appData.tasks.find(x => x.id === parentId);
    if(parent && parent.checklist) {
        { const _dt = (parent.checklist[idx] && parent.checklist[idx].title) || ''; logActivity('fa-trash', t('act_cp_deleted').replace('{k}', type === 'stack' ? t('act_ms') : t('act_cp')).replace('{n}', _dt)); }
        parent.checklist.splice(idx, 1); saveToLocal(true); 
        if(currentView === 'notes') renderNotesView(document.getElementById('mainContainer')); else renderChecklists(document.getElementById('mainContainer'));
        showToast(t('toast_deleted'));
    }
}

function handleGlobalClDrop(e, el, targetParentType, targetParentId, targetIdx) {
    e.preventDefault(); e.stopPropagation(); const insertAfter = el.classList.contains('drag-over-bottom'); handleCardDragLeave(el);
    const type = e.dataTransfer.getData('type'); const draggedIdx = parseInt(e.dataTransfer.getData('text/plain')); const sourceParentId = e.dataTransfer.getData('parentId'); const sourceParentType = e.dataTransfer.getData('parentType');
    if(type !== 'checklist-item' || isNaN(draggedIdx)) return;
    
    let sourceParent = sourceParentType === 'stack' ? appData.projectStacks.find(x => x.id === sourceParentId) : appData.tasks.find(x => x.id === sourceParentId);
    let targetParent = targetParentType === 'stack' ? appData.projectStacks.find(x => x.id === targetParentId) : appData.tasks.find(x => x.id === targetParentId);
    
    if(sourceParent && targetParent && sourceParent.checklist && targetParent.checklist) {
        const item = sourceParent.checklist.splice(draggedIdx, 1)[0]; let adjustedTargetIdx = targetIdx;
        if (sourceParentId === targetParentId && draggedIdx < targetIdx) { adjustedTargetIdx--; }
        targetParent.checklist.splice(adjustedTargetIdx + (insertAfter ? 1 : 0), 0, item); saveToLocal(true);
        if(currentView === 'notes') renderNotesView(document.getElementById('mainContainer')); else renderChecklists(document.getElementById('mainContainer'));
    }
}

// KANBAN
function renderKanban(c) {
    const board = document.createElement('div'); board.className = 'kanban-board'; const tasks = getFilteredTasks();
    appData.statuses.forEach(col => {
        const colDiv = document.createElement('div');
        colDiv.className = 'kanban-column';
        colDiv.dataset.statusId = col.id;           
        const colTitle = col.id === 'done' ? t('col_completed') : col.title;
        const colCount = col.id === 'done' ? appData.tasks.filter(t_obj => isTaskDone(t_obj) && kanbanPassesUserFilters(t_obj)).length : tasks.filter(t_obj => t_obj.status === col.id).length;
        const _stColor = getStatusColor(col);
        colDiv.style.setProperty('--col-color', _stColor);
        colDiv.innerHTML = `<div class="kanban-header"><span class="kanban-col-dot" style="background:${_stColor}"></span><span>${colTitle}</span> <span class="badge" style="background:var(--border-color); color:var(--text-main)">${colCount}</span></div>`;
        const cardsDiv = document.createElement('div'); cardsDiv.className = 'kanban-cards';

        if (col.id === 'done') {
            colDiv.classList.add('done-column');
        }

        colDiv.ondragover = (e) => {
            e.preventDefault(); 
            if (col.id === 'done') colDiv.classList.add('drag-over-zone');
        };
        colDiv.ondragleave = (e) => {
            if (col.id === 'done') colDiv.classList.remove('drag-over-zone');
        };
        colDiv.ondrop = (e) => {
            if (col.id === 'done') colDiv.classList.remove('drag-over-zone');
            if (e.target.closest('.task-card')) return;
            dropTaskToColumn(e, col.id);
        };

        // Spalte „Abgeschlossen" zeigt IMMER alle erledigten Aufgaben,
        // auch wenn der Filter „Abgeschlossene ausblenden" aktiv ist.
        let colTasks;
        if (col.id === 'done') {
            colTasks = appData.tasks.filter(t_obj => isTaskDone(t_obj) && kanbanPassesUserFilters(t_obj));
            colTasks.sort((a,b) => (b.completedAt || 0) - (a.completedAt || 0));
        } else {
            colTasks = tasks.filter(t_obj => t_obj.status === col.id);
        }
        colTasks.forEach(task => { cardsDiv.appendChild(createTaskCard(task)); });

        colDiv.appendChild(cardsDiv); board.appendChild(colDiv);
    });
    c.appendChild(board);
}

function createTaskCard(task) {
    const card = document.createElement('div'); const isCompleted = isTaskDone(task); const isPaused = task.isPaused;
    card.className = `task-card draggable-item ${isCompleted ? 'is-completed' : ''} ${isCompactMode ? 'compact' : ''}`; 
    card.dataset.id = task.id; 
    /* Farbiger Randstreifen: Statusfarbe > Stakeholder-Farbe > Prioritätsfarbe */
    { let _strip = 'var(--border-color)';
      /* Statusfarbe hat höchste Priorität */
      if (task.status) { const _st = appData.statuses.find(s => s.id === task.status); if (_st && _st.color) _strip = _st.color; }
      else if (task.stakeholderId) { const _sh = appData.stakeholders.find(s => s.id === task.stakeholderId); if (_sh) _strip = _sh.color; }
      else if (task.priority === 'high') _strip = 'var(--danger)';
      else if (task.priority === 'medium') _strip = 'var(--primary-color)';
      else if (task.priority === 'low') _strip = 'var(--success)';
      card.style.setProperty('--card-strip', _strip); }
    if(isPaused && !isCompleted) {
        card.style.background = 'color-mix(in srgb, var(--surface-color) 92%, #000 8%)';
        card.style.borderColor = 'color-mix(in srgb, var(--border-color) 85%, #000 15%)';
    }
    
    /* Kanban nutzt ausschliesslich den zeigerbasierten Mechanismus (Maus + Touch),
       damit das Verhalten auf allen Geraeten identisch ist. */
    card.draggable = false;
    card.ondblclick = () => openModal(task.id);
    
    card.ondragover = (e) => handleCardDragOver(e, card, !isCompleted); 
    card.ondragleave = () => handleCardDragLeave(card);
    card.ondrop = (e) => { 
        e.preventDefault(); e.stopPropagation(); 
        const insertAfter = card.classList.contains('drag-over-bottom'); 
        const isMerge = card.classList.contains('drag-over-merge'); 
        handleCardDragLeave(card);
        
        const draggedId = e.dataTransfer.getData('text/plain'); 
        const type = e.dataTransfer.getData('type'); 
        if(!draggedId || draggedId === task.id || type !== 'task') return;
        
        if (isMerge) { 
            openMergeModal(draggedId, task.id); 
        } else { 
            const draggedTask = appData.tasks.find(t_obj => t_obj.id === draggedId); 
            if(draggedTask) { 
                const newStatusId = task.status;
                if(draggedTask.status !== newStatusId) {
                    if(newStatusId === 'done' && isEntityLocked(draggedId)) {
                        showToast("Aufgabe ist durch Abhängigkeiten gesperrt!", "warning");
                        return;
                    }
                    checkTaskCompletion(draggedId, newStatusId);
                    let oldStatus = draggedTask.status;
                    draggedTask.status = newStatusId;
                    if(newStatusId === 'done') {
                        draggedTask.isPaused = false;
                        if(!draggedTask.completedAt) {
                            draggedTask.completedAt = Date.now();
                            triggerWorkflows('task_completed', { task: draggedTask });
                        }
                    } else {
                        delete draggedTask.completedAt;
                    }
                    triggerWorkflows('task_status_changed', { task: draggedTask, oldStatus, newStatus: newStatusId });
                }
                moveItemInArray(appData.tasks, draggedId, task.id, insertAfter); 
                saveToLocal(true); 
                renderView(); 
            } 
        }
    };

    const prioLabels = { low: t('prio_low'), medium: t('prio_med'), high: t('prio_high') }; const progress = getTaskProgress(task);
    let shColor = 'var(--text-muted)'; if(task.stakeholderId) { const sh = appData.stakeholders.find(s => s.id === task.stakeholderId); if(sh) shColor = sh.color; }
    let avatarHtml = getAvatarHtml(task.assigneeId, 'avatar-sm');
    const est = parseFloat(task.estimatedTime||0); const spent = parseFloat(task.spentTime||0); 
    let pct = est > 0 ? (spent / est) * 100 : (spent > 0 ? 100 : 0); const isOver = pct > 100; if(pct > 100) pct = 100;

    const lockedIcon = isEntityLocked(task.id) ? '<i class="fas fa-lock" style="color:var(--text-muted); font-size:10px; margin-right:4px;" title="Gesperrt durch Abhängigkeit"></i>' : '';

    let actionBtns = '';
    actionBtns += `<button class="secondary icon-btn wk-booktime" onclick="event.stopPropagation(); quickTrackTime('${task.id}')" title="${t('today_book_time')}"><i class="fas fa-stopwatch"></i></button>`;
    if(!isCompleted) {
        if(isPaused) actionBtns += `<button class="secondary icon-btn" onclick="event.stopPropagation(); setTaskState('${task.id}', 'resume')" title="${t('btn_resume')}"><i class="fas fa-play"></i></button>`;
        else actionBtns += `<button class="secondary icon-btn" onclick="event.stopPropagation(); setTaskState('${task.id}', 'pause')" title="${t('btn_pause')}"><i class="fas fa-pause"></i></button>`;
        actionBtns += `<button class="secondary icon-btn" onclick="event.stopPropagation(); setTaskState('${task.id}', 'complete')" title="${t('btn_complete')}"><i class="fas fa-check"></i></button>`;
    } else { actionBtns += `<button class="secondary icon-btn" onclick="event.stopPropagation(); setTaskState('${task.id}', 'reopen')" title="${t('btn_reopen')}"><i class="fas fa-undo"></i></button>`; }

    // Kompaktansicht ohne Pausiert-Label
    if(isCompactMode) {
        const timeBarCompact = `<div class="time-pb-container" style="margin:0; height:5px; border-radius:2px; flex:1;" title="${t('actual')}: ${spent}h / ${t('target')}: ${est}h"><div class="time-pb-spent ${isOver?'over':''}" style="width:${pct}%; border-radius:2px;"></div></div>`;
        const clBarCompact = `<div class="pb-container" style="margin:0; height:5px; border-radius:2px; flex:1;" title="${t('list_prog')}: ${progress}%"><div class="pb-fill" style="width:${progress}%; border-radius:2px;"></div></div>`;
        card.innerHTML = `<div class="compact-row" style="display:flex; align-items:center; justify-content:space-between; width:100%;">
            <div style="width:8px; height:8px; border-radius:50%; background:${shColor}; flex-shrink:0;"></div>
            <div class="task-title" title="${task.projectName}" style="flex:1; margin-left:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:13px;">${lockedIcon}${task.projectName || 'Unbenannt'}</div>
            <div style="display:flex; gap:3px; align-items:center; flex-shrink:0; margin-left:5px;">${actionBtns}</div>
        </div>
        <div class="compact-row" style="margin-top:6px; display:flex; align-items:center; gap:6px; width:100%; min-width:0;">
            ${avatarHtml}
            <span class="badge ${task.priority}" style="flex-shrink:0; padding:2px 4px; font-size:9px; line-height:1; min-width:14px; text-align:center;" title="Priorität">${prioLabels[task.priority][0]}</span>
            <div style="display:flex; flex:1; gap:4px; align-items:center; min-width:0; margin-left:2px;">
                ${clBarCompact}
                ${timeBarCompact}
            </div>
        </div>`;
    } else {
        // Standardansicht ohne Pausiert-Label
        const timeBarHtml = (parseFloat(est) > 0 || parseFloat(spent) > 0) ? `<div class="wk-effort"><div class="wk-effort-head"><span><i class="far fa-clock"></i> ${t('actual')} <b>${spent}h</b></span><span>${t('target')} <b>${est}h</b></span></div><div class="wk-effort-bar"><i class="${isOver?'over':''}" style="width:${Math.min(100,pct)}%"></i></div></div>` : '';
        // Abgeschlossene Aufgaben: nur der Aufgabenname
        if (isCompleted) {
            // Abgeschlossen: Name, Bucket, Stakeholder + nur zwei Aktionen (Wiedereröffnen, Zeit buchen)
            let doneSh = '';
            if (task.stakeholderId) { const sh = appData.stakeholders.find(x => x.id === task.stakeholderId); if (sh) doneSh = `<span class="wk-c-sh" style="--shc:${sh.color}"><i class="fas fa-user-tie"></i> ${escapeHtmlToday(sh.name)}</span>`; }
            const doneBucket = task.bucket ? `<span class="wk-c-bucket"><i class="fas fa-box-open"></i> ${escapeHtmlToday(task.bucket)}</span>` : '';
            const doneActions = `<button class="secondary icon-btn wk-booktime" onclick="event.stopPropagation(); quickTrackTime('${task.id}')" title="${t('today_book_time')}"><i class="fas fa-stopwatch"></i></button>`
                + `<button class="secondary icon-btn" onclick="event.stopPropagation(); setTaskState('${task.id}', 'reopen')" title="${t('btn_reopen')}"><i class="fas fa-rotate-left"></i></button>`;
            card.innerHTML = `<div class="wk-card done">
                <div class="wk-card-done-main">
                    <div class="task-title done" title="${task.projectName || ''}"><i class="fas fa-check-circle wk-done-ic"></i> ${escapeHtmlToday(task.projectName || 'Unbenannt')}</div>
                    ${(doneSh || doneBucket) ? `<div class="wk-card-done-tags">${doneBucket}${doneSh}</div>` : ''}
                </div>
                <div class="wk-card-actions">${doneActions}</div>
            </div>`;
        } else {
            // Einheitliche Kachel für alle offenen Spalten
            let stackBadge = '';
            if (task.projectStackId) { const stack = appData.projectStacks.find(ps => ps.id === task.projectStackId); if (stack) stackBadge = `<span class="wk-c-stack" style="--sc:${stack.color || 'var(--text-muted)'}"><i class="fas fa-folder"></i> ${escapeHtmlToday(stack.name)}</span>`; }
            let shBadge = '';
            if (task.stakeholderId) { const sh = appData.stakeholders.find(x => x.id === task.stakeholderId); if (sh) shBadge = `<span class="wk-c-sh" style="--shc:${sh.color}"><i class="fas fa-user-tie"></i> ${escapeHtmlToday(sh.name)}</span>`; }
            const bucketBadge = task.bucket ? `<span class="wk-c-bucket"><i class="fas fa-box-open"></i> ${escapeHtmlToday(task.bucket)}</span>` : '';
            const clDone = (task.checklist || []).filter(x => x.done).length, clTot = (task.checklist || []).length;
            const clInfo = clTot ? `<span class="wk-c-cl"><i class="fas fa-check-square"></i> ${clDone}/${clTot}</span>` : '';
            const filesInfo = (task.files && task.files.length) ? `<span class="wk-c-files"><i class="fas fa-paperclip"></i> ${task.files.length}</span>` : '';
            const dueInfo = task.dueDate ? `<span class="wk-c-due"><i class="far fa-calendar-alt"></i> ${task.dueDate}</span>` : '';

            card.innerHTML = `<div class="wk-card">
                <div class="wk-card-top">
                    <div class="wk-card-tags">${stackBadge}${shBadge}${bucketBadge}</div>
                    <div class="wk-card-actions">${actionBtns}</div>
                </div>
                <div class="task-title">${lockedIcon}${escapeHtmlToday(task.projectName || 'Unbenannt')}</div>
                ${timeBarHtml}
                <div class="wk-card-foot">
                    <div class="wk-card-foot-l">
                        <span class="badge ${task.priority}">${prioLabels[task.priority]}</span>
                        ${clInfo}${filesInfo}${dueInfo}
                    </div>
                    <div class="wk-card-foot-r">${avatarHtml}</div>
                </div>
            </div>`;
        }
    }
    return card;
}

function dropTaskToColumn(e, newStatus) { 
    e.preventDefault(); document.querySelectorAll('.drag-over-zone').forEach(el => el.classList.remove('drag-over-zone'));
    const id = e.dataTransfer.getData('text/plain'); const type = e.dataTransfer.getData('type'); if(type !== 'task') return;
    const task = appData.tasks.find(t_obj => t_obj.id === id); 
    if(task && task.status !== newStatus) { 
        if(newStatus === 'done' && isEntityLocked(id)) { showToast("Aufgabe ist durch Abhängigkeiten gesperrt!", "warning"); return; }
        checkTaskCompletion(id, newStatus); let oldStatus = task.status; task.status = newStatus; 
        if(newStatus === 'done') { task.isPaused = false; if(!task.completedAt) { task.completedAt = Date.now(); triggerWorkflows('task_completed', { task }); } } else { delete task.completedAt; }
        triggerWorkflows('task_status_changed', { task, oldStatus, newStatus: newStatus });
        if (newStatus === 'done') { const taskIndex = appData.tasks.findIndex(t => t.id === id); if(taskIndex > -1) { const [taskToMove] = appData.tasks.splice(taskIndex, 1); appData.tasks.unshift(taskToMove); } }
        saveToLocal(); 
        renderView();
    } 
}

// STACKS DASHBOARD
/**
 * Baut eine kleine Aktivitäts-Grafik (Zeiterfassung) für eine gegebene Menge von Aufgaben-IDs:
 * ein Balkendiagramm (Stunden pro Tag) mit einer Bezierkurve als Trendlinie darüber.
 * Aggregiert appData.timeLogs nach Datum und zeigt zusätzlich das Datum der ersten und letzten Messung an,
 * damit der abgedeckte Zeitraum klar erkennbar ist. Gibt '' zurück, wenn keine Zeiterfassung vorliegt.
 */
/**
 * Generischer Baustein für ein Balkendiagramm (Werte pro Datum) mit einer Bezierkurve als Trendlinie darüber.
 * `valueByDate` ist eine Map { 'YYYY-MM-DD': Zahl }. `titleAttr` ist der Tooltip-Text des Charts.
 * Gibt '' zurück, wenn keine Werte vorliegen.
 */
function buildBarCurveChartHtml(valueByDate, titleAttr) {
    const dates = Object.keys(valueByDate).sort((a, b) => new Date(a) - new Date(b));
    const N = dates.length;
    if (N === 0) return '';
    const maxV = Math.max(...Object.values(valueByDate), 0.1);
    const baseline = 35, scale = 28;

    /* Balken: jedes Datum bekommt einen eigenen, gleich breiten Slot, damit Balken und Kurve exakt übereinander liegen */
    const slotW = 100 / N;
    const barW = Math.min(slotW * 0.55, 12);
    let barsD = '';
    const points = dates.map((d, i) => {
        const cx = (i + 0.5) * slotW;
        const h = (valueByDate[d] / maxV) * scale;
        const y = baseline - h;
        barsD += `<rect x="${(cx - barW / 2).toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}" rx="1" fill="rgba(204,163,0,0.35)"></rect>`;
        return { x: cx, y };
    });

    /* Bezierkurve als Trendlinie, liegt über den Balken */
    let pathD = '';
    if (N === 1) {
        pathD = `M ${(points[0].x - slotW / 2).toFixed(2)} ${points[0].y.toFixed(2)} L ${(points[0].x + slotW / 2).toFixed(2)} ${points[0].y.toFixed(2)}`;
    } else {
        pathD = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
        for (let i = 1; i < points.length - 1; i++) { const xc = (points[i].x + points[i + 1].x) / 2; const yc = (points[i].y + points[i + 1].y) / 2; pathD += ` Q ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)} ${xc.toFixed(2)} ${yc.toFixed(2)}`; }
        pathD += ` T ${points[points.length - 1].x.toFixed(2)} ${points[points.length - 1].y.toFixed(2)}`;
    }

    const rangeLabel = N === 1 ? ttFmtDate(dates[0]) : `${ttFmtDate(dates[0])} – ${ttFmtDate(dates[N - 1])}`;
    return `<div style="margin-top:5px; margin-bottom:10px;">
        <div style="height:40px; width:100%; position:relative; overflow:hidden; border-bottom:1px solid var(--border-color);" title="${titleAttr || ''}"><svg viewBox="0 0 100 40" preserveAspectRatio="none" style="width:100%; height:100%;">${barsD}<path d="${pathD}" fill="none" stroke="#cca300" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <div style="font-size:10px; color:var(--text-muted); text-align:right; margin-top:2px;">${rangeLabel}</div>
    </div>`;
}

/**
 * Baut eine kleine Aktivitäts-Grafik (Zeiterfassung) für eine gegebene Menge von Aufgaben-IDs:
 * ein Balkendiagramm (Stunden pro Tag) mit einer Bezierkurve als Trendlinie darüber.
 * Aggregiert appData.timeLogs nach Datum und zeigt zusätzlich das Datum der ersten und letzten Messung an,
 * damit der abgedeckte Zeitraum klar erkennbar ist. Gibt '' zurück, wenn keine Zeiterfassung vorliegt.
 */
/* Alle Aufgaben-IDs einer Gruppe (Stakeholder/Bucket) – bewusst UNGEFILTERT,
   damit abgeschlossene und pausierte Eintraege in den Auswertungen enthalten sind. */
function getGroupTaskIdsAll(groupKey, groupVal) {
    const ids = new Set();
    const val = (groupVal === undefined || groupVal === null) ? '' : String(groupVal);
    const stackIds = new Set();
    (appData.projectStacks || []).forEach(st => {
        if (String(st[groupKey] || '') === val) stackIds.add(st.id);
    });
    (appData.tasks || []).forEach(tk => {
        const own = String(tk[groupKey] || '') === val;
        if (own || (tk.projectStackId && stackIds.has(tk.projectStackId))) ids.add(tk.id);
    });
    return { taskIds: ids, stackIds };
}

/* Zaehlt abgeschlossene und pausierte Eintraege einer Gruppe (Aufgaben + Stacks). */
function getGroupHiddenCounts(groupKey, groupVal) {
    const { taskIds, stackIds } = getGroupTaskIdsAll(groupKey, groupVal);
    let doneCount = 0, pausedCount = 0;
    (appData.tasks || []).forEach(tk => {
        if (!taskIds.has(tk.id)) return;
        if (isTaskDone(tk)) doneCount++;
        else if (tk.isPaused) pausedCount++;
    });
    (appData.projectStacks || []).forEach(st => {
        if (!stackIds.has(st.id)) return;
        if (st.status === 'completed') doneCount++;
        else if (st.status === 'paused') pausedCount++;
    });
    return { doneCount, pausedCount };
}

/* Verbuchte Stunden je Woche (letzte vier Wochen) fuer eine Menge von Aufgaben-IDs. */
function getWeeklyHours(taskIds) {
    const now = new Date();
    const startOfWeek = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); return x; };
    const weeks = [];
    for (let i = 3; i >= 0; i--) {
        const from = startOfWeek(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7));
        const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6, 23, 59, 59);
        weeks.push({ from, to, hours: 0 });
    }
    (appData.timeLogs || []).forEach(l => {
        if (!l || !l.date || !taskIds.has(l.taskId)) return;
        const p = String(l.date).split('-');
        if (p.length !== 3) return;
        const d = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
        weeks.forEach(w => { if (d >= w.from && d <= w.to) w.hours += (parseFloat(l.hours) || 0); });
    });
    return weeks;
}

/*
 * Balkendiagramm der verbuchten Stunden je Woche.
 * scaleMax: gemeinsamer Hoechstwert ueber ALLE Kacheln, damit die Balken
 * zwischen Stakeholdern bzw. Buckets direkt vergleichbar sind.
 */
function buildWeeklyHoursChartHtml(taskIds, scaleMax) {
    const weeks = getWeeklyHours(taskIds);
    const total = weeks.reduce((a, w) => a + w.hours, 0);
    const pad = n => String(n).padStart(2, '0');

    if (total <= 0) {
        return `<div class="wh-chart-wrap" style="margin:6px 0 12px;">
            <div class="wh-head" style="display:flex; justify-content:space-between; align-items:baseline; font-size:11px; color:var(--text-muted); margin-bottom:4px;"><span>${t('weekly_hours')}</span><b style="color:var(--text-main); font-size:12px;">0 h</b></div>
            <div style="font-size:11px; color:var(--text-muted); font-style:italic; padding:6px 0;">${t('weekly_hours_none')}</div>
        </div>`;
    }

    const max = Math.max(0.01, parseFloat(scaleMax) || 0, ...weeks.map(w => w.hours));
    /* Hoehen in Pixeln: prozentuale Hoehen in Flex-Spalten loesen Browser nicht zuverlaessig auf. */
    const TRACK = 44;
    const bars = weeks.map((w, i) => {
        const px = w.hours > 0 ? Math.max(3, Math.round((w.hours / max) * TRACK)) : 0;
        const isNow = i === weeks.length - 1;
        const label = isNow ? t('gantt_today') : `${pad(w.from.getDate())}.${pad(w.from.getMonth() + 1)}.`;
        return `<div class="wh-col" style="flex:1 1 0 !important; display:flex !important; flex-direction:column !important; align-items:center; gap:3px; min-width:0; height:auto !important;" title="${pad(w.from.getDate())}.${pad(w.from.getMonth()+1)}. – ${pad(w.to.getDate())}.${pad(w.to.getMonth()+1)}.: ${ttNum(w.hours)} h">
            <span class="wh-val" style="font-size:9.5px; color:var(--text-muted); height:12px; line-height:12px;">${w.hours > 0 ? ttNum(w.hours) : ''}</span>
            <div class="wh-bar" style="width:100% !important; height:${TRACK}px !important; min-height:${TRACK}px !important; max-height:${TRACK}px !important; flex:0 0 auto !important; background:var(--border-color); border-radius:4px; display:flex !important; align-items:flex-end !important; overflow:hidden;">
                <span class="wh-fill" style="display:block !important; width:100% !important; height:${px}px !important; background:#cca300 !important; opacity:${isNow ? '1' : '0.6'}; border-radius:4px; align-self:flex-end;"></span>
            </div>
            <u style="font-size:9.5px; color:var(--text-muted); text-decoration:none; white-space:nowrap;">${label}</u>
        </div>`;
    }).join('');

    return `<div class="wh-chart-wrap" style="margin:6px 0 12px;">
        <div class="wh-head" style="display:flex; justify-content:space-between; align-items:baseline; font-size:11px; color:var(--text-muted); margin-bottom:4px;"><span>${t('weekly_hours')}</span><b style="color:var(--text-main); font-size:12px;">${ttNum(total)} h</b></div>
        <div class="wh-chart" style="display:flex !important; align-items:flex-end !important; gap:8px; width:100%; height:auto !important;">${bars}</div>
    </div>`;
}

function buildActivitySparklineHtml(taskIds) {
    const logs = appData.timeLogs.filter(l => taskIds.has(l.taskId));
    if (logs.length === 0) return '';
    const logAgg = {}; logs.forEach(l => { logAgg[l.date] = (logAgg[l.date] || 0) + parseFloat(l.hours); });
    return buildBarCurveChartHtml(logAgg, t('activity_chart_title'));
}

function renderStacks(c) {
    let html = getSortButtonsHTML(stackssortKey, 'stackssortKey');
    html += `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px;">`;
    
    let stacks = getFilteredStacks(); stacks = applySort(stacks, stackssortKey);
    if(stacks.length === 0) html += `<p>Keine Projekt-Stacks vorhanden oder Filter zu restriktiv.</p>`;
    
    stacks.forEach(stack => {
        const sp = getStackProgress(stack.id); const isCompleted = stack.status === 'completed'; const isPaused = stack.status === 'paused';
        let badgeHtml = ''; if(isCompleted) badgeHtml = `<span class="badge low">${t('col_completed')}</span>`; else if(isPaused) badgeHtml = `<span class="badge medium">${t('status_paused')}</span>`;
        const rAvg = getAvgRating(stack.rating); const ratingHtml = rAvg > 0 && isCompleted ? `<span style="font-size:11px; color:var(--warning); font-weight:bold; margin-left:10px;"><i class="fas fa-star"></i> ${rAvg}</span>` : '';
        const lockedIcon = isEntityLocked(stack.id) ? '<i class="fas fa-lock" style="color:var(--text-muted); font-size:12px; margin-right:6px;" title="Gesperrt durch Abhängigkeit"></i>' : '';

        let btnHtml = '';
        if(!isCompleted) {
            if(isPaused) btnHtml += `<button class="secondary icon-btn" onclick="event.stopPropagation(); setStackStatus('${stack.id}', 'active')" title="${t('btn_resume')}"><i class="fas fa-play"></i></button>`;
            else btnHtml += `<button class="secondary icon-btn" onclick="event.stopPropagation(); setStackStatus('${stack.id}', 'paused')" title="${t('btn_pause')}"><i class="fas fa-pause"></i></button>`;
            btnHtml += `<button class="secondary icon-btn" onclick="event.stopPropagation(); setStackStatus('${stack.id}', 'completed')" title="${t('btn_complete')}"><i class="fas fa-check"></i></button>`;
        } else { btnHtml += `<button class="secondary icon-btn" onclick="event.stopPropagation(); setStackStatus('${stack.id}', 'active')" title="${t('btn_reopen')}"><i class="fas fa-undo"></i></button>`; }

        const sTasks = appData.tasks.filter(t_obj => t_obj.projectStackId === stack.id);
        const chartHtml = buildActivitySparklineHtml(new Set(sTasks.map(t_obj => t_obj.id)));

        let checklistHtml = '';
        if(stack.checklist && stack.checklist.length > 0) {
            let filteredCl = stack.checklist;
            if(appData.settings.globalHideCompleted) filteredCl = filteredCl.filter(c => !c.done);
            if (activeFilters.users.length > 0 && !activeFilters.users.includes(stack.assigneeId || '')) { filteredCl = filteredCl.filter(c => activeFilters.users.includes(c.assigneeId || '')); }

            if(filteredCl.length > 0) {
                checklistHtml += `<div style="margin-top:10px; font-size:13px; max-height:130px; overflow-y:auto; border-top:1px solid var(--border-color); padding-top:8px;" onclick="event.stopPropagation();"><div style="font-weight:bold; margin-bottom:6px; color:var(--text-main);"><i class="fas fa-flag" style="color:var(--primary-color)"></i> ${t('milestones')}</div>`;
                filteredCl.forEach((cl) => {
                    const idx = stack.checklist.indexOf(cl);
                    let clLocked = isEntityLocked(cl.id) ? '<i class="fas fa-lock" style="color:var(--text-muted); font-size:10px; margin-right:4px;" title="Gesperrt durch Abhängigkeit"></i>' : '';
                    checklistHtml += `<div style="display:flex; align-items:center; gap:8px; margin-bottom:4px; background:var(--bg-color); padding:4px 8px; border-radius:4px; border:1px solid var(--border-color); font-size:11px;">
                        <input type="checkbox" style="margin:0; width:auto; cursor:pointer;" ${cl.done ? 'checked' : ''} onchange="updateGlobalCl('stack', '${stack.id}', ${idx}, 'done', this.checked)">
                        ${clLocked}<span style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; ${cl.done ? 'text-decoration:line-through; color:var(--text-muted);' : ''}" title="${cl.title}">${cl.title}</span>
                        ${getAvatarHtml(cl.assigneeId, 'avatar-sm')}
                        ${cl.dueDate ? `<span style="font-size:9px; color:var(--text-muted);"><i class="far fa-calendar-alt"></i> ${cl.dueDate.split('T')[0]}</span>` : ''}
                    </div>`;
                });
                checklistHtml += `</div>`;
            }
        }

        let tasksListHtml = '';
        if(sTasks.length > 0) {
            tasksListHtml += `<div style="margin-top:10px; font-size:13px; max-height:130px; overflow-y:auto; border-top:1px solid var(--border-color); padding-top:8px;"><div style="font-weight:bold; margin-bottom:6px; color:var(--text-main);"><i class="fas fa-tasks" style="color:var(--primary-color)"></i> ${t('tasks')}</div>`;
            let filteredTasks = sTasks;
            if(appData.settings.globalHideCompleted) filteredTasks = filteredTasks.filter(t_obj => !isTaskDone(t_obj));
            if(appData.settings.globalHidePaused) filteredTasks = filteredTasks.filter(t_obj => !(t_obj.isPaused && !isTaskDone(t_obj)));
            
            filteredTasks.forEach(t_obj => {
                const isTaskComp = isTaskDone(t_obj); const tProg = getTaskProgress(t_obj);
                let pausedIcon = t_obj.isPaused && !isTaskComp ? '<i class="fas fa-pause" style="color:var(--warning); margin-right:4px;"></i>' : '';
                let tLocked = isEntityLocked(t_obj.id) ? '<i class="fas fa-lock" style="color:var(--text-muted); font-size:10px; margin-right:4px;"></i>' : '';
                tasksListHtml += `<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; background:var(--bg-color); padding:5px 8px; border-radius:4px; border:1px solid var(--border-color); font-size:11px; cursor:pointer; ${isTaskComp?'opacity:0.6; filter:grayscale(100%);':''}" onclick="event.stopPropagation(); openModal('${t_obj.id}')">
                    <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1;" title="${t_obj.projectName}">${isTaskComp?'<i class="fas fa-check" style="color:var(--success)"></i> ':''}${tLocked}${pausedIcon}${t_obj.projectName}</span>
                    <div style="display:flex; align-items:center; gap:6px; margin-left:10px; flex-shrink:0;">
                        <div style="width:40px; height:5px; background:var(--border-color); border-radius:3px; overflow:hidden;"><div style="width:${tProg}%; height:100%; background:var(--primary-color);"></div></div>
                        <span style="font-size:9px; color:var(--text-muted); min-width:24px; text-align:right;">${tProg}%</span>
                    </div>
                </div>`;
            });
            tasksListHtml += `</div>`;
        }

        let avatarHtml = getAvatarHtml(stack.assigneeId, 'avatar-sm'); if(avatarHtml) avatarHtml = `<div style="margin-top:5px; display:inline-flex;">${avatarHtml}</div>`;

        const pausedBg = isPaused ? 'color-mix(in srgb, var(--surface-color) 92%, #000 8%)' : 'var(--surface-color)';
        const pausedBorder = isPaused ? 'color-mix(in srgb, var(--border-color) 85%, #000 15%)' : 'var(--border-color)';

        html += `<div class="draggable-item ${isCompleted ? 'is-completed' : ''}" draggable="true" ondragstart="event.stopPropagation(); event.dataTransfer.setData('text/plain', '${stack.id}'); event.dataTransfer.setData('type', 'stack');" ondragover="handleCardDragOver(event, this, false)" ondragleave="handleCardDragLeave(this)" ondrop="handleStackDrop(event, this, '${stack.id}')" style="background:${pausedBg}; padding:20px; border-radius:var(--radius); border:1px solid ${pausedBorder}; display:flex; flex-direction:column; cursor:pointer; transition: transform 0.2s, border-color 0.2s; overflow:hidden;" onclick="openStackModal('${stack.id}')" onmouseover="this.style.borderColor='var(--primary-color)';" onmouseout="this.style.borderColor='${pausedBorder}';"
>            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:5px;"><div style="flex:1;">${badgeHtml}<h3 style="color:var(--primary-color); margin-top:5px; margin-bottom:5px; line-height:1.2;"><i class="fas fa-folder-open"></i> ${lockedIcon}${stack.name} ${ratingHtml}</h3>${avatarHtml}</div><div style="display:flex; gap:5px; margin-left:10px;">${btnHtml}</div></div>
            ${chartHtml}
            <div style="font-size:11px; color:var(--text-muted); margin-bottom:12px; display:flex; justify-content:space-between;"><span><i class="fas fa-play"></i> ${stack.startDate||'-'}</span><span><i class="fas fa-flag-checkered"></i> ${stack.dueDate||'-'}</span></div>
            <div style="display:flex; gap:10px; margin-bottom:5px;"><div style="flex:1;"><div style="font-size:11px; font-weight:bold; margin-bottom:2px;">${t('tasks')}</div>${generateProgressBarHTML(sp.tPct)}</div><div style="flex:1;"><div style="font-size:11px; font-weight:bold; margin-bottom:2px;">${t('milestones')}</div>${generateProgressBarHTML(sp.mPct, false)}</div></div>
            ${checklistHtml}
            ${tasksListHtml}
        </div>`;
    });
    c.innerHTML = html + `</div>`;
}

function handleStackDrop(e, el, targetId) {
    e.preventDefault(); e.stopPropagation(); const insertAfter = el.classList.contains('drag-over-bottom'); handleCardDragLeave(el);
    const draggedId = e.dataTransfer.getData('text/plain'); const type = e.dataTransfer.getData('type');
    if(type === 'stack' && draggedId && draggedId !== targetId) { moveItemInArray(appData.projectStacks, draggedId, targetId, insertAfter); saveToLocal(true); renderView(); }
}

// LIST
function toggleSort(key) { if(listSort.key === key) listSort.desc = !listSort.desc; else { listSort.key = key; listSort.desc = false; } renderView(); }
function sortArray(arr) { return arr.sort((a,b) => { let vA = a[listSort.key] || ''; let vB = b[listSort.key] || ''; if(typeof vA === 'string') vA = vA.toLowerCase(); if(typeof vB === 'string') vB = vB.toLowerCase(); if(vA < vB) return listSort.desc ? 1 : -1; if(vA > vB) return listSort.desc ? -1 : 1; return 0; }); }
function getSortIcon(key) { return listSort.key === key ? (listSort.desc ? '<i class="fas fa-sort-down"></i>' : '<i class="fas fa-sort-up"></i>') : '<i class="fas fa-sort" style="color:var(--border-color)"></i>'; }
function toggleListCol(key, isChecked) { appData.settings.listColumns[key] = isChecked; saveToLocal(true); renderList(document.getElementById('mainContainer')); }

function renderList(c) {
    /* Absturzschutz: bei frisch angelegten Daten fehlt listColumns,
       weil die Nachrüstung nur beim Laden gespeicherter Stände greift. */
    if(!appData.settings.listColumns) appData.settings.listColumns = { assignee: true, stakeholder: true, bucket: false, status: true, priority: true, startDate: false, dueDate: true, recurrence: false, timeSpent: false, description: false, checklist: false, files: false, notes: false, progress: true };
    const cols = appData.settings.listColumns;
    try {
    let html = `
    <div style="margin-bottom: 15px; display: flex; justify-content: flex-end;">
        <div class="dropdown click-only">
            <button class="secondary" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'block' ? 'none' : 'block'"><i class="fas fa-columns"></i> ${t('col_adjust')}</button>
            <div class="dropdown-content" style="padding:15px; width:220px; right:0; max-height:400px; overflow-y:auto; display:none; z-index:1000;" onclick="event.stopPropagation()">
                <div style="font-size:11px; font-weight:bold; color:var(--text-muted); margin-bottom:10px; border-bottom:1px solid var(--border-color); padding-bottom:5px;">${t('master_data')}</div>
                <label style="display:flex; align-items:center; gap:8px; margin-bottom:8px; cursor:pointer;"><input type="checkbox" ${cols.assignee?'checked':''} onchange="toggleListCol('assignee', this.checked)"> ${t('user')}</label>
                <label style="display:flex; align-items:center; gap:8px; margin-bottom:8px; cursor:pointer;"><input type="checkbox" ${cols.stakeholder?'checked':''} onchange="toggleListCol('stakeholder', this.checked)"> Stakeholder</label>
                <label style="display:flex; align-items:center; gap:8px; margin-bottom:8px; cursor:pointer;"><input type="checkbox" ${cols.bucket?'checked':''} onchange="toggleListCol('bucket', this.checked)"> Bucket (Kategorie)</label>
                <label style="display:flex; align-items:center; gap:8px; margin-bottom:8px; cursor:pointer;"><input type="checkbox" ${cols.status?'checked':''} onchange="toggleListCol('status', this.checked)"> Status</label>
                <label style="display:flex; align-items:center; gap:8px; margin-bottom:15px; cursor:pointer;"><input type="checkbox" ${cols.priority?'checked':''} onchange="toggleListCol('priority', this.checked)"> Priorität</label>
                
                <div style="font-size:11px; font-weight:bold; color:var(--text-muted); margin-bottom:10px; border-bottom:1px solid var(--border-color); padding-bottom:5px;">${t('planning')}</div>
                <label style="display:flex; align-items:center; gap:8px; margin-bottom:8px; cursor:pointer;"><input type="checkbox" ${cols.startDate?'checked':''} onchange="toggleListCol('startDate', this.checked)"> ${t('start_date')}</label>
                <label style="display:flex; align-items:center; gap:8px; margin-bottom:8px; cursor:pointer;"><input type="checkbox" ${cols.dueDate?'checked':''} onchange="toggleListCol('dueDate', this.checked)"> ${t('due_date')}</label>
                <label style="display:flex; align-items:center; gap:8px; margin-bottom:8px; cursor:pointer;"><input type="checkbox" ${cols.recurrence?'checked':''} onchange="toggleListCol('recurrence', this.checked)"> ${t('recurrence')}</label>
                <label style="display:flex; align-items:center; gap:8px; margin-bottom:8px; cursor:pointer;"><input type="checkbox" ${cols.timeSpent?'checked':''} onchange="toggleListCol('timeSpent', this.checked)"> Zeitaufwand (Balken)</label>
                <label style="display:flex; align-items:center; gap:8px; margin-bottom:15px; cursor:pointer;"><input type="checkbox" ${cols.progress?'checked':''} onchange="toggleListCol('progress', this.checked)"> Fortschritt (Balken)</label>

                <div style="font-size:11px; font-weight:bold; color:var(--text-muted); margin-bottom:10px; border-bottom:1px solid var(--border-color); padding-bottom:5px;">${t('details')}</div>
                <label style="display:flex; align-items:center; gap:8px; margin-bottom:8px; cursor:pointer;"><input type="checkbox" ${cols.description?'checked':''} onchange="toggleListCol('description', this.checked)"> ${t('notes')}</label>
                <label style="display:flex; align-items:center; gap:8px; margin-bottom:8px; cursor:pointer;"><input type="checkbox" ${cols.checklist?'checked':''} onchange="toggleListCol('checklist', this.checked)"> ${t('checklist')}</label>
                <label style="display:flex; align-items:center; gap:8px; margin-bottom:8px; cursor:pointer;"><input type="checkbox" ${cols.files?'checked':''} onchange="toggleListCol('files', this.checked)"> ${t('files')}</label>
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" ${cols.notes?'checked':''} onchange="toggleListCol('notes', this.checked)"> ${t('history')}</label>
            </div>
        </div>
    </div>
    <div style="overflow-x:auto; padding-bottom:150px;"><table class="data-table"><thead><tr>`;
    
    if(cols.assignee) html += `<th width="50"></th>`;
    html += `<th onclick="toggleSort('projectName')">${t('list_task_stack')} ${getSortIcon('projectName')}</th>`;
    if(cols.stakeholder) html += `<th onclick="toggleSort('stakeholderId')">Stakeholder ${getSortIcon('stakeholderId')}</th>`;
    if(cols.bucket) html += `<th onclick="toggleSort('bucket')">Bucket ${getSortIcon('bucket')}</th>`;
    if(cols.status) html += `<th onclick="toggleSort('status')">Status ${getSortIcon('status')}</th>`;
    if(cols.priority) html += `<th onclick="toggleSort('priority')">Prio ${getSortIcon('priority')}</th>`;
    if(cols.startDate) html += `<th onclick="toggleSort('startDate')">${t('start_date')} ${getSortIcon('startDate')}</th>`;
    if(cols.dueDate) html += `<th onclick="toggleSort('dueDate')">${t('due_date')} ${getSortIcon('dueDate')}</th>`;
    if(cols.recurrence) html += `<th>${t('recurrence')}</th>`;
    if(cols.timeSpent) html += `<th width="150">${t('list_time')}</th>`;
    if(cols.progress) html += `<th width="150">${t('list_prog')}</th>`;
    if(cols.description) html += `<th>${t('notes')}</th>`;
    if(cols.checklist) html += `<th>Checkliste</th>`;
    if(cols.files) html += `<th>${t('list_files')}</th>`;
    if(cols.notes) html += `<th>${t('history')}</th>`;
    
    html += `</tr></thead><tbody>`;
    
    let filteredTasks = getFilteredTasks(); const stacks = getFilteredStacks();
    /* Abgeschlossene Aufgaben mit zukünftigen, offenen Checkpunkten trotz Filter aufnehmen */
    if(appData.settings.globalHideCompleted) {
        const _todayIso = ttTodayIso();
        const _extra = appData.tasks.filter(t_obj => isTaskDone(t_obj)
            && !filteredTasks.some(ft => ft.id === t_obj.id)
            && (t_obj.checklist || []).some(cl => !cl.done && (cl.dueDate || '').split('T')[0] >= _todayIso));
        if(_extra.length) filteredTasks = filteredTasks.concat(_extra);
    }
    let middleColSpan = 0; if(cols.stakeholder) middleColSpan++; if(cols.bucket) middleColSpan++; if(cols.status) middleColSpan++; if(cols.priority) middleColSpan++; if(cols.startDate) middleColSpan++; if(cols.dueDate) middleColSpan++; if(cols.recurrence) middleColSpan++;
    let endColSpan = 0; if(cols.timeSpent) endColSpan++; if(cols.progress) endColSpan++; if(cols.description) endColSpan++; if(cols.checklist) endColSpan++; if(cols.files) endColSpan++; if(cols.notes) endColSpan++;

    stacks.forEach(stack => {
        let sTasks = filteredTasks.filter(t_obj => t_obj.projectStackId === stack.id);
        const sp = getStackProgress(stack.id); const sh = appData.stakeholders.find(s => s.id === stack.stakeholderId);
        const shBadge = sh ? `<span class="stakeholder-badge" style="background:${sh.color}; margin-left:10px; margin-bottom:0;">${sh.name}</span>` : '';
        const bucketText = stack.bucket ? `<span class="badge" style="margin-left:10px; background:var(--border-color); color:var(--text-main); font-weight:normal;">${stack.bucket}</span>` : '';
        let badge = ''; if(stack.status==='completed') badge=`<span class="badge low" style="margin-left:5px;">${t('col_completed')}</span>`; else if(stack.status==='paused') badge=`<span class="badge medium" style="margin-left:5px;">${t('status_paused')}</span>`;
        const lockedIcon = isEntityLocked(stack.id) ? '<i class="fas fa-lock" style="color:var(--text-muted); font-size:12px; margin-right:6px;" title="Gesperrt durch Abhängigkeit"></i>' : '';

        html += `<tr class="table-row-group clickable-row ${stack.status==='completed' ? 'is-completed' : ''}" onclick="openStackModal('${stack.id}')">`;
        if(cols.assignee) html += `<td data-label="Assignee">${getAvatarHtml(stack.assigneeId, 'avatar-sm')}</td>`;
        
        let kwBadge = ''; if(stack.dueDate) { const kw = getISOWeek(new Date(stack.dueDate)); kwBadge = `<span style="font-size:10px; color:var(--primary-color); border:1px solid var(--primary-light); padding:1px 4px; border-radius:3px; margin-left:10px;">KW ${kw}</span>`; }

        html += `<td data-label="Projekt-Stack" colspan="${middleColSpan + 1}"><b><i class="fas fa-folder" style="color:var(--primary-color)"></i> ${lockedIcon}${stack.name}</b> ${shBadge} ${bucketText} ${badge} <span style="font-size:12px; color:var(--text-muted); margin-left:10px;">${stack.startDate||''} - ${stack.dueDate||'-'} ${kwBadge}</span></td>`;
        
        if(endColSpan > 0) {
            html += `<td data-label="Übersicht" colspan="${endColSpan}" style="padding: 5px 15px;">`;
            if(cols.progress) { html += `<div style="font-size:10px; color:var(--primary-color); font-weight:bold;">${t('tasks')} (${sp.tPct}%)</div>${generateProgressBarHTML(sp.tPct)}<div style="font-size:10px; color:var(--primary-color); font-weight:bold; margin-top:2px;">${t('milestones')} (${sp.mPct}%)</div>${generateProgressBarHTML(sp.mPct, false)}`; } 
            else { html += `<span style="font-size:11px; color:var(--text-muted);"><i>-</i></span>`; }
            html += `</td>`;
        }
        html += `</tr>`;
        if(sTasks.length > 0) sortArray(sTasks).forEach(task => { html += generateListRow(task, true); });
    });
    
    const standalone = sortArray(filteredTasks.filter(t_obj => !t_obj.projectStackId));
    if(standalone.length > 0) { 
        let totalCols = 1 + (cols.assignee?1:0) + middleColSpan + endColSpan;
        html += `<tr class="table-row-group"><td data-label="Gruppierung" colspan="${totalCols}"><b><i class="fas fa-layer-group"></i> ${t('standalone_tasks')}</b></td></tr>`; 
        standalone.forEach(task => { html += generateListRow(task, false); }); 
    }
    c.innerHTML = html + `</tbody></table></div>`;
    
    document.addEventListener('click', function closeListFilter(e) {
        if(!e.target.closest('.dropdown.click-only')) { const dd = document.querySelector('.dropdown.click-only .dropdown-content'); if(dd) dd.style.display = 'none'; document.removeEventListener('click', closeListFilter); }
    });
    } catch (err) {
        console.error('renderList error:', err);
        c.innerHTML = `<div style="padding:40px; text-align:center; color:var(--text-muted);"><i class="fas fa-triangle-exclamation" style="font-size:28px; color:var(--warning); display:block; margin-bottom:12px;"></i><b style="color:var(--text-main);">Die Liste konnte nicht geladen werden.</b><div style="margin-top:6px; font-size:13px;">${(err && err.message) ? err.message : ''}</div><button style="margin-top:16px;" onclick="switchView(&#39;kanban&#39;)">Zur Kanban-Ansicht</button></div>`;
    }
}

function generateListRow(task, isIndented) {
    const cols = appData.settings.listColumns; const progress = getTaskProgress(task); const st = appData.statuses.find(s => s.id === task.status); const sh = appData.stakeholders.find(s => s.id === task.stakeholderId);
    let rHtml = `<tr class="clickable-row ${isTaskDone(task) ? 'is-completed' : ''}" onclick="openModal('${task.id}')">`;
    let indentStyle = isIndented && window.innerWidth > 768 ? 'padding-left:30px;' : '';
    
    if(cols.assignee) { rHtml += `<td data-label="Benutzer" style="${indentStyle}">${getAvatarHtml(task.assigneeId, 'avatar-sm')}</td>`; indentStyle = ''; }
    
    let pausedIcon = task.isPaused && !isTaskDone(task) ? '<i class="fas fa-pause" style="color:var(--warning); margin-right:4px;" title="Pausiert"></i>' : '';
    const lockedIcon = isEntityLocked(task.id) ? '<i class="fas fa-lock" style="color:var(--text-muted); font-size:10px; margin-right:4px;" title="Gesperrt"></i>' : '';
    rHtml += `<td data-label="Aufgabenname" style="${indentStyle}"><b>${lockedIcon}${pausedIcon}${task.projectName}</b></td>`;
    
    if(cols.stakeholder) rHtml += `<td data-label="Stakeholder">${sh ? `<span class="stakeholder-badge" style="background:${sh.color}; margin:0;">${sh.name}</span>` : '-'}</td>`;
    if(cols.bucket) rHtml += `<td data-label="Bucket"><span style="font-size:12px; color:var(--text-muted);">${task.bucket || '-'}</span></td>`;
    if(cols.status) rHtml += `<td data-label="Status">${st ? (st.id === 'done' ? t('col_completed') : st.title) : '-'}</td>`;
    if(cols.priority) rHtml += `<td data-label="Priorität">${task.priority}</td>`;
    if(cols.startDate) rHtml += `<td data-label="Startdatum"><span style="font-size:12px; color:var(--text-muted);"><i class="far fa-calendar"></i> ${task.startDate||'-'}</span></td>`;
    
    let kwBadge = ''; if(task.dueDate) { const kw = getISOWeek(new Date(task.dueDate)); kwBadge = `<div style="font-size:9px; color:var(--primary-color); border:1px solid var(--primary-light); padding:1px 3px; border-radius:3px; display:inline-block; margin-top:2px;">KW ${kw}</div>`; }
    if(cols.dueDate) rHtml += `<td data-label="Fälligkeit"><span style="font-size:12px; display:block;"><i class="far fa-calendar-alt"></i> ${task.dueDate||'-'}</span>${kwBadge}</td>`;
    
    if(cols.recurrence) { const recMap = {none: '-', daily: t('daily'), weekly: t('weekly'), monthly: t('monthly'), yearly: t('yearly'), custom: t('custom')}; rHtml += `<td data-label="Wiederholung"><span style="font-size:11px;">${recMap[task.recurrence] || '-'}</span></td>`; }

    if(cols.timeSpent) {
        const est = parseFloat(task.estimatedTime||0); const spent = parseFloat(task.spentTime||0);
        let pct = est > 0 ? (spent / est) * 100 : (spent > 0 ? 100 : 0); const isOver = pct > 100; if(pct > 100) pct = 100;
        rHtml += `<td data-label="Aufwand"><div style="font-size:10px; color:var(--text-muted); display:flex; justify-content:space-between; margin-bottom:2px;"><span>${spent}h</span><span>${est}h</span></div><div class="time-pb-container" style="margin-top:0;"><div class="time-pb-spent ${isOver?'over':''}" style="width:${pct}%"></div></div></td>`;
    }

    if(cols.progress) rHtml += `<td data-label="Fortschritt"><div class="list-progress-cell" style="display:flex; align-items:center; gap:8px; width:100%; min-width:110px;"><span style="flex:1 1 auto; min-width:60px; display:block;">${generateProgressBarHTML(progress)}</span><small style="flex:0 0 auto; min-width:32px; text-align:right;">${progress}%</small></div></td>`;
    if(cols.description) { const desc = task.description ? (task.description.replace(/<[^>]*>?/gm, '').substring(0,50)+'...') : '-'; rHtml += `<td data-label="Notizen"><span style="font-size:11px; color:var(--text-muted);">${desc}</span></td>`; }
    if(cols.checklist) { const cl = task.checklist || []; const clDone = cl.filter(c=>c.done).length;
        let cpExtra = '';
        /* Bei abgeschlossenen Aufgaben die offenen, zukünftigen Checkpunkte lesbar auflisten */
        if(isTaskDone(task)) {
            const _todayIso = ttTodayIso();
            const futureCps = cl.filter(c => !c.done && (c.dueDate || '').split('T')[0] >= _todayIso);
            if(futureCps.length) cpExtra = `<div style="margin-top:4px; display:flex; flex-direction:column; gap:2px;">` + futureCps.map(c => `<span style="font-size:11px; color:var(--text-main);"><i class="far fa-square" style="color:var(--primary-color); margin-right:4px;"></i>${escapeHtmlToday ? escapeHtmlToday(c.title) : c.title}${c.dueDate ? ` <span style="color:var(--text-muted);">(${(c.dueDate||'').split('T')[0]})</span>` : ''}</span>`).join('') + `</div>`;
        }
        rHtml += `<td data-label="Checkliste"><span style="font-size:11px; color:var(--text-muted);"><i class="fas fa-check-square"></i> ${clDone}/${cl.length}</span>${cpExtra}</td>`; }
    if(cols.files) { const files = task.files || []; rHtml += `<td data-label="Dateien"><span style="font-size:11px; color:var(--text-muted);"><i class="fas fa-paperclip"></i> ${files.length}</span></td>`; }
    if(cols.notes) { const notes = task.notes ? (task.notes.length > 50 ? task.notes.substring(0,50)+'...' : task.notes) : '-'; rHtml += `<td data-label="Historie"><span style="font-size:11px; color:var(--text-muted);" title="${task.notes}">${notes}</span></td>`; }
    
    rHtml += `</tr>`; return rHtml;
}

// STAKEHOLDER & BUCKETS VIEWS
function handleGroupItemDrop(e, el, targetId, targetType, groupKey, targetGroupVal) {
    e.preventDefault(); e.stopPropagation(); const insertAfter = el.classList.contains('drag-over-bottom'); const isMerge = el.classList.contains('drag-over-merge'); handleCardDragLeave(el);
    const draggedId = e.dataTransfer.getData('text/plain'); const draggedType = e.dataTransfer.getData('type');
    if(!draggedId || draggedId === targetId) return;

    if(isMerge && draggedType === 'task' && targetType === 'task') { openMergeModal(draggedId, targetId); return; }
    if(draggedType === 'task' && targetType === 'stack') {
        const task = appData.tasks.find(x => x.id === draggedId);
        if(task) { task.projectStackId = targetId; if(groupKey === 'stakeholderId') task.stakeholderId = targetGroupVal; if(groupKey === 'bucket') task.bucket = targetGroupVal; saveToLocal(); renderView(); }
        return;
    }
    
    const arrayToUse = draggedType === 'task' ? appData.tasks : appData.projectStacks; const item = arrayToUse.find(x => x.id === draggedId);
    if(item) {
        if(groupKey === 'stakeholderId') item.stakeholderId = targetGroupVal; if(groupKey === 'bucket') item.bucket = targetGroupVal;
        if (draggedType === 'task' && targetType === 'task') { const targetTask = appData.tasks.find(x => x.id === targetId); item.projectStackId = targetTask ? (targetTask.projectStackId || '') : ''; }
        if (draggedType === targetType) { moveItemInArray(arrayToUse, draggedId, targetId, insertAfter); }
        saveToLocal(); renderView();
    }
}

function handleGroupContainerDrop(e, groupKey, targetGroupVal) {
    e.preventDefault(); e.stopPropagation(); const draggedId = e.dataTransfer.getData('text/plain'); const draggedType = e.dataTransfer.getData('type'); if(!draggedId) return;
    const arrayToUse = draggedType === 'task' ? appData.tasks : appData.projectStacks; const item = arrayToUse.find(x => x.id === draggedId);
    if(item) {
        if(groupKey === 'stakeholderId') item.stakeholderId = targetGroupVal; if(groupKey === 'bucket') item.bucket = targetGroupVal;
        if(draggedType === 'task') item.projectStackId = '';
        const idx = arrayToUse.indexOf(item); arrayToUse.splice(idx, 1); arrayToUse.push(item);
        saveToLocal(); renderView();
    }
}

let _weeklyScaleMax = 0;   /* gemeinsame Skala der Wochenbalken ueber alle Kacheln */
function renderGroupedView(c, groupKey, itemsObj, unassignedLabel, showTimeStats=false) {
    let sortKey = groupKey === 'stakeholderId' ? stakeholderSortKey : bucketSortKey; let sortVarName = groupKey === 'stakeholderId' ? 'stakeholderSortKey' : 'bucketSortKey';
    let html = getSortButtonsHTML(sortKey, sortVarName);
    const itemsToGroup = [...getFilteredTasks().map(t_obj => ({...t_obj, _type: 'task'})), ...getFilteredStacks().map(s => ({...s, _type: 'stack'}))];
    const groups = itemsToGroup.reduce((acc, item) => { const kId = item[groupKey] || 'none'; if(!acc[kId]) acc[kId] = []; acc[kId].push(item); return acc; }, {});
    
    /* Gemeinsamer Hoechstwert fuer die Wochenbalken: so sind die Kacheln untereinander
       vergleichbar und nicht jede fuer sich auf 100% skaliert. */
    _weeklyScaleMax = 0;
    if (showTimeStats) {
        const groupVals = itemsObj.map(it => it.id).concat(['']);
        groupVals.forEach(gv => {
            const ids = getGroupTaskIdsAll(groupKey, gv).taskIds;
            getWeeklyHours(ids).forEach(w => { if (w.hours > _weeklyScaleMax) _weeklyScaleMax = w.hours; });
        });
    }

    html += `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 20px;">`;
    itemsObj.forEach(item => { if(groups[item.id]) { html += buildGroupCard(item.name, item.color || 'var(--primary-color)', groups[item.id], showTimeStats, groupKey, item.id); delete groups[item.id]; } else { html += buildGroupCard(item.name, item.color || 'var(--primary-color)', [], showTimeStats, groupKey, item.id); } });
    if(groups['none']) { html += buildGroupCard(unassignedLabel, 'var(--text-muted)', groups['none'], showTimeStats, groupKey, ''); }
    c.innerHTML = html + `</div>`;
}

function buildGroupCard(name, color, arr, showTimeStats, groupKey, targetGroupVal) {
    let sortKey = groupKey === 'stakeholderId' ? stakeholderSortKey : bucketSortKey; arr = applySort(arr, sortKey);
    let totalEst = 0; let totalSpent = 0;
    const stackIdsInGroup = new Set();
    arr.forEach(item => { if(item._type === 'stack') stackIdsInGroup.add(item.id); if(item._type === 'task' && item.projectStackId) stackIdsInGroup.add(item.projectStackId); });
    const standaloneTasks = arr.filter(x => x._type === 'task' && !x.projectStackId);
    const groupTaskIds = new Set();

    /* Auswertungen beziehen bewusst ALLE Eintraege der Gruppe ein - auch abgeschlossene
       und pausierte -, unabhaengig von den aktiven Ausblende-Filtern. */
    let hiddenBadges = '';
    if(showTimeStats) {
        const all = getGroupTaskIdsAll(groupKey, targetGroupVal);
        all.taskIds.forEach(id => {
            const tx = appData.tasks.find(x => x.id === id);
            if(!tx) return;
            totalEst += parseFloat(tx.estimatedTime||0); totalSpent += parseFloat(tx.spentTime||0);
            groupTaskIds.add(tx.id);
        });
        const hc = getGroupHiddenCounts(groupKey, targetGroupVal);
        const badge = (n, label, col) => `<span style="display:inline-flex; align-items:center; gap:5px; background:color-mix(in srgb, ${col} 14%, var(--surface-color)); color:${col}; border:1px solid ${col}; border-radius:999px; padding:2px 9px; font-size:11px; font-weight:600;">${n} ${label}</span>`;
        const parts = [];
        if(appData.settings.globalHideCompleted && hc.doneCount > 0) parts.push(badge(hc.doneCount, t('hidden_done'), 'var(--success)'));
        if(appData.settings.globalHidePaused && hc.pausedCount > 0) parts.push(badge(hc.pausedCount, t('hidden_paused'), 'var(--warning)'));
        if(parts.length) hiddenBadges = `<div style="display:flex; gap:6px; flex-wrap:wrap; margin:0 0 10px 0;">${parts.join('')}</div>`;
    }

    const chartHtml = showTimeStats ? buildActivitySparklineHtml(groupTaskIds) : '';
    const weeklyHtml = showTimeStats ? buildWeeklyHoursChartHtml(groupTaskIds, _weeklyScaleMax) : '';
    let headerExtra = showTimeStats ? `<div style="font-size:12px; margin-bottom:10px; color:var(--text-muted)">${t('time_effort')}: ${totalSpent.toFixed(2)}h ${t('actual')} / ${totalEst.toFixed(2)}h ${t('target')}</div>${hiddenBadges}${chartHtml}${weeklyHtml}` : '';
    let h = `<div style="background:var(--surface-color); padding:20px; border-radius:var(--radius); border:1px solid var(--border-color); border-top: 4px solid ${color}; min-height: 150px;" ondragover="event.preventDefault();" ondrop="handleGroupContainerDrop(event, '${groupKey}', '${targetGroupVal}')"><h3 style="margin-bottom:5px; padding-bottom:10px;">${name}</h3>${headerExtra}<div style="display:flex; flex-direction:column; gap:10px;">`;
    
    const renderedStackIds = new Set();
    arr.forEach(item => {
        if(item._type === 'stack') { if(!renderedStackIds.has(item.id)) { h += renderGroupedStack(item.id, showTimeStats, groupKey, targetGroupVal); renderedStackIds.add(item.id); } } 
        else if(item._type === 'task' && item.projectStackId) { if(!renderedStackIds.has(item.projectStackId)) { h += renderGroupedStack(item.projectStackId, showTimeStats, groupKey, targetGroupVal); renderedStackIds.add(item.projectStackId); } }
    });

    standaloneTasks.forEach(t_obj => { 
        const progress = getTaskProgress(t_obj); let timeBarHtml = ''; let actionBtns = ''; const isCompleted = isTaskDone(t_obj);
        const lockedIcon = isEntityLocked(t_obj.id) ? '<i class="fas fa-lock" style="color:var(--text-muted); font-size:10px; margin-right:4px;" title="Gesperrt"></i>' : '';

        if(!isCompleted) {
            if(t_obj.isPaused) actionBtns += `<button class="secondary icon-btn" onclick="event.stopPropagation(); setTaskState('${t_obj.id}', 'resume')" title="${t('btn_resume')}"><i class="fas fa-play"></i></button>`;
            else actionBtns += `<button class="secondary icon-btn" onclick="event.stopPropagation(); setTaskState('${t_obj.id}', 'pause')" title="${t('btn_pause')}"><i class="fas fa-pause"></i></button>`;
            actionBtns += `<button class="secondary icon-btn" onclick="event.stopPropagation(); setTaskState('${t_obj.id}', 'complete')" title="${t('btn_complete')}"><i class="fas fa-check"></i></button>`;
        } else { actionBtns += `<button class="secondary icon-btn" onclick="event.stopPropagation(); setTaskState('${t_obj.id}', 'reopen')" title="${t('btn_reopen')}"><i class="fas fa-undo"></i></button>`; }

        if(showTimeStats) {
            const est = parseFloat(t_obj.estimatedTime||0); const spent = parseFloat(t_obj.spentTime||0);
            let realPct = est > 0 ? (spent / est) * 100 : (spent > 0 ? 100 : 0); let pct = realPct > 100 ? 100 : realPct;
            timeBarHtml = `<div style="margin-top:8px;"><div style="font-size:10px; color:var(--text-muted); display:flex; justify-content:space-between;"><span>${t('actual')}: ${spent.toFixed(2)}h</span><span>${t('target')}: ${est.toFixed(2)}h</span></div><div class="time-pb-container"><div class="time-pb-spent ${realPct>100?'over':''}" style="width:${pct}%"></div></div></div>`;
        }
        let tPausedIcon = t_obj.isPaused && !isCompleted ? '<i class="fas fa-pause" style="color:var(--warning); margin-right:4px;"></i>' : '';
        h += `<div class="draggable-item ${isTaskDone(t_obj)?'is-completed':''}" style="padding:10px; background:var(--bg-color); border-radius:var(--radius); cursor:pointer; border:1px solid var(--border-color);" draggable="true" ondragstart="event.stopPropagation(); event.dataTransfer.setData('text/plain', '${t_obj.id}'); event.dataTransfer.setData('type', 'task');" ondragover="handleCardDragOver(event, this, true)" ondragleave="handleCardDragLeave(this)" ondrop="handleGroupItemDrop(event, this, '${t_obj.id}', 'task', '${groupKey}', '${targetGroupVal}')" onclick="openModal('${t_obj.id}')">
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><b>${lockedIcon}${tPausedIcon}${t_obj.projectName}</b><div style="display:flex; gap:5px; align-items:center;"><span style="font-size:12px; margin-right:5px;">${t_obj.dueDate||''}</span> ${actionBtns}</div></div>
            ${!showTimeStats ? generateProgressBarHTML(progress) + `<div style="font-size:10px;text-align:right; margin-top:2px;">${t('list_prog')}: ${progress}%</div>` : ''}${timeBarHtml}
        </div>`; 
    });
    return h + `</div></div>`;
}

function renderGroupedStack(sId, showTimeStats, groupKey, targetGroupVal) {
    const s = appData.projectStacks.find(x => x.id === sId); if(!s) return '';
    const allStackTasks = appData.tasks.filter(tx => tx.projectStackId === sId);
    let sEst = 0, sspent = 0; allStackTasks.forEach(tx => { sEst += parseFloat(tx.estimatedTime||0); sspent += parseFloat(tx.spentTime||0); });
    const sLockedIcon = isEntityLocked(sId) ? '<i class="fas fa-lock" style="color:var(--text-muted); font-size:12px; margin-right:6px;" title="Gesperrt"></i>' : '';

    let timeBarHtml = '';
    if(showTimeStats) {
        let realPct = sEst > 0 ? (sspent / sEst) * 100 : (sspent > 0 ? 100 : 0); let pct = realPct > 100 ? 100 : realPct;
        timeBarHtml = `<div style="margin-top:8px;"><div style="font-size:10px; color:var(--text-muted); display:flex; justify-content:space-between;"><span>${t('actual')}: ${sspent.toFixed(2)}h</span><span>${t('target')}: ${sEst.toFixed(2)}h</span></div><div class="time-pb-container"><div class="time-pb-spent ${realPct>100?'over':''}" style="width:${pct}%"></div></div></div>`;
    }

    let tasksHtml = '';
    if(allStackTasks.length > 0) {
        tasksHtml = `<div style="margin-top:8px; display:flex; flex-direction:column; gap:6px;">`;
        allStackTasks.forEach(tx => {
            let innerBarHtml = '';
            const txLocked = isEntityLocked(tx.id) ? '<i class="fas fa-lock" style="color:var(--text-muted); font-size:10px; margin-right:4px;"></i>' : '';
            if(showTimeStats) {
                const tEst = parseFloat(tx.estimatedTime||0); const tSpent = parseFloat(tx.spentTime||0); let tPct = tEst > 0 ? (tSpent / tEst) * 100 : (tSpent > 0 ? 100 : 0); const isOver = tPct > 100; if(tPct > 100) tPct = 100;
                innerBarHtml = `<div style="display:flex; align-items:center; gap:6px; flex-shrink: 0;"><span style="font-size:10px; color:var(--text-muted); white-space:nowrap;">${tSpent.toFixed(1)}/${tEst.toFixed(1)}h</span><div style="width: 40px; min-width: 40px; height: 5px; background: var(--border-color); border-radius: 3px; overflow: hidden; display: flex;"><div style="height: 100%; width: ${tPct}%; background: ${isOver ? 'var(--danger)' : 'var(--success)'};"></div></div></div>`;
            } else {
                const tProg = getTaskProgress(tx);
                innerBarHtml = `<div style="display:flex; align-items:center; gap:6px; flex-shrink: 0;"><span style="font-size:10px; color:var(--text-muted); white-space:nowrap;">${tProg}%</span><div style="width: 40px; min-width: 40px; height: 5px; background: var(--border-color); border-radius: 3px; overflow: hidden; display: flex;"><div style="height: 100%; width: ${tProg}%; background: var(--primary-color);"></div></div></div>`;
            }
            let tPausedIcon = tx.isPaused && !isTaskDone(tx) ? '<i class="fas fa-pause" style="color:var(--warning); margin-right:4px;"></i>' : '';
            tasksHtml += `<div class="draggable-item" draggable="true" ondragstart="event.stopPropagation(); event.dataTransfer.setData('text/plain', '${tx.id}'); event.dataTransfer.setData('type', 'task');" ondragover="handleCardDragOver(event, this, true)" ondragleave="handleCardDragLeave(this)" ondrop="handleGroupItemDrop(event, this, '${tx.id}', 'task', '${groupKey}', '${targetGroupVal}')" style="font-size:11px; background:var(--surface-color); padding:6px 8px; border-radius:4px; border:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="event.stopPropagation(); openModal('${tx.id}')"><span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; margin-right:10px; font-weight:500;" title="${tx.projectName}">${txLocked}${tPausedIcon}${tx.projectName}</span><div style="display:flex; align-items:center; gap:8px; flex-shrink: 0;">${innerBarHtml}<div style="width: 14px; text-align: center;">${isTaskDone(tx) ? '<i class="fas fa-check" style="color:var(--success)"></i>' : ''}</div></div></div>`;
        });
        tasksHtml += `</div>`;
    }

    const sp = getStackProgress(s.id); const sPausedIcon = s.status === 'paused' ? '<i class="fas fa-pause" style="color:var(--warning); margin-right:4px;"></i>' : '';
    return `<div class="draggable-item ${s.status==='completed'?'is-completed':''}" style="padding:10px; background:var(--primary-lightest); border-radius:var(--radius); border:1px solid var(--border-color);" draggable="true" ondragstart="event.stopPropagation(); event.dataTransfer.setData('text/plain', '${s.id}'); event.dataTransfer.setData('type', 'stack');" ondragover="handleCardDragOver(event, this, false)" ondragleave="handleCardDragLeave(this)" ondrop="handleGroupItemDrop(event, this, '${s.id}', 'stack', '${groupKey}', '${targetGroupVal}')" onclick="openStackModal('${s.id}')"><div style="display:flex; justify-content:space-between; margin-bottom:5px; cursor:pointer;"><b><i class="fas fa-folder"></i> ${sLockedIcon}${sPausedIcon}${s.name}</b><span style="font-size:12px;">${s.dueDate||''}</span></div>${!showTimeStats ? generateProgressBarHTML(sp.tPct, true) + `<div style="font-size:10px;text-align:right; margin-top:2px;">${t('list_prog')}: ${sp.tPct}%</div>` : timeBarHtml}${tasksHtml}</div>`;
}

function renderStakeholder(c) { renderGroupedView(c, 'stakeholderId', appData.stakeholders, t('none'), true); }
function renderBuckets(c) { const bObj = appData.buckets.map(b => ({id: b, name: b, color: getBucketColor(b)})); renderGroupedView(c, 'bucket', bObj, t('none'), true); }

// SCHEDULE / CALENDAR / TIMELINE HELPERS

function safeRenderSchedule() {
    const sub = document.getElementById('plannerSubContainer');
    if(sub) renderSchedule(sub); else renderView();
}

function safeRenderTimeline() {
    const sub = document.getElementById('plannerSubContainer');
    if(sub) renderTimeline(sub); else renderView();
}

function changeCalendarDate(dir) {
    if(scheduleMode === 'day') {
        scheduleCurrentDate.setDate(scheduleCurrentDate.getDate() + dir);
    } else if(scheduleMode === 'week') {
        scheduleCurrentDate.setDate(scheduleCurrentDate.getDate() + (dir * 7));
    } else if(scheduleMode === 'month') {
        scheduleCurrentDate.setMonth(scheduleCurrentDate.getMonth() + dir);
    } else if(scheduleMode === 'year') {
        scheduleCurrentDate.setFullYear(scheduleCurrentDate.getFullYear() + dir);
    }
    safeRenderSchedule();
}

function goToToday() { 
    scheduleCurrentDate = new Date(); safeRenderSchedule(); 
    setTimeout(() => { const el = document.querySelector('.cal-day.today, .month-card.current'); if(el) el.scrollIntoView({behavior: 'smooth', block: 'center'}); }, 100);
}

function getDatesInRange(startStr, endStr) {
    let dates = []; 
    if (!startStr && !endStr) return dates;
    
    let s = startStr ? startStr : endStr; 
    let e = endStr ? endStr : startStr;
    
    let current = new Date(s); 
    if (isNaN(current.getTime())) return dates;
    current.setHours(0,0,0,0); 
    
    let end = new Date(e); 
    if (isNaN(end.getTime())) return [current];
    end.setHours(0,0,0,0);
    
    if (current > end) return [end]; 
    
    let safetyCounter = 0;
    while (current <= end && safetyCounter < 1000) { 
        dates.push(new Date(current)); 
        current.setDate(current.getDate() + 1); 
        safetyCounter++;
    }
    return dates;
}

function getISOWeek(d) {
    const date = new Date(d.getTime()); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4); return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

function timeToMinutes(timeStr) {
    if(!timeStr) return 0;
    const parts = timeStr.split(':');
    const h = parseInt(parts[0]) || 0;
    const m = parseInt(parts[1]) || 0;
    return (h * 60) + m;
}

function formatTimeFromMinutes(mins) {
    if(isNaN(mins) || mins < 0) mins = 0;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// --- DRAG & DROP: Aufgaben/Stacks aus "Ganztägig" oder "Backlog / Ungeplant" in die Tages-, Wochen-, Monats- oder Jahresplanung ziehen ---
function handleSchedDragStart(e, type, id) {
    e.stopPropagation();
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.setData('type', type);
    e.dataTransfer.effectAllowed = 'move';
}
function handleSchedDragOver(e, el) {
    e.preventDefault(); e.stopPropagation();
    if(e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    el.classList.add('sched-drop-hover');
}
function handleSchedDragLeave(el) {
    el.classList.remove('sched-drop-hover');
}
function scheduleAssignDate(type, id, dateStr, timeStr = null) {
    if(!dateStr || (type !== 'task' && type !== 'stack')) return;
    const newVal = timeStr ? `${dateStr}T${timeStr}` : dateStr;
    let changedName = '';
    if(type === 'task') {
        const task = appData.tasks.find(x => x.id === id);
        if(task) { task.startDate = newVal; task.dueDate = newVal; changedName = task.projectName; }
    } else if(type === 'stack') {
        const stack = appData.projectStacks.find(x => x.id === id);
        if(stack) { stack.startDate = newVal; stack.dueDate = newVal; changedName = stack.name; }
    }
    if(!changedName) return;
    const [y, mo, da] = dateStr.split('-');
    const dateLabel = `${da}.${mo}.${y}`;
    saveToLocal(); safeRenderSchedule();
    showToast(`"${changedName}" für ${dateLabel}${timeStr ? ' um ' + timeStr + ' Uhr' : ''} eingeplant.`);
}
function handleSchedDropDate(e, el, dateStr) {
    e.preventDefault(); e.stopPropagation();
    if(el) el.classList.remove('sched-drop-hover');
    const type = e.dataTransfer.getData('type'); const id = e.dataTransfer.getData('text/plain');
    if(!type || !id) return;
    scheduleAssignDate(type, id, dateStr);
}
function handleSchedDropTimeline(e, el) {
    e.preventDefault(); e.stopPropagation();
    if(el) el.classList.remove('sched-drop-hover');
    const type = e.dataTransfer.getData('type'); const id = e.dataTransfer.getData('text/plain');
    if(!type || !id) return;
    const rect = el.getBoundingClientRect();
    let pct = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
    pct = Math.max(0, Math.min(1, pct));
    const startMins = parseFloat(el.dataset.startMins) || 0;
    const totalMins = parseFloat(el.dataset.totalMins) || 0;
    let mins = startMins + pct * totalMins;
    mins = Math.round(mins / 15) * 15; // Auf 15 Minuten runden
    const timeStr = formatTimeFromMinutes(mins);
    const dateStr = el.dataset.date;
    scheduleAssignDate(type, id, dateStr, timeStr);
}

// --- QUICK ACTIONS FÜR DIE LISTENANSICHT ---
function quickDeferEvent(type, id, parentId, origDateStr) {
    if(!origDateStr) return;
    const d = new Date(origDateStr);
    d.setDate(d.getDate() + 1); // +1 Tag
    const newDateStr = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    
    let changedName = '';
    if(type === 'task') {
        const task = appData.tasks.find(x => x.id === id);
        if(task) { task.dueDate = newDateStr; changedName = task.projectName; }
    } else if (type === 'stack') {
        const stack = appData.projectStacks.find(x => x.id === id);
        if(stack) { stack.dueDate = newDateStr; changedName = stack.name; }
    } else if (type === 'milestone' || type === 'task-checklist') {
        const parent = (type === 'milestone') ? appData.projectStacks.find(x => x.id === parentId) : appData.tasks.find(x => x.id === parentId);
        if(parent && parent.checklist) {
            const clItem = parent.checklist.find(x => x.id === id);
            if(clItem) { clItem.dueDate = newDateStr; changedName = clItem.title; }
        }
    }
    saveToLocal(); safeRenderSchedule(); showToast(`"${changedName}" auf Morgen verschoben.`);
}

function quickCompleteEvent(type, id, parentId) {
    if(isEntityLocked(id)) return showToast("Element ist durch Abhängigkeiten gesperrt!", "warning");
    let changedName = '';
    if(type === 'task') {
        const task = appData.tasks.find(x => x.id === id);
        if(task) { task.status = 'done'; task.isPaused = false; task.completedAt = Date.now(); changedName = task.projectName; }
    } else if (type === 'stack') {
        const stack = stack = appData.projectStacks.find(x => x.id === id);
        if(stack) { stack.status = 'completed'; stack.completedAt = Date.now(); changedName = stack.name; }
    } else if (type === 'milestone' || type === 'task-checklist') {
        const parent = (type === 'milestone') ? appData.projectStacks.find(x => x.id === parentId) : appData.tasks.find(x => x.id === parentId);
        if(parent && parent.checklist) {
            const clItem = parent.checklist.find(x => x.id === id);
            if(clItem) { clItem.done = true; changedName = clItem.title; }
        }
    }
    saveToLocal(); safeRenderSchedule(); showToast(`"${changedName}" erledigt!`);
}

/* Wechselt zur Zeiterfassung und stellt sicher, dass nicht die Budget-Unteransicht offen bleibt. */
function goToTimeTracking() {
    timeSubView = 'tracking';
    switchView('time');
}

function quickTrackTime(taskId, noteText = '') {
    /* Immer zur Zeiterfassung wechseln – war zuvor „Budget" offen, fehlt sonst das Formular. */
    timeSubView = 'tracking';
    switchView('time');
    setTimeout(() => {
        const sel = document.getElementById('tt_task');
        if(sel) {
            /* Ist die Aufgabe abgeschlossen, fehlt sie in der Auswahl – dann
               fügen wir sie einmalig hinzu, damit trotzdem gebucht werden kann. */
            if (![...sel.options].some(o => o.value === taskId)) {
                const tk = appData.tasks.find(x => x.id === taskId);
                if (tk) {
                    const opt = document.createElement('option');
                    opt.value = taskId;
                    opt.textContent = (isTaskDone(tk) ? '✓ ' : '') + tk.projectName;
                    sel.appendChild(opt);
                }
            }
            sel.value = taskId;
        }
        const hrs = document.getElementById('tt_hours');
        if(hrs) { hrs.focus(); hrs.select(); }
        if(noteText) { const noteEl = document.getElementById('tt_note'); if(noteEl) noteEl.value = noteText; }
    }, 120);
}

function renderSchedule(c) {
    let html = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px; flex-wrap: wrap; gap: 15px;">
        <div style="display:flex; gap:5px; overflow-x:auto; padding-bottom:5px; flex:1;">
            <button class="secondary ${scheduleMode==='list'?'active':''}" onclick="scheduleMode='list'; safeRenderSchedule()"><i class="fas fa-clock-rotate-left"></i> ${t('sched_history')}</button>
            <button class="secondary ${scheduleMode==='day'?'active':''}" onclick="scheduleMode='day'; safeRenderSchedule()"><i class="fas fa-calendar-day"></i> ${t('day')}</button>
            <button class="secondary ${scheduleMode==='week'?'active':''}" onclick="scheduleMode='week'; safeRenderSchedule()"><i class="fas fa-calendar-week"></i> ${t('week')}</button>
            <button class="secondary ${scheduleMode==='month'?'active':''}" onclick="scheduleMode='month'; safeRenderSchedule()"><i class="fas fa-calendar-alt"></i> ${t('month')}</button>
            <button class="secondary ${scheduleMode==='year'?'active':''}" onclick="scheduleMode='year'; safeRenderSchedule()"><i class="fas fa-calendar"></i> ${t('year')}</button>
        </div>
        <button class="secondary" onclick="goToToday()"><i class="fas fa-bullseye"></i> ${t('today')}</button>
    </div>`;
    
    let events = []; let unscheduledItems = [];
    const tasks = getFilteredTasks(); const stacks = getFilteredStacks();
    const hideDone = appData.settings.globalHideCompleted; const hidePaused = appData.settings.globalHidePaused;
    const workDays = appData.settings.workDays || [1,2,3,4,5];
    
    const pushSpanned = (startStr, endStr, type, data, parent) => {
        let dates = getDatesInRange(startStr, endStr); if(dates.length === 0) return;
        
        let isTimed = false;
        let startTime = null;
        let endTime = null;
        
        if (startStr && startStr.includes('T')) { isTimed = true; startTime = startStr.split('T')[1]; }
        if (endStr && endStr.includes('T')) { isTimed = true; endTime = endStr.split('T')[1]; }

        if(dates.length === 1) { 
            events.push({ date: dates[0], type, data, parent, span: 'single', isTimed, startTime, endTime, origDateStr: endStr }); 
        } else { 
            dates.forEach((d, idx) => { 
                let span = idx === 0 ? 'start' : (idx === dates.length - 1 ? 'end' : 'middle'); 
                let sTime = (span === 'start') ? startTime : null;
                let eTime = (span === 'end') ? endTime : null;
                events.push({ date: new Date(d), type, data, parent, span, isTimed: (sTime || eTime) ? true : false, startTime: sTime, endTime: eTime, origDateStr: endStr }); 
            }); 
        }
    };

    const getEndOfYearStr = (dateStr) => { if(!dateStr) return null; return `${new Date(dateStr).getFullYear()}-12-31`; };

    tasks.forEach(t_obj => { 
        let taskMatchesUser = activeFilters.users.length === 0 || activeFilters.users.includes(t_obj.assigneeId || '');
        let start = t_obj.startDate; let end = t_obj.dueDate;
        
        if(!start && !end) { if(taskMatchesUser) unscheduledItems.push({ type: 'task', data: t_obj }); } 
        else { if(start && !end) end = getEndOfYearStr(start); if((start || end) && taskMatchesUser) pushSpanned(start, end, 'task', t_obj, t_obj); }

        if(t_obj.checklist) t_obj.checklist.forEach(cl => { 
            let clMatchesUser = activeFilters.users.length === 0 || activeFilters.users.includes(cl.assigneeId || '');
            if(hideDone && cl.done) return;
            if(cl.dueDate && (taskMatchesUser || clMatchesUser)) { pushSpanned(cl.startDate || cl.dueDate, cl.dueDate, 'task-checklist', cl, t_obj); }
        });
    });
    
    stacks.forEach(s => {
        let stackMatchesUser = activeFilters.users.length === 0 || activeFilters.users.includes(s.assigneeId || '');
        let start = s.startDate; let end = s.dueDate;

        if(!start && !end) { if(stackMatchesUser) unscheduledItems.push({ type: 'stack', data: s }); } 
        else { if(start && !end) end = getEndOfYearStr(start); if((start || end) && stackMatchesUser) pushSpanned(start, end, 'stack', s, s); }

        if(s.checklist) s.checklist.forEach(m => { 
            let mMatchesUser = activeFilters.users.length === 0 || activeFilters.users.includes(m.assigneeId || '');
            if(hideDone && m.done) return;
            if(m.dueDate && (stackMatchesUser || mMatchesUser)) { pushSpanned(m.dueDate, m.dueDate, 'milestone', m, s); }
        });
    });

    // Abwesenheiten (Urlaub, Krank, Feiertag, Kompensation) als Ereignisse mitführen
    /* Abgeschlossene (herausgefilterte) Aufgaben: zukünftige, offene Checkpunkte trotzdem zeigen */
    if(hideDone) {
        const _todayIso = ttTodayIso();
        appData.tasks.forEach(t_obj => {
            if(!isTaskDone(t_obj)) return;
            let taskMatchesUser = activeFilters.users.length === 0 || activeFilters.users.includes(t_obj.assigneeId || '');
            if(!taskMatchesUser) return;
            (t_obj.checklist || []).forEach(cl => {
                if(cl.done) return;
                const clDate = (cl.dueDate || '').split('T')[0];
                if(clDate && clDate >= _todayIso) pushSpanned(cl.startDate || cl.dueDate, cl.dueDate, 'task-checklist', cl, t_obj);
            });
        });
    }
    (appData.absences || []).forEach(a => {
        events.push({ date: ttParse(a.date), type: 'absence', data: a, parent: null, span: 'single' });
    });

    const isDay = scheduleMode === 'day';
    const isWeek = scheduleMode === 'week'; 
    const isMonth = scheduleMode === 'month'; 
    const isYear = scheduleMode === 'year';

    if(isDay || isWeek || isMonth || isYear) {
        let label = ''; let wStart, wEnd;
        if (isYear) { label = `${scheduleCurrentDate.getFullYear()}`; } 
        else if (isMonth) { label = `${scheduleCurrentDate.toLocaleString('de-DE', { month: 'long' })} ${scheduleCurrentDate.getFullYear()}`; } 
        else if (isWeek) {
            const currentDay = scheduleCurrentDate.getDay(); const diff = scheduleCurrentDate.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
            wStart = new Date(scheduleCurrentDate); wStart.setDate(diff); wStart.setHours(0,0,0,0);
            wEnd = new Date(wStart); wEnd.setDate(wStart.getDate() + 6); const opts = { day: '2-digit', month: 'short' }; const kw = getISOWeek(wStart);
            label = `${wStart.toLocaleDateString('de-DE', opts)} - ${wEnd.toLocaleDateString('de-DE', opts)} ${wEnd.getFullYear()} (KW ${kw})`;
        }
        else if (isDay) {
            const opts = { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' };
            label = scheduleCurrentDate.toLocaleDateString('de-DE', opts);
        }

        html += `<div style="display:flex; gap:5px; align-items:center; width:100%; justify-content:space-between;">
            <button class="secondary icon-btn" onclick="changeCalendarDate(-1)" style="min-width:44px;"><i class="fas fa-chevron-left"></i></button>
            <span style="margin: 0 10px; font-weight:bold; font-size:14px; text-align:center;">${label}</span>
            <button class="secondary icon-btn" onclick="changeCalendarDate(1)" style="min-width:44px;"><i class="fas fa-chevron-right"></i></button>
        </div></div>`;
        
        if(isDay) {
            // --- TAGESANSICHT RENDERING ---
            const tzOffset = scheduleCurrentDate.getTimezoneOffset() * 60000;
            const dStr = new Date(scheduleCurrentDate.getTime() - tzOffset).toISOString().split('T')[0];
            
            const dayEvents = events.filter(e => {
                const eTz = new Date(e.date.getTime() - tzOffset);
                return eTz.toISOString().split('T')[0] === dStr;
            });
            
            const allDayEvents = dayEvents.filter(e => !e.isTimed);
            const timedEvents = dayEvents.filter(e => e.isTimed);

            const wdStartStr = appData.settings.workDayStart || '08:00';
            const wdEndStr = appData.settings.workDayEnd || '17:00';
            const startMins = timeToMinutes(wdStartStr);
            const endMins = timeToMinutes(wdEndStr);
            const totalMins = Math.max(60, endMins - startMins);
            
            html += `<div style="display:flex; flex-direction:column; flex:1; min-height:0; width:100%;">`;

            // Ganztägige Box
            html += `<div id="sched-allday-drop" ondragover="handleSchedDragOver(event, this)" ondragleave="handleSchedDragLeave(this)" ondrop="handleSchedDropDate(event, this, '${dStr}')" style="background:var(--surface-color); border:1px solid var(--border-color); border-radius:var(--radius); margin-bottom:15px; padding:15px; box-shadow:var(--shadow); flex-shrink:0;">`;
            html += `<h4 style="margin-bottom:10px; font-size:13px; color:var(--text-muted);"><i class="fas fa-calendar-day"></i> Ganztägig / Ohne konkrete Uhrzeit</h4>`;
            
            if(allDayEvents.length === 0) {
                html += `<div style="font-size:12px; color:var(--text-muted); font-style:italic;">Keine Einträge für diesen Tag.</div>`;
            } else {
                html += `<div style="display:flex; flex-wrap:wrap; gap:8px;">`;
                allDayEvents.forEach(ev => {
                    let color='var(--text-main)'; let bg='rgba(0,0,0,0.05)'; let icon=''; let title=''; let click=''; let isComp = false; let isPaused = false;
                    if(ev.type === 'stack') { color='var(--primary-color)'; bg='var(--primary-light)'; icon='<i class="fas fa-folder"></i>'; title=ev.data.name; click=`openStackModal('${ev.data.id}')`; isComp = (ev.data.status === 'completed'); isPaused = ev.data.status === 'paused'; } 
                    else if(ev.type === 'milestone') { color='var(--primary-color)'; bg='var(--primary-lightest)'; icon='<i class="fas fa-flag"></i>'; title=ev.data.title; click=`openStackModal('${ev.parent.id}')`; isComp = (ev.data.done || ev.parent.status === 'completed'); isPaused = ev.parent.status === 'paused' && !isComp; } 
                    else if(ev.type === 'task') { color='var(--primary-color)'; bg='var(--primary-light)'; icon='<i class="fas fa-tasks"></i>'; title=ev.data.projectName; click=`openModal('${ev.data.id}')`; isComp = isTaskDone(ev.data); isPaused = ev.data.isPaused && !isComp; }
                    else if(ev.type === 'task-checklist') { color='var(--primary-color)'; bg='var(--primary-lightest)'; icon='<i class="fas fa-check-square"></i>'; title=ev.data.title; click=`openTaskToCheckpoint('${ev.parent.id}','${ev.data.id}')`; isComp = (ev.data.done || isTaskDone(ev.parent)); isPaused = ev.parent.isPaused && !isComp; } else if(ev.type === 'absence') { const _ac = ABSENCE_TYPES[ev.data.type] || {}; color = ttAbsColor(ev.data.type); bg = 'color-mix(in srgb, ' + color + ' 16%, transparent)'; icon = '<i class="fas ' + (ttAbsIcon(ev.data.type)) + '"></i>'; title = ttAbsLabel(ev.data.type) + (ev.data.note ? ' – ' + ev.data.note : ''); click = "switchView('time')"; }
                    
                    let spanText = '';
                    if(ev.span === 'start') spanText = '(Start)';
                    if(ev.span === 'end') spanText = '(Deadline)';
                    if(ev.span === 'middle') spanText = '(Laufend)';

                    let pausedIcon = isPaused ? '<i class="fas fa-pause" style="color:var(--warning); margin-right:4px;"></i>' : '';
                    const isDraggableItem = ev.type === 'task' || ev.type === 'stack';
                    const dragAttrs = isDraggableItem ? `draggable="true" ondragstart="handleSchedDragStart(event, '${ev.type}', '${ev.data.id}')"` : '';
                    
                    html += `<div class="cal-event ${isComp?'is-completed':''}" ${dragAttrs} style="background:${bg}; color:${color}; padding:6px 12px; font-size:12px; display:inline-flex; flex-direction:row; align-items:center; gap:6px; border-radius:20px; cursor:pointer; border: 1px solid ${color};" onclick="${click}">
                        ${icon} <span style="font-weight:bold; white-space:nowrap;">${pausedIcon}${title} <span style="font-weight:normal; font-size:10px; opacity:0.7;">${spanText}</span></span>
                    </div>`;
                });
                html += `</div>`;
            }
            html += `</div>`;

            // Horizontaler Zeitverlauf
            html += `<div style="background:var(--surface-color); border:1px solid var(--border-color); border-radius:var(--radius); padding:15px; box-shadow:var(--shadow); overflow-x:auto; flex:1; display:flex; flex-direction:column;">`;
            html += `<h4 style="margin-bottom:15px; font-size:13px; color:var(--text-muted);"><i class="fas fa-clock"></i> Tagesverlauf (${wdStartStr} - ${wdEndStr} Uhr)</h4>`;

            let levelOccupied = [[]];
            let timedEventsRenderData = [];

            timedEvents.forEach(ev => {
                let evStartMins = startMins;
                if(ev.startTime) evStartMins = Math.max(startMins, timeToMinutes(ev.startTime));
                
                let evEndMins = endMins;
                if(ev.endTime) evEndMins = Math.min(endMins, timeToMinutes(ev.endTime));
                else if(ev.startTime && ev.span === 'single') evEndMins = Math.min(endMins, evStartMins + 60); 
                
                if(isNaN(evStartMins) || isNaN(evEndMins) || evStartMins >= endMins || evEndMins <= startMins) return;

                const leftPct = ((evStartMins - startMins) / totalMins) * 100;
                const widthPct = ((evEndMins - evStartMins) / totalMins) * 100;

                let visualEndMins = Math.max(evEndMins, evStartMins + 60);

                let level = 0;
                let foundLevel = false;
                
                let loopSafety = 0;
                while(!foundLevel && loopSafety < 500) {
                    loopSafety++;
                    if(!levelOccupied[level]) levelOccupied[level] = [];
                    let overlap = levelOccupied[level].some(slot => !(visualEndMins <= slot.s || evStartMins >= slot.e));
                    if(!overlap) {
                        levelOccupied[level].push({s: evStartMins, e: visualEndMins});
                        foundLevel = true;
                    } else {
                        level++;
                    }
                }

                timedEventsRenderData.push({ ev, evStartMins, evEndMins, leftPct, widthPct, level });
            });

            const containerHeight = Math.max(350, (levelOccupied.length * 50) + 30);
            html += `<div id="sched-timeline-drop" data-date="${dStr}" data-start-mins="${startMins}" data-total-mins="${totalMins}" ondragover="handleSchedDragOver(event, this)" ondragleave="handleSchedDragLeave(this)" ondrop="handleSchedDropTimeline(event, this)" style="position:relative; width:100%; min-width:800px; height:${containerHeight}px; border-bottom:2px solid var(--border-color); margin-bottom:10px;">`;
            
            // --- Past Time Background & Current Time Line ---
            let grayWidth = 0; let showRedLine = false; let redLinePct = 0;
            const nowObj = new Date();
            const calDateObj = new Date(scheduleCurrentDate); calDateObj.setHours(0,0,0,0);
            const todayDateZero = new Date(nowObj); todayDateZero.setHours(0,0,0,0);

            if (calDateObj < todayDateZero) {
                grayWidth = 100;
            } else if (calDateObj.getTime() === todayDateZero.getTime()) {
                const nowMins = nowObj.getHours() * 60 + nowObj.getMinutes();
                if (nowMins > startMins) {
                    const clampedMins = Math.min(nowMins, endMins);
                    grayWidth = ((clampedMins - startMins) / totalMins) * 100;
                }
                if (nowMins >= startMins && nowMins <= endMins) {
                    showRedLine = true;
                    redLinePct = ((nowMins - startMins) / totalMins) * 100;
                }
            }

            if (grayWidth > 0) {
                html += `<div style="position:absolute; left:0; top:0; bottom:0; width:${grayWidth}%; background:var(--text-main); opacity:0.05; z-index:0; pointer-events:none;"></div>`;
            }
            if (showRedLine) {
                html += `<div style="position:absolute; left:${redLinePct}%; top:0; bottom:0; width:2px; background:var(--danger); z-index:15; transform:translateX(-50%); pointer-events:none; opacity:0.5;"></div>`;
                html += `<div style="position:absolute; left:${redLinePct}%; top:0; width:6px; height:6px; border-radius:50%; background:var(--danger); z-index:15; transform:translate(-50%, -50%); pointer-events:none;"></div>`;
            }
            // ------------------------------------------------

            // Grid Lines
            for(let m = startMins; m <= endMins; m += 60) {
                const pct = ((m - startMins) / totalMins) * 100;
                html += `<div style="position:absolute; left:${pct}%; top:0; bottom:-10px; width:1px; background:var(--border-color); z-index:1;"></div>`;
                html += `<div style="position:absolute; left:${pct}%; bottom:-25px; transform:translateX(-50%); font-size:10px; color:var(--text-muted); font-weight:bold;">${formatTimeFromMinutes(m)}</div>`;
            }

                        // Place Timed Events
            timedEventsRenderData.forEach(item => {
                const ev = item.ev;
                let color='var(--text-main)'; let bg='rgba(0,0,0,0.05)'; let icon=''; let title=''; let click=''; let isComp = false; let isPaused = false;
                
                if(ev.type === 'stack') { color='var(--primary-color)'; bg='var(--primary-light)'; icon='<i class="fas fa-folder"></i>'; title=ev.data.name; click=`openStackModal('${ev.data.id}')`; isComp = (ev.data.status === 'completed'); isPaused = ev.data.status === 'paused'; } 
                else if(ev.type === 'milestone') { color='var(--primary-color)'; bg='var(--primary-lightest)'; icon='<i class="fas fa-flag"></i>'; title=ev.data.title; click=`openStackModal('${ev.parent.id}')`; isComp = (ev.data.done || ev.parent.status === 'completed'); isPaused = ev.parent.status === 'paused' && !isComp; } 
                else if(ev.type === 'task') { color='var(--primary-color)'; bg='var(--primary-light)'; icon='<i class="fas fa-tasks"></i>'; title=ev.data.projectName; click=`openModal('${ev.data.id}')`; isComp = isTaskDone(ev.data); isPaused = ev.data.isPaused && !isComp; }
                else if(ev.type === 'task-checklist') { color='var(--primary-color)'; bg='var(--primary-lightest)'; icon='<i class="fas fa-check-square"></i>'; title=ev.data.title; click=`openTaskToCheckpoint('${ev.parent.id}','${ev.data.id}')`; isComp = (ev.data.done || isTaskDone(ev.parent)); isPaused = ev.parent.isPaused && !isComp; } else if(ev.type === 'absence') { const _ac = ABSENCE_TYPES[ev.data.type] || {}; color = ttAbsColor(ev.data.type); bg = 'color-mix(in srgb, ' + color + ' 16%, transparent)'; icon = '<i class="fas ' + (ttAbsIcon(ev.data.type)) + '"></i>'; title = ttAbsLabel(ev.data.type) + (ev.data.note ? ' – ' + ev.data.note : ''); click = "switchView('time')"; }

                let topPos = item.level * 50 + 10;
                let timeLabel = `${formatTimeFromMinutes(item.evStartMins)} - ${formatTimeFromMinutes(item.evEndMins)}`;
                let pausedIcon = isPaused ? '<i class="fas fa-pause" style="color:var(--warning); margin-right:4px;"></i>' : '';

                html += `<div class="cal-event ${isComp?'is-completed':''}" style="position:absolute; left:${item.leftPct}%; width:${item.widthPct}%; min-width:140px; height:42px; top:${topPos}px; background:${bg}; color:${color}; border:1px solid ${color}; padding:6px 10px; z-index:10; box-shadow:0 2px 4px rgba(0,0,0,0.1); display:flex; flex-direction:column; justify-content:center; cursor:pointer;" onclick="${click}" title="${timeLabel} | ${title}">
                    <div style="font-size:10px; opacity:0.8; margin-bottom:2px; line-height:1; font-weight:normal;">${timeLabel}</div>
                    <div style="font-weight:bold; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1;">${icon} ${pausedIcon}${title}</div>
                </div>`;
            });

            html += `</div></div></div>`; // End Timeline Container + End Flex wrapper
        }
        else if (isMonth || isWeek) {
            const eventsMap = {};
            events.forEach(ev => { 
                const tzDate = new Date(ev.date.getTime() - (ev.date.getTimezoneOffset() * 60000));
                const dStr = tzDate.toISOString().split('T')[0]; 
                if(!eventsMap[dStr]) eventsMap[dStr] = []; eventsMap[dStr].push(ev); 
            });

            let gridCols = workDays.length; if(gridCols === 0) gridCols = 7;
            html += `<div style="overflow-x:auto;"><div class="calendar-grid" style="min-width:700px; gap:0; border-left:1px solid var(--border-color); border-top:1px solid var(--border-color); grid-template-columns: repeat(${gridCols}, 1fr);">`;
            
            const dayNames = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
            let sortedWorkDays = [...workDays].sort((a,b) => { if(a===0) return 1; if(b===0) return -1; return a-b; });
            const _todayDow = new Date().getDay();
            sortedWorkDays.forEach(d => { const _isTodayCol = (d === _todayDow); html += `<div class="cal-day-header" style="border-right:1px solid var(--border-color); border-bottom:1px solid var(--border-color); border-radius:0; border-left:none; border-top:none; ${_isTodayCol ? 'color:var(--text-main); font-weight:800; background:#FFF6DA; background:color-mix(in srgb, var(--wk-magnet, #FFC93C) 24%, var(--surface-color)); box-shadow: inset 0 -3px 0 var(--wk-magnet, #FFC93C);' : ''}">${dayNames[d]}</div>`; });
            
            const todayStr = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];

            const renderDay = (dateStr, dayNum, minHeight) => {
                const dayEvents = eventsMap[dateStr] || []; let evHtml = '';
                dayEvents.sort((a,b) => { const typeW = {'stack':1, 'task':2, 'milestone':3, 'task-checklist':4}; if(typeW[a.type] !== typeW[b.type]) return typeW[a.type] - typeW[b.type]; return 0; });
                
                dayEvents.forEach(ev => {
                    let color='var(--text-main)'; let bg='rgba(0,0,0,0.05)'; let icon=''; let title=''; let click=''; let isComp = false; let isPaused = false;
                    
                    if(ev.type === 'stack') { color='var(--primary-color)'; bg='var(--primary-light)'; icon='<i class="fas fa-folder"></i>'; title=ev.data.name; click=`openStackModal('${ev.data.id}')`; isComp = (ev.data.status === 'completed'); isPaused = ev.data.status === 'paused'; } 
                    else if(ev.type === 'milestone') { color='var(--primary-color)'; bg='var(--primary-lightest)'; icon='<i class="fas fa-flag"></i>'; title=ev.data.title; click=`openStackModal('${ev.parent.id}')`; isComp = (ev.data.done || ev.parent.status === 'completed'); isPaused = ev.parent.status === 'paused' && !isComp; } 
                    else if(ev.type === 'task') { color='var(--primary-color)'; bg='var(--primary-light)'; icon='<i class="fas fa-tasks"></i>'; title=ev.data.projectName; click=`openModal('${ev.data.id}')`; isComp = isTaskDone(ev.data); isPaused = ev.data.isPaused && !isComp; }
                    else if(ev.type === 'task-checklist') { color='var(--primary-color)'; bg='var(--primary-lightest)'; icon='<i class="fas fa-check-square"></i>'; title=ev.data.title; click=`openTaskToCheckpoint('${ev.parent.id}','${ev.data.id}')`; isComp = (ev.data.done || isTaskDone(ev.parent)); isPaused = ev.parent.isPaused && !isComp; } else if(ev.type === 'absence') { const _ac = ABSENCE_TYPES[ev.data.type] || {}; color = ttAbsColor(ev.data.type); bg = 'color-mix(in srgb, ' + color + ' 16%, transparent)'; icon = '<i class="fas ' + (ttAbsIcon(ev.data.type)) + '"></i>'; title = ttAbsLabel(ev.data.type) + (ev.data.note ? ' – ' + ev.data.note : ''); click = "switchView('time')"; }
                    
                    let actualStart = ev.data.startDate; let actualDue = ev.data.dueDate;
                    if(ev.type === 'milestone' || ev.type === 'task-checklist') { actualStart = null; actualDue = ev.data.dueDate ? ev.data.dueDate.split('T')[0] : null; }
                    let isstartToday = actualStart === dateStr; let isDueToday = actualDue === dateStr;
                    let startBadge = isstartToday ? `<span style="background:var(--success); color:white; padding:2px 4px; border-radius:3px; font-size:9px; margin-right:4px; font-weight:bold; box-shadow:0 1px 2px rgba(0,0,0,0.2);">START</span>` : '';
                    let dueBadge = isDueToday ? `<span style="background:var(--danger); color:white; padding:2px 4px; border-radius:3px; font-size:9px; margin-left:4px; font-weight:bold; box-shadow:0 1px 2px rgba(0,0,0,0.2);"><i class="fas fa-exclamation-circle"></i> FÄLLIG</span>` : '';

                    let displayTitle = title;
                    if (ev.span === 'start' && !isstartToday) displayTitle = title + ' &rarr;';
                    else if (ev.span === 'end' && !isDueToday) displayTitle = '&rarr; ' + title;
                    else if (ev.span === 'middle') displayTitle = '&rarr; ' + title + ' &rarr;';
                    
                    let pausedIcon = isPaused ? '<i class="fas fa-pause" style="color:var(--warning); margin-right:2px;"></i>' : '';
                    let timeIcon = ev.isTimed ? `<i class="far fa-clock" style="font-size:9px; margin-right:4px; opacity:0.7;"></i>` : '';
                    
                    displayTitle = timeIcon + pausedIcon + displayTitle;
                    
                    let spanClass = ev.span === 'single' ? '' : `span-${ev.span}`;
                    let borderStyle = '';
                    if(isstartToday) borderStyle += `border-left: 3px solid var(--success); `;
                    if(isDueToday) borderStyle += `border-right: 3px solid var(--danger); `;

                    let clHtml = '';
                    if (isWeek && (ev.type === 'stack' || ev.type === 'task') && ev.data.checklist) {
                        let openCl = ev.data.checklist;
                        if(hideDone) openCl = openCl.filter(c => !c.done);
                        if (activeFilters.users.length > 0) openCl = openCl.filter(c => activeFilters.users.includes(c.assigneeId || ''));
                        if(openCl.length > 0) {
                            clHtml = `<div style="display:flex; flex-direction:column; gap:3px; margin-top:4px; padding-left:22px; opacity:0.85;">`;
                            openCl.forEach(cl => { let lineThrough = cl.done ? 'text-decoration:line-through; opacity:0.6;' : ''; clHtml += `<div style="font-size:9.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:normal; display:flex; align-items:center; gap:4px; ${lineThrough}"><i class="${cl.done ? 'fas fa-check-square' : 'far fa-square'}"></i> ${cl.title}</div>`; });
                            clHtml += `</div>`;
                        }
                    }

                    evHtml += `<div class="cal-event ${spanClass} ${isComp?'is-completed':''}" style="background:${bg}; color:${color}; ${borderStyle} margin-bottom:4px; padding: 6px;" onclick="${click}" title="${title}"><div class="cal-event-title">${startBadge}<span style="margin-right:2px;">${icon}</span><span style="flex:1; overflow:hidden; text-overflow:ellipsis;">${displayTitle}</span>${dueBadge}</div>${clHtml}</div>`;
                });
                
                let kwBadge = ''; const iterD = new Date(dateStr);
                if(iterD.getDay() === 1 || iterD.getDate() === 1) { kwBadge = `<span style="font-size:9px; color:var(--primary-color); background:var(--primary-lightest); padding:2px 4px; border-radius:4px; margin-right:auto;">KW ${getISOWeek(iterD)}</span>`; }

                const _isToday = (dateStr === todayStr);
                /* Heutiger Tag: Hervorhebung muss inline gesetzt werden, da die
                   inline-Rahmen sonst die Regel .cal-day.today ueberschreiben. */
                const _todayCell = _isToday
                    ? 'border:2px solid var(--wk-magnet, #FFC93C) !important; background:#FFF6DA; background:color-mix(in srgb, var(--wk-magnet, #FFC93C) 20%, var(--surface-color)) !important;'
                    : 'border-right:1px solid var(--border-color); border-bottom:1px solid var(--border-color); border-left:none; border-top:none;';
                const _todayNum = _isToday
                    ? 'background:var(--wk-magnet, #FFC93C); color:#22262B; border-radius:999px; min-width:20px; height:20px; display:inline-flex; align-items:center; justify-content:center; padding:0 6px; font-weight:800;'
                    : '';
                return `<div class="cal-day ${_isToday?'today':''}" ondragover="handleSchedDragOver(event, this)" ondragleave="handleSchedDragLeave(this)" ondrop="handleSchedDropDate(event, this, '${dateStr}')" style="min-height:${minHeight}; ${_todayCell} border-radius:0; padding:4px 2px;"><div style="display:flex; justify-content:flex-end; align-items:center; font-size:12px; font-weight:bold; color:${_isToday?'var(--text-main)':'var(--text-muted)'}; margin-bottom: 4px; padding-right:4px;">${kwBadge}<span style="${_todayNum}">${dayNum}</span></div>${evHtml}</div>`;
            };

            if (isMonth) {
                const year = scheduleCurrentDate.getFullYear();
                
                let firstDayOfMonth = new Date(year, scheduleCurrentDate.getMonth(), 1);
                let daysInMonth = new Date(year, scheduleCurrentDate.getMonth() + 1, 0).getDate();
                
                let firstWorkDayIndex = sortedWorkDays.indexOf(firstDayOfMonth.getDay());
                if(firstWorkDayIndex === -1) {
                    for(let j=1; j<=7; j++) {
                        let checkD = new Date(year, scheduleCurrentDate.getMonth(), 1+j);
                        let dIdx = sortedWorkDays.indexOf(checkD.getDay());
                        if(dIdx > -1) { firstWorkDayIndex = dIdx; break; }
                    }
                }
                
                for(let i=0; i<firstWorkDayIndex; i++) {
                    html += `<div class="cal-day empty" style="border-right:1px solid var(--border-color); border-bottom:1px solid var(--border-color); border-radius:0; border-left:none; border-top:none;"></div>`;
                }

                for(let i=1; i<=daysInMonth; i++) {
                    let currD = new Date(year, scheduleCurrentDate.getMonth(), i);
                    if(workDays.includes(currD.getDay())) {
                        const dateStr = `${year}-${String(scheduleCurrentDate.getMonth()+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`; 
                        html += renderDay(dateStr, i, '70px');
                    }
                }
            } else if (isWeek) {
                let daysRendered = 0;
                for(let i=0; i<7; i++) {
                    const d = new Date(wStart); d.setDate(d.getDate() + i); 
                    if(workDays.includes(d.getDay())) {
                        const tzDate = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)); const dateStr = tzDate.toISOString().split('T')[0];
                        html += renderDay(dateStr, d.getDate(), 'max(400px, calc(100vh - 260px))');
                        daysRendered++;
                    }
                }
            }
            html += '</div></div>';
        } else if (isYear) {
            html += `<div class="year-grid">`; const y = scheduleCurrentDate.getFullYear();
            for(let m = 0; m < 12; m++) {
                let monthName = new Date(y, m, 1).toLocaleString('de-DE', {month: 'long'});
                let mEvents = events.filter(e => e.date.getFullYear() === y && e.date.getMonth() === m);
                const isCurrentMonth = (new Date().getFullYear() === y && new Date().getMonth() === m);
                const monthFirstDayStr = `${y}-${String(m+1).padStart(2,'0')}-01`;

                /* Einträge des Monats als echte Titel auflisten (dedupliziert, nach Datum sortiert) */
                const seen = new Set();
                const entries = [];
                mEvents.slice().sort((a, b) => a.date - b.date).forEach(ev => {
                    let key = '', title = '', icon = '', col = 'var(--primary-color)', click = '', comp = false;
                    if (ev.type === 'task') {
                        key = 'T' + ev.data.id; title = ev.data.projectName; icon = 'fa-tasks';
                        click = `event.stopPropagation(); openModal('${ev.data.id}')`; comp = isTaskDone(ev.data);
                    } else if (ev.type === 'stack') {
                        key = 'S' + ev.data.id; title = ev.data.name; icon = 'fa-folder';
                        click = `event.stopPropagation(); openStackModal('${ev.data.id}')`; comp = ev.data.status === 'completed';
                    } else if (ev.type === 'milestone') {
                        key = 'M' + ev.parent.id + ev.data.id; title = ev.data.title; icon = 'fa-flag';
                        click = `event.stopPropagation(); openStackModal('${ev.parent.id}')`; comp = !!ev.data.done;
                    } else if (ev.type === 'task-checklist') {
                        key = 'C' + ev.parent.id + ev.data.id; title = ev.data.title; icon = 'fa-check-square';
                        click = `event.stopPropagation(); openTaskToCheckpoint('${ev.parent.id}','${ev.data.id}')`; comp = !!ev.data.done;
                    } else if (ev.type === 'absence') {
                        key = 'A' + ev.data.id; title = ttAbsLabel(ev.data.type) + (ev.data.note ? ' – ' + ev.data.note : '');
                        icon = ttAbsIcon(ev.data.type); col = ttAbsColor(ev.data.type);
                        click = `event.stopPropagation(); switchView('time')`;
                    } else return;
                    if (!key || seen.has(key)) return;
                    seen.add(key);
                    entries.push({ title: title || '-', icon, col, click, comp, day: ev.date.getDate() });
                });

                const MAX = 6;
                const shown = entries.slice(0, MAX);
                const restCount = entries.length - shown.length;

                html += `<div class="month-card ${isCurrentMonth?'current':''}" onclick="scheduleCurrentDate.setMonth(${m}); scheduleMode='month'; safeRenderSchedule()" ondragover="handleSchedDragOver(event, this)" ondragleave="handleSchedDragLeave(this)" ondrop="handleSchedDropDate(event, this, '${monthFirstDayStr}')">
                    <div class="month-card-title">${monthName}</div>
                    <div class="month-card-list">
                        ${shown.map(en => `<div class="mc-item ${en.comp ? 'is-done' : ''}" title="${escapeHtmlToday(en.title)}" onclick="${en.click}">
                            <span class="mc-day">${en.day}.</span>
                            <i class="fas ${en.icon}" style="color:${en.col};"></i>
                            <span class="mc-title">${escapeHtmlToday(en.title)}</span>
                        </div>`).join('')}
                        ${restCount > 0 ? `<div class="mc-more">+${restCount} ${t('year_more')}</div>` : ''}
                        ${entries.length === 0 ? `<span style="opacity:0.5; font-size:12px; display:block; text-align:center; margin-top:10px;">Keine Einträge</span>` : ''}
                    </div>
                </div>`;
            }
            html += `</div>`;
        }
    } else {
        // --- NEUE ANGEREICHERTE LISTENANSICHT ---
        html += `</div>`; // Close upper flex container
        
        let listEvents = events.filter(e => e.span === 'single' || e.span === 'end'); 
        listEvents.sort((a,b) => a.date - b.date);

        // Gruppieren
        const todayZero = new Date(); todayZero.setHours(0,0,0,0);
        const tomorrowZero = new Date(todayZero); tomorrowZero.setDate(tomorrowZero.getDate() + 1);
        
        const endOfWeek = new Date(todayZero); 
        const daysToSunday = todayZero.getDay() === 0 ? 0 : 7 - todayZero.getDay();
        endOfWeek.setDate(todayZero.getDate() + daysToSunday);
        endOfWeek.setHours(23,59,59,999);

        let groups = {
            overdue: [],
            today: [],
            tomorrow: [],
            thisWeek: [],
            later: []
        };

        listEvents.forEach(ev => {
            if(!ev.origDateStr) { groups.later.push(ev); return; }
            const d = new Date(ev.origDateStr); 
            d.setHours(0,0,0,0);
            
            if (d < todayZero) groups.overdue.push(ev);
            else if (d.getTime() === todayZero.getTime()) groups.today.push(ev);
            else if (d.getTime() === tomorrowZero.getTime()) groups.tomorrow.push(ev);
            else if (d <= endOfWeek) groups.thisWeek.push(ev);
            else groups.later.push(ev);
        });

        html += `<div style="max-width: 900px; margin: 0 auto; overflow-x: hidden;">`;

        const renderEnrichedCard = (ev) => {
            /* Abwesenheiten (Urlaub, Krank, Feiertag, Kompensation) gesondert darstellen */
            if (ev.type === 'absence') {
                const a = ev.data;
                const absDate = a.date ? ttFmtDate(a.date) : '';
                return `<div class="agenda-card absence" style="--abs:${ttAbsColor(a.type)}" onclick="switchView('time')">
                    <div class="agenda-ic" style="background:${ttAbsColor(a.type)}"><i class="fas ${ttAbsIcon(a.type)}"></i></div>
                    <div class="agenda-body"><b>${ttAbsLabel(a.type)}</b><span class="agenda-sub">${absDate}${a.note ? ' · ' + escapeHtmlToday(a.note) : ''}</span></div>
                    <div class="agenda-hours">${ttNum(a.hours)} h</div>
                </div>`;
            }
            const isTaskType = ev.type === 'task' || ev.type === 'task-checklist';
            const actualTask = isTaskType ? (ev.type === 'task' ? ev.data : ev.parent) : null;
            const actualStack = !isTaskType ? (ev.type === 'stack' ? ev.data : ev.parent) : null;
            if (!actualTask && !actualStack) return '';   /* Absturzschutz */
            
            let isComp = isTaskType ? isTaskDone(actualTask) : (actualStack ? actualStack.status === 'completed' : false);
            /* Checkpunkt einer abgeschlossenen Aufgabe: gilt nur als erledigt, wenn der Checkpunkt selbst erledigt ist */
            if (ev.type === 'task-checklist') isComp = !!ev.data.done;
            if (hideDone && isComp) return '';

            const isPaused = isTaskType ? actualTask.isPaused : actualStack.status === 'paused';
            
            const title = ev.type === 'task' ? ev.data.projectName : (ev.type === 'stack' ? ev.data.name : ev.data.title);
            const icon = ev.type === 'stack' ? 'fa-folder' : (ev.type === 'task' ? 'fa-tasks' : (ev.type === 'milestone' ? 'fa-flag' : 'fa-check-square'));
            
            let stakeholderId = actualTask ? actualTask.stakeholderId : (actualStack ? actualStack.stakeholderId : null);
            let sh = appData.stakeholders.find(s => s.id === stakeholderId);
            let bucket = actualTask ? actualTask.bucket : (actualStack ? actualStack.bucket : null);
            let prio = actualTask ? actualTask.priority : null;
            let assigneeId = ev.data.assigneeId || (isTaskType ? actualTask.assigneeId : actualStack.assigneeId);
            
            let contextStr = '';
            if(isTaskType && actualTask && actualTask.projectStackId) {
                const s = appData.projectStacks.find(x => x.id === actualTask.projectStackId);
                if(s) contextStr += `<span style="color:var(--text-muted);"><i class="fas fa-folder"></i> Stack: ${s.name}</span>`;
            } else if (!isTaskType && actualStack && ev.type === 'milestone') {
                contextStr += `<span style="color:var(--text-muted);"><i class="fas fa-folder"></i> Stack: ${actualStack.name}</span>`;
            } else if (isTaskType && actualTask && ev.type === 'task-checklist') {
                contextStr += `<span style="color:var(--text-muted);"><i class="fas fa-tasks"></i> Aufgabe: ${actualTask.projectName}</span>`;
            }

            if(sh) contextStr += (contextStr ? ' <span style="color:var(--border-color); margin:0 5px;">|</span> ' : '') + `<span style="color:${sh.color};"><i class="fas fa-user"></i> ${sh.name}</span>`;
            if(bucket) contextStr += (contextStr ? ' <span style="color:var(--border-color); margin:0 5px;">|</span> ' : '') + `<span style="color:var(--text-muted);">${bucket}</span>`;

            let prioHtml = '';
            if(prio) {
                const pLabels = { low: t('prio_low'), medium: t('prio_med'), high: t('prio_high') };
                prioHtml = `<span class="badge ${prio}" style="margin-left:10px;">Prio: ${pLabels[prio]}</span>`;
            }

            let nextStepHtml = '';
            let clToSearch = actualTask ? actualTask.checklist : (actualStack ? actualStack.checklist : []);
            if(clToSearch && clToSearch.length > 0) {
                const openStep = clToSearch.find(c => !c.done);
                if(openStep) {
                    nextStepHtml = `<div style="font-size:12px; color:var(--text-muted); margin-top:8px; display:flex; align-items:center; gap:5px;"><i class="fas fa-arrow-right" style="color:var(--primary-color);"></i> <b>Nächster Schritt:</b> ${openStep.title}</div>`;
                }
            }

            let progressHtml = '';
            if(isTaskType && actualTask) {
                const prog = getTaskProgress(actualTask);
                const est = parseFloat(actualTask.estimatedTime||0); const spent = parseFloat(actualTask.spentTime||0);
                let timeStr = '';
                if(est > 0 || spent > 0) timeStr = `<span style="font-size:11px; color:var(--text-muted);"><i class="fas fa-hourglass-half"></i> ${spent}h / ${est}h</span>`;
                
                progressHtml = `<div style="display:flex; align-items:center; gap:10px; margin-top:10px;">
                    <div style="flex:1; max-width:200px;">${generateProgressBarHTML(prog, true)}</div>
                    ${timeStr}
                </div>`;
            }

            const d = ev.date;
            const dNum = d.getDate();
            const dMon = d.toLocaleString('de-DE', {month:'short'});
            const dWd = d.toLocaleString('de-DE', {weekday:'short'});
            
            let isLate = new Date() > d && !isComp;
            let dateColor = isLate ? 'var(--danger)' : 'var(--primary-color)';
            let borderColor = sh ? sh.color : 'var(--border-color)';

            const clickFn = isTaskType ? `openModal('${actualTask.id}')` : `openStackModal('${actualStack.id}')`;
            let pausedIcon = isPaused ? '<i class="fas fa-pause" style="color:var(--warning); margin-right:4px;"></i>' : '';
            let lockedIcon = isEntityLocked(ev.data.id) ? '<i class="fas fa-lock" style="color:var(--text-muted); font-size:12px; margin-right:6px;" title="Gesperrt"></i>' : '';

            const targetId = ev.type === 'milestone' || ev.type === 'task-checklist' ? ev.data.id : (actualTask ? actualTask.id : actualStack.id);
            const parentId = actualTask ? actualTask.id : (actualStack ? actualStack.id : null);
            
            let actionHtml = `<div style="display:flex; flex-direction:column; gap:5px; align-items:flex-end;">
                ${getAvatarHtml(assigneeId, 'avatar-md')}
                <div style="display:flex; gap:5px; margin-top:10px;">
                    <button class="secondary icon-btn" style="color:var(--success); border-color:var(--success); background:rgba(16,185,129,0.05);" onclick="event.stopPropagation(); quickCompleteEvent('${ev.type}', '${targetId}', '${parentId}')" title="Erledigt"><i class="fas fa-check"></i></button>
                    ${isTaskType ? `<button class="secondary icon-btn" style="color:var(--primary-color); border-color:var(--primary-color); background:var(--primary-lightest);" onclick="event.stopPropagation(); quickTrackTime('${actualTask.id}')" title="Zeit buchen"><i class="fas fa-stopwatch"></i></button>` : ''}
                    <button class="secondary icon-btn" style="color:var(--text-muted);" onclick="event.stopPropagation(); quickDeferEvent('${ev.type}', '${targetId}', '${parentId}', '${ev.origDateStr}')" title="Auf Morgen verschieben"><i class="fas fa-calendar-plus"></i></button>
                </div>
            </div>`;

            return `<div class="${isComp ? 'is-completed' : ''}" style="display:flex; background:var(--surface-color); margin-bottom:10px; border-radius:var(--radius); border:1px solid var(--border-color); border-left:4px solid ${borderColor}; cursor:pointer; transition:0.2s; box-shadow:var(--shadow); overflow:hidden; max-width:100%;" onclick="${clickFn}" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                
                <div style="width: 60px; min-width: 60px; display:flex; flex-direction:column; justify-content:center; align-items:center; background:rgba(0,0,0,0.02); border-right:1px solid var(--border-color); padding:8px;">
                    <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">${dWd}</div>
                    <div style="font-size:22px; font-weight:bold; color:${dateColor}; line-height:1.1;">${dNum}</div>
                    <div style="font-size:12px; color:${dateColor};">${dMon}</div>
                </div>

                <div style="flex:1; padding:10px 12px; overflow:hidden; min-width:0;">
                    ${contextStr ? `<div style="font-size:11px; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${contextStr}</div>` : ''}
                    <h4 style="font-size:14px; margin:0; display:flex; align-items:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${lockedIcon} <i class="fas ${icon}" style="color:var(--text-muted); margin-right:8px; flex-shrink:0;"></i> ${pausedIcon}${title} ${prioHtml}
                    </h4>
                    ${nextStepHtml}
                    ${progressHtml}
                </div>

                <div style="padding:10px 12px; border-left:1px dashed var(--border-color); display:flex; align-items:center; flex-shrink:0;">
                    ${actionHtml}
                </div>

            </div>`;
        };

        const renderSection = (title, icon, color, arr) => {
            if(arr.length === 0) return '';
            let sHtml = `<h3 style="margin-top:25px; margin-bottom:15px; font-size:15px; color:${color}; border-bottom:2px solid ${color}; padding-bottom:5px; display:flex; align-items:center; gap:8px;"><i class="fas ${icon}"></i> ${title} <span class="badge" style="background:var(--bg-color); color:var(--text-main); margin-left:auto;">${arr.length}</span></h3>`;
            arr.forEach(ev => sHtml += renderEnrichedCard(ev));
            return sHtml;
        };

        html += renderSection('Überfällig', 'fa-exclamation-circle', 'var(--danger)', groups.overdue);
        html += renderSection('Heute', 'fa-calendar-day', 'var(--primary-color)', groups.today);
        html += renderSection('Morgen', 'fa-sun', 'var(--warning)', groups.tomorrow);
        html += renderSection('Diese Woche', 'fa-calendar-week', 'var(--text-main)', groups.thisWeek);
        html += renderSection('Später', 'fa-calendar', 'var(--text-muted)', groups.later);

        if(listEvents.length === 0) {
            html += `<div style="text-align:center; padding: 60px 20px; color:var(--text-muted); background:var(--surface-color); border-radius:var(--radius); border:1px dashed var(--border-color); margin-top:20px;">
                <i class="fas fa-mug-hot" style="font-size:48px; color:var(--border-color); margin-bottom:20px; display:block;"></i>
                <h3 style="margin-bottom:10px; color:var(--text-main);">Alles erledigt!</h3>
                <p style="font-size:13px; max-width:400px; margin:0 auto 20px auto;">Du hast momentan keine offenen Termine oder Deadlines in diesem Zeitraum. Zeit für einen Kaffee, oder?</p>
                <button onclick="openModal()"><i class="fas fa-plus"></i> Neue Aufgabe planen</button>
            </div>`;
        }
        html += `</div>`;
    }

    // Ungeplante Items (Ohne Datum) - Prominenter darstellen wenn Liste aktiv
    if(unscheduledItems.length > 0) {
        let unschHtml = `<div style="margin-top: 40px; max-width:900px; margin-left:auto; margin-right:auto; text-align:left;">
            <h3 style="border-bottom:2px solid var(--border-color); padding-bottom:5px; margin-bottom:15px; font-size:16px;">
                <i class="fas fa-inbox" style="color:var(--text-muted); "></i> Backlog / Ungeplant
                <span style="font-size:11px; font-weight:normal; color:var(--text-muted); margin-left:10px;">(Tipp: Klicke auf ein Element, um ein Datum festzulegen, oder ziehe es direkt in die Planung)</span>
            </h3><div style="display:flex; flex-wrap:wrap; gap:10px; justify-content: start;">`;
        
        unscheduledItems.forEach(item => {
            let icon = item.type === 'stack' ? 'fa-folder' : 'fa-tasks'; let title = item.type === 'stack' ? item.data.name : item.data.projectName;
            let fn = item.type === 'stack' ? `openStackModal('${item.data.id}')` : `openModal('${item.data.id}')`;
            let isComp = item.type === 'stack' ? item.data.status === 'completed' : isTaskDone(item.data); let isPaused = item.type === 'stack' ? item.data.status === 'paused' : (item.data.isPaused && !isComp);
            let pausedIcon = isPaused ? '<i class="fas fa-pause" style="color:var(--warning); margin-right:4px;"></i>' : ''; let opacity = isComp ? 'opacity:0.6;' : '';

            unschHtml += `<div class="cal-event" draggable="true" ondragstart="handleSchedDragStart(event, '${item.type}', '${item.data.id}')" style="background:var(--surface-color); border:1px solid var(--border-color); padding:8px 15px; border-radius:20px; cursor:grab; display:inline-flex; align-items:center; flex-direction:row; box-shadow:var(--shadow); transition:0.2s; ${opacity}" onclick="${fn}" onmouseover="this.style.borderColor='var(--primary-color)'" onmouseout="this.style.borderColor='var(--border-color)'"><i class="fas ${icon}" style="color:var(--primary-color); margin-right:8px;"></i><span style="font-weight:bold; white-space:nowrap;">${pausedIcon}${title}</span></div>`;
        });
        unschHtml += `</div></div>`; html += unschHtml;
    }

    c.innerHTML = html;
}

// TIMELINE MARKER & DRAG LOGIC
let tlDragState = null; 
let tlMinDateMs = 0;

function zoomTimeline(dir) {
    if(dir > 0) appData.settings.tlPixelsPerDay = Math.min(150, appData.settings.tlPixelsPerDay + 10);
    else appData.settings.tlPixelsPerDay = Math.max(10, appData.settings.tlPixelsPerDay - 10);
    saveToLocal(true);
    safeRenderTimeline();
}

function scrollToTodayTimeline() {
    const container = document.querySelector('.timeline-track-container');
    if(!container) return;
    const today = new Date(); today.setHours(0,0,0,0);
    const todayXPos = ((today.getTime() - tlMinDateMs) / 86400000) * appData.settings.tlPixelsPerDay;
    const targetScroll = todayXPos + 220 - (container.clientWidth / 2);
    container.scrollTo({ left: Math.max(0, targetScroll), behavior: 'smooth' });
}

function startTimelineDrag(e, type, id, action, idx) {
    e.stopPropagation();
    let clientX = e.clientX; if (e.touches && e.touches.length > 0) { clientX = e.touches[0].clientX; }
    
    let entity;
    if(type === 'task') entity = appData.tasks.find(t => t.id === id);
    else if(type === 'stack') entity = appData.projectStacks.find(s => s.id === id);
    else if(type === 'milestone' || type === 'task-checklist') {
        const parent = (type === 'milestone') ? appData.projectStacks.find(s => s.id === id) : appData.tasks.find(t => t.id === id);
        if(parent && parent.checklist && parent.checklist[idx]) entity = parent.checklist[idx];
    }
    if(!entity) return;

    tlDragState = {
        type, id, action, entity, idx,
        startX: clientX,
        origStart: (type === 'milestone' || type === 'task-checklist') ? (entity.dueDate ? new Date(entity.dueDate.split('T')[0]).getTime() : null) : (entity.startDate ? new Date(entity.startDate).getTime() : null),
        origEnd: (type === 'milestone' || type === 'task-checklist') ? (entity.dueDate ? new Date(entity.dueDate.split('T')[0]).getTime() : null) : (entity.dueDate ? new Date(entity.dueDate).getTime() : null)
    };

    if(!tlDragState.origStart && tlDragState.origEnd) tlDragState.origStart = tlDragState.origEnd;
    if(!tlDragState.origEnd && tlDragState.origStart) tlDragState.origEnd = tlDragState.origStart;
    
    /* Balken-Element für die Live-Vorschau merken */
    const handleEl = e.target.closest('.gantt-bar');
    tlDragState.barEl = handleEl || null;
    if (tlDragState.barEl) {
        tlDragState.barLeft0 = parseFloat(tlDragState.barEl.style.left) || 0;
        tlDragState.barWidth0 = parseFloat(tlDragState.barEl.style.width) || tlDragState.barEl.offsetWidth;
        tlDragState.barEl.classList.add('gantt-bar-dragging');
    }

    document.addEventListener('mousemove', handleTimelineMouseMove);
    document.addEventListener('mouseup', handleTimelineMouseUp);
    document.addEventListener('touchmove', handleTimelineMouseMove, {passive: false});
    document.addEventListener('touchend', handleTimelineMouseUp);
}

function handleTimelineMouseMove(e) {
    if(!tlDragState) return;
    let clientX = e.clientX;
    if (e.touches && e.touches.length > 0) { clientX = e.touches[0].clientX; e.preventDefault(); }
    
    const dx = clientX - tlDragState.startX;
    const daysDiff = Math.round(dx / appData.settings.tlPixelsPerDay);
    const msDiff = daysDiff * 86400000;

    let newStart = tlDragState.origStart; let newEnd = tlDragState.origEnd;

    if(tlDragState.action === 'move') {
        if(newStart) newStart += msDiff;
        if(newEnd) newEnd += msDiff;
    } else if(tlDragState.action === 'start') {
        if(newStart) newStart += msDiff;
        if(newStart > newEnd) newStart = newEnd;
    } else if(tlDragState.action === 'end') {
        if(newEnd) newEnd += msDiff;
        if(newEnd < newStart) newEnd = newStart;
    }
    
    tlDragState.currentStart = newStart; tlDragState.currentEnd = newEnd;

    /* Live-Vorschau: Balken direkt mitbewegen */
    if (tlDragState.barEl) {
        const ppd = appData.settings.tlPixelsPerDay;
        const shift = daysDiff * ppd;
        if (tlDragState.action === 'move') {
            tlDragState.barEl.style.left = (tlDragState.barLeft0 + shift) + 'px';
        } else if (tlDragState.action === 'start') {
            let nl = tlDragState.barLeft0 + shift;
            let nw = tlDragState.barWidth0 - shift;
            if (nw < ppd) { nw = ppd; nl = tlDragState.barLeft0 + tlDragState.barWidth0 - ppd; }
            tlDragState.barEl.style.left = nl + 'px';
            tlDragState.barEl.style.width = nw + 'px';
        } else if (tlDragState.action === 'end') {
            let nw = tlDragState.barWidth0 + shift;
            if (nw < ppd) nw = ppd;
            tlDragState.barEl.style.width = nw + 'px';
        }
    }

    const preview = document.getElementById('timeline-drag-preview');
    const track = document.getElementById('timeline-track');
    if(preview && track) {
        const rect = track.getBoundingClientRect();
        preview.style.display = 'block';
        preview.style.left = (clientX - rect.left) + 'px';
        let sstr = newStart ? new Date(newStart).toLocaleDateString('de-DE') : '';
        let eStr = newEnd ? new Date(newEnd).toLocaleDateString('de-DE') : '';
        preview.innerText = (sstr === eStr || !sstr) ? (eStr || sstr) : `${sstr} - ${eStr}`;
    }
}

function handleTimelineMouseUp(e) {
    if(!tlDragState) return;
    document.removeEventListener('mousemove', handleTimelineMouseMove);
    document.removeEventListener('mouseup', handleTimelineMouseUp);
    document.removeEventListener('touchmove', handleTimelineMouseMove);
    document.removeEventListener('touchend', handleTimelineMouseUp);
    
    const preview = document.getElementById('timeline-drag-preview');
    if(preview) preview.style.display = 'none';
    if(tlDragState.barEl) tlDragState.barEl.classList.remove('gantt-bar-dragging');

    if(tlDragState.currentStart !== undefined || tlDragState.currentEnd !== undefined) {
        const toDateStr = (ms) => {
            if(!ms) return ''; const d = new Date(ms);
            return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        };

        let changedName = '';
        if (tlDragState.type === 'milestone' || tlDragState.type === 'task-checklist') {
            changedName = tlDragState.entity.title;
        } else if (tlDragState.type === 'task') {
            changedName = tlDragState.entity.projectName;
        } else {
            changedName = tlDragState.entity.name;
        }

        if(tlDragState.type === 'milestone' || tlDragState.type === 'task-checklist') {
            if(tlDragState.currentEnd) {
                let originalTime = '';
                if(tlDragState.entity.dueDate && tlDragState.entity.dueDate.includes('T')) { originalTime = 'T' + tlDragState.entity.dueDate.split('T')[1]; }
                const newD = toDateStr(tlDragState.currentEnd);
                tlDragState.entity.dueDate = newD + originalTime;
                checkWorkdayWarning(newD, changedName);
            }
        } else {
            if(tlDragState.currentStart) {
                const newS = toDateStr(tlDragState.currentStart);
                tlDragState.entity.startDate = newS;
                checkWorkdayWarning(newS, changedName);
            }
            if(tlDragState.currentEnd) {
                const newE = toDateStr(tlDragState.currentEnd);
                tlDragState.entity.dueDate = newE;
                checkWorkdayWarning(newE, changedName);
            }
        }
        saveToLocal(); safeRenderTimeline(); showToast('Datum absolut angepasst!');
    }
    tlDragState = null;
}

function handleTimelineDragOver(e, minDateMs) {
    e.preventDefault(); 
    const track = document.getElementById('timeline-track');
    const preview = document.getElementById('timeline-drag-preview');
    if(!track || !preview) return;
    
    const rect = track.getBoundingClientRect();
    let x = e.clientX - rect.left; if(x < 0) x = 0; if(x > rect.width) x = rect.width;
    const daysOffset = (x - 220) / appData.settings.tlPixelsPerDay;
    const d = new Date(minDateMs + (daysOffset * 86400000));
    
    preview.style.display = 'block'; preview.style.left = x + 'px'; preview.innerText = d.toLocaleDateString('de-DE');
}

function handleTimelineDragLeave() { const preview = document.getElementById('timeline-drag-preview'); if(preview) preview.style.display = 'none'; }

function handleTimelineDrop(e, minDateMs) {
    e.preventDefault(); handleTimelineDragLeave();
    const track = document.getElementById('timeline-track'); const rect = track.getBoundingClientRect();
    let x = e.clientX - rect.left; const daysOffset = Math.max(0, (x - 220) / appData.settings.tlPixelsPerDay);
    
    const droppedDate = new Date(minDateMs + (daysOffset * 86400000)); const tzDate = new Date(droppedDate.getTime() - (droppedDate.getTimezoneOffset() * 60000)); const dateStr = tzDate.toISOString().split('T')[0];
    const markerId = e.dataTransfer.getData('markerId');
    
    if(markerId === 'new') { openMarkerModal(null, dateStr); } 
    else if (markerId) {
        const m = appData.timelineMarkers.find(x => x.id === markerId);
        if(m) { m.date = dateStr; saveToLocal(); safeRenderTimeline(); }
    }
}

function openMarkerModal(id = null, initialDate = '') {
    document.getElementById('markerModal').classList.add('active');
    const mIdInput = document.getElementById('m_id'); const mNameInput = document.getElementById('m_name'); const mDateInput = document.getElementById('m_date'); const btnDelete = document.getElementById('btnDeleteMarker');
    
    if (id) {
        const m = appData.timelineMarkers.find(x => x.id === id);
        if(m) { document.getElementById('markerModalTitle').innerText = t('marker_title_edit'); mIdInput.value = m.id; mNameInput.value = m.name; mDateInput.value = m.date; btnDelete.style.display = 'block'; }
    } else {
        document.getElementById('markerModalTitle').innerText = t('marker_title_new'); mIdInput.value = ''; mNameInput.value = '';
        const todayStr = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        mDateInput.value = initialDate || todayStr; btnDelete.style.display = 'none';
    }
}

// MARKER ENTFERNEN
function closeMarkerModal() { document.getElementById('markerModal').classList.remove('active'); }

function saveMarker() {
    const id = document.getElementById('m_id').value; const name = document.getElementById('m_name').value.trim(); const date = document.getElementById('m_date').value;
    if (!name || !date) return showToast('Bitte Name und Datum angeben.', 'error');
    
    if (id) { const m = appData.timelineMarkers.find(x => x.id === id); if(m) { m.name = name; m.date = date; } } 
    else { appData.timelineMarkers.push({ id: generateId(), name: name, date: date }); }
    
    saveToLocal(); closeMarkerModal(); safeRenderTimeline(); showToast(t('toast_saved'));
}

function deleteMarker() {
    const id = document.getElementById('m_id').value; appData.timelineMarkers = appData.timelineMarkers.filter(x => x.id !== id);
    saveToLocal(); closeMarkerModal(); safeRenderTimeline(); showToast(t('toast_deleted'));
}

function handleDependencyLinkClick(targetName) {
    switchView('dependencies');
    setTimeout(() => {
        const searchInput = document.getElementById('depSearchInput');
        if (searchInput) { 
            searchInput.value = targetName; 
            renderDependenciesView(document.getElementById('mainContainer')); 
        }
    }, 50);
}

function renderTimeline(c) {
    let sortHtml = getSortButtonsHTML(timelineSortKey, 'timelineSortKey');
    
    let html = `
    <style>
        .timeline-left-col { position: sticky; left: 0; z-index: 20; background-color: var(--surface-color) !important; width: 220px; min-width: 220px; flex-shrink: 0; border-right: 1px solid var(--border-color); height: 100%; box-sizing: border-box;}
        .timeline-header-col { position: sticky; left: 0; z-index: 35; background-color: var(--surface-color) !important; width: 220px; min-width: 220px; flex-shrink: 0; border-right: 1px solid var(--border-color); }
        
        .gantt-row { display: flex; align-items: center; border-bottom: 1px solid var(--border-color); height: 32px; background: var(--surface-color); transition: filter 0.2s; position:relative;}
        .gantt-row:nth-child(even) { background-color: rgba(0,0,0,0.02); }
        .gantt-row:nth-child(even) .timeline-left-col { filter: brightness(0.97); }
        .gantt-row:hover { background-color: rgba(0,0,0,0.05); }
        .gantt-row:hover .timeline-left-col { filter: brightness(0.94); }
        
        [data-theme="dark"] .gantt-row:nth-child(even) { background-color: rgba(255,255,255,0.02); }
        [data-theme="dark"] .gantt-row:nth-child(even) .timeline-left-col { filter: brightness(1.03); }
        [data-theme="dark"] .gantt-row:hover { background-color: rgba(255,255,255,0.05); }
        [data-theme="dark"] .gantt-row:hover .timeline-left-col { filter: brightness(1.06); }

        .gantt-bar { position: absolute; height: 20px; top: 6px; border-radius: 6px; display: flex; align-items: center; color: white; font-size: 11px; font-weight: bold; padding: 0 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.15); overflow: hidden; transition: box-shadow 0.2s, filter 0.2s; cursor: pointer; white-space:nowrap; text-overflow:ellipsis;}
        .gantt-bar.is-diamond { border-radius: 50%; width: 20px; padding: 0; justify-content: center; transform: translateX(-10px); }
        .gantt-bar:hover { filter: brightness(1.1); box-shadow: 0 4px 8px rgba(0,0,0,0.2); z-index: 10; }
        
        .gantt-resize-handle { position: absolute; top: 0; bottom: 0; width: 10px; cursor: ew-resize; z-index: 5; opacity: 0; transition: opacity 0.2s; background: rgba(255,255,255,0.3); }
        .gantt-resize-handle.start { left: 0; border-radius: 6px 0 0 6px; }
        .gantt-resize-handle.end { right: 0; border-radius: 0 6px 6px 0; }
        .gantt-move-handle { position: absolute; inset: 0 10px; cursor: grab; z-index: 4; }
        .gantt-bar:hover .gantt-resize-handle { opacity: 1; }

        .gantt-link-group { cursor: pointer; }
        .gantt-link-group .visible-line { transition: stroke-width 0.2s, filter 0.2s; }
        .gantt-link-group:hover .visible-line { stroke-width: 4px; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.3)); stroke: var(--danger) !important; }
        .gantt-link-group:hover marker polygon { fill: var(--danger) !important; }
    </style>
    
    <div style="position: sticky; top: -20px; z-index: 50; background: var(--bg-color); padding: 5px 0; margin-bottom: 5px; display:flex; justify-content:space-between; flex-wrap:wrap; align-items:center;">
        <div style="flex:1;">${sortHtml}</div>
        
        <div style="display:flex; align-items:center; background:var(--surface-color); border:1px solid var(--border-color); border-radius:var(--radius); overflow:hidden; margin-bottom:10px; box-shadow: var(--shadow);">
            <button class="secondary" style="border:none; border-radius:0; height:36px; border-right:1px solid var(--border-color); font-size:12px; font-weight:bold; padding: 0 15px;" onclick="scrollToTodayTimeline()" title="Zum heutigen Datum springen"><i class="fas fa-bullseye" style="color:var(--primary-color);"></i> ${t('gantt_today')}</button>
            <button class="secondary icon-btn" style="border:none; border-radius:0; height:36px; width:40px; border-right:1px solid var(--border-color);" onclick="zoomTimeline(-1)" title="Herauszoomen"><i class="fas fa-minus"></i></button>
            <button class="secondary icon-btn" style="border:none; border-radius:0; height:36px; width:40px;" onclick="zoomTimeline(1)" title="Hineinzoomen"><i class="fas fa-plus"></i></button>
        </div>
    </div>

    <div class="timeline-actions-header" style="background: var(--surface-color); padding: 5px 15px; border-radius: var(--radius); border: 1px solid var(--border-color); box-shadow: var(--shadow); display:flex; align-items:center; gap: 15px; margin-bottom: 10px;">
        <button draggable="true" ondragstart="event.dataTransfer.setData('markerId', 'new');" onclick="openMarkerModal()" class="secondary" title="${t('marker_hint')}" style="cursor:grab; padding: 4px 10px; font-size: 12px;">
            <i class="fas fa-map-marker-alt"></i> ${t('gantt_new_marker')}
        </button>
        <span style="font-size:11px; color:var(--text-muted); flex:1; min-width:200px;">${t('marker_hint')}</span>
    </div>`;

    let items = []; let unscheduledItems = [];
    const tasks = getFilteredTasks(); const stacks = getFilteredStacks(); const hideDone = appData.settings.globalHideCompleted;

    tasks.forEach(t_obj => {
        let taskMatchesUser = activeFilters.users.length === 0 || activeFilters.users.includes(t_obj.assigneeId || '');
        if(taskMatchesUser) {
            if(t_obj.startDate || t_obj.dueDate) { items.push({ type: 'task', d: t_obj, start: t_obj.startDate ? new Date(t_obj.startDate) : new Date(t_obj.dueDate), end: t_obj.dueDate ? new Date(t_obj.dueDate) : null, hasNoEnd: !t_obj.dueDate, hasNoStart: !t_obj.startDate }); } 
            else if (!t_obj.projectStackId) { unscheduledItems.push({ type: 'task', data: t_obj }); }
        }
    });
    
    stacks.forEach(s => {
        let stackMatchesUser = activeFilters.users.length === 0 || activeFilters.users.includes(s.assigneeId || '');
        if(stackMatchesUser) {
            if(s.startDate || s.dueDate) { items.push({ type: 'stack', d: s, start: s.startDate ? new Date(s.startDate) : new Date(s.dueDate), end: s.dueDate ? new Date(s.dueDate) : null, hasNoEnd: !s.dueDate, hasNoStart: !s.startDate }); } 
            else { unscheduledItems.push({ type: 'stack', data: s }); }
        }
    });

    stacks.forEach(s => { 
        if(s.checklist) s.checklist.forEach((m, idx) => { 
            let mMatchesUser = activeFilters.users.length === 0 || activeFilters.users.includes(m.assigneeId || '');
            if(hideDone && m.done) return;
            if(m.dueDate && mMatchesUser) items.push({ type: 'milestone', d: m, stackId: s.id, idx: idx, start: new Date(m.dueDate.split('T')[0]), end: new Date(m.dueDate.split('T')[0]), hasNoEnd: false, hasNoStart: false }); 
        }); 
    });

    tasks.forEach(t_obj => { 
        if(t_obj.checklist) t_obj.checklist.forEach((cl, idx) => { 
            let mMatchesUser = activeFilters.users.length === 0 || activeFilters.users.includes(cl.assigneeId || '');
            if(hideDone && cl.done) return;
            if(cl.dueDate && mMatchesUser) {
                const _cs = cl.startDate ? new Date(cl.startDate.split('T')[0]) : new Date(cl.dueDate.split('T')[0]);
                const _ce = new Date(cl.dueDate.split('T')[0]);
                items.push({ type: 'task-checklist', d: cl, taskId: t_obj.id, idx: idx, start: _cs, end: _ce, hasNoEnd: false, hasNoStart: false });
            }
        }); 
    });

    /* Abgeschlossene (herausgefilterte) Aufgaben: zukünftige, offene Checkpunkte trotzdem zeigen */
    if(hideDone) {
        const _todayIso = ttTodayIso();
        appData.tasks.forEach(t_obj => {
            if(!isTaskDone(t_obj)) return;
            let taskMatchesUser = activeFilters.users.length === 0 || activeFilters.users.includes(t_obj.assigneeId || '');
            if(!taskMatchesUser) return;
            const futureCps = (t_obj.checklist || []).map((cl, idx) => ({ cl, idx })).filter(x => !x.cl.done && (x.cl.dueDate || '').split('T')[0] >= _todayIso);
            if(!futureCps.length) return;
            /* Elternaufgabe als Zeile aufnehmen, damit die Checkpunkte darunter erscheinen (spannt über die Checkpunkt-Daten) */
            const cpDates = futureCps.map(x => new Date((x.cl.dueDate || '').split('T')[0]));
            const tStart = new Date(Math.min(...cpDates.map(d => d.getTime())));
            const tEnd = new Date(Math.max(...cpDates.map(d => d.getTime())));
            items.push({ type: 'task', d: t_obj, start: tStart, end: tEnd, _doneWithFutureCps: true });
            futureCps.forEach(({ cl, idx }) => {
                const clDate = (cl.dueDate || '').split('T')[0];
                const _cs2 = cl.startDate ? new Date(cl.startDate.split('T')[0]) : new Date(clDate);
                items.push({ type: 'task-checklist', d: cl, taskId: t_obj.id, idx: idx, start: _cs2, end: new Date(clDate) });
            });
        });
    }

    items = applySort(items, timelineSortKey); unscheduledItems = applySort(unscheduledItems, timelineSortKey);
    
    if(items.length === 0 && unscheduledItems.length === 0) {
        return c.innerHTML = html + `<p style="color:var(--text-muted)">Füge Aufgaben/Stacks mit Datum hinzu.</p>`;
    }

    let allDates = [];
    items.forEach(i => { if(i.start) allDates.push(i.start); if(i.end) allDates.push(i.end); });
    appData.timelineMarkers.forEach(m => { if(m.date) allDates.push(new Date(m.date)); });

    let minDate, maxDate;
    if(allDates.length > 0) { minDate = new Date(Math.min(...allDates)); maxDate = new Date(Math.max(...allDates)); } 
    else { minDate = new Date(); maxDate = new Date(minDate.getTime() + 30 * 24 * 60 * 60 * 1000); }
    if(minDate.getTime() === maxDate.getTime()) { maxDate = new Date(minDate.getTime() + 14 * 24 * 60 * 60 * 1000); }
    
    minDate = new Date(minDate.getTime() - (3 * 86400000)); maxDate = new Date(maxDate.getTime() + (3 * 86400000));
    const rawTotalDays = (maxDate - minDate) / (1000 * 60 * 60 * 24); const totalDays = Math.max(rawTotalDays, 1);
    const minDateMs = minDate.getTime(); 
    tlMinDateMs = minDateMs;

    const trackWidth = Math.max(800, totalDays * appData.settings.tlPixelsPerDay);

    let kwHtml = ''; let dayHtml = ''; let bgLinesHtml = ''; let absBandsHtml = '';
    const _absByDate = {};
    (appData.absences || []).forEach(a => { _absByDate[a.date] = a; });
    const todayDateObj = new Date(); todayDateObj.setHours(0,0,0,0); const currentKW = getISOWeek(todayDateObj); const currentKWYear = todayDateObj.getFullYear();
    let iterDate = new Date(minDate); iterDate.setHours(0,0,0,0);
    
    while(iterDate <= maxDate) {
        const ms = iterDate.getTime(); const xPos = ((ms - minDateMs) / 86400000) * appData.settings.tlPixelsPerDay; const dayOfWeek = iterDate.getDay();
        
        if (dayOfWeek === 1) { 
            const kw = getISOWeek(iterDate); const year = iterDate.getFullYear();
            const isCurrentKW = (kw === currentKW && (year === currentKWYear || year === currentKWYear -1 || year === currentKWYear + 1)); 
            const kwColor = isCurrentKW ? 'var(--primary-color)' : 'var(--text-muted)'; const kwBg = isCurrentKW ? 'var(--primary-lightest)' : 'transparent'; const kwFontWeight = isCurrentKW ? 'bold' : 'normal';
            kwHtml += `<div style="position:absolute; left:${xPos}px; top:0; padding-left:4px; font-size:10px; color:${kwColor}; background:${kwBg}; height:16px; border-left:1px solid var(--border-color); white-space:nowrap; z-index:5; font-weight:${kwFontWeight}; width:${7 * appData.settings.tlPixelsPerDay}px; display:flex; align-items:center;">KW ${kw}</div>`;
            bgLinesHtml += `<div style="position:absolute; left:${xPos}px; top:16px; bottom:0; width:1px; background:var(--border-color); z-index:0; pointer-events:none;"></div>`;
        }
        
        if (iterDate.getDate() === 1 || (totalDays < 60 && dayOfWeek === 1)) {
           dayHtml += `<div class="timeline-axis-tick" style="left:${xPos}px; bottom:0; height:4px; transform: translateX(-50%);"></div>`;
           dayHtml += `<div class="timeline-axis-label" style="left:${xPos}px; bottom:4px; font-size:9px; transform: translateX(-50%);">${iterDate.toLocaleDateString('de-DE', {day:'2-digit', month:'2-digit'})}</div>`;
        }
        const _iso = iterDate.getFullYear() + '-' + String(iterDate.getMonth()+1).padStart(2,'0') + '-' + String(iterDate.getDate()).padStart(2,'0');
        const _abs = _absByDate[_iso];
        if (_abs) {
            const _c = ttAbsColor(_abs.type);
            absBandsHtml += `<div class="gantt-abs-chip" title="${ttAbsLabel(_abs.type)}${_abs.note ? ' – ' + _abs.note.replace(/"/g,'&quot;') : ''}" onclick="switchView('time')" style="left:${xPos}px; width:${appData.settings.tlPixelsPerDay}px; --abs:${_c};"><i class="fas ${ttAbsIcon(_abs.type)}"></i></div>`;
        }
        iterDate.setDate(iterDate.getDate() + 1);
    }

    let markerPinsHtml = ''; let markerLinesHtml = '';
    appData.timelineMarkers.forEach(m => {
        const mDate = new Date(m.date); const xPos = ((mDate - minDateMs) / 86400000) * appData.settings.tlPixelsPerDay;
        if(xPos >= 0 && xPos <= trackWidth) {
            markerPinsHtml += `<div class="timeline-marker" style="left:${xPos}px; top:14px; transform: translateX(-50%); z-index:40;" draggable="true" ondragstart="event.dataTransfer.setData('markerId', '${m.id}');" ondblclick="openMarkerModal('${m.id}')" title="${m.date} - ${m.name}">
                <i class="fas fa-map-marker-alt" style="color:var(--danger); font-size:14px; filter:drop-shadow(0 2px 2px rgba(0,0,0,0.3));"></i>
                <div style="font-size:9px; color:var(--danger); background:var(--surface-color); padding:1px 4px; border-radius:4px; border:1px solid var(--danger); margin-top:0px; font-weight:bold; white-space:nowrap;">${m.name}</div>
            </div>`;
        }
    });

    const todayXPos = ((todayDateObj - minDateMs) / 86400000) * appData.settings.tlPixelsPerDay; let todayLineHtml = '';
    if(todayXPos >= 0 && todayXPos <= trackWidth) { todayLineHtml = `<div class="timeline-today-line" style="left:${todayXPos}px; top:20px; bottom:0; z-index:10; width:2px; transform:translateX(-50%);"></div>`; }

    let itemPositions = {}; let renderedIds = []; let rowIndex = 0; let barsHtml = '';
    const ROW_HEIGHT = 32;

    const drawBar = (item, isIndented, color, clickFn, name, isDiamond=false, isComp=false) => {
        const startX = ((item.start - minDate) / 86400000) * appData.settings.tlPixelsPerDay;
        let width = 0; let barStyle = `background:${color};`;

        if (item.hasNoEnd) { width = trackWidth - startX; barStyle = `background: linear-gradient(to right, ${color} 0%, transparent 100%); border: 1px dashed ${color}; border-right: none; border-radius: 6px 0 0 6px; opacity: 0.7;`; } 
        else if (item.hasNoStart) { width = startX; barStyle = `background: linear-gradient(to left, ${color} 0%, transparent 100%); border: 1px dashed ${color}; border-left: none; border-radius: 0 6px 6px 0; opacity: 0.7;`; } 
        else { width = ((item.end - item.start) / 86400000) * appData.settings.tlPixelsPerDay; if(isDiamond || width < 4) width = 4; }

        const finalStartX = item.hasNoStart ? 0 : startX; 
        const entityId = item.d.id;   /* eindeutige Kennung des Elements (für Positionen) */
        const dragId = item.type === 'milestone' ? item.stackId : (item.type === 'task-checklist' ? item.taskId : item.d.id);   /* Eltern-ID fürs Ziehen */
        
        let dragHandles = '';
        let progressPct = 0;
        if(item.type === 'task') progressPct = getTaskProgress(item.d);
        else if(item.type === 'stack') progressPct = getStackProgress(item.d.id).tPct;
        else if(item.type === 'milestone' || item.type === 'task-checklist') progressPct = item.d.done ? 100 : 0;
        
        let progressOverlay = '';
        if(!isDiamond && progressPct > 0) {
            progressOverlay = `<div style="position:absolute; left:0; top:0; bottom:0; width:${progressPct}%; background:rgba(0,0,0,0.25); border-radius:inherit; pointer-events:none; border-right:1px solid rgba(255,255,255,0.4);"></div>`;
        }

        if(!isComp && !isDiamond) {
            dragHandles = `
                <div class="gantt-resize-handle start" onmousedown="startTimelineDrag(event, '${item.type}', '${dragId}', 'start', ${item.idx})" ontouchstart="startTimelineDrag(event, '${item.type}', '${dragId}', 'start', ${item.idx})"></div>
                <div class="gantt-move-handle" onmousedown="startTimelineDrag(event, '${item.type}', '${dragId}', 'move', ${item.idx})" ontouchstart="startTimelineDrag(event, '${item.type}', '${dragId}', 'move', ${item.idx})"></div>
                <div class="gantt-resize-handle end" onmousedown="startTimelineDrag(event, '${item.type}', '${dragId}', 'end', ${item.idx})" ontouchstart="startTimelineDrag(event, '${item.type}', '${dragId}', 'end', ${item.idx})"></div>
            `;
        } else if(!isComp && isDiamond) {
            dragHandles = `<div class="gantt-move-handle" style="inset:0;" onmousedown="startTimelineDrag(event, '${item.type}', '${dragId}', 'move', ${item.idx})" ontouchstart="startTimelineDrag(event, '${item.type}', '${dragId}', 'move', ${item.idx})"></div>`;
        }

        const yCenter = rowIndex * ROW_HEIGHT + (ROW_HEIGHT / 2);
        itemPositions[entityId] = { startX: finalStartX, endX: finalStartX + width, y: yCenter, color: color, name: (item.type==='task'?item.d.projectName : (item.type==='stack'?item.d.name : item.d.title)) };
        renderedIds.push(entityId);

        let paddingLeft = isIndented ? '35px' : '15px';
        let fontWeight = isIndented ? 'normal' : 'bold';
        let itemOpacity = isComp ? 'opacity:0.6; filter:grayscale(50%);' : '';

        let rowHtml = `<div class="gantt-row ${isComp?'is-completed':''}" style="${itemOpacity}; width: ${trackWidth + 220}px;">
            <div class="timeline-left-col" style="font-size:11px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; padding-left:${paddingLeft}; padding-right:10px; cursor:pointer; font-weight:${fontWeight}; display:flex; align-items:center;" onclick="${clickFn}">${name}</div>
            <div style="flex:1; position:relative; height:100%; border-left:1px solid var(--border-color); overflow: hidden;">
                <div class="gantt-bar ${isDiamond?'is-diamond':''}" style="left:${finalStartX}px; width:${isDiamond?'20px':width+'px'}; ${barStyle}" title="${itemPositions[entityId].name} (${progressPct}%)" onclick="${clickFn}">
                    ${progressOverlay}${dragHandles}
                    ${!isDiamond && width > 40 ? `<span style="position:relative; z-index:10; pointer-events:none; font-size:10px;">${itemPositions[entityId].name}</span>` : ''}
                </div>
            </div>
        </div>`;
        
        rowIndex++;
        return rowHtml;
    };
    
    let stacksToRender = new Set();
    items.forEach(item => { if(item.type === 'stack') stacksToRender.add(item.d.id); if(item.type === 'task' && item.d.projectStackId) stacksToRender.add(item.d.projectStackId); });

    stacksToRender.forEach(stackId => {
        const stack = appData.projectStacks.find(s => s.id === stackId); if(!stack) return;
        const isstackComp = stack.status === 'completed'; const sPausedIcon = stack.status === 'paused' ? '<i class="fas fa-pause" style="color:var(--warning); margin-right:4px;"></i>' : '';
        
        let sItem = items.find(i => i.type === 'stack' && i.d.id === stackId);
        if(sItem) { barsHtml += drawBar(sItem, false, 'var(--primary-color)', `openStackModal('${stack.id}')`, `<i class="fas fa-folder" style="color:var(--primary-color); margin-right:5px;"></i> ${sPausedIcon}${stack.name}`, false, isstackComp); } 
        else { 
            let itemOpacity = isstackComp ? 'opacity:0.6; filter:grayscale(50%);' : '';
            barsHtml += `<div class="gantt-row ${isstackComp?'is-completed':''}" style="${itemOpacity}; width: ${trackWidth + 220}px;">
                <div class="timeline-left-col" style="font-size:11px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; padding-left:15px; padding-right:10px; cursor:pointer; font-weight:bold; display:flex; align-items:center;" onclick="openStackModal('${stack.id}')"><i class="fas fa-folder" style="color:var(--primary-color); margin-right:5px;"></i> ${sPausedIcon}${stack.name}</div>
                <div style="flex:1; border-left:1px solid var(--border-color); overflow: hidden;"></div>
            </div>`;
            rowIndex++;
        }
        
        const sMiles = items.filter(i => i.type === 'milestone' && i.stackId === stack.id); 
        sMiles.forEach(m => { const mPausedIcon = stack.status === 'paused' && !m.d.done ? '<i class="fas fa-pause" style="color:var(--warning); margin-right:4px;"></i>' : ''; barsHtml += drawBar(m, true, 'var(--warning)', `openStackModal('${stack.id}')`, `<i class="fas fa-flag" style="color:var(--warning); margin-right:5px;"></i> ${mPausedIcon}${m.d.title}`, true, isstackComp || m.d.done); });
        
        const sTasks = items.filter(i => i.type === 'task' && i.d.projectStackId === stack.id); 
        sTasks.forEach(t_obj => { 
            let color = 'var(--text-muted)'; if(t_obj.d.stakeholderId) { const sh = appData.stakeholders.find(x => x.id === t_obj.d.stakeholderId); if(sh) color = sh.color; } 
            const tPausedIcon = t_obj.d.isPaused && !isTaskDone(t_obj.d) ? '<i class="fas fa-pause" style="color:var(--warning); margin-right:4px;"></i>' : '';
            barsHtml += drawBar(t_obj, true, color, `openModal('${t_obj.d.id}')`, `<i class="fas fa-tasks" style="color:${color}; margin-right:5px;"></i> ${tPausedIcon}${t_obj.d.projectName}`, false, isTaskDone(t_obj.d)); 

            const tCl = items.filter(i => i.type === 'task-checklist' && i.taskId === t_obj.d.id);
            tCl.forEach(cl => { barsHtml += drawBar(cl, true, color, `openTaskToCheckpoint('${t_obj.d.id}','${cl.d.id}')`, `<i class="fas fa-check-square" style="margin-left:15px; margin-right:5px; color:${color}"></i> ${cl.d.title}`, (cl.start && cl.end && cl.end - cl.start > 0) ? false : true, isTaskDone(t_obj.d) || cl.d.done); });
        });
    });

    items.forEach(item => {
        if(item.type === 'task' && !item.d.projectStackId) {
            let color = 'var(--text-muted)'; if(item.d.stakeholderId) { const sh = appData.stakeholders.find(x => x.id === item.d.stakeholderId); if(sh) color = sh.color; } 
            const tPausedIcon = item.d.isPaused && !isTaskDone(item.d) ? '<i class="fas fa-pause" style="color:var(--warning); margin-right:4px;"></i>' : '';
            barsHtml += drawBar(item, false, color, `openModal('${item.d.id}')`, `<i class="fas fa-file" style="color:${color}; margin-right:5px;"></i> ${tPausedIcon}${item.d.projectName}`, false, isTaskDone(item.d)); 
            const tCl = items.filter(i => i.type === 'task-checklist' && i.taskId === item.d.id);
            tCl.forEach(cl => { barsHtml += drawBar(cl, true, color, `openTaskToCheckpoint('${item.d.id}','${cl.d.id}')`, `<i class="fas fa-check-square" style="margin-left:15px; margin-right:5px; color:${color}"></i> ${cl.d.title}`, (cl.start && cl.end && cl.end - cl.start > 0) ? false : true, isTaskDone(item.d) || cl.d.done); });
        }
    });
    
    function getRenderedEdges(renderedIdsList) {
        let edges = [];
        let renderedSet = new Set(renderedIdsList);

        function getClosestRenderedAncestors(startId) {
            let visited = new Set();
            let queue = [startId];
            let found = new Set();

            while(queue.length > 0) {
                let curr = queue.shift();
                let preds = tempPredecessors[curr] || [];
                for(let p of preds) {
                    if(!visited.has(p)) {
                        visited.add(p);
                        if(renderedSet.has(p)) {
                            found.add(p);
                        } else {
                            queue.push(p); 
                        }
                    }
                }
            }
            return Array.from(found);
        }

        for(let id of renderedIdsList) {
            let ancestors = getClosestRenderedAncestors(id);
            for(let anc of ancestors) {
                edges.push({ from: anc, to: id });
            }
        }
        return edges;
    }

    const visibleEdges = getRenderedEdges(renderedIds);
    
    let defsHtml = ''; pathsHtml = ''; let markerSet = new Set();
    visibleEdges.forEach(edge => {
        const p1 = itemPositions[edge.from]; const p2 = itemPositions[edge.to];
        if(!p1 || !p2) return;

        const cleanColor = (p1.color || '#ef4444').replace('#', '');
        if (!markerSet.has(cleanColor)) {
            defsHtml += `<marker id="arrow-${cleanColor}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><polygon points="0 0, 6 3, 0 6" fill="#${cleanColor}"/></marker>`;
            markerSet.add(cleanColor);
        }

        const x1 = p1.endX;   // right edge of source bar
        const y1 = p1.y;
        const x2 = p2.startX; // left edge of target bar
        const y2 = p2.y;
        
        const gapX = Math.abs(x2 - x1);
        const controlDist = Math.max(30, gapX / 2);
        
        // If target is to the right: curve forward; if same or left: loop around
        const pathD = x2 >= x1
            ? `M ${x1} ${y1} C ${x1 + controlDist} ${y1}, ${x2 - controlDist} ${y2}, ${x2} ${y2}`
            : `M ${x1} ${y1} C ${x1 + controlDist} ${y1}, ${x2 - controlDist} ${y2}, ${x2} ${y2}`;

        const safeTargetName = p2.name.replace(/'/g, "\\'");
        pathsHtml += `
            <g class="gantt-link-group" onclick="handleDependencyLinkClick('${safeTargetName}')" title="Klicken, um in die Abhängigkeiten-Ansicht zu wechseln">
                <path class="visible-line" d="${pathD}" fill="none" stroke="#${cleanColor}" stroke-width="2" opacity="1" marker-end="url(#arrow-${cleanColor})" />
                <path class="hitbox" d="${pathD}" fill="none" stroke="transparent" stroke-width="15" />
            </g>
        `;
    });

    const totalHeight = rowIndex * ROW_HEIGHT;
    const svgLinesHtml = `<svg width="100%" height="100%" style="overflow:visible;">
        <defs>${defsHtml}</defs>
        <g style="pointer-events:all;">${pathsHtml}</g>
    </svg>`;

    html += `<div style="background:var(--surface-color); border-radius:var(--radius); border: 1px solid var(--border-color); overflow:hidden;">`;

    if(items.length > 0 || appData.timelineMarkers.length > 0) {
        html += `
            <div class="timeline-track-container" style="position: relative;">
                <div style="min-width: ${trackWidth + 220}px; position: relative;">
                    
                    ${absBandsHtml ? `<div class="gantt-abs-strip" style="display:flex; height:24px; position:relative; z-index:31; border-bottom:1px solid var(--border-color);"><div class="timeline-header-col" style="display:flex; align-items:center; padding:0 15px; font-size:9px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--text-muted);"><i class="fas fa-plane-departure" style="margin-right:5px;"></i>Abwesenheit</div><div style="position:relative; width:${trackWidth}px;">${absBandsHtml}</div></div>` : ''}
                    <div style="display: flex; height: 35px; border-bottom: 1px solid var(--border-color); position: relative; z-index: 30; background: var(--surface-color);">
                        <div class="timeline-header-col" style="display: flex; align-items: flex-end; padding: 5px 15px; font-weight: bold; font-size:11px;">Projekt / Aufgabe</div>
                        <div style="position: relative; width: ${trackWidth}px;">
                            ${kwHtml}
                            ${dayHtml}
                            ${markerPinsHtml}
                        </div>
                    </div>

                    <div style="position: absolute; top: 35px; bottom: 0; left: 220px; width: ${trackWidth}px; pointer-events: none; z-index: 1;">
                        ${bgLinesHtml}
                        ${todayLineHtml}
                    </div>

                    <div style="position: relative; z-index: 10;" id="timeline-track" ondragover="handleTimelineDragOver(event, ${minDateMs})" ondrop="handleTimelineDrop(event, ${minDateMs})" ondragleave="handleTimelineDragLeave()">
                        <div id="timeline-drag-preview"></div>
                        ${barsHtml}
                    </div>

                    <div style="position: absolute; top: 35px; left: 220px; width: ${trackWidth}px; height: ${totalHeight}px; z-index: 15; pointer-events: none;">
                        ${svgLinesHtml}
                    </div>

                </div>
            </div>`;
    }
    html += `</div>`;

    if(unscheduledItems.length > 0) {
        let unschHtml = `<div style="margin-top: 40px; max-width:900px; margin-left:auto; margin-right:auto; text-align:left;">
            <h3 style="border-bottom:2px solid var(--border-color); padding-bottom:5px; margin-bottom:15px; font-size:16px;">
                <i class="fas fa-inbox" style="color:var(--text-muted); "></i> Backlog / Ungeplant
                <span style="font-size:11px; font-weight:normal; color:var(--text-muted); margin-left:10px;">(Tipp: Klicke auf ein Element, um ein Datum festzulegen)</span>
            </h3><div style="display:flex; flex-wrap:wrap; gap:10px; justify-content: start;">`;
        
        unscheduledItems.forEach(item => {
            let icon = item.type === 'stack' ? 'fa-folder' : 'fa-tasks'; let title = item.type === 'stack' ? item.data.name : item.data.projectName;
            let fn = item.type === 'stack' ? `openStackModal('${item.data.id}')` : `openModal('${item.data.id}')`;
            let isComp = item.type === 'stack' ? item.data.status === 'completed' : isTaskDone(item.data); let isPaused = item.type === 'stack' ? item.data.status === 'paused' : (item.data.isPaused && !isComp);
            let pausedIcon = isPaused ? '<i class="fas fa-pause" style="color:var(--warning); margin-right:4px;"></i>' : ''; let opacity = isComp ? 'opacity:0.6;' : '';

            unschHtml += `<div class="cal-event" style="background:var(--surface-color); border:1px solid var(--border-color); padding:8px 15px; border-radius:20px; cursor:pointer; display:inline-flex; align-items:center; flex-direction:row; box-shadow:var(--shadow); transition:0.2s; ${opacity}" onclick="${fn}" onmouseover="this.style.borderColor='var(--primary-color)'" onmouseout="this.style.borderColor='var(--border-color)'"><i class="fas ${icon}" style="color:var(--primary-color); margin-right:8px;"></i><span style="font-weight:bold; white-space:nowrap;">${pausedIcon}${title}</span></div>`;
        });
        unschHtml += `</div></div>`; html += unschHtml;
    }

    c.innerHTML = html;
    setTimeout(scrollToTodayTimeline, 50);
}

// TIME TRACKING (Multi-Timer)
function updateTimerDisplays() {
    let anyRunning = false; let globalHtml = ''; let mobileTimerHtml = '';
    
    for(let id in activeTimers) {
        const timer = activeTimers[id]; let ms = timer.accum; if(timer.running) { ms += Date.now() - timer.start; anyRunning = true; }
        let s = Math.floor(ms / 1000); let m = Math.floor(s / 60); let h = Math.floor(m / 60);
        let timeStr = [h, m%60, s%60].map(v => v.toString().padStart(2, '0')).join(':');
        
        if(currentView === 'time') { const el = document.getElementById(`timer_display_${id}`); if(el) el.innerText = timeStr; }
        if(timer.running) {
            let task = appData.tasks.find(t_obj => t_obj.id === id); 
            let tName = 'Unbekannt';
            if(task) {
                tName = task.projectName;
            } else {
                let delItem = appData.deletedItems.find(x => x.type === 'task' && x.data.id === id);
                if(delItem) tName = delItem.data.projectName;
            }
            
            globalHtml += `<div class="global-timer" onclick="goToTimeTracking()" style="cursor:pointer;" title="Klicken um zur Zeiterfassung zu wechseln"><i class="fas fa-circle"></i> ${timeStr} <span class="gt-task-name" style="font-weight:normal; max-width:100px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${tName}</span> <button class="icon-btn" style="background:transparent; border:none; padding:0; color:var(--danger);" onclick="event.stopPropagation(); stopTimer('${id}')" title="Stoppen"><i class="fas fa-stop"></i></button></div>`;
            
            mobileTimerHtml += `<div style="background:var(--danger); color:white; padding:15px; border-radius:var(--radius); display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; cursor:pointer;" onclick="closeMobileMoreMenu(); goToTimeTracking()">
                <div style="overflow:hidden;">
                    <div style="font-weight:bold; font-size:20px; display:flex; align-items:center; gap:8px;"><i class="fas fa-circle" style="font-size:12px; animation:pulse 2s infinite;"></i> ${timeStr}</div>
                    <div style="font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; opacity:0.9;">${tName}</div>
                </div>
                <button class="icon-btn" style="background:white; color:var(--danger); border-radius:50%; width:44px; height:44px; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 6px rgba(0,0,0,0.1);" onclick="event.stopPropagation(); stopTimer('${id}')"><i class="fas fa-stop" style="font-size:16px;"></i></button>
            </div>`;
        }
    }
    document.getElementById('global-timer-wrap').innerHTML = globalHtml;
    
    const mobileTimerContainer = document.getElementById('mobileActiveTimerContainer');
    if(mobileTimerContainer) mobileTimerContainer.innerHTML = mobileTimerHtml;
    
    const mobileMoreBtn = document.getElementById('bn_more_icon_wrapper');
    if (mobileMoreBtn) {
        if (anyRunning) mobileMoreBtn.classList.add('more-btn-timer-active');
        else mobileMoreBtn.classList.remove('more-btn-timer-active');
    }

    const nowMs = Date.now();
    if (nowMs - lastPushCheck > 10000) {
        lastPushCheck = nowMs;
        getNotifications();
    }
}

function addTimer() {
    const taskId = document.getElementById('new_timer_task').value; if(!taskId) return showToast('Bitte Aufgabe wählen.', 'error');
    if(!activeTimers[taskId]) { activeTimers[taskId] = { taskId, running: false, start: 0, accum: 0, note: '' }; localStorage.setItem('proman_timers', JSON.stringify(activeTimers)); renderTimeTracking(document.getElementById('mainContainer')); showToast('Timer hinzugefügt.'); }
}

function startTimer(taskId) {
    for(let id in activeTimers) { if(id !== taskId && activeTimers[id].running) { activeTimers[id].accum += Date.now() - activeTimers[id].start; activeTimers[id].running = false; } }
    if(!activeTimers[taskId].running) { activeTimers[taskId].running = true; activeTimers[taskId].start = Date.now(); }
    localStorage.setItem('proman_timers', JSON.stringify(activeTimers)); if(currentView === 'time') renderTimeTracking(document.getElementById('mainContainer'));
}

function pauseTimer(taskId) {
    if(activeTimers[taskId].running) { activeTimers[taskId].accum += Date.now() - activeTimers[taskId].start; activeTimers[taskId].running = false; localStorage.setItem('proman_timers', JSON.stringify(activeTimers)); if(currentView === 'time') renderTimeTracking(document.getElementById('mainContainer')); }
}

function stopTimer(taskId) {
    pauseTimer(taskId); let ms = activeTimers[taskId].accum; let hours = ms / 3600000; let rH = Math.max(0.25, Math.ceil(hours * 4) / 4);
    const nInput = document.getElementById(`timer_note_${taskId}`); const note = nInput ? nInput.value.trim() : activeTimers[taskId].note;
    const date = new Date().toISOString().split('T')[0];
    appData.timeLogs.push({ id: generateId(), taskId, hours: rH, date, note });
    { const _tk = appData.tasks.find(x => x.id === taskId); logActivity('fa-stopwatch', t('act_time_booked').replace('{h}', ttNum(rH)).replace('{n}', _tk ? _tk.projectName : '')); }
    
    const task = appData.tasks.find(t_obj => t_obj.id === taskId);
    if(task) { 
        task.spentTime = (parseFloat(task.spentTime || 0) + rH).toFixed(2); 
        const logText = `[Zeiterfassung am ${date} | ${rH}h] ${note}`.trim(); 
        task.notes = task.notes ? task.notes + '\n' + logText : logText; 
    }
    
    delete activeTimers[taskId]; localStorage.setItem('proman_timers', JSON.stringify(activeTimers)); saveToLocal(true); showToast(`Timer gestoppt. ${rH}h verbucht.`);
    if (currentView === 'time') renderTimeTracking(document.getElementById('mainContainer'));
}

function updateTimerNote(taskId, val) { if(activeTimers[taskId]) { activeTimers[taskId].note = val; localStorage.setItem('proman_timers', JSON.stringify(activeTimers)); } }

// --- 9b. ZEITKONTO: SOLL/IST-ABGLEICH & ABWESENHEITEN ---
const ABSENCE_TYPES = {
    vacation: { icon: 'fa-umbrella-beach', color: '#0ea5e9', key: 'abs_vacation' },
    sick:     { icon: 'fa-notes-medical',  color: '#a855f7', key: 'abs_sick'     },
    holiday:  { icon: 'fa-star',           color: '#14b8a6', key: 'abs_holiday'  },
    other:    { icon: 'fa-mug-hot',        color: '#64748b', key: 'abs_other'    }
};

let ttMonthOffset = 0;
let ttSelectedDays = [];
let ttSelectedDay = null;   /* zuletzt gewählter Einzeltag für die manuelle Erfassung */
let ttLastClickedDay = null;
let ttHalfDay = false;

function ttEsc(str) { return String(str == null ? '' : str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function ttAbsLabel(type) { const cfg = ABSENCE_TYPES[type]; return cfg ? t(cfg.key) : type; }
function ttAbsColor(type) { const cfg = ABSENCE_TYPES[type]; return cfg ? cfg.color : 'var(--text-muted)'; }
function ttAbsIcon(type)  { const cfg = ABSENCE_TYPES[type]; return cfg ? cfg.icon : 'fa-calendar'; }

function ttIso(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function ttParse(iso) { const p = String(iso).split('-'); return new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2])); }
function ttTodayIso() { return ttIso(new Date()); }
function ttLang() { return (appData.settings && appData.settings.language) ? appData.settings.language : 'de'; }
function ttLocale() { return { de: 'de-DE', en: 'en-GB', fr: 'fr-FR' }[ttLang()] || 'de-DE'; }
function ttFmtDate(iso) { return ttParse(iso).toLocaleDateString(ttLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function ttFmtShort(iso) { return ttParse(iso).toLocaleDateString(ttLocale(), { weekday: 'short', day: '2-digit', month: '2-digit' }); }
function ttNum(n) { const v = Math.round((parseFloat(n) || 0) * 100) / 100; return ttLang() === 'en' ? String(v) : String(v).replace('.', ','); }

function ttTargetHours() { const v = parseFloat(appData.settings.targetHoursPerDay); return (isNaN(v) || v <= 0) ? 8 : v; }
function ttIsWorkDay(iso) { const wd = appData.settings.workDays || [1,2,3,4,5]; return wd.includes(ttParse(iso).getDay()); }

function ttTrackFromIso() {
    if (appData.settings.timeTrackFrom) return appData.settings.timeTrackFrom;
    let earliest = null;
    (appData.timeLogs || []).forEach(l => { if (l.date && (!earliest || l.date < earliest)) earliest = l.date; });
    (appData.absences || []).forEach(a => { if (a.date && (!earliest || a.date < earliest)) earliest = a.date; });
    const limit = new Date(); limit.setDate(limit.getDate() - 365);
    const limitIso = ttIso(limit);
    if (!earliest || earliest < limitIso) earliest = limitIso;
    return earliest;
}

// Liefert Soll/Ist/Abwesenheit und den Buchungs-Status eines einzelnen Tages
function ttDayInfo(iso) {
    const target = ttIsWorkDay(iso) ? ttTargetHours() : 0;
    let booked = 0;
    (appData.timeLogs || []).forEach(l => { if (l.date === iso) booked += parseFloat(l.hours) || 0; });
    const abs = (appData.absences || []).filter(a => a.date === iso);
    let absHours = 0; abs.forEach(a => absHours += parseFloat(a.hours) || 0);
    const total = booked + absHours;
    const todayIso = ttTodayIso();
    let status;
    if (target === 0)                 status = total > 0 ? 'bonus' : 'free';
    else if (iso > todayIso)          status = 'future';
    else if (total + 0.001 >= target) status = 'ok';
    else if (iso === todayIso)        status = 'current';   // heute laeuft noch -> nicht als Fehler markieren
    else if (total > 0)               status = 'partial';
    else                              status = 'missing';
    return { iso, target, booked, absences: abs, absHours, total, missing: Math.max(0, target - total), status };
}

function ttPeriodRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() + ttMonthOffset, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + ttMonthOffset + 1, 0);
    return { start, end };
}

function ttPeriodStats() {
    const { start, end } = ttPeriodRange();
    const todayIso = ttTodayIso();
    let sollTotal = 0, sollToDate = 0, booked = 0, absHours = 0, istToDate = 0;
    const openDays = [], absList = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const info = ttDayInfo(ttIso(d));
        sollTotal += info.target;
        if (info.iso <= todayIso) {
            // Soll zaehlt fuer heute erst, sobald der Tag angefangen wurde zu buchen
            if (info.iso < todayIso || info.total > 0) sollToDate += info.target;
            istToDate += info.total;
        }
        booked += info.booked; absHours += info.absHours;
        if (info.status === 'missing' || info.status === 'partial') openDays.push(info);
        info.absences.forEach(a => absList.push(a));
    }
    return { sollTotal, sollToDate, booked, absHours, istToDate, saldo: istToDate - sollToDate, openDays, absList };
}

// Offene Tage ausserhalb des angezeigten Monats (damit nichts untergeht)
function ttOpenDaysOutside() {
    const { start, end } = ttPeriodRange();
    const fromIso = ttTrackFromIso();
    const todayIso = ttTodayIso();
    const startIso = ttIso(start), endIso = ttIso(end);
    const res = [];
    let d = ttParse(fromIso);
    const stop = ttParse(todayIso);
    while (d <= stop) {
        const iso = ttIso(d);
        if (iso < startIso || iso > endIso) {
            const info = ttDayInfo(iso);
            if (info.status === 'missing' || info.status === 'partial') res.push(info);
        }
        d.setDate(d.getDate() + 1);
    }
    return res;
}

// --- Aktionen ---
function ttSetAbsenceRaw(iso, type, hours, note) {
    if (!appData.absences) appData.absences = [];
    appData.absences = appData.absences.filter(a => a.date !== iso);
    appData.absences.push({
        id: generateId(), date: iso, type: type,
        hours: Math.round((parseFloat(hours) || 0) * 100) / 100,
        note: note || '', userId: appData.settings.currentUserId || null
    });
}

// 1-Klick-Buchung aus der Liste "Offene Tage": bucht genau die fehlende Zeit
function ttQuickAbsence(iso, type) {
    const info = ttDayInfo(iso);
    const hours = info.missing > 0 ? info.missing : ttTargetHours();
    ttSetAbsenceRaw(iso, type, hours);
    saveToLocal(true);
    showToast(`${ttAbsLabel(type)}: ${ttFmtDate(iso)} (${ttNum(hours)}h) ${t('tt_booked')}`);
    refreshTimeAccount();
}

function ttToggleDay(iso, ev) {
    if (ev) { ev.stopPropagation(); ev.preventDefault(); }
    if (ev && ev.shiftKey && ttLastClickedDay) {
        let a = ttLastClickedDay, b = iso;
        if (a > b) { const tmp = a; a = b; b = tmp; }
        let d = ttParse(a); const stop = ttParse(b);
        while (d <= stop) { const cur = ttIso(d); if (!ttSelectedDays.includes(cur)) ttSelectedDays.push(cur); d.setDate(d.getDate() + 1); }
    } else {
        const idx = ttSelectedDays.indexOf(iso);
        if (idx > -1) ttSelectedDays.splice(idx, 1); else ttSelectedDays.push(iso);
    }
    ttLastClickedDay = iso;
    ttSelectedDay = iso;
    refreshTimeAccount();
}

function ttSelectOpenDays() {
    const stats = ttPeriodStats();
    ttSelectedDays = stats.openDays.map(d => d.iso);
    if (ttSelectedDays.length === 0) showToast(t('tt_no_open'), 'success');
    refreshTimeAccount();
}

function ttClearSelection() { ttSelectedDays = []; ttLastClickedDay = null; refreshTimeAccount(); }
function ttToggleHalfDay(cb) { ttHalfDay = !!cb.checked; }

function ttApplySelection(type) {
    if (ttSelectedDays.length === 0) return;
    const hours = ttHalfDay ? ttTargetHours() / 2 : ttTargetHours();
    let n = 0, skipped = 0;
    ttSelectedDays.forEach(iso => {
        if (!ttIsWorkDay(iso)) { skipped++; return; }
        ttSetAbsenceRaw(iso, type, hours); n++;
    });
    ttSelectedDays = []; ttHalfDay = false;
    saveToLocal(true);
    showToast(`${n} ${t('tt_days_booked')} (${ttAbsLabel(type)})${skipped ? ` – ${skipped} ${t('tt_skipped_free')}` : ''}`);
    refreshTimeAccount();
}

function ttRemoveSelection() {
    if (ttSelectedDays.length === 0) return;
    const before = (appData.absences || []).length;
    appData.absences = (appData.absences || []).filter(a => !ttSelectedDays.includes(a.date));
    const removed = before - appData.absences.length;
    ttSelectedDays = [];
    saveToLocal(true);
    showToast(removed > 0 ? `${removed} ${t('tt_abs_removed')}` : t('tt_nothing_removed'));
    refreshTimeAccount();
}

function ttDeleteAbsence(id) {
    appData.absences = (appData.absences || []).filter(a => a.id !== id);
    saveToLocal(true); showToast(t('toast_deleted')); refreshTimeAccount();
}

// Springt in die manuelle Erfassung und füllt Datum + fehlende Stunden vor
function ttBookTime(iso) {
    const info = ttDayInfo(iso);
    const dEl = document.getElementById('tt_date');
    const hEl = document.getElementById('tt_hours');
    if (dEl) dEl.value = iso;
    if (hEl) hEl.value = (info.missing > 0 ? info.missing : ttTargetHours()).toFixed(2);
    const box = document.getElementById('tt_manual_box');
    if (box) {
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        box.style.transition = 'box-shadow 0.3s';
        box.style.boxShadow = '0 0 0 2px var(--primary-color)';
        setTimeout(() => { box.style.boxShadow = ''; }, 1600);
    }
    const sel = document.getElementById('tt_task');
    if (sel) setTimeout(() => sel.focus(), 300);
}

function ttPrevMonth() { ttMonthOffset--; ttSelectedDays = []; refreshTimeAccount(); }
function ttNextMonth() { ttMonthOffset++; ttSelectedDays = []; refreshTimeAccount(); }
function ttGoToday()   { ttMonthOffset = 0; ttSelectedDays = []; refreshTimeAccount(); }
function ttGoToIso(iso) {
    const d = ttParse(iso); const now = new Date();
    ttMonthOffset = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
    ttSelectedDays = []; refreshTimeAccount();
}

// --- Zeitraum-Modal (Urlaub am Stück) ---
function ttJumpToManual() {
    const chosen = (typeof ttSelectedDay !== 'undefined' && ttSelectedDay) ? ttSelectedDay : null;
    const dateEl = document.getElementById('tt_date');
    if (dateEl && chosen) dateEl.value = chosen;
    const box = document.getElementById('tt_manual_box');
    if (box) {
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        box.classList.add('tt-flash');
        setTimeout(function(){ box.classList.remove('tt-flash'); }, 1200);
        const firstField = document.getElementById('tt_hours') || document.getElementById('tt_task');
        if (firstField) setTimeout(function(){ firstField.focus(); }, 350);
    }
}

function ttOpenAbsenceRange(presetType) {
    const today = ttTodayIso();
    let from = today, to = today;
    if (ttSelectedDays.length > 0) {
        const sorted = [...ttSelectedDays].sort();
        from = sorted[0]; to = sorted[sorted.length - 1];
    }
    document.getElementById('abs_from').value = from;
    document.getElementById('abs_to').value = to;
    document.getElementById('abs_type').value = presetType || 'vacation';
    document.getElementById('abs_half').checked = false;
    document.getElementById('abs_note').value = '';
    document.getElementById('absenceModal').classList.add('active');
}
function ttCloseAbsenceRange() { document.getElementById('absenceModal').classList.remove('active'); }

function ttSaveAbsenceRange() {
    const from = document.getElementById('abs_from').value;
    const to   = document.getElementById('abs_to').value;
    const type = document.getElementById('abs_type').value;
    const half = document.getElementById('abs_half').checked;
    const note = document.getElementById('abs_note').value.trim();
    if (!from || !to) return showToast(t('tt_need_dates'), 'error');
    if (to < from) return showToast(t('tt_range_invalid'), 'error');
    const hours = half ? ttTargetHours() / 2 : ttTargetHours();
    let n = 0, skipped = 0;
    let d = ttParse(from); const stop = ttParse(to);
    while (d <= stop) {
        const iso = ttIso(d);
        if (ttIsWorkDay(iso)) { ttSetAbsenceRaw(iso, type, hours, note); n++; } else skipped++;
        d.setDate(d.getDate() + 1);
    }
    saveToLocal(true);
    ttCloseAbsenceRange();
    showToast(`${n} ${t('tt_days_booked')} (${ttAbsLabel(type)})${skipped ? ` – ${skipped} ${t('tt_skipped_free')}` : ''}`);
    if (currentView === 'time') renderTimeTracking(document.getElementById('mainContainer'));
}

// --- Rendering ---
function refreshTimeAccount() {
    const el = document.getElementById('tt_account_panel');
    if (el) el.innerHTML = renderTimeAccount();
}

function ttKpi(label, value, sub, color) {
    return `<div class="tt-kpi"><div class="tt-kpi-label">${label}</div><div class="tt-kpi-value" style="color:${color || 'var(--text-main)'}">${value}</div><div class="tt-kpi-sub">${sub || ''}</div></div>`;
}

function renderTimeAccount() {
    const { start, end } = ttPeriodRange();
    const stats = ttPeriodStats();
    const todayIso = ttTodayIso();
    const target = ttTargetHours();
    const monthLabel = start.toLocaleDateString(ttLocale(), { month: 'long', year: 'numeric' });
    const wdNames = { de: ['Mo','Di','Mi','Do','Fr','Sa','So'], en: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], fr: ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'] }[ttLang()] || ['Mo','Di','Mi','Do','Fr','Sa','So'];

    // Kopf
    let html = `<div class="tt-panel">
        <div class="tt-head">
            <h3 style="margin:0; display:flex; align-items:center; gap:8px;"><i class="fas fa-calendar-check" style="color:var(--primary-color)"></i> ${t('tt_title')}</h3>
            <div class="tt-head-right">
                <div class="tt-navgroup">
                    <button class="secondary icon-btn" onclick="ttPrevMonth()" title="${t('tt_prev')}"><i class="fas fa-chevron-left"></i></button>
                    <span class="tt-month">${monthLabel}</span>
                    <button class="secondary icon-btn" onclick="ttNextMonth()" title="${t('tt_next')}"><i class="fas fa-chevron-right"></i></button>
                    <button class="secondary" onclick="ttGoToday()" style="font-size:12px; padding:6px 10px;">${t('today')}</button>
                </div>
                <span class="tt-head-cta">
                    <button class="secondary" onclick="ttOpenAbsenceRange('vacation')" style="font-size:13px;"><i class="fas fa-plus"></i> ${t('tt_add_absence')}</button>
                    <button onclick="ttJumpToManual()" style="font-size:13px;"><i class="fas fa-plus"></i> ${t('tt_add_time')}</button>
                </span>
            </div>
        </div>`;

    // KPIs
    const saldoColor = stats.saldo < -0.01 ? 'var(--danger)' : (stats.saldo > 0.01 ? 'var(--success)' : 'var(--text-main)');
    const openColor = stats.openDays.length > 0 ? 'var(--danger)' : 'var(--success)';
    html += `<div class="tt-kpis">
        ${ttKpi(t('tt_soll_todate'), ttNum(stats.sollToDate) + ' h', `${t('tt_month_total')}: ${ttNum(stats.sollTotal)} h`)}
        ${ttKpi(t('tt_booked_h'), ttNum(stats.booked) + ' h', t('tt_from_tasks'))}
        ${ttKpi(t('tt_absence_h'), ttNum(stats.absHours) + ' h', t('tt_absence_sub'))}
        ${ttKpi(t('tt_saldo'), (stats.saldo > 0 ? '+' : '') + ttNum(stats.saldo) + ' h', t('tt_saldo_sub'), saldoColor)}
        ${ttKpi(t('tt_open_days'), String(stats.openDays.length), t('tt_open_days_sub'), openColor)}
    </div>`;

    // Hinweis auf offene Tage ausserhalb des Monats
    const outside = ttOpenDaysOutside();
    if (outside.length > 0) {
        const oldest = outside[0];
        html += `<div class="tt-alert">
            <i class="fas fa-exclamation-triangle"></i>
            <span>${outside.length} ${t('tt_open_outside')} – ${t('tt_oldest')}: <b>${ttFmtDate(oldest.iso)}</b></span>
            <button class="secondary" style="font-size:12px; padding:4px 10px; margin-left:auto;" onclick="ttGoToIso('${oldest.iso}')">${t('tt_jump_there')}</button>
        </div>`;
    }

    // Kalender
    html += `<div class="tt-cal-wrap"><div class="tt-cal-head">${wdNames.map(w => `<div>${w}</div>`).join('')}</div><div class="tt-cal">`;
    const firstCell = new Date(start);
    const shift = (firstCell.getDay() + 6) % 7; // Montag = 0
    firstCell.setDate(firstCell.getDate() - shift);
    const lastCell = new Date(end);
    lastCell.setDate(lastCell.getDate() + (7 - ((lastCell.getDay() + 6) % 7) - 1));

    for (let d = new Date(firstCell); d <= lastCell; d.setDate(d.getDate() + 1)) {
        const iso = ttIso(d);
        const inMonth = d.getMonth() === start.getMonth();
        if (!inMonth) { html += `<div class="tt-day out"><span class="tt-day-num">${d.getDate()}</span></div>`; continue; }
        const info = ttDayInfo(iso);
        const sel = ttSelectedDays.includes(iso) ? ' selected' : '';
        const isToday = iso === todayIso ? ' today' : '';
        const abs = info.absences[0];
        let cls = info.status, inner = '', style = '';
        if (abs) {
            cls = 'abs';
            style = `--tt-abs:${ttAbsColor(abs.type)};`;
            inner = `<i class="fas ${ttAbsIcon(abs.type)} tt-day-icon"></i><span class="tt-day-h">${info.booked > 0 ? ttNum(info.total) : ttNum(info.absHours)}h</span>`;
        } else if (info.status === 'free') {
            inner = `<span class="tt-day-h">–</span>`;
        } else if (info.status === 'future') {
            inner = `<span class="tt-day-h">${info.booked > 0 ? ttNum(info.booked) + 'h' : ''}</span>`;
        } else if (info.status === 'current') {
            inner = `<span class="tt-day-h">${ttNum(info.total)}/${ttNum(info.target)}h</span>`;
        } else {
            inner = `<span class="tt-day-h">${ttNum(info.total)}/${ttNum(info.target || info.booked)}h</span>`;
        }
        const title = `${ttFmtDate(iso)} — ${t('tt_booked_h')}: ${ttNum(info.booked)}h${info.absHours ? ` / ${ttAbsLabel(abs ? abs.type : 'other')}: ${ttNum(info.absHours)}h` : ''}${info.target ? ` / ${t('target')}: ${ttNum(info.target)}h` : ` (${t('tt_nonworkday')})`}`;
        html += `<div class="tt-day ${cls}${sel}${isToday}" style="${style}" title="${title}" onclick="ttToggleDay('${iso}', event)">
            <span class="tt-day-num">${d.getDate()}</span>${inner}
        </div>`;
    }
    html += `</div></div>`;

    // Legende
    html += `<div class="tt-legend">
        <span><i class="tt-dot ok"></i> ${t('tt_leg_ok')}</span>
        <span><i class="tt-dot partial"></i> ${t('tt_leg_partial')}</span>
        <span><i class="tt-dot missing"></i> ${t('tt_leg_missing')}</span>
        <span><i class="tt-dot abs"></i> ${t('tt_leg_abs')}</span>
        <span><i class="tt-dot free"></i> ${t('tt_leg_free')}</span>
        <span style="margin-left:auto; color:var(--text-muted);">${t('tt_select_hint')}</span>
    </div>`;

    // Aktionsleiste bei Auswahl
    if (ttSelectedDays.length > 0) {
        html += `<div class="tt-actionbar">
            <div class="tt-actionbar-info"><i class="fas fa-check-circle"></i> <b>${ttSelectedDays.length}</b> ${t('tt_selected')}</div>
            <label class="tt-half"><input type="checkbox" ${ttHalfDay ? 'checked' : ''} onchange="ttToggleHalfDay(this)"> ${t('tt_half_day')}</label>
            ${Object.keys(ABSENCE_TYPES).map(k => `<button class="tt-abs-btn" style="--tt-abs:${ABSENCE_TYPES[k].color}" onclick="ttApplySelection('${k}')"><i class="fas ${ABSENCE_TYPES[k].icon}"></i> ${t(ABSENCE_TYPES[k].key)}</button>`).join('')}
            <button class="secondary" style="font-size:12px;" onclick="ttRemoveSelection()"><i class="fas fa-eraser"></i> ${t('tt_remove_abs')}</button>
            <button class="secondary" style="font-size:12px;" onclick="ttClearSelection()"><i class="fas fa-times"></i> ${t('cancel')}</button>
        </div>`;
    }

    // Detail der gewählten Tage: was wurde gebucht (inkl. Notizen)?
    if (ttSelectedDays.length > 0) {
        const sortedSel = ttSelectedDays.slice().sort();
        let anyEntry = false;
        let detailHtml = `<div class="tt-detail"><h4><i class="fas fa-list-check"></i> ${t('tt_detail_title')} (${ttSelectedDays.length})</h4>`;
        sortedSel.forEach(iso => {
            const info = ttDayInfo(iso);
            const logs = (appData.timeLogs || []).filter(l => l.date === iso);
            const abs = (appData.absences || []).filter(a => a.date === iso);
            if (!logs.length && !abs.length) return;
            anyEntry = true;
            detailHtml += `<div class="tt-detail-day">
                <div class="tt-detail-head"><b>${ttFmtShort(iso)}</b><span>${ttNum(info.total)} h</span></div>`;
            abs.forEach(a => {
                detailHtml += `<div class="tt-detail-row abs" style="--tt-abs:${ttAbsColor(a.type)}">
                    <i class="fas ${ttAbsIcon(a.type)}"></i>
                    <span class="tt-detail-main"><b>${ttAbsLabel(a.type)}</b>${a.note ? `<u>${ttEsc(a.note)}</u>` : ''}</span>
                    <span class="tt-detail-h">${ttNum(a.hours)} h</span>
                </div>`;
            });
            logs.forEach(l => {
                const task = (appData.tasks || []).find(x => x.id === l.taskId);
                const stack = task ? (appData.projectStacks || []).find(st => st.id === task.projectStackId) : null;
                detailHtml += `<div class="tt-detail-row">
                    <span class="tt-detail-h">${ttNum(l.hours)} h</span>
                    <span class="tt-detail-main"><b>${ttEsc(task ? task.projectName : t('tt_deleted_task'))}</b>${l.note ? `<u>${ttEsc(l.note)}</u>` : (stack ? `<u>${ttEsc(stack.name)}</u>` : '')}</span>
                    <button class="tt-detail-del" onclick="deleteTimeLog('${l.id}')" title="${t('delete')}"><i class="fas fa-times"></i></button>
                </div>`;
            });
            detailHtml += `</div>`;
        });
        detailHtml += `</div>`;
        if (anyEntry) html += detailHtml;
        else html += `<div class="tt-detail"><p class="tt-detail-empty"><i class="fas fa-circle-info"></i> ${t('tt_detail_empty')}</p></div>`;
    }

    // Offene Tage – 1-Klick-Buchung
    html += `<div class="tt-open">
        <div class="tt-open-head">
            <h4><i class="fas fa-triangle-exclamation" style="color:${stats.openDays.length ? 'var(--danger)' : 'var(--success)'}"></i> ${t('tt_open_list')} (${stats.openDays.length})</h4>
            ${stats.openDays.length > 0 ? `<button class="secondary" style="font-size:12px; padding:5px 10px;" onclick="ttSelectOpenDays()"><i class="fas fa-object-group"></i> ${t('tt_select_all_open')}</button>` : ''}
        </div>`;
    if (stats.openDays.length === 0) {
        html += `<div class="tt-empty"><i class="fas fa-circle-check" style="color:var(--success)"></i> ${t('tt_all_complete')}</div>`;
    } else {
        stats.openDays.slice().reverse().forEach(info => {
            html += `<div class="tt-open-row">
                <div class="tt-open-date"><b>${ttFmtShort(info.iso)}</b><span class="tt-open-missing">${t('tt_missing')}: ${ttNum(info.missing)}h ${t('tt_of')} ${ttNum(info.target)}h</span></div>
                <div class="tt-open-actions">
                    <button class="tt-mini" style="--tt-abs:var(--primary-color)" onclick="ttBookTime('${info.iso}')" title="${t('tt_book_task')}"><i class="fas fa-stopwatch"></i> <span>${t('tt_book_task')}</span></button>
                    ${['vacation','sick','holiday','other'].map(k => `<button class="tt-mini" style="--tt-abs:${ABSENCE_TYPES[k].color}" onclick="ttQuickAbsence('${info.iso}','${k}')" title="${t(ABSENCE_TYPES[k].key)}"><i class="fas ${ABSENCE_TYPES[k].icon}"></i> <span>${t(ABSENCE_TYPES[k].key)}</span></button>`).join('')}
                </div>
            </div>`;
        });
    }
    html += `</div>`;

    // Abwesenheiten des Monats
    if (stats.absList.length > 0) {
        html += `<div class="tt-abslist"><h4><i class="fas fa-plane-departure"></i> ${t('tt_abs_in_month')} (${stats.absList.length})</h4><div class="tt-abschips">`;
        stats.absList.sort((a, b) => a.date.localeCompare(b.date)).forEach(a => {
            html += `<span class="tt-chip" style="--tt-abs:${ttAbsColor(a.type)}" title="${ttEsc(a.note)}">
                <i class="fas ${ttAbsIcon(a.type)}"></i> ${ttFmtShort(a.date)} · ${ttNum(a.hours)}h · ${ttAbsLabel(a.type)}
                <button onclick="ttDeleteAbsence('${a.id}')" title="${t('delete')}"><i class="fas fa-times"></i></button>
            </span>`;
        });
        html += `</div></div>`;
    }

    html += `</div>`;
    return html;
}

/* ============================================================
   ZEITRAUM-FILTER (gilt für Zeiterfassung UND Budget)
   ============================================================ */
const TT_RANGE_PRESETS = ['all', 'this_month', 'last_month', 'last_30', 'this_quarter', 'this_year', 'last_year'];
let ttRange = (() => {
    try {
        const r = JSON.parse(localStorage.getItem('proman_tt_range') || 'null');
        if (r && typeof r.preset === 'string') return { preset: r.preset, from: r.from || '', to: r.to || '' };
    } catch (e) {}
    return { preset: 'all', from: '', to: '' };
})();

function ttSaveRange() { try { localStorage.setItem('proman_tt_range', JSON.stringify(ttRange)); } catch (e) {} }

/* Liefert { from, to } als ISO-Datum (inklusive) oder null für „offen". Presets werden immer neu berechnet. */
function ttRangeBounds() {
    const now = new Date(); const y = now.getFullYear(), m = now.getMonth();
    const r = (a, b) => ({ from: a ? ttIso(a) : null, to: b ? ttIso(b) : null });
    switch (ttRange.preset) {
        case 'this_month':   return r(new Date(y, m, 1), new Date(y, m + 1, 0));
        case 'last_month':   return r(new Date(y, m - 1, 1), new Date(y, m, 0));
        case 'last_30':      return r(new Date(y, m, now.getDate() - 29), now);
        case 'this_quarter': { const q = Math.floor(m / 3) * 3; return r(new Date(y, q, 1), new Date(y, q + 3, 0)); }
        case 'this_year':    return r(new Date(y, 0, 1), new Date(y, 11, 31));
        case 'last_year':    return r(new Date(y - 1, 0, 1), new Date(y - 1, 11, 31));
        case 'custom': {
            let from = ttRange.from || null, to = ttRange.to || null;
            if (from && to && from > to) { const x = from; from = to; to = x; }
            return { from, to };
        }
        default: return { from: null, to: null };
    }
}
function ttRangeActive() { const b = ttRangeBounds(); return !!(b.from || b.to); }
function ttInRange(iso) {
    const b = ttRangeBounds();
    if (!b.from && !b.to) return true;
    if (!iso) return false;
    const d = String(iso).slice(0, 10);
    if (b.from && d < b.from) return false;
    if (b.to && d > b.to) return false;
    return true;
}
function ttRangeLogs() { return (appData.timeLogs || []).filter(l => l && ttInRange(l.date)); }
function ttRangeLabel() {
    const b = ttRangeBounds();
    if (!b.from && !b.to) return t('tr_all_time');
    if (b.from && b.to) return b.from === b.to ? ttFmtDate(b.from) : `${ttFmtDate(b.from)} – ${ttFmtDate(b.to)}`;
    return b.from ? `${t('tr_since')} ${ttFmtDate(b.from)}` : `${t('tr_until')} ${ttFmtDate(b.to)}`;
}

/* Aufgabe bzw. Stack nachschlagen – auch wenn sie im Papierkorb liegen. */
function ttTaskOrDeleted(taskId) {
    const task = (appData.tasks || []).find(x => x.id === taskId);
    if (task) return { task, deleted: false };
    const del = (appData.deletedItems || []).find(x => x.type === 'task' && x.data && x.data.id === taskId);
    return del ? { task: del.data, deleted: true } : { task: null, deleted: true };
}
function ttStackOrDeleted(stackId) {
    if (!stackId) return null;
    const s = (appData.projectStacks || []).find(x => x.id === stackId);
    if (s) return s;
    const del = (appData.deletedItems || []).find(x => x.type === 'stack' && x.data && x.data.id === stackId);
    return del ? del.data : null;
}

/* Stunden/Kosten einer Aufgabe bzw. eines Stacks im gewählten Zeitraum.
   Ohne Filter gelten die bisherigen Gesamtwerte (inkl. Ist-Aufwand als Ersatz). */
function getTaskHoursInRange(task) {
    if (!task) return 0;
    if (!ttRangeActive()) return getTaskTrackedHours(task);
    return ttRangeLogs().filter(l => l.taskId === task.id).reduce((s, l) => s + (parseFloat(l.hours) || 0), 0);
}
function getTaskCostInRange(task) {
    if (!task) return 0;
    if (!ttRangeActive()) return getTaskConsumedBudget(task);
    const stack = task.projectStackId ? appData.projectStacks.find(s => s.id === task.projectStackId) : null;
    return getTaskHoursInRange(task) * getEffectiveHourlyRate(null, task, stack);
}
function getStackCostInRange(stack) {
    if (!stack) return 0;
    return appData.tasks.filter(x => x.projectStackId === stack.id).reduce((s, x) => s + getTaskCostInRange(x), 0);
}

function ttRerender() { if (currentView === 'time') renderTimeTracking(document.getElementById('mainContainer')); }
/* Auf schmalen Bildschirmen den aktiven Zeitraum-Chip in die sichtbare Zone der Leiste schieben */
function ttRevealActiveRangeChip() {
    const row = document.querySelector('.tt-range-chips');
    const act = row && row.querySelector('[aria-pressed="true"]');
    if (!row || !act || row.scrollWidth <= row.clientWidth) return;
    row.scrollLeft = Math.max(0, act.offsetLeft - row.offsetLeft - (row.clientWidth - act.offsetWidth) / 2);
}
function ttSetRangePreset(p) {
    ttRange.preset = TT_RANGE_PRESETS.includes(p) ? p : 'all';
    const b = ttRangeBounds();
    ttRange.from = b.from || ''; ttRange.to = b.to || '';
    ttRgExpanded = false; ttSaveRange(); ttRerender();
}
function ttSetRangeDate(which, val) {
    /* Beim Tippen liefert der Browser Zwischenstände wie 0002-…; erst ein vollständiges Jahr übernehmen. */
    if (val && parseInt(val.slice(0, 4), 10) < 1900) return;
    ttRange[which === 'to' ? 'to' : 'from'] = val || '';
    ttRange.preset = (ttRange.from || ttRange.to) ? 'custom' : 'all';
    ttRgExpanded = false; ttSaveRange(); ttRerender();
}

function buildTimeRangeBarHtml() {
    const b = ttRangeBounds();
    const active = !!(b.from || b.to);
    const chips = TT_RANGE_PRESETS.map(p =>
        `<button type="button" class="secondary tt-range-chip" aria-pressed="${ttRange.preset === p}" onclick="ttSetRangePreset('${p}')">${t('tr_' + p)}</button>`
    ).join('');
    return `<div class="tt-range" role="group" aria-label="${t('tr_title')}">
        <div class="tt-range-label"><i class="fas fa-calendar-days"></i> ${t('tr_title')}</div>
        <div class="tt-range-chips">${chips}</div>
        <div class="tt-range-dates">
            <label><span>${t('tr_from')}</span><input type="date" value="${b.from || ''}" onchange="ttSetRangeDate('from', this.value)" aria-label="${t('tr_from')}"></label>
            <span class="tt-range-sep">–</span>
            <label><span>${t('tr_to')}</span><input type="date" value="${b.to || ''}" onchange="ttSetRangeDate('to', this.value)" aria-label="${t('tr_to')}"></label>
            ${active ? `<button type="button" class="secondary tt-range-reset" onclick="ttSetRangePreset('all')" title="${t('tr_reset')}"><i class="fas fa-xmark"></i> <span>${t('tr_reset')}</span></button>` : ''}
        </div>
    </div>`;
}

/* Liste „Nach Projekt-Stack und Aufgabe": zunächst nur die ersten Einträge, Rest per Knopf */
const TT_RG_LIMIT = 3;
let ttRgExpanded = false;
function ttRgMoreLabel(hidden) {
    return ttRgExpanded
        ? `<i class="fas fa-chevron-up"></i> ${t('tr_show_less')}`
        : `<i class="fas fa-chevron-down"></i> ${t('tr_show_all').replace('{n}', hidden + TT_RG_LIMIT)} <span>(+${hidden})</span>`;
}
function ttToggleRgList() {
    ttRgExpanded = !ttRgExpanded;
    const list = document.getElementById('ttRgList');
    const btn = document.getElementById('ttRgMore');
    if (list) list.classList.toggle('expanded', ttRgExpanded);
    if (btn) {
        btn.setAttribute('aria-expanded', String(ttRgExpanded));
        btn.innerHTML = ttRgMoreLabel(parseInt(btn.dataset.hidden, 10) || 0);
        /* Beim Einklappen den Knopf im Blick behalten, statt ans Listenende zu springen */
        if (!ttRgExpanded && list) list.scrollIntoView({ block: 'nearest' });
    }
}

/* Auswertung der Zeiterfassung für den gewählten Zeitraum: Summen + Aufschlüsselung nach Stack und Aufgabe */
function renderTimeRangeReport() {
    const logs = ttRangeLogs();
    const cur = getGlobalCurrency();
    const groups = {};
    const taskKeys = new Set(), stackKeys = new Set();
    let totalH = 0, totalC = 0, anyNoRate = false;

    logs.forEach(l => {
        const { task, deleted } = ttTaskOrDeleted(l.taskId);
        const stack = task ? ttStackOrDeleted(task.projectStackId) : null;
        const h = parseFloat(l.hours) || 0;
        const rate = task ? getEffectiveHourlyRate(null, task, stack) : 0;
        const c = h * rate;
        if (rate <= 0 && h > 0) anyNoRate = true;
        const gKey = stack ? stack.id : '_none';
        if (!groups[gKey]) groups[gKey] = { key: gKey, name: stack ? (stack.name || t('unnamed')) : t('standalone_tasks'), isStack: !!stack, hours: 0, cost: 0, tasks: {} };
        const g = groups[gKey];
        const tKey = l.taskId || '_unknown';
        if (!g.tasks[tKey]) g.tasks[tKey] = { id: l.taskId, name: task ? (task.projectName || t('unnamed')) : t('tt_deleted_task'), deleted, done: task ? isTaskDone(task) : false, hours: 0, cost: 0, count: 0, first: l.date, last: l.date };
        const tk = g.tasks[tKey];
        tk.hours += h; tk.cost += c; tk.count++;
        if (l.date < tk.first) tk.first = l.date;
        if (l.date > tk.last) tk.last = l.date;
        g.hours += h; g.cost += c;
        totalH += h; totalC += c;
        taskKeys.add(tKey); if (stack) stackKeys.add(stack.id);
    });

    let html = `<div class="tt-panel tt-report">
        <div class="tt-head">
            <h3 style="margin:0; display:flex; align-items:center; gap:8px;"><i class="fas fa-chart-pie" style="color:var(--primary-color)"></i> ${t('tr_report_title')}</h3>
            <span class="tt-report-range">${ttRangeLabel()}</span>
        </div>`;

    if (logs.length === 0) {
        html += `<div class="tt-empty" style="flex-direction:column; align-items:flex-start; gap:4px;">
            <span><i class="fas fa-circle-info"></i> ${t('tr_empty')}</span>
            <span style="font-size:12px;">${t('tr_empty_hint')}</span>
        </div></div>`;
        return html;
    }

    html += `<div class="tt-kpis">
        ${ttKpi(t('tr_hours'), ttNum(totalH) + ' h', `${logs.length} ${t('tr_bookings')}`, 'var(--primary-color)')}
        ${ttKpi(t('tr_costs'), totalC > 0 ? ttNum(totalC) + ' ' + cur : '–', anyNoRate ? t('tr_partly_no_rate') : t('tr_costs_sub'))}
        ${ttKpi(t('tr_tasks'), String(taskKeys.size), t('tr_tasks_sub'))}
        ${ttKpi(t('tr_stacks'), String(stackKeys.size), t('tr_stacks_sub'))}
    </div>`;

    const sorted = Object.values(groups).sort((a, b) => b.hours - a.hours);
    const hiddenCount = Math.max(0, sorted.length - TT_RG_LIMIT);
    html += `<h4 class="tt-rg-title">${t('tr_by_stack')} <span>(${sorted.length})</span></h4><div class="tt-rg-list${ttRgExpanded ? ' expanded' : ''}" id="ttRgList">`;
    sorted.forEach((g, i) => {
        const share = totalH > 0 ? Math.round(g.hours / totalH * 100) : 0;
        const tasks = Object.values(g.tasks).sort((a, b) => b.hours - a.hours);
        html += `<details class="tt-rg${i >= TT_RG_LIMIT ? ' tt-rg-extra' : ''}">
            <summary>
                <i class="fas ${g.isStack ? 'fa-folder' : 'fa-tasks'} tt-rg-icon"></i>
                <span class="tt-rg-name">${ttEsc(g.name)}<small>${tasks.length} ${tasks.length === 1 ? t('task') : t('tr_tasks')}</small></span>
                <span class="tt-rg-bar" aria-hidden="true"><span style="width:${Math.max(2, share)}%"></span></span>
                <span class="tt-rg-num"><b>${ttNum(g.hours)} h</b>${g.cost > 0 ? `<small>${ttNum(g.cost)} ${cur}</small>` : ''}</span>
                <span class="tt-rg-share">${share}%</span>
            </summary>
            <div class="tt-rg-rows">`;
        tasks.forEach(tk => {
            const openable = tk.id && !tk.deleted;
            const period = tk.first === tk.last ? ttFmtDate(tk.first) : `${ttFmtDate(tk.first)} – ${ttFmtDate(tk.last)}`;
            html += `<div class="tt-rg-row${tk.done ? ' done' : ''}">
                <span class="tt-rg-task">
                    ${openable ? `<button type="button" class="secondary tt-rg-link" onclick="openModal('${tk.id}')">${ttEsc(tk.name)}</button>` : `<span>${ttEsc(tk.name)}</span>`}
                    ${tk.deleted ? `<span class="badge" style="background:var(--danger); color:#fff; font-size:10px; padding:1px 6px;">${t('tr_deleted')}</span>` : ''}
                    <small>${tk.count} ${tk.count === 1 ? t('tr_booking') : t('tr_bookings')} · ${period}</small>
                </span>
                <span class="tt-rg-num"><b>${ttNum(tk.hours)} h</b>${tk.cost > 0 ? `<small>${ttNum(tk.cost)} ${cur}</small>` : ''}</span>
            </div>`;
        });
        html += `</div></details>`;
    });
    html += `</div>`;
    if (hiddenCount > 0) {
        html += `<button type="button" class="secondary tt-rg-more" id="ttRgMore" aria-controls="ttRgList" aria-expanded="${ttRgExpanded}" data-hidden="${hiddenCount}" onclick="ttToggleRgList()">${ttRgMoreLabel(hiddenCount)}</button>`;
    }
    html += `</div>`;
    return html;
}

function switchTimeSubView(view) {
    timeSubView = view;
    if (currentView === 'time') renderTimeTracking(document.getElementById('mainContainer'));
}

/* Positioniert den gelben Magneten der lokalen Linsenschiene (Zeit-Unteransichten) */
function positionTimeLensMagnet() {
    const rail = document.getElementById('ttLensrail');
    if (!rail) return;
    const act = rail.querySelector('.wk-lens[aria-selected="true"]');
    const mag = document.getElementById('ttMagnet');
    if (!act || !mag) return;
    mag.style.width = act.offsetWidth + 'px';
    mag.style.transform = 'translateX(' + (act.offsetLeft - 5) + 'px)';
}

/* Linsenschiene (wk-lensrail) für die Unteransichten von „Zeit" */
function buildTimeSubTabsHtml() {
    const lenses = [
        { v: 'tracking', l: t('view_time'), i: 'fa-stopwatch' },
        { v: 'budgets',  l: t('time_budgets_tab'), i: 'fa-coins' }
    ];
    return `<div class="wk-lensrail" id="ttLensrail" style="margin:0 0 20px;">
        <span class="wk-magnet" id="ttMagnet"></span>
        ${lenses.map(l => `<button class="wk-lens" role="tab" data-ttlens="${l.v}" aria-selected="${timeSubView === l.v}" onclick="switchTimeSubView('${l.v}')"><i class="fas ${l.i}"></i>${l.l}</button>`).join('')}
    </div>`;
}

function renderTimeTracking(c) {
    const subTabsHtml = buildTimeSubTabsHtml();

    if (timeSubView === 'budgets') {
        c.innerHTML = subTabsHtml + buildTimeRangeBarHtml() + `<div id="tt_budgets_container"></div>`;
        renderBudgetsOverview(document.getElementById('tt_budgets_container'));
        requestAnimationFrame(() => { positionTimeLensMagnet(); ttRevealActiveRangeChip(); });
        return;
    }

    let taskOpts = `<option value="">-- ${t('select_task')} --</option>`; 
    appData.tasks.filter(t_obj => !isTaskDone(t_obj)).forEach(t_obj => { taskOpts += `<option value="${t_obj.id}">${t_obj.isPaused ? '⏸ ' : ''}${t_obj.projectName}</option>`; });
    
    const today = new Date().toISOString().split('T')[0]; 
    
    const getTaskOrDeleted = (taskId) => {
        let task = appData.tasks.find(x => x.id === taskId);
        if (task) return { task, deleted: false };
        let delItem = appData.deletedItems.find(x => x.type === 'task' && x.data.id === taskId);
        if (delItem) return { task: delItem.data, deleted: true };
        return { task: null, deleted: true };
    };

    const sortedLogs = ttRangeLogs().sort((a,b) => new Date(b.date) - new Date(a.date));
    const sortedLogsTotal = sortedLogs.reduce((sum, l) => sum + (parseFloat(l.hours) || 0), 0);

    let html = subTabsHtml + buildTimeRangeBarHtml() + renderTimeRangeReport() + `
    <div id="tt_account_panel">${renderTimeAccount()}</div>
    <div style="display:flex; gap:20px; flex-wrap:wrap; align-items:flex-start;">
        <div style="flex:1; min-width:300px; display:flex; flex-direction:column; gap:20px;">
            <div style="background:var(--surface-color); padding:20px; border-radius:var(--radius); border:1px solid var(--border-color); border-radius:var(--radius);">
                <h3 style="margin-bottom:15px; color:var(--text-main);"><i class="fas fa-stopwatch" style="color:var(--primary-color)"></i> Live-Timer (Pro Aufgabe)</h3>
                <div style="display:flex; gap:10px; margin-bottom:15px;"><select id="new_timer_task" style="flex:1">${taskOpts}</select><button onclick="addTimer()"><i class="fas fa-plus"></i></button></div>
                <div id="timers_container" style="display:flex; flex-direction:column; gap:10px;">`;
    for(let id in activeTimers) {
        const timer = activeTimers[id]; 
        const { task } = getTaskOrDeleted(id);
        const taskName = task ? task.projectName : 'Unbekannt';
        const isPaused = task && task.isPaused && !isTaskDone(task); const pausedIcon = isPaused ? '<i class="fas fa-pause" style="color:var(--warning); margin-right:4px;" title="Pausiert"></i>' : '';
        let ms = timer.accum; if(timer.running) ms += Date.now() - timer.start; let s = Math.floor(ms / 1000); let m = Math.floor(s / 60); let h = Math.floor(m / 60);
        let timeStr = [h, m%60, s%60].map(v => v.toString().padStart(2, '0')).join(':');
        let playBtn = timer.running ? 'color:var(--primary-color)' : ''; let pauseBtn = !timer.running && timer.accum > 0 ? 'color:var(--primary-color)' : '';
        html += `<div style="display:flex; align-items:center; gap: 10px; background: var(--bg-color); padding: 10px; border-radius: var(--radius); border:1px solid var(--border-color); flex-wrap:wrap;">
            <div style="flex:1; min-width:100%; font-weight:bold; font-size:14px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; margin-bottom:5px;" title="${taskName}">${pausedIcon}${taskName}</div>
            <input type="text" id="timer_note_${id}" value="${timer.note}" placeholder="Notiz..." style="flex:1; min-width:100px; margin:0; padding:6px; font-size:12px;" onchange="updateTimerNote('${id}', this.value)">
            <div id="timer_display_${id}" style="font-size: 18px; font-family: monospace; font-weight: bold; width: 85px; text-align:center;">${timeStr}</div>
            <div style="display:flex; gap:5px;">
                <button class="secondary icon-btn" style="font-size:14px; width:44px; height:44px; ${playBtn}" onclick="startTimer('${id}')"><i class="fas fa-play"></i></button>
                <button class="secondary icon-btn" style="font-size:14px; width:44px; height:44px; ${pauseBtn}" onclick="pauseTimer('${id}')"><i class="fas fa-pause"></i></button>
                <button class="secondary icon-btn" style="font-size:14px; width:44px; height:44px; color:var(--danger); border-color:var(--danger);" onclick="stopTimer('${id}')" title="Stoppen"><i class="fas fa-stop"></i></button>
            </div>
        </div>`;
    }
    if(Object.keys(activeTimers).length === 0) html += `<div style="font-size:12px; color:var(--text-muted)">Keine aktiven Timer.</div>`;
    html += `   </div><p style="font-size:11px; color:var(--text-muted); margin-top:15px;">${t('timer_hint')}</p></div>
            <div id="tt_manual_box" style="background:var(--surface-color); padding:20px; border-radius:var(--radius); border:1px solid var(--border-color);">
                <h3 style="margin-bottom:15px;">${t('time_manual')}</h3>
                <label>${t('task')}</label><select id="tt_task">${taskOpts}</select>
                <div style="display:flex; gap:10px;"><div style="flex:1"><label>${t('date')}</label><input type="date" id="tt_date" value="${today}"></div><div style="flex:1"><label>${t('hours')}</label><input type="number" id="tt_hours" step="0.25" min="0.25" value="0.25"></div></div>
                <label>${t('note_opt')}</label><input type="text" id="tt_note" placeholder="${t('what_done')}">
                <button style="margin-top:15px; width:100%; justify-content:center;" onclick="addManualTimeLog()"><i class="fas fa-save"></i> ${t('log_time')}</button>
            </div>
        </div>
        <div style="background:var(--surface-color); padding:20px; border-radius:var(--radius); border:1px solid var(--border-color); flex:2; min-width:300px; max-height:calc(100vh - 120px); overflow-y:auto;">
            <h3 style="margin-bottom:4px;">${t('booking_history')} <span style="font-weight:normal; color:var(--text-muted); font-size:13px;">(${sortedLogs.length})</span></h3>
            <div style="font-size:12px; color:var(--text-muted); margin-bottom:12px;"><i class="fas fa-calendar-days"></i> ${ttRangeLabel()} · ${t('tr_total')}: <b style="color:var(--text-main);">${ttNum(sortedLogsTotal)} h</b></div>
            <div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>${t('date')}</th><th>${t('task')}</th><th>${t('duration')}</th><th>Notiz</th><th width="80"></th></tr></thead><tbody>`;
    if(sortedLogs.length === 0) html += `<tr><td colspan="5">${ttRangeActive() ? t('tr_empty') : 'Keine Einträge.'}</td></tr>`;
    sortedLogs.forEach((log) => {
        const { task, deleted } = getTaskOrDeleted(log.taskId);
        const isPaused = task && task.isPaused && !isTaskDone(task); 
        const pausedIcon = isPaused && !deleted ? '<i class="fas fa-pause" style="color:var(--warning); margin-right:4px;" title="Pausiert"></i>' : '';
        const taskName = task ? task.projectName : 'Unbekannt';
        const deletedPill = deleted ? `<span class="badge" style="background:var(--danger); color:white; font-size:10px; margin-left:8px; padding: 2px 6px;">Gelöscht</span>` : '';
        
        html += `<tr><td data-label="Datum">${log.date}</td><td data-label="Aufgabe"><b>${pausedIcon}${taskName}${deletedPill}</b></td><td data-label="Dauer"><span class="badge" style="background:rgba(0,0,0,0.05); color:var(--text-main); font-size:12px;">${parseFloat(log.hours).toFixed(2)}h</span></td><td data-label="Notiz">${log.note || '-'}</td><td style="flex-direction:row;"><button class="secondary icon-btn" onclick="openEditTimeLog('${log.id}')"><i class="fas fa-pen"></i></button> <button class="secondary icon-btn" style="color:var(--danger);" onclick="deleteTimeLog('${log.id}')"><i class="fas fa-trash"></i></button></td></tr>`;
    });
    html += `</tbody></table></div></div></div>`;
    c.innerHTML = html; updateTimerDisplays(); requestAnimationFrame(() => { positionTimeLensMagnet(); ttRevealActiveRangeChip(); });
}

function addManualTimeLog() {
    const taskId = document.getElementById('tt_task').value; const hours = parseFloat(document.getElementById('tt_hours').value); const date = document.getElementById('tt_date').value; const note = document.getElementById('tt_note').value.trim();
    if(!taskId || !hours || !date) return showToast('Bitte Aufgabe, Datum und Stunden ausfüllen.', 'error');
    
    appData.timeLogs.push({ id: generateId(), taskId, hours, date, note });
    { const _tk = appData.tasks.find(x => x.id === taskId); logActivity('fa-stopwatch', t('act_time_booked').replace('{h}', ttNum(hours)).replace('{n}', _tk ? _tk.projectName : '')); }
    const task = appData.tasks.find(t_obj => t_obj.id === taskId);
    if(task) { 
        task.spentTime = (parseFloat(task.spentTime || 0) + hours).toFixed(2); 
        const logText = `[Zeiterfassung am ${date} | ${hours}h] ${note}`.trim(); 
        task.notes = task.notes ? task.notes + '\n' + logText : logText; 
    }
    saveToLocal(true); showToast(t('toast_saved'));
    
    if (currentView === 'time') {
        renderTimeTracking(document.getElementById('mainContainer'));
    }
}

function openEditTimeLog(id) {
    const log = appData.timeLogs.find(l => l.id === id); if(!log) return;
    document.getElementById('et_id').value = log.id; 
    let taskOpts = `<option value="">-- ${t('select_task')} --</option>`; 
    appData.tasks.filter(t_obj => !isTaskDone(t_obj) || t_obj.id === log.taskId).forEach(t_obj => { taskOpts += `<option value="${t_obj.id}">${t_obj.projectName}</option>`; });
    document.getElementById('et_task').innerHTML = taskOpts; document.getElementById('et_task').value = log.taskId || ''; document.getElementById('et_date').value = log.date; document.getElementById('et_hours').value = log.hours; document.getElementById('et_note').value = log.note || ''; document.getElementById('editTimeModal').classList.add('active');
}

function closeEditTimeModal() { document.getElementById('editTimeModal').classList.remove('active'); }

function saveEditedTimeLog() {
    const id = document.getElementById('et_id').value; const log = appData.timeLogs.find(l => l.id === id); if(!log) return;
    const oldTaskId = log.taskId; const oldHours = log.hours; const newTaskId = document.getElementById('et_task').value; const newHours = parseFloat(document.getElementById('et_hours').value) || 0; const newDate = document.getElementById('et_date').value; const newNote = document.getElementById('et_note').value;
    if (oldTaskId) { const oldTask = appData.tasks.find(t_obj => t_obj.id === oldTaskId); if (oldTask) oldTask.spentTime = Math.max(0, (parseFloat(oldTask.spentTime || 0) - oldHours)).toFixed(2); }
    if (newTaskId) { const newTask = appData.tasks.find(t_obj => t_obj.id === newTaskId); if (newTask) newTask.spentTime = (parseFloat(newTask.spentTime || 0) + newHours).toFixed(2); }
    log.taskId = newTaskId; log.hours = newHours; log.date = newDate; log.note = newNote;
    saveToLocal(true); closeEditTimeModal(); showToast(t('toast_saved'));
    
    if (currentView === 'time') {
        renderTimeTracking(document.getElementById('mainContainer'));
    }
}

function deleteTimeLog(id) {
    if(!confirm(t('delete') + "? Die Ist-Zeit der zugehörigen Aufgabe wird entsprechend zurückgerechnet.")) return;
    const log = appData.timeLogs.find(l => l.id === id);
    if(log && log.taskId) { const t_obj = appData.tasks.find(x => x.id === log.taskId); if(t_obj) t_obj.spentTime = Math.max(0, parseFloat(t_obj.spentTime || 0) - log.hours).toFixed(2); }
    appData.timeLogs = appData.timeLogs.filter(l => l.id !== id); saveToLocal(true); showToast(t('toast_deleted'));
    
    if (currentView === 'time') {
        renderTimeTracking(document.getElementById('mainContainer'));
    }
}

// --- 10. EXPORT / IMPORT / TEILEN ---
function buildSharePackage(tasksToShare, stacksToShare) {
    let shareData = { isshared: true, tasks: [], stacks: [], users: [], stakeholders: [], buckets: [], statuses: [] };
    let uIds = new Set(), shIds = new Set(), buckets = new Set(), stackIds = new Set(), statusIds = new Set();

    const addTaskDependencies = (t_obj) => {
        if(t_obj.assigneeId) uIds.add(t_obj.assigneeId); if(t_obj.stakeholderId) shIds.add(t_obj.stakeholderId); if(t_obj.bucket) buckets.add(t_obj.bucket); if(t_obj.status) statusIds.add(t_obj.status); if(t_obj.projectStackId) stackIds.add(t_obj.projectStackId);
        if(t_obj.checklist) t_obj.checklist.forEach(c => { if(c.assigneeId) uIds.add(c.assigneeId); }); shareData.tasks.push(t_obj);
    };

    const addStackDependencies = (s) => {
        if(s.assigneeId) uIds.add(s.assigneeId); if(s.stakeholderId) shIds.add(s.stakeholderId); if(s.bucket) buckets.add(s.bucket);
        if(s.checklist) s.checklist.forEach(c => { if(c.assigneeId) uIds.add(c.assigneeId); });
        if(!shareData.stacks.find(ex => ex.id === s.id)) shareData.stacks.push(s);
    };

    tasksToShare.forEach(addTaskDependencies); stacksToShare.forEach(addStackDependencies);
    stackIds.forEach(id => { if(!shareData.stacks.find(s => s.id === id)) { const found = appData.projectStacks.find(s => s.id === id); if(found) addStackDependencies(found); } });
    uIds.forEach(id => { const u = appData.users.find(user => user.id === id); if(u) shareData.users.push(u); });
    shIds.forEach(id => { const sh = appData.stakeholders.find(s => s.id === id); if(sh) shareData.stakeholders.push(sh); });
    statusIds.forEach(id => { const st = appData.statuses.find(s => s.id === id); if(st) shareData.statuses.push(st); });
    buckets.forEach(b => shareData.buckets.push(b));
    shareData.tasks.forEach(t_obj => { if(t_obj.files) t_obj.files.forEach(f => { if(f.type === 'blob') { f.type = 'missing-blob'; delete f.data; } }); });

    return shareData;
}

function triggerDownloadJSON(obj, filename) {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(obj, null, 2)); 
    const dlAnchorElem = document.createElement('a'); dlAnchorElem.setAttribute("href", dataStr); dlAnchorElem.setAttribute("download", filename); dlAnchorElem.click(); 
}

function exportSharedData(tasksToShare, stacksToShare, filename = "proman_shared.json") {
    const shareData = buildSharePackage(tasksToShare, stacksToShare); triggerDownloadJSON(shareData, filename); showToast('Paket erstellt und wird heruntergeladen.');
}

function exportSingleTaskJSON() {
    const id = document.getElementById('taskId').value; const task = appData.tasks.find(t_obj => t_obj.id === id);
    if(task) exportSharedData([task], [], `proman_task_${task.projectName.replace(/\s+/g, '_')}.json`);
}

function exportSingleStackJSON() {
    const id = document.getElementById('s_id').value; const stack = appData.projectStacks.find(s => s.id === id);
    if(stack) exportSharedData([], [stack], `proman_stack_${stack.name.replace(/\s+/g, '_')}.json`);
}

function stripObsoleteThemeData(obj) {
    /* Nicht mehr genutzte Theme-Informationen aus Backups entfernen */
    if (!obj || typeof obj !== 'object') return obj;
    delete obj.customTheme; delete obj.dark; delete obj.glass; delete obj.theme; delete obj.customThemeVars;
    if (obj.settings && typeof obj.settings === 'object') {
        delete obj.settings.customTheme; delete obj.settings.dark; delete obj.settings.glass;
        delete obj.settings.theme; delete obj.settings.glassTheme;
    }
    return obj;
}

function exportJSON() { 
    let exportData = JSON.parse(JSON.stringify(appData));
    stripObsoleteThemeData(exportData);
    exportData.tasks.forEach(t_obj => { if(t_obj.files) t_obj.files.forEach(f => { if(f.type === 'blob') { f.type = 'missing-blob'; delete f.data; } }); });
    triggerDownloadJSON(exportData, "proman_backup.json");
}

function importJSON(event) { 
    const file = event.target.files[0]; if (!file) return; 
    const reader = new FileReader(); 
    reader.onload = function(e) { 
        try { 
            const imported = JSON.parse(e.target.result); 
            if (imported.isshared) {
                if(imported.users) { imported.users.forEach(iu => { let exUser = appData.users.find(u => u.id === iu.id); if(!exUser) appData.users.push(iu); else { exUser.name = iu.name; exUser.avatar = iu.avatar; } }); }
                if(imported.stakeholders) { imported.stakeholders.forEach(ish => { if(!appData.stakeholders.find(sh => sh.id === ish.id)) appData.stakeholders.push(ish); }); }
                if(imported.statuses) { imported.statuses.forEach(ist => { if(!appData.statuses.find(st => st.id === ist.id)) appData.statuses.push(ist); }); }
                if(imported.buckets) { imported.buckets.forEach(ib => { if(!appData.buckets.includes(ib)) appData.buckets.push(ib); }); }
                let mergedStacks = 0;
                if(imported.stacks) { imported.stacks.forEach(is => { const idx = appData.projectStacks.findIndex(s => s.id === is.id); if(idx > -1) appData.projectStacks[idx] = is; else appData.projectStacks.push(is); mergedStacks++; }); }
                let mergedTasks = 0;
                if(imported.tasks) { imported.tasks.forEach(it => { const idx = appData.tasks.findIndex(t_obj => t_obj.id === it.id); if(idx > -1) appData.tasks[idx] = it; else appData.tasks.push(it); mergedTasks++; }); }
                saveToLocal(true); showToast(`Geteilte Daten importiert: ${mergedTasks} Aufgaben, ${mergedStacks} Stacks aktualisiert.`); setTimeout(() => window.location.reload(), 1000);
            } else if(imported.tasks) { 
                stripObsoleteThemeData(imported);
                appData = imported; 
                if(!appData.settings.views) { appData.settings.views = [...defaultViews]; }
                if(!appData.settings.noteOrder) appData.settings.noteOrder = [];
                if(!appData.timeLogs) appData.timeLogs=[]; 
                saveToLocal(true); showToast('Voll-Backup erfolgreich importiert!'); setTimeout(() => window.location.reload(), 1000);
            } 
        } catch(err) { showToast('Fehler beim Lesen der JSON.', 'error'); } 
    }; 
    reader.readAsText(file); event.target.value = '';
}

/* Brandingkopf für Excel-Exporte: Firmenname/Titel oberhalb der Tabelle.
   (Bilder kann die eingesetzte Excel-Bibliothek nicht einbetten – das Logo
    erscheint deshalb in PDF und Word, hier stattdessen die Textkennung.) */
function xlsxAddBrandHeader(worksheet, title) {
    try {
        const company = (appData.settings && appData.settings.companyName) ? appData.settings.companyName : '';
        const line = [company ? company + ' – ' + title : title];
        XLSX.utils.sheet_add_aoa(worksheet, [line, [new Date().toLocaleDateString('de-DE')], []], { origin: 'A1' });
    } catch (e) { console.warn('Excel-Kopf konnte nicht gesetzt werden', e); }
    return worksheet;
}

function exportExcel() {
    if(typeof XLSX === 'undefined') return showToast('Excel Bibliothek lädt noch.', 'error');
    const wsData = getFilteredTasks().map(t_obj => {
        const sh = appData.stakeholders.find(s => s.id === t_obj.stakeholderId); const st = appData.statuses.find(s => s.id === t_obj.status); const stack = appData.projectStacks.find(ps => ps.id === t_obj.projectStackId); const plainDesc = t_obj.description ? t_obj.description.replace(/<[^>]*>?/gm, '') : '';
        return { Projekt_Stack: stack ? stack.name : '-', Aufgabenname: t_obj.projectName, Stakeholder: sh ? sh.name : '-', Kategorie: t_obj.bucket, Status: st ? st.title : '-', Priorität: t_obj.priority, Start: t_obj.startDate, Fälligkeit: t_obj.dueDate, Aufwand_Geschätzt: t_obj.estimatedTime, Aufwand_Bisher: t_obj.spentTime, Notizen: plainDesc };
    });
    const worksheet = XLSX.utils.json_to_sheet(wsData, { origin: "A4" }); xlsxAddBrandHeader(worksheet, "Aufgaben"); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Aufgaben"); XLSX.writeFile(workbook, "Projekte.xlsx");
}

function exportSingleTaskExcel() {
    if(typeof XLSX === 'undefined') return showToast('Excel Bibliothek lädt noch.', 'error');
    const id = document.getElementById('taskId').value; const t_obj = appData.tasks.find(x => x.id === id); if(!t_obj) return;
    const sh = appData.stakeholders.find(s => s.id === t_obj.stakeholderId); const st = appData.statuses.find(s => s.id === t_obj.status); const stack = appData.projectStacks.find(ps => ps.id === t_obj.projectStackId); const plainDesc = t_obj.description ? t_obj.description.replace(/<[^>]*>?/gm, '') : '';
    const wsData = [{ Projekt_Stack: stack ? stack.name : '-', Aufgabenname: t_obj.projectName, Stakeholder: sh ? sh.name : '-', Kategorie: t_obj.bucket, Status: st ? st.title : '-', Priorität: t_obj.priority, Start: t_obj.startDate, Fälligkeit: t_obj.dueDate, Aufwand_Geschätzt: t_obj.estimatedTime, Aufwand_Bisher: t_obj.spentTime, Notizen: plainDesc }];
    const worksheet = XLSX.utils.json_to_sheet(wsData, { origin: "A4" }); xlsxAddBrandHeader(worksheet, t_obj.projectName || "Aufgabe"); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Aufgabe"); XLSX.writeFile(workbook, `Aufgabe_${t_obj.projectName.replace(/\s+/g, '_')}.xlsx`);
}

function exportSingleStackExcel() {
    if(typeof XLSX === 'undefined') return showToast('Excel Bibliothek lädt noch.', 'error');
    const id = document.getElementById('s_id').value; const stack = appData.projectStacks.find(s => s.id === id); if(!stack) return;
    const tasks = appData.tasks.filter(t_obj => t_obj.projectStackId === id);
    const wsData = tasks.map(t_obj => {
        const sh = appData.stakeholders.find(s => s.id === t_obj.stakeholderId); const st = appData.statuses.find(s => s.id === t_obj.status);
        return { Aufgabenname: t_obj.projectName, Stakeholder: sh ? sh.name : '-', Kategorie: t_obj.bucket, Status: st ? st.title : '-', Priorität: t_obj.priority, Start: t_obj.startDate, Fälligkeit: t_obj.dueDate, Aufwand_Geschätzt: t_obj.estimatedTime, Aufwand_Bisher: t_obj.spentTime };
    });
    if(wsData.length === 0) wsData.push({ Notiz: 'Keine Aufgaben in diesem Stack vorhanden.' });
    const worksheet = XLSX.utils.json_to_sheet(wsData, { origin: "A4" }); xlsxAddBrandHeader(worksheet, stack.name || "Stack"); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, stack.name.substring(0, 31)); XLSX.writeFile(workbook, `Stack_${stack.name.replace(/\s+/g, '_')}.xlsx`);
}

function exportTimeExcel() {
    if(typeof XLSX === 'undefined') return showToast('Excel Bibliothek lädt noch.', 'error');
    const wsData = ttRangeLogs().slice().sort((a,b) => String(a.date).localeCompare(String(b.date))).map(log => {
        let task = appData.tasks.find(x => x.id === log.taskId);
        let deleted = false;
        if(!task) {
            let delItem = appData.deletedItems.find(x => x.type === 'task' && x.data.id === log.taskId);
            if(delItem) { task = delItem.data; deleted = true; }
        }
        const tName = task ? task.projectName + (deleted ? ' (Gelöscht)' : '') : 'Unbekannt';
        return { Datum: log.date, Aufgabe: tName, Stunden: log.hours, Notiz: log.note };
    });
    const worksheet = XLSX.utils.json_to_sheet(wsData); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Zeiterfassung");
    const absData = (appData.absences || []).filter(a => ttInRange(a.date)).slice().sort((a,b) => a.date.localeCompare(b.date)).map(a => ({ Datum: a.date, Art: ttAbsLabel(a.type), Stunden: a.hours, Notiz: a.note || '' }));
    if(absData.length > 0) { const wsAbs = XLSX.utils.json_to_sheet(absData); XLSX.utils.book_append_sheet(workbook, wsAbs, "Abwesenheiten"); }
    const _rb = ttRangeBounds();
    XLSX.writeFile(workbook, (_rb.from || _rb.to) ? `Zeiterfassung_${_rb.from || 'start'}_${_rb.to || 'heute'}.xlsx` : "Zeiterfassung.xlsx");
}

function generateRichTextReport() {
    const viewObj = appData.settings.views.find(v => v.id === currentView); const viewName = viewObj ? viewObj.name : 'Export'; 
    const tasks = getFilteredTasks(); const stacks = getFilteredStacks();
    let html = `<div style="font-family: Helvetica, Arial, sans-serif; color: #333;"><h1 style="color: ${appData.customColor}; border-bottom: 2px solid ${appData.customColor}; padding-bottom: 5px; font-family: Helvetica, Arial, sans-serif;">ProMan Export: ${viewName}</h1><p style="font-family: Helvetica, Arial, sans-serif;"><em>Erstellt am: ${new Date().toLocaleDateString('de-DE')}</em></p><br/>`;
    
    if(currentView === 'time') {
        html += `<p style="font-family: Helvetica, Arial, sans-serif;"><b>${t('tr_title')}:</b> ${ttRangeLabel()}</p>`;
        html += `<table style="width: 100%; border-collapse: collapse; font-family: Helvetica, Arial, sans-serif;" border="1" cellpadding="5"><tr style="background-color: #e5e7eb;"><th>Datum</th><th>Aufgabe</th><th>Dauer (h)</th><th>Notiz</th></tr>`;
        ttRangeLogs().forEach(log => { 
            let task = appData.tasks.find(x => x.id === log.taskId);
            let deleted = false;
            if(!task) {
                let delItem = appData.deletedItems.find(x => x.type === 'task' && x.data.id === log.taskId);
                if(delItem) { task = delItem.data; deleted = true; }
            }
            const tName = task ? task.projectName : 'Unbekannt';
            const delTag = deleted ? ' <span style="color:red; font-size:10px;">(Gelöscht)</span>' : '';
            html += `<tr><td>${log.date}</td><td><b>${tName}${delTag}</b></td><td>${log.hours}</td><td>${log.note||'-'}</td></tr>`; 
        });
        html += `</table>`;
    } else if(currentView === 'stacks' || currentView === 'list' || currentView === 'notes') {
        stacks.forEach(stack => {
            const sp = getStackProgress(stack.id);
            html += `<div style="margin-bottom: 20px; font-family: Helvetica, Arial, sans-serif;"><h2 style="background-color: #f3f4f6; padding: 10px; border-left: 5px solid ${appData.customColor}; margin-bottom: 5px; font-family: Helvetica, Arial, sans-serif;">📁 Stack: ${stack.name}</h2><ul style="list-style-type: none; padding-left: 0; font-family: Helvetica, Arial, sans-serif;"><li><b>Start:</b> ${stack.startDate||'-'} | <b>Deadline:</b> ${stack.dueDate||'-'}</li><li><b>Fortschritt:</b> Aufgaben (${sp.tPct}%) / Milestones (${sp.mPct}%)</li></ul>${stack.notes ? `<div style="font-family: Helvetica, Arial, sans-serif; margin-bottom:10px;">${stack.notes}</div>` : ''}`;
            const sTasks = tasks.filter(t_obj => t_obj.projectStackId === stack.id);
            if(sTasks.length > 0) {
                html += `<table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-family: Helvetica, Arial, sans-serif;" border="1" cellpadding="5"><tr style="background-color: #e5e7eb;"><th>Aufgabe</th><th>Stakeholder</th><th>Status</th><th>Fälligkeit</th><th>Fortschritt</th></tr>`;
                sTasks.forEach(t_obj => { const st = appData.statuses.find(s => s.id === t_obj.status); const sh = appData.stakeholders.find(s => s.id === t_obj.stakeholderId); html += `<tr><td><b>${t_obj.projectName}</b></td><td>${sh ? sh.name : '-'}</td><td>${st ? st.title : '-'}</td><td>${t_obj.dueDate||'-'}</td><td>${getTaskProgress(t_obj)}%</td></tr>`; });
                html += `</table>`;
            }
            html += `</div><hr style="border:0; border-top:1px solid #ccc;" />`;
        });
        const standalone = tasks.filter(t_obj => !t_obj.projectStackId);
        if(standalone.length > 0) {
            html += `<h2 style="padding: 10px; margin-bottom: 5px; font-family: Helvetica, Arial, sans-serif;">📄 Einzelaufgaben</h2><table style="width: 100%; border-collapse: collapse; font-family: Helvetica, Arial, sans-serif;" border="1" cellpadding="5"><tr style="background-color: #e5e7eb;"><th>Aufgabe</th><th>Status</th><th>Fälligkeit</th><th>Fortschritt</th></tr>`;
            standalone.forEach(t_obj => { const st = appData.statuses.find(s => s.id === t_obj.status); html += `<tr><td><b>${t_obj.projectName}</b></td><td>${st ? st.title : '-'}</td><td>${t_obj.dueDate||'-'}</td><td>${getTaskProgress(t_obj)}%</td></tr>`; }); html += `</table>`;
            if(currentView === 'notes') { standalone.forEach(t_obj => { if(t_obj.description) { html += `<div style="margin-top:15px;"><h4>Notizen zu: ${t_obj.projectName}</h4><div>${t_obj.description}</div></div>`; } }); }
        }
    } else if (currentView === 'kanban') {
        appData.statuses.forEach(status => {
            const sTasks = tasks.filter(t_obj => t_obj.status === status.id);
            if(sTasks.length > 0) {
                html += `<h2 style="color: ${appData.customColor}; border-bottom: 1px solid #ccc; font-family: Helvetica, Arial, sans-serif;">${status.title} (${sTasks.length})</h2><ul style="font-family: Helvetica, Arial, sans-serif;">`;
                sTasks.forEach(t_obj => { const sh = appData.stakeholders.find(s => s.id === t_obj.stakeholderId); html += `<li style="margin-bottom:10px;"><b>${t_obj.projectName}</b> <span style="color: #666; font-size:12px;">(Fällig: ${t_obj.dueDate||'-'} | Prio: ${t_obj.priority})</span><br/>Stakeholder: ${sh?sh.name:'-'} | Fortschritt: ${getTaskProgress(t_obj)}%</li>`; }); html += `</ul>`;
            }
        });
    } else {
        html += `<table style="width: 100%; border-collapse: collapse; font-family: Helvetica, Arial, sans-serif;" border="1" cellpadding="5"><tr style="background-color: #e5e7eb;"><th>Projekt/Stack</th><th>Aufgabe</th><th>Status</th><th>Fälligkeit</th></tr>`;
        tasks.forEach(t_obj => { const st = appData.statuses.find(s => s.id === t_obj.status); const stack = appData.projectStacks.find(ps => ps.id === t_obj.projectStackId); html += `<tr><td>${stack?stack.name:'Einzelaufgabe'}</td><td><b>${t_obj.projectName}</b></td><td>${st ? st.title : '-'}</td><td>${t_obj.dueDate||'-'}</td></tr>`; }); html += `</table>`;
    }
    return html + `</div>`;
}

/* Baut einen Anhang-Abschnitt mit Screenshots für den Word-Export. */
async function buildAttachmentsHtmlForWord(tasks) {
    let anyShots = '';
    for (const task of tasks) {
        const shots = await captureTaskAttachments(task);
        if (!shots.length) continue;
        anyShots += `<h3 style="font-family:Helvetica,Arial,sans-serif; margin-top:18px;">${escapeHtmlToday(task.projectName || 'Aufgabe')}</h3>`;
        shots.forEach(s => {
            anyShots += `<div style="margin-bottom:14px;"><div style="font-size:11px; color:#666; font-family:Helvetica,Arial,sans-serif; margin-bottom:4px;">${escapeHtmlToday(s.label)}</div><img src="${s.dataUrl}" style="max-width:640px; border:1px solid #ccc;" /></div>`;
        });
    }
    if (!anyShots) return '';
    return `<h2 style="font-family:Helvetica,Arial,sans-serif; font-size:15pt; border-bottom:1.5pt solid #cccccc; padding-bottom:4pt; margin-top:26pt;">${t('pdfx_section_title')}</h2>${anyShots}`;
}

/* ── Bausteine für ein professionelles Word-Layout ───────────── */
function wordAccent() { return (appData.customColor || '#0070f2'); }

/* Farbige Pill wie in der Webapp – als Tabelle, damit Word sie zuverlässig rendert */
function wordPill(text, color) {
    const c = color || '#6e7681';
    return `<span style="border:0.75pt solid ${c}; color:${c}; padding:1pt 6pt; font-size:8.5pt; font-weight:bold; white-space:nowrap;">${escapeHtmlToday(text || '-')}</span>`;
}

function wordMetaTable(rows) {
    let h = `<table cellspacing="0" cellpadding="0" style="width:100%; border-collapse:collapse; margin:6pt 0 10pt 0; font-family:Helvetica,Arial,sans-serif;">`;
    rows.forEach(r => {
        h += `<tr>
            <td style="width:28%; padding:3pt 8pt 3pt 0; font-size:8.5pt; color:#6e7681; text-transform:uppercase; vertical-align:top;">${escapeHtmlToday(r[0])}</td>
            <td style="padding:3pt 0; font-size:10pt; color:#22262b; vertical-align:top;">${r[2] ? r[1] : escapeHtmlToday(r[1] || '-')}</td>
        </tr>`;
    });
    return h + `</table>`;
}

function wordSection(title) {
    return `<div style="font-family:Helvetica,Arial,sans-serif; font-size:9.5pt; font-weight:bold; color:#22262b; text-transform:uppercase; letter-spacing:0.4pt; margin:12pt 0 4pt 0;">${escapeHtmlToday(title)}</div>`;
}

/* Checklistenpunkte / Milestones als saubere Liste mit Status und Zeitangaben */
function wordChecklist(items) {
    if (!items || !items.length) return '';
    let h = `<table cellspacing="0" cellpadding="0" style="width:100%; border-collapse:collapse; font-family:Helvetica,Arial,sans-serif; margin-bottom:4pt;">`;
    items.forEach(ci => {
        const meta = (typeof pdfChecklistMeta === 'function') ? pdfChecklistMeta(ci) : '';
        const done = !!ci.done;
        h += `<tr>
            <td style="width:14pt; padding:2pt 0; font-size:10pt; vertical-align:top; color:${done ? wordAccent() : '#9aa0a6'};">${done ? '&#9745;' : '&#9744;'}</td>
            <td style="padding:2pt 6pt 2pt 0; font-size:10pt; vertical-align:top; color:${done ? '#6e7681' : '#22262b'};">${escapeHtmlToday(ci.title || '')}</td>
            <td style="padding:2pt 0; font-size:8.5pt; color:#6e7681; text-align:right; white-space:nowrap; vertical-align:top;">${escapeHtmlToday(meta)}</td>
        </tr>`;
    });
    return h + `</table>`;
}

function wordFilesList(files) {
    if (!files || !files.length) return '';
    let h = `<table cellspacing="0" cellpadding="0" style="width:100%; border-collapse:collapse; font-family:Helvetica,Arial,sans-serif;">`;
    files.forEach(f => {
        const name = f.type === 'blob' ? f.name : f.path;
        h += `<tr><td style="padding:2pt 0; font-size:9.5pt; color:#22262b;">&#8226; ${escapeHtmlToday(name || '')}</td></tr>`;
    });
    return h + `</table>`;
}

/* Kopfblock eines Projekt-Stacks: Eckdaten, Notizen und Milestones */
function wordStackBlock(stack) {
    const accent = wordAccent();
    const fmt = (iso) => (typeof pdfFormatDateTime === 'function') ? pdfFormatDateTime(iso) : (iso || '-');
    const assignee = (appData.users.find(u => u.id === stack.assigneeId) || {}).name || '-';
    let shName = '-';
    if (stack.stakeholderId) { const sh = appData.stakeholders.find(x => x.id === stack.stakeholderId); if (sh) shName = sh.name; }

    let h = `<div style="border-left:3pt solid ${accent}; padding-left:10pt; margin:0 0 18pt 0;">`;
    h += `<div style="font-family:Helvetica,Arial,sans-serif; font-size:9pt; color:#6e7681; text-transform:uppercase; letter-spacing:0.4pt;">Projekt-Stack</div>`;
    h += `<div style="font-family:Helvetica,Arial,sans-serif; font-size:13pt; font-weight:bold; color:#22262b;">${escapeHtmlToday(stack.name || '-')}</div>`;
    h += wordMetaTable([
        ['Stakeholder', shName],
        ['Zuständig', assignee],
        ['Start', fmt(stack.startDate)],
        ['Ziel', fmt(stack.dueDate)],
        ['Aufgaben', String(appData.tasks.filter(x => x.projectStackId === stack.id).length)]
    ]);
    if (stack.notes && String(stack.notes).trim() && stack.notes !== '<br>') {
        h += wordSection(t('sec_notes'));
        h += `<div style="font-family:Helvetica,Arial,sans-serif; font-size:10pt; color:#22262b;">${stack.notes}</div>`;
    }
    if (stack.checklist && stack.checklist.length) {
        h += wordSection('Milestones');
        h += wordChecklist(stack.checklist);
    }
    return h + `</div>`;
}

/* Eine vollständige Aufgabenkarte inkl. Notizen, Checkliste, Dateien und Historie */
function wordTaskBlock(task) {
    const accent = wordAccent();
    let shName = '-', shColor = accent;
    if (task.stakeholderId) {
        const sh = appData.stakeholders.find(s => s.id === task.stakeholderId);
        if (sh) { shName = sh.name; shColor = sh.color || accent; }
    }
    const st = appData.statuses.find(s => s.id === task.status);
    const statusLabel = st ? (st.id === 'done' ? t('col_completed') : st.title) : '-';
    const statusColor = (typeof getStatusColor === 'function') ? getStatusColor(st) : accent;
    const bucketColor = task.bucket && typeof getBucketColor === 'function' ? getBucketColor(task.bucket) : '#6e7681';
    const PRIO = { high: '#d9342b', medium: '#e8a317', low: '#1f9463' };
    const prioColor = PRIO[task.priority] || '#6e7681';
    const prioLabel = task.priority === 'high' ? t('prio_high') : (task.priority === 'medium' ? t('prio_med') : (task.priority === 'low' ? t('prio_low') : (task.priority || '-')));
    const assignee = (appData.users.find(u => u.id === task.assigneeId) || {}).name || '-';
    const fmt = (iso) => (typeof pdfFormatDateTime === 'function') ? pdfFormatDateTime(iso) : (iso || '-');

    let stackName = '';
    if (task.projectStackId) { const s = appData.projectStacks.find(x => x.id === task.projectStackId); if (s) stackName = s.name; }

    let h = `<div style="border-left:3pt solid ${shColor}; padding-left:10pt; margin:0 0 18pt 0;">`;
    h += `<div style="font-family:Helvetica,Arial,sans-serif; font-size:13pt; font-weight:bold; color:#22262b;">${escapeHtmlToday(task.projectName || 'Unbenannte Aufgabe')}</div>`;
    if (stackName) h += `<div style="font-family:Helvetica,Arial,sans-serif; font-size:9pt; color:#6e7681; margin-top:1pt;">${escapeHtmlToday(stackName)}</div>`;

    h += wordMetaTable([
        ['Stakeholder', wordPill(shName, shColor), true],
        ['Status', wordPill(statusLabel, statusColor), true],
        ['Kategorie', wordPill(task.bucket || '-', bucketColor), true],
        ['Priorität', wordPill(prioLabel, prioColor), true],
        ['Zuständig', assignee],
        ['Start', fmt(task.startDate)],
        ['Ziel', fmt(task.dueDate)],
        ['Aufwand (Ist/Soll)', `${task.spentTime || 0} / ${task.estimatedTime || 0} h`]
    ]);

    if (task.description && task.description.trim() && task.description !== '<br>') {
        h += wordSection(t('sec_notes'));
        h += `<div style="font-family:Helvetica,Arial,sans-serif; font-size:10pt; color:#22262b;">${task.description}</div>`;
    }
    if (task.checklist && task.checklist.length) {
        h += wordSection(t('sec_checklist'));
        h += wordChecklist(task.checklist);
    }
    if (task.files && task.files.length) {
        h += wordSection(t('sec_files'));
        h += wordFilesList(task.files);
    }
    if (task.notes && String(task.notes).trim()) {
        h += wordSection(t('sec_history'));
        h += `<div style="font-family:Helvetica,Arial,sans-serif; font-size:9.5pt; color:#6e7681; white-space:pre-wrap;">${escapeHtmlToday(task.notes)}</div>`;
    }
    return h + `</div>`;
}

/* Word-Export einer einzelnen Aufgabe (aus dem Aufgaben-Modal, Teilen > Word) */
function exportSingleTaskWord() {
    const id = document.getElementById('taskId').value;
    const t_obj = appData.tasks.find(x => x.id === id);
    if (!t_obj) return;
    return exportWord({ tasks: [t_obj], title: t_obj.projectName || 'Aufgabe', filename: `Aufgabe_${String(t_obj.projectName || 'Aufgabe').replace(/\s+/g, '_')}.doc` });
}

/* Word-Export eines Projekt-Stacks inkl. seiner Aufgaben (Teilen > Word) */
function exportSingleStackWord() {
    const id = document.getElementById('s_id').value;
    const stack = appData.projectStacks.find(s => s.id === id);
    if (!stack) return;
    const tasks = appData.tasks.filter(t_obj => t_obj.projectStackId === id);
    return exportWord({ tasks, stack, title: stack.name || 'Projekt-Stack', filename: `Stack_${String(stack.name || 'Stack').replace(/\s+/g, '_')}.doc` });
}

async function exportWord(opts) {
    const accent = wordAccent();
    const logo = appData.settings.companyLogo;
    const company = appData.settings.companyName || '';
    const today = new Date().toLocaleDateString('de-DE');
    const scoped = opts && Array.isArray(opts.tasks);

    /* Welche Aufgaben gehören in den Bericht? */
    let tasks = [];
    if (scoped) tasks = opts.tasks;
    else { try { tasks = (currentView === 'time') ? [] : getFilteredTasks(); } catch (e) { tasks = []; } }

    const docTitle = (opts && opts.title) ? opts.title
        : ((tasks.length === 1)
            ? (tasks[0].projectName || 'Aufgabe')
            : `ProMan – ${t('view_' + currentView) !== 'view_' + currentView ? t('view_' + currentView) : currentView}`);

    /* Kopfbereich: Logo oben links, Titel daneben, dünne Trennlinie */
    let header = `<table cellspacing="0" cellpadding="0" style="width:100%; border-collapse:collapse; margin-bottom:6pt;"><tr>`;
    if (logo) {
        header += `<td style="width:3cm; vertical-align:middle; padding-right:10pt;"><img src="${logo}" width="85" style="max-width:3cm; width:3cm; height:auto;" /></td>`;
    }
    header += `<td style="vertical-align:middle;">
            <div style="font-family:Helvetica,Arial,sans-serif; font-size:18pt; font-weight:bold; color:#22262b;">${escapeHtmlToday(docTitle)}</div>
            ${company ? `<div style="font-family:Helvetica,Arial,sans-serif; font-size:9.5pt; color:#6e7681; margin-top:2pt;">${escapeHtmlToday(company)}</div>` : ''}
        </td>
        <td style="vertical-align:middle; text-align:right; font-family:Helvetica,Arial,sans-serif; font-size:9pt; color:#6e7681; white-space:nowrap;">${today}</td>
    </tr></table>
    <div style="border-bottom:2pt solid ${accent}; margin-bottom:16pt;"></div>`;

    /* Inhalt: bestehender Bericht + vollständige Aufgabendetails */
    let body = '';
    if (!scoped) { try { body = generateRichTextReport() || ''; } catch (e) { body = ''; } }
    else if (opts.stack) { body = wordStackBlock(opts.stack); }

    let details = '';
    if (tasks.length) {
        details += `<h2 style="font-family:Helvetica,Arial,sans-serif; font-size:15pt; color:#22262b; border-bottom:1.5pt solid #cccccc; padding-bottom:4pt; margin-top:24pt;">${t('sec_details')}</h2>`;
        tasks.forEach(tk => { details += wordTaskBlock(tk); });
    }

    let attachments = '';
    try {
        if (tasks.length) {
            showToast('Anhänge werden aufbereitet...', 'info');
            attachments = await buildAttachmentsHtmlForWord(tasks);
        }
    } catch (e) { console.warn('Anhänge für Word-Export fehlgeschlagen', e); }

    const footer = `<div style="border-top:1pt solid #cccccc; margin-top:22pt; padding-top:5pt; font-family:Helvetica,Arial,sans-serif; font-size:8pt; color:#6e7681;">
        ${escapeHtmlToday(docTitle)}${company ? ' · ' + escapeHtmlToday(company) : ''} · ${today}
    </div>`;

    const fullHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'>
<style>
  @page { size: A4; margin: 2cm; }
  body { font-family: Helvetica, Arial, sans-serif; color:#22262b; font-size:10pt; }
  h2, h3 { font-family: Helvetica, Arial, sans-serif; color:#22262b; }
  table { border-collapse: collapse; }
</style>
</head>
<body>${header}${body}${details}${attachments}${footer}</body></html>`;

    const blob = new Blob(['\ufeff', fullHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (opts && opts.filename) ? opts.filename : `ProMan_Export_${currentView}.doc`;
    a.click();
}

function exportICS() {
    let icsLines = [ "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ProMan//DE" ];
    const formatDate = (dateStr, isAllDay = false, addDays = 0) => {
        if (!dateStr) return null; let d = new Date(dateStr); if (addDays !== 0) d.setDate(d.getDate() + addDays);
        if (isAllDay) { return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); } 
        else { return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0') + 'T' + String(d.getUTCHours()).padStart(2, '0') + String(d.getUTCMinutes()).padStart(2, '0') + String(d.getUTCSeconds()).padStart(2, '0') + 'Z'; }
    };
    const escapeText = (text) => text ? text.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,") : "";
    const addEvent = (uid, title, startStr, endStr, desc, isTimed) => {
        if (!startStr && !endStr) return; const start = startStr || endStr; const end = endStr || startStr;
        icsLines.push("BEGIN:VEVENT", `UID:${uid}@proman`, `DTSTAMP:${formatDate(new Date().toISOString(), false)}`);
        if (!isTimed) { icsLines.push(`DTSTART;VALUE=DATE:${formatDate(start, true)}`, `DTEND;VALUE=DATE:${formatDate(end, true, 1)}`); } 
        else { icsLines.push(`DTSTART:${formatDate(start, false)}`); let endDate = new Date(end); if (start === end) endDate.setHours(endDate.getHours() + 1); icsLines.push(`DTEND:${formatDate(endDate.toISOString(), false)}`); }
        icsLines.push(`SUMMARY:${escapeText(title)}`, `DESCRIPTION:${escapeText(desc)}`, "END:VEVENT");
    };

    getFilteredTasks().forEach(t_obj => {
        let desc = []; let plainDesc = t_obj.description ? t_obj.description.replace(/<[^>]*>?/gm, '') : '';
        if(plainDesc) desc.push(`Notizen: ${plainDesc}`); if(t_obj.history) desc.push(`Historie: ${t_obj.history}`);
        if(t_obj.files && t_obj.files.length) { desc.push(`Dateien/Pfade:`); t_obj.files.forEach(f => desc.push(`- ${f.type === 'path' ? f.path : f.name}`)); }
        let descStr = desc.join('\n');
        if(t_obj.startDate || t_obj.dueDate) addEvent(`task-${t_obj.id}`, `Aufgabe: ${t_obj.projectName}`, t_obj.startDate, t_obj.dueDate, descStr, false);
        if(t_obj.checklist) t_obj.checklist.forEach((cl, idx) => { if(cl.dueDate && !cl.done) addEvent(`cl-${t_obj.id}-${idx}`, `Checkpunkt: ${cl.title} (${t_obj.projectName})`, cl.dueDate, cl.dueDate, descStr, cl.dueDate.includes('T')); });
    });

    getFilteredStacks().forEach(s => {
        let plainNotes = s.notes ? s.notes.replace(/<[^>]*>?/gm, '') : ''; let descStr = plainNotes ? `Notizen: ${plainNotes}` : '';
        if(s.startDate || s.dueDate) addEvent(`stack-${s.id}`, `Projekt: ${s.name}`, s.startDate, s.dueDate, descStr, false);
        if(s.checklist) s.checklist.forEach((m, idx) => { if(m.dueDate && !m.done) addEvent(`ms-${s.id}-${idx}`, `Milestone: ${m.title} (${s.name})`, m.dueDate, m.dueDate, descStr, m.dueDate.includes('T')); });
    });

    icsLines.push("END:VCALENDAR"); const blob = new Blob([icsLines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `ProMan_Kalender_${new Date().toISOString().split('T')[0]}.ics`; a.click(); URL.revokeObjectURL(url);
    showToast(t('toast_pdf').replace('PDF', 'Kalender (.ics)'));
}

/* Wandelt einen Hex-Farbwert in ein [r,g,b]-Array (mit Fallback). */
function pdfHexToRgb(hex, fallback = [34, 38, 43]) {
    if (!hex || typeof hex !== 'string') return fallback;
    const h = hex.replace('#', '').trim();
    if (h.length !== 6) return fallback;
    const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
    return (isNaN(r) || isNaN(g) || isNaN(b)) ? fallback : [r, g, b];
}
/* Mischt eine Farbe mit Weiss auf (0 = Original, 1 = weiss) – für dezente Flächen. */
function pdfTint(rgb, amount) {
    return rgb.map(c => Math.round(c + (255 - c) * amount));
}
/* "2026-09-05T09:00" -> "05.09.2026" / "09:00" */
function pdfSplitIso(iso) {
    if (!iso) return { date: '', time: '' };
    const [d, tm] = String(iso).split('T');
    const parts = String(d).split('-');
    const date = parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : d;
    return { date, time: tm ? tm.substring(0, 5) : '' };
}
function pdfFormatDateTime(iso) {
    const { date, time } = pdfSplitIso(iso);
    if (!date) return '-';
    return time ? `${date}, ${time}` : date;
}
/*
 * Meta-Text eines Checklistenpunkts / Meilensteins – identisch zur Darstellung
 * in der Webapp: Startdatum + Startzeit, Dauer und daraus errechnetes Ende.
 * (Früher wurde nur die Endzeit aus dueDate gezeigt, was nicht zur App passte.)
 */
/*
 * Berechnet das Ende eines Checklistenpunkts aus Start + Dauer – aber auf Basis der
 * in den Einstellungen hinterlegten Arbeitsstunden pro Tag (z. B. 8.5) und der Arbeitstage.
 * Eine Dauer von 10 h bei 8,5 h Tagessoll endet also am nächsten Arbeitstag, nicht 10 echte Stunden später.
 */
function pdfWorkEnd(startIso, durationMin) {
    if (!startIso) return null;
    const [dPart, tPart] = String(startIso).split('T');
    const p = dPart.split('-');
    if (p.length !== 3) return null;
    const startTime = (tPart && tPart.length >= 4) ? tPart.substring(0, 5) : '09:00';
    const [sh, sm] = startTime.split(':').map(n => parseInt(n, 10) || 0);
    let cur = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]), sh, sm);
    if (isNaN(cur.getTime())) return null;

    let remaining = Math.max(0, parseInt(durationMin, 10) || 0);
    const perDayMin = Math.round(((parseFloat(appData.settings && appData.settings.targetHoursPerDay) || 8)) * 60);
    const workDays = (appData.settings && appData.settings.workDays && appData.settings.workDays.length)
        ? appData.settings.workDays : [1, 2, 3, 4, 5];

    if (remaining <= perDayMin) return new Date(cur.getTime() + remaining * 60000);

    let guard = 0;
    while (remaining > perDayMin && guard++ < 3650) {
        remaining -= perDayMin;
        /* nächster Arbeitstag, wieder zur Startzeit */
        do { cur.setDate(cur.getDate() + 1); } while (!workDays.includes(cur.getDay()) && guard++ < 3650);
        cur.setHours(sh, sm, 0, 0);
    }
    return new Date(cur.getTime() + remaining * 60000);
}

function pdfChecklistMeta(cl) {
    const meta = [];
    const s = pdfSplitIso(cl.startDate);
    const durMin = parseInt(cl.duration, 10) || 0;

    /* Ende bevorzugt aus Arbeitsstunden berechnen, sonst gespeichertes Fälligkeitsdatum.
       Ganztägige Termine behalten ihre gespeicherte Spanne (Arbeitsbeginn–Arbeitsende). */
    let e = pdfSplitIso(cl.dueDate);
    if (!cl.allDay && cl.startDate && durMin > 0) {
        const endDt = pdfWorkEnd(cl.startDate, durMin);
        if (endDt) {
            const _p = n => String(n).padStart(2, '0');
            e = {
                date: `${_p(endDt.getDate())}.${_p(endDt.getMonth() + 1)}.${endDt.getFullYear()}`,
                time: `${_p(endDt.getHours())}:${_p(endDt.getMinutes())}`
            };
        }
    }

    if (s.date) {
        let str = s.date;
        if (s.time) {
            str += `, ${s.time}`;
            if (e.time && e.date === s.date) str += `–${e.time}`;
        }
        if (e.date && e.date !== s.date) str += ` – ${e.date}${e.time ? ', ' + e.time : ''}`;
        meta.push(str);
    } else if (e.date) {
        meta.push(e.time ? `${e.date}, ${e.time}` : e.date);
    }
    if (durMin > 0) {
        const h = Math.floor(durMin / 60), m = durMin % 60;
        meta.push(h > 0 ? (m > 0 ? `${h} Std ${m} Min` : `${h} Std`) : `${m} Min`);
    }
    if (cl.assigneeId) { const u = appData.users.find(x => x.id === cl.assigneeId); if (u) meta.push(u.name); }
    return meta.join(' · ');
}

async function createPDF(tasksArray, docTitle, filename, stackObj = null, extraFiles = []) {
    if(typeof window.jspdf === 'undefined' || typeof html2canvas === 'undefined') { return showToast('PDF Bibliotheken laden noch.', 'error'); }
    showToast('PDF wird generiert... Bitte warten.', 'info');
    const { jsPDF } = window.jspdf; const doc = new jsPDF('p', 'mm', 'a4');
    const pageHeight = doc.internal.pageSize.height; const pageWidth = doc.internal.pageSize.width;
    const M = 14;                       /* Seitenrand */
    const contentWidth = pageWidth - (M * 2);
    const FOOTER_H = 14;                /* reservierter Fussbereich */
    const bottomLimit = pageHeight - FOOTER_H;

    /* ── Farbschema aus den Nutzereinstellungen ── */
    const ACCENT = pdfHexToRgb(appData.customColor, [0, 112, 242]);
    const INK = [34, 38, 43];           /* Haupttext (Graphit wie in der App) */
    const MUTED = [110, 118, 129];      /* Sekundärtext */
    const BORDER = [226, 229, 233];     /* Linien */
    const SOFT = pdfTint(ACCENT, 0.90); /* sehr helle Akzentfläche */

    const setInk = () => doc.setTextColor(INK[0], INK[1], INK[2]);
    const setMuted = () => doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);

    function ensureSpace(needed, y) {
        if (y + needed > bottomLimit) { doc.addPage(); return 20; }
        return y;
    }

    function printWrappedText(text, x, y, maxWidth, fontSize = 10, isBold = false) { 
        if(!text) return y; doc.setFontSize(fontSize); doc.setFont("helvetica", isBold ? "bold" : "normal"); 
        const lines = doc.splitTextToSize(String(text), maxWidth);
        const lh = fontSize > 10 ? 6.4 : 5;
        if (y + (lines.length * lh) > bottomLimit) { doc.addPage(); y = 20; } 
        doc.text(lines, x, y); return y + (lines.length * lh); 
    }

    /* Abschnittstitel */
    function sectionTitle(label, y) {
        y = ensureSpace(10, y);
        doc.setFontSize(10); doc.setFont("helvetica", "bold"); setInk();
        doc.text(String(label).toUpperCase(), M, y);
        return y + 5.5;
    }

    /* Zweispaltige Kennzahl-Zeile */
    function metaRow(l1, v1, l2, v2, y) {
        y = ensureSpace(7, y);
        const colW = contentWidth / 2;
        doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); setMuted();
        doc.text(String(l1).toUpperCase(), M, y);
        if (l2) doc.text(String(l2).toUpperCase(), M + colW, y);
        doc.setFontSize(10); doc.setFont("helvetica", "normal"); setInk();
        doc.text(doc.splitTextToSize(String(v1 || '-'), colW - 6)[0] || '-', M, y + 4.6);
        if (l2) doc.text(doc.splitTextToSize(String(v2 || '-'), colW - 6)[0] || '-', M + colW, y + 4.6);
        return y + 10;
    }

    /* Farbige Pill-Bubble (wie die Chips in der Webapp): helle Tönung + farbiger Rand/Text */
    function drawPill(text, rgb, x, y, maxW) {
        const label = String(text || '-');
        doc.setFontSize(8.8); doc.setFont("helvetica", "bold");
        const padX = 2.6, h = 5.4;
        let txt = label;
        let tw = doc.getTextWidth ? doc.getTextWidth(txt) : (txt.length * 1.8);
        if (tw + padX * 2 > maxW) {
            /* Text kürzen, damit die Pille nicht über die Spalte hinausläuft */
            while (txt.length > 1 && (doc.getTextWidth ? doc.getTextWidth(txt + '…') : (txt.length + 1) * 1.8) + padX * 2 > maxW) txt = txt.slice(0, -1);
            txt += '…';
            tw = doc.getTextWidth ? doc.getTextWidth(txt) : (txt.length * 1.8);
        }
        const w = Math.min(maxW, tw + padX * 2);
        const fill = pdfTint(rgb, 0.82);
        doc.setFillColor(fill[0], fill[1], fill[2]);
        doc.setDrawColor(rgb[0], rgb[1], rgb[2]); doc.setLineWidth(0.25);
        doc.roundedRect(x, y - h + 1.5, w, h, h / 2, h / 2, 'FD');
        doc.setTextColor(rgb[0], rgb[1], rgb[2]);
        doc.text(txt, x + padX, y);
        setInk();
        return w;
    }

    /* Zweispaltige Zeile mit farbigen Pill-Bubbles */
    function metaRowPills(l1, v1, c1, l2, v2, c2, y) {
        y = ensureSpace(8, y);
        const colW = contentWidth / 2;
        doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); setMuted();
        doc.text(String(l1).toUpperCase(), M, y);
        if (l2) doc.text(String(l2).toUpperCase(), M + colW, y);
        drawPill(v1, c1, M, y + 5.2, colW - 8);
        if (l2) drawPill(v2, c2, M + colW, y + 5.2, colW - 8);
        return y + 10.5;
    }

    /* Checklisten-/Milestone-Eintrag mit gezeichneter Checkbox */
    function checklistRow(cl, y, indent = 0) {
        const x = M + indent;
        const metaStr = pdfChecklistMeta(cl);
        doc.setFontSize(9.5); doc.setFont("helvetica", "normal");
        const titleW = contentWidth - indent - 8 - (metaStr ? 62 : 0);
        const lines = doc.splitTextToSize(String(cl.title || ''), Math.max(20, titleW));
        const rowH = Math.max(5.6, lines.length * 4.6);
        y = ensureSpace(rowH + 2, y);

        /* Checkbox */
        doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]); doc.setLineWidth(0.3);
        if (cl.done) {
            doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
            doc.roundedRect(x, y - 3.1, 3.6, 3.6, 0.6, 0.6, 'F');
            doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.45);
            doc.line(x + 0.9, y - 1.3, x + 1.6, y - 0.6);
            doc.line(x + 1.6, y - 0.6, x + 2.8, y - 2.3);
            doc.setLineWidth(0.3);
        } else {
            doc.roundedRect(x, y - 3.1, 3.6, 3.6, 0.6, 0.6, 'S');
        }

        if (cl.done) { setMuted(); } else { setInk(); }
        doc.text(lines, x + 6, y);
        if (metaStr) {
            doc.setFontSize(8); setMuted();
            doc.text(metaStr, pageWidth - M, y, { align: 'right' });
        }
        return y + rowH + 1.2;
    }

    async function renderRTFToPDF(htmlStr, x, y, maxWidth) {
        if(!htmlStr || htmlStr.trim()==='' || htmlStr==='<br>') return y;
        const tempDiv = document.createElement('div'); tempDiv.className = 'rte-content'; tempDiv.style.position = 'absolute'; tempDiv.style.left = '-9999px'; tempDiv.style.top = '0'; tempDiv.style.width = '700px'; tempDiv.style.background = '#ffffff'; tempDiv.style.color = '#000000'; tempDiv.style.padding = '10px'; tempDiv.style.boxSizing = 'border-box'; tempDiv.style.wordBreak = 'break-word'; tempDiv.style.maxHeight = 'none'; tempDiv.style.height = 'auto'; tempDiv.style.overflow = 'visible'; tempDiv.innerHTML = htmlStr; document.body.appendChild(tempDiv);
        try {
            const canvas = await html2canvas(tempDiv, { scale: 2, useCORS: true, windowWidth: 720 });
            if(document.body.contains(tempDiv)) document.body.removeChild(tempDiv);
            const pxPerMm = canvas.width / maxWidth;
            if (y + 12 > bottomLimit) { doc.addPage(); y = 20; }
            let srcY = 0; let destY = y; const totalSrcH = canvas.height;
            while (srcY < totalSrcH) {
                const availMm = bottomLimit - destY;
                if (availMm < 8) { doc.addPage(); destY = 20; continue; }
                let sliceSrcH = Math.min(totalSrcH - srcY, availMm * pxPerMm);
                const slice = document.createElement('canvas');
                slice.width = canvas.width; slice.height = Math.ceil(sliceSrcH);
                const sctx = slice.getContext('2d');
                sctx.fillStyle = '#ffffff'; sctx.fillRect(0, 0, slice.width, slice.height);
                sctx.drawImage(canvas, 0, srcY, canvas.width, sliceSrcH, 0, 0, canvas.width, sliceSrcH);
                const sliceMmH = sliceSrcH / pxPerMm;
                doc.addImage(slice.toDataURL('image/png'), 'PNG', x, destY, maxWidth, sliceMmH);
                srcY += sliceSrcH; destY += sliceMmH;
                if (srcY < totalSrcH) { doc.addPage(); destY = 20; }
            }
            return destY + 4;
        } catch(e) { if(document.body.contains(tempDiv)) document.body.removeChild(tempDiv); return printWrappedText("Fehler beim Laden des formatierten Textes.", x, y, maxWidth); }
    }

    /* ── Kopfbereich: ohne Hintergrundfarbe, Titel in Schwarz ── */
    const bandH = 26;
    let titleX = M;
    if(appData.settings.companyLogo) {
        try {
            const imgProps = doc.getImageProperties(appData.settings.companyLogo);
            const logoH = 12; const logoW = (imgProps.width * logoH) / imgProps.height;
            doc.addImage(appData.settings.companyLogo, 'PNG', M, (bandH - logoH) / 2, logoW, logoH);
            titleX = M + logoW + 6;
        } catch(e) { console.warn('Logo konnte nicht geladen werden', e); }
    }
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text(doc.splitTextToSize(String(docTitle), pageWidth - titleX - M - 46)[0], titleX, 15);
    doc.setFontSize(8.5); doc.setFont("helvetica", "normal");
    setMuted();
    const companyName = (appData.settings && appData.settings.companyName) ? appData.settings.companyName : '';
    if (companyName) doc.text(companyName, titleX, 20.5);
    doc.text(new Date().toLocaleDateString('de-DE'), pageWidth - M, 15, { align: 'right' });
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]); doc.setLineWidth(0.4);
    doc.line(M, bandH, pageWidth - M, bandH);

    let yPos = bandH + 12;
    setInk();

    /* ── Projekt-Stack-Kopf ── */
    if(stackObj) {
        const boxH = 15;
        doc.setFillColor(SOFT[0], SOFT[1], SOFT[2]);
        doc.roundedRect(M, yPos, contentWidth, boxH, 2, 2, 'F');
        doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
        doc.rect(M, yPos, 2.5, boxH, 'F');
        doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); setMuted();
        doc.text('PROJEKT-STACK', M + 7, yPos + 5.5);
        doc.setFontSize(13); doc.setFont("helvetica", "bold"); setInk();
        doc.text(doc.splitTextToSize(String(stackObj.name || '-'), contentWidth - 14)[0], M + 7, yPos + 11.5);
        yPos += boxH + 8;

        if(stackObj.startDate || stackObj.dueDate) {
            yPos = metaRow('Start', pdfFormatDateTime(stackObj.startDate), 'Ziel', pdfFormatDateTime(stackObj.dueDate), yPos);
        }
        if(stackObj.notes) { yPos = sectionTitle('Notizen', yPos); yPos = await renderRTFToPDF(stackObj.notes, M, yPos, contentWidth); yPos += 2; }
        if(stackObj.checklist && stackObj.checklist.length > 0) {
            yPos = sectionTitle('Milestones', yPos);
            stackObj.checklist.forEach(cl => { yPos = checklistRow(cl, yPos, 2); });
            yPos += 3;
        }
        doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]); doc.setLineWidth(0.4);
        doc.line(M, yPos, pageWidth - M, yPos); yPos += 9;
    }

    if(tasksArray.length === 0) { doc.setFontSize(11); setMuted(); doc.text("Keine Aufgaben vorhanden.", M, yPos); }

    /* ── Aufgabenkarten ── */
    for (let index = 0; index < tasksArray.length; index++) {
        const task = tasksArray[index];
        yPos = ensureSpace(46, yPos);

        /* Akzentfarbe: Stakeholder-Farbe, sonst Nutzerfarbe */
        let cardColor = ACCENT; let shName = '-';
        if(task.stakeholderId) {
            const sh = appData.stakeholders.find(s => s.id === task.stakeholderId);
            if(sh) { shName = sh.name; cardColor = pdfHexToRgb(sh.color, ACCENT); }
        }

        /* Kopfzeile der Karte – entfällt, wenn der Aufgabenname bereits als Dokumenttitel oben steht */
        const nameIsDocTitle = (tasksArray.length === 1 && !stackObj && String(docTitle) === String(task.projectName || ''));
        if (!nameIsDocTitle) {
            const headH = 11;
            doc.setFillColor(cardColor[0], cardColor[1], cardColor[2]);
            doc.roundedRect(M, yPos, contentWidth, headH, 1.8, 1.8, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont("helvetica", "bold"); doc.setFontSize(11.5);
            let stackSuffix = '';
            if(!stackObj && task.projectStackId) { const stack = appData.projectStacks.find(ps => ps.id === task.projectStackId); if(stack) stackSuffix = stack.name; }
            const titleMax = contentWidth - 10 - (stackSuffix ? 52 : 0);
            doc.text(doc.splitTextToSize(String(task.projectName || 'Unbenannte Aufgabe'), titleMax)[0], M + 5, yPos + 7.4);
            if(stackSuffix) {
                doc.setFontSize(8.5); doc.setFont("helvetica", "normal");
                doc.text(doc.splitTextToSize(stackSuffix, 48)[0], pageWidth - M - 5, yPos + 7.2, { align: 'right' });
            }
            yPos += headH + 7;
            setInk();
        } else if(task.projectStackId) {
            /* Stack-Zugehörigkeit trotzdem ausweisen */
            const stack = appData.projectStacks.find(ps => ps.id === task.projectStackId);
            if(stack) { doc.setFontSize(9); setMuted(); doc.text(`Stack: ${stack.name}`, M, yPos); setInk(); yPos += 6; }
        }

        /* Kennzahlen */
        const st = appData.statuses.find(s => s.id === task.status);
        const statusLabel = st ? (st.id === 'done' ? t('col_completed') : st.title) : '-';
        const statusColor = pdfHexToRgb(getStatusColor(st), [51, 59, 68]);
        const shColor = task.stakeholderId ? cardColor : [130, 138, 148];
        const bucketColor = task.bucket ? pdfHexToRgb(getBucketColor(task.bucket), ACCENT) : [130, 138, 148];
        const PRIO_COLORS = { high: [217, 52, 43], medium: [232, 163, 23], low: [31, 148, 99] };
        const prioColor = PRIO_COLORS[task.priority] || [130, 138, 148];
        const prioLabel = task.priority === 'high' ? t('prio_high') : (task.priority === 'medium' ? t('prio_med') : (task.priority === 'low' ? t('prio_low') : (task.priority || '-')));

        yPos = metaRowPills('Stakeholder', shName, shColor, 'Status', statusLabel, statusColor, yPos);
        yPos = metaRowPills('Kategorie', task.bucket || '-', bucketColor, 'Priorität', prioLabel, prioColor, yPos);
        yPos = metaRow('Start', pdfFormatDateTime(task.startDate), 'Ziel', pdfFormatDateTime(task.dueDate), yPos);
        yPos = metaRow('Aufwand (Ist/Soll)', `${task.spentTime || 0} / ${task.estimatedTime || 0} h`, 'Zuständig', (() => { const u = appData.users.find(x => x.id === task.assigneeId); return u ? u.name : '-'; })(), yPos);
        yPos += 1;

        if(task.description) { yPos = sectionTitle('Notizen', yPos); yPos = await renderRTFToPDF(task.description, M, yPos, contentWidth); yPos += 2; }
        if(task.checklist && task.checklist.length > 0) {
            yPos = sectionTitle('Checkliste', yPos);
            task.checklist.forEach(cl => { yPos = checklistRow(cl, yPos, 2); });
            yPos += 3;
        }
        if(task.notes) { yPos = sectionTitle('Historie', yPos); doc.setFontSize(9.5); setMuted(); yPos = printWrappedText(task.notes, M, yPos, contentWidth, 9.5, false); setInk(); yPos += 3; }
        if(task.files && task.files.length > 0) {
            yPos = sectionTitle('Dateien / Pfade', yPos);
            doc.setFontSize(9); setMuted();
            task.files.forEach(f => { const fname = f.type === 'blob' ? f.name : f.path; yPos = printWrappedText(`• ${fname}`, M + 2, yPos, contentWidth - 4, 9, false); });
            setInk(); yPos += 3;
        }

        yPos += 6;
        if(index < tasksArray.length - 1) {
            yPos = ensureSpace(6, yPos);
            doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]); doc.setLineWidth(0.3);
            doc.line(M, yPos - 3, pageWidth - M, yPos - 3);
            yPos += 3;
        }
    }

    /* ── Vom Nutzer ausgewählte Anhänge (optional, aus dem Export-Dialog) ── */
    if (extraFiles && extraFiles.length > 0) {
        doc.addPage(); yPos = 20;
        yPos = sectionTitle(t('pdfx_section_title'), yPos); yPos += 2;

        for (const file of extraFiles) {
            const imgs = await captureFileObjectAsImages(file);
            if (imgs.length === 0) {
                doc.setFontSize(9); setMuted();
                yPos = printWrappedText(`• ${file.name} (${t('pdfx_not_renderable')})`, M, yPos, contentWidth, 9, false);
                setInk();
                continue;
            }
            for (let i = 0; i < imgs.length; i++) {
                const dataUrl = imgs[i];
                try {
                    const props = doc.getImageProperties(dataUrl);
                    let imgW = contentWidth;
                    let imgH = (props.height * imgW) / props.width;
                    const label = file.name + (imgs.length > 1 ? ` (${t('fv_page')} ${i + 1}/${imgs.length})` : '');
                    const maxH = bottomLimit - 28;
                    if (imgH > maxH) { imgH = maxH; imgW = (props.width * imgH) / props.height; }
                    if (yPos + imgH + 12 > bottomLimit) { doc.addPage(); yPos = 20; }
                    doc.setFontSize(8.5); setMuted();
                    doc.text(label, M, yPos + 2); yPos += 5;
                    setInk();
                    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]); doc.setLineWidth(0.3);
                    doc.rect(M, yPos, imgW, imgH, 'S');
                    doc.addImage(dataUrl, 'PNG', M, yPos, imgW, imgH);
                    yPos += imgH + 8;
                } catch (e) { console.warn('Anhang konnte nicht eingebettet werden', e); }
            }
        }
    }

    /* ── Fusszeile auf allen Seiten ── */
    try {
        const total = typeof doc.getNumberOfPages === 'function' ? doc.getNumberOfPages() : (doc.internal.getNumberOfPages ? doc.internal.getNumberOfPages() : 1);
        for (let p = 1; p <= total; p++) {
            if (typeof doc.setPage === 'function') doc.setPage(p);
            doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]); doc.setLineWidth(0.3);
            doc.line(M, pageHeight - 10, pageWidth - M, pageHeight - 10);
            doc.setFontSize(8); doc.setFont("helvetica", "normal");
            doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
            doc.text(String(docTitle), M, pageHeight - 6);
            doc.text(`${p} / ${total}`, pageWidth - M, pageHeight - 6, { align: 'right' });
        }
    } catch(e) { console.warn('Fusszeile konnte nicht gesetzt werden', e); }

    doc.save(filename); showToast(t('toast_pdf'));
}

/* ═══════════════════════════════════════════════════════════
   PDF-EXPORT-DIALOG: optional Bilder/PDFs mit anhängen
   ═══════════════════════════════════════════════════════════ */
let _pdfExportRunner = null;      /* (extraFiles) => Promise */
let pdfExportExtraFiles = [];     /* nur für diesen Dialog, nichts wird gespeichert */

function openPdfExportModal(runner) {
    _pdfExportRunner = runner;
    pdfExportExtraFiles = [];
    const inp = document.getElementById('pdfx_input'); if (inp) inp.value = '';
    renderPdfExportFileList();
    const m = document.getElementById('pdfExportModal'); if (m) m.classList.add('active');
}
function closePdfExportModal() {
    const m = document.getElementById('pdfExportModal'); if (m) m.classList.remove('active');
    pdfExportExtraFiles = [];
    _pdfExportRunner = null;
}
function addPdfExportFiles(input) {
    if (!input.files || !input.files.length) return;
    Array.from(input.files).forEach(f => pdfExportExtraFiles.push(f));
    input.value = '';
    renderPdfExportFileList();
}
function removePdfExportFile(i) { pdfExportExtraFiles.splice(i, 1); renderPdfExportFileList(); }
function renderPdfExportFileList() {
    const c = document.getElementById('pdfx_list'); if (!c) return;
    if (pdfExportExtraFiles.length === 0) {
        c.innerHTML = `<p style="font-size:12px; color:var(--text-muted); text-align:center; padding:14px 0;">${t('pdfx_none')}</p>`;
        return;
    }
    c.innerHTML = pdfExportExtraFiles.map((f, i) => {
        const kind = guessFileKind(f.name, f.type);
        const icon = kind === 'pdf' ? 'fa-file-pdf' : (kind === 'image' ? 'fa-file-image' : 'fa-file');
        const kb = Math.max(1, Math.round(f.size / 1024));
        return `<div style="display:flex; align-items:center; justify-content:space-between; gap:10px; background:var(--bg-color); border:1px solid var(--border-color); border-radius:6px; padding:8px 10px; margin-bottom:6px;">
            <span style="display:flex; align-items:center; gap:9px; min-width:0; font-size:13px;">
                <i class="fas ${icon}" style="color:var(--primary-color);"></i>
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtmlToday(f.name)}</span>
                <span style="color:var(--text-muted); font-size:11px; flex-shrink:0;">${kb} KB</span>
            </span>
            <button class="secondary icon-btn" style="color:var(--danger); flex-shrink:0;" onclick="removePdfExportFile(${i})" title="${t('delete')}"><i class="fas fa-times"></i></button>
        </div>`;
    }).join('');
}
async function confirmPdfExport() {
    const runner = _pdfExportRunner;
    const files = pdfExportExtraFiles.slice();
    const m = document.getElementById('pdfExportModal'); if (m) m.classList.remove('active');
    _pdfExportRunner = null; pdfExportExtraFiles = [];
    if (typeof runner === 'function') { try { await runner(files); } catch (e) { console.warn(e); showToast('PDF-Export fehlgeschlagen.', 'error'); } }
}

function exportPDFGefiltert() {
    openPdfExportModal((extra) => createPDF(getFilteredTasks(), "ProMan: Gefilterte Aufgaben", "ProMan_Gefiltert.pdf", null, extra));
}
function exportSingleTaskPDF() {
    const id = document.getElementById('taskId').value; const t_obj = appData.tasks.find(x => x.id === id); if(!t_obj) return;
    openPdfExportModal((extra) => createPDF([t_obj], t_obj.projectName || 'Aufgabe', `Aufgabe_${t_obj.projectName.replace(/\s+/g, '_')}.pdf`, null, extra));
}
function exportSingleStackPDF() {
    const id = document.getElementById('s_id').value; const stack = appData.projectStacks.find(s => s.id === id); if(!stack) return;
    const tasks = appData.tasks.filter(t_obj => t_obj.projectStackId === id);
    openPdfExportModal((extra) => createPDF(tasks, "Projekt-Stack Übersicht", `Stack_${stack.name.replace(/\s+/g, '_')}.pdf`, stack, extra));
}

// --- NOTIFICATION MODAL ---
let _notifModalQueue = [];
let _notifModalOpen = false;

function showNotifModal(title, body, type, notifId = null) {
    _notifModalQueue.push({ title, body, type, notifId });
    if (!_notifModalOpen) _processNotifModalQueue();
}

let _currentNotifModalId = null;

function _processNotifModalQueue() {
    if (_notifModalQueue.length === 0) { _notifModalOpen = false; return; }
    _notifModalOpen = true;
    const { title, body, type, notifId } = _notifModalQueue.shift();
    _currentNotifModalId = notifId || null;
    const overlay = document.getElementById('notifModalOverlay');
    const card    = document.getElementById('notifModalCard');
    const iconEl  = document.getElementById('notifModalIcon');
    const titleEl = document.getElementById('notifModalTitle');
    const bodyEl  = document.getElementById('notifModalBody');
    const badge   = document.getElementById('notifModalQueueBadge');
    const snoozeBtn = document.getElementById('notifModalSnoozeBtn');

    card.className = 'notif-modal-card';
    let iconHtml = '<i class="fas fa-bell" style="color:var(--primary-color)"></i>';
    if (type === 'danger') { card.classList.add('danger-card'); iconHtml = '<i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i>'; }
    else if (type === 'warning') { card.classList.add('warning-card'); iconHtml = '<i class="fas fa-clock" style="color:var(--warning)"></i>'; }

    iconEl.innerHTML  = iconHtml;
    titleEl.innerText = title;
    bodyEl.innerText  = body;
    badge.style.display = _notifModalQueue.length > 0 ? 'block' : 'none';
    badge.innerText = `+${_notifModalQueue.length}`;
    if (snoozeBtn) snoozeBtn.style.display = _currentNotifModalId ? '' : 'none';
    overlay.classList.add('active');
}

function snoozeNotifModal(minutes = 30) {
    if (_currentNotifModalId) {
        if (!appData.settings.snoozedNotifs) appData.settings.snoozedNotifs = {};
        appData.settings.snoozedNotifs[_currentNotifModalId] = Date.now() + minutes * 60000;
        if (Array.isArray(appData.settings.firedNotifChannels)) {
            appData.settings.firedNotifChannels = appData.settings.firedNotifChannels.filter(id => id !== _currentNotifModalId);
        }
        saveToLocal(true);
        const label = minutes >= 60
            ? ((minutes % 60 === 0) ? `${minutes / 60} ${minutes === 60 ? 'Stunde' : 'Stunden'}` : `${Math.floor(minutes / 60)} Std ${minutes % 60} Min`)
            : `${minutes} Minuten`;
        showToast(`Erinnerung in ${label} erneut.`);
    }
    dismissNotifModal();
}

function dismissNotifModal() {
    document.getElementById('notifModalOverlay').classList.remove('active');
    setTimeout(_processNotifModalQueue, 200);
}

function triggerEmailNotif(subject, body, toEmail) {
    const email = toEmail || appData.settings.notificationEmail || '';
    if (!email) return;
    const uri = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('[ProMan] ' + subject)}&body=${encodeURIComponent(body)}`;
    window.open(uri, '_blank');
}

// AUTO-DELETE LOGIC
function performAutoDelete() {
    const ad = appData.settings.autoDelete; if(!ad || ad.unit === 'never') return;
    let multiplier = 1; if(ad.unit === 'days') multiplier = 86400000; if(ad.unit === 'weeks') multiplier = 604800000; if(ad.unit === 'months') multiplier = 2592000000; if(ad.unit === 'years') multiplier = 31536000000;
    const threshold = Date.now() - (ad.value * multiplier); const lastStatusId = appData.statuses.length > 0 ? appData.statuses[appData.statuses.length-1].id : null;
    let tasksDeleted = false; let stacksDeleted = false;

    appData.tasks = appData.tasks.filter(t_obj => {
        const isDone = t_obj.status === lastStatusId;
        if(isDone) {
            if(!t_obj.completedAt) { t_obj.completedAt = Date.now(); return true; }
            if(t_obj.completedAt < threshold) { appData.deletedItems.push({ type: 'task', data: t_obj, deletedAt: Date.now() }); tasksDeleted = true; return false; }
        }
        return true;
    });

    appData.projectStacks = appData.projectStacks.filter(s => {
        if(s.status === 'completed') {
            if(!s.completedAt) { s.completedAt = Date.now(); return true; }
            if(s.completedAt < threshold) { 
                appData.deletedItems.push({ type: 'stack', data: s, deletedAt: Date.now() });
                const childTasks = appData.tasks.filter(t_obj => t_obj.projectStackId === s.id);
                appData.tasks = appData.tasks.filter(t_obj => t_obj.projectStackId !== s.id);
                childTasks.forEach(ct => { appData.deletedItems.push({ type: 'task', data: ct, deletedAt: Date.now(), isChild: true }); });
                stacksDeleted = true; return false; 
            }
        }
        return true;
    });

    const td = appData.settings.trashAutoDelete;
    if(td && td.unit !== 'never') {
        let tMult = 1; if(td.unit === 'hours') tMult = 3600000; if(td.unit === 'days') tMult = 86400000;
        const trashThreshold = Date.now() - (td.value * tMult); const beforeLen = appData.deletedItems.length;
        appData.deletedItems = appData.deletedItems.filter(item => { return item.deletedAt >= trashThreshold; });
        if(beforeLen > appData.deletedItems.length) { tasksDeleted = true; }
    }

    if(tasksDeleted || stacksDeleted) { saveToLocal(true); console.log('ProMan: Automatische Löschung/Papierkorb-Bereinigung ausgeführt.'); }
}

// =========================================================================
// THEME EDITOR
// =========================================================================

const defaultThemeVars = {
    light: {
        bg: '#f3f4f6', surface: '#ffffff', text: '#1f2937', muted: '#6b7280',
        border: '#e5e7eb', primary: '#cca300', success: '#10b981', warning: '#f59e0b', danger: '#ef4444'
    },
    dark: {
        bg: '#111827', surface: '#1f2937', text: '#f9fafb', muted: '#9ca3af',
        border: '#374151', primary: '#cca300'
    },
    glass: { blur: 16, opacity: 65, edge: true }
};

function getThemes() {
    try { return JSON.parse(localStorage.getItem('proman_themes') || '[]'); } catch(e) { return []; }
}
function saveThemes(themes) { localStorage.setItem('proman_themes', JSON.stringify(themes)); }

function _presetList(kind) {
    return kind === 'stack' ? (appData.stackPresets = appData.stackPresets || []) : (appData.taskPresets = appData.taskPresets || []);
}

function renderPresetsPanel() {
    const box = document.getElementById('presets_container');
    if (!box) return;
    const section = (kind, title, icon) => {
        const list = _presetList(kind);
        let h = `<div class="preset-section">
            <div class="preset-sec-head"><h3><i class="fas ${icon}"></i> ${title}</h3>
                <button class="secondary" onclick="addPreset('${kind}')"><i class="fas fa-plus"></i> ${t('preset_new')}</button>
            </div>`;
        if (!list.length) {
            h += `<div class="preset-empty">${t('preset_none')}</div>`;
        } else {
            h += `<div class="preset-list">`;
            list.forEach(p => {
                h += `<div class="preset-card ${p.isDefault ? 'is-default' : ''}">
                    <div class="preset-card-top">
                        <input class="preset-name" value="${(p.name||'').replace(/"/g,'&quot;')}" onchange="renamePreset('${kind}','${p.id}', this.value)" placeholder="${t('preset_name_ph')}">
                        ${p.isDefault ? `<span class="preset-default-badge"><i class="fas fa-star"></i> ${t('preset_default')}</span>` : `<button class="preset-mini" onclick="setDefaultPreset('${kind}','${p.id}')" title="${t('preset_make_default')}"><i class="far fa-star"></i></button>`}
                        <button class="preset-mini danger" onclick="deletePreset('${kind}','${p.id}')" title="${t('delete')}"><i class="fas fa-trash"></i></button>
                    </div>
                    <div class="preset-fields">
                        <label>${t('bucket')}</label>
                        <select onchange="updatePresetField('${kind}','${p.id}','bucket',this.value)">
                            <option value="">${t('preset_keep')}</option>
                            ${appData.buckets.map(bk => `<option value="${bk}" ${p.bucket===bk?'selected':''}>${bk}</option>`).join('')}
                        </select>
                        <label>${t('priority')}</label>
                        <select onchange="updatePresetField('${kind}','${p.id}','priority',this.value)">
                            <option value="" ${!p.priority?'selected':''}>${t('preset_keep')}</option>
                            <option value="high" ${p.priority==='high'?'selected':''}>${t('prio_high')}</option>
                            <option value="medium" ${p.priority==='medium'?'selected':''}>${t('prio_med')}</option>
                            <option value="low" ${p.priority==='low'?'selected':''}>${t('prio_low')}</option>
                        </select>
                        <label>${t('no_stakeholder').replace('Kein ','').replace('No ','').replace('Aucune ','')||'Stakeholder'}</label>
                        <select onchange="updatePresetField('${kind}','${p.id}','stakeholderId',this.value)">
                            <option value="">${t('preset_keep')}</option>
                            ${appData.stakeholders.map(sh => `<option value="${sh.id}" ${p.stakeholderId===sh.id?'selected':''}>${sh.name}</option>`).join('')}
                        </select>
                        <label>${t('view_checklists')}</label>
                        <div class="preset-cl-list" data-kind="${kind}" data-pid="${p.id}">
                            ${_presetClNorm(p.checklist).map((ci, idx) => `<div class="preset-cl-row" data-idx="${idx}">
                                <i class="fas fa-grip-vertical preset-cl-drag" title="Verschieben"></i>
                                <input class="preset-cl-title" value="${(ci.title||'').replace(/"/g,'&quot;')}" placeholder="${t('preset_cl_item_ph')||'Checklistenpunkt'}" onchange="presetClSetTitle('${kind}','${p.id}',${idx},this.value)">
                                <input class="preset-cl-dur" type="number" min="0" step="0.25" value="${ci.duration ? Math.round((ci.duration/60)*100)/100 : ''}" placeholder="0" title="${t('preset_cl_time_title')||'Zeit in Stunden (optional)'}" onchange="presetClSetDuration('${kind}','${p.id}',${idx},this.value)">
                                <span class="preset-cl-unit">h</span>
                                <button class="preset-mini danger" onclick="presetClRemove('${kind}','${p.id}',${idx})" title="${t('delete')}"><i class="fas fa-times"></i></button>
                            </div>`).join('')}
                        </div>
                        <button class="preset-cl-add secondary" onclick="presetClAdd('${kind}','${p.id}')"><i class="fas fa-plus"></i> ${t('preset_cl_add')||'Punkt hinzufügen'}</button>
                        <label>${t('notes') || 'Notiz'}</label>
                        <textarea class="preset-note" rows="2" placeholder="${t('preset_note_ph')}" onchange="updatePresetField('${kind}','${p.id}','note',this.value)">${(p.note||'').replace(/</g,'&lt;')}</textarea>
                    </div>
                </div>`;
            });
            h += `</div>`;
        }
        h += `</div>`;
        return h;
    };
    box.innerHTML = section('task', t('preset_task_title'), 'fa-tasks') + section('stack', t('preset_stack_title'), 'fa-folder');
}

function addPreset(kind) {
    const list = _presetList(kind);
    const p = { id: 'pr_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5),
                name: t('preset_untitled'), bucket: '', priority: '', stakeholderId: '', checklist: [], note: '',
                isDefault: list.length === 0 };
    list.push(p);
    saveToLocal(true);
    renderPresetsPanel();
}

function renamePreset(kind, id, val) {
    const p = _presetList(kind).find(x => x.id === id); if (!p) return;
    p.name = val.trim() || t('preset_untitled'); saveToLocal(true);
}

function updatePresetField(kind, id, field, val) {
    const p = _presetList(kind).find(x => x.id === id); if (!p) return;
    if (field === 'checklist') p.checklist = val.split('\n').map(s => s.trim()).filter(Boolean);
    else p[field] = val;
    saveToLocal(true);
}

/* Preset-Checklist normalisieren: Einträge dürfen Strings ODER {title, duration} sein.
   duration = Minuten (optional). */
function _presetClNorm(cl) {
    if (!Array.isArray(cl)) return [];
    return cl.map(it => {
        if (typeof it === 'string') return { title: it, duration: 0 };
        return { title: (it && it.title) || '', duration: (it && Number(it.duration)) || 0 };
    });
}
function presetClAdd(kind, id) {
    const p = _presetList(kind).find(x => x.id === id); if (!p) return;
    p.checklist = _presetClNorm(p.checklist);
    p.checklist.push({ title: '', duration: 0 });
    saveToLocal(true); renderPresetsPanel();
}
function presetClRemove(kind, id, idx) {
    const p = _presetList(kind).find(x => x.id === id); if (!p) return;
    p.checklist = _presetClNorm(p.checklist);
    p.checklist.splice(idx, 1);
    saveToLocal(true); renderPresetsPanel();
}
function presetClSetTitle(kind, id, idx, val) {
    const p = _presetList(kind).find(x => x.id === id); if (!p) return;
    p.checklist = _presetClNorm(p.checklist);
    if (p.checklist[idx]) p.checklist[idx].title = val;
    saveToLocal(true);
}
function presetClSetDuration(kind, id, idx, hoursVal) {
    const p = _presetList(kind).find(x => x.id === id); if (!p) return;
    p.checklist = _presetClNorm(p.checklist);
    const h = parseFloat(hoursVal); const min = (isNaN(h) || h < 0) ? 0 : Math.round(h * 60);
    if (p.checklist[idx]) p.checklist[idx].duration = min;
    saveToLocal(true);
}
/* Checklistenpunkt eines Presets an eine neue Position verschieben */
function presetClMove(kind, id, fromIdx, toIdx) {
    const p = _presetList(kind).find(x => x.id === id); if (!p) return;
    p.checklist = _presetClNorm(p.checklist);
    if (fromIdx < 0 || fromIdx >= p.checklist.length) return;
    let to = Math.max(0, Math.min(p.checklist.length - 1, toIdx));
    if (to === fromIdx) return;
    const [mv] = p.checklist.splice(fromIdx, 1);
    p.checklist.splice(to, 0, mv);
    saveToLocal(true); renderPresetsPanel();
}

function setDefaultPreset(kind, id) {
    _presetList(kind).forEach(p => p.isDefault = (p.id === id));
    saveToLocal(true);
    renderPresetsPanel();
}

function deletePreset(kind, id) {
    let list = _presetList(kind);
    const wasDefault = (list.find(x => x.id === id) || {}).isDefault;
    const idx = list.findIndex(x => x.id === id);
    if (idx > -1) list.splice(idx, 1);
    if (wasDefault && list.length) list[0].isDefault = true;
    saveToLocal(true);
    renderPresetsPanel();
}

/* Wendet die Standard-Vorlage auf ein frisch erstelltes Objekt an */
function populatePresetPicker(kind) {
    const list = _presetList(kind);
    const row = document.getElementById(kind === 'stack' ? 's_preset_row' : 't_preset_row');
    const sel = document.getElementById(kind === 'stack' ? 's_preset_select' : 't_preset_select');
    if (!row || !sel) return;
    if (!list.length) { row.style.display = 'none'; return; }
    row.style.display = 'block';
    sel.innerHTML = `<option value="">${t('preset_pick')}</option>` +
        list.map(p => `<option value="${p.id}">${(p.name || t('preset_untitled'))}${p.isDefault ? ' ★' : ''}</option>`).join('');
    sel.value = '';
}

function applyPresetToForm(kind, presetId) {
    if (!presetId) return;
    const p = _presetList(kind).find(x => x.id === presetId);
    if (!p) return;
    if (kind === 'task') {
        if (p.priority) { const el = document.getElementById('t_priority'); if (el) el.value = p.priority; }
        if (p.bucket) { const el = document.getElementById('t_bucket'); if (el) el.value = p.bucket; }
        if (p.stakeholderId) { const el = document.getElementById('t_stakeholder'); if (el) el.value = p.stakeholderId; }
        if (p.note) { const rte = document.getElementById('t_desc_rte'); if (rte) rte.innerHTML = p.note.replace(/\n/g, '<br>'); }
        if (p.checklist && p.checklist.length) {
            const container = document.getElementById('t_checklist_container');
            if (container) { container.innerHTML = ''; _presetClNorm(p.checklist).forEach(ci => { const nid = generateId(); renderTaskChecklistItem(container, ci.title, false, '', '', nid, '', ci.duration || null); }); }
        }
    } else {
        if (p.stakeholderId) { const el = document.getElementById('s_stakeholder'); if (el) el.value = p.stakeholderId; }
        if (p.bucket) { const el = document.getElementById('s_bucket'); if (el) el.value = p.bucket; }
        if (p.note) { const rte = document.getElementById('s_notes_rte'); if (rte) rte.innerHTML = p.note.replace(/\n/g, '<br>'); }
        if (p.checklist && p.checklist.length) {
            const scont = document.getElementById('s_checklist_container');
            if (scont) {
                scont.innerHTML = '';
                _presetClNorm(p.checklist).forEach(ci => {
                    const div = document.createElement('div'); div.className = 'checklist-item';
                    const nid = generateId(); div.setAttribute('data-id', nid);
                    div.innerHTML = buildChecklistItemHTML(ci.title, false, '', '', nid, '', ci.duration || null);
                    addModalClDragHandlers(div); scont.appendChild(div);
                });
            }
        }
    }
    showToast(t('preset_applied').replace('{n}', p.name || t('preset_untitled')), 'success');
}

function applyPresetDefaults(obj, kind) {

    const list = _presetList(kind);
    const p = list.find(x => x.isDefault);
    if (!p) return obj;
    if (p.bucket) obj.bucket = p.bucket;
    if (p.priority) obj.priority = p.priority;
    if (p.stakeholderId) obj.stakeholderId = p.stakeholderId;
    if (p.checklist && p.checklist.length) {
        obj.checklist = (obj.checklist || []).concat(p.checklist.map(txt => ({
            id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6),
            title: txt, done: false
        })));
    }
    if (p.note) obj.notes = (obj.notes ? obj.notes + '\n' : '') + p.note;
    return obj;
}

function openThemeEditorTab() {
    if(!document.getElementById("set-theme")) return;   /* Theme-Editor entfernt */
    const lightTheme = (appData.settings.customTheme || {}).light || {};
    const darkTheme  = (appData.settings.customTheme || {}).dark  || {};
    const glassTheme = (appData.settings.customTheme || {}).glass || {};

    const set = (id, val) => { const el = document.getElementById(id); if(el && val !== undefined && val !== null) el.value = val; };
    const setCheck = (id, val) => { const el = document.getElementById(id); if(el) el.checked = val; };

    set('tc_light_bg',      lightTheme.bg      || defaultThemeVars.light.bg);
    set('tc_light_surface', lightTheme.surface  || defaultThemeVars.light.surface);
    set('tc_light_text',    lightTheme.text     || defaultThemeVars.light.text);
    set('tc_light_muted',   lightTheme.muted    || defaultThemeVars.light.muted);
    set('tc_light_border',  lightTheme.border   || defaultThemeVars.light.border);
    set('tc_light_primary', lightTheme.primary  || appData.customColor || defaultThemeVars.light.primary);
    set('tc_light_success', lightTheme.success  || defaultThemeVars.light.success);
    set('tc_light_warning', lightTheme.warning  || defaultThemeVars.light.warning);
    set('tc_light_danger',  lightTheme.danger   || defaultThemeVars.light.danger);

    set('tc_dark_bg',      darkTheme.bg      || defaultThemeVars.dark.bg);
    set('tc_dark_surface', darkTheme.surface  || defaultThemeVars.dark.surface);
    set('tc_dark_text',    darkTheme.text     || defaultThemeVars.dark.text);
    set('tc_dark_muted',   darkTheme.muted    || defaultThemeVars.dark.muted);
    set('tc_dark_border',  darkTheme.border   || defaultThemeVars.dark.border);
    set('tc_dark_primary', darkTheme.primary  || appData.customColor || defaultThemeVars.dark.primary);

    // Glass controls
    const blurVal  = (glassTheme.blur  !== undefined) ? glassTheme.blur  : defaultThemeVars.glass.blur;
    set('tc_glass_blur', blurVal);
    const blurLabel = document.getElementById('tc_glass_blur_val');
    if(blurLabel)  blurLabel.textContent  = blurVal + 'px';

    // Derived opacity from blur (always-on edge)
    const derivedOpacity = Math.round(40 + (blurVal / 40) * 40);
    set('tc_glass_opacity', derivedOpacity);

    // Logo preview in theme editor
    renderLogoPreviewTE();
    renderThemeSelector();
}

function renderLogoPreviewTE() {
    const container = document.getElementById('logo_preview_te');
    const fname     = document.getElementById('logo_fname_te');
    if(!container) return;
    if(appData.settings.companyLogo) {
        if(fname) fname.textContent = 'Logo gespeichert';
        container.innerHTML = `<div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <img src="${appData.settings.companyLogo}" style="max-height:56px; max-width:200px; border:1px solid var(--border-color); border-radius:var(--radius); background:white; padding:4px;">
            <button class="secondary icon-btn" style="color:var(--danger);" onclick="appData.settings.companyLogo=null; renderLogoPreviewTE(); renderLogoPreview(); saveToLocal(true); document.getElementById('logo_fname_te').textContent='Keine Datei ausgewählt';" title="Logo entfernen"><i class="fas fa-trash"></i></button>
        </div>`;
    } else {
        container.innerHTML = '';
        if(fname) fname.textContent = 'Keine Datei ausgewählt';
    }
}

function handleLogoUploadThemeEditor(e) {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        const isJpeg = /jpe?g/i.test(file.type || '') || /\.jpe?g$/i.test(file.name || '');
        normalizeLogoDataUrl(ev.target.result, isJpeg).then(function (clean) {
            appData.settings.companyLogo = clean;
            renderLogoPreview();
            renderLogoPreviewTE();
            try { saveToLocal(true); showToast(t('logo_saved')); }
            catch (err) { showToast(t('logo_too_large'), 'error'); }
        }).catch(function () { showToast(t('logo_invalid'), 'error'); });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

function syncGlassSlider(blurVal) {
    const v = parseInt(blurVal);
    const derivedOpacity = Math.round(40 + (v / 40) * 40);
    const opEl = document.getElementById('tc_glass_opacity');
    if(opEl) opEl.value = derivedOpacity;
    const blurLabel = document.getElementById('tc_glass_blur_val');
    if(blurLabel) blurLabel.textContent = v + 'px';
}

function getEditorThemeValues() {
    const g = (id) => document.getElementById(id)?.value || '';
    const blur   = parseInt(document.getElementById('tc_glass_blur')?.value   || '16');
    const opacity = Math.round(40 + (blur / 40) * 40);
    const edge   = true; // always on
    return {
        light: { bg: g('tc_light_bg'), surface: g('tc_light_surface'), text: g('tc_light_text'),
                 muted: g('tc_light_muted'), border: g('tc_light_border'), primary: g('tc_light_primary'),
                 success: g('tc_light_success'), warning: g('tc_light_warning'), danger: g('tc_light_danger') },
        dark:  { bg: g('tc_dark_bg'), surface: g('tc_dark_surface'), text: g('tc_dark_text'),
                 muted: g('tc_dark_muted'), border: g('tc_dark_border'), primary: g('tc_dark_primary') },
        glass: { blur, opacity, edge }
    };
}

function applyGlassVars(glass) {
    if(!glass) return;
    const root = document.documentElement;
    const blur    = (glass.blur    !== undefined) ? glass.blur    : 16;
    const opacity = (glass.opacity !== undefined) ? glass.opacity : 65;

    root.style.setProperty('--glass-blur-px', blur + 'px');
    root.style.setProperty('--glass-opacity',  (opacity / 100).toFixed(2));

    const isDark = root.getAttribute('data-theme') === 'dark';

    if(isDark) {
        root.style.setProperty('--glass-edge', 'inset 0 2px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(255,255,255,0.06), inset 2px 0 0 rgba(255,255,255,0.14), inset -1px 0 0 rgba(255,255,255,0.06)');
        root.style.setProperty('--glass-blur', `blur(${blur}px) saturate(180%) brightness(1.15)`);
    } else {
        root.style.setProperty('--glass-edge', 'inset 0 2px 0 rgba(255,255,255,0.92), inset 0 -1px 0 rgba(255,255,255,0.25), inset 2px 0 0 rgba(255,255,255,0.7), inset -1px 0 0 rgba(255,255,255,0.2)');
        root.style.setProperty('--glass-blur', `blur(${blur}px) saturate(180%) brightness(1.05)`);
    }
}

function applyThemeVars(theme) {
    const root = document.documentElement;
    const isDark = root.getAttribute('data-theme') === 'dark';
    const vars = isDark ? theme.dark : theme.light;

    if(vars) {
        if(!isDark) {
            if(vars.bg)      root.style.setProperty('--bg-color', vars.bg);
            if(vars.surface) root.style.setProperty('--surface-color', vars.surface);
            if(vars.text)    root.style.setProperty('--text-main', vars.text);
            if(vars.muted)   root.style.setProperty('--text-muted', vars.muted);
            if(vars.border)  root.style.setProperty('--border-color', vars.border);
            if(vars.success) root.style.setProperty('--success', vars.success);
            if(vars.warning) root.style.setProperty('--warning', vars.warning);
            if(vars.danger)  root.style.setProperty('--danger', vars.danger);
        } else {
            if(vars.bg)      root.style.setProperty('--bg-color', vars.bg);
            if(vars.surface) root.style.setProperty('--surface-color', vars.surface);
            if(vars.text)    root.style.setProperty('--text-main', vars.text);
            if(vars.muted)   root.style.setProperty('--text-muted', vars.muted);
            if(vars.border)  root.style.setProperty('--border-color', vars.border);
        }
        const primary = isDark ? (theme.dark?.primary || theme.light?.primary) : theme.light?.primary;
        if(primary) changePrimaryColor(primary);
    }

    // Always apply glass vars (mode-independent)
    if(theme.glass) applyGlassVars(theme.glass);
}

function applyThemePreview() {
    const theme = getEditorThemeValues();
    if(!appData.settings) appData.settings = {};
    appData.settings.customTheme = theme;
    applyThemeVars(theme);
    saveToLocal(true);
}

function resetThemeToDefaults() {
    if(!confirm('Standard-Theme wiederherstellen? Alle aktuellen Anpassungen gehen verloren.')) return;
    if(appData.settings) appData.settings.customTheme = null;
    const root = document.documentElement;
    ['--bg-color','--surface-color','--text-main','--text-muted','--border-color',
     '--success','--warning','--danger','--glass-blur-px','--glass-blur','--glass-opacity','--glass-edge'].forEach(v => root.style.removeProperty(v));
    changePrimaryColor(defaultThemeVars.light.primary);
    appData.customColor = defaultThemeVars.light.primary;
    saveToLocal(true);
    openThemeEditorTab();
    showToast('Standard-Theme wiederhergestellt.', 'info');
}

function saveCurrentTheme() {
    const name = document.getElementById('themeNameInput')?.value.trim();
    if(!name) { showToast('Bitte einen Theme-Namen eingeben.', 'warning'); return; }
    const theme = getEditorThemeValues();
    const themes = getThemes();
    const existing = themes.find(t => t.name === name);
    if(existing) { existing.data = theme; } else { themes.push({ id: '_t' + Date.now(), name, data: theme }); }
    saveThemes(themes);
    applyThemePreview();
    renderThemeSelector();
    showToast(`Theme "${name}" gespeichert.`, 'success');
}

function loadThemeFromSelector() {
    const sel = document.getElementById('themeSelector');
    if(!sel || !sel.value) return;
    const themes = getThemes();
    const theme = themes.find(t => t.id === sel.value);
    if(!theme) return;
    document.getElementById('themeNameInput').value = theme.name;

    const set = (id, val) => { if(val !== undefined && document.getElementById(id)) document.getElementById(id).value = val; };
    const setCheck = (id, val) => { const el = document.getElementById(id); if(el) el.checked = val; };
    const l = theme.data.light || {}; const d = theme.data.dark || {}; const g = theme.data.glass || {};

    set('tc_light_bg', l.bg); set('tc_light_surface', l.surface); set('tc_light_text', l.text);
    set('tc_light_muted', l.muted); set('tc_light_border', l.border); set('tc_light_primary', l.primary);
    set('tc_light_success', l.success); set('tc_light_warning', l.warning); set('tc_light_danger', l.danger);
    set('tc_dark_bg', d.bg); set('tc_dark_surface', d.surface); set('tc_dark_text', d.text);
    set('tc_dark_muted', d.muted); set('tc_dark_border', d.border); set('tc_dark_primary', d.primary);

    const blurVal  = (g.blur    !== undefined) ? g.blur    : defaultThemeVars.glass.blur;
    set('tc_glass_blur', blurVal);
    const derivedOpac = Math.round(40 + (blurVal / 40) * 40);
    set('tc_glass_opacity', derivedOpac);
    const blurLabel = document.getElementById('tc_glass_blur_val');
    if(blurLabel)  blurLabel.textContent  = blurVal + 'px';

    applyThemePreview();
    showToast(`Theme "${theme.name}" geladen.`, 'success');
}

function renameCurrentTheme() {
    const sel = document.getElementById('themeSelector');
    if(!sel || !sel.value) { showToast('Bitte zuerst ein Theme auswählen.', 'warning'); return; }
    const newName = document.getElementById('themeNameInput')?.value.trim();
    if(!newName) { showToast('Bitte einen neuen Namen eingeben.', 'warning'); return; }
    const themes = getThemes();
    const theme = themes.find(t => t.id === sel.value);
    if(!theme) return;
    const oldName = theme.name;
    theme.name = newName;
    saveThemes(themes);
    const savedId = sel.value;
    renderThemeSelector();
    const newSel = document.getElementById('themeSelector');
    if(newSel) newSel.value = savedId;
    showToast(`Theme umbenannt: "${oldName}" → "${newName}"`, 'success');
}

function deleteCurrentTheme() {
    const sel = document.getElementById('themeSelector');
    if(!sel || !sel.value) { showToast('Bitte zuerst ein Theme auswählen.', 'warning'); return; }
    const themes = getThemes();
    const theme = themes.find(t => t.id === sel.value);
    if(!theme) return;
    if(!confirm(`Theme "${theme.name}" wirklich löschen?`)) return;
    saveThemes(themes.filter(t => t.id !== sel.value));
    renderThemeSelector();
    showToast(`Theme "${theme.name}" gelöscht.`, 'info');
}

function renderThemeSelector() {
    const sel = document.getElementById('themeSelector');
    const preview = document.getElementById('themePreviewRow');
    if(!sel) return;
    const themes = getThemes();
    const currentId = sel.value;
    sel.innerHTML = '<option value="">-- Theme auswählen --</option>' +
        themes.map(t => `<option value="${t.id}" ${t.id === currentId ? 'selected' : ''}>${t.name}</option>`).join('');
    if(preview) {
        preview.innerHTML = themes.map(t => {
            const bg      = t.data?.light?.bg      || '#f3f4f6';
            const primary = t.data?.light?.primary  || '#cca300';
            return `<div class="theme-preview-chip" style="background:${bg}; border-color:${primary}; box-shadow:0 2px 8px rgba(0,0,0,0.1);"
                onclick="document.getElementById('themeSelector').value='${t.id}'; loadThemeFromSelector();" title="${t.name}">
                <span style="width:12px; height:12px; border-radius:50%; background:${primary}; flex-shrink:0; display:inline-block;"></span>
                <span style="color:#1f2937; font-weight:600; font-size:12px;">${t.name}</span>
            </div>`;
        }).join('');
    }
}

function applyStoredThemeOnInit() {
    if(appData.settings && appData.settings.customTheme) {
        applyThemeVars(appData.settings.customTheme);
    }
}

// INIT
performAutoDelete();
changePrimaryColor(appData.customColor);
applyStoredThemeOnInit();
initFilters(); 
renderSidebar();
updateNotificationsBadge(); 
updateShortcutUI(); 
updateActiveUserIcon(); 
renderView();
if (typeof updateAISearchButton === 'function') updateAISearchButton();
if (typeof aiAutoInit === 'function') aiAutoInit();

/* ══════════════════════════════════════════════════════════════
   ANSICHT "HEUTE" — Tagesüberblick im Werkstatt-Stil
   Wiederverwendung vorhandener Bausteine (createTaskCard,
   ttDayInfo, startTimer). Keine neue Datenlogik.
   ══════════════════════════════════════════════════════════════ */
function renderToday(c) {
    const todayIso = ttTodayIso();
    const info = ttDayInfo(todayIso);
    const pct = info.target ? Math.min(100, Math.round(info.total / info.target * 100)) : 0;

    /* Fällige Elemente aller Typen einsammeln: Aufgaben, Stacks, Meilensteine, Checkpunkte */
    const dueItems = [];
    appData.tasks.forEach(t => {
        if (!isTaskDone(t)) { if (t.dueDate) dueItems.push({ kind: 'task', obj: t, dueDate: t.dueDate }); }
        (t.checklist || []).forEach(ci => {
            if (ci.dueDate && !ci.done) dueItems.push({ kind: 'checkpoint', obj: ci, parent: t, dueDate: ci.dueDate });
        });
    });
    appData.projectStacks.forEach(s => {
        if (s.status !== 'completed') { if (s.dueDate) dueItems.push({ kind: 'stack', obj: s, dueDate: s.dueDate }); }
        (s.checklist || []).forEach(ms => {
            if (ms.dueDate && !ms.done) dueItems.push({ kind: 'milestone', obj: ms, parent: s, dueDate: ms.dueDate });
        });
    });
    /* Geplante Abwesenheiten (Urlaub, Krank, Feiertag, Kompensation) als eigene Einträge */
    (appData.absences || []).forEach(a => {
        if (a.date) dueItems.push({ kind: 'absence', obj: a, dueDate: a.date });
    });
    const _dateOf = (it) => (it.dueDate || '').split('T')[0];

    const all = appData.tasks.filter(t => !isTaskDone(t));
    const overdue = dueItems.filter(it => it.kind !== 'absence' && _dateOf(it) < todayIso)
                       .sort((a,b) => _dateOf(a).localeCompare(_dateOf(b)));
    const dueToday = dueItems.filter(it => it.kind !== 'absence' && _dateOf(it) === todayIso);
    /* Wochengrenzen für „Diese Woche" / „Nächste Woche" */
    const _todayD = ttParse(todayIso); const _dowT = (_todayD.getDay() + 6) % 7; /* Mo=0 */
    const endThisWeekIso = ttShiftIso(todayIso, 6 - _dowT);       /* bis Sonntag dieser Woche */
    const endNextWeekIso = ttShiftIso(endThisWeekIso, 7);        /* Sonntag nächster Woche */
    const soon = dueItems.filter(it => _dateOf(it) > todayIso && _dateOf(it) <= endThisWeekIso)
                    .sort((a,b) => _dateOf(a).localeCompare(_dateOf(b)));
    const nextWeek = dueItems.filter(it => _dateOf(it) > endThisWeekIso && _dateOf(it) <= endNextWeekIso)
                    .sort((a,b) => _dateOf(a).localeCompare(_dateOf(b)));
    const later = dueItems.filter(it => _dateOf(it) > endNextWeekIso)
                    .sort((a,b) => _dateOf(a).localeCompare(_dateOf(b)));

    const running = (typeof activeTimers === 'object' && activeTimers)
        ? Object.keys(activeTimers).map(id => appData.tasks.find(t => t.id === id)).filter(Boolean) : [];

    /* offene Buchungstage der letzten zwei Wochen */
    const openDays = [];
    for (let i = 14; i >= 1; i--) {
        const iso = ttShiftIso(todayIso, -i);
        const d = ttDayInfo(iso);
        if (d.status === 'missing' || d.status === 'partial') openDays.push(d);
    }

    const greeting = (() => {
        const h = new Date().getHours();
        if (h < 11) return t('today_morning');
        if (h < 17) return t('today_day');
        return t('today_evening');
    })();
    const userName = (() => {
        const u = (appData.users || []).find(u => u.id === appData.settings.currentUserId);
        return u ? u.name.split(' ')[0] : '';
    })();

    /* Kennzahlen für die grafische Übersicht */
    const doneAll = appData.tasks.filter(t => isTaskDone(t)).length;
    const totalAll = appData.tasks.length;
    const donePct = totalAll ? Math.round(doneAll / totalAll * 100) : 0;
    const _now = new Date(); const _dow = (_now.getDay() + 6) % 7;
    const weekStartIso = ttShiftIso(todayIso, -_dow);
    let doneThisWeek = 0;
    const weekStartMs = ttParse(weekStartIso).getTime();
    appData.tasks.forEach(t => { if (isTaskDone(t) && t.completedAt && t.completedAt >= weekStartMs) doneThisWeek++; });
    let weekSoll = 0, weekIst = 0;
    for (let i = 0; i <= 6; i++) { const iso = ttShiftIso(weekStartIso, i); const di = ttDayInfo(iso); weekSoll += di.target; weekIst += di.total; }
    const weekPct = weekSoll ? Math.min(100, Math.round(weekIst / weekSoll * 100)) : 0;
    const openCount = overdue.length + dueToday.length + soon.length;

    /* Bisher vergangene Arbeitszeit heute: vom Arbeitsbeginn bis jetzt, gedeckelt auf das Tagessoll. */
    const _target = info.target || ttTargetHours();
    let _elapsed = 0;
    {
        const startStr = appData.settings.timeTrackFrom || '08:00';
        const m = /^(\d{1,2}):(\d{2})$/.exec(startStr);
        const startH = m ? (parseInt(m[1], 10) + parseInt(m[2], 10) / 60) : 8;
        const nowH = _now.getHours() + _now.getMinutes() / 60;
        _elapsed = Math.max(0, Math.min(_target, nowH - startH));
    }
    const _booked = info.total || 0;
    const _openToTarget = Math.max(0, _target - _booked);   /* noch offen bis zum Tagessoll */
    const _elapsedPct = _target ? Math.min(100, Math.round(_elapsed / _target * 100)) : 0;
    const _bookedPct = _target ? Math.min(100, Math.round(_booked / _target * 100)) : 0;

    let html = `<div class="wk-today">`;

    /* Held: gebuchte Zeit als physische Schiene — volle Breite */
    const ring = (p, label, sub, cls) => `<div class="wk-stat"><div class="wk-stat-ring ${cls||''}" style="--p:${p}"><span>${p}<u>%</u></span></div><div class="wk-stat-txt"><b>${label}</b><u>${sub}</u></div></div>`;
    html += `<section class="wk-hero compact">
        <div class="wk-hero-left">
            <span class="wk-hero-eyebrow">${greeting}${userName ? ', ' + escapeHtmlToday(userName) : ''} · ${ttFmtFull(todayIso)}</span>
            <div class="wk-hero-num">${ttNum(info.total)}<small>${t('today_of')} ${ttNum(info.target || 0)} h</small></div>
            <div class="wk-hero-track" title="${ttNum(_booked)} h gebucht · ${ttNum(_elapsed)} h vergangen · Soll ${ttNum(_target)} h">
                <span class="wk-elapsed" style="width:${_elapsedPct}%"></span>
                <i class="wk-booked" style="width:${_bookedPct}%"></i>
                <span class="wk-track-label">${ttNum(_openToTarget)} von ${ttNum(_target)} h offen</span>
            </div>
            <p class="wk-hero-note">${info.missing > 0.01
                ? t('today_missing_pre') + ' ' + ttNum(info.missing) + ' ' + t('today_missing_post').replace('{n}', overdue.length + dueToday.length)
                : t('today_complete').replace('{n}', overdue.length + dueToday.length)}</p>
            <div class="wk-hero-acts">
                <button class="wk-hero-cta" onclick="goToTimeTracking()"><i class="fas fa-clock"></i> ${t('today_book_time')}</button>
            </div>
        </div>
        <div class="wk-hero-stats">
            ${ring(weekPct, t('today_week_quota'), ttNum(weekIst) + ' / ' + ttNum(weekSoll) + ' h', weekPct>=100?'ok':'')}
            ${ring(donePct, t('today_done_share'), doneAll + ' / ' + totalAll + ' ' + t('tasks'), 'accent')}
            <div class="wk-stat wide"><div class="wk-stat-nums">
                <span><b>${doneThisWeek}</b><u>${t('today_done_week')}</u></span>
                <span><b>${openCount}</b><u>${t('today_open')}</u></span>
                <span><b>${overdue.length}</b><u>${t('today_overdue')}</u></span>
            </div></div>
        </div>
        <div class="wk-hero-ticker">
            <div class="wk-ticker-head"><i class="fas fa-wave-square"></i> ${t('today_activity')}</div>
            ${(appData.activityLog && appData.activityLog.length)
                ? `<ul class="wk-ticker-list">${appData.activityLog.slice(0, 6).map(a =>
                    `<li><span class="wk-ticker-ic"><i class="fas ${a.icon || 'fa-circle'}"></i></span><span class="wk-ticker-txt">${escapeHtmlToday(a.text)}</span><time>${ttRelTime(a.ts)}</time></li>`
                  ).join('')}</ul>`
                : `<div class="wk-ticker-empty">${t('today_no_activity')}</div>`}
        </div>
    </section>`;

    /* ── Buchungen der AKTUELLEN WOCHE nach Bucket (farblich) ── */
    const _bkWeekStart = weekStartIso;                        /* Montag dieser Woche (bereits berechnet) */
    const _bkWeekEnd = ttShiftIso(_bkWeekStart, 6);           /* Sonntag dieser Woche */
    const bucketHours = {};
    (appData.timeLogs || []).forEach(l => {
        if (!l.date) return;
        const di = (l.date || '').split('T')[0];
        if (di < _bkWeekStart || di > _bkWeekEnd) return;
        const task = appData.tasks.find(x => x.id === l.taskId);
        const bk = (task && task.bucket) ? task.bucket : t('no_bucket');
        bucketHours[bk] = (bucketHours[bk] || 0) + (parseFloat(l.hours) || 0);
    });
    const bucketRows = Object.keys(bucketHours).map((bk) => ({ name: bk, hours: bucketHours[bk], col: getBucketColor(bk) }))
        .filter(r => r.hours > 0).sort((a, b) => b.hours - a.hours);
    const maxBk = Math.max(1, ...bucketRows.map(r => r.hours));
    const bucketTotal = bucketRows.reduce((s, r) => s + r.hours, 0);
    const trendBars = bucketRows.length
        ? bucketRows.map(r => `<div class="wk-tr-col" title="${escapeHtmlToday(r.name)}: ${ttNum(r.hours)} h"><div class="wk-tr-bar"><span class="wk-tr-fill" style="height:${Math.round(r.hours / maxBk * 100)}%;background:${r.col}"></span></div><u title="${escapeHtmlToday(r.name)}">${escapeHtmlToday(r.name.length > 6 ? r.name.slice(0,6)+'…' : r.name)}</u></div>`).join('')
        : `<div class="wk-tr-empty">${t('today_no_bookings')}</div>`;
    const trendLegend = bucketRows.length
        ? `<div class="wk-trend-legend">${bucketRows.map(r => `<span><i style="background:${r.col}"></i>${escapeHtmlToday(r.name)}: <b>${ttNum(r.hours)} h</b></span>`).join('')}</div>`
        : '';

    /* Statusverteilung: PRIMÄR 1:1 die echten, sichtbaren Kanban-Board-Spalten (appData.statuses, ohne "Abgeschlossen") — Benennung, Reihenfolge und Farbe dynamisch aus den Spalten übernommen, Aufgaben dynamisch pro Spalte gezählt (exakt wie im Kanban Board, inkl. aktiver Filter via getFilteredTasks()). */
    const kanbanCols = appData.statuses.filter(col => col.id !== 'done');
    const byStatus = {}; kanbanCols.forEach(col => { byStatus[col.id] = 0; });
    getFilteredTasks().forEach(t => { if (byStatus[t.status] !== undefined) byStatus[t.status]++; });
    const stTot = Math.max(1, kanbanCols.reduce((sum, col) => sum + byStatus[col.id], 0));
    const stSeg = (col) => byStatus[col.id] ? `<span class="wk-dist-seg" style="width:${byStatus[col.id]/stTot*100}%;background:${getStatusColor(col)}" title="${escapeHtmlToday(col.title)}: ${byStatus[col.id]}"></span>` : '';

    /* Sekundär: offene Stacks sowie genau die Checkpunkte/Meilensteine, die auch unter Wissen/Checklisten bzw. Wissen/Milestones sichtbar sind (gleiche Basis- und Sub-Item-Filterung: getFilteredTasks()/getFilteredStacks(), „Abgeschlossene ausblenden" und Nutzer-Filter). */
    const _visStacksForSecondary = getFilteredStacks();
    const openStacksCount = _visStacksForSecondary.length;
    const _hideDoneCl = appData.settings.globalHideCompleted;
    let openChecklistItems = 0;
    getFilteredTasks().forEach(t_obj => {
        let cl = t_obj.checklist || [];
        if (_hideDoneCl) cl = cl.filter(ci => !ci.done);
        if (activeFilters.users.length > 0 && !activeFilters.users.includes(t_obj.assigneeId || '')) { cl = cl.filter(ci => activeFilters.users.includes(ci.assigneeId || '')); }
        openChecklistItems += cl.length;
    });
    _visStacksForSecondary.forEach(s => {
        let cl = s.checklist || [];
        if (_hideDoneCl) cl = cl.filter(ms => !ms.done);
        if (activeFilters.users.length > 0 && !activeFilters.users.includes(s.assigneeId || '')) { cl = cl.filter(ms => activeFilters.users.includes(ms.assigneeId || '')); }
        openChecklistItems += cl.length;
    });
    const secondaryParts = [];
    if (openStacksCount > 0) secondaryParts.push(t('today_open_stacks_extra').replace('{n}', openStacksCount));
    if (openChecklistItems > 0) secondaryParts.push(t('today_open_checklist_extra').replace('{n}', openChecklistItems));
    const secondaryLine = secondaryParts.join(' · ');

    /* Prioritätenverteilung offener Aufgaben */
    const byPrio = { high:0, medium:0, low:0 };
    appData.tasks.forEach(t => { if (!isTaskDone(t) && byPrio[t.priority] !== undefined) byPrio[t.priority]++; });
    const prTot = Math.max(1, byPrio.high + byPrio.medium + byPrio.low);

    html += `<section class="wk-graphs">
        <div class="wk-graph-card">
            <div class="wk-graph-h"><b>${t('today_trend')}</b><u>${t('today_this_week')}</u></div>
            <div class="wk-trend">${trendBars}</div>
            ${trendLegend}
        </div>
        <div class="wk-graph-card">
            <div class="wk-graph-h"><b>${t('today_status_dist')}</b><u>${stTot} ${t('today_open')}</u></div>
            <div class="wk-dist">${kanbanCols.map(col => stSeg(col)).join('')}</div>
            <div class="wk-dist-legend">${kanbanCols.map(col => `<span><i style="background:${getStatusColor(col)}"></i>${escapeHtmlToday(col.title)}: ${byStatus[col.id]}</span>`).join('')}</div>
            ${secondaryLine ? `<div style="margin-top:10px; padding-top:8px; border-top:1px solid var(--border-color); font-size:11px; color:var(--text-muted); display:flex; align-items:center; gap:5px;"><i class="fas fa-layer-group"></i> ${secondaryLine}</div>` : ''}
        </div>
        <div class="wk-graph-card">
            <div class="wk-graph-h"><b>${t('today_prio_dist')}</b><u>${prTot} ${t('today_open')}</u></div>
            <div class="wk-prio">
                <div class="wk-prio-row"><span class="wk-prio-lbl" style="color:var(--danger)">${t('prio_high')}</span><div class="wk-prio-track"><i style="width:${byPrio.high/prTot*100}%;background:var(--danger)"></i></div><b>${byPrio.high}</b></div>
                <div class="wk-prio-row"><span class="wk-prio-lbl" style="color:var(--warning)">${t('prio_med')}</span><div class="wk-prio-track"><i style="width:${byPrio.medium/prTot*100}%;background:var(--warning)"></i></div><b>${byPrio.medium}</b></div>
                <div class="wk-prio-row"><span class="wk-prio-lbl" style="color:var(--success)">${t('prio_low')}</span><div class="wk-prio-track"><i style="width:${byPrio.low/prTot*100}%;background:var(--success)"></i></div><b>${byPrio.low}</b></div>
            </div>
        </div>
    </section>`;

    /* Zwei Spalten: Hauptspalte (Aufgaben), Seitenspalte (Timer + Zeitkonto) */
    html += `<div class="wk-today-grid">`;

    /* ── Hauptspalte ── */
    html += `<div class="wk-today-main">`;

    const urgent = overdue.concat(dueToday);
    html += `<div class="wk-strip-h"><b>${t('today_urgent')}</b><span class="wk-count">${urgent.length}</span><span class="wk-rule"></span>
        <button class="wk-linkbtn" onclick="switchView('kanban')">${t('today_all_tasks')}</button></div>`;
    if (urgent.length) {
        html += `<div class="wk-today-list" id="wkTodayUrgent"></div>`;
    } else {
        html += `<div class="wk-empty"><i class="fas fa-check-circle"></i><b>${t('today_none_urgent')}</b><span>${t('today_none_urgent_sub')}</span></div>`;
    }

    if (soon.length) {
        html += `<div class="wk-strip-h"><b>${t('today_this_week')}</b><span class="wk-count">${soon.length}</span><span class="wk-rule"></span></div>
        <div class="wk-today-list" id="wkTodaySoon"></div>`;
    }
    if (nextWeek.length) {
        html += `<div class="wk-strip-h"><b>${t('today_next_week')}</b><span class="wk-count">${nextWeek.length}</span><span class="wk-rule"></span></div>
        <div class="wk-today-list" id="wkTodayNext"></div>`;
    }
    if (later.length) {
        html += `<div class="wk-strip-h"><b>${t('today_later')}</b><span class="wk-count">${later.length}</span><span class="wk-rule"></span></div>
        <div class="wk-today-list" id="wkTodayLater"></div>`;
    }
    html += `</div>`; /* /wk-today-main */

    /* ── Seitenspalte ── */
    html += `<div class="wk-today-side">`;

    if (running.length) {
        html += `<div class="wk-strip-h"><b>${t('today_running')}</b><span class="wk-count">${running.length}</span><span class="wk-rule"></span></div>
        <div class="wk-run">`;
        running.forEach(tk => {
            html += `<button class="wk-run-card" onclick="goToTimeTracking()">
                <span class="wk-run-dot"></span>
                <span class="wk-run-name">${escapeHtmlToday(tk.projectName)}</span>
                <i class="fas fa-stopwatch"></i>
            </button>`;
        });
        html += `</div>`;
    }

    html += `<div class="wk-strip-h"><b>${t('today_unbooked')}</b><span class="wk-count">${openDays.length}</span><span class="wk-rule"></span>
        <button class="wk-linkbtn" onclick="goToTimeTracking()">${t('view_time')}</button></div>`;
    if (openDays.length) {
        openDays.slice(-5).reverse().forEach(d => {
            html += `<div class="wk-quickrow">
                <span class="wk-qd">${ttFmtFull(d.iso)}<u>${t('tt_missing')}: ${ttNum(d.missing)} h ${t('tt_of')} ${ttNum(d.target)} h</u></span>
                <span class="wk-qacts">
                    <button class="wk-chip v" onclick="ttHeuteAbs('${d.iso}','vacation')">${t('abs_vacation')}</button>
                    <button class="wk-chip k" onclick="ttHeuteAbs('${d.iso}','sick')">${t('abs_sick')}</button>
                    <button class="wk-chip t" onclick="ttHeuteBook('${d.iso}')"><i class="fas fa-clock"></i> ${t('tt_book_task')}</button>
                </span>
            </div>`;
        });
    } else {
        html += `<div class="wk-empty small"><i class="fas fa-check-circle"></i><b>${t('today_all_booked')}</b></div>`;
    }
    html += `</div>`; /* /wk-today-side */

    html += `</div>`; /* /wk-today-grid */

    html += `</div>`;
    c.innerHTML = html;

    /* Karten mit der bestehenden createTaskCard() füllen */
    const fill = (id, list) => {
        const box = document.getElementById(id);
        if (!box) return;
        list.forEach(it => {
            if (it.kind === 'task') { box.appendChild(createTaskCard(it.obj)); }
            else { box.appendChild(createTodayItemCard(it)); }
        });
    };
    fill('wkTodayUrgent', urgent);
    fill('wkTodaySoon', soon);
    fill('wkTodayNext', nextWeek);
    fill('wkTodayLater', later);
}

/* Mini-Karte für Stacks, Meilensteine und Checkpunkte in der Heute-Ansicht */
function createTodayItemCard(it) {
    const card = document.createElement('div');
    card.className = 'task-card wk-today-item';

    /* Abwesenheiten eigens darstellen */
    if (it.kind === 'absence') {
        const a = it.obj;
        const col = ttAbsColor(a.type);
        card.classList.add('wk-today-absence');
        card.style.setProperty('--card-strip', col);
        card.style.cursor = 'pointer';
        card.onclick = () => { try { goToTimeTracking(); } catch(e){} };
        const dueStr = (it.dueDate || '').split('T')[0];
        card.innerHTML = `<div class="wk-card">
            <div class="wk-card-top">
                <div class="wk-card-tags">
                    <span class="wk-c-kind" style="color:${col}"><i class="fas ${ttAbsIcon(a.type)}"></i> ${ttAbsLabel(a.type)}</span>
                </div>
            </div>
            ${a.note ? `<div class="task-title">${escapeHtmlToday(a.note)}</div>` : ''}
            <div class="wk-card-foot">
                <div class="wk-card-foot-l"><span class="wk-c-due"><i class="far fa-calendar-alt"></i> ${dueStr}</span></div>
                <div class="wk-card-foot-r"><span class="wk-c-hours">${ttNum(a.hours)} h</span></div>
            </div>
        </div>`;
        return card;
    }

    const parentId = it.parent ? it.parent.id : '';
    /* Streifenfarbe: Statusfarbe (dynamisch aus Einstellungen) */
    const taskStripColor = (tk) => {
        if (!tk || !tk.status) return 'var(--border-color)';
        const _st = appData.statuses.find(s => s.id === tk.status);
        if (_st && _st.color) return _st.color;
        /* Fallback auf Defaults */
        const defaults = { done:'#1F9463', inProgress:'#0F5FDC' };
        return defaults[tk.status] || 'var(--border-color)';
    };
    const meta = {
        stack:      { ic: 'fa-folder',       label: 'Stack',              strip: (it.obj && it.obj.color) ? it.obj.color : 'var(--primary-color)', click: `openStackModal('${it.obj.id}')` },
        milestone:  { ic: 'fa-flag',         label: t('milestones'),      strip: (it.parent && it.parent.color) ? it.parent.color : '#E8A317', click: `openStackModal('${parentId}')` },
        checkpoint: { ic: 'fa-check-square', label: t('view_checklists'), strip: taskStripColor(it.parent), click: `openTaskToCheckpoint('${parentId}','${it.obj.id}')` }
    }[it.kind];
    card.style.setProperty('--card-strip', meta.strip);
    if (it.kind === 'checkpoint') card.classList.add('wk-cp-striped');   /* schräges Muster überlagert den Streifen */
    card.style.cursor = 'pointer';
    card.onclick = () => { try { eval(meta.click); } catch(e){} };
    const name = it.obj.name || it.obj.title || it.obj.projectName || 'Unbenannt';
    const parentName = it.parent ? (it.parent.name || it.parent.projectName || '') : '';
    const dueStr = (it.dueDate || '').split('T')[0];
    let cpActions = '';
    if (it.kind === 'checkpoint' && it.parent) {
        const _idx = (it.parent.checklist || []).findIndex(c => c.id === it.obj.id);
        cpActions = `<div class="wk-card-actions">
            <button class="secondary icon-btn wk-booktime" onclick="event.stopPropagation(); quickTrackTime('${it.parent.id}', decodeURIComponent('${encodeURIComponent(it.obj.title||'')}'))" title="${t('today_book_time')}"><i class="fas fa-stopwatch"></i></button>
            <button class="secondary icon-btn wk-cp-complete" onclick="event.stopPropagation(); updateGlobalCl('task','${it.parent.id}',${_idx},'done',true); renderView();" title="${t('mark_done') || 'Abschließen'}"><i class="fas fa-check"></i></button>
        </div>`;
    }
    card.innerHTML = `<div class="wk-card">
        <div class="wk-card-top">
            <div class="wk-card-tags">
                <span class="wk-c-kind"><i class="fas ${meta.ic}"></i> ${meta.label}</span>
                ${parentName ? `<span class="wk-c-parent">${escapeHtmlToday(parentName)}</span>` : ''}
            </div>
            ${cpActions}
        </div>
        <div class="task-title">${escapeHtmlToday(name)}</div>
        <div class="wk-card-foot">
            <div class="wk-card-foot-l"><span class="wk-c-due"><i class="far fa-calendar-alt"></i> ${dueStr}</span></div>
        </div>
    </div>`;
    return card;
}

/* kleine Helfer für die Heute-Ansicht */
function escapeHtmlToday(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function ttShiftIso(iso, days){ const d = ttParse(iso); d.setDate(d.getDate()+days); return ttIso(d); }
function ttRelTime(ts){
    if(!ts) return '';
    const diff = Date.now() - ts; const min = Math.floor(diff/60000);
    if(min < 1) return t('rel_now') || 'gerade eben';
    if(min < 60) return min + ' min';
    const h = Math.floor(min/60); if(h < 24) return h + ' h';
    const d = Math.floor(h/24); if(d < 7) return d + ' d';
    return new Date(ts).toLocaleDateString();
}
function ttFmtFull(iso){
    const d = ttParse(iso);
    const wd = { de:['So','Mo','Di','Mi','Do','Fr','Sa'], en:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], fr:['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'] }[ttLang()] || ['So','Mo','Di','Mi','Do','Fr','Sa'];
    const mo = { de:['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'],
                 en:['January','February','March','April','May','June','July','August','September','October','November','December'],
                 fr:['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'] }[ttLang()]
              || ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
    return wd[d.getDay()] + ', ' + d.getDate() + '. ' + mo[d.getMonth()] + ' ' + d.getFullYear();
}
function ttHeuteAbs(iso, type){
    const info = ttDayInfo(iso);
    ttSetAbsenceRaw(iso, type, info.missing > 0 ? info.missing : (ttTargetHours() || 8));
    saveToLocal(true);
    showToast(ttAbsLabel(type) + ' · ' + ttFmtDate(iso));
    renderView();
}
function ttHeuteBook(iso){
    timeSubView = 'tracking';
    switchView('time');
    setTimeout(() => {
        const d = document.getElementById('tt_date');
        if (d) d.value = iso;
        const box = document.getElementById('tt_manual_box');
        if (box) box.scrollIntoView({ behavior:'smooth', block:'center' });
    }, 120);
}



/* ═══════════════════════════════════════════════════════════════
   SHELL (ehemals shell.js, hier zusammengeführt) — neue Wegführung
   als Schicht über der bestehenden App. Läuft als eigene IIFE.
   ═══════════════════════════════════════════════════════════════ */

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
    { k: 'today', label: 'Hub', icon: 'fa-sun', lenses: [
        { v: 'today', l: 'Hub', i: 'fa-sun' }
    ]},
    { k: 'arbeit', label: 'Arbeit', icon: 'fa-columns', lenses: [
        { v: 'kanban',   l: 'Board',    i: 'fa-columns' },
        { v: 'stacks',   l: 'Stapel',   i: 'fa-folder-open' },
        { v: 'list',     l: 'Liste',    i: 'fa-list' },
        { v: 'schedule', l: 'Kalender', i: 'fa-calendar-alt' },
        { v: 'timeline', l: 'Gantt',    i: 'fa-stream' }
    ]},
    { k: 'wissen', label: 'Wissen', icon: 'fa-sticky-note', lenses: [
        { v: 'notes',      l: 'Notizen',     i: 'fa-sticky-note' },
        { v: 'checklists', l: 'Checklisten', i: 'fa-check-square' },
        { v: 'milestones', l: 'Milestones',  i: 'fa-flag' }
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
      /* Telefon/Tablet: Darkmode, Export & Backup und Profil liegen gebuendelt
         im …-Menue ganz rechts. Auf dem Desktop bleibt das Profil-Kuerzel. */
      if (!document.getElementById('wkMoreChip')) {
        const more = document.createElement('button');
        more.className = 'wk-userchip wk-morechip';
        more.id = 'wkMoreChip';
        more.title = 'Mehr';
        more.setAttribute('aria-label', 'Mehr');
        more.innerHTML = '<i class="fas fa-ellipsis-v"></i>';
        more.onclick = function (e) { e.stopPropagation(); if (typeof openTopMoreMenu === 'function') openTopMoreMenu(); };
        bar.appendChild(more);
      }
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

  function paintCards() {
    if (typeof appData === 'undefined' || !appData.tasks) return;
    document.querySelectorAll('.task-card[data-id]').forEach(el => {
      const task = appData.tasks.find(x => x.id === el.dataset.id);
      if (!task) return;
      /* Statusfarbe dynamisch aus Einstellungen, mit Fallback auf Defaults */
      let c = 'var(--border-color)';
      if (task.status) {
        const st = appData.statuses.find(s => s.id === task.status);
        if (st && st.color) c = st.color;
        else {
          const defaults = { done:'#1F9463', inProgress:'#0F5FDC' };
          c = defaults[task.status] || 'var(--border-color)';
        }
      } else if (el.classList.contains('is-completed')) c = getStatusColor(appData.statuses.find(s => s.id === 'done'));
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
    /* Unterkategorien (Linsen) mitziehen */
    document.querySelectorAll('[data-wklens]').forEach(el => {
      const v = el.dataset.wklens;
      let lens = null;
      PLACES.forEach(p => p.lenses.forEach(l => { if (l.v === v) lens = l; }));
      if (!lens) return;
      const span = el.querySelector('span');
      if (span) span.textContent = lensLabel(lens);
      else {
        const icon = el.querySelector('i');
        el.innerHTML = (icon ? icon.outerHTML : '') + lensLabel(lens);
      }
    });
    /* „Neue Aufgabe“ / „Neuer Stack“ im +-Menü */
    const fabT = document.querySelector('[data-wknew="task"] span');
    if (fabT) fabT.textContent = labelNewTask();
    const fabS = document.querySelector('[data-wknew="stack"] span');
    if (fabS) fabS.textContent = labelNewStack();
    /* Titel der Schienen-Knöpfe */
    const railNew = document.getElementById('wkRailNew');
    if (railNew) { const lbl = t('wk_new_title'); if (lbl && lbl !== 'wk_new_title') { railNew.title = lbl; railNew.setAttribute('aria-label', lbl); } }
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

/* ============================================================
   Kanban Drag & Drop – vollständiger Neuaufbau (Touch + Maus)
   Echtes „Sortable"-Verhalten: die gezogene Karte wird durch einen
   Platzhalter in exakt gleicher Größe ersetzt; die übrigen Karten
   rücken sichtbar weg. Die Zielposition wird über die Mittelpunkte
   der echten Karten bestimmt (nicht über elementFromPoint) – das
   verhindert jede Rückkopplung und damit das Zittern.
   Zwei Aufgaben übereinander -> Stack. Ablegen in „Abgeschlossen"
   -> Sonder-Feedback.
   ============================================================ */
(function () {
    const THRESHOLD = 6;
    let drag = null;   /* { taskId, srcCard, startX, startY, active, ghost, offX, offY, ph, mergeWith } */

    function pt(ev) { const t = ev.touches ? (ev.touches[0] || ev.changedTouches[0]) : ev; return { x: t.clientX, y: t.clientY }; }
    function colOf(el) { return el && el.closest ? el.closest('.kanban-column') : null; }

    function clearFeedback() {
        document.querySelectorAll('.kanban-column.wk-drop-target').forEach(el => el.classList.remove('wk-drop-target'));
        document.querySelectorAll('.kanban-column.drag-over-zone').forEach(el => el.classList.remove('drag-over-zone'));
        document.querySelectorAll('.task-card.wk-merge-target').forEach(el => el.classList.remove('wk-merge-target'));
    }

    function makePlaceholder(h) {
        const ph = document.createElement('div');
        ph.className = 'wk-placeholder';
        ph.style.height = h + 'px';
        return ph;
    }

    /* Zwei Aufgaben übereinander -> Stack bilden */
    function stackTasks(dragId, targetId) {
        const dragTask = appData.tasks.find(t => t.id === dragId);
        const targetTask = appData.tasks.find(t => t.id === targetId);
        if (!dragTask || !targetTask) return;
        let stackId = targetTask.projectStackId;
        if (!stackId) {
            stackId = generateId();
            const baseName = (targetTask.projectName || 'Neues Stack');
            appData.projectStacks.push({ id: stackId, name: baseName, status: 'active', checklist: [], startDate: '', dueDate: '', notes: '', history: '', assigneeId: '', stakeholderId: '', bucket: targetTask.bucket || '', predecessors: [] });
            targetTask.projectStackId = stackId;
        }
        dragTask.projectStackId = stackId;
        /* gleiche Spalte/Status beibehalten wie Zielaufgabe */
        saveToLocal();
        renderView();
        showToast('Aufgaben als Stack gruppiert.');
    }

    function moveTask(taskId, newStatus, beforeId) {
        const task = appData.tasks.find(t => t.id === taskId);
        if (!task) return;
        if (task.status === newStatus) {
            if (!beforeId || beforeId === taskId) return;
            const from = appData.tasks.findIndex(t => t.id === taskId);
            if (from < 0) return;
            const [mv] = appData.tasks.splice(from, 1);
            const to = appData.tasks.findIndex(t => t.id === beforeId);
            appData.tasks.splice(to < 0 ? appData.tasks.length : to, 0, mv);
            saveToLocal(); renderView(); return;
        }
        if (newStatus === 'done' && isEntityLocked(taskId)) { showToast('Aufgabe ist durch Abhängigkeiten gesperrt!', 'warning'); return; }
        checkTaskCompletion(taskId, newStatus);
        const oldStatus = task.status;
        task.status = newStatus;
        if (newStatus === 'done') {
            task.isPaused = false;
            if (!task.completedAt) { task.completedAt = Date.now(); triggerWorkflows('task_completed', { task }); }
        } else { delete task.completedAt; }
        triggerWorkflows('task_status_changed', { task, oldStatus, newStatus });
        if (beforeId && beforeId !== taskId) {
            const from = appData.tasks.findIndex(t => t.id === taskId);
            if (from > -1) { const [mv] = appData.tasks.splice(from, 1); const to = appData.tasks.findIndex(t => t.id === beforeId); appData.tasks.splice(to < 0 ? appData.tasks.length : to, 0, mv); }
        } else if (newStatus === 'done') {
            const i = appData.tasks.findIndex(t => t.id === taskId);
            if (i > -1) { const [mv] = appData.tasks.splice(i, 1); appData.tasks.unshift(mv); }
        }
        saveToLocal(); renderView();
    }

    function onDown(ev) {
        if (currentView !== 'kanban') return;
        if (ev.button !== undefined && ev.button !== 0) return;
        if (ev.target.closest('button, a, input, select, textarea')) return;
        const card = ev.target.closest('.task-card');
        if (!card) return;
        const id = card.dataset.id || card.dataset.taskId;
        if (!id) return;
        const p = pt(ev);
        drag = { taskId: id, srcCard: card, startX: p.x, startY: p.y, active: false, ghost: null, ph: null, mergeWith: null };
    }

    function activate() {
        const card = drag.srcCard;
        const r = card.getBoundingClientRect();
        /* Ghost, der dem Cursor folgt */
        const g = card.cloneNode(true);
        g.className += ' wk-drag-ghost';
        g.style.cssText += `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;pointer-events:none;z-index:9999;opacity:.9;transform:rotate(1.5deg);box-shadow:0 16px 34px rgba(0,0,0,.28);`;
        document.body.appendChild(g);
        drag.ghost = g;
        drag.offX = drag.startX - r.left;
        drag.offY = drag.startY - r.top;
        /* Platzhalter an Stelle der Quellkarte, Quellkarte aus dem Fluss */
        drag.ph = makePlaceholder(r.height);
        card.parentNode.insertBefore(drag.ph, card);
        card.style.display = 'none';
        document.body.style.userSelect = 'none';
        document.body.classList.add('wk-dragging');
    }

    function onMove(ev) {
        if (!drag) return;
        const p = pt(ev);
        if (!drag.active) {
            if (Math.abs(p.x - drag.startX) < THRESHOLD && Math.abs(p.y - drag.startY) < THRESHOLD) return;
            drag.active = true;
            activate();
        }
        if (ev.cancelable) ev.preventDefault();
        drag.ghost.style.left = (p.x - drag.offX) + 'px';
        drag.ghost.style.top = (p.y - drag.offY) + 'px';

        /* Zielspalte bestimmen (Ghost kurz ausblenden, damit er nicht selbst getroffen wird) */
        drag.ghost.style.display = 'none';
        const under = document.elementFromPoint(p.x, p.y);
        drag.ghost.style.display = '';
        clearFeedback();
        const col = colOf(under);
        if (!col) { if (drag.ph) drag.ph.style.display = 'none'; return; }
        drag.ph.style.display = '';
        col.classList.add('wk-drop-target');

        /* „Abgeschlossen"-Spalte: Sonder-Feedback, kein Einsortieren */
        const isDone = col.classList.contains('done-column') || col.dataset.statusId === 'done';
        const srcStatus = (appData.tasks.find(t => t.id === drag.taskId) || {}).status;
        if (isDone && srcStatus !== 'done') {
            col.classList.add('drag-over-zone');
            if (drag.ph && drag.ph.parentNode) drag.ph.parentNode.removeChild(drag.ph);
            drag.mergeWith = null;
            return;
        }

        const host = col.querySelector('.kanban-cards') || col;
        /* Stack-Erkennung: Cursor im mittleren Drittel einer echten Karte */
        const overCard = under.closest ? under.closest('.task-card') : null;
        if (overCard && overCard !== drag.srcCard && overCard.style.display !== 'none') {
            const rr = overCard.getBoundingClientRect();
            const rel = (p.y - rr.top) / rr.height;
            if (rel > 0.34 && rel < 0.66) {
                overCard.classList.add('wk-merge-target');
                drag.mergeWith = overCard.dataset.id || null;
                if (drag.ph && drag.ph.parentNode) drag.ph.parentNode.removeChild(drag.ph);
                return;
            }
        }
        drag.mergeWith = null;

        /* Einsortieren über Mittelpunkte der echten Karten (stabil, kein Zittern) */
        const cards = Array.from(host.querySelectorAll('.task-card')).filter(c => c !== drag.srcCard && c.style.display !== 'none');
        let before = null;
        for (const c of cards) {
            const rc = c.getBoundingClientRect();
            if (p.y < rc.top + rc.height / 2) { before = c; break; }
        }
        if (drag.ph.parentNode !== host || drag.ph.nextElementSibling !== before) {
            host.insertBefore(drag.ph, before);
        }
    }

    function onUp(ev) {
        if (!drag) return;
        const d = drag; drag = null;
        document.body.style.userSelect = '';
        document.body.classList.remove('wk-dragging');
        if (!d.active) return;

        if (d.ghost) d.ghost.remove();
        d.srcCard.style.display = '';

        const p = pt(ev);
        d.ghost && (d.ghost.style.display = 'none');
        const under = document.elementFromPoint(p.x, p.y);
        const col = colOf(under);

        /* Zielposition aus Platzhalter ablesen, bevor er entfernt wird */
        let beforeId = null;
        if (d.ph && d.ph.parentNode) {
            const nx = d.ph.nextElementSibling;
            if (nx && nx.classList.contains('task-card')) beforeId = nx.dataset.id || null;
            d.ph.parentNode.removeChild(d.ph);
        }
        const mergeWith = d.mergeWith;
        clearFeedback();

        if (mergeWith && mergeWith !== d.taskId) { stackTasks(d.taskId, mergeWith); return; }
        if (col && col.dataset.statusId) moveTask(d.taskId, col.dataset.statusId, beforeId);
    }

    function cancel() {
        if (!drag) return;
        if (drag.ghost) drag.ghost.remove();
        if (drag.srcCard) drag.srcCard.style.display = '';
        if (drag.ph && drag.ph.parentNode) drag.ph.parentNode.removeChild(drag.ph);
        drag = null; clearFeedback(); document.body.style.userSelect = ''; document.body.classList.remove('wk-dragging');
    }

    document.addEventListener('touchstart', onDown, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
    document.addEventListener('touchcancel', cancel);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('dragstart', (e) => { if (drag && drag.active) e.preventDefault(); }, true);
})();

/* ---- Build-Kennung: erlaubt zu prüfen, ob wirklich der neue Stand geladen ist ---- */
window.PROMAN_BUILD = '20260804-17';
try { console.info('ProMan Build', window.PROMAN_BUILD); } catch(e) {}
document.addEventListener('DOMContentLoaded', () => {
    try {
        const host = document.getElementById('set_attachment_folder');
        const tab = document.getElementById('set-general');
        if (tab && !document.getElementById('wkBuildTag')) {
            const tag = document.createElement('div');
            tag.id = 'wkBuildTag';
            tag.style.cssText = 'margin-top:14px;font-size:11px;color:var(--text-muted);font-family:var(--ff-data);';
            tag.textContent = 'Build ' + window.PROMAN_BUILD;
            tab.appendChild(tag);
        }
    } catch (e) {}
});

/* ============================================================
   Checklistenpunkte: Drag & Drop – vollständiger Neuaufbau
   Mit der Maus ist der GANZE Punkt greifbar (außer Eingabefeldern
   und Bedien-Icons); auf Touch startet das Ziehen am Griff (.cl-drag),
   damit der horizontale Wisch-zum-Löschen erhalten bleibt. Ein klar
   sichtbarer Platzhalter zeigt die Zielposition, die übrigen Punkte
   rücken animiert weg. Die Zielposition wird über die Mittelpunkte
   der echten Punkte bestimmt (stabil, kein Zittern).
   ============================================================ */
(function () {
    const THRESHOLD = 5;
    let cd = null;

    function pt(ev) { const t = ev.touches ? (ev.touches[0] || ev.changedTouches[0]) : ev; return { x: t.clientX, y: t.clientY }; }

    function startFrom(ev, isTouch) {
        if (ev.button !== undefined && ev.button !== 0) return null;
        /* Bedien-Elemente nie als Drag-Start werten */
        if (ev.target.closest('input, textarea, select, a, button, .cl-info-btn, .cl-done, .cl-assignee-pick, .cl-assignee-menu, .cl-delete-btn, .cl-deps-display')) return null;
        if (isTouch) {
            /* Auf Touch nur am Griff ziehen (sonst Konflikt mit Swipe-to-delete) */
            const handle = ev.target.closest ? ev.target.closest('.cl-drag') : null;
            if (!handle) return null;
            return handle.closest('.checklist-item');
        }
        /* Maus: ganzer Punkt greifbar */
        return ev.target.closest ? ev.target.closest('.checklist-item') : null;
    }

    function onDown(ev, isTouch) {
        const item = startFrom(ev, isTouch);
        if (!item) return;
        const container = item.parentNode;
        if (!container) return;
        const p = pt(ev);
        cd = { item, container, startX: p.x, startY: p.y, active: false, ghost: null, ph: null, isTouch };
    }

    function activate() {
        const item = cd.item;
        const r = item.getBoundingClientRect();
        const g = item.cloneNode(true);
        g.className += ' cl-drag-ghost';
        g.style.cssText += `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;pointer-events:none;z-index:99999;opacity:.95;box-shadow:0 16px 34px rgba(0,0,0,.30);border-radius:10px;background:var(--surface-color);`;
        document.body.appendChild(g);
        cd.ghost = g;
        cd.offX = cd.startX - r.left;
        cd.offY = cd.startY - r.top;
        cd.ph = document.createElement('div');
        cd.ph.className = 'cl-placeholder';
        cd.ph.style.height = r.height + 'px';
        item.parentNode.insertBefore(cd.ph, item);
        item.style.display = 'none';
        document.body.style.userSelect = 'none';
        document.body.classList.add('cl-dragging');
    }

    function onMove(ev) {
        if (!cd) return;
        const p = pt(ev);
        if (!cd.active) {
            const dx = Math.abs(p.x - cd.startX), dy = Math.abs(p.y - cd.startY);
            if (dx < THRESHOLD && dy < THRESHOLD) return;
            /* Auf Touch nur bei überwiegend vertikaler Bewegung starten (horizontale = Swipe) */
            if (cd.isTouch && dx > dy) { cd = null; return; }
            cd.active = true;
            activate();
        }
        if (ev.cancelable) ev.preventDefault();
        cd.ghost.style.left = (p.x - cd.offX) + 'px';
        cd.ghost.style.top = (p.y - cd.offY) + 'px';

        const items = Array.from(cd.container.querySelectorAll('.checklist-item')).filter(c => c !== cd.item && c.style.display !== 'none');
        let before = null;
        for (const c of items) {
            const rc = c.getBoundingClientRect();
            if (p.y < rc.top + rc.height / 2) { before = c; break; }
        }
        if (cd.ph.parentNode !== cd.container || cd.ph.nextElementSibling !== before) {
            cd.container.insertBefore(cd.ph, before);
        }
    }

    function finish() {
        if (!cd) return;
        const d = cd; cd = null;
        document.body.style.userSelect = '';
        document.body.classList.remove('cl-dragging');
        if (!d.active) return;
        if (d.ghost) d.ghost.remove();
        if (d.ph && d.ph.parentNode) { d.ph.parentNode.insertBefore(d.item, d.ph); d.ph.parentNode.removeChild(d.ph); }
        d.item.style.display = '';

        /* Array synchronisieren, falls Parent auflösbar (Notizen-/Milestones-Ansicht) */
        const first = d.container.querySelector('.checklist-item');
        const ptype = first ? first.getAttribute('data-parent-type') : null;
        const pid = first ? first.getAttribute('data-parent-id') : null;
        if (ptype && pid) {
            const parent = ptype === 'stack' ? appData.projectStacks.find(x => x.id === pid) : appData.tasks.find(x => x.id === pid);
            if (parent && Array.isArray(parent.checklist)) {
                const ids = Array.from(d.container.querySelectorAll('.checklist-item')).map(el => el.getAttribute('data-id'));
                parent.checklist.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
                saveToLocal(true);
                const mc = document.getElementById('mainContainer');
                if (currentView === 'notes' && mc) renderNotesView(mc);
                else if (mc && typeof renderChecklists === 'function') renderChecklists(mc);
            }
        }
        /* Im Modal genügt die geänderte DOM-Reihenfolge – sie wird beim Speichern gelesen. */
    }

    function cancel() {
        if (!cd) return;
        if (cd.ghost) cd.ghost.remove();
        if (cd.item) cd.item.style.display = '';
        if (cd.ph && cd.ph.parentNode) cd.ph.parentNode.removeChild(cd.ph);
        cd = null; document.body.style.userSelect = ''; document.body.classList.remove('cl-dragging');
    }

    document.addEventListener('mousedown', (e) => onDown(e, false));
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', finish);
    document.addEventListener('touchstart', (e) => onDown(e, true), { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', finish);
    document.addEventListener('touchcancel', cancel);
})();

/* ============================================================
   ONBOARDING: Product-Tour + Ersteinrichtung
   Läuft nur beim ersten Start bzw. wenn noch keine Daten existieren.
   Jeder Eingabeschritt ist überspringbar.
   ============================================================ */
(function () {
    function shouldRun() {
        if (!appData || !appData.settings) return false;
        if (appData.settings.onboardingCompleted) return false;
        const noTasks = !appData.tasks || appData.tasks.length === 0;
        const noStacks = !appData.projectStacks || appData.projectStacks.length === 0;
        /* Der ausgelieferte Standard-Nutzer „Max Mustermann" zählt noch als leer. */
        const users = appData.users || [];
        const onlyDefaultUser = users.length === 0 || (users.length === 1 && (users[0].id === 'u1' || users[0].name === 'Max Mustermann'));
        return noTasks && noStacks && onlyDefaultUser;
    }

    const WEEK = [['1', 'Mo'], ['2', 'Di'], ['3', 'Mi'], ['4', 'Do'], ['5', 'Fr'], ['6', 'Sa'], ['0', 'So']];

    /* ---------- Product-Tour-Folien ---------- */
    const tour = [
        { icon: 'fa-hand-sparkles', title: 'Willkommen bei ProMan', text: 'Deine Werkstatt für Projekte, Aufgaben und Zeit. In wenigen Schritten ist alles startklar – hier eine kurze Tour.', place: 'today' },
        { icon: 'fa-gauge-high', title: 'Hub – dein Tagesüberblick', text: 'Der Hub zeigt gebuchte und offene Stunden, anstehende Fälligkeiten und deine Auslastung auf einen Blick.', place: 'today' },
        { icon: 'fa-table-columns', title: 'Arbeit – Kanban, Liste, Zeitplan', text: 'Aufgaben ziehst du per Drag & Drop zwischen Spalten. Zwei Aufgaben übereinander bilden ein Stack. Alles auch als Liste, Kalender oder Gantt.', place: 'arbeit' },
        { icon: 'fa-clock', title: 'Zeit erfassen', text: 'Buche Arbeitszeit je Aufgabe oder Checklistenpunkt. Soll-/Ist-Stunden, Abwesenheiten und ein Zeitkonto sind eingebaut.', place: 'zeit' },
        { icon: 'fa-project-diagram', title: 'Abhängigkeiten & Verwaltung', text: 'Verknüpfe Aufgaben und Checklistenpunkte, verwalte Stakeholder, Buckets und Workflows. Jetzt richten wir die Basis ein.', place: 'verwaltung' }
    ];

    let ov, body, footer, stepIdx, tourIdx;
    const collected = {};

    function overlay() {
        ov = document.createElement('div');
        ov.className = 'onb-overlay';
        ov.innerHTML = `<div class="onb-card">
            <div class="onb-progress"><span class="onb-progress-fill"></span></div>
            <div class="onb-body"></div>
            <div class="onb-footer"></div>
        </div>`;
        document.body.appendChild(ov);
        body = ov.querySelector('.onb-body');
        footer = ov.querySelector('.onb-footer');
    }

    function setProgress(frac) {
        const f = ov.querySelector('.onb-progress-fill');
        if (f) f.style.width = Math.round(frac * 100) + '%';
    }

    /* ---------- Tour ---------- */
    function showTour() {
        const s = tour[tourIdx];
        setProgress((tourIdx + 1) / (tour.length + 8));
        /* Passenden Bereich im Hintergrund anwählen, damit der Nutzer sieht, wo er ihn findet */
        if (s.place && window.Shell && typeof window.Shell.goPlace === 'function') {
            try { window.Shell.goPlace(s.place); } catch (e) {}
        }
        /* Overlay während der Tour zur Seite rücken, damit der Bereich sichtbar bleibt */
        ov.classList.add('onb-touring');
        body.innerHTML = `<div class="onb-tour">
            <div class="onb-tour-ic"><i class="fas ${s.icon}"></i></div>
            <h2>${s.title}</h2>
            <p>${s.text}</p>
            ${tourIdx === 0 ? `<button class="onb-demo-btn" id="onbDemo"><i class="fas fa-wand-magic-sparkles"></i> Mit Demo-Daten starten</button><div class="onb-demo-note">Beispiel-Projekte eines Marketing-Teams (Briefe &amp; Papiertragetaschen) inkl. Zeitbuchungen, Urlaub/Krankheit und Abhängigkeiten.</div>` : ''}
            <div class="onb-dots">${tour.map((_, i) => `<span class="${i === tourIdx ? 'on' : ''}"></span>`).join('')}</div>
        </div>`;
        footer.innerHTML = `
            <button class="onb-skip" id="onbSkipTour">Tour überspringen</button>
            <div class="onb-nav">
                ${tourIdx > 0 ? `<button class="secondary" id="onbTourBack">Zurück</button>` : ''}
                <button id="onbTourNext">${tourIdx < tour.length - 1 ? 'Weiter' : 'Einrichtung starten'}</button>
            </div>`;
        document.getElementById('onbSkipTour').onclick = startForm;
        document.getElementById('onbTourNext').onclick = () => { if (tourIdx < tour.length - 1) { tourIdx++; showTour(); } else startForm(); };
        const bk = document.getElementById('onbTourBack'); if (bk) bk.onclick = () => { tourIdx--; showTour(); };
        const demo = document.getElementById('onbDemo'); if (demo) demo.onclick = runDemo;
    }

    function runDemo() {
        /* Aus den Einstellungen mit bestehenden Daten gestartet? Dann Sicherung anbieten. */
        const hasData = (appData.tasks && appData.tasks.length) || (appData.projectStacks && appData.projectStacks.length);
        if (hasData) {
            const backup = confirm('Es sind bereits Daten vorhanden. Sollen die aktuellen Daten vorher als Sicherung (JSON) heruntergeladen werden?\n\nOK = Sicherung herunterladen und fortfahren\nAbbrechen = ohne Sicherung fortfahren');
            if (backup) { try { exportJSON(); } catch (e) {} }
            if (!confirm('Demo-Daten jetzt erzeugen? Die vorhandenen Projekte, Aufgaben und Buchungen werden dabei ersetzt.')) return;
        }
        try { generateDemoData(); } catch (e) { console.error('Demo-Daten-Fehler', e); }
        appData.settings.onboardingCompleted = true;
        saveToLocal(true);
        if (ov) ov.remove();
        try { renderSidebar(); } catch (e) {}
        try { switchView('today'); } catch (e) { try { renderView(); } catch (e2) {} }
        try { showToast('Demo-Daten erzeugt – viel Spaß beim Ausprobieren!'); } catch (e) {}
    }

    /* ---------- Formular-Schritte ---------- */
    const steps = [
        {
            key: 'name', icon: 'fa-user', title: 'Dein Name', hint: 'Wie heißt du (Team-Mitglied)? Damit legen wir dein Profil an.',
            render: () => `<input type="text" id="onb_name" placeholder="z. B. Alex Muster" value="${collected.name || ''}">`,
            save: () => { const v = (document.getElementById('onb_name').value || '').trim(); if (v) collected.name = v; }
        },
        {
            key: 'workdays', icon: 'fa-calendar-week', title: 'Arbeitstage', hint: 'An welchen Wochentagen arbeitest du?',
            render: () => { const cur = collected.workDays || (appData.settings.workDays || [1, 2, 3, 4, 5]).map(String); return `<div class="onb-week">${WEEK.map(([v, l]) => `<button type="button" class="onb-day ${cur.includes(v) ? 'on' : ''}" data-d="${v}" onclick="this.classList.toggle('on')">${l}</button>`).join('')}</div>`; },
            save: () => { const days = Array.from(body.querySelectorAll('.onb-day.on')).map(b => b.dataset.d); collected.workDays = days; }
        },
        {
            key: 'hours', icon: 'fa-business-time', title: 'Arbeitszeiten', hint: 'Von wann bis wann arbeitest du üblicherweise?',
            render: () => `<div class="onb-row2"><label>Von<input type="time" id="onb_from" value="${collected.from || appData.settings.timeTrackFrom || '08:00'}"></label><label>Bis<input type="time" id="onb_to" value="${collected.to || appData.settings.timeTrackTo || '17:00'}"></label></div>`,
            save: () => { collected.from = document.getElementById('onb_from').value; collected.to = document.getElementById('onb_to').value; }
        },
        {
            key: 'target', icon: 'fa-hourglass-half', title: 'Soll-Stunden pro Tag', hint: 'Wie viele Stunden willst du pro Arbeitstag einplanen?',
            render: () => `<input type="number" id="onb_target" min="0" max="24" step="0.25" placeholder="8" value="${collected.target != null ? collected.target : (appData.settings.targetHoursPerDay || 8)}">`,
            save: () => { const v = parseFloat(document.getElementById('onb_target').value); if (!isNaN(v) && v > 0) collected.target = v; }
        },
        {
            key: 'email', icon: 'fa-envelope', title: 'E-Mail', hint: 'Für Benachrichtigungen (optional).',
            render: () => `<input type="email" id="onb_email" placeholder="name@firma.de" value="${collected.email || appData.settings.notificationEmail || ''}">`,
            save: () => { const v = (document.getElementById('onb_email').value || '').trim(); if (v) collected.email = v; }
        },
        {
            key: 'columns', icon: 'fa-table-columns', title: 'Kanban-Spalten', hint: 'Passe die Spalten deines Boards an (eine pro Zeile). Die Spalte „Abgeschlossen" ist ein fester System-Standard.',
            render: () => { const cur = collected.columns || (appData.statuses || []).filter(s => s.id !== 'done').map(s => s.title); return `<textarea id="onb_cols" rows="4" placeholder="Zu erledigen\nIn Bearbeitung\nPrüfung">${cur.join('\n')}</textarea><div class="onb-fixed-col"><i class="fas fa-lock"></i> Abgeschlossen <span>(System-Standard)</span></div>`; },
            save: () => { const lines = (document.getElementById('onb_cols').value || '').split('\n').map(s => s.trim()).filter(Boolean); if (lines.length) collected.columns = lines; }
        },
        {
            key: 'stakeholders', icon: 'fa-users', title: 'Stakeholder', hint: 'Wichtige Beteiligte / Auftraggeber (eine pro Zeile, optional).',
            render: () => { const cur = collected.stakeholders || (appData.stakeholders || []).map(s => s.name); return `<textarea id="onb_sh" rows="4" placeholder="Kunde A\nAbteilung Marketing">${cur.join('\n')}</textarea>`; },
            save: () => { const lines = (document.getElementById('onb_sh').value || '').split('\n').map(s => s.trim()).filter(Boolean); collected.stakeholders = lines; }
        },
        {
            key: 'buckets', icon: 'fa-layer-group', title: 'Buckets', hint: 'Kategorien zum Einsortieren von Aufgaben (eine pro Zeile, optional).',
            render: () => { const cur = collected.buckets || (appData.buckets || []); return `<textarea id="onb_buckets" rows="4" placeholder="Entwicklung\nDesign\nAdministration">${cur.join('\n')}</textarea>`; },
            save: () => { const lines = (document.getElementById('onb_buckets').value || '').split('\n').map(s => s.trim()).filter(Boolean); collected.buckets = lines; }
        }
    ];

    function showStep() {
        const s = steps[stepIdx];
        setProgress((tour.length + stepIdx + 1) / (tour.length + 8));
        body.innerHTML = `<div class="onb-step">
            <div class="onb-step-ic"><i class="fas ${s.icon}"></i></div>
            <h2>${s.title}</h2>
            <p class="onb-hint">${s.hint}</p>
            <div class="onb-field">${s.render()}</div>
        </div>`;
        if (s.after) s.after();
        footer.innerHTML = `
            <button class="onb-skip" id="onbSkipStep">Überspringen</button>
            <div class="onb-nav">
                ${stepIdx > 0 ? `<button class="secondary" id="onbBack">Zurück</button>` : ''}
                <button id="onbNext">${stepIdx < steps.length - 1 ? 'Weiter' : 'Fertig'}</button>
            </div>`;
        document.getElementById('onbSkipStep').onclick = () => next(true);
        document.getElementById('onbNext').onclick = () => next(false);
        const bk = document.getElementById('onbBack'); if (bk) bk.onclick = () => { stepIdx--; showStep(); };
    }

    function next(skip) {
        const s = steps[stepIdx];
        if (!skip) { try { s.save(); } catch (e) {} }
        if (stepIdx < steps.length - 1) { stepIdx++; showStep(); }
        else finishAll();
    }

    function startForm() { if (ov) ov.classList.remove('onb-touring'); stepIdx = 0; showStep(); }

    function finishAll() {
        applyCollected();
        appData.settings.onboardingCompleted = true;
        saveToLocal(true);
        if (ov) ov.remove();
        try { renderSidebar(); } catch (e) {}
        try { renderView(); } catch (e) {}
        try { showToast('Einrichtung abgeschlossen – viel Erfolg!'); } catch (e) {}
    }

    function applyCollected() {
        const st = appData.settings;
        if (collected.name) {
            appData.users = appData.users || [];
            appData.users.push({ id: generateId(), name: collected.name, avatar: '' });
        }
        if (collected.workDays) st.workDays = collected.workDays.map(Number).filter(n => !isNaN(n));
        if (collected.from !== undefined) st.timeTrackFrom = collected.from;
        if (collected.to !== undefined) st.timeTrackTo = collected.to;
        if (collected.target != null) st.targetHoursPerDay = collected.target;
        if (collected.email) st.notificationEmail = collected.email;
        if (collected.columns) {
            const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || ('col_' + Math.random().toString(36).slice(2, 6));
            const used = { done: 1 };
            const cols = collected.columns.filter(title => slug(title) !== 'done').map(title => { let id = slug(title); while (used[id]) id += '_'; used[id] = 1; return { id, title }; });
            /* „Abgeschlossen" bleibt als fester System-Standard immer erhalten (ID 'done'). */
            const prevDone = (appData.statuses || []).find(s => s.id === 'done');
            cols.push(prevDone || { id: 'done', title: 'Abgeschlossen' });
            appData.statuses = cols;
        }
        if (collected.stakeholders) {
            appData.stakeholders = appData.stakeholders || [];
            const palette = ['#cca300', '#0F5FDC', '#1F9463', '#E8A317', '#7C6CE0', '#0E9BAA'];
            collected.stakeholders.forEach((name, i) => { if (!appData.stakeholders.some(s => s.name === name)) appData.stakeholders.push({ id: generateId(), name, color: palette[i % palette.length] }); });
        }
        if (collected.buckets) appData.buckets = collected.buckets.slice();
    }

    function begin() {
        if (!shouldRun()) return;
        overlay();
        tourIdx = 0;
        showTour();
    }

    /* ---------- Demo-Daten (Marketing-PM: Briefe & Papiertragetaschen) ---------- */
    function generateDemoData() {
        const today = new Date();
        const iso = (d) => ttIso(d);
        const shift = (days) => { const d = new Date(today); d.setDate(d.getDate() + days); return iso(d); };
        const startIso = shift(-60), endIso = shift(30), todayIso = iso(today);
        const uid = (appData.users[0] && appData.users[0].id) || 'u1';

        appData.buckets = ['Design', 'Druck', 'Logistik', 'Kundenbetreuung'];
        const palette = ['#cca300', '#0F5FDC', '#1F9463', '#E8A317', '#7C6CE0', '#0E9BAA'];
        appData.stakeholders = [
            { id: generateId(), name: 'Papierwerk Nord GmbH', color: palette[0] },
            { id: generateId(), name: 'Bäckerei-Kette Korn & Co.', color: palette[1] },
            { id: generateId(), name: 'Boutique Lindenhof', color: palette[2] },
            { id: generateId(), name: 'Geschäftsleitung intern', color: palette[3] }
        ];
        const shId = (i) => appData.stakeholders[i].id;

        appData.projectStacks = [];
        appData.tasks = [];
        appData.timeLogs = [];
        appData.absences = [];

        /* Projektdefinitionen: relative Tage (zu heute) für Start/Ende je Aufgabe */
        const defs = [
            {
                name: 'Kampagne Papiertragetaschen Frühjahr', bucket: 'Design', sh: 0, budget: 18000,
                tasks: [
                    { t: 'Designkonzept & Motive', s: -58, e: -44, cl: ['Briefing auswerten', 'Moodboard erstellen', 'Motive skizzieren'] },
                    { t: 'Kundenfreigabe Design', s: -44, e: -36, cl: ['Präsentation vorbereiten', 'Freigabe einholen'], dep: 0 },
                    { t: 'Druckvorstufe & Proof', s: -36, e: -24, cl: ['Reinzeichnung', 'Andruck prüfen', 'Farbprofil abstimmen'], dep: 1 },
                    { t: 'Produktion & Druck', s: -24, e: -6, cl: ['Papier bestellen', 'Auflage drucken', 'Qualitätskontrolle'], dep: 2 },
                    { t: 'Auslieferung & Nachbereitung', s: -6, e: 12, cl: ['Versand koordinieren', 'Kundenfeedback einholen'], dep: 3 }
                ]
            },
            {
                name: 'Briefbogen-Redesign Geschäftskunden', bucket: 'Design', sh: 1, budget: 9500,
                tasks: [
                    { t: 'Analyse Bestandsbriefbögen', s: -52, e: -42, cl: ['Vorlagen sammeln', 'Schwachstellen notieren'] },
                    { t: 'Neuentwurf Layout', s: -42, e: -28, cl: ['Typografie festlegen', 'Rasterentwurf', 'Varianten anlegen'], dep: 0 },
                    { t: 'Testdruck & Abstimmung', s: -28, e: -14, cl: ['Musterdruck', 'Korrekturschleife'], dep: 1 },
                    { t: 'Rollout aller Vorlagen', s: -14, e: 8, cl: ['Vorlagen finalisieren', 'Übergabe an Kunde'], dep: 2 }
                ]
            },
            {
                name: 'Messeauftritt Verpackungsmesse', bucket: 'Logistik', sh: 3, budget: 24000,
                tasks: [
                    { t: 'Standkonzept', s: -30, e: -18, cl: ['Fläche planen', 'Materialien wählen'] },
                    { t: 'Werbemittel produzieren', s: -18, e: -2, cl: ['Muster-Tragetaschen drucken', 'Flyer gestalten', 'Roll-ups bestellen'], dep: 0 },
                    { t: 'Messe-Durchführung', s: 14, e: 18, cl: ['Standaufbau', 'Betreuung', 'Leads erfassen'], dep: 1 }
                ]
            },
            {
                name: 'Sonderedition Boutique-Tüten', bucket: 'Druck', sh: 2, budget: 6000,
                tasks: [
                    { t: 'Materialmuster beschaffen', s: -20, e: -10, cl: ['Papiersorten anfragen', 'Haptik-Muster prüfen'] },
                    { t: 'Veredelung abstimmen', s: -10, e: 6, cl: ['Heißfolie testen', 'Prägung abstimmen'], dep: 0 },
                    { t: 'Kleinauflage drucken', s: 6, e: 24, cl: ['Freigabe einholen', 'Auflage produzieren'], dep: 1 }
                ]
            }
        ];

        const activeSpans = []; /* für Buchungsverlauf: {taskId, s, e} vergangener/aktueller Aufgaben */

        defs.forEach(def => {
            const stackId = generateId();
            appData.projectStacks.push({ id: stackId, name: def.name, status: 'active', checklist: [], startDate: shift(def.tasks[0].s), dueDate: shift(def.tasks[def.tasks.length - 1].e), notes: '', history: '', assigneeId: uid, stakeholderId: shId(def.sh), bucket: def.bucket, predecessors: [], targetBudget: def.budget || null });
            const taskIds = [];
            def.tasks.forEach(tk => {
                const id = generateId();
                const sIso = shift(tk.s), eIso = shift(tk.e);
                const done = tk.e < -1;                 /* abgeschlossen, wenn Ende in der Vergangenheit */
                const inProg = tk.s <= 0 && tk.e >= 0;   /* läuft gerade */
                const status = done ? 'done' : (inProg ? 'inProgress' : 'todo');
                const preds = (tk.dep != null && taskIds[tk.dep]) ? [taskIds[tk.dep]] : [];
                /* Checkpunkte: vereinzelt mit Datum und Stundenangabe, damit Kalender,
                   Gantt und Auswertungen realistische Werte zeigen. */
                const clSpan = Math.max(1, tk.e - tk.s);
                const checklist = tk.cl.map((title, ci) => {
                    const cdone = done || (inProg && ci === 0);
                    const item = { id: generateId(), title, done: cdone, predecessors: [], dueDate: '', startDate: '', duration: 0, assigneeId: uid };
                    /* ungefähr jeder zweite Checkpunkt bekommt einen Termin */
                    if (ci % 2 === 0) {
                        const offset = tk.s + Math.round((clSpan / Math.max(1, tk.cl.length)) * ci);
                        const cDate = shift(offset);
                        const withTime = (ci % 4 === 0);          /* mal mit, mal ohne Uhrzeit */
                        const durMin = [90, 120, 180, 240][ci % 4];
                        const sched = computeChecklistSchedule(cDate, withTime ? '09:00' : '', durMin);
                        item.startDate = sched.startDate;
                        item.dueDate = sched.dueDate;
                        item.duration = sched.duration;
                        item.allDay = sched.allDay;
                    } else if (ci === 1 && tk.cl.length > 2) {
                        /* nur vereinzelt eine Aufwandsschätzung ohne Termin */
                        item.duration = 120;
                    }
                    return item;
                });
                /* Checkpunkt-Ketten: der zweite Punkt hängt am ersten */
                if (checklist.length > 1) checklist[1].predecessors = [checklist[0].id];
                if (checklist.length > 2 && tk.dep != null) checklist[2].predecessors = [checklist[1].id];
                const task = { id, projectName: tk.t, status, bucket: def.bucket, priority: (tk.dep == null ? 'high' : 'medium'), checklist, predecessors: preds, files: [], startDate: sIso, dueDate: eIso, spentTime: '0', estimatedTime: String(6 + tk.cl.length * 2), projectStackId: stackId, stakeholderId: shId(def.sh), assigneeId: uid, targetBudget: (tk.dep == null ? 3500 : null) };
                if (done) task.completedAt = ttParse(eIso).getTime();
                appData.tasks.push(task);
                taskIds.push(id);
                if (tk.s <= 0) activeSpans.push({ taskId: id, s: Math.max(tk.s, -60), e: Math.min(tk.e, 0) });
            });
        });

        /* Abwesenheiten: eine Urlaubswoche + zwei Kranktage in der Vergangenheit */
        const absDays = [];
        for (let k = -40; k <= -36; k++) { const d = shift(k); if (ttIsWorkDay(d)) { appData.absences.push({ id: generateId(), date: d, type: 'vacation', hours: ttTargetHours(), note: 'Frühjahrsurlaub', userId: uid }); absDays.push(d); } }
        [-22, -21].forEach(k => { const d = shift(k); if (ttIsWorkDay(d)) { appData.absences.push({ id: generateId(), date: d, type: 'sick', hours: ttTargetHours(), note: 'Erkältung', userId: uid }); absDays.push(d); } });

        /* 100% Buchungsverlauf: jeden vergangenen Arbeitstag mit dem Tagessoll füllen */
        const target = ttTargetHours();
        for (let k = -60; k <= 0; k++) {
            const d = shift(k);
            if (!ttIsWorkDay(d)) continue;
            if (absDays.includes(d)) continue;
            const active = activeSpans.filter(sp => sp.s <= k && sp.e >= k);
            if (!active.length) continue;
            let remaining = target;
            /* gleichmäßig auf die aktiven Aufgaben verteilen, in 0,25-Schritten */
            const per = Math.max(0.25, Math.round((target / active.length) * 4) / 4);
            active.forEach((sp, i) => {
                let h = (i === active.length - 1) ? remaining : Math.min(per, remaining);
                h = Math.round(h * 4) / 4;
                if (h <= 0) return;
                remaining = Math.round((remaining - h) * 4) / 4;
                appData.timeLogs.push({ id: generateId(), taskId: sp.taskId, hours: h, date: d, note: '' });
            });
        }

        /* spentTime je Aufgabe aus den Buchungen aktualisieren */
        appData.tasks.forEach(tk => {
            const sum = appData.timeLogs.filter(l => l.taskId === tk.id).reduce((a, l) => a + (parseFloat(l.hours) || 0), 0);
            tk.spentTime = String(Math.round(sum * 100) / 100);
        });

        /* Jede Kanban-Spalte soll mindestens eine Aufgabe zeigen (auch z. B. "Prüfung"). */
        try {
            const cols = appData.statuses.map(st => st.id);
            cols.forEach(colId => {
                if (appData.tasks.some(tk => tk.status === colId)) return;
                /* eine noch offene Aufgabe aus der am staerksten besetzten Spalte umhaengen */
                const counts = {};
                appData.tasks.forEach(tk => { counts[tk.status] = (counts[tk.status] || 0) + 1; });
                const donor = appData.tasks
                    .filter(tk => tk.status !== colId && (counts[tk.status] || 0) > 1)
                    .sort((a, b) => (counts[b.status] || 0) - (counts[a.status] || 0))[0];
                if (donor) donor.status = colId;
            });
        } catch (e) { console.warn('Demo: Spaltenverteilung', e); }

        /* Stundensätze der Beteiligten (Basis für alle Budgetauswertungen) */
        if (appData.users[0]) appData.users[0].hourlyRate = 95;
        appData.users.slice(1).forEach((u, i) => { u.hourlyRate = [110, 85, 120][i % 3]; });
        appData.settings.defaultHourlyRate = 90;
        appData.settings.currency = appData.settings.currency || 'EUR';
        appData.settings.monthlyBudget = 12000;

        /* Eine projektübergreifende Abhängigkeit, damit die Abhängigkeits-Ansicht Ketten zeigt */
        try {
            const messe = appData.tasks.find(x => x.projectName === 'Werbemittel produzieren');
            const druck = appData.tasks.find(x => x.projectName === 'Produktion & Druck');
            if (messe && druck && !messe.predecessors.includes(druck.id)) messe.predecessors.push(druck.id);
        } catch (e) {}

        /* Einzelaufgabe ohne Stack – mit eigenem Budget */
        appData.tasks.push({
            id: generateId(), projectName: 'Jahresplanung Materialeinkauf', status: 'todo',
            bucket: 'Kundenbetreuung', priority: 'medium', projectStackId: '',
            stakeholderId: shId(3), assigneeId: uid,
            startDate: shift(3), dueDate: shift(21), spentTime: '0', estimatedTime: '16',
            targetBudget: 4200, predecessors: [], files: [],
            checklist: (function () {
                const a = { id: generateId(), title: 'Bedarf erheben', done: false, predecessors: [], assigneeId: uid };
                const sched = computeChecklistSchedule(shift(5), '09:00', 180);
                a.startDate = sched.startDate; a.dueDate = sched.dueDate; a.duration = sched.duration; a.allDay = sched.allDay;
                const b = { id: generateId(), title: 'Angebote vergleichen', done: false, predecessors: [a.id], assigneeId: uid, startDate: '', dueDate: '', duration: 240 };
                return [a, b];
            })()
        });
    }

    /* Nach dem ersten Rendern starten */
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(begin, 400));
    else setTimeout(begin, 400);

    /* Manueller Neustart (z. B. aus den Einstellungen) */
    window.startOnboarding = function () { if (!ov || !document.body.contains(ov)) { overlay(); } tourIdx = 0; showTour(); };
})();

/* ============================================================
   Preset-Checklistenpunkte: Verschieben per Griff (.preset-cl-drag)
   ============================================================ */
(function () {
    const THRESHOLD = 4;
    let pd = null;

    function pt(ev) { const t = ev.touches ? (ev.touches[0] || ev.changedTouches[0]) : ev; return { x: t.clientX, y: t.clientY }; }

    function onDown(ev) {
        const handle = ev.target.closest ? ev.target.closest('.preset-cl-drag') : null;
        if (!handle) return;
        const row = handle.closest('.preset-cl-row');
        const list = handle.closest('.preset-cl-list');
        if (!row || !list) return;
        const p = pt(ev);
        pd = { row, list, startY: p.y, active: false, ph: null, ghost: null };
        if (ev.cancelable) ev.preventDefault();
    }

    function activate() {
        const r = pd.row.getBoundingClientRect();
        const g = pd.row.cloneNode(true);
        g.className += ' preset-cl-ghost';
        g.style.cssText += `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;pointer-events:none;z-index:100001;opacity:.95;box-shadow:0 12px 26px rgba(0,0,0,.28);background:var(--surface-color);border-radius:8px;`;
        document.body.appendChild(g);
        pd.ghost = g;
        pd.offY = pd.startY - r.top;
        pd.ph = document.createElement('div');
        pd.ph.className = 'preset-cl-ph';
        pd.ph.style.height = r.height + 'px';
        pd.row.parentNode.insertBefore(pd.ph, pd.row);
        pd.row.style.display = 'none';
        document.body.style.userSelect = 'none';
    }

    function onMove(ev) {
        if (!pd) return;
        const p = pt(ev);
        if (!pd.active) {
            if (Math.abs(p.y - pd.startY) < THRESHOLD) return;
            pd.active = true; activate();
        }
        if (ev.cancelable) ev.preventDefault();
        pd.ghost.style.top = (p.y - pd.offY) + 'px';
        const rows = Array.from(pd.list.querySelectorAll('.preset-cl-row')).filter(r => r !== pd.row && r.style.display !== 'none');
        let before = null;
        for (const r of rows) { const rc = r.getBoundingClientRect(); if (p.y < rc.top + rc.height / 2) { before = r; break; } }
        if (pd.ph.parentNode !== pd.list || pd.ph.nextElementSibling !== before) pd.list.insertBefore(pd.ph, before);
    }

    function finish() {
        if (!pd) return;
        const d = pd; pd = null;
        document.body.style.userSelect = '';
        if (!d.active) return;
        if (d.ghost) d.ghost.remove();
        /* Zielindex aus Platzhalter-Position ableiten */
        const fromIdx = parseInt(d.row.getAttribute('data-idx'), 10);
        let toIdx = 0;
        const kids = Array.from(d.list.children).filter(c => c.classList.contains('preset-cl-row') || c.classList.contains('preset-cl-ph'));
        toIdx = kids.indexOf(d.ph);
        if (d.ph && d.ph.parentNode) d.ph.parentNode.removeChild(d.ph);
        d.row.style.display = '';
        const kind = d.list.getAttribute('data-kind');
        const pid = d.list.getAttribute('data-pid');
        if (kind && pid && !isNaN(fromIdx) && toIdx >= 0) {
            /* Entfernt man das gezogene Element, verschiebt sich der Zielindex ggf. um 1 */
            if (toIdx > fromIdx) toIdx -= 1;
            presetClMove(kind, pid, fromIdx, toIdx);
        }
    }

    function cancel() {
        if (!pd) return;
        if (pd.ghost) pd.ghost.remove();
        if (pd.row) pd.row.style.display = '';
        if (pd.ph && pd.ph.parentNode) pd.ph.parentNode.removeChild(pd.ph);
        pd = null; document.body.style.userSelect = '';
    }

    document.addEventListener('mousedown', onDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', finish);
    document.addEventListener('touchstart', onDown, { passive: false });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', finish);
    document.addEventListener('touchcancel', cancel);
})();
