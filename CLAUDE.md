# CLAUDE.md — VANGUARD OPS (SIH 2026 · PS 26248)

Browser-based closed (double-blind) wargame: every commander sees a different, deliberately
degraded picture of a server-held ground truth. Source of truth for scope: `docs/PRD.md`.
Deviations go to `docs/DECISIONS.md` first. Status lives in `docs/PROGRESS.md`.

## Stack
- pnpm workspaces, TypeScript strict, ESM everywhere (`"type": "module"`, `moduleResolution: Bundler`).
- `packages/shared` — Zod schemas + shared types (scenario, events, commands, DTOs, grid helpers).
- `packages/sim` — PURE deterministic simulation (no I/O, no Date.now, no Math.random). Seeded PRNG.
- `apps/server` — Fastify 5 + Socket.IO 4 + Prisma 6 (Postgres). Bundled with tsup (workspace pkgs inlined).
- `apps/web` — React 18 + Vite 6 + Tailwind 4 + Radix (shadcn-style components in `src/components/ui`) + Zustand.
- Tests: Vitest everywhere; Playwright E2E in `/e2e` (multi-context: instructor + trainees).
- Workspace packages export TS source (`main: ./src/index.ts`); no build step needed for dev/test.

## Commands
```bash
pnpm install
pnpm dev               # server :8080 (tsx watch) + web :5173 (vite, proxies /api + /socket.io)
pnpm check             # lint + typecheck + unit tests (the phase gate)
pnpm test:coverage     # sim coverage (threshold 90% lines)
pnpm build             # all packages; server -> apps/server/dist, web -> apps/web/dist
pnpm start             # serve built web + API on :8080
pnpm e2e               # Playwright (builds nothing; expects `pnpm build` first)
pnpm seed:demo         # create a finished demo exercise (needs DATABASE_URL or prints a JSON log)
docker compose up      # full offline stack (app + postgres [+ ollama profile])
```

## Invariants (do not break)
1. **Ground truth never reaches a trainee socket.** Trainee payloads are built only by
   `project()` in `packages/sim/src/projection.ts`. The leak test in `apps/server/test/leak.test.ts`
   must stay green. Never add truth fields (`isDecoy`, `strength`, `track`, real unit ids, MSEL) to
   `PerceivedPicture`.
2. **Determinism.** Sim advances in fixed 1000 ms steps. All randomness via `state.rng` (mulberry32).
   Input events carry `tSimMs`; replay = for each event: step until `t == tSimMs`, then apply.
   `test/determinism.test.ts` asserts identical state hash for same seed + log.
3. **Event log is append-only.** Only *input* events (player/instructor commands, clock control)
   are persisted; derived sim outputs (deliveries, drops, adjudications) live in `state.journal`
   and are re-derived on replay.
4. **Synthetic data only.** Fictional grid, callsigns, units. No real designations, weapon or
   jamming technical data.
5. **Offline.** No CDN at runtime; fonts via @fontsource, map is an SVG grid (no tiles).
6. **AI is optional.** `LLM_PROVIDER=none` must keep every feature working (template fallback).

## Conventions
- Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), commit per phase at least.
- Zod-validate every inbound REST body and socket command (`packages/shared/src/commands.ts`).
- Keep sim modules small and individually tested; prefer plain data + functions over classes,
  except `Simulation` which owns the mutable state object.
- UI: restrained tactical palette (tokens in `apps/web/src/index.css`), monospace for data,
  colour never the only signal (always pair with text/icon/pattern).
- Never commit `.env`; update `.env.example` when adding config.
