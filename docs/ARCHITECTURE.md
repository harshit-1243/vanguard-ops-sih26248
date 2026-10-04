# Architecture

## 1. System view

```mermaid
flowchart LR
  subgraph Clients["Browsers (any machine on the LAN / internet)"]
    DS["DS console<br/>/ds/:code"]
    T1["Trainee CDR<br/>/play/:code"]
    T2["Trainee PL_B"]
    T3["Trainee ALO …"]
    AAR["AAR viewer<br/>/aar/:code"]
  end

  subgraph Server["apps/server (Fastify + Socket.IO, single Node process)"]
    REST["REST /api/*<br/>Zod-validated"]
    IO["Socket.IO gateway<br/>token → role binding"]
    SM["SessionManager<br/>LiveSession per code"]
    TICK["Tick loop<br/>1000 ms sim step × speed"]
    PROJ["project(state, role)<br/>(from packages/sim)"]
    AARB["AAR builder + PDF (pdfkit)<br/>CSV / JSON"]
    LLM["LLM provider<br/>none | ollama | anthropic"]
    STORE["EventStore<br/>Prisma(Postgres) | Memory"]
  end

  subgraph Sim["packages/sim (pure, deterministic, no I/O)"]
    STATE["Ground-truth state<br/>units, jammers, injects, rng"]
    PIPE["Degradation pipeline<br/>link → latency → drop → corrupt → conflict → stale"]
    ADJ["Adjudication table"]
    MET["Metrics / probes"]
  end

  DB[("PostgreSQL<br/>sessions · players · events")]

  DS -- "cmd (inject, jammer, probe)" --> IO
  T1 -- "cmd (message, decision)" --> IO
  T2 --> IO
  T3 --> IO
  IO --> SM
  REST --> SM
  SM --> TICK --> STATE
  STATE --> PIPE --> STATE
  SM -- "append input event" --> STORE --> DB
  SM --> PROJ
  PROJ -- "picture (per-role room only)" --> T1
  PROJ -- "picture" --> T2
  PROJ -- "picture" --> T3
  SM -- "ds:state (truth) — DS room only" --> DS
  AAR -- "GET /aar, .pdf, .csv, .json, /replay" --> REST --> AARB
  AARB --> MET
  AARB --> LLM
```

**Separation of realities.** Ground truth exists only inside `LiveSession.sim.state` on the server.
The only function that turns state into a trainee payload is `project(state, scenario, roleId)`.
Trainee sockets are placed in exactly one room, `s:<code>:role:<roleId>`, decided by the server from
the player token — never by anything the client sends.

## 2. Event sourcing & determinism

```mermaid
sequenceDiagram
  participant C as Client (role R)
  participant G as Socket gateway
  participant L as LiveSession
  participant S as Simulation (pure)
  participant E as EventStore
  C->>G: cmd MAKE_DECISION {…}
  G->>G: Zod validate + role permission
  G->>L: command(R, cmd)
  L->>L: event = {seq: n+1, t_sim_ms: state.tMs, type: DECISION_MADE, actor: R}
  L->>S: apply(event)  (freezes knowable snapshot, adjudicates)
  L->>E: append(event)
  L-->>C: ack {ok}
  Note over L,S: every tick: S.step() (1000 ms) → derived journal (deliveries, drops, engagements)
  L-->>C: picture = project(state, R)
```

- **Inputs** (commands → events) are the only persisted facts. Everything else — report generation,
  message deliveries/drops, link changes, cut-offs, engagements — is *derived* by `step()` and written
  to `state.journal`, which is re-derived identically on replay.
- `step()` always advances exactly 1000 ms of sim time. Speed only changes how often the server calls it.
- All randomness: `state.rng` (mulberry32 state, a uint32 in the state object). No `Math.random`,
  no `Date.now` inside `packages/sim`.
- Iteration order: arrays sorted by id where order matters; no reliance on object key order of
  dynamic maps.
- `hashState()` (FNV-1a of canonical JSON) is used by the determinism test and the replay endpoint.

## 3. Packages

| Package | Responsibility | Depends on |
|---|---|---|
| `packages/shared` | Zod schemas (scenario, commands, DTOs), grid helpers, report text formatting, types for `PerceivedPicture`, `InstructorState`, `AarReport` | zod |
| `packages/sim` | `Simulation` (state + `apply` + `step`), PRNG, geometry/LOS, link model, pipeline, EW/cyber, sensors, projection, adjudication, probes, metrics, AAR builder, replay | shared |
| `apps/server` | HTTP/WS, session lifecycle, tick loop, auth tokens, persistence, PDF/CSV/JSON export, LLM adapters, scenario loading | shared, sim |
| `apps/web` | Landing, join, trainee console, DS console, AAR viewer; SVG tactical map; Zustand stores | shared |

## 4. Runtime topology

- One Node process serves REST, WebSockets and the built SPA (`apps/web/dist`) — one Docker image.
- Sessions live in memory (`SessionManager`) and are persisted as an append-only event log. On boot,
  non-ended sessions are rebuilt by replay (paused) so a restart loses nothing.
- Horizontal scaling is out of scope for v1 (a DSSC exercise is ≤ 7 clients per session). Sticky
  sessions + per-session ownership would be the path if needed.

## 5. WebXR readiness

A future WebXR "3D sand-model" client needs no server change: it authenticates with a session token,
subscribes to `picture` / `ds:state`, and renders `terrain` (8×8 codes → elevation class) plus units
in grid coordinates. All payloads are plain JSON with cell coordinates, independent of the 2D SVG renderer.
