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

## Pending
- Phase 3 server → Phase 12 handover.

## Known issues
- None yet.
