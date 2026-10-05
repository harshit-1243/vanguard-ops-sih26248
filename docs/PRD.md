# VANGUARD OPS — Product Requirements Document

**Multi-Domain Decision-Making Trainer for Degraded Communication Environments**
SIH 2026 · PS ID **SIH26248** · Ministry of Defence · DSSC Wellington · Software · Smart Automation

| | |
|---|---|
| Status | v1.0 — authoritative (deviations → `DECISIONS.md` first) |
| Owner | Team VANGUARD |
| Last updated | 2026-10-04 |

> **Training simulation — synthetic data.** Every map, unit, callsign, scenario and number in this
> product is fictional. No real unit designations, weapon/ballistic data or electronic-attack
> technique data are used or modelled.

---

## 1. Overview

VANGUARD OPS is a browser-based **closed (double-blind) wargame**. A server holds the **ground
truth** of a multi-domain (land–air–sea–cyber–EW) tactical situation. Every trainee commander
receives a **perceived picture**: ground truth passed through a deterministic degradation pipeline
(link state → latency → dropout → corruption → conflict → staleness). Degradation is driven by the
scenario itself — EW jammers placed on the map by the Directing Staff (DS), terrain line-of-sight,
cyber events — with manual injects as an override.

Every decision is captured with **what was knowable at that moment** (delivered intel, its age,
open conflicts, active outages) plus a confidence value and rationale. The After-Action Review
(AAR) follows the four Army AAR questions, judges decisions hindsight-safely, measures situational
awareness with SAGAT-style freeze probes, and exports to PDF / JSON / CSV.

**One-liner:** *A browser-based closed wargame in which every commander sees a different,
deliberately degraded picture. Instructors control the fog live, and every decision is captured
with what was knowable at that moment, for a hindsight-safe AAR.*

## 2. Problem & users

### 2.1 Problem
Electronic warfare and cyber disruption degrade communications and situational awareness exactly
when junior/mid-level commanders must decide fast. TEWTs and CPXs assume clean, complete, timely
information. Officers therefore rehearse decision-making under *ideal* conditions and meet fog,
latency, contradiction and isolation for the first time in contact.

### 2.2 Personas

| Persona | Who | Goal in the product | Pain today |
|---|---|---|---|
| **DS Instructor** (Directing Staff) | Lt Col / Cdr / Wg Cdr equivalent, DSSC faculty | Configure the fog, inject friction live, see every role's picture, run SA probes, debrief objectively | CPX friction is improvised; no record of "what did they know when?" |
| **Sub-unit Commander (CDR)** | Major-equivalent student officer, any service | Fuse partial reports, issue intent and orders, decide under time pressure | Never trained to decide on contradictory, aged intel |
| **Platoon Commander (PL A / PL B)** | Student officer playing a subordinate | Report contacts, act on intent when cut off, relay | Mission command is talked about, rarely exercised |
| **Air Liaison / ISR Officer (ALO)** | IAF student officer | Task ISR, request/clear air, de-conflict friendly positions | Air–land integration in CPX ignores datalink degradation |
| **EW / Signals Officer (EW)** | Corps of Signals / EW-branch student | Manage PACE, relays, frequency agility, read the spectrum | EW effects are narrated, not felt |
| **Naval Liaison Officer (NLO)** *(optional 6th role)* | IN student officer | Exploit coastal/naval ISR, feed the joint picture | Navy rarely represented in land-centric TEWTs |

DSSC trains ~500 mid-career officers per course across all three services, so the product is
explicitly **tri-service**: default roles include Air (ALO) and an optional Navy (NLO) role, and
Iron Bridge includes a naval coastal-ISR asset.

## 3. Goals / non-goals

### Goals
- G1. Train **decision-making under uncertainty** and **mission command** (acting on intent when cut off).
- G2. Make degradation **emerge from the scenario** (jammer geometry, band, terrain LOS, cyber events) and remain controllable live by DS.
- G3. Real **multiplayer across machines** (Socket.IO, server-authoritative) for 2–6 trainees + DS.
- G4. **Hindsight-safe, exportable AAR** with individual and team timelines, rationale, calibration and SA metrics.
- G5. Runs **fully offline** (`docker compose up`) on a DSSC LAN; desktop-first, usable at 1366×768.
- G6. Deterministic and replayable: seed + event log reproduce the exact exercise.

### Non-goals
- Shooting, ballistics, high-fidelity combat or attrition modelling (adjudication is table-driven and explainable).
- Graphics realism; real geography; real ORBATs or equipment data.
- Real EW/cyber technique modelling (effects are abstract: delay, drop, spoof, outage).
- Account management / SSO (minimal session-code auth only).
- VR headset build in v1 (see §18 — the data layer is WebXR-ready).

## 4. PS requirement → feature traceability matrix

| PS expected outcome | Product features (PRD §) | Verified by |
|---|---|---|
| **1. Scenario engine capable of injecting communication degradation (delay, dropout, conflicting reports) mid-exercise** | Degradation pipeline (§7.3); 7 manual inject types (§5.4 US-DS-3); EW jammers with geometry/band (§7.4); terrain LOS (§7.5); cyber events C2_OUTAGE / DATALINK_COMPROMISE / GPS_SPOOF (§7.6); MSEL auto-fire (§5.4 US-DS-5); sensor-driven natural conflicts (§7.7) | `packages/sim` unit tests (pipeline, jammer, LOS, cyber, conflicts); E2E jammer → cut-off |
| **2. Multiplayer capability for team-level coordination under degraded information** | Server-authoritative Socket.IO rooms per role (§12); player-to-player messages through the same degradation (§5.3 US-TR-4); intel forwarding / relay (§5.3); PACE switching (§7.2); commander's intent propagation (§5.3 US-TR-7); reconnect (§5.6) | Server socket integration tests; leak test; Playwright 4-context E2E |
| **3. Instructor dashboard to configure scenario variables and monitor trainee decisions in real time** | DS console: god view + view-as-role, inject composer, jammer placement, cyber triggers, MSEL timeline, live decision feed with soundness badge, SAGAT probes, SA-divergence heatmap, comms health, clock controls (§5.4) | Server tests for DS commands; E2E |
| **4. Exportable AAR reports capturing individual and team decision timelines and rationale** | AAR (§5.5): 4-question structure, swimlane timeline per role, hindsight-safe decision cards (frozen knowable picture + rationale + confidence → reveal truth), metrics (§9), comms network graph, replay scrubber, **PDF + JSON + CSV** export, optional AI narrative | AAR unit tests (metrics formulas); PDF/CSV endpoint tests; E2E downloads PDF and checks decision cards |

Differentiators (prompt §3) are mapped: D1 ground-truth isolation → §13 + leak test; D2 scenario-driven degradation → §7.4–7.6; D3 mission-command mode → §5.3 US-TR-6, §9.5; D4 SAGAT → §5.4 US-DS-7, §9.6–9.7; D5 confidence calibration → §9.3; D6 hindsight-safe cards → §5.5 US-AAR-3; D7 multi-domain → §2.2, §10; D8 optional AI → §5.7.

## 5. User stories & acceptance criteria

Notation: **G/W/T** = Given / When / Then. IDs are referenced from tests.

### 5.1 Landing & session flow

**US-S-1 Create exercise.** As DS I create an exercise from a scenario template.
- G the landing page, W I choose *Create exercise (Instructor)*, select "Iron Bridge", optionally adjust enabled roles (2–6, CDR mandatory) and seed, and confirm, T the server creates a session and shows a **6-character session code** (alphabet `A–Z 2–9` without `I O 0 1`) and a **6-digit instructor PIN**, and I land on the DS console in LOBBY state.
- G a created session, W I reload the DS console tab, T I remain authenticated (instructor token in this tab's `sessionStorage`); W I open the console on another machine and enter code + PIN, T I am authenticated as DS.

**US-S-2 Join exercise.** As a trainee I join with session code + callsign + role.
- G a valid code, W I open *Join exercise (Trainee)* and enter the code, T I see the scenario title and the list of roles where taken roles are disabled and labelled with the occupant's callsign.
- G I enter a callsign (2–16 chars, `A–Z 0–9 space -`) and pick a free role, W I join, T I get a player token, land in the lobby, and the DS lobby shows me within 1 s.
- G two trainees pick the same free role simultaneously, W both submit, T exactly one succeeds; the other receives "role taken" and the role list refreshes.
- G an unknown code, W I submit, T I see "Exercise not found".

**US-S-3 Lobby & start.** G ≥1 trainee joined, W DS presses *Start exercise*, T all clients switch to RUNNING within one tick, the sim clock starts at T+00:00, and late joiners can still join free roles.

### 5.2 Roles

**US-R-1 Role set.** Default roles: CDR, PL_A, PL_B, ALO, EW; optional NLO. G a session with N enabled roles (2 ≤ N ≤ 6), T only those roles are joinable, and units of un-joined roles remain in the sim (they hold position).
**US-R-2 Role-specific information.** G two trainees in different roles, W the exercise runs, T their perceived pictures differ according to the role's sensors, channels and links (asserted by test: `project(CDR) ≠ project(PL_B)` for the same state).

### 5.3 Trainee console

**US-TR-1 Map.** G RUNNING, T the map shows the 8×8 grid (A–H × 1–8) with terrain, my own unit at its *perceived* position (drifted when GPS_SPOOF affects me), and reported contacts each labelled with source, **age** ("4m old") and confidence (H/M/L). W two contacts about the same cell disagree, T both are drawn side-by-side with a conflict marker (never merged).

**US-TR-2 Intel feed.** T each item shows a type badge (CONTACT / NEGATIVE / POSREP / INFO / RECON), source, channel, age, confidence, military text (SALUTE / contact report format) and "conflicts with …" links. W I click *Flag conflict* on an item that conflicts, T a CONFLICT_FLAGGED event is logged and the item shows "flagged". W I click *Request verification*, T a VERIFICATION_REQUESTED event is logged and a fresh observation of that cell arrives later through degradation (§8 R6).

**US-TR-3 Forward / report.** W I *Forward* an intel item to role(s) over a channel, T the copy travels through the degradation pipeline (may be delayed/dropped) and is attributed "via <my callsign>".

**US-TR-4 Comms.** G the comms panel, T I see per-channel link status (CLEAR / DEGRADED / DENIED + icon + text) for my PACE channels, my active channel, and a message log. W I send a text message on a net to recipients, T each recipient receives it after the channel's computed latency or not at all if dropped; corrupted messages show garbled words. Senders see per-message delivery status only as "sent" (no delivery receipts — realism).

**US-TR-5 PACE.** T my PACE plan (Primary/Alternate/Contingency/Emergency) is shown with live status. W I switch the active channel, T PACE_SWITCHED is logged and subsequent traffic uses it.

**US-TR-6 Cut-off / mission command.** G every non-RUNNER channel I share with my superior is DENIED, T a prominent banner "CUT OFF — act on intent" (text + icon + striped background) appears and decisions I make carry `cutOff=true`; W any such link recovers, T the banner clears and CUTOFF_END is journaled.

**US-TR-7 Commander's intent card.** T the intent card is always visible. W the CDR refines intent, T the new version reaches each role **through degradation** (CMD_NET / active channel); roles that are cut off keep seeing the old version with its version number and age.

**US-TR-8 Decision panel.** G the decision panel, W I choose action (ADVANCE / HOLD / WITHDRAW / REPOSITION / REQUEST_RECON / CALL_AIR / RELAY / SWITCH_CHANNEL), target sector (or channel for SWITCH_CHANNEL), confidence 0–100 (slider + numeric), rationale (≥15 chars), "based on" intel items (multi-select) and "consistent with intent?" (yes/no/unsure) and submit, T the server validates (Zod), records DECISION_MADE with a **frozen knowable snapshot**, applies effects (§8), and the decision appears in my log. Rationale <15 chars or missing fields → inline error, nothing sent.

**US-TR-9 SAGAT freeze (trainee side).** W DS freezes for a probe, T my map/intel/comms are blanked (SAGAT) and a questionnaire appears; W I submit, T answers are locked; W DS resumes, T the console returns.

### 5.4 Instructor (DS) console

**US-DS-1 God view.** T the DS map shows ground truth: all units incl. hostile/decoy flags, true positions, jammers with radii, relay, link lines coloured + patterned by state.
**US-DS-2 View as role.** W DS selects a role in the switcher, T the map and side panels show exactly that role's current `PerceivedPicture` (same projection function used for the trainee socket; equality asserted in server test).
**US-DS-3 Inject composer.** W DS composes type ∈ {delay, dropout, intermittent, conflict, spoof, missing, stale}, channel(s), affected role(s) (empty = all), duration, type params, previews the effect summary, and clicks *Inject now*, T INJECT_FIRED is logged at current sim time and affects traffic from the next tick.
**US-DS-4 EW / cyber controls.** W DS selects *Place jammer*, clicks a map cell, sets radius (0.5–4 cells), bands, power (0.5–1.5) and confirms, T JAMMER_PLACED is logged and link states are **recomputed from geometry**; DS can move (click new cell), toggle and remove jammers. W DS triggers C2_OUTAGE / DATALINK_COMPROMISE / GPS_SPOOF with duration (and role/drift for GPS), T CYBER_TRIGGERED is logged and effects apply per §7.6.
**US-DS-5 MSEL timeline.** T scripted injects are listed with T+ time, status (pending / fired / skipped). W DS edits time/duration, skips, or fires now, T MSEL_EDITED / MSEL_SKIPPED / INJECT_FIRED(source=msel) is logged; pending items auto-fire when the sim clock reaches them.
**US-DS-6 Live decision feed.** T each decision appears within one tick with role, action, target, confidence, rationale, cut-off flag and a ground-truth badge SOUND / RISKY / UNSOUND (+ reason) from §8.
**US-DS-7 SAGAT probe.** W DS clicks *Freeze & probe*, T the sim pauses, PROBE_STARTED is logged, each enabled role receives auto-generated questions (§9.6) and DS sees answer progress; W DS clicks *Score & resume*, T answers are scored against ground truth at freeze time, the SA-divergence heatmap updates, and the sim resumes if it was running.
**US-DS-8 Widgets.** T DS sees: team SA-divergence heatmap (role × role, numeric labels in cells), comms health per channel (CLEAR/DEGRADED/DENIED counts), message delivery stats (sent/delivered/dropped/corrupted).
**US-DS-9 Exercise controls.** W DS pauses/resumes/sets speed ×1/×2/×4, T the clock follows within one tick for all clients. W DS ends the exercise, T state → ENDED, all clients see "Exercise ended — AAR available" with a link.

### 5.5 AAR

**US-AAR-1 Structure.** T the AAR has sections: (1) What was supposed to happen? (brief, intent, objectives, MSEL); (2) What actually happened? (outcome, swimlane timeline, replay); (3) Why? (decision cards, metrics, comms graph); (4) Sustain / Improve (top 3 each, derived from metrics by rules in §9.10, optional AI narrative).
**US-AAR-2 Executive summary.** T objective, outcome (objective status + friendly/hostile strength), top-3 sustains and top-3 improves.
**US-AAR-3 Hindsight-safe decision cards.** T each card first shows only the **frozen picture at decision time** (delivered intel items with ages, open conflicts, active outages perceived by that role, cut-off flag, rationale, confidence, intent self-assessment); W the reader clicks *Reveal ground truth*, T the truth at decision time + adjudicated outcome + reason appear.
**US-AAR-4 Timeline.** T a swimlane per role shows injects, outages (cut-off spans), messages sent/received, decisions and probes on a shared T+ axis.
**US-AAR-5 Metrics.** T all metrics in §9 are shown per role and team.
**US-AAR-6 Network graph.** T a node-link graph shows roles (and HHQ) with edges weighted by messages and labelled delivered/dropped.
**US-AAR-7 Replay.** T a scrubber with play/pause/speed rebuilds state from the event log at 10 s resolution; a toggle switches between ground truth and any role's view.
**US-AAR-8 Export.** W I click *PDF*, T the server generates a real PDF (vector charts) containing exec summary, four questions, timeline, metrics, decision cards (frozen + revealed), comms table and the synthetic-data disclaimer. *JSON* returns the full input event log + derived journal; *CSV* returns one row per decision.
**US-AAR-9 Access.** DS can open the AAR at any time; trainees only after ENDED.

### 5.6 Non-functional stories
**US-NF-1 Reconnect.** G a trainee refreshes or loses network, W the socket reconnects with the stored token, T the full current picture is restored from the server within 2 s (no client-side state needed).
**US-NF-2 Scale.** 1 DS + 6 trainees at 1 Hz (×4 speed = 4 ticks/s) with no backlog; server tick ≤ 50 ms p95.
**US-NF-3 Accessibility.** All controls keyboard-reachable with visible focus; text contrast ≥ 4.5:1; link states use text + icon + pattern, never colour alone.
**US-NF-4 Offline.** No runtime request leaves the host (fonts bundled, no tiles, no CDN).

### 5.7 Optional AI layer (Smart Automation)
**US-AI-1** G `LLM_PROVIDER=none`, T every feature works using deterministic templates (report variants, AAR narrative, rationale feedback).
**US-AI-2** G `LLM_PROVIDER=ollama|anthropic` and the provider reachable, W DS clicks *Generate contradictory pair* in the composer or opens the AAR, T text is produced by the provider and labelled **"AI-generated draft"**; on any provider error the template output is used and labelled "template".

## 6. Domain model & event schema

### 6.1 Core types (abridged; full Zod in `packages/shared`)
```ts
Cell      = "A1".."H8"            // col A–H (x 0–7), row 1–8 (y 0–7), 1 cell = 1 km (fictional)
Vec       = { x: number; y: number }   // continuous, cell centre = (col+0.5, row+0.5)
Side      = 'BLUE' | 'RED'
UnitType  = 'HQ'|'INFANTRY'|'MECH'|'ARMOUR'|'RECCE'|'ARTILLERY'|'ENGINEER'|'EW_DET'|'UAV'|'AIR'|'SHIP'|'CONVOY'|'SENSOR'
Unit      = { id, side, callsign, type, count, strength, ownerRole?, decoy?, displayType?, speed,
              track: Keyframe[] /* {tMs, pos} piecewise-linear */, status: 'ACTIVE'|'DESTROYED'|'WITHDRAWN' }
Channel   = { id, label, band: 'VHF'|'UHF'|'L'|'SHF'|'HF'|'NONE', digital, losSensitive, messaging,
              members: NodeId[], baseLatencyS, jitterS, baseDrop, baseCorrupt }
Jammer    = { id, pos: Vec, radius, bands: Band[], power, active }
Inject    = { id, type: 'DELAY'|'DROPOUT'|'INTERMITTENT'|'CONFLICT'|'SPOOF'|'MISSING'|'STALE',
              channels: ChannelId[], roles: RoleId[] /* [] = all */, durationS,
              params: { delayS?, periodS?, staleS?, targetCell?, count? }, label }
CyberEvent= { id, kind: 'C2_OUTAGE'|'DATALINK_COMPROMISE'|'GPS_SPOOF', durationS, role?, driftCells? }
IntelItem = { id, kind: 'CONTACT'|'NEGATIVE'|'POSREP'|'INFO'|'RECON'|'INTENT'|'MESSAGE',
              sourceLabel, channel, observedAtMs, sentAtMs, deliveredAtMs, cell?, cellUncertain?,
              side?, unitType?, count?, confidence: 'H'|'M'|'L', text, corrupted, forwardedBy? }
```
`PerceivedPicture` (the **only** trainee payload) = `{ sessionCode, role, callsign, phase, tMs, speed,
ownUnit, friendlies (from POSREPs), contacts, conflicts, intel, messages, links (per PACE channel),
activeChannel, cutOff, intent (version, text, receivedAtMs), decisions (own), probe (own questions),
spectrum (EW only, partial), airStatus (ALO only, partial) }`.

### 6.2 Event envelope (append-only)
```ts
{ id: string /* uuid */, sessionId: string, seq: number /* 1..n, gapless per session */,
  t_sim_ms: number /* sim clock at application, multiple of 1000 */, t_wall: string /* ISO */,
  type: EventType, actor: 'DS' | RoleId | 'SYSTEM', payload: object }
```
**Input events (persisted, replayed):** SESSION_CREATED {scenario snapshot, seed, enabledRoles} ·
ROLE_JOINED · ROLE_LEFT · EXERCISE_STARTED · EXERCISE_PAUSED · EXERCISE_RESUMED · SPEED_SET ·
EXERCISE_ENDED · INTENT_SET · INJECT_FIRED · MSEL_FIRED · MSEL_EDITED · MSEL_SKIPPED · JAMMER_PLACED · JAMMER_MOVED ·
JAMMER_TOGGLED · JAMMER_REMOVED · CYBER_TRIGGERED · MESSAGE_SENT · INTEL_FORWARDED ·
CONFLICT_FLAGGED · VERIFICATION_REQUESTED · PACE_SWITCHED · DECISION_MADE · INTENT_UPDATED ·
FREQ_HOP · PROBE_STARTED · PROBE_ANSWERED · PROBE_ENDED.

**Derived journal (re-derived on replay, exported, never persisted as input):** REPORT_GENERATED ·
MSG_DELIVERED · MSG_DROPPED · MSG_CORRUPTED · LINK_STATE_CHANGED · CUTOFF_START · CUTOFF_END ·
INJECT_EXPIRED · MSEL_AUTOFIRED · ADJUDICATED · ENGAGEMENT · STRIKE · FEATURE_CHANGED.

**Replay rule:** `for e in log (by seq): while state.t < e.t_sim_ms: step(); apply(e)`; then step to the end time.
State hash (FNV-1a over canonical JSON) must match the live run.

## 7. Degradation & EW model

### 7.1 Channels (defaults; scenario may override)
| Channel | Band | Digital | LOS | Messaging | Members (default) | Base latency | Jitter | Base drop | Base corrupt |
|---|---|---|---|---|---|---|---|---|---|
| CMD_NET | VHF | no | yes | yes | CDR, PL_A, PL_B, ALO, EW, NLO | 3 s | ±2 s | 0.02 | 0.02 |
| PL_NET_A | VHF | no | yes | yes | CDR, PL_A, EW | 2 s | ±1 s | 0.02 | 0.02 |
| PL_NET_B | VHF | no | yes | yes | CDR, PL_B, EW | 2 s | ±1 s | 0.02 | 0.02 |
| HF_NET | HF | no | no | yes | HHQ + all roles | 10 s | ±4 s | 0.08 | 0.08 |
| SATCOM | SHF | yes | no | yes | HHQ, CDR, ALO, EW, NLO | 20 s | ±5 s | 0.01 | 0.01 |
| ISR_DATALINK | L | yes | no | feed | UAV → ALO, CDR | 5 s | ±2 s | 0.03 | 0.02 |
| GROUND_SENSOR | UHF | yes | yes | feed | sensors → CDR, PL_A, PL_B | 8 s | ±3 s | 0.03 | 0.03 |
| RUNNER | NONE | no | no | yes | all | 120 s + 45 s × distance(cells) | ±10 s | 0 | 0 |

`HF_NET` is an addition beyond the minimum list (DECISIONS D-006) so PACE plans have a real contingency.

### 7.2 PACE plans (default)
| Role | Superior | P | A | C | E |
|---|---|---|---|---|---|
| CDR | HHQ | CMD_NET | SATCOM | HF_NET | RUNNER |
| PL_A | CDR | CMD_NET | PL_NET_A | HF_NET | RUNNER |
| PL_B | CDR | CMD_NET | PL_NET_B | HF_NET | RUNNER |
| ALO | CDR | CMD_NET | SATCOM | HF_NET | RUNNER |
| EW | CDR | CMD_NET | PL_NET_B | HF_NET | RUNNER |
| NLO | CDR | SATCOM | CMD_NET | HF_NET | RUNNER |

**Cut-off:** `cutOff(r) ⇔ ∀ c ∈ channels, c ≠ RUNNER, c.messaging, {r, superior(r)} ⊆ c.members : linkState(c, r, superior(r)) = DENIED`.

### 7.3 Pipeline (per item, per recipient; seeded PRNG `mulberry32(state.rng)`)
1. **Link state** `L ∈ {CLEAR=0, DEGRADED=1, DENIED=2}` = best path (direct, or via one relay) where a path's state = worst leg; leg state = max over jammers, LOS, cyber, manual injects (§7.4–7.6). `MISSING` inject ⇒ silent drop (link still reported CLEAR).
2. **Latency** `λ = base + U(−j, +j) + [L=1]·(30 + 2·base) + Σ delayInjects + [viaRelay]·1`, min 0.5 s; delivery at first tick ≥ `sentAt + λ`.
3. **Drop** `p = min(0.95, baseDrop + [L=1]·0.4·power_max)`; `L=2` ⇒ drop (reason `LINK_DENIED`); `INTERMITTENT` off-window ⇒ L=2.
4. **Corruption** `p_c = baseCorrupt + [L=1]·0.25`. Contact: one of {count→unknown, type→UNKNOWN, cell→`D?` (`cellUncertain`)}; text: 30 % of words → `~~~`.
5. **Conflict generation** while a `CONFLICT` inject is active for (channel, recipient): each contact spawns a contradictory twin (count ±2..4, or type ARMOUR↔INFANTRY, or cell shifted 1) from source "UNCONFIRMED". With `targetCell`, an immediate conflicting pair is created for that cell.
6. **Staleness stamping** `age = now − observedAt`; `STALE` inject shifts `observedAt` back by `staleS` (default 300) and builds content from truth at that earlier time. UI marks age > 300 s as STALE.

### 7.4 EW model
`Jammer {id, pos, radius, bands[], power, active}`; effective radius `R = radius × power`.
For a leg with endpoints `a, b` on band `β ∈ jammer.bands`: `d = min(|a−J|, |b−J|) / R`.
`d ≤ 0.5 ⇒ DENIED`; `0.5 < d ≤ 1 ⇒ DEGRADED` (heavy delay + 40 % × power drop); `d > 1 ⇒ no effect`.
**Frequency hop** (EW role, per channel): for 60 s reduces jamming one level (DENIED→DEGRADED→CLEAR); cooldown 180 s.
**Relay**: one EW relay node (movable by EW RELAY decision) plus any role currently acting as relay; a path via relay counts if both legs pass.
**Spectrum panel (EW only):** for each active jammer within 4 cells of the EW unit: band(s), approximate cell (true cell offset by a deterministic ±1), strength LOW/MED/HIGH. Never exact position.

### 7.5 Terrain line-of-sight
For LOS-sensitive channels, a leg is DENIED if the segment between endpoints passes through a ridge cell (`^`) other than the endpoints' own cells (sampled every 0.1 cell). HF / SATCOM / datalink are unaffected (airborne/sky-wave abstraction).

### 7.6 Cyber events
- `C2_OUTAGE(durationS)`: all `digital` channels DENIED for all nodes.
- `DATALINK_COMPROMISE(durationS)`: ISR_DATALINK delivers spoofed contacts (1 per 30 s near objective cells) and 50 % of genuine UAV contacts are displaced by 1–2 cells. Spoof is flagged only in truth.
- `GPS_SPOOF(role, driftCells, durationS)`: role's own-unit **perceived** position (and its POSREPs) offset by a deterministic vector of length `driftCells`, ramping in over 60 s; movement orders issued during spoofing land at `target − drift` in truth.

### 7.7 Information generation (truth → reports)
- **Sensors** (UAV, ground sensor, coastal radar, observation post) sweep every `intervalS`, observe hostile units within `rangeCells` (truth position), and emit CONTACT reports grouped by cell and perceived type. Decoys appear as their `displayType` unless `discriminatesDecoys`; discriminating ground sensors emit NEGATIVE ("no heavy-vehicle signature") for covered cells with no real vehicles — a natural UAV-vs-sensor conflict. Reports are sent on change and every 5th sweep (refresh, so a dropped report is eventually re-sent).
- **Own observation**: each blue unit observes hostiles within its visual range (1 cell; recce 2) every 30 s into its owner's picture (OWN OBS, no channel); within 0.6 cells decoys are recognised as "possible decoys".
- **POSREPs**: each role's unit auto-reports its (perceived) position to its superior every 60 s via its active channel.
- **Scripted reports** from scenario (e.g., naval ISR via SATCOM).
- **Conflict detection** (projection): two delivered items from *different sources* conflict if observed within 600 s of each other and either (a) same cell and they disagree (CONTACT vs NEGATIVE/zero-recon; type mismatch; count differs by ≥ 2), or (b) adjacent cells, both CONTACT with identical type and count within 60 s ("same group reported at two locations" — catches displaced/spoofed copies).

## 8. Adjudication rules (table-driven, deterministic, explainable)

Notation: `H(S)` = real (non-decoy, active) hostile strength in sector S + 0.5 × in 8-neighbours, at decision time (truth).
`O` = acting unit strength. `ρ = H(S) / max(O, 1)`.

| # | Action | SOUND | RISKY | UNSOUND | Effect |
|---|---|---|---|---|---|
| R1 | ADVANCE S | ρ < 0.75 | 0.75 ≤ ρ < 1.5 | ρ ≥ 1.5 | unit moves to S; on arrival **engagement** (below) |
| R2 | REPOSITION S | ρ < 0.75 | 0.75 ≤ ρ < 1.5 | ρ ≥ 1.5 | moves to S; engagement on arrival |
| R3 | HOLD | own-sector ρ < 1.5 and not (intent SEIZE ∧ objective ρ < 0.75 ∧ t < deadline) | otherwise | — | none |
| R4 | WITHDRAW S | own-sector ρ ≥ 1.5 | otherwise | — | moves to S |
| R5 | CALL_AIR S | air on station ∧ real hostiles in S ∧ no friendlies in S | air on station ∧ (no real hostiles in S) · or air not on station ("no air cover") | friendlies in S (fratricide risk) | strike after 60 s: real hostiles in S −60 % strength, decoys destroyed, friendlies in S −30 % |
| R6 | REQUEST_RECON S | always (cheap) — noted "verified" if S had an open conflict | — | — | after 90 s a truthful RECON report (decoys discriminated, confidence H) is sent from S to the requester through degradation. ALO: retasks UAV to S. NLO: retasks coastal radar. |
| R7 | RELAY | restores ≥1 cut-off/denied link | no link change | — | EW: relay node moves to S; others: own unit becomes a relay for VHF nets |
| R8 | SWITCH_CHANNEL c | current active is DENIED/DEGRADED and c is better | c is no better | c is DENIED | active channel := c |
| R9 | ALO first CALL_AIR / air request | — | — | — | air on station at `max(availableFrom (T+15), t + 120 s)` |

**Engagement on arrival** (deterministic): `ρ ≥ 1.5`: own −40 %, unit halts one cell short (repulsed). `0.75 ≤ ρ < 1.5`: own −15 %, hostile −25 %. `ρ < 0.75`: own −5 %, hostile −50 %; hostile < 30 strength ⇒ destroyed. Decoys in S are exposed and removed (journal).
Outcome value for calibration: SOUND = 1, RISKY = 0.5, UNSOUND = 0.

## 9. Metrics definitions

1. **Decision latency** (per role r). Trigger events for r: injects/cyber affecting r, CUTOFF_START for r, link state of r's active channel worsening. For trigger at `t_e`: `L_e = t(first decision by r after t_e) − t_e` if ≤ 600 s, else "no response". Report mean, median, no-response count.
2. **Verification behaviour.** Contested decision = decision whose `basedOn` or frozen picture contains an item in an open conflict. Verified = role flagged that conflict or requested verification of an involved item/cell before deciding. `VR_r = verified / contested` (n/a if 0). Also counts of flags and verifications.
3. **Confidence calibration (Brier).** `B_r = (1/N) Σ (c_i/100 − o_i)²`, `o ∈ {1, 0.5, 0}`; team = over all decisions. Over/under-confidence `= mean(c/100) − mean(o)`.
4. **Intent adherence** per decision `a ∈ {0, 0.5, 1}`: target in forbidden cells ⇒ 0; ADVANCE/REPOSITION closer to nearest objective ⇒ 1, same ⇒ 0.5, farther ⇒ 0; HOLD ⇒ 1 if intent DEFEND else 0.5; WITHDRAW ⇒ 1 if PRESERVE else 0; REQUEST_RECON / CALL_AIR on or adjacent to objective ⇒ 1 else 0.5; RELAY / SWITCH_CHANNEL ⇒ 1.
5. **Intent adherence while cut off** `IA_r = mean(a_i | cutOff_i)`; plus self-awareness = share of decisions where self-assessment matches (`yes ⇔ a ≥ 0.5`).
6. **SA accuracy per probe** `A_{r,p} = mean(score_q)`; scores: numeric exact 1 / ±1 0.5 / else 0; cell exact 1 / adjacent 0.5 / else 0; categorical exact 1 else 0; "unknown" 0.
7. **SA divergence** for roles r, s on common questions Q_c: `D_{r,s} = mean_q d_q`, `d_q = 0` if equal; numeric `min(1, |a−b| / max(a, b, 1))`; cell `0.5` if adjacent else 1; unknown vs anything = 1. Team divergence = mean over pairs.
8. **Comms** per role and channel: sent, delivered, dropped (by reason: LINK_DENIED / PROBABILISTIC / MISSING), corrupted, delivery ratio, mean latency, forwards (relayed), PACE switches.
9. **Outcome**: objective cells held by BLUE at end; friendly/hostile strength remaining (%).
10. **Sustain / Improve rules** (top 3 each by magnitude): sustain if `VR ≥ 0.6`, `Brier ≤ 0.15`, `IA_cutoff ≥ 0.75`, `SA ≥ 0.7`, `PACE switch within 60 s of denial`; improve if the opposite thresholds (`VR < 0.4`, `Brier > 0.25`, overconfidence > 0.15, `IA_cutoff < 0.5`, `SA < 0.5`, divergence > 0.4, no-response ≥ 2).

## 10. Scenario spec format

Scenarios are JSON files in `/scenarios`, validated by `ScenarioSchema` (Zod) at server start — invalid files are rejected with a path-specific error; new scenarios need no code change.
```jsonc
{
  "id": "iron-bridge", "title": "Iron Bridge", "theatre": "Joint · plains/riverine",
  "summary": "...", "durationMin": 30, "defaultSeed": 2611,
  "brief": { "situation": "...", "mission": "...", "execution": "...", "sustainment": "...", "command": "..." },
  "terrain": ["..F.~...", "...", 8 rows of 8 chars],   // . open F forest U urban ~ river = bridge ^ ridge W sea M marsh H hills
  "features": [{ "id": "bridge-e5", "kind": "BRIDGE", "cell": "E5", "label": "Iron Bridge", "destroyAtS": 1200, "unlessBlueIn": ["E5","E4"] }],
  "intent": { "text": "...", "objectiveCells": ["E5"], "forbiddenCells": ["E1"], "priority": "SEIZE", "deadlineS": 1200 },
  "objectives": [{ "id": "obj-1", "text": "Secure bridgehead E5", "cell": "E5" }],
  "roles": [{ "id": "CDR", "title": "Sub-unit Commander", "callsign": "KESTREL 6", "superior": "HHQ", "unitId": "b-hq", "pace": ["CMD_NET","SATCOM","HF_NET","RUNNER"], "optional": false }],
  "nodes": [{ "id": "HHQ", "label": "Higher HQ", "pos": { "x": -2, "y": 4 } }, { "id": "RELAY-1", "label": "Rebro", "cell": "C4", "relay": true }],
  "units": [{ "id": "r-armour-1", "side": "RED", "callsign": "HOSTILE ARMOUR GP", "type": "ARMOUR", "count": 6, "strength": 150,
              "waypoints": [{ "atS": 0, "cell": "F3" }, { "atS": 600, "cell": "E3" }] },
            { "id": "r-decoy-1", "side": "RED", "type": "ARMOUR", "decoy": true, "count": 4, "strength": 0, "waypoints": [...] }],
  "sensors": [{ "id": "uav-1", "kind": "UAV", "label": "UAV HERON-X", "channel": "ISR_DATALINK", "cell": "D4", "rangeCells": 2.5,
                "intervalS": 45, "deliverTo": ["ALO","CDR"], "discriminatesDecoys": false, "ownerRole": "ALO" }],
  "channels": { "CMD_NET": { "baseLatencyS": 3 } },   // optional overrides
  "air": { "availableFromS": 900, "responseS": 120, "sorties": 2 },
  "scriptedReports": [{ "atS": 240, "from": "NAVAL-ISR", "channel": "SATCOM", "to": ["CDR","NLO"], "kind": "CONTACT", "cell": "H6", "unitType": "SHIP", "count": 2, "text": "..." }],
  "msel": [{ "id": "M01", "atS": 360, "title": "Hostile jammer active", "action": { "kind": "JAMMER", "jammer": {...} } },
           { "id": "M02", "atS": 720, "title": "C2 outage", "action": { "kind": "CYBER", "cyber": { "kind": "C2_OUTAGE", "durationS": 120 } } },
           { "id": "M03", "atS": 300, "title": "Delay on SATCOM", "action": { "kind": "INJECT", "inject": {...} } }],
  "probeBank": [{ "kind": "HOSTILE_COUNT", "cell": "D4" }, { "kind": "FEATURE_STATUS", "featureId": "bridge-e5" }, ...]
}
```
Each template must have ≥ 12 MSEL items covering all 7 inject types + jammer + all 3 cyber kinds (validated by a test).

## 11. UX flows & screens

Aesthetic: dark "ops-room" slate (not pure black), single amber accent for DS actions, BLUE/RED force colours paired with NATO-style frame shapes (rectangle friendly, diamond hostile) so colour is never the only signal; IBM Plex Sans for UI, IBM Plex Mono for data (bundled via @fontsource). No gradients, no glassmorphism.

| Screen | Route | Wireframe |
|---|---|---|
| Landing | `/` | Title block + one-liner; two large cards: *Create exercise (Instructor)* / *Join exercise (Trainee)*; footer disclaimer. |
| Create | `/create` | Scenario list (cards: title, theatre, duration, roles) → detail with brief excerpt, role toggles, seed → *Create* → code + PIN panel (copy buttons) → *Open DS console*. |
| Join | `/join` | Code input (auto-uppercase) → scenario title + role radio list (taken roles disabled with callsign) + callsign input → *Join*. |
| Trainee console | `/play/:code` | Top bar: callsign · role · T+ clock · phase · speed · link chips. Left (≈60 %): SVG map. Right column: intent card (sticky) then tabs *Intel · Comms · Decide · Log*. Cut-off banner spans top. Probe overlay blanks the screen. |
| DS console | `/ds/:code` | Top bar: code, phase, clock, pause/resume, speed ×1/×2/×4, *Freeze & probe*, *End exercise*. Left: map with *Truth / View as …* switcher and map tools (place/move jammer). Right tabs: *Injects* (composer + cyber), *MSEL*, *Decisions*, *SA & Comms* (heatmap, health, stats), *Roster*. |
| AAR | `/aar/:code` | Header + exports; sections 1–4; swimlane timeline; decision cards (reveal toggle); metrics tables + bar charts; network graph; replay map with scrubber and view toggle. |

Keyboard: all actions reachable by Tab; map cells are focusable buttons (arrow keys move focus) so jammer placement and target selection work without a mouse.

## 12. Architecture & API

See `docs/ARCHITECTURE.md` (Mermaid) and `docs/API.md`.

**REST** (JSON, Zod-validated):
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/healthz` | – | liveness + store type |
| GET | `/api/scenarios` | – | list scenario summaries |
| POST | `/api/sessions` | – | create `{scenarioId, seed?, enabledRoles?}` → `{code, pin, instructorToken}` |
| POST | `/api/sessions/:code/instructor` | – | `{pin}` → `{instructorToken}` |
| GET | `/api/sessions/:code/lobby` | – | phase, title, roles `{id,title,taken,callsign}` |
| POST | `/api/sessions/:code/join` | – | `{roleId, callsign}` → `{playerToken, roleId}` |
| GET | `/api/sessions/:code/aar` | DS any time / trainee after END | AAR JSON |
| GET | `/api/sessions/:code/aar.pdf` | same | PDF |
| GET | `/api/sessions/:code/events.json` | same | input log + derived journal |
| GET | `/api/sessions/:code/decisions.csv` | same | CSV |
| GET | `/api/sessions/:code/replay?view=truth\|<role>&stepS=10` | same | frames |
| POST | `/api/ai/report-variants` | DS | contradictory report pair (template or AI) |
Auth header: `Authorization: Bearer <token>`.

**Socket.IO** (`/socket.io`, `auth: {code, token}`): rooms `s:<code>:ds`, `s:<code>:role:<id>`.
Server → client: `picture` (PerceivedPicture, trainee rooms, every tick + on change), `ds:state` (truth + feeds, DS room), `ds:viewAs` (selected role's picture), `lobby` (roster), `ended`.
Client → server: `cmd` (Zod discriminated union, ack `{ok, error?}`): DS — `START, PAUSE, RESUME, SET_SPEED, END, FIRE_INJECT, MSEL_FIRE_NOW, MSEL_SKIP, MSEL_EDIT, PLACE_JAMMER, MOVE_JAMMER, TOGGLE_JAMMER, REMOVE_JAMMER, TRIGGER_CYBER, START_PROBE, END_PROBE, VIEW_AS, SET_INTENT`; trainee — `SEND_MESSAGE, FORWARD_INTEL, FLAG_CONFLICT, REQUEST_VERIFICATION, SWITCH_PACE, MAKE_DECISION, UPDATE_INTENT (CDR), FREQ_HOP (EW), ANSWER_PROBE`. Commands from a role are rejected if not permitted for that role.

**Tick loop:** `setInterval(1000 / (TICK_HZ × speed))` → `sim.step()` → project per connected role → emit. Inputs are applied at the current tick boundary with `t_sim_ms = state.tMs`, persisted (append) before broadcasting.

**Persistence:** `EventStore` interface — `PrismaEventStore` (PostgreSQL) when `DATABASE_URL` set, else `MemoryEventStore`. On boot, non-ended sessions are rehydrated by replay (paused).

## 13. Security & safety
- **Ground-truth isolation:** trainee sockets only ever receive `project()` output; DS room events are emitted to a room trainees cannot join (role bound to token server-side; client-sent role ignored). Automated **leak test** joins as each role, records every payload, and asserts no forbidden keys (`decoy`, `strength`, `track`, `waypoints`, `msel`, `truth`, `spoofed`, `jammers` (exact), `rng`) and no hidden identifiers (RED unit ids, un-fired MSEL ids/titles, decoy flags) appear in any serialized payload.
- **Auth:** tokens are 256-bit random, stored hashed (SHA-256); PIN 6 digits, rate-limited (5 attempts / min / IP). No passwords, no PII beyond a callsign.
- **Input validation:** every REST body and socket command is Zod-validated; text fields length-capped and rendered as text (no HTML).
- **Synthetic content:** fictional grid, callsigns and ORBAT; disclaimer in footer, AAR and PDF.
- **Secrets:** none in repo; `.env.example` only; secret scan before push.
- **AI:** provider calls contain only synthetic scenario text; disabled by default.

## 14. Test plan
| Level | Scope | Tooling | Gate |
|---|---|---|---|
| Unit — sim | PRNG, grid/LOS, channels/link state, jammer zones, freq hop, relay, cyber, pipeline (latency/drop/corrupt/conflict/stale), sensors, projection (no truth fields), adjudication table, engagement, probes & scoring, metrics formulas, MSEL auto-fire, **determinism** (same seed + log ⇒ same hash), scenario MSEL coverage | Vitest + v8 coverage | ≥ 90 % lines |
| Unit — shared | Zod schemas accept both scenarios, reject malformed | Vitest | green |
| Integration — server | REST lifecycle, join races, socket rooms, role permissions, tick loop, reconnect, **ground-truth leak test**, AAR/PDF/CSV/JSON endpoints, replay endpoint, store (memory; Prisma when `DATABASE_URL` set — CI Postgres service) | Vitest + socket.io-client + Fastify inject | green |
| Unit — web | formatters, store reducers, key components | Vitest (+ jsdom) | green |
| E2E | DS + 3 trainees (separate browser contexts): create → join → start ×4 → place jammer on PL_B → PL_B sees CUT OFF → PL_B decision → probe → answers → end → AAR → PDF downloads and contains "Decision" cards | Playwright | green locally + CI |
| A11y | axe-core on landing, join, console, DS, AAR (no serious/critical) + Lighthouse a11y | Playwright + @axe-core | ≥ 90 Lighthouse a11y |

## 15. Deployment plan
- Single multi-stage `Dockerfile` (node:20-bookworm-slim): build web + server → runtime image serving web from Fastify.
- `docker-compose.yml`: `app` + `db` (postgres:16-alpine, healthcheck) + optional `ollama` (profile `ai`). Fully offline after images are pulled.
- Container start: `prisma migrate deploy` → seed demo if DB empty and `SEED_DEMO_ON_EMPTY=true` → `node dist/index.js`.
- **Render** Blueprint `render.yaml`: one Docker web service (WebSockets supported natively), health check `/healthz`, Render Postgres, env vars. Fallback Railway/Fly.io.
- CI: GitHub Actions — install, lint, typecheck, unit (with Postgres service for store test), build, Playwright E2E.

## 16. Milestones
| Phase | Deliverable | Exit criteria |
|---|---|---|
| 0 | Monorepo scaffold, CLAUDE.md | lint/typecheck/test green |
| 1 | PRD, ARCHITECTURE, DECISIONS | docs committed |
| 2 | `packages/sim` complete | ≥ 90 % coverage, determinism test |
| 3 | Server (REST, sockets, tick, store, leak test) | integration tests green |
| 4 | Trainee web app | manual + unit checks; preview verified |
| 5 | DS console | view-as-role, injects, jammers, MSEL, probes |
| 6 | AAR + exports | PDF/JSON/CSV endpoints tested |
| 7 | 2 scenarios + AI layer | scenario validation + MSEL coverage tests; `none` works |
| 8 | E2E + a11y | Playwright green |
| 9 | Docker + seed:demo | clean-clone `docker compose up` |
| 10 | GitHub + CI | green CI on first push |
| 11 | Render deploy + smoke | smoke test recorded |
| 12 | README, DEMO_SCRIPT, PITCH_NOTES, screenshots | DoD checklist |

## 17. Risks & mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Scope too large for hackathon timeline | Unfinished features | Sim-first; every feature behind a tested pure function; phases gated |
| Ground-truth leak through a new field | Breaks the core premise | Single projection function + leak test in CI |
| Non-determinism (float, iteration order, wall clock) | Replay/AAR mismatch | Fixed step, seeded PRNG in state, sorted iteration, hash test |
| WebSocket drops on venue Wi-Fi | Trainees lose picture | Full-snapshot pictures each tick; token reconnect |
| Render free tier sleeps / cold start | Demo stalls | Seeded demo + Docker offline fallback on a laptop |
| No Docker on dev machine | Can't verify compose locally | CI builds the image; documented verification steps |
| Map library WebGL issues on DSSC PCs | Blank map | SVG grid map (no WebGL), see D-001 |
| LLM unavailable offline | AI features fail | `none` default; template fallback on any error |
| Content perceived as sensitive | Approval risk | Fully fictional, abstract effects, disclaimers |

## 18. Out of scope (v1) & future
- **WebXR "3D sand-model view"** (future): a headset client renders the scenario terrain grid as a tabletop sand model with unit markers. The data layer already supports it: any client authenticates with a session token over Socket.IO and subscribes to the same `picture` (trainee) or `ds:state` (DS) frames, which carry grid-cell coordinates, terrain codes and per-cell elevation class — no server change needed beyond a new client.
- Voice push-to-talk over degraded nets (audio delay/clipping through the same pipeline).
- AI-adaptive OPFOR (hostile units react to trainee decisions).
- Scenario editor UI (v1: JSON files + validation).
- Multi-sub-unit (battalion) exercises with >6 roles; SSO/LDAP auth.


---

## Addendum v1.1 (2026-10-05) — after first user test

Changes requested after hands-on testing of the deployed build; each is logged in `DECISIONS.md`.

**A1. Map (D-016).** The tactical map is MapLibre GL (offline GeoJSON on a blank style, HTML markers, no tiles/glyphs) with pan/zoom/rotate, a 3D tilt that extrudes ridges/hills/urban blocks, unit movement tweened between ticks, hover highlight and a **sector popup** on click (terrain, units/contacts in the sector, what this role has heard about it). The SVG map remains as an automatic fallback without WebGL.
*AC:* G a trainee clicks any sector, T a popup lists that sector's contents and the decision target is set; G units move, T they glide between ticks instead of jumping.

**A2. 3D sand table + WebXR (was §18 future).** A "3D · VR" toggle renders the same role-scoped data as a Three.js sand table (terrain blocks by elevation, unit tokens, jammer domes, link arcs, objective flags; click a token for details). On WebXR devices **Enter VR** places the table in front of the user and **Enter AR** places it in the room. Trainees still see only their perceived picture.

**A3. Adaptive OPFOR §8.1 (D-017).** With session setting `opfor=adaptive` (default), hostile units with a behaviour react every 30 s by deterministic rules: `reserve` counter-attacks the objective BLUE threatens (resolved on arrival with a force-ratio table), `defend` falls back from ≥1.5× BLUE strength, `shoot-and-scoot` relocates after being spotted/struck (180 s cooldown), `probe` shadows the nearest BLUE unit. Reactions are journaled (`OPFOR`) and shown in the AAR timeline.

**A4. Exercise variables (D-020, PS outcome 3).** At creation the DS sets EW intensity (jammer radius ×0.75/×1/×1.3), sensor reliability, comms quality, OPFOR mode and which MSEL items are active. Stored in `SESSION_CREATED.settings`; replay-safe.

**A5. AI layer (D-018).** Providers: `none` (default, templates) · `groq` · `cerebras` · `xai` (OpenAI-compatible, free tiers) · `openai` (any compatible endpoint) · `ollama` (offline) · `anthropic`. New **AI inject advisor** (US-DS-10): G a running exercise, W the DS clicks *Suggest next inject*, T up to 3 suggestions appear, each tied to a training objective (mission command, verification, PACE, SA, navigation, digital resilience, report age) with a reason derived from live state and one-click *Apply*; with a provider configured an "AI-generated draft" DS briefing is added. AAR narrative/coaching drafts run only for ended exercises.

**A6. Restart safety (D-019).** A `CLOCK_CHECKPOINT` input event every 30 sim-seconds bounds sim time lost on a server restart to ≤ 30 s.

**A7. Scale (measured).** One Node process ran 40 concurrent exercises (210 connected sockets) at ×4 for 45 s: sim clock at 96 % of real time, RSS 170 MB, event-loop p99 42 ms (`pnpm --filter @vanguard/server loadtest`). A full DSSC course (~70 syndicates) at ×1 fits on one server; no horizontal scaling planned.

**Assessed, not in scope:** voice push-to-talk (high effort and risk, low marginal value over degraded text nets); full scenario editor and cross-course analytics (JSON scenarios + exercise variables cover SIH needs).
