// =========================================================================
// PROMAN KI-ASSISTENT — ai.js
// Browser-nativ via WebLLM + WebGPU  ·  kein Ollama, kein Install
// Modell (llama3.2:1b) lädt einmalig in den Browser-Cache (~700 MB)
// =========================================================================

// q4f32_1 = maximale GPU-Kompatibilität (kein fp16 benötigt); ~760 MB
const AI_MODEL_ID = 'Llama-3.2-1B-Instruct-q4f32_1-MLC';
const AI_MODEL_MB = 760;
// WebLLM als ESM-Modul – wird einmalig vom CDN geladen, danach browser-gecacht
const WEBLLM_ESM  = 'https://esm.run/@mlc-ai/web-llm';

let mlcEngine     = null;  // Geladene WebLLM-Engine-Instanz
let _webllmModule = null;  // Gecachte Modulreferenz (nach erstem import())
let aiChatHistory = [];
let aiIsTyping    = false;
let lastAIActions = [];
let aiSearchMode  = false;

// ── Browser-Kompatibilität ────────────────────────────────────────────────

async function checkWebGPU() {
    if (!('gpu' in navigator)) return { ok: false, reason: 'noapi' };
    try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return { ok: false, reason: 'noadapter' };
        return { ok: true, adapter };
    } catch {
        return { ok: false, reason: 'error' };
    }
}

/** Prüft ob Modell-Daten im Browser Cache Storage vorhanden sind.
 *  Wenn die Engine bereits im RAM liegt → sicher gecacht.
 *  Andernfalls: leichtgewichtige Cache-Key-Heuristik. */
async function isModelCached() {
    if (mlcEngine) return true;
    try {
        const keys = await caches.keys();
        return keys.some(k => k.includes(AI_MODEL_ID) || /webllm|mlc-ai/i.test(k));
    } catch { return false; }
}

/** Entlädt die Engine aus dem RAM und löscht Modell-Daten aus dem Browser-Cache */
async function deleteModelCache() {
    // Engine aus RAM entladen
    if (mlcEngine) {
        try { mlcEngine = null; } catch { /* ignore */ }
        mlcEngine = null;
    }

    let deleted = 0;
    try {
        const keys = await caches.keys();
        for (const k of keys) {
            if (/webllm|mlc|llama/i.test(k)) {
                await caches.delete(k);
                deleted++;
            }
        }
    } catch { /* ignore */ }

    // Falls WebLLM-Modul schon geladen: eigene Delete-API nutzen
    if (_webllmModule) {
        try {
            if (_webllmModule.deleteModelAllInfoInCache) {
                await _webllmModule.deleteModelAllInfoInCache(AI_MODEL_ID);
            }
        } catch { /* ignore */ }
    }

    return deleted;
}

// ── WebLLM Engine laden ───────────────────────────────────────────────────

/**
 * Lädt WebLLM dynamisch vom CDN und initialisiert die Engine.
 * Das Modell wird beim ersten Aufruf in den Browser-Cache heruntergeladen.
 * Folgeaufrufe nutzen den Cache – kein erneutes Laden nötig.
 */
async function initAIEngine(progressCb) {
    if (mlcEngine) return mlcEngine;
    if (!_webllmModule) {
        _webllmModule = await import(WEBLLM_ESM);
    }
    const { CreateMLCEngine } = _webllmModule;
    mlcEngine = await CreateMLCEngine(AI_MODEL_ID, {
        initProgressCallback: p => progressCb?.({ text: p.text || '', pct: typeof p.progress === 'number' ? p.progress : 0 })
    });
    return mlcEngine;
}

async function aiAutoInit() {
    if (!(appData.settings && appData.settings.aiEnabled)) return;
    if (!(await isModelCached())) return;
    initAIEngine().catch(err => console.warn('[ProMan KI] Auto-Init:', err.message));
}

// ── Einstellungs-Panel ────────────────────────────────────────────────────

async function renderAISettingsPanel() {
    const panel = document.getElementById('ai-settings-panel');
    if (!panel) return;

    panel.innerHTML = `<div style="text-align:center;padding:28px;color:var(--text-muted);">
        <i class="fas fa-spinner fa-spin" style="font-size:22px;"></i>
        <p style="margin-top:10px;font-size:13px;">Prüfe Browser-Unterstützung…</p>
    </div>`;

    const gpu       = await checkWebGPU();
    const cached    = mlcEngine ? true : await isModelCached();
    const isEnabled = !!(appData.settings?.aiEnabled);
    const isReady   = isEnabled && !!mlcEngine;

    // ── Status-Box ──────────────────────────────────────────────────────────
    let statusHtml;
    if (!gpu.ok) {
        const tip = {
            noapi:     'Dein Browser unterstützt WebGPU nicht. Nutze <b>Chrome 113+</b> oder <b>Edge 113+</b>.',
            noadapter: 'Kein WebGPU-Adapter gefunden. Prüfe ob Hardware-Beschleunigung aktiviert ist.',
            error:     'WebGPU konnte nicht initialisiert werden. Aktualisiere deinen Browser.'
        }[gpu.reason] || 'WebGPU nicht verfügbar.';
        statusHtml = `
        <div class="ai-status-box ai-status-offline">
            <span class="ai-status-dot" style="background:var(--danger);"></span>
            <div><b>WebGPU nicht verfügbar</b><p>${tip}</p></div>
        </div>`;
    } else if (!isEnabled) {
        statusHtml = `
        <div class="ai-status-box" style="background:var(--bg-color);">
            <span class="ai-status-dot" style="background:var(--text-muted);"></span>
            <div><b>KI deaktiviert</b>
            <p>Schalter aktivieren, um den KI-Assistenten einzurichten.</p></div>
        </div>`;
    } else if (!cached && !mlcEngine) {
        statusHtml = `
        <div class="ai-status-box ai-status-warn">
            <span class="ai-status-dot" style="background:var(--warning);"></span>
            <div><b>Modell noch nicht geladen</b>
            <p>Llama 3.2 (1B) wird einmalig in den <strong>Browser-Cache</strong> geladen (~${AI_MODEL_MB} MB).
            Danach steht die KI dauerhaft offline zur Verfügung – auch ohne Internet.</p></div>
        </div>`;
    } else if (cached && !mlcEngine) {
        statusHtml = `
        <div class="ai-status-box ai-status-warn" style="background:rgba(245,158,11,0.06);">
            <span class="ai-status-dot" style="background:var(--warning);"></span>
            <div><b>Gecacht – noch nicht geladen</b>
            <p>Das Modell ist im Browser-Cache. Es wird beim nächsten Chat aktiviert.</p></div>
        </div>`;
    } else {
        statusHtml = `
        <div class="ai-status-box ai-status-ok">
            <span class="ai-status-dot" style="background:var(--success);"></span>
            <div><b>KI bereit</b>
            <p>Llama 3.2 (1B) ist geladen. Öffne die <i class="fas fa-search"></i> Suche und klicke auf
            <i class="fas fa-robot"></i>, um den KI-Modus zu starten.</p></div>
        </div>`;
    }

    // ── Aktions-Buttons ─────────────────────────────────────────────────────
    let actHtml = '';
    if (gpu.ok && isEnabled && !cached && !mlcEngine) {
        actHtml = `<button onclick="startAIDownload()" style="width:100%;margin-top:10px;">
            <i class="fas fa-download"></i> Llama 3.2 (1B) in Browser laden (~${AI_MODEL_MB} MB)
        </button>`;
    } else if (gpu.ok && isEnabled && (cached || mlcEngine)) {
        actHtml = `<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
            <button class="secondary" onclick="aiRefreshStatus()" style="font-size:12px;padding:6px 12px;">
                <i class="fas fa-sync"></i> Aktualisieren
            </button>
            <button class="secondary" style="color:var(--danger);font-size:12px;padding:6px 12px;" onclick="handleAIDeleteModel()">
                <i class="fas fa-trash"></i> Modell löschen
            </button>
        </div>`;
    }

    panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div>
            <h4 style="margin:0 0 3px;">
                <i class="fas fa-robot" style="color:var(--primary-color);"></i> KI-Assistent
            </h4>
            <p style="font-size:11px;color:var(--text-muted);margin:0;">
                Llama 3.2 (1B) · läuft komplett im Browser via WebGPU ·
                ${cached ? '<span style="color:var(--success);">im Cache</span>' : 'nicht gecacht'}
            </p>
        </div>
        <label class="ai-toggle-wrap">
            <input type="checkbox" id="ai_enabled_toggle"
                   ${isEnabled ? 'checked' : ''}
                   ${gpu.ok ? '' : 'disabled title="WebGPU benötigt"'}
                   onchange="handleAIToggle(this.checked)">
            <span class="ai-toggle-track"><span class="ai-toggle-thumb"></span></span>
        </label>
    </div>

    ${statusHtml}
    <div id="ai-download-area"></div>
    ${actHtml}

    <div class="ai-caps-grid" style="margin-top:14px;">
        <div class="ai-cap"><i class="fas fa-clock"></i> Zeiten auf Aufgaben buchen</div>
        <div class="ai-cap"><i class="fas fa-tasks"></i> Aufgaben anlegen &amp; bearbeiten</div>
        <div class="ai-cap"><i class="fas fa-folder-open"></i> Stacks anlegen &amp; bearbeiten</div>
        <div class="ai-cap"><i class="fas fa-magic"></i> Workflows erstellen</div>
        <div class="ai-cap"><i class="fas fa-chart-bar"></i> Berichte erstellen</div>
        <div class="ai-cap"><i class="fas fa-file-export"></i> Datei-Export starten</div>
    </div>

    <div style="margin-top:12px;background:var(--bg-color);border-radius:var(--radius);padding:10px;font-size:11px;color:var(--text-muted);">
        <i class="fas fa-shield-alt" style="color:var(--success);margin-right:4px;"></i>
        <b>100 % lokal:</b> Alle Anfragen bleiben auf deinem Gerät. Keine Daten verlassen den Browser.
    </div>
    
    <div style="margin-top:8px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:var(--radius);padding:10px;font-size:11px;color:var(--text-main);">
        <i class="fas fa-info-circle" style="color:var(--warning);margin-right:4px;"></i>
        <b>Hinweis:</b> Wenn das Browserfenster geschlossen wird, muss das KI-Modell (~${AI_MODEL_MB} MB) beim nächsten Aufruf eventuell erneut heruntergeladen werden.
    </div>`;
}

// ── Toggle-Handler ─────────────────────────────────────────────────────────

async function handleAIToggle(enabled) {
    if (!appData.settings) appData.settings = {};
    appData.settings.aiEnabled = enabled;
    saveToLocal(true);
    showToast(enabled ? 'KI-Assistent aktiviert.' : 'KI-Assistent deaktiviert.', enabled ? 'success' : 'info');
    await renderAISettingsPanel();
    updateAISearchButton();
}

// ── Download-Flow ──────────────────────────────────────────────────────────

async function startAIDownload() {
    const dlArea = document.getElementById('ai-download-area');
    document.querySelector('#ai-settings-panel button[onclick="startAIDownload()"]')?.remove();

    dlArea.innerHTML = `
    <div class="ai-dl-box">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <i class="fas fa-spinner fa-spin" style="color:var(--primary-color);flex-shrink:0;"></i>
            <b id="ai-dl-title" style="font-size:13px;">Lade WebLLM-Laufzeitumgebung…</b>
        </div>
        <div class="ai-dl-track"><div id="ai-dl-fill" class="ai-dl-fill" style="width:0%"></div></div>
        <div id="ai-dl-label" style="font-size:11px;color:var(--text-muted);margin-top:5px;">
            Verbinde mit CDN…
        </div>
    </div>`;

    const setProgress = (title, label, pct) => {
        const el = id => document.getElementById(id);
        if (el('ai-dl-title'))  el('ai-dl-title').textContent  = title;
        if (el('ai-dl-label'))  el('ai-dl-label').textContent  = label;
        if (el('ai-dl-fill'))   el('ai-dl-fill').style.width   = Math.round(pct * 100) + '%';
    };

    try {
        await initAIEngine(({ text, pct }) => {
            const done = pct >= 0.99;
            setProgress(
                done ? 'Modell bereit!' : 'Lade Modell in Browser-Cache…',
                text || '',
                pct
            );
        });

        dlArea.innerHTML = '';
        showToast('KI-Modell geladen und gecacht!', 'success');
        await renderAISettingsPanel();
        updateAISearchButton();

    } catch (err) {
        dlArea.innerHTML = `
        <div style="color:var(--danger);font-size:12px;padding:10px;background:rgba(239,68,68,0.07);border-radius:var(--radius);margin-top:8px;">
            <i class="fas fa-exclamation-circle"></i> ${err.message || 'Unbekannter Fehler'}
        </div>
        <button onclick="document.getElementById('ai-download-area').innerHTML=''; startAIDownload();" style="width:100%;margin-top:8px;font-size:12px;">
            <i class="fas fa-redo"></i> Erneut versuchen
        </button>`;
        showToast('Fehler beim Laden des KI-Modells.', 'error');
        console.error('[AI]', err);
    }
}

async function handleAIDeleteModel() {
    if (!confirm(
        `Llama 3.2 (1B) aus dem Browser-Cache löschen?\n\n` +
        `Das Modell (~${AI_MODEL_MB} MB) muss beim nächsten Aktivieren erneut geladen werden.`
    )) return;

    showToast('Lösche Modell aus Browser-Cache…', 'info');
    await deleteModelCache();

    if (appData.settings) appData.settings.aiEnabled = false;
    saveToLocal(true);
    showToast('Modell gelöscht und KI deaktiviert.', 'success');
    await renderAISettingsPanel();
    updateAISearchButton();
}

async function aiRefreshStatus() { await renderAISettingsPanel(); }

// ── Such-Modal: KI-Modus ──────────────────────────────────────────────────

function updateAISearchButton() {
    const btn     = document.getElementById('ai-search-btn');
    const enabled = !!(appData.settings?.aiEnabled);
    if (!btn) return;
    btn.style.display = enabled ? 'inline-flex' : 'none';
    if (!enabled && aiSearchMode) { aiSearchMode = false; _applyAIMode(false); }
}

function toggleAISearchMode() {
    aiSearchMode = !aiSearchMode;
    _applyAIMode(aiSearchMode);
}

function _applyAIMode(on) {
    const btn    = document.getElementById('ai-search-btn');
    const normal = document.getElementById('globalSearchResults');
    const chat   = document.getElementById('ai-chat-panel');
    const inp    = document.getElementById('globalSearchInput');

    btn?.classList.toggle('ai-btn-active', on);
    if (normal) normal.style.display = on ? 'none' : '';
    if (chat)   chat.style.display   = on ? 'flex'  : 'none';
    if (inp) {
        inp.placeholder = on
            ? 'Frage oder Befehl an KI-Assistenten…'
            : `Suchen… (Strg+${(appData.settings?.shortcuts?.search || 'k').toUpperCase()})`;
    }
    if (on) renderAIChatWelcome();
}

// ── Chat-UI ───────────────────────────────────────────────────────────────

function renderAIChatWelcome() {
    const msgs = document.getElementById('ai-chat-messages');
    if (!msgs) return;
    if (aiChatHistory.length > 0) { renderAIMessages(); return; }

    const chips = [
        'Welche Aufgaben sind überfällig?',
        'Erstelle einen Stack für Webseiten-Relaunch',
        'Buche 2 Stunden auf "Meeting vorbereiten"',
        'Neue Aufgabe "Konzept erstellen" hohe Priorität'
    ];
    msgs.innerHTML = `
    <div class="ai-welcome">
        <div class="ai-avatar-lg"><i class="fas fa-robot"></i></div>
        <b>KI-Assistent · Llama 3.2 (1B)</b>
        <p>Stelle Fragen zu deinen Projekten oder gib Befehle.<br>
        Alles läuft <strong>lokal in deinem Browser</strong> – keine Cloud.</p>
    </div>
    <div class="ai-chip-row" id="ai-chip-row">
        ${chips.map(c => `<div class="ai-chip" onclick="sendAIMessage('${c.replace(/'/g, "\\'")}')">${c}</div>`).join('')}
    </div>`;
}

function renderAIMessages() {
    const msgs = document.getElementById('ai-chat-messages');
    if (!msgs) return;
    msgs.innerHTML = aiChatHistory.map(m => {
        if (m.role === 'user') return `
        <div class="ai-msg-user">
            <div class="ai-bubble-user">${_esc(m.content)}</div>
        </div>`;
        return `
        <div class="ai-msg-bot">
            <div class="ai-bot-icon"><i class="fas fa-robot"></i></div>
            <div class="ai-bubble-bot">
                ${m.html || _esc(m.content)}
                ${m.actions?.length ? _renderActionBtns(m.actions, m._base ?? 0) : ''}
            </div>
        </div>`;
    }).join('');
    msgs.scrollTop = msgs.scrollHeight;
}

function _renderActionBtns(actions, base) {
    return `<div class="ai-action-row">` +
        actions.map((a, i) =>
            `<button class="secondary ai-action-btn" onclick="executeAIAction(${base + i},this)">${a.label || a.type}</button>`
        ).join('') + `</div>`;
}

function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

// ── Nachrichten senden ────────────────────────────────────────────────────

async function sendAIMessage(text) {
    if (aiIsTyping) return;
    const input   = document.getElementById('ai-search-input');
    const msg     = text || input?.value.trim() || '';
    if (!msg) return;
    if (input && !text) input.value = '';

    document.getElementById('ai-chip-row')?.remove();
    aiChatHistory.push({ role: 'user', content: msg });
    renderAIMessages();

    // Typing-Bubble
    const msgs = document.getElementById('ai-chat-messages');
    msgs?.insertAdjacentHTML('beforeend', `
    <div id="ai-typing" class="ai-msg-bot">
        <div class="ai-bot-icon"><i class="fas fa-robot"></i></div>
        <div class="ai-bubble-bot">
            <span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span>
        </div>
    </div>`);
    msgs && (msgs.scrollTop = msgs.scrollHeight);

    aiIsTyping = true;
    const base = lastAIActions.length;

    try {
        const engine = await _loadEngineWithProgress();
        document.getElementById('ai-typing')?.remove();
        const result = await _streamResponse(engine, base);
        aiChatHistory.push(result);
    } catch (err) {
        document.getElementById('ai-typing')?.remove();
        aiChatHistory.push({
            role: 'assistant',
            content: `Fehler: ${err.message || 'KI nicht verfügbar. Lade das Modell in den Einstellungen.'}`,
            html: null, actions: [], _base: base
        });
    }

    aiIsTyping = false;
    renderAIMessages();
}

/** Lädt die Engine und zeigt Fortschritt direkt in der Typing-Bubble */
async function _loadEngineWithProgress() {
    if (mlcEngine) return mlcEngine;

    const bubble = document.querySelector('#ai-typing .ai-bubble-bot');
    if (bubble) {
        bubble.innerHTML = `
        <i class="fas fa-spinner fa-spin" style="color:var(--primary-color);margin-right:6px;"></i>
        <span id="_ai_load_txt">Lade KI-Modell aus Browser-Cache…</span>
        <div class="ai-dl-track" style="margin-top:8px;">
            <div id="_ai_load_bar" class="ai-dl-fill" style="width:0%;transition:width 0.3s;"></div>
        </div>`;
    }

    mlcEngine = await initAIEngine(({ text, pct }) => {
        const bar = document.getElementById('_ai_load_bar');
        const txt = document.getElementById('_ai_load_txt');
        if (bar) bar.style.width  = Math.round(pct * 100) + '%';
        if (txt) txt.textContent  = pct >= 0.99 ? 'Bereit!' : `Modell laden… ${Math.round(pct * 100)}%`;
    });

    // Bubble zurücksetzen auf Dots
    const bubble2 = document.querySelector('#ai-typing .ai-bubble-bot');
    if (bubble2) bubble2.innerHTML = `<span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span>`;
    return mlcEngine;
}

// ── Streaming-Inferenz ────────────────────────────────────────────────────

async function _streamResponse(engine, base) {
    const systemPrompt = _buildSystemPrompt();
    const history = aiChatHistory.slice(-20)
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }));

    // Streaming-Bubble einfügen
    const msgs    = document.getElementById('ai-chat-messages');
    const sid     = 'aistream_' + Date.now();
    msgs?.insertAdjacentHTML('beforeend', `
    <div class="ai-msg-bot" id="${sid}">
        <div class="ai-bot-icon"><i class="fas fa-robot"></i></div>
        <div class="ai-bubble-bot" id="${sid}_txt"></div>
    </div>`);

    let fullText = '';
    const txtEl  = document.getElementById(`${sid}_txt`);

    try {
        const stream = await engine.chat.completions.create({
            messages:    [{ role: 'system', content: systemPrompt }, ...history],
            stream:       true,
            temperature:  0.65,
            max_tokens:   1200
        });

        for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta?.content || '';
            if (delta) {
                fullText += delta;
                if (txtEl) {
                    txtEl.innerHTML = _md(fullText) + '<span class="ai-cursor">▋</span>';
                    msgs && (msgs.scrollTop = msgs.scrollHeight);
                }
            }
        }
    } catch (err) {
        document.getElementById(sid)?.remove();
        throw err;
    }

    // Stream-Div entfernen (wird von renderAIMessages neu erzeugt)
    document.getElementById(sid)?.remove();

    const parsed = _parseResponse(fullText);
    parsed.actions?.forEach(a => lastAIActions.push(a));

    return {
        role:    'assistant',
        content: parsed.text,
        html:    parsed.html,
        actions: parsed.actions,
        _base:   base
    };
}

// ── System-Prompt ──────────────────────────────────────────────────────────

function _buildSystemPrompt() {
    const now     = new Date().toLocaleDateString('de-DE', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    const tasks   = appData.tasks           || [];
    const stacks  = appData.projectStacks   || [];
    const stats   = appData.statuses        || [];

    const open    = tasks.filter(t => !isTaskDone(t)).length;
    const overdue = tasks.filter(t => !isTaskDone(t) && t.dueDate && new Date(t.dueDate) < new Date()).length;

    const tList = tasks.slice(0, 40).map(t => {
        const s  = stats.find(x => x.id === t.status);
        const ps = stacks.find(x => x.id === t.projectStackId);
        return `- [${isTaskDone(t) ? 'DONE' : (s?.title || t.status)}] "${t.projectName}" Prio:${t.priority} Fällig:${t.dueDate || '-'} Stack:${ps?.name || '-'} ID:${t.id}`;
    }).join('\n');

    const sList = stacks.slice(0, 20).map(s =>
        `- [${s.status}] "${s.name}" Fällig:${s.dueDate || '-'} ID:${s.id}`
    ).join('\n');

    return `Du bist ein deutschsprachiger Projektmanagement-Assistent für ProMan. Antworte IMMER auf Deutsch, prägnant und hilfreich.
Du hast die Berechtigung und Fähigkeit, Aufgaben und Stacks frei zu erstellen, zu bearbeiten sowie Zeiten (Aufwände) auf Aufgaben zu buchen.
Heute: ${now} | ${open} offen | ${overdue} überfällig | ${stacks.length} Stacks

AUFGABEN:
${tList || '(keine)'}

STACKS:
${sList || '(keine)'}

STATUS-IDs: ${stats.map(s => `"${s.title}"→${s.id}`).join(', ')}
PRIORITÄTEN: high | medium | low

AKTIONEN — Füge am Ende deiner Antwort einen \`\`\`actions\`\`\`-Block hinzu wenn du etwas ausführen möchtest:
\`\`\`actions
[
  {"type":"create_task","label":"Aufgabe erstellen","name":"...","priority":"high|medium|low","dueDate":"YYYY-MM-DD","stackId":"","description":"","checklist":["Punkt 1"]},
  {"type":"edit_task","label":"Aufgabe bearbeiten","id":"TASK_ID","name":"","priority":"","statusId":"","dueDate":""},
  {"type":"create_stack","label":"Stack erstellen","name":"...","priority":"medium","dueDate":"YYYY-MM-DD","milestones":["M1","M2"],"notes":""},
  {"type":"edit_stack","label":"Stack bearbeiten","id":"STACK_ID","name":"","status":"active|paused|completed","dueDate":"","notes":""},
  {"type":"log_time","label":"Zeit buchen","taskId":"TASK_ID","hours":1.5,"date":"YYYY-MM-DD","note":"KI-Buchung"},
  {"type":"create_workflow","label":"Workflow speichern","name":"...","steps":[]},
  {"type":"export_excel","label":"Excel exportieren"},
  {"type":"export_pdf","label":"PDF erstellen"},
  {"type":"show_report","label":"Bericht anzeigen","html":"<h2>Titel</h2><table>...</table>"},
  {"type":"open_task","label":"Aufgabe öffnen","id":"TASK_ID"},
  {"type":"open_stack","label":"Stack öffnen","id":"STACK_ID"}
]
\`\`\``;
}

// ── Antwort parsen ─────────────────────────────────────────────────────────

function _parseResponse(raw) {
    let text = raw, actions = [];
    const m = raw.match(/```actions\s*([\s\S]*?)```/);
    if (m) {
        try { actions = JSON.parse(m[1].trim()); } catch { /* ignore */ }
        text = raw.replace(/```actions[\s\S]*?```/, '').trim();
    }
    return { text, html: _md(text), actions };
}

function _md(t) {
    return t
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g,     '<em>$1</em>')
        .replace(/`([^`]+)`/g,     '<code style="background:var(--bg-color);padding:1px 5px;border-radius:3px;font-size:11px;">$1</code>')
        .replace(/^#{1,3} (.+)$/gm,'<b style="display:block;margin:9px 0 3px;font-size:14px;">$1</b>')
        .replace(/^- (.+)$/gm,     '<div style="padding:1px 0 1px 14px;position:relative;"><span style="position:absolute;left:2px;">•</span>$1</div>')
        .replace(/^(\d+)\. (.+)$/gm,'<div style="padding:1px 0 1px 18px;position:relative;"><span style="position:absolute;left:0;color:var(--text-muted);">$1.</span>$2</div>')
        .replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>');
}

// ── Aktionen ausführen ─────────────────────────────────────────────────────

function executeAIAction(idx, btn) {
    const a = lastAIActions[idx];
    if (!a) return;

    const done = label => {
        btn.innerHTML   = `<i class="fas fa-check"></i> ${label}`;
        btn.disabled    = true;
        btn.style.color = 'var(--success)';
    };

    try {
        switch (a.type) {

            case 'create_task': {
                const task = {
                    id: generateId(), projectName: a.name || 'Neue Aufgabe',
                    status: a.statusId || appData.statuses[0]?.id || 'todo',
                    priority: a.priority || 'medium', projectStackId: a.stackId || '',
                    bucket: a.bucket || '', stakeholderId: a.stakeholderId || '',
                    assigneeId: a.assigneeId || '', startDate: a.startDate || '',
                    dueDate: a.dueDate || '', estimatedTime: a.estimatedTime || '',
                    spentTime: 0, description: a.description || '', notes: '',
                    checklist: (a.checklist || []).map(c => ({
                        id: generateId(), title: c, done: false,
                        dueDate: '', assigneeId: '', predecessors: []
                    })),
                    files: [], recurrence: 'none', isPaused: false,
                    predecessors: [], completedAt: null
                };
                appData.tasks.push(task); saveToLocal(true);
                done('Aufgabe erstellt');
                showToast(`Aufgabe „${task.projectName}" erstellt.`, 'success');
                break;
            }

            case 'edit_task': {
                const t = appData.tasks.find(x => x.id === a.id || x.id === a.taskId);
                if (!t) { showToast('Aufgabe nicht gefunden.', 'error'); break; }
                if (a.name)        t.projectName = a.name;
                if (a.priority)    t.priority    = a.priority;
                if (a.statusId)    t.status      = a.statusId;
                if (a.dueDate)     t.dueDate     = a.dueDate;
                if (a.description) t.description = a.description;
                saveToLocal(true); done('Aufgabe aktualisiert');
                showToast(`Aufgabe „${t.projectName}" aktualisiert.`, 'success');
                break;
            }

            case 'create_stack': {
                const stack = {
                    id: generateId(), name: a.name || 'Neues Stack', status: 'active',
                    priority: a.priority || 'medium', stakeholderId: a.stakeholderId || '',
                    assigneeId: a.assigneeId || '', bucket: a.bucket || '',
                    startDate: a.startDate || '', dueDate: a.dueDate || '',
                    notes: a.notes || '', history: '',
                    checklist: (a.milestones || []).map(m => ({
                        id: generateId(), title: m, done: false,
                        dueDate: '', assigneeId: '', predecessors: []
                    })),
                    predecessors: [], completedAt: null
                };
                appData.projectStacks.push(stack); saveToLocal(true);
                done('Stack erstellt');
                showToast(`Stack „${stack.name}" erstellt.`, 'success');
                break;
            }

            case 'edit_stack': {
                const s = appData.projectStacks.find(x => x.id === a.id);
                if (!s) { showToast('Stack nicht gefunden.', 'error'); break; }
                if (a.name)     s.name     = a.name;
                if (a.priority) s.priority = a.priority;
                if (a.status)   s.status   = a.status;
                if (a.dueDate)  s.dueDate  = a.dueDate;
                if (a.notes)    s.notes    = a.notes;
                saveToLocal(true); done('Stack aktualisiert');
                showToast(`Stack „${s.name}" aktualisiert.`, 'success');
                break;
            }

            case 'log_time': {
                const targetId = a.taskId || a.id;
                const taskObj = appData.tasks.find(x => x.id === targetId);
                if (!taskObj) { showToast('Aufgabe für Zeiterfassung nicht gefunden.', 'error'); break; }

                const hours = parseFloat(a.hours) || 0.25;
                const date = a.date || new Date().toISOString().split('T')[0];
                const note = a.note || 'Von KI verbucht';

                if (!appData.timeLogs) appData.timeLogs = [];
                appData.timeLogs.push({ id: generateId(), taskId: targetId, hours, date, note });

                taskObj.spentTime = (parseFloat(taskObj.spentTime || 0) + hours).toFixed(2);
                const logText = `[Zeiterfassung am ${date} | ${hours}h] ${note}`.trim();
                taskObj.notes = taskObj.notes ? taskObj.notes + '\n' + logText : logText;

                saveToLocal(true);
                done('Zeit gebucht');
                showToast(`${hours}h auf „${taskObj.projectName}“ gebucht.`, 'success');

                // Aktualisiert die Anzeige, falls man sich gerade in der Zeiterfassungs-View befindet
                if (typeof currentView !== 'undefined' && currentView === 'time') {
                    renderTimeTracking(document.getElementById('mainContainer'));
                }
                break;
            }

            case 'create_workflow': {
                if (!appData.settings.workflows) appData.settings.workflows = [];
                const wf = { id: generateId(), name: a.name || 'KI-Workflow', trigger: a.trigger || 'manual', steps: a.steps || [] };
                appData.settings.workflows.push(wf); saveToLocal(true);
                done('Workflow gespeichert');
                showToast(`Workflow „${wf.name}" erstellt.`, 'success');
                break;
            }

            case 'export_excel':  exportExcel();        done('Excel exportiert');   break;
            case 'export_pdf':    exportPDFGefiltert(); done('PDF erstellt');        break;
            case 'export_json':   exportJSON();         done('Backup heruntergeladen'); break;
            case 'show_report':
                _showReport(a.html || _esc(a.content || ''));
                done('Bericht geöffnet');
                break;
            case 'open_task':
                if (a.id) { closeSearchModal(); openModal(a.id); }
                done('Geöffnet'); break;
            case 'open_stack':
                if (a.id) { closeSearchModal(); openStackModal(a.id); }
                done('Geöffnet'); break;
            default:
                showToast('Unbekannte Aktion: ' + a.type, 'warning');
        }
    } catch (err) {
        showToast('Aktion fehlgeschlagen: ' + err.message, 'error');
    }
}

function _showReport(html) {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    ov.innerHTML = `
    <div style="background:var(--surface-color);border-radius:var(--radius);max-width:820px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:var(--shadow);">
        <div style="padding:14px 20px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;">
            <h3 style="margin:0;"><i class="fas fa-robot" style="color:var(--primary-color);margin-right:8px;"></i>KI-Bericht</h3>
            <button class="secondary icon-btn" onclick="this.closest('[style*=position]').remove()"><i class="fas fa-times"></i></button>
        </div>
        <div class="rte-content" style="flex:1;overflow-y:auto;padding:20px;">${html}</div>
    </div>`;
    ov.addEventListener('click', e => e.target === ov && ov.remove());
    document.body.appendChild(ov);
}

// ── Hilfsfunktionen ────────────────────────────────────────────────────────

function clearAIChat() {
    aiChatHistory = [];
    lastAIActions = [];
    renderAIChatWelcome();
}

/** Wird von closeSearchModal() aufgerufen */
function resetAISearchState() {
    aiSearchMode = false;
    _applyAIMode(false);
}