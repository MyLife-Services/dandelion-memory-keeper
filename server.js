const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { EventEmitter } = require('events');
const multer = require('multer');
const fs = require('fs').promises;
const OpenAI = require('openai');
const { File } = require('node:buffer');
require('dotenv').config();
const { executeTool } = require('./server/tools');
const memoryStore = require('./server/storage/database');
const db = require('./server/database');
const ragService = require('./server/tools/ragService');
const { verifyFirebaseToken, optionalAuth, ensureUserScope, initializeFirebaseAdmin } = require('./server/middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Render/Proxy headers so express-rate-limit can read client IPs correctly
// Fixes: ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
app.set('trust proxy', 1);

// Initialize Anthropic client
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

// Initialize OpenAI client for Whisper transcription (optional)
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
}) : null;

// Voice feature toggles & simple circuit breaker
let voiceEnabled = (process.env.VOICE_ENABLED !== 'false') && !!process.env.OPENAI_API_KEY;
let voiceConsecutive429 = 0;
let voiceDownUntil = 0; // epoch ms when breaker auto-resets
const VOICE_MAX_CONSECUTIVE_429 = parseInt(process.env.VOICE_MAX_CONSECUTIVE_429 || '3', 10);
const VOICE_COOLDOWN_MS = parseInt(process.env.VOICE_COOLDOWN_MS || `${15 * 60 * 1000}`, 10); // default 15 minutes

function isVoiceTemporarilyDown() {
    if (!voiceEnabled) return true;
    if (voiceDownUntil && Date.now() < voiceDownUntil) return true;
    return false;
}

function registerVoiceSuccess() {
    voiceConsecutive429 = 0;
    voiceDownUntil = 0;
}

function registerVoice429() {
    voiceConsecutive429 += 1;
    if (voiceConsecutive429 >= VOICE_MAX_CONSECUTIVE_429) {
        voiceDownUntil = Date.now() + VOICE_COOLDOWN_MS;
        console.warn(`🔇 Voice circuit breaker tripped for ${VOICE_COOLDOWN_MS / 1000}s due to repeated 429s`);
    }
}

// Configure multer for audio file uploads (store in /tmp)
const upload = multer({
    dest: '/tmp/',
    limits: {
        fileSize: 25 * 1024 * 1024, // 25MB max (Whisper limit)
    },
    fileFilter: (req, file, cb) => {
        // Accept audio files
        if (file.mimetype.startsWith('audio/') || file.mimetype === 'video/webm') {
            cb(null, true);
        } else {
            cb(new Error('Only audio files are allowed'));
        }
    }
});

// Clear memories for authenticated user (optionally scoped to a conversation)
// Only enabled in non-production OR when explicitly allowed via ENABLE_MEMORY_DELETE=true
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_MEMORY_DELETE === 'true') {
    app.delete('/api/memories', verifyFirebaseToken, ensureUserScope, async (req, res) => {
        try {
            // Defense-in-depth: re-check at runtime
            if (process.env.NODE_ENV === 'production' && process.env.ENABLE_MEMORY_DELETE !== 'true') {
                return res.status(403).json({ error: 'Memory deletion is disabled' });
            }

            const { conversationId } = req.query || {};
            const ipAddress = req.ip;
            const userAgent = req.get('User-Agent');

            if (conversationId && typeof conversationId === 'string') {
                const ok = await memoryStore.clearConversation(conversationId, req.userId, ipAddress, userAgent);
                return res.json({ success: true, scope: 'conversation', conversationId, deleted: ok ? 'some' : 0 });
            }

            const result = await memoryStore.clearAllMemories(req.userId, ipAddress, userAgent);
            return res.json({ success: true, scope: 'all', deleted: result.deleted });
        } catch (error) {
            console.error('Error clearing memories:', error);
            res.status(500).json({ error: 'Failed to clear memories' });
        }
    });
} else {
    console.log('DELETE /api/memories endpoint is disabled (production without ENABLE_MEMORY_DELETE=true)');
}

// List memories for a conversation (requires authentication)
app.get('/api/memories', verifyFirebaseToken, ensureUserScope, async (req, res) => {
    try {
        const { conversationId = 'default' } = req.query || {};
        const ipAddress = req.ip;
        const userAgent = req.get('User-Agent');
        
        const memories = await memoryStore.listMemories(conversationId, req.userId, ipAddress, userAgent);
        res.json({ conversationId, count: memories.length, memories });
    } catch (error) {
        console.error('Error listing memories:', error);
        res.status(500).json({ error: 'Failed to retrieve memories' });
    }
});

// Get a single memory by id (requires authentication)
app.get('/api/memories/:id', verifyFirebaseToken, ensureUserScope, async (req, res) => {
    try {
        const { conversationId = 'default' } = req.query || {};
        const { id } = req.params;
        const ipAddress = req.ip;
        const userAgent = req.get('User-Agent');
        
        const memory = await memoryStore.getMemory(conversationId, id, req.userId, ipAddress, userAgent);
        if (!memory) return res.status(404).json({ error: 'Memory not found' });
        res.json(memory);
    } catch (error) {
        console.error('Error getting memory:', error);
        res.status(500).json({ error: 'Failed to retrieve memory' });
    }
});


// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            // No inline scripts permitted; all scripts must be from self or allowed origins
            scriptSrc: ["'self'", "https://www.gstatic.com"],
            // Keep 'unsafe-inline' for styles only if needed; fonts CSS allowed
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            // Allow data and https images, plus blob for potential generated assets
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            // Allow required API endpoints and Firebase services
            connectSrc: [
                "'self'",
                "https://api.anthropic.com",
                "https://identitytoolkit.googleapis.com",
                "https://securetoken.googleapis.com",
                "https://www.googleapis.com",
                "https://firebasestorage.googleapis.com"
            ],
            // Permit audio/video from self and blob: for MediaRecorder/Audio playback
            mediaSrc: ["'self'", "blob:"],
            // Backward compat: some browsers still honor audio-src separately
            audioSrc: ["'self'", "blob:"],
            // Permit web workers created from blob URLs if ever needed
            workerSrc: ["'self'", "blob:"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: []
        }
    }
}));

// Permissions-Policy: explicitly allow microphone on self (recording)
app.use((req, res, next) => {
    try {
        res.setHeader('Permissions-Policy', 'microphone=(self)');
    } catch (_) {}
    next();
});

// CORS: use env override, else allow localhost and *.onrender.com (demo)
const corsOriginsEnv = process.env.CORS_ORIGIN;
const corsAllow = corsOriginsEnv
  ? corsOriginsEnv.split(',').map(s => s.trim()).filter(Boolean)
  : [/^https?:\/\/localhost(?::\d+)?$/, /^https?:\/\/127\.0\.0\.1(?::\d+)?$/, /\.onrender\.com$/];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true); // allow same-origin/non-browser
        const allowed = corsAllow.some(rule => {
            if (rule instanceof RegExp) return rule.test(origin);
            return rule === origin;
        });
        return allowed ? callback(null, true) : callback(new Error('CORS not allowed'), false);
    },
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Stricter rate limits for expensive voice endpoints
const ttsLimiter = rateLimit({
    windowMs: parseInt(process.env.TTS_RATE_WINDOW_MS) || 60 * 1000,
    max: parseInt(process.env.TTS_RATE_MAX) || 10,
    message: 'Too many TTS requests, please slow down.'
});
const transcribeLimiter = rateLimit({
    windowMs: parseInt(process.env.TRANSCRIBE_RATE_WINDOW_MS) || 60 * 1000,
    max: parseInt(process.env.TRANSCRIBE_RATE_MAX) || 10,
    message: 'Too many transcription requests, please slow down.'
});

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Expose non-sensitive environment variables to the client
// Only Firebase client config is sent to the browser
app.get('/env.js', (req, res) => {
    res.type('application/javascript');
    const env = {
        FIREBASE_API_KEY: process.env.FIREBASE_API_KEY || '',
        FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN || '',
        FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || '',
        FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET || '',
        FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
        FIREBASE_APP_ID: process.env.FIREBASE_APP_ID || ''
    };
    if (process.env.FIREBASE_MEASUREMENT_ID) {
        env.FIREBASE_MEASUREMENT_ID = process.env.FIREBASE_MEASUREMENT_ID;
    }
    res.send(`window.ENV = ${JSON.stringify(env)};`);
});

// === User Preferences API ===
// Get a specific preference by key
app.get('/api/user/preferences/:key', verifyFirebaseToken, ensureUserScope, async (req, res) => {
    try {
        const { key } = req.params;
        console.log(`🔍 Getting preference: key=${key}, uid=${req.user.uid}, email=${req.user.email}`);
        const value = await db.getUserPreference(req.user.uid, req.user.email, key);
        console.log(`🔍 Retrieved preference: ${key} = ${value}`);
        res.json({ key, value });
    } catch (error) {
        console.error('❌ Error getting user preference:', error);
        res.status(500).json({ error: 'Failed to get user preference' });
    }
});

// Set/Update a specific preference by key
app.put('/api/user/preferences/:key', verifyFirebaseToken, ensureUserScope, async (req, res) => {
    try {
        const { key } = req.params;
        const value = req.body?.value;
        console.log(`💾 Setting preference: key=${key}, value=${value}, uid=${req.user.uid}, email=${req.user.email}`);
        await db.setUserPreference(req.user.uid, req.user.email, key, value);
        console.log(`✅ Successfully set preference: ${key}`);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Error setting user preference:', error);
        res.status(500).json({ error: 'Failed to set user preference' });
    }
});

// Serve static files
app.use(express.static('.'));

// In-memory pub/sub for SSE events (demo only)
// Map<conversationId, EventEmitter>
const channels = new Map();
// Track active connections per user to prevent duplicates
const activeConnections = new Map(); // userId -> Set<connectionId>

function getChannel(conversationId) {
    if (!channels.has(conversationId)) {
        const emitter = new EventEmitter();
        emitter.setMaxListeners(50); // Increase limit to prevent warnings during rapid reconnects
        channels.set(conversationId, emitter);
    }
    return channels.get(conversationId);
}

// Helper to write SSE event
function sseWrite(res, event, data) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// Utility to enforce timeouts on async operations
function withTimeout(promise, ms, message) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(message || `Timeout after ${ms}ms`)), ms))
    ]);
}

// System prompts for agents
const COLLABORATOR_SYSTEM_PROMPT = `You are a gentle, empathetic Collaborator helping elderly people preserve their life stories and family memories. You embody the warmth and patience of a caring family member or trusted friend who genuinely wants to help preserve precious memories.

CORE APPROACH:
- Show genuine interest and emotional warmth in every response
- Validate memories and feelings ("That must have been incredibly difficult")
- Ask for clarification gently ("Let me make sure I have this right...")
- Connect current stories to broader family patterns and history
- Acknowledge both joyful and painful memories with appropriate sensitivity

CONVERSATION TECHNIQUES:
1. **Memory Validation**: Repeat back key details to confirm accuracy and show you're listening
2. **Gentle Probing**: Ask follow-up questions that help unlock related memories ("Sometimes talking about one person helps us remember others")
3. **Emotional Acknowledgment**: Recognize grief, joy, pride, and other emotions explicitly
4. **Contextual Bridging**: Connect current stories to family tree, health patterns, or historical context
5. **Sensory Encouragement**: Ask about sounds, smells, feelings that bring memories to life
6. **Privacy Sensitivity**: Acknowledge when health or sensitive information comes up and explain how it will be handled

STYLE CONSTRAINTS:
- Do NOT include stage directions, bracketed actions, or asterisk-wrapped actions (e.g., *leans in*, [smiles], (gentle tone)).
- Convey empathy and warmth through word choice and phrasing, not through meta narration.
- Use plain text sentences. Avoid emojis unless the user uses them first.

RESPONSE STRUCTURE:
- Start with emotional connection or validation
- Confirm/clarify key details you heard
- Ask 1-2 thoughtful follow-up questions
- End with encouragement or connection to broader story

TONE GUIDELINES:
- Use their name frequently and warmly
- Speak as if you have all the time in the world
- Show genuine curiosity about their experiences
- Be patient with memory gaps or confusion
- Celebrate when memories come flooding back
- Acknowledge the importance of preserving these stories for grandchildren

RESPONSE FORMAT RULES:
- Write directly to the user in a natural, conversational voice.
- No stage directions, sound effects, or screenplay-style cues.
- Keep paragraphs short (1-3 sentences) to aid readability.

THERAPEUTIC AWARENESS:
- Recognize signs of fatigue or emotional overwhelm
- Offer options for what to work on ("What feels right for you today?")
- Validate concerns about memory ("I'll help you keep all the details straight")
- Maintain hope and purpose about the storytelling project

Remember: You're not just collecting information - you're helping someone celebrate and preserve a lifetime of experiences for future generations.`;

const MEMORY_KEEPER_SYSTEM_PROMPT = `You are a Memory Keeper agent that extracts and organizes structured information from elderly storytelling conversations. You work alongside the Collaborator to preserve family histories with exceptional attention to detail, privacy, and generational patterns.

EXTRACTION CATEGORIES:
1. **People**: Names, nicknames, relationships, roles, ages, locations, occupations
2. **Dates**: Years, decades, ages, time periods, seasons, life events timing
3. **Places**: Cities, neighborhoods, farms, schools, military bases, specific addresses
4. **Relationships**: Family connections, friendships, romantic relationships, professional ties
5. **Events**: Births, deaths, marriages, military service, moves, jobs, celebrations

SPECIAL HANDLING:
- **Health Information**: Flag all medical conditions, mental health issues, causes of death, occupational hazards, family patterns
- **Military Service**: Note branches, locations, dates, conflicts, impacts
- **Occupational Details**: Jobs, working conditions, health impacts, economic context
- **Family Patterns**: Identify recurring health issues, personality traits, or life patterns across generations

PRIVACY PROTOCOLS:
- Separate sensitive health information from general family data
- Flag information that might need family consent before sharing
- Note generational health patterns for medical family history
- Distinguish between confirmed facts and uncertain memories

EXTRACTION GUIDELINES:
- Extract ALL people mentioned, even in passing or as context
- INFER relationships from conversational clues and family context
- Build comprehensive family trees from fragments of information
- Connect new people to existing family members when relationships are implied
- Preserve exact names, spellings, and details as shared
- Note approximate dates when exact dates aren't provided
- Capture relationship dynamics and emotional context
- Include occupations, military service, and life achievements
- Record geographic movements and significant locations

RELATIONSHIP INFERENCE RULES:
- If someone is mentioned as "[Person A]'s son/daughter", extract both the child AND the parent-child relationship
- If aunts/uncles are mentioned, infer they are siblings of one of the narrator's parents
- If cousins are mentioned, connect them to their parents (aunts/uncles) and establish cousin relationship to narrator
- Build multi-generational family connections from scattered mentions
- When someone takes children to events, infer caregiver/family relationships
- Extract implied family roles and connections even if not explicitly stated

EXTRACTION EXAMPLES:
If someone says: "My aunt Debra used to take my cousin Marcus (Sandy's son) to the parade"
Extract:
- People: Marcus (Sandy's son, narrator's cousin), Debra (aunt), Sandy (aunt, Marcus's mother)
- Relationships: Debra-narrator (aunt-nephew/niece), Marcus-narrator (cousins), Sandy-Marcus (mother-son), Sandy-narrator (aunt-nephew/niece), Debra-Sandy (sisters or sisters-in-law)
- Events: Parade attendance with family members

REMEMBER: Be thorough and inferential. Extract every person mentioned and build complete relationship webs from conversational fragments.

JSON OUTPUT STRUCTURE - You MUST respond with ONLY valid JSON, no other text:
{
  "people": ["name with relationship and key details"],
  "dates": ["specific years, decades, or time periods mentioned"],
  "places": ["specific locations with context"],
  "relationships": ["nature of connections between people"],
  "events": ["significant life events with context"]
}

QUALITY STANDARDS:
- Preserve exact names, nicknames, and titles as spoken
- Maintain emotional context around events
- Note sensory details that make memories vivid
- Respect the storyteller's perspective and voice

Remember: You're preserving family legacy with the same care and attention the family would want for their most precious memories.`;

// Allowed model whitelist and sanitizer
const ALLOWED_MODELS = [
    'claude-3-5-haiku-latest',
    'claude-3-5-haiku-20241022',
    'claude-3-5-sonnet-latest'
];

function sanitizeModel(requested, fallback) {
    const fb = fallback || 'claude-3-5-haiku-latest';
    if (!requested || typeof requested !== 'string') return fb;
    return ALLOWED_MODELS.includes(requested) ? requested : fb;
}

// API Routes

// === SSE: Stream collaborator + background memory extraction ===
app.post('/chat', verifyFirebaseToken, ensureUserScope, async (req, res) => {
    // Headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    const { text, conversationId = 'default', messageId = Date.now().toString() } = req.body || {};
    // Scope conversation to authenticated user
    const userConversationId = `${req.userId}_${conversationId}`;
    const COLLABORATOR_MODEL = process.env.COLLABORATOR_MODEL || 'claude-3-5-haiku-latest';
    const MEMORY_MODEL = process.env.MEMORY_MODEL || COLLABORATOR_MODEL;

    if (!text || typeof text !== 'string') {
        sseWrite(res, 'error', { code: 'bad_request', message: 'text is required' });
        return res.end();
    }

    // Security: Limit message length to prevent DoS attacks
    const MAX_MESSAGE_LENGTH = parseInt(process.env.MAX_MESSAGE_LENGTH) || 5000;
    if (text.length > MAX_MESSAGE_LENGTH) {
        sseWrite(res, 'error', { 
            code: 'message_too_long', 
            message: `Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters allowed.` 
        });
        return res.end();
    }

    // Start background memory extraction (non-blocking)
    (async () => {
        try {
            const payload = await withTimeout(
                executeTool('memory_extractor', {
                    message: text,
                    model: MEMORY_MODEL,
                    maxTokens: 300
                }, { anthropic }),
                20000,
                'Anthropic memory extraction timeout'
            ).catch(() => ({ people: [], dates: [], places: [], relationships: [], events: [] }));
            const chan = getChannel(userConversationId);
            // Persist only if non-empty
            const saved = await memoryStore.saveMemory({ 
                conversationId, 
                messageId, 
                payload, 
                userId: req.userId,
                userEmail: req.user?.email,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent')
            });
            chan.emit('memory', { messageId, ...payload, id: saved?.id || null });
        } catch (err) {
            const chan = getChannel(userConversationId);
            chan.emit('memory', { messageId, error: 'memory_extraction_failed' });
        }
    })();

    // Stream collaborator response
    try {
        const collabResp = await withTimeout(anthropic.messages.create({
            model: COLLABORATOR_MODEL,
            max_tokens: 300,
            system: COLLABORATOR_SYSTEM_PROMPT,
            messages: [
                { role: 'user', content: text }
            ]
        }), 20000, 'Anthropic collaborator timeout');

        const fullText = collabResp.content?.[0]?.text || '';
        // Tokenize rudimentarily for demo streaming if SDK streaming isn't used
        const parts = fullText.split(/(\s+)/);
        for (const p of parts) {
            sseWrite(res, 'token', { text: p });
        }
        sseWrite(res, 'done', { messageId });
        res.end();
    } catch (error) {
        sseWrite(res, 'error', { code: 'upstream_error', message: process.env.NODE_ENV === 'development' ? error.message : 'failed' });
        res.end();
    }
});

// SSE channel for memory updates with connection deduplication
app.get('/events', async (req, res) => {
    const { conversationId = 'default', token } = req.query;
    
    // Handle token-based auth for SSE (since EventSource doesn't support custom headers)
    let userId = null;
    if (token) {
        try {
            const admin = require('firebase-admin');
            // Ensure admin app is initialized (shared initializer)
            const firebaseApp = initializeFirebaseAdmin();
            if (!firebaseApp) {
                console.error('SSE auth error: Firebase Admin not initialized');
                return res.status(500).json({ error: 'Auth service unavailable' });
            }
            const decodedToken = await admin.auth(firebaseApp).verifyIdToken(token);
            userId = decodedToken.uid;
            if (!userId) {
                return res.status(401).json({ error: 'Invalid token' });
            }
        } catch (error) {
            console.error('SSE token verification failed:', error);
            return res.status(401).json({ error: 'Invalid token' });
        }
    }
    
    if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Generate unique connection ID for this SSE connection
    const connectionId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    // Track active connections per user for monitoring
    if (!activeConnections.has(userId)) {
        activeConnections.set(userId, new Set());
    }
    const userConnections = activeConnections.get(userId);
    
    // Log if user has many connections (potential issue)
    if (userConnections.size > 5) {
        console.warn(`⚠️ User ${userId} has ${userConnections.size} active SSE connections - potential connection leak`);
    }
    
    userConnections.add(connectionId);
    
    // Scope conversation to authenticated user
    const userConversationId = `${userId}_${conversationId}`;
    console.log(`📡 SSE connected for user=${userId}, conversation=${conversationId}, connection=${connectionId} (total: ${userConnections.size})`);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    const chan = getChannel(userConversationId);
    const onMemory = (data) => sseWrite(res, 'memory', data);
    chan.on('memory', onMemory);

    // Heartbeat to keep connection alive
    const hb = setInterval(() => {
        try {
            res.write(': heartbeat\n\n');
        } catch (e) {
            // Connection closed, cleanup will happen in close handler
            clearInterval(hb);
        }
    }, 15000);

    // Cleanup on connection close
    const cleanup = () => {
        clearInterval(hb);
        chan.off('memory', onMemory);
        userConnections.delete(connectionId);
        if (userConnections.size === 0) {
            activeConnections.delete(userId);
        }
        console.log(`📡 SSE disconnected for user=${userId}, connection=${connectionId} (remaining: ${userConnections.size})`);
        try { res.end(); } catch (_) {}
    };

    req.on('close', cleanup);
    req.on('error', cleanup);
});

// Lightweight healthcheck for Render
app.get('/healthz', (req, res) => {
    res.status(200).json({ ok: true, ts: Date.now() });
});

// Warming endpoint to prevent cold starts
app.get('/warm', async (req, res) => {
    try {
        // Quick Anthropic API test to warm the connection
        const response = await withTimeout(anthropic.messages.create({
            model: 'claude-3-5-haiku-latest',
            max_tokens: 5,
            messages: [{ role: 'user', content: 'Hi' }]
        }), 5000, 'Warm timeout');
        
        res.json({ 
            status: 'warm', 
            timestamp: new Date().toISOString(),
            tokens: response.usage?.output_tokens || 0
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: 'Warming failed',
            timestamp: new Date().toISOString()
        });
    }
});

// Collaborator agent endpoint
app.post('/api/collaborator', verifyFirebaseToken, ensureUserScope, async (req, res) => {
    try {
        const { message, conversationHistory = [], model } = req.body;

        if (!message || typeof message !== 'string') {
            return res.status(400).json({ error: 'Message is required and must be a string' });
        }

        // Security: Limit message length to prevent DoS attacks
        const MAX_MESSAGE_LENGTH = parseInt(process.env.MAX_MESSAGE_LENGTH) || 5000;
        if (message.length > MAX_MESSAGE_LENGTH) {
            return res.status(400).json({ 
                error: 'Message too long', 
                message: `Maximum ${MAX_MESSAGE_LENGTH} characters allowed` 
            });
        }

        // Build conversation context
        const messages = [
            ...conversationHistory.slice(-4), // Keep last 4 messages for context (smaller prompt)
            {
                role: 'user',
                content: message
            }
        ];

        const effectiveModel = sanitizeModel(model, process.env.COLLABORATOR_MODEL || 'claude-3-5-haiku-latest');
        const response = await withTimeout(anthropic.messages.create({
            model: effectiveModel,
            max_tokens: 300,
            system: COLLABORATOR_SYSTEM_PROMPT,
            messages: messages
        }), 20000, 'Anthropic collaborator timeout');

        const collaboratorResponse = response.content[0].text;

        res.json({
            response: collaboratorResponse,
            agent: 'collaborator',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Collaborator API Error:', error);
        res.status(500).json({ 
            error: 'Failed to generate collaborator response',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Memory Keeper agent endpoint
app.post('/api/memory-keeper', verifyFirebaseToken, ensureUserScope, async (req, res) => {
    try {
        const { message, model, conversationId = 'default', messageId } = req.body;
        // Scope conversation to authenticated user
        const userConversationId = `${req.userId}_${conversationId}`;

        console.log('=== MEMORY KEEPER DEBUG ===');
        console.log('Input message:', message);
        console.log('Model:', model);
        console.log('API Key configured:', !!process.env.ANTHROPIC_API_KEY);

        if (!message || typeof message !== 'string') {
            return res.status(400).json({ error: 'Message is required and must be a string' });
        }

        // Security: Limit message length to prevent DoS attacks
        const MAX_MESSAGE_LENGTH = parseInt(process.env.MAX_MESSAGE_LENGTH) || 5000;
        if (message.length > MAX_MESSAGE_LENGTH) {
            return res.status(400).json({ 
                error: 'Message too long', 
                message: `Maximum ${MAX_MESSAGE_LENGTH} characters allowed` 
            });
        }

        const effectiveModel = sanitizeModel(model, process.env.MEMORY_MODEL || 'claude-3-5-haiku-latest');
        const extractedMemories = await withTimeout(
            executeTool('memory_extractor', {
                message,
                model: effectiveModel,
                maxTokens: 300
            }, { anthropic }),
            20000,
            'Anthropic memory keeper timeout'
        ).catch(() => ({ narrator: '', people: [], dates: [], places: [], relationships: [], events: [] }));

        // Save if non-empty and return saved id
        const saved = await memoryStore.saveMemory({ 
            conversationId, 
            messageId, 
            payload: extractedMemories,
            userId: req.userId,
            userEmail: req.user?.email,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        // Emit SSE event so connected clients receive updates even when using REST flow
        try {
            const chan = getChannel(userConversationId);
            chan.emit('memory', { messageId, ...extractedMemories, id: saved?.id || null });
        } catch (e) {
            // Non-fatal
            console.warn('SSE emit failed:', e.message);
        }

        res.json({
            memories: extractedMemories,
            id: saved?.id || null,
            agent: 'memory-keeper',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Memory Keeper API Error:', error);
        res.status(500).json({ 
            error: 'Failed to extract memories',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Text-to-speech endpoint (OpenAI TTS)
app.post('/api/tts', ttsLimiter, verifyFirebaseToken, ensureUserScope, async (req, res) => {
    try {
        // Check if voice is enabled and not in cooldown
        if (isVoiceTemporarilyDown()) {
            return res.status(503).json({
                error: 'Voice features temporarily unavailable',
                message: voiceEnabled
                    ? 'Temporarily disabled due to repeated quota errors. Please try again later.'
                    : 'Voice is disabled by configuration or missing API key.'
            });
        }

        // Check if OpenAI is configured
        if (!openai) {
            return res.status(503).json({
                error: 'Text-to-speech is not available. OpenAI API key not configured.'
            });
        }

        const { text, voice = 'nova', speed = 0.9 } = req.body;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: 'No text provided' });
        }

        // Limit text length (TTS has 4096 character limit)
        const maxLength = 4096;
        const truncatedText = text.length > maxLength
            ? text.substring(0, maxLength) + '...'
            : text;

        console.log(`🔊 Generating TTS for ${truncatedText.length} characters with voice: ${voice}`);

        // Generate speech with OpenAI TTS
        const mp3Response = await openai.audio.speech.create({
            model: 'tts-1', // Use tts-1-hd for higher quality if needed
            voice: voice, // Options: alloy, echo, fable, onyx, nova, shimmer
            input: truncatedText,
            speed: speed, // 0.25 to 4.0, default 1.0
            response_format: 'mp3'
        });

        // Convert response to buffer
        const buffer = Buffer.from(await mp3Response.arrayBuffer());

        console.log(`✅ TTS generated successfully (${buffer.length} bytes)`);
        registerVoiceSuccess();

        // Send audio as response
        res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Length': buffer.length,
            'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
        });
        res.send(buffer);

    } catch (error) {
        console.error('TTS error:', error);

        // Handle specific OpenAI errors
        const code = error?.code || error?.error?.code || error?.type;
        const status = error?.status || error?.response?.status;
        if (code === 'invalid_api_key') {
            return res.status(500).json({
                error: 'Text-to-speech service is not configured'
            });
        }

        // Handle quota exceeded errors (various shapes)
        if (code === 'insufficient_quota' || status === 429) {
            registerVoice429();
            return res.status(503).json({
                error: 'Voice features temporarily unavailable',
                message: 'OpenAI API quota exceeded. Please try again later or contact support.'
            });
        }

        res.status(500).json({
            error: 'Failed to generate speech',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Voice transcription endpoint (Whisper API)
app.post('/api/transcribe', transcribeLimiter, verifyFirebaseToken, ensureUserScope, upload.single('audio'), async (req, res) => {
    let audioFilePath = null;

    try {
        // Check if voice is enabled and not in cooldown
        if (isVoiceTemporarilyDown()) {
            return res.status(503).json({
                error: 'Voice features temporarily unavailable',
                message: voiceEnabled
                    ? 'Temporarily disabled due to repeated quota errors. Please try again later.'
                    : 'Voice is disabled by configuration or missing API key.'
            });
        }

        // Check if OpenAI is configured
        if (!openai) {
            return res.status(503).json({
                error: 'Voice transcription is not available. OpenAI API key not configured.'
            });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No audio file provided' });
        }

        audioFilePath = req.file.path;
        const { mimetype, originalname, size } = req.file;
        console.log(`🎤 Transcribing audio file: ${audioFilePath} (${size} bytes) mime=${mimetype} name=${originalname}`);

        // Check file size (Whisper has 25MB limit)
        if (req.file.size > 25 * 1024 * 1024) {
            return res.status(400).json({
                error: 'Audio file too large. Maximum size is 25MB.'
            });
        }

        // Determine extension for supported formats
        const mimeToExt = (mt) => {
            if (!mt) return null;
            if (mt.includes('webm')) return 'webm';
            if (mt.includes('ogg')) return 'ogg';
            if (mt.includes('oga')) return 'oga';
            if (mt.includes('mp4')) return 'mp4';
            if (mt.includes('mpeg') || mt.includes('mpga') || mt.includes('mp3')) return 'mp3';
            if (mt.includes('wav')) return 'wav';
            if (mt.includes('m4a') || mt.includes('mp4a')) return 'm4a';
            if (mt.includes('flac')) return 'flac';
            return null;
        };

        let ext = mimeToExt(mimetype);
        if (!ext) {
            // Try to infer from original filename
            const m = (originalname || '').match(/\.([A-Za-z0-9]+)$/);
            if (m) ext = m[1].toLowerCase();
        }
        if (!ext) {
            return res.status(400).json({ error: 'Unsupported or unknown audio format' });
        }

        // Read temp file and wrap as a Web File with proper name and type
        const fileBuffer = await fs.readFile(audioFilePath);
        const webFile = new File([fileBuffer], `upload.${ext}`, { type: mimetype || 'application/octet-stream' });

        // Transcribe with OpenAI Whisper using a proper File object
        const transcription = await openai.audio.transcriptions.create({
            file: webFile,
            model: 'whisper-1',
            language: 'en', // Can be made dynamic based on user preference
            response_format: 'json'
        });

        const transcript = transcription.text;

        if (!transcript || transcript.trim().length === 0) {
            return res.json({
                transcript: '',
                warning: 'No speech detected in audio'
            });
        }

        console.log(`✅ Transcription successful: "${transcript.substring(0, 100)}..."`);
        registerVoiceSuccess();

        res.json({
            transcript: transcript.trim(),
            duration: req.file.size / (16000 * 2), // Rough estimate (16kHz, 16-bit audio)
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Transcription error:', error);

        // Handle specific OpenAI errors
        const code = error?.code || error?.error?.code || error?.type;
        const status = error?.status || error?.response?.status;
        if (code === 'invalid_api_key') {
            return res.status(500).json({
                error: 'Speech recognition service is not configured'
            });
        }

        // Handle quota exceeded errors (various shapes)
        if (code === 'insufficient_quota' || status === 429) {
            registerVoice429();
            return res.status(503).json({
                error: 'Voice features temporarily unavailable',
                message: 'OpenAI API quota exceeded. Please try again later or contact support.'
            });
        }

        res.status(500).json({
            error: 'Failed to transcribe audio',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        // Clean up temp file
        if (audioFilePath) {
            try {
                await fs.unlink(audioFilePath);
                console.log(`🧹 Cleaned up temp file: ${audioFilePath}`);
            } catch (cleanupError) {
                console.warn(`Failed to delete temp file: ${cleanupError.message}`);
            }
        }
    }
});

// Logout endpoint for token invalidation
app.post('/api/logout', verifyFirebaseToken, (req, res) => {
    try {
        // Firebase tokens are stateless and automatically expire
        // This endpoint serves as a logout notification for server-side cleanup
        console.log(`🚪 User ${req.user.email} logged out`);

        // Here you could add token blacklisting if needed:
        // - Add token to Redis blacklist with expiry
        // - Clear any server-side sessions
        // - Log security event

        res.json({
            success: true,
            message: 'Logout successful',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            error: 'Logout failed',
            timestamp: new Date().toISOString()
        });
    }
});

// === RAG API ENDPOINTS ===

// Process memories into stories
app.post('/api/stories/process', verifyFirebaseToken, ensureUserScope, async (req, res) => {
    try {
        const { conversationId } = req.body;
        const result = await ragService.processMemoriesIntoStories(req.userId, conversationId);
        res.json(result);
    } catch (error) {
        console.error('Error processing memories into stories:', error);
        res.status(500).json({ 
            error: 'Failed to process memories into stories',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Search stories using semantic search
app.post('/api/stories/search', verifyFirebaseToken, ensureUserScope, async (req, res) => {
    try {
        const { query, limit = 10, threshold = 0.7, people = [], places = [], events = [] } = req.body;
        
        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: 'Query is required and must be a string' });
        }

        const options = { limit, threshold, people, places, events };
        const result = await ragService.searchStories(req.userId, query, options);
        res.json(result);
    } catch (error) {
        console.error('Error searching stories:', error);
        res.status(500).json({ 
            error: 'Failed to search stories',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get relevant stories for agent context
app.post('/api/stories/relevant', verifyFirebaseToken, ensureUserScope, async (req, res) => {
    try {
        const { context, maxStories = 5 } = req.body;
        
        if (!context || typeof context !== 'string') {
            return res.status(400).json({ error: 'Context is required and must be a string' });
        }

        const result = await ragService.getRelevantStories(req.userId, context, maxStories);
        res.json(result);
    } catch (error) {
        console.error('Error getting relevant stories:', error);
        res.status(500).json({ 
            error: 'Failed to get relevant stories',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get user stories with pagination
app.get('/api/stories', verifyFirebaseToken, ensureUserScope, async (req, res) => {
    try {
        const { limit = 20, offset = 0, sortBy = 'created_at', sortOrder = 'DESC' } = req.query;
        const options = { 
            limit: parseInt(limit), 
            offset: parseInt(offset), 
            sortBy, 
            sortOrder 
        };
        
        const result = await ragService.getUserStories(req.userId, options);
        res.json(result);
    } catch (error) {
        console.error('Error getting user stories:', error);
        res.status(500).json({ 
            error: 'Failed to get user stories',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get story statistics
app.get('/api/stories/stats', verifyFirebaseToken, ensureUserScope, async (req, res) => {
    try {
        const result = await ragService.getStoryStats(req.userId);
        res.json(result);
    } catch (error) {
        console.error('Error getting story stats:', error);
        res.status(500).json({ 
            error: 'Failed to get story statistics',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
    const dbPing = typeof db.ping === 'function' ? await db.ping() : { ok: undefined, configured: !!process.env.DATABASE_URL };
    const encKey = process.env.ENCRYPTION_KEY || '';
    const encValid = !!encKey && encKey.length === 64;
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        anthropicConfigured: !!process.env.ANTHROPIC_API_KEY,
        openaiConfigured: !!process.env.OPENAI_API_KEY,
        voice: {
            enabled: voiceEnabled,
            breakerActive: isVoiceTemporarilyDown() && voiceEnabled,
            downUntil: voiceDownUntil || null,
            consecutive429: voiceConsecutive429,
            maxConsecutive429: VOICE_MAX_CONSECUTIVE_429
        },
        database: {
            configured: dbPing.configured,
            ok: dbPing.ok,
            error: dbPing.error
        },
        encryption: {
            configured: !!encKey,
            length: encKey.length,
            validFormat: encValid
        }
    });
});

// Serve the main app
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Multer and general error handling middleware (place before generic handler)
app.use((err, req, res, next) => {
    // Multer errors or fileFilter rejections
    if (err && (err.name === 'MulterError' || /Only audio files are allowed/i.test(err.message || ''))) {
        return res.status(400).json({ error: 'Invalid audio upload', details: err.message });
    }
    return next(err);
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server Error:', error);
    res.status(500).json({ 
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Function warming scheduler (every 10 minutes)
function startWarmingScheduler() {
    const warmInterval = 10 * 60 * 1000; // 10 minutes
    setInterval(async () => {
        try {
            const response = await fetch(`http://localhost:${process.env.PORT || 3000}/warm`);
            const data = await response.json();
            console.log(`🔥 Warming ping: ${data.status}`);
        } catch (error) {
            console.log(`⚠️ Warming failed: ${error.message}`);
        }
    }, warmInterval);
    
    // Initial warm after 30 seconds
    setTimeout(async () => {
        try {
            const response = await fetch(`http://localhost:${process.env.PORT || 3000}/warm`);
            const data = await response.json();
            console.log(`🔥 Initial warming: ${data.status}`);
        } catch (error) {
            console.log(`⚠️ Initial warming failed: ${error.message}`);
        }
    }, 30000);
}

// Start the server only when executed directly, not when imported by tests
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 Story Collection server running on port ${PORT}`);
        console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🤖 Anthropic API: ${process.env.ANTHROPIC_API_KEY ? '✅ Configured' : '❌ Missing'}`);
        console.log(`🌐 Access at: http://localhost:${PORT}`);
        
        // Start warming scheduler in production
        if (process.env.NODE_ENV === 'production') {
            startWarmingScheduler();
            console.log(`🔥 Function warming enabled (10min intervals)`);
        }
    });
}

module.exports = app;

// Process-level guards to prevent hard crashes
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception:', err);
});
