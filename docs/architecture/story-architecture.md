# Story System Architecture and Delivery Phases

> **⚠️ FUTURE IMPLEMENTATION PLAN**  
> This document outlines the planned story processing and RAG system architecture. Most features described here are **not yet implemented** and represent future development phases. Current implementation focuses on basic memory extraction and storage.

## Context & Goals (JTBD)
- __Job__: Help families capture, organize, and retrieve life stories with minimal effort.
- __Desired outcomes__: Accurate story extraction, fast retrieval, emotionally resonant conversations.
- __Alternatives__: Raw chat logs, manual notes, generic note apps without semantic retrieval.
- __Differentiator__: Agent-assisted extraction + story aggregation + semantic search scoped per user.
- __Success__: <2s perceived latency for replies; relevant stories retrieved >80% of the time.

## Current vs Planned System Overview

### **Current Implementation (Production)**

```txt
User → Collaborator (Anthropic) + Memory Keeper (background) → In-memory Storage
```

- Memory extraction: `server/tools/memoryExtractor.js` ✅ **IMPLEMENTED**
- Basic chat with SSE streaming ✅ **IMPLEMENTED**  
- Firebase authentication ✅ **IMPLEMENTED**

### **Planned System Architecture (Future)**

```txt
User → Collaborator (Anthropic) + Memory Keeper (background) → Memory Store
      → RAG Pipeline: Aggregation (OpenAI) → Embeddings (pgvector) → Story Store
      → Retrieval for Agents (RAG Client) → Context-augmented responses
```

**Planned Components (Not Yet Implemented):**

- __RAG aggregation__: `server/tools/storyAggregator.js` 🚧 **PLANNED**
- __RAG orchestration__: `server/tools/ragService.js` 🚧 **PLANNED**
- __Vector storage & search__: PostgreSQL + pgvector 🚧 **PLANNED**
- __API gateways__: `/api/stories/*` endpoints 🚧 **PLANNED**
- __Agent integration__: `server/tools/ragClient.js` 🚧 **PLANNED**
- __Database migrations__: Automated migration system 🚧 **PLANNED**

## Domain Model (simplified)

- *Memory* (extracted): people, places, dates, events, relationships; references `conversationId`, `userId`.
- *Story*: aggregated narrative derived from related memories, with `title`, `summary`, `content`, `embedding`, entities arrays; references source memory IDs and conversation IDs.
- *User*: Firebase UID mapped to internal `users.id` (`firebase_uid` column).

See schema initialization in `server/database/index.js`:
- `stories` table with `embedding vector(1536)` and GIN/IVFFlat indexes
- `encrypted_memories` for sensitive payload storage

## Key Flows (mapped to code)
- __SSE Chat__: `POST /chat` in `server.js`
  - Streams Collaborator response (Anthropic)
  - Background Memory Keeper extraction saves to memory store and emits SSE updates
- __Direct Memory Keeper__: `POST /api/memory-keeper`
  - Extracts entities, persists memory, emits SSE
- __Process to Stories__: `POST /api/stories/process`
  - `ragService.processMemoriesIntoStories()` → `storyAggregator.aggregateMemories()` → `storyStore.saveStory()`
- __Semantic Search__: `POST /api/stories/search`
  - `ragService.searchStories()` → `storyStore.searchStories()` (vector similarity or text fallback)
- __Relevant Context__: `POST /api/stories/relevant`
  - Entity extraction + semantic search for agent prompts
- __Agent Usage__: `ragClient.getEnrichedContext()` combines retrieval + formatting

## Security & Privacy
- __Auth__: Firebase token verified (`verifyFirebaseToken`, `ensureUserScope`) on all RAG endpoints in `server.js`.
- __User isolation__: Queries include `user_id` filter; stories created with the authenticated `userId`.
- __Encryption__: `encrypted_memories.encrypted_payload` supported via AES-256-CBC in `server/database/index.js`.
- __Rate limiting__: `express-rate-limit` on `/api/*`.
- __CSP/CORS__: Locked down in `server.js` (Helmet + configurable CORS).

## Performance Principles
- __Model selection__: default `claude-3-5-haiku-latest` for speed.
- __Parallelism__: Memory extraction runs in background for SSE; combine steps where possible.
- __Token discipline__: Lower `max_tokens` and prompt size for speed.
- __Indexes__: IVFFlat for vectors; GIN on entity arrays.
- __Cold start mitigation__: warming endpoint `/warm` and scheduler (prod only).

## Delivery Phases & Milestones

### Phase 0 — Baseline Enablement (0.5 day) 🚧 **PLANNED**
- __Verify env__: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, Firebase vars, `DATABASE_URL`, `ENCRYPTION_KEY` (64 hex or encryption off).
- __DB__: 
  - pgvector extension and indexes created automatically by `initializeSchema()`
  - Migration system implemented with dual approach (automatic on startup + manual script)
  - Initial schema (0001) and missing columns (0002) migrations created
- __Health__: `/api/health` returns Anthropic/OpenAI configured.
- __Doc__: Updated `docs/DATABASE.md` with migration best practices; this file as the source of truth for architecture.
- __Outcome__: Database schema complete, migration system operational, ready for story processing.

### Phase 1 — Latency Quick Wins (0.5–1 day)
- __Model__: Ensure Haiku by default; reduce `max_tokens` (Collaborator ≈300, Memory ≈300).
- __Prompt footprint__: Truncate history to last 3–4 turns; already implemented in `server.js`.
- __Timeouts__: Keep hard timeouts (20s) via `withTimeout()`; surface errors gracefully.
- __Perceived speed__: Stream collaborator tokens; background memory extraction continues.
- __Success__: Typical responses in 1.5–3.0s; no user-facing regressions.

### Phase 2 — Unified LLM Pass + Streaming (1–2 days)
- __Goal__: Eliminate sequential LLM calls by merging extraction + reply when using REST flow.
- __Approach__: Add combined endpoint (e.g., `/api/chat-combined`) that prompts Collaborator to emit both reply and a compact, machine-parsable memory payload. Persist memory post-parse.
- __SSE__: Maintain streaming; memory payload emitted on `done`.
- __Success__: 40–50% latency reduction for REST usage; SSE path retains current behavior.

### Phase 3 — Retrieval Quality & Controls (1–2 days)
- __Ranking__: Add diversity re-ranker (simple MMR) post pgvector result.
- __Filters__: Expose people/places/events/date slider on client; pass-through to `/api/stories/search`.
- __Entity extraction__: Switch `extractEntitiesFromContext()` to faster, more reliable model and structured tool output; add caching.
- __Success__: Higher precision@k; fewer irrelevant stories included in prompts.

### Phase 4 — Product UX & Analytics (1–2 days)
- __UI__: Story browser (list, filters, detail) and “context used” preview; add to `story-collection-react/`.
- __Instrumentation__: Log retrieval stats and prompt-size metrics; simple dashboards.
- __Success__: Users can browse/confirm stories; improved trust and transparency.

## Technical Considerations & Risks
- __Embedding model__: Currently `text-embedding-ada-002` (1536d). Consider `text-embedding-3-small` for cost/quality tradeoff; update dim accordingly.
- __Type safety__: `storyStore.saveStory()` passes JSON string for vector input; valid for pgvector's text input format. If switching drivers/ORM, confirm vector binding.
- __Memory source__: `ragService.getAllMemoriesForUser()` is a placeholder; implement against actual memory store when processing global backfills.
- __Index build__: IVFFlat requires `ANALYZE`/vacuum; ensure index build happens on non-empty tables or plan initial backfill step.
- __Migration safety__: All migrations use IF NOT EXISTS clauses for idempotency; dual migration system ensures flexibility between auto and manual runs.

## Acceptance Criteria

- __Stories__: Created via `/api/stories/process` with titles, summaries, embeddings.
- __Search__: `/api/stories/search` returns relevant results with entity filters.
- __Agent context__: `ragClient.getEnrichedContext()` yields formatted snippets used by Collaborator.
- __Security__: All endpoints require Firebase auth; user data isolation verified.
- __Performance__: P50 response <3s; warm path under typical load.

## Next Steps

1. Execute Phase 0 checks and run a small end-to-end: extract → process → search.
2. Choose Phase 1–2 priorities (speed vs. consolidation).
3. If needed, implement `getAllMemoriesForUser(userId)` for whole-account processing/backfill.

---

## Industry Best Practices & Research Analysis

### Digital Storytelling Platform Architecture Best Practices

Based on research into current digital storytelling platforms and memory preservation systems, several key architectural patterns have emerged:

#### **Core Data Architecture Models**

- **Three-Component Framework**: Data foundation + narrative structure + visual elements
- **Story Object Structure**: Title, summary, content, embeddings, entity arrays (people, places, dates, events)
- **Memory Aggregation Pattern**: Extract individual facts first, then aggregate into cohesive narratives
- **Multimedia Integration**: Photos, videos, audio recordings with contextual metadata and captions

#### **Narrative Structure Models**
- **Freytag's Pyramid**: Five-part narrative structure (exposition, rising action, climax, falling action, resolution) - identified as best balance of simplicity and utility
- **Data Storytelling Arc**: Problem → tension → insight → resolution → action
- **Memory Curation**: Organize into thematic chapters (family trips, important dates, customs)
- **Narrative Arc Components**: Plot (current state) → inciting incident → rising action → climax → falling action → resolution

### Security & Privacy Standards

Current market leaders implement comprehensive security measures:
- **End-to-end encryption** for sensitive content with AES-256-CBC
- **User data isolation** (all queries scoped by user_id)
- **Regular automated backups** with tamper-proof storage
- **Secure cloud computing** to ensure digital legacies are tamper-proof and endure over time
- **Privacy-first design** with strict data protection measures

### Performance Architecture Patterns

Modern platforms optimize for speed and user experience:
- **Vector embeddings** for semantic search (text-embedding-ada-002, 1536d recommended)
- **Parallel processing** for memory extraction and narrative generation
- **Indexed entity arrays** (people, places, events, dates) with GIN/IVFFlat indexes
- **In-memory caching** with PostgreSQL persistence
- **Background processing** to avoid perceived delays during user interaction

### Elderly User Design Principles

Research shows specific design requirements for elderly users (fastest growing demographic, 73% connected):

#### **Accessibility Requirements**
- **Large, legible fonts** with customizable sizing (many use reading glasses)
- **High contrast colors** (avoid blue tones that fade for seniors)
- **Simple navigation** with clear "home" and "back" buttons as safe points
- **Voice commands and text-to-speech** support for motor skill accommodation
- **Large touch targets** with adequate spacing between interactive elements

#### **User Experience Patterns**
- **Empathetic conversation flow** prioritizing simplicity, clarity, and familiarity
- **Guided prompting** rather than blank pages (weekly questions → responses)
- **Family collaboration features** for shared memories and multi-generational input
- **Easy export functionality** (PDF, Word, JSON) for legacy preservation
- **Search capabilities** by keywords, people, places, or events with intuitive filters

### Successful Market Examples

Current platforms demonstrate proven patterns:

#### **StoryWorth Model**
- Weekly email questions to family members
- Responses compiled into annual hardcover books
- Subscription-based service with guided prompting

#### **Confinity Digital Heirlooms**
- Focus on multi-generational legacy preservation
- Secure legacy vault systems for permanent storage
- Tailored memory curation with chapter organization

#### **Treeof.me Living Memory Trees**
- Visual organization of memories into tree structures
- Private, gentle memory gathering approach
- Focus on when "words are no longer enough"

#### **Emerging Technologies**
- **Reflekta "Soul Tech"**: Interactive digital characters of departed loved ones
- **AI-powered narrative generation** with minimal manual intervention
- **Constraint-based storytelling** with structured argument relationships

### Implementation Recommendations

Based on industry analysis, our vibe-agents architecture aligns well with best practices:

1. **Dual-agent approach** (empathetic conversation + structured extraction) matches successful patterns
2. **RAG system** for semantic story retrieval follows modern AI architecture standards
3. **Firebase authentication** with user isolation meets security requirements
4. **SSE streaming** provides real-time feedback expected by users

#### **Enhancement Opportunities**
- **Memory curation chapters**: Implement thematic organization (family, travel, milestones)
- **Multimedia metadata**: Enhance photo/video support with contextual information
- **Family collaboration**: Enable multi-user contribution to shared stories
- **Export diversity**: Add PDF/Word export alongside current JSON format
- **Accessibility improvements**: Implement font scaling and high contrast modes

### Research Sources

This analysis is based on recent research (2025) including:
- Academic studies on digital storytelling platform architecture
- Analysis of memory preservation platforms (Confinity, StoryWorth, Treeof.me)
- User experience research for elderly users and accessibility requirements
- Technical architecture studies on narrative data models and vector embeddings
- Industry best practices for data storytelling and memory aggregation systems

---
References:
- RAG details: `docs/rag-system.md`
- Endpoints: `server.js` (`/api/stories/*`, `/api/memory-keeper`, `/chat`)
- Storage/DB: `server/storage/storyStore.js`, `server/database/index.js` (pgvector)
- RAG orchestration: `server/tools/ragService.js`
- Agent client: `server/tools/ragClient.js`
