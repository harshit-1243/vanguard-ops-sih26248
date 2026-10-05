# Pitch notes — SIH idea PPT

## Problem
- EW and cyber disruption degrade comms and situational awareness exactly when junior/mid-level commanders must decide (lessons from Ukraine; multi-domain operations such as Operation Sindoor).
- TEWTs and CPXs assume complete, reliable information flow → officers first meet fog, delay, contradiction and isolation in contact.
- No objective record of "what did they know when they decided?" → debriefs suffer hindsight bias.

## Solution — VANGUARD OPS
- Browser-based **closed (double-blind) wargame**: server holds ground truth; each commander gets a different, deliberately degraded picture.
- DS controls the fog live: EW jammers whose effect is computed from geometry and band, terrain line-of-sight, cyber events (C2 outage, datalink compromise, GPS spoof), 7 manual inject types, scripted MSEL.
- Trains **mission command**: cut-off roles are told to act on intent and are scored for intent adherence.
- **SAGAT probes** measure individual SA and team SA divergence; every decision carries confidence → calibration (Brier).
- **Hindsight-safe AAR**: frozen knowable picture per decision, truth revealed on demand; four AAR questions; PDF / JSON / CSV.

## Novelty
- Degradation *emerges from the scenario* (jammer radius/band/power, ridge LOS, relays, freq hop) — not just a toggle.
- Separation of realities enforced in code and proven by an automated ground-truth leak test.
- Hindsight-safe decision cards + confidence calibration + SA divergence in one debrief.
- Event-sourced and deterministic: seed + log replays to an identical state (replay scrubber, audit trail).
- Tri-service by design: CDR, platoon commanders, Air Liaison/ISR, EW/Signals, optional Naval Liaison.
- Web **and** VR/AR: 3D sand table with WebXR on the same per-role data; MapLibre map with 3D tilt.
- Adaptive yet explainable enemy (deterministic rules) and an **AI inject advisor** for the DS; runs on free-tier LLMs (Groq/Cerebras) or fully offline.

## Tech stack
- TypeScript monorepo: React 18 + Vite + Tailwind + Radix; Node 20 + Fastify + Socket.IO + Zod; Prisma + PostgreSQL; pdfkit.
- Pure deterministic simulation package (99 % test coverage); Playwright E2E with 4 browser contexts; axe/Lighthouse accessibility.
- Docker image + compose (offline); Render Blueprint; GitHub Actions CI.
- Optional AI: none / Ollama (offline) / Anthropic Claude — always with template fallback.

## Feasibility
- Working product, not a mock-up: 145 unit/integration tests + Playwright E2E, green CI, Docker build verified in CI.
- Runs on ordinary DSSC PCs in a browser; no install for trainees; LAN or cloud.
- Scenarios are JSON — DS can author new ones without code.

## Impact
- Rehearse decision-making under uncertainty for every course (≈ 500 officers) with measurable outcomes: decision latency after friction, verification behaviour, calibration, intent adherence, SA accuracy and divergence.
- Objective, exportable AARs for DS and trainees; trend tracking across courses.
- Path forward: voice push-to-talk over degraded nets, scenario editor UI, cross-course analytics.

## References (public context only)
- PS SIH26248 statement (MoD / DSSC Wellington).
- US Army TC 25-20 / standard AAR four-question format.
- Endsley, M. R. — Situation Awareness Global Assessment Technique (SAGAT).
- Brier, G. W. (1950) — verification of probability forecasts.
- Mission command doctrine (commander's intent; PACE communications planning).
