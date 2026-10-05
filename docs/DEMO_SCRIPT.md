# 3-minute judge demo

**Setup (before judges arrive):** if using the Render URL, open it once ~2 minutes early (free tier sleeps when idle). Unlock *Scenarios*/*Analytics* with your ADMIN_KEY in the same browser beforehand. the app open on a laptop (local `pnpm start` or the deployed URL), plus
two more browser windows or devices. In window A: *Create exercise* → Iron Bridge → note the code. In
windows B/C: *Join* as **KESTREL 6 (CDR)** and **KESTREL 2 (PL B)**. Keep a fourth tab ready on the
landing page for the finished-demo AAR.

| Time | Screen | Do | Say |
|---|---|---|---|
| 0:00 | Landing | Drag the hero divider from right to left | "Same sand model, two truths: on the left what really is there, on the right what KESTREL 2 sees — fog, a stale contact, a jammed link, decoys reported as armour. Contemporary conflicts show EW and cyber degrade comms exactly when junior commanders must decide. TEWTs and CPXs assume perfect information. VANGUARD OPS trains deciding under fog." |
| 0:15 | DS console (A) | Show roster (2 trainees online) → **Start exercise** → **×4** | "This is a closed wargame. The DS sees ground truth — including that these 5 'tanks' at D6 are decoys." (point at dashed decoy diamond) |
| 0:35 | CDR (B) | Show map + Intel tab | "The commander sees something else: a UAV report of 5 armour at D6 *and* a ground sensor saying no vehicles — side by side, flagged as a conflict, each with source and age." |
| 0:55 | DS (A) | Map tool **place jammer** → click **G2** → Activate | "I put a hostile jammer here. Link degradation is computed from geometry and band, not a toggle." Point at the red ✕ on the CDR–PL B link. |
| 1:10 | PL B (C) | Banner **CUT OFF — ACT ON INTENT** | "PL B has lost VHF and HF to his commander. This is mission command." Decide → Advance → click **F4** → rationale → confidence 70 → Yes → **Commit**. |
| 1:35 | DS (A) | **Decisions** tab → expand the new decision | "The DS sees it live with a ground-truth badge — and what PL B could actually know at that moment." Click **PL_B ✕** in *View as*: "I can see exactly his screen." |
| 1:45 | DS (A) | **3D · VR**, then **Injects → Suggest next inject** | "Same data as a 3D sand table — on a Quest or Android phone it opens in VR/AR; trainees get the 3D view of *their* picture only." Back to **Map**: "The AI advisor proposes the next friction for a training objective — one click to apply." |
| 1:55 | DS (A) | **Freeze & probe** | "SAGAT freeze: screens blank, everyone answers questions about the situation, scored against truth — individual SA and how far the team's pictures diverge." (Show the probe on B, then **Score & resume**.) |
| 2:15 | Demo AAR tab | Landing → **Watch a finished exercise’s debrief** | "Here's a full 21-minute exercise. AAR follows the four Army questions." Scroll: exec summary, swimlanes. |
| 2:35 | AAR | Decision card → **Reveal ground truth** | "Hindsight-safe: we judge on what was knowable, then reveal truth. Confidence is calibrated — Brier score." |
| 2:50 | AAR | Click **PDF** | "Exportable PDF, JSON event log and CSV. Fully offline in Docker; AI is optional." If time: open **Analytics** — "every exercise across courses, by role and difficulty" — and **Scenarios** — "course directors write their own scenarios, validated with a dry run". |

## Judge Q&A cheat-sheet

**Web or VR?** Both. It runs in any browser on ordinary DSSC PCs with zero install, and the same page offers a **3D sand table with Enter VR / Enter AR** on WebXR devices (Meta Quest browser, Android Chrome). The training value is the *information* friction, so VR is an immersive view of the same role-scoped picture, not a separate product.

**How is ground truth protected?** It never leaves the server. Each socket is bound by the server to one role from its token; trainee rooms only ever receive the output of a single `project(state, role)` function. An automated leak test joins as every role, runs jammers, all inject types, cyber and probes, and asserts no truth field, hidden unit id or un-fired inject appears in any of >100 payloads — it runs in CI on every push.

**How is hindsight bias avoided?** At the moment of each decision we freeze what that role could know — delivered intel with ages, open conflicts, degraded nets, cut-off status, intent version — and store it with the rationale and confidence. The AAR shows that first; ground truth and the adjudicated outcome are revealed only on demand. Metrics like verification behaviour and calibration judge the *process*, not just the result.

**How does it work offline?** One Docker image (server + built web app) and Postgres via `docker compose up`. Fonts are bundled, the map is SVG (no tiles, no CDN), PDF uses built-in fonts. CI builds the image and runs the compose stack on every push.

**What is the AI doing, and does it work without it?** An **inject advisor** for the DS (rule-based suggestions tied to training objectives, plus an AI briefing on free-tier Groq/Cerebras or offline Ollama) and drafting: AAR narrative, per-decision coaching notes, and contradictory report pairs for the DS. `LLM_PROVIDER=none` is the default and every feature works on deterministic templates; with Ollama it stays fully offline. AI text is always labelled "AI-generated draft", and anything that affects the exercise is recorded in the event log so replays stay deterministic.

**Does the enemy react?** Yes — deterministic rules: reserves counter-attack an objective you threaten, defenders fall back from superior force, artillery relocates after being spotted, recce probes. Deterministic means the debrief can explain every move and replays are identical.

**Can it scale to a whole course?** Measured: one server ran 40 simultaneous exercises at ×4 speed at 96 % of real time using 170 MB.

**Is the adjudication realistic?** It's deliberately simple and explainable (force-ratio table, no dice) — this is a decision trainer, not a combat model. Every outcome traces to one documented rule.

**Can DS add scenarios?** Yes — scenarios are JSON files validated at start-up (terrain, units with waypoints, sensors, MSEL, intent, probe bank). Two ship today: Iron Bridge (joint, riverine) and Ridge Line (mountain).

**Is any data real?** No. All units, callsigns, terrain and events are fictional; no real equipment, ballistic or jamming data.
