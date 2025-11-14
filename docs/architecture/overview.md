# Architecture Overview

## Components

- Frontend: Vanilla JS UI (static hosting)
- Backend: Node Koa/Express service (always-on)
  - **Production**: `https://humanremembranceproject.org`
  - **Development**: `localhost:3000`
- LLM(s)
  - OpenAI Assistant technology (official Node SDK)
  - Anthropic (official Node SDK) [in @henryjrobinson original]

## Data Flow

1) Browser POST /chat with {conversationId, messageId, text}
2) Backend:
   - Starts Collaborator LLM call, streams tokens over SSE to client immediately
   - In parallel, triggers Memory Keeper tool with same context
3) Memory Keeper extracts structured objects, persists (in-memory for demo), emits SSE on /events
4) Client updates UI with streaming tokens and later memory updates

## Endpoints
- POST /chat -> SSE stream (token events, done)
- GET /events?conversationId=... -> SSE stream (memory events)
- GET /healthz -> health check for Render

## Decisions
- Always-on host (Render) to avoid cold starts
- SSE (simpler than WebSockets for one-way server→client updates)
- Single agent (Collaborator); Memory Keeper as a tool-like background job
- In-memory store for demo; upgrade to Postgres later

## Tradeoffs
- No durable queue yet → simpler demo, less resilience
- SSE is one-way → fine for this use; WS later if needed
- Vanilla UI kept → fastest path; Next.js later for modularity

## Security
- Secrets only on server; CORS allowlist for frontend origin
- Basic rate limits per user/session; idempotency per messageId

## Observability (lightweight)
- Log TTFB, tokens/sec, total latency; structured logs per messageId
