/* Globals */
// === Dandelion variables ===
const authCheckTimer=1*60*1000, // 5 minutes
    collaboratorBotTypes = ['avatar', 'personal-avatar', 'collaborator'],
    collectionTypes = { all: '', default: 'memory', memory: 'memory', journal: 'entry', },
    memoryKeeperBotTypes = ['biographer', 'personal-biographer', 'memory-keeper']
let activeBotId,
    collaboratorBot,
    memoryKeeperBot,
    Datamanager,
    Globals
// === Memory-Keeper variables ===
let botContainer,
    bootstrapInProgress=false,
    currentMemory={ // from Dandelion
        assistantType: '',
        complete: null,
        createdAt: null,
        keywords: new Set(),
        phaseOfLife: '',
        relationships: new Set(),
        summary: '',
        title: '',
        updatedAt: null,
        version: 1,
    },
    currentSession={
        collapsed: new Set(),
        messages: [],
        memories: {
            dates: new Set(),
            keywords: new Set(),
            people: new Set(),
            shares: new Set(),
        },
    },
    currentBotName='Personal Biographer',
    input,
    isTyping=false,
    logEntries=[],
    loggingModeEnabled=false,
    memoryDisplayVisible=true,
    memoryHydrated=false,
    memoryPrimerInjected=false,
    saveTimeout,
    sendBtn,
    sendInProgress=false, // Guard to prevent rapid double submissions
    sessionAutoSaveEnabled=true
// === Dandelion handlers ===
window.addEventListener('globals-ready', async ()=>{
    console.log('🎬 initializing app...')
    Globals = window.Globals
    Datamanager = Globals.datamanager
    window.Globals = null
    initializeListeners()
    console.log('🎬 event listeners initialized...')
    // show page
    if(document.getElementById('app-loader'))
        document.getElementById('app-loader').style.display = 'flex'
    document.body.hidden = false
    // loader
    bootstrapInProgress = true
    if(document.getElementById('app-loader'))
        document.getElementById('app-loader').style.display = 'flex'
    try {
        await bootstrapApp(Datamanager)
        setInterval(authCheck, authCheckTimer)
        console.log('🎬 app initialized...')
    } catch(e) {
        console.error('🚨 App Bootstrap failure', e)
        alert(`Sorry, something went wrong during startup. Please try refreshing the page. If the problem continues, contact support. Message: ${ e.message }`)
        return
        redirectToLogin()
    }
})
window.addEventListener('error', (e)=>{
    if(e.filename && ( // Suppress common browser extension errors that don't affect our app
        e.filename.includes('extension://') ||
        e.filename.includes('evmAsk.js') ||
        e.filename.includes('requestProvider.js') ||
        e.filename.includes('content.js')
    )){
        e.preventDefault()
        return false
    }
})
// === Memory-Keeper methods ===
function addMessage(type, agent, content, metadata={}){
    const messagesContainer = document.getElementById('chat-messages')
    if(!messagesContainer)
        return
    
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
    messagesContainer.scrollTop = messagesContainer.scrollHeight
    /* save conversation message */
    currentSession.messages.push({
        type,
        agent,
        content,
        timestamp: metadata.timestamp || new Date().toISOString()
    })
}
async function authCheck(){
    if(!await Datamanager?.authenticationStatus())
        redirectToLogin()
}
function batchAddMemoryItems(category, items) {
    const container = document.getElementById(`memory-${ category }`)
    if(!container || items.size === 0)
        return
    container.querySelector('.memory-placeholder')?.remove()
    console.log(`Batch adding ${ items.size } memory items to ${ category }`)
    const fragment = document.createDocumentFragment() // Create documentFragment for batched DOM operations
    Array.from(items).forEach(item=>{ // Convert Set to Array and create all elements in memory first
        const itemElement = createMemoryItemElement(category, item)
        if(itemElement)
            fragment.appendChild(itemElement)
    })
    container.appendChild(fragment)
}
async function bootstrapApp(Datamanager){
    /* 1. assign intelligences */
    const response = await Datamanager.bots()
    activeBotId = response?.activeBotId
    const bots = response?.bots ?? []
    collaboratorBot = bots.find(b => collaboratorBotTypes.includes(b.type))
    memoryKeeperBot = bots.find(b => memoryKeeperBotTypes.includes(b.type))
    if(!collaboratorBot || !memoryKeeperBot){
        alert('Error: Missing required assistive intelligences. Please contact support.')
        return
    }
    if(activeBotId !== memoryKeeperBot.id){
        console.log(`Switching active bot to memory-keeper (${memoryKeeperBot.id})`)
        const { bot_id, responses, success: activatedSuccess, version, versionUpdate, } = await Datamanager.botActivate(memoryKeeperBot.id)
    }
    /* 2. fetch memories */
    const responses = await Datamanager.collections(collectionTypes.memory)
    if(Array.isArray(responses) && responses.length)
        hydratePersistedMemories(responses)
    /* 3. update bot UI */
    botContainer = document.getElementById('memory-bot')
    if(botContainer){
        const name = memoryKeeperBot.name || currentBotName
        currentBotName = name
        createName(name)
    }
    initCollapsibleMemorySections()
    initMemoryCountsObserver()
    /* 4. signal completion */
    bootstrapInProgress = false
    document.getElementById('app-loader').style.display = 'none'
    window.dispatchEvent(new Event('app-bootstrap-complete'))
    /* 4. start conversation */
    const greeting = (!Array.isArray(responses) || !responses.length)
        ? responses[0]
        : await Datamanager.greetings(true)?.[0]?.message
            ?? "Hello! I'm your Memory Keeper. I'm here to help you remember and reflect on your life's moments. Feel free to share anything you'd like me to remember."
    addMessage('ai', 'collaborator', greeting, { timestamp: new Date().toLocaleTimeString() })
}
function createName(name){
    console.log(`Creating bot name display: ${ name }`, botContainer)
    botContainer.querySelector('.memory-placeholder')?.remove()
    let item = document.getElementById('narrator-item')
    const html = `
        <div class="memory-title">
            <div class="memory-detail">${ name?.length ? `Name: ${ escapeHtml(name) }` : 'Click to set your name' }</div>
        </div>
    `
    if(!item){
        item = document.createElement('div')
        item.id = 'narrator-item'
        item.className = 'memory-item narrator'
        botContainer.prepend(item)
        item.addEventListener('click', onBiographerClick)
    }
    item.innerHTML = html
}
function ensureMemorySection(category){ // Ensure a memory section exists for a given category; create dynamically if missing
    const containerId = `memory-${ category }`
    console.log(`Ensuring memory section for category: ${ category }`, containerId)
    if(document.getElementById(containerId))
        return
    const memoryContent = document.querySelector('.memory-content')
    if(!memoryContent)
        return
    /* create section */
    console.log(`Creating memory section for category: ${ category }`)
    const section = document.createElement('div')
    section.className = 'memory-section'
    const title = document.createElement('h4')
    title.textContent = category.charAt(0).toUpperCase() + category.slice(1)
    /* create items container */
    const itemsDiv = document.createElement('div')
    itemsDiv.className = 'memory-items'
    itemsDiv.id = containerId
    /* add placeholder */
    const placeholder = document.createElement('div')
    placeholder.className = 'memory-placeholder'
    placeholder.textContent = `No ${ category } mentioned yet`
    itemsDiv.appendChild(placeholder)
    /* append elements */
    section.appendChild(title)
    section.appendChild(itemsDiv)
    memoryContent.appendChild(section)
}
function escapeHtml(str){
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}
function hydratePersistedMemories(memories=[]){
    memories.forEach(memory=>{
        /* **note**: currently no *places*, *events*, literal *dates* */
        if(memory.phaseOfLife?.length)
            currentSession.memories.dates.add(memory.phaseOfLife)
        if(Array.isArray(memory.keywords) && memory.keywords.length)
            currentSession.memories.keywords.add(...memory.keywords)
        if(Array.isArray(memory.relationships) && memory.relationships.length)
            currentSession.memories.people.add(...memory.relationships)
        if(Array.isArray(memory.shares) && memory.shares.length)
            currentSession.memories.shares.add(...memory.shares)
    })
    console.log(`💾 Hydrated ${ memories.length } collections into session`, currentSession.memories)
    updateMemoryDisplay(currentSession.memories)
    memoryHydrated = true
}
function initializeListeners(){
    input = document.getElementById('chat-input')
    sendBtn = document.getElementById('send-btn')
    if(!input || !sendBtn)
        return
    input.addEventListener('keydown', function(e) {
        if(e.key === 'Enter' && !e.shiftKey && !e.repeat){
            e.preventDefault()
            sendMessage()
        }
    })
    sendBtn.addEventListener('click', sendMessage)
    document.getElementById('clear-log-btn')?.addEventListener('click', clearLog)
    document.getElementById('export-btn')?.addEventListener('click', exportSession)
    document.getElementById('export-log-btn')?.addEventListener('click', exportLog)
    document.getElementById('new-story-btn')?.addEventListener('click', startNewSession)
    // document.getElementById('start-story-btn')?.addEventListener('click', startStorySession)
}
function initCollapsibleMemorySections() {
    const sections = document.querySelectorAll('.memory-section')
    sections.forEach((section, index)=>{
        const header = section.querySelector('h4')
        const items = section.querySelector('.memory-items')
        if (!header || !items)
            return
        const key = items.id || `section-${ index }`
        if(key!=='memory-bot'){
            currentSession.collapsed.add(key) // Start collapsed except for Narrator
            section.classList.add('collapsed')
        }
        header.tabIndex = 0
        header.setAttribute('role', 'button')
        header.setAttribute('aria-expanded', String(!section.classList.contains('collapsed')))
        const toggle = ()=>{
            section.classList.toggle('collapsed')
            const collapsed = section.classList.contains('collapsed')
            header.setAttribute('aria-expanded', String(!collapsed))
            currentSession.collapsed[collapsed ? 'add' : 'delete'](key)
        }
        header.addEventListener('click', toggle)
    })
}
function initMemoryCountsObserver() {
    const content = document.querySelector('.memory-content')
    if(!content)
        return
    const debounced = (()=>{
        let t
        return ()=>{
            clearTimeout(t)
            t = setTimeout(updateMemorySectionCounts, 100)
        }
    })()
    const observer = new MutationObserver(debounced)
    observer.observe(content, { childList: true, subtree: true, attributes: true });
    // Initial compute
    updateMemorySectionCounts()
}
function messageId() {
    return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
async function onBiographerClick(){
    const proposed = prompt('What would you like my name to be?', currentBotName ?? 'Personal Biographer')
    await updateBotName(proposed)
}
async function processChat(message) {
    console.log('=== MEMORY KEEPER PROCESSING ===', message)
    updateMemoryStatus('Processing...')
    try {
        const requestBody = { 
            message,
            messageId: messageId()
        };
        
        // Log the input request
        addLogEntry('input', 'Memory Keeper', {
            action: 'extract_memories',
            input_message: message,
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
function redirectToLogin(){
    try {
        window.location.replace('index.html')
    } catch(e) {
        console.log('Replacing redirect failed, falling back to href', e)
        window.location.href = '/'
    }
}
async function sendMessage() {
    if(!input || !input.value.trim() || isTyping || sendInProgress)
        return
    const message = input.value.trim()
    // Add user message
    addMessage('user', 'user', message, { timestamp: new Date().toLocaleTimeString() })
    // Disable input while processing
    input.value = ''
    input.disabled = true
    sendBtn.disabled = true
    isTyping = true
    sendInProgress = true
    showTypingIndicator()
    try {
        await processChat(message)
    } catch (error) {
        console.error('Error processing message:', error)
        addMessage('ai', 'system', 
            "I'm sorry, I encountered an error processing your message. Please try again.",
            { timestamp: new Date().toLocaleTimeString() }
        )
        input.value = message
    } finally { // Re-enable input
        input.disabled = false
        sendBtn.disabled = false
        isTyping = false
        sendInProgress = false
        hideTypingIndicator()
        input.focus()
    }
}
function showTypingIndicator(){
    const indicator = document.getElementById('typing-indicator')
    if(!indicator)
        return
    indicator.style.display = 'flex'
    const messages = [
        'Processing your story...',
        'Extracting memories...',
        'Generating response...',
        'Almost ready...'
    ]
    let messageIndex = 0
    const messageElement = indicator.querySelector('.typing-message')
    // Update message every 800ms for perceived progress
    const messageInterval = setInterval(()=>{
        if (messageElement && messageIndex < messages.length - 1) {
            messageIndex++
            messageElement.textContent = messages[messageIndex]
        }
    }, 800)
    // Animate progress bar for visual feedback
    const progressBar = indicator.querySelector('#typing-progress-bar')
    let progress = 0
    const progressInterval = setInterval(() => {
        progress += Math.random() * 15 + 5 // Random progress increments for realistic feel
        if(progress > 85)
            progress = 85 // Cap at 85% until completion
        if(progressBar)
            progressBar.style.width = `${ progress }%`
    }, 200)
    // Store interval IDs for cleanup
    indicator.dataset.messageInterval = messageInterval
    indicator.dataset.progressInterval = progressInterval
    // Set initial message and progress
    if(messageElement)
        messageElement.textContent = messages[0]
    if(progressBar)
        progressBar.style.width = '10%'
}
async function updateBotName(name=currentBotName){
    if(!name || !name?.length || !/^[A-Za-z\s-]{1,30}$/.test(name)){
        alert(`Please enter a valid name (1-30 alphabetic characters, may include spaces and hyphens); ${ name } is invalid.`)
        return false
    }
    if(currentBotName!==name){
        const response = await Datamanager.botUpdate({ id: memoryKeeperBot.id, name, })
        console.log('Updated bot name response', response)
        currentBotName = name
        addMessage('system', 'system', `Name updated to ${ name }.`, { timestamp: new Date().toLocaleTimeString() })
    }
    return true
}
function updateMemoryDisplay(extractedMemories){
    Object.keys(extractedMemories)
        .forEach(category=>{
            const items = extractedMemories[category]
            if(items instanceof Set && items.size > 0){
                ensureMemorySection(category)
                batchAddMemoryItems(category, items)
            }
        })
}
function updateMemorySectionCounts() {
    const sections = document.querySelectorAll('.memory-section')
    sections.forEach((section)=>{
        const header = section.querySelector('h4')
        const itemsContainer = section.querySelector('.memory-items')
        if(!header || !itemsContainer)
            return
        if(!header.dataset.baseTitle) // Persist original title once
            header.dataset.baseTitle = header.textContent.trim().replace(/\s*\(\d+\)$/, '')
        if(itemsContainer.id === 'memory-bot'){ // For Narrator section, never append a count
            header.textContent = header.dataset.baseTitle
            return
        }
        const count = Array.from(itemsContainer.children) // Count memory items (exclude placeholders)
            .filter(el => el.classList && el.classList.contains('memory-item'))
            .length
        header.textContent = `${ header.dataset.baseTitle } (${ count })`
    })
}
function updateMemoryStatus(status) {
    const statusElement = document.getElementById('memory-status')
    if(statusElement){
        statusElement.textContent = status
        statusElement.className = 'memory-status'
        if(status.toLowerCase().includes('processing'))
            statusElement.classList.add('processing')
        else if (status.toLowerCase().includes('complete'))
            statusElement.classList.add('complete')
        else if (status.toLowerCase().includes('error'))
            statusElement.classList.add('error')
    }
    // Check if we have any memories and update status accordingly
    const hasMemories = Object.values(currentSession.memories)
        .some(arr => arr.length > 0)
    if(hasMemories && status.toLowerCase() === 'ready')
        updateMemoryStatus('Memories Collected')
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
// Small helper to enforce client-side timeouts for fetch with Firebase auth
async function fetchWithTimeout(resource, options={}) {
    const { timeout=20000, ...rest } = options
    const timeoutPromise = new Promise((_, reject)=>{
        const id = setTimeout(() => reject(new Error('Request timed out')), timeout)
        timeoutPromise.cleanup = () => clearTimeout(id)
    })
    try {
        const response = await Promise.race([fetch(resource, rest), timeoutPromise])
        return response
    } finally {
        if(timeoutPromise.cleanup)
            timeoutPromise.cleanup()
    }
}
/**
 * Initialize toggle switches
 */
function initializeToggles() {
    const memoryToggle = document.getElementById('memory-display-toggle')
    const loggingToggle = document.getElementById('logging-mode-toggle')
    
    // Memory Keeper toggle is now hidden, so always show memory display
    memoryDisplayVisible = true
    
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
    currentSession = {
        messages: [],
        memories: {
            people: [],
            dates: [],
            places: [],
            relationships: [],
            events: []
        }
    }
    // Clear UI
    const messagesContainer = document.getElementById('chat-messages');
    if (messagesContainer) {
        messagesContainer.innerHTML = '';
    }
    // Reset memory display
    resetMemoryDisplay()
    // cleanup
    memoryHydrated = false
    memoryPrimerInjected = false
    showWelcomeModal()
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
