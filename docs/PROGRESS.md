# PROGRESS

## Phase 0 — Setup ✅ (2026-10-04)
- Toolchain: Node v24.13.1 ✅, npm 11.8 ✅, git 2.51 ✅, pnpm 9.15.9 (installed globally via npm) ✅.
- **Missing on this machine:** Docker (needed for Phase 9 verification) and GitHub CLI `gh` (needed for Phase 10).
  - Docker Desktop: `winget install -e --id Docker.DockerDesktop` (needs admin + reboot, WSL2).
  - GitHub CLI: `winget install -e --id GitHub.cli` then `gh auth login`.
- Monorepo scaffolded (pnpm workspaces): `apps/web`, `apps/server`, `packages/sim`, `packages/shared`.
- TypeScript strict, ESLint 9 flat config, Prettier, Vitest; `.gitignore`, `.env.example`, `CLAUDE.md`.
- Gate: lint ✅ typecheck ✅ tests ✅ (smoke tests).

## Phase 1 — PRD ✅ (2026-10-04)
- `docs/PRD.md` (18 sections, traceability matrix, G/W/T criteria, formulas), `docs/ARCHITECTURE.md` (Mermaid), `docs/DECISIONS.md` (D-001…D-013).
- Notable deviation: SVG tactical grid map instead of MapLibre (D-001).

## Phase 2 — Sim engine ✅ (2026-10-04)
- `packages/shared`: grid helpers, domain enums, channel table, Zod schemas (scenario, input events, DS/trainee commands, REST bodies), DTOs (PerceivedPicture, InstructorState, AarReport), report formatting.
- `packages/sim`: seeded PRNG in state, canonical hash, piecewise-linear tracks, link model (jammer zones, freq hop, ridge LOS, relays, C2 outage, manual injects), 6-step degradation pipeline, sensors (decoy discrimination, negatives, refresh), own observation, POSREPs, spoofing, stale, datalink compromise, GPS spoof, recon/verification, adjudication table R1–R9 + engagements + strikes, intent scoring, SAGAT probes (generation, scoring, divergence), projection (per-role + truth), event reducer, replay.
- Tests: 84 sim + 6 shared. Sim coverage 99.0 % lines / 92.2 % branches. Determinism test: replayed log hash === live hash. Sim-level leak test on all 6 roles.

## Phase 3 — Server ✅ (2026-10-04)
- Fastify 5 + Socket.IO 4: REST (health, scenarios, create, PIN login w/ rate limit, lobby, join w/ race safety + callsign reclaim, me, briefing), socket gateway with token→role binding, per-role rooms, DS view-as, presence.
- `LiveSession`: command→input-event mapping, append-only persisted log (ordered persist chain), tick loop (1000 ms step × speed), rehydrate-on-boot (running sessions resume paused).
- Stores: `MemoryEventStore` (default) and `PrismaEventStore` (Postgres). Prisma schema + init migration (generated offline).
- Iron Bridge scenario authored (15 MSEL items; all 7 inject types, jammers, 3 cyber kinds).
- `seedDemo` (scripted synthetic run) implemented early — used by tests and Phase 9.
- Tests: 20 server tests incl. **ground-truth leak test over real sockets** (6 roles, >100 payloads), view-as equality, reconnect, cross-client messaging, rehydrate. Postgres store test verified locally against an embedded Postgres 18 (migration applied, round-trip + rehydrate pass); runs in CI when `TEST_DATABASE_URL` is set.
- Note: the embedded Windows Postgres defaulted to WIN1252; app requires a UTF-8 database (Docker/Render default).

## Phase 4 — Trainee web app ✅ (2026-10-04)
- React 18 + Vite 6 + Tailwind 4 + Radix (shadcn-style kit in `components/ui`), Zustand session store fed only by Socket.IO, IBM Plex via @fontsource (offline).
- Pages: Landing, Create (scenario picker, role toggles, seed → code + PIN), Join (live lobby, taken roles disabled), DS login (code + PIN), Trainee console.
- SVG TacticalMap (D-001): terrain patterns, NATO-style frames (shape + colour + text), contradictory contacts side-by-side with conflict ring, ages, stale fading, keyboard-navigable cells (arrows + Enter).
- Trainee console: lobby briefing, intent card (CDR refines → travels through degradation), CUT OFF banner, intel feed (filters, conflicts-with links, flag, verify, forward, select as basis), comms (PACE list with live status, switch, EW freq hop + DF spectrum, ALO/NLO assets, compose to net members, traffic log), decision panel (8 actions, map target pick, confidence slider, rationale ≥15, based-on chips, intent yes/no/unsure), SAGAT probe overlay (blanked picture), ended → AAR link.
- Verified in browser: create → DS console → trainee join (separate tab) → start ×4 → jammer MSEL → trainee CUT OFF banner → decision logged → unit moves; DS view-as shows trainee screen.

## Phase 5 — Instructor dashboard ✅ (2026-10-04)
- DS console: clock controls (start/pause/resume/×1/×2/×4/end with confirm), god view (truth units incl. decoys, jammer radii with inner/outer zones, role↔superior link lines by state, rebro), view-as-role switcher (renders the role's exact PerceivedPicture full width), map tools (place jammer dialog: radius/power/bands/label; move/toggle/remove), inject composer (7 types, channels, roles, duration, params, live preview), cyber controls (C2 outage, datalink compromise, GPS spoof role/drift), MSEL timeline (edit time, skip, fire now, due highlight), live decision feed with SOUND/RISKY/UNSOUND + expandable knowable-vs-truth, SAGAT probe (freeze → per-role progress/accuracy → score & resume) with SA-divergence heatmap, comms health + delivery stats, roster (presence, cut-off, GPS believed vs true, release role), truth journal.

## Phase 6 — AAR ✅ (2026-10-05)
- Sim `metrics.ts`: decision latency after triggers, verification of contested intel, Brier + over-confidence, intent adherence (overall / cut off) + self-awareness, SA per probe, divergence, comms, cut-off time, PACE response, outcome, rule-based sustain/improve (PRD §9.10).
- Sim `aar.ts`: `buildAar` (4 AAR questions + exec summary), template narrative and per-decision rationale feedback (AI layer hooks in Phase 7), `buildReplay` (frames every N s, truth or any role view, rebuilt from the log).
- Server: `/aar`, `/aar.pdf` (pdfkit, vector swimlane/bars/network, two-column hindsight-safe decision cards, disclaimer footer on every page), `/events.json`, `/decisions.csv`, `/replay`, access control (DS any time, trainees after END, `?token=` for downloads), `POST /api/demo` (rate-limited one-click finished demo).
- Web AAR page: exec summary + KPI strip, Q1 brief/intent/MSEL, Q2 outcome + interactive swimlane (click → decision card) + replay scrubber (play/pause/×1/×4/×10, truth ↔ role toggle), Q3 metric table with ▲/▼ markers, bar charts, SA heatmaps, network graph, decision cards (knowable → reveal truth + feedback, role filter, reveal-all), Q4 sustain/improve + narrative (labelled template vs AI draft), PDF/JSON/CSV export.
- Tests: 7 sim AAR tests (formulas, every sustain/improve branch, replay), 7 server tests incl. **PDF text extraction asserting decision cards** (pdf-parse). Sim coverage 99.4 % lines / 91.5 % branches.
- Visually reviewed the PDF (6 pages) via PyMuPDF rasterisation.

## Phase 7 — Scenarios + AI layer ✅ (2026-10-05)
- **Ridge Line** authored: ridge along column D masks VHF (LOS) between HQ and the forward OP, single pass D5, GPS spoof on PL A, convoy report delayed ~5 min by SATCOM congestion, pass-vs-dump dilemma, 15 MSEL items.
- Scenario tests: both templates validate, MSEL ≥ 12 covering all 7 inject types + jammer + all 3 cyber kinds, full-length (30 min) runs with decisions/probes and a truth-leak sweep for every role, Ridge-specific mechanics (LOS mask, GPS drift, 5-min convoy delay).
- AI layer (`apps/server/src/llm.ts`): provider abstraction none | ollama | anthropic (official SDK, claude-opus-5-5, low effort, server-side refusal fallbacks). AAR narrative + per-decision coaching drafts (≤12, concurrency 3), report variants (SALUTE / contact / SITREP + contradictory pair) at `POST /api/sessions/:code/ai/report-variants`; DS composer "Draft texts" for CONFLICT injects (texts recorded in the event log). Template fallback on any failure; all AI output labelled.
- Tests: 8 AI tests with fake/mocked providers (no network). Real Anthropic/Ollama calls were **not** exercised (no key / no Ollama locally) — adapters verified against mocked transports only.

## Phase 8 — Quality ✅ (2026-10-05)
- Playwright (`e2e/iron-bridge.spec.ts`) against the production build: DS + 3 trainees in **separate browser contexts**; create → join → start ×4 → CDR→PL A message over CMD_NET (arrives, sometimes garbled by design) → DS places a jammer with the map tool → PL B sees CUT OFF and commits a decision (map-picked target) → DS feed shows it flagged "cut off" → ≥ 3 sim-minutes → SAGAT freeze, all three answer, DS scores & resumes → end → AAR (hindsight-safe card reveal) → **PDF downloads and contains decision cards** (pdf-parse) → trainee opens AAR. Passed twice in a row (~1 min).
- axe-core (`e2e/a11y.spec.ts`): no serious/critical WCAG 2.1 AA violations on landing, create, join, trainee lobby + console, DS console, AAR. Fixed along the way: faint text token contrast, faded role cards, invalid list children, danger-button ink, heatmap fill.
- Lighthouse accessibility: 100 on landing, create, join (run against the prod build via a debug-port Chromium).
- Map clicks now resolve from SVG coordinates (clicking a sector under a marker or link line selects it).

## Phase 9 — Packaging ✅ (2026-10-05, Docker run pending)
- Multi-stage `Dockerfile` (node:20-bookworm-slim, pnpm 9, `pnpm deploy --prod`, Prisma client for debian-openssl-3, non-root, HEALTHCHECK on /healthz) — server serves the built SPA.
- `docker-entrypoint.sh`: `prisma migrate deploy` when DATABASE_URL is set, then start. `docker-compose.yml`: app + postgres:16-alpine (UTF-8, healthcheck, volume) + optional `ai` profile (Ollama). SEED_DEMO_ON_EMPTY=true seeds a finished exercise on first boot.
- `pnpm seed:demo` (tsx) and bundled `dist/seed-demo.js` (inside the container: `docker compose exec app node server/dist/seed-demo.js`); without a DB it writes the AAR PDF + event log to ./.data/.
- **Verified natively (Docker is not installed on this machine):** built → `pnpm deploy --prod` → `prisma generate` in the deploy dir → migrations applied to a fresh UTF-8 Postgres → deployed bundle starts (store=postgres), seeds the demo, serves the SPA and API → restarted: no re-seed, AAR + PDF rebuilt from the Postgres event log. Fixed: relative SCENARIOS_DIR/WEB_DIST now resolved to absolute paths.
- **Not yet verified:** `docker build` / `docker compose up` themselves — will be exercised by the CI docker job (Phase 10) and can be run locally after installing Docker Desktop.

## Phase 10 — GitHub ✅ (2026-10-05)
- Repo: https://github.com/harshit-1243/vanguard-ops-sih26248 (public, created by the user; pushed over HTTPS — no gh CLI on this machine). Description/topics to be set in the GitHub UI.
- Secret scan before push: gitleaks not installed → grep for key patterns (Anthropic/AWS/GitHub/Slack/Google keys, private keys, non-local DB URLs): clean; only `.env.example` tracked; `.env` ignored.
- **CI green on the first push** (run 37279537271): job 1 lint · typecheck · unit+integration (incl. **Postgres store test** against a service container and the leak test) · sim coverage · build · Playwright E2E + axe; job 2 **docker compose up --build from a clean clone** → healthy on Postgres → SPA/API/demo AAR/PDF smoke → restart keeps data.

## Phase 11 — Deploy ✅ (2026-10-05)
- Live: **https://vanguard-ops-0uex.onrender.com** — Render Blueprint (`render.yaml`): Docker web service + Render Postgres (free plans), created by the user.
- Health: `{"ok":true,"store":"postgres"}`; demo exercise auto-seeded on first boot.
- Live smoke test (`pnpm --filter @vanguard/server smoke https://vanguard-ops-0uex.onrender.com`) — **PASSED**: health (postgres) → session created → DS + 2 trainee sockets over Render's proxy → start ×4 → inject + jammer → PL_B cut off → trainee message → end → AAR JSON → PDF. Also: SPA + deep link 200, both scenarios listed, one-click demo AAR (10 decisions, 2 probes) + PDF.
- Notes: free web service sleeps after ~15 min idle (≈1 min cold start); free Postgres expires after 30 days.

## Phase 12 — Handover docs ✅ (2026-10-05)
- README (pitch, PS mapping, 10 screenshots captured by Playwright into docs/screenshots, Mermaid architecture, quick start, Docker, Render deploy steps, Why, safety, team placeholders), docs/DEMO_SCRIPT.md (3-min timed demo + Q&A), docs/PITCH_NOTES.md.

## Phase 13 — Post-test improvements ✅ (2026-10-05)
- MapLibre GL map (D-016): 3D tilt, tweened movement, sector popups, hover, keyboard sectors; SVG fallback. Fixed: MapLibre rejects data-driven `line-dasharray` (link layer split).
- 3D sand table (Three.js, lazy-loaded) with WebXR **Enter VR / Enter AR** (buttons appear only on devices with immersive-session support; rendering verified in headless Chromium/SwiftShader, headset not available here).
- Adaptive OPFOR (D-017), exercise variables on Create (D-020), clock checkpoints every 30 s (D-019).
- AI: Groq / Cerebras / xAI / OpenAI-compatible providers (D-018), AI inject advisor + AI status chip; AAR AI drafts only after END.
- Load test: 40 concurrent exercises (210 sockets) at ×4 → 96 % real-time, 170 MB RSS, loop p99 42 ms. `/healthz` now reports memory and event-loop delay.
- Tests: OPFOR rules, settings, checkpoint replay (sim); providers, advisor, restart resume (server). E2E clicks real map points (MapLibre via SwiftShader).
- Awaiting user: a free Groq or Cerebras key in Render to verify the AI layer live.

## Pending
- Nothing blocking. Optional: set repo topics/description in the GitHub UI; fill in team names in the README.

## Known issues
- None yet.
