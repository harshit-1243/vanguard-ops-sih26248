# Decision log

Format: ID · date · decision · why · consequences. Newest at the bottom.

**D-001 · 2026-10-04 · SVG tactical grid map instead of MapLibre GL.**
The theatre is a fictional 8×8 grid ("cloth model"), so there is no geographic projection, tiles or
glyphs to serve. MapLibre adds WebGL (fragile on low-spec / headless / VM machines — DSSC lab PCs and
CI), needs offline glyph PBFs for labels, and gains us nothing for an abstract grid. An SVG map is
keyboard-focusable per cell (a11y), renders identically in Playwright screenshots, and the same
geometry is reused in the PDF. Consequence: no pan/zoom tiles; map scales with container.

**D-002 · 2026-10-04 · Persist input events only; derived outputs re-derived.**
Deliveries, drops, engagements etc. are deterministic functions of (seed, inputs). Persisting them
would double-count on replay. They live in `state.journal` and are included in the JSON export.

**D-003 · 2026-10-04 · In-memory EventStore when `DATABASE_URL` is unset; no SQLite.**
Prisma cannot switch provider at runtime, and dual-generated clients complicate bundling. Local dev
and unit tests use `MemoryEventStore` (same interface); Docker/production/CI use PostgreSQL via Prisma.
The Prisma store is integration-tested in CI against a Postgres service container.

**D-004 · 2026-10-04 · Fixed 1000 ms sim step; speed only changes wall-clock tick rate.**
Guarantees determinism regardless of speed changes; ×4 = four steps per wall second.

**D-005 · 2026-10-04 · Full-snapshot per-role pictures every tick (no diffs).**
Payloads are small (≤ ~20 KB), and full snapshots make reconnect/refresh trivially correct.

**D-006 · 2026-10-04 · Added `HF_NET` channel (beyond the minimum list).**
Gives PACE plans a realistic, non-LOS contingency so "cut off" requires deliberate jamming of both
VHF and HF bands (or LOS + C2 loss), which makes the mission-command trigger meaningful.

**D-007 · 2026-10-04 · Optional 6th role NLO (Naval Liaison Officer).**
Makes the default exercise tri-service (Army/Air/Navy) for DSSC's joint audience.

**D-008 · 2026-10-04 · shadcn-style components hand-authored on Radix primitives.**
The shadcn CLI needs network/interactive prompts; the components are copied-in source by design,
so we author the handful we need (Button, Input, Select, Slider, Tabs, Dialog, Badge, Switch).

**D-009 · 2026-10-04 · Version pins: React 18, Vite 6, Vitest 3, Tailwind 4, Zod 3, Fastify 5, Prisma 6.**
Known-stable majors; avoids churn from newer majors released during the build.

**D-010 · 2026-10-04 · `Simulation` owns a mutable plain-object state.**
Immutable copies per tick are needlessly costly; the package stays pure in the I/O sense (no clock,
no randomness, no network) and the state is a serialisable POJO, so hashing/replay remain exact.

**D-011 · 2026-10-04 · Identity tokens in per-tab `sessionStorage`.**
Used only to re-authenticate the same tab after refresh. All exercise state comes from the server;
nothing is synchronised via browser storage.

**D-012 · 2026-10-04 · Deterministic, dice-free adjudication.**
Explainability for the debrief: every outcome traces to one row of the PRD §8 table.

**D-013 · 2026-10-04 · Three-level outcome (1 / 0.5 / 0) for Brier score.**
RISKY decisions are neither right nor wrong; Brier remains well-defined for fractional outcomes.

**D-014 · 2026-10-05 · AI layer via official SDKs, recorded as data.**
`LLM_PROVIDER=none` (default) uses deterministic templates everywhere. `anthropic` uses the official
`@anthropic-ai/sdk` with `claude-opus-5-5` at `effort: low` (short drafting tasks) and server-side
refusal fallbacks (`fallbacks: "default"`); `ollama` calls a local model for fully offline AI. Any
error, timeout or refusal falls back to the template text. AI text that affects the exercise (a
drafted contradictory report pair) is placed in the inject's params, so it is part of the input event
log and replay stays deterministic. AI output is always labelled "AI-generated draft".

**D-015 · 2026-10-05 · One-click demo endpoint (`POST /api/demo`, rate-limited).**
Plays the scripted Iron Bridge demo to the end so a judge can open a full AAR in seconds; the same
code backs `pnpm seed:demo`.
