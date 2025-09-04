// Global variables
let currentSession = {
    messages: [],
    memories: {
        people: [],
        dates: [],
        places: [],
        relationships: [],
        events: []
    }
};

// Initialize collapsible memory sections with persisted state
function initCollapsibleMemorySections() {
    const STORAGE_KEY = 'memorySectionCollapsed';
    let state = {};
    try { state = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch (_) { state = {}; }

    const sections = document.querySelectorAll('.memory-section');
    sections.forEach((section, index) => {
        const header = section.querySelector('h4');
        const items = section.querySelector('.memory-items');
        if (!header || !items) return;

        const key = items.id || `section-${index}`;
        if (state[key]) {
            section.classList.add('collapsed');
        }

        header.tabIndex = 0;
        header.setAttribute('role', 'button');
        header.setAttribute('aria-expanded', String(!section.classList.contains('collapsed')));

        const toggle = () => {
            section.classList.toggle('collapsed');
            const collapsed = section.classList.contains('collapsed');
            header.setAttribute('aria-expanded', String(!collapsed));
            state[key] = collapsed;
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
        };

        header.addEventListener('click', toggle);
        header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle();
            }
        });
    });
}

// Update counts next to memory section titles, e.g., "People (3)"
function updateMemorySectionCounts() {
    const sections = document.querySelectorAll('.memory-section');
    sections.forEach((section) => {
        const header = section.querySelector('h4');
        const itemsContainer = section.querySelector('.memory-items');
        if (!header || !itemsContainer) return;

        // Persist original title once
        if (!header.dataset.baseTitle) {
            header.dataset.baseTitle = header.textContent.trim().replace(/\s*\(\d+\)$/, '');
        }

        // For Narrator section, never append a count
        if (itemsContainer.id === 'memory-narrator') {
            header.textContent = header.dataset.baseTitle;
            return;
        }

        // Count memory items (exclude placeholders)
        const count = Array.from(itemsContainer.children)
            .filter(el => el.classList && el.classList.contains('memory-item')).length;
        header.textContent = `${header.dataset.baseTitle} (${count})`;
    });
}

// Observe memory content changes and update counts automatically
function initMemoryCountsObserver() {
    const content = document.querySelector('.memory-content');
    if (!content) return;
    const debounced = (() => {
        let t;
        return () => { clearTimeout(t); t = setTimeout(updateMemorySectionCounts, 100); };
    })();
    const observer = new MutationObserver(debounced);
    observer.observe(content, { childList: true, subtree: true, attributes: true });
    // Initial compute
    updateMemorySectionCounts();
}

// UI: narrator name as a memory item rendering and editing
function updateNarratorPill(nameValue = currentUserName) {
    const container = document.getElementById('memory-narrator');
    if (!container) return;
    // Remove placeholder if present
    const placeholder = container.querySelector('.memory-placeholder');
    if (placeholder) placeholder.remove();

    let item = document.getElementById('narrator-item');
    const valid = getValidatedDisplayName(nameValue);

    const html = `
        <div class="memory-title">Narrator</div>
        <div class="memory-detail">${valid ? `Name: ${escapeHtml(valid)}` : 'Click to set your name'}</div>
    `;

    if (!item) {
        item = document.createElement('div');
        item.id = 'narrator-item';
        item.className = 'memory-item narrator';
        item.innerHTML = html;
        container.prepend(item);
        // Attach click handler once
        item.addEventListener('click', onNarratorItemClick);
    } else {
        item.innerHTML = html;
    }
}

function onNarratorItemClick() {
    const current = getValidatedDisplayName(currentUserName) || '';
    const proposed = prompt('What should I call you?', current);
    if (proposed === null) return; // cancelled
    const validated = getValidatedDisplayName(proposed);
    if (!validated) {
        alert('Please enter a valid name.');
        return;
    }
    if (!confirm(`Are you sure you want to set your name to "${validated}"?`)) return;
    (async () => {
        try {
            await setUserPreference('narrator_name', validated);
            currentUserName = validated;
            updateNarratorPill(validated);
            addMessage('system', 'system', `Name updated to ${validated}.`, { timestamp: new Date().toLocaleTimeString() });
        } catch (e) {
            console.error('Failed to persist narrator_name', e);
            alert('Sorry, I could not save your name. Please try again.');
        }
    })();
}

// Simple HTML escaper for safe rendering
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
// Wait until Firebase auth is ready with a user (or timeout)
async function waitForAuthReady(maxMs = 4000) {
    const start = Date.now();
    // Quick path
    if (window.firebaseAuth?.isAuthenticated && window.firebaseAuth.isAuthenticated()) return true;
    // Subscribe and wait
    return new Promise((resolve) => {
        let resolved = false;
        const done = (val) => { if (!resolved) { resolved = true; resolve(val); } };
        const timer = setInterval(() => {
            if (window.firebaseAuth?.isAuthenticated && window.firebaseAuth.isAuthenticated()) {
                clearInterval(timer);
                done(true);
            } else if (Date.now() - start > maxMs) {
                clearInterval(timer);
                done(false); // give up, continue best-effort
            }
        }, 100);
        // Also hook one-time auth state
        try {
            window.firebaseAuth?.onAuthStateChanged?.((u) => {
                if (u) {
                    clearInterval(timer);
                    done(true);
                }
            });
        } catch (_) { /* ignore */ }
    });
}

// Merge helper with simple de-duplication by string key
function mergeMemoryArrays(targetArr, incomingArr, maxItems = 200) {
    const set = new Set(targetArr.map(v => typeof v === 'string' ? v : JSON.stringify(v)));
    for (const v of incomingArr) {
        const key = typeof v === 'string' ? v : JSON.stringify(v);
        if (!set.has(key)) {
            targetArr.push(v);
            set.add(key);
        }
        if (targetArr.length >= maxItems) break;
    }
    return targetArr;
}

// Build a compact one-time memory primer for Collaborator
function buildMemoryPrimer(memories, caps = { people: 5, places: 5, dates: 3, relationships: 5, events: 5, totalChars: 600 }) {
    if (!memories) return '';
    const lines = [];
    const pick = (arr, n) => Array.isArray(arr) ? arr.slice(-n) : [];
    const toText = (v) => typeof v === 'string' ? v : (v && (v.name || v.title || v.event || v.person || v.place || v.description)) || JSON.stringify(v);
    const people = pick(memories.people, caps.people).map(toText);
    const places = pick(memories.places, caps.places).map(toText);
    const dates = pick(memories.dates, caps.dates).map(toText);
    const relationships = pick(memories.relationships, caps.relationships).map(toText);
    const events = pick(memories.events, caps.events).map(toText);
    if ([people, places, dates, relationships, events].every(a => a.length === 0)) return '';
    if (people.length) lines.push(`People: ${people.join('; ')}`);
    if (places.length) lines.push(`Places: ${places.join('; ')}`);
    if (dates.length) lines.push(`Dates: ${dates.join('; ')}`);
    if (relationships.length) lines.push(`Relationships: ${relationships.join('; ')}`);
    if (events.length) lines.push(`Events: ${events.join('; ')}`);
    let text = `Context reminder from your saved memories (do not repeat verbatim):\n${lines.join('\n')}`;
    if (text.length > caps.totalChars) {
        text = text.slice(0, caps.totalChars - 3) + '...';
    }
    return text;
}

// Hydrate persisted memories from server and render
async function hydratePersistedMemories() {
    const id = getConversationId();
    const resp = await fetchWithTimeout(`/api/memories?conversationId=${encodeURIComponent(id)}`, { method: 'GET', timeout: 15000 });
    if (!resp.ok) {
        throw new Error(`memories_api_${resp.status}`);
    }
    const data = await resp.json();
    const combined = { people: [], dates: [], places: [], relationships: [], events: [] };
    for (const m of (data.memories || [])) {
        if (m.id) seenMemoryIds.add(m.id);
        const p = m.payload || {};
        if (Array.isArray(p.people)) combined.people.push(...p.people);
        if (Array.isArray(p.dates)) combined.dates.push(...p.dates);
        if (Array.isArray(p.places)) combined.places.push(...p.places);
        if (Array.isArray(p.relationships)) combined.relationships.push(...p.relationships);
        if (Array.isArray(p.events)) combined.events.push(...p.events);
    }
    // Merge into session with de-dupe
    currentSession.memories.people = mergeMemoryArrays(currentSession.memories.people, combined.people);
    currentSession.memories.dates = mergeMemoryArrays(currentSession.memories.dates, combined.dates);
    currentSession.memories.places = mergeMemoryArrays(currentSession.memories.places, combined.places);
    currentSession.memories.relationships = mergeMemoryArrays(currentSession.memories.relationships, combined.relationships);
    currentSession.memories.events = mergeMemoryArrays(currentSession.memories.events, combined.events);
    updateMemoryDisplay(currentSession.memories);
    memoryHydrated = true;
    // Ensure session persists
    scheduleSecureSave();
}


// Consolidated auth and SSE management to prevent race conditions
function setupAuthSSEBinding() {
    let lastAuthStateChange = 0;
    let authStateChangeTimer = null;
    
    const bind = () => {
        if (!window.firebaseAuth) return;
        
        // Consolidated auth state handler - only handles actual login/logout
        window.firebaseAuth.onAuthStateChanged(async (user) => {
            const now = Date.now();
            console.log(`Auth state change: user=${!!user}, bootstrap=${bootstrapInProgress}`);
            
            // Rate limit auth state changes to prevent rapid fire during bootstrap
            if (now - lastAuthStateChange < 1000) {
                console.log('Auth state change rate limited');
                return;
            }
            lastAuthStateChange = now;
            
            // During bootstrap, let bootstrap handle SSE initialization
            if (bootstrapInProgress) {
                console.log('Auth state change during bootstrap - letting bootstrap handle SSE');
                return;
            }
            
            // Debounce rapid auth state changes
            if (authStateChangeTimer) {
                clearTimeout(authStateChangeTimer);
            }
            
            authStateChangeTimer = setTimeout(async () => {
                if (user) {
                    console.log('User authenticated - establishing SSE connection');
                    await manageSSEConnection('auth_login', false);
                    
                    // Handle post-auth hydration only if not done during bootstrap
                    try {
                        if (!memoryHydrated) {
                            await hydratePersistedMemories();
                        }
                        // Fetch durable narrator name preference
                        const name = await getUserPreference('narrator_name');
                        if (typeof name === 'string' && name.trim()) {
                            currentUserName = name.trim();
                            updateNarratorPill(currentUserName);
                        }
                    } catch (e) {
                        console.warn('Post-auth hydration error:', e);
                    }
                } else {
                    console.log('User logged out - closing SSE connection');
                    sseConnectionState = 'disconnected';
                    if (eventSource) {
                        try { eventSource.close(); } catch (_) {}
                        eventSource = null;
                    }
                    updateMemoryStatus('Not authenticated');
                }
            }, 500); // 500ms debounce
        });

        // Token refresh handler - only reconnect if connection is unhealthy
        window.firebaseAuth.onIdTokenChanged(async (user) => {
            if (!user) return; // handled by onAuthStateChanged
            
            // Skip during bootstrap - bootstrap will handle initial connection
            if (bootstrapInProgress) {
                console.log('Token refresh during bootstrap - skipping');
                return;
            }
            
            console.log(`Token refresh: connectionState=${sseConnectionState}`);
            
            // Only reconnect if connection is broken or this is a forced refresh
            if (sseConnectionState === 'error' || eventSource?.readyState !== EventSource.OPEN) {
                console.log('Token refresh triggering reconnection due to unhealthy connection');
                if (sseReconnectTimer) clearTimeout(sseReconnectTimer);
                sseReconnectTimer = setTimeout(() => {
                    manageSSEConnection('token_refresh', true);
                }, 250);
            } else {
                console.log('Token refresh skipped - connection is healthy');
            }
        });

        // Initial status
        updateMemoryStatus('Checking sign-in...');
    };

    if (window.firebaseAuth) {
        bind();
    } else {
        window.addEventListener('firebase-ready', bind, { once: true });
    }
}

// Loader helpers
function showAppLoader() {
    const el = document.getElementById('app-loader');
    if (el) el.style.display = 'flex';
    try { console.log('[app] showAppLoader @', Date.now()); } catch (_) {}
}
function hideAppLoader() {
    const el = document.getElementById('app-loader');
    if (el) el.style.display = 'none';
    try { console.log('[app] hideAppLoader @', Date.now()); } catch (_) {}
}

// Controlled app bootstrap to avoid race conditions on startup
async function bootstrapApp() {
    try {
        try { console.log('[bootstrap] start @', Date.now()); } catch (_) {}
        // 1) Secure storage + session
        await waitForSecureStorage();
        const sessionRestored = await loadSecureSession();

        // 2) Auth readiness + fresh token
        await waitForAuthReady();
        if (window.firebaseAuth?.isAuthenticated()) {
            try { await window.firebaseAuth.getIdToken(true); } catch (_) {}
        }

        // 3) Fetch durable narrator name preference before deciding greeting
        try {
            const prefName = await getUserPreference('narrator_name');
            const validated = getValidatedDisplayName(prefName);
            if (validated) {
                currentUserName = validated;
            }
        } catch (_) { /* ignore */ }
        updateNarratorPill(currentUserName);

        // 4) Initialize SSE and hydrate persisted memories
        await manageSSEConnection('bootstrap', true);
        try {
            if (!memoryHydrated) await hydratePersistedMemories();
        } catch (e) { console.warn('Bootstrap hydration error:', e); }

        // 4b) Compute new vs returning user flag deterministically
        try {
            const hasValidName = !!getValidatedDisplayName(currentUserName);
            const hasMessages = (currentSession.messages || []).length > 0;
            const hasMemories = Object.values(currentSession.memories || {}).some(arr => (arr || []).length > 0);
            const cameFromSplash = localStorage.getItem('story-collection-used') === 'true';
            const sessionMarker = localStorage.getItem('story_session_exists') === 'true';
            isNewUserFlag = !!(cameFromSplash && !sessionRestored && !sessionMarker && !hasValidName && !hasMessages && !hasMemories);
            console.log('[onboarding] bootstrap computed isNewUserFlag:', {
                cameFromSplash,
                sessionRestored,
                sessionMarker,
                hasValidName,
                hasMessages,
                hasMemories,
                memoryHydrated,
                isNewUserFlag
            });
        } catch (e) {
            console.warn('[onboarding] failed to compute isNewUserFlag', e);
            isNewUserFlag = null;
        }

        // 5) Hide loader and signal readiness
        hideAppLoader();
        bootstrapInProgress = false;
        try { window.dispatchEvent(new Event('app-bootstrap-complete')); } catch(_) {}
        try { console.log('[bootstrap] end (success) @', Date.now()); } catch (_) {}

        // 6) Decide returning vs new user after data is ready
        await autoStartConversation();
    } catch (e) {
        console.error('Bootstrap failed:', e);
        hideAppLoader();
        bootstrapInProgress = false;
        try { window.dispatchEvent(new Event('app-bootstrap-complete')); } catch(_) {}
        try { console.log('[bootstrap] end (error) @', Date.now()); } catch (_) {}
        // Fallback: proceed with conversation anyway
        await autoStartConversation();
    }
}

// Secure session management
const SESSION_STORAGE_KEY = 'story_session';
let sessionAutoSaveEnabled = true;
let isTyping = false;
let memoryDisplayVisible = true;
let loggingModeEnabled = false;
let selectedModel = 'claude-3-5-haiku-latest'; // Default model - Fast and reliable
let logEntries = [];
// Guard to prevent rapid double submissions
let sendInProgress = false;
let conversationId = null;
// SSE connection state
let eventSource = null;
let lastSseToken = null;
let lastSseUrl = null;
let sseReconnectTimer = null;
const seenMemoryIds = new Set();
let sseReconnectAttempts = 0;
let sseMaxReconnectAttempts = 5;
let sseReconnectDelay = 1000;
// Persistence hydration and primer flags
let memoryHydrated = false;
let memoryPrimerInjected = false;
// Durable user identity (narrator name)
let currentUserName = null;
// Bootstrap guard to avoid double init
let bootstrapInProgress = false;
// SSE connection state tracking with rate limiting
let sseConnectionState = 'disconnected'; // 'disconnected', 'connecting', 'connected', 'error'
let lastSSEConnectionAttempt = 0;
let sseConnectionAttempts = 0;
const SSE_RATE_LIMIT_MS = 5000; // Don't attempt connections more than once per 5 seconds
const MAX_SSE_ATTEMPTS_PER_MINUTE = 10;
// New vs Returning flag (computed during bootstrap)
let isNewUserFlag = null;

// User preferences helpers
function getValidatedDisplayName(raw) {
    if (!raw) return null;
    const name = String(raw).trim();
    if (!name) return null;
    // Common bad extractions
    const invalids = new Set(['naratory','narratory','narrator','user','me','self','speaker','unknown','n/a','na']);
    if (invalids.has(name.toLowerCase())) return null;
    // Heuristic: require at least 2 alpha characters total
    const alphaCount = (name.match(/[A-Za-z]/g) || []).length;
    if (alphaCount < 2) return null;
    // Cap length to avoid prompt issues
    if (name.length > 60) return name.slice(0, 60);
    return name;
}
async function getUserPreference(key) {
    try {
        const url = `/api/user/preferences/${encodeURIComponent(key)}`;
        const resp = await fetchWithTimeout(url, { method: 'GET', timeout: 10000 });
        if (!resp.ok) return null;
        const data = await resp.json();
        console.log('[prefs] get', key, '=>', data?.value ?? null);
        return data?.value ?? null;
    } catch (e) { console.warn('[prefs] get failed', key, e); return null; }
}

async function setUserPreference(key, value) {
    try {
        const url = `/api/user/preferences/${encodeURIComponent(key)}`;
        const resp = await fetchWithTimeout(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value }),
            timeout: 10000
        });
        if (!resp.ok) throw new Error('pref_set_failed_' + resp.status);
        console.log('[prefs] set', key, '=>', value);
        return true;
    } catch (e) {
        console.error('Failed to set preference', key, e);
        return false;
    }
}

// Return a stable conversation id, persisted in localStorage
function getConversationId() {
    if (conversationId) return conversationId;
    try {
        const stored = localStorage.getItem('conversationId');
        if (stored) {
            conversationId = stored;
            return conversationId;
        }
        const id = (crypto && crypto.randomUUID)
            ? crypto.randomUUID()
            : `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        localStorage.setItem('conversationId', id);
        conversationId = id;
        return conversationId;
    } catch (_) {
        conversationId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        return conversationId;
    }
}

// Generate a per-message id
function generateMessageId() {
    return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Centralized SSE connection manager with state tracking and rate limiting
async function manageSSEConnection(reason = 'unknown', forceRefresh = false) {
    const now = Date.now();
    
    // Rate limiting: prevent connections more than once per 5 seconds
    if (!forceRefresh && reason !== 'bootstrap' && now - lastSSEConnectionAttempt < SSE_RATE_LIMIT_MS) {
        console.log(`SSE connection rate limited: ${reason}, last attempt ${now - lastSSEConnectionAttempt}ms ago`);
        return;
    }
    
    // Track connection attempts for additional protection
    if (reason !== 'bootstrap') {
        sseConnectionAttempts++;
        // Reset attempt counter every minute
        if (now - lastSSEConnectionAttempt > 60000) {
            sseConnectionAttempts = 1;
        }
        if (sseConnectionAttempts > MAX_SSE_ATTEMPTS_PER_MINUTE) {
            console.error(`SSE connection attempts exceeded limit: ${sseConnectionAttempts} attempts in past minute`);
            return;
        }
    }
    
    lastSSEConnectionAttempt = now;
    
    // Prevent multiple simultaneous connection attempts
    if (sseConnectionState === 'connecting') {
        console.log('SSE connection already in progress, skipping:', reason);
        return;
    }
    
    // Skip reconnection during bootstrap unless explicitly required
    if (bootstrapInProgress && reason !== 'bootstrap' && reason !== 'explicit') {
        console.log('Skipping SSE connection during bootstrap:', reason);
        return;
    }
    
    // If we have a healthy connection and this is just a token refresh, skip
    if (!forceRefresh && eventSource?.readyState === EventSource.OPEN && reason === 'token_refresh') {
        console.log('SSE connection healthy, skipping token refresh reconnection');
        return;
    }
    
    const id = getConversationId();
    console.log(`Managing SSE connection: reason=${reason}, state=${sseConnectionState}`);
    
    try {
        sseConnectionState = 'connecting';
        
        // Close existing connection cleanly
        if (eventSource) {
            try { 
                eventSource.close(); 
                console.log('Closed existing SSE connection');
            } catch (_) {}
            eventSource = null;
        }
        
        // Build SSE URL with auth token if available
        updateMemoryStatus('Connecting...');
        let sseUrl = `/events?conversationId=${encodeURIComponent(id)}`;
        if (window.firebaseAuth && window.firebaseAuth.isAuthenticated()) {
            try {
                const token = await window.firebaseAuth.getIdToken(!!forceRefresh);
                lastSseToken = token;
                sseUrl += `&token=${encodeURIComponent(token)}`;
            } catch (error) {
                console.error('Failed to get Firebase token for SSE:', error);
                sseConnectionState = 'error';
                return;
            }
        }
        // Add cache-busting param to avoid any proxy caching
        sseUrl += `&cb=${Date.now()}`;
        lastSseUrl = sseUrl;
        
        eventSource = new EventSource(sseUrl);

        eventSource.onopen = () => {
            sseConnectionState = 'connected';
            sseReconnectAttempts = 0;
            updateMemoryStatus('Ready');
            addLogEntry('info', 'SSE', { status: 'open', conversationId: id, reason }, false);
            console.log('SSE connection established:', reason);
        };

        eventSource.onerror = (err) => {
            console.error('SSE connection error:', err);
            sseConnectionState = 'error';
            sseReconnectAttempts++;
            if (sseReconnectAttempts >= sseMaxReconnectAttempts) {
                updateMemoryStatus('Connection failed - stopped retrying');
                addLogEntry('error', 'SSE', { error: 'max_reconnect_attempts_reached', attempts: sseReconnectAttempts }, false);
                return;
            }
            updateMemoryStatus(`Connection error - retry ${sseReconnectAttempts}/${sseMaxReconnectAttempts}`);
            addLogEntry('error', 'SSE', { error: 'connection_error', attempt: sseReconnectAttempts, details: String(err) }, false);
            // Exponential backoff: 1s, 2s, 4s, 8s, 16s
            const delay = Math.min(sseReconnectDelay * Math.pow(2, sseReconnectAttempts - 1), 16000);
            scheduleSSEReconnect('sse_onerror', delay);
        };

        eventSource.addEventListener('memory', (ev) => {
            try {
                const data = JSON.parse(ev.data || '{}');
                // Dedupe based on saved memory id if present
                if (data.id && seenMemoryIds.has(data.id)) return;
                if (data.id) seenMemoryIds.add(data.id);

                if (data.error) {
                    updateMemoryStatus('Error processing memories');
                    addLogEntry('error', 'Memory Keeper', data, false);
                    return;
                }

                const extracted = {
                    people: Array.isArray(data.people) ? data.people : [],
                    dates: Array.isArray(data.dates) ? data.dates : [],
                    places: Array.isArray(data.places) ? data.places : [],
                    relationships: Array.isArray(data.relationships) ? data.relationships : [],
                    events: Array.isArray(data.events) ? data.events : [],
                    narrator: data.narrator || ''
                };

                // If nothing meaningful, ignore
                const hasAny = Object.values(extracted).some(arr => arr && arr.length > 0) || extracted.narrator;
                if (!hasAny) return;

                updateMemoryDisplay(extracted);

                // Extract narrator name from new narrator field
                try {
                    if (extracted.narrator && typeof extracted.narrator === 'string') {
                        const candidate = getValidatedDisplayName(extracted.narrator.trim());
                        if (candidate && candidate !== currentUserName) {
                            currentUserName = candidate;
                            updateNarratorPill(candidate);
                            setUserPreference('narrator_name', currentUserName);
                            console.log('📝 Narrator name extracted and saved:', candidate);
                        }
                    }
                } catch (_) { /* ignore name detection issues */ }
                updateMemoryStatus('Complete');
                addLogEntry('output', 'Memory Keeper', { source: 'sse', ...data }, false);
            } catch (e) {
                addLogEntry('error', 'SSE', { error: 'parse_error', details: String(e) }, false);
            }
        });
    } catch (e) {
        sseConnectionState = 'error';
        addLogEntry('error', 'SSE', { error: 'init_failed', details: String(e) }, false);
    }
}

// Legacy wrapper for backward compatibility
async function initializeSSE(forceRefresh = false) {
    await manageSSEConnection('explicit', forceRefresh);
}

// Debounced SSE reconnect helper with backoff
function scheduleSSEReconnect(reason = 'unknown', delay = 1000) {
    if (sseReconnectTimer) {
        clearTimeout(sseReconnectTimer);
    }
    if (sseReconnectAttempts >= sseMaxReconnectAttempts) {
        addLogEntry('error', 'SSE', { action: 'reconnect_abandoned', reason: 'max_attempts_reached' }, false);
        return;
    }
    sseReconnectTimer = setTimeout(() => {
        if (window.firebaseAuth && window.firebaseAuth.isAuthenticated()) {
            updateMemoryStatus('Reconnecting...');
            manageSSEConnection('reconnect_scheduled', true);
        }
    }, delay);
    addLogEntry('info', 'SSE', { action: 'schedule_reconnect', reason, delay, attempt: sseReconnectAttempts }, true);
}
// Small helper to enforce client-side timeouts for fetch with Firebase auth
async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 20000, ...rest } = options;
    const timeoutPromise = new Promise((_, reject) => {
        const id = setTimeout(() => reject(new Error('Request timed out')), timeout);
        timeoutPromise.cleanup = () => clearTimeout(id);
    });
    try {
        const response = await Promise.race([fetch(resource, rest), timeoutPromise]);
        return response;
    } finally {
        if (timeoutPromise.cleanup) timeoutPromise.cleanup();
    }
}
/**
 * Sanitize error messages for user-friendly display to seniors
 */
function sanitizeErrorForUser(error) {
    const errorMessage = error.message || error.toString();
    
    // Map technical errors to friendly messages
    const friendlyMessages = {
        'Failed to fetch': 'Having trouble connecting. Please check your internet connection and try again.',
        'Network request failed': 'Connection problem. Please try again in a moment.',
        'Timeout': 'The request is taking too long. Please try again.',
        'Authentication': 'Please refresh the page and try again.',
        'Forbidden': 'Access issue. Please refresh the page.',
        'Too Many Requests': 'Please wait a moment before trying again.',
        'Internal Server Error': 'We\'re experiencing technical difficulties. Please try again shortly.',
        'Service Unavailable': 'Service is temporarily unavailable. Please try again in a few minutes.'
    };
    
    // Check if error message contains any technical terms
    for (const [technical, friendly] of Object.entries(friendlyMessages)) {
        if (errorMessage.includes(technical)) {
            return friendly;
        }
    }
    
    // For API errors with status codes
    if (errorMessage.includes('403')) {
        return 'Access issue. Please refresh the page and try again.';
    }
    if (errorMessage.includes('500')) {
        return 'We\'re experiencing technical difficulties. Please try again in a moment.';
    }
    if (errorMessage.includes('429')) {
        return 'Please wait a moment before sending another message.';
    }
    
    // Default friendly message
    return 'Something went wrong. Please try again, or refresh the page if the problem continues.';
}

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎬 DOM loaded, initializing app...');
    
    // Add error handling for browser extension conflicts
    window.addEventListener('error', (event) => {
        // Suppress common browser extension errors that don't affect our app
        if (event.filename && (
            event.filename.includes('extension://') ||
            event.filename.includes('evmAsk.js') ||
            event.filename.includes('requestProvider.js') ||
            event.filename.includes('content.js')
        )) {
            event.preventDefault();
            return false;
        }
    });
    
    initializeInput();
    initializeButtons();
    initializeModelSelector();
    initializeDebugPanel();
    setupAuthSSEBinding();
    
    // Defer reveal + loader + bootstrap to auth-guard's signal
    window.addEventListener('page-revealed', async () => {
        console.log('[app] page-revealed received, starting bootstrap');
        bootstrapInProgress = true;
        showAppLoader();
        // Perform bootstrap orchestration
        await bootstrapApp();
        // Initialize collapsible memory sections and counts after bootstrap
        initCollapsibleMemorySections();
        initMemoryCountsObserver();
    }, { once: true });
});

/**
 * Wait for secure storage to be initialized
 */
async function waitForSecureStorage() {
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds max wait
    
    while (!window.secureStorage && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }
    
    if (!window.secureStorage) {
        console.warn('🚨 Secure storage not available after waiting');
    } else {
        console.log('🔐 Secure storage ready');
    }
}

/**
 * Secure Session Management Functions
 */

/**
 * Save current session data with encryption
 */
async function saveSecureSession() {
    if (!sessionAutoSaveEnabled || !window.secureStorage) {
        return;
    }

    try {
        // Only save if there's meaningful data to protect
        const hasMessages = currentSession.messages.length > 0;
        const hasMemories = Object.values(currentSession.memories).some(arr => arr.length > 0);
        
        if (hasMessages || hasMemories) {
            await window.secureStorage.setSecureItem(SESSION_STORAGE_KEY, {
                messages: currentSession.messages,
                memories: currentSession.memories,
                timestamp: new Date().toISOString(),
                version: '1.0'
            });
            console.log('🔐 Session data encrypted and saved securely');
        }
    } catch (error) {
        console.error('🚨 Failed to save secure session:', error);
        // Continue without throwing to avoid breaking the app
    }
}

/**
 * Load and decrypt session data
 */
async function loadSecureSession() {
    if (!window.secureStorage) {
        console.warn('🚨 Secure storage not available, using default session');
        return;
    }

    try {
        const savedSession = await window.secureStorage.getSecureItem(SESSION_STORAGE_KEY);
        
        if (savedSession && (savedSession.messages || savedSession.memories)) {
            // Restore session data
            currentSession.messages = savedSession.messages || [];
            currentSession.memories = savedSession.memories || {
                people: [],
                dates: [],
                places: [],
                relationships: [],
                events: []
            };
            
            console.log('🔐 Session data decrypted and loaded successfully');
            console.log(`📊 Restored ${currentSession.messages.length} messages and ${Object.values(currentSession.memories).reduce((sum, arr) => sum + arr.length, 0)} memories`);
            
            // Restore UI state if there's data
            if (currentSession.messages.length > 0 || Object.values(currentSession.memories).some(arr => arr.length > 0)) {
                restoreSessionUI();
                return true; // Indicate session was restored
            }
        } else {
            console.log('🔐 No previous secure session found, starting fresh');
        }
    } catch (error) {
        console.error('❌ Failed to load secure session:', error);
        // Continue with fresh session if decryption fails
    }
    return false; // Indicate no session was restored
}

/**
 * Restore UI state from loaded session data
 */
function restoreSessionUI() {
    // Restore chat messages
    const messagesContainer = document.getElementById('chat-messages');
    if (messagesContainer && currentSession.messages.length > 0) {
        messagesContainer.innerHTML = ''; // Clear any existing content
        currentSession.messages.forEach(message => {
            displayMessage(message.content, message.type, false); // false = don't save again
        });
        
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    // Restore memory display
    updateMemoryDisplay(currentSession.memories);
    
    // Do NOT trigger continuation prompt here during bootstrap; let autoStartConversation decide
    const totalMemories = Object.values(currentSession.memories).reduce((sum, arr) => sum + arr.length, 0);
    console.log('[onboarding] restoreSessionUI summary:', {
        totalMemories,
        bootstrapInProgress,
        isNewUserFlag
    });
    // If not bootstrapping and clearly returning, you may show prompt; otherwise leave to autoStartConversation
    if (!bootstrapInProgress && totalMemories > 0 && isNewUserFlag === false) {
        showContinuationPrompt();
    }
    
    console.log('🔄 UI state restored from session data');
}

/**
 * Clear secure session data
 */
async function clearSecureSession() {
    try {
        if (window.secureStorage) {
            window.secureStorage.removeSecureItem(SESSION_STORAGE_KEY);
            console.log('🔐 Secure session data cleared');
        }
    } catch (error) {
        console.error('🚨 Failed to clear secure session:', error);
    }
}

/**
 * Auto-save session data after changes (debounced)
 */
let saveTimeout;
function scheduleSecureSave() {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    
    // Debounce saves to avoid excessive encryption operations
    saveTimeout = setTimeout(async () => {
        await saveSecureSession();
    }, 1000); // Save 1 second after last change
}

/**
 * Initialize toggle switches
 */
function initializeToggles() {
    const memoryToggle = document.getElementById('memory-display-toggle');
    const loggingToggle = document.getElementById('logging-mode-toggle');
    
    // Memory Keeper toggle is now hidden, so always show memory display
    memoryDisplayVisible = true;
    
    // Comment out memory toggle handling since it's hidden
    // if (memoryToggle) {
    //     memoryToggle.addEventListener('change', function() {
    //         memoryDisplayVisible = this.checked;
    //         toggleMemoryPanelVisibility();
    //     });
    //     memoryDisplayVisible = memoryToggle.checked;
    // }
    
    if (loggingToggle) {
        loggingToggle.addEventListener('change', function() {
            loggingModeEnabled = this.checked;
            toggleLoggingPanel();
        });
        loggingModeEnabled = loggingToggle.checked;
    }
}

/**
 * Initialize input handling
 */
function initializeInput() {
    const input = document.getElementById('chat-input');
    if (input) {
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey && !e.repeat) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
}

/**
 * Initialize button event listeners
 */
function initializeButtons() {
    // Send button
    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }
    
    // New story button
    const newStoryBtn = document.getElementById('new-story-btn');
    if (newStoryBtn) {
        newStoryBtn.addEventListener('click', startNewSession);
    }
    
    // Export button
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportSession);
    }
    
    // Start story button (in modal)
    const startStoryBtn = document.getElementById('start-story-btn');
    if (startStoryBtn) {
        startStoryBtn.addEventListener('click', startStorySession);
    }
    
    // Logging control buttons
    const clearLogBtn = document.getElementById('clear-log-btn');
    if (clearLogBtn) {
        clearLogBtn.addEventListener('click', clearLog);
    }
    
    const exportLogBtn = document.getElementById('export-log-btn');
    if (exportLogBtn) {
        exportLogBtn.addEventListener('click', exportLog);
    }
}

/**
 * Initialize model selector dropdown
 */
function initializeModelSelector() {
    const modelSelect = document.getElementById('modelSelect');
    if (modelSelect) {
        // Set initial value
        modelSelect.value = selectedModel;
        
        // Add change event listener
        modelSelect.addEventListener('change', function() {
            selectedModel = this.value;
            console.log('Model changed to:', selectedModel);
            
            // Add a visual indicator that model was changed
            addMessage('system', 'system', 
                `Model switched to: ${this.options[this.selectedIndex].text}`,
                { timestamp: new Date().toLocaleTimeString() }
            );
        });
    }
}

/**
 * Initialize debug panel functionality
 */
function initializeDebugPanel() {
    const debugToggleBtn = document.getElementById('debug-toggle-btn');
    const debugPanel = document.getElementById('debug-panel');
    const debugContent = document.getElementById('debug-content');
    
    if (debugToggleBtn && debugPanel) {
        let debugVisible = false;
        
        debugToggleBtn.addEventListener('click', function() {
            debugVisible = !debugVisible;
            debugPanel.style.display = debugVisible ? 'block' : 'none';
            debugContent.style.display = debugVisible ? 'block' : 'none';
            debugToggleBtn.textContent = debugVisible ? 'Hide Debug Info' : 'Show Debug Info';
        });
    }
}

/**
 * Toggle logging panel visibility
 */
function toggleLoggingPanel() {
    const panel = document.getElementById('logging-panel');
    if (panel) {
        panel.style.display = loggingModeEnabled ? 'block' : 'none';
    }
}

/**
 * Add entry to logging panel
 */
function addLogEntry(type, agent, data, isInput = true) {
    if (!loggingModeEnabled) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
        timestamp,
        type,
        agent,
        data,
        isInput
    };
    
    logEntries.push(logEntry);
    
    const targetContainer = isInput ? 'log-inputs' : 'log-outputs';
    const container = document.getElementById(targetContainer);
    
    if (container) {
        const entryDiv = document.createElement('div');
        entryDiv.className = `log-entry ${type}`;
        
        entryDiv.innerHTML = `
            <div class="log-timestamp">${timestamp}</div>
            <div class="log-agent">${agent}</div>
            <pre>${JSON.stringify(data, null, 2)}</pre>
        `;
        
        container.appendChild(entryDiv);
        container.scrollTop = container.scrollHeight;
    }
}

/**
 * Clear logging panel
 */
function clearLog() {
    logEntries = [];
    const inputContainer = document.getElementById('log-inputs');
    const outputContainer = document.getElementById('log-outputs');
    
    if (inputContainer) inputContainer.innerHTML = '';
    if (outputContainer) outputContainer.innerHTML = '';
}

/**
 * Export log data
 */
function exportLog() {
    const logData = {
        timestamp: new Date().toISOString(),
        entries: logEntries,
        session: currentSession
    };
    
    const dataStr = JSON.stringify(logData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `agent-log-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
}

/**
 * Update debug panel with Memory Keeper processing info
 */
function updateDebugPanel(input, response, parsed) {
    // This function is kept for backward compatibility but logging mode replaces it
    console.log('Debug info:', { input, response, parsed });
}

/**
 * Send user message
 */
async function sendMessage() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    
    if (!input || !input.value.trim() || isTyping || sendInProgress) return;
    
    const message = input.value.trim();
    input.value = '';
    
    // Add user message
    addMessage('user', 'user', message, { timestamp: new Date().toLocaleTimeString() });

    // Opportunistic: extract and persist name from user's message if not known yet
    try {
        if (!getValidatedDisplayName(currentUserName)) {
            // Pattern 1: "my name is Henry" or "I am Henry"
            const explicitMatch = message.match(/\b(?:my name is|i am|i'm)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})\b/i);
            if (explicitMatch && explicitMatch[1]) {
                const candidate = getValidatedDisplayName(explicitMatch[1]);
                if (candidate) {
                    currentUserName = candidate;
                    updateNarratorPill(candidate);
                    setUserPreference('narrator_name', candidate);
                }
            }
            // Pattern 2: Single word that looks like a name (fallback for simple "Henry" responses)
            else if (message.trim().match(/^[A-Z][a-zA-Z]{1,15}$/)) {
                const candidate = getValidatedDisplayName(message.trim());
                if (candidate) {
                    currentUserName = candidate;
                    updateNarratorPill(candidate);
                    setUserPreference('narrator_name', candidate);
                }
            }
        }
    } catch (_) { /* ignore */ }
    
    // Disable input while processing
    input.disabled = true;
    sendBtn.disabled = true;
    isTyping = true;
    sendInProgress = true;
    
    // Show typing indicator
    showTypingIndicator();
    try {
        // Process both agents in parallel to cut latency
        const tasks = [
            processWithMemoryKeeper(message),
            processWithCollaborator(message)
        ];
        await Promise.allSettled(tasks);
        
    } catch (error) {
        console.error('Error processing message:', error);
        addMessage('ai', 'system', 
            "I'm sorry, I encountered an error processing your message. Please try again.",
            { timestamp: new Date().toLocaleTimeString() }
        );
    } finally {
        // Re-enable input
        input.disabled = false;
        sendBtn.disabled = false;
        isTyping = false;
        sendInProgress = false;
        hideTypingIndicator();
        input.focus();
    }
}

/**
 * Process message with Memory Keeper agent
 */
async function processWithMemoryKeeper(message) {
    console.log('=== MEMORY KEEPER PROCESSING ===');
    console.log('Processing message:', message);
    console.log('Selected model:', selectedModel);
    
    updateMemoryStatus('Processing...');
    
    try {
        const requestBody = { 
            message,
            model: selectedModel,
            conversationId: getConversationId(),
            messageId: generateMessageId()
        };
        
        // Log the input request
        addLogEntry('input', 'Memory Keeper', {
            action: 'extract_memories',
            input_message: message,
            model: selectedModel,
            timestamp: new Date().toISOString()
        }, true);
        
        console.log('Sending request to Memory Keeper API:', requestBody);
        
        const response = await fetchWithTimeout(window.API_CONFIG.MEMORY_KEEPER, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody),
            timeout: 20000
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Memory Keeper API Error:', errorText);
            
            // Log the error
            addLogEntry('error', 'Memory Keeper', {
                error: `API Error ${response.status}`,
                details: errorText,
                timestamp: new Date().toISOString()
            }, false);
            
            throw new Error(`Memory Keeper API error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Memory Keeper response:', data);
        
        // Log the output response
        addLogEntry('output', 'Memory Keeper', {
            action: 'extract_memories_response',
            raw_claude_response: data.debugInfo?.rawResponse,
            extracted_memories: data.memories,
            model_used: data.debugInfo?.selectedModel,
            timestamp: new Date().toISOString()
        }, false);
        const extractedMemories = data.memories;
        // Do not render memories directly here; rely on SSE 'memory' events to avoid duplicates
        updateMemoryStatus('Complete');
    } catch (error) {
        console.error('Memory Keeper Error:', error);
        const friendlyMessage = sanitizeErrorForUser(error);
        updateMemoryStatus('Unable to process memories: ' + friendlyMessage);
        // Log the error
        addLogEntry('error', 'Memory Keeper', {
            error: error.message,
            friendlyError: friendlyMessage,
            timestamp: new Date().toISOString()
        }, false);
    }
}

/**
 * Process message with Collaborator agent
 */
async function processWithCollaborator(message) {
    try {
        // Build conversation history for context
        const conversationHistory = currentSession.messages
            .filter(msg => msg.type === 'user' || (msg.type === 'ai' && msg.agent === 'collaborator'))
            .slice(-4) // Last 4 messages for context
            .map(msg => ({
                role: msg.type === 'user' ? 'user' : 'assistant',
                content: msg.content
            }));
        // Always inject a tiny name primer so the model reliably knows the speaker's name
        if (currentUserName && currentUserName.trim()) {
            conversationHistory.push({
                role: 'user',
                content: `(meta) The speaker's name is ${currentUserName.trim()}. Greet and address them as ${currentUserName.trim()}.`
            });
        }
        // Inject a one-time primer built from persisted memories
        if (!memoryPrimerInjected && memoryHydrated) {
            const primer = buildMemoryPrimer(currentSession.memories);
            if (primer && primer.length) {
                conversationHistory.push({ role: 'user', content: primer });
                memoryPrimerInjected = true;
            }
        }
        
        const requestBody = { 
            message,
            conversationHistory,
            model: selectedModel 
        };
        
        // Log the input request
        addLogEntry('input', 'Collaborator', {
            action: 'generate_response',
            user_message: message,
            conversation_history: conversationHistory,
            model: selectedModel,
            timestamp: new Date().toISOString()
        }, true);
        
        const response = await fetchWithTimeout(window.API_CONFIG.COLLABORATOR, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody),
            timeout: 20000
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            
            // Log the error
            addLogEntry('error', 'Collaborator', {
                error: `API Error ${response.status}`,
                details: errorText,
                timestamp: new Date().toISOString()
            }, false);
            
            throw new Error(`Collaborator API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Log the output response
        addLogEntry('output', 'Collaborator', {
            action: 'generate_response_result',
            claude_response: data.response,
            model_used: selectedModel,
            timestamp: new Date().toISOString()
        }, false);
        
        // Add Collaborator response with delay for natural feel
        setTimeout(() => {
            addMessage('ai', 'collaborator', data.response, { 
                timestamp: new Date().toLocaleTimeString() 
            });
        }, 1000 + Math.random() * 1000); // 1-2 second delay
        
    } catch (error) {
        console.error('Collaborator Error:', error);
        
        // Log the error
        addLogEntry('error', 'Collaborator', {
            error: error.message,
            timestamp: new Date().toISOString()
        }, false);
        
        // Show error message to user
        setTimeout(() => {
            addMessage('ai', 'system', 
                'I\'m sorry, I\'m having trouble connecting to the Collaborator service. Please check your internet connection and try again.',
                { timestamp: new Date().toLocaleTimeString() }
            );
        }, 1000);
    }
}

/**
 * Add message to chat
 */
function addMessage(type, agent, content, metadata = {}) {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    const avatar = document.createElement('div');
    avatar.className = `message-avatar ${type}`;
    avatar.textContent = type === 'user' ? '👤' : (agent === 'collaborator' ? '🤝' : '🧠');
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = content;
    
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    
    if (type === 'ai') {
        const badge = document.createElement('span');
        badge.className = 'agent-badge';
        badge.textContent = agent === 'collaborator' ? 'Collaborator' : 'Memory Keeper';
        meta.appendChild(badge);
    }
    
    if (metadata.timestamp) {
        const timestamp = document.createElement('span');
        timestamp.textContent = metadata.timestamp;
        meta.appendChild(timestamp);
    }
    
    contentDiv.appendChild(bubble);
    if (meta.children.length > 0) {
        contentDiv.appendChild(meta);
    }
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Store in session
    currentSession.messages.push({
        type,
        agent,
        content,
        timestamp: metadata.timestamp || new Date().toISOString()
    });
    
    // Auto-save encrypted session data (unless this is a restoration)
    if (!metadata.skipSave) {
        scheduleSecureSave();
    }
}

/**
 * Update memory display with extracted memories using DOM batching for performance
 */
function updateMemoryDisplay(extractedMemories) {
    if (!extractedMemories) {
        console.log('No extracted memories to display');
        return;
    }
    
    console.log('Updating memory display with:', extractedMemories);
    
    // Use requestAnimationFrame for smooth DOM updates
    requestAnimationFrame(() => {
        // Batch all DOM updates using documentFragment for better performance
        const categories = Object.keys(extractedMemories);
        
        categories.forEach(category => {
            const items = extractedMemories[category];
            if (Array.isArray(items) && items.length > 0) {
                ensureMemorySection(category);
                batchAddMemoryItems(category, items);
            }
        });
    });
    
    // Update session memories
    let memoriesUpdated = false;
    Object.keys(extractedMemories).forEach(category => {
        if (currentSession.memories[category] && Array.isArray(extractedMemories[category])) {
            extractedMemories[category].forEach(item => {
                if (!currentSession.memories[category].includes(item)) {
                    currentSession.memories[category].push(item);
                    memoriesUpdated = true;
                }
            });
        }
    });
    
    // Auto-save encrypted session data if memories were updated
    if (memoriesUpdated) {
        scheduleSecureSave();
    }
}

/**
 * Batch add multiple memory items using documentFragment for better performance
 */
function batchAddMemoryItems(category, items) {
    const container = document.getElementById(`memory-${category}`);
    if (!container || !items.length) return;
    
    // Remove placeholder if it exists
    const placeholder = container.querySelector('.memory-placeholder');
    if (placeholder) {
        placeholder.remove();
    }
    
    console.log(`Batch adding ${items.length} memory items to ${category}`);
    
    // Create documentFragment for batched DOM operations
    const fragment = document.createDocumentFragment();
    
    // Create all elements in memory first
    items.forEach(item => {
        const itemElement = createMemoryItemElement(category, item);
        if (itemElement) {
            fragment.appendChild(itemElement);
        }
    });
    
    // Single DOM append for all items - much faster than individual appends
    container.appendChild(fragment);
}

/**
 * Ensure a memory section exists for a given category; create dynamically if missing
 */
function ensureMemorySection(category) {
    const containerId = `memory-${category}`;
    if (document.getElementById(containerId)) return;
    const memoryContent = document.querySelector('.memory-content');
    if (!memoryContent) return;

    const section = document.createElement('div');
    section.className = 'memory-section';

    const title = document.createElement('h4');
    title.textContent = category.charAt(0).toUpperCase() + category.slice(1);

    const itemsDiv = document.createElement('div');
    itemsDiv.className = 'memory-items';
    itemsDiv.id = containerId;

    const placeholder = document.createElement('div');
    placeholder.className = 'memory-placeholder';
    placeholder.textContent = `No ${category} mentioned yet`;
    itemsDiv.appendChild(placeholder);

    section.appendChild(title);
    section.appendChild(itemsDiv);
    memoryContent.appendChild(section);
}

/**
 * Generic object renderer for unknown memory structures
 */
function renderGenericObject(obj) {
    try {
        const title = obj.name || obj.title || obj.label || obj.type || '';
        const entries = Object.entries(obj)
            .filter(([k, v]) => v !== undefined && v !== null && v !== '')
            .map(([k, v]) => `<div class="memory-detail"><strong>${capitalize(k)}:</strong> ${typeof v === 'object' ? JSON.stringify(v) : v}</div>`) 
            .join('');
        return title
            ? `<div class="memory-title">${title}</div>${entries}`
            : entries || `<div class="memory-detail">${JSON.stringify(obj)}</div>`;
    } catch (e) {
        return `<div class="memory-detail">${JSON.stringify(obj)}</div>`;
    }
}

function capitalize(str) {
    const s = String(str || '');
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Create a single memory item element (helper for batching)
 */
function createMemoryItemElement(category, item) {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'memory-item';
    
    // Handle different item formats and categories (same logic as before)
    if (typeof item === 'string') {
        itemDiv.textContent = item;
    } else if (typeof item === 'object' && item !== null) {
        switch (category) {
            case 'people':
                if (item.name) {
                    itemDiv.innerHTML = `
                        <div class="memory-title">${item.name}</div>
                        ${item.relationship ? `<div class="memory-detail">Relationship: ${item.relationship}</div>` : ''}
                        ${item.details ? `<div class="memory-detail">${item.details}</div>` : ''}
                    `;
                } else {
                    itemDiv.innerHTML = renderGenericObject(item);
                }
                break;
                
            case 'dates':
                if (item.event || item.description || item.name) {
                    const title = item.event || item.description || item.name;
                    itemDiv.innerHTML = `
                        <div class="memory-title">${title}</div>
                        ${item.timeframe ? `<div class="memory-detail">When: ${item.timeframe}</div>` : ''}
                        ${item.date ? `<div class="memory-detail">Date: ${item.date}</div>` : ''}
                        ${item.time ? `<div class="memory-detail">Time: ${item.time}</div>` : ''}
                        ${item.significance ? `<div class="memory-detail">Significance: ${item.significance}</div>` : ''}
                        ${item.details ? `<div class="memory-detail">${item.details}</div>` : ''}
                    `;
                } else {
                    itemDiv.innerHTML = renderGenericObject(item);
                }
                break;
                
            case 'places':
                if (item.location || item.place || item.name) {
                    const title = item.location || item.place || item.name;
                    itemDiv.innerHTML = `
                        <div class="memory-title">${title}</div>
                        ${item.significance ? `<div class="memory-detail">Significance: ${item.significance}</div>` : ''}
                        ${item.type ? `<div class="memory-detail">Type: ${item.type}</div>` : ''}
                        ${item.description ? `<div class="memory-detail">${item.description}</div>` : ''}
                        ${item.details ? `<div class="memory-detail">${item.details}</div>` : ''}
                    `;
                } else {
                    itemDiv.innerHTML = renderGenericObject(item);
                }
                break;
                
            case 'relationships':
                if (item.person1 && item.person2 && item.type) {
                    itemDiv.innerHTML = `
                        <div class="memory-title">${item.person1} ↔ ${item.person2}</div>
                        <div class="memory-detail">Relationship: ${item.type}</div>
                        ${item.details ? `<div class="memory-detail">${item.details}</div>` : ''}
                    `;
                } else if (item.connection || item.relationship || item.name) {
                    const title = item.connection || item.relationship || item.name;
                    itemDiv.innerHTML = `
                        <div class="memory-title">${title}</div>
                        ${item.nature ? `<div class="memory-detail">Type: ${item.nature}</div>` : ''}
                        ${item.type ? `<div class="memory-detail">Type: ${item.type}</div>` : ''}
                        ${item.description ? `<div class="memory-detail">${item.description}</div>` : ''}
                        ${item.details ? `<div class="memory-detail">${item.details}</div>` : ''}
                    `;
                } else {
                    itemDiv.innerHTML = renderGenericObject(item);
                }
                break;
                
            case 'events':
                {
                    const eventTitle = item.event || item.description || item.name || item.title || item.type;
                    if (eventTitle) {
                        itemDiv.innerHTML = `
                            <div class="memory-title">${eventTitle}</div>
                            ${item.type ? `<div class="memory-detail">Type: ${item.type}</div>` : ''}
                            ${item.timeframe ? `<div class="memory-detail">When: ${item.timeframe}</div>` : ''}
                            ${item.date ? `<div class="memory-detail">Date: ${item.date}</div>` : ''}
                            ${item.location ? `<div class="memory-detail">Where: ${item.location}</div>` : ''}
                            ${item.significance ? `<div class="memory-detail">Significance: ${item.significance}</div>` : ''}
                            ${item.participants ? `<div class="memory-detail">Who: ${Array.isArray(item.participants) ? item.participants.join(', ') : item.participants}</div>` : ''}
                            ${item.details ? `<div class="memory-detail">${item.details}</div>` : ''}
                        `;
                    } else {
                        itemDiv.innerHTML = renderGenericObject(item);
                    }
                }
                break;
                
            default:
                itemDiv.innerHTML = renderGenericObject(item);
        }
    } else {
        itemDiv.textContent = String(item);
    }
    
    return itemDiv;
}

/**
 * Add memory item to display (legacy function - kept for compatibility)
 */
function addMemoryItem(category, item) {
    const container = document.getElementById(`memory-${category}`);
    if (!container) return;
    
    // Remove placeholder if it exists
    const placeholder = container.querySelector('.memory-placeholder');
    if (placeholder) {
        placeholder.remove();
    }
    
    console.log(`Adding memory item to ${category}:`, item);
    
    // Create the memory item element
    const itemDiv = document.createElement('div');
    itemDiv.className = 'memory-item';
    
    // Handle different item formats and categories
    if (typeof item === 'string') {
        // Simple string - just display it
        itemDiv.textContent = item;
    } else if (typeof item === 'object' && item !== null) {
        // Structured object - format based on category
        switch (category) {
            case 'people':
                if (item.name) {
                    itemDiv.innerHTML = `
                        <div class="memory-title">${item.name}</div>
                        ${item.relationship ? `<div class="memory-detail">Relationship: ${item.relationship}</div>` : ''}
                        ${item.details ? `<div class="memory-detail">${item.details}</div>` : ''}
                    `;
                } else {
                    itemDiv.textContent = item.person || JSON.stringify(item);
                }
                break;
                
            case 'dates':
                if (item.event || item.description || item.name) {
                    const title = item.event || item.description || item.name;
                    itemDiv.innerHTML = `
                        <div class="memory-title">${title}</div>
                        ${item.timeframe ? `<div class="memory-detail">When: ${item.timeframe}</div>` : ''}
                        ${item.date ? `<div class="memory-detail">Date: ${item.date}</div>` : ''}
                        ${item.time ? `<div class="memory-detail">Time: ${item.time}</div>` : ''}
                        ${item.significance ? `<div class="memory-detail">Significance: ${item.significance}</div>` : ''}
                        ${item.details ? `<div class="memory-detail">${item.details}</div>` : ''}
                    `;
                } else {
                    itemDiv.textContent = item.date || item.time || JSON.stringify(item);
                }
                break;
                
            case 'places':
                if (item.location || item.place || item.name) {
                    const title = item.location || item.place || item.name;
                    itemDiv.innerHTML = `
                        <div class="memory-title">${title}</div>
                        ${item.significance ? `<div class="memory-detail">Significance: ${item.significance}</div>` : ''}
                        ${item.type ? `<div class="memory-detail">Type: ${item.type}</div>` : ''}
                        ${item.description ? `<div class="memory-detail">${item.description}</div>` : ''}
                        ${item.details ? `<div class="memory-detail">${item.details}</div>` : ''}
                    `;
                } else {
                    itemDiv.textContent = JSON.stringify(item);
                }
                break;
                
            case 'relationships':
                if (item.person1 && item.person2 && item.type) {
                    // Handle Claude's actual relationship structure: person1, person2, type
                    itemDiv.innerHTML = `
                        <div class="memory-title">${item.person1} ↔ ${item.person2}</div>
                        <div class="memory-detail">Relationship: ${item.type}</div>
                        ${item.details ? `<div class="memory-detail">${item.details}</div>` : ''}
                    `;
                } else if (item.connection || item.relationship || item.name) {
                    // Fallback for other relationship formats
                    const title = item.connection || item.relationship || item.name;
                    itemDiv.innerHTML = `
                        <div class="memory-title">${title}</div>
                        ${item.nature ? `<div class="memory-detail">Type: ${item.nature}</div>` : ''}
                        ${item.type ? `<div class="memory-detail">Type: ${item.type}</div>` : ''}
                        ${item.description ? `<div class="memory-detail">${item.description}</div>` : ''}
                        ${item.details ? `<div class="memory-detail">${item.details}</div>` : ''}
                    `;
                } else {
                    itemDiv.textContent = item.person || JSON.stringify(item);
                }
                break;
                
            case 'events':
                if (item.event || item.description) {
                    const eventTitle = item.event || item.description;
                    itemDiv.innerHTML = `
                        <div class="memory-title">${eventTitle}</div>
                        ${item.date ? `<div class="memory-detail">When: ${item.date}</div>` : ''}
                        ${item.participants ? `<div class="memory-detail">Who: ${item.participants}</div>` : ''}
                        ${item.significance ? `<div class="memory-detail">Significance: ${item.significance}</div>` : ''}
                        ${item.details ? `<div class="memory-detail">${item.details}</div>` : ''}
                    `;
                } else {
                    itemDiv.textContent = item.name || JSON.stringify(item);
                }
                break;
                
            default:
                // Fallback for unknown categories
                if (item.name) {
                    itemDiv.textContent = item.name;
                } else if (item.text) {
                    itemDiv.textContent = item.text;
                } else {
                    itemDiv.textContent = JSON.stringify(item);
                }
        }
    } else {
        itemDiv.textContent = String(item);
    }
    
    // Check if similar item already exists (compare by main content)
    const mainText = itemDiv.querySelector('.memory-title')?.textContent || itemDiv.textContent;
    const existing = Array.from(container.children).find(child => {
        const existingMainText = child.querySelector('.memory-title')?.textContent || child.textContent;
        return existingMainText === mainText;
    });
    
    if (existing) {
        console.log(`Duplicate memory item skipped for ${category}:`, mainText);
        return;
    }
    
    container.appendChild(itemDiv);
}

/**
 * Update memory status
 */
function updateMemoryStatus(status) {
    const statusElement = document.getElementById('memory-status');
    if (statusElement) {
        statusElement.textContent = status;
        
        // Update status styling
        statusElement.className = 'memory-status';
        if (status.toLowerCase().includes('processing')) {
            statusElement.classList.add('processing');
        } else if (status.toLowerCase().includes('complete')) {
            statusElement.classList.add('complete');
        } else if (status.toLowerCase().includes('error')) {
            statusElement.classList.add('error');
        }
    }
    
    // Check if we have any memories and update status accordingly
    const hasMemories = Object.values(currentSession.memories).some(arr => arr.length > 0);
    if (hasMemories && status === 'Ready') {
        updateMemoryStatus('Memories Collected');
    }
}

/**
 * Show typing indicator with progressive messages
 */
function showTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.style.display = 'flex';
        
        // Progressive loading messages for better perceived performance
        const messages = [
            'Processing your story...',
            'Extracting memories...',
            'Generating response...',
            'Almost ready...'
        ];
        
        let messageIndex = 0;
        const messageElement = indicator.querySelector('.typing-message');
        
        // Update message every 800ms for perceived progress
        const messageInterval = setInterval(() => {
            if (messageElement && messageIndex < messages.length - 1) {
                messageIndex++;
                messageElement.textContent = messages[messageIndex];
            }
        }, 800);
        
        // Animate progress bar for visual feedback
        const progressBar = indicator.querySelector('#typing-progress-bar');
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += Math.random() * 15 + 5; // Random progress increments for realistic feel
            if (progress > 85) progress = 85; // Cap at 85% until completion
            if (progressBar) {
                progressBar.style.width = `${progress}%`;
            }
        }, 200);
        
        // Store interval IDs for cleanup
        indicator.dataset.messageInterval = messageInterval;
        indicator.dataset.progressInterval = progressInterval;
        
        // Set initial message and progress
        if (messageElement) {
            messageElement.textContent = messages[0];
        }
        if (progressBar) {
            progressBar.style.width = '10%';
        }
    }
}

/**
 * Hide typing indicator and cleanup intervals
 */
function hideTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.style.display = 'none';
        
        // Clean up intervals to prevent memory leaks
        const messageInterval = indicator.dataset.messageInterval;
        const progressInterval = indicator.dataset.progressInterval;
        
        if (messageInterval) {
            clearInterval(parseInt(messageInterval));
            delete indicator.dataset.messageInterval;
        }
        
        if (progressInterval) {
            clearInterval(parseInt(progressInterval));
            delete indicator.dataset.progressInterval;
        }
        
        // Complete progress bar animation before hiding
        const progressBar = indicator.querySelector('#typing-progress-bar');
        if (progressBar) {
            progressBar.style.width = '100%';
            setTimeout(() => {
                progressBar.style.width = '0%';
            }, 300);
        }
        
        // Reset message text
        const messageElement = indicator.querySelector('.typing-message');
        if (messageElement) {
            messageElement.textContent = '';
        }
    }
}

/**
 * Toggle memory panel visibility
 */
function toggleMemoryPanelVisibility() {
    const panel = document.getElementById('memory-panel');
    if (panel) {
        if (memoryDisplayVisible) {
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
        }
    }
}

/**
 * Start new session
 */
function startNewSession() {
    // Clear current session
    currentSession = {
        messages: [],
        memories: {
            people: [],
            dates: [],
            places: [],
            relationships: [],
            events: []
        }
    };
    
    // Clear UI
    const messagesContainer = document.getElementById('chat-messages');
    if (messagesContainer) {
        messagesContainer.innerHTML = '';
    }
    
    // Reset memory display
    resetMemoryDisplay();
    
    // Clear secure session storage
    clearSecureSession();

    // Start a fresh, non-destructive conversation by generating a new ID
    try {
        const id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        localStorage.setItem('conversationId', id);
        conversationId = id;
    } catch (_) {
        conversationId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        localStorage.setItem('conversationId', conversationId);
    }
    // Reset flags and SSE state
    memoryHydrated = false;
    memoryPrimerInjected = false;
    seenMemoryIds.clear();
    if (eventSource) {
        try { eventSource.close(); } catch (_) {}
        eventSource = null;
    }
    manageSSEConnection('new_session', true);
    
    // Show welcome modal again
    showWelcomeModal();
}

/**
 * Auto-start conversation for new users coming from splash page
 */
async function autoStartConversation() {
    // Attempt to ensure we have a narrator name before deciding
    if (!getValidatedDisplayName(currentUserName)) {
        try {
            const prefName = await getUserPreference('narrator_name');
            const validated = getValidatedDisplayName(prefName);
            if (validated) currentUserName = validated;
        } catch (_) { /* ignore */ }
    }

    const hasValidName = !!getValidatedDisplayName(currentUserName);
    const hasMemories = Object.values(currentSession.memories).some(arr => arr.length > 0);
    const hasMessages = currentSession.messages.length > 0;
    const cameFromSplash = localStorage.getItem('story-collection-used') === 'true';
    const sessionMarker = localStorage.getItem('story_session_exists') === 'true';

    // Primary decision: use computed flag when available
    let decision;
    if (isNewUserFlag === true) {
        decision = 'new';
    } else if (isNewUserFlag === false) {
        decision = 'returning';
    } else {
        // Fallback heuristic if flag is unavailable
        const heuristicReturning = hasValidName || hasMemories || hasMessages || sessionMarker || !cameFromSplash;
        decision = heuristicReturning ? 'returning' : 'new';
    }

    console.log('[onboarding] autoStartConversation inputs:', {
        hasValidName,
        hasMemories,
        hasMessages,
        cameFromSplash,
        sessionMarker,
        memoryHydrated,
        bootstrapInProgress,
        isNewUserFlag,
        decision
    });

    if (decision === 'new') {
        console.log('[onboarding] New user detected, starting conversation automatically...');
        setTimeout(() => startInitialConversation(), 600);
        return;
    }

    // Returning user: optionally delay continuation until hydration completes
    const showContinuation = () => {
        console.log('[onboarding] Showing continuation prompt');
        showContinuationPrompt();
    };

    if (!memoryHydrated) {
        console.log('[onboarding] Delaying continuation prompt until memory hydration completes');
        let attempts = 0;
        const maxAttempts = 20; // ~6s total at 300ms interval
        const poll = () => {
            if (memoryHydrated || attempts >= maxAttempts) {
                showContinuation();
            } else {
                attempts += 1;
                setTimeout(poll, 300);
            }
        };
        poll();
    } else {
        showContinuation();
    }
}

// Show continuation prompt for returning users
function showContinuationPrompt() {
    const totalMemories = Object.values(currentSession.memories).reduce((sum, arr) => sum + arr.length, 0);

    // Create a continuation message
    const displayName = getValidatedDisplayName(currentUserName);
    let continuationPrompt = displayName
        ? `Hello ${displayName}, welcome back! I can see we've been collecting your memories together. `
        : "Welcome back! I can see we've been collecting your memories together. Could you remind me of your name? ";

    if (totalMemories > 0) {
        continuationPrompt += `So far, we've captured ${totalMemories} memories including `;

        const memoryTypes = [];
        if (currentSession.memories.people.length > 0) memoryTypes.push(`${currentSession.memories.people.length} people`);
        if (currentSession.memories.places.length > 0) memoryTypes.push(`${currentSession.memories.places.length} places`);
        if (currentSession.memories.events.length > 0) memoryTypes.push(`${currentSession.memories.events.length} events`);

        continuationPrompt += memoryTypes.join(', ') + ". ";
    }

    continuationPrompt += "Would you like to continue sharing more stories, or would you like to elaborate on something we've already discussed?";

    // Display the continuation message via standard chat pipeline
    addMessage('ai', 'collaborator', continuationPrompt, { timestamp: new Date().toLocaleTimeString() });
}

/**
 * Start the initial conversation with the Collaborator
 */
function startInitialConversation() {
    // Add initial collaborator message, personalized if we know the user's name
    const greeting = currentUserName && currentUserName.trim()
        ? `Hello ${currentUserName}! I'm so glad you're here to share your stories with me. I'm your Collaborator, and I'll be asking thoughtful questions to help you share your memories. Dandelion will be organizing everything we discuss.\n\nWould you like to continue from where we left off, or start a new story?`
        : `Hello! I'm so glad you're here to share your stories with me. I'm your Collaborator, and I'll be asking thoughtful questions to help you share your memories. Dandelion will be organizing everything we discuss.\n\nLet's start with something simple - could you tell me your name and where you grew up?`;
    addMessage('ai', 'collaborator', greeting, { timestamp: new Date().toLocaleTimeString() });
    
    // Mark that we've started the session
    localStorage.setItem('story_session_exists', 'true');
    
    console.log('✅ Initial conversation started successfully');
}

/**
 * Reset memory display
 */
function resetMemoryDisplay() {
    const categories = ['people', 'dates', 'places', 'relationships', 'events'];
    categories.forEach(category => {
        const container = document.getElementById(`memory-${category}`);
        if (container) {
            container.innerHTML = '<div class="memory-placeholder">No ' + category + ' mentioned yet</div>';
        }
    });
    updateMemoryStatus('Ready');
}

/**
 * Export session data
 */
function exportSession() {
    const sessionData = {
        timestamp: new Date().toISOString(),
        messages: currentSession.messages,
        memories: currentSession.memories,
        summary: generateSessionSummary()
    };
    
    const dataStr = JSON.stringify(sessionData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `story-session-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
}

/**
 * Generate session summary
 */
function generateSessionSummary() {
    const messageCount = currentSession.messages.length;
    const memoryCount = Object.values(currentSession.memories).reduce((sum, arr) => sum + arr.length, 0);
    
    return {
        totalMessages: messageCount,
        totalMemories: memoryCount,
        memoriesBreakdown: {
            people: currentSession.memories.people.length,
            dates: currentSession.memories.dates.length,
            places: currentSession.memories.places.length,
            relationships: currentSession.memories.relationships.length,
            events: currentSession.memories.events.length
        }
    };
}
