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
    { id: 'list',         name: 'Liste',             icon: 'fa-list',             hidden: false },
    { id: 'stacks',       name: 'Projekt-Stacks',   icon: 'fa-folder-open',      hidden: false },
    { id: 'planner',      name: 'Planung',          icon: 'fa-calendar-alt',     hidden: false },
    { id: 'schedule',     name: 'Kalender',          icon: 'fa-calendar-alt',     hidden: true  },
    { id: 'timeline',     name: 'Gantt-Diagramm',   icon: 'fa-stream',           hidden: true  },
    { id: 'notes',        name: 'Notizen',           icon: 'fa-sticky-note',      hidden: false },
    { id: 'checklists',   name: 'Checklisten',       icon: 'fa-check-square',     hidden: false },
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
    if(!appData.settings.reminders) appData.settings.reminders = defaultData.settings.reminders;
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
    const renderClPill = (id, parentId) => `<span class="dep-badge dep-badge-cl" style="white-space:nowrap; display:inline-flex; align-items:center; max-width:100%;"><span style="overflow:hidden; text-overflow:ellipsis;">${getEntityName(id)}</span> <span class="del-btn" style="flex-shrink:0;" onclick="toggleDependency('${parentId}', '${id}', false); event.stopPropagation();" title="Entfernen"><i class="fas fa-times"></i></span></span>`;

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
            if(preds.length > 0) {
                depContainer.innerHTML = preds.map(pId => renderClPill(pId, id)).join('');
            } else {
                depContainer.innerHTML = '';
            }
        }
    });
}

let currentView = appData.settings.views.find(v => !v.hidden && v.id !== 'schedule' && v.id !== 'timeline')?.id || appData.settings.views[0].id;
let plannerSubView = 'schedule';
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

function toggleRTEHighlight() {
    let color = document.queryCommandValue('backColor');
    if (color && (color === 'rgb(255, 255, 0)' || color === 'yellow' || color === '#ffff00')) {
        document.execCommand('backColor', false, 'transparent');
    } else { document.execCommand('backColor', false, 'yellow'); }
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

function openMobileExportMenu() {
    const deskContent = document.querySelector('.topbar .dropdown[title="Export & Backup"] .dropdown-content').innerHTML;
    document.getElementById('mobileExportContainer').innerHTML = deskContent;
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
    
    const addNotif = (nObj) => {
        if(!settings.dismissedNotifs.includes(nObj.notifId)) {
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
                if(ch.modal) { showNotifModal(nObj.title, nObj.desc, nObj.type); }
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

function closeAllMultiSelects(e) { 
    if(!e.target.closest('.ms-wrapper')) { document.querySelectorAll('.ms-dropdown').forEach(d => d.classList.remove('open')); } 
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
    const cssClass = issecondary ? 'pb-fill secondary' : 'pb-fill'; 
    return `<div class="pb-container"><div class="${cssClass}" style="width:${percent}%"></div></div>`; 
}

function getStackProgress(stackId) {
    const stack = appData.projectStacks.find(s => s.id === stackId); const tasks = appData.tasks.filter(t_obj => t_obj.projectStackId === stackId);
    const mTotal = stack.checklist ? stack.checklist.length : 0; const mDone = stack.checklist ? stack.checklist.filter(c => c.done).length : 0;
    const mPct = mTotal === 0 ? 0 : Math.round((mDone / mTotal) * 100);
    let tProgressSum = 0; tasks.forEach(t_obj => tProgressSum += getTaskProgress(t_obj));
    const tPct = tasks.length === 0 ? 0 : Math.round(tProgressSum / tasks.length);
    return { mPct, tPct, tasksCount: tasks.length };
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
}

function handleLogoUpload(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) { appData.settings.companyLogo = ev.target.result; renderLogoPreview(); saveToLocal(); };
    reader.readAsDataURL(file);
}

function renderLogoPreview() {
    const container = document.getElementById('logo_preview_container');
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
    
    document.getElementById('set_r1_active').checked = appData.settings.reminders[0].active;
    document.getElementById('set_r1_val').value = appData.settings.reminders[0].value;
    document.getElementById('set_r1_unit').value = appData.settings.reminders[0].unit;

    document.getElementById('set_r2_active').checked = appData.settings.reminders[1].active;
    document.getElementById('set_r2_val').value = appData.settings.reminders[1].value;
    document.getElementById('set_r2_unit').value = appData.settings.reminders[1].unit;

    document.getElementById('set_sc_newTask').value = appData.settings.shortcuts.newTask.toUpperCase();
    document.getElementById('set_sc_newStack').value = appData.settings.shortcuts.newStack.toUpperCase();
    document.getElementById('set_sc_search').value = appData.settings.shortcuts.search.toUpperCase();

    const adComp = appData.settings.autoDelete;
    document.getElementById('set_ad_comp_unit').value = adComp.unit;
    document.getElementById('set_ad_comp_val').value = adComp.value;
    document.getElementById('set_ad_comp_val').style.display = adComp.unit === 'never' ? 'none' : 'block';

    const adTrash = appData.settings.trashAutoDelete;
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
    const tabIdMatch = activeTabBtn.getAttribute('onclick').match(/'([^']+)'/);
    if(tabIdMatch) switchSettingsTab(tabIdMatch[1], activeTabBtn);
    
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
    let stHtml = `<tr><th width="30"></th><th>${t('title')}</th><th width="60">${t('action')}</th></tr>`;
    appData.statuses.forEach((s, i) => { 
        const isDoneCol = s.id === 'done';
        const titleStr = isDoneCol ? t('col_completed') + ' (System)' : s.title;
        const editStr = isDoneCol ? `<span style="opacity:0.6">${titleStr}</span>` : `<span class="editable-cell" ondblclick="editSetting(this, 'status', '${s.id}')" title="Doppelklick zum Bearbeiten">${s.title}</span>`;
        const delBtn = isDoneCol ? '' : `<button class="secondary icon-btn" style="color:var(--danger); margin-left:auto;" onclick="deleteStatus('${s.id}')"><i class="fas fa-trash"></i></button>`;
        
        stHtml += `<tr class="draggable-item" draggable="true" ondragstart="event.dataTransfer.setData('text/plain', '${i}'); event.dataTransfer.setData('type', 'settings-status');" ondragover="handleCardDragOver(event, this, false)" ondragleave="handleCardDragLeave(this)" ondrop="handleSettingsStatusDrop(event, this, ${i})">
            <td data-label="Drag" style="vertical-align: middle; padding-left:10px;"><i class="fas fa-grip-vertical" style="color:var(--text-muted); cursor:grab;"></i></td>
            <td data-label="Titel" style="vertical-align: middle;">${editStr}</td>
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
    
    let bHtml = ''; appData.buckets.forEach(b => { bHtml += `<span class="badge" style="background:var(--border-color); color:var(--text-main); font-size:13px; font-weight:normal; padding:8px 12px;"><span class="editable-cell" ondblclick="editSetting(this, 'bucket', '${b}')">${b}</span> <i class="fas fa-times" style="margin-left:8px; cursor:pointer; color:var(--danger);" onclick="deleteBucket('${b}')"></i></span>`; });
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

    let usrHtml = `<tr><th width="40">${t('image')}</th><th>${t('name')}</th><th>${t('avatar_url')}</th><th width="60">${t('action')}</th></tr>`;
    appData.users.forEach(u => {
        usrHtml += `<tr><td data-label="Bild">${getAvatarHtml(u.id)}</td><td data-label="Name"><span class="editable-cell" ondblclick="editSetting(this, 'user', '${u.id}')">${u.name}</span></td>
            <td data-label="URL"><input type="text" value="${u.avatar}" onchange="updateUserAvatar('${u.id}', this.value)" style="margin:0; padding:4px; font-size:11px; width:100%;"></td>
            <td data-label="Aktion" style="flex-direction:row;">${u.id !== appData.settings.currentUserId ? `<button class="secondary icon-btn" style="color:var(--danger); margin-left:auto;" onclick="deleteUser('${u.id}')"><i class="fas fa-trash"></i></button>` : ''}</td></tr>`;
    });
    document.getElementById('settings_users_table').innerHTML = usrHtml;

    let curOpts = ''; appData.users.forEach(u => { curOpts += `<option value="${u.id}" ${u.id===appData.settings.currentUserId?'selected':''}>${u.name}</option>`; });
    document.getElementById('set_current_user').innerHTML = curOpts;
}

function addStatus() { const n = document.getElementById('new_status_name').value.trim(); if(n) { appData.statuses.push({ id: generateId(), title: n }); document.getElementById('new_status_name').value = ''; renderSettings(); } }
function moveStatus(i, dir) { if(i+dir>=0 && i+dir<appData.statuses.length) { const t_obj = appData.statuses[i]; appData.statuses[i] = appData.statuses[i+dir]; appData.statuses[i+dir] = t_obj; renderSettings(); } }
function deleteStatus(id) { if(id === 'done') return showToast('Diese Systemspalte kann nicht gelöscht werden.', 'error'); appData.statuses = appData.statuses.filter(s => s.id !== id); renderSettings(); }
function selectShColor(el, color) { document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected')); el.classList.add('selected'); document.getElementById('new_sh_color').value = color; }
function addStakeholder() { const n = document.getElementById('new_sh_name').value.trim(); const c = document.getElementById('new_sh_color').value; if(n) { appData.stakeholders.push({ id: generateId(), name: n, color: c }); document.getElementById('new_sh_name').value = ''; renderSettings(); } }
function deleteStakeholder(id) { appData.stakeholders = appData.stakeholders.filter(s => s.id !== id); renderSettings(); }
function addBucket() { const n = document.getElementById('new_bucket_name').value.trim(); if(n && !appData.buckets.includes(n)) { appData.buckets.push(n); document.getElementById('new_bucket_name').value = ''; renderSettings(); } }
function deleteBucket(name) { appData.buckets = appData.buckets.filter(b => b !== name); renderSettings(); }
function addDefClItem() { const n = document.getElementById('new_def_cl_name').value.trim(); if(n) { appData.defaultChecklist.push(n); document.getElementById('new_def_cl_name').value = ''; renderSettings(); } }
function deleteDefCl(i) { appData.defaultChecklist.splice(i, 1); renderSettings(); }
function moveDefCl(i, dir) { if(i+dir>=0 && i+dir<appData.defaultChecklist.length) { const t_obj = appData.defaultChecklist[i]; appData.defaultChecklist[i] = appData.defaultChecklist[i+dir]; appData.defaultChecklist[i+dir] = t_obj; renderSettings(); } }
function addUser() { const n = document.getElementById('new_user_name').value.trim(); const a = document.getElementById('new_user_avatar').value.trim(); if(n) { appData.users.push({ id: generateId(), name: n, avatar: a }); document.getElementById('new_user_name').value = ''; document.getElementById('new_user_avatar').value = ''; renderSettings(); } }
function deleteUser(id) { 
    if(id === appData.settings.currentUserId) return showToast('Eigenes Profil kann nicht gelöscht werden', 'error');
    appData.users = appData.users.filter(u => u.id !== id); 
    appData.tasks.forEach(t_obj => { if(t_obj.assigneeId === id) t_obj.assigneeId = ''; if(t_obj.checklist) t_obj.checklist.forEach(c => { if(c.assigneeId === id) c.assigneeId = ''; }); });
    appData.projectStacks.forEach(ps => { if(ps.assigneeId === id) ps.assigneeId = ''; if(ps.checklist) ps.checklist.forEach(c => { if(c.assigneeId === id) c.assigneeId = ''; }); });
    renderSettings(); 
}

// --- 5.1 WORKFLOW LOGIC ---
function renderWorkflows() {
    const list = document.getElementById('wf_list'); let html = '';
    if(!appData.settings.workflows || appData.settings.workflows.length === 0) { html = `<p style="font-size:12px; color:var(--text-muted);">Keine Workflows vorhanden. Erstelle deinen ersten, um Abläufe zu automatisieren!</p>`; } 
    else {
        appData.settings.workflows.forEach(wf => {
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
                <div class="wf-row"><span class="wf-badge">WENN</span> <span style="font-size:13px;">${triggerLabel}</span></div>
                ${wf.conditions && wf.conditions.length > 0 ? `<div class="wf-row"><span class="wf-badge" style="background:var(--warning); color:white;">${wf.conditionLogic === 'AND' ? 'UND' : 'ODER'}</span> <span style="font-size:12px; color:var(--text-muted);">${wf.conditions.length} Bedingung(en)</span></div>` : ''}
                <div class="wf-row"><span class="wf-badge" style="background:var(--success); color:white;">DANN</span> <span style="font-size:12px; color:var(--text-muted);">${wf.actions.length} Aktion(en)</span></div>
            </div>`;
        });
    }
    list.innerHTML = html;
}

function openWfEditor(id = null) {
    document.getElementById('wf_list').style.display = 'none'; document.getElementById('wf_editor').style.display = 'block';
    if(id) {
        const wf = appData.settings.workflows.find(x => x.id === id);
        document.getElementById('wf_edit_id').value = wf.id; document.getElementById('wf_edit_name').value = wf.name; document.getElementById('wf_edit_trigger').value = wf.trigger;
        renderWfTriggerValueOptions(wf.triggerValue); document.getElementById('wf_edit_cond_logic').value = wf.conditionLogic || 'AND';
        document.getElementById('wf_edit_conditions_list').innerHTML = ''; if(wf.conditions) wf.conditions.forEach(c => addWfConditionRow(c.field, c.operator, c.value));
        document.getElementById('wf_edit_actions_list').innerHTML = ''; if(wf.actions) wf.actions.forEach(a => addWfActionRow(a.type, a.value));
    } else {
        document.getElementById('wf_edit_id').value = ''; document.getElementById('wf_edit_name').value = ''; document.getElementById('wf_edit_trigger').value = ''; document.getElementById('wf_edit_trigger_val').style.display = 'none'; document.getElementById('wf_edit_cond_logic').value = 'AND'; document.getElementById('wf_edit_conditions_list').innerHTML = ''; document.getElementById('wf_edit_actions_list').innerHTML = '';
        addWfActionRow(); 
    }
}
function closeWfEditor() { document.getElementById('wf_editor').style.display = 'none'; document.getElementById('wf_list').style.display = 'flex'; }

function renderWfTriggerValueOptions(preselect = '') {
    const trigger = document.getElementById('wf_edit_trigger').value; const valSelect = document.getElementById('wf_edit_trigger_val');
    if(trigger === 'task_status_changed') { valSelect.style.display = 'block'; valSelect.innerHTML = appData.statuses.map(s => `<option value="${s.id}" ${s.id===preselect?'selected':''}>${s.id === 'done' ? t('col_completed') : s.title}</option>`).join(''); } 
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
        { v: 'isPaused',       l: 'Pausiert',             grp: 'Status' },
        { v: 'hasChecklist',   l: 'Hat Checkliste',       grp: 'Status' },
        { v: 'hasAttachment',  l: 'Hat Anhänge',          grp: 'Status' },
        { v: 'isOverdue',      l: 'Überfällig',           grp: 'Status' },
        { v: 'dueDate',        l: t('wf_f_due'),          grp: 'Datum' },
        { v: 'startDate',      l: t('wf_f_start'),        grp: 'Datum' },
        { v: 'estimatedTime',  l: t('wf_f_est'),          grp: 'Zahl' },
        { v: 'spentTime',      l: t('wf_f_spent'),        grp: 'Zahl' },
        { v: 'spentTime_thisWeek', l: 'Aufwand diese Woche (Std)', grp: 'Zahl' }, // NEU FÜR DIE KALENDERWOCHE
        { v: 'duration_days',  l: t('wf_f_duration'),     grp: 'Zahl' },
        { v: 'effort_remaining', l: t('wf_f_effort_rem'), grp: 'Zahl' },
        { v: 'checklistDone',  l: 'Checkliste erledigt %',grp: 'Zahl' },
        { v: 'taskCount',      l: 'Anzahl Aufgaben',      grp: 'Zahl' },
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
    if(['estimatedTime','spentTime','spentTime_thisWeek','duration_days','effort_remaining','checklistDone','taskCount'].includes(field)) return 'number';
    if(['isPaused','hasChecklist','hasAttachment','isOverdue'].includes(field)) return 'boolean';
    if(['priority','status','bucket','assigneeId','stakeholderId','projectStackId','recurrence'].includes(field)) return 'select';
    return 'text'; 
}

function getWfOpOptionsHtml(selected = '', fieldType = 'text') {
    const ops = {
        text:    [['equals','= gleich'],['not_equals','≠ ungleich'],['contains','enthält'],['not_contains','enthält nicht'],['is_empty','ist leer'],['not_empty','ist nicht leer']],
        select:  [['equals','= ist'],['not_equals','≠ ist nicht'],['is_empty','nicht gesetzt'],['not_empty','ist gesetzt']],
        boolean: [['is_true','ist aktiv / ja'],['is_false','ist inaktiv / nein']],
        date:    [['date_past','liegt in der Vergangenheit'],['date_future','liegt in der Zukunft'],['date_less','fällig in weniger als X Tagen'],['date_more','fällig in mehr als X Tagen'],['date_equals','ist genau (Datum)'],['is_empty','nicht gesetzt'],['not_empty','ist gesetzt']],
        number:  [['equals','= gleich'],['not_equals','≠ ungleich'],['greater_than','> grösser als'],['less_than','< kleiner als'],['is_empty','ist leer / 0']],
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
        html = `<input type="hidden" class="wf-cond-val" value="1"><span style="font-size:12px; color:var(--text-muted); display:flex; align-items:center; height:100%; padding:0 8px;">kein Wert nötig</span>`;
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
        html = `<select class="wf-cond-val"><option value="low" ${preselect==='low'?'selected':''}>Niedrig</option><option value="medium" ${preselect==='medium'?'selected':''}>Mittel</option><option value="high" ${preselect==='high'?'selected':''}>Hoch</option></select>`;
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
    <option value="create_task" ${selected==='create_task'?'selected':''}>Erzeuge neue Aufgabe...</option>
    <option value="create_stack" ${selected==='create_stack'?'selected':''}>Erzeuge neuen Stack...</option>
    <option value="create_cl" ${selected==='create_cl'?'selected':''}>Erzeuge Checklistenpunkt (Aufgabe)...</option>
    <option value="create_ms" ${selected==='create_ms'?'selected':''}>Erzeuge Milestone (Stack)...</option>
    <option value="send_email" ${selected==='send_email'?'selected':''}>${t('wf_act_send_email')}</option>
    `;
}

function renderWfActionValueInput(actionSelectEl, preselect = '') {
    const action = actionSelectEl.value; const container = actionSelectEl.parentElement.querySelector('.wf-act-val-container'); let html = '';
    if(action === 'set_status') { html = `<select class="wf-act-val">` + appData.statuses.map(s => `<option value="${s.id}" ${s.id===preselect?'selected':''}>${s.id === 'done' ? t('col_completed') : s.title}</option>`).join('') + `</select>`; } 
    else if(action === 'set_priority') { html = `<select class="wf-act-val"><option value="low" ${preselect==='low'?'selected':''}>Niedrig</option><option value="medium" ${preselect==='medium'?'selected':''}>Mittel</option><option value="high" ${preselect==='high'?'selected':''}>Hoch</option></select>`; } 
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
            <input type="text" placeholder="Nachricht..." value="${pMsg}" style="flex:1;" onchange="this.parentElement.querySelector('.wf-act-val').value = this.previousElementSibling.value + '|||' + this.value">
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
    const wfData = getWorkflowStateFromEditor();
    if(!wfData.trigger) return showToast("Bitte wähle zuerst einen Auslöser.", "error");

    let matchCountTasks = 0;
    let matchCountStacks = 0;

    const testEntity = (entity, type) => {
        if(evaluateConditions(entity, wfData.conditions, wfData.conditionLogic)) {
            if(type === 'task') matchCountTasks++;
            if(type === 'stack') matchCountStacks++;
        }
    };

    if(wfData.trigger.includes('task_') || wfData.trigger === 'entity_exists') {
        appData.tasks.forEach(t => testEntity(t, 'task'));
    }
    if(wfData.trigger.includes('stack_') || wfData.trigger === 'entity_exists') {
        appData.projectStacks.forEach(s => testEntity(s, 'stack'));
    }

    const total = matchCountTasks + matchCountStacks;
    if(total > 0) {
        showToast(`TEST ERFOLGREICH: Die Bedingungen treffen aktuell auf ${matchCountTasks} Aufgaben und ${matchCountStacks} Stacks zu.`, 'success');
    } else {
        showToast(`TEST ERGEBNIS: Die Bedingungen treffen aktuell auf KEIN bestehendes Element zu.`, 'warning');
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
        if(cond.field === 'taskCount') {
            eVal = appData.tasks.filter(t => t.projectStackId === entity.id).length;
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
    if(!appData.settings.workflows || _wfExecutionLock) return;
    
    // WICHTIG: entity_exists reiht sich automatisch bei allen Änderungen ein!
    const activeWfs = appData.settings.workflows.filter(w => 
        w.active && (w.trigger === eventName || w.trigger === 'entity_exists')
    );
    
    if(activeWfs.length === 0) return;

    let globalViewNeedsUpdate = false;
    let globalStructureChanged = false;

    activeWfs.forEach(wf => {
        if(eventName === 'task_status_changed' && wf.triggerValue && wf.triggerValue !== context.newStatus) return;
        let entity = context.task || context.stack || null; if(!entity) return;
        let typeStr = context.task ? 'task' : 'stack';

        if(evaluateConditions(entity, wf.conditions, wf.conditionLogic)) {
            _wfExecutionLock = true;
            try {
                const res = executeWorkflowActions(wf.actions, entity, typeStr, eventName);
                if(res.viewNeedsUpdate) globalViewNeedsUpdate = true;
                if(res.structureChanged) globalStructureChanged = true;
            } catch(err) { console.error("Workflow Execution Error", err); }
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
    el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-merge', 'drag-over');
    if (allowMerge && y > rect.height * 0.25 && y < rect.height * 0.75) { el.classList.add('drag-over-merge'); } 
    else if (y < rect.height / 2) { el.classList.add('drag-over-top'); } 
    else { el.classList.add('drag-over-bottom'); }
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
    div.classList.add('draggable-item'); div.draggable = true;
    div.ondragstart = function(e) { e.dataTransfer.setData('text/plain', 'modal-cl'); this.classList.add('modal-dragging'); };
    div.ondragover = function(e) { e.preventDefault(); e.stopPropagation(); handleCardDragOver(e, this, false); };
    div.ondragleave = function(e) { handleCardDragLeave(this); };
    div.ondrop = function(e) {
        e.preventDefault(); e.stopPropagation(); handleCardDragLeave(this); const dragging = document.querySelector('.modal-dragging');
        if(dragging && dragging !== this) { const insertAfter = this.classList.contains('drag-over-bottom'); if(insertAfter) this.parentNode.insertBefore(dragging, this.nextSibling); else this.parentNode.insertBefore(dragging, this); }
    };
    div.ondragestart = function(e) { this.classList.remove('modal-dragging'); handleCardDragLeave(this); };
}

function buildChecklistItemHTML(title, done, dueDate, assigneeId = '', id = '') {
    let d = '', time = ''; if (dueDate) { if (dueDate.includes('T')) [d, time] = dueDate.split('T'); else d = dueDate; }
    let userOpts = `<option value="">-- Benutzer --</option>` + appData.users.map(u => `<option value="${u.id}" ${u.id===assigneeId?'selected':''}>${u.name}</option>`).join('');
    
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
            <select class="cl-assignee">${userOpts}</select>
            <input type="date" class="cl-date" value="${d}" title="Datum">
            <input type="time" class="cl-time" value="${time}" title="Uhrzeit (Optional)">
            <button class="secondary icon-btn" style="padding:4px; font-size:11px; margin-left:4px; color:var(--text-muted);" onclick="openDependencyModalForCl(this)" title="Abhängigkeiten für diesen Punkt"><i class="fas fa-link"></i></button>
            <button class="secondary icon-btn cl-delete-btn" style="color:var(--danger); margin-left:10px;" onclick="this.closest('.checklist-item').remove()" tabindex="-1" title="Löschen"><i class="fas fa-trash"></i></button>
        </div>
    </div>
    <div class="cl-deps-display" style="padding: 0 35px 4px 35px; width: 100%; display: flex; flex-wrap: wrap; gap: 4px;"></div>`;
}

function openStackModal(id = null) {
    document.getElementById('stackModal').classList.add('active');
    // Reset to first tab
    switchStackTab('stab-general', document.querySelector('#stackModal .stack-tab-btn'));
    const container = document.getElementById('s_checklist_container'); container.innerHTML = '';
    const tasksContainer = document.getElementById('s_tasks_container'); tasksContainer.innerHTML = '';
    
    ['s_id','s_name','s_start_date','s_start_time','s_due_date','s_due_time', 's_history', 's_assignee', 's_stakeholder', 's_bucket'].forEach(elId => { const el = document.getElementById(elId); if(el) el.value = ''; });
    document.getElementById('s_notes_rte').innerHTML = '';
    document.getElementById('s_assignee').innerHTML = `<option value="" data-i18n="nobody">${t('nobody')}</option>` + appData.users.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
    document.getElementById('s_stakeholder').innerHTML = `<option value="" data-i18n="no_stakeholder">${t('no_stakeholder')}</option>` + appData.stakeholders.map(sh => `<option value="${sh.id}">${sh.name}</option>`).join('');
    document.getElementById('s_bucket').innerHTML = `<option value="" data-i18n="no_bucket">${t('no_bucket')}</option>` + appData.buckets.map(b => `<option value="${b}">${b}</option>`).join('');

    const actionsContainer = document.getElementById('stack_header_actions'); let actionsHtml = '';

    if (id) {
        document.getElementById('stackModalTitle').innerText = t('s_edit'); { const _pr = document.getElementById('s_preset_row'); if(_pr) _pr.style.display='none'; }
        document.getElementById('btnDeleteStack').style.display = 'block'; document.getElementById('dropdownShareStack').style.display = 'block';
        const s = appData.projectStacks.find(x => x.id === id);
        
        let sStartDate = '', sStartTime = '';
        if(s.startDate) { if(s.startDate.includes('T')) [sStartDate, sStartTime] = s.startDate.split('T'); else sStartDate = s.startDate; }

        let sDueDate = '', sDueTime = '';
        if(s.dueDate) { if(s.dueDate.includes('T')) [sDueDate, sDueTime] = s.dueDate.split('T'); else sDueDate = s.dueDate; }

        document.getElementById('s_id').value = s.id; document.getElementById('s_name').value = s.name || ''; 
        document.getElementById('s_start_date').value = sStartDate; document.getElementById('s_start_time').value = sStartTime;
        document.getElementById('s_due_date').value = sDueDate; document.getElementById('s_due_time').value = sDueTime;
        document.getElementById('s_notes_rte').innerHTML = s.notes || ''; document.getElementById('s_history').value = s.history || ''; document.getElementById('s_assignee').value = s.assigneeId || ''; document.getElementById('s_stakeholder').value = s.stakeholderId || ''; document.getElementById('s_bucket').value = s.bucket || '';
        
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
            div.innerHTML = buildChecklistItemHTML(c.title, c.done, c.dueDate, c.assigneeId, c.id); 
            addModalClDragHandlers(div); container.appendChild(div); 
        });
        
        const sTasks = appData.tasks.filter(t_obj => t_obj.projectStackId === id);
        if(sTasks.length === 0) tasksContainer.innerHTML = '<span style="font-size:12px; color:var(--text-muted)">Keine Aufgaben zugeordnet.</span>';
        sTasks.forEach(t_obj => {
            const st = appData.statuses.find(x => x.id === t_obj.status); const progress = getTaskProgress(t_obj);
            const div = document.createElement('div'); div.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:var(--bg-color); padding:8px 12px; border-radius:4px; font-size:13px; border:1px solid var(--border-color);";
            let tPausedIcon = t_obj.isPaused && !isTaskDone(t_obj) ? '<i class="fas fa-pause" style="color:var(--warning); margin-right:4px;"></i>' : '';
            if(isTaskDone(t_obj)) div.classList.add('is-completed');
            div.innerHTML = `<div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:10px;"><b>${tPausedIcon}${t_obj.projectName}</b> <span style="color:var(--text-muted); font-size:11px;">(${st? (st.id==='done'?t('col_completed'):st.title) :''})</span></div><div style="width:100px; margin:0 15px; flex-shrink:0;">${generateProgressBarHTML(progress)}</div><button class="secondary icon-btn" style="flex-shrink:0;" onclick="closeStackModal(); openModal('${t_obj.id}')"><i class="fas fa-external-link-alt"></i> Öffnen</button>`;
            tasksContainer.appendChild(div);
        });
        updateDepDisplay();
    } else {
        document.getElementById('stackModalTitle').innerText = t('s_new'); document.getElementById('btnDeleteStack').style.display = 'none'; document.getElementById('dropdownShareStack').style.display = 'none';
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
                _sp.checklist.forEach(title => {
                    const div = document.createElement('div'); div.className = 'checklist-item';
                    const nid = generateId(); div.setAttribute('data-id', nid);
                    div.innerHTML = buildChecklistItemHTML(title, false, '', '', nid);
                    addModalClDragHandlers(div); _scont.appendChild(div);
                });
            }
        }
    }
    actionsContainer.innerHTML = actionsHtml;
}
function closeStackModal() { document.getElementById('stackModal').classList.remove('active'); }
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
            const dateVal = item.querySelector('.cl-date')?.value || ''; const timeVal = item.querySelector('.cl-time')?.value || '';
            let finalDate = dateVal; if(timeVal && !finalDate) finalDate = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];
            let finalDue = finalDate; if(finalDue && timeVal) finalDue += 'T' + timeVal;
            
            let cId = item.getAttribute('data-id');
            if(!cId) cId = generateId();
            const cPreds = tempPredecessors[cId] || [];
            return { id: cId, done: item.querySelector('.cl-done')?.checked || false, title: item.querySelector('.cl-title')?.value || '', assigneeId: item.querySelector('.cl-assignee')?.value || '', dueDate: finalDue, predecessors: cPreds }
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
            notes: document.getElementById('s_notes_rte').innerHTML, history: finalHistory, assigneeId: document.getElementById('s_assignee').value, stakeholderId: document.getElementById('s_stakeholder').value, bucket: document.getElementById('s_bucket').value, checklist: checklist, predecessors: tempPredecessors[id] || [] 
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

function renderTaskChecklistItem(container, title, done, dueDate='', assigneeId='', id='') {
    const div = document.createElement('div'); div.className = 'checklist-item'; 
    if(id) div.setAttribute('data-id', id);
    div.innerHTML = buildChecklistItemHTML(title, done, dueDate, assigneeId, id); addModalClDragHandlers(div); container.appendChild(div);
}

function openModal(taskId = null) {
    populateTaskDropdowns(); document.getElementById('taskModal').classList.add('active'); switchTaskTab('tab-general', document.querySelector('#taskModal .modal-tab-btn')); 
    const container = document.getElementById('t_checklist_container'); container.innerHTML = '';
    document.getElementById('t_file_list').innerHTML = ''; document.getElementById('t_files').value = ''; document.getElementById('t_filepath').value = ''; currentTempFiles = [];
    ['t_projectStack','t_project','t_start_date','t_start_time','t_due_date','t_due_time','t_estTime','t_spentTime','t_notes','t_filepath', 't_assignee'].forEach(elId => { const el = document.getElementById(elId); if(el) el.value = ''; });
    document.getElementById('t_desc_rte').innerHTML = '';
    const baseFolderDisplay = appData.settings.attachmentFolder || 'C:\\ProMan_Dateien\\'; document.getElementById('t_base_folder_display').innerText = baseFolderDisplay;

    const actionsContainer = document.getElementById('task_header_actions'); let actionsHtml = '';

    if (taskId) {
        document.getElementById('modalTitle').innerText = t('task_edit'); { const _pr = document.getElementById('t_preset_row'); if(_pr) _pr.style.display='none'; } const t_obj = appData.tasks.find(x => x.id === taskId);
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

        document.getElementById('t_projectStack').value = t_obj.projectStackId || ''; document.getElementById('t_project').value = t_obj.projectName || ''; document.getElementById('t_stakeholder').value = t_obj.stakeholderId || ''; document.getElementById('t_bucket').value = t_obj.bucket || ''; document.getElementById('t_status').value = t_obj.status || (appData.statuses.length ? appData.statuses[0].id : ''); document.getElementById('t_priority').value = t_obj.priority || 'medium'; document.getElementById('t_assignee').value = t_obj.assigneeId || ''; document.getElementById('t_recurrence').value = t_obj.recurrence || 'none'; toggleCustomRecurrence();
        if(t_obj.recurrence === 'custom' && t_obj.customRecurrence) { document.getElementById('t_rec_num').value = t_obj.customRecurrence.num; document.getElementById('t_rec_type').value = t_obj.customRecurrence.type; }
        
        document.getElementById('t_start_date').value = tStartDate; document.getElementById('t_start_time').value = tStartTime;
        document.getElementById('t_due_date').value = tDueDate; document.getElementById('t_due_time').value = tDueTime;
        
        document.getElementById('t_estTime').value = t_obj.estimatedTime || ''; document.getElementById('t_spentTime').value = t_obj.spentTime || ''; document.getElementById('t_desc_rte').innerHTML = t_obj.description || ''; document.getElementById('t_notes').value = t_obj.notes || '';
        
        if(t_obj.checklist) t_obj.checklist.forEach(c => renderTaskChecklistItem(container, c.title, c.done, c.dueDate, c.assigneeId, c.id)); 
        if(t_obj.files) { currentTempFiles = [...t_obj.files]; renderFileList(); }
        updateDepDisplay();
    } else {
        document.getElementById('modalTitle').innerText = t('task_new'); document.getElementById('taskId').value = ''; document.getElementById('btnDeleteTask').style.display = 'none'; document.getElementById('dropdownShareTask').style.display = 'none';
        renderInteractiveRating('t_interactive_rating', null);
        document.getElementById('t_priority').value = 'medium'; document.getElementById('t_recurrence').value = 'none'; toggleCustomRecurrence();
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
        const _presetCl = (_tp && _tp.checklist && _tp.checklist.length) ? _tp.checklist : appData.defaultChecklist;
        _presetCl.forEach(title => {
            const newId = generateId();
            renderTaskChecklistItem(container, title, false, '', '', newId);
        });
        if (_tp && _tp.note) { const _rte = document.getElementById('t_desc_rte'); if (_rte) _rte.innerHTML = _tp.note.replace(/\n/g, '<br>'); }
        document.getElementById('t_deps_display').innerHTML = 'Keine Abhängigkeiten definiert.';
        setTimeout(() => document.getElementById('t_project').focus(), 100);
    }
    actionsContainer.innerHTML = actionsHtml;
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

function addFilesAsPaths() { 
    const input = document.getElementById('t_files'); if(input.files.length === 0) return; 
    const baseDir = appData.settings.attachmentFolder || 'C:\\ProMan_Dateien\\'; const folder = baseDir.endsWith('\\') || baseDir.endsWith('/') ? baseDir : baseDir + '\\';
    Array.from(input.files).forEach(file => { currentTempFiles.push({ type: 'path', name: file.name, path: folder + file.name }); }); 
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
            let fileUrl = f.path; if(!fileUrl.startsWith('http') && !fileUrl.startsWith('file://')) { fileUrl = 'file:///' + fileUrl.replace(/\\/g, '/'); }
            let safePath = f.path.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            html += `<div class="file-item" style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-color); padding:8px 10px; margin-bottom:5px; border-radius:4px; border: 1px solid var(--border-color);">
                <span style="font-size:13px; display:flex; align-items:center; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    <i class="fas fa-external-link-alt" style="margin-right:10px; color:var(--primary-color);"></i>
                    <a href="${fileUrl}" target="_blank" style="color:var(--text-main); text-decoration:none; outline:none;" title="Klicken zum Öffnen" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${f.path}</a>
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

function quickAddTask(inputEl, statusId) {
    const val = inputEl.value.trim(); if(!val) return;
    let defaultCl = []; if(appData.defaultChecklist && appData.defaultChecklist.length > 0) { defaultCl = appData.defaultChecklist.map(t_obj => ({ id: generateId(), done: false, title: t_obj, dueDate: '', assigneeId: '', predecessors: [] })); }
    const taskData = { id: generateId(), projectStackId: '', projectName: val, stakeholderId: '', bucket: '', status: statusId, priority: 'medium', recurrence: 'none', customRecurrence: null, startDate: '', dueDate: '', estimatedTime: '', spentTime: '', description: '', notes: '', checklist: defaultCl, files: [], assigneeId: appData.settings.currentUserId || '', predecessors: [] };
    appData.tasks.push(taskData); triggerWorkflows('task_created', { task: taskData }); saveToLocal(); inputEl.value = ''; showToast('Aufgabe schnell hinzugefügt.');
}

function saveTask() {
    try {
        const id = document.getElementById('taskId').value || generateId(); const titleInput = document.getElementById('t_project').value.trim();
        if(!titleInput) { switchTaskTab('tab-general', document.querySelectorAll('#taskModal .modal-tab-btn')[0]); return showToast("Bitte Aufgabenname eingeben.", "error"); }
        
        const existingTask = appData.tasks.find(x => x.id === id);

        const clItems = document.querySelectorAll('#t_checklist_container .checklist-item');
        const checklist = Array.from(clItems).map((item, index) => {
            const dateVal = item.querySelector('.cl-date')?.value || ''; const timeVal = item.querySelector('.cl-time')?.value || '';
            let finalDate = dateVal; if(timeVal && !finalDate) finalDate = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];
            let finalDue = finalDate; if(finalDue && timeVal) finalDue += 'T' + timeVal;
            
            let cId = item.getAttribute('data-id');
            if(!cId) cId = generateId();
            const cPreds = tempPredecessors[cId] || [];
            return { id: cId, done: item.querySelector('.cl-done')?.checked || false, title: item.querySelector('.cl-title')?.value || '', assigneeId: item.querySelector('.cl-assignee')?.value || '', dueDate: finalDue, predecessors: cPreds };
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
            estimatedTime: getVal('t_estTime'), spentTime: getVal('t_spentTime'), description: document.getElementById('t_desc_rte').innerHTML, notes: finalNotes, checklist: checklist, files: currentTempFiles,
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
    else if (currentView === 'checklists') renderChecklists(c);
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
    tabs.forEach(tab => {
        const active = plannerSubView === tab.id;
        tabHtml += `<button onclick="switchPlannerTab('${tab.id}')" style="
            border:none; border-radius:0; padding:9px 22px; font-size:13px; font-weight:${active?'700':'500'};
            background:${active ? 'var(--primary-color)' : 'transparent'};
            color:${active ? '#fff' : 'var(--text-muted)'};
            cursor:pointer; display:flex; align-items:center; gap:7px; transition:all 0.18s;
            border-right:${tab.id==='schedule' ? '1px solid var(--border-color)' : 'none'};
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
        addNode({ id: sk.id, type: 'stack', name: sk.name || 'Stack', done: sk.status === 'completed',
                  color: sk.color || 'var(--text-muted)', stackId: sk.id, preds: (sk.predecessors || []).slice() });
    });
    appData.tasks.forEach(tk => {
        if (!L.task) return;
        if (hideDone && isTaskDone(tk)) return;
        addNode({ id: tk.id, type: 'task', name: tk.projectName || 'Aufgabe', done: isTaskDone(tk),
                  stackId: tk.projectStackId || '', preds: (tk.predecessors || []).slice() });
        if (L.checklist && tk.checklist) {
            tk.checklist.forEach(ci => {
                if (!ci.id) return;
                if (hideDone && ci.done) return;
                addNode({ id: ci.id, type: 'checklist', name: ci.title || 'Punkt', done: !!ci.done,
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
            addNode({ id: ci.id, type: 'milestone', name: ci.title || 'Meilenstein', done: !!ci.done,
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
                <button class="dep-lvl ${L.stack?'on':''}" onclick="depToggleLevel('stack')"><i class="fas fa-folder"></i> Stack</button>
                <button class="dep-lvl ${L.task?'on':''}" onclick="depToggleLevel('task')"><i class="fas fa-tasks"></i> ${t('tasks')}</button>
                <button class="dep-lvl ${L.checklist?'on':''}" onclick="depToggleLevel('checklist')"><i class="fas fa-check-square"></i> ${t('view_checklists')}</button>
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
    Object.keys(cols).forEach(d => {
        cols[d].sort((a, b) => {
            if (groupRank[groupKey(a)] !== groupRank[groupKey(b)]) return groupRank[groupKey(a)] - groupRank[groupKey(b)];
            const sa = subKey(a), sb = subKey(b);
            if (sa !== sb) return String(sa).localeCompare(String(sb));
            return (typeRank[a.type] || 9) - (typeRank[b.type] || 9);
        });
    });

    const COL_W = 260, NODE_H = 74, V_GAP = 18, H_PAD = 40, V_PAD = 42, GRP_PAD = 14;
    let maxRows = 0;
    Object.keys(cols).forEach(d => { maxRows = Math.max(maxRows, cols[d].length); });
    const NODE_W = 200;

    /* Position je Knoten: Spalte = Tiefe; innerhalb Spalte gestapelt, Lücke zwischen Stack-Gruppen */
    Object.keys(cols).forEach(d => {
        let y = V_PAD, prevGroup = null;
        cols[d].forEach((n) => {
            const g = groupKey(n);
            if (prevGroup !== null && g !== prevGroup) y += GRP_PAD;
            n.x = H_PAD + n.depth * COL_W;
            n.y = y;
            y += NODE_H + V_GAP;
            prevGroup = g;
        });
    });

    /* ---- Gruppen-Rahmen berechnen ---- */
    const hulls = [];
    const boundsOf = (list) => {
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        list.forEach(n => { x1 = Math.min(x1, n.x); y1 = Math.min(y1, n.y); x2 = Math.max(x2, n.x + NODE_W); y2 = Math.max(y2, n.y + NODE_H); });
        return { x1, y1, x2, y2 };
    };
    groupOrder.forEach(g => {
        if (g === '_none') return;
        const members = nodes.filter(n => groupKey(n) === g);
        if (members.length < 2) return;
        const bk = appData.projectStacks.find(x => x.id === g);
        const b = boundsOf(members);
        hulls.push({ kind: 'stack', x: b.x1 - GRP_PAD, y: b.y1 - GRP_PAD - 16, w: (b.x2 - b.x1) + GRP_PAD * 2, h: (b.y2 - b.y1) + GRP_PAD * 2 + 16, name: bk ? bk.name : 'Stack', color: (bk && bk.color) ? bk.color : 'var(--primary-color)' });
    });
    const tasksWithCp = {};
    nodes.forEach(n => { if (n.type === 'checklist' && n.parentTask) (tasksWithCp[n.parentTask] = tasksWithCp[n.parentTask] || []).push(n); });
    Object.keys(tasksWithCp).forEach(tid => {
        const taskNode = byId[tid];
        if (!taskNode) return;
        const members = [taskNode].concat(tasksWithCp[tid]);
        const b = boundsOf(members);
        hulls.push({ kind: 'task', x: b.x1 - 8, y: b.y1 - 8, w: (b.x2 - b.x1) + 16, h: (b.y2 - b.y1) + 16, name: '', color: 'var(--wk-graphite)' });
    });

    let canvasW = 0, canvasH = 0;
    nodes.forEach(n => { canvasW = Math.max(canvasW, n.x + NODE_W); canvasH = Math.max(canvasH, n.y + NODE_H); });
    hulls.forEach(hz => { canvasW = Math.max(canvasW, hz.x + hz.w); canvasH = Math.max(canvasH, hz.y + hz.h); });
    canvasW += H_PAD; canvasH += V_PAD;
    /* ---- Kanten (SVG) zeichnen: von Vorgänger (rechts) zu Abhängigem (links) ---- */
    let edges = '';
    nodes.forEach(n => {
        n.preds.forEach(pid => {
            const p = byId[pid];
            if (!p) return;
            const x1 = p.x + NODE_W, y1 = p.y + NODE_H / 2;
            const x2 = n.x, y2 = n.y + NODE_H / 2;
            const mx = (x1 + x2) / 2;
            edges += `<path class="dep-edge dep-edge-${n.type}" d="M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}" marker-end="url(#depArrow)"></path>`;
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
        nodeHtml += `<div class="${cls} ${window.depConnectMode && window.depTapSource === n.id ? 'dep-tap-src' : ''}" style="left:${n.x}px; top:${n.y}px; width:${NODE_W}px; height:${NODE_H}px"
            data-depid="${n.id}" data-deptype="${n.type}" draggable="true"
            ondragstart="depDragStart(event,'${n.id}','${n.type}')" ondragend="depDragEnd(event)"
            ondragover="depDragOver(event)" ondragleave="depDragLeave(event)" ondrop="depDrop(event,'${n.id}','${n.type}')"
            onclick="depNodeClick(event,'${n.id}','${n.type}')">
            ${!hasPreds
                ? `<span class="dep-gport in start" title="${t('dep_start')}">&gt;</span>`
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
                <path d="M0,0 L8,3 L0,6 Z" fill="var(--wk-graphite-2)"></path></marker></defs>
            ${edges}
        </svg>
        ${hulls.map(hz => `<div class="dep-hull dep-hull-${hz.kind}" style="left:${hz.x}px; top:${hz.y}px; width:${hz.w}px; height:${hz.h}px; --hc:${hz.color}">${hz.name ? `<span class="dep-hull-label"><i class='fas fa-folder'></i> ${escapeHtmlToday(hz.name)}</span>` : ''}</div>`).join('')}
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
    /* Normaler Modus: Stack/Aufgabe öffnen */
    if (type === 'stack') openStackModal(id);
    else if (type === 'task') openModal(id);
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

        let checkHtml = '';
        if(activeItem.obj.checklist && activeItem.obj.checklist.length > 0) {
            activeItem.obj.checklist.forEach((cl, i) => {
                let d = '', time = ''; if(cl.dueDate) { if(cl.dueDate.includes('T')) [d, time] = cl.dueDate.split('T'); else d = cl.dueDate; }
                let userOpts = `<option value="">-- Benutzer --</option>` + appData.users.map(u => `<option value="${u.id}" ${u.id===cl.assigneeId?'selected':''}>${u.name}</option>`).join('');
                let lineThrough = cl.done ? 'text-decoration:line-through; opacity:0.6;' : '';

                let clLocked = isEntityLocked(cl.id) ? '<i class="fas fa-lock" style="color:var(--text-muted); font-size:10px; margin-right:4px;" title="Gesperrt durch Abhängigkeit"></i>' : '';

                checkHtml += `
                <div class="checklist-item draggable-item" draggable="true" ondragstart="event.dataTransfer.setData('text/plain', '${i}'); event.dataTransfer.setData('type', 'checklist-item'); event.dataTransfer.setData('parentId', '${activeItem.id}'); event.dataTransfer.setData('parentType', '${activeItem.type}');" ondragover="handleCardDragOver(event, this, false)" ondragleave="handleCardDragLeave(this)" ondrop="handleGlobalClDrop(event, this, '${activeItem.type}', '${activeItem.id}', ${i})" data-id="${cl.id}">
                    <div class="cl-swipe-bg"><i class="fas fa-trash"></i></div>
                    <div class="cl-swipe-container" tabindex="-1">
                        <div class="cl-main-row" style="${lineThrough}">
                            <i class="fas fa-grip-vertical cl-drag"></i>
                            <input type="checkbox" class="cl-done" ${cl.done ? 'checked' : ''} onchange="updateGlobalCl('${activeItem.type}', '${activeItem.id}', ${i}, 'done', this.checked)">
                            <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; justify-content: center;">
                                <div style="display: flex; align-items: center; width: 100%;">
                                    ${clLocked}<input type="text" class="cl-title" value="${cl.title}" placeholder="..." onblur="updateGlobalCl('${activeItem.type}', '${activeItem.id}', ${i}, 'title', this.value)" onkeypress="if(event.key==='Enter') this.blur()">
                                    <i class="fas fa-info-circle cl-info-btn" onclick="this.closest('.checklist-item').classList.toggle('show-details')"></i>
                                </div>
                            </div>
                        </div>
                        <div class="cl-controls">
                            ${getAvatarHtml(cl.assigneeId, 'avatar-sm')}
                            <select class="cl-assignee" onchange="updateGlobalCl('${activeItem.type}', '${activeItem.id}', ${i}, 'assigneeId', this.value)">${userOpts}</select>
                            <input type="date" value="${d}" onchange="updateGlobalClDate('${activeItem.type}', '${activeItem.id}', ${i}, this.value, this.nextElementSibling.value)">
                            <input type="time" value="${time}" onchange="updateGlobalClDate('${activeItem.type}', '${activeItem.id}', ${i}, this.previousElementSibling.value, this.value)">
                            <button class="secondary icon-btn" style="padding:4px; font-size:11px; margin-left:4px; color:var(--text-muted);" onclick="openDependencyModalForCl(this)" title="Abhängigkeiten für diesen Punkt"><i class="fas fa-link"></i></button>
                            <button class="secondary icon-btn cl-delete-btn" style="color:var(--danger); margin-left:10px;" onclick="deleteGlobalCl('${activeItem.type}', '${activeItem.id}', ${i})" tabindex="-1" title="Löschen"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                    <div class="cl-deps-display" style="padding: 0 35px 4px 35px; width: 100%; display: flex; flex-wrap: wrap; gap: 4px;"></div>
                </div>`;
            });
        }
        
        html += `<div style="margin-top:20px; border-top:1px solid var(--border-color); padding-top:20px;">
                    <h4 style="margin-bottom:10px;"><i class="fas fa-check-square"></i> Checkliste / Milestones</h4>
                    ${checkHtml}
                    <button class="secondary" style="font-size:11px; padding:4px 8px; margin-top:5px;" onclick="addGlobalCl('${activeItem.type}', '${activeItem.id}')"><i class="fas fa-plus"></i> ${t('add_point')}</button>
                 </div>`;
    }
    
    html += `</div></div>`; c.innerHTML = html;
    const leftPane = document.getElementById('notesLeftPane'); if (leftPane) leftPane.scrollTop = notesListScrollPos;
    updateDepDisplay();
}

// CHECKLISTEN VIEW
function renderChecklists(c) {
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
                if(item.dueDate) { if(item.dueDate.includes('T')) [d, time] = item.dueDate.split('T'); else d = item.dueDate; }
                let userOpts = `<option value="">-- Benutzer --</option>` + appData.users.map(u => `<option value="${u.id}" ${u.id===item.assigneeId?'selected':''}>${u.name}</option>`).join('');
                let lineThrough = item.done ? 'text-decoration:line-through; opacity:0.6;' : '';
                let clLocked = isEntityLocked(item.id) ? '<i class="fas fa-lock" style="color:var(--text-muted); font-size:10px; margin-right:4px;" title="Gesperrt durch Abhängigkeit"></i>' : '';

                h += `
                <div class="checklist-item draggable-item" draggable="true" ondragstart="event.dataTransfer.setData('text/plain', '${originalIdx}'); event.dataTransfer.setData('type', 'checklist-item'); event.dataTransfer.setData('parentId', '${parentId}'); event.dataTransfer.setData('parentType', '${parentType}');" ondragover="handleCardDragOver(event, this, false)" ondragleave="handleCardDragLeave(this)" ondrop="handleGlobalClDrop(event, this, '${parentType}', '${parentId}', ${originalIdx})" style="margin-left:25px;" data-id="${item.id}">
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
                            <input type="date" value="${d}" onchange="updateGlobalClDate('${parentType}', '${parentId}', ${originalIdx}, this.value, this.nextElementSibling.value)">
                            <input type="time" value="${time}" onchange="updateGlobalClDate('${parentType}', '${parentId}', ${originalIdx}, this.previousElementSibling.value, this.value)">
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

    const fStacks = getFilteredStacks(); const fTasks = getFilteredTasks(); let renderItems = [];
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
    if(renderItems.length === 0 && !hasItems) { html += `<p style="color:var(--text-muted); margin-top:20px; text-align:center;">Keine Aufgaben oder Stacks gefunden.</p>`; }
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
        colDiv.innerHTML = `<div class="kanban-header"><span>${colTitle}</span> <span class="badge" style="background:var(--border-color); color:var(--text-main)">${colCount}</span></div>`;
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

        const quickAdd = document.createElement('div'); quickAdd.className = 'kanban-quick-add'; quickAdd.innerHTML = `<input type="text" placeholder="+ ${t('quick_add')}" onkeypress="if(event.key==='Enter') quickAddTask(this, '${col.id}')">`;
        colDiv.appendChild(cardsDiv); colDiv.appendChild(quickAdd); board.appendChild(colDiv);
    });
    c.appendChild(board);
}

function createTaskCard(task) {
    const card = document.createElement('div'); const isCompleted = isTaskDone(task); const isPaused = task.isPaused;
    card.className = `task-card draggable-item ${isCompleted ? 'is-completed' : ''} ${isCompactMode ? 'compact' : ''}`; 
    card.dataset.id = task.id; 
    /* Farbiger Randstreifen: Stakeholder-Farbe, sonst Prioritätsfarbe */
    { let _strip = 'var(--border-color)';
      if (task.stakeholderId) { const _sh = appData.stakeholders.find(s => s.id === task.stakeholderId); if (_sh) _strip = _sh.color; }
      else if (task.priority === 'high') _strip = 'var(--danger)';
      else if (task.priority === 'medium') _strip = 'var(--primary-color)';
      else if (task.priority === 'low') _strip = 'var(--success)';
      card.style.setProperty('--card-strip', _strip); }
    if(isPaused && !isCompleted) {
        card.style.background = 'color-mix(in srgb, var(--surface-color) 92%, #000 8%)';
        card.style.borderColor = 'color-mix(in srgb, var(--border-color) 85%, #000 15%)';
    }
    
    card.draggable = true; 
    card.ondragstart = (e) => { e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.setData('type', 'task'); };
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

        let chartHtml = '';
        const sLogs = appData.timeLogs.filter(l => sTasks.some(t_obj => t_obj.id === l.taskId));
        if(sLogs.length > 0) {
            const logAgg = {}; sLogs.forEach(l => { logAgg[l.date] = (logAgg[l.date] || 0) + parseFloat(l.hours); });
            const dates = Object.keys(logAgg).sort((a,b) => new Date(a) - new Date(b));
            if(dates.length > 1) {
                const maxH = Math.max(...Object.values(logAgg));
                const points = dates.map((d, i) => { return { x: (i / (dates.length - 1)) * 100, y: 35 - ((logAgg[d] / maxH) * 28) }; });
                let pathD = `M ${points[0].x} ${points[0].y}`;
                for (let i = 1; i < points.length - 1; i++) { const xc = (points[i].x + points[i + 1].x) / 2; const yc = (points[i].y + points[i + 1].y) / 2; pathD += ` Q ${points[i].x} ${points[i].y}, ${xc} ${yc}`; }
                pathD += ` T ${points[points.length - 1].x} ${points[points.length - 1].y}`;
                chartHtml = `<div style="height:40px; width:100%; margin-top:5px; margin-bottom:10px; position:relative; overflow:hidden; border-bottom:1px solid var(--border-color);" title="Aktivitätsverlauf (Zeiterfassung)"><svg viewBox="0 0 100 40" preserveAspectRatio="none" style="width:100%; height:100%;"><path d="${pathD} L 100 40 L 0 40 Z" fill="var(--primary-lightest)"/><path d="${pathD}" fill="none" stroke="var(--primary-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;
            }
        }

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
            <div style="display:flex; gap:10px; margin-bottom:5px;"><div style="flex:1;"><div style="font-size:11px; font-weight:bold; margin-bottom:2px;">${t('tasks')}</div>${generateProgressBarHTML(sp.tPct, true)}</div><div style="flex:1;"><div style="font-size:11px; font-weight:bold; margin-bottom:2px;">${t('milestones')}</div>${generateProgressBarHTML(sp.mPct, false)}</div></div>
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
    
    const filteredTasks = getFilteredTasks(); const stacks = getFilteredStacks();
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
            if(cols.progress) { html += `<div style="font-size:10px; color:var(--primary-color); font-weight:bold;">${t('tasks')} (${sp.tPct}%)</div>${generateProgressBarHTML(sp.tPct, true)}<div style="font-size:10px; color:var(--primary-color); font-weight:bold; margin-top:2px;">${t('milestones')} (${sp.mPct}%)</div>${generateProgressBarHTML(sp.mPct, false)}`; } 
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

    if(cols.progress) rHtml += `<td data-label="Fortschritt"><div style="display:flex; align-items:center; gap:8px;">${generateProgressBarHTML(progress)}<small style="min-width:25px; text-align:right;">${progress}%</small></div></td>`;
    if(cols.description) { const desc = task.description ? (task.description.replace(/<[^>]*>?/gm, '').substring(0,50)+'...') : '-'; rHtml += `<td data-label="Notizen"><span style="font-size:11px; color:var(--text-muted);">${desc}</span></td>`; }
    if(cols.checklist) { const cl = task.checklist || []; const clDone = cl.filter(c=>c.done).length; rHtml += `<td data-label="Checkliste"><span style="font-size:11px; color:var(--text-muted);"><i class="fas fa-check-square"></i> ${clDone}/${cl.length}</span></td>`; }
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

function renderGroupedView(c, groupKey, itemsObj, unassignedLabel, showTimeStats=false) {
    let sortKey = groupKey === 'stakeholderId' ? stakeholderSortKey : bucketSortKey; let sortVarName = groupKey === 'stakeholderId' ? 'stakeholderSortKey' : 'bucketSortKey';
    let html = getSortButtonsHTML(sortKey, sortVarName);
    const itemsToGroup = [...getFilteredTasks().map(t_obj => ({...t_obj, _type: 'task'})), ...getFilteredStacks().map(s => ({...s, _type: 'stack'}))];
    const groups = itemsToGroup.reduce((acc, item) => { const kId = item[groupKey] || 'none'; if(!acc[kId]) acc[kId] = []; acc[kId].push(item); return acc; }, {});
    
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
    
    if(showTimeStats) {
        stackIdsInGroup.forEach(sId => { const allStackTasks = appData.tasks.filter(tx => tx.projectStackId === sId); allStackTasks.forEach(tx => { totalEst += parseFloat(tx.estimatedTime||0); totalSpent += parseFloat(tx.spentTime||0); }); });
        standaloneTasks.forEach(t_obj => { totalEst += parseFloat(t_obj.estimatedTime||0); totalSpent += parseFloat(t_obj.spentTime||0); });
    }
    
    let headerExtra = showTimeStats ? `<div style="font-size:12px; margin-bottom:15px; color:var(--text-muted)">${t('time_effort')}: ${totalSpent.toFixed(2)}h ${t('actual')} / ${totalEst.toFixed(2)}h ${t('target')}</div>` : '';
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
function renderBuckets(c) { const bObj = appData.buckets.map(b => ({id: b, name: b, color: 'var(--primary-color)'})); renderGroupedView(c, 'bucket', bObj, t('none'), true); }

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

function quickTrackTime(taskId) {
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
            if(cl.dueDate && (taskMatchesUser || clMatchesUser)) { pushSpanned(cl.dueDate, cl.dueDate, 'task-checklist', cl, t_obj); }
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
            html += `<div style="background:var(--surface-color); border:1px solid var(--border-color); border-radius:var(--radius); margin-bottom:15px; padding:15px; box-shadow:var(--shadow); flex-shrink:0;">`;
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
                    else if(ev.type === 'task-checklist') { color='var(--primary-color)'; bg='var(--primary-lightest)'; icon='<i class="fas fa-check-square"></i>'; title=ev.data.title; click=`openModal('${ev.parent.id}')`; isComp = (ev.data.done || isTaskDone(ev.parent)); isPaused = ev.parent.isPaused && !isComp; } else if(ev.type === 'absence') { const _ac = ABSENCE_TYPES[ev.data.type] || {}; color = ttAbsColor(ev.data.type); bg = 'color-mix(in srgb, ' + color + ' 16%, transparent)'; icon = '<i class="fas ' + (ttAbsIcon(ev.data.type)) + '"></i>'; title = ttAbsLabel(ev.data.type) + (ev.data.note ? ' – ' + ev.data.note : ''); click = "switchView('time')"; }
                    
                    let spanText = '';
                    if(ev.span === 'start') spanText = '(Start)';
                    if(ev.span === 'end') spanText = '(Deadline)';
                    if(ev.span === 'middle') spanText = '(Laufend)';

                    let pausedIcon = isPaused ? '<i class="fas fa-pause" style="color:var(--warning); margin-right:4px;"></i>' : '';
                    
                    html += `<div class="cal-event ${isComp?'is-completed':''}" style="background:${bg}; color:${color}; padding:6px 12px; font-size:12px; display:inline-flex; flex-direction:row; align-items:center; gap:6px; border-radius:20px; cursor:pointer; border: 1px solid ${color};" onclick="${click}">
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
            html += `<div style="position:relative; width:100%; min-width:800px; height:${containerHeight}px; border-bottom:2px solid var(--border-color); margin-bottom:10px;">`;
            
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
                else if(ev.type === 'task-checklist') { color='var(--primary-color)'; bg='var(--primary-lightest)'; icon='<i class="fas fa-check-square"></i>'; title=ev.data.title; click=`openModal('${ev.parent.id}')`; isComp = (ev.data.done || isTaskDone(ev.parent)); isPaused = ev.parent.isPaused && !isComp; } else if(ev.type === 'absence') { const _ac = ABSENCE_TYPES[ev.data.type] || {}; color = ttAbsColor(ev.data.type); bg = 'color-mix(in srgb, ' + color + ' 16%, transparent)'; icon = '<i class="fas ' + (ttAbsIcon(ev.data.type)) + '"></i>'; title = ttAbsLabel(ev.data.type) + (ev.data.note ? ' – ' + ev.data.note : ''); click = "switchView('time')"; }

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
            sortedWorkDays.forEach(d => html += `<div class="cal-day-header" style="border-right:1px solid var(--border-color); border-bottom:1px solid var(--border-color); border-radius:0; border-left:none; border-top:none;">${dayNames[d]}</div>`);
            
            const todayStr = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];

            const renderDay = (dateStr, dayNum, minHeight) => {
                const dayEvents = eventsMap[dateStr] || []; let evHtml = '';
                dayEvents.sort((a,b) => { const typeW = {'stack':1, 'task':2, 'milestone':3, 'task-checklist':4}; if(typeW[a.type] !== typeW[b.type]) return typeW[a.type] - typeW[b.type]; return 0; });
                
                dayEvents.forEach(ev => {
                    let color='var(--text-main)'; let bg='rgba(0,0,0,0.05)'; let icon=''; let title=''; let click=''; let isComp = false; let isPaused = false;
                    
                    if(ev.type === 'stack') { color='var(--primary-color)'; bg='var(--primary-light)'; icon='<i class="fas fa-folder"></i>'; title=ev.data.name; click=`openStackModal('${ev.data.id}')`; isComp = (ev.data.status === 'completed'); isPaused = ev.data.status === 'paused'; } 
                    else if(ev.type === 'milestone') { color='var(--primary-color)'; bg='var(--primary-lightest)'; icon='<i class="fas fa-flag"></i>'; title=ev.data.title; click=`openStackModal('${ev.parent.id}')`; isComp = (ev.data.done || ev.parent.status === 'completed'); isPaused = ev.parent.status === 'paused' && !isComp; } 
                    else if(ev.type === 'task') { color='var(--primary-color)'; bg='var(--primary-light)'; icon='<i class="fas fa-tasks"></i>'; title=ev.data.projectName; click=`openModal('${ev.data.id}')`; isComp = isTaskDone(ev.data); isPaused = ev.data.isPaused && !isComp; }
                    else if(ev.type === 'task-checklist') { color='var(--primary-color)'; bg='var(--primary-lightest)'; icon='<i class="fas fa-check-square"></i>'; title=ev.data.title; click=`openModal('${ev.parent.id}')`; isComp = (ev.data.done || isTaskDone(ev.parent)); isPaused = ev.parent.isPaused && !isComp; } else if(ev.type === 'absence') { const _ac = ABSENCE_TYPES[ev.data.type] || {}; color = ttAbsColor(ev.data.type); bg = 'color-mix(in srgb, ' + color + ' 16%, transparent)'; icon = '<i class="fas ' + (ttAbsIcon(ev.data.type)) + '"></i>'; title = ttAbsLabel(ev.data.type) + (ev.data.note ? ' – ' + ev.data.note : ''); click = "switchView('time')"; }
                    
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

                return `<div class="cal-day ${dateStr===todayStr?'today':''}" style="min-height:${minHeight}; border-right:1px solid var(--border-color); border-bottom:1px solid var(--border-color); border-radius:0; border-left:none; border-top:none; padding:4px 2px;"><div style="display:flex; justify-content:flex-end; align-items:center; font-size:12px; font-weight:bold; color:${dateStr===todayStr?'var(--primary-color)':'var(--text-muted)'}; margin-bottom: 4px; padding-right:4px;">${kwBadge}${dayNum}</div>${evHtml}</div>`;
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
                let monthName = new Date(y, m, 1).toLocaleString('de-DE', {month: 'long'}); let mEvents = events.filter(e => e.date.getFullYear() === y && e.date.getMonth() === m);
                let uniqueTasks = new Set(mEvents.filter(e => e.type === 'task').map(e => e.data.id)).size; let uniqueStacks = new Set(mEvents.filter(e => e.type === 'stack').map(e => e.data.id)).size; let uniqueMiles = new Set(mEvents.filter(e => e.type === 'milestone').map(e => e.data.title + e.parent.id)).size; let uniqueTcl = new Set(mEvents.filter(e => e.type === 'task-checklist').map(e => e.data.title + e.parent.id)).size;
                const isCurrentMonth = (new Date().getFullYear() === y && new Date().getMonth() === m);

                html += `<div class="month-card ${isCurrentMonth?'current':''}" onclick="scheduleCurrentDate.setMonth(${m}); scheduleMode='month'; safeRenderSchedule()">
                    <div class="month-card-title" style="color:${isCurrentMonth?'var(--primary-color)':'inherit'}">${monthName}</div>
                    <div style="font-size:12px; color:var(--text-muted); display:flex; flex-direction:column; gap:5px; align-items:center; margin-top: 5px;">
                        ${uniqueTasks > 0 ? `<span class="badge" style="background:var(--primary-light); color:var(--primary-color); width:100%; text-align:center; padding: 6px;"><i class="fas fa-tasks"></i> ${uniqueTasks} ${t('tasks')}</span>` : ''}
                        ${uniqueStacks > 0 ? `<span class="badge" style="background:var(--primary-light); color:var(--primary-color); width:100%; text-align:center; padding: 6px;"><i class="fas fa-folder"></i> ${uniqueStacks} Stacks</span>` : ''}
                        ${(uniqueMiles + uniqueTcl) > 0 ? `<span class="badge" style="background:rgba(0,0,0,0.05); color:var(--text-main); width:100%; text-align:center; padding: 6px;"><i class="fas fa-check-square"></i> ${uniqueMiles + uniqueTcl} Checkpunkte</span>` : ''}
                        ${uniqueTasks === 0 && uniqueStacks === 0 && uniqueMiles === 0 && uniqueTcl === 0 ? `<span style="opacity:0.5; margin-top:10px;">Keine Einträge</span>` : ''}
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
                return `<div class="agenda-card absence" style="--abs:${ttAbsColor(a.type)}" onclick="switchView('time')">
                    <div class="agenda-ic" style="background:${ttAbsColor(a.type)}"><i class="fas ${ttAbsIcon(a.type)}"></i></div>
                    <div class="agenda-body"><b>${ttAbsLabel(a.type)}</b>${a.note ? `<span class="agenda-sub">${escapeHtmlToday(a.note)}</span>` : ''}</div>
                    <div class="agenda-hours">${ttNum(a.hours)} h</div>
                </div>`;
            }
            const isTaskType = ev.type === 'task' || ev.type === 'task-checklist';
            const actualTask = isTaskType ? (ev.type === 'task' ? ev.data : ev.parent) : null;
            const actualStack = !isTaskType ? (ev.type === 'stack' ? ev.data : ev.parent) : null;
            if (!actualTask && !actualStack) return '';   /* Absturzschutz */
            
            const isComp = isTaskType ? isTaskDone(actualTask) : (actualStack ? actualStack.status === 'completed' : false);
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
            <button class="secondary" style="border:none; border-radius:0; height:36px; border-right:1px solid var(--border-color); font-size:12px; font-weight:bold; padding: 0 15px;" onclick="scrollToTodayTimeline()" title="Zum heutigen Datum springen"><i class="fas fa-bullseye" style="color:var(--primary-color);"></i> Heute</button>
            <button class="secondary icon-btn" style="border:none; border-radius:0; height:36px; width:40px; border-right:1px solid var(--border-color);" onclick="zoomTimeline(-1)" title="Herauszoomen"><i class="fas fa-minus"></i></button>
            <button class="secondary icon-btn" style="border:none; border-radius:0; height:36px; width:40px;" onclick="zoomTimeline(1)" title="Hineinzoomen"><i class="fas fa-plus"></i></button>
        </div>
    </div>

    <div class="timeline-actions-header" style="background: var(--surface-color); padding: 5px 15px; border-radius: var(--radius); border: 1px solid var(--border-color); box-shadow: var(--shadow); display:flex; align-items:center; gap: 15px; margin-bottom: 10px;">
        <button draggable="true" ondragstart="event.dataTransfer.setData('markerId', 'new');" onclick="openMarkerModal()" class="secondary" title="${t('marker_hint')}" style="cursor:grab; padding: 4px 10px; font-size: 12px;">
            <i class="fas fa-map-marker-alt"></i> Neuer Marker
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
            if(cl.dueDate && mMatchesUser) items.push({ type: 'task-checklist', d: cl, taskId: t_obj.id, idx: idx, start: new Date(cl.dueDate.split('T')[0]), end: new Date(cl.dueDate.split('T')[0]), hasNoEnd: false, hasNoStart: false }); 
        }); 
    });

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
        const entityId = item.type === 'milestone' ? item.d.id : (item.type === 'task-checklist' ? item.d.id : item.d.id);
        
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
                <div class="gantt-resize-handle start" onmousedown="startTimelineDrag(event, '${item.type}', '${entityId}', 'start', ${item.idx})" ontouchstart="startTimelineDrag(event, '${item.type}', '${entityId}', 'start', ${item.idx})"></div>
                <div class="gantt-move-handle" onmousedown="startTimelineDrag(event, '${item.type}', '${entityId}', 'move', ${item.idx})" ontouchstart="startTimelineDrag(event, '${item.type}', '${entityId}', 'move', ${item.idx})"></div>
                <div class="gantt-resize-handle end" onmousedown="startTimelineDrag(event, '${item.type}', '${entityId}', 'end', ${item.idx})" ontouchstart="startTimelineDrag(event, '${item.type}', '${entityId}', 'end', ${item.idx})"></div>
            `;
        } else if(!isComp && isDiamond) {
            dragHandles = `<div class="gantt-move-handle" style="inset:0;" onmousedown="startTimelineDrag(event, '${item.type}', '${entityId}', 'move', ${item.idx})" ontouchstart="startTimelineDrag(event, '${item.type}', '${entityId}', 'move', ${item.idx})"></div>`;
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
            tCl.forEach(cl => { barsHtml += drawBar(cl, true, color, `openModal('${t_obj.d.id}')`, `<i class="fas fa-check-square" style="margin-left:15px; margin-right:5px; color:${color}"></i> ${cl.d.title}`, true, isTaskDone(t_obj.d) || cl.d.done); });
        });
    });

    items.forEach(item => {
        if(item.type === 'task' && !item.d.projectStackId) {
            let color = 'var(--text-muted)'; if(item.d.stakeholderId) { const sh = appData.stakeholders.find(x => x.id === item.d.stakeholderId); if(sh) color = sh.color; } 
            const tPausedIcon = item.d.isPaused && !isTaskDone(item.d) ? '<i class="fas fa-pause" style="color:var(--warning); margin-right:4px;"></i>' : '';
            barsHtml += drawBar(item, false, color, `openModal('${item.d.id}')`, `<i class="fas fa-file" style="color:${color}; margin-right:5px;"></i> ${tPausedIcon}${item.d.projectName}`, false, isTaskDone(item.d)); 
            const tCl = items.filter(i => i.type === 'task-checklist' && i.taskId === item.d.id);
            tCl.forEach(cl => { barsHtml += drawBar(cl, true, color, `openModal('${item.d.id}')`, `<i class="fas fa-check-square" style="margin-left:15px; margin-right:5px; color:${color}"></i> ${cl.d.title}`, true, isTaskDone(item.d) || cl.d.done); });
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
            
            globalHtml += `<div class="global-timer" onclick="switchView('time')" style="cursor:pointer;" title="Klicken um zur Zeiterfassung zu wechseln"><i class="fas fa-circle"></i> ${timeStr} <span class="gt-task-name" style="font-weight:normal; max-width:100px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${tName}</span> <button class="icon-btn" style="background:transparent; border:none; padding:0; color:var(--danger);" onclick="event.stopPropagation(); stopTimer('${id}')" title="Stoppen"><i class="fas fa-stop"></i></button></div>`;
            
            mobileTimerHtml += `<div style="background:var(--danger); color:white; padding:15px; border-radius:var(--radius); display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; cursor:pointer;" onclick="closeMobileMoreMenu(); switchView('time')">
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

function renderTimeTracking(c) {
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

    const sortedLogs = [...appData.timeLogs].sort((a,b) => new Date(b.date) - new Date(a.date));

    let html = `
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
            <h3 style="margin-bottom:15px;">${t('booking_history')}</h3>
            <div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>${t('date')}</th><th>${t('task')}</th><th>${t('duration')}</th><th>Notiz</th><th width="80"></th></tr></thead><tbody>`;
    if(sortedLogs.length === 0) html += `<tr><td colspan="5">Keine Einträge.</td></tr>`;
    sortedLogs.forEach((log) => {
        const { task, deleted } = getTaskOrDeleted(log.taskId);
        const isPaused = task && task.isPaused && !isTaskDone(task); 
        const pausedIcon = isPaused && !deleted ? '<i class="fas fa-pause" style="color:var(--warning); margin-right:4px;" title="Pausiert"></i>' : '';
        const taskName = task ? task.projectName : 'Unbekannt';
        const deletedPill = deleted ? `<span class="badge" style="background:var(--danger); color:white; font-size:10px; margin-left:8px; padding: 2px 6px;">Gelöscht</span>` : '';
        
        html += `<tr><td data-label="Datum">${log.date}</td><td data-label="Aufgabe"><b>${pausedIcon}${taskName}${deletedPill}</b></td><td data-label="Dauer"><span class="badge" style="background:rgba(0,0,0,0.05); color:var(--text-main); font-size:12px;">${parseFloat(log.hours).toFixed(2)}h</span></td><td data-label="Notiz">${log.note || '-'}</td><td style="flex-direction:row;"><button class="secondary icon-btn" onclick="openEditTimeLog('${log.id}')"><i class="fas fa-pen"></i></button> <button class="secondary icon-btn" style="color:var(--danger);" onclick="deleteTimeLog('${log.id}')"><i class="fas fa-trash"></i></button></td></tr>`;
    });
    html += `</tbody></table></div></div></div>`;
    c.innerHTML = html; updateTimerDisplays();
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

function exportJSON() { 
    let exportData = JSON.parse(JSON.stringify(appData));
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

function exportExcel() {
    if(typeof XLSX === 'undefined') return showToast('Excel Bibliothek lädt noch.', 'error');
    const wsData = getFilteredTasks().map(t_obj => {
        const sh = appData.stakeholders.find(s => s.id === t_obj.stakeholderId); const st = appData.statuses.find(s => s.id === t_obj.status); const stack = appData.projectStacks.find(ps => ps.id === t_obj.projectStackId); const plainDesc = t_obj.description ? t_obj.description.replace(/<[^>]*>?/gm, '') : '';
        return { Projekt_Stack: stack ? stack.name : '-', Aufgabenname: t_obj.projectName, Stakeholder: sh ? sh.name : '-', Kategorie: t_obj.bucket, Status: st ? st.title : '-', Priorität: t_obj.priority, Start: t_obj.startDate, Fälligkeit: t_obj.dueDate, Aufwand_Geschätzt: t_obj.estimatedTime, Aufwand_Bisher: t_obj.spentTime, Notizen: plainDesc };
    });
    const worksheet = XLSX.utils.json_to_sheet(wsData); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Aufgaben"); XLSX.writeFile(workbook, "Projekte.xlsx");
}

function exportSingleTaskExcel() {
    if(typeof XLSX === 'undefined') return showToast('Excel Bibliothek lädt noch.', 'error');
    const id = document.getElementById('taskId').value; const t_obj = appData.tasks.find(x => x.id === id); if(!t_obj) return;
    const sh = appData.stakeholders.find(s => s.id === t_obj.stakeholderId); const st = appData.statuses.find(s => s.id === t_obj.status); const stack = appData.projectStacks.find(ps => ps.id === t_obj.projectStackId); const plainDesc = t_obj.description ? t_obj.description.replace(/<[^>]*>?/gm, '') : '';
    const wsData = [{ Projekt_Stack: stack ? stack.name : '-', Aufgabenname: t_obj.projectName, Stakeholder: sh ? sh.name : '-', Kategorie: t_obj.bucket, Status: st ? st.title : '-', Priorität: t_obj.priority, Start: t_obj.startDate, Fälligkeit: t_obj.dueDate, Aufwand_Geschätzt: t_obj.estimatedTime, Aufwand_Bisher: t_obj.spentTime, Notizen: plainDesc }];
    const worksheet = XLSX.utils.json_to_sheet(wsData); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Aufgabe"); XLSX.writeFile(workbook, `Aufgabe_${t_obj.projectName.replace(/\s+/g, '_')}.xlsx`);
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
    const worksheet = XLSX.utils.json_to_sheet(wsData); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, stack.name.substring(0, 31)); XLSX.writeFile(workbook, `Stack_${stack.name.replace(/\s+/g, '_')}.xlsx`);
}

function exportTimeExcel() {
    if(typeof XLSX === 'undefined') return showToast('Excel Bibliothek lädt noch.', 'error');
    const wsData = appData.timeLogs.map(log => {
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
    const absData = (appData.absences || []).slice().sort((a,b) => a.date.localeCompare(b.date)).map(a => ({ Datum: a.date, Art: ttAbsLabel(a.type), Stunden: a.hours, Notiz: a.note || '' }));
    if(absData.length > 0) { const wsAbs = XLSX.utils.json_to_sheet(absData); XLSX.utils.book_append_sheet(workbook, wsAbs, "Abwesenheiten"); }
    XLSX.writeFile(workbook, "Zeiterfassung.xlsx");
}

function generateRichTextReport() {
    const viewObj = appData.settings.views.find(v => v.id === currentView); const viewName = viewObj ? viewObj.name : 'Export'; 
    const tasks = getFilteredTasks(); const stacks = getFilteredStacks();
    let html = `<div style="font-family: Helvetica, Arial, sans-serif; color: #333;"><h1 style="color: ${appData.customColor}; border-bottom: 2px solid ${appData.customColor}; padding-bottom: 5px; font-family: Helvetica, Arial, sans-serif;">ProMan Export: ${viewName}</h1><p style="font-family: Helvetica, Arial, sans-serif;"><em>Erstellt am: ${new Date().toLocaleDateString('de-DE')}</em></p><br/>`;
    
    if(currentView === 'time') {
        html += `<table style="width: 100%; border-collapse: collapse; font-family: Helvetica, Arial, sans-serif;" border="1" cellpadding="5"><tr style="background-color: #e5e7eb;"><th>Datum</th><th>Aufgabe</th><th>Dauer (h)</th><th>Notiz</th></tr>`;
        appData.timeLogs.forEach(log => { 
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

function exportWord() {
    const content = generateRichTextReport();
    const fullHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'></head><body style="font-family:Helvetica, sans-serif;">${content}</body></html>`;
    const blob = new Blob(['\ufeff', fullHtml], { type: 'application/msword' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `ProMan_Export_${currentView}.doc`; a.click();
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

async function createPDF(tasksArray, docTitle, filename, stackObj = null) {
    if(typeof window.jspdf === 'undefined' || typeof html2canvas === 'undefined') { return showToast('PDF Bibliotheken laden noch.', 'error'); }
    showToast('PDF wird generiert... Bitte warten.', 'info');
    const { jsPDF } = window.jspdf; const doc = new jsPDF('p', 'mm', 'a4'); const pageHeight = doc.internal.pageSize.height; const pageWidth = doc.internal.pageSize.width; const contentWidth = pageWidth - 28;
    
    function printWrappedText(text, x, y, maxWidth, fontSize = 10, isBold = false) { 
        if(!text) return y; doc.setFontSize(fontSize); doc.setFont("helvetica", isBold ? "bold" : "normal"); 
        const lines = doc.splitTextToSize(String(text), maxWidth); if (y + (lines.length * 5) > pageHeight - 20) { doc.addPage(); y = 20; } 
        doc.text(lines, x, y); return y + (lines.length * (fontSize > 10 ? 7 : 5)); 
    }

    async function renderRTFToPDF(htmlStr, x, y, maxWidth) {
        if(!htmlStr || htmlStr.trim()==='' || htmlStr==='<br>') return y;
        const tempDiv = document.createElement('div'); tempDiv.className = 'rte-content'; tempDiv.style.position = 'absolute'; tempDiv.style.left = '-9999px'; tempDiv.style.top = '0'; tempDiv.style.width = '700px'; tempDiv.style.background = '#ffffff'; tempDiv.style.color = '#000000'; tempDiv.style.padding = '10px'; tempDiv.style.boxSizing = 'border-box'; tempDiv.style.wordBreak = 'break-word'; tempDiv.style.maxHeight = 'none'; tempDiv.style.height = 'auto'; tempDiv.style.overflow = 'visible'; tempDiv.innerHTML = htmlStr; document.body.appendChild(tempDiv);
        try {
            const canvas = await html2canvas(tempDiv, { scale: 2, useCORS: true, windowWidth: 720 });
            if(document.body.contains(tempDiv)) document.body.removeChild(tempDiv);

            const bottomMargin = 12;
            /* Skalierung: Quell-Pixel → mm im PDF */
            const pxPerMm = canvas.width / maxWidth;

            if (y + 12 > pageHeight) { doc.addPage(); y = 20; }
            let srcY = 0;                        /* aktuelle Position in Quell-Pixeln */
            let destY = y;                       /* aktuelle Position im PDF (mm) */
            const totalSrcH = canvas.height;

            while (srcY < totalSrcH) {
                const availMm = pageHeight - bottomMargin - destY;      /* verfügbarer Platz auf dieser Seite (mm) */
                if (availMm < 8) { doc.addPage(); destY = 20; continue; }
                let sliceSrcH = Math.min(totalSrcH - srcY, availMm * pxPerMm);   /* Höhe des Ausschnitts in Quell-Pixeln */

                /* Ausschnitt in ein eigenes Canvas kopieren */
                const slice = document.createElement('canvas');
                slice.width = canvas.width; slice.height = Math.ceil(sliceSrcH);
                const sctx = slice.getContext('2d');
                sctx.fillStyle = '#ffffff'; sctx.fillRect(0, 0, slice.width, slice.height);
                sctx.drawImage(canvas, 0, srcY, canvas.width, sliceSrcH, 0, 0, canvas.width, sliceSrcH);

                const sliceMmH = sliceSrcH / pxPerMm;
                doc.addImage(slice.toDataURL('image/png'), 'PNG', x, destY, maxWidth, sliceMmH);

                srcY += sliceSrcH;
                destY += sliceMmH;
                if (srcY < totalSrcH) { doc.addPage(); destY = 20; }
            }
            return destY + 5;
        } catch(e) { if(document.body.contains(tempDiv)) document.body.removeChild(tempDiv); return printWrappedText("Fehler beim Laden des formatieren Textes.", x, y, maxWidth); }
    }

    let yPos = 20; let titleX = 14;
    if(appData.settings.companyLogo) { try { const imgProps = doc.getImageProperties(appData.settings.companyLogo); const logoWidth = 30; const logoHeight = (imgProps.height * logoWidth) / imgProps.width; doc.addImage(appData.settings.companyLogo, 'PNG', 14, 15, logoWidth, logoHeight); titleX = 50; yPos = Math.max(20, 15 + logoHeight + 5); } catch(e) { console.warn('Logo konnte nicht geladen werden', e); } }
    doc.setFontSize(22); doc.setFont("helvetica", "bold"); doc.text(docTitle, titleX, 25); doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.text(`Erstellt am: ${new Date().toLocaleDateString('de-DE')}`, titleX, 32); yPos = Math.max(yPos, 45); 
    
    if(stackObj) {
        doc.setFillColor(240, 240, 240); doc.rect(14, yPos, contentWidth, 12, 'F'); doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.text(`Projekt-Stack: ${stackObj.name}`, 18, yPos + 8); yPos += 18; doc.setFontSize(10); doc.setFont("helvetica", "normal");
        if(stackObj.startDate || stackObj.dueDate) yPos = printWrappedText(`Zeitraum: ${stackObj.startDate||'-'} bis ${stackObj.dueDate||'-'}`, 14, yPos, contentWidth);
        if(stackObj.notes) { yPos = printWrappedText("Notizen:", 14, yPos+2, contentWidth, 10, true); yPos = await renderRTFToPDF(stackObj.notes, 14, yPos, contentWidth); }
        if(stackObj.checklist && stackObj.checklist.length > 0) {
            yPos = printWrappedText("Milestones:", 14, yPos+2, contentWidth, 10, true);
            stackObj.checklist.forEach(cl => { const boxStr = cl.done ? "[ X ]" : "[   ]"; let meta = []; if(cl.dueDate) { let [d, t] = cl.dueDate.split('T'); meta.push(`${d.split('-').reverse().join('.')}${t ? ' ' + t + ' Uhr' : ''}`); } if(cl.assigneeId) { const u = appData.users.find(x => x.id === cl.assigneeId); if(u) meta.push(`${u.name}`); } let metaStr = meta.length > 0 ? ` (${meta.join(' | ')})` : ''; yPos = printWrappedText(`${boxStr} ${cl.title}${metaStr}`, 16, yPos, contentWidth - 4); });
        }
        yPos += 10; doc.setDrawColor(100, 100, 100); doc.line(14, yPos, pageWidth - 14, yPos); yPos += 10;
    }

    if(tasksArray.length === 0) { doc.setFontSize(12); doc.text("Keine Aufgaben vorhanden.", 14, yPos); }

    for (let index = 0; index < tasksArray.length; index++) {
        const task = tasksArray[index];
        if (yPos > pageHeight - 60) { doc.addPage(); yPos = 20; }
        let headerColor = [0, 112, 242]; let shName = '-';
        
        if(task.stakeholderId) { const sh = appData.stakeholders.find(s => s.id === task.stakeholderId); if(sh) { shName = sh.name; const hex = sh.color.replace('#',''); headerColor = [parseInt(hex.substring(0,2), 16), parseInt(hex.substring(2,4), 16), parseInt(hex.substring(4,6), 16)]; } }
        if(!task.stakeholderId) { const hex = appData.customColor.replace('#',''); headerColor = [parseInt(hex.substring(0,2), 16), parseInt(hex.substring(2,4), 16), parseInt(hex.substring(4,6), 16)]; }
        
        doc.setFillColor(headerColor[0], headerColor[1], headerColor[2]); doc.rect(14, yPos, contentWidth, 12, 'F'); doc.setTextColor(255, 255, 255); 
        doc.setFont("helvetica", "bold"); doc.setFontSize(12); const title = task.projectName || 'Unbenannte Aufgabe'; doc.text(title.length > 70 ? title.substring(0, 70) + '...' : title, 18, yPos + 8);
        
        if(!stackObj && task.projectStackId) { const stack = appData.projectStacks.find(ps => ps.id === task.projectStackId); if(stack) { doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.text(`Stack: ${stack.name}`, pageWidth - 60, yPos + 8); } }
        
        yPos += 18; doc.setTextColor(0, 0, 0); const st = appData.statuses.find(s => s.id === task.status); const leftColX = 14; const rightColX = 110;
        doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.text("Stakeholder:", leftColX, yPos); doc.setFont("helvetica", "normal"); doc.text(shName, leftColX + 30, yPos); 
        doc.setFont("helvetica", "bold"); doc.text("Status:", rightColX, yPos); doc.setFont("helvetica", "normal"); doc.text(st ? (st.id==='done'?t('col_completed'):st.title) : '-', rightColX + 25, yPos); yPos += 6; 
        doc.setFont("helvetica", "bold"); doc.text("Kategorie:", leftColX, yPos); doc.setFont("helvetica", "normal"); doc.text(task.bucket || '-', leftColX + 30, yPos); 
        doc.setFont("helvetica", "bold"); doc.text("Priorität:", rightColX, yPos); doc.setFont("helvetica", "normal"); doc.text(task.priority, rightColX + 25, yPos); yPos += 6; 
        doc.setFont("helvetica", "bold"); doc.text("Start/Ziel:", leftColX, yPos); doc.setFont("helvetica", "normal"); doc.text(`${task.startDate||'-'} bis ${task.dueDate||'-'}`, leftColX + 30, yPos); 
        doc.setFont("helvetica", "bold"); doc.text("Zeiten (h):", rightColX, yPos); doc.setFont("helvetica", "normal"); doc.text(`${task.spentTime||0} / ${task.estimatedTime||0}`, rightColX + 25, yPos); yPos += 10;
        
        if(task.description) { yPos = printWrappedText("Notizen:", leftColX, yPos, contentWidth, 10, true); yPos = await renderRTFToPDF(task.description, leftColX, yPos, contentWidth); yPos += 4; }
        if(task.checklist && task.checklist.length > 0) { yPos = printWrappedText("Checkliste:", leftColX, yPos, contentWidth, 10, true); task.checklist.forEach(cl => { const boxStr = cl.done ? "[ X ]" : "[   ]"; let meta = []; if(cl.dueDate) { let [d, t] = cl.dueDate.split('T'); meta.push(`${d.split('-').reverse().join('.')}${t ? ' ' + t + ' Uhr' : ''}`); } if(cl.assigneeId) { const u = appData.users.find(x => x.id === cl.assigneeId); if(u) meta.push(`${u.name}`); } let metaStr = meta.length > 0 ? ` (${meta.join(' | ')})` : ''; yPos = printWrappedText(`${boxStr} ${cl.title}${metaStr}`, leftColX + 2, yPos, contentWidth - 4, 10, false); }); yPos += 4; }
        if(task.notes) { yPos = printWrappedText("Historie:", leftColX, yPos, contentWidth, 10, true); yPos = printWrappedText(task.notes, leftColX, yPos, contentWidth, 10, false); yPos += 4; }
        if(task.files && task.files.length > 0) { yPos = printWrappedText("Dateien/Pfade:", leftColX, yPos, contentWidth, 10, true); task.files.forEach(f => { const fname = f.type === 'blob' ? f.name : f.path; yPos = printWrappedText(`- ${fname}`, leftColX + 2, yPos, contentWidth - 4, 9, false); }); }
        
        yPos += 10; if(index < tasksArray.length - 1) { doc.setDrawColor(200, 200, 200); doc.line(14, yPos - 5, pageWidth - 14, yPos - 5); }
    }
    doc.save(filename); showToast(t('toast_pdf'));
}

function exportPDFGefiltert() { createPDF(getFilteredTasks(), "ProMan: Gefilterte Aufgaben", "ProMan_Gefiltert.pdf"); }
function exportSingleTaskPDF() { const id = document.getElementById('taskId').value; const t_obj = appData.tasks.find(x => x.id === id); if(!t_obj) return; createPDF([t_obj], "Aufgaben-Details", `Aufgabe_${t_obj.projectName.replace(/\s+/g, '_')}.pdf`); }
function exportSingleStackPDF() { const id = document.getElementById('s_id').value; const stack = appData.projectStacks.find(s => s.id === id); if(!stack) return; const tasks = appData.tasks.filter(t_obj => t_obj.projectStackId === id); createPDF(tasks, "Projekt-Stack Übersicht", `Stack_${stack.name.replace(/\s+/g, '_')}.pdf`, stack); }

// --- NOTIFICATION MODAL ---
let _notifModalQueue = [];
let _notifModalOpen = false;

function showNotifModal(title, body, type) {
    _notifModalQueue.push({ title, body, type });
    if (!_notifModalOpen) _processNotifModalQueue();
}

function _processNotifModalQueue() {
    if (_notifModalQueue.length === 0) { _notifModalOpen = false; return; }
    _notifModalOpen = true;
    const { title, body, type } = _notifModalQueue.shift();
    const overlay = document.getElementById('notifModalOverlay');
    const card    = document.getElementById('notifModalCard');
    const iconEl  = document.getElementById('notifModalIcon');
    const titleEl = document.getElementById('notifModalTitle');
    const bodyEl  = document.getElementById('notifModalBody');
    const badge   = document.getElementById('notifModalQueueBadge');

    card.className = 'notif-modal-card';
    let iconHtml = '<i class="fas fa-bell" style="color:var(--primary-color)"></i>';
    if (type === 'danger') { card.classList.add('danger-card'); iconHtml = '<i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i>'; }
    else if (type === 'warning') { card.classList.add('warning-card'); iconHtml = '<i class="fas fa-clock" style="color:var(--warning)"></i>'; }

    iconEl.innerHTML  = iconHtml;
    titleEl.innerText = title;
    bodyEl.innerText  = body;
    badge.style.display = _notifModalQueue.length > 0 ? 'block' : 'none';
    badge.innerText = `+${_notifModalQueue.length}`;
    overlay.classList.add('active');
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
                        <textarea class="preset-cl" rows="3" placeholder="${t('preset_cl_ph')}" onchange="updatePresetField('${kind}','${p.id}','checklist',this.value)">${(p.checklist||[]).join('\n')}</textarea>
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
            if (container) { container.innerHTML = ''; p.checklist.forEach(title => { const nid = generateId(); renderTaskChecklistItem(container, title, false, '', '', nid); }); }
        }
    } else {
        if (p.stakeholderId) { const el = document.getElementById('s_stakeholder'); if (el) el.value = p.stakeholderId; }
        if (p.bucket) { const el = document.getElementById('s_bucket'); if (el) el.value = p.bucket; }
        if (p.note) { const rte = document.getElementById('s_notes_rte'); if (rte) rte.innerHTML = p.note.replace(/\n/g, '<br>'); }
        if (p.checklist && p.checklist.length) {
            const scont = document.getElementById('s_checklist_container');
            if (scont) {
                scont.innerHTML = '';
                p.checklist.forEach(title => {
                    const div = document.createElement('div'); div.className = 'checklist-item';
                    const nid = generateId(); div.setAttribute('data-id', nid);
                    div.innerHTML = buildChecklistItemHTML(title, false, '', '', nid);
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
        appData.settings.companyLogo = ev.target.result;
        // Sync with the original logo_fname span and logo_preview_container
        renderLogoPreview();
        renderLogoPreviewTE();
        saveToLocal(true);
        showToast('Logo gespeichert.', 'success');
    };
    reader.readAsDataURL(file);
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
    const _dateOf = (it) => (it.dueDate || '').split('T')[0];

    const all = appData.tasks.filter(t => !isTaskDone(t));
    const overdue = dueItems.filter(it => _dateOf(it) < todayIso)
                       .sort((a,b) => _dateOf(a).localeCompare(_dateOf(b)));
    const dueToday = dueItems.filter(it => _dateOf(it) === todayIso);
    /* Wochengrenzen für „Diese Woche" / „Nächste Woche" */
    const _todayD = ttParse(todayIso); const _dowT = (_todayD.getDay() + 6) % 7; /* Mo=0 */
    const endThisWeekIso = ttShiftIso(todayIso, 6 - _dowT);       /* bis Sonntag dieser Woche */
    const endNextWeekIso = ttShiftIso(endThisWeekIso, 7);        /* Sonntag nächster Woche */
    const soon = dueItems.filter(it => _dateOf(it) > todayIso && _dateOf(it) <= endThisWeekIso)
                    .sort((a,b) => _dateOf(a).localeCompare(_dateOf(b)));
    const nextWeek = dueItems.filter(it => _dateOf(it) > endThisWeekIso && _dateOf(it) <= endNextWeekIso)
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
    for (let i = 0; i <= _dow; i++) { const iso = ttShiftIso(weekStartIso, i); const di = ttDayInfo(iso); weekSoll += di.target; weekIst += di.total; }
    const weekPct = weekSoll ? Math.min(100, Math.round(weekIst / weekSoll * 100)) : 0;
    const openCount = overdue.length + dueToday.length + soon.length;

    let html = `<div class="wk-today">`;

    /* Held: gebuchte Zeit als physische Schiene — volle Breite */
    const ring = (p, label, sub, cls) => `<div class="wk-stat"><div class="wk-stat-ring ${cls||''}" style="--p:${p}"><span>${p}<u>%</u></span></div><div class="wk-stat-txt"><b>${label}</b><u>${sub}</u></div></div>`;
    html += `<section class="wk-hero compact">
        <div class="wk-hero-left">
            <span class="wk-hero-eyebrow">${greeting}${userName ? ', ' + escapeHtmlToday(userName) : ''} · ${ttFmtFull(todayIso)}</span>
            <div class="wk-hero-num">${ttNum(info.total)}<small>${t('today_of')} ${ttNum(info.target || 0)} h</small></div>
            <div class="wk-hero-track"><i style="width:${pct}%"></i></div>
            <p class="wk-hero-note">${info.missing > 0.01
                ? t('today_missing_pre') + ' ' + ttNum(info.missing) + ' ' + t('today_missing_post').replace('{n}', overdue.length + dueToday.length)
                : t('today_complete').replace('{n}', overdue.length + dueToday.length)}</p>
            <div class="wk-hero-acts">
                <button class="wk-hero-cta" onclick="switchView('time')"><i class="fas fa-clock"></i> ${t('today_book_time')}</button>
                <button class="wk-hero-ghost" onclick="openModal()"><i class="fas fa-plus"></i> ${t('new_task')}</button>
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

    /* ── Buchungen der letzten 7 Tage nach Bucket (farblich) ── */
    const bucketPalette = ['#cca300', '#22262B', '#1F9463', '#E8A317', '#7C6CE0', '#0E9BAA', '#D9342B', '#B96A2B'];
    const sevenAgo = ttParse(ttShiftIso(todayIso, -6));
    const bucketHours = {};
    (appData.timeLogs || []).forEach(l => {
        if (!l.date) return;
        const d = ttParse(l.date); if (d < sevenAgo) return;
        const task = appData.tasks.find(x => x.id === l.taskId);
        const bk = (task && task.bucket) ? task.bucket : t('no_bucket');
        bucketHours[bk] = (bucketHours[bk] || 0) + (parseFloat(l.hours) || 0);
    });
    const bucketRows = Object.keys(bucketHours).map((bk, i) => ({ name: bk, hours: bucketHours[bk], col: '#cca300' }))
        .filter(r => r.hours > 0).sort((a, b) => b.hours - a.hours);
    const maxBk = Math.max(1, ...bucketRows.map(r => r.hours));
    const trendBars = bucketRows.length
        ? bucketRows.map(r => `<div class="wk-tr-col" title="${escapeHtmlToday(r.name)}: ${ttNum(r.hours)} h"><div class="wk-tr-bar"><span class="wk-tr-fill" style="height:${Math.round(r.hours / maxBk * 100)}%;background:${r.col}"></span></div><u title="${escapeHtmlToday(r.name)}">${escapeHtmlToday(r.name.length > 6 ? r.name.slice(0,6)+'…' : r.name)}</u></div>`).join('')
        : `<div class="wk-tr-empty">${t('today_no_bookings')}</div>`;

    /* Statusverteilung */
    const byStatus = { todo:0, inProgress:0, review:0 };
    appData.tasks.forEach(t => { if (byStatus[t.status] !== undefined && !isTaskDone(t)) byStatus[t.status]++; });
    const stTot = Math.max(1, byStatus.todo + byStatus.inProgress + byStatus.review);
    const stSeg = (k, col, lbl) => byStatus[k] ? `<span class="wk-dist-seg" style="width:${byStatus[k]/stTot*100}%;background:${col}" title="${lbl}: ${byStatus[k]}"></span>` : '';

    /* Prioritätenverteilung offener Aufgaben */
    const byPrio = { high:0, medium:0, low:0 };
    appData.tasks.forEach(t => { if (!isTaskDone(t) && byPrio[t.priority] !== undefined) byPrio[t.priority]++; });
    const prTot = Math.max(1, byPrio.high + byPrio.medium + byPrio.low);

    html += `<section class="wk-graphs">
        <div class="wk-graph-card">
            <div class="wk-graph-h"><b>${t('today_trend')}</b><u>${t('today_last7')}</u></div>
            <div class="wk-trend">${trendBars}</div>
        </div>
        <div class="wk-graph-card">
            <div class="wk-graph-h"><b>${t('today_status_dist')}</b><u>${stTot} ${t('today_open')}</u></div>
            <div class="wk-dist">${stSeg('todo','#B9BFB6','Offen')}${stSeg('inProgress','var(--primary-color)','In Arbeit')}${stSeg('review','#E8A317','Prüfung')}</div>
            <div class="wk-dist-legend"><span><i style="background:#B9BFB6"></i>${t('status_todo')}: ${byStatus.todo}</span><span><i style="background:var(--primary-color)"></i>${t('status_inprogress')}: ${byStatus.inProgress}</span><span><i style="background:#E8A317"></i>${t('status_review')}: ${byStatus.review}</span></div>
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
    html += `</div>`; /* /wk-today-main */

    /* ── Seitenspalte ── */
    html += `<div class="wk-today-side">`;

    if (running.length) {
        html += `<div class="wk-strip-h"><b>${t('today_running')}</b><span class="wk-count">${running.length}</span><span class="wk-rule"></span></div>
        <div class="wk-run">`;
        running.forEach(tk => {
            html += `<button class="wk-run-card" onclick="switchView('time')">
                <span class="wk-run-dot"></span>
                <span class="wk-run-name">${escapeHtmlToday(tk.projectName)}</span>
                <i class="fas fa-stopwatch"></i>
            </button>`;
        });
        html += `</div>`;
    }

    html += `<div class="wk-strip-h"><b>${t('today_unbooked')}</b><span class="wk-count">${openDays.length}</span><span class="wk-rule"></span>
        <button class="wk-linkbtn" onclick="switchView('time')">${t('view_time')}</button></div>`;
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
}

/* Mini-Karte für Stacks, Meilensteine und Checkpunkte in der Heute-Ansicht */
function createTodayItemCard(it) {
    const card = document.createElement('div');
    card.className = 'task-card wk-today-item';
    const parentId = it.parent ? it.parent.id : '';
    const meta = {
        stack:      { ic: 'fa-folder',       label: 'Stack',              strip: 'var(--primary-color)', click: `openStackModal('${it.obj.id}')` },
        milestone:  { ic: 'fa-flag',         label: t('milestones'),      strip: '#E8A317',              click: `openStackModal('${parentId}')` },
        checkpoint: { ic: 'fa-check-square', label: t('view_checklists'), strip: '#7C6CE0',              click: `openModal('${parentId}')` }
    }[it.kind];
    card.style.setProperty('--card-strip', meta.strip);
    card.style.cursor = 'pointer';
    card.onclick = () => { try { eval(meta.click); } catch(e){} };
    const name = it.obj.name || it.obj.title || it.obj.projectName || 'Unbenannt';
    const parentName = it.parent ? (it.parent.name || it.parent.projectName || '') : '';
    const dueStr = (it.dueDate || '').split('T')[0];
    card.innerHTML = `<div class="wk-card">
        <div class="wk-card-top">
            <div class="wk-card-tags">
                <span class="wk-c-kind"><i class="fas ${meta.ic}"></i> ${meta.label}</span>
                ${parentName ? `<span class="wk-c-parent">${escapeHtmlToday(parentName)}</span>` : ''}
            </div>
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
    switchView('time');
    setTimeout(() => {
        const d = document.getElementById('tt_date');
        if (d) d.value = iso;
        const box = document.getElementById('tt_manual_box');
        if (box) box.scrollIntoView({ behavior:'smooth', block:'center' });
    }, 120);
}

