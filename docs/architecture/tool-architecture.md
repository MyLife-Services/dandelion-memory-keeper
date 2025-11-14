# Tool Architecture: Asynchronous Memory Extraction and Streaming

## Overview

This document describes the server-side tool architecture for extracting memories asynchronously and streaming updates to the client via Server-Sent Events (SSE). It also covers client integration and data storage.

## Roles

- Collaborator Agent (`/api/collaborator`): Generates empathetic conversational responses.
- Memory Extractor Tool (internal): Extracts structured memories from user input using Anthropic.
- Memory Keeper API (`/api/memory-keeper`): REST endpoint that runs the extractor and persists results (also emits SSE after save).

## Key Endpoints and Modules

- `server.js`
  - `POST /chat` (SSE): Streams collaborator tokens and runs background memory extraction. Emits `memory` SSE events after persistence.
  - `GET /events`: Per-conversation SSE channel. Listens for `memory` events.
  - `POST /api/memory-keeper`: Synchronous REST for extraction + persistence. Emits `memory` SSE after saving.
  - `GET /api/memories?conversationId=...`: List stored memories.
  - `GET /api/memories/:id?conversationId=...`: Get specific memory by id.
- `server/storage/index.js`: In-memory store for extracted memories keyed by `conversationId`.
- `server/tools/memoryExtractor.js`: Executes Anthropic call for extraction (invoked via `executeTool`).

## Event Flow

1. Client sends a message.
2. Server runs memory extraction:
   - Via `/chat` SSE: starts background extraction while streaming collaborator tokens.
   - Via `/api/memory-keeper`: runs extraction immediately.
3. Server persists non-empty results using `memoryStore.saveMemory({ conversationId, messageId, payload })`.
4. Server emits `memory` events on a per-conversation EventEmitter channel: `{ id, messageId, people, dates, places, relationships, events }`.
5. `GET /events?conversationId=...` streams those events to subscribed clients.

## Client Integration
- File: `js/app.js`
  - Persistent `conversationId` per browser session (localStorage).
  - `EventSource(/events?conversationId=...)` subscription via `initializeSSE()`.
  - Per-message `messageId` generated for calls.
  - Memory Keeper requests include `conversationId` and `messageId`.
  - `memory` SSE handler:
    - Dedupe using saved `id` (from persistence) to avoid re-applying.
    - Update UI via `updateMemoryDisplay()` and `updateMemoryStatus()`.

## Data Model (In-Memory)
- Memory object:
```
{
  id: string,                 // generated on save
  conversationId: string,
  messageId: string,
  payload: {
    people: string[] | object[],
    dates: string[] | object[],
    places: string[] | object[],
    relationships: string[] | object[],
    events: string[] | object[]
  },
  timestamp: number
}
```

## Security and Ops
- Helmet, CORS, and rate limiting enabled for API routes.
- CORS allows localhost and Render domains.
- Sensitive data handling: only meaningful extractions are persisted.

## Future Work
- Replace in-memory store with Postgres JSONB adapter.
- Add tool trigger policies (v0 always-run, v1 LLM gating, v2 function calling).
- Extend SSE to support other tool events/artifacts.

## Testing Guide
- Start server: `node server.js`
- Subscribe to SSE: `curl -N "http://localhost:3000/events?conversationId=YOUR_ID"`
- Trigger extraction (REST):
```
curl -s -X POST http://localhost:3000/api/memory-keeper \
  -H 'Content-Type: application/json' \
  -d '{
        "message":"I grew up in Chicago. My aunt Debra took my cousin Marcus to the parade.",
        "model":"claude-3-5-haiku-latest",
        "conversationId":"YOUR_ID",
        "messageId":"TEST_MSG_1"
      }'
```
- Verify SSE outputs `event: memory` with non-empty arrays and an `id`.
- Fetch persisted memories:
```
curl "http://localhost:3000/api/memories?conversationId=YOUR_ID"
```
