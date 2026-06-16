# CineBook — AI-Powered Movie Booking Platform

A full-stack movie-booking platform with a **hand-built AI booking agent** (no agent frameworks), a transactional booking engine, and a single Flutter app that serves all three roles (customer, hall manager, admin) gated by JWT.

> Built as a 36-hour take-home. The AI chatbot (Part 2) is the centerpiece: a custom agent loop, sub-agent delegation, a 25-tool registry, and explicit context management — all original code.

---

## Highlights

- **Custom agent loop, zero frameworks** — no LangChain/AutoGPT. The `while`-loop orchestrator, tool registry, sub-agent delegation, and context manager are all hand-written (`backend/src/ai/`).
- **Sub-agent delegation** — the orchestrator delegates the booking transaction to a focused booking sub-agent with a restricted toolset, which runs its own loop and returns a structured summary.
- **25 tools** over the *same* domain services the REST API uses — the AI never touches the DB directly.
- **Provider-agnostic** — one swappable LLM call (`backend/src/ai/provider.ts`). Currently runs on **Groq** (`llama-3.3-70b-versatile`); see [AI notes](#ai-notes--provider).
- **Real booking engine** — atomic Redis seat holds (`SET NX EX`), DB `unique(showId, seatId)` backstop, simulated payments, refunds, and a circuit breaker.
- **Production middleware** — request tracing, Redis token-bucket rate limiting, retries, circuit breaker, metrics, and an activity log that captures both REST and chatbot actions.
- **One Flutter binary, three roles** — role-gated navigation decoded from the JWT; RBAC enforced on the server.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  FLUTTER APP (Riverpod) — role-gated from JWT                │
│   customer · hall_manager · admin                            │
└───────────────┬─────────────────────────────────────────────┘
                │  REST + SSE (chat streaming)
┌───────────────▼─────────────────────────────────────────────┐
│  FASTIFY API (Node + TS)                                     │
│  Middleware: Auth(JWT+RBAC) │ RateLimit │ Tracing            │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Domain     │  │ Booking      │  │  AI ORCHESTRATOR     │  │
│  │ Services   │←─┤ Engine       │←─┤  (custom agent loop) │  │
│  │ movies/... │  │ holds/pay    │  │  + booking sub-agent │  │
│  └─────┬──────┘  └──────┬───────┘  └─────────┬────────────┘  │
└────────┼────────────────┼───────────────────┼───────────────┘
   ┌─────▼─────┐    ┌──────▼──────┐   (AI tools call domain
   │ PostgreSQL│    │   Redis     │    services — never the DB)
   │ (Prisma)  │    │ holds/limit │
   └───────────┘    └─────────────┘
```

**Core principle:** the AI's tools are thin wrappers over the same domain services the REST endpoints use. The chatbot gets no special data access.

---

## Tech stack & why

| Layer | Choice | Why |
|---|---|---|
| Mobile | **Flutter + Riverpod + go_router + dio** | One codebase, all roles; Riverpod's `StreamProvider` makes the SSE chat clean; role-gated routing via `redirect` |
| Backend | **Node + TypeScript + Fastify** | One language across API + agent loop; great streaming (SSE) |
| DB | **PostgreSQL + Prisma** | Deeply relational with hard constraints (show overlap, seat uniqueness) |
| Cache | **Redis (ioredis)** | Seat holds = temp data with TTL; also token-bucket rate limiting |
| AI | **Raw provider SDK only (Groq, OpenAI-compatible)** | The assignment bans agent frameworks; only the raw model API is used. Swappable via `provider.ts` |

---

## Project structure

```
CineBook/
├─ docker-compose.yml          # Postgres + Redis
├─ backend/
│  ├─ prisma/                  # schema (12 entities) + seed
│  └─ src/
│     ├─ config/               # env, prisma, redis
│     ├─ middleware/           # auth(JWT+RBAC), rateLimit, tracing
│     ├─ lib/                  # retry, circuitBreaker
│     ├─ services/             # DOMAIN LOGIC (shared by REST + AI)
│     ├─ routes/               # thin REST handlers + SSE chat
│     └─ ai/                   # THE CUSTOM AGENT (no framework)
│        ├─ orchestrator.ts    # main agent loop
│        ├─ bookingAgent.ts    # sub-agent (delegation target)
│        ├─ toolRegistry.ts    # tool schemas + dispatch
│        ├─ tools/             # movie / booking / profile tools
│        ├─ contextManager.ts  # SessionState + transcript compaction
│        ├─ prompts.ts         # system prompts
│        └─ provider.ts        # the one swappable LLM call
└─ mobile/                     # Flutter app
   └─ lib/
      ├─ core/                 # config, theme, api_client, auth, router
      ├─ features/             # auth, customer, manager, admin, shell
      └─ shared/models/        # data models
```

---

## Prerequisites

- Docker + Docker Compose
- Node.js 20+ (built on 22)
- Flutter 3.4+ (built on 3.44)

---

## Setup

```bash
# 1. Infra — Postgres + Redis
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env          # then add your GROQ_API_KEY (see below)
npm install
npx prisma migrate dev --name init
npx prisma db seed
npm run dev                   # Fastify on :3000

# 3. Mobile (separate terminal)
cd mobile
flutter pub get
flutter run                   # Android emulator hits the API via 10.0.2.2:3000
```

### AI key

Get a **free** Groq API key at <https://console.groq.com/keys> and put it in `backend/.env`:

```
GROQ_API_KEY="gsk_..."
GROQ_MODEL="llama-3.3-70b-versatile"
```

The provider is abstracted in `backend/src/ai/provider.ts`; swapping to another model/provider is a single-file change.

---

## Demo accounts, test cards, promos

**Accounts** (OTP is always `123456`):

| Role | Phone |
|---|---|
| Customer | `+910000000001` |
| Hall Manager (owns Screen 1, Koramangala IMAX) | `+910000000002` |
| Admin | `+910000000003` |

> Any other phone auto-registers as a new customer on first login.

**Test cards** (payment simulation):

| Card | Behavior |
|---|---|
| `4111111111111111` | Always succeeds |
| `4000000000000002` | Always fails (declined) |
| `4000000000009995` | Randomly fails |

**Promo codes:** `WELCOME10` (10%), `WEEKEND15` (15%, max ₹150), `CINE20` (20%, max ₹100), `FLAT50` (₹50 off).

---

## The AI agent (Part 2)

Everything in `backend/src/ai/` is original — no agent framework.

- **Orchestrator (`orchestrator.ts`)** — a plain `while` loop with a step guard. Each turn: call the model with the tool schemas + the current `SessionState`; if it returns tool calls, run them and feed the results back as the next turn; repeat until it produces a final answer. Feeding results back **is** the multi-step action chaining.
- **Sub-agent delegation (`bookingAgent.ts`)** — the orchestrator exposes a meta-tool `delegate_to_booking_assistant(goal)`. When called, a **separate** agent loop spins up with its own focused prompt and a **restricted booking-only toolset**, runs to completion (search → showtimes → seats → hold → promo → book → pay), and returns a structured summary the orchestrator resumes from.
- **Tool registry (`toolRegistry.ts`)** — 25 tools = a JSON schema + a function that calls a domain service:
  - **Movie (10):** search_movies, get_movie_details, get_cast, get_reviews, get_showtimes, suggest_similar, get_trending, get_upcoming, list_languages, list_genres
  - **Booking (12):** find_theatres, get_screen_info, check_seat_availability, hold_seats, release_seats, create_booking, check_booking_status, cancel_booking, view_booking_history, start_payment, confirm_payment, apply_promo_code
  - **Profile (3):** get_my_preferences, update_preferences, recommend_for_me
- **Context management (`contextManager.ts`)** — two mechanisms so a 20+ action chat never loses track:
  1. **SessionState** — a typed object (selected movie, show, held seats, applied promo, last booking…) that tools update and that is injected into the system prompt every turn as ground truth.
  2. **Transcript compaction** — once history grows past a threshold, older turns are summarized into a recap (cut at a safe message boundary) and recent turns kept verbatim.
- **Streaming** — `POST /chat` is Server-Sent Events; the app shows the agent's live tool calls and "delegating to booking assistant" activity, then the final reply. `POST /chat/sync` is a non-streaming variant for testing.

### Scripted demo (the definition of done)

One conversation proves Parts 2.A–D at once. With the backend running:

```bash
cd backend
node chat-test.mjs   # logs in as the customer and sends the demo message
```

The message:

> *"Find me a sci-fi movie with an evening show near Koramangala, hold 2 recliner seats, apply promo WELCOME10, then book it and pay with the test card."*

→ orchestrator searches → gets showtimes → **delegates to the booking sub-agent** → checks seat availability → holds 2 recliner seats → applies the promo → creates the booking → pays → confirms — visibly chaining 10+ tool actions while remembering the early preferences (genre, area, time, seat type, promo).

---

## Production quality (Part 3)

- **Tracing** — every request gets a `traceId` (returned as `x-trace-id`) and timing; mutations are written to the activity log. `middleware/tracing.ts`.
- **Rate limiting** — Redis **token bucket** (Lua, atomic): 30 chat/min/user, 5 bookings/hr/user, 5 OTP/hr/phone; returns `429` + `Retry-After`. `middleware/rateLimit.ts`.
- **Retries** — exponential backoff wrapper. `lib/retry.ts`.
- **Circuit breaker** — wraps the payment gateway; opens after consecutive failures and fast-rejects with `503` + `Retry-After`. `lib/circuitBreaker.ts`.
- **Metrics** — `GET /metrics` (admin) aggregates the activity log: totals, success rate, by-source, top actions with avg duration.
- **Activity log** — `GET /admin/activity` captures **both** REST requests and chatbot tool calls (`source: rest | chatbot`).

---

## API overview

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/request-otp`, `POST /auth/verify-otp`, `GET /auth/me` |
| Movies | `GET /movies` (filters), `GET /movies/:id`, `/movies/genres`, `/movies/languages` |
| Theatres/Shows | `GET /theatres`, `GET /theatres/screens/:id`, `GET /shows`, `GET /shows/:id` |
| Manager | `POST /shows`, `DELETE /shows/:id` (RBAC + scheduling validation) |
| Booking | `GET /bookings/seats`, `POST /bookings/hold`, `/release`, `POST /bookings`, `GET /bookings`, `/:id`, `/:id/cancel`, `/:id/pay/start`, `/:id/pay/confirm` |
| Chat | `POST /chat` (SSE), `POST /chat/sync` |
| Admin | `GET /admin/users`, `PATCH /admin/users/:id`, `POST /admin/movies`, `POST /admin/theatres`, `GET /admin/reports`, `GET /admin/activity` |
| Ops | `GET /health`, `GET /metrics` |

---

## Scheduling rules (hall manager)

Enforced server-side in `show.service.ts`, each returning a specific human-readable error:
- No overlap, with a **30-minute cleaning gap** between shows on the same screen.
- Start time must be in the future and **within 30 days**.
- A hall manager may only schedule on **screens assigned to them**.
- A show with any bookings cannot be deleted.

---

## Testing & verification

- **Backend:** the full booking lifecycle (hold → contention `409` → book → pay success/decline → refund → circuit breaker `503`) and auth/RBAC/scheduling were verified end-to-end against the live stack.
- **Flutter:** `flutter analyze` is error-clean; `flutter test` boots the app to the login screen; `integration_test/app_test.dart` drives the full customer journey (login → browse → seat map → pay → confirm → chat) on a device.

```bash
cd mobile
flutter analyze
flutter test                                   # widget smoke test
flutter test integration_test/app_test.dart -d <device>   # full E2E (backend must be running)
```

---

## Notes & known limitations

- **AI provider / free-tier limits:** originally targeted Anthropic Claude, then Google Gemini; switched to **Groq** for a genuinely usable free tier. Free tiers are token/day limited, so heavy back-to-back agent runs can hit `429` (the provider backs off and retries). For a smooth live demo, run the scripted conversation once.
- **Android NDK:** Flutter's default NDK (`28.2.x`) can download corrupted; the project pins all Android modules to the installed `27.1.x` in `mobile/android/build.gradle.kts`.
- Seat holds live in **Redis** (TTL fit); the `unique(showId, seatId)` DB constraint on `BookedSeat` is the final double-book backstop.
```
