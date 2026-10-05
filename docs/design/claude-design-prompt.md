# Claude Design prompt — VANGUARD OPS landing page (v2)

## How to use
1. Open claude.ai/design and start a new project.
2. Attach:
   - `docs/screenshots/07-ds-god-view-injects.png`
   - `docs/screenshots/06-trainee-cut-off-decision.png`
   - `docs/screenshots/14-aar-decision-card.png`
   - `docs/screenshots/15-ds-3d-sand-table.png`
   - `docs/screenshots/17-scenario-editor.png`
   - `docs/screenshots/18-cross-course-analytics.png`
   - your Agrivue screenshot. Type next to it: **"Reference for structure and energy only. Do not copy
     its art style, colours, fonts or theme."**
   - optional: the hero illustration you generated with Prompt B (at the bottom of this file).
3. If it offers web capture, give it https://vanguard-ops-0uex.onrender.com.
4. Paste **Prompt A** and send.
5. Iterate in small steps ("make the hero headline larger", "less amber"). Don't re-paste the whole
   prompt.
6. When you like it: Export → standalone HTML. Send me the HTML and screenshots of desktop and
   mobile, and I'll build it into the app.

---

## Prompt A — paste into Claude Design

You are a senior product designer who has shipped work for defence-technology companies and
editorial websites. Design the landing page and a small design system for **VANGUARD OPS**. The first
10 seconds matter most: it will be judged live at Smart India Hackathon 2026 by Ministry of Defence
officers, Defence Services Staff College (DSSC) faculty and technical evaluators.

### What the product is (use these facts; invent nothing)
VANGUARD OPS is a browser-based **closed (double-blind) wargame** for staff-college training
(SIH 2026 · problem statement SIH26248 · MoD / DSSC).
- The server holds the ground truth. **Every commander sees a different, deliberately degraded
  picture of it**: message delays and dropouts, jamming computed from real geometry, decoys,
  contradictory sensor reports, GPS spoofing, C2 outages.
- Tri-service roles: Company Commander, two Platoon Commanders, Air Liaison Officer, EW/Signals
  Officer, optional Naval Liaison Officer. 2–6 players plus the Directing Staff (DS).
- The DS console shows ground truth and fires friction live. An AI advisor suggests the next inject
  for a training objective.
- An adaptive enemy reacts by explainable rules.
- Every decision is frozen with **exactly what was knowable at that moment**, so the debrief judges
  judgement, not luck. SA freeze-probes, confidence calibration, deterministic replay, PDF/CSV
  export.
- 3D sand table with **Enter VR / Enter AR** on WebXR headsets. Scenario editor and cross-course
  analytics for course directors.
- Runs fully offline on a closed LAN. All data is synthetic and fictional. AI is optional.
- Measured: one server ran 40 simultaneous exercises at 4× speed at 96 % of real time.

### About the attached reference (Agrivue)
Learn **why** it works; do not copy how it looks. What works:
1. The hero is a **whole illustrated world**, full-bleed, not an abstract background. You instantly
   know the domain and the place.
2. It is **rooted in India**. It feels local and specific, not generic Silicon Valley.
3. A bold **wordmark is the centrepiece**, with a short tagline chip and one line of description
   under it.
4. A **floating nav bar** with a clear active state and a distinct CTA.
5. **Two strong buttons** (filled primary, dark secondary).
6. **Stat cards that overlap the bottom edge of the hero**, giving proof before the first scroll.
7. Warmth and personality.

Do **not** take its pixel-art style, bright cartoon palette, chunky game-style logo font, rural
theme or layout proportions. Our version must feel serious, precise and military-professional.

### The concept: "Fog, by design"
Our "world" is the **sand model**. In Indian Army and staff-college training, plans are
briefed around a sand-model discussion: a terrain model on the ground or a table, with miniature
unit blocks, coloured tape for boundaries, pins and flags for objectives, and officers gathered
around it. Make that the hero world, set in a fictional Indian-style theatre: a ridgeline with
terraced slopes, a river with a steel truss bridge, a small town, fields and forest. Use no real
place names, insignia, flags or unit badges.

The product's one idea is **same battlefield, different truths**, and it lives inside that world:
- Half of the sand model is crisp **GROUND TRUTH**.
- The other half is what one platoon commander perceives, under **drifting fog / a smoked acetate
  overlay**: a jammer's red ring cuts a dashed radio link, a stale contact is labelled "AGE 4 MIN",
  and three decoys are reported as "5× ARMOUR".
- A **draggable vertical divider** (keyboard-operable) moves the line between truth and fog.
  Dragging it is the whole pitch in one gesture. On mobile it becomes three tabs: GROUND TRUTH ·
  KESTREL 6 (CDR) · KESTREL 2 (PL B).

How to render the world: an attached hero illustration if I provided one. Otherwise build it as a
**layered isometric SVG**, like a laser-cut topographic model: stacked contour plates in sand, khaki
and slate tones, plus miniature blocks with NATO-style symbols (friendly = blue rectangle frame,
hostile = red diamond frame, decoy = dashed frame). Light it like a briefing room at dusk: warm
overhead lamp, long soft shadows. In the build it may be swapped for the product's live 3D sand
table.

### Hero composition
- **Floating nav bar** over the scene:
  - wordmark VANGUARD OPS with a simple emblem (a compass-arrow on a grid square);
  - links: How it works · Directing Staff · Debrief · 3D & VR · Course directors;
  - CTA: **Create exercise**.
- A thin strip above the nav, set like a message header:
  `EXERCISE · EXERCISE · EXERCISE — SYNTHETIC TRAINING DATA`.
- Centre-left: a large wordmark or headline. Headline options (pick or improve):
  - "Every commander sees a different war."
  - "Decide under fog."
  - "Train judgement, not hindsight."
- A tagline chip like "Closed wargame · MoD / DSSC · SIH 2026" and one supporting line of at most
  25 words.
- Buttons:
  - **Create exercise** (filled amber);
  - an inline **6-character session-code field + Join** (dark), so trainees join from the hero;
  - a text link "Watch a finished exercise's debrief".
- **Four proof cards overlapping the bottom of the hero.** Mono numbers, short labels, a tiny line
  icon or symbol each, no emoji:
  - **6 roles** — tri-service
  - **40 exercises** — on one server
  - **100 % offline** — closed LAN
  - **Identical replay** — every time

### Sections after the hero (improve the order if you see a better story)
1. **The fog, engineered.** Six friction mechanics, each a small live diagram, not an icon:
   - jammer radius severing a link;
   - delayed message on a timeline;
   - two contradictory reports on one grid square;
   - decoy revealed;
   - GPS position drifting;
   - SATCOM dark, then HF taking over (PACE).
2. **Three seats at the table.** Directing Staff / Trainee / Debrief, each with a real screenshot
   (attached) in a restrained frame and two lines of benefit copy.
3. **Judged on what was knowable.** An AAR decision card: "what Kestrel 2 knew at T+06:30" next
   to ground truth, revealed with a "Reveal ground truth" interaction.
4. **The sand table, in 3D and VR.** The 3D screenshot, plus a short note on WebXR headsets.
5. **For the course director.** Scenario editor and cross-course analytics, two screenshots.
6. **Built for a closed network.** Offline Docker, ground truth never leaves the server, synthetic
   data, optional AI with a template fallback.
7. **Footer.** SIH 2026 · SIH26248 · team name placeholder · "Training simulation — synthetic data.
   All units, callsigns, terrain and events are fictional."

### Visual direction
- **Mood:** calm authority, like a briefing by someone very competent. Warmth comes from the sand
  model and the lamp light, not from bright colours.
- **Colour:**
  - Night briefing room for the dark base: ink slate around #0B0F13.
  - Sand and khaki tones inside the model.
  - Warm map-paper off-white for one or two "briefing document" sections.
  - **One accent:** signal amber (#E5A940) for the CTA, key numbers and grease-pencil marks.
  - Blue (#63A2E6) and red (#E5675A) only for unit symbology.
- **Typography:**
  - A characterful technical grotesk for display, e.g. Archivo / Archivo Expanded, with condensed
    cuts for labels.
  - IBM Plex Sans for body.
  - IBM Plex Mono for grid references, timestamps and numbers.
  - Uppercase tracked micro-labels, like map marginalia.
  - Free, self-hostable fonts only (the product runs offline).
- **Layout:** an asymmetric editorial grid on an 8-column rhythm that echoes map columns A–H.
  Orders-style section labels (1. SITUATION, 2. MISSION, …) only if they stay tasteful.
- **Motion:** only where it explains something.
  - Fog drifts slowly; unit blocks inch along routes; a jammed link flickers and breaks; a report
    types in.
  - Respect `prefers-reduced-motion`.
  - No autoplay video, no particle fields, no parallax for its own sake.

### Hard "do not" list (no AI slop)
- No purple, blue or teal gradients, glassmorphism blobs, glowing orbs or abstract 3D shapes.
- No neon-green "Matrix" HUD, radar-sweep clichés, glitch effects, camouflage textures or stencil
  "army" fonts.
- No stock soldiers, weapons or flags. No real insignia, unit names, emblems, place names or
  classification markings.
- No fake logos, testimonials, user counts or awards.
- No emoji, and no generic icon-in-a-circle feature grids.
- Not everything centred. Not the default "hero, three cards, testimonials, pricing" template.
- No filler words: revolutionize, unleash, seamless, cutting-edge, next-gen, empower.
- Copy should sound like a calm staff officer: short, concrete, verb-first.

### Constraints (so it can be built as designed)
- React 18 + Tailwind CSS 4 with CSS-variable tokens. Effects must be achievable in CSS/SVG/Canvas.
- WCAG 2.1 AA contrast, visible focus states, everything keyboard-operable. Colour is never the only
  signal; pair it with shape, pattern or text.
- Responsive from 375 px to 1440 px+.
- Light page: no video, at most 3 font families / 6 weights, hero image ≤ 400 KB (WebP).

### What I want back
1. The landing page at desktop (1440) and mobile (390), high fidelity.
2. A compact design-system sheet:
   - colour tokens (dark + paper);
   - type scale;
   - spacing/grid;
   - buttons and inputs (including the session-code field);
   - badges and proof cards;
   - section header style;
   - NATO-style unit markers (friendly / hostile / unknown / decoy).
3. The restyled app header and the "Create exercise" screen in the same system, so the product
   feels continuous with the landing page.
4. Standalone HTML export.

Before designing, write a 5-line rationale: concept, hero interaction, type pairing, palette, and
the one detail that will make an officer stop scrolling. Then design.

---

## Prompt B — optional hero illustration (any image generator, e.g. Gemini / ChatGPT image)

Claude Design builds pages with code; it does not paint illustrations. If you want a rich painted
hero like your reference, generate it here first, then attach it to Claude Design.

> Wide cinematic illustration, 16:9, of a military **sand-model terrain table** in a dim staff-college
> briefing room at dusk, seen from a high three-quarter angle. The terrain model fills the frame: a
> forested ridgeline with terraced slopes on the left, a winding river crossed by a small steel truss
> bridge in the centre, a cluster of low town buildings and fields on the right. Miniature wooden
> unit blocks with simple blue rectangular and red diamond symbols sit on the terrain; coloured tape
> marks boundaries; small pins with plain flags mark objectives; a thin red string circle marks a
> jamming zone. The right half of the model is veiled by soft drifting fog, as if seen through
> smoked acetate; the left half is crisp. A warm overhead lamp casts long soft shadows; the edges
> fall off into deep slate darkness. Style: refined hand-crafted diorama, tactile clay, sand and
> painted wood, tilt-shift depth of field, muted khaki, sand and slate palette with one amber accent
> light. No people, no text, no real flags, insignia, emblems or weapons, no camouflage, no neon,
> no sci-fi HUD. Leave calm, darker negative space in the upper-left third for a headline.

Generate 3–4 variations, pick one with clear empty space for text, and export as WebP (≤ 400 KB at
1920 px wide).
